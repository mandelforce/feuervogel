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

`layout.mjs` loads the game at 16 sizes, from iPhone SE to iPad and desktop, five of them as the Home Screen app (edge to edge, no frame), and checks that:
- the playfield fills the screen edge to edge on phones,
- it is centred,
- it stays clear of the notch and home bar,
- the page never scrolls,
- the Nova and menu buttons are on screen during play,
- turning the device and back keeps the same size.

Headless browsers report no safe-area insets, so the test simulates them by adding the `--t-sat` and `--t-sab` CSS variables to every inset (they are never set on a real device). It simulates the Home Screen app by adding the `standalone` class that the page sets itself when launched from the icon. Serve the folder, then:

```
node tests/layout.mjs                # check every size
node tests/layout.mjs --shots out/   # also save a screenshot per size
```

It cannot reproduce everything. Check a real phone too, especially from the Home Screen icon (iOS standalone mode), after a layout change.

## Resume tests

`resume.mjs` plays Stage 1 in a real browser page, sends the page to the background like a phone does and reloads it. It checks that the save survives coming back to the page, is refreshed while playing, that the game comes back on the exact frame it was paused on and carries on after the countdown, that a save from an earlier hidden build still resumes (as a stage restart), and that a save from another version is ignored. Serve the folder, then `node tests/resume.mjs`.

`resume-exact.mjs` checks that a saved snapshot really is exact. The bot flies a scenario to a frame, the game saves its resume record, and the same run plays on, writing down the whole simulation (the ship, every enemy and boss part, bullets, items, timers, random streams) every 60 frames. A fresh page loads the record the way a reloaded browser does and plays the same frames; every sample must be identical. It covers the six Campaign levels (1A, 2, 3, 4, 5, 6B), the old Stage 1 to 6 starts, the bosses, two players and Endless, each saved at two places. Needs Playwright (see `balance.mjs`); serve the folder, then:

```
node tests/resume-exact.mjs                    # all scenarios (a few minutes)
node tests/resume-exact.mjs --only=level5      # scenarios whose name contains this
node tests/resume-exact.mjs --sample=1 --after=120   # compare every frame for 120 frames, to find where a difference starts
```

If a difference shows up after you changed the game, the usual cause is new state that the snapshot does not save: add it to `takeSnapshot` / `snapApply` (see "exact resume" in `index.html`), or make it a named function if it is a delayed callback. Weather and birds draw from the free random stream and are left out of the comparison on purpose.

## Replay test (runs in CI, blocking)

`replay.mjs` plays eight fixed scenarios with the bot and compares score, stage, lives, kills and more with `golden.json`. Together they cover all six bosses, Easy, Normal and Hard, a run where the bot can die and continue, Endless, two-player, and a run saved and resumed the way the game does after a page reload. It catches any change that alters how the game plays or scores. Run it while the folder is served (`python3 -m http.server 8000`):

```
node tests/replay.mjs            # compare
node tests/replay.mjs --update   # write new expected values
```

Only use `--update` after a change that is *meant* to alter gameplay (balance, spawns, scoring), and say so in the commit. For a refactor, any difference is a bug.

How it stays repeatable: the game plays each run from a seed (`runSeed`; test builds can force one with `window.__forceSeed`, which `replay.js` does), each scenario runs on a fresh page, and the frame loop is switched off so only the replay moves the game. Page-level `Math.random` is still seeded for the cosmetic randomness at load.

