// Cram Arcade © 2026 Shashank J Reddy. All rights reserved. See LICENSE.
// Signed sign-in sessions, shared by account.js (which creates them) and generate.js
// (which uses them to give signed-in players their own AI limit).
import crypto from "node:crypto";
import { db } from "./_db.js";

// In test mode (no database) a random secret is fine: sessions just end when the server restarts.
export const SECRET = process.env.SESSION_SECRET || (db.mode === "test" ? crypto.randomBytes(32).toString("hex") : "");
const SESSION_DAYS = 60;

export function makeSession(sub) {
  const body = Buffer.from(JSON.stringify({ sub, exp: Date.now() + SESSION_DAYS * 86_400_000 })).toString("base64url");
  const mac = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function readSession(req) {
  if (!SECRET) return null;
  const token = String(req.headers?.authorization || "").replace(/^Bearer\s+/i, "");
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}
