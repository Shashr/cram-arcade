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

/* ---------- Loading a set ---------- */
function loadSet(set, isExample) {
  state.set = set;
  state.order = set.cards.map((_, i) => i);
  state.index = 0;
  state.known.clear();
  state.learning.clear();
  $("set-title").textContent = set.title;
  $("set-kind").textContent = isExample ? "Example set" : "Your study set";
  renderCard();
  startQuiz();
  newMatchRound();
}

/* ---------- Tabs ---------- */
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => showView(tab.dataset.view));
});
function showView(view) {
  document.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.view === view)));
  ["cards", "quiz", "match"].forEach((v) => { $("view-" + v).hidden = v !== view; });
}

/* ---------- Flashcards ---------- */
function renderCard() {
  const card = state.set.cards[state.order[state.index]];
  $("flashcard").classList.remove("flipped");
  $("card-front").textContent = card.front;
  $("card-back").textContent = card.back;
  $("card-pos").textContent = `${state.index + 1} / ${state.order.length}`;
  $("known-count").textContent = state.known.size;
  $("learning-count").textContent = state.learning.size;
}
function moveCard(step) {
  state.index = (state.index + step + state.order.length) % state.order.length;
  renderCard();
}
function markCard(known) {
  const id = state.order[state.index];
  (known ? state.learning : state.known).delete(id);
  (known ? state.known : state.learning).add(id);
  moveCard(1);
}
$("flashcard").addEventListener("click", () => $("flashcard").classList.toggle("flipped"));
$("prev-card").addEventListener("click", () => moveCard(-1));
$("next-card").addEventListener("click", () => moveCard(1));
$("known-btn").addEventListener("click", () => markCard(true));
$("learning-btn").addEventListener("click", () => markCard(false));
$("shuffle-btn").addEventListener("click", () => {
  state.order = shuffle(state.order);
  state.index = 0;
  renderCard();
});
document.addEventListener("keydown", (e) => {
  if ($("view-cards").hidden || e.target.matches("textarea, input")) return;
  if (e.key === " ") { e.preventDefault(); $("flashcard").classList.toggle("flipped"); }
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
  card.innerHTML = `<p class="eyebrow">Quiz complete</p><p class="score-big">${quiz.score} / ${total}</p><p></p>`;
  card.lastChild.textContent = msg;
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
  $("match-best").textContent = best ? `${Number(best).toFixed(1)}s` : "—";
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
  if (!match.selected) { tile.classList.add("selected"); match.selected = tile; return; }

  const first = match.selected;
  match.selected = null;
  first.classList.remove("selected");
  const isPair = first.dataset.pair === tile.dataset.pair && first.className !== tile.className;
  if (isPair) {
    first.classList.add("gone");
    tile.classList.add("gone");
    if (--match.left === 0) finishMatch();
  } else {
    match.penalty += 2;
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
}
$("match-restart").addEventListener("click", newMatchRound);

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
    loadSet(data, false);
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

loadSet(EXAMPLE_SET, true);