Each result also has a `trace`: a checksum of the simulation (the run's numbers, the seeded random stream, the ships, every enemy, boss part and bullet) every 500 frames. When a run differs, the test names the first 500-frame stretch where it went another way, which narrows down where a change went wrong.

Isolation checks: the runner also replays the Hard scenario under another page-level random seed, with the speed setting `lowFX` forced on, and with a frame drawn every 250 frames, and requires the identical result (drawing must also not throw). This guards the rule that sound, visual effects, weather and drawing never change how a run plays. Comparing the drawn pictures themselves doesn't work, because terrain painting runs on a time budget. The viewport size is fixed (stored in `golden.json`), and every result records the playfield height `H`, because the game sizes `H` from the window layout and `H` changes how the game plays. If `H` differs, the test says so and stops: that is a different machine or layout, not a gameplay change. (A borderless 400x700 window gives the same `H` as CI; a window with a 2px border does not.) 

Without Node, the scenarios also run in a browser on a local build: open the game in a window whose playfield height is 408 (a 400x700 desktop window, or 800x1430 in the Claude Browser pane: narrower than 768 there counts as a touch phone, which switches off two-player), then in the console, on a fresh page per scenario:

```
__sf(await (await fetch('tests/harness.js')).text()); __sf(await (await fetch('tests/replay.js')).text());
SF.replay(SF.SCENARIOS[0])   // compare with tests/golden.json
```

It also fingerprints the terrain of all six campaign stages (what is under every sampled spot, hashed). The campaign world comes from fixed-seed hash noise (seed 1944), so these hashes must never change by accident. Terrain painting is time-budgeted per frame, but that only affects the pictures, not the simulation: the replay result is identical on a simulated slow machine.

CI also runs `node tests/replay.mjs --terrain --warn`, which checks only the campaign terrain and shows a yellow warning (never a failure) if it changed.

`golden.json` comes from CI: run the workflow by hand (Actions > Smoke test > Run workflow, on your branch) and copy the printed block between `GOLDEN-BEGIN` and `GOLDEN-END`; the same run prints machine details (`--diag`). CI results have been identical across runs, and a local run (Node, a 400x700 window) gives the same numbers. The CI step is blocking: a change made on purpose to how the game plays (balance, spawns, scoring) must refresh `golden.json` in the same pull request and say why; any other difference is a bug, and the PR stays red until it is fixed.

## Enigma Run test (runs in CI, blocking)

`enigma.mjs` checks the plumbing of the Enigma Run mode (`docs/enigma-world-spec.md`): every level's sortie is well formed and rebuilt identically; Settings > Enigma Run opens the level picker and starts the chosen level; an Enigma Run level never counts (board eligibility, best score, loop count); it is saved and resumed as `{level, seed}`; at its end the run flies on into the next level with its score, lives, Novas and weapon (after the last level, 6 or 6B, the congratulations and the title; the harness's `SF.run` stops at a level change and returns `next:<level>`); starting any run clears every terrain cache (it fills them with markers and looks for what is left); and an Enigma Run level played first leaves nothing behind: the Campaign scenario played afterwards **in the same page** equals `golden.json` (`replay.mjs` uses a fresh page per scenario and cannot see leaks). Serve the folder first:

Level 3 (The Long Night) has its own block: its night plan passes the generator's rules and holds the yard, airbase, forest, pylons and searchlight posts; the yard's tracks run on through the supergun's arena; ground types and pixels are the plan's; the local night rule; route objects; the weather plan's mist; the same ground after a resume; and a bot flight that meets trains and manned searchlight posts, reaches the boss and returns to the picker.

Level 5 (The Winter Line) has its own block: its plan passes the generator's rules and covers 70 chunks; it begins over the frozen sea with U-boat holes and places to break through; the mountain village (no green), the frozen lake with its huts and ice road; ground types from the plan; the plan reaches 48 chunks past the level's end as the train boss's gorge arena, the four tracks running through into it (chasm 'ravine', viaducts 'railbridge') with no buffer stops. Flown by the bot: U-boats in the ice and a break through it, the train boss called once the gorge fills the screen, the boss comes, its trains keep to their own viaduct and the supply trains to the outer tracks, and the level returns to the picker. A second block checks that a gallery covers its outer track and nothing beside it, that the explosives car's blast wrecks the car coupled to it, and the avalanches: an open cornice's slide buries the supply car on its track and leaves a mound that stops the next train, a car under a gallery is safe, an explosives car breaks the cornice above it, a boss train smashes a supply car on its track, a supply train on the bridge follows its curve to the other outer track, and a car destroyed over the chasm falls with the car coupled to it. In flight, a supply train is sent to a bridge as it comes into view and crosses it.

```
node tests/enigma.mjs            # all checks
node tests/enigma.mjs --bench    # also print chunk build times per level, and level 6 by template (pixel pass and features apart)
node tests/enigma.mjs --pixels   # also compare finished Campaign chunks (pixels and features) with tests/enigma-pixels.json
```

It also checks that level 6's ground is identical on a fresh page, after a Campaign run in the same page, and after a resume. It also checks level 1's opening on the carrier: the deck start, lift-off, launches, deck guns that can be destroyed, the shrink and slide-off, and the director taking over afterwards. `--pixels` is a by-hand check (canvas blending can differ between browser builds, so it is not in CI): run it before and after any change to shared terrain code (`drawFeatures`, `pixelColor`, the city functions), because the replay test's terrain fingerprint sees only terrain types. `--pixels --update` rewrites the file and is only for a Campaign look change that is meant.

`contact.mjs` writes screenshots of each level at several points along it, for looking at the ground by eye:

```
node tests/contact.mjs OUTDIR        # all six levels, 8 points each, plus an HTML sheet per level
node tests/contact.mjs OUTDIR 6 12   # level 6, 12 points
```

`carrier-shots.mjs` films level 1's opening on the carrier: the playfield at chosen frames after the level begins, with the bot flying (immortal):

```
node tests/carrier-shots.mjs OUTDIR              # frames 0, 40, 100, 140, 170, 230, 330, 480, 700, 1000, plus an HTML sheet
node tests/carrier-shots.mjs OUTDIR 0,60,120     # chosen frames
```

