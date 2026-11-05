// Cram Arcade © 2026 Shashank J Reddy. All rights reserved. See LICENSE.
// Serverless function: turns notes or a topic into a study set using Claude.
// Runs on the server, so the API key is never sent to the browser.
import { cors } from "./_cors.js";

import { db } from "./_db.js";

const MODEL = process.env.CLAUDE_MODEL || "claude-haiku-5-5";
const API = process.env.ANTHROPIC_API_URL || "https://api.anthropic.com";
const MAX_INPUT = 8000; // characters of notes we accept
const MAX_FILES = 4;
const MAX_UPLOAD_BYTES = 3_000_000; // all files together (Vercel accepts ~4.5 MB per request)
const MAX_FILE_TOKENS = 60_000; // about 25 pages; longer files cost too much per set
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

// Daily AI limits. Everyone sees their own count on the page.
export const DAILY_PER_PERSON = Number(process.env.AI_DAILY_PER_PERSON || 5);
const DAILY_PER_NETWORK = Number(process.env.AI_DAILY_PER_NETWORK || 60); // a whole school shares one network
const DAILY_TOTAL = Number(process.env.AI_DAILY_TOTAL || 300); // protects the credit balance

// Days roll over at midnight Toronto time.
function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date());
}
function cleanId(v) {
  return String(v || "").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 64);
}
async function usage(device, ip) {
  const counts = await db.hgetall(`ai:${today()}`);
  const used = Number(counts[`dev:${device}`] || 0);
  return {
    used,
    network: Number(counts[`ip:${ip}`] || 0),
    total: Number(counts.all || 0),
    limit: DAILY_PER_PERSON,
    left: Math.max(0, DAILY_PER_PERSON - used),
  };
}
async function count(device, ip, n) {
  const key = `ai:${today()}`;
  await Promise.all([db.hincrby(key, `dev:${device}`, n), db.hincrby(key, `ip:${ip}`, n), db.hincrby(key, "all", n)]);
  await db.expire(key, 3 * 86400);
}

export function buildPrompt(text, fileCount = 0) {
  const source = fileCount
    ? `The student attached ${fileCount === 1 ? "a file" : `${fileCount} files`} (class notes, a handout, slides or photos of notes)${text ? " and added the text below" : ""}.
Create a study set from it. Use only facts from the files${text ? " and text" : ""}. If a photo is hard to read, use what you can read.`
    : `The student gave you either a topic or their own notes.
Create a study set from it. If it is notes, use only facts from the notes.
If it is a short topic, use accurate, well-established facts at a high-school level.`;
  return `You are a study coach. ${source}

Reply with ONLY a JSON object, no other text, in exactly this shape:
{
  "title": "short title for the set",
  "cards": [{"front": "term or question", "back": "short answer, under 20 words"}],
  "quiz": [{"question": "...", "options": ["A", "B", "C", "D"], "answer": 0, "explanation": "one sentence"}]
}
Rules: 10 cards, 6 quiz questions, exactly 4 options each, "answer" is the index (0-3)
of the correct option, wrong options must be plausible. Card fronts must be unique.
${text ? `
Student input:
"""
${text}
"""` : ""}`;
}

// Turns uploaded files into message blocks Claude can read (PDF pages and photos).
export function fileBlocks(files) {
  if (!Array.isArray(files) || !files.length) return [];
  if (files.length > MAX_FILES) throw new UserError(`Attach up to ${MAX_FILES} files at a time.`);
  let bytes = 0;
  return files.map((f) => {
    const data = String(f?.data || "");
    const type = String(f?.type || "");
    // Word documents arrive as their text (read on the student's device); the rest as base64.
    if (type === "text/plain") {
      bytes += Buffer.byteLength(data);
      if (bytes > MAX_UPLOAD_BYTES) throw new UserError("Those files are too big. Keep them under 3 MB together, or upload one chapter at a time.");
      if (!data.trim()) throw new UserError("One of the files doesn't have any text in it.");
      return { type: "document", source: { type: "text", media_type: "text/plain", data }, title: String(f?.name || "Document").slice(0, 120) };
    }
    bytes += Math.floor((data.length * 3) / 4);
    if (bytes > MAX_UPLOAD_BYTES) throw new UserError("Those files are too big. Keep them under 3 MB together, or upload one chapter at a time.");
    if (!/^[A-Za-z0-9+/=]+$/.test(data)) throw new UserError("One of the files couldn't be read. Try attaching it again.");
    if (type === "application/pdf") return { type: "document", source: { type: "base64", media_type: type, data } };
    if (IMAGE_TYPES.has(type)) return { type: "image", source: { type: "base64", media_type: type, data } };
    throw new UserError("Attach a PDF, a Word document or a photo.");
  });
}

