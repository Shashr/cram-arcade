// Cram Arcade © 2026 Shashank J Reddy. All rights reserved. Not licensed for reuse; see LICENSE.
// Cram Arcade front end: flashcards, quiz, and a matching game.

// In the Android app (Capacitor) the page runs from the phone itself, so server calls
// go to the live site. On the website they stay on the same site.
const NATIVE = !!window.Capacitor?.isNativePlatform?.();
const API = NATIVE ? "https://cram-arcade.vercel.app" : "";
const PHONE = NATIVE ? window.Capacitor.Plugins : {};
const SITE = NATIVE ? API : location.origin; // the public address, for links people share
if (NATIVE) document.documentElement.classList.add("native");

const EXAMPLE_SET = {
  title: "Digital logic basics",
  cards: [
    { front: "AND gate", back: "Outputs 1 only when all inputs are 1." },
    { front: "OR gate", back: "Outputs 1 when at least one input is 1." },
    { front: "NOT gate", back: "Flips its input: 0 becomes 1, 1 becomes 0." },
    { front: "XOR gate", back: "Outputs 1 when the inputs are different." },
    { front: "NAND gate", back: "AND followed by NOT; can build any other gate." },
    { front: "Truth table", back: "Lists a circuit's output for every input combination." },
    { front: "Binary 1011", back: "Equals 11 in decimal (8 + 2 + 1)." },
    { front: "Half adder", back: "Adds two bits; sum from XOR, carry from AND." },
    { front: "Flip-flop", back: "A circuit that stores one bit of memory." },
    { front: "Clock signal", back: "A steady 0/1 pulse that keeps circuit steps in sync." },
  ],
  quiz: [
    { question: "Which gate outputs 1 only when its two inputs differ?", options: ["AND", "OR", "XOR", "NAND"], answer: 2, explanation: "XOR means exclusive OR: one input or the other, not both." },
    { question: "What is binary 1011 in decimal?", options: ["9", "11", "13", "10"], answer: 1, explanation: "8 + 0 + 2 + 1 = 11." },
    { question: "Which gate is called universal because it can build every other gate?", options: ["NAND", "XOR", "OR", "NOT"], answer: 0, explanation: "Any logic circuit can be made from NAND gates alone." },
    { question: "In a half adder, which gate produces the carry bit?", options: ["OR", "XOR", "NOT", "AND"], answer: 3, explanation: "Carry is 1 only when both bits are 1, which is AND." },
    { question: "What does a flip-flop do?", options: ["Amplifies a signal", "Stores one bit", "Converts AC to DC", "Adds two numbers"], answer: 1, explanation: "Flip-flops are the basic memory element in digital circuits." },
    { question: "How many rows does a truth table for 3 inputs have?", options: ["3", "6", "8", "9"], answer: 2, explanation: "Each input has 2 states, so 2 × 2 × 2 = 8 rows." },
  ],
};

const $ = (id) => document.getElementById(id);
const state = { set: EXAMPLE_SET, order: [], index: 0, known: new Set(), learning: new Set() };

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function safeGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function safeSet(key, value) { try { localStorage.setItem(key, value); } catch { /* storage blocked */ } }

/* ---------- Sound and effects ---------- */
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// Tiny synth sound effects made with the Web Audio API (no sound files needed).
const SOUNDS = {
  flip:   [[520, 0.05, "triangle"]],
  click:  [[700, 0.03, "triangle"]],
  good:   [[660, 0.08], [880, 0.12, "square", 0.08]],
  bad:    [[180, 0.22, "sawtooth"]],
  pair:   [[784, 0.06], [1047, 0.1, "square", 0.06]],
  hit:    [[300, 0.06, "square"], [180, 0.08, "square", 0.04]],
  crit:   [[900, 0.05, "square"], [1200, 0.05, "square", 0.05], [1600, 0.14, "square", 0.1]],
  hurt:   [[140, 0.25, "sawtooth"], [100, 0.2, "sawtooth", 0.12]],
  enrage: [[220, 0.12, "sawtooth"], [233, 0.12, "sawtooth", 0.13], [247, 0.3, "sawtooth", 0.26]],
  win:    [[523, 0.1], [659, 0.1, "square", 0.1], [784, 0.1, "square", 0.2], [1047, 0.35, "square", 0.3]],
  lose:   [[392, 0.18, "triangle"], [330, 0.18, "triangle", 0.2], [262, 0.4, "triangle", 0.4]],
};
const fx = {
  on: safeGet("cram-sound") !== "off",
  ctx: null,
  play(name) {
    if (!this.on || !SOUNDS[name]) return;
    try {
      this.ctx ||= new (window.AudioContext || window.webkitAudioContext)();
      const now = this.ctx.currentTime;
      for (const [freq, dur, type = "square", delay = 0] of SOUNDS[name]) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.06, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + dur);
        osc.connect(gain).connect(this.ctx.destination);
        osc.start(now + delay);
        osc.stop(now + delay + dur + 0.02);
      }
    } catch { /* audio not available */ }
  },
};

// Android app: a small buzz to go with the game sounds (works even with sound off).
if (NATIVE && PHONE.Haptics) {
  const BUZZ = {
    good: () => PHONE.Haptics.impact({ style: "LIGHT" }),
    pair: () => PHONE.Haptics.impact({ style: "LIGHT" }),
    flip: () => PHONE.Haptics.selectionChanged?.(),
    bad: () => PHONE.Haptics.impact({ style: "HEAVY" }),
    hurt: () => PHONE.Haptics.vibrate({ duration: 220 }),
    enrage: () => PHONE.Haptics.vibrate({ duration: 400 }),
    win: () => PHONE.Haptics.notification({ type: "SUCCESS" }),
    lose: () => PHONE.Haptics.notification({ type: "ERROR" }),
  };
  const playSound = fx.play.bind(fx);
  fx.play = (name) => {
    playSound(name);
    try { BUZZ[name]?.()?.catch?.(() => {}); } catch { /* no vibration motor */ }
  };
}
function renderSoundBtn() {
  $("sound-btn").setAttribute("aria-label", fx.on ? "Sound on" : "Sound off");
  $("sound-btn").setAttribute("aria-pressed", String(fx.on));
}
$("sound-btn").addEventListener("click", () => {
  fx.on = !fx.on;
  safeSet("cram-sound", fx.on ? "on" : "off");
  renderSoundBtn();
  fx.play("click");
});
renderSoundBtn();

function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

function confetti(count = 90) {
  if (reducedMotion()) return;
  const layer = document.createElement("div");
  layer.className = "confetti";
  layer.setAttribute("aria-hidden", "true");
  document.body.append(layer);
  const colors = ["--accent", "--navy", "--good", "--bad"].map(cssVar);
  for (let i = 0; i < count; i++) {
    const piece = document.createElement("span");
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[i % colors.length];
    if (i % 3 === 0) piece.style.borderRadius = "50%";
    layer.append(piece);
    const drift = (Math.random() - 0.5) * 240;
    piece.animate(
      [{ transform: "translate(0, -20px) rotate(0deg)", opacity: 1 },
       { transform: `translate(${drift}px, 105vh) rotate(${(Math.random() - 0.5) * 900}deg)`, opacity: 0.9 }],
      { duration: 1800 + Math.random() * 1400, delay: Math.random() * 300, easing: "cubic-bezier(.25,.6,.45,1)", fill: "forwards" },
    );
  }
  setTimeout(() => layer.remove(), 3800);
}

// Little sparks that burst out of a point inside `container`.
function sparks(container, count = 10, color = cssVar("--accent")) {
  if (reducedMotion()) return;
  for (let i = 0; i < count; i++) {
    const s = document.createElement("span");
    s.className = "spark";
    s.style.background = color;
    container.append(s);
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const dist = 40 + Math.random() * 50;
    s.animate(
      [{ transform: "translate(-50%, -50%) scale(1)", opacity: 1 },
       { transform: `translate(calc(-50% + ${Math.cos(angle) * dist}px), calc(-50% + ${Math.sin(angle) * dist}px)) scale(0.2)`, opacity: 0 }],
      { duration: 500 + Math.random() * 250, easing: "cubic-bezier(.2,.8,.3,1)", fill: "forwards" },
    );
    setTimeout(() => s.remove(), 800);
  }
}

// Pixel-art break-apart: the defeated boss shatters into square "pixels" that scatter and
// fall in stepped, 8-bit style motion.
function pixelBreak(node) {
  if (reducedMotion() || !node) return;
  const box = node.getBoundingClientRect();
  const stage = node.parentElement;
  const origin = stage.getBoundingClientRect();
  const fills = [...node.querySelectorAll("[fill], .paper, .body, path, rect, circle")]
    .map((e) => getComputedStyle(e).fill).filter((f) => f && f !== "none" && !/0, 0, 0, 0/.test(f));
  const colors = fills.length ? fills : [cssVar("--red"), "#0d0726"];
  const size = Math.max(8, Math.round(box.width / 9));
  const layer = el("div", "pixel-layer");
  layer.setAttribute("aria-hidden", "true");
  stage.append(layer);
  for (let y = 0; y < box.height; y += size) {
    for (let x = 0; x < box.width; x += size) {
      if (Math.random() < 0.35) continue;
      const p = el("span", "pixel");
      p.style.cssText = `left:${box.left - origin.left + x}px;top:${box.top - origin.top + y}px;width:${size}px;height:${size}px;background:${colors[(x + y) % colors.length]}`;
      layer.append(p);
      const dx = (x - box.width / 2) * (0.6 + Math.random());
      const dy = -40 - Math.random() * 60;
      p.animate([
        { transform: "translate(0, 0)", opacity: 1 },
        { transform: `translate(${dx * 0.5}px, ${dy}px)`, opacity: 1, offset: 0.4 },
        { transform: `translate(${dx}px, ${box.height}px)`, opacity: 0 },
      ], { duration: 900 + Math.random() * 300, easing: "steps(9, end)", fill: "forwards" });
    }
  }
  setTimeout(() => layer.remove(), 1400);
}

// Restart a CSS animation class on an element.
function replay(node, cls, ms) {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
  setTimeout(() => node.classList.remove(cls), ms);
}

// Count a number up from 0 for a result screen.
function countUp(node, to, suffix = "", ms = 700) {
  if (reducedMotion()) { node.textContent = to + suffix; return; }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / ms);
    node.textContent = Math.round(to * (1 - Math.pow(1 - t, 3))) + suffix;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------- Quiz questions made from flashcards ---------- */
// Used for sets you type yourself (they have no AI quiz) and for the boss battle.
function cardQuestions(cards) {
  if (cards.length < 4) return [];
  return cards.map((c, i) => {
    const wrong = shuffle(cards.filter((_, j) => j !== i && cards[j].back !== c.back)).slice(0, 3).map((x) => x.back);
    const options = shuffle([c.back, ...wrong]);
    return { question: c.front, options, answer: options.indexOf(c.back), explanation: `${c.front}: ${c.back}`, fromCard: true };
  }).filter((q) => q.options.length === 4);
}

/* ---------- Saved sets (kept in this browser) ---------- */
const SAVED_KEY = "cram-sets";
function savedSets() {
  try { return JSON.parse(safeGet(SAVED_KEY) || "[]"); } catch { return []; }
}
function saveSet(set, kind, extra = {}) {
  const list = savedSets().filter((s) => s.title !== set.title);
  list.unshift({ title: set.title, cards: set.cards, quiz: set.quiz, kind, ...extra, savedAt: Date.now() });
  safeSet(SAVED_KEY, JSON.stringify(list.slice(0, 30)));
  renderSaved();
  renderTests();
  scheduleSync();
}
function renderSaved() {
  const list = savedSets();
  $("saved").hidden = list.length === 0;
  const box = $("saved-list");
  box.innerHTML = "";
  list.forEach((s, i) => {
    const chip = document.createElement("div");
    chip.className = s.kind === "own" ? "saved-chip own" : "saved-chip";
    const open = document.createElement("button");
    open.type = "button";
    open.className = "saved-open";
    open.innerHTML = `<span></span><span class="mono muted"></span>`;
    open.firstChild.textContent = s.title;
    open.lastChild.textContent = `${s.cards.length} cards, ${s.kind === "own" ? "made by you" : s.kind === "class" ? `from ${s.className || "your class"}` : "made with AI"}`;
    open.addEventListener("click", () => {
      loadSet(s, s.kind);
      showView("cards");
      fx.play("click");
      document.querySelector(".set").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    const del = document.createElement("button");
    del.type = "button";
    del.className = "saved-del";
    del.setAttribute("aria-label", `Delete ${s.title}`);
    del.textContent = "×";
    del.addEventListener("click", () => {
      const next = savedSets();
      next.splice(i, 1);
      safeSet(SAVED_KEY, JSON.stringify(next));
      renderSaved();
      renderTests();
      scheduleSync();
    });
    chip.append(open, del);
    box.append(chip);
  });
}

/* ---------- Make-your-own editor ---------- */
document.querySelectorAll(".mode-switch .tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    const own = tab.dataset.mode === "own";
    document.querySelectorAll(".mode-switch .tab").forEach((t) => t.setAttribute("aria-selected", String(t === tab)));
    $("make-form").hidden = own;
    $("own-form").hidden = !own;
    if (own && !$("own-rows").children.length) for (let i = 0; i < 4; i++) addOwnRow();
  });
});

function addOwnRow(front = "", back = "", focus = false) {
  const row = document.createElement("div");
  row.className = "own-row";
  const n = $("own-rows").children.length + 1;
  row.innerHTML = `
    <input class="text-input" maxlength="200" placeholder="Term" aria-label="Term">
    <input class="text-input" maxlength="300" placeholder="Answer" aria-label="Answer">
    <button type="button" class="own-remove" aria-label="Remove card">×</button>`;
  const [termIn, ansIn, remove] = row.children;
  termIn.value = front;
  ansIn.value = back;
  remove.addEventListener("click", () => {
    row.classList.add("leaving");
    setTimeout(() => { row.remove(); updateOwnCount(); }, reducedMotion() ? 0 : 180);
  });
  ansIn.addEventListener("keydown", (e) => {
    // Tab out of the last answer box makes a new row, like a spreadsheet.
    if (e.key === "Tab" && !e.shiftKey && row === $("own-rows").lastElementChild && ansIn.value.trim()) {
      e.preventDefault();
      addOwnRow("", "", true);
    }
  });
  row.addEventListener("input", updateOwnCount);
  $("own-rows").append(row);
  if (focus) termIn.focus();
  updateOwnCount();
  return n;
}

function ownCards() {
  return [...$("own-rows").children]
    .map((row) => ({ front: row.children[0].value.trim(), back: row.children[1].value.trim() }))
    .filter((c) => c.front && c.back);
}
function updateOwnCount() {
  const n = ownCards().length;
  $("own-count").textContent = `${n} card${n === 1 ? "" : "s"} ready`;
}

// Splits "term - answer" lines. Tabs (Quizlet export), " - ", ":", "=" all work.
function parseCardList(text) {
  const cards = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^(.+?)(?:\t|\s+[-–—=]\s+|:\s+)(.+)$/);
    if (m) cards.push({ front: m[1].trim(), back: m[2].trim() });
  }
  return cards;
}

$("own-add").addEventListener("click", () => addOwnRow("", "", true));
$("own-paste-toggle").addEventListener("click", () => {
  const box = $("own-paste");
  box.hidden = !box.hidden;
  $("own-paste-toggle").setAttribute("aria-expanded", String(!box.hidden));
  if (!box.hidden) $("own-paste-text").focus();
});
$("own-paste-add").addEventListener("click", () => {
  const cards = parseCardList($("own-paste-text").value);
  const status = $("own-status");
  status.className = "status";
  if (!cards.length) {
    status.classList.add("error");
    status.textContent = "Couldn't find any cards. Put one per line, like: term - answer";
    return;
  }
  // Fill empty rows first, then add new ones.
  const empty = [...$("own-rows").children].filter((r) => !r.children[0].value.trim() && !r.children[1].value.trim());
  cards.forEach((c, i) => {
    if (empty[i]) { empty[i].children[0].value = c.front; empty[i].children[1].value = c.back; }
    else addOwnRow(c.front, c.back);
  });
  $("own-paste-text").value = "";
  $("own-paste").hidden = true;
  $("own-paste-toggle").setAttribute("aria-expanded", "false");
  updateOwnCount();
  status.textContent = `Added ${cards.length} card${cards.length === 1 ? "" : "s"}.`;
  fx.play("pair");
});

$("own-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const cards = ownCards();
  const status = $("own-status");
  status.className = "status";
  if (cards.length < 4) {
    status.classList.add("error");
    status.textContent = `Add at least 4 cards with both a term and an answer (you have ${cards.length}).`;
    fx.play("bad");
    return;
  }
  const title = $("own-title").value.trim() || "My study set";
  const set = { title, cards, quiz: shuffle(cardQuestions(cards)).slice(0, 8) };
  saveSet(set, "own");
  linkNewSet(set.title);
  loadSet(set, "own");
  showView("cards");
  status.textContent = `Ready: ${cards.length} flashcards, saved on this device.`;
  fx.play("good");
  document.querySelector(".set").scrollIntoView({ behavior: "smooth", block: "start" });
});

/* ---------- Player: tickets, prizes, crew ----------
   Win tickets in games, spend them at the prize counter, and compete with friends
   on a crew leaderboard. Everything about you is kept in this browser; only your
   nickname, nameplate and tickets earned are sent to your crew's leaderboard. */
const PLAYER_KEY = "cram-player";
const POWERUPS = [
  { id: "heart", name: "Extra heart", price: 60, desc: "Get one heart back during a boss fight (once per fight)." },
  { id: "freeze", name: "Time freeze", price: 40, desc: "Stop the timer on one question." },
  { id: "fifty", name: "50/50", price: 30, desc: "Remove two wrong answers." },
];
const PLATES = [
  { id: "classic", name: "Classic", price: 0 },
  { id: "gold", name: "Gold", price: 150 },
  { id: "neon", name: "Neon", price: 250 },
  { id: "flame", name: "Flame", price: 400 },
  { id: "galaxy", name: "Galaxy", price: 600 },
];

function newPlayerId() {
  // Player and device ids work like passwords for crews and classes, so they come from the
  // browser's secure random generator, never Math.random.
  if (crypto.randomUUID) return crypto.randomUUID();
  return "p-" + Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}
function loadPlayer() {
  let saved = {};
  try { saved = JSON.parse(safeGet(PLAYER_KEY) || "{}"); } catch { /* start fresh */ }
  return {
    id: newPlayerId(), name: "", tickets: 0, earned: 0,
    inventory: { heart: 0, freeze: 0, fifty: 0 }, plates: ["classic"], plate: "classic",
    crew: null, pending: 0, pendingWins: 0,
    ...saved,
  };
}
const player = loadPlayer();
function savePlayer() {
  safeSet(PLAYER_KEY, JSON.stringify(player));
  scheduleSync(); // also save to the player's account if they're signed in
  schedulePhoneReminders(); // Android app: keep the phone's notifications in step
}
safeSet(PLAYER_KEY, JSON.stringify(player));

function renderTickets() {
  flapTo($("ticket-num"), player.tickets);
  $("shop-tickets").textContent = player.tickets;
  renderHud();
}

// Player card: name, avatar and a level that grows with every ticket you've ever earned.
// Level L starts at 50 x L x (L - 1) tickets: level 2 at 100, 3 at 300, 4 at 600 ...
const levelStart = (L) => 50 * L * (L - 1);
function levelFor(earned) {
  let L = 1;
  while (earned >= levelStart(L + 1)) L++;
  return L;
}
function renderHud() {
  if (!$("hud-name")) return;
  let profile = null;
  try { profile = account.profile; } catch { /* account isn't set up yet on first load */ }
  const name = profile?.name || player.name || "Guest player";
  $("hud-name").textContent = name;
  const avatar = $("hud-avatar");
  const pic = profile?.picture;
  if (pic && /^https:\/\//.test(pic)) {
    if (avatar.querySelector("img")?.src !== pic) {
      const img = document.createElement("img");
      img.src = pic; img.alt = ""; img.referrerPolicy = "no-referrer";
      avatar.replaceChildren(img);
    }
  } else {
    avatar.textContent = name === "Guest player" ? "?" : name.slice(0, 1).toUpperCase();
  }
  const earned = player.earned || 0;
  const L = levelFor(earned);
  const from = levelStart(L), to = levelStart(L + 1);
  const pct = Math.round(((earned - from) / (to - from)) * 100);
  $("hud-lvl").textContent = `Level ${L}`;
  $("hud-xp").style.width = `${pct}%`;
  $("hud-xp-bar").setAttribute("aria-valuenow", String(pct));
  $("hud-xp-text").textContent = `${to - earned} more tickets to level ${L + 1}`;
}

// Split-flap counter, like an arcade scoreboard: each digit that changes flips over.
// The element's text is still just the number, so screen readers read it normally.
function flapTo(node, value) {
  const next = String(value);
  const prev = node.dataset.value ?? next;
  node.dataset.value = next;
  const old = prev.padStart(next.length, " ");
  node.replaceChildren(...[...next].map((ch, i) => {
    const d = el("span", "flap", ch);
    if (!reducedMotion() && ch !== old[old.length - next.length + i]) {
      d.classList.add("flip");
      d.style.animationDelay = `${(next.length - 1 - i) * 70}ms`; // ones digit first, like a real board
    }
    return d;
  }));
}

// Repeat plays of the same set on the same day earn fewer tickets (100%, 50%, then 25%),
// so the leaderboard rewards studying, not replaying the easiest set forever.
function repeatFactor(game) {
  const today = new Date().toDateString();
  let log = {};
  try { log = JSON.parse(safeGet("cram-plays") || "{}"); } catch { /* ignore */ }
  if (log.day !== today) log = { day: today, plays: {} };
  const key = `${game}:${state.set.title}`;
  const count = log.plays[key] || 0;
  log.plays[key] = count + 1;
  safeSet("cram-plays", JSON.stringify(log));
  return [1, 0.5, 0.25][Math.min(count, 2)];
}

let toastTimer = 0;
function ticketToast(amount, reason) {
  const toast = $("ticket-toast");
  toast.textContent = `+${amount} tickets ${reason}`;
  toast.classList.remove("show");
  void toast.offsetWidth;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
  replay($("ticket-count"), "bump", 300);
}

// Give the player tickets. Returns how many they actually got after repeat-play scaling.
function award(base, reason, game, { win = false } = {}) {
  const amount = Math.round(base * repeatFactor(game));
  if (amount <= 0) return 0;
  player.tickets += amount;
  player.earned += amount;
  if (player.crew) {
    player.pending += amount;
    if (win) player.pendingWins += 1;
  }
  savePlayer();
  renderTickets();
  setTimeout(() => { ticketToast(amount, reason); fx.play("pair"); }, 400);
  flushScores();
  return amount;
}

/* ----- Talking to the crew leaderboard ----- */
async function crewApi(body) {
  const res = body ? await fetch(API + "/api/crew", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }) : await fetch(API + "/api/crew", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "board", code: player.crew.code, playerId: player.id }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Couldn't reach the leaderboard. Check your connection.");
  return data;
}

