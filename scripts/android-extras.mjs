// Cram Arcade © 2026 Shashank J Reddy. All rights reserved. See LICENSE.
// One-time touches to the Android project after `npx cap add android`:
// copies the small white notification icon into the app's resources.
import { cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const res = path.join(root, "android", "app", "src", "main", "res");
if (!existsSync(res)) {
  console.error("No android/ folder yet. Run `npx cap add android` first.");
  process.exit(1);
}
await cp(path.join(root, "assets", "notification"), res, { recursive: true });
console.log("Added the notification icon to android/app/src/main/res");
