// City generator test (tools/citygen.js, the settlement generator behind tools/citylab.html). Node only, no browser:
//   node tests/citygen.mjs          100 seeds of every preset and density curve the lab offers; every hard rule must hold
// Hard rules: no overlapping buildings, every house fronts a street, every tank carriageway joins the main road, churches spaced out,
// and the same seed always gives the same plan. Also prints plan time and density error per curve.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const CG = require('../tools/citygen.js');
const CURVES = { town: [[0, 0.04], [0.16, 0.28], [0.38, 0.66], [0.58, 1], [0.8, 0.86], [1, 0.6]], approach: [[0, 0.03], [0.2, 0.22], [0.45, 0.5], [0.7, 0.8], [1, 1]], centre: [[0, 0.85], [0.5, 1], [1, 0.9]], fringe: [[0, 0.03], [0.4, 0.3], [1, 0.4]] };
let bad = 0; const fail = m => { bad++; console.error('FAIL ' + m); };
const hash = p => { let h = 2166136261; for (const a of [p.K, p.B]) for (let i = 0; i < a.length; i += 7) { h ^= a[i] & 0xffff; h = Math.imul(h, 16777619); } return (h >>> 0).toString(16) + ':' + p.items.length + ':' + p.slots.length; };
for (const [name, density] of Object.entries(CURVES)) for (const damage of [0, 0.6]) {
  const ms = [], errs = []; let fails = 0, sq = 0, slots = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const t = performance.now(), p = CG.generate({ seed, params: { density, damage } }); ms.push(performance.now() - t);
    const m = CG.validate(p); errs.push(m.densityErr); slots += p.slots.length; sq += m.squares;
    if (!m.pass) { fails++; if (fails <= 3) fail(`${name} damage ${damage} seed ${seed}: overlap ${m.overlapPx}, off the street ${m.noFrontage}, tank reach ${m.tankReach.toFixed(3)}, church gap ${m.churchMinGap}`); }
    if (seed <= 5 && hash(p) !== hash(CG.generate({ seed, params: { density, damage } }))) fail(`${name} seed ${seed}: the same seed gave a different plan`);
  }
  ms.sort((a, b) => a - b);
  console.log(`${fails ? 'FAIL' : 'ok  '} ${name.padEnd(9)} damage ${damage}: ${100 - fails}/100 pass, plan ${ms[50].toFixed(0)} ms median / ${ms[99].toFixed(0)} max, density error ${(errs.reduce((a, b) => a + b, 0) / 100).toFixed(1)} pts, squares ${sq}, slots ${(slots / 100).toFixed(1)} per town`);
}
// the river towns: every hard rule, at least two bridges over an island river and one over any other, the island reached by tanks
for (const preset of ['river', 'rivers']) for (const damage of [0, 0.6]) { let fails = 0, bridges = 0;
  for (let seed = 1; seed <= 100; seed++) { const p = CG.generate({ seed, preset, params: { damage } }), m = CG.validate(p); bridges += m.bridges;
    if (!m.pass) { fails++; if (fails <= 3) fail(`${preset} damage ${damage} seed ${seed}: overlap ${m.overlapPx}, off the street ${m.noFrontage}, tank reach ${m.tankReach.toFixed(3)}, bridges ${m.bridges}, island reached ${m.islandReach}`); }
    if (p.craters.some(c => { const k = p.K[Math.round(c.y) * p.W + Math.round(c.x)]; return k === CG.K.RIVER || k === CG.K.BRIDGE; })) { fails++; fail(`${preset} seed ${seed}: a bomb crater in the river`); } }
  console.log(`${fails ? 'FAIL' : 'ok  '} ${preset.padEnd(9)} damage ${damage}: ${100 - fails}/100 pass, ${(bridges / 100).toFixed(2)} bridges per town`);
}
// the river animation gives streaks on the water only
{ const p = CG.generate({ seed: 3, preset: 'rivers' }); let n = 0, dry = 0; for (let t = 0; t < 6; t += 0.25) for (const r of CG.riverFx(p, t)) { n++; for (let x = r.x; x < r.x + r.w; x++) if (p.K[r.y * p.W + x] !== CG.K.RIVER) dry++; }
  if (!n || dry) fail(`river animation: ${n} streaks, ${dry} pixels off the water`); else console.log(`ok   river animation: ${n} streaks in 24 frames, all on the water`); }
