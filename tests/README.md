# Tests

## Smoke test (runs automatically)

`smoke.mjs` runs on every pull request through GitHub Actions. It loads the game on desktop and phone sizes, checks the title screen, plays Stage 1 for a few seconds and fails on any error or missing file.

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
