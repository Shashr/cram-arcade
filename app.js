// Cram Arcade front end: flashcards, quiz, and a matching game.

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
function renderSoundBtn() {
  $("sound-btn").textContent = fx.on ? "Sound: on" : "Sound: off";
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
function saveSet(set, kind) {
  const list = savedSets().filter((s) => s.title !== set.title);
  list.unshift({ title: set.title, cards: set.cards, quiz: set.quiz, kind, savedAt: Date.now() });
  safeSet(SAVED_KEY, JSON.stringify(list.slice(0, 30)));
  renderSaved();
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
    open.lastChild.textContent = `${s.cards.length} cards, ${s.kind === "own" ? "made by you" : "made with AI"}`;
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
  loadSet(set, "own");
  showView("cards");
  status.textContent = `Ready: ${cards.length} flashcards, saved on this device.`;
  fx.play("good");
  document.querySelector(".set").scrollIntoView({ behavior: "smooth", block: "start" });
});

/* ---------- Loading a set ---------- */
const KIND_LABELS = { example: "Example set", ai: "Your AI study set", own: "Your own set" };
function loadSet(set, kind) {
  state.set = { ...set, quiz: set.quiz && set.quiz.length ? set.quiz : shuffle(cardQuestions(set.cards)).slice(0, 8) };
  state.order = set.cards.map((_, i) => i);
  state.index = 0;
  state.known.clear();
  state.learning.clear();
  $("set-title").textContent = set.title;
  $("set-kind").textContent = KIND_LABELS[kind] || "Study set";
  renderCard();
  startQuiz();
  newMatchRound();
  renderBossIntro();
}

