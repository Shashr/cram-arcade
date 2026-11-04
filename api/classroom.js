// Cram Arcade © 2026 Shashank J Reddy. All rights reserved. See LICENSE.
// Classrooms: a teacher assigns study sets, students join with a code, and the teacher
// sees each student's progress plus the questions the class misses most.
//
// Requests (JSON):
//   POST { action: "create", className, teacherName, sets }  -> { code, teacherKey }
//   GET  /api/classroom?code=ABC123                           -> class name, teacher, sets (for students)
//   POST { action: "join", code, playerId, name }             -> class name, teacher, sets
//   POST { action: "report", code, playerId, setTitle, kind, ... }  -> { ok }
//   POST { action: "dashboard", code, teacherKey }            -> everything the teacher sees
//   POST { action: "addSet" | "removeSet", code, teacherKey, set | setTitle }
//   POST { action: "removeStudent", code, teacherKey, playerId }
//
// The teacher key is a password made for the teacher's browser; only its hash is stored.
// Students are identified by a first name or nickname only.

import crypto from "node:crypto";
import { db } from "./_db.js";

const KEEP_SECONDS = 60 * 60 * 24 * 365;
const MAX_STUDENTS = 200;
const MAX_SETS = 12;
const MAX_SET_BYTES = 60_000;
const MAX_REPORTS_PER_HOUR = 120;
const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const keys = (code) => ({
  meta: `class:${code}:meta`,
  sets: `class:${code}:sets`,
  students: `class:${code}:students`,
  progress: `class:${code}:progress`,
  missed: `class:${code}:missed`, // "set␟question" -> times answered wrong (whole class)
  asked: `class:${code}:asked`, // "set␟question" -> times asked (whole class)
  history: `class:${code}:history`, // student -> list of attempts over time
  studentMissed: `class:${code}:smissed`, // "student␟set␟question" -> times wrong
});
const SEP = "\u001f";
const MAX_HISTORY = 200;

