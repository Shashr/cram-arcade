// Cram Arcade © 2026 Shashank J Reddy. All rights reserved. See LICENSE.
// Copies the app's page files into www/, which is what goes inside the Android app.
// (The api/ folder stays on Vercel; the app calls it over the internet.)
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "www");
const files = ["index.html", "app.js", "style.css", "manifest.webmanifest", "privacy.html", "terms.html"];

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const f of files) await cp(path.join(root, f), path.join(out, f));
await cp(path.join(root, "icons"), path.join(out, "icons"), { recursive: true });
await cp(path.join(root, "fonts"), path.join(out, "fonts"), { recursive: true });
// Which build this is, so the app can tell when a newer one is on the website.
const build = Number(process.env.BUILD_NUMBER || 0);
await writeFile(path.join(out, "version.json"), JSON.stringify({ build }) + "\n");
console.log(`Copied ${files.length} files plus icons/ and fonts/ into www/`);