let flushing = false;
let crewBoard = null;
async function flushScores() {
  if (flushing || !player.crew || (player.pending <= 0 && player.pendingWins <= 0)) return;
  flushing = true;
  try {
    while (player.pending > 0 || player.pendingWins > 0) {
      const tickets = Math.min(400, player.pending);
      const win = player.pendingWins > 0;
      crewBoard = await crewApi({ action: "score", code: player.crew.code, playerId: player.id, tickets, win });
      player.pending -= tickets;
      if (win) player.pendingWins -= 1;
      savePlayer();
    }
    if ($("crew").open) renderCrew();
  } catch { /* keep them pending and try again later */ }
  flushing = false;
}

/* ----- Prize counter ----- */
function shopCard(title, desc, footer) {
  const card = el("div", "shop-item");
  card.append(title);
  if (desc) card.append(el("p", "muted small", desc));
  card.append(footer);
  return card;
}
function plateTag(name, plate) {
  return el("span", `plate plate-${plate}`, name || "Your name");
}
function renderShop() {
  renderTickets();
  const ups = $("shop-powerups");
  ups.innerHTML = "";
  for (const item of POWERUPS) {
    const title = el("div", "shop-title");
    title.append(el("strong", "", item.name), el("span", "owned", `You have ${player.inventory[item.id] || 0}`));
    const buy = el("button", "btn btn-buy", `Buy for ${item.price}`);
    buy.type = "button";
    if (player.tickets < item.price) {
      buy.disabled = true;
      buy.textContent = `Need ${item.price - player.tickets} more`;
    }
    buy.addEventListener("click", () => {
      if (player.tickets < item.price) return;
      player.tickets -= item.price;
      player.inventory[item.id] = (player.inventory[item.id] || 0) + 1;
      savePlayer();
      fx.play("good");
      renderShop();
    });
    ups.append(shopCard(title, item.desc, buy));
  }

  const plates = $("shop-plates");
  plates.innerHTML = "";
  for (const item of PLATES) {
    const owned = player.plates.includes(item.id);
    const equipped = player.plate === item.id;
    const title = el("div", "shop-title");
    title.append(plateTag(player.name || item.name, item.id));
    const btn = el("button", "btn btn-buy");
    btn.type = "button";
    if (equipped) { btn.textContent = "Wearing it"; btn.disabled = true; btn.classList.add("btn-done"); }
    else if (owned) btn.textContent = "Wear it";
    else if (player.tickets < item.price) { btn.textContent = `${item.name}: need ${item.price - player.tickets} more`; btn.disabled = true; }
    else btn.textContent = `Buy ${item.name} for ${item.price}`;
    btn.addEventListener("click", async () => {
      if (!owned) {
        if (player.tickets < item.price) return;
        player.tickets -= item.price;
        player.plates.push(item.id);
        confetti(50);
        fx.play("win");
      } else fx.play("click");
      player.plate = item.id;
      savePlayer();
      renderShop();
      if (player.crew) crewApi({ action: "profile", code: player.crew.code, playerId: player.id, name: player.name, plate: player.plate })
        .then((b) => { crewBoard = b; }).catch(() => {});
    });
    plates.append(shopCard(title, "", btn));
  }
}

/* ----- Crew leaderboard ----- */
let crewTab = "week";
function crewForm() {
  const wrap = el("div", "crew-start");
  wrap.innerHTML = `
    <p>Start a crew and share its code with friends. Everyone's tickets go on one leaderboard, and it resets every Monday.</p>
    <label class="label" for="crew-name-me">Your nickname</label>
    <input id="crew-name-me" class="text-input" maxlength="20" autocomplete="nickname" placeholder="What your friends call you">
    <p class="muted small form-note">Your nickname, nameplate and tickets show on the crew's leaderboard. Leaving the crew deletes them. <a href="privacy.html">Privacy Policy</a></p>
    <div class="crew-choices">
      <form class="crew-choice" id="crew-create">
        <h3 class="sheet-sub">Start a crew</h3>
        <input class="text-input" id="crew-new-name" maxlength="20" placeholder="Crew name, like Chem gang" aria-label="Crew name">
        <button class="btn btn-primary" type="submit">Start a crew</button>
      </form>
      <form class="crew-choice" id="crew-join">
        <h3 class="sheet-sub">Join a crew</h3>
        <input class="text-input code-input" id="crew-code" maxlength="5" placeholder="5-letter code" aria-label="Crew code" autocomplete="off">
        <button class="btn" type="submit">Join</button>
      </form>
    </div>
    <p class="status" id="crew-status" role="status"></p>`;
  const nameIn = wrap.querySelector("#crew-name-me");
  nameIn.value = player.name;
  const go = async (e, body) => {
    e.preventDefault();
    const status = wrap.querySelector("#crew-status");
    status.className = "status";
    const name = nameIn.value.trim();
    if (!name) { status.classList.add("error"); status.textContent = "Type a nickname first."; nameIn.focus(); return; }
    player.name = name;
    savePlayer();
    status.textContent = "Connecting…";
    try {
      crewBoard = await crewApi({ ...body, playerId: player.id, name, plate: player.plate });
      player.crew = { code: crewBoard.code, name: crewBoard.crewName };
      savePlayer();
      fx.play("win");
      renderCrew();
    } catch (err) {
      status.classList.add("error");
      status.textContent = err.message;
      fx.play("bad");
    }
  };
  wrap.querySelector("#crew-create").addEventListener("submit", (e) =>
    go(e, { action: "create", crewName: wrap.querySelector("#crew-new-name").value }));
  wrap.querySelector("#crew-join").addEventListener("submit", (e) =>
    go(e, { action: "join", code: wrap.querySelector("#crew-code").value }));
  return wrap;
}

function chaseLine(players, me, key) {
  const myIndex = players.findIndex((p) => p.me);
  if (myIndex < 0 || players.length < 2) return "Share your crew code so friends can join.";
  if (myIndex === 0) {
    const gap = me[key] - players[1][key];
    return gap === 0 ? `You're tied with ${players[1].name} for first. Win one more fight to pull ahead.`
      : `You're in first place, ${gap} tickets ahead of ${players[1].name}.`;
  }
  const above = players[myIndex - 1];
  return `You're ${above[key] - me[key] + 1} tickets away from passing ${above.name}. A boss win could do it.`;
}

function renderCrewBoard(body) {
  const b = crewBoard;
  const head = el("div", "crew-head");
  const title = el("div");
  title.append(el("p", "crew-name", b.crewName));
  const codeRow = el("p", "muted small");
  codeRow.append("Crew code ", el("strong", "crew-code", b.code));
  title.append(codeRow);
  const copy = el("button", "btn", "Copy code");
  copy.type = "button";
  copy.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(b.code); copy.textContent = "Copied"; } catch { copy.textContent = b.code; }
    setTimeout(() => { copy.textContent = "Copy code"; }, 1500);
  });
  head.append(title, copy);
  body.append(head);

  const tabs = el("div", "switch");
  tabs.setAttribute("role", "tablist");
  for (const [id, label] of [["week", "This week"], ["total", "All time"]]) {
    const t = el("button", "tab", label);
    t.type = "button";
    t.setAttribute("role", "tab");
    t.setAttribute("aria-selected", String(crewTab === id));
    t.addEventListener("click", () => { crewTab = id; renderCrew(); });
    tabs.append(t);
  }
  body.append(tabs);

  const players = [...b.players].sort((x, y) => y[crewTab] - x[crewTab] || y.wins - x.wins);
  const me = players.find((p) => p.me);
  const list = el("ol", "board");
  players.forEach((p, i) => {
    const row = el("li", p.me ? "board-row me" : "board-row");
    row.append(el("span", `board-rank rank-${i + 1}`, String(i + 1)));
    const who = el("span", "board-who");
    who.append(plateTag(p.name, p.plate), el("span", "muted small", `${p.wins} boss win${p.wins === 1 ? "" : "s"}`));
    row.append(who, el("span", "board-score", String(p[crewTab])));
    list.append(row);
  });
  body.append(list);
  if (me) body.append(el("p", "chase", chaseLine(players, me, crewTab)));
  if (b.mode === "test") {
    body.append(el("p", "muted small test-note",
      "Test mode: this leaderboard only lives on this computer until the server restarts. Connect a database when you put the site online so friends can join (see the README)."));
  }

  const actions = el("div", "maker-row");
  const refresh = el("button", "btn", "Refresh");
  refresh.type = "button";
  refresh.addEventListener("click", () => renderCrew(true));
  const leave = el("button", "btn btn-quiet", "Leave crew");
  leave.type = "button";
  leave.addEventListener("click", () => {
    // Remove your nickname and scores from the crew's board too (best effort when offline).
    crewApi({ action: "leave", code: player.crew.code, playerId: player.id }).catch(() => {});
    player.crew = null;
    player.pending = 0;
    player.pendingWins = 0;
    crewBoard = null;
    savePlayer();
    renderCrew();
  });
  actions.append(refresh, leave);
  body.append(actions);
}

async function renderCrew(reload = false) {
  const body = $("crew-body");
  if (!player.crew) { body.innerHTML = ""; body.append(crewForm()); return; }
  if (!crewBoard || reload || crewBoard.code !== player.crew.code) {
    body.innerHTML = '<p class="muted">Loading the leaderboard…</p>';
    try {
      await flushScores();
      crewBoard = await crewApi();
    } catch (err) {
      body.innerHTML = "";
      body.append(el("p", "status error", err.message));
      const leave = el("button", "btn btn-quiet", "Leave this crew");
      leave.type = "button";
      leave.addEventListener("click", () => { player.crew = null; savePlayer(); renderCrew(); });
      body.append(leave);
      return;
    }
  }
  body.innerHTML = "";
  renderCrewBoard(body);
}

/* ---------- Google sign-in and cloud sync ----------
   Signing in keeps tickets, saved sets, tests and best times in the player's account,
   so they follow you between your phone and laptop. Only name, email and picture are
   requested for sign-in; the calendar is a separate, optional, read-only permission. */
const SESSION_KEY = "cram-session";
const account = { config: null, profile: null, syncedAt: 0, syncing: false, error: "" };
try { account.profile = JSON.parse(safeGet("cram-profile") || "null"); } catch { /* ignore */ }
// A name without a sign-in token isn't really signed in: don't show it as if it were.
if (account.profile && !safeGet(SESSION_KEY)) { account.profile = null; safeSet("cram-profile", "null"); }

async function getConfig() {
  if (account.config) return account.config;
  try {
    const res = await fetch(API + "/api/config");
    account.config = res.ok ? await res.json() : {};
  } catch {
    account.config = {};
  }
  return account.config;
}

let googleScript = null;
function loadGoogle() {
  googleScript ||= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve(window.google);
    s.onerror = () => { googleScript = null; reject(new Error("Couldn't load Google sign-in. Check your connection.")); };
    document.head.append(s);
  });
  return googleScript;
}

function bestTimes() {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith("cram-best:") || k.startsWith("cram-boss:")) out[k] = Number(localStorage.getItem(k));
    }
  } catch { /* storage blocked */ }
  return out;
}
function localData() {
  return { player: { ...player }, sets: savedSets(), bests: bestTimes() };
}

// Combine this device's progress with the account's. The side that has earned more
// tickets wins for tickets and power-ups; sets, tests, nameplates and records are merged.
function mergeData(local, cloud) {
  if (!cloud || !cloud.player) return local;
  const base = (cloud.player.earned || 0) >= (local.player.earned || 0) ? cloud.player : local.player;
  const other = base === cloud.player ? local.player : cloud.player;
  const tests = [...(base.tests || [])];
  for (const t of other.tests || []) if (!tests.some((x) => x.id === t.id)) tests.push(t);
  const byCode = (a = [], b = []) => [...a, ...b.filter((x) => !a.some((y) => y.code === x.code))];
  const sessions = [...(base.sessions || [])];
  for (const t of other.sessions || []) {
    const mine = sessions.find((x) => x.id === t.id);
    if (!mine) sessions.push(t);
    else if (t.done) mine.done = true; // finished on either device counts
  }
  const sets = [...(cloud.sets || [])];
  for (const s of local.sets || []) if (!sets.some((x) => x.title === s.title)) sets.push(s);
  const bests = { ...(cloud.bests || {}) };
  for (const [k, v] of Object.entries(local.bests || {})) if (!bests[k] || (v && v < bests[k])) bests[k] = v;
  return {
    player: {
      ...base,
      plates: [...new Set([...(base.plates || []), ...(other.plates || [])])],
      tests,
      sessions,
      classes: byCode(base.classes, other.classes),
      teaching: byCode(base.teaching, other.teaching),
      name: base.name || other.name,
      pending: local.player.pending, // tickets this device hasn't sent to the crew yet
      pendingWins: local.player.pendingWins,
    },
    sets: sets.slice(0, 30),
    bests,
  };
}
function applyData(data) {
  Object.assign(player, data.player);
  safeSet(PLAYER_KEY, JSON.stringify(player));
  safeSet(SAVED_KEY, JSON.stringify(data.sets || []));
  for (const [k, v] of Object.entries(data.bests || {})) if (v) safeSet(k, String(v));
  renderTickets();
  renderSaved();
  renderTests();
  renderReminders();
  if ($("calendar").open) renderCalendar();
  showBest();
}

async function accountApi(body) {
  const session = safeGet(SESSION_KEY);
  const headers = { "content-type": "application/json" };
  if (session) headers.authorization = `Bearer ${session}`;
  const res = body
    ? await fetch(API + "/api/account", { method: "POST", headers, body: JSON.stringify(body) })
    : await fetch(API + "/api/account", { headers });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !String(body?.action || "").startsWith("signin")) signOut(true);
  if (!res.ok) throw new Error(data.error || "Couldn't reach your account.");
  return data;
}

let syncTimer = 0;
function scheduleSync() {
  if (!safeGet(SESSION_KEY)) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(pushSync, 1500);
}
async function pushSync() {
  if (!safeGet(SESSION_KEY) || account.syncing) return;
  account.syncing = true;
  try {
    await accountApi({ action: "save", data: localData() });
    account.syncedAt = Date.now();
    account.error = "";
  } catch (err) {
    account.error = err.message;
  }
  account.syncing = false;
  if ($("account").open) renderAccount();
}
async function pullSync() {
  if (!safeGet(SESSION_KEY)) return;
  try {
    const { data } = await accountApi();
    applyData(mergeData(localData(), data));
    await pushSync();
  } catch (err) {
    account.error = err.message;
  }
}

// payload is { action: "signin", credential } (Google) or { action: "signin-microsoft", accessToken }
async function signIn(payload) {
  const status = $("account-status");
  if (status) { status.className = "status"; status.textContent = "Signing in…"; }
  try {
    const { session, profile, data } = await accountApi(payload);
    safeSet(SESSION_KEY, session);
    safeSet("cram-profile", JSON.stringify(profile));
    account.profile = profile;
    if (!player.name && profile.name) player.name = profile.name;
    applyData(mergeData(localData(), data));
    await pushSync();
    loadAiLimit();
    fx.play("win");
    renderAccountChip();
    renderAccount();
  } catch (err) {
    if (status) { status.classList.add("error"); status.textContent = err.message; }
    fx.play("bad");
  }
}
// Signing out saves everything to the account first, then clears this device back to a
// fresh guest (so the next person on this phone or computer doesn't see your tickets).
// Signing in again brings it all back. If the session expired we can't save, so we keep
// the progress here and merge it when you sign in again.
const LOCAL_KEYS = [PLAYER_KEY, SAVED_KEY, "cram-plays", "cram-asked-notify", "cram-hide-promo"];
async function signOut(expired = false) {
  if (!expired && safeGet(SESSION_KEY)) {
    const status = $("account-status");
    if (status) { status.className = "status"; status.textContent = "Saving your progress…"; }
    clearTimeout(syncTimer);
    try {
      while (account.syncing) await new Promise((r) => setTimeout(r, 200));
      await accountApi({ action: "save", data: localData() });
    } catch {
      if (status) { status.classList.add("error"); status.textContent = "Couldn't save your progress, so you're still signed in. Check your connection and try again."; }
      return;
    }
  }
  safeSet(SESSION_KEY, "");
  safeSet("cram-profile", "null");
  account.profile = null;
  try { window.google?.accounts.id.disableAutoSelect(); } catch { /* ignore */ }
  if (expired) {
    account.error = "Your sign-in expired. Sign in again to keep syncing.";
    renderAccountChip();
    if ($("account").open) renderAccount();
    return;
  }
  try {
    for (const k of LOCAL_KEYS) localStorage.removeItem(k);
    for (const k of Object.keys(localStorage)) if (k.startsWith("cram-best:") || k.startsWith("cram-boss:")) localStorage.removeItem(k);
  } catch { /* storage blocked */ }
  safeSet("cram-signed-out", "yes");
  location.reload();
}

// "Delete my account": removes everything about you from the database (your account,
// your name and results in classes, your crew scores, and any classes you teach),
// then clears this device back to a fresh guest.
function deleteAccountBox() {
  const box = el("div", "danger-zone");
  const start = el("button", "link-btn danger-link", "Delete my account");
  start.type = "button";
  start.addEventListener("click", () => {
    box.innerHTML = "";
    const teaching = (player.teaching || []).length;
    box.append(el("p", "small", "This deletes your account for good: your name, email, synced study sets, tickets and records, your results in any class, your crew scores"
      + (teaching ? `, and the ${teaching === 1 ? "class" : `${teaching} classes`} you teach (with all their students' results)` : "") + ". It can't be undone."));
    const row = el("div", "maker-row");
    const yes = el("button", "btn btn-danger", "Delete everything");
    yes.type = "button";
    const no = el("button", "btn btn-quiet", "Keep my account");
    no.type = "button";
    no.addEventListener("click", () => renderAccount());
    const status = el("p", "status");
    yes.addEventListener("click", async () => {
      yes.disabled = no.disabled = true;
      status.className = "status";
      status.textContent = "Deleting…";
      clearTimeout(syncTimer);
      const id = player.id;
      // Classes and crews first (they use this device's player id), then the account.
      const cleanup = [
        ...(player.classes || []).map((c) => classApi({ action: "leave", code: c.code, playerId: id })),
        ...(player.teaching || []).map((c) => classApi({ action: "deleteClass", code: c.code, teacherKey: c.key })),
        player.crew ? crewApi({ action: "leave", code: player.crew.code, playerId: id }) : null,
      ].filter(Boolean);
      await Promise.allSettled(cleanup);
      try {
        await accountApi({ action: "delete" });
      } catch (err) {
        yes.disabled = no.disabled = false;
        status.classList.add("error");
        status.textContent = `${err.message} Nothing was deleted from your account yet, so try again.`;
        return;
      }
      safeSet(SESSION_KEY, "");
      safeSet("cram-profile", "null");
      account.profile = null;
      try { window.google?.accounts.id.disableAutoSelect(); } catch { /* ignore */ }
      try {
        for (const k of LOCAL_KEYS) localStorage.removeItem(k);
        for (const k of Object.keys(localStorage)) if (k.startsWith("cram-best:") || k.startsWith("cram-boss:")) localStorage.removeItem(k);
      } catch { /* storage blocked */ }
      safeSet("cram-deleted", "yes");
      location.reload();
    });
    row.append(yes, no);
    box.append(row, status);
  });
  box.append(start);
  return box;
}

// Official sign-in marks, used on the sign-in buttons and next to your name once signed in.
const LOGOS = {
  microsoft: `<svg class="brand-logo" viewBox="0 0 21 21" aria-hidden="true"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>`,
  google: `<svg class="brand-logo" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`,
};

function renderAccountChip() {
  const chip = $("open-account");
  chip.innerHTML = "";
  if (account.profile) {
    if (LOGOS[account.profile.provider]) chip.insertAdjacentHTML("beforeend", LOGOS[account.profile.provider]);
    chip.append(el("span", "", account.profile.name || "Account"));
    chip.setAttribute("aria-label", `Your account: ${account.profile.name || ""}, signed in with ${account.profile.provider === "microsoft" ? "Microsoft" : "Google"}`);
  } else {
    chip.textContent = "Sign in";
    chip.removeAttribute("aria-label");
  }
  chip.classList.toggle("signed-in", !!account.profile);
  renderHud();
}

// A sign-in button with the provider's logo. Without setup it shows as a disabled preview.
function brandButton(provider, enabled) {
  const b = el("button", `brand-btn brand-${provider}`);
  b.type = "button";
  b.id = provider === "microsoft" ? "ms-signin" : "google-preview";
  b.innerHTML = `${LOGOS[provider]}<span>Sign in with ${provider === "microsoft" ? "Microsoft" : "Google"}</span>`;
  b.disabled = !enabled;
  return b;
}

async function renderAccount() {
  const body = $("account-body");
  const config = await getConfig();
  body.innerHTML = "";
  if (!config.googleClientId && !config.microsoftClientId) {
    body.append(el("p", "", "Sign-in isn't switched on for this site yet. Everything still works and saves on this device."));
    const preview = el("div", "signin-buttons");
    preview.append(brandButton("microsoft", false), brandButton("google", false));
    body.append(preview);
    body.append(el("p", "muted small", "If this is your site: add MICROSOFT_CLIENT_ID and/or GOOGLE_CLIENT_ID, plus SESSION_SECRET (see the README)."));
    return;
  }
  if (account.profile && safeGet(SESSION_KEY)) {
    const who = el("div", "who");
    const avatar = el("span", "avatar", (account.profile.name || "?").slice(0, 1).toUpperCase());
    if (account.profile.picture) {
      const img = document.createElement("img");
      img.src = account.profile.picture;
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      img.onerror = () => img.remove();
      avatar.append(img);
    }
    const names = el("div");
    const via = el("span", "signed-via small");
    if (LOGOS[account.profile.provider]) via.insertAdjacentHTML("beforeend", LOGOS[account.profile.provider]);
    via.append(account.profile.provider === "microsoft" ? "Signed in with Microsoft" : account.profile.provider === "google" ? "Signed in with Google" : "Signed in");
    names.append(el("strong", "", account.profile.name || "Signed in"), el("span", "muted small", account.profile.email || ""), via);
    who.append(avatar, names);
    body.append(who);
    body.append(el("p", "", "Your tickets, saved sets, tests and records sync to your account, so they're the same on every device."));
    const note = account.error ? el("p", "status error", account.error)
      : el("p", "muted small", account.syncing ? "Syncing…" : account.syncedAt ? `Synced at ${new Date(account.syncedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.` : "");
    note.id = "account-status";
    body.append(note);
    const row = el("div", "maker-row");
    const sync = el("button", "btn", "Sync now");
    sync.type = "button";
    sync.addEventListener("click", async () => { await pullSync(); renderAccount(); });
    const out = el("button", "btn btn-quiet", "Sign out");
    out.type = "button";
    out.addEventListener("click", () => signOut());
    body.append(el("p", "muted small", "Signing out saves your progress to your account and clears it from this device."));
    row.append(sync, out);
    body.append(row);
    body.append(deleteAccountBox());
    return;
  }
  if (NATIVE) {
    // Google doesn't allow its web sign-in inside apps; the app gets its own sign-in next.
    body.append(el("p", "", "Signing in from the Android app is coming in the next update. Until then, your tickets, study sets and crew are saved on this phone."));
    return;
  }
  body.append(el("p", "", "Sign in to keep your tickets, study sets and crew on every device. Everything you've done on this device comes with you."));
  if (account.error) body.append(el("p", "status error", account.error));
  const buttons = el("div", "signin-buttons");
  body.append(buttons);
  const consent = el("p", "muted small form-note");
  consent.innerHTML = 'By signing in, you agree to the <a href="terms.html">Terms of Use</a>. We save your name, email, profile picture link and progress so they sync between devices. <a href="privacy.html">Privacy Policy</a>';
  buttons.after(consent);
  if (config.microsoftClientId) {
    const ms = brandButton("microsoft", true);
    ms.addEventListener("click", () => microsoftLogin("signin"));
    buttons.append(ms);
  }
  const holder = el("div", "gsi-holder");
  holder.id = "gsi-button";
  if (config.googleClientId) buttons.append(holder);
  if (config.microsoftClientId) body.append(el("p", "muted small", "Use your school Microsoft account if your school uses Outlook and Teams."));
  const status = el("p", "status", "");
  status.id = "account-status";
  status.setAttribute("role", "status");
  body.append(status);
  if (!config.googleClientId) return;
  try {
    const google = await loadGoogle();
    google.accounts.id.initialize({ client_id: config.googleClientId, callback: (r) => signIn({ action: "signin", credential: r.credential }) });
    google.accounts.id.renderButton(holder, { theme: "filled_black", size: "large", shape: "pill", text: "signin_with" });
  } catch (err) {
    status.classList.add("error");
    status.textContent = err.message;
  }
}

