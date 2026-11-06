// Cram Arcade © 2026 Shashank J Reddy. All rights reserved. See LICENSE.
// Serverless function: turns notes or a topic into a study set using Claude.
// Runs on the server, so the API key is never sent to the browser.
import { cors } from "./_cors.js";

import { readSession } from "./_session.js";
import { LIMITS, AI_ENABLED, costMicro, originAllowed, clientIp, whoIs, usageFor, reserve, settle } from "./_aiguard.js";

const MODEL = process.env.CLAUDE_MODEL || "claude-haiku-5-5";
const API = process.env.ANTHROPIC_API_URL || "https://api.anthropic.com";
const MAX_INPUT = 8000; // characters of notes we accept
const MAX_FILES = 4;
const MAX_UPLOAD_BYTES = 3_000_000; // all files together (Vercel accepts ~4.5 MB per request)
const MAX_FILE_TOKENS = 60_000; // about 25 pages; longer files cost too much per set
const MAX_OUTPUT_TOKENS = 3000; // a full set uses about 1,300-2,500
const ATTEMPTS = 2;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export function buildPrompt(text, fileCount = 0) {
  const source = fileCount
    ? `The student attached ${fileCount === 1 ? "a file" : `${fileCount} files`} (class notes, a lab report, a handout, slides or photos of notes)${text ? " and added the text below" : ""}.
Create a study set from it. Use only facts from the files${text ? " and text" : ""}. If a photo is hard to read, use what you can read.`
    : `The student gave you either a topic or their own notes.
Create a study set from it. If it is notes, use only facts from the notes.
If it is a short topic, use accurate, well-established facts at a high-school level.`;
  return `You are a study coach. ${source}

Save it with the study_set tool.
Rules: exactly 10 cards and 6 quiz questions. Card backs are short (under 20 words).
Each quiz question has exactly 4 options, "answer" is the index (0-3) of the correct one,
and the wrong options must be plausible. Card fronts must be unique.
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

// Claude fills in this form, so the reply always comes back as valid, structured data.
export const STUDY_SET_TOOL = {
  name: "study_set",
  description: "Save the finished study set.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short title for the set" },
      cards: {
        type: "array",
        items: {
          type: "object",
          properties: { front: { type: "string" }, back: { type: "string" } },
          required: ["front", "back"],
        },
      },
      quiz: {
        type: "array",
        items: {
          type: "object",
          properties: {
            question: { type: "string" },
            options: { type: "array", items: { type: "string" } },
            answer: { type: "integer", description: "Index (0-3) of the correct option" },
            explanation: { type: "string" },
          },
          required: ["question", "options", "answer", "explanation"],
        },
      },
    },
    required: ["title", "cards", "quiz"],
  },
};

// Accepts the tool's data (an object) or, as a fallback, text containing JSON.
export function parseStudySet(raw) {
  let data = raw;
  if (typeof raw === "string") {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("No JSON in reply");
    data = JSON.parse(raw.slice(start, end + 1));
  }
  if (!data || typeof data !== "object") throw new Error("Empty reply");
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

const LIMIT_MESSAGES = {
  person: (who) => who.signedIn
    ? `You've used all ${who.limit} AI study sets for today. You get more at midnight, and "Type my own" has no limit.`
    : `You've used all ${who.limit} AI study sets for today. Sign in to get ${LIMITS.perAccount} a day, or use "Type my own" (no limit).`,
  minute: () => "Lots of AI study sets are being made from your network right now. Wait a minute and try again.",
  network: () => "Your network has made a lot of AI study sets today. Try again tomorrow, or use \"Type my own\" for now.",
  site: () => "Cram Arcade has made a lot of AI study sets today. Try again tomorrow, or use \"Type my own\" for now.",
  budget: () => "Cram Arcade has made a lot of AI study sets today. Try again tomorrow, or use \"Type my own\" for now.",
};

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const session = readSession(req);
  const who = whoIs(session, req.body?.device || req.query?.device);

  // GET: how many AI sets this person has left today.
  if (req.method === "GET") {
    const u = await usageFor(who).catch(() => ({ limit: who.limit, used: 0, left: who.limit, signedIn: who.signedIn }));
    return res.status(200).json({ ...u, perAccount: LIMITS.perAccount });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Use GET or POST." });
  if (!originAllowed(req)) return res.status(403).json({ error: "AI study sets can only be made from Cram Arcade." });
  if (!AI_ENABLED) return res.status(503).json({ error: "AI study sets are paused right now. You can still use \"Type my own\"." });

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

  // Reserve the most this set could possibly cost before spending anything.
  const ip = clientIp(req);
  const worstInput = (blocks.length ? MAX_FILE_TOKENS : 0) + Math.ceil(text.length / 2) + 1500;
  const worst = costMicro(worstInput * ATTEMPTS, MAX_OUTPUT_TOKENS * ATTEMPTS);
  const r = await reserve(who, ip, worst).catch((err) => { console.error(err); return { reason: "site" }; });
  if (!r.ticket) {
    const u = await usageFor(who).catch(() => null);
    return res.status(429).json({ error: LIMIT_MESSAGES[r.reason](who), ...(u || {}) });
  }

  const headers = {
    "content-type": "application/json",
    "x-api-key": process.env.ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
  };
  const messages = [{ role: "user", content: [...blocks, { type: "text", text: buildPrompt(text, blocks.length) }] }];
  let spent = 0; // what the AI calls really cost, in millionths of a dollar
  let set = null;
  try {
    // Long files are expensive: check their size first (counting tokens is free).
    if (blocks.length) {
      const check = await fetch(`${API}/v1/messages/count_tokens`, { method: "POST", headers, body: JSON.stringify({ model: MODEL, messages }) });
      const tokens = check.ok ? (await check.json()).input_tokens : null;
      if (!tokens || tokens > MAX_FILE_TOKENS) {
        await settle(r.ticket, 0, { gotSet: false });
        return res.status(400).json({ error: tokens ? `That file is too long (about ${Math.round(tokens / 2500)} pages). Upload one chapter or a few pages at a time.` : "Couldn't read that file. Try again, or save it as a PDF." });
      }
    }
    // Ask for the set; if the reply is unusable, try once more before giving up.
    for (let attempt = 1; attempt <= ATTEMPTS && !set; attempt++) {
      const response = await fetch(`${API}/v1/messages`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: MODEL, max_tokens: MAX_OUTPUT_TOKENS, messages,
          tools: [STUDY_SET_TOOL], tool_choice: { type: "tool", name: "study_set" },
        }),
      });
      if (!response.ok) {
        console.error("Anthropic API error", response.status, (await response.text()).slice(0, 300));
        if (response.status < 500) break;
        continue;
      }
      const data = await response.json();
      spent += costMicro(data.usage?.input_tokens || 0, data.usage?.output_tokens || 0);
      try {
        const tool = (data.content || []).find((b) => b.type === "tool_use" && b.name === "study_set");
        set = parseStudySet(tool ? tool.input : (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join(""));
      } catch (err) {
        console.error(`Attempt ${attempt}: unusable reply (stop: ${data.stop_reason})`, err.message);
      }
    }
  } catch (err) {
    console.error(err);
  }
  await settle(r.ticket, spent, { gotSet: Boolean(set) });
  console.log("AI set", { ok: Boolean(set), cost_usd: spent / 1_000_000, files: blocks.length, signedIn: who.signedIn });
  const u = await usageFor(who).catch(() => null);
  if (!set) {
    return res.status(502).json({ error: "Couldn't build a study set from that. Try again, or reword it. (This one didn't count toward your limit.)", ...(u || {}) });
  }
  return res.status(200).json({ ...set, ...(u || {}) });
}
