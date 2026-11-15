#!/usr/bin/env node
// Phase 1 probe of docs/ground-variety-plan.md: which generator parameters ("dials") do the three whole-level builders honour, and over what range
// do the plan checks stay clean? Node only; it measures and never fails the build.
//   node tests/dials-probe.mjs [--seeds 12] [--kit desert] [--verbose]
// Part 1 (effect): for each kit and candidate dial, the same composed segment list and seed are generated at the dial's low and high value and
//   compared to the kit's own plan (no dial). A dial "reaches" the plan when the ground raster, the slots or the buildings differ.
// Part 2 (range): the plan checks (tests/kit-check.mjs: gate 2) at the low and the high value, over N composed sorties; flags and the built share.
import { createRequire } from 'node:module';
import { KITS as PROBE, check, CG } from './kit-check.mjs';
const require = createRequire(import.meta.url), SC = require('../tools/sortie-compose.js');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const N = +arg('seeds', 12), ONLY = arg('kit', null), VERBOSE = process.argv.includes('--verbose');

/* candidate dials: [name, low, high]; a value is merged into the generator's params after the kit's own */
const CAND = {
  desert: [['wear', 0, 0.8], ['damage', 0.05, 0.7], ['portDensity', 0.2, 0.8], ['trees', 0.3, 1.6], ['lotChance', 0.02, 0.16], ['farms', 0, 0.8], ['industry', 0, 0.5], ['mixVillage', 0.1, 1]],
  forest: [['damage', 0, 0.5], ['trees', 0.4, 1.8], ['lotChance', 0.02, 0.16], ['farms', 0, 0.8], ['slots', { flakPer300: 1, artyPer300: 0.5 }, { flakPer300: 3.4, artyPer300: 1.7 }], ['industry', 0, 0.5]],
  winter: [['damage', 0, 0.6], ['trees', 0.4, 1.8], ['lotChance', 0.02, 0.16], ['farms', 0, 0.8], ['slots', { flakPer300: 1, artyPer300: 0.5 }, { flakPer300: 3.4, artyPer300: 1.7 }], ['industry', 0, 0.5]],
};
const DENS = { even: [[0, 0.5], [1, 0.5]], front: [[0, 1], [0.5, 0.5], [1, 0.1]], back: [[0, 0.1], [0.5, 0.5], [1, 1]], middle: [[0, 0.1], [0.5, 1], [1, 0.1]] };
for (const k in CAND) for (const d in DENS) if (!ONLY || ONLY === k) CAND[k].push(['density:' + d, null, DENS[d]]);

/* a hash of the whole plan: every raster (sampled), every list (length and a sample of its contents) */
const hashPlan = p => { let h = 2166136261 >>> 0; const mix = v => { h = Math.imul(h ^ (v | 0), 16777619) >>> 0; }, str = t => { for (let i = 0; i < t.length; i++) mix(t.charCodeAt(i)); };
  for (const k of Object.keys(p).sort()) { if (k === 'P' || k === 'stage' || k === 'seed' || k === 'preset' || k === 'v') continue; /* (P holds the parameters themselves and stage is not reproducible: both differ by construction) */ const v = p[k]; str(k); if (ArrayBuffer.isView(v)) { for (let i = 0; i < v.length; i += 5) mix(v[i] * 1000); } else if (Array.isArray(v)) { mix(v.length); for (let i = 0; i < v.length; i += Math.max(1, v.length >> 5)) str(JSON.stringify(v[i])); } else if (v && typeof v === 'object') str(JSON.stringify(v)); else if (typeof v === 'number') mix(v * 1000); }
  return h; };
const apply = (gen, name, v) => name.startsWith('density:') ? Object.assign({}, gen, { params: Object.assign({}, gen.params, { density: v }) }) : Object.assign({}, gen, { params: Object.assign({}, gen.params, { [name]: v }) });
const seedOf = s => (SC.hash(s, 9191) * 4294967296) | 0;
const med = a => a.slice().sort((x, y) => x - y)[a.length >> 1];

for (const kit of SC.KIT_ORDER.filter(k => !ONLY || k === ONLY)) {
  const K = SC.KITS[kit], base = [];
  for (let s = 0; s < N; s++) base.push(SC.composeSortie(kit, seedOf(s), 0));
  console.log(`\n== ${kit}: ${N} composed sorties`);
  console.log('dial'.padEnd(18) + 'reaches the plan'.padEnd(18) + 'flagged lo/hi'.padEnd(16) + 'worst built over limit (lo/hi)'.padEnd(34) + 'plan ms lo/hi');
  for (const [name, lo, hi] of CAND[kit]) {
    let reach = 0, tried = 0, bad = { lo: 0, hi: 0 }, over = { lo: 0, hi: 0 }, ms = { lo: [], hi: [] }; const flags = {};
    for (const C of base) {
      let h0; try { h0 = hashPlan(CG.generate(C.gen)); } catch (e) { continue; }
      const sides = lo === null ? [['hi', hi]] : [['lo', lo], ['hi', hi]]; let reached = false;
      for (const [side, v] of sides) {
        const gen = apply(C.gen, name, v), r = check(PROBE[kit], C.segs, C.gen.seed, gen); ms[side].push(r.ms);
        let h1; try { h1 = hashPlan(CG.generate(gen)); } catch (e) { h1 = -1; } if (h1 !== h0) reached = true;
        if (r.flags.length) { bad[side]++; for (const f of r.flags) flags[f] = (flags[f] || 0) + 1; if (VERBOSE) console.log(`   ${name} ${side} #${base.indexOf(C)}: ${r.flags.join(',')} ${r.notes.join('; ').slice(0, 140)}`); }
        for (const b of r.built || []) { const lim = (K.middle[b.t] || {}).built ?? K.fixedBuilt[b.t]; if (lim !== undefined && b.v > lim) over[side]++; }
      }
      tried++; if (reached) reach++;
    }
    console.log(name.padEnd(18) + `${reach}/${tried}`.padEnd(18) + `${bad.lo}/${bad.hi}`.padEnd(16) + `${over.lo}/${over.hi} stretches`.padEnd(34) + `${ms.lo.length ? Math.round(med(ms.lo)) : '-'}/${Math.round(med(ms.hi))}` + (Object.keys(flags).length ? '   ' + Object.entries(flags).map(([k, v]) => k + ' ' + v).join(', ') : ''));
  }
}
