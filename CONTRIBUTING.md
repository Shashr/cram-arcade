# Working on Cram Arcade

This guide is for anyone helping build Cram Arcade. Read it once before your first change.

## Set up your computer (once)

1. Install [Node.js](https://nodejs.org) 22 or newer, [Git](https://git-scm.com/downloads) and
   [VS Code](https://code.visualstudio.com).
2. Get the code. In VS Code: **Ctrl+Shift+P → Git: Clone**, paste
   `https://github.com/Shashr/cram-arcade.git`, pick a folder, then click **Open**.
3. Open VS Code's terminal (**Ctrl+`**) and run:
   ```
   npm install
   npx playwright install chromium
   ```
4. VS Code offers a few recommended extensions (EditorConfig, GitHub Pull Requests, Live Share).
   Install them.

## Run the app

- **Free mode (no keys needed):** `npm run dev`, then open http://localhost:3000.
  AI study sets come from a fake AI that always returns a small Cell Biology set, and accounts,
  crews and classes are kept in memory. Google sign-in doesn't work in this mode.
- **Real AI:** copy `.env.example` to `.env`, put your own Anthropic API key in it, and run
  `npm start`. Never share or commit your `.env`.
- Or use VS Code's **Run and Debug** panel (Ctrl+Shift+D), which has a button for each.

## Test before you push

```
npm test
```

This plays through the main features in a hidden browser: making a set, the quiz, a boss battle,
crews, classes, sign-in and deleting an account, the AI protections and the phone layout. It's
free and takes about 20 seconds. Everything should say PASS.

## How changes go live

- **Every push to `main` goes live immediately:** Vercel updates https://cram-arcade.vercel.app,
  and GitHub rebuilds the Android app. So don't push straight to `main`.
- **Work on a branch instead:** in VS Code, click the branch name in the bottom-left corner →
  **Create new branch** (for example `add-streaks`). Commit and push there. Vercel gives every
  branch its own preview link, so you can try your change online without touching the real site. (AI sets and Google
  sign-in only work on the real site, so test those with `npm run dev` on your computer.)
- **Open a pull request** on GitHub when it's ready. Shashank reviews it and merges it into `main`.

## Where things are

| File or folder | What it does |
|---|---|
| `index.html` | The page: app bar, player card, tests, the set maker, the four game screens |
| `app.js` | Everything that happens in the browser: games, tickets, prizes, crews, classes, calendar, sign-in, animations |
| `style.css` | The whole look. Colour tokens are at the top (`--yellow`, `--blue`, …) |
| `api/generate.js` | Makes AI study sets with Claude |
| `api/_aiguard.js` | Limits and the spending budget for AI. **Every AI call must go through it.** |
| `api/account.js` | Google sign-in, saving progress, deleting accounts |
| `api/crew.js`, `api/classroom.js` | Crew leaderboards and teacher classes |
| `api/_db.js` | The database (Upstash Redis online, memory when testing) |
| `server.js` | Runs the site on your computer, the same way Vercel does online |
| `vercel.json` | Security headers and download settings for the live site |
| `sw.js` | Lets the app work offline |
| `tests/` | The fake AI and Google services, `npm run dev` and the smoke test |
| `scripts/`, `capacitor.config.json` | Builds the Android app |
| `device/` | Cram Box, the Arduino and Raspberry Pi desk device |
| `privacy.html`, `terms.html` | Update these if you change what data the app keeps |

## Rules that keep the app safe

- **No secrets in the code.** API keys go in `.env` on your computer and in Vercel's settings,
  never in a file you commit.
- **Show text from users with `textContent`, not `innerHTML`.** Names, set titles and notes can
  contain anything.
- **New AI features must use `reserve()` and `settle()` from `api/_aiguard.js`,** so the daily
  limits and the dollar budget still apply.
- **Clean anything a user sends to the server** (see `clean()` and `validPlayer()` in
  `api/classroom.js`) and cap its length.
- **If you store a new kind of data,** add it to the privacy policy and make sure
  "Delete my account" removes it.

## Keep the look consistent

- Each game has one colour everywhere: Flashcards yellow, Quiz blue, Match green, Boss red.
- Buttons sit on a ledge (`box-shadow: 0 4px 0 …`) and sink when pressed; use the `.btn` classes.
- Headings and scores use Bungee (`var(--sign)`); everything you read uses Atkinson Hyperlegible.
- Check your change at phone width too, and with "reduce motion" turned on.

## Working together live

With the **Live Share** extension, one person clicks **Live Share** in the status bar and sends
the link. The other person joins and edits the same files in their own VS Code at the same time.

## Permission

Cram Arcade's code is copyrighted by Shashank J Reddy (see `LICENSE`). Being added as a
collaborator on the GitHub repository is your permission to change it for this project.
