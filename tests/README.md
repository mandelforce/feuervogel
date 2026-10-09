# Tests

## Unit tests (run automatically)

`worker.test.mjs` checks the leaderboard Worker's rules with a fake database: name limits, the 2-continue cap, Stage-1-only Campaign ranking, score plausibility, rate limits, allowed origins and ISO week labels. It needs only Node 20, no browser:

```
node --test tests/
```

If you change `worker.js`, run this first. The tests check the rules, not live data.

## Smoke test (runs automatically)

`smoke.mjs` runs on every pull request through GitHub Actions. It loads the game on desktop and phone sizes, checks the title screen, plays Stage 1 for a few seconds and fails on any error or missing file.

## Layout test (runs automatically)

`layout.mjs` loads the game at 11 sizes, from iPhone SE to iPad and desktop, and checks that:
- the playfield fills the screen edge to edge on phones,
- it is centred,
- it stays clear of the notch and home bar,
- the page never scrolls,
- the Nova and menu buttons are on screen during play,
- turning the device and back keeps the same size.

Headless browsers report no safe-area insets, so the test simulates them through the `--sat` and `--sab` CSS variables that the page uses for every inset. Serve the folder, then:

```
node tests/layout.mjs                # check every size
node tests/layout.mjs --shots out/   # also save a screenshot per size
```

It cannot reproduce everything. Check a real phone too, especially from the Home Screen icon (iOS standalone mode), after a layout change.

## Replay test (runs in CI, advisory for now)

`replay.mjs` plays three fixed scenarios with the bot (different difficulties, stages and modes, 30,000 frames each) and compares score, stage, lives, kills and more with `golden.json`. It catches any change that alters how the game plays or scores. Run it while the folder is served (`python3 -m http.server 8000`):

```
node tests/replay.mjs            # compare
node tests/replay.mjs --update   # write new expected values
```

Only use `--update` after a change that is *meant* to alter gameplay (balance, spawns, scoring), and say so in the commit. For a refactor, any difference is a bug.

How it stays repeatable: the game plays each run from a seed (`runSeed`; test builds can force one with `window.__forceSeed`, which `replay.js` does), each scenario runs on a fresh page, and the frame loop is switched off so only the replay moves the game. Page-level `Math.random` is still seeded for the cosmetic randomness at load.

Isolation checks: the runner also replays the Hard scenario under another page-level random seed and with the speed setting `lowFX` forced on, and requires the identical result. This guards the rule that sound, visual effects and weather never change how a run plays. The viewport size is fixed (stored in `golden.json`), and every result records the playfield height `H`, because the game sizes `H` from the window layout and `H` changes how the game plays. If `H` differs, the test says so and stops: that is a different machine or layout, not a gameplay change. (A borderless 400x700 window gives the same `H` as CI; a window with a 2px border does not.) 

It also fingerprints the terrain of all six campaign stages (what is under every sampled spot, hashed). The campaign world comes from fixed-seed hash noise (seed 1944), so these hashes must never change by accident. Terrain painting is time-budgeted per frame, but that only affects the pictures, not the simulation: the replay result is identical on a simulated slow machine.

CI also runs `node tests/replay.mjs --terrain --warn`, which checks only the campaign terrain and shows a yellow warning (never a failure) if it changed.

`golden.json` comes from CI: run the workflow by hand (Actions > Smoke test > Run workflow, on your branch) and copy the printed block between `GOLDEN-BEGIN` and `GOLDEN-END`; the same run prints machine details (`--diag`). CI results have been identical across runs. The CI step stays advisory (`continue-on-error`): gameplay changes made on purpose, such as balance or Easy mode, change the numbers and need a refresh.

## Performance test (runs in CI, warning only)

`perf.mjs` checks how the game runs on slower phones. It slows Chrome's CPU down 4x ("mid-range phone") and 6x ("older phone"), plays with the bot on a phone-sized touch window, and measures: the cost of every frame (average, p95, p99, worst), frames over the 16.7 ms budget, the real frame loop (fps, hitches, whether lite mode switches on), start-up time, heap growth over a long run (leaks), and page weight. The table appears in the CI job summary; changes against `perf-baseline.json` raise yellow warnings and never fail the build.

```
node tests/perf.mjs            # measure and compare (serve the folder first)
node tests/perf.mjs --update   # print a new baseline
```

The slow-down scales main-thread work only, not the graphics hardware or memory speed, and CI machines vary, so use it for regressions and trends. Confirm anything important on a real phone.

**On a real phone:** Settings > Show FPS now shows `FPS 60 MAX 18 WORK 5` at the bottom of the screen: frames per second, the longest gap between two frames in the last 5 seconds (what you feel as a hitch; over 34 turns red) and the longest time the game itself needed for one frame. A normal FPS with a big MAX means stutter. `LITE` in front means the game switched to its reduced-effects mode on its own.

`perf.js` holds the measurements, so they also work by hand in the console (`SF.perfSteps()`, `await SF.perfLoop()`, `SF.perfMemory()`).

## Frame-time profiler (run by hand)

`profile.js` shows which functions use the time in `update` and `render`, and what the slow frames are doing. Local builds only. Serve the folder, open it in the browser, and paste into the console:

```js
__sf(await (await fetch('tests/harness.js')).text());
__sf(await (await fetch('tests/profile.js')).text());
const r = await SF.profile({ diff: 1, stage: 1, frames: 4000 });   // takes about 30 seconds
r.update; r.render; r.top; r.spikes
```

Times are in milliseconds on the machine you run it on, so run it on a phone for numbers that matter. Functions called more than 40 times per frame are not timed one by one (the timing would distort them); they are listed in `hotNotTimed`. The profiler itself allocates, so treat spike counts as an upper bound.

## Balance bot (run by hand)

`harness.js` drives the game at high speed with a bot that dodges by looking a few frames ahead. Use it to check balance after changing weapons, bosses or stages. It only works on local builds (localhost, `file://`, `.test`), where the game exposes a `window.__sf` hook. The live site never has it.

The bot dodges better than people do, so hit counts and lives are best-case numbers. Boss times and bullet counts are good for comparing stages and weapons, and for before/after checks.

**In the browser:** serve the folder (`python3 -m http.server 8000`), open `http://localhost:8000`, and paste into the console:

```js
__sf(await (await fetch('tests/harness.js')).text());
SF.bossTime(1, 5, 'A');      // seconds to kill the Stage 5 boss on Normal with Arc
SF.bossDps(1, 6, 'L');       // boss damage per second, ship held under the core
SF.campaign(2);              // all six stages on Hard, one summary row per stage
```

Difficulty: `0` Easy, `1` Normal, `2` Hard. Weapons: `S` Scatter, `L` Lance, `H` Seekers, `A` Arc.

**Full report with Node:** `node tests/balance.mjs` prints the boss-time table for every weapon and a campaign summary per difficulty (setup steps are at the top of the file).
