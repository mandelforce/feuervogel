# Skill bots: brief for the builder

Status: brief, nothing built. Written for the agent that builds it. A second agent reviews the result; keep the report short and the numbers exact.

## Goal

Three test bots, **rookie**, **veteran** and **ace**, that stand for player types. They are the existing dodging bot with human limits as numbers, not machine learning. Later their numbers on a level say whether it is too easy or too hard (the Daily Sortie's flight gate, `docs/daily-sortie-plan.md` section 3 and decision 8).

Read first: `CLAUDE.md` (large-file rules, no `//` in page code), `tests/harness.js` (whole, 16 KB), `tests/daily-baseline.mjs` (how to fly and measure), and in `tests/README.md` only "Balance on the real Campaign". Do not read `index.html` beyond what you grep for.

## Step 1 (this task): the knobs and mortal flights

No game code changes. Everything goes in `tests/`. `index.html`, `sw.js`, `tools/` stay untouched, so no version bump.

1. **`tests/skill-bot.js`**, loaded after `harness.js` the same way (`window.__sf(src)`). It adds `SF.skill(profile)` and wraps the bot the way `SF.human` does. A profile is plain numbers:
   - `see`: frames the bot's view of bullets and enemies is behind (reaction delay). Keep a short ring buffer of positions.
   - `hold`: frames a movement decision is held (what `SF.human`'s `lag` does today).
   - `ahead`: how many frames it looks ahead (today fixed: 1, 3, 5, 8, 12, 16).
   - `track`: how many bullets it can mind at once (the nearest N; the rest are not seen).
   - `err`: aim and movement error, growing with the bullets on screen. From a **seeded** stream of the bot's own (never `Math.random`, never the game's streams), so a flight repeats exactly and changes nothing in the simulation but the keys.
   - `nova`: when it uses a Nova: `never`, `panic` (only when cornered, late) or `well`.
   - `greed`: how far it leaves its place for a pickup.
   - `seed`: for `err`.
   Three starting profiles, `SF.SKILL.rookie / veteran / ace`, as honest first guesses with one line each on why.
2. **Mortal flights.** `harness.js` has `SF.setMode('real')`: the ship dies, lives and continues count. Fly with real lives and no continue (stop at the continue prompt: `SF.run` returns `continue-screen`), and also immortal (counts every hit, no survivorship bias).
3. **`tests/skill-bots.mjs`** (Node, Playwright): flies the six Campaign levels (`startEnigma(level, true, 0)`, each on its own, first pass) and, with `--daily DATE`, a Daily Sortie (`startDaily(date)`), for each bot on its own difficulty (rookie on 0, veteran on 1, ace on 2) and with `--cross` on the other two. `--seeds N` (default 8) flights per cell with different bot seeds. Per cell it reports, as median and range over the seeds:
   - mortal: cleared (share of flights), deaths, lives left when the boss comes, Novas used, the second and cause of each death (`SF.R.hits` has `t`, `cause`, `why`);
   - immortal: hits per minute before the boss, hits during the boss;
   - how long one flight takes.
   `--save file.json` writes it all. Prints one table. Exit 0 always: it measures.
4. **Checks that the bots are bots of three kinds**, printed as PASS or FAIL lines (do not tune until they pass; report what you see):
   - on every level and on its own difficulty, rookie dies at least as often as veteran, veteran as ace (medians), each flown on the **same** difficulty too (`--cross`);
   - the same profile and seed gives the same flight twice, in two fresh pages;
   - with every knob at its neutral value the bot is the plain harness bot: identical flight to `SF.human(0, 15)` without `SF.skill`.

## Things that cost the last agent time

- **Playwright**: `import { chromium } from 'playwright'` needs `/home/user/node_modules/playwright` to resolve. If it does not: `mkdir -p /home/user/node_modules && ln -sfn /opt/node-tools/node_modules/playwright /home/user/node_modules/playwright && ln -sfn /opt/node-tools/node_modules/playwright-core /home/user/node_modules/playwright-core`. Chromium is pre-installed; never run `playwright install`.
- Serve with `python3 -m http.server 8000` from the repo root.
- Call `if (app.booting) finishBoot();` before starting a flight, or the boot splash eats a different number of frames each time and flights do not repeat.
- `SF.run(n)` only notices a level change inside one call. After each call check `run.sortie.level` yourself (see `daily-baseline.mjs`).
- A whole level is about 6 s of wall time at full speed. Two pages at once is fine on this machine (4 cores).
- Viewport 1000x760 (playfield height 320), as the baselines use. The height changes how the game plays.
- Page code passed as a string: `/* */` comments only.
- Do not run `tests/replay.mjs`, `tests/resume-exact.mjs` or `tests/compose.mjs`; nothing here can change them.

## Not in this step

Fitting the profiles to real players (it needs the play-data export from the Worker's `runs` table, which the owner has to provide), the "fun band" per bot, and using the bots in the flight gate. Do not start them.

## Stop point

Commit to the branch you were given and push. Then report, in under 40 lines: the table for the six Campaign levels (own difficulty), the PASS/FAIL lines, the three profiles as you left them, flight time, and anything in this brief that turned out wrong or that you could not do. Say plainly what you did not run.
