// Cram Arcade © 2026 Shashank J Reddy. All rights reserved. See LICENSE.
// Lets the Android app (which runs its own copy of the page at https://localhost)
// call these api/ functions. Other websites still can't.
const APP_ORIGINS = new Set(["https://localhost", "capacitor://localhost", "http://localhost"]);

// Returns true when the request was only a browser "may I?" check and has been answered.
export function cors(req, res) {
  const origin = req.headers?.origin;
  if (origin && APP_ORIGINS.has(origin)) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type, authorization");
    res.setHeader("access-control-max-age", "86400");
    res.setHeader("vary", "origin");
  }
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}
