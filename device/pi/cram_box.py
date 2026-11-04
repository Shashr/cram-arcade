#!/usr/bin/env python3
"""
Cram Box - Raspberry Pi side.

The Pi is the "brain". It gets flashcards and quiz questions from the Cram Arcade
website (the same /api/generate route the website uses), runs the study sessions,
tracks what you know with spaced repetition, and tells the Arduino what to draw.

Run it:
    python3 cram_box.py --api https://YOUR-SITE.vercel.app

Try it with no hardware at all (screen is drawn in the terminal, type a/b/c/d):
    python3 cram_box.py --api https://YOUR-SITE.vercel.app --sim

Files it uses (all in this folder):
    topics.txt     the topics in the menu, one per line (edit this!)
    decks/         study sets saved after they're made, so they work offline
    progress.json  how well you know each card (Leitner box 1-5)
"""
import argparse
import json
import os
import random
import re
import sys
import textwrap
import time
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
DECK_DIR = HERE / "decks"
PROGRESS_FILE = HERE / "progress.json"
TOPICS_FILE = HERE / "topics.txt"

COLS = 21        # characters per screen row
BODY = 7         # rows under the header
MAX_BOX = 5      # spaced repetition: box 1 = new/missed, box 5 = mastered
STREAK_EVERY = 5


# ---------------------------------------------------------------- text helpers

REPLACEMENTS = {"‘": "'", "’": "'", "“": '"', "”": '"',
                "–": "-", "—": "-", "…": "...", "×": "x",
                "→": "->", "≤": "<=", "≥": ">=", "°": " deg"}


def clean(text):
    """The OLED font only has plain ASCII, so swap or drop anything fancy."""
    text = "".join(REPLACEMENTS.get(ch, ch) for ch in str(text))
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return " ".join(text.replace("|", "/").split())


def wrap(text, width=COLS):
    return textwrap.wrap(clean(text), width) or [""]


def fit(lines, n):
    """Keep at most n lines; mark cut-off text with '...'."""
    if len(lines) <= n:
        return lines
    out = lines[:n]
    out[-1] = out[-1][:COLS - 3].rstrip() + "..."
    return out


# ---------------------------------------------------------------- hardware links

class ArduinoLink:
    """Talks to the Arduino over USB serial (see cram_box.ino for the message format)."""

    def __init__(self, port):
        import serial  # pyserial
        if port == "auto":
            port = find_port()
        print(f"Connecting to Arduino on {port}...")
        self.ser = serial.Serial(port, 115200, timeout=0.1)
        self.pending = []
        # Opening the port restarts the Uno, so wait for it to say READY.
        if not self._wait_for("READY", 6):
            self.ser.write(b"P\n")
            if not self._wait_for("PONG", 3):
                sys.exit("The Arduino isn't answering. Did you upload cram_box.ino to it?")
        print("Arduino connected.")

    def _readline(self):
        return self.ser.readline().decode("ascii", "ignore").strip()

    def _wait_for(self, word, seconds):
        end = time.time() + seconds
        while time.time() < end:
            msg = self._readline()
            if msg == word:
                return True
            if msg.startswith("BTN|") and len(msg) >= 5:
                self.pending.append(msg[4])
        return False

    def _send(self, msg):
        self.ser.write((msg + "\n").encode("ascii", "ignore"))
        # Wait for "OK" before sending more. The Uno only has a 64-byte input buffer,
        # so sending while it's busy drawing or beeping would lose characters.
        if not self._wait_for("OK", 2):
            print("warning: Arduino didn't confirm a message", file=sys.stderr)

    def show(self, header, lines):
        self._send("S|" + "|".join([header[:COLS]] + [l[:COLS] for l in lines[:BODY]]))

    def beep(self, kind):
        self._send("B|" + kind)

    def button(self):
        """Wait for a button press. Returns 'A', 'B', 'C' or 'D'."""
        self.pending.clear()  # ignore presses from before this screen appeared
        while True:
            msg = self._readline()
            if msg.startswith("BTN|") and len(msg) >= 5:
                return msg[4]


class SimLink:
    """Pretend Arduino for testing: draws the screen in the terminal."""

    def show(self, header, lines):
        edge = "+" + "-" * COLS + "+"
        print("\n" + edge)
        print("|" + header[:COLS].ljust(COLS) + "|")
        print(edge)
        for i in range(BODY):
            line = lines[i] if i < len(lines) else ""
            print("|" + line[:COLS].ljust(COLS) + "|")
        print(edge)

    def beep(self, kind):
        print({"G": "  *ding ding*", "X": "  *bzzzt*", "S": "  *STREAK fanfare*"}.get(kind, ""))

    def button(self):
        while True:
            try:
                key = input("button a/b/c/d (q = quit)> ").strip().lower()
            except EOFError:
                raise SystemExit
            if key == "q":
                raise SystemExit
            if key and key[0] in "abcd":
                return key[0].upper()


