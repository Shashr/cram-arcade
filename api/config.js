// Tells the page which optional features this server has set up.
// The Google client ID is public by design (it's visible in every sign-in button).
import { db } from "./_db.js";

export default function handler(req, res) {
  res.status(200).json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
    database: db.mode, // "online" or "test"
  });
}
