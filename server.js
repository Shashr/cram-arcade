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

const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml" };

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
