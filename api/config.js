// Tells the page which optional features this server has set up.
// Client IDs are public by design (they're visible in every sign-in page).
import { db } from "./_db.js";

export default function handler(req, res) {
  res.status(200).json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
    microsoftClientId: process.env.MICROSOFT_CLIENT_ID || null,
    database: db.mode, // "online" or "test"
  });
}
