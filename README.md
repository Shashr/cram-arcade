# Cram Arcade

Paste your class notes or type a topic, and Cram Arcade uses AI (Claude) to turn it into:

- **Flashcards** you can flip, shuffle, and sort into "got it" and "still learning"
- **A multiple-choice quiz** with explanations for every answer
- **A timed matching game** that tracks your best time

**Live site:** _add your Vercel link here_

## How it works

```
Browser (index.html, app.js)  ──POST /api/generate──▶  Serverless function (api/generate.js)  ──▶  Claude API
        ▲                                                         │
        └──────────── JSON study set (cards + quiz) ◀──────────────┘
```

- The front end is plain HTML, CSS, and JavaScript with no framework.
- The API key lives only on the server (`api/generate.js`), so visitors can never see it.
- The server asks Claude for a strict JSON format, then validates every flashcard and quiz
  question before sending it to the browser (it rejects questions without exactly 4 options
  or with an invalid answer index).
- Basic abuse protection: input is capped at 8,000 characters and each visitor can make
  10 study sets per hour.

## Run it on your computer

1. Install [Node.js](https://nodejs.org) (version 18 or newer).
2. Copy `.env.example` to a new file called `.env` and paste your Anthropic API key into it.
3. In a terminal in this folder, run `npm start`.
4. Open http://localhost:3000

## Deploy

The site is hosted on [Vercel](https://vercel.com). Vercel serves the static files and runs
`api/generate.js` as a serverless function. The API key is stored as the environment
variable `ANTHROPIC_API_KEY` in the Vercel project settings.

## What I learned / what's next

_Write this part yourself: what was hard, what you'd change, features you want to add
(for example: spaced repetition, saving sets, uploading PDFs)._

## Credits

Built with help from Claude (Anthropic) as a coding assistant.