/* ---------- Microsoft sign-in, Outlook calendar ----------
   Uses Microsoft's standard sign-in for web apps (authorization code with PKCE): the page
   goes to Microsoft's sign-in page and comes back with a one-time code, which this page
   swaps for a short-lived token. Works for school/work and personal Microsoft accounts. */
const MS_AUTHORITY = "https://login.microsoftonline.com/common/oauth2/v2.0";
const MS_SCOPES = {
  signin: ["openid", "profile", "email", "User.Read"],
  calendar: ["User.Read", "Calendars.Read"],
};
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const msRedirect = () => `${location.origin}/`;

async function microsoftLogin(intent) {
  const config = await getConfig();
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  try { sessionStorage.setItem("cram-ms", JSON.stringify({ verifier, state, intent })); } catch { /* ignore */ }
  const params = new URLSearchParams({
    client_id: config.microsoftClientId,
    response_type: "code",
    redirect_uri: msRedirect(),
    response_mode: "query",
    scope: MS_SCOPES[intent].join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  if (intent === "signin") params.set("prompt", "select_account");
  else if (account.profile?.email) params.set("login_hint", account.profile.email);
  location.assign(`${MS_AUTHORITY}/authorize?${params}`);
}

// Turn Microsoft's error into something a student can act on.
function msErrorMessage(code, description = "") {
  if (/AADSTS65001|AADSTS90094|admin|consent/i.test(`${code} ${description}`)) {
    return "Your school needs to approve Cram Arcade before you can sign in with your school account. Ask your teacher to ask IT to approve it, or sign in with a personal account for now.";
  }
  if (code === "access_denied") return "Sign-in was cancelled.";
  return "Microsoft sign-in didn't work. Try again.";
}

// Runs when Microsoft sends the player back to the page with ?code=... or ?error=...
async function finishMicrosoftLogin() {
  const params = new URLSearchParams(location.search);
  if (!params.has("code") && !params.has("error")) return;
  let pending = null;
  try { pending = JSON.parse(sessionStorage.getItem("cram-ms") || "null"); sessionStorage.removeItem("cram-ms"); } catch { /* ignore */ }
  history.replaceState(null, "", location.pathname); // tidy the address bar
  if (!pending) return;
  const showError = (text) => {
    if (pending.intent === "calendar") {
      $("cal-pick").hidden = false;
      $("cal-pick").innerHTML = "";
      $("cal-pick").append(el("p", "status error", text));
    } else {
      account.error = text;
      openSheet("account");
    }
  };
  if (params.has("error")) return showError(msErrorMessage(params.get("error"), params.get("error_description") || ""));
  if (params.get("state") !== pending.state) return showError("Sign-in didn't match. Please try again.");
  let token;
  try {
    const config = await getConfig();
    const res = await fetch(`${MS_AUTHORITY}/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.microsoftClientId,
        grant_type: "authorization_code",
        code: params.get("code"),
        redirect_uri: msRedirect(),
        code_verifier: pending.verifier,
        scope: MS_SCOPES[pending.intent].join(" "),
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.access_token) return showError(msErrorMessage(data.error, data.error_description));
    token = data.access_token;
  } catch {
    return showError("Couldn't reach Microsoft. Check your connection and try again.");
  }
  if (pending.intent === "signin") {
    openSheet("account");
    await signIn({ action: "signin-microsoft", accessToken: token });
  } else {
    const box = $("cal-pick");
    box.hidden = false;
    box.innerHTML = '<p class="muted">Looking for tests in your Outlook calendar…</p>';
    box.scrollIntoView({ behavior: "smooth", block: "center" });
    try {
      showCalendarPicker(await readOutlook(token));
    } catch (err) {
      box.innerHTML = "";
      box.append(el("p", "status error", err.message));
    }
  }
}

async function readOutlook(token) {
  const from = new Date();
  const to = new Date(Date.now() + 45 * 86_400_000);
  const url = "https://graph.microsoft.com/v1.0/me/calendarView?" + new URLSearchParams({
    startDateTime: from.toISOString(), endDateTime: to.toISOString(), $top: "250",
    $select: "id,subject,start,bodyPreview,isCancelled", $orderby: "start/dateTime",
  });
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}`, prefer: `outlook.timezone="${zone}"` } });
  if (!res.ok) throw new Error("Couldn't read your Outlook calendar. Try again.");
  const { value = [] } = await res.json();
  return value
    .filter((ev) => !ev.isCancelled && TEST_WORDS.test(ev.subject || ""))
    .map((ev) => ({
      calendarId: `ms:${ev.id}`,
      name: String(ev.subject).slice(0, 80),
      date: String(ev.start?.dateTime || "").slice(0, 10),
      notes: String(ev.bodyPreview || "").slice(0, 600),
      source: "outlook",
    }))
    .filter((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.date) && daysUntil(t.date) >= 0);
}

/* ---------- Upcoming tests (Google Calendar or added by hand) ---------- */
const TEST_WORDS = /\b(tests?|exams?|quiz(zes)?|midterms?|finals?|assessments?|evaluations?|summatives?|culminating|isu)\b/i;

function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function daysUntil(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86_400_000);
}
function prettyDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}
function upcomingTests() {
  player.tests ||= [];
  return player.tests.filter((t) => daysUntil(t.date) >= 0).sort((a, b) => a.date.localeCompare(b.date));
}

let linkingTestId = null; // the test waiting for its new study set
function linkNewSet(title) {
  if (!linkingTestId) return;
  const test = (player.tests || []).find((t) => t.id === linkingTestId);
  if (test) { test.setTitle = title; savePlayer(); renderTests(); }
  linkingTestId = null;
}

// A calendar file (.ics) with the test's planned study sessions, for a phone's calendar app.
function studyPlanFile(test) {
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const escape = (s) => String(s).replace(/[\\;,]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Cram Arcade//Study plan//EN", "CALSCALE:GREGORIAN"];
  for (const session of sessionsFor(test.id)) {
    const start = sessionTime(session);
    const end = new Date(start.getTime() + 30 * 60000);
    const fmt = (t) => `${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}T${pad(t.getHours())}${pad(t.getMinutes())}00`;
    const left = daysUntil(test.date) - daysUntil(session.date);
    lines.push(
      "BEGIN:VEVENT",
      `UID:cram-${session.id}@cramarcade`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${fmt(start)}`,
      `DTEND:${fmt(end)}`,
      `SUMMARY:${escape(`Study for ${test.name}`)}`,
      `DESCRIPTION:${escape(`${left === 1 ? "Last session: beat the boss!" : `${left} days to go.`} ${SITE}`)}`,
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escape(`Study for ${test.name}`)}`, "TRIGGER:-PT10M", "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `study-plan-${test.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.ics`;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function renderTests() {
  const list = $("test-list");
  list.innerHTML = "";
  const tests = upcomingTests();
  $("test-add-toggle").hidden = !tests.length; // the empty state has its own big button
  if (!tests.length) {
    const empty = el("div", "tests-empty");
    empty.append(
      el("strong", "", "No tests coming up"),
      el("p", "", "Add your next test. Cram Arcade counts down the days, plans short study sessions and reminds you when it's time."),
    );
    const add = el("button", "btn btn-primary", "Add your first test");
    add.type = "button";
    add.addEventListener("click", () => { if ($("test-add").hidden) $("test-add-toggle").click(); $("test-name").focus(); });
    empty.append(add);
    list.append(empty);
    return;
  }
  const sets = savedSets();
  for (const test of tests) {
    const days = daysUntil(test.date);
    const card = el("article", `test-card ${days <= 1 ? "urgent" : days <= 3 ? "soon" : ""}`);
    const count = el("div", days === 0 ? "test-count is-today" : "test-count");
    count.append(
      el("strong", "", days === 0 ? "Today" : days === 1 ? "1" : String(days)),
      el("span", "", days === 0 ? "good luck" : days === 1 ? "day left" : "days left"),
    );
    const info = el("div", "test-info");
    info.append(el("h3", "test-name", test.name));
    info.append(el("p", "muted small", `${prettyDate(test.date)}${test.source === "calendar" ? ", from Google Calendar" : test.source === "outlook" ? ", from Outlook" : ""}`));
    const linked = sets.find((s) => s.title === test.setTitle);
    const actions = el("div", "test-actions");
    if (linked) {
      const study = el("button", "btn btn-primary", "Study now");
      study.type = "button";
      study.addEventListener("click", () => {
        loadSet(linked, linked.kind);
        showView(days <= 1 ? "boss" : "cards");
        fx.play("click");
        document.querySelector(".set").scrollIntoView({ behavior: "smooth", block: "start" });
      });
      actions.append(study);
      info.append(el("p", "small", `Study set: ${linked.title}`));
    } else {
      const make = el("button", "btn btn-primary", "Make a study set");
      make.type = "button";
      make.addEventListener("click", () => {
        linkingTestId = test.id;
        document.querySelector('.mode-switch [data-mode="ai"]').click();
        $("source").value = [test.name, test.notes].filter(Boolean).join("\n");
        $("source").dispatchEvent(new Event("input"));
        $("source").focus();
        $("make-form").scrollIntoView({ behavior: "smooth", block: "center" });
      });
      actions.append(make);
    }
    if (sets.length) {
      const pick = document.createElement("select");
      pick.className = "test-select";
      pick.setAttribute("aria-label", `Study set for ${test.name}`);
      pick.append(new Option(linked ? "Change study set" : "Use a saved set", ""));
      for (const s of sets) pick.append(new Option(s.title, s.title));
      pick.addEventListener("change", () => {
        if (!pick.value) return;
        test.setTitle = pick.value;
        savePlayer();
        renderTests();
      });
      actions.append(pick);
    }
    const planned = sessionsFor(test.id);
    if (!planned.length && days > 0) {
      const plan = el("button", "btn", "Plan study sessions");
      plan.type = "button";
      plan.addEventListener("click", () => {
        const added = planSessions(test);
        fx.play(added ? "good" : "bad");
        renderTests();
        renderReminders();
      });
      actions.append(plan);
    }
    info.append(actions);
    if (planned.length) {
      const next = planned.find((x) => !x.done && sessionTime(x) > Date.now() - 3 * 3600_000);
      const doneCount = planned.filter((x) => x.done).length;
      const line = el("p", "small plan-line");
      line.append(`${doneCount} of ${planned.length} study sessions done.${next ? ` Next: ${sessionLabel(next)}.` : ""} `);
      const ics = el("button", "link-btn", "Add them to Outlook or my phone's calendar");
      ics.type = "button";
      ics.addEventListener("click", () => studyPlanFile(test));
      if (!NATIVE) line.append(ics); // the Android app sends its own phone notifications instead
      info.append(line);
    }
    const remove = el("button", "test-remove", "×");
    remove.type = "button";
    remove.setAttribute("aria-label", `Remove ${test.name}`);
    remove.addEventListener("click", () => {
      player.tests = player.tests.filter((t) => t.id !== test.id);
      player.sessions = (player.sessions || []).filter((x) => x.testId !== test.id);
      savePlayer();
      renderTests();
      renderReminders();
    });
    card.append(count, info, remove);
    list.append(card);
  }
}

function addTest(test) {
  player.tests ||= [];
  if (test.calendarId && player.tests.some((t) => t.calendarId === test.calendarId)) return;
  player.tests.push({ id: newPlayerId(), ...test });
}

$("test-add-toggle").addEventListener("click", () => {
  const form = $("test-add");
  form.hidden = !form.hidden;
  $("test-add-toggle").setAttribute("aria-expanded", String(!form.hidden));
  if (!form.hidden) { $("test-date").min = todayISO(); $("test-name").focus(); }
});
$("test-add").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("test-name").value.trim();
  const date = $("test-date").value;
  const status = $("test-add-status");
  status.className = "status error";
  if (!name) { status.textContent = "Give the test a name."; return; }
  if (!date || daysUntil(date) < 0) { status.textContent = "Pick a date from today on."; return; }
  addTest({ name: name.slice(0, 80), date, source: "manual" });
  savePlayer();
  renderTests();
  $("test-name").value = "";
  $("test-date").value = "";
  status.textContent = "";
  $("test-add").hidden = true;
  $("test-add-toggle").setAttribute("aria-expanded", "false");
  fx.play("good");
});

async function readCalendar(token) {
  const from = new Date();
  const to = new Date(Date.now() + 45 * 86_400_000);
  const url = "https://www.googleapis.com/calendar/v3/calendars/primary/events?" + new URLSearchParams({
    timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "250",
  });
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("Couldn't read your calendar. Try connecting again.");
  const { items = [] } = await res.json();
  return items
    .filter((ev) => ev.status !== "cancelled" && TEST_WORDS.test(ev.summary || ""))
    .map((ev) => ({
      calendarId: ev.id,
      name: String(ev.summary).slice(0, 80),
      date: ev.start?.date || (ev.start?.dateTime ? new Date(ev.start.dateTime).toLocaleDateString("en-CA") : ""),
      notes: String(ev.description || "").replace(/<[^>]+>/g, " ").slice(0, 600),
      source: "calendar",
    }))
    .filter((t) => t.date && daysUntil(t.date) >= 0);
}

function showCalendarPicker(found) {
  const box = $("cal-pick");
  box.hidden = false;
  box.innerHTML = "";
  const fresh = found.filter((t) => !(player.tests || []).some((x) => x.calendarId === t.calendarId));
  if (!fresh.length) {
    box.append(el("p", "", found.length
      ? "You're already tracking every test in your calendar."
      : "No tests found in the next 6 weeks. Events need a word like test, quiz, exam or midterm in the name."));
    const ok = el("button", "btn", "OK");
    ok.type = "button";
    ok.addEventListener("click", () => { box.hidden = true; });
    box.append(ok);
    return;
  }
  box.append(el("p", "label", `Found ${fresh.length} test${fresh.length === 1 ? "" : "s"} in your calendar. Which ones should Cram Arcade track?`));
  const list = el("div", "cal-list");
  fresh.forEach((t, i) => {
    const row = el("label", "cal-row");
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = true;
    check.dataset.i = i;
    row.append(check, el("span", "", t.name), el("span", "muted small", prettyDate(t.date)));
    list.append(row);
  });
  box.append(list);
  const row = el("div", "maker-row");
  const add = el("button", "btn btn-primary", "Track these tests");
  add.type = "button";
  add.addEventListener("click", () => {
    list.querySelectorAll("input:checked").forEach((c) => addTest(fresh[Number(c.dataset.i)]));
    savePlayer();
    renderTests();
    box.hidden = true;
    fx.play("win");
  });
  const cancel = el("button", "btn btn-quiet", "Cancel");
  cancel.type = "button";
  cancel.addEventListener("click", () => { box.hidden = true; });
  row.append(cancel, add);
  box.append(row);
}

$("cal-connect").addEventListener("click", async () => {
  const box = $("cal-pick");
  const config = await getConfig();
  try {
    const google = await loadGoogle();
    const client = google.accounts.oauth2.initTokenClient({
      client_id: config.googleClientId,
      scope: "https://www.googleapis.com/auth/calendar.readonly",
      login_hint: account.profile?.email || undefined,
      callback: async (resp) => {
        if (resp.error) return;
        box.hidden = false;
        box.innerHTML = '<p class="muted">Looking for tests in your calendar…</p>';
        try {
          showCalendarPicker(await readCalendar(resp.access_token));
        } catch (err) {
          box.innerHTML = "";
          box.append(el("p", "status error", err.message));
        }
      },
    });
    client.requestAccessToken();
  } catch (err) {
    box.hidden = false;
    box.innerHTML = "";
    box.append(el("p", "status error", err.message));
  }
});

/* ---------- Study sessions, in-app calendar and reminders ----------
   Sessions are short study blocks (default 7 PM) on the days before a test. They show
   on the calendar, the reminder banner, and a pop-up when it's time (while the app is
   open). Finishing one earns tickets. */
const SESSION_TICKETS = 15;

function sessionTime(s) {
  const [y, m, d] = s.date.split("-").map(Number);
  const [hh, mm] = (s.time || "19:00").split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm);
}
function timeLabel(s) {
  return sessionTime(s).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function sessionLabel(s) {
  const days = daysUntil(s.date);
  const day = days === 0 ? "today" : days === 1 ? "tomorrow" : prettyDate(s.date);
  return `${day} at ${timeLabel(s)}`;
}
function sessionsFor(testId) {
  return (player.sessions || []).filter((s) => s.testId === testId).sort((a, b) => sessionTime(a) - sessionTime(b));
}
function testFor(session) {
  return (player.tests || []).find((t) => t.id === session.testId);
}
function sessionTitle(s) {
  const test = testFor(s);
  return test ? `Study for ${test.name}` : s.title || "Study session";
}
function isoOf(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// An evening session on each of the (up to 5) days before the test, skipping times already past.
function planSessions(test) {
  player.sessions ||= [];
  const [y, m, d] = test.date.split("-").map(Number);
  let added = 0;
  for (let i = Math.min(5, daysUntil(test.date)); i >= 1; i--) {
    const date = isoOf(new Date(y, m - 1, d - i));
    const s = { id: newPlayerId(), testId: test.id, date, time: "19:00", done: false };
    if (sessionTime(s) < Date.now()) {
      // Today and it's already past 7: offer a session in 15 minutes instead.
      if (daysUntil(date) !== 0) continue;
      const soon = new Date(Date.now() + 15 * 60000);
      s.time = `${String(soon.getHours()).padStart(2, "0")}:${String(soon.getMinutes()).padStart(2, "0")}`;
      if (isoOf(soon) !== date) continue;
    }
    player.sessions.push(s);
    added++;
  }
  savePlayer();
  if (added) ticketToastText(`Planned ${added} study session${added === 1 ? "" : "s"}. Answer ${SESSION_GOAL} questions in each one for ${SESSION_TICKETS} tickets.`);
  return added;
}

if (safeGet("cram-deleted") === "yes") {
  safeSet("cram-deleted", "");
  setTimeout(() => ticketToastText("Your account and everything in it has been deleted."), 300);
}
if (safeGet("cram-signed-out") === "yes") {
  safeSet("cram-signed-out", "");
  setTimeout(() => ticketToastText("Signed out. Your progress is saved to your account."), 300);
}
function ticketToastText(text) {
  const toast = $("ticket-toast");
  toast.textContent = text;
  toast.classList.remove("show");
  void toast.offsetWidth;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function studyFor(session) {
  const test = session && testFor(session);
  const set = test && savedSets().find((x) => x.title === test.setTitle);
  if (set) {
    loadSet(set, set.kind);
    showView(test && daysUntil(test.date) <= 1 ? "boss" : "cards");
    document.querySelector(".set").scrollIntoView({ behavior: "smooth", block: "start" });
  } else if (test) {
    // No study set yet: start making one for this test.
    linkingTestId = test.id;
    document.querySelector('.mode-switch [data-mode="ai"]').click();
    $("source").value = [test.name, test.notes].filter(Boolean).join("\n");
    $("source").dispatchEvent(new Event("input"));
    $("make-form").scrollIntoView({ behavior: "smooth", block: "center" });
  } else {
    document.querySelector(".set").scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

/* A session only counts once you've actually studied that day: SESSION_GOAL answers
   across flashcards, quiz, match or boss battle. Taps less than 1.5 seconds apart don't
   count, so flipping through cards without reading doesn't finish a session. Each finished
   session uses up its own SESSION_GOAL answers, so two sessions on one day need double. */
const SESSION_GOAL = 15;
const STUDY_GAP_MS = 1500;
function studyToday() {
  const today = todayISO();
  if (player.studyDay?.date !== today) player.studyDay = { date: today, count: 0, used: 0, last: 0 };
  return player.studyDay;
}
function sessionProgress() {
  const day = studyToday();
  return Math.min(SESSION_GOAL, day.count - day.used);
}
function logStudy() {
  const day = studyToday();
  const now = Date.now();
  if (now - day.last < STUDY_GAP_MS) return;
  day.last = now;
  day.count++;
  const next = (player.sessions || []).filter((x) => x.date === day.date && !x.done).sort((a, b) => sessionTime(a) - sessionTime(b))[0];
  if (next && day.count - day.used >= SESSION_GOAL) {
    day.used += SESSION_GOAL;
    finishSession(next);
  } else {
    savePlayer();
    if (next) renderReminders();
  }
}

function finishSession(session) {
  if (session.done || daysUntil(session.date) !== 0) return;
  session.done = true;
  savePlayer();
  confetti(60);
  award(SESSION_TICKETS, "for finishing a study session", "session");
  renderReminders();
  renderTests();
  if ($("calendar").open) renderCalendar();
}

// "8 / 15 answers" bar shown wherever a session would have had a Done button.
function sessionMeter() {
  const got = sessionProgress();
  const wrap = el("div", "session-meter");
  wrap.setAttribute("role", "progressbar");
  wrap.setAttribute("aria-valuemin", "0");
  wrap.setAttribute("aria-valuemax", String(SESSION_GOAL));
  wrap.setAttribute("aria-valuenow", String(got));
  wrap.setAttribute("aria-label", "Study session progress");
  const bar = el("span", "session-bar");
  const fill = el("span", "session-fill");
  fill.style.width = `${(got / SESSION_GOAL) * 100}%`;
  bar.append(fill);
  wrap.append(bar, el("span", "session-count", `${got} / ${SESSION_GOAL} answers for +${SESSION_TICKETS} tickets`));
  return wrap;
}

/* ----- Reminder banner at the top of the page ----- */
function reminderItems() {
  const today = todayISO();
  const hidden = player.hiddenReminders?.day === today ? player.hiddenReminders.ids : [];
  const items = [];
  for (const s of (player.sessions || []).filter((x) => x.date === today && !x.done)) {
    items.push({ id: s.id, kind: "session", session: s, when: sessionTime(s) });
  }
  for (const t of upcomingTests().filter((x) => daysUntil(x.date) <= 1)) {
    items.push({ id: t.id, kind: "test", test: t, when: new Date(0) });
  }
  return items.filter((i) => !hidden.includes(i.id)).sort((a, b) => a.when - b.when).slice(0, 3);
}

function renderReminders() {
  const box = $("reminders");
  box.innerHTML = "";
  for (const item of reminderItems()) {
    const card = el("div", `reminder reminder-${item.kind}`);
    const text = el("p", "reminder-text");
    const actions = el("div", "reminder-actions");
    if (item.kind === "session") {
      const s = item.session;
      const started = sessionTime(s) <= Date.now();
      text.append(el("strong", "", started ? "Study time!" : `Study session at ${timeLabel(s)}:`), ` ${sessionTitle(s)}.`);
      const go = el("button", "btn btn-primary", "Study now");
      go.type = "button";
      go.addEventListener("click", () => studyFor(s));
      actions.append(go);
      text.append(" Answer cards or questions in any game to finish it.");
    } else {
      const t = item.test;
      const days = daysUntil(t.date);
      text.append(el("strong", "", days === 0 ? `${t.name} is today.` : `${t.name} is tomorrow.`),
        days === 0 ? " One last boss fight to warm up?" : " Beat the boss tonight and you're ready.");
      const go = el("button", "btn btn-primary", t.setTitle ? "Fight the boss" : "Make a study set");
      go.type = "button";
      go.addEventListener("click", () => {
        const set = savedSets().find((x) => x.title === t.setTitle);
        if (set) { loadSet(set, set.kind); showView("boss"); document.querySelector(".set").scrollIntoView({ behavior: "smooth", block: "start" }); }
        else studyFor({ testId: t.id });
      });
      actions.append(go);
    }
    const hide = el("button", "reminder-hide", "×");
    hide.type = "button";
    hide.setAttribute("aria-label", "Hide this reminder for today");
    hide.addEventListener("click", () => {
      const today = todayISO();
      if (player.hiddenReminders?.day !== today) player.hiddenReminders = { day: today, ids: [] };
      player.hiddenReminders.ids.push(item.id);
      savePlayer();
      renderReminders();
    });
    card.append(text, actions, hide);
    if (item.kind === "session") actions.before(sessionMeter());
    box.append(card);
  }
}

/* ----- Pop-up when a session starts (while the app is open) ----- */
let popSession = null;
function showReminderPop(session) {
  popSession = session;
  $("reminder-pop-text").textContent = `Study time! ${sessionTitle(session)}. Answer ${SESSION_GOAL} questions or cards to earn ${SESSION_TICKETS} tickets.`;
  $("reminder-pop").hidden = false;
  fx.play("enrage");
  if (document.hidden && "Notification" in window && Notification.permission === "granted") {
    try { new Notification("Cram Arcade: study time!", { body: sessionTitle(session) }); } catch { /* ignore */ }
  }
}
function checkReminders() {
  const now = Date.now();
  for (const s of player.sessions || []) {
    const t = sessionTime(s).getTime();
    if (!s.done && !s.notified && t <= now && now - t < 2 * 3600_000) {
      s.notified = true;
      savePlayer();
      showReminderPop(s);
      break;
    }
  }
  renderReminders();
}
$("reminder-go").addEventListener("click", () => {
  $("reminder-pop").hidden = true;
  studyFor(popSession);
});
$("reminder-snooze").addEventListener("click", () => {
  $("reminder-pop").hidden = true;
  if (!popSession) return;
  const later = new Date(Date.now() + 10 * 60000);
  if (isoOf(later) === popSession.date) {
    popSession.time = `${String(later.getHours()).padStart(2, "0")}:${String(later.getMinutes()).padStart(2, "0")}`;
    popSession.notified = false;
    savePlayer();
  }
  renderReminders();
});

function renderNotifyBtn() {
  const btn = $("notify-btn");
  if (NATIVE) {
    // Shown until the phone allows notifications.
    PHONE.LocalNotifications?.checkPermissions()
      .then((p) => { btn.hidden = p.display === "granted"; })
      .catch(() => { btn.hidden = true; });
    return;
  }
  btn.hidden = !("Notification" in window) || Notification.permission !== "default";
}
$("notify-btn").addEventListener("click", async () => {
  if (NATIVE) {
    await askPhoneReminders();
  } else {
    try { await Notification.requestPermission(); } catch { /* ignore */ }
  }
  renderNotifyBtn();
});

/* ----- Phone notifications (Android app only) -----
   The website can only remind you while it's open. The Android app hands the schedule
   to the phone, so reminders arrive even when the app is closed:
   - each planned study session, at its time
   - 4 PM the day before a test, and 7 AM on the morning of it */
var phoneReminderTimer = null; // var: savePlayer() can run before this line does
var phoneRemindersReady = null;
const REMIND_EVE = [16, 0];
const REMIND_MORNING = [7, 0];

function reminderId(key) {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h) % 2_000_000_000 + 1;
}

function phoneReminderList() {
  const now = Date.now();
  const soon = now + 60 * 86400_000;
  const list = [];
  for (const s of player.sessions || []) {
    const at = sessionTime(s);
    if (s.done || at <= now || at > soon) continue;
    list.push({
      id: reminderId(`session:${s.id}`),
      title: "Study time!",
      body: `${sessionTitle(s)}. Answer ${SESSION_GOAL} questions for ${SESSION_TICKETS} tickets.`,
      at, extra: { kind: "session", id: s.id },
    });
  }
  for (const t of upcomingTests()) {
    const [y, m, d] = t.date.split("-").map(Number);
    const eve = new Date(y, m - 1, d - 1, ...REMIND_EVE);
    const morning = new Date(y, m - 1, d, ...REMIND_MORNING);
    if (eve > now && eve <= soon) {
      list.push({
        id: reminderId(`eve:${t.id}`), title: `${t.name} is tomorrow`,
        body: t.setTitle ? "Beat the boss tonight and you're ready." : "Make a study set and beat the boss tonight.",
        at: eve, extra: { kind: "test", id: t.id },
      });
    }
    if (morning > now && morning <= soon) {
      list.push({
        id: reminderId(`morning:${t.id}`), title: `${t.name} is today`,
        body: "One last boss fight to warm up?",
        at: morning, extra: { kind: "test", id: t.id },
      });
    }
  }
  return list.sort((a, b) => a.at - b.at).slice(0, 50);
}

async function askPhoneReminders() {
  const LN = PHONE.LocalNotifications;
  if (!LN) return false;
  try {
    let p = await LN.checkPermissions();
    if (p.display !== "granted") p = await LN.requestPermissions();
    safeSet("cram-asked-notify", "yes");
    if (p.display === "granted") await syncPhoneReminders();
    return p.display === "granted";
  } catch {
    return false;
  }
}

async function syncPhoneReminders() {
  const LN = PHONE.LocalNotifications;
  if (!LN) return;
  phoneRemindersReady ||= LN.createChannel?.({
    id: "study", name: "Study reminders", description: "Study sessions and upcoming tests",
    importance: 4, vibration: true,
  }).catch(() => {});
  await phoneRemindersReady;
  const list = phoneReminderList();
  const perm = await LN.checkPermissions();
  if (perm.display !== "granted") {
    // Ask once, right after the first test is added, when it's clear why.
    if (list.length && perm.display === "prompt" && safeGet("cram-asked-notify") !== "yes") await askPhoneReminders();
    return;
  }
  const pending = await LN.getPending();
  if (pending.notifications?.length) await LN.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  if (!list.length) return;
  await LN.schedule({
    notifications: list.map((r) => ({
      id: r.id, title: r.title, body: r.body, extra: r.extra, channelId: "study",
      schedule: { at: r.at, allowWhileIdle: true },
    })),
  });
}

function schedulePhoneReminders() {
  if (!NATIVE) return;
  clearTimeout(phoneReminderTimer);
  phoneReminderTimer = setTimeout(() => { syncPhoneReminders().catch(() => {}); }, 800);
}

function openTestReminder(test) {
  const set = savedSets().find((x) => x.title === test.setTitle);
  if (set) {
    loadSet(set, set.kind);
    showView("boss");
    document.querySelector(".set").scrollIntoView({ behavior: "smooth", block: "start" });
  } else {
    studyFor({ testId: test.id });
  }
}

if (NATIVE) {
  // Tapping a notification opens the right game.
  PHONE.LocalNotifications?.addListener("localNotificationActionPerformed", ({ notification }) => {
    const extra = notification?.extra || {};
    if (extra.kind === "session") {
      const s = (player.sessions || []).find((x) => x.id === extra.id);
      if (s) studyFor(s);
    } else if (extra.kind === "test") {
      const t = (player.tests || []).find((x) => x.id === extra.id);
      if (t) openTestReminder(t);
    }
  });
  // Android's back button closes an open panel first, then leaves the app.
  PHONE.App?.addListener("backButton", () => {
    const open = document.querySelector("dialog[open]");
    if (open) { open.close(); return; }
    if (!$("reminder-pop").hidden) { $("reminder-pop").hidden = true; return; }
    PHONE.App.minimizeApp();
  });
  PHONE.App?.addListener("resume", () => { checkReminders(); schedulePhoneReminders(); });
  schedulePhoneReminders();
}

/* ----- Month calendar ----- */
const cal = { month: null, selected: null };
function renderCalendar() {
  const today = todayISO();
  cal.selected ||= today;
  if (!cal.month) { const n = new Date(); cal.month = new Date(n.getFullYear(), n.getMonth(), 1); }
  const year = cal.month.getFullYear();
  const month = cal.month.getMonth();
  $("cal-month").textContent = cal.month.toLocaleDateString([], { month: "long", year: "numeric" });
  const grid = $("cal-grid");
  grid.innerHTML = "";
  const start = new Date(year, month, 1 - new Date(year, month, 1).getDay()); // start on Sunday
  for (let i = 0; i < 7; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const head = el("span", "cal-dow", d.toLocaleDateString([], { weekday: "short" }).slice(0, 3));
    head.setAttribute("role", "columnheader");
    grid.append(head);
  }
  const tests = player.tests || [];
  const sessions = player.sessions || [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    if (i >= 35 && d.getMonth() !== month) break; // drop a 6th row that's all next month
    const iso = isoOf(d);
    const cell = el("button", "cal-cell");
    cell.type = "button";
    cell.setAttribute("role", "gridcell");
    if (d.getMonth() !== month) cell.classList.add("other");
    if (iso === today) cell.classList.add("today");
    if (iso === cal.selected) cell.classList.add("selected");
    if (iso < today) cell.classList.add("past");
    cell.append(el("span", "cal-num", String(d.getDate())));
    const dayTests = tests.filter((t) => t.date === iso);
    const daySessions = sessions.filter((s) => s.date === iso);
    const marks = el("span", "cal-marks");
    for (const t of dayTests) marks.append(el("span", "cal-chip chip-test", t.name));
    for (const s of daySessions) marks.append(el("span", `cal-chip chip-session${s.done ? " done" : ""}`, s.done ? "Studied" : `Study ${timeLabel(s)}`));
    cell.append(marks);
    const label = [prettyDate(iso), ...dayTests.map((t) => t.name), ...daySessions.map((s) => sessionTitle(s))].join(", ");
    cell.setAttribute("aria-label", label);
    cell.addEventListener("click", () => { cal.selected = iso; renderCalendar(); });
    grid.append(cell);
  }
  renderCalDay();
  renderNotifyBtn();
}

function renderCalDay() {
  const iso = cal.selected;
  const box = $("cal-day");
  box.innerHTML = "";
  const days = daysUntil(iso);
  box.append(el("h3", "cal-day-title", days === 0 ? `Today, ${prettyDate(iso)}` : prettyDate(iso)));
  const list = el("div", "cal-items");
  for (const t of (player.tests || []).filter((x) => x.date === iso)) {
    const row = el("div", "cal-item item-test");
    row.append(el("span", "cal-item-kind", "Test"), el("strong", "", t.name));
    const del = el("button", "test-remove", "×");
    del.type = "button";
    del.setAttribute("aria-label", `Remove ${t.name}`);
    del.addEventListener("click", () => {
      player.tests = player.tests.filter((x) => x.id !== t.id);
      player.sessions = (player.sessions || []).filter((x) => x.testId !== t.id);
      savePlayer(); renderCalendar(); renderTests(); renderReminders();
    });
    row.append(del);
    list.append(row);
  }
  for (const s of (player.sessions || []).filter((x) => x.date === iso).sort((a, b) => sessionTime(a) - sessionTime(b))) {
    const row = el("div", `cal-item item-session${s.done ? " done" : ""}`);
    row.append(el("span", "cal-item-kind", timeLabel(s)), el("strong", "", sessionTitle(s)));
    if (s.done) row.append(el("span", "done-tag", "Done"));
    else if (days === 0) {
      row.append(el("span", "done-tag pending-tag", `${sessionProgress()} / ${SESSION_GOAL}`));
    }
    const del = el("button", "test-remove", "×");
    del.type = "button";
    del.setAttribute("aria-label", `Remove ${sessionTitle(s)}`);
    del.addEventListener("click", () => {
      player.sessions = player.sessions.filter((x) => x.id !== s.id);
      savePlayer(); renderCalendar(); renderTests(); renderReminders();
    });
    row.append(del);
    list.append(row);
  }
  if (!list.children.length) list.append(el("p", "muted small", days < 0 ? "Nothing happened this day." : "Nothing planned yet."));
  box.append(list);
  if (days < 0) return;

  const forms = el("div", "cal-forms");
  const testForm = el("form", "cal-form");
  testForm.innerHTML = `<label class="label" for="cal-test-name">Add a test this day</label>
    <div class="cal-form-row"><input id="cal-test-name" class="text-input" maxlength="80" placeholder="Bio unit 4 test" autocomplete="off"><button class="btn" type="submit">Add test</button></div>`;
  testForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = testForm.querySelector("input").value.trim();
    if (!name) return testForm.querySelector("input").focus();
    addTest({ name: name.slice(0, 80), date: iso, source: "manual" });
    savePlayer(); fx.play("good"); renderCalendar(); renderTests(); renderReminders();
  });
  const sessionForm = el("form", "cal-form");
  sessionForm.innerHTML = `<label class="label" for="cal-session-time">Add a study session</label>
    <div class="cal-form-row"><input id="cal-session-time" class="text-input" type="time" value="19:00" aria-label="Start time">
    <select id="cal-session-test" class="test-select" aria-label="Which test"></select><button class="btn" type="submit">Add session</button></div>`;
  const pick = sessionForm.querySelector("select");
  pick.append(new Option("General study", ""));
  for (const t of upcomingTests().filter((x) => x.date >= iso)) pick.append(new Option(`For ${t.name}`, t.id));
  sessionForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const time = sessionForm.querySelector("input").value || "19:00";
    player.sessions ||= [];
    player.sessions.push({ id: newPlayerId(), testId: pick.value || null, title: "Study session", date: iso, time, done: false });
    savePlayer(); fx.play("good"); renderCalendar(); renderTests(); renderReminders();
  });
  forms.append(testForm, sessionForm);
  box.append(forms);
}

