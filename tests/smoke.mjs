// Cram Arcade © 2026 Shashank J Reddy. All rights reserved. See LICENSE.
// Smoke test: plays through the main features in a real (headless) browser.
// Run it with `npm test` before every push. It uses the fake services, so it's free.
//
// First time only: npm install, then npx playwright install chromium
import { chromium } from "playwright";
import { startStack } from "./stack.mjs";

const stack = await startStack({ port: 3311, quiet: true });
const browser = await chromium.launch();
let failed = 0;
const pageErrors = [];

async function newPage(width = 1200) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("console", (m) => { if (/Content Security Policy|Refused to/.test(m.text())) pageErrors.push(m.text()); });
  await page.route("**/accounts.google.com/**", (r) => r.abort()); // no real Google in tests
  await page.goto(stack.url);
  await page.waitForTimeout(500);
  return page;
}
async function step(name, fn) {
  try { const note = await fn(); console.log(`PASS  ${name}${note ? `  (${note})` : ""}`); }
  catch (e) { failed++; console.log(`FAIL  ${name}\n      ${String(e.message || e).split("\n")[0]}`); }
}
const check = (ok, msg) => { if (!ok) throw new Error(msg); };

const p = await newPage();

await step("home page loads with its security headers and fonts", async () => {
  const res = await p.request.get(stack.url);
  check(res.headers()["content-security-policy"], "no Content-Security-Policy header");
  const fonts = await p.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter((f) => f.status === "loaded").length; });
  check(fonts >= 2, `only ${fonts} fonts loaded`);
});

await step("make a study set with AI (fake AI)", async () => {
  await p.fill("#source", "photosynthesis");
  await p.click("#make-btn");
  await p.waitForSelector("text=Ready:", { timeout: 10000 });
  return await p.textContent("#status");
});

await step("flashcards open with the new set", async () => {
  await p.evaluate(() => showView("cards"));
  check(await p.isVisible("#view-cards"), "flashcards screen didn't open");
  const text = await p.textContent("#view-cards");
  check(text.includes("Term 1"), "the new set's first card isn't showing");
});

await step("quiz: answer every question and earn tickets", async () => {
  const t0 = await p.evaluate(() => player.tickets);
  await p.evaluate(() => { showView("quiz"); startQuiz(); });
  for (let i = 0; i < 30; i++) {
    if (!(await p.$("#quiz-body .option:not([disabled])"))) break;
    await p.evaluate(() => { const q = state.set.quiz[quiz.i]; document.querySelectorAll("#quiz-body .option")[q.answer].click(); });
    const next = await p.$('#quiz-body button:has-text("Next question"), #quiz-body button:has-text("See my score")');
    if (next) await next.click();
  }
  await p.waitForTimeout(700);
  const won = (await p.evaluate(() => player.tickets)) - t0;
  check(won > 0, "no tickets earned");
  return `+${won} tickets`;
});

await step("boss battle: Play button opens it and the boss can be beaten", async () => {
  await p.click("#hud-play");
  await p.waitForTimeout(300);
  await p.evaluate(() => { boss.next = "exam"; renderBossIntro("exam"); });
  await p.click("#boss-start");
  await p.waitForTimeout(1200);
  for (let i = 0; i < 40; i++) {
    if (await p.$(".boss-end")) break;
    await p.evaluate(() => { if (boss.active && !boss.locked && boss.q) bossAnswer(boss.q.answer); });
    await p.waitForTimeout(250);
  }
  await p.waitForSelector(".boss-end", { timeout: 8000 });
  const text = await p.textContent(".boss-end");
  check(/defeated/i.test(text), "boss wasn't defeated: " + text.slice(0, 80));
});

await step("crew: start a crew and a friend joins it", async () => {
  await p.click("#open-crew"); await p.waitForTimeout(200);
  await p.fill("#crew-name-me", "Sam"); await p.fill("#crew-new-name", "Test crew");
  await p.click("#crew-create button[type=submit]"); await p.waitForTimeout(500);
  const code = await p.evaluate(() => player.crew?.code);
  check(code && code.length === 5, "no crew code");
  const friend = await newPage();
  await friend.click("#open-crew"); await friend.waitForTimeout(200);
  await friend.fill("#crew-name-me", "Ali"); await friend.fill("#crew-code", code);
  await friend.click("#crew-join button[type=submit]"); await friend.waitForTimeout(600);
  const board = await friend.textContent("#crew-body");
  check(board.includes("Sam") && board.includes("Ali"), "board doesn't show both players");
  await friend.close();
  await p.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));
  return `code ${code}`;
});

await step("classroom: teacher makes a class, a student joins", async () => {
  const res = await p.request.post(`${stack.url}/api/classroom`, {
    headers: { origin: stack.url },
    data: { action: "create", className: "Bio 11", teacherName: "Ms. Lee", sets: [{ title: "Cells", cards: [{ front: "a", back: "b" }, { front: "c", back: "d" }, { front: "e", back: "f" }, { front: "g", back: "h" }], quiz: [] }] },
  });
  const created = await res.json();
  check(created.code && created.teacherKey, "class not created");
  const join = await p.request.post(`${stack.url}/api/classroom`, { data: { action: "join", code: created.code, playerId: "student-1234567", name: "Maya" } });
  check(join.ok(), "student couldn't join");
  const dash = await (await p.request.post(`${stack.url}/api/classroom`, { data: { action: "dashboard", code: created.code, teacherKey: created.teacherKey } })).json();
  check(dash.students?.some((s) => s.name === "Maya"), "teacher can't see the student");
  const wrongKey = await p.request.post(`${stack.url}/api/classroom`, { data: { action: "dashboard", code: created.code, teacherKey: "wrong" } });
  check(wrongKey.status() === 403, "dashboard opened with a wrong teacher key");
});

await step("sign in and delete the account (fake Google)", async () => {
  await p.evaluate(async () => { await signIn({ action: "signin", credential: "good-tester" }); });
  check((await p.textContent("#open-account")).includes("Tester"), "not signed in");
  const session = await p.evaluate(() => localStorage.getItem("cram-session"));
  const del = await p.request.post(`${stack.url}/api/account`, { headers: { authorization: `Bearer ${session}` }, data: { action: "delete" } });
  check(del.ok(), "delete failed");
});

await step("AI limits: requests from another website are refused", async () => {
  const res = await p.request.post(`${stack.url}/api/generate`, { headers: { origin: "https://evil.example" }, data: { text: "x", device: "d-12345678" } });
  check(res.status() === 403, `expected 403, got ${res.status()}`);
});

await step("phone size: nothing scrolls sideways", async () => {
  const phone = await newPage(390);
  const wide = await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  await phone.close();
  check(!wide, "the page is wider than the phone screen");
});

await step("no errors in the page", async () => { check(pageErrors.length === 0, pageErrors.join(" | ")); });

await browser.close();
stack.stop();
console.log(failed ? `\n${failed} check(s) failed.` : "\nAll checks passed.");
process.exit(failed ? 1 : 0);