export class UserError extends Error {}

export function parseStudySet(raw) {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON in reply");
  const data = JSON.parse(raw.slice(start, end + 1));
  const cards = (data.cards || [])
    .filter((c) => c && c.front && c.back)
    .map((c) => ({ front: String(c.front), back: String(c.back) }));
  const quiz = (data.quiz || [])
    .filter((q) => q && Array.isArray(q.options) && q.options.length === 4 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4)
    .map((q) => ({
      question: String(q.question),
      options: q.options.map(String),
      answer: q.answer,
      explanation: String(q.explanation || ""),
    }));
  if (cards.length < 4) throw new Error("Not enough flashcards");
  return { title: String(data.title || "Study set"), cards, quiz };
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const ip = String(req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim().slice(0, 64);
  const device = cleanId(req.body?.device || req.query?.device) || `ip-${cleanId(ip)}`;

  // GET: how many AI sets this person has left today.
  if (req.method === "GET") {
    const u = await usage(device, ip).catch(() => null);
    return res.status(200).json(u ? { limit: u.limit, used: u.used, left: u.left } : { limit: DAILY_PER_PERSON, used: 0, left: DAILY_PER_PERSON });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Use GET or POST." });

  const text = String(req.body?.text || "").trim();
  let blocks;
  try {
    blocks = fileBlocks(req.body?.files);
  } catch (err) {
    if (err instanceof UserError) return res.status(400).json({ error: err.message });
    throw err;
  }
  if (!text && !blocks.length) return res.status(400).json({ error: "Type a topic, paste some notes or attach a file first." });
  if (text.length > MAX_INPUT) {
    return res.status(400).json({ error: `That's too long. Keep it under ${MAX_INPUT} characters.` });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "The server is missing its API key." });
  }

  const u = await usage(device, ip);
  if (u.left <= 0) {
    return res.status(429).json({ error: `You've used all ${DAILY_PER_PERSON} AI study sets for today. You get ${DAILY_PER_PERSON} more at midnight, and "Type my own" has no limit.`, limit: u.limit, used: u.used, left: 0 });
  }
  if (u.network >= DAILY_PER_NETWORK || u.total >= DAILY_TOTAL) {
    return res.status(429).json({ error: "Cram Arcade has made a lot of AI study sets today. Try again tomorrow, or use \"Type my own\" for now.", limit: u.limit, used: u.used, left: u.left });
  }

  const headers = {
    "content-type": "application/json",
    "x-api-key": process.env.ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
  };
  const messages = [{ role: "user", content: [...blocks, { type: "text", text: buildPrompt(text, blocks.length) }] }];

  await count(device, ip, 1); // count it before calling the AI, so fast double-clicks can't skip the limit
  try {
    // Long PDFs are expensive: check the size first (counting tokens is free).
    if (blocks.length) {
      const check = await fetch(`${API}/v1/messages/count_tokens`, { method: "POST", headers, body: JSON.stringify({ model: MODEL, messages }) });
      if (check.ok) {
        const { input_tokens: tokens } = await check.json();
        if (tokens > MAX_FILE_TOKENS) {
          await count(device, ip, -1);
          return res.status(400).json({ error: `That file is too long (about ${Math.round(tokens / 2500)} pages). Upload one chapter or a few pages at a time.` });
        }
      }
    }
    const response = await fetch(`${API}/v1/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: MODEL, max_tokens: 3000, messages }),
    });
    if (!response.ok) {
      console.error("Anthropic API error", response.status, await response.text());
      await count(device, ip, -1);
      return res.status(502).json({ error: "The AI service had a problem. Try again in a moment. (This one didn't count toward your limit.)" });
    }
    const data = await response.json();
    const raw = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    const set = parseStudySet(raw);
    console.log("AI set", { input: data.usage?.input_tokens, output: data.usage?.output_tokens, files: blocks.length });
    return res.status(200).json({ ...set, limit: u.limit, used: u.used + 1, left: Math.max(0, u.left - 1), usage: data.usage ? { input: data.usage.input_tokens, output: data.usage.output_tokens } : undefined });
  } catch (err) {
    console.error(err);
    await count(device, ip, -1).catch(() => {});
    return res.status(502).json({ error: "Couldn't build a study set from that. Try rewording it. (This one didn't count toward your limit.)" });
  }
}
