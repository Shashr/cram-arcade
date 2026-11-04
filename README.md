# Cram Arcade

Paste your class notes or type a topic, and Cram Arcade uses AI (Claude) to turn it into:

- **Flashcards** you can flip, shuffle, and sort into "got it" and "still learning"
- **A multiple-choice quiz** with explanations for every answer
- **A timed matching game** that tracks your best time
- **A boss battle**: your study set becomes a boss with a health bar. Right answers deal
  damage (fast answers are critical hits, streaks build combos), wrong answers cost you a
  heart, and the boss gets enraged at half health. Questions you miss come back mid-fight
  and are listed for review at the end.
- **Type your own set** for free (no AI): add cards one by one or paste a list
  (`term - answer`, one per line; Quizlet exports work). A quiz is made from your cards.
- **Saved sets**: every set you make is saved in your browser so you can come back to it.
- Sound effects (with an on/off switch), confetti, and game-style animations.
- **Tickets and the prize counter**: win arcade tickets in every game (most from boss
  battles) and spend them on power-ups (extra heart, time freeze, 50/50) and nameplates.
  Replaying the same set on the same day earns fewer tickets.
- **Sign in with Google** to keep tickets, sets, tests and records on every device.
- **Upcoming tests**: connect Google Calendar (read-only) to find tests automatically, or add
  them by hand. Each test gets a countdown, a linked study set, and a downloadable study plan
  (a calendar file with an evening session for each of the days before the test).
- **Crew leaderboards**: start a crew, share the 5-letter code, and compete with friends
  for the most tickets this week and all time.

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
the files in `api/` as serverless functions. The API key is stored as the environment
variable `ANTHROPIC_API_KEY` in the Vercel project settings.

### Turning on crew leaderboards online

Crews need a small database so friends' scores are shared. Without one, the leaderboard
runs in **test mode** (only on one computer, wiped when the server restarts).

1. In your Vercel project, open the **Storage** tab and click **Create Database**.
2. Pick **Upstash for Redis** (free plan) and connect it to this project.
3. Vercel adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` to the project automatically.
4. Go to **Deployments** and **Redeploy** the latest one.

`api/crew.js` also accepts `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` if you
create the database on upstash.com directly. Scores come from players' browsers, so a
determined friend could fake theirs; the server caps how many tickets one report can add.

### Google sign-in and calendar

Optional. Without it, everything still works on one device, and tests can be added by hand.

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a project
   called "Cram Arcade".
2. **APIs & Services → Library**: search for **Google Calendar API** and click **Enable**.
3. **Google Auth Platform → Branding** (called "OAuth consent screen" in some versions): app
   name "Cram Arcade" and your email. **Audience**: External. While the app is in
   **Testing**, add each person who will sign in (you and your friends, up to 100) under
   **Test users**.
4. **Data Access**: add the scope `.../auth/calendar.readonly`.
5. **Clients → Create client → Web application**. Under **Authorized JavaScript origins**
   add `http://localhost:3000`, `http://localhost`, and your Vercel link
   (like `https://cram-arcade.vercel.app`). Copy the **Client ID**.
6. In `.env` (and in Vercel's Environment Variables):
   - `GOOGLE_CLIENT_ID` = the Client ID
   - `SESSION_SECRET` = any long random text (keep it the same once set)
7. Sign-in sync needs the database from the section above when the site is online.

To open the app to everyone (not just test users), Google has to review it because of the
calendar permission. Sign-in by itself (name, email, picture) doesn't need a review.

The calendar is only read in the browser: event names and dates of tests you choose to
track are saved, nothing else.

## What I learned / what's next

_Write this part yourself: what was hard, what you'd change, features you want to add
(for example: spaced repetition, saving sets, uploading PDFs)._

## Credits

Built with help from Claude (Anthropic) as a coding assistant.