$("cal-prev").addEventListener("click", () => { cal.month = new Date(cal.month.getFullYear(), cal.month.getMonth() - 1, 1); renderCalendar(); });
$("cal-next").addEventListener("click", () => { cal.month = new Date(cal.month.getFullYear(), cal.month.getMonth() + 1, 1); renderCalendar(); });
$("open-calendar").addEventListener("click", () => openSheet("calendar"));

$("open-account").addEventListener("click", () => openSheet("account"));
renderAccountChip();
renderTests();
checkReminders();
setInterval(checkReminders, 20_000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkReminders(); });
getConfig().then((config) => {
  $("cal-connect").hidden = !config.googleClientId || NATIVE;
  $("cal-outlook").hidden = !config.microsoftClientId || NATIVE;
  finishMicrosoftLogin();
  if (!config.googleClientId && !config.microsoftClientId) return;
  pullSync().then(() => { renderAccountChip(); });
});
$("cal-outlook").addEventListener("click", () => microsoftLogin("calendar"));

/* ---------- Classroom: students join a class, teachers track progress ----------
   A teacher creates a class from their saved sets and shares a 6-character code.
   Students join with the code and a first name; the assigned sets appear in their
   saved sets, and quiz, boss and flashcard results on those sets go to the teacher. */
async function classApi(body) {
  const res = await fetch(API + "/api/classroom", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Couldn't reach the classroom. Check your connection.");
  return data;
}
async function classInfo(code) {
  const res = await fetch(`${API}/api/classroom?code=${encodeURIComponent(code)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Couldn't reach the classroom.");
  return data;
}

// Put the class's sets into the student's saved sets, tagged with the class.
function storeClassSets(info) {
  for (const set of [...info.sets].reverse()) {
    saveSet(set, "class", { classCode: info.code, className: info.className });
  }
}

/* ----- Sending results to the teacher ----- */
async function reportToClass(result) {
  if (!state.classCode) return;
  player.classQueue ||= [];
  player.classQueue.push({ ...result, code: state.classCode, setTitle: state.set.title });
  player.classQueue = player.classQueue.slice(-50);
  savePlayer();
  flushClassQueue();
}
let classFlushing = false;
async function flushClassQueue() {
  if (classFlushing || !player.classQueue?.length) return;
  classFlushing = true;
  while (player.classQueue.length) {
    const item = player.classQueue[0];
    try {
      await classApi({ action: "report", playerId: player.id, ...item });
    } catch (err) {
      // Wrong class or set removed: drop it. Network trouble: try again later.
      if (!/connection|reach|database|Slow down/i.test(err.message)) player.classQueue.shift();
      else break;
      continue;
    }
    player.classQueue.shift();
  }
  savePlayer();
  classFlushing = false;
}
let cardsReportTimer = 0;
function reportCardsSoon() {
  if (!state.classCode) return;
  clearTimeout(cardsReportTimer);
  cardsReportTimer = setTimeout(() => reportToClass({ kind: "cards", known: state.known.size, total: state.order.length }), 4000);
}

/* ----- The Classroom sheet ----- */
const classUi = { role: safeGet("cram-class-role") || "student", dashboard: null, setTitle: null, tab: "overview", student: null };

function roleSwitch() {
  const sw = el("div", "switch");
  sw.setAttribute("role", "tablist");
  for (const [id, label] of [["student", "I'm a student"], ["teacher", "I'm a teacher"]]) {
    const b = el("button", "tab", label);
    b.type = "button";
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(classUi.role === id));
    b.addEventListener("click", () => { classUi.role = id; classUi.dashboard = null; safeSet("cram-class-role", id); renderClassroom(); });
    sw.append(b);
  }
  return sw;
}

function playSet(title, view = "cards") {
  const set = savedSets().find((s) => s.title === title);
  if (!set) return;
  loadSet(set, set.kind);
  showView(view);
  $("classroom").close();
  document.querySelector(".set").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function renderStudent(body) {
  player.classes ||= [];
  for (const c of player.classes) {
    const card = el("div", "class-card");
    const head = el("div", "class-card-head");
    const title = el("div");
    title.append(el("h3", "class-name", c.name), el("p", "muted small", `${c.teacher}'s class, code ${c.code}`));
    const leave = el("button", "btn btn-quiet small-btn", "Leave class");
    leave.type = "button";
    leave.addEventListener("click", () => {
      // Leaving deletes your name and results from the teacher's dashboard too.
      classApi({ action: "leave", code: c.code, playerId: player.id }).catch(() => {});
      player.classes = player.classes.filter((x) => x.code !== c.code);
      savePlayer();
      renderClassroom();
    });
    head.append(title, leave);
    card.append(head);
    const list = el("div", "class-sets");
    for (const t of c.sets || []) {
      const row = el("div", "class-set");
      row.append(el("strong", "", t));
      const study = el("button", "btn small-btn", "Flashcards");
      study.type = "button";
      study.addEventListener("click", () => playSet(t, "cards"));
      const fight = el("button", "btn btn-primary small-btn", "Boss battle");
      fight.type = "button";
      fight.addEventListener("click", () => playSet(t, "boss"));
      row.append(study, fight);
      list.append(row);
    }
    card.append(list);
    card.append(el("p", "muted small", "Your quiz, boss battle and flashcard results on these sets are shared with your teacher."));
    body.append(card);
  }

  const form = el("form", "class-form");
  form.innerHTML = `
    <h3 class="sheet-sub">${player.classes.length ? "Join another class" : "Join your class"}</h3>
    <p class="muted small">Your teacher gives you a 6-character class code. Your teacher will see the first name you enter and your results on the sets they assign. <a href="privacy.html">Privacy Policy</a></p>
    <div class="cal-form-row">
      <input class="text-input code-input" id="class-code" maxlength="6" placeholder="Class code" aria-label="Class code" autocomplete="off">
      <input class="text-input" id="class-me" maxlength="30" placeholder="Your first name" aria-label="Your first name" autocomplete="given-name">
      <button class="btn btn-primary" type="submit">Join class</button>
    </div>
    <p class="status" id="class-status" role="status"></p>`;
  form.querySelector("#class-me").value = player.name || "";
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = form.querySelector("#class-status");
    status.className = "status";
    const code = form.querySelector("#class-code").value.trim();
    const name = form.querySelector("#class-me").value.trim();
    if (!code || !name) { status.classList.add("error"); status.textContent = "Type the class code and your name."; return; }
    status.textContent = "Joining…";
    try {
      const info = await classApi({ action: "join", code, playerId: player.id, name });
      player.name ||= name;
      player.classes = player.classes.filter((x) => x.code !== info.code);
      player.classes.push({ code: info.code, name: info.className, teacher: info.teacher, sets: info.sets.map((s) => s.title) });
      storeClassSets(info);
      savePlayer();
      fx.play("win");
      renderClassroom();
    } catch (err) {
      status.classList.add("error");
      status.textContent = err.message;
      fx.play("bad");
    }
  });
  body.append(form);
}

// Pick up sets the teacher added since the student joined.
async function refreshStudentClasses() {
  for (const c of player.classes || []) {
    try {
      const info = await classInfo(c.code);
      c.name = info.className;
      c.sets = info.sets.map((s) => s.title);
      storeClassSets(info);
    } catch { /* offline or class gone: keep what we have */ }
  }
  savePlayer();
}

function teacherCreateForm() {
  const sets = savedSets().filter((s) => s.kind !== "class");
  const form = el("form", "class-form");
  form.innerHTML = `
    <h3 class="sheet-sub">Create a class</h3>
    <div class="class-fields">
      <label class="label" for="new-class-name">Class name</label>
      <input class="text-input" id="new-class-name" maxlength="60" placeholder="Bio 11, period 2" autocomplete="off">
      <label class="label" for="new-class-teacher">Your name, as students know you</label>
      <input class="text-input" id="new-class-teacher" maxlength="40" placeholder="Ms. Lee" autocomplete="off">
    </div>
    <p class="label">Study sets to assign</p>
    <div class="class-pick"></div>
    <div class="maker-row"><p class="status" id="new-class-status" role="status"></p><button class="btn btn-primary" type="submit">Create class</button></div>`;
  const pick = form.querySelector(".class-pick");
  if (!sets.length) {
    pick.append(el("p", "muted small", "You don't have any study sets yet. Make one first (with AI, or Type my own), then come back here to assign it."));
    form.querySelector("button[type=submit]").disabled = true;
  }
  sets.forEach((s, i) => {
    const row = el("label", "cal-row");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.value = String(i);
    box.checked = i === 0;
    row.append(box, el("span", "", s.title), el("span", "muted small", `${s.cards.length} cards`));
    pick.append(row);
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = form.querySelector("#new-class-status");
    status.className = "status";
    const chosen = [...pick.querySelectorAll("input:checked")].map((b) => sets[Number(b.value)]);
    status.textContent = "Creating…";
    try {
      const info = await classApi({
        action: "create",
        className: form.querySelector("#new-class-name").value,
        teacherName: form.querySelector("#new-class-teacher").value,
        sets: chosen.map(({ title, cards, quiz: q }) => ({ title, cards, quiz: q })),
      });
      player.teaching ||= [];
      player.teaching.push({ code: info.code, key: info.teacherKey, name: info.className });
      savePlayer();
      fx.play("win");
      confetti(60);
      openDashboard(info.code);
    } catch (err) {
      status.classList.add("error");
      status.textContent = err.message;
      fx.play("bad");
    }
  });
  return form;
}

