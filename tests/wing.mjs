// Shadow Wing check (Enigma Run, docs/shadow-wing-design.md). For each of the eight levels it spawns the wing and flies its whole fight with the bot
// (immortal, every other enemy removed each frame) and checks:
//   - the ship is the one for the level (ENIGMA_BASE: levels 7 and 8 reuse the ships of 6 and 1) and has its hit box,
//   - the states fire in the order of its sequence, one at a time (no new state starts while its own shots are still on screen, unless 450 frames have passed);
//     each level is flown twice: as it is (the bot kills the wing, which shows how much of the sequence a fight really gets to) and with a very tough wing
//     (so the whole sequence can be checked until the wing leaves at 1600 frames),
//   - every shot of the wing starts within 12 px of one of its muzzles (a shot never appears out of nowhere),
//   - the peak number of the wing's own bullets (reported; the old fight peaks at about 41),
//   - no page errors. Retro Run (no sortie) must still get the old wing (no `v`).
// No golden baseline exists for the Enigma Run (see ARCHITECTURE.md), so this does not touch tests/golden.json.
// Needs Node and Playwright; serve the folder first (python3 -m http.server 8000).   node tests/wing.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const PAGE = process.env.STARFALL_URL || 'http://localhost:8000/';
const harness = readFileSync(new URL('./harness.js', import.meta.url), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 400, height: 700 } });
const errs = [];
await page.route(/workers\.dev/, r => r.abort());
await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
page.on('pageerror', e => errs.push(e.message));
await page.goto(PAGE);
await page.waitForFunction(() => typeof window.__sf === 'function', null, { polling: 100, timeout: 60000 });
await page.evaluate(s => window.__sf(s), harness);

let fails = 0;
const say = (ok, msg) => { if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };

for (let level = 1; level <= 8; level++) for (const tough of [false, true]) {
  const tag = `level ${level}${tough ? ' (tough wing)' : ''}`;
  const r = await page.evaluate(([level, tough]) => {
    const P = c => window.SF.peek(c);
    P('app.booting && finishBoot(), 0'); window.SF.setMode('immortal');
    P('settings.diff = 1; startEnigma(' + level + ')');
    window.SF.run(120); P('spawnWing()'); if (tough) P("world.enemies.forEach(e => { if (e.type === 'wing') e.hp = e.maxhp = 1e9; })");
    const want = P('ENIGMA_BASE[' + level + ' - 1] - 1'), out = { want, v: null, hw: null, hh: null, order: [], overlap: 0, far: 0, shots: 0, peak: 0, frames: 0, ended: false };
    const seen = new WeakSet(); let lastPh = -1;
    for (let i = 0; i < 1800; i++) {
      window.SF.run(1);
      P("world.enemies = world.enemies.filter(e => e.type === 'wing')");
      const w = P("world.enemies.find(e => e.type === 'wing')");
      if (!w) { out.ended = true; break; }
      out.frames++; if (out.v === null) { out.v = w.v; out.hw = w.hw; out.hh = w.hh; }
      if (w.v === undefined) continue;
      const V = P('WING_V[' + w.v + ']'), name = V.seq[w.si];
      if (w.ph === 1 && lastPh !== 1) { out.order.push(name); const own = P('world.ebul.filter(b => b.w).length'); if (own > 0 && w.st < 450) out.overlap++; }
      lastPh = w.ph;
      const mz = Object.values(V.muz).flatMap(m => typeof m[0] === 'number' ? [m] : m);
      const bul = P('world.ebul.filter(b => b.w)'); out.peak = Math.max(out.peak, bul.length);
      for (const b of bul) { if (seen.has(b)) continue; seen.add(b); out.shots++;
        if (!mz.some(m => Math.hypot(b.x - (w.x + m[0] - 50), b.y - (w.y + m[1] - 20)) <= 12)) out.far++; }
    }
    return out;
  }, [level, tough]);
  const exp = [1, 2, 3, 4, 5, 6, 6, 1][level - 1] - 1;
  if (!tough) say(r.want === exp && r.v === exp, `level ${level}: ship ${r.v} (expected ${exp}), hit box ${r.hw} x ${r.hh}`);
  const seq = await page.evaluate(v => window.SF.peek('WING_V[' + v + '].seq'), exp);
  const okOrder = r.order.length >= (tough ? seq.length : 2) && r.order.every((n, i) => n === seq[i % seq.length]);
  say(okOrder, `${tag}: states in order ${r.order.join(' > ')}`);
  say(r.overlap === 0, `${tag}: no state started while its own shots were still on screen`);
  say(r.shots > 0 && r.far === 0, `${tag}: ${r.shots} shots, ${r.far} started away from a muzzle`);
  console.log(`     ${tag}: peak ${r.peak} of the wing's own bullets, the fight lasted ${r.frames} frames${r.ended ? ' (the wing left)' : ''}`);
}

// Retro Run: no sortie, so the old wing
const old = await page.evaluate(() => {
  const P = c => window.SF.peek(c);
  window.SF.setMode('immortal'); window.SF.start(1, 1);
  window.SF.run(120); P('spawnWing()'); window.SF.run(300);
  const w = P("world.enemies.find(e => e.type === 'wing')");
  return { has: !!w, v: w && w.v, sortie: !!P('run.sortie') };
});
say(old.has && old.v === undefined && !old.sortie, 'Retro Run: the old wing (no ship number)');
say(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
await browser.close();
console.log(fails ? fails + ' check(s) failed' : 'all checks passed');
process.exit(fails ? 1 : 0);
