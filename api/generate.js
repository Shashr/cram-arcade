// Cram Arcade © 2026 Shashank J Reddy. All rights reserved. See LICENSE.
// Serverless function: turns notes or a topic into a study set using Claude.
// Runs on the server, so the API key is never sent to the browser.

const MODEL = process.env.CLAUDE_MODEL || "claude-haiku-5-5";
const MAX_INPUT = 8000; // characters of notes we accept
const RATE_LIMIT = 10; // study sets per IP per hour (best effort)
const hits = new Map();

function tooManyRequests(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 3600_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_LIMIT;
}

export function buildPrompt(text) {
  return `You are a study coach. The student gave you either a topic or their own notes.
Create a study set from it. If it is notes, use only facts from the notes.
If it is a short topic, use accurate, well-established facts at a high-school level.

Reply with ONLY a JSON object, no other text, in exactly this shape:
{
  "title": "short title for the set",
  "cards": [{"front": "term or question", "back": "short answer, under 20 words"}],
  "quiz": [{"question": "...", "options": ["A", "B", "C", "D"], "answer": 0, "explanation": "one sentence"}]
}
Rules: 10 cards, 6 quiz questions, exactly 4 options each, "answer" is the index (0-3)
of the correct option, wrong options must be plausible. Card fronts must be unique.

Student input:
"""
${text}
"""`;
}

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
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST." });
  }
  const text = String(req.body?.text || "").trim();
  if (!text) return res.status(400).json({ error: "Type a topic or paste some notes first." });
  if (text.length > MAX_INPUT) {
    return res.status(400).json({ error: `That's too long. Keep it under ${MAX_INPUT} characters.` });
  }
  const ip = String(req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
  if (tooManyRequests(ip)) {
    return res.status(429).json({ error: "You've made a lot of study sets. Try again in an hour." });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "The server is missing its API key." });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 3000,
        messages: [{ role: "user", content: buildPrompt(text) }],
      }),
    });
    if (!response.ok) {
      console.error("Anthropic API error", response.status, await response.text());
      return res.status(502).json({ error: "The AI service had a problem. Try again in a moment." });
    }
    const data = await response.json();
    const raw = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    return res.status(200).json(parseStudySet(raw));
  } catch (err) {
    console.error(err);
    return res.status(502).json({ error: "Couldn't build a study set from that. Try rewording it." });
  }
}
