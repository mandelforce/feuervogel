#!/usr/bin/env node
// Bot baselines for the Daily Sortie's flight gate (docs/daily-sortie-plan.md, section 3, gate 3; phase 0).
// Flies the hand-made levels of the three kits (level 2 desert, 4 forest, 5 winter), first pass and loops, on all three difficulties,
// with the "human" bot (SF.human(8, 15)) in immortal mode, and writes the gate's measures to tests/daily-baseline.json.
// Needs Node and Playwright. Serve the folder (python3 -m http.server 8000), then:
//   node tests/daily-baseline.mjs                    fly everything, print the table (about 24 flights)
//   node tests/daily-baseline.mjs --save tests/daily-baseline.json
//   node tests/daily-baseline.mjs --levels 2 --diffs 1 --loops 0     a part of it
//   node tests/daily-baseline.mjs --conc 2           pages flown at once (wall times are only comparable at the same --conc)
//   node tests/daily-baseline.mjs --twice            fly every flight a second time in a fresh page and report whether it repeats exactly
// Loops: level 2 has its own stretches on every loop seed (1945, 1946, 1947: loops 1 to 3, each one rank harder); levels 4 and 5 only on
// the first loop (seed 1945). The Campaign is the same for every player (seed 1944 + loop), so one flight per level, loop and difficulty is the baseline.
// The viewport is fixed (it sets the playfield height H, which changes how the game plays): compare only flights with the same H.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const PAGE = process.env.STARFALL_URL || 'http://localhost:8000/';
const LEVELS = String(arg('levels', '2,4,5')).split(',').map(Number), DIFFS = String(arg('diffs', '0,1,2')).split(',').map(Number), CONC = +arg('conc', 2), TWICE = !!arg('twice', false);
const LOOPS_OF = { 2: [0, 1, 2, 3], 4: [0, 1], 5: [0, 1] }, ONLY_LOOPS = arg('loops', null) === null ? null : String(arg('loops')).split(',').map(Number);
const LAG = 8, REACT = 15, VIEW = { width: 1000, height: 760 }, NAMES = ['Rookie', 'Veteran', 'Ace'], KIT = { 2: 'desert', 4: 'forest', 5: 'winter' };
const harness = readFileSync(new URL('./harness.js', import.meta.url), 'utf8');
const VERSION = (readFileSync(new URL('../index.html', import.meta.url), 'utf8').match(/const VERSION = '([^']+)'/) || [])[1];

/* The flight, run in the game's scope through SF.peek (no line comments in here: it travels as a string).
   Samples every 10 frames: enemies on screen, enemy bullets, the encounter, the boss. */
