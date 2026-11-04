// Cram Box - Arduino side (Arduino Uno R3)
//
// The Arduino is the "hardware controller". It does three jobs:
//   1. Draws whatever screen the Raspberry Pi sends it on the OLED
//   2. Reads the 4 buttons and tells the Pi when one is pressed
//   3. Plays sounds on the buzzer when the Pi asks
// All the study logic (cards, scores, spaced repetition) lives on the Pi.
//
// Library needed: "SSD1306Ascii" by Bill Greiman
//   (Arduino IDE > Tools > Manage Libraries > search SSD1306Ascii > Install)
//
// Messages (one per line, 115200 baud):
//   Pi -> Arduino   S|header|line1|line2|...   draw a screen (header + up to 7 lines)
//                   B|G  B|X  B|S              beep: good / wrong / streak
//                   P                          ping
//   Arduino -> Pi   READY                      just started up
//                   OK                         finished the last message (so the Pi can send the next)
//                   PONG                       answer to a ping
//                   BTN|A  (B, C, D)           a button was pressed

#include <Wire.h>
#include "SSD1306Ascii.h"
#include "SSD1306AsciiWire.h"

// ---------- Settings you might need to change ----------
#define OLED_ADDRESS 0x3C          // almost all OLEDs use 0x3C; a few use 0x3D
#define OLED_TYPE Adafruit128x64   // 0.96" screen. For a 1.3" screen change to SH1106_128x64
const uint8_t BUTTON_PINS[4] = {2, 3, 4, 5};   // buttons A, B, C, D
const uint8_t BUZZER_PIN = 8;
const bool CLICK_ON_PRESS = true;              // tiny click sound on every button press
// -------------------------------------------------------

const char BUTTON_NAMES[4] = {'A', 'B', 'C', 'D'};
const uint8_t SCREEN_COLS = 21;   // 128 px wide / 6 px per character
const uint8_t SCREEN_ROWS = 8;    // 64 px tall / 8 px per row
const unsigned long DEBOUNCE_MS = 30;

SSD1306AsciiWire oled;

bool pressed[4] = {false, false, false, false};      // debounced state
bool lastReading[4] = {false, false, false, false};  // raw reading last loop
unsigned long lastChangeAt[4] = {0, 0, 0, 0};

char message[230];          // one incoming line from the Pi
uint8_t messageLen = 0;
bool tooLong = false;

// Write one row of text, padded with spaces so old text is erased.
void drawRow(uint8_t row, const char* text, uint8_t len, bool inverted) {
  oled.setCursor(0, row);
  oled.setInvertMode(inverted);
  uint8_t i = 0;
  for (; i < len && i < SCREEN_COLS; i++) oled.write(text[i]);
  for (; i < SCREEN_COLS; i++) oled.write(' ');
  oled.setInvertMode(false);
}

// fields looks like "header|line1|line2". Row 0 (the header) is drawn white-on-black.
void drawScreen(const char* fields) {
  const char* start = fields;
  bool more = true;
  for (uint8_t row = 0; row < SCREEN_ROWS; row++) {
    if (!more) {
      drawRow(row, "", 0, row == 0);
      continue;
    }
    const char* bar = strchr(start, '|');
    uint8_t len = bar ? (uint8_t)(bar - start) : (uint8_t)strlen(start);
    drawRow(row, start, len, row == 0);
    if (bar) start = bar + 1;
    else more = false;
  }
}

void beep(char kind) {
  switch (kind) {
    case 'G':  // got it right: two rising notes
      tone(BUZZER_PIN, 1319, 70); delay(90);
      tone(BUZZER_PIN, 1760, 110); delay(120);
      break;
    case 'X':  // wrong: low buzz
      tone(BUZZER_PIN, 196, 260); delay(270);
      break;
    case 'S':  // streak: little fanfare
      tone(BUZZER_PIN, 1047, 80); delay(95);
      tone(BUZZER_PIN, 1319, 80); delay(95);
      tone(BUZZER_PIN, 1568, 80); delay(95);
      tone(BUZZER_PIN, 2093, 180); delay(190);
      break;
  }
  noTone(BUZZER_PIN);
}

void handleMessage(char* msg) {
  if (msg[0] == 'S' && msg[1] == '|') {
    drawScreen(msg + 2);
  } else if (msg[0] == 'B' && msg[1] == '|') {
    beep(msg[2]);
  } else if (msg[0] == 'P' && msg[1] == '\0') {
    Serial.println("PONG");
    return;
  } else {
    return;  // unknown message: ignore it
  }
  Serial.println("OK");  // tell the Pi we're ready for the next message
}

void readSerial() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      if (!tooLong && messageLen > 0) {
        message[messageLen] = '\0';
        handleMessage(message);
      } else if (tooLong) {
        Serial.println("OK");  // still answer so the Pi doesn't get stuck
      }
      messageLen = 0;
      tooLong = false;
    } else if (messageLen < sizeof(message) - 1) {
      message[messageLen++] = c;
    } else {
      tooLong = true;
    }
  }
}

void readButtons() {
  unsigned long now = millis();
  for (uint8_t i = 0; i < 4; i++) {
    bool reading = digitalRead(BUTTON_PINS[i]) == LOW;  // pressed = connected to GND
    if (reading != lastReading[i]) {
      lastReading[i] = reading;
      lastChangeAt[i] = now;
    } else if (reading != pressed[i] && now - lastChangeAt[i] > DEBOUNCE_MS) {
      pressed[i] = reading;
      if (reading) {
        Serial.print("BTN|");
        Serial.println(BUTTON_NAMES[i]);
        if (CLICK_ON_PRESS) tone(BUZZER_PIN, 2500, 8);
      }
    }
  }
}

void setup() {
  Serial.begin(115200);
  for (uint8_t i = 0; i < 4; i++) pinMode(BUTTON_PINS[i], INPUT_PULLUP);
  pinMode(BUZZER_PIN, OUTPUT);

  Wire.begin();
  Wire.setClock(400000L);
  oled.begin(&OLED_TYPE, OLED_ADDRESS);
  oled.setFont(System5x7);
  oled.clear();
  drawScreen("CRAM BOX||Waiting for the|Raspberry Pi...||Buttons work? Press|one: it should click.");

  Serial.println("READY");
}

void loop() {
  readSerial();
  readButtons();
}
