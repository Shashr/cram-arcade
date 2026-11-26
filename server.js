// Cram Arcade © 2026 Shashank J Reddy. All rights reserved. See LICENSE.
// Local development server: run `npm start`, then open http://localhost:3000
// (On Vercel this file isn't used; Vercel serves the files and runs the api/ functions itself.)
import "./load-env.js"; // must come first: reads .env before the api/ files load
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import generate from "./api/generate.js";
import crew from "./api/crew.js";
import account from "./api/account.js";
import config from "./api/config.js";
import classroom from "./api/classroom.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const apis = { "/api/generate": generate, "/api/crew": crew, "/api/account": account, "/api/config": config, "/api/classroom": classroom };

const types = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml",
  ".png": "image/png", ".webmanifest": "application/manifest+json", ".json": "application/json",
  ".woff": "font/woff", ".woff2": "font/woff2", ".txt": "text/plain",
};

// The same security headers Vercel adds online (from vercel.json), so local testing
// catches anything the Content Security Policy would block. (No https upgrade on localhost.)
const vercelConfig = JSON.parse(await readFile(path.join(root, "vercel.json"), "utf8"));
const securityHeaders = (vercelConfig.headers.find((h) => h.source === "/(.*)")?.headers || [])
  .map(({ key, value }) => [key, key === "Content-Security-Policy" ? value.replace(/;\s*upgrade-insecure-requests/, "") : value]);

const server = http.createServer(async (req, res) => {
  // Small helpers so the api/ functions work the same way they do on Vercel.
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(obj)); };

  const url = new URL(req.url, "http://localhost");
  const api = apis[url.pathname];
  if (api) {
    let body = "";
    for await (const chunk of req) body += chunk;
    try { req.body = JSON.parse(body || "{}"); } catch { req.body = {}; }
    req.query = Object.fromEntries(url.searchParams);
    return api(req, res);
  }

  const urlPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const file = path.join(root, path.normalize(urlPath));
  if (!file.startsWith(root) || !types[path.extname(file)]) return res.status(404).end("Not found");
  try {
    const content = await readFile(file);
    res.setHeader("content-type", types[path.extname(file)]);
    for (const [key, value] of securityHeaders) res.setHeader(key, value);
    res.setHeader("cache-control", "no-store"); // always show the newest version while developing
    res.end(content);
  } catch {
    res.status(404).end("Not found");
  }
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Cram Arcade running at http://localhost:${port}`));