const FLY = `(function (lv, loops, diff, lag, react) {
  if (app.booting) finishBoot(); /* (the boot splash would otherwise eat the first frames of the flight, a different number each time) */
  SF.setMode('immortal'); SF.start(diff, 1); startEnigma(lv, true, loops); SF.human(lag, react);
  const S = run.sortie, out = { level: lv, loops: loops, seed: S.seed, diff: diff, H: H, len: S.len, bossAt: S.bossAt, segs: S.segs.map(function (g) { return [g.t, g.n]; }), encPlan: (S.encPlan || []).map(function (e) { return e.id; }) };
  /* the flight first, in the untouched page; the plan and chunk timings after it */
  const t0 = performance.now(), f0 = gf, sec = [], quiet = [], quietAir = [], encs = {}, trace = []; let q0 = -1, qa0 = -1, end = 'cap', bossF = -1, deadF = -1, enMax = 0, enSum = 0, n10 = 0, kills = 0, flown = 0;
  const close = function (list, from, to, min) { if (from >= 0 && to - from >= min) list.push([Math.round(from / 60), Math.round((to - from) / 60)]); };
  for (let step = 0; step < 60 * 60 * 20 / 10; step++) {
    const r = SF.run(10); if (r !== 'ok') { end = r; break; }
    if (!run.sortie || run.sortie.level !== lv) { end = 'next:' + (run.sortie ? run.sortie.level : 0); break; } /* (SF.run only sees a level change that happens inside one call) */
    const f = flown = gf - f0, boss = world.enemies.some(function (e) { return e.type === 'boss'; }); let on = 0, air = 0;
    for (const e of world.enemies) { if (e.dead || e.dying || e.y < 0 || e.y > H || e.x < 0 || e.x > W) continue; on++; if (!e.ground && !e.surface) air++; }
    if (boss && bossF < 0) bossF = f; if (bossF >= 0 && deadF < 0 && world.enemies.some(function (e) { return e.type === 'boss' && e.dying; })) deadF = f;
    if (world.enc) encs[world.enc.id] = (encs[world.enc.id] || 0) + 10;
    if (bossF < 0) { enMax = Math.max(enMax, on); enSum += on; n10++; kills = run.stats.kills;
      const calm = on === 0 && world.ebul.length === 0 && !world.enc, calmAir = air === 0 && world.ebul.length === 0 && !world.enc;
      if (calm) { if (q0 < 0) q0 = f; } else { close(quiet, q0, f, 300); q0 = -1; }
      if (calmAir) { if (qa0 < 0) qa0 = f; } else { close(quietAir, qa0, f, 300); qa0 = -1; } }
    else { close(quiet, q0, f, 300); q0 = -1; close(quietAir, qa0, f, 300); qa0 = -1; }
    if (step % 60 === 59) { let h = run.score | 0; for (const e of world.enemies) h = (Math.imul(h, 31) + Math.round(e.x * 8) + Math.round(e.y * 8) * 7) | 0; trace.push(h + ':' + world.enemies.length + ':' + world.ebul.length + ':' + Math.round(player ? player.x : 0)); }
    if (step % 6 === 5) sec.push({ b: world.ebul.length, boss: boss });
    if (step % 36 === 0) world.parts.length = Math.min(world.parts.length, 300);
  }
  const avg = function (a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : 0; }, pre = sec.filter(function (x) { return !x.boss; }).map(function (x) { return x.b; }), bins = [];
  for (let i = 0; i < pre.length; i += 10) bins.push(avg(pre.slice(i, i + 10)));
  const st = Object.values(SF.R.stages)[0] || {}, hits = SF.R.hits, preHits = hits.filter(function (h) { return !h.boss && h.why !== 'flame'; }).length, bossHits = hits.filter(function (h) { return h.boss; }).length, by = {};
  hits.forEach(function (h) { if (!h.boss) by[h.cause] = (by[h.cause] || 0) + 1; });
  const top = function (list) { return list.sort(function (a, b) { return b[1] - a[1]; }).slice(0, 3); };
  Object.assign(out, { end: end, frames: flown, wallMs: Math.round(performance.now() - t0), errs: SF.R.errs.slice(0, 3), errCount: SF.R.errs.length,
    bossIn: bossF < 0 ? null : +(bossF / 60).toFixed(1), bossSec: bossF >= 0 && deadF >= 0 ? +((deadF - bossF) / 60).toFixed(1) : null, bossKilled: deadF >= 0,
    hitsPre: preHits, hitsBoss: bossHits, hitsPerMin: bossF > 0 ? +(preHits / (bossF / 3600)).toFixed(2) : null, hitsBy: by,
    window10: +Math.max.apply(null, bins.concat([0])).toFixed(1), preAvg: +avg(pre).toFixed(1), bossAvg: +avg(sec.filter(function (x) { return x.boss; }).map(function (x) { return x.b; })).toFixed(1),
    enemiesAvg: +(enSum / Math.max(1, n10)).toFixed(2), enemiesMax: enMax, killsPre: kills, killsPerMin: bossF > 0 ? +(kills / (bossF / 3600)).toFixed(1) : null, kills: st.kills === undefined ? null : st.kills, seen: st.seen === undefined ? null : st.seen, score: run.score,
    quiet: top(quiet), quietAir: top(quietAir), encFrames: encs, updMaxMs: st.updMax === undefined ? null : +st.updMax.toFixed(1), trace: trace });
  SF.setMode('immortal'); SF.start(diff, 1); startEnigma(lv, true, loops);
  /* plan generation, as the game does it (5 builds of this sortie's plan) */
  const pm = []; for (let k = 0; k < 5; k++) { const S2 = buildSortie(lv, S.seed), a = performance.now(); sortiePlanBuild(S2); pm.push(performance.now() - a); } pm.sort(function (a, b) { return a - b; });
  out.planMs = { median: +pm[2].toFixed(1), max: +pm[4].toFixed(1) };
  /* chunk build time over the whole level, as tests/enigma.mjs --bench does it */
  const cm = []; world.chunks = new Map(); world.chunkInfo = new Map(); world.chunkJobs = [];
  for (let p = world.stageBaseP - 2; p <= world.stageBaseP + S.len + 6; p++) { startChunk(p); const j = world.chunkJobs.pop(), a = performance.now(); let n = 0; while (!workChunk(j, CH) && n++ < 9); cm.push(performance.now() - a); }
  cm.sort(function (a, b) { return a - b; }); out.chunkMs = { mean: +(cm.reduce(function (s, x) { return s + x; }, 0) / cm.length).toFixed(2), p95: +cm[Math.floor(cm.length * 0.95)].toFixed(2), max: +cm[cm.length - 1].toFixed(2), chunks: cm.length };
  return out;
})`;