function renderTeacher(body) {
  player.teaching ||= [];
  if (player.teaching.length) {
    const list = el("div", "class-list");
    list.append(el("h3", "sheet-sub", "Your classes"));
    for (const c of player.teaching) {
      const row = el("button", "class-open");
      row.type = "button";
      row.append(el("strong", "", c.name), el("span", "class-code-tag", c.code));
      row.addEventListener("click", () => openDashboard(c.code));
      list.append(row);
    }
    body.append(list);
  } else {
    body.append(el("p", "", "Create a class, assign study sets, and share the code with your students. You'll see each student's quiz scores, boss battles and flashcard progress, plus the questions your class misses most."));
  }
  body.append(teacherCreateForm());
}

async function openDashboard(code) {
  const mine = (player.teaching || []).find((c) => c.code === code);
  if (!mine) return;
  if (classUi.dashboard?.code !== code) { classUi.student = null; classUi.tab = "overview"; }
  classUi.role = "teacher";
  const body = $("class-body");
  body.innerHTML = '<p class="muted">Loading your class…</p>';
  try {
    classUi.dashboard = await classApi({ action: "dashboard", code, teacherKey: mine.key });
    mine.name = classUi.dashboard.className;
    if (!classUi.dashboard.sets.some((s) => s.title === classUi.setTitle)) classUi.setTitle = classUi.dashboard.sets[0]?.title;
  } catch (err) {
    body.innerHTML = "";
    body.append(el("p", "status error", err.message));
    const back = el("button", "btn", "Back");
    back.type = "button";
    back.addEventListener("click", () => { classUi.dashboard = null; renderClassroom(); });
    const forget = el("button", "btn btn-quiet", "Remove this class from my list");
    forget.type = "button";
    forget.addEventListener("click", () => { player.teaching = player.teaching.filter((c) => c.code !== code); savePlayer(); classUi.dashboard = null; renderClassroom(); });
    body.append(el("div", "maker-row"));
    body.lastChild.append(back, forget);
    return;
  }
  renderDashboard();
}

function ago(ms) {
  if (!ms) return "Not yet";
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 2) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}

/* ----- Charts for the teacher dashboard (plain SVG, no libraries) ----- */
const SVG_NS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}
function niceMax(v) {
  if (v <= 4) return Math.max(1, Math.ceil(v));
  const step = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / step) * step;
}
function chartTip(wrap) {
  let tip = wrap.querySelector(".chart-tip");
  if (!tip) { tip = el("div", "chart-tip"); tip.hidden = true; wrap.append(tip); }
  return tip;
}
function showTip(wrap, x, y, valueText, labelText, color) {
  const tip = chartTip(wrap);
  tip.innerHTML = "";
  const v = el("strong", "", valueText);
  if (color) { const key = el("span", "tip-key"); key.style.background = color; tip.append(key); }
  tip.append(v, el("span", "", labelText));
  tip.hidden = false;
  const box = wrap.getBoundingClientRect();
  const left = Math.min(Math.max(x, 70), box.width - 70);
  tip.style.left = `${left}px`;
  tip.style.top = `${Math.max(0, y - 8)}px`;
}
function hideTip(wrap) { const tip = wrap.querySelector(".chart-tip"); if (tip) tip.hidden = true; }

// Vertical bars, one series. data = [{ label, short, value, tip }]
function barChart(data, { name }) {
  const W = 360, H = 170, L = 30, R = 6, T = 10, B = 24;
  const wrap = el("div", "chart");
  const max = niceMax(Math.max(...data.map((d) => d.value), 1));
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "group", "aria-label": name });
  const y = (v) => T + (H - T - B) * (1 - v / max);
  for (const g of [0, max / 2, max]) {
    if (g !== Math.round(g)) continue;
    svg.append(svgEl("line", { x1: L, x2: W - R, y1: y(g), y2: y(g), class: g === 0 ? "axis" : "grid" }));
    const t = svgEl("text", { x: L - 6, y: y(g) + 4, class: "tick", "text-anchor": "end" });
    t.textContent = String(g);
    svg.append(t);
  }
  const band = (W - L - R) / data.length;
  const bw = Math.min(34, band * 0.7);
  const every = data.length > 8 ? 2 : 1;
  data.forEach((d, i) => {
    const cx = L + band * i + band / 2;
    const g = svgEl("g", { class: "bar", tabindex: "0", role: "img", "aria-label": `${d.label}: ${d.value}` });
    const top = y(d.value);
    const base = y(0);
    if (d.value > 0) {
      const r = Math.min(4, (base - top) / 2, bw / 2);
      const x0 = cx - bw / 2;
      g.append(svgEl("path", {
        class: "bar-fill",
        d: `M${x0},${base} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + bw - r} Q${x0 + bw},${top} ${x0 + bw},${top + r} V${base} Z`,
      }));
    }
    g.append(svgEl("rect", { class: "hit", x: L + band * i, y: T, width: band, height: H - T - B }));
    if (i % every === (data.length - 1) % every) {
      const t = svgEl("text", { x: cx, y: H - 7, class: "tick", "text-anchor": "middle" });
      t.textContent = d.short ?? d.label;
      g.append(t);
    }
    const show = () => {
      const s = svg.getBoundingClientRect();
      showTip(wrap, (cx / W) * s.width, (top / H) * s.height, String(d.value), `${d.label}: ${d.tip}`);
    };
    g.addEventListener("pointerenter", show);
    g.addEventListener("focus", show);
    g.addEventListener("pointerleave", () => hideTip(wrap));
    g.addEventListener("blur", () => hideTip(wrap));
    svg.append(g);
  });
  wrap.append(svg);
  return wrap;
}

// Score over time for one student: quiz % and boss battle accuracy, one point per game.
function scoreChart(attempts) {
  const wrap = el("div", "chart");
  const games = [...attempts].sort((a, b) => a.t - b.t).slice(-40);
  if (games.length < 2) {
    wrap.append(el("p", "muted small chart-empty", "The chart appears after 2 or more quiz or boss games on this set."));
    return wrap;
  }
  const W = 660, H = 250, L = 40, R = 52, T = 12, B = 24;
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", tabindex: "0",
    "aria-label": `Scores over ${games.length} games. Use the arrow keys to read each game.` });
  const x = (i) => L + ((W - L - R) * i) / (games.length - 1);
  const y = (v) => T + (H - T - B) * (1 - v / 100);
  for (const g of [0, 50, 100]) {
    svg.append(svgEl("line", { x1: L, x2: W - R, y1: y(g), y2: y(g), class: g === 0 ? "axis" : "grid" }));
    const t = svgEl("text", { x: L - 6, y: y(g) + 4, class: "tick", "text-anchor": "end" });
    t.textContent = `${g}%`;
    svg.append(t);
  }
  const first = svgEl("text", { x: L, y: H - 6, class: "tick", "text-anchor": "start" });
  first.textContent = "First game";
  const last = svgEl("text", { x: W - R, y: H - 6, class: "tick", "text-anchor": "end" });
  last.textContent = "Latest";
  svg.append(first, last);
  const cross = svgEl("line", { class: "crosshair", y1: T, y2: H - B, visibility: "hidden" });
  svg.append(cross);
  const series = [
    { kind: "quiz", name: "Quiz score", short: "Quiz", cls: "s-quiz" },
    { kind: "boss", name: "Boss accuracy", short: "Boss", cls: "s-boss" },
  ];
  for (const s of series) {
    const pts = games.map((g, i) => ({ g, i })).filter(({ g }) => g.kind === s.kind);
    if (!pts.length) continue;
    if (pts.length > 1) svg.append(svgEl("polyline", { class: `line ${s.cls}`, points: pts.map(({ g, i }) => `${x(i)},${y(g.pct)}`).join(" ") }));
    for (const { g, i } of pts) svg.append(svgEl("circle", { class: `dot ${s.cls}`, cx: x(i), cy: y(g.pct), r: 4 }));
    const end = pts[pts.length - 1];
    const label = svgEl("text", { x: x(end.i) + 8, y: y(end.g.pct) + 4, class: "direct-label" });
    label.textContent = s.short;
    svg.append(label);
  }
  const colorOf = (kind) => getComputedStyle(document.documentElement).getPropertyValue(kind === "quiz" ? "--chart-quiz" : "--chart-boss").trim();
  let focusIdx = games.length - 1;
  const point = (i) => {
    focusIdx = i;
    const g = games[i];
    cross.setAttribute("x1", x(i));
    cross.setAttribute("x2", x(i));
    cross.setAttribute("visibility", "visible");
    const s = svg.getBoundingClientRect();
    const when = new Date(g.t).toLocaleDateString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const what = g.kind === "quiz" ? "Quiz score" : `Boss accuracy${g.won ? ", won" : ", lost"}`;
    showTip(wrap, (x(i) / W) * s.width, (y(g.pct) / H) * s.height, `${g.pct}%`, `${what}, game ${i + 1}, ${when}`, colorOf(g.kind));
  };
  svg.addEventListener("pointermove", (e) => {
    const s = svg.getBoundingClientRect();
    const px = ((e.clientX - s.left) / s.width) * W;
    const i = Math.round(((px - L) / (W - L - R)) * (games.length - 1));
    point(Math.max(0, Math.min(games.length - 1, i)));
  });
  svg.addEventListener("pointerleave", () => { cross.setAttribute("visibility", "hidden"); hideTip(wrap); });
  svg.addEventListener("focus", () => point(focusIdx));
  svg.addEventListener("blur", () => { cross.setAttribute("visibility", "hidden"); hideTip(wrap); });
  svg.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      point(Math.max(0, Math.min(games.length - 1, focusIdx + (e.key === "ArrowRight" ? 1 : -1))));
    }
  });
  const legend = el("div", "chart-legend");
  for (const s of series) {
    if (!games.some((g) => g.kind === s.kind)) continue;
    const item = el("span", "legend-item");
    item.append(el("span", `legend-line ${s.cls}`), s.name);
    legend.append(item);
  }
  wrap.append(legend, svg);
  return wrap;
}

// Questions as horizontal bars of "% wrong".
function renderQuestionBars(body, questions, limit) {
  if (!questions.length) {
    body.append(el("p", "muted", "Nothing yet. These show up once students start playing."));
    return;
  }
  const list = el("ol", "qbars");
  for (const q of questions.slice(0, limit)) {
    const li = el("li");
    const top = el("div", "qbar-top");
    top.append(el("span", "qbar-q", q.prompt), el("strong", "qbar-pct", `${q.rate}% wrong`));
    const track = el("div", "qbar-track");
    const fill = el("span", "qbar-fill");
    fill.style.width = `${Math.max(2, q.rate)}%`;
    track.append(fill);
    li.append(top, track, el("span", "muted small", `Wrong ${q.count} of ${q.asked} time${q.asked === 1 ? "" : "s"} asked`));
    list.append(li);
  }
  body.append(list);
}

function renderStudentTable(body, rows, d, mine) {
  if (!rows.length) {
    body.append(el("p", "muted", "No students yet. Share the class code to get started."));
    return;
  }
  body.append(el("p", "muted small", "Click a name to see that student's scores over time and the questions they miss."));
  const wrap = el("div", "table-wrap");
  const table = el("table", "dash-table");
  table.innerHTML = "<thead><tr><th>Name</th><th>Games</th><th>Best quiz</th><th>Boss battle</th><th>Flashcards</th><th>Last active</th><th><span class=\"sr-only\">Remove</span></th></tr></thead>";
  const tbody = el("tbody");
  rows.sort((a, b) => (b.p?.last || 0) - (a.p?.last || 0) || a.name.localeCompare(b.name));
  for (const r of rows) {
    const tr = el("tr");
    const p = r.p;
    const nameTd = el("td", "name");
    const nameBtn = el("button", "link-btn", r.name);
    nameBtn.type = "button";
    nameBtn.addEventListener("click", () => { classUi.student = r.id; renderDashboard(); });
    nameTd.append(nameBtn);
    tr.append(nameTd);
    const quizCell = p?.quizBest != null ? `${p.quizBest}%` : "–";
    const bossCell = !p?.bossFights ? "–"
      : p.bossWins ? `Won${p.bossWins > 1 ? ` ×${p.bossWins}` : ""}, best ${Math.round(p.bestBossTime)}s`
      : `${p.bossFights} ${p.bossFights === 1 ? "try" : "tries"}, ${p.bestAccuracy}% right`;
    const cardsCell = p?.cardsTotal ? `${p.cardsKnown} / ${p.cardsTotal}` : "–";
    for (const [text, cls] of [[String(r.attempts.length), "num"], [quizCell, p?.quizBest >= 80 ? "good" : p?.quizBest != null && p.quizBest < 50 ? "low" : ""], [bossCell, p?.bossWins ? "good" : ""], [cardsCell, ""], [ago(p?.last), "muted"]]) {
      tr.append(el("td", cls, text));
    }
    const td = el("td");
    const del = el("button", "test-remove", "×");
    del.type = "button";
    del.setAttribute("aria-label", `Remove ${r.name} from the class`);
    del.addEventListener("click", async () => {
      try { await classApi({ action: "removeStudent", code: d.code, teacherKey: mine.key, playerId: r.id }); } catch { /* ignore */ }
      openDashboard(d.code);
    });
    td.append(del);
    tr.append(td);
    tbody.append(tr);
  }
  table.append(tbody);
  wrap.append(table);
  body.append(wrap);
}

function renderStudentDetail(body, r) {
  const back = el("button", "btn btn-quiet small-btn", "‹ All students");
  back.type = "button";
  back.addEventListener("click", () => { classUi.student = null; classUi.tab = "students"; renderDashboard(); });
  body.append(back);
  body.append(el("h3", "student-name", r.name));
  const p = r.p || {};
  const quizGames = r.attempts.filter((a) => a.kind === "quiz");
  const bossGames = r.attempts.filter((a) => a.kind === "boss");
  const avg = (list) => list.length ? `${Math.round(list.reduce((n, a) => n + a.pct, 0) / list.length)}%` : "–";
  const stats = el("div", "stats dash-stats");
  [
    [String(r.attempts.length), "Games played"],
    [p.quizBest != null ? `${p.quizBest}%` : "–", `Best quiz (average ${avg(quizGames)})`],
    [bossGames.length ? `${bossGames.filter((g) => g.won).length} / ${bossGames.length}` : "–", "Boss fights won"],
    [p.cardsTotal ? `${p.cardsKnown} / ${p.cardsTotal}` : "–", "Flashcards known"],
  ].forEach(([v, l]) => { const b = el("div"); b.append(el("strong", "", v), el("span", "", l)); stats.append(b); });
  body.append(stats);

  const chart = el("figure", "chart-card");
  chart.append(el("figcaption", "chart-title", "Scores over time"));
  chart.append(scoreChart(r.attempts));
  body.append(chart);

  body.append(el("h3", "sheet-sub", `Questions ${r.name} gets wrong`));
  if (!r.misses.length) body.append(el("p", "muted", r.attempts.length ? "None so far. Nice." : "Nothing yet."));
  else {
    const list = el("ol", "trouble");
    const max = r.misses[0].count;
    for (const m of r.misses.slice(0, 10)) {
      const li = el("li");
      const bar = el("span", "trouble-bar");
      bar.style.width = `${Math.max(8, (m.count / max) * 100)}%`;
      li.append(el("span", "trouble-q", m.prompt), el("span", "trouble-n", `wrong ${m.count}×`), bar);
      list.append(li);
    }
    body.append(list);
  }

  if (r.attempts.length) {
    body.append(el("h3", "sheet-sub", "Recent games"));
    const recent = el("ul", "recent");
    for (const a of [...r.attempts].sort((x, y) => y.t - x.t).slice(0, 8)) {
      const li = el("li");
      const when = new Date(a.t).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
      li.append(el("span", `recent-kind k-${a.kind}`, a.kind === "quiz" ? "Quiz" : "Boss"),
        el("strong", "", a.kind === "quiz" ? `${a.pct}%` : `${a.won ? "Won" : "Lost"}, ${a.pct}% right`),
        el("span", "muted small", when));
      recent.append(li);
    }
    body.append(recent);
  }
}

function renderDashboard() {
  const d = classUi.dashboard;
  const mine = player.teaching.find((c) => c.code === d.code);
  const body = $("class-body");
  body.innerHTML = "";

  const top = el("div", "dash-head");
  const back = el("button", "btn btn-quiet small-btn", "‹ All classes");
  back.type = "button";
  back.addEventListener("click", () => { classUi.dashboard = null; classUi.student = null; classUi.tab = "overview"; renderClassroom(); });
  const refresh = el("button", "btn small-btn", "Refresh");
  refresh.type = "button";
  refresh.addEventListener("click", () => openDashboard(d.code));
  top.append(back, refresh);
  body.append(top);

  const hero = el("div", "dash-hero");
  const names = el("div");
  names.append(el("h3", "class-name", d.className), el("p", "muted small", `${d.teacher}'s class`));
  const codeBox = el("div", "dash-code");
  codeBox.append(el("span", "small", "Class code"), el("strong", "", d.code));
  const copy = el("button", "btn small-btn", "Copy code");
  copy.type = "button";
  copy.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(d.code); copy.textContent = "Copied"; } catch { copy.textContent = d.code; }
    setTimeout(() => { copy.textContent = "Copy code"; }, 1500);
  });
  codeBox.append(copy);
  hero.append(names, codeBox);
  body.append(hero);
  const joinLink = `${SITE}/?class=${d.code}`;
  const share = el("div", "share-row");
  const teams = el("a", "btn teams-btn");
  teams.href = "https://teams.microsoft.com/share?" + new URLSearchParams({
    href: joinLink,
    msgText: `Join our Cram Arcade class "${d.className}": open the link, or go to Classroom and type the code ${d.code}.`,
    preview: "true",
  });
  teams.target = "_blank";
  teams.rel = "noopener";
  teams.innerHTML = `<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="1" y="4" width="12" height="12" rx="2" fill="#5059c9"/><path d="M4 7.5h6M7 7.5V13" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><circle cx="15.5" cy="5.5" r="2.5" fill="#7b83eb"/><rect x="13" y="9" width="6" height="7" rx="2" fill="#7b83eb"/></svg><span>Share to Teams</span>`;
  const copyLink = el("button", "btn small-btn", "Copy join link");
  copyLink.type = "button";
  copyLink.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(joinLink); copyLink.textContent = "Link copied"; } catch { copyLink.textContent = joinLink; }
    setTimeout(() => { copyLink.textContent = "Copy join link"; }, 1800);
  });
  share.append(teams, copyLink);
  body.append(share);
  body.append(el("p", "muted small", "Students click the link (it fills in the code), or open Classroom, choose \"I'm a student\", and type the code."));

  if (d.sets.length > 1) {
    const pickRow = el("div", "dash-set-pick");
    const label = el("label", "label", "Showing results for");
    label.htmlFor = "dash-set";
    const pick = document.createElement("select");
    pick.id = "dash-set";
    pick.className = "test-select";
    for (const s of d.sets) pick.append(new Option(s.title, s.title, false, s.title === classUi.setTitle));
    pick.addEventListener("change", () => { classUi.setTitle = pick.value; renderDashboard(); });
    pickRow.append(label, pick);
    body.append(pickRow);
  }
  const setTitle = classUi.setTitle;
  const rows = d.students.map((s) => ({
    ...s,
    p: s.progress[setTitle] || null,
    attempts: (s.history || []).filter((h) => h.set === setTitle),
    misses: (s.missed || []).filter((m) => m.set === setTitle),
  }));
  const questions = d.trouble.filter((t) => t.set === setTitle);

  // A single student's page
  const student = classUi.student && rows.find((r) => r.id === classUi.student);
  if (student) {
    renderStudentDetail(body, student);
    return;
  }
  classUi.student = null;

  // Tabs
  const tabs = el("div", "switch dash-tabs");
  tabs.setAttribute("role", "tablist");
  for (const [id, label] of [["overview", "Overview"], ["students", `Students (${rows.length})`], ["questions", "Questions"]]) {
    const t = el("button", "tab", label);
    t.type = "button";
    t.setAttribute("role", "tab");
    t.setAttribute("aria-selected", String(classUi.tab === id));
    t.addEventListener("click", () => { classUi.tab = id; renderDashboard(); });
    tabs.append(t);
  }
  body.append(tabs);

  if (classUi.tab === "students") {
    renderStudentTable(body, rows, d, mine);
  } else if (classUi.tab === "questions") {
    body.append(el("p", "muted small", "Every question students have answered in the quiz and boss battle, hardest first. \"% wrong\" is out of all the times it was asked."));
    renderQuestionBars(body, questions, 100);
  } else {
    // Overview
    const played = rows.filter((r) => r.p);
    const quizScores = played.map((r) => r.p.quizBest).filter((v) => v != null);
    const stats = el("div", "stats dash-stats");
    [
      [String(d.students.length), "Students joined"],
      [String(played.length), `Played ${d.sets.length > 1 ? "this set" : "so far"}`],
      [quizScores.length ? `${Math.round(quizScores.reduce((a, b) => a + b, 0) / quizScores.length)}%` : "–", "Average best quiz"],
      [String(played.filter((r) => r.p.bossWins > 0).length), "Beat the boss"],
    ].forEach(([v, l]) => { const b = el("div"); b.append(el("strong", "", v), el("span", "", l)); stats.append(b); });
    body.append(stats);

    const charts = el("div", "dash-charts");
    // Activity: quiz and boss attempts per day, last 14 days
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - i);
      days.push(day);
    }
    const perDay = days.map((day) => {
      const next = day.getTime() + 86_400_000;
      const count = rows.reduce((n, r) => n + r.attempts.filter((h) => h.t >= day.getTime() && h.t < next).length, 0);
      const label = day.toLocaleDateString([], { month: "short", day: "numeric" });
      return { label, short: String(day.getDate()), value: count, tip: `${count} game${count === 1 ? "" : "s"} played` };
    });
    const activity = el("figure", "chart-card");
    activity.append(el("figcaption", "chart-title", "Games played, last 14 days"));
    activity.append(barChart(perDay, { name: "Games played per day" }));
    charts.append(activity);

    // Distribution of best quiz scores
    const buckets = [["Under 50%", 0, 49], ["50–69%", 50, 69], ["70–84%", 70, 84], ["85–100%", 85, 100]].map(([label, lo, hi]) => {
      const who = rows.filter((r) => r.p?.quizBest != null && r.p.quizBest >= lo && r.p.quizBest <= hi);
      return { label, short: label, value: who.length, tip: who.length ? who.map((r) => r.name).join(", ") : "No students" };
    });
    const dist = el("figure", "chart-card");
    dist.append(el("figcaption", "chart-title", "Students by best quiz score"));
    dist.append(barChart(buckets, { name: "Students by best quiz score", integer: true }));
    charts.append(dist);
    body.append(charts);

    const head = el("div", "section-head");
    head.append(el("h3", "sheet-sub", "Trouble spots"));
    if (questions.length > 5) {
      const all = el("button", "link-btn", "See all questions");
      all.type = "button";
      all.addEventListener("click", () => { classUi.tab = "questions"; renderDashboard(); });
      head.append(all);
    }
    body.append(head);
    renderQuestionBars(body, questions, 5);
  }

  if (classUi.tab !== "overview") {
    if (d.database === "test") body.append(el("p", "muted small test-note", "Test mode: this class only lives on this computer until the server restarts."));
    return;
  }

  // Assigned sets
  body.append(el("h3", "sheet-sub", "Assigned sets"));
  const setsBox = el("div", "class-sets");
  for (const s of d.sets) {
    const row = el("div", "class-set");
    row.append(el("strong", "", s.title), el("span", "muted small", `${s.cards.length} cards`));
    if (d.sets.length > 1) {
      const rm = el("button", "btn btn-quiet small-btn", "Unassign");
      rm.type = "button";
      rm.addEventListener("click", async () => {
        try { await classApi({ action: "removeSet", code: d.code, teacherKey: mine.key, setTitle: s.title }); } catch { /* ignore */ }
        openDashboard(d.code);
      });
      row.append(rm);
    }
    setsBox.append(row);
  }
  body.append(setsBox);
  const extra = savedSets().filter((s) => s.kind !== "class" && !d.sets.some((x) => x.title === s.title));
  if (extra.length) {
    const addRow = el("div", "cal-form-row");
    const pick = document.createElement("select");
    pick.className = "test-select";
    pick.setAttribute("aria-label", "Study set to assign");
    for (const s of extra) pick.append(new Option(s.title, s.title));
    const add = el("button", "btn small-btn", "Assign this set");
    add.type = "button";
    add.addEventListener("click", async () => {
      const set = extra.find((s) => s.title === pick.value);
      try {
        await classApi({ action: "addSet", code: d.code, teacherKey: mine.key, set: { title: set.title, cards: set.cards, quiz: set.quiz } });
        classUi.setTitle = set.title;
        fx.play("good");
      } catch (err) { alertLine(body, err.message); return; }
      openDashboard(d.code);
    });
    addRow.append(pick, add);
    body.append(addRow);
  }

  if (d.database === "test") {
    body.append(el("p", "muted small test-note", "Test mode: this class only lives on this computer until the server restarts. Connect the database when the site is online so students can join from their own devices."));
  }

  // Deleting a class removes it and all student names and results, for good.
  const danger = el("div", "danger-zone");
  const del = el("button", "btn btn-quiet small-btn", "Delete this class");
  del.type = "button";
  del.addEventListener("click", () => {
    danger.innerHTML = "";
    danger.append(el("p", "small", `Delete ${d.className}? Every student's name and results are deleted for good, and the code stops working.`));
    const row = el("div", "maker-row");
    const yes = el("button", "btn btn-danger small-btn", "Delete class");
    yes.type = "button";
    const no = el("button", "btn btn-quiet small-btn", "Keep it");
    no.type = "button";
    no.addEventListener("click", () => renderDashboard());
    yes.addEventListener("click", async () => {
      yes.disabled = true;
      try {
        const mine = (player.teaching || []).find((c) => c.code === d.code);
        await classApi({ action: "deleteClass", code: d.code, teacherKey: mine?.key });
        player.teaching = player.teaching.filter((c) => c.code !== d.code);
        savePlayer();
        classUi.dashboard = null;
        renderClassroom();
        ticketToastText(`Deleted ${d.className}.`);
      } catch (err) {
        yes.disabled = false;
        danger.append(el("p", "status error", err.message));
      }
    });
    row.append(yes, no);
    danger.append(row);
  });
  danger.append(del);
  body.append(danger);
}
function alertLine(body, text) {
  body.append(el("p", "status error", text));
}

