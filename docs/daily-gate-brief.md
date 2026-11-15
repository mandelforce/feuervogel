# Daily Sortie phase 3, the flight gate: brief for the builder

Status: brief, nothing built. A second agent reviews the result; keep the report short and the numbers exact.

## Where things stand (build 1.2.6.40)

Phases 0 to 2 of `docs/daily-sortie-plan.md` are done: the composer (`tools/sortie-compose.js`), the Daily Sortie in the game behind `?daily=DATE` (`startDaily`, `startComposed`), `tests/compose.mjs` (gates 1 and 2), `tests/daily.mjs`, the human-bot baselines (`tests/daily-baseline.json`, `tests/daily-baseline.mjs`) and the skill bots (`tests/skill-bot.js`, `tests/skill-bots.mjs`: rookie, veteran, ace; **not fitted to players yet**, so their numbers are data, not verdicts).

Read first: `CLAUDE.md`; in `docs/daily-sortie-plan.md` only section 3 (the three gates), "Phase 3", section 5 (decisions), 6.4 and 6.5 (baselines, what the plan had wrong) and 8 (what the game does); `tests/daily-baseline.mjs` and `tests/skill-bots.mjs` whole (they show how to fly and measure); the `tests/README.md` entries for the Daily Sortie and the skill bots. Do not read `index.html` beyond what you grep for.

## The task

`tests/daily-gate.mjs` (Node, Playwright), no game code changes, nothing outside `tests/` and `docs/`, no version bump.

```
node tests/daily-gate.mjs --from 2026-12-01 --days 14 [--diff 0,1,2] [--kit desert] [--out DIR]
node tests/daily-gate.mjs --sweep 200 [--kit desert]      # seeds instead of dates, for the report below
```

For each date (or seed) and difficulty it composes the sortie, runs gate 2 (`tests/kit-check.mjs`, as `compose.mjs` does) and flies it with the human bot (`SF.human(8, 15)`, immortal), then prints one line with every measure and PASS or FAIL.

**What fails a sortie** (hard, decided):
- a page error or a game error (`SF.R.errs`);
- gate 2 not clean;
- the boss does not come, or is not killed within 900 s;
- the flight does not end at the title;
- a planned encounter does not run to `done`, or the Shadow Wing does not come;
- two pages with different `Math.random` differ in spawns, score or end (check this on every date, but in a sweep only on every 10th seed);
- dead air: a stretch before the boss with no enemy on screen, no enemy bullet and no encounter that is longer than the limit. Take the limit from data: the longest such stretch in `tests/daily-baseline.json` is 7 s, so start at 10 s and report how many sorties it fails and where the stretches lie.

**What is only reported** (the owner has not set these; decision 8 in the plan):
- hits per minute before the boss, the worst 10 s bullet window, bullets before the boss, kills per minute, each next to the kit level's baseline range for that difficulty (`kits` in `tests/daily-baseline.json`), marked `low` / `in` / `high`. No FAIL from these.
- with `--bots`: the three skill bots on their own difficulty, mortal, 4 seeds each: cleared share, deaths per minute, lives when the boss comes. No FAIL from these either.

A failing date writes its cause and, with `--out`, its contact sheet (`tests/contact.mjs` takes `daily:DATE:KIT:SUB`).

## The sweep and the report (the stop point)

Budget: about 90 minutes of machine time. One flight is about 6 s; two pages at once.
- 200 seeds per kit on Veteran, human bot; 40 of them per kit on all three difficulties; determinism on every 10th.
- skill bots on 20 seeds per kit.

Report, in under 60 lines:
1. failures per kit and per cause (count of 200), with two example seeds per cause;
2. the dead-air numbers (the distribution of the longest stretch, and where it lies);
3. per kit and difficulty, the spread (5th, 50th, 95th percentile) of hits per minute, the bullet window and kills per minute over the composed sorties, next to the hand-made level's range;
4. the skill bots' spread per kit;
5. which composer rules or kit tables you would change to bring the failure rate under 10 %, as proposals. **Do not change `tools/sortie-compose.js` or any threshold**; the owner decides.

Write the numbers into `docs/daily-sortie-plan.md` as a new section 9 and add a `tests/README.md` entry. Commit to your branch and push. Do not start phase 4 (the workflow, the title entry, `DAILY_REROLL`).

## Things that cost earlier agents time

- **Playwright**: `import { chromium } from 'playwright'` needs `/home/user/node_modules/playwright`. If it does not resolve: `mkdir -p /home/user/node_modules && ln -sfn /opt/node-tools/node_modules/playwright /home/user/node_modules/playwright && ln -sfn /opt/node-tools/node_modules/playwright-core /home/user/node_modules/playwright-core`. Chromium is pre-installed; never run `playwright install`.
- Serve with `python3 -m http.server 8000` from the repo root.
- `if (app.booting) finishBoot();` before a flight, or flights do not repeat.
- A Daily Sortie ends with `SF.run` returning `state:title`. A seed is flown with `startComposed(SortieCompose.composeSortie(kit, seed, 0))`, a date with `startDaily(date)`.
- An encounter's outcome is `world.encLast` (`id`, `why`, `dropped`); it changes when one ends (compare `at`). The Wing is id `wing`.
- Viewport 1000x760 (playfield height 320), as the baselines use.
- Page code passed as a string: `/* */` comments only, never `//`.
- Reuse a page for several flights (start the next sortie in it); a fresh page per flight costs seconds. `tests/daily.mjs` shows that a sortie leaves nothing behind.
- Do not run `tests/replay.mjs` or `tests/resume-exact.mjs` (both are red on this build for reasons that predate this work) and do not merge `main` (it conflicts in the version lines; the owner handles that).
