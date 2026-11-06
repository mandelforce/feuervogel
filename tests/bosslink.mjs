// The boss test link (?boss): a practice run (or a local build) starts levels 2 to 6 a few chunks before their boss, with the Wing and the encounters skipped, the weapon at level 4 and three Novas.
// Without the link a level starts where it always did. Needs Node and Playwright; serve the folder first (python3 -m http.server 8000).
//   node tests/bosslink.mjs            (--verbose also prints the checks that pass)
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const PAGE = process.env.STARFALL_URL || 'http://localhost:8000/';
const harness = readFileSync(new URL('./harness.js', import.meta.url), 'utf8');
let bad = 0, passed = 0;
const verbose = process.argv.includes('--verbose');
const ok = (cond, msg) => { if (cond) { passed++; if (verbose) console.log('ok   ' + msg); } else { bad++; console.error('FAIL ' + msg); } };
const browser = await chromium.launch();
async function open(query) {
  const page = await browser.newPage({ viewport: { width: 400, height: 700 } });
  await page.route(/workers\.dev/, r => r.abort());
  page.on('pageerror', e => { bad++; console.error('page error:', e.message); });
  await page.addInitScript(() => { let a = 1944; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; window.requestAnimationFrame = () => 0; });
  await page.goto(PAGE + query); await page.waitForFunction(() => typeof window.__sf === 'function', null, { polling: 100, timeout: 60000 });
  await page.evaluate(s => window.__sf(s), harness); await page.evaluate(() => window.SF.peek('app.booting && finishBoot(), 0'));
  return { page, peek: c => page.evaluate(c2 => window.SF.peek(c2), c) };
}
{
  /* without the link: level 3 starts at its beginning */
  const { page, peek } = await open('');
  const r = JSON.parse(await peek(`(() => { SF.setMode('immortal'); SF.start(1, 1); startEnigma(3, false, 1); SF.run(60); return JSON.stringify({ q: Math.floor(world.scroll / CH) - world.stageBaseP, mid: !!world.midDone, lvl: player.lvl }); })()`));
  ok(r.q < 3 && !r.mid, `without ?boss level 3 starts at its beginning (chunk ${r.q})`);
  await page.close();
}
{
  /* with the link: every level from 2 to 6 meets its own boss within a few seconds, with no error */
  const { page, peek } = await open('?boss');
  for (const level of [2, 3, 4, 5, 6]) for (const loops of [0, 1]) {
    const r = JSON.parse(await peek(`(() => { SF.setMode('immortal'); SF.start(1, 1); startEnigma(${level}, false, ${loops}); const q0 = Math.floor(world.scroll / CH) - world.stageBaseP, b0 = run.sortie.bossAt; let n = 0, b = null;
      for (; n < 1500; n += 30) { SF.run(30); b = world.enemies.find(e => e.type === 'boss' || e.type === 'protoFly'); if (b) break; } return JSON.stringify({ q0, b0, n, kind: b && (b.kind || b.type), spawned: !!world.bossSpawned, mid: !!world.midDone, lvl: player.lvl, bombs: run.bombs, errs: SF.R.errs.length }); })()`));
    ok(r.spawned && r.q0 >= r.b0 - 6 && r.q0 < r.b0 + 3 && r.mid && r.lvl >= 4 && r.bombs >= 3 && r.errs === 0, `level ${level}, loop ${loops}: starts at chunk ${r.q0} of ${r.b0}, the boss comes after ${r.n} frames (${r.kind}), weapon ${r.lvl}, ${r.errs} errors`);
  }
  await page.close();
}
await browser.close();
if (bad) { console.error(`\n${bad} problem(s) found, ${passed} passed.`); process.exit(1); }
console.log(`Boss link test passed (${passed}).`);