async function renderClassroom() {
  const body = $("class-body");
  if (classUi.dashboard) { renderDashboard(); return; }
  body.innerHTML = "";
  body.append(roleSwitch());
  if (classUi.role === "teacher") renderTeacher(body);
  else await renderStudent(body);
}

// A join link like /?class=ABC123 opens Classroom with the code filled in.
function openJoinLink() {
  const params = new URLSearchParams(location.search);
  const code = (params.get("class") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  if (!code) return;
  history.replaceState(null, "", location.pathname);
  classUi.role = "student";
  classUi.dashboard = null;
  openSheet("classroom");
  setTimeout(() => {
    const input = $("class-code");
    if (!input) return;
    input.value = code;
    ($("class-me").value ? input.closest("form").querySelector("button[type=submit]") : $("class-me")).focus();
  }, 50);
}
openJoinLink();

$("open-class").addEventListener("click", async () => {
  openSheet("classroom");
  // A teacher coming back sees fresh numbers, not the ones from when they last looked.
  if (classUi.dashboard) { openDashboard(classUi.dashboard.code); return; }
  if ((player.classes || []).length) { await refreshStudentClasses(); if (!classUi.dashboard) renderClassroom(); }
});
flushClassQueue();

function openSheet(id) {
  const sheet = $(id);
  if (id === "shop") renderShop();
  if (id === "crew") renderCrew(true);
  if (id === "account") renderAccount();
  if (id === "calendar") renderCalendar();
  if (id === "classroom") renderClassroom();
  if (sheet.showModal) sheet.showModal(); else sheet.setAttribute("open", "");
  markTab(id);
  fx.play("click");
}
$("open-shop").addEventListener("click", () => openSheet("shop"));
$("open-crew").addEventListener("click", () => openSheet("crew"));
$("ticket-count").addEventListener("click", () => openSheet("shop"));
$("nav-calendar").addEventListener("click", () => openSheet("calendar"));
$("go-home").addEventListener("click", () => { scrollTo({ top: 0, behavior: "smooth" }); fx.play("click"); });

// The tab bar highlights whichever panel is open, and Home otherwise.
function markTab(sheetId) {
  const tabs = [...document.querySelectorAll(".tab-btn")];
  if (sheetId && !tabs.some((b) => b.dataset.sheet === sheetId)) sheetId = null; // not a tab: stay on Home
  tabs.forEach((b) => {
    const on = sheetId ? b.dataset.sheet === sheetId : b.id === "go-home";
    if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
}
document.querySelectorAll(".sheet").forEach((sheet) => {
  sheet.querySelector("[data-close]").addEventListener("click", () => sheet.close());
  sheet.addEventListener("click", (e) => { if (e.target === sheet) sheet.close(); }); // click outside to close
  sheet.addEventListener("close", () => { if (!document.querySelector("dialog[open]")) markTab(null); });
});
renderTickets();
flushScores();

/* ---------- Loading a set ---------- */
const KIND_LABELS = { example: "Example set", ai: "Your AI study set", own: "Your own set" };
function loadSet(set, kind) {
  state.set = { ...set, quiz: set.quiz && set.quiz.length ? set.quiz : shuffle(cardQuestions(set.cards)).slice(0, 8) };
  state.order = set.cards.map((_, i) => i);
  state.index = 0;
  state.known.clear();
  state.learning.clear();
  state.deckAwarded = false;
  state.classCode = set.classCode || null; // results from class sets go to the teacher
  $("set-title").textContent = set.title;
  // A plain line under the title says where the set came from and how big it is.
  const source = kind === "class" ? `From ${set.className || "your class"}` : KIND_LABELS[kind] || "Study set";
  const quizCount = (set.quiz || []).length;
  $("set-kind").textContent = `${source}, with ${set.cards.length} flashcards${quizCount ? ` and ${quizCount} quiz questions` : ""}`;
  renderCard();
  startQuiz();
  newMatchRound();
  renderBossIntro();
}

/* ---------- Tabs ---------- */
document.querySelectorAll(".tab[data-view]").forEach((tab) => {
  tab.addEventListener("click", () => showView(tab.dataset.view));
});
// The big Play button: straight into a boss battle with the current set.
document.getElementById("hud-play")?.addEventListener("click", () => {
  $("tab-boss").click();
  document.querySelector(".set").scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
});

function showView(view) {
  document.querySelectorAll(".tab[data-view]").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.view === view)));
  ["cards", "quiz", "match", "boss"].forEach((v) => { $("view-" + v).hidden = v !== view; });
  if (view !== "boss" && boss.active) renderBossIntro(); // leaving mid-fight ends the fight
}

/* ---------- Flashcards ---------- */
function renderCard(direction = 0) {
  const card = state.set.cards[state.order[state.index]];
  const fc = $("flashcard");
  fc.classList.remove("flipped");
  $("card-front").textContent = card.front;
  $("card-back").textContent = card.back;
  $("card-pos").textContent = `${state.index + 1} / ${state.order.length}`;
  $("known-count").textContent = state.known.size;
  $("learning-count").textContent = state.learning.size;
  if (direction) replay(fc, direction > 0 ? "enter-right" : "enter-left", 320);
}
function moveCard(step) {
  state.index = (state.index + step + state.order.length) % state.order.length;
  renderCard(step);
}
function flipCard() {
  $("flashcard").classList.toggle("flipped");
  fx.play("flip");
}
function markCard(known) {
  logStudy();
  const id = state.order[state.index];
  (known ? state.learning : state.known).delete(id);
  (known ? state.known : state.learning).add(id);
  fx.play(known ? "good" : "click");
  replay($(known ? "known-btn" : "learning-btn"), "pulse", 400);
  replay($("tally"), "bump", 300);
  reportCardsSoon();
  if (known && state.known.size === state.order.length && !state.deckAwarded) {
    state.deckAwarded = true;
    confetti();
    fx.play("win");
    award(20, "for knowing every card", "cards");
  }
  moveCard(1);
}
$("flashcard").addEventListener("click", flipCard);
$("prev-card").addEventListener("click", () => moveCard(-1));
$("next-card").addEventListener("click", () => moveCard(1));
$("known-btn").addEventListener("click", () => markCard(true));
$("learning-btn").addEventListener("click", () => markCard(false));
$("shuffle-btn").addEventListener("click", () => {
  state.order = shuffle(state.order);
  state.index = 0;
  renderCard(1);
  fx.play("flip");
});
document.addEventListener("keydown", (e) => {
  if ($("view-cards").hidden || e.target.matches("textarea, input")) return;
  if (e.key === " ") { e.preventDefault(); flipCard(); }
  if (e.key === "ArrowRight") moveCard(1);
  if (e.key === "ArrowLeft") moveCard(-1);
});

/* ---------- Quiz ---------- */
const quiz = { i: 0, score: 0 };
function startQuiz() { quiz.i = 0; quiz.score = 0; quiz.missed = []; renderQuestion(); }

function renderQuestion() {
  const body = $("quiz-body");
  const questions = state.set.quiz;
  body.innerHTML = "";
  if (!questions.length) {
    body.innerHTML = '<p class="muted">This set has no quiz questions.</p>';
    return;
  }
  if (quiz.i >= questions.length) return renderQuizResult();

  const q = questions[quiz.i];
  const card = document.createElement("div");
  card.className = "quiz-card";
  card.innerHTML = `
    <div class="progress"><span style="width:${(quiz.i / questions.length) * 100}%"></span></div>
    <div class="quiz-meta mono"><span>Question ${quiz.i + 1} of ${questions.length}</span><span>Score ${quiz.score}</span></div>
    <p class="quiz-q"></p>
    <div class="options"></div>
    <p class="feedback" aria-live="polite"></p>`;
  card.querySelector(".quiz-q").textContent = q.question;
  const opts = card.querySelector(".options");
  q.options.forEach((text, n) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "option";
    b.id = `opt-${n}`;
    b.innerHTML = `<span class="letter">${"ABCD"[n]}</span><span></span>`;
    b.lastChild.textContent = text;
    b.addEventListener("click", () => answer(n, card));
    opts.append(b);
  });
  body.append(card);
}

function answer(choice, card) {
  logStudy();
  const q = state.set.quiz[quiz.i];
  const buttons = card.querySelectorAll(".option");
  buttons.forEach((b, n) => {
    b.disabled = true;
    if (n === q.answer) b.classList.add("correct");
    else if (n === choice) b.classList.add("wrong");
  });
  const right = choice === q.answer;
  if (right) quiz.score++;
  else quiz.missed.push(q.question);
  fx.play(right ? "good" : "bad");
  if (!right) replay(card, "shake", 400);
  const fb = card.querySelector(".feedback");
  fb.innerHTML = `<strong class="${right ? "ok" : "no"}">${right ? "Correct." : "Not quite."}</strong> <span></span>`;
  fb.lastChild.textContent = q.explanation;
  card.querySelector(".quiz-meta span:last-child").textContent = `Score ${quiz.score}`;

  const next = document.createElement("button");
  next.type = "button";
  next.className = "btn btn-primary";
  next.textContent = quiz.i + 1 < state.set.quiz.length ? "Next question" : "See my score";
  next.addEventListener("click", () => { quiz.i++; renderQuestion(); });
  card.append(next);
  next.focus();
}

function renderQuizResult() {
  const total = state.set.quiz.length;
  const pct = Math.round((quiz.score / total) * 100);
  const msg = pct === 100 ? "Perfect score." : pct >= 70 ? "Solid. Review the ones you missed." : "Go back to the flashcards, then try again.";
  const card = document.createElement("div");
  card.className = "quiz-card";
  card.innerHTML = `<p class="eyebrow">Quiz complete</p><p class="score-big"><span>0</span> / ${total}</p><p></p>`;
  card.lastChild.textContent = msg;
  countUp(card.querySelector(".score-big span"), quiz.score);
  if (pct === 100) { confetti(); fx.play("win"); }
  else fx.play(pct >= 70 ? "pair" : "lose");
  award(quiz.score * 5 + (pct === 100 ? 20 : 0), pct === 100 ? "for a perfect quiz" : "for your quiz answers", "quiz");
  reportToClass({ kind: "quiz", score: quiz.score, total, missed: quiz.missed, asked: state.set.quiz.map((q) => q.question) });
  const again = document.createElement("button");
  again.type = "button";
  again.className = "btn btn-primary";
  again.textContent = "Retake quiz";
  again.addEventListener("click", startQuiz);
  card.append(again);
  $("quiz-body").append(card);
}

/* ---------- Match game ---------- */
const match = { timer: null, start: 0, penalty: 0, selected: null, left: 0, running: false };

function bestKey() { return "cram-best:" + state.set.title; }
function showBest() {
  const best = safeGet(bestKey());
  $("match-best").textContent = best ? `${Number(best).toFixed(1)}s` : "none yet";
}
function elapsed() { return (Date.now() - match.start) / 1000 + match.penalty; }

function newMatchRound() {
  clearInterval(match.timer);
  Object.assign(match, { timer: null, penalty: 0, selected: null, running: false });
  $("match-time").textContent = "0.0s";
  $("match-done").hidden = true;
  showBest();

  const pairs = shuffle(state.set.cards).slice(0, 6);
  match.left = pairs.length;
  const tiles = shuffle(pairs.flatMap((c, i) => [
    { pair: i, text: c.front, kind: "term" },
    { pair: i, text: c.back, kind: "def" },
  ]));
  const grid = $("match-grid");
  grid.innerHTML = "";
  tiles.forEach((t, n) => {
    const b = document.createElement("button");
    b.type = "button";
    b.id = `tile-${n}`;
    b.className = `tile ${t.kind}`;
    b.textContent = t.text;
    b.dataset.pair = t.pair;
    b.addEventListener("click", () => pickTile(b));
    grid.append(b);
  });
}

function pickTile(tile) {
  if (!match.running) {
    match.running = true;
    match.start = Date.now();
    match.timer = setInterval(() => { $("match-time").textContent = `${elapsed().toFixed(1)}s`; }, 100);
  }
  if (match.selected === tile) { tile.classList.remove("selected"); match.selected = null; return; }
  if (!match.selected) { tile.classList.add("selected"); match.selected = tile; fx.play("click"); return; }

  const first = match.selected;
  match.selected = null;
  first.classList.remove("selected");
  const isPair = first.dataset.pair === tile.dataset.pair && first.className !== tile.className;
  if (isPair) {
    first.classList.add("gone");
    tile.classList.add("gone");
    fx.play("pair");
    logStudy();
    if (--match.left === 0) finishMatch();
  } else {
    match.penalty += 2;
    fx.play("bad");
    [first, tile].forEach((t) => {
      t.classList.add("miss");
      setTimeout(() => t.classList.remove("miss"), 450);
    });
  }
}

function finishMatch() {
  clearInterval(match.timer);
  match.running = false;
  const time = elapsed();
  $("match-time").textContent = `${time.toFixed(1)}s`;
  const best = Number(safeGet(bestKey()));
  const isRecord = !best || time < best;
  if (isRecord) safeSet(bestKey(), String(time));
  showBest();
  const done = $("match-done");
  done.textContent = isRecord ? `New best: ${time.toFixed(1)} seconds!` : `Done in ${time.toFixed(1)} seconds.`;
  done.hidden = false;
  replay(done, "pop", 500);
  if (isRecord) { confetti(); fx.play("win"); } else fx.play("good");
  award(15 + (isRecord ? 25 : 0), isRecord ? "for a new match record" : "for finishing the match", "match");
}
$("match-restart").addEventListener("click", newMatchRound);

/* ---------- Boss battle ----------
   The study set becomes a boss, and every fight picks one of four bosses at random.
   Each is beaten a different way:
   - The Final Exam: right answers hit, fast ones crit; it gets enraged at half health.
   - The Deadline: one clock for the whole fight. Right answers charge energy and you
     choose the attack: cheap jabs now, or save up for a Brain Blast.
   - The Ironclad Proctor: a 3-layer shield. Three right in a row breaks it, then it takes
     double damage for 3 hits. One wrong answer and the shield is back.
   - The Homework Hydra: each right answer chops a head off, each wrong one grows a new one.
   Missed questions come back a few turns later, so every fight is also practice. */
const BOSS_ART = {
  exam: `
<svg viewBox="0 0 120 140" aria-hidden="true">
  <path class="paper" d="M14 8 H86 L106 28 V128 H14 Z"/>
  <path class="ink-line" d="M86 8 V28 H106"/>
  <circle class="grade-ring" cx="34" cy="26" r="11"/>
  <text class="grade" x="34" y="31" text-anchor="middle">F</text>
  <path class="brow" d="M30 46 L50 54 M90 46 L70 54"/>
  <circle class="eye" cx="42" cy="63" r="6"/>
  <circle class="eye" cx="78" cy="63" r="6"/>
  <path class="mouth" d="M34 84 H86 L79 100 H41 Z"/>
  <path class="teeth" d="M43 84 L47 92 L51 84 Z M58 84 L62 92 L66 84 Z M72 84 L76 92 L80 84 Z"/>
  <path class="rule" d="M26 112 H94 M26 120 H70"/>
</svg>`,
  clock: `
<svg viewBox="0 0 120 140" aria-hidden="true">
  <circle class="bell" cx="26" cy="24" r="14"/><circle class="bell" cx="94" cy="24" r="14"/>
  <path class="ink-line" d="M60 6 V16 M48 6 H72"/>
  <circle class="paper" cx="60" cy="74" r="50"/>
  <path class="rule" d="M60 30 V38 M60 110 V118 M16 74 H24 M96 74 H104"/>
  <path class="brow" d="M36 54 L54 62 M84 54 L66 62"/>
  <circle class="eye" cx="46" cy="70" r="6"/><circle class="eye" cx="74" cy="70" r="6"/>
  <path class="hand" d="M60 74 L60 46 M60 74 L80 86"/>
  <path class="mouth" d="M42 98 Q60 88 78 98 L74 104 Q60 96 46 104 Z"/>
  <path class="ink-line" d="M28 122 L20 134 M92 122 L100 134"/>
</svg>`,
  shield: `
<svg viewBox="0 0 120 140" aria-hidden="true">
  <path class="plume" d="M60 4 C76 8 84 18 82 30 C74 22 66 20 60 22 Z"/>
  <path class="metal" d="M24 50 C24 24 96 24 96 50 V96 C96 110 24 110 24 96 Z"/>
  <rect class="visor" x="34" y="56" width="52" height="14" rx="6"/>
  <circle class="glow" cx="48" cy="63" r="4"/><circle class="glow" cx="72" cy="63" r="4"/>
  <path class="rule" d="M60 30 V54 M36 82 H84 M40 92 H80"/>
  <path class="shield-art" d="M70 84 H112 V108 C112 124 92 134 91 136 C90 134 70 124 70 108 Z"/>
  <text class="grade" x="91" y="112" text-anchor="middle">A+</text>
</svg>`,
  hydra: `
<svg viewBox="0 0 120 140" aria-hidden="true">
  <path class="scales" d="M30 136 C26 112 34 96 60 96 C86 96 94 112 90 136 Z"/>
  <path class="neck" d="M44 100 C30 80 18 66 22 44"/><path class="neck" d="M60 98 C60 76 60 60 60 34"/><path class="neck" d="M76 100 C90 80 102 66 98 44"/>
  <g class="head"><ellipse class="scales" cx="22" cy="38" rx="15" ry="11"/><circle class="eye" cx="18" cy="35" r="3"/><circle class="eye" cx="27" cy="35" r="3"/><path class="teeth" d="M14 44 L18 48 L22 44 L26 48 L30 44 Z"/></g>
  <g class="head"><ellipse class="scales" cx="60" cy="26" rx="16" ry="12"/><circle class="eye" cx="55" cy="23" r="3.4"/><circle class="eye" cx="65" cy="23" r="3.4"/><path class="teeth" d="M50 33 L54 37 L58 33 L62 37 L66 33 L70 37 Z"/></g>
  <g class="head"><ellipse class="scales" cx="98" cy="38" rx="15" ry="11"/><circle class="eye" cx="93" cy="35" r="3"/><circle class="eye" cx="102" cy="35" r="3"/><path class="teeth" d="M90 44 L94 48 L98 44 L102 48 L106 44 Z"/></g>
  <path class="rule" d="M44 116 H76 M48 126 H72"/>
</svg>`,
};

const BOSS = { baseDamage: 100, hpPerQuestion: 140, maxQuestionsForHp: 12, hearts: 3,
               calmMs: 10000, enragedMs: 7000, critAbove: 0.65 };
// The Deadline's attacks: saving energy for bigger attacks does more damage per point.
const ATTACKS = [
  { id: "jab", name: "Jab", cost: 1, dmg: 60, key: "Q" },
  { id: "slam", name: "Slam", cost: 3, dmg: 220, key: "W" },
  { id: "blast", name: "Brain Blast", cost: 5, dmg: 450, key: "E" },
];
const CLOCK = { ms: 90_000, wrongPenaltyMs: 5000, quickMs: 4000, maxEnergy: 8, hpPerQuestion: 80 };
const SHIELD = { layers: 3, staggerHits: 3, damage: 2.2 };

