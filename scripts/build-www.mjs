// Cram Arcade © 2026 Shashank J Reddy. All rights reserved. See LICENSE.
// Copies the app's page files into www/, which is what goes inside the Android app.
// (The api/ folder stays on Vercel; the app calls it over the internet.)
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "www");
const files = ["index.html", "app.js", "style.css", "manifest.webmanifest", "privacy.html", "terms.html"];

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const f of files) await cp(path.join(root, f), path.join(out, f));
await cp(path.join(root, "icons"), path.join(out, "icons"), { recursive: true });
console.log(`Copied ${files.length} files and icons/ into www/`);
