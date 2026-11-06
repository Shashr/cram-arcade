// Cram Arcade © 2026 Shashank J Reddy. All rights reserved. See LICENSE.
// Protects the AI credit balance. Every AI study set has to pass ALL of these:
//
// 1. Money budget (the real safety net). Before each set we reserve its worst-case cost
//    out of a daily and a monthly dollar budget; afterwards we settle the actual cost.
//    Nothing anyone sends (fake devices, many networks, retries, failures) can spend past
//    the budget, because it's counted in dollars, not in requests.
// 2. Per person: signed-in players are counted by account (can't be reset); guests by a
//    device id. Guests get fewer sets, since a script can invent device ids.
// 3. Per network (IP address, as reported by Vercel) per day and per minute, so one
//    attacker can't hammer the server even with fake device ids.
// 4. Site-wide sets per day.
// 5. Only this site and the Android app may call it (checked with the Origin header).
//
// All counters use atomic increments (count first, then check, undo if over), so 100
// requests sent at the same moment can't all slip through.
import { db } from "./_db.js";

const num = (name, fallback) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
};
export const LIMITS = {
  perAccount: num("AI_DAILY_PER_ACCOUNT", 5),
  perGuest: num("AI_DAILY_PER_GUEST", 3),
  perNetworkDay: num("AI_DAILY_PER_NETWORK", 60),
  perNetworkMinute: num("AI_PER_MINUTE_PER_NETWORK", 12),
  perDay: num("AI_DAILY_TOTAL", 300),
  dailyBudget: num("AI_DAILY_BUDGET_USD", 0.5), // dollars per day, across everyone
  monthlyBudget: num("AI_MONTHLY_BUDGET_USD", 4), // dollars per month, across everyone
  priceIn: num("AI_PRICE_IN_PER_M", 0.1), // dollars per million input tokens
  priceOut: num("AI_PRICE_OUT_PER_M", 0.5), // dollars per million output tokens
};
export const AI_ENABLED = process.env.AI_ENABLED !== "false"; // emergency off switch

const MICRO = 1_000_000; // budgets are stored in millionths of a dollar (whole numbers)
const toMicro = (usd) => Math.ceil(usd * MICRO);
export function costMicro(inputTokens, outputTokens) {
  return toMicro((inputTokens * LIMITS.priceIn + outputTokens * LIMITS.priceOut) / 1_000_000);
}

function torontoDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date());
}
const dayKey = () => `ai:${torontoDate()}`;
const monthKey = () => `aim:${torontoDate().slice(0, 7)}`;
const minuteKey = () => `aib:${Math.floor(Date.now() / 60_000)}`;

const ALLOWED_ORIGINS = new Set([
  "https://cram-arcade.vercel.app",
  "https://localhost", "capacitor://localhost", // the Android app
  ...String(process.env.AI_ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean),
]);
export function originAllowed(req) {
  const origin = req.headers?.origin;
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  // Local testing on your own computer.
  return db.mode === "test" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

// Vercel puts the caller's real address in x-real-ip / x-forwarded-for and overwrites
// anything the caller sent, so it can't be faked from outside.
export function clientIp(req) {
  const h = req.headers || {};
  const ip = String(h["x-real-ip"] || h["x-vercel-forwarded-for"] || String(h["x-forwarded-for"] || "").split(",")[0] || req.socket?.remoteAddress || "unknown");
  return ip.trim().replace(/[^0-9a-fA-F:.]/g, "").slice(0, 64) || "unknown";
}

// Who the limit belongs to: the account if signed in, otherwise this device.
export function whoIs(session, deviceId) {
  if (session?.sub) return { key: `acct:${session.sub}`, limit: LIMITS.perAccount, signedIn: true };
  const id = String(deviceId || "").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 64);
  return { key: `dev:${id || "none"}`, limit: LIMITS.perGuest, signedIn: false };
}

export async function usageFor(who) {
  const counts = await db.hgetall(dayKey());
  const used = Number(counts[who.key] || 0);
  return { limit: who.limit, used, left: Math.max(0, who.limit - used), signedIn: who.signedIn };
}

// Takes one set out of every limit and reserves its worst-case cost. Returns a ticket used
// to settle or refund it, or { error, status } if any limit says no (and undoes everything).
export async function reserve(who, ip, worstCaseMicro) {
  const day = dayKey(), month = monthKey(), minute = minuteKey();
  const undo = [];
  const take = async (key, field, amount, max) => {
    const now = Number(await db.hincrby(key, field, amount));
    undo.push([key, field, amount]);
    return now <= max;
  };
  const rollback = () => Promise.all(undo.map(([k, f, a]) => db.hincrby(k, f, -a))).catch(() => {});
  try {
    const checks = [
      [() => take(day, who.key, 1, who.limit), "person"],
      [() => take(minute, `ip:${ip}`, 1, LIMITS.perNetworkMinute), "minute"],
      [() => take(day, `ip:${ip}`, 1, LIMITS.perNetworkDay), "network"],
      [() => take(day, "all", 1, LIMITS.perDay), "site"],
      [() => take(day, "cost", worstCaseMicro, toMicro(LIMITS.dailyBudget)), "budget"],
      [() => take(month, "cost", worstCaseMicro, toMicro(LIMITS.monthlyBudget)), "budget"],
    ];
    for (const [check, reason] of checks) {
      if (!(await check())) {
        await rollback();
        return { reason };
      }
    }
    await Promise.all([db.expire(day, 3 * 86400), db.expire(month, 40 * 86400), db.expire(minute, 180)]);
    return { ticket: { day, month, who: who.key, ip, reserved: worstCaseMicro, undo } };
  } catch (err) {
    await rollback();
    throw err;
  }
}

// After the AI call: charge what it really cost. If no study set came out, the person and
// network counts are given back, but the money spent stays counted against the budget.
export async function settle(ticket, actualMicro, { gotSet }) {
  const diff = actualMicro - ticket.reserved;
  const ops = [db.hincrby(ticket.day, "cost", diff), db.hincrby(ticket.month, "cost", diff)];
  if (!gotSet) {
    for (const [k, f, a] of ticket.undo) if (f !== "cost") ops.push(db.hincrby(k, f, -a));
  }
  await Promise.all(ops).catch((err) => console.error("settle failed", err));
}
