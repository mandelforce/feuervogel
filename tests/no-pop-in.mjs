// Enigma Run: flies level N (default 1) with a seeded Math.random and fails if a ground unit or a carrier fighter first exists inside the
// visible playfield (it must be created above the top edge or, on the carrier, already be drawn): nothing pops in.
//   node tests/no-pop-in.mjs [level]     (serve the folder first: python3 -m http.server 8000; CHROME=<path> picks the browser; SEED=<n> the random seed)
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const golden = JSON.parse(readFileSync(new URL('./golden.json', import.meta.url), 'utf8'));
const harness = readFileSync(new URL('./harness.js', import.meta.url), 'utf8'), replay = readFileSync(new URL('./replay.js', import.meta.url), 'utf8');
const lv = +process.argv[2] || 1;
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const page = await browser.newPage({ viewport: golden.viewport });
await page.route(/workers\.dev/, r => r.abort());
await page.addInitScript(seed => { let a = seed; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; window.requestAnimationFrame = () => 0; }, +(process.env.SEED || 1944));
await page.goto(process.env.URL || 'http://localhost:8000/');
await page.waitForFunction(() => typeof window.__sf === 'function', null, { polling: 100, timeout: 60000 });
await page.evaluate(s => window.__sf(s), harness); await page.evaluate(s => window.__sf(s), replay);
await page.evaluate(() => window.SF.peek('app.booting && finishBoot(), 0'));
const r = await page.evaluate(lv => {
  const SF = window.SF; SF.setMode('immortal'); SF.peek(`settings.diff = 1; startEnigma(${lv})`);
  let status = 'ok';
  for (let i = 0; i < 3000 && status === 'ok'; i++) {
    status = SF.run(1);
    SF.peek(`(() => { const sc = Math.floor(world.scroll); for (const e of world.enemies) { if (e._seen || e.dead) continue; e._seen = 1; if (!(e.ground || e.type === 'cfighter')) continue; if (['troop', 'secret', 'cgun'].includes(e.type)) continue;
      const x = e.x !== undefined && e.type === 'cfighter' ? e.x : e.wx, y = e.type === 'cfighter' ? e.y : e.wy + sc, hw = e.hw || 6, hh = e.hh || 6;
      if (y + hh > 0 && y - hh < H && x + hw > 0 && x - hw < W) (window.__pop = window.__pop || []).push(e.type + ' at x ' + Math.round(x) + ' screen y ' + Math.round(y) + ' (hh ' + hh + ') frame ' + gf); } })()`);
  }
  return { status, pop: SF.peek('window.__pop || []') };
}, lv);
const c = {}; for (const b of r.pop) { const k = b.split(' at ')[0]; c[k] = (c[k] || 0) + 1; }
console.log(r.status, c, r.pop.slice(0, 12));
if (r.pop.length) { console.error('FAIL ' + r.pop.length + ' unit(s) appeared inside the view in level ' + lv); await browser.close(); process.exit(1); } console.log('ok   nothing pops in, level ' + lv);
await browser.close();