// quarters: steep planned grids everywhere (the lab's extreme) still keep every hard rule; the default mix gives all three street patterns
for (const preset of ['town', 'river']) { let fails = 0;
  for (let seed = 1; seed <= 100; seed++) { const m = CG.validate(CG.generate({ seed, preset, params: { gridChance: 1, gridTilt: [0.3, 0.4] } }));
    if (!m.pass) { fails++; if (fails <= 3) fail(`steep grid ${preset} seed ${seed}: overlap ${m.overlapPx}, off the street ${m.noFrontage}, tank reach ${m.tankReach.toFixed(3)}, bridges ${m.bridges}`); } }
  console.log(`${fails ? 'FAIL' : 'ok  '} steep grid ${preset.padEnd(5)}: ${100 - fails}/100 pass (every quarter a planned grid tilted 17 to 22 degrees)`);
}
{ const styles = {}; let tilted = 0, tracks = 0;
  for (let seed = 1; seed <= 100; seed++) { const p = CG.generate({ seed }); for (const q of p.quarters) styles[q.style] = (styles[q.style] || 0) + 1; tilted += p.streets.filter(s => Math.abs(s.slope || 0) >= 0.1).length; tracks += p.tracks.length; }
  const okMix = styles.fields > 0 && styles.grid > 0 && styles.follow > 0 && tilted > 0 && tracks > 0;
  if (!okMix) fail(`quarters: the default town lacks a street pattern (${JSON.stringify(styles)}, ${tilted} tilted streets, ${tracks} farm tracks)`);
  else console.log(`ok   quarters: ${styles.fields} field-lane, ${styles.grid} grid, ${styles.follow} follow quarters in 100 towns; ${tilted} tilted streets, ${tracks} farm tracks`);
}
// step 2: the old town, roundabouts and public buildings turn up in most default towns
{ const n = { old: 0, star: 0 }, civ = {};
  for (let seed = 1; seed <= 100; seed++) { const p = CG.generate({ seed }); if (p.oldTown) n.old++; if (p.stars.length) n.star++; for (const c of new Set(p.civic.map(c => c.label))) civ[c] = (civ[c] || 0) + 1; }
  const need = { 'Town hall': 70, 'Government building': 25, 'Domed hall': 30, 'Department store': 35, Gasworks: 70 }, short = Object.keys(need).filter(k => (civ[k] || 0) < need[k]);
  if (n.old < 80 || n.star < 85 || short.length) fail(`step 2: old towns ${n.old}, roundabouts ${n.star}, ${JSON.stringify(civ)}`);
  else console.log(`ok   step 2 in 100 towns: old town ${n.old}, roundabout ${n.star}, ${Object.entries(civ).map(([k, v]) => k.toLowerCase() + ' ' + v).join(', ')}`);
}
// no road markings in town: paint whole towns and look for the marking colour
{ const mark = CG.palette.mark; let marks = 0;
  for (const [seed, preset] of [[1, 'town'], [5, 'town'], [9, 'river'], [12, 'rivers']]) {
    const p = CG.generate({ seed, preset }), img = { data: new Uint8ClampedArray(p.W * p.L * 4) }; CG.paint(p, img, 0, p.L, { noFx: true });
    const d = img.data; for (let o = 0; o < d.length; o += 4) if (d[o] === mark[0] && d[o + 1] === mark[1] && d[o + 2] === mark[2]) marks++; }
  if (marks) fail(`road markings: ${marks} marking pixels painted`); else console.log('ok   road markings: none in 4 painted towns');
}
if (bad) { console.error(`\n${bad} problem(s)`); process.exit(1); }
console.log('\nCity generator checks pass.');
