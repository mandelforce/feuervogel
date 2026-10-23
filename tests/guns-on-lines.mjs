// Enigma Run: flies level N (default 2) with the seeded Math.random of tests/enigma.mjs and fails if a flak, bunker, artillery piece, camouflaged or
// pop-up gun, casemate or radar ever stands on rail, road or runway (tanks drive on roads; an airfield's tower stands beside its taxiway).
//   node tests/guns-on-lines.mjs [level]     (serve the folder first: python3 -m http.server 8000; CHROME=<path> picks the browser)
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const golden = JSON.parse(readFileSync(new URL('./golden.json', import.meta.url), 'utf8'));
const harness = readFileSync(new URL('./harness.js', import.meta.url), 'utf8'), replay = readFileSync(new URL('./replay.js', import.meta.url), 'utf8');
const lv = +process.argv[2] || 2;
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const page = await browser.newPage({ viewport: golden.viewport });
await page.route(/workers\.dev/, r => r.abort());
await page.addInitScript(() => { let a = 1944; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; window.requestAnimationFrame = () => 0; });
await page.goto(process.env.URL || 'http://localhost:8000/');
await page.waitForFunction(() => typeof window.__sf === 'function', null, { polling: 100, timeout: 60000 });
await page.evaluate(s => window.__sf(s), harness); await page.evaluate(s => window.__sf(s), replay);
await page.evaluate(() => window.SF.peek('app.booting && finishBoot(), 0'));
const r = await page.evaluate(lv => {
  const SF = window.SF; SF.setMode('immortal'); SF.peek(`settings.diff = 1; startEnigma(${lv})`);
  const seen = new Map(); let status = 'ok';
  for (let i = 0; i < 3000 && status === 'ok'; i++) {
    status = SF.run(20);
    SF.peek(`(() => { for (const e of world.enemies) { if (e.dead || e._probed || !['flak','bunker','arty','camo','popup','casemate','radar'].includes(e.type)) continue; const r = e.rad || 10, bad = {}; for (const [dx, dy] of [[0,0],[-r/2,0],[r/2,0],[0,-r/2],[0,r/2]]) { const t = terrainType(e.wx !== undefined ? e.wx + dx : e.x + dx, (e.wy !== undefined ? e.wy : e.y) + dy); if (t === 'rail' || t === 'road' || t === 'runway' || t === 'taxi') bad[t] = 1; }
      if (Object.keys(bad).length) { e._probed = 1; (window.__bad = window.__bad || []).push(((S) => { const P = S && S.plan, y = S && S.planY0 - e.wy, sl = P && P.slots.find(q => Math.abs(q.x - e.wx) < 8 && Math.abs(q.y - y) < 8); return sl ? 'SLOT ' + sl.kind + '/' + sl.on + ' ' : 'NOSLOT rails=' + JSON.stringify(info(-Math.floor(e.wy / CH)).rails) + ' '; })(run.sortie) + e.type + ' ' + Object.keys(bad).join('+') + ' rad ' + r + ' x ' + Math.round(e.wx !== undefined ? e.wx : e.x) + ' sc ' + Math.floor(world.scroll)); } } })()`);
  }
  return { status, bad: SF.peek('window.__bad || []') };
}, lv);
const c = {}; for (const b of r.bad) { const k = b.split(' rad')[0]; c[k] = (c[k] || 0) + 1; }
console.log(r.status, c, r.bad);
if (r.bad.length) { console.error('FAIL guns on rail/road/runway: ' + r.bad.length); process.exit(1); } console.log('ok   no gun on rail, road or runway in level ' + lv);
await browser.close();