## Shadow Wing test (run by hand)

`wing.mjs` flies the Shadow Wing's fight in all eight Enigma Run levels, each twice (as it is, and with a very tough wing so the whole sequence plays), and checks: the right ship and hit box for the level (levels 7 and 8 reuse the ships of 6 and 1), the states in the order of the ship's sequence, no state starting while its own shots are still in the upper half of the screen, every shot starting within 12 px of one of the ship's muzzles, and no page errors. It also checks that Retro Run still gets the old wing. It prints the peak of the wing's own bullets and how long the fight lasted. It does not use `golden.json` (there is no Enigma Run baseline; see ARCHITECTURE.md).

```
python3 -m http.server 8000   # in another terminal
node tests/wing.mjs
```

## Drilling test (run by hand)

`drilling.mjs` checks the Enigma Run's Drilling (the three-barrel tank): its attack cycle runs aim, prep, fire, rest in that order, with a warning before and a pause after; it fires salvos of three shells while its turret sweeps; its turret takes many ordinary hits, an untouched one outlives a Nova and the next hits pop it, a full laser pops it at once (a weak laser frame does not); a turret popped during the warning ends the cycle. Its tank pits: three in level 2, two in each other level with a plan (1A, 3, 4, 5, 6, 6B), none in level 1, more than a screen apart. On a level 6 side street it stands still while it fires and turns back at the street's end. Flown through by the bot, it stands in a dug-in slot of level 2 and fires, and patrols a side street of level 6.

```
python3 -m http.server 8000   # in another terminal
node tests/drilling.mjs
```

## Büchse test (run by hand)

`buechse.mjs` checks the Enigma Run's Büchse (the long-range marksman tank): its cycle runs track, aim, lock, rest in that order, with 60 ticks of aim and 21 of lock; it halts in its lock and its aim stays frozen there; it fires one shell a cycle, from the muzzle, down the locked line, at twice the enemy shell speed. Its lead: on Ace a ship flying straight across is hit and one that turns back at the lock is missed, and a ship standing still is hit. Its turret takes many ordinary hits, an untouched one outlives a Nova and the next hits pop it, a full laser pops it at once (a weak laser frame does not); a turret popped in the lock ends the cycle (no shot, the tank drives on). The muzzle spot it fires from matches the drawn bore at all 16 turret headings. Its side emplacements: two in levels 2, 3, 4, 5 and 6B, one in 6, none in 1 and 1A, at the screen's edges, 520 rows apart and 420 from the tank pits, the same each time. Flown through by the bot on level 3, a Büchse comes up dug in at an edge, lying across the screen, aims and fires.

```
python3 -m http.server 8000   # in another terminal
node tests/buechse.mjs
```

## Vehicle jitter test (runs in CI, blocking)

`jitter.mjs` plays every Campaign stage and every Enigma Run level (1, 1A, 2–6, 6B) with the bot for 9000 frames each and watches every road vehicle (tanks, trucks, armoured cars, carts) frame by frame. It fails when one

- **swings**: its heading turns more than 0.2 rad and back within 8 frames (the sprite flicks to the side and back: a vehicle reading its road per whole row, then stepping),
- **wobbles**: it moves sideways more than 0.6 px and back within 8 frames (a shake),
- **jumps**: it moves more than 2.6 px in one frame (a snap onto another road or route).