const BOSS_TYPES = {
  exam: {
    name: () => `The ${state.set.title} Final Exam`,
    tagline: "Hit hard and fast before it gets angry.",
    rules: [
      "Every right answer hits the boss. Answer fast for a <strong>critical hit</strong>.",
      "Get answers right in a row to build a <strong>combo</strong> for extra damage.",
      `A wrong answer or running out of time costs a heart. You have ${BOSS.hearts}.`,
      "At half health the boss gets <strong>enraged</strong> and the timer speeds up.",
    ],
  },
  clock: {
    name: () => "The Deadline",
    tagline: "Beat it before the clock runs out.",
    rules: [
      `You have <strong>${CLOCK.ms / 1000} seconds</strong> for the whole fight. No hearts: time is your life.`,
      `Right answers charge <strong>energy</strong> (2 if you answer in under ${CLOCK.quickMs / 1000} seconds).`,
      "Spend energy on an attack: <strong>Jab</strong> (1), <strong>Slam</strong> (3) or <strong>Brain Blast</strong> (5). Saving up hits harder.",
      `A wrong answer takes ${CLOCK.wrongPenaltyMs / 1000} seconds off the clock.`,
    ],
  },
  shield: {
    name: () => "The Ironclad Proctor",
    tagline: "Break the shield, then strike.",
    rules: [
      `It hides behind a <strong>${SHIELD.layers}-layer shield</strong>. Each right answer cracks one layer.`,
      `When the shield breaks, your next ${SHIELD.staggerHits} right answers do <strong>double damage</strong>.`,
      "A wrong answer puts the whole shield back up <strong>and</strong> costs a heart.",
      `You have ${BOSS.hearts} hearts. Streaks are everything.`,
    ],
  },
  hydra: {
    name: () => "The Homework Hydra",
    tagline: "Chop off every head. Don't let it grow more.",
    rules: [
      "Each right answer <strong>chops off a head</strong>. Every 3rd answer in a row chops two.",
      "Each wrong answer (or running out of time) <strong>grows a new head</strong> and costs a heart.",
      `Chop off every head to win. You have ${BOSS.hearts} hearts.`,
    ],
  },
};
const boss = { active: false, raf: 0, wait: 0, type: null, next: null };

function pickBoss(avoid) {
  const types = Object.keys(BOSS_TYPES).filter((t) => t !== avoid);
  return types[Math.floor(Math.random() * types.length)];
}
function bossKey(type = boss.type || "exam") {
  return type === "exam" ? "cram-boss:" + state.set.title : `cram-boss:${state.set.title}:${type}`;
}
function bossName(type = boss.type || "exam") { return BOSS_TYPES[type].name(); }

// Quiz questions plus a multiple-choice question for every flashcard.
function bossQuestions() {
  const fromQuiz = state.set.quiz.filter((q) => !q.fromCard)
    .map((q) => ({ kind: "quiz", prompt: q.question, options: q.options, answer: q.answer, explain: q.explanation }));
  const fromCards = cardQuestions(state.set.cards)
    .map((q) => ({ kind: "card", prompt: q.question, options: q.options, answer: q.answer, explain: "" }));
  return shuffle([...fromQuiz, ...fromCards]);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function stopBoss() {
  cancelAnimationFrame(boss.raf);
  cancelAnimationFrame(boss.clockRaf);
  clearTimeout(boss.wait);
  boss.active = false;
}

function renderBossIntro(type) {
  stopBoss();
  boss.next = type || boss.next || pickBoss(safeGet("cram-last-boss"));
  const t = BOSS_TYPES[boss.next];
  const body = $("boss-body");
  const best = Number(safeGet(bossKey(boss.next)));
  body.innerHTML = `
    <div class="quiz-card boss-intro boss-${boss.next}">
      <div class="boss-stage small"><div class="boss-sprite idle">${BOSS_ART[boss.next]}</div></div>
      <h3 class="boss-title"></h3>
      <p class="boss-tagline"></p>
      <p class="muted small">Its questions come from ${state.set.title.length > 40 ? "this set" : "<span class='set-ref'></span>"}.</p>
      <p class="label">How to beat it</p>
      <ul class="rules">${t.rules.map((r) => `<li>${r}</li>`).join("")}</ul>
      <p class="muted">${best ? `Your fastest win against this boss: ${best.toFixed(1)} seconds.` : "You haven't beaten this boss yet."} On a keyboard, press 1–4 to answer${boss.next === "clock" ? " and Q, W, E to attack" : ""}.</p>
    </div>`;
  const ref = body.querySelector(".set-ref");
  if (ref) ref.textContent = state.set.title;
  body.querySelector(".boss-title").textContent = bossName(boss.next);
  body.querySelector(".boss-tagline").textContent = t.tagline;
  const row = el("div", "card-controls");
  const start = el("button", "btn btn-primary", "Start the fight");
  start.type = "button";
  start.id = "boss-start";
  start.addEventListener("click", () => startBoss(boss.next));
  const other = el("button", "btn btn-quiet", "Fight a different boss");
  other.type = "button";
  other.addEventListener("click", () => { fx.play("flip"); renderBossIntro(pickBoss(boss.next)); });
  row.append(start, other);
  body.firstElementChild.append(row);
}

function startBoss(type = boss.next || "exam") {
  const pool = bossQuestions();
  const body = $("boss-body");
  if (pool.length < 4) {
    body.innerHTML = '<p class="muted">This set is too small for a boss battle.</p>';
    return;
  }
  stopBoss();
  boss.next = type;
  safeSet("cram-last-boss", type);
  const n = Math.min(pool.length, BOSS.maxQuestionsForHp);
  const hearts = type === "clock" ? 0 : BOSS.hearts;
  const max = type === "clock" ? n * CLOCK.hpPerQuestion
    : type === "hydra" ? Math.min(6, Math.max(3, Math.ceil(pool.length / 3)))
    : n * BOSS.hpPerQuestion;
  Object.assign(boss, {
    type, active: true, pool, qi: 0, max, hp: max, hearts, maxHearts: hearts, combo: 0, maxCombo: 0,
    right: 0, answered: 0, missed: new Map(), asked: new Set(), start: Date.now(), locked: false, enraged: false,
    heartUsed: false, frozen: false, fiftyUsed: false,
    // The Deadline
    energy: 0, clockLeft: CLOCK.ms, clockLast: performance.now(), clockFrozenUntil: 0, attacks: 0,
    // The Ironclad Proctor
    shield: SHIELD.layers, stagger: 0,
    // The Homework Hydra
    headsMax: max + 3,
  });
  body.innerHTML = `
    <div class="arena boss-${type}" id="arena">
      <div class="hp-block">
        <div class="hp-label"><strong class="boss-name"></strong><span class="mono" id="boss-hp-text"></span></div>
        <div class="hp-bar" role="progressbar" aria-label="${type === "hydra" ? "Heads left" : "Boss health"}" aria-valuemin="0" aria-valuemax="${max}"><span class="hp-chip" id="boss-chip"></span><span class="hp-fill" id="boss-hp"></span></div>
      </div>
      <div class="boss-stage">
        <div class="boss-sprite idle entering" id="boss-sprite">${BOSS_ART[type]}</div>
        <div class="dmg-layer" id="dmg-layer"></div>
        <p class="phase-banner" id="phase-banner" hidden></p>
      </div>
      <div class="mech" id="boss-mech"></div>
      <div class="status-row">
        <span class="hearts" id="hearts"></span>
        <span class="combo mono" id="combo"></span>
      </div>
      <div class="timer${type === "clock" ? " clock-timer" : ""}" id="timer"><span id="timer-fill"></span>${type === "clock" ? '<b id="clock-text"></b>' : ""}</div>
      <div class="powers" id="boss-powers"></div>
      <p class="eyebrow" id="boss-kind"></p>
      <p class="quiz-q" id="boss-q"></p>
      <div class="options" id="boss-options"></div>
      <p class="feedback" id="boss-log" aria-live="polite"></p>
    </div>`;
  body.querySelector(".boss-name").textContent = bossName(type);
  setTimeout(() => $("boss-sprite")?.classList.remove("entering"), 700);
  fx.play("enrage");
  updateBossHud();
  if (type === "clock") runClock();
  nextBossQuestion();
}

function banner(text) {
  const b = $("phase-banner");
  if (!b) return;
  b.textContent = text;
  b.hidden = false;
  replay(b, "pop", 500);
  clearTimeout(boss.bannerTimer);
  boss.bannerTimer = setTimeout(() => { if ($("phase-banner") === b && boss.type !== "exam") b.hidden = true; }, 1600);
}

function updateBossHud() {
  const pct = `${(boss.hp / boss.max) * 100}%`;
  $("boss-hp").style.width = pct;
  $("boss-chip").style.width = pct; // the pale "chip" bar lags behind, like in fighting games
  $("boss-hp-text").textContent = boss.type === "hydra" ? `${boss.hp} ${boss.hp === 1 ? "head" : "heads"}` : `${boss.hp} / ${boss.max}`;
  $("boss-hp").parentElement.setAttribute("aria-valuenow", boss.hp);
  const hearts = $("hearts");
  while (hearts.children.length < boss.maxHearts) hearts.append(el("span", "heart", "♥"));
  [...hearts.children].forEach((h, i) => {
    const alive = i < boss.hearts;
    if (alive && h.classList.contains("lost")) { h.classList.remove("lost"); h.textContent = "♥"; replay(h, "pop", 500); }
    if (!alive && !h.classList.contains("lost")) { h.classList.add("lost"); h.textContent = "♡"; }
  });
  hearts.setAttribute("aria-label", `${boss.hearts} hearts left`);
  const combo = $("combo");
  const text = boss.combo >= 2 ? `Combo x${boss.combo}` : "";
  if (text && text !== combo.textContent) replay(combo, "bump", 300);
  combo.textContent = text;
  renderMech();
}

// The part of the screen that's different for each boss.
function renderMech() {
  const box = $("boss-mech");
  if (!box) return;
  if (boss.type === "clock") {
    if (!box.firstChild) {
      const meter = el("div", "energy");
      meter.setAttribute("role", "meter");
      meter.setAttribute("aria-label", "Energy");
      meter.setAttribute("aria-valuemin", "0");
      meter.setAttribute("aria-valuemax", String(CLOCK.maxEnergy));
      meter.append(el("span", "energy-label", "Energy"));
      const cells = el("span", "energy-cells");
      for (let i = 0; i < CLOCK.maxEnergy; i++) cells.append(el("i"));
      meter.append(cells);
      const atk = el("div", "attacks");
      for (const a of ATTACKS) {
        const b = el("button", `attack attack-${a.id}`);
        b.type = "button";
        b.dataset.attack = a.id;
        b.append(el("strong", "", a.name), el("span", "", `${a.cost} energy · ${a.dmg} dmg`), el("kbd", "", a.key));
        b.addEventListener("click", () => useAttack(a.id));
        atk.append(b);
      }
      box.append(meter, atk);
    }
    const meter = box.querySelector(".energy");
    meter.setAttribute("aria-valuenow", String(boss.energy));
    [...box.querySelectorAll(".energy-cells i")].forEach((c, i) => c.classList.toggle("on", i < boss.energy));
    box.querySelectorAll(".attack").forEach((b) => {
      const a = ATTACKS.find((x) => x.id === b.dataset.attack);
      const was = b.disabled;
      b.disabled = !boss.active || boss.energy < a.cost;
      if (was && !b.disabled) replay(b, "pop", 400); // just became affordable
    });
  } else if (boss.type === "shield") {
    box.innerHTML = "";
    const row = el("div", "shield-row");
    row.append(el("span", "mech-label", boss.shield > 0 ? "Shield" : "Shield broken!"));
    for (let i = 0; i < SHIELD.layers; i++) row.append(el("span", i < boss.shield ? "pip up" : "pip down", "⛨"));
    if (boss.stagger > 0) row.append(el("span", "mech-hot", `Double damage: ${boss.stagger} ${boss.stagger === 1 ? "hit" : "hits"} left`));
    box.append(row);
  } else if (boss.type === "hydra") {
    box.innerHTML = "";
    const row = el("div", "heads-row");
    row.setAttribute("aria-hidden", "true");
    for (let i = 0; i < boss.hp; i++) row.append(el("span", "head-icon", "🐍"));
    box.append(row);
  } else {
    box.innerHTML = "";
  }
}

/* The Deadline's clock runs for the whole fight. */
function runClock() {
  const fill = $("timer-fill");
  const timer = $("timer");
  const label = $("clock-text");
  const tick = (now) => {
    if (!boss.active || boss.type !== "clock") return;
    const dt = now - boss.clockLast;
    boss.clockLast = now;
    const frozen = now < boss.clockFrozenUntil;
    if (!frozen) boss.clockLeft = Math.max(0, boss.clockLeft - dt);
    timer.classList.toggle("frozen", frozen);
    const frac = boss.clockLeft / CLOCK.ms;
    fill.style.width = `${Math.min(1, frac) * 100}%`;
    timer.classList.toggle("low", frac < 0.25);
    label.textContent = `${Math.ceil(boss.clockLeft / 1000)}s`;
    if (boss.clockLeft <= 0) {
      boss.locked = true;
      $("boss-options")?.querySelectorAll(".option").forEach((b) => { b.disabled = true; });
      $("boss-log").textContent = "Time's up!";
      fx.play("hurt");
      boss.active = false;
      boss.wait = setTimeout(() => endBoss(false), 1200);
      return;
    }
    boss.clockRaf = requestAnimationFrame(tick);
  };
  cancelAnimationFrame(boss.clockRaf);
  boss.clockRaf = requestAnimationFrame(tick);
}

function useAttack(id) {
  if (!boss.active || boss.type !== "clock") return;
  const a = ATTACKS.find((x) => x.id === id);
  if (!a || boss.energy < a.cost) return;
  boss.energy -= a.cost;
  boss.attacks++;
  boss.hp = Math.max(0, boss.hp - a.dmg);
  const sprite = $("boss-sprite");
  showDamage(a.dmg, a.cost >= 5);
  replay(sprite, "hit", 320);
  sparks($("dmg-layer"), 6 + a.cost * 3, a.cost >= 5 ? cssVar("--bad") : cssVar("--accent"));
  if (a.cost >= 5) replay($("arena"), "crit-flash", 300);
  fx.play(a.cost >= 3 ? "crit" : "hit");
  updateBossHud();
  if (boss.hp === 0) {
    sprite.classList.add("defeated");
    pixelBreak(sprite);
    boss.active = false;
    cancelAnimationFrame(boss.raf);
    $("boss-options")?.querySelectorAll(".option").forEach((b) => { b.disabled = true; });
    boss.wait = setTimeout(() => endBoss(true), 1000);
  }
}

function nextBossQuestion() {
  if (!boss.active) return;
  if (boss.qi >= boss.pool.length) { boss.pool = shuffle(boss.pool); boss.qi = 0; }
  const q = boss.pool[boss.qi++];
  boss.asked.add(q.prompt);
  boss.q = q;
  boss.locked = false;
  boss.frozen = false;
  boss.fiftyUsed = false;
  if (boss.type !== "clock") $("timer").classList.remove("frozen");
  $("boss-kind").textContent = q.kind === "card" ? "Which answer matches this?" : "Question";
  $("boss-q").textContent = q.prompt;
  $("boss-log").textContent = boss.type === "clock" && boss.energy === 0 && boss.right === 0 ? "Answer to charge energy, then pick an attack." : "";
  const opts = $("boss-options");
  opts.innerHTML = "";
  q.options.forEach((text, n) => {
    const b = el("button", "option");
    b.type = "button";
    b.innerHTML = `<span class="letter">${n + 1}</span><span></span>`;
    b.lastChild.textContent = text;
    b.addEventListener("click", () => bossAnswer(n));
    opts.append(b);
  });
  boss.qStart = performance.now();
  renderPowers();
  if (boss.type === "clock") return; // The Deadline uses one clock for the whole fight
  // Longer questions get a bit more reading time.
  const chars = q.prompt.length + q.options.join("").length;
  boss.limit = (boss.enraged ? BOSS.enragedMs : BOSS.calmMs) + Math.min(6000, chars * 30);
  const fill = $("timer-fill");
  const timer = $("timer");
  const tick = (now) => {
    const left = 1 - (now - boss.qStart) / boss.limit;
    fill.style.width = `${Math.max(0, left) * 100}%`;
    timer.classList.toggle("low", left < 0.3);
    if (left <= 0) return bossAnswer(-1);
    boss.raf = requestAnimationFrame(tick);
  };
  cancelAnimationFrame(boss.raf);
  boss.raf = requestAnimationFrame(tick);
}

/* Power-ups bought at the prize counter (the Deadline uses them on its clock). */
function timeLeft() {
  if (boss.type === "clock") return Math.max(0, 1 - (performance.now() - boss.qStart) / CLOCK.quickMs);
  return boss.frozen ? boss.frozenLeft : Math.max(0, 1 - (performance.now() - boss.qStart) / boss.limit);
}
function renderPowers() {
  const box = $("boss-powers");
  if (!box) return;
  box.innerHTML = "";
  const inv = player.inventory;
  if (!inv.heart && !inv.freeze && !inv.fifty) return; // nothing to show until you buy some
  const clock = boss.type === "clock";
  const ready = { heart: !boss.heartUsed, freeze: clock ? performance.now() >= boss.clockFrozenUntil : !boss.frozen, fifty: !boss.fiftyUsed };
  const label = { heart: clock ? "+10 seconds" : null, freeze: clock ? "Freeze the clock" : null };
  for (const item of POWERUPS) {
    const b = el("button", `power power-${item.id}`);
    b.type = "button";
    b.append(el("span", "", label[item.id] || item.name), el("span", "power-count", String(inv[item.id] || 0)));
    b.disabled = !inv[item.id] || !ready[item.id] || boss.locked || !boss.active;
    b.addEventListener("click", () => usePower(item.id));
    box.append(b);
  }
}
function usePower(id) {
  if (!boss.active || boss.locked || !player.inventory[id]) return;
  const clock = boss.type === "clock";
  if (id === "heart") {
    if (boss.heartUsed) return;
    boss.heartUsed = true;
    if (clock) {
      boss.clockLeft += 10_000;
      banner("+10 seconds");
    } else {
      boss.hearts++;
      boss.maxHearts = Math.max(boss.maxHearts, boss.hearts);
    }
    fx.play("good");
  } else if (id === "freeze") {
    if (clock) {
      if (performance.now() < boss.clockFrozenUntil) return;
      boss.clockFrozenUntil = performance.now() + 8000;
      banner("Clock frozen for 8 seconds");
      setTimeout(renderPowers, 8100);
    } else {
      if (boss.frozen) return;
      boss.frozenLeft = timeLeft();
      boss.frozen = true;
      cancelAnimationFrame(boss.raf);
      $("timer").classList.add("frozen");
    }
    fx.play("flip");
  } else if (id === "fifty") {
    if (boss.fiftyUsed) return;
    boss.fiftyUsed = true;
    const wrong = shuffle([0, 1, 2, 3].filter((n) => n !== boss.q.answer)).slice(0, 2);
    const buttons = $("boss-options").children;
    wrong.forEach((n) => { buttons[n].disabled = true; buttons[n].classList.add("removed"); });
    fx.play("click");
  }
  player.inventory[id]--;
  savePlayer();
  updateBossHud();
  renderPowers();
}

function showDamage(amount, crit, text) {
  // Critical hits get a comic-book "POW" burst: a halftone starburst behind the number.
  const pop = el("span", crit ? "dmg crit" : "dmg", text || (crit ? `CRIT ${amount}` : `-${amount}`));
  pop.style.left = `${35 + Math.random() * 30}%`;
  $("dmg-layer").append(pop);
  setTimeout(() => pop.remove(), 1000);
}

function bossAnswer(choice) {
  if (!boss.active || boss.locked) return;
  if (choice >= 0 && $("boss-options").children[choice]?.disabled) return; // removed by 50/50
  boss.locked = true;
  if (choice >= 0) logStudy(); // a timeout isn't studying
  cancelAnimationFrame(boss.raf);
  renderPowers();
  const q = boss.q;
  const left = timeLeft();
  $("boss-options").querySelectorAll(".option").forEach((b, n) => {
    b.disabled = true;
    if (n === q.answer) b.classList.add("correct");
    else if (n === choice) b.classList.add("wrong");
  });
  boss.answered++;
  const log = $("boss-log");
  const sprite = $("boss-sprite");
  const say = (ok, head, rest = "") => {
    log.innerHTML = `<strong class="${ok ? "ok" : "no"}"></strong> <span></span>`;
    log.firstChild.textContent = head;
    log.lastChild.textContent = rest;
  };
  const win = () => {
    sprite.classList.add("defeated");
    pixelBreak(sprite);
    boss.active = false;
    boss.wait = setTimeout(() => endBoss(true), 1000);
  };

  if (choice === q.answer) {
    boss.right++;
    boss.combo++;
    boss.maxCombo = Math.max(boss.maxCombo, boss.combo);
    const comboText = boss.combo >= 2 ? `Combo x${boss.combo}.` : "";

    if (boss.type === "clock") {
      const quick = left > 0;
      const gain = Math.min(quick ? 2 : 1, CLOCK.maxEnergy - boss.energy);
      boss.energy += gain;
      fx.play("good");
      say(true, gain ? `+${gain} energy${quick ? " (quick!)" : ""}` : "Energy full! Use an attack.", "");
      updateBossHud();
      boss.wait = setTimeout(nextBossQuestion, 450);
      return;
    }

    if (boss.type === "hydra") {
      const chops = boss.combo % 3 === 0 ? 2 : 1;
      boss.hp = Math.max(0, boss.hp - chops);
      showDamage(chops, chops > 1, chops > 1 ? "DOUBLE CHOP" : "CHOP");
      replay(sprite, "hit", 320);
      sparks($("dmg-layer"), chops > 1 ? 16 : 9, cssVar("--accent"));
      fx.play(chops > 1 ? "crit" : "hit");
      say(true, chops > 1 ? "Two heads off!" : "Head chopped off!", comboText);
      updateBossHud();
      if (boss.hp === 0) return win();
      boss.wait = setTimeout(nextBossQuestion, 850);
      return;
    }

    if (boss.type === "shield" && boss.shield > 0) {
      boss.shield--;
      replay(sprite, "hit", 320);
      fx.play("flip");
      if (boss.shield === 0) {
        boss.stagger = SHIELD.staggerHits;
        banner("Shield broken! Double damage now");
        sparks($("dmg-layer"), 14, cssVar("--yellow"));
        fx.play("crit");
        say(true, "Shield broken!", `Your next ${SHIELD.staggerHits} right answers do double damage.`);
      } else {
        say(true, "Shield cracked!", `${boss.shield} ${boss.shield === 1 ? "layer" : "layers"} left.`);
      }
      updateBossHud();
      boss.wait = setTimeout(nextBossQuestion, 750);
      return;
    }

    // The Final Exam, or the Proctor with its shield down: a damage hit.
    const crit = left > BOSS.critAbove;
    const comboBonus = 1 + Math.min(boss.combo - 1, 5) * 0.1;   // up to +50%
    const speedBonus = 1 + 0.5 * left;                           // up to +50%
    const mult = boss.type === "shield" ? SHIELD.damage : (crit ? 1.5 : 1);
    const dmg = Math.round(BOSS.baseDamage * speedBonus * comboBonus * mult);
    boss.hp = Math.max(0, boss.hp - dmg);
    showDamage(dmg, crit || boss.type === "shield");
    replay(sprite, "hit", 320);
    sparks($("dmg-layer"), crit ? 16 : 9, crit ? cssVar("--bad") : cssVar("--accent"));
    if (crit) replay($("arena"), "crit-flash", 300);
    fx.play(crit ? "crit" : "hit");
    say(true, boss.type === "shield" ? "Direct hit!" : crit ? "Critical hit!" : "Hit!", comboText);
    if (boss.type === "shield") {
      boss.stagger--;
      if (boss.stagger === 0 && boss.hp > 0) {
        boss.shield = SHIELD.layers;
        banner("The shield is back up");
      }
    }
    updateBossHud();
    if (boss.hp === 0) return win();
    if (boss.type === "exam" && !boss.enraged && boss.hp <= boss.max / 2) {
      boss.enraged = true;
      sprite.classList.add("enraged");
      $("phase-banner").textContent = "Enraged! The timer is faster";
      $("phase-banner").hidden = false;
      setTimeout(() => fx.play("enrage"), 250);
    }
    boss.wait = setTimeout(nextBossQuestion, 850);
    return;
  }

  // Wrong answer, or out of time.
  boss.combo = 0;
  boss.missed.set(q.prompt, q);
  boss.pool.splice(Math.min(boss.qi + 3, boss.pool.length), 0, q); // it comes back soon
  replay(sprite, "attack", 420);
  replay($("arena"), "hurt", 420);
  fx.play("hurt");
  const answerText = `Answer: ${q.options[q.answer]}. ${q.explain}`;
  if (boss.type === "clock") {
    boss.clockLeft = Math.max(0, boss.clockLeft - CLOCK.wrongPenaltyMs);
    say(false, `-${CLOCK.wrongPenaltyMs / 1000} seconds!`, answerText);
    updateBossHud();
    boss.wait = setTimeout(nextBossQuestion, 1800);
    return;
  }
  boss.hearts--;
  let head = choice < 0 ? "Too slow!" : "Ouch!";
  if (boss.type === "shield") {
    const was = boss.shield;
    boss.shield = SHIELD.layers;
    boss.stagger = 0;
    if (was < SHIELD.layers) { head += " The shield is back up."; banner("Shield restored"); }
  } else if (boss.type === "hydra") {
    if (boss.hp < boss.headsMax) {
      boss.hp++;
      boss.max = Math.max(boss.max, boss.hp);
      head += " It grew a new head.";
      banner("It grew another head!");
    }
  }
  say(false, head, answerText);
  updateBossHud();
  if (boss.hearts <= 0) {
    boss.active = false;
    boss.wait = setTimeout(() => endBoss(false), 2000);
    return;
  }
  boss.wait = setTimeout(nextBossQuestion, 2200);
}

function endBoss(won) {
  stopBoss();
  const type = boss.type;
  const secs = (Date.now() - boss.start) / 1000;
  const accuracy = boss.answered ? Math.round((boss.right / boss.answered) * 100) : 0;
  let record = false;
  if (won) {
    const best = Number(safeGet(bossKey(type)));
    if (!best || secs < best) { safeSet(bossKey(type), String(secs)); record = true; }
  }
  const timeLeftFrac = boss.clockLeft / CLOCK.ms;
  const rank = type === "clock"
    ? (timeLeftFrac >= 0.35 && accuracy >= 85 ? "S" : timeLeftFrac >= 0.15 ? "A" : "B")
    : (boss.hearts >= BOSS.hearts && accuracy >= 90 ? "S" : boss.hearts >= 2 ? "A" : "B");
  const base = won
    ? 50 + { S: 60, A: 30, B: 10 }[rank] + Math.min(boss.maxCombo * 5, 40) + (boss.missed.size === 0 ? 25 : 0)
    : Math.min(boss.right * 2, 20);
  const got = award(base, won ? `for beating ${bossName(type)}` : "for the hits you landed", "boss", { win: won });
  reportToClass({ kind: "boss", won, accuracy, secs, missed: [...boss.missed.keys()], asked: [...boss.asked] });

  if (won) { confetti(120); fx.play("win"); } else fx.play("lose");
  const card = el("div", `quiz-card boss-end boss-${type}`);
  card.append(el("p", "eyebrow", won ? `${bossName(type)} defeated` : `${bossName(type)} won this time`));
  if (won) {
    // Kinetic type: "Rank" drops in letter by letter, then the rank letter slams down.
    const big = el("p", `score-big rank-${rank} kinetic`);
    big.setAttribute("aria-label", `Rank ${rank}`);
    [..."Rank "].forEach((ch, i) => { const s = el("span", "k-letter", ch); s.style.animationDelay = `${i * 60}ms`; s.setAttribute("aria-hidden", "true"); big.append(s); });
    const letter = el("span", "k-rank", rank);
    letter.setAttribute("aria-hidden", "true");
    big.append(letter);
    card.append(big);
  } else {
    // Retro VHS: the loss screen glitches in like a worn-out tape, then settles.
    card.classList.add("vhs");
    const big = el("p", "score-big vhs-text", "Try again");
    big.dataset.text = "Try again";
    card.append(big);
  }
  const stats = el("div", "stats");
  const last = type === "clock"
    ? [`${Math.ceil(boss.clockLeft / 1000)}s`, "Time left"]
    : [String(Math.max(0, boss.hearts)), "Hearts left"];
  [[`${secs.toFixed(1)}s`, "Time"], [`${accuracy}%`, "Accuracy"], [`x${boss.maxCombo}`, "Best combo"], last]
    .forEach(([value, label]) => {
      const box = el("div");
      box.append(el("strong", "", value), el("span", "", label));
      stats.append(box);
    });
  card.append(stats);
  if (!won && type === "clock" && boss.energy >= 1) card.append(el("p", "muted small", `You still had ${boss.energy} energy saved. Spend it before the clock runs out!`));
  if (got > 0) {
    const prize = el("p", "prize-line");
    prize.append(el("strong", "", `+${got} tickets`));
    if (got < base) prize.append(el("span", "muted small", " Replays of the same boss today earn fewer tickets."));
    else if (player.crew) prize.append(el("span", "muted small", ` Added to ${player.crew.name}'s leaderboard.`));
    else prize.append(el("span", "muted small", " Spend them at the prize counter, or start a crew to compete with friends."));
    card.append(prize);
  }
  if (record) card.append(el("p", "record", "New best time against this boss!"));
  if (boss.missed.size) {
    card.append(el("p", "label", "Review these before the rematch"));
    const list = el("ul", "review");
    boss.missed.forEach((q) => {
      const li = el("li");
      li.append(el("span", "", q.prompt), el("strong", "", q.options[q.answer]));
      list.append(li);
    });
    card.append(list);
  } else if (won) {
    card.append(el("p", "", "Flawless: you didn't miss a single question."));
  }
  const row = el("div", "card-controls");
  const again = el("button", "btn btn-primary", won ? "Fight it again" : "Rematch");
  again.type = "button";
  again.addEventListener("click", () => startBoss(type));
  const next = el("button", "btn", "Fight a new boss");
  next.type = "button";
  next.addEventListener("click", () => { boss.next = pickBoss(type); renderBossIntro(boss.next); });
  const study = el("button", "btn btn-quiet", "Study the flashcards");
  study.type = "button";
  study.addEventListener("click", () => showView("cards"));
  row.append(again, next, study);
  card.append(row);
  const body = $("boss-body");
  body.innerHTML = "";
  body.append(card);
  again.focus();
}

document.addEventListener("keydown", (e) => {
  if ($("view-boss").hidden || !boss.active || e.target.matches("textarea, input") || e.ctrlKey || e.metaKey || e.altKey) return;
  const n = "1234".indexOf(e.key);
  if (e.key.length === 1 && n >= 0) { bossAnswer(n); return; }
  if (boss.type === "clock") {
    const a = ATTACKS.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
    if (a) useAttack(a.id);
  }
});

/* ---------- Making a set with AI ----------
   Notes, a topic, files (PDF, Word, photos) or voice. Each person gets a few AI sets a
   day; the counter above the box always shows how many are left. */
const source = $("source");
source.addEventListener("input", () => { $("char-count").textContent = `${source.value.length} / 8000`; });

const ai = { limit: 3, left: 3, files: [], signedIn: false, perAccount: 5 };
function aiHeaders(json) {
  const h = json ? { "content-type": "application/json" } : {};
  const session = safeGet(SESSION_KEY);
  if (session) h.authorization = `Bearer ${session}`;
  return h;
}
// The AI limit follows this device, not the account, so signing in and out doesn't reset it.
const DEVICE_ID = safeGet("cram-device") || (() => { const id = newPlayerId(); safeSet("cram-device", id); return id; })();
function renderAiLimit() {
  $("ai-left").textContent = `${ai.left} of ${ai.limit}`;
  const dots = $("ai-limit-dots");
  dots.innerHTML = "";
  for (let i = 0; i < ai.limit; i++) dots.append(el("span", i < ai.left ? "on" : ""));
  const out = ai.left <= 0;
  $("ai-limit").classList.toggle("empty", out);
  const guest = !ai.signedIn && ai.perAccount > ai.limit && !NATIVE;
  $("ai-limit-note").textContent = out
    ? `You've used today's ${ai.limit}. More at midnight.${guest ? ` Sign in to get ${ai.perAccount} a day.` : ""} You can still type your own set (no limit).`
    : `${ai.signedIn ? `You get ${ai.limit} a day` : `Guests get ${ai.limit} a day${guest ? ` (sign in for ${ai.perAccount})` : ""}`}, and they refill at midnight. Files over about 4 pages use 2 or 3. "Type my own" has no limit.`;
  $("make-btn").disabled = out;
  $("make-btn").textContent = out ? "No AI sets left today" : "Make my study set";
}
function setAiLimit(data) {
  if (!data || !Number.isFinite(data.left)) return;
  ai.limit = data.limit || ai.limit;
  ai.left = data.left;
  if (typeof data.signedIn === "boolean") ai.signedIn = data.signedIn;
  if (data.sessionValid === false && safeGet(SESSION_KEY)) signOut(true); // expired: say so instead of silently counting as a guest
  if (data.perAccount) ai.perAccount = data.perAccount;
  renderAiLimit();
}
async function loadAiLimit() {
  try {
    const res = await fetch(`${API}/api/generate?device=${encodeURIComponent(DEVICE_ID)}`, { headers: aiHeaders(false) });
    if (res.ok) setAiLimit(await res.json());
  } catch { /* offline: keep the last count */ }
}
renderAiLimit();
loadAiLimit();
document.addEventListener("visibilitychange", () => { if (!document.hidden) loadAiLimit(); });

/* ----- Attached files ----- */
const MAX_UPLOAD = 3_000_000;
function fileSize(n) { return n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`; }
function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// Photos are shrunk on the phone first (smaller upload, same readability for the AI).
async function shrinkImage(file) {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1568 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.85));
  return blob.arrayBuffer();
}

// A .docx file is a zip; the words are in word/document.xml. Read it right here.
async function docxText(file) {
  const buf = await file.arrayBuffer();
  const view = new DataView(buf);
  let end = buf.byteLength - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error("bad zip");
  let at = view.getUint32(end + 16, true);
  const entries = view.getUint16(end + 10, true);
  const decoder = new TextDecoder();
  for (let i = 0; i < entries; i++) {
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const nameLen = view.getUint16(at + 28, true);
    const skip = view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = decoder.decode(new Uint8Array(buf, at + 46, nameLen));
    if (name === "word/document.xml") {
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      let data = new Uint8Array(buf, start, size);
      if (method === 8) data = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
      const xml = new DOMParser().parseFromString(decoder.decode(data), "application/xml");
      const paras = [...xml.getElementsByTagNameNS("*", "p")].map((p) =>
        [...p.getElementsByTagNameNS("*", "*")].map((n) => (n.localName === "t" ? n.textContent : n.localName === "tab" ? " " : n.localName === "br" ? "\n" : "")).join(""));
      return paras.filter((t) => t.trim()).join("\n");
    }
    at += 46 + nameLen + skip;
  }
  throw new Error("no document.xml");
}

function renderFiles() {
  const list = $("file-list");
  list.innerHTML = "";
  for (const f of ai.files) {
    const li = el("li", "file-chip");
    li.append(el("span", "file-kind", f.kind), el("span", "file-name", f.name), el("span", "muted small", fileSize(f.size)));
    // Word files are text, so we can tell roughly how many AI sets they'll use.
    if (f.type === "text/plain") {
      const sets = f.data.length / 4 > 30_000 ? 3 : f.data.length / 4 > 10_000 ? 2 : 1;
      if (sets > 1) li.append(el("span", "file-cost", `big file: uses ${sets} AI sets`));
    }
    const x = el("button", "file-remove", "×");
    x.type = "button";
    x.setAttribute("aria-label", `Remove ${f.name}`);
    x.addEventListener("click", () => { ai.files = ai.files.filter((g) => g !== f); renderFiles(); });
    li.append(x);
    list.append(li);
  }
}

$("file-input").addEventListener("change", async (e) => {
  const status = $("status");
  status.className = "status";
  for (const file of [...e.target.files]) {
    const name = file.name || "file";
    try {
      if (ai.files.length >= 4) throw new Error("toomany");
      let kind, type, buf, data;
      if (/\.docx$/i.test(name) || file.type.includes("wordprocessingml")) {
        // Read the Word file here and send its full text along as a document (no box limit).
        data = (await docxText(file)).trim();
        if (!data) throw new Error("empty");
        kind = "Word"; type = "text/plain";
        buf = new TextEncoder().encode(data);
      }
      if (/\.doc$/i.test(name)) throw new Error("olddoc");
      if (type) {
        // Word document: already read above
      } else if (file.type === "application/pdf" || /\.pdf$/i.test(name)) {
        kind = "PDF"; type = "application/pdf"; buf = await file.arrayBuffer();
      } else if (file.type.startsWith("image/")) {
        kind = "Photo"; type = "image/jpeg"; buf = await shrinkImage(file);
      } else {
        throw new Error("type");
      }
      const used = ai.files.reduce((n, f) => n + f.size, 0);
      if (used + buf.byteLength > MAX_UPLOAD) throw new Error("big");
      ai.files.push({ name, kind, type, size: buf.byteLength, data: data ?? toBase64(buf) });
      status.textContent = "";
    } catch (err) {
      status.classList.add("error");
      status.textContent = {
        big: "That's too big. Files can be 3 MB together. Try one chapter, or fewer pages.",
        toomany: "You can attach up to 4 files at a time.",
        olddoc: `${name} is an old Word file (.doc). Open it in Word or Google Docs and save it as .docx or PDF.`,
        type: `${name} isn't a PDF, Word document or photo.`,
        empty: `${name} doesn't have any text in it.`,
      }[err.message] || `Couldn't read ${name}. Try saving it as a PDF.`;
    }
  }
  e.target.value = "";
  renderFiles();
});

