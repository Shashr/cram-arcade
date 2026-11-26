// Cram Arcade © 2026 Shashank J Reddy. All rights reserved. See LICENSE.
// Starts the whole app locally with the fake services from fake-services.mjs.
//   npm run dev   -> open http://localhost:3000 and play, with free fake AI sets
//   npm test      -> runs tests/smoke.mjs against it (see that file)
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startFakeClaude, startFakeGoogle } from "./fake-services.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function startStack({ port = 3000, quiet = false } = {}) {
  const ai = await startFakeClaude(port + 99);
  const google = await startFakeGoogle(port + 98, "test-client");
  const env = {
    ...process.env,
    PORT: String(port),
    ANTHROPIC_API_KEY: "fake-key",
    ANTHROPIC_API_URL: `http://localhost:${port + 99}`,
    GOOGLE_CLIENT_ID: "test-client",
    GOOGLE_TOKENINFO_URL: `http://localhost:${port + 98}/tokeninfo`,
    SESSION_SECRET: "local-test-secret",
    // No database settings, so accounts, crews and classes use memory ("test mode").
    KV_REST_API_URL: "", KV_REST_API_TOKEN: "", UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "",
  };
  const app = spawn(process.execPath, ["server.js"], { cwd: root, env, stdio: quiet ? "ignore" : "inherit" });
  // Wait until the server answers.
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`http://localhost:${port}/api/config`)).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  const stop = () => { app.kill(); ai.server.close(); google.server.close(); };
  return { url: `http://localhost:${port}`, aiCalls: ai.calls, stop };
}

// `node tests/stack.mjs` (npm run dev): keep it running until you press Ctrl+C.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const stack = await startStack({ port: Number(process.env.PORT) || 3000 });
  console.log(`\nCram Arcade (fake AI, test mode) is running at ${stack.url}`);
  console.log("AI study sets here are free stand-ins (always a small Cell Biology set).");
  console.log("Google sign-in doesn't work in this mode; everything else does. Press Ctrl+C to stop.\n");
  process.on("SIGINT", () => { stack.stop(); process.exit(0); });
}