A real turn (a corner, a side road, a patrol's end) turns once and stays, so it never counts. The game's guards are `steer` (a vehicle turns at most `VEH_TURN` a frame) and `capStep` (one frame's move at most `VEH_STEP` times its speed, Enigma Run only); a new kind of vehicle or road should move through them. About a minute:

```
node tests/jitter.mjs              # all stages and levels
node tests/jitter.mjs --frames N   # frames per stage
```

## City generator test (runs in CI, blocking)

`citygen.mjs` runs the settlement generator (`tools/citygen.js`, the code behind the city lab `tools/citylab.html`) for 100 seeds of every density curve the lab offers, with and without damage, in Node (no browser). Every plan must keep the hard rules: no overlapping buildings, every house fronting a street, every tank carriageway joined to the main road, churches spaced out, and the same seed giving the same plan. It also sweeps Enigma level 3's whole plan (30 seeds: every rule and every part: yard, airbase, forest, power line, searchlight posts), sweeps Enigma level 5's winter ground (180 plans of the frozen sea, the harbour in its bay, the mountain village and the level's first part: every rule; pack, floes and fast ice with two ice holes a U-boat fits in and a place to break through; open water in the harbour with ice only along its quays; the frozen sea never meeting the harbour's water; the mountain village's mountains and parts (chapel, sawmill, cable car, ski jump, chalets, terraces); bare trees, white roofs, a frozen river, no palette leak; same seed same plan; bands equal whole), sweeps its gorge finale (12 plans: the arena's length, the gorge open before the level's end, unbroken tracks, the chasm in every row, galleries clear of the boss trains' room, cornices, spurs and bridges), checks the cloud types (deterministic and visible, shadows only for the solid ones), prints plan time and density error, and checks that the copy of the generator in `index.html` is current (refresh it with `node scripts/embed-citygen.mjs`).

```
node tests/citygen.mjs
node tests/citylab-shot.mjs OUTDIR [seed]   # screenshot of the lab and the raw town map (serve the folder first)
```

The lab itself is opened in a browser (`http://localhost:8000/tools/citylab.html` while the folder is served): seed, settings, overlays (streets, tank routes, gun slots, ground kinds, chunks, a game-sized screen), the rule checks, painting speed per chunk and a seed sweep.

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

## Balance on the real Campaign (by hand or nightly)

`SF.start` and `SF.campaign` fly the old campaign (what Retro Run plays). START flies the Enigma levels (1A, 2, 3, 4, 5, 6B), which share the difficulty table, weapons, bosses and rank but not the spawns or the Shadow Wing code, so tune and check balance on those: `startEnigma(8, true)` after `SF.start` starts them (`SF.run` returns `next:<level>` at each change), or use the scripts below.

The plain bot is too good (Rookie: zero hits), so `harness.js` has a fallible one. `SF.human(lag, react, force)` holds each movement decision for `lag` frames (8 is about 0.13 s), dodges the Black Fortress laser only `react` frames after its aim could be seen (15 is 0.25 s; the game draws a warning line from charge frame 60) and can pin one weapon (`'S4'`). Its hit counts are an index for comparing versions, **not** a prediction of how many hits a person takes. Also in `harness.js`: `SF.flyCampaign(diff, opts)` flies the whole real Campaign and returns the numbers below, `SF.laserTest(diff, react)` flies the Black Fortress alone, `SF.overrides({ bs: { 1: 1.0 } })` changes `DIFF` without editing the page, `SF.attrib()` counts enemy shots by shooter, and every entry in `SF.R.hits` now has `why` (the game's own cause, e.g. `flame` for the laser).

```
node tests/balance-real.mjs                       # table per difficulty, 4 runs each (about 4 minutes with 6 pages at once)
node tests/balance-real.mjs --baseline tests/balance-baseline.json      # and the change against the stored run (--strict: exit 1 on drift)
node tests/balance-real.mjs --overrides '{"fs":{"0":1.5}}' --runs 4     # try a setting before changing the code
node tests/balance-real.mjs --attrib --diffs 1                          # which shooters fill the bullet windows
node tests/balance-real.mjs --levels --diffs 1                          # and the worst bullet window, pre-boss bullets and hits for each of the six levels
node tests/balance-real.mjs --eval 'rankFor = st => ...'                # run code in the game's scope first, for changes that are not in DIFF
node tests/balance-real.mjs --save tests/balance-baseline.json          # after a balance change that was meant: refresh the baseline, with the golden.json
node tests/balance-checks.mjs [--runs 3]          # the checks below (about 2 minutes), exit 1 if one fails
```

Columns: **hits** bullets and rams that hit the ship (laser hits apart), **laser** Black Fortress beam hits, **top** the worst 10 s window of enemy bullets on screen before a boss (averaged over the six stages), **pre** / **bossB** the average before / during boss fights, **boss** seconds each boss lasted. With 4 runs the numbers move by about +-2 hits and +-1.5 on the window, so judge a change by several runs and by what the numbers do together, not by one figure. `balance-baseline.json` is the run of the version it was made with (the bands are wide on purpose, so it never blocks CI).

`balance-checks.mjs` holds whatever the exact tuning: at least 80 % of the Black Fortress beams are dodged by a ship that reacts after 0.25 s and after 0.4 s; every boss dies; Ace has at least 1.2x Rookie's hits (4 runs usually give about 1.8x) with Veteran's between them; the worst bullet window does not fall from Rookie to Veteran to Ace; the laser hits at most 1.5 times per run.

Balance lessons from the 1.2.5 pass: check which code path a test flies before trusting it (the old campaign and the Campaign have different Shadow Wing code); `SF.attrib()` finds the real source of a bullet window (it was the wing, 69 % of the shots in each stage's worst window); lowering enemy bullet speed makes more bullets stand on screen (about 12 % more), so a density cut needs fewer shots, not slower ones.

## Nothing pops in, guns stay off runways (by hand)

`guns-on-lines.mjs [level]` flies an Enigma Run level and fails if a gun, radar or pop-up turret stands on rail, road or a plan's runway (`SEED=<n>` picks the random seed). `no-pop-in.mjs [level]` fails if a ground unit or a carrier fighter first exists inside the visible playfield. Serve the folder first (`python3 -m http.server 8000`) and run them with Node and Playwright.