function clean(text, max) {
  return String(text || "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}
function cleanCode(code) {
  return String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}
function hashKey(key) {
  return crypto.createHash("sha256").update(String(key)).digest("hex");
}
function newCode() {
  let code = "";
  for (let i = 0; i < 6; i++) code += CODE_LETTERS[crypto.randomInt(CODE_LETTERS.length)];
  return code;
}
function validPlayer(id) {
  return /^[a-zA-Z0-9-]{8,64}$/.test(String(id || ""));
}

// Keep only the parts of a study set the games need, with sensible limits.
function cleanSet(set) {
  if (!set || typeof set !== "object") return null;
  const cards = (Array.isArray(set.cards) ? set.cards : [])
    .map((c) => ({ front: clean(c?.front, 200), back: clean(c?.back, 300) }))
    .filter((c) => c.front && c.back)
    .slice(0, 100);
  const quiz = (Array.isArray(set.quiz) ? set.quiz : [])
    .filter((q) => q && Array.isArray(q.options) && q.options.length === 4 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4)
    .map((q) => ({
      question: clean(q.question, 300),
      options: q.options.map((o) => clean(o, 200)),
      answer: q.answer,
      explanation: clean(q.explanation, 300),
      ...(q.fromCard ? { fromCard: true } : {}),
    }))
    .slice(0, 30);
  const title = clean(set.title, 80);
  if (!title || cards.length < 4) return null;
  const out = { title, cards, quiz };
  return JSON.stringify(out).length <= MAX_SET_BYTES ? out : null;
}

async function readJson(key) {
  const raw = await db.get(key);
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}
async function touch(code) {
  await Promise.all(Object.values(keys(code)).map((k) => db.expire(k, KEEP_SECONDS)));
}
async function loadClass(code) {
  const meta = await readJson(keys(code).meta);
  if (!meta) return null;
  const sets = (await readJson(keys(code).sets)) || [];
  return { meta, sets };
}
async function teacherClass(code, teacherKey) {
  const found = await loadClass(code);
  if (!found || !teacherKey || hashKey(teacherKey) !== found.meta.keyHash) return null;
  return found;
}
function publicInfo(code, { meta, sets }) {
  return { code, className: meta.name, teacher: meta.teacher, sets };
}

const reports = new Map();
function tooManyReports(id) {
  const now = Date.now();
  const recent = (reports.get(id) || []).filter((t) => now - t < 3600_000);
  recent.push(now);
  reports.set(id, recent);
  return recent.length > MAX_REPORTS_PER_HOUR;
}

// Merge one game result into the student's running record for that set.
function updateProgress(record, body) {
  const r = { quizBest: null, quizTries: 0, bossFights: 0, bossWins: 0, bestAccuracy: null, bestBossTime: null, cardsKnown: 0, cardsTotal: 0, ...record };
  const n = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
  if (body.kind === "quiz") {
    const total = n(body.total, 1, 100);
    const pct = Math.round((n(body.score, 0, total) / total) * 100);
    r.quizTries += 1;
    r.quizBest = Math.max(r.quizBest ?? 0, pct);
  } else if (body.kind === "boss") {
    r.bossFights += 1;
    const acc = n(body.accuracy, 0, 100);
    r.bestAccuracy = Math.max(r.bestAccuracy ?? 0, acc);
    if (body.won) {
      r.bossWins += 1;
      const secs = Math.max(1, Math.min(3600, Number(body.secs) || 0));
      r.bestBossTime = r.bestBossTime ? Math.min(r.bestBossTime, secs) : secs;
    }
  } else if (body.kind === "cards") {
    r.cardsTotal = n(body.total, 0, 1000);
    r.cardsKnown = Math.max(r.cardsKnown, n(body.known, 0, r.cardsTotal));
  }
  r.last = Date.now();
  return r;
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const code = cleanCode(req.query?.code);
      const found = code.length === 6 && await loadClass(code);
      if (!found) return res.status(404).json({ error: "No class has that code. Check it with your teacher." });
      return res.status(200).json(publicInfo(code, found));
    }
    if (req.method !== "POST") return res.status(405).json({ error: "Use GET or POST." });
    const body = req.body || {};

    if (body.action === "create") {
      const name = clean(body.className, 60);
      const teacher = clean(body.teacherName, 40);
      if (!name || !teacher) return res.status(400).json({ error: "Add a class name and the name students call you." });
      const sets = (Array.isArray(body.sets) ? body.sets : []).map(cleanSet).filter(Boolean).slice(0, MAX_SETS);
      if (!sets.length) return res.status(400).json({ error: "Pick at least one study set (with 4 or more cards) to assign." });
      let code = newCode();
      for (let i = 0; i < 5 && (await db.exists(keys(code).meta)); i++) code = newCode();
      const teacherKey = crypto.randomBytes(18).toString("base64url");
      await db.set(keys(code).meta, JSON.stringify({ name, teacher, keyHash: hashKey(teacherKey), created: Date.now() }));
      await db.set(keys(code).sets, JSON.stringify(sets));
      await touch(code);
      return res.status(200).json({ ...publicInfo(code, { meta: { name, teacher }, sets }), teacherKey });
    }

    const code = cleanCode(body.code);
    if (code.length !== 6) return res.status(404).json({ error: "No class has that code. Check it with your teacher." });
    const k = keys(code);

    if (body.action === "join") {
      const found = await loadClass(code);
      if (!found) return res.status(404).json({ error: "No class has that code. Check it with your teacher." });
      if (!validPlayer(body.playerId)) return res.status(400).json({ error: "Missing player id." });
      const name = clean(body.name, 30);
      if (!name) return res.status(400).json({ error: "Type your name so your teacher knows it's you." });
      const students = await db.hgetall(k.students);
      if (!students[body.playerId] && Object.keys(students).length >= MAX_STUDENTS) {
        return res.status(400).json({ error: "This class is full." });
      }
      const joined = students[body.playerId] ? JSON.parse(students[body.playerId]).joined : Date.now();
      await db.hset(k.students, body.playerId, JSON.stringify({ name, joined }));
      await touch(code);
      return res.status(200).json(publicInfo(code, found));
    }

    if (body.action === "report") {
      if (!validPlayer(body.playerId)) return res.status(400).json({ error: "Missing player id." });
      const students = await db.hgetall(k.students);
      if (!students[body.playerId]) return res.status(403).json({ error: "Join the class first." });
      if (tooManyReports(body.playerId)) return res.status(429).json({ error: "Slow down a little." });
      const found = await loadClass(code);
      const setTitle = clean(body.setTitle, 80);
      if (!found || !found.sets.some((s) => s.title === setTitle)) return res.status(400).json({ error: "That set isn't assigned in this class." });
      if (!["quiz", "boss", "cards"].includes(body.kind)) return res.status(400).json({ error: "Unknown result." });
      const all = await db.hgetall(k.progress);
      let mine = {};
      try { mine = JSON.parse(all[body.playerId] || "{}"); } catch { /* start fresh */ }
      mine[setTitle] = updateProgress(mine[setTitle], body);
      await db.hset(k.progress, body.playerId, JSON.stringify(mine));
      const list = (v) => [...new Set((Array.isArray(v) ? v : []).slice(0, 60).map((m) => clean(m, 200)).filter(Boolean))];
      const missed = list(body.missed);
      const asked = list(body.asked);
      for (const m of missed) if (!asked.includes(m)) asked.push(m);
      await Promise.all([
        ...missed.map((m) => db.hincrby(k.missed, `${setTitle}${SEP}${m}`, 1)),
        ...missed.map((m) => db.hincrby(k.studentMissed, `${body.playerId}${SEP}${setTitle}${SEP}${m}`, 1)),
        ...asked.map((m) => db.hincrby(k.asked, `${setTitle}${SEP}${m}`, 1)),
      ]);
      // Attempt log for the teacher's charts (quiz and boss only; flashcards are a running count).
      if (body.kind !== "cards") {
        const raw = (await db.hgetall(k.history))[body.playerId];
        let log = [];
        try { log = raw ? JSON.parse(raw) : []; } catch { /* start fresh */ }
        const total = Math.max(1, Math.min(100, Math.round(Number(body.total) || 1)));
        const pct = body.kind === "quiz"
          ? Math.round((Math.max(0, Math.min(total, Number(body.score) || 0)) / total) * 100)
          : Math.max(0, Math.min(100, Math.round(Number(body.accuracy) || 0)));
        log.push({ t: Date.now(), set: setTitle, kind: body.kind, pct, ...(body.kind === "boss" ? { won: !!body.won } : {}) });
        await db.hset(k.history, body.playerId, JSON.stringify(log.slice(-MAX_HISTORY)));
      }
      await touch(code);
      return res.status(200).json({ ok: true });
    }

    // Everything below is for the teacher only.
    const found = await teacherClass(code, body.teacherKey);
    if (!found) return res.status(403).json({ error: "That class code and teacher key don't match." });

    if (body.action === "dashboard") {
      const [students, progress, missed, asked, history, studentMissed] = await Promise.all([
        db.hgetall(k.students), db.hgetall(k.progress), db.hgetall(k.missed),
        db.hgetall(k.asked), db.hgetall(k.history), db.hgetall(k.studentMissed),
      ]);
      const parse = (raw, fallback) => { try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } };
      const missedBy = {};
      for (const [key, count] of Object.entries(studentMissed)) {
        const [id, set, prompt] = key.split(SEP);
        (missedBy[id] ||= []).push({ set, prompt, count: Number(count) });
      }
      const list = Object.entries(students).map(([id, raw]) => {
        const s = parse(raw, {});
        return {
          id, name: s.name || "Student", joined: s.joined || 0,
          progress: parse(progress[id], {}),
          history: parse(history[id], []),
          missed: (missedBy[id] || []).sort((a, b) => b.count - a.count).slice(0, 40),
        };
      });
      const trouble = Object.entries(missed).map(([key, count]) => {
        const [set, prompt] = key.split(SEP);
        const times = Math.max(Number(count), Number(asked[key] || 0));
        return { set, prompt, count: Number(count), asked: times, rate: Math.round((Number(count) / times) * 100) };
      }).sort((a, b) => b.rate - a.rate || b.count - a.count).slice(0, 150);
      return res.status(200).json({ ...publicInfo(code, found), students: list, trouble, database: db.mode });
    }

    if (body.action === "addSet") {
      const set = cleanSet(body.set);
      if (!set) return res.status(400).json({ error: "That study set needs at least 4 cards." });
      const sets = found.sets.filter((s) => s.title !== set.title);
      if (sets.length >= MAX_SETS) return res.status(400).json({ error: `A class can have up to ${MAX_SETS} sets.` });
      sets.push(set);
      await db.set(k.sets, JSON.stringify(sets));
      return res.status(200).json({ ok: true, sets });
    }
    if (body.action === "removeSet") {
      const sets = found.sets.filter((s) => s.title !== clean(body.setTitle, 80));
      if (!sets.length) return res.status(400).json({ error: "A class needs at least one set." });
      await db.set(k.sets, JSON.stringify(sets));
      return res.status(200).json({ ok: true, sets });
    }
    if (body.action === "removeStudent") {
      if (!validPlayer(body.playerId)) return res.status(400).json({ error: "Missing student." });
      await db.hdel(k.students, body.playerId);
      await db.hdel(k.progress, body.playerId);
      await db.hdel(k.history, body.playerId);
      const theirs = Object.keys(await db.hgetall(k.studentMissed)).filter((key) => key.startsWith(`${body.playerId}${SEP}`));
      await Promise.all(theirs.map((key) => db.hdel(k.studentMissed, key)));
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "Unknown action." });
  } catch (err) {
    console.error(err);
    return res.status(502).json({ error: "The classroom database had a problem. Try again in a moment." });
  }
}
