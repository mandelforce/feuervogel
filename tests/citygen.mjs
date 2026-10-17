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
// the village and the industrial estate: every hard rule, a village green with farmsteads, industrial quarters with a power station
for (const preset of ['village', 'crossroads', 'industrial']) for (const damage of [0, 0.6]) { let fails = 0, green = 0, farms = 0, ind = 0, power = 0;
  for (let seed = 1; seed <= 100; seed++) { const p = CG.generate({ seed, preset, params: { damage } }), m = CG.validate(p);
    if (!m.pass) { fails++; if (fails <= 3) fail(`${preset} damage ${damage} seed ${seed}: overlap ${m.overlapPx}, off the street ${m.noFrontage}, tank reach ${m.tankReach.toFixed(3)}`); }
    if (p.oldTown && p.oldTown.green) green++; farms += p.farms.length; if (p.quarters.some(q => q.style === 'industry')) ind++; if (m.civic.includes('Power station')) power++; }
  let centre = 0, inInd = 0; if (preset === 'crossroads') for (let seed = 1; seed <= 100; seed++) { const p = CG.generate({ seed, preset, params: { damage } }); if (p.crossroads && p.squares.length && p.churches.length) centre++; }
  if (preset === 'industrial') for (let seed = 1; seed <= 50; seed++) { const p = CG.generate({ seed, preset, params: { damage } }); inInd += p.churches.filter(c => p.quarters.some(q => q.style === 'industry' && c.yFront >= q.y0 - 40 && c.yFront < q.y1)).length; }
  const want = preset === 'village' ? green >= 90 && farms >= 2000 : preset === 'crossroads' ? centre >= 90 && farms >= 1500 : ind >= 95 && power >= 85 && inInd === 0;
  if (!want) fail(`${preset}: green ${green}, farms ${farms}, industrial ${ind}, power stations ${power}, centres ${centre}, churches among works ${inInd}`);
  console.log(`${fails || !want ? 'FAIL' : 'ok  '} ${preset.padEnd(10)} damage ${damage}: ${100 - fails}/100 pass, ` + (preset === 'village' ? `village green in ${green}, ${(farms / 100).toFixed(1)} farmsteads per village` : preset === 'crossroads' ? `crossroads with square and church in ${centre}, ${(farms / 100).toFixed(1)} farmsteads` : `industrial quarters in ${ind}, power station in ${power}, no church among the works`));
}
// the port city (a horizontal harbour at the end quay, alone or with a side harbour opening into it) and the coastal city (a side harbour):
// every hard rule, piers, ships, two lighthouses, the U-boat bunker, a channel of at least 28 px beside a side harbour's piers with a ship
// passing, the railway clear of the sea
for (const preset of ['port', 'portSouth', 'coast']) for (const damage of [0, 0.6]) { let fails = 0, piers = 0, ships = 0, lights = 0, bunker = 0, wetRail = 0, ot = 0, chan = 0, side = 0; const forms = {};
  for (let seed = 1; seed <= 100; seed++) { const p = CG.generate({ seed, preset, params: { damage } }), m = CG.validate(p); forms[p.coast.mode] = (forms[p.coast.mode] || 0) + 1;
    if (!m.pass) { fails++; if (fails <= 3) fail(`${preset} damage ${damage} seed ${seed}: overlap ${m.overlapPx}, off the street ${m.noFrontage}, tank reach ${m.tankReach.toFixed(3)}, trains blocked ${m.trainBlocked}`); }
    piers += p.port.piers; ships += p.ships.length; lights += p.items.filter(i => i.part === 'lighthouse').length; if (p.items.some(i => i.part === 'bunker')) bunker++; if (p.oldTown) ot++;
    if (p.port.side) { side++; if (p.port.side.channel >= 28 && p.ships.some(sh => sh.kind === 'coaster' && sh.ori === 'v')) chan++; }
    for (let i = 0; i < p.K.length; i++) if (p.RM[i] && p.K[i] === CG.K.SEA) wetRail++; }
    // (lanesBlocked is part of every pass: the fairways and the fleet area are open water with no ship in them)
  let fleet = 0; for (let seed = 1; seed <= 30; seed++) if (CG.generate({ seed, preset, params: { damage } }).fleetArea) fleet++;
  const ok = piers >= 300 && ships >= 900 && lights === 200 && bunker === 100 && chan === side && !wetRail && (preset === 'coast' || (forms.end > 20 && forms.corner > 20 && fleet === 30));
  if (!ok) fail(`${preset}: piers ${piers}, ships ${ships}, lighthouses ${lights}, bunkers ${bunker}, channels ${chan}/${side}, rail in the sea ${wetRail}, forms ${JSON.stringify(forms)}`);
  console.log(`${fails || !ok ? 'FAIL' : 'ok  '} ${preset.padEnd(9)} damage ${damage}: ${100 - fails}/100 pass (${Object.entries(forms).map(([k, v]) => k + ' ' + v).join(', ')}), ${(piers / 100).toFixed(1)} piers and ${(ships / 100).toFixed(1)} ships per port, lighthouses and U-boat bunker in every one, fairways for destroyers and submarines (40 px, 30 in a side channel) clear in every one${preset === 'coast' ? '' : ', a fleet area for the flagship beyond every breakwater'}, a ship passing in every side channel, old town in ${ot}`);
}
// harbours and railways: harbours in most river towns, a straight main line in every town, stations and second lines in most, rail bridges
// wherever a line crosses a river, no rail under a building other than the train shed, and the game's trains (16 px wide, about 200 px long)
// fit their runs: nothing within 8 px of the track (validate's trainBlocked, part of every pass above)
{ const n = { hb: 0, st: 0, stR: 0, br: 0, run: 0, rb: 0, rbNeed: 0 }; let wet = 0, under = 0, blocked = 0, mainShort = 0;
  for (let seed = 1; seed <= 100; seed++) for (const preset of ['town', 'river']) { const p = CG.generate({ seed, preset }), m = CG.validate(p);
    if (preset === 'river' && p.harbour) n.hb++; if (p.station) preset === 'town' ? n.st++ : n.stR++; if (p.railway && p.railway.branch) n.br++; if (p.trainRuns.some(r => r.line === 'branch')) n.run++;
    blocked += m.trainBlocked; const main = p.trainRuns.find(r => r.line === 'main'); if (!main || main.y1 - main.y0 < p.L - 1) mainShort++;
    let rbp = 0; for (let i = 0; i < p.K.length; i++) { if (p.K[i] === CG.K.RBRIDGE) rbp++; if (!p.RM[i]) continue; const k = p.K[i]; if (k === CG.K.RIVER || k === CG.K.BRIDGE) wet++; else if (k === CG.K.BLDG && p.RM[i] === 2 && p.items[p.B[i]].part !== 'shed') under++; }
    if (preset === 'river') { n.rbNeed++; if (rbp > 40) n.rb++; } }
  const ok = n.hb >= 55 && n.st >= 80 && n.stR >= 65 && n.br >= 100 && n.run >= 40 && n.rb === n.rbNeed && !wet && !under && !blocked && !mainShort;
  if (!ok) fail(`railway and harbour: ${JSON.stringify(n)}, rail on water ${wet}, under buildings ${under}, blocked for trains ${blocked}, main line short ${mainShort}`);
  else console.log(`ok   railway: a straight main line in 200 of 200 towns, stations in ${n.st} towns and ${n.stR} river towns, a second line in ${n.br} (a straight train run on it in ${n.run}), rail bridges in every river town, trains clear everywhere; harbour in ${n.hb} river towns`);
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
