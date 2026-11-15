#!/usr/bin/env node
// Probe of docs/ground-variety-plan.md: the ground dials (tools/sortie-compose.js DIALS, read by the generator's builders). Node only; it measures and never fails the build.
//   node tests/dials-probe.mjs [--seeds 12] [--draws 60] [--kit desert] [--verbose]
// Part 1 (extremes): for each kit and dial, N composed sorties are generated with no dial, then with the dial at its lowest and its highest value on every segment
//   (and every global) that can take it. "reaches" = the plan differs from the plain one (every raster and list, but not P and stage, which differ by construction).
//   Plan checks (tests/kit-check.mjs, gate 2) run on both; "flagged" counts plans with any flag, "over" the stretches over their `built` limit.
// Part 2 (draws): `--draws` composed sorties per kit exactly as a date gets them (dials on), judged by the same checks: the range a day can reach.
// (The first phase of this probe, 2026-11-15, asked which top-level generator parameters the three builders honour; the answer is in the plan, section 4.1.)
import { createRequire } from 'node:module';
import { KITS as PROBE, check, CG } from './kit-check.mjs';
const require = createRequire(import.meta.url), SC = require('../tools/sortie-compose.js');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const N = +arg('seeds', 12), DRAWS = +arg('draws', 60), ONLY = arg('kit', null), VERBOSE = process.argv.includes('--verbose');

const hashPlan = p => { let h = 2166136261 >>> 0; const mix = v => { h = Math.imul(h ^ (v | 0), 16777619) >>> 0; }, str = t => { for (let i = 0; i < t.length; i++) mix(t.charCodeAt(i)); };
  for (const k of Object.keys(p).sort()) { if (k === 'P' || k === 'stage' || k === 'seed' || k === 'preset' || k === 'v') continue; /* (P holds the parameters themselves and stage is not reproducible: both differ by construction) */ const v = p[k]; str(k);
    if (ArrayBuffer.isView(v)) { for (let i = 0; i < v.length; i += 5) mix(v[i] * 1000); } else if (Array.isArray(v)) { mix(v.length); for (let i = 0; i < v.length; i += Math.max(1, v.length >> 5)) str(JSON.stringify(v[i])); } else if (v && typeof v === 'object') str(JSON.stringify(v)); else if (typeof v === 'number') mix(v * 1000); }
  return h; };
const seedOf = (s, salt) => (SC.hash(s, salt) * 4294967296) | 0, med = a => a.length ? a.slice().sort((x, y) => x - y)[a.length >> 1] : 0;
const limitOf = (K, t) => (K.middle[t] || {}).built ?? K.fixedBuilt[t];
const builtOver = (K, r) => (r.built || []).filter(b => { const lim = limitOf(K, b.t); return lim !== undefined && b.v > lim; }).length;

// a plain composed sortie's generator input with one dial set to one end of its range everywhere it applies
function withDial(C, kit, name, end) {
  const D = kit.dials, params = Object.assign({}, C.gen.params); let applies = 0;
  if (D.global[name]) { params[name] = D.global[name][end]; applies++; }
  params.segs = C.gen.params.segs.map(g => { const r = (D.seg[g.t] || {})[name]; if (!r) return g; applies++; return Object.assign({}, g, { p: { [name]: r[end] } }); });
  return applies ? { gen: Object.assign({}, C.gen, { params }) } : null;
}

for (const kit of SC.KIT_ORDER.filter(k => !ONLY || k === ONLY)) {
  const K = SC.KITS[kit], base = [];
  for (let s = 0; s < N; s++) base.push(SC.composeSortie(kit, seedOf(s, 9191), 0, 'plain', 'none', 'off'));
  console.log(`\n== ${kit}: ${N} composed sorties, each dial at its lowest and highest value on every segment that takes it`);
  console.log('dial'.padEnd(14) + 'reaches'.padEnd(10) + 'flagged lo/hi'.padEnd(16) + 'over limit lo/hi'.padEnd(18) + 'plan ms plain/lo/hi');
  for (const name of SC.dialNames(K)) {
    let reach = 0, tried = 0, bad = [0, 0], over = [0, 0]; const ms = [[], [], []], flags = {};
    for (const C of base) {
      let h0, r0; try { r0 = check(PROBE[kit], C.segs, C.gen.seed, C.gen); h0 = hashPlan(CG.generate(C.gen)); } catch (e) { continue; } ms[0].push(r0.ms); let reached = false;
      [0, 1].forEach(end => { const W = withDial(C, K, name, end); if (!W) return; const r = check(PROBE[kit], C.segs, C.gen.seed, W.gen); ms[end + 1].push(r.ms);
        if (hashPlan(CG.generate(W.gen)) !== h0) reached = true;
        if (r.flags.length) { bad[end]++; for (const f of r.flags) flags[f] = (flags[f] || 0) + 1; if (VERBOSE) console.log(`   ${name} ${end ? 'hi' : 'lo'} #${base.indexOf(C)}: ${r.flags.join(',')} ${r.notes.join('; ').slice(0, 150)}`); }
        over[end] += builtOver(K, r); });
      tried++; if (reached) reach++;
    }
    console.log(name.padEnd(14) + `${reach}/${tried}`.padEnd(10) + `${bad[0]}/${bad[1]}`.padEnd(16) + `${over[0]}/${over[1]}`.padEnd(18) + `${Math.round(med(ms[0]))}/${Math.round(med(ms[1]))}/${Math.round(med(ms[2]))}` + (Object.keys(flags).length ? '   ' + Object.entries(flags).map(([k, v]) => k + ' ' + v).join(', ') : ''));
  }
  // part 2: the draws as a date gets them
  let n = 0, nd = 0, bad = 0, over = 0; const fl = {}, ms = [], used = {};
  for (let s = 0; s < DRAWS; s++) { const C = SC.composeSortie(kit, seedOf(s, 9292), 0); n++; if (C.dialNames.length) nd++; for (const d of C.dialNames) used[d] = (used[d] || 0) + 1;
    const r = check(PROBE[kit], C.segs, C.gen.seed, C.gen); ms.push(r.ms); over += builtOver(K, r);
    if (r.flags.length) { bad++; for (const f of r.flags) fl[f] = (fl[f] || 0) + 1; if (VERBOSE) console.log(`   draw #${s} (${C.dialNames.join(',')}): ${r.flags.join(',')} ${r.notes.join('; ').slice(0, 150)}`); } }
  console.log(`draws: ${n} dated sorties, ${nd} with dials, ${bad} flagged${bad ? ' (' + Object.entries(fl).map(([k, v]) => k + ' ' + v).join(', ') + ')' : ''}, ${over} stretches over their built limit, plan ${Math.round(med(ms))} ms median, ${Math.round(Math.max(...ms))} ms worst; dials drawn: ${Object.entries(used).map(([k, v]) => k + ' ' + v).join(', ')}`);
}