/* ----- Voice: speak your notes into the box ----- */
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
const voice = { rec: null, base: "" };
function setVoiceUi(on) {
  $("voice-btn").setAttribute("aria-pressed", String(on));
  $("voice-label").textContent = on ? "Stop" : "Speak";
}
if (NATIVE && PHONE.SpeechRecognition) {
  $("voice-btn").hidden = false;
  $("voice-btn").addEventListener("click", async () => {
    const SR = PHONE.SpeechRecognition;
    const status = $("status");
    try {
      const { available } = await SR.available();
      if (!available) throw new Error("This phone doesn't have speech recognition turned on.");
      const perm = await SR.requestPermissions();
      if (perm.speechRecognition && perm.speechRecognition !== "granted") throw new Error("Allow the microphone to use voice.");
      const { matches } = await SR.start({ language: navigator.language || "en-US", maxResults: 1, prompt: "Say your notes", partialResults: false, popup: true });
      const said = (matches && matches[0]) || "";
      if (said) {
        source.value = (source.value ? source.value.trimEnd() + " " : "") + said;
        source.dispatchEvent(new Event("input"));
      }
    } catch (err) {
      status.className = "status error";
      status.textContent = err.message || "Voice didn't work. Try again.";
    }
  });
} else if (SpeechRec) {
  $("voice-btn").hidden = false;
  $("voice-btn").addEventListener("click", () => {
    if (voice.rec) { voice.rec.stop(); return; }
    const rec = new SpeechRec();
    rec.lang = navigator.language || "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    voice.base = source.value ? source.value.trimEnd() + " " : "";
    rec.onresult = (ev) => {
      let finalText = "", interim = "";
      for (const r of ev.results) (r.isFinal ? (finalText += r[0].transcript) : (interim += r[0].transcript));
      source.value = (voice.base + finalText + interim).slice(0, 8000);
      source.dispatchEvent(new Event("input"));
    };
    rec.onerror = (ev) => {
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        $("status").className = "status error";
        $("status").textContent = "Allow the microphone in your browser to use voice.";
      }
    };
    rec.onend = () => { voice.rec = null; setVoiceUi(false); };
    voice.rec = rec;
    rec.start();
    setVoiceUi(true);
    $("status").className = "status";
    $("status").textContent = "Listening… say your notes, then press Stop.";
  });
}

$("make-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (voice.rec) voice.rec.stop();
  const text = source.value.trim();
  const status = $("status");
  status.className = "status";
  if (!text && !ai.files.length) {
    status.classList.add("error");
    status.textContent = "Type a topic, paste some notes or attach a file first.";
    return;
  }
  if (ai.left <= 0) return;
  const btn = $("make-btn");
  btn.disabled = true;
  btn.textContent = "Making your set…";
  status.textContent = ai.files.length
    ? "Claude is reading your file and writing your flashcards and quiz. Longer files get more cards, so this can take up to a minute."
    : "Claude is writing your flashcards and quiz. This takes about 10 seconds.";
  try {
    const res = await fetch(API + "/api/generate", {
      method: "POST",
      headers: aiHeaders(true),
      body: JSON.stringify({ text, device: DEVICE_ID, files: ai.files.map((f) => ({ type: f.type, data: f.data, name: f.name })) }),
    });
    const data = await res.json().catch(() => ({}));
    setAiLimit(data);
    if (!res.ok) throw new Error(data.error || (res.status === 413 ? "Those files are too big. Try fewer pages." : "Something went wrong. Try again."));
    saveSet(data, "ai");
    linkNewSet(data.title);
    loadSet(data, "ai");
    showView("cards");
    ai.files = [];
    renderFiles();
    status.textContent = `Ready: ${data.cards.length} flashcards and ${data.quiz.length} quiz questions.${data.setsUsed > 1 ? ` This was a big file, so it used ${data.setsUsed} of your AI sets.` : ""}`;
    document.querySelector(".set").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    status.classList.add("error");
    status.textContent = err.message === "Failed to fetch" ? "Couldn't reach the server. Check your connection." : err.message;
  } finally {
    renderAiLimit();
  }
});

/* ---------- Installable app ----------
   The service worker (sw.js) lets the app open offline. On Android/Chrome, the browser
   offers an install prompt, which we show as an "Install app" button. */
if (!NATIVE && "serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("/sw.js").catch(() => {}); });
}
// When a new version of the site goes live, pages that are already open pick it up:
// right away if you're not looking at the tab, otherwise with a "Refresh" bar (so it never
// reloads in the middle of a boss fight or while you're typing).
if (!NATIVE && location.protocol === "https:") {
  let liveTag = null;
  const versionTag = async () => {
    try {
      const res = await fetch("/app.js", { method: "HEAD", cache: "no-store" });
      return res.headers.get("etag") || res.headers.get("last-modified");
    } catch { return null; }
  };
  const showUpdateBar = () => {
    if ($("update-bar")) return;
    const bar = el("div", "update-bar");
    bar.id = "update-bar";
    bar.setAttribute("role", "status");
    bar.append(el("span", "", "Cram Arcade was updated."));
    const go = el("button", "btn btn-primary btn-small", "Refresh");
    go.type = "button";
    go.addEventListener("click", () => location.reload());
    bar.append(go);
    document.body.append(bar);
  };
  const checkForUpdate = async () => {
    const tag = await versionTag();
    if (!tag) return;
    if (!liveTag) { liveTag = tag; return; }
    if (tag === liveTag) return;
    const busy = boss.active || document.querySelector("dialog[open]") || (document.activeElement && document.activeElement.matches("textarea, input"));
    if (document.hidden && !busy) location.reload();
    else showUpdateBar();
  };
  checkForUpdate();
  setInterval(checkForUpdate, 5 * 60_000);
  document.addEventListener("visibilitychange", checkForUpdate);
}

// Android phones get the real app (downloaded from this site). Computers can still
// install the web version when the browser offers it.
let installPrompt = null;
let apkReady = false;
const ON_ANDROID = /Android/i.test(navigator.userAgent);
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e;
  if (!apkReady) { $("install-btn").textContent = "Install app"; $("install-btn").hidden = false; }
});
$("install-btn").addEventListener("click", async () => {
  if (apkReady && ON_ANDROID) { openSheet("getapp"); return; }
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice.catch(() => null);
  installPrompt = null;
  $("install-btn").hidden = true;
});
window.addEventListener("appinstalled", () => { $("install-btn").hidden = true; });

async function apkInfo(base = "") {
  try {
    const res = await fetch(`${base}/downloads/version.json`, { cache: "no-store" });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

if (!NATIVE) {
  apkInfo().then((info) => {
    if (!info?.build) return;
    apkReady = true;
    $("getapp-version").textContent = `Version ${info.version}`;
    $("footer-app").hidden = false;
    if (!ON_ANDROID || safeGet("cram-hide-promo") === "yes") return;
    // On Android phones, a card at the top of Home (the top bar has no room for it).
    const card = el("div", "reminder reminder-update app-promo");
    const text = el("p", "reminder-text");
    text.append(el("strong", "", "Get the Cram Arcade app."), " Reminders before your tests, even when the app is closed.");
    const go = el("button", "btn btn-primary", "Get the app");
    go.type = "button";
    go.addEventListener("click", () => openSheet("getapp"));
    const actions = el("div", "reminder-actions");
    actions.append(go);
    const hide = el("button", "reminder-hide", "×");
    hide.type = "button";
    hide.setAttribute("aria-label", "Hide this");
    hide.addEventListener("click", () => { safeSet("cram-hide-promo", "yes"); card.remove(); });
    card.append(text, actions, hide);
    $("reminders").before(card);
  });
  $("footer-app").addEventListener("click", (e) => { e.preventDefault(); openSheet("getapp"); });
} else {
  // Downloaded apps don't update themselves, so say when a newer one is on the website.
  Promise.all([fetch("version.json").then((r) => r.json()).catch(() => null), apkInfo(API)]).then(([mine, latest]) => {
    if (!mine?.build || !latest?.build || latest.build <= mine.build) return;
    const card = el("div", "reminder reminder-update");
    const text = el("p", "reminder-text");
    text.append(el("strong", "", "A new version of Cram Arcade is ready."), " Your tickets and sets stay put.");
    const go = el("button", "btn btn-primary", "Update");
    go.type = "button";
    go.addEventListener("click", () => { location.href = `${API}/downloads/cram-arcade.apk`; });
    const actions = el("div", "reminder-actions");
    actions.append(go);
    card.append(text, actions);
    $("reminders").before(card);
  });
}

loadSet(EXAMPLE_SET, "example");
renderSaved();
