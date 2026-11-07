// The Black Fortress's twin lance (Enigma level 6, the first loop only: seed 1945, run.sortie.haze). Two pods under the wing tips (parts of kind 'lance', folded away until the last act:
// all four engines dead). After a fire laser has been fired in the last act, each live pod charges (70 frames, a dashed warning line) and fires a thin beam that sweeps in from the screen's edge to a pinch
// point at the bottom of the screen, centred on where the ship was at charge frame 45; the gap there never closes below LANCE.gap. Never together with the fire laser. A dead pod's beam is gone.
// The first pass (seed 1944) and the second loop (1946) have none of it. Needs Node and Playwright; serve the folder first (python3 -m http.server 8000).
//   node tests/blacklance.mjs            (--verbose also prints the checks that pass)
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const PAGE = process.env.STARFALL_URL || 'http://localhost:8000/';
const harness = readFileSync(new URL('./harness.js', import.meta.url), 'utf8');
let bad = 0, passed = 0;
const verbose = process.argv.includes('--verbose');
const ok = (cond, msg) => { if (cond) { passed++; if (verbose) console.log('ok   ' + msg); } else { bad++; console.error('FAIL ' + msg); } };
const browser = await chromium.launch();
async function page_(loops) {
  const page = await browser.newPage({ viewport: { width: 400, height: 700 } });
  await page.route(/workers\.dev/, r => r.abort());
  page.on('pageerror', e => { bad++; console.error('page error:', e.message); });
  await page.addInitScript(() => { let a = 1944; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; window.requestAnimationFrame = () => 0; });
  await page.goto(PAGE + '?boss'); await page.waitForFunction(() => typeof window.__sf === 'function', null, { polling: 100, timeout: 60000 });
  await page.evaluate(s => window.__sf(s), harness); await page.evaluate(() => window.SF.peek('app.booting && finishBoot(), 0'));
  const peek = c => page.evaluate(c2 => window.SF.peek(c2), c);
  /* level 6 started with the boss test link and flown by the immortal bot until the fortress is in its fight */
  const r = await peek(`(() => { SF.setMode('immortal'); SF.start(1, 1); startEnigma(6, false, ${loops}); let n = 0; for (; n < 60000; n += 30) { SF.run(30); ensureChunks(); const b = world.enemies.find(e => e.type === 'boss' && e.kind === 'skyfort'); if (b && b.phase === 'fight') break; } SF.run(60);
    const b = world.enemies.find(e => e.type === 'boss'); return JSON.stringify({ kind: b && b.kind, phase: b && b.phase, haze: !!run.sortie.haze, seed: run.sortie.seed, pods: b ? b.parts.filter(p => p.k === 'lance').length : -1 }); })()`);
  return { page, peek, info: JSON.parse(r) };
}
const killEngines = `(() => { const b = world.enemies.find(e => e.type === 'boss'); for (const p of b.parts) if (p.k === 'engine') { p.hp = 0; p.dead = true; } })()`;
for (const [loops, seed] of [[0, 1944], [2, 1946]]) {
  const { page, peek, info } = await page_(loops);
  ok(info.kind === 'skyfort' && info.seed === seed && !info.haze && info.pods === 0, `level 6, seed ${seed}: the Black Fortress without lance pods`);
  await peek(killEngines);
  const r = JSON.parse(await peek(`(() => { const b = world.enemies.find(e => e.type === 'boss'); let ln = 0; for (let f = 0; f < 2400; f++) { SF.run(1); if (b.ln) ln++; } return JSON.stringify({ ln, parts: b.parts.length }); })()`));
  ok(r.ln === 0 && r.parts === 12, `seed ${seed}: no lance in the last act (${r.ln} frames), ${r.parts} parts`);
  await page.close();
}
{
  const { page, peek, info } = await page_(1);
  ok(info.kind === 'skyfort' && info.seed === 1945 && info.haze && info.pods === 2, `level 6, seed 1945: the Black Fortress with two lance pods (${info.pods})`);
  const f0 = JSON.parse(await peek(`(() => { const b = world.enemies.find(e => e.type === 'boss'); SF.run(600); return JSON.stringify({ off: b.parts.filter(p => p.k === 'lance').every(p => p.off), ln: !!b.ln, hp: b.parts.filter(p => p.k === 'lance').map(p => p.hp) }); })()`));
  ok(f0.off && !f0.ln, 'while the engines stand the pods stay folded away and no lance fires');
  await peek(killEngines);
  const r = JSON.parse(await peek(`(() => { const b = world.enemies.find(e => e.type === 'boss'), log = [], P = () => b.parts.filter(p => p.k === 'lance'); let both = 0, unfold = null, ph = null, t0 = 0, volleys = 0, minGap = 1e9, hitsAtGap = 0, lasers = 0, inFire = 0;
    const d0 = die; let deaths = 0; die = () => { deaths++; };
    for (let f = 0; f < 5200 && volleys < 3; f++) { SF.run(1); for (const p of P()) { p.hp = p.maxhp; p.dead = false; } /* (the bot shoots at them: kept alive here) */ if (unfold === null && P().every(p => !p.off)) unfold = f; if (b.fl && b.ln) both++; if (b.fl && b.fl.ph === 'fire' && b.fl.t === 1) lasers++;
      if (b.ln && b.ln.ph !== ph) { ph = b.ln.ph; t0 = f; if (ph === 'charge') { volleys++; log.push({ at: f, flN: b.flN, lasers }); } }
      if (!b.ln && ph) { log[log.length - 1].len = f - t0 + (log[log.length - 1].chargeLen || 0); ph = null; }
      if (b.ln && b.ln.ph === 'fire') { inFire++; const e = lanceEnds(b, b.ln); minGap = Math.min(minGap, e['1'] - e['-1']); } }
    die = d0; return JSON.stringify({ both, unfold, volleys, log, minGap, deaths, inFire, gap: LANCE.gap, errs: SF.R.errs.slice(0, 2) }); })()`));
  ok(r.unfold !== null && r.unfold < 10, `the pods unfold as the last act begins (frame ${r.unfold})`);
  ok(r.volleys >= 2 && r.log.every((q, i) => q.lasers >= i + 1), `the volleys come after the fire laser has been fired in the last act (${JSON.stringify(r.log.map(q => [q.at, q.lasers]))})`);
  ok(r.both === 0, `never together with the fire laser (${r.both} frames)`);
  ok(r.minGap >= r.gap[1] - 0.001, `the gap at the screen's bottom never closes below ${r.gap[1]} px (min ${r.minGap.toFixed(1)}), ${r.inFire} frames of beam`);
  const g = JSON.parse(await peek(`(() => { const b = world.enemies.find(e => e.type === 'boss'), out = {}; let bad = 0, n = 0;
    for (const diff of [0, 1, 2]) { settings.diff = diff; for (let cx = 70; cx <= W - 70; cx += 7) for (const ex of [90, 112, 134]) { b.x = ex; for (let t = 0; t <= LANCE.close + LANCE.hold; t += 3) { const F = { ph: 'fire', t, cx }, en = lanceEnds(b, F);
      for (const p of b.parts.filter(q => q.k === 'lance')) { const px = b.x + p.ox, py = b.y + p.oy, xi = en[p.ox < 0 ? '-1' : '1'], dx = xi - px, dy = H + 40 - py, L = Math.hypot(dx, dy), c = dx / L, s = dy / L;
        for (let y = py + 40; y <= H - 8; y += 12) { const x = cx, ex2 = x - px, ey2 = y - py; n++; if (ex2 * c + ey2 * s > 0 && Math.abs(-ex2 * s + ey2 * c) < LANCE.half + 3) bad++; } } } } }
    settings.diff = 1; return JSON.stringify({ bad, n }); })()`));
  ok(g.bad === 0 && g.n > 1000, `a ship standing at the pinch point (and anywhere above it down the screen) is never inside a beam: ${g.bad} of ${g.n} checks`);
  const h = JSON.parse(await peek(`(() => { const b = world.enemies.find(e => e.type === 'boss'); for (const p of b.parts) if (p.k === 'lance') { p.hp = p.maxhp; p.dead = false; p.off = false; } b.fl = null; const L = b.parts.find(p => p.k === 'lance' && p.ox < 0), tt = 150, n = () => SF.R.hits.length;
    const put = (t, cx, side, dist) => { b.ln = { ph: 'fire', t, cx }; const en = lanceEnds(b, b.ln), q = b.parts.find(p => p.k === 'lance' && Math.sign(p.ox) === side), px = b.x + q.ox, py = b.y + q.oy, dx = en[side < 0 ? '-1' : '1'] - px, dy = H + 40 - py, Ln = Math.hypot(dx, dy); player.x = px + dx / Ln * dist; player.y = py + dy / Ln * dist; player.inv = 0; player.dead = false; b.ln.t = t - 1; };
    put(40, 112, -1, tt); const n0 = n(); skyLance(b, 0); const hit = n() - n0;
    b.ln = { ph: 'fire', t: 100, cx: 112 }; player.x = 112; player.y = H - 30; player.inv = 0; player.dead = false; const n1 = n(); skyLance(b, 0); const safe = n() - n1;
    L.dead = true; put(40, 112, -1, tt); const n2 = n(); skyLance(b, 0); const deadPod = n() - n2;
    return JSON.stringify({ hit, safe, deadPod, live: b.parts.filter(p => p.k === 'lance' && !p.dead).length }); })()`));
  ok(h.hit >= 1 && h.safe === 0 && h.deadPod === 0 && h.live === 1, `a ship in a beam is hit (${h.hit}), one at the pinch is not (${h.safe}); a destroyed pod's beam is gone (${h.deadPod}), one pod left (${h.live})`);
  ok(r.errs.length === 0, `no errors${r.errs.length ? ': ' + r.errs.join(' | ') : ''}`);
  await page.close();
}
await browser.close();
if (bad) { console.error(`\n${bad} problem(s) found, ${passed} passed.`); process.exit(1); }
console.log(`Black lance test passed (${passed}).`);