/* ---------- Tabs ---------- */
document.querySelectorAll(".tab[data-view]").forEach((tab) => {
  tab.addEventListener("click", () => showView(tab.dataset.view));
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
  const id = state.order[state.index];
  (known ? state.learning : state.known).delete(id);
  (known ? state.known : state.learning).add(id);
  fx.play(known ? "good" : "click");
  replay($(known ? "known-btn" : "learning-btn"), "pulse", 400);
  replay($("tally"), "bump", 300);
  if (known && state.known.size === state.order.length) {
    confetti();
    fx.play("win");
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
function startQuiz() { quiz.i = 0; quiz.score = 0; renderQuestion(); }

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
  const q = state.set.quiz[quiz.i];
  const buttons = card.querySelectorAll(".option");
  buttons.forEach((b, n) => {
    b.disabled = true;
    if (n === q.answer) b.classList.add("correct");
    else if (n === choice) b.classList.add("wrong");
  });
  const right = choice === q.answer;
  if (right) quiz.score++;
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
}
$("match-restart").addEventListener("click", newMatchRound);

/* ---------- Boss battle ----------
   The study set becomes a boss. Right answers deal damage (more if you're fast or on a
   combo), wrong answers or running out of time cost a heart. Missed questions come back
   a few turns later, so the fight doubles as practice on what you don't know. */
const BOSS_SVG = `
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
</svg>`;

const BOSS = { baseDamage: 100, hpPerQuestion: 140, maxQuestionsForHp: 12, hearts: 3,
               calmMs: 10000, enragedMs: 7000, critAbove: 0.65 };
const boss = { active: false, raf: 0, wait: 0 };

function bossKey() { return "cram-boss:" + state.set.title; }
function bossName() { return `The ${state.set.title} Final Exam`; }

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
  clearTimeout(boss.wait);
  boss.active = false;
}

function renderBossIntro() {
  stopBoss();
  const body = $("boss-body");
  const best = Number(safeGet(bossKey()));
  body.innerHTML = `
    <div class="quiz-card boss-intro">
      <div class="boss-stage small"><div class="boss-sprite idle">${BOSS_SVG}</div></div>
      <p class="eyebrow">Boss battle</p>
      <h3 class="boss-title"></h3>
      <ul class="rules">
        <li>Every right answer hits the boss. Answer fast for a <strong>critical hit</strong>.</li>
        <li>Get answers right in a row to build a <strong>combo</strong> for extra damage.</li>
        <li>A wrong answer or running out of time costs a heart. You have ${BOSS.hearts}.</li>
        <li>At half health the boss gets <strong>enraged</strong> and the timer speeds up.</li>
      </ul>
      <p class="muted">${best ? `Your fastest win: ${best.toFixed(1)} seconds.` : "You haven't beaten this boss yet."} On a keyboard, press 1–4 to answer.</p>
    </div>`;
  body.querySelector(".boss-title").textContent = bossName();
  const start = el("button", "btn btn-primary", "Start the fight");
  start.type = "button";
  start.id = "boss-start";
  start.addEventListener("click", startBoss);
  body.firstElementChild.append(start);
}

function startBoss() {
  const pool = bossQuestions();
  const body = $("boss-body");
  if (pool.length < 4) {
    body.innerHTML = '<p class="muted">This set is too small for a boss battle.</p>';
    return;
  }
  const max = Math.min(pool.length, BOSS.maxQuestionsForHp) * BOSS.hpPerQuestion;
  Object.assign(boss, {
    active: true, pool, qi: 0, max, hp: max, hearts: BOSS.hearts, combo: 0, maxCombo: 0,
    right: 0, answered: 0, missed: new Map(), start: Date.now(), locked: false, enraged: false,
  });
  body.innerHTML = `
    <div class="arena" id="arena">
      <div class="hp-block">
        <div class="hp-label"><strong class="boss-name"></strong><span class="mono" id="boss-hp-text"></span></div>
        <div class="hp-bar" role="progressbar" aria-label="Boss health" aria-valuemin="0" aria-valuemax="${max}"><span class="hp-chip" id="boss-chip"></span><span class="hp-fill" id="boss-hp"></span></div>
      </div>
      <div class="boss-stage">
        <div class="boss-sprite idle entering" id="boss-sprite">${BOSS_SVG}</div>
        <div class="dmg-layer" id="dmg-layer"></div>
        <p class="phase-banner" id="phase-banner" hidden>Enraged! The timer is faster</p>
      </div>
      <div class="status-row">
        <span class="hearts" id="hearts"></span>
        <span class="combo mono" id="combo"></span>
      </div>
      <div class="timer" id="timer"><span id="timer-fill"></span></div>
      <p class="eyebrow" id="boss-kind"></p>
      <p class="quiz-q" id="boss-q"></p>
      <div class="options" id="boss-options"></div>
      <p class="feedback" id="boss-log" aria-live="polite"></p>
    </div>`;
  body.querySelector(".boss-name").textContent = bossName();
  setTimeout(() => $("boss-sprite")?.classList.remove("entering"), 700);
  fx.play("enrage");
  updateBossHud();
  nextBossQuestion();
}

function updateBossHud() {
  const pct = `${(boss.hp / boss.max) * 100}%`;
  $("boss-hp").style.width = pct;
  $("boss-chip").style.width = pct; // the pale "chip" bar lags behind, like in fighting games
  $("boss-hp-text").textContent = `${boss.hp} / ${boss.max}`;
  $("boss-hp").parentElement.setAttribute("aria-valuenow", boss.hp);
  const hearts = $("hearts");
  if (hearts.children.length !== BOSS.hearts) {
    hearts.innerHTML = "";
    for (let i = 0; i < BOSS.hearts; i++) hearts.append(el("span", "heart", "♥"));
  }
  [...hearts.children].forEach((h, i) => {
    const alive = i < boss.hearts;
    if (!alive && !h.classList.contains("lost")) { h.classList.add("lost"); h.textContent = "♡"; }
  });
  hearts.setAttribute("aria-label", `${boss.hearts} hearts left`);
  const combo = $("combo");
  const text = boss.combo >= 2 ? `Combo x${boss.combo}` : "";
  if (text && text !== combo.textContent) replay(combo, "bump", 300);
  combo.textContent = text;
}

function nextBossQuestion() {
  if (!boss.active) return;
  if (boss.qi >= boss.pool.length) { boss.pool = shuffle(boss.pool); boss.qi = 0; }
  const q = boss.pool[boss.qi++];
  boss.q = q;
  boss.locked = false;
  $("boss-kind").textContent = q.kind === "card" ? "Which answer matches this?" : "Question";
  $("boss-q").textContent = q.prompt;
  $("boss-log").textContent = "";
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
  // Longer questions get a bit more reading time.
  const chars = q.prompt.length + q.options.join("").length;
  boss.limit = (boss.enraged ? BOSS.enragedMs : BOSS.calmMs) + Math.min(6000, chars * 30);
  boss.qStart = performance.now();
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

function showDamage(amount, crit) {
  const pop = el("span", crit ? "dmg crit" : "dmg", crit ? `CRIT ${amount}` : `-${amount}`);
  pop.style.left = `${35 + Math.random() * 30}%`;
  $("dmg-layer").append(pop);
  setTimeout(() => pop.remove(), 900);
}

function bossAnswer(choice) {
  if (!boss.active || boss.locked) return;
  boss.locked = true;
  cancelAnimationFrame(boss.raf);
  const q = boss.q;
  const left = Math.max(0, 1 - (performance.now() - boss.qStart) / boss.limit);
  $("boss-options").querySelectorAll(".option").forEach((b, n) => {
    b.disabled = true;
    if (n === q.answer) b.classList.add("correct");
    else if (n === choice) b.classList.add("wrong");
  });
  boss.answered++;
  const log = $("boss-log");
  const sprite = $("boss-sprite");

  if (choice === q.answer) {
    boss.right++;
    boss.combo++;
    boss.maxCombo = Math.max(boss.maxCombo, boss.combo);
    const crit = left > BOSS.critAbove;
    const comboBonus = 1 + Math.min(boss.combo - 1, 5) * 0.1;   // up to +50%
    const speedBonus = 1 + 0.5 * left;                           // up to +50%
    const dmg = Math.round(BOSS.baseDamage * speedBonus * comboBonus * (crit ? 1.5 : 1));
    boss.hp = Math.max(0, boss.hp - dmg);
    showDamage(dmg, crit);
    replay(sprite, "hit", 320);
    sparks($("dmg-layer"), crit ? 16 : 9, crit ? cssVar("--bad") : cssVar("--accent"));
    if (crit) replay($("arena"), "crit-flash", 300);
    fx.play(crit ? "crit" : "hit");
    log.innerHTML = `<strong class="ok">${crit ? "Critical hit!" : "Hit!"}</strong> <span></span>`;
    log.lastChild.textContent = boss.combo >= 2 ? `Combo x${boss.combo}.` : "";
    updateBossHud();
    if (boss.hp === 0) {
      sprite.classList.add("defeated");
      boss.wait = setTimeout(() => endBoss(true), 1000);
      return;
    }
    if (!boss.enraged && boss.hp <= boss.max / 2) {
      boss.enraged = true;
      sprite.classList.add("enraged");
      $("phase-banner").hidden = false;
      setTimeout(() => fx.play("enrage"), 250);
    }
    boss.wait = setTimeout(nextBossQuestion, 850);
  } else {
    boss.combo = 0;
    boss.hearts--;
    boss.missed.set(q.prompt, q);
    boss.pool.splice(Math.min(boss.qi + 3, boss.pool.length), 0, q); // it comes back soon
    replay(sprite, "attack", 420);
    replay($("arena"), "hurt", 420);
    fx.play("hurt");
    log.innerHTML = `<strong class="no">${choice < 0 ? "Too slow!" : "Ouch!"}</strong> <span></span>`;
    log.lastChild.textContent = `Answer: ${q.options[q.answer]}. ${q.explain}`;
    updateBossHud();
    if (boss.hearts === 0) {
      boss.wait = setTimeout(() => endBoss(false), 2000);
      return;
    }
    boss.wait = setTimeout(nextBossQuestion, 2200);
  }
}

function endBoss(won) {
  stopBoss();
  const secs = (Date.now() - boss.start) / 1000;
  const accuracy = Math.round((boss.right / boss.answered) * 100);
  let record = false;
  if (won) {
    const best = Number(safeGet(bossKey()));
    if (!best || secs < best) { safeSet(bossKey(), String(secs)); record = true; }
  }
  const rank = boss.hearts === BOSS.hearts && accuracy >= 90 ? "S" : boss.hearts >= 2 ? "A" : "B";

  if (won) { confetti(120); fx.play("win"); } else fx.play("lose");
  const card = el("div", "quiz-card boss-end");
  card.append(el("p", "eyebrow", won ? "Boss defeated" : "You were defeated"));
  card.append(el("p", won ? `score-big rank-${rank}` : "score-big", won ? `Rank ${rank}` : "Try again"));
  const stats = el("div", "stats");
  [[`${secs.toFixed(1)}s`, "Time"], [`${accuracy}%`, "Accuracy"], [`x${boss.maxCombo}`, "Best combo"], [String(boss.hearts), "Hearts left"]]
    .forEach(([value, label]) => {
      const box = el("div");
      box.append(el("strong", "", value), el("span", "", label));
      stats.append(box);
    });
  card.append(stats);
  if (record) card.append(el("p", "record", "New best time!"));
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
  const again = el("button", "btn btn-primary", won ? "Fight again" : "Rematch");
  again.type = "button";
  again.addEventListener("click", startBoss);
  const study = el("button", "btn", "Study the flashcards");
  study.type = "button";
  study.addEventListener("click", () => showView("cards"));
  row.append(again, study);
  card.append(row);
  const body = $("boss-body");
  body.innerHTML = "";
  body.append(card);
  again.focus();
}

document.addEventListener("keydown", (e) => {
  if ($("view-boss").hidden || !boss.active || e.target.matches("textarea, input")) return;
  const n = "1234".indexOf(e.key);
  if (e.key.length === 1 && n >= 0) bossAnswer(n);
});

/* ---------- Making a set with AI ---------- */
const source = $("source");
source.addEventListener("input", () => { $("char-count").textContent = `${source.value.length} / 8000`; });

$("make-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = source.value.trim();
  const status = $("status");
  status.className = "status";
  if (!text) {
    status.classList.add("error");
    status.textContent = "Type a topic or paste some notes first.";
    return;
  }
  const btn = $("make-btn");
  btn.disabled = true;
  btn.textContent = "Making your set…";
  status.textContent = "Claude is writing your flashcards and quiz. This takes about 10 seconds.";
  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Something went wrong. Try again.");
    saveSet(data, "ai");
    loadSet(data, "ai");
    showView("cards");
    status.textContent = `Ready: ${data.cards.length} flashcards and ${data.quiz.length} quiz questions.`;
    document.querySelector(".set").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    status.classList.add("error");
    status.textContent = err.message === "Failed to fetch" ? "Couldn't reach the server. Check your connection." : err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "Make my study set";
  }
});

loadSet(EXAMPLE_SET, "example");
renderSaved();
