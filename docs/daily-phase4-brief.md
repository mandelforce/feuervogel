# Daily Sortie phase 4, vetting and the title entry: brief for the builder

Status: brief, nothing built. A second agent reviews the result; keep the report short and the numbers exact.

## Where things stand (build 1.2.6.40)

Phases 0 to 3 of `docs/daily-sortie-plan.md` are done. Phase 3 is the flight gate, `tests/daily-gate.mjs`; its results are in the plan's section 9 and the brief it was built from is `docs/daily-gate-brief.md`.

- The gate flies each date on all three difficulties and exits 1 if any sortie fails. Its dead-air limit is now **12 s** (owner decision, plan 9.6 option 3). Under the old 10 s limit the sweep failed 2 of 600 sorties (desert dead air); at 12 s there are none. The 12 s run itself was not repeated.
- `DAILY_REROLL = {}` in `tools/sortie-compose.js` (line ~176) is empty. `dailySeed` already reads it (`sub: DAILY_REROLL[date] | 0`).
- `startDaily(dateKey, kitId, sub)` exists in `index.html` and is reached only by `?daily=DATE` on a local build. There is no title entry.
- Still open for the owner, not part of this task: decision 8 (composed desert and forest Veteran sorties are calmer than the hand-made levels, plan 9.4 and 9.6), and dead-air options 1 and 2.

Read first: `CLAUDE.md`; in `docs/daily-sortie-plan.md` only "Phase 4" (section 4), section 2.3 (seed, reroll, version pinning), 2.4, section 5 (decisions) and section 9.1 and 9.7 (how the gate runs and how long it takes); the head comment of `tests/daily-gate.mjs`; `.github/workflows/smoke.yml` (how CI installs and serves); the `tests/README.md` entries for the Daily Sortie. Do not read `index.html` beyond what you grep for.

## The task

Two parts. The owner merges the result; nothing here goes live on its own.

### A. The vetting workflow

A scheduled GitHub workflow, daily, that vets the next 14 days:

1. Runs `node tests/daily-gate.mjs --from <today UTC + 1 day> --days 14` (all three difficulties, no `--bots`).
2. For each failing date, rerolls: sub-seeds 1 to 8 in turn, until one passes the gate on all three difficulties. A date with no passing sub-seed in 8 is reported, not guessed.
3. Opens a pull request that adds the `DAILY_REROLL` entries (`'YYYY-MM-DD': k`) and nothing else. If nothing fails, it opens nothing. If a PR from an earlier run is still open, it updates that one.
4. The PR body lists each rerolled date with its cause, and every unfixable date.

Rules:
- The owner merges the PR; no unvetted sortie ships. A date needs its vetting merged at least one release before it goes live, which is why the window is 14 days.
- Reuse the gate; do not duplicate its checks. If it needs a machine-readable result per date, add it to `tests/daily-gate.mjs` (`--save` already writes JSON) rather than parsing its text.
- A rerolled date changes the date's sortie, so check what `composeVersion` and `DAILY_REROLL` do together: a table entry alone must not need a `VERSION` bump, but say in the report whether it should (plan 2.3).
- Write the reroll step as a script in `scripts/` that the workflow calls, so it runs locally the same way. Test it locally with a forced failure (for example `--dead 3`, which makes many dates fail) and show the PR text it would produce. Do not push a test run to GitHub Actions on `main`.
- The workflow needs the same Playwright and Chromium setup as the existing jobs in `smoke.yml`; copy that, never run `playwright install` in the sandbox.

### B. The title entry

- A **DAILY** entry on the title screen. It shows the day's kit name and starts `startDaily(today UTC)`. The player picks the difficulty the way the other modes do (decision 3 in the plan).
- The results screen shows the run's totals. It counts nowhere (no board, best score, loop or play data) until phase 6.
- Resume (`run.daily`) and the Daily Sortie test (`tests/daily.mjs`) must keep working; extend that test for the entry. Find the title buttons by grepping, for example `startEnigma` and the title markup in lines 1 to 325, and follow how an existing mode is wired. Check the layout test (`tests/layout.mjs`) on phones, since the title screen is tight.
- This part changes `index.html`, so it needs a **version bump**: `VERSION` in `sw.js` and in `index.html` must match, plus a `CHANGELOG.md` entry at the top.

## Stop point

Report in under 30 lines: what the workflow does and how you tested it, the PR text it produced in the forced-failure run, the title entry (what it shows, how the layout test looks), the version bump, and any question for the owner. Add a `tests/README.md` entry and a short phase 4 section (9.8 or a new section 10) to the plan. Commit to your branch and push. **Do not start phase 5** (more kits) **or phase 6** (the board).

## Things that cost earlier agents time

- **Playwright**: `import { chromium } from 'playwright'` needs `/home/user/node_modules/playwright`. If it does not resolve: `mkdir -p /home/user/node_modules && ln -sfn /opt/node-tools/node_modules/playwright /home/user/node_modules/playwright && ln -sfn /opt/node-tools/node_modules/playwright-core /home/user/node_modules/playwright-core`. Chromium is pre-installed; never run `playwright install`.
- Serve with `python3 -m http.server 8000` from the repo root.
- The full sweep takes about 30 minutes; a 14-date gate run is much shorter. Do not run the sweep for this task.
- A Daily Sortie ends with `SF.run` returning `state:title`. A seed is flown with `startComposed(SortieCompose.composeSortie(kit, seed, 0))`, a date with `startDaily(date)`.
- `if (app.booting) finishBoot();` before a flight, or flights do not repeat.
- Viewport for the gate is 1000x760; the layout test covers phones.
- Page code passed as a string: `/* */` comments only, never `//`.
- `tools/sortie-compose.js` is embedded in `index.html`: after any change to it run `node scripts/embed-citygen.mjs`, or `tests/compose.mjs` fails. The reroll script must not change the composer's rules, only `DAILY_REROLL`.
- Do not run `tests/replay.mjs` or `tests/resume-exact.mjs` (both are red on this build for reasons that predate this work) and do not merge `main` (it conflicts in the version lines; the owner handles that).
