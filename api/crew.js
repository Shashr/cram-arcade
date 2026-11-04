// Crew leaderboards: friends join the same 5-letter crew code and compete for tickets.
//
// Storage: see _db.js (a Redis database online, or memory in test mode).
//
// Requests (all JSON):
//   GET  /api/crew?code=ABCDE                                  -> the leaderboard
//   POST { action: "create", crewName, playerId, name, plate } -> new crew + leaderboard
//   POST { action: "join",   code, playerId, name, plate }     -> leaderboard
//   POST { action: "score",  code, playerId, tickets, win }     -> leaderboard
//   POST { action: "profile", code, playerId, name, plate }    -> leaderboard
//
// Scores come from the player's browser, so a determined friend could fake them.
// The server caps each report and how often a player can report, which is fine
// for friends; a public game would need the server to run the games itself.

import { db } from "./_db.js";

const KEEP_SECONDS = 60 * 60 * 24 * 180; // crews disappear after 180 days without activity
const MAX_TICKETS_PER_REPORT = 400;
const MAX_REPORTS_PER_HOUR = 60;
const MAX_MEMBERS = 50;
const PLATES = new Set(["classic", "gold", "neon", "flame", "galaxy"]);
const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I, so codes are easy to read out

/* ---------- helpers ---------- */
// Week number that starts on Monday (UTC), so "this week" resets for everyone at once.
function weekId(date = new Date()) {
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return monday.toISOString().slice(0, 10);
}
const keys = (code) => ({
  meta: `crew:${code}:meta`,
  names: `crew:${code}:names`,
  total: `crew:${code}:total`,
  wins: `crew:${code}:wins`,
  week: `crew:${code}:week:${weekId()}`,
});
function cleanName(name) {
  return String(name || "").replace(/[^\p{L}\p{N} _.'-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 20);
}
function cleanCode(code) {
  return String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
}
function validPlayer(id) {
  return /^[a-zA-Z0-9-]{8,64}$/.test(String(id || ""));
}
function newCode() {
  let code = "";
  for (let i = 0; i < 5; i++) code += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
  return code;
}
async function touch(code) {
  const k = keys(code);
  await Promise.all([k.meta, k.names, k.total, k.wins, k.week].map((key) => db.expire(key, KEEP_SECONDS)));
}

const reports = new Map(); // playerId -> recent report times (best effort, per server instance)
function tooManyReports(playerId) {
  const now = Date.now();
  const recent = (reports.get(playerId) || []).filter((t) => now - t < 3600_000);
  recent.push(now);
  reports.set(playerId, recent);
  return recent.length > MAX_REPORTS_PER_HOUR;
}

async function board(code) {
  const k = keys(code);
  const [meta, names, total, wins, week] = await Promise.all([
    db.hgetall(k.meta), db.hgetall(k.names), db.hgetall(k.total), db.hgetall(k.wins), db.hgetall(k.week),
  ]);
  const players = Object.entries(names).map(([id, raw]) => {
    let profile = {};
    try { profile = JSON.parse(raw); } catch { /* ignore */ }
    return {
      id,
      name: profile.name || "Player",
      plate: PLATES.has(profile.plate) ? profile.plate : "classic",
      total: Number(total[id] || 0),
      week: Number(week[id] || 0),
      wins: Number(wins[id] || 0),
    };
  });
  return { code, crewName: meta.name || "Crew", mode: db.mode, week: weekId(), players };
}

async function saveProfile(code, playerId, name, plate) {
  const profile = { name: cleanName(name) || "Player", plate: PLATES.has(plate) ? plate : "classic" };
  await db.hset(keys(code).names, playerId, JSON.stringify(profile));
}

/* ---------- handler ---------- */
export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const code = cleanCode(req.query?.code);
      if (code.length !== 5 || !(await db.exists(keys(code).meta))) {
        return res.status(404).json({ error: "No crew has that code. Check it and try again." });
      }
      return res.status(200).json(await board(code));
    }
    if (req.method !== "POST") return res.status(405).json({ error: "Use GET or POST." });

    const body = req.body || {};
    const { action, playerId } = body;
    if (!validPlayer(playerId)) return res.status(400).json({ error: "Missing player id." });

    if (action === "create") {
      const crewName = cleanName(body.crewName) || "Study crew";
      if (!cleanName(body.name)) return res.status(400).json({ error: "Pick a nickname first." });
      let code = newCode();
      for (let tries = 0; tries < 5 && (await db.exists(keys(code).meta)); tries++) code = newCode();
      await db.hset(keys(code).meta, "name", crewName);
      await saveProfile(code, playerId, body.name, body.plate);
      await touch(code);
      return res.status(200).json(await board(code));
    }

    const code = cleanCode(body.code);
    if (code.length !== 5 || !(await db.exists(keys(code).meta))) {
      return res.status(404).json({ error: "No crew has that code. Check it and try again." });
    }
    const k = keys(code);

    if (action === "join" || action === "profile") {
      if (!cleanName(body.name)) return res.status(400).json({ error: "Pick a nickname first." });
      const members = await db.hgetall(k.names);
      if (action === "join" && !members[playerId] && Object.keys(members).length >= MAX_MEMBERS) {
        return res.status(400).json({ error: `This crew is full (${MAX_MEMBERS} players).` });
      }
      await saveProfile(code, playerId, body.name, body.plate);
      await touch(code);
      return res.status(200).json(await board(code));
    }

    if (action === "score") {
      const members = await db.hgetall(k.names);
      if (!members[playerId]) return res.status(403).json({ error: "Join the crew before sending scores." });
      if (tooManyReports(playerId)) return res.status(429).json({ error: "Too many scores sent. Try again later." });
      const tickets = Math.max(0, Math.min(MAX_TICKETS_PER_REPORT, Math.floor(Number(body.tickets) || 0)));
      await Promise.all([
        db.hincrby(k.total, playerId, tickets),
        db.hincrby(k.week, playerId, tickets),
        body.win ? db.hincrby(k.wins, playerId, 1) : null,
      ]);
      await touch(code);
      return res.status(200).json(await board(code));
    }

    return res.status(400).json({ error: "Unknown action." });
  } catch (err) {
    console.error(err);
    return res.status(502).json({ error: "The leaderboard database had a problem. Try again in a moment." });
  }
}