def find_port():
    from serial.tools import list_ports
    ports = list(list_ports.comports())
    arduino_ids = {0x2341, 0x2A03, 0x1A86}  # official Arduino, Arduino.org, CH340 clones
    for p in ports:
        if p.vid in arduino_ids or "arduino" in (p.description or "").lower():
            return p.device
    for p in ports:
        if "ACM" in p.device or "USB" in p.device:
            return p.device
    sys.exit("No Arduino found. Plug it in with the USB cable, or pass --port (e.g. --port COM3).")


# ---------------------------------------------------------------- screens

def screen(link, header, body, hint=""):
    """Draw a header, the body (cut to fit), and an optional hint on the bottom row."""
    room = BODY - 1 if hint else BODY
    lines = fit(body, room)
    if hint:
        lines = lines + [""] * (room - len(lines)) + [hint]
    link.show(clean(header)[:COLS], lines)


def message(link, header, text):
    screen(link, header, wrap(text), "[any button] ok")
    link.button()


def choose(link, title, items):
    """Scrolling menu. A = up, B = down, C = pick, D = back. Returns an index or None."""
    i = 0
    rows = BODY - 1
    while True:
        top = max(0, min(i - 2, len(items) - rows))
        shown = []
        for j in range(top, min(top + rows, len(items))):
            shown.append(("> " if j == i else "  ") + clean(items[j])[:COLS - 2])
        screen(link, title, shown, "[A]^ [B]v [C]ok [D]bk")
        b = link.button()
        if b == "A":
            i = (i - 1) % len(items)
        elif b == "B":
            i = (i + 1) % len(items)
        elif b == "C":
            return i
        elif b == "D":
            return None


# ---------------------------------------------------------------- talking to Cram Arcade

