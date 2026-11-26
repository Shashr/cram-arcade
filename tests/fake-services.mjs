// Cram Arcade © 2026 Shashank J Reddy. All rights reserved. See LICENSE.
// Stand-ins for the outside services, so the app can run and be tested on your own
// computer for free: no Anthropic key, no Google project, no money spent.
//
// - Fake Claude API: always returns a small "Cell Biology" study set.
// - Fake Google sign-in check: a credential "good-<name>" signs in as <name>@gmail.com.
import http from "node:http";

export function startFakeClaude(port) {
  const calls = [];
  const server = http.createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const request = JSON.parse(body || "{}");
    calls.push({ url: req.url, maxTokens: request.max_tokens });
    res.setHeader("content-type", "application/json");
    if (req.url === "/v1/messages/count_tokens") return res.end(JSON.stringify({ input_tokens: 800 }));
    const set = {
      title: "Cell Biology",
      cards: Array.from({ length: 10 }, (_, i) => ({ front: `Term ${i + 1}`, back: `Answer ${i + 1}` })),
      quiz: Array.from({ length: 6 }, (_, i) => ({ question: `Question ${i + 1}?`, options: ["A", "B", "C", "D"], answer: 1, explanation: "Because B is right." })),
    };
    res.end(JSON.stringify({
      content: [{ type: "tool_use", id: "t1", name: "study_set", input: set }],
      stop_reason: "tool_use",
      usage: { input_tokens: 900, output_tokens: 1400 },
    }));
  });
  return new Promise((resolve) => server.listen(port, () => resolve({ server, calls })));
}

export function startFakeGoogle(port, clientId) {
  const server = http.createServer((req, res) => {
    const token = new URL(req.url, "http://x").searchParams.get("id_token") || "";
    if (!token.startsWith("good-")) { res.statusCode = 400; return res.end(JSON.stringify({ error: "invalid_token" })); }
    const name = token.slice(5);
    res.end(JSON.stringify({
      aud: clientId, iss: "https://accounts.google.com", exp: String(Math.floor(Date.now() / 1000) + 3600),
      sub: name, email: `${name}@gmail.com`, given_name: name[0].toUpperCase() + name.slice(1),
    }));
  });
  return new Promise((resolve) => server.listen(port, () => resolve({ server })));
}
