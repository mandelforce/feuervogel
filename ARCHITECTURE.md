# Architecture

A map of how FEUERVOGEL 89 is built today. For where it is headed, see [ROADMAP.md](ROADMAP.md).

Line numbers drift as the file changes; search for the section comment (for example `/* ================= director`) instead.

## Files

| File | What it is |
|---|---|
| `index.html` | The whole game: markup, CSS and one script (about 7,400 lines inside a single function). No build step, no dependencies. |
| `tools/citygen.js` | The settlement generator (towns, villages, ports, beaches) behind the city lab `tools/citylab.html`. The game carries a copy in `index.html` (`<script type="text/plain" id="cityGenSrc">`, run by the loader before the game script); `node scripts/embed-citygen.mjs` refreshes it after every change, and `tests/citygen.mjs` fails while the copy is old. Enigma Run levels 3 and 6 (and 6B) take their ground from it; level 3's is painted at night (`paint` with `opts.night`). |
| `sw.js` | Service worker: offline play. `VERSION` here must match `VERSION` in `index.html`. |
| `manifest.json`, `icons/` | Install-to-home-screen data. |
| `worker.js`, `schema.sql` | Leaderboard backend (Cloudflare Worker + D1). The repo copy lags the deployed Worker; see the note in the roadmap. |
| `tests/` | `worker.test.mjs` unit tests, `smoke.mjs` browser smoke test, `harness.js` + `balance.mjs` balance bot. See `tests/README.md`. |
| `.github/workflows/smoke.yml` | Runs the unit and smoke tests on pull requests. |

## Inside the game script

The script runs top to bottom once at page load, then `frameLoop` takes over. Sections, in file order:

| Section | Contents |
|---|---|
| top | `VERSION`, size constants (`W` is fixed at 224, `H` follows the screen), `settings`, `KEY` and `store` (all saved data goes through these) |
| noise, palettes | Seeded noise, colour tables per stage theme |
| sprite toolkit, sprites | Sprites are drawn by code into small canvases at startup (`SPR`); bosses have their own blocks |
| pixel font, title logo | Own bitmap fonts; the FEUERVOGEL logo with chrome and glitch effects |
| terrain | The world is generated in chunks from a seed (`ensureChunks`); themes blend as you scroll |
| audio | Web Audio: SFX (`sfx`), two synth engines (FM and OPL style), songs and arrangements |
| state | The run in one object, `run` (score, lives, bombs, stage, loop, continues, difficulty, seed, stats, camp, medal chain); the stage being flown in `world` (scroll, terrain chunks and theme, `enemies`, `ebul` (enemy bullets), `shots`, items, particles, decals, director timers, weather); the screen and flow in `app` (`app.state`: `title`/`play`/`over`, pause, messages, results, continue, tutorial, game over scene, leaderboard panel, resume); the player ship is still its own object, `player` |
| tutorial, leaderboard | In-game tutorial; leaderboard client (fetch top lists, submit, local fallback) |
| resume | Saves a run so a reloaded page can continue |
| helpers | Entity factories `E()` (any enemy) and `G()` (ground enemy), `hpm()` (difficulty health scale) |
| director | Decides what spawns when: waves, ground targets, pods, bosses (`BOSSDEF`, `BOSSMOVE`) |
| AI | Per-enemy and per-boss behaviour: the entity table `ENT` (one entry per enemy type, `ENT[type].update(e)`) and `BOSSMOVE` |
| player | Movement, weapons, bomb, death |
| update | One simulation step: weather, shots, collisions, scoring |
| render | One drawn frame. Each enemy type's look is in `LOOKS`, attached to the entity table as `ENT[type].draw(e, fl)` |
| input | Keyboard, mouse, touch, gamepad, buttons |
| sizing, loop | Canvas scaling; `frameLoop` runs `update()` at a fixed 60 steps per second and `render()` once per frame |

## Start-up

1. The page's HTML and CSS paint the splash (`#preboot`: MANDELFORCE, PRESENTS, animated dots) immediately.
2. The game script is stored as text (`<script type="text/plain" id="gameSrc">`) and a small loader runs it after the first paint (`requestAnimationFrame` then a timer; a 150 ms timer is the fallback when no frame comes, for example in a background tab or in tests that replace `requestAnimationFrame`). Running it builds all the graphics, which blocks the page for about a second on a fast machine and several seconds on an old phone.
3. The game's frame loop starts. The page's splash stays up while the game warms its graphics (`warmStep` touches the offscreen canvases) for at least 110 steps; the canvas itself stays blank behind it.
4. `finishBoot` marks `title-ready`, hides `#preboot` with a fade and the title screen is usable. Marks `game-start`, `game-ready` and `title-ready` are in the browser's performance timeline.

