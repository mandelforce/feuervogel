// Jitter test: road vehicles must move smoothly. Plays every Campaign stage and every Enigma Run level with the bot and watches every ground
// vehicle (tanks, trucks, cars, carts) frame by frame. Fails when one
//   - swings: its heading turns more than SWING rad and turns back within BACK frames (a vehicle reading a road per whole row stands
//     still sideways, then steps: its sprite flicks to the side and back);
//   - wobbles: it moves sideways (across its heading) more than SHAKE px one way and back within BACK frames (a shake; a sub-pixel kink
//     doesn't show, and turning round at a patrol's end is along its heading, so neither counts);
//   - jumps: it moves more than JUMP px in one frame (a vehicle snapping to another route or road).
// A real turn (a corner, a side road, a patrol's end) turns once and stays, so it never counts.
// Needs Node and Playwright, like tests/replay.mjs; serve the folder first (python3 -m http.server 8000).
//   node tests/jitter.mjs              all stages and levels
//   node tests/jitter.mjs --frames N   frames per stage (default 9000)
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const PAGE = process.env.STARFALL_URL || 'http://localhost:8000/';
const harness = readFileSync(new URL('./harness.js', import.meta.url), 'utf8');
const fi = process.argv.indexOf('--frames'), FRAMES = fi > 0 ? +process.argv[fi + 1] : 9000;
const RUNS = [...[1, 2, 3, 4, 5, 6].map(n => ({ name: `campaign stage ${n}`, start: `startAt(${n})` })),
  ...[1, 2, 3, 4, 5, 6].map(lv => ({ name: `enigma level ${lv}`, start: `startEnigma(${lv})` }))];

const initScript = () => {
  let a = 1944;
  Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  window.requestAnimationFrame = () => 0;
};

// Runs in the page: play `frames` frames and watch the vehicles.
function watch({ start, frames }) {
  const SWING = 0.2, BACK = 8, SHAKE = 0.6, JUMP = 2.6, SF = window.SF;
  window.__forceSeed = 5; SF.setMode('immortal'); SF.peek(`settings.diff = 1; app.booting && finishBoot(); gf = 0; ${start}`);
  const ENT = SF.peek('ENT'), isVeh = e => !e.dead && e.ground && e.wx !== undefined && e.type !== 'boss' && ENT[e.type] && ENT[e.type].treads;
  const ang = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  const track = new Map(), bad = { swing: 0, wobble: 0, jump: 0, moves: 0, examples: [] };
  const note = (kind, who, f, extra) => { bad[kind]++; if (bad.examples.length < 6) bad.examples.push(`${kind} ${who.type} at frame ${f} (x ${who.wx.toFixed(1)}, y ${who.wy.toFixed(1)}) ${extra}`); };
  // the heading: a turn of more than SWING, then one back the other way within BACK frames
  const swing = (s, a, f) => { if (s.a !== undefined) { const d = ang(s.a, a); if (Math.abs(d) > SWING) { const back = s.turns.find(t => f - t.f <= BACK && Math.sign(t.d) !== Math.sign(d)); s.turns = s.turns.filter(t => f - t.f <= BACK); s.turns.push({ f, d }); s.a = a; return back ? d : 0; } } s.a = a; return 0; };
  let status = 'ok', f = 0;
  for (; f < frames && status === 'ok'; f++) {
    status = SF.run(1);
    const sc = SF.peek('world.enemies'), cr = SF.peek('critters');
    const now = [...sc.filter(isVeh), ...cr.filter(c => c.kind === 'cart' && !c.gone)];
    for (const e of now) {
      let t = track.get(e); if (!t) { track.set(e, { wx: e.wx, wy: e.wy, hd: { turns: [] }, hist: [] }); continue; }
      const dx = e.wx - t.wx, dy = e.wy - t.wy, step = Math.hypot(dx, dy); t.wx = e.wx; t.wy = e.wy;
      if (step < 0.01) continue;
      bad.moves++;
      if (step > JUMP) { note('jump', e, f, `by ${step.toFixed(2)} px`); continue; }
      const a = e.hd === undefined ? 0 : swing(t.hd, e.hd, f); if (a) note('swing', e, f, `by ${(a * 180 / Math.PI).toFixed(0)}° and back`);
      // sideways: x for a vehicle heading mostly along y, y for one heading mostly along x; out and back by more than SHAKE within BACK frames
      const h = e.hd === undefined ? Math.atan2(dy, dx) : e.hd, lat = Math.abs(Math.sin(h)) > Math.abs(Math.cos(h)) ? 'wx' : 'wy';
      t.hist.push({ f, v: e[lat], lat }); t.hist = t.hist.filter(q => f - q.f <= BACK && q.lat === lat);
      const v = t.hist.map(q => q.v); let out = 0;
      for (let j = 1; j < v.length - 1; j++) { const back = Math.min(...v.slice(j + 1)), fwd = Math.max(...v.slice(j + 1)), lo = Math.min(...v.slice(0, j)), hi = Math.max(...v.slice(0, j));
        if ((v[j] - lo > SHAKE && v[j] - back > SHAKE) || (hi - v[j] > SHAKE && fwd - v[j] > SHAKE)) out = 1; }
      if (out) { note('wobble', e, f, `sideways (${lat}) out and back by over ${SHAKE} px`); t.hist = []; }
    }
    for (const e of track.keys()) if (!now.includes(e)) track.delete(e);
  }
  delete window.__forceSeed;
  return { status, frames: f, errs: SF.R.errs.length, ...bad };
}

const browser = await chromium.launch();
let fails = 0;
for (const r of RUNS) {
  const page = await browser.newPage({ viewport: { width: 400, height: 700 } });
  await page.route(/workers\.dev/, x => x.abort());
  page.on('pageerror', e => { fails++; console.error(`page error (${r.name}):`, e.message); });
  await page.addInitScript(initScript);
  await page.goto(PAGE);
  await page.waitForFunction(() => typeof window.__sf === 'function', null, { polling: 100, timeout: 60000 }); // not rAF polling: requestAnimationFrame is off
  await page.evaluate(s => window.__sf(s), harness);
  const o = await page.evaluate(watch, { start: r.start, frames: FRAMES });
  const ok = o.swing === 0 && o.wobble === 0 && o.jump === 0 && o.errs === 0;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${r.name}: ${o.moves} vehicle moves in ${o.frames} frames, ${o.swing} swings, ${o.wobble} wobbles, ${o.jump} jumps${o.errs ? `, ${o.errs} errors` : ''}${o.status !== 'ok' ? ` (stopped: ${o.status})` : ''}`);
  for (const x of o.examples) console.log('       ' + x);
  await page.close();
}
await browser.close();
console.log(fails ? `\n${fails} run(s) with jittering vehicles.` : '\nNo vehicle jitters.');
process.exit(fails ? 1 : 0);
