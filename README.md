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
- **Sign in with Microsoft or Google** to keep tickets, sets, tests and records on every device.
- **Upcoming tests**: connect Outlook or Google Calendar (read-only) to find tests automatically, or add
  them by hand. Each test gets a countdown, a linked study set, and a downloadable study plan
  (a calendar file with an evening session for each of the days before the test).
- **Calendar and study sessions**: a month calendar inside the app for tests and study
  sessions. "Plan study sessions" adds an evening session before each test; a banner and a
  pop-up remind you when the app is open (plus a browser notification if you allow it), and
  finishing a session earns tickets. Sessions can also be added to your phone's calendar.
- **Teacher mode (Classroom)**: a teacher creates a class from their study sets and shares a
  6-character code. Students join with the code and their first name, and their quiz, boss
  battle and flashcard results on the assigned sets show up on the teacher's dashboard, along
  with **trouble spots**: the questions the class misses most. Uses the same database as crews.
  The dashboard has an **Overview** (games played per day, students by best quiz score),
  a **Students** table where each name opens that student's page (scores over time, the
  questions they miss, recent games), and a **Questions** tab ranking every question by
  how often it's answered wrong.
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

### Microsoft sign-in, Outlook and Teams

Optional. Lets students and teachers sign in with their school Microsoft account and find
tests in their Outlook calendar. "Share to Teams" and join links work without any setup.

1. Go to the [Microsoft Entra admin center](https://entra.microsoft.com) (a free personal
   Microsoft account works) and open **App registrations → New registration**.
2. Name: "Cram Arcade". **Supported account types**: "Accounts in any organizational
   directory and personal Microsoft accounts".
3. **Redirect URI**: choose **Single-page application (SPA)** and enter
   `http://localhost:3000/`. Later add your Vercel link too (like `https://cram-arcade.vercel.app/`)
   under **Authentication**. It must be the SPA type, ending with `/`.
4. **API permissions → Add a permission → Microsoft Graph → Delegated**: `User.Read`
   (already there) and `Calendars.Read`.
5. Copy the **Application (client) ID** from the Overview page into `.env` and Vercel as
   `MICROSOFT_CLIENT_ID`, and set `SESSION_SECRET` (any long random text).

**School accounts:** many school boards only allow apps their IT team has approved. If a
student sees "Your school needs to approve Cram Arcade", a teacher can ask IT to grant
admin consent for the app (they'll need the client ID). Personal accounts work right away.

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

## Install it as an app (Android)

Cram Arcade is an installable web app: it has an app icon, opens full-screen, and works
offline (study sets you've saved still play with no internet).

- **On a phone:** open the site in Chrome and tap **Install app** at the top (or Chrome's
  menu → **Install app** / **Add to Home screen**).
- **On a computer:** Chrome or Edge shows an install icon in the address bar.

`manifest.webmanifest` describes the app, `sw.js` handles offline use, and the icons are in
`icons/`. When you change the app, bump `VERSION` in `sw.js` so installed copies refresh.

### The Android app (Capacitor)

The same code also builds a real Android app with [Capacitor](https://capacitorjs.com).
The page files ship inside the app (so it opens instantly and works offline), and the
app calls the live server at cram-arcade.vercel.app for AI sets, crews and classes.
On top of the website, the app adds:

- **Phone notifications that arrive even when the app is closed:** each planned study
  session, 4 PM the day before a test, and 7 AM on test day. Tapping one opens the right game.
- **Vibration** in the games (hits, misses, wins).
- **Android's back button** closes panels before leaving the app.

Signing in inside the app is coming next (Google blocks its web sign-in inside apps).

**How people get it:** every time the app's code changes on `main`, GitHub builds the
Android app in the cloud (`.github/workflows/android.yml`) and saves it to
`downloads/cram-arcade.apk`, which Vercel puts on the website. Android visitors see a
**Get the app** card, and installed apps show an **Update** button when a newer build is
out. No Android Studio needed. The signing key is in `android-signing/`.

**Building it yourself instead** (optional; needs [Node.js](https://nodejs.org) 22+ and
[Android Studio](https://developer.android.com/studio)):

```
npm install
npm run android:setup
npm run android
```

`android:setup` creates the `android/` folder, the app icons and the notification icon
(run it once). `npm run android` copies your latest changes into the app and opens Android
Studio. Plug in your phone with USB debugging on (or use an emulator) and press **Run ▶**.

After changing `index.html`, `app.js` or `style.css`, run `npm run android` again. Changes to
`api/` only need a push to GitHub, because the app uses the live server.

The source images for the icon and splash screen are in `assets/`.

### Publishing on Google Play

These steps package the website version with PWABuilder. For the Capacitor app, build the
`.aab` in Android Studio instead (**Build → Generate Signed App Bundle**) and skip steps 3–4.

1. **Put the site online** on Vercel first (see Deploy). Google Play needs a real https link.
2. **Create a Play Console account** at [play.google.com/console](https://play.google.com/console):
   one-time US$25 fee, and the account owner must be 18+ with ID (a parent can own it).
3. **Package the app** at [pwabuilder.com](https://www.pwabuilder.com): enter your Vercel link,
   choose **Package for stores → Android**, and download the zip. It contains the `.aab` file
   to upload, your **signing key** (back it up somewhere safe; you need it for every update),
   and an `assetlinks.json` file.
4. **Prove you own the site:** put that `assetlinks.json` in this project at
   `.well-known/assetlinks.json` and push. This makes the app open without a browser bar.
5. **In Play Console:** create the app, fill in the store listing (description, screenshots,
   icon), content rating, target audience, data safety form, and a privacy policy link.
6. **Closed test:** new personal accounts must run a closed test with **at least 12 testers
   opted in for 14 days in a row** before going public. Classmates make great testers.
7. **Apply for production** from the Dashboard. Google usually replies within a week.

## What I learned / what's next

_Write this part yourself: what was hard, what you'd change, features you want to add
(for example: spaced repetition, saving sets, uploading PDFs)._

## Credits

Built with help from Claude (Anthropic) as a coding assistant.

## License

© 2026 Shashank J Reddy. All rights reserved. This code is not open source: it may not be copied, modified, distributed or sold without written permission. See [LICENSE](LICENSE), and the app's [Terms of Use](terms.html) and [Privacy Policy](privacy.html).