Because the script is run from text, line numbers in error stacks (`starfall-lasterror`) count from the first line of the game script, not from the top of `index.html`.

## How a frame works

1. `frameLoop` collects elapsed time and runs `update()` as many fixed steps as are due (capped, so a slow tab doesn't spiral).
2. `update()` advances scrolling and weather, calls `director()` to spawn, moves the player, shots, enemies and bullets, resolves hits (`kill`, `die`) and scoring.
3. `render()` draws the world, entities, effects and HUD onto the 224-pixel-wide canvas, which CSS scales up.
4. Errors in either step are caught and written to `starfall-lasterror` instead of freezing the game.

## Data the game saves on the device

All keys are listed in `KEY` near the top of the script. Names are fixed; renaming one would reset players' progress. Reads and writes go through `store`, which survives blocked storage and bad data.

## Leaderboard

- The game talks to the Worker at `window.STARFALL_LEADERBOARD` (set at the top of `index.html`).
- On local hosts (`LB_TEST`: localhost, `file://`, `.test`, LAN addresses) scores are saved on the device only and never sent. The test hook `window.__sf` exists only there.
- The Worker enforces the fairness rules again on its side (name rules, continues, Stage-1 Campaign only, plausibility, rate limits). `tests/worker.test.mjs` covers them.

## Things to know before changing code

- **Scoring, continues and leaderboard rules are fixed** unless the owner agrees. See `CLAUDE.md`.
- State is global, so a change in one place can reach many others. Search for a variable's name across the whole file before changing how it is set.
- Random numbers have two streams (see "random streams" at the top of the script). Inside `update()` (and `newGame`, `bomb`, `fireBeam`, `doContinue`) `Math.random` is a per-run seeded stream; everything else (drawing, sound, idle weather, `fx(() => ...)` blocks) uses the real one. Never let a visual effect or sound change a run: wrap effect code that only runs when `lowFX` is off in `fx()`. `tests/replay.mjs` checks this.
- Bump `VERSION` in both `index.html` and `sw.js` for each release, and add a line to `CHANGELOG.md`.
- **Enigma Run** (`ENIGMA_LEVELS`/`ENIGMA_SEQ`, `buildSortie`, `startEnigma`, `endEnigmaLevel`, `resetTerrainState` in `index.html`; specification in `docs/enigma-world-spec.md`, audit in `docs/enigma-world-audit.md`): a separate mode, started from Settings > Enigma Run, with six redesigned levels. A level is a **sortie**: plain data built once by `buildSortie(level, seed)` from a pure hash (never `Math.random`) and kept in `run.sortie` (null in the Campaign; saved in the resume record as `{level, seed}`). It is not the Enigma look slider below (`run.enigma`); do not mix the two. Rules: an Enigma Run level never counts (`lbEligible`, `hi`, new-best, play-data reports and `loopsWon` all check `run.sortie`), it ends at the level picker (`finishResults` -> `endEnigmaLevel`), and terrain code that serves it must read `run.sortie`, never `settings`. `resetTerrainState()` is called when any run starts and clears every terrain cache and shared value: **a new terrain cache must be added there**, and `tests/enigma.mjs` checks it. Phase 1 only: the ground is still the Campaign stage's (`curTheme` is set to the level's legacy theme); `sortie.bossQ` is `null` (the Campaign's boss rule).
- **Enigma look** (`ENIGMA`, `ENIGMA_T` in `index.html`): the Settings slider `settings.enigma` (0 to 100) is copied into `run.enigma` when a run starts and saved with the resumable run. `setLook()` sets `ENIGMA_T` (`run.enigma / 100`; 0 on the title screen and in the tutorial) and rebuilds the terrain chunks and cloud sprites. All look code reads `ENIGMA_T`, never the setting, and at 0 takes the classic code paths. It is visual only: it may remove trees but never changes terrain types or what `classify()` returns, and explosion scorching and the choice of spots for ground targets still count the classic trees (`treeList(..., true)`) because it draws from the seeded stream. `tests/replay.mjs` checks that a run at strength 50 gives the golden result.
