# Cram Box: the hardware side of Cram Arcade

A small desk device that quizzes you away from your phone. It pulls AI-made flashcards
and quiz questions from the Cram Arcade website, shows them on a little screen, and you
answer with 4 buttons. Cards you miss come back sooner (spaced repetition).

```
Cram Arcade website ──Wi-Fi──▶ Raspberry Pi ──USB serial──▶ Arduino Uno ──▶ OLED screen, buzzer
  (/api/generate)               "the brain"                 "the controller" ◀── 4 buttons
                                study logic, saved decks,
                                spaced repetition
```

**Why two boards?** The Pi runs Linux, so it's good at Wi-Fi, web requests and saving files,
but it's not great at reacting to buttons instantly. The Arduino has no operating system,
so it reacts instantly and controls hardware directly. They talk using a small text
protocol I designed (the full list of messages is at the top of `arduino/cram_box/cram_box.ino`).
The Arduino replies `OK` after every message, because the Uno only has a 64-byte input
buffer and messages sent while it was busy drawing would get cut off.

---

## 1. Shopping list

You already have the **Arduino Uno R3** and its USB cable.

| Part | What to search for | About (CAD) |
|---|---|---|
| Raspberry Pi | **Raspberry Pi 4 Model B (2GB)** is easiest. A Pi 3B+ works too. A Pi Zero 2 W works but also needs a **micro-USB OTG adapter** to plug in the Arduino. | $60–80 |
| Pi power supply | Official Raspberry Pi USB-C power supply (for Pi 4) | $15 |
| microSD card | 16GB or 32GB, Class 10 / A1 | $10 |
| OLED screen | **0.96" I2C OLED 128x64 SSD1306, 4 pins** (GND, VCC, SCL, SDA). Make sure it's the **4-pin I2C** kind, not 7-pin SPI. | $8–12 |
| Buttons | **12mm tactile push buttons** (a pack). Any 4-leg push buttons are fine. | $5 |
| Buzzer | **Passive piezo buzzer** (passive can play different notes; active only beeps one note) | $3 |
| Breadboard | Half-size or full-size breadboard | $5 |
| Wires | Male-to-male jumper wires (a pack of 40) | $5 |

Amazon.ca, Canada Robotix, Elmwood Electronics, Digikey, or a "starter kit" all have these.
Many Arduino starter kits already include the buttons, buzzer, breadboard and wires.

**Optional later:** a USB power bank (5V, 3A) to make it portable, a case
(cardboard to start, 3D-printed later).

---

## 2. Wiring (Arduino only, the Pi just plugs in with USB)

Unplug the Arduino from USB while you wire.

**OLED screen**

| OLED pin | Arduino pin |
|---|---|
| GND | GND |
| VCC | 5V |
| SCL | A5 |
| SDA | A4 |

