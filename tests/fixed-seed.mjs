// The Campaign is the same for every player: each level's simulation starts from seed 1944 and the level's number. Needs Node and
// Playwright; serve the folder first (python3 -m http.server 8000).
//   node tests/fixed-seed.mjs
//   node tests/fixed-seed.mjs --verbose   also print every check that passes (by default only failures and a count)
// Checks, for every level: flown by the same bot in two fresh pages whose own Math.random differs (the device's randomness), the run is the
// same: the same enemies spawned at the same frames and places, the same score and the same state at the end; a practice start of the level
// starts the same stream as the Campaign's start, and a level reached by finishing the one before starts the same stream as well.
// Endless still gets a new seed every run.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const PAGE = process.env.STARFALL_URL || 'http://localhost:8000/';
const harness = readFileSync(new URL('./harness.js', import.meta.url), 'utf8');
const verbose = process.argv.includes('--verbose');
let bad = 0, passed = 0;
const ok = (cond, msg) => { if (cond) { passed++; if (verbose) console.log('ok   ' + msg); } else { bad++; console.error('FAIL ' + msg); } };
const FRAMES = 3000;
const browser = await chromium.launch();

/* the page's own Math.random seeded with pageSeed: it stands in for the device, which the Campaign must not depend on */
async function freshPage(pageSeed) {
  const page = await browser.newPage({ viewport: { width: 400, height: 700 } });
  await page.route(/workers\.dev/, r => r.abort());
  page.on('pageerror', e => { bad++; console.error('page error:', e.message); });
  await page.addInitScript(s => {
    let a = s;
    Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    window.requestAnimationFrame = () => 0;
  }, pageSeed);
  await page.goto(PAGE);
  await page.waitForFunction(() => typeof window.__sf === 'function', null, { polling: 100, timeout: 60000 });
  await page.evaluate(h => window.__sf(h), harness);
  await page.evaluate(() => window.SF.peek('app.booting && finishBoot(), 0'));
  return page;
}
const peek = (page, code) => page.evaluate(c => window.SF.peek(c), code);

/* fly level lv for FRAMES frames with the bot (immortal), as a Campaign start or a practice start; returns the spawns, score and an end state */
const fly = (lv, ranked) => `(() => { SF.setMode('immortal'); SF.start(1, 1); startEnigma(${lv}, ${ranked}); SF.human(8, 15);
  const s0 = simS, seed = run.seed, g0 = gf, seen = new WeakSet(), spawns = [];
  for (let f = 0; f < ${FRAMES}; f += 10) { const st = SF.run(10);
    for (const e of world.enemies) { if (seen.has(e)) continue; seen.add(e); spawns.push(e.type + '@' + gf + ':' + Math.round(e.x) + ',' + Math.round(e.y)); }
    if (st !== 'ok') break; }
  return JSON.stringify({ s0, seed, g0, spawns, score: run.score, end: [gf, simS, Math.round(player.x), Math.round(player.y), world.enemies.length, world.ebul.length, world.secret && world.secret.q].join(' ') }); })()`;

const pageA = await freshPage(11), pageB = await freshPage(9999);
for (const lv of [1, 2, 3, 4, 5, 6]) {
  const a = JSON.parse(await peek(pageA, fly(lv, true))), b = JSON.parse(await peek(pageB, fly(lv, true)));
  const firstDiff = a.spawns.findIndex((s, i) => s !== b.spawns[i]);
  ok(a.seed === 1944 && b.seed === 1944 && a.g0 === 0 && b.g0 === 0, `level ${lv}: the run's seed is 1944 and its frame count starts at 0 (${a.seed}, ${b.seed}; frame ${a.g0}, ${b.g0})`);
  ok(a.spawns.length > 10 && firstDiff < 0 && a.spawns.length === b.spawns.length, `level ${lv}: two devices get the same ${a.spawns.length} spawns in ${FRAMES} frames${firstDiff >= 0 ? ' (first difference: ' + a.spawns[firstDiff] + ' / ' + b.spawns[firstDiff] + ')' : ''}`);
  ok(a.score === b.score && a.end === b.end, `level ${lv}: the same score (${a.score}) and end state (${a.end}${a.end === b.end ? '' : ' / ' + b.end})`);
  const p = JSON.parse(await peek(pageB, fly(lv, false)));
  ok(p.s0 === a.s0 && p.end === a.end, `level ${lv}: a practice start plays the same as the Campaign's (${p.end === a.end ? 'same end state' : p.end + ' / ' + a.end})`);
}
/* a level reached in a run starts the stream a practice start of it does */
{
  const r = JSON.parse(await peek(pageA, `(() => { SF.setMode('immortal'); SF.start(1, 1); startEnigma(2, false); const want = [simS, world.secret.q, world.secret.x];
    startEnigma(1, true); world.bossSpawned = true; app.results = null; app.fade = null; finishResults(); const f = app.fade && app.fade.fn; app.fade = null; if (f) f();
    return JSON.stringify({ level: run.sortie && run.sortie.level, got: [simS, world.secret.q, world.secret.x], want }); })()`));
  ok(r.level === 2 && r.got.join() === r.want.join(), `level 2 reached from level 1 starts as a practice start of it does (${r.got.join(', ')})`);
}
/* Endless keeps its variety */
{
  const s = await peek(pageA, `(() => { const a = []; for (let i = 0; i < 2; i++) { SF.start(1, 1, 0); a.push(run.seed); } return a.join(); })()`);
  const [x, y] = s.split(',');
  ok(x !== y, `Endless still gets a new seed every run (${s})`);
}
await browser.close();
if (bad) { console.error(`\n${bad} check(s) failed, ${passed} passed`); process.exit(1); }
console.log(`Fixed seed checks pass (${passed}).`);
