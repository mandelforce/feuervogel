#!/usr/bin/env node
// Phase 1 probe of docs/daily-sortie-plan.md section 11: does a composed sortie's plan survive the Campaign's loop ground (a "flavour")?
// Node only. For each kit and N seeds: compose the sortie (as the game does), then generate its plan twice from the same segment list and seed,
// plain and with the kit's loop parameters (desert: variant 1; forest: autumn + lakes; winter: variant 1), and run the same plan checks
// (tests/kit-check.mjs, as tests/compose.mjs and the flight gate do). It measures; it never fails the build.
//   node tests/flavour-probe.mjs [--seeds 100] [--kit desert] [--verbose]
import { createRequire } from 'node:module';
import { KITS as PROBE, check } from './kit-check.mjs';
const require = createRequire(import.meta.url), SC = require('../tools/sortie-compose.js');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const N = +arg('seeds', 100), ONLY = arg('kit', null), VERBOSE = process.argv.includes('--verbose');
const FLAVOUR = { desert: { variant: 1 }, forest: { autumn: 1, lakes: 1 }, winter: { variant: 1 } };
for (const kit of SC.KIT_ORDER.filter(k => !ONLY || k === ONLY)) {
  const stat = { plain: { n: 0, bad: 0, flags: {}, ms: [] }, loop: { n: 0, bad: 0, flags: {}, ms: [] } };
  for (let s = 0; s < N; s++) {
    const seed = (SC.hash(s, 9090) * 4294967296) | 0, C = SC.composeSortie(kit, seed, 0);
    for (const f of ['plain', 'loop']) {
      const gen = f === 'plain' ? C.gen : Object.assign({}, C.gen, { params: Object.assign({}, C.gen.params, FLAVOUR[kit]) }), t0 = Date.now();
      const r = check(PROBE[kit], C.segs, C.gen.seed, gen), st = stat[f], K = SC.KITS[kit]; st.n++; st.ms.push(Date.now() - t0);
      /* the flight gate's own extra rule: the built share of a stretch over the kit's limit (tests/daily-gate.mjs) */
      for (const b of r.built || []) { const lim = f === 'loop' && K.groundBuilt && K.groundBuilt[b.t] !== undefined ? K.groundBuilt[b.t] : (K.middle[b.t] || {}).built || K.fixedBuilt[b.t]; if (lim !== undefined && b.v > lim) { r.flags.push('structures'); r.notes.push(b.t + ' ' + (100 * b.v).toFixed(0) + ' % over ' + (100 * lim).toFixed(0)); } }
      if (r.flags.length) { st.bad++; for (const x of r.flags) st.flags[x] = (st.flags[x] || 0) + 1; if (VERBOSE) console.log(`  ${kit} #${s} ${f}: ${r.flags.join(',')} ${r.notes.join('; ').slice(0, 160)}`); }
    }
  }
  const med = a => a.slice().sort((x, y) => x - y)[a.length >> 1];
  for (const f of ['plain', 'loop']) { const st = stat[f]; console.log(`${kit.padEnd(7)} ${f.padEnd(5)} ${st.n} plans, ${st.bad} flagged${st.bad ? ' (' + Object.entries(st.flags).map(([k, v]) => k + ' ' + v).join(', ') + ')' : ''}; plan time median ${med(st.ms)} ms`); }
}
