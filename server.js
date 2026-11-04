// Local development server: run `npm start`, then open http://localhost:3000
// (On Vercel this file isn't used; Vercel serves the files and runs api/generate.js itself.)
import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import handler from "./api/generate.js";

const root = path.dirname(fileURLToPath(import.meta.url));

// Load ANTHROPIC_API_KEY from a local .env file if there is one.
const envFile = path.join(root, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml" };

const server = http.createServer(async (req, res) => {
  // Small helpers so api/generate.js works the same way it does on Vercel.
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(obj)); };

  if (req.url.startsWith("/api/generate")) {
    let body = "";
    for await (const chunk of req) body += chunk;
    try { req.body = JSON.parse(body || "{}"); } catch { req.body = {}; }
    return handler(req, res);
  }

  const urlPath = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  const file = path.join(root, path.normalize(urlPath));
  if (!file.startsWith(root) || !types[path.extname(file)]) return res.status(404).end("Not found");
  try {
    const content = await readFile(file);
    res.setHeader("content-type", types[path.extname(file)]);
    res.setHeader("cache-control", "no-store"); // always show the newest version while developing
    res.end(content);
  } catch {
    res.status(404).end("Not found");
  }
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Cram Arcade running at http://localhost:${port}`));