**Buttons:** put each button across the gap in the middle of the breadboard.
Connect one leg to the Arduino pin below, and the leg **diagonally opposite** to GND.
(Use the breadboard's long side rail as a shared GND: one wire from Arduino GND to the rail.)

| Button | Arduino pin | What it does |
|---|---|---|
| A | 2 | flip card / menu up |
| B | 3 | got it / menu down |
| C | 4 | missed it / menu select |
| D | 5 | menu / back |

In quizzes, A/B/C/D pick the answer with that letter.

**Buzzer:** longer leg (+) to **pin 8**, shorter leg (−) to **GND**.

No resistors are needed: the code turns on the Arduino's built-in "pull-up" resistors for the buttons.

```
            Arduino Uno
          ┌─────────────┐
 OLED SCL ┤A5         2 ├── Button A ──┐
 OLED SDA ┤A4         3 ├── Button B ──┤
 OLED VCC ┤5V         4 ├── Button C ──┼── GND rail
 OLED GND ┤GND        5 ├── Button D ──┤
          │           8 ├── Buzzer + ──┘ (buzzer − to GND)
          └─────┬───────┘
               USB ──▶ Raspberry Pi (or your laptop for testing)
```

---

## 3. Put the code on the Arduino (on your laptop)

1. Install the **Arduino IDE** from arduino.cc/en/software.
2. Open it, go to **Tools → Manage Libraries**, search **SSD1306Ascii** (by Bill Greiman), click **Install**.
3. **File → Open** → `device/arduino/cram_box/cram_box.ino`.
4. Plug in the Arduino. **Tools → Board → Arduino Uno**. **Tools → Port** → pick the one that says Arduino (on Windows it's like `COM3`).
5. Click the **→ Upload** button.

**Check it works:**
- The screen should say *"CRAM BOX ... Waiting for the Raspberry Pi"*.
- Press each button: you should hear a click.
- Open **Tools → Serial Monitor**, set it to **115200 baud** and **Newline**. Each button press should print `BTN|A`, `BTN|B`, etc.
  Type `S|HELLO|it works!` and press Enter: the screen should change. Type `B|S` for a sound.

**Screen stays blank?** Check the 4 OLED wires. If it's a 1.3" screen, change `Adafruit128x64`
to `SH1106_128x64` near the top of the code. If still blank, change `0x3C` to `0x3D`.

---

## 4. Put Cram Arcade online (so the Pi can reach it)

The Pi gets cards from your website, so it has to be on the internet.

1. Push the latest code to GitHub (including this `device` folder).
2. Go to **vercel.com** and sign in with GitHub.
3. **Add New → Project** → import `cram-arcade`.
4. Before deploying, open **Environment Variables** and add `ANTHROPIC_API_KEY` = your key.
5. Click **Deploy**. You'll get a link like `https://cram-arcade-xxxx.vercel.app`. Open it and make sure making a study set works.
6. Put that link in the main README where it says *"add your Vercel link here"*.

**Shortcut for testing:** run `npm start` on your laptop and use `http://YOUR-LAPTOP-IP:3000`
as the link (find your IP with `ipconfig` on Windows). The Pi must be on the same Wi-Fi.

---

## 5. Optional: test everything on your laptop first

You can test before the Pi even arrives.

1. Install **Python** from python.org (tick "Add Python to PATH").
2. In a terminal in `device/pi`, run `pip install pyserial`.
3. **No hardware at all:** `python cram_box.py --api https://YOUR-SITE.vercel.app --sim`
   draws the screen in the terminal and you type a/b/c/d as buttons.
4. **With the Arduino plugged into the laptop** (close the Arduino IDE's Serial Monitor first):
   `python cram_box.py --api https://YOUR-SITE.vercel.app`

---

## 6. Set up the Raspberry Pi

1. On your laptop, install **Raspberry Pi Imager** (raspberrypi.com/software) and put the microSD card in.
2. Choose your Pi model → **Raspberry Pi OS Lite (64-bit)** → your SD card.
3. When it asks about **OS customisation**, click **Edit Settings**:
   - Hostname: `crambox`
   - Username: **`pi`** (keep it exactly `pi`), and a password you'll remember
   - Wi-Fi name and password, and Wi-Fi country **CA**
   - **Services** tab: turn on **SSH** (use password)
4. Write the card, put it in the Pi, plug in power. Wait about 2 minutes.
5. On your laptop, open a terminal (PowerShell) and connect: `ssh pi@crambox.local`
   (type `yes`, then your password).
6. On the Pi, copy and paste these one at a time:

```bash
sudo apt update && sudo apt install -y git python3-serial
git clone https://github.com/Shashr/cram-arcade
cd cram-arcade/device/pi
```

7. Plug the Arduino into the Pi's USB port and run it:

```bash
python3 cram_box.py --api https://YOUR-SITE.vercel.app
```

The screen should switch to the topic menu. Press **Ctrl+C** to stop.

**Make it start by itself whenever the Pi turns on:**

```bash
nano cram-box.service        # change YOUR-SITE to your real link, then Ctrl+O, Enter, Ctrl+X
sudo cp cram-box.service /etc/systemd/system/
sudo systemctl enable --now cram-box
```

Now just plug in the Pi and it's ready in about 30 seconds.
To see what it's doing: `journalctl -u cram-box -f`. After changing code: `sudo systemctl restart cram-box`.

**Change topics:** edit `topics.txt` (`nano topics.txt`), one topic per line. Restart isn't needed.

---

## 7. How to use it

- **Menu:** A = up, B = down, C = select, D = back.
- **Pick a topic** → Flashcards, Quiz, or New deck. The first time, it asks Cram Arcade to make
  the deck (about 20 seconds). After that it's saved on the Pi, so it works offline.
- **Flashcards:** A flips. Then B = got it, C = missed it. D goes back to the menu.
  The `[1/5]` at the top is the card's box: missed cards drop to box 1 and come back in a few cards;
  right answers move up. Box 4+ counts as mastered. You get a fanfare every 5 in a row.
- **Quiz:** read the question, press any button, then press the letter of your answer.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "No Arduino found" | Check the USB cable. On the Pi, `ls /dev/ttyACM*` should show something. Try `--port /dev/ttyACM0` (Pi) or `--port COM3` (Windows). |
| "The Arduino isn't answering" | Re-upload `cram_box.ino`. Close the Arduino IDE Serial Monitor (only one program can use the port). |
| "Can't reach the Cram Arcade website" | Open your link in a browser. Check the Pi's Wi-Fi: `ping google.com`. |
| "You've made a lot of study sets" | The website allows 10 new decks per hour. Wait, or use decks you already made. |
| Weird letters on the screen | The screen only has plain English characters. The Pi replaces most fancy ones automatically. |
| A button does nothing | Check that its other leg goes to GND, diagonally across the button. Rotate the button 90°. |

---

## Ideas for next versions

- **Sync progress back to the website** (a new API route + a small database) so the site shows what you've mastered.
- **Review reminders:** light up an LED when cards are due, based on time since last review.
- **Battery + case:** a power bank and a 3D-printed case to make it a true handheld.
- **Custom PCB:** replace the breadboard with a circuit board you design in KiCad.
