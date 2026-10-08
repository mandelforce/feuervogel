# Architecture

A map of how FEUERVOGEL 89 is built today. For where it is headed, see [ROADMAP.md](ROADMAP.md).

Line numbers drift as the file changes; search for the section comment (for example `/* ================= director`) instead.

## Files

| File | What it is |
|---|---|
| `index.html` | The whole game: markup, CSS and one script (about 7,400 lines inside a single function). No build step, no dependencies. |
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
| state | Run state as top-level variables: `state` (`title`/`play`/`over`), `score`, `lives`, `stage`, `player`, `enemies`, `ebul` (enemy bullets), `shots`, `stats`, `camp` |
| tutorial, leaderboard | In-game tutorial; leaderboard client (fetch top lists, submit, local fallback) |
| resume | Saves a run so a reloaded page can continue |
| helpers | Entity factories `E()` (any enemy) and `G()` (ground enemy), `hpm()` (difficulty health scale) |
| director | Decides what spawns when: waves, ground targets, pods, bosses (`BOSSDEF`, `BOSSMOVE`) |
| AI | Per-enemy and per-boss behaviour |
| player | Movement, weapons, bomb, death |
| update | One simulation step: weather, shots, collisions, scoring |
| render | One drawn frame |
| input | Keyboard, mouse, touch, gamepad, buttons |
| sizing, loop | Canvas scaling; `frameLoop` runs `update()` at a fixed 60 steps per second and `render()` once per frame |

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
- Gameplay should not depend on `Math.random` where a replay needs to match; seeding the random numbers is Phase 2 of the roadmap.
- Bump `VERSION` in both `index.html` and `sw.js` for each release, and add a line to `CHANGELOG.md`.
