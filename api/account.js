// Cram Arcade © 2026 Shashank J Reddy. All rights reserved. See LICENSE.
// Sign in with Microsoft or Google, and keep a player's progress in the cloud so it
// follows them between devices.
//
// Requests:
//   POST { action: "signin-microsoft", accessToken }   from Microsoft's sign-in page (User.Read)
//   POST { action: "signin", credential }   credential = the ID token from Google's sign-in button
//        -> { session, profile, data }       session = our own signed token for later requests
//   GET  (header Authorization: Bearer <session>)        -> { profile, data }
//   POST { action: "save", data } (same header)          -> { ok, savedAt }
//
// Setup (see README): MICROSOFT_CLIENT_ID and/or GOOGLE_CLIENT_ID, and SESSION_SECRET =
// any long random text. We only use the player's name and email.

import { db } from "./_db.js";
import { cors } from "./_cors.js";
import { SECRET, makeSession, readSession } from "./_session.js";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const MS_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
// Microsoft Graph "who am I" endpoint. If Microsoft accepts the token, we know who signed in.
const GRAPH_ME_URL = process.env.GRAPH_ME_URL || "https://graph.microsoft.com/v1.0/me";
// Google's official endpoint for checking a sign-in token. Can be swapped out for tests.
const TOKENINFO_URL = process.env.GOOGLE_TOKENINFO_URL || "https://oauth2.googleapis.com/tokeninfo";
const MAX_DATA_BYTES = 900_000; // big AI sets (up to 40 cards) add up across 30 saved sets

async function checkGoogleToken(credential) {
  const res = await fetch(`${TOKENINFO_URL}?id_token=${encodeURIComponent(credential)}`);
  if (!res.ok) throw new Error("Google didn't accept that sign-in. Try again.");
  const info = await res.json();
  const issuers = ["accounts.google.com", "https://accounts.google.com"];
  if (info.aud !== CLIENT_ID || !issuers.includes(info.iss) || Number(info.exp) * 1000 < Date.now() || !info.sub) {
    throw new Error("That sign-in wasn't for this site. Try again.");
  }
  return {
    name: String(info.given_name || info.name || "").slice(0, 40),
    email: String(info.email || "").slice(0, 120),
    picture: String(info.picture || "").slice(0, 500),
    sub: String(info.sub),
  };
}

async function checkMicrosoftToken(accessToken) {
  const res = await fetch(`${GRAPH_ME_URL}?$select=id,displayName,givenName,mail,userPrincipalName`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Microsoft didn't accept that sign-in. Try again.");
  const me = await res.json();
  if (!me.id) throw new Error("Microsoft didn't say who signed in. Try again.");
  return {
    name: String(me.givenName || me.displayName || "").slice(0, 40),
    email: String(me.mail || me.userPrincipalName || "").slice(0, 120),
    picture: "",
    sub: `ms:${me.id}`,
  };
}

const userKey = (sub) => `user:${sub}`;
async function loadUser(sub) {
  const [profile, data] = await Promise.all([db.get(`${userKey(sub)}:profile`), db.get(`${userKey(sub)}:data`)]);
  return {
    profile: profile ? JSON.parse(profile) : null,
    data: data ? JSON.parse(data) : null,
  };
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (!CLIENT_ID && !MS_CLIENT_ID) return res.status(503).json({ error: "Sign-in isn't set up on this site yet." });
  if (!SECRET) return res.status(500).json({ error: "The server is missing SESSION_SECRET." });
  try {
    if (req.method === "GET") {
      const session = readSession(req);
      if (!session) return res.status(401).json({ error: "Please sign in again." });
      return res.status(200).json(await loadUser(session.sub));
    }
    if (req.method !== "POST") return res.status(405).json({ error: "Use GET or POST." });

    const body = req.body || {};
    if (body.action === "signin" || body.action === "signin-microsoft") {
      const microsoft = body.action === "signin-microsoft";
      if (microsoft ? !MS_CLIENT_ID : !CLIENT_ID) return res.status(503).json({ error: "That sign-in isn't set up on this site." });
      let who;
      try {
        who = microsoft
          ? await checkMicrosoftToken(String(body.accessToken || ""))
          : await checkGoogleToken(String(body.credential || ""));
      } catch (err) {
        return res.status(401).json({ error: err.message });
      }
      const { sub, ...rest } = who;
      const profile = { ...rest, provider: microsoft ? "microsoft" : "google" };
      await db.set(`${userKey(sub)}:profile`, JSON.stringify(profile));
      const { data } = await loadUser(sub);
      return res.status(200).json({ session: makeSession(sub), profile, data });
    }

    if (body.action === "save") {
      const session = readSession(req);
      if (!session) return res.status(401).json({ error: "Please sign in again." });
      if (!body.data || typeof body.data !== "object") return res.status(400).json({ error: "Nothing to save." });
      const json = JSON.stringify({ ...body.data, savedAt: Date.now() });
      if (json.length > MAX_DATA_BYTES) return res.status(413).json({ error: "Too much data to save. Delete some old study sets." });
      await db.set(`${userKey(session.sub)}:data`, json);
      return res.status(200).json({ ok: true, savedAt: Date.now() });
    }

    return res.status(400).json({ error: "Unknown action." });
  } catch (err) {
    console.error(err);
    return res.status(502).json({ error: "Couldn't reach your account. Try again in a moment." });
  }
}
