// Shared storage for the api/ functions. (Files starting with _ aren't web routes on Vercel.)
//
// Online: a Redis database (free on Upstash, one click from Vercel's Storage tab).
// Vercel adds KV_REST_API_URL and KV_REST_API_TOKEN automatically when you connect it.
// Test mode: without those, data is kept in memory so you can try things on your own
// computer. Memory is wiped when the server restarts and isn't shared between Vercel servers.

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(command) {
  const res = await fetch(REDIS_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${REDIS_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(command),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

const memory = new Map(); // key -> string, or Map(field -> string) for hashes
function hash(key) {
  if (!(memory.get(key) instanceof Map)) memory.set(key, new Map());
  return memory.get(key);
}

export const db = REDIS_URL && REDIS_TOKEN ? {
  mode: "online",
  get: (key) => redis(["GET", key]),
  set: (key, value) => redis(["SET", key, value]),
  async hgetall(key) {
    const flat = (await redis(["HGETALL", key])) || [];
    const out = {};
    for (let i = 0; i < flat.length; i += 2) out[flat[i]] = flat[i + 1];
    return out;
  },
  hset: (key, field, value) => redis(["HSET", key, field, value]),
  hincrby: (key, field, n) => redis(["HINCRBY", key, field, n]),
  hdel: (key, field) => redis(["HDEL", key, field]),
  exists: async (key) => (await redis(["EXISTS", key])) === 1,
  expire: (key, seconds) => redis(["EXPIRE", key, seconds]),
} : {
  mode: "test",
  async get(key) { const v = memory.get(key); return typeof v === "string" ? v : null; },
  async set(key, value) { memory.set(key, String(value)); },
  async hgetall(key) { return memory.get(key) instanceof Map ? Object.fromEntries(memory.get(key)) : {}; },
  async hset(key, field, value) { hash(key).set(field, String(value)); },
  async hincrby(key, field, n) {
    const h = hash(key);
    const next = Number(h.get(field) || 0) + n;
    h.set(field, String(next));
    return next;
  },
  async hdel(key, field) { if (memory.get(key) instanceof Map) memory.get(key).delete(field); },
  async exists(key) { return memory.has(key); },
  async expire() {},
};