def generate(api, topic):
    """Ask the Cram Arcade website to make a study set, exactly like the browser does."""
    req = urllib.request.Request(
        api.rstrip("/") + "/api/generate",
        data=json.dumps({"text": topic}).encode(),
        headers={"content-type": "application/json", "user-agent": "CramBox/1.0"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            data = json.load(r)
    except urllib.error.HTTPError as e:
        try:
            msg = json.load(e).get("error")
        except Exception:
            msg = None
        raise RuntimeError(msg or f"The website gave error {e.code}.")
    except (urllib.error.URLError, TimeoutError, OSError):
        raise RuntimeError("Can't reach the Cram Arcade website. Check the Wi-Fi and the --api link.")
    if not data.get("cards"):
        raise RuntimeError("The website didn't send any flashcards back.")
    return data


def slug(topic):
    return re.sub(r"[^a-z0-9]+", "-", topic.lower()).strip("-")[:40] or "deck"


def load_deck(api, topic, link, fresh=False):
    """Use the saved deck if there is one; otherwise make a new one."""
    path = DECK_DIR / f"{slug(topic)}.json"
    if path.exists() and not fresh:
        return json.loads(path.read_text())
    screen(link, "MAKING DECK", wrap(topic) + ["", "Asking Cram Arcade...", "(about 20 seconds)"])
    deck = generate(api, topic)
    deck["topic"] = topic
    DECK_DIR.mkdir(exist_ok=True)
    path.write_text(json.dumps(deck, indent=2))
    return deck


def load_progress():
    try:
        return json.loads(PROGRESS_FILE.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def save_progress(progress):
    PROGRESS_FILE.write_text(json.dumps(progress, indent=2))


def read_topics():
    try:
        lines = TOPICS_FILE.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError:
        lines = []
    topics = [l.strip() for l in lines if l.strip() and not l.strip().startswith("#")]
    return topics or ["The water cycle"]


# ---------------------------------------------------------------- study modes

def flashcards(link, deck, progress):
    """Flashcards with spaced repetition (Leitner boxes).

    Cards you got wrong are in box 1 and come first. Get one right and it moves up a box;
    miss it and it drops back to box 1 and comes back again in a few cards.
    """
    boxes = progress.setdefault(slug(deck["topic"]), {})
    cards = list(deck["cards"])
    random.shuffle(cards)
    cards.sort(key=lambda c: boxes.get(c["front"], 1))  # weakest first
    queue = list(cards)
    total = len(cards)
    first_try = 0
    tried = set()
    streak = best = 0

    while queue:
        card = queue.pop(0)
        front = card["front"]
        box = boxes.get(front, 1)
        header = f"CARD  {len(queue) + 1} left  [{box}/5]"
        showing_back = False
        while True:
            if showing_back:
                screen(link, header, wrap(card["back"]), "[B]got it [C]missed")
            else:
                screen(link, header, wrap(front), "[A]flip      [D]menu")
            b = link.button()
            if b == "D":
                save_progress(progress)
                return
            if b == "A":
                showing_back = not showing_back
            elif showing_back and b in "BC":
                break

        if b == "B":
            boxes[front] = min(box + 1, MAX_BOX)
            streak += 1
            best = max(best, streak)
            if front not in tried:
                first_try += 1
            link.beep("S" if streak % STREAK_EVERY == 0 else "G")
        else:
            boxes[front] = 1
            streak = 0
            queue.insert(min(3, len(queue)), card)  # see it again soon
            link.beep("X")
        tried.add(front)
        save_progress(progress)

    mastered = sum(1 for c in deck["cards"] if boxes.get(c["front"], 1) >= 4)
    screen(link, "DECK DONE!", [
        f"First try: {first_try}/{total}",
        f"Best streak: {best}",
        f"Mastered: {mastered}/{total}",
        "",
        "Come back tomorrow!",
    ], "[any button] menu")
    link.button()


def option_lines(options):
    """Fit 4 answer choices into 7 rows, giving extra rows to the longest ones."""
    wrapped = [textwrap.wrap(clean(o), COLS - 2) or [""] for o in options]
    rows = [1, 1, 1, 1]
    spare = BODY - 4
    while spare:
        needy = [i for i in range(4) if len(wrapped[i]) > rows[i]]
        if not needy:
            break
        i = max(needy, key=lambda k: len(wrapped[k]) - rows[k])
        rows[i] += 1
        spare -= 1
    lines = []
    for i, (w, n) in enumerate(zip(wrapped, rows)):
        part = w[:n]
        if len(w) > n:
            part[-1] = part[-1][:COLS - 5].rstrip() + "..."
        lines.append(f"{'ABCD'[i]} {part[0]}")
        lines.extend("  " + p for p in part[1:])
    return lines


def quiz(link, deck):
    questions = list(deck.get("quiz", []))
    if not questions:
        message(link, "NO QUIZ", "This deck has no quiz questions. Try 'New deck'.")
        return
    random.shuffle(questions)
    score = 0
    for n, q in enumerate(questions, 1):
        screen(link, f"QUIZ {n}/{len(questions)}", wrap(q["question"]), "[any] see answers")
        link.button()
        screen(link, f"Q{n}: press A-D", option_lines(q["options"]))
        picked = "ABCD".index(link.button())
        right = picked == q["answer"]
        if right:
            score += 1
            link.beep("G")
        else:
            link.beep("X")
        answer = f"Answer {'ABCD'[q['answer']]}: {q['options'][q['answer']]}"
        screen(link, "CORRECT!" if right else "NOT QUITE",
               wrap(answer) + [""] + wrap(q.get("explanation", "")), "[any button] next")
        link.button()

    if score == len(questions):
        link.beep("S")
    screen(link, "QUIZ DONE!", [f"Score: {score}/{len(questions)}", "",
                                "Perfect!" if score == len(questions) else "Try again soon!"],
           "[any button] menu")
    link.button()


# ---------------------------------------------------------------- main

def main():
    parser = argparse.ArgumentParser(description="Cram Box study device (Raspberry Pi side)")
    parser.add_argument("--api", default=os.environ.get("CRAM_API"),
                        help="your Cram Arcade website, e.g. https://cram-arcade.vercel.app")
    parser.add_argument("--port", default="auto", help="Arduino port (auto, /dev/ttyACM0, COM3...)")
    parser.add_argument("--sim", action="store_true", help="no hardware: draw the screen in the terminal")
    args = parser.parse_args()
    if not args.api:
        sys.exit("Tell me where Cram Arcade is, e.g.  --api https://cram-arcade.vercel.app")

    link = SimLink() if args.sim else ArduinoLink(args.port)
    progress = load_progress()

    while True:
        topics = read_topics()
        t = choose(link, "CRAM BOX", topics)
        if t is None:
            continue
        topic = topics[t]
        while True:
            m = choose(link, topic, ["Flashcards", "Quiz", "New deck (redo)", "Back"])
            if m is None or m == 3:
                break
            try:
                deck = load_deck(args.api, topic, link, fresh=(m == 2))
            except RuntimeError as e:
                message(link, "PROBLEM", str(e))
                continue
            if m == 0:
                flashcards(link, deck, progress)
            elif m == 1:
                quiz(link, deck)
            else:
                progress.pop(slug(topic), None)  # new cards, so start fresh
                save_progress(progress)
                message(link, "NEW DECK READY", f"{len(deck['cards'])} new cards for {topic}.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nBye!")
