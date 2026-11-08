// Looped levels 4 and 5 (the overcast sky: stratus decks and mist banks, drawOvercast): flies the level and fails if a cloud pops, that is
// if a cloud on screen changes place by more than 3 px in a frame, if one appears or vanishes on screen, or if its opacity steps by more than 0.04.
// A cloud may wrap and may fade in and out, but only while wholly off the screen or by opacity.
//   node tests/overcast-pop.mjs [level 4|5] [frames]     (serve the folder first: python3 -m http.server 8000; CHROME=<path> picks the browser; URL=<page>)
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const golden = JSON.parse(readFileSync(new URL('./golden.json', import.meta.url), 'utf8'));
const harness = readFileSync(new URL('./harness.js', import.meta.url), 'utf8'), replay = readFileSync(new URL('./replay.js', import.meta.url), 'utf8');
const lv = +process.argv[2] || 4, frames = +process.argv[3] || 9000;
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const page = await browser.newPage({ viewport: golden.viewport });
await page.route(/workers\.dev/, r => r.abort());
await page.addInitScript(() => { let a = 1944; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; window.requestAnimationFrame = () => 0; });
await page.goto(process.env.URL || 'http://localhost:8000/');
await page.waitForFunction(() => typeof window.__sf === 'function', null, { polling: 100, timeout: 60000 });
await page.evaluate(s => window.__sf(s), harness); await page.evaluate(s => window.__sf(s), replay);
await page.evaluate(() => window.SF.peek('app.booting && finishBoot(), 0'));
const r = await page.evaluate(([lv, frames]) => {
  const SF = window.SF; SF.setMode('immortal');
  SF.peek(`settings.diff = 1; settings.enigma = 0; startEnigma(${lv}, false, 1); window.__gc = genClouds; window.__lc = () => ovcLayer && ovcLayer[0]; 0`);
  const W = +SF.peek('W'), H = +SF.peek('H'), keyOf = new Map(), od = CanvasRenderingContext2D.prototype.drawImage;
  let buf = [], cur = [];
  /* each cloud is drawn into the overcast layer (5 arguments); the layer is then drawn to the screen at the pass's opacity (3 arguments) */
  CanvasRenderingContext2D.prototype.drawImage = function (img, ...a) {
    if (!keyOf.has(img)) for (const [k, s] of window.__gc) keyOf.set(s.c, k);
    if (keyOf.has(img) && a.length === 4) buf.push({ key: keyOf.get(img), x: a[0], y: a[1], w: a[2], h: a[3], a: this.globalAlpha });
    else if (img === window.__lc() && a.length === 2) { for (const s of buf) { s.pa = this.globalAlpha; cur.push(s); } buf = []; }
    return od.call(this, img, ...a);
  };
  const on = s => s.x + s.w > 1.5 && s.x < W - 1.5 && s.y + s.h > 1.5 && s.y < H - 1.5, bad = [], drawn = new Set(); let prev = null, status = 'ok', n = 0;
  for (let i = 0; i < frames && status === 'ok'; i++) {
    status = SF.run(1); buf = []; cur = []; SF.draw(); n++; const gf = +SF.peek('gf'); cur.forEach(s => drawn.add(s.key));
    if (prev) {
      const used = new Set(), mp = cur.map(c => { let best = -1, bd = 3.01; prev.forEach((p, j) => { if (used.has(j) || p.key !== c.key) return; const d = Math.hypot(p.x - c.x, p.y - c.y); if (d < bd) { bd = d; best = j; } }); if (best >= 0) used.add(best); return best; });
      cur.forEach((c, k) => { const ea = c.a * c.pa;
        if (mp[k] < 0) { if (on(c) && ea > 0.03) bad.push(`frame ${gf}: ${c.key} appeared on screen at ${Math.round(c.x)},${Math.round(c.y)} (opacity ${ea.toFixed(2)})`); return; }
        const p = prev[mp[k]], pa = p.a * p.pa; if (Math.abs(ea - pa) > 0.04 && on(c)) bad.push(`frame ${gf}: ${c.key} opacity ${pa.toFixed(2)} to ${ea.toFixed(2)} in one frame`); });
      prev.forEach((p, j) => { if (!used.has(j) && on(p) && p.a * p.pa > 0.03) bad.push(`frame ${gf}: ${p.key} vanished from the screen at ${Math.round(p.x)},${Math.round(p.y)} (opacity ${(p.a * p.pa).toFixed(2)})`); });
    }
    prev = cur;
  }
  CanvasRenderingContext2D.prototype.drawImage = od;
  return { status, n, bad: bad.slice(0, 12), nBad: bad.length, kinds: [...drawn].sort(), errs: SF.R.errs.slice(0, 2) };
}, [lv, frames]);
console.log(`level ${lv}: ${r.n} frames, ${r.status}, clouds drawn: ${r.kinds.join(' ')}`);
let fail = 0;
if (r.n < Math.min(frames, 3000)) { console.error('FAIL the level ended after only ' + r.n + ' frames'); fail++; }
if (r.kinds.length < 3) { console.error('FAIL almost no clouds were drawn: ' + r.kinds.join(' ')); fail++; }
if (r.errs.length) { console.error('FAIL page errors: ' + r.errs.join(' | ')); fail++; }
if (r.nBad) { console.error(`FAIL ${r.nBad} cloud pops, first:\n  ` + r.bad.join('\n  ')); fail++; }
console.log(fail ? 'FAILED' : 'ok: no cloud pops');
await browser.close(); process.exit(fail ? 1 : 0);