const browser = await chromium.launch();
async function fly(job) {
  const page = await browser.newPage({ viewport: VIEW }), pageErrs = [];
  page.on('pageerror', e => pageErrs.push(String(e && e.message || e).slice(0, 200)));
  try {
    await page.route(/workers\.dev/, r => r.abort());
    await page.goto(PAGE);
    await page.waitForFunction(() => typeof window.__sf === 'function');
    await page.evaluate(src => window.__sf(src), harness);
    const t0 = Date.now(), r = await page.evaluate(([code, a]) => window.SF.peek(code + '(' + a.join(',') + ')'), [FLY, [job.level, job.loops, job.diff, LAG, REACT]]);
    r.totalMs = Date.now() - t0; r.pageErrs = pageErrs; return r;
  } finally { await page.close(); }
}
const jobs = []; for (const level of LEVELS) for (const loops of LOOPS_OF[level] || [0]) { if (ONLY_LOOPS && !ONLY_LOOPS.includes(loops)) continue; for (const diff of DIFFS) jobs.push({ level, loops, diff }); }
const flights = new Array(jobs.length), again = new Array(jobs.length); let next = 0; const tAll = Date.now();
await Promise.all(Array.from({ length: Math.min(CONC, jobs.length) }, async () => { while (next < jobs.length) { const i = next++; flights[i] = await fly(jobs[i]); if (TWICE) again[i] = await fly(jobs[i]); process.stderr.write('.'); } }));
process.stderr.write('\n'); await browser.close();
const wallAll = Date.now() - tAll;

const f = (v, n = 1) => v === null || v === undefined || !Number.isFinite(+v) ? '-' : (+v).toFixed(n);
console.log(`Daily Sortie baselines, build ${VERSION}, human bot (lag ${LAG}, reaction ${REACT}), immortal, viewport ${VIEW.width}x${VIEW.height}, H ${flights[0] && flights[0].H}, ${CONC} pages at once`);
console.log('level loop seed diff     len  boss in  boss s  hits pre  /min  boss hits  window  pre avg  boss avg  kills/min  quiet s  quiet air s  chunk p95  plan ms  flight s  end');
for (const r of flights) console.log(`${String(r.level).padStart(5)} ${String(r.loops).padStart(4)} ${r.seed} ${NAMES[r.diff].padEnd(8)} ${String(r.len).padStart(3)} ${f(r.bossIn).padStart(8)} ${f(r.bossSec).padStart(7)} ${String(r.hitsPre).padStart(9)} ${f(r.hitsPerMin, 2).padStart(5)} ${String(r.hitsBoss).padStart(10)} ${f(r.window10).padStart(7)} ${f(r.preAvg).padStart(8)} ${f(r.bossAvg).padStart(9)} ${f(r.killsPerMin).padStart(10)} ${String(r.quiet[0] ? r.quiet[0][1] : 0).padStart(8)} ${String(r.quietAir[0] ? r.quietAir[0][1] : 0).padStart(12)} ${f(r.chunkMs.p95, 2).padStart(10)} ${f(r.planMs.median, 0).padStart(8)} ${f(r.wallMs / 1000).padStart(9)}  ${r.end}${r.errCount || r.pageErrs.length ? '  ERRORS ' + (r.errCount + r.pageErrs.length) : ''}`);

// per kit and difficulty: [min, max] of each measure over the first pass and the first loop (the plan's baseline; level 2's loops 2 and 3 are a rank
// harder each and stay in `flights` only), which is what the gate's thresholds are relative to
const kits = {};
for (const level of LEVELS) { const k = kits[KIT[level]] = { level, byDiff: {} };
  for (const diff of DIFFS) { const rs = flights.filter(r => r.level === level && r.diff === diff && r.loops <= 1), rng = key => { const v = rs.map(r => r[key]).filter(x => x !== null && x !== undefined); return v.length ? [Math.min(...v), Math.max(...v)] : null; };
    k.byDiff[NAMES[diff]] = { flights: rs.length, bossIn: rng('bossIn'), bossSec: rng('bossSec'), bossKilled: rs.every(r => r.bossKilled), hitsPerMin: rng('hitsPerMin'), window10: rng('window10'), preAvg: rng('preAvg'), bossAvg: rng('bossAvg'), killsPerMin: rng('killsPerMin'),
      quietMax: Math.max(0, ...rs.map(r => r.quiet[0] ? r.quiet[0][1] : 0)), quietAirMax: Math.max(0, ...rs.map(r => r.quietAir[0] ? r.quietAir[0][1] : 0)), flightS: [+(Math.min(...rs.map(r => r.wallMs)) / 1000).toFixed(1), +(Math.max(...rs.map(r => r.wallMs)) / 1000).toFixed(1)] };
    k.byDiff[NAMES[diff]].chunkP95 = [Math.min(...rs.map(r => r.chunkMs.p95)), Math.max(...rs.map(r => r.chunkMs.p95))]; k.byDiff[NAMES[diff]].planMs = [Math.min(...rs.map(r => r.planMs.median)), Math.max(...rs.map(r => r.planMs.median))]; } }
