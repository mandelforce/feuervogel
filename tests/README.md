# Tests

## Local test server

```
python3 scripts/devserver.py [folder]
```

Serves the folder (default: the current one) on port 8080, always the same address, whichever branch or worktree you test. It stops its own earlier run first, so there is only ever one server, and it sends no-store headers so a phone never shows an old copy. It prints three links: this computer (`http://localhost:8080/`), the phone link by computer name (`http://<name>.local:8080/`, which survives IP changes) and the phone link by IP. All of them count as test builds: scores stay on the device and nothing goes to the live leaderboard.

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
