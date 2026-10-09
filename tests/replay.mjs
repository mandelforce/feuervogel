// Replay test: plays fixed scenarios with the bot and checks the results (and the terrain of every campaign stage) match tests/golden.json.
// Catches any change that alters how the game plays or scores, which matters because scores are compared across versions.
// Needs Node and Playwright (see tests/balance.mjs); serve the folder first (python3 -m http.server 8000).
//   node tests/replay.mjs            compare with golden.json
//   node tests/replay.mjs --update   write golden.json (only after a change that is meant to alter gameplay)
//   node tests/replay.mjs --terrain --warn   only the campaign terrain check; a change prints a warning and does not fail (CI uses this)
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const PAGE = process.env.STARFALL_URL || 'http://localhost:8000/';
const goldenUrl = new URL('./golden.json', import.meta.url);
const golden = JSON.parse(readFileSync(goldenUrl, 'utf8'));
const harness = readFileSync(new URL('./harness.js', import.meta.url), 'utf8');
const replay = readFileSync(new URL('./replay.js', import.meta.url), 'utf8');
const update = process.argv.includes('--update');
const diag = process.argv.includes('--diag');
const onlyTerrain = process.argv.includes('--terrain'), warnOnly = process.argv.includes('--warn');

// Runs before the game's own script: a seeded Math.random, and no frame loop, so only the replay moves the game.
// (Weather, birds and clouds also draw random numbers while the title screen idles; the loop must not run before the replay.)
const initScript = () => {
  let a = 1944;
  Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  window.requestAnimationFrame = () => 0;
};

const browser = await chromium.launch();
if (diag) {
  // print environment facts and a trace so two machines can be compared line by line
  const page = await browser.newPage({ viewport: golden.viewport });
  await page.route(/workers\.dev/, r => r.abort());
  await page.addInitScript(initScript); await page.goto(PAGE);
  await page.waitForFunction(() => typeof window.__sf === 'function');
  await page.evaluate(s => window.__sf(s), harness); await page.evaluate(s => window.__sf(s), replay);
  console.log('DIAG ' + JSON.stringify(await page.evaluate(() => window.SF.diag())));
  await browser.close(); process.exit(0);
}
const results = {};
let bad = 0;
const names = onlyTerrain ? [] : (await (async () => {
  const page = await browser.newPage({ viewport: golden.viewport });
  await page.addInitScript(initScript); await page.goto(PAGE);
  await page.waitForFunction(() => typeof window.__sf === 'function');
  await page.evaluate(s => window.__sf(s), harness); await page.evaluate(s => window.__sf(s), replay);
  const n = await page.evaluate(() => window.SF.SCENARIOS.map(s => s.name)); await page.close(); return n;
})());

for (const name of names) {
  // a fresh page per scenario: nothing carries over from the previous one
  const page = await browser.newPage({ viewport: golden.viewport });
  await page.route(/workers\.dev/, r => r.abort());
  page.on('pageerror', e => console.error('page error:', e.message));
  await page.addInitScript(initScript);
  await page.goto(PAGE);
  await page.waitForFunction(() => typeof window.__sf === 'function');
  await page.evaluate(s => window.__sf(s), harness); await page.evaluate(s => window.__sf(s), replay);
  results[name] = await page.evaluate(n => window.SF.replay(window.SF.SCENARIOS.find(s => s.name === n)), name);
  await page.close();
  if (update) { console.log(`${name}: ${JSON.stringify(results[name])}`); continue; }
  const want = golden.scenarios[name], got = results[name];
  if (want?.H !== got.H) { bad++; console.error(`FAIL ${name}: playfield height H is ${got.H}, golden was made at ${want?.H}. The game sizes H from the window layout, so this machine is not comparable (or the layout CSS changed). Not a gameplay difference.`); continue; }
  const diffs = Object.keys({ ...want, ...got }).filter(k => want?.[k] !== got[k]).map(k => `${k}: expected ${want?.[k]}, got ${got[k]}`);
  if (diffs.length) { bad++; console.error(`FAIL ${name}\n  ${diffs.join('\n  ')}`); } else console.log(`ok   ${name}`);
}

// Terrain fingerprint for every campaign stage, on its own fresh page.
{
  const page = await browser.newPage({ viewport: golden.viewport });
  await page.route(/workers\.dev/, r => r.abort());
  await page.addInitScript(initScript);
  await page.goto(PAGE);
  await page.waitForFunction(() => typeof window.__sf === 'function');
  await page.evaluate(s => window.__sf(s), harness); await page.evaluate(s => window.__sf(s), replay);
  results.terrain = await page.evaluate(() => window.SF.terrainPrints());
  await page.close();
  if (!update) for (const [stage, got] of Object.entries(results.terrain)) {
    const want = golden.terrain?.[stage];
    if (!want || want.hash !== got.hash || want.cells !== got.cells) {
      bad++;
      if (warnOnly) console.log(`::warning title=Campaign terrain changed::${stage}: expected ${want?.hash}, got ${got.hash}. The Campaign level terrain is meant to stay fixed. If this is intended, regenerate tests/golden.json.`);
      console.error(`${warnOnly ? 'WARNING' : 'FAIL'} terrain ${stage}: expected ${want?.hash}, got ${got.hash}`);
    } else console.log(`ok   terrain ${stage}`);
  }
}
await browser.close();

if (update && onlyTerrain) { golden.terrain = results.terrain; writeFileSync(goldenUrl, JSON.stringify(golden, null, 2) + '\n'); console.log('\ngolden.json terrain updated.'); }
else if (update) { golden.terrain = results.terrain; delete results.terrain; golden.scenarios = results; writeFileSync(goldenUrl, JSON.stringify(golden, null, 2) + '\n'); console.log('\ngolden.json updated.'); console.log('GOLDEN-BEGIN\n' + JSON.stringify(golden, null, 2) + '\nGOLDEN-END'); }
else if (bad && warnOnly) console.log(`\n${bad} terrain stage(s) differ from golden.json (warning only).`);
else if (bad) { console.error(`\n${bad} check(s) changed. If the change was meant to alter gameplay, run with --update and say so in the commit.`); process.exit(1); }
else console.log('\nReplay matches.');