const walls = flights.map(r => r.wallMs).sort((a, b) => a - b), totals = flights.map(r => r.totalMs).sort((a, b) => a - b), med = a => a[Math.floor(a.length / 2)];
const timing = { flights: flights.length, conc: CONC, flightS: { min: +(walls[0] / 1000).toFixed(1), median: +(med(walls) / 1000).toFixed(1), max: +(walls[walls.length - 1] / 1000).toFixed(1) }, withBenchS: { median: +(med(totals) / 1000).toFixed(1), max: +(totals[totals.length - 1] / 1000).toFixed(1) }, allS: +(wallAll / 1000).toFixed(0),
  gameSpeed: +(flights.reduce((a, r) => a + r.frames / 60, 0) / flights.reduce((a, r) => a + r.wallMs / 1000, 0)).toFixed(1) };
console.log(`\none flight: ${timing.flightS.min} to ${timing.flightS.max} s (median ${timing.flightS.median} s), ${timing.gameSpeed}x game speed; with the plan and chunk timings ${timing.withBenchS.median} s median; everything ${timing.allS} s with ${CONC} pages at once`);
let repeat = null;
if (TWICE) { const keys = ['frames', 'score', 'hitsPre', 'hitsBoss', 'bossIn', 'bossSec', 'window10', 'preAvg', 'kills', 'end'], diff = []; flights.forEach((r, i) => { const b = again[i], d = keys.filter(k => JSON.stringify(r[k]) !== JSON.stringify(b[k])); let at = 0; while (at < r.trace.length && r.trace[at] === b.trace[at]) at++; r.sameUntil = at >= Math.max(r.trace.length, b.trace.length) ? null : at * 10; r.second = Object.fromEntries(keys.concat(['hitsPerMin', 'killsPerMin']).map(k => [k, b[k]]));
    if (d.length || r.sameUntil !== null) diff.push(`level ${r.level} loop ${r.loops} ${NAMES[r.diff]}: the same for ${r.sameUntil === null ? 'the whole flight' : r.sameUntil + ' s'}${d.length ? '; ' + d.map(k => `${k} ${r[k]} / ${b[k]}`).join(', ') : ''}`); });
  repeat = { flights: flights.length, different: diff.length, which: diff }; console.log(diff.length ? `a second flight in a fresh page differed in ${diff.length} of ${flights.length}:\n  ` + diff.join('\n  ') : `a second flight in a fresh page gave the same numbers in all ${flights.length}`); }
const bad = flights.filter(r => r.errCount || r.pageErrs.length || !r.bossKilled || !String(r.end).startsWith('next:'));
if (bad.length) console.log(`\n${bad.length} flight(s) with errors, no boss kill or no level change: ` + bad.map(r => `level ${r.level} loop ${r.loops} ${NAMES[r.diff]} (${r.end}, errors ${r.errCount + r.pageErrs.length})`).join('; '));

const save = arg('save', null);
for (const r of flights) delete r.trace;
if (save && save !== true) { for (const r of flights) delete r.totalMs;
  writeFileSync(save, JSON.stringify({ about: 'Daily Sortie gate 3 baselines (docs/daily-sortie-plan.md, phase 0): the hand-made levels 2, 4 and 5 flown by the human bot in immortal mode. Written by tests/daily-baseline.mjs --save.',
    version: VERSION, bot: { lag: LAG, react: REACT, mode: 'immortal' }, viewport: VIEW, H: flights[0] && flights[0].H, units: { bossIn: 's from the level start', bossSec: 's the boss lasted', hitsPerMin: 'bullets and rams that hit the ship per minute before the boss', window10: 'worst 10 s window before the boss, average enemy bullets on screen', preAvg: 'average enemy bullets on screen before the boss', quiet: '[start s, length s] of the longest stretches before the boss with no enemy on screen, no enemy bullet and no encounter (5 s and longer)', quietAir: 'the same, counting only enemies in the air', chunkMs: 'ms to build one 224x64 chunk, this machine', planMs: 'ms for the generator to make the level plan in the page, this machine', wallMs: 'ms one flight took at full speed' },
    timing, repeat, kitsAbout: '[min, max] per difficulty over the first pass (loop 0) and the first loop (loop 1) of the kit\'s level', kits, flights }, null, 1) + '\n'); console.log('saved ' + save); }
