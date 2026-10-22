// City generator test (tools/citygen.js, the settlement generator behind tools/citylab.html). Node only, no browser:
//   node tests/citygen.mjs          100 seeds of every preset and density curve the lab offers; every hard rule must hold
// Hard rules: no overlapping buildings, every house fronts a street, every tank carriageway joins the main road, churches spaced out,
// and the same seed always gives the same plan. Also prints plan time and density error per curve.
import { readFileSync } from 'node:fs';
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
// islands (Enigma Run level 1): every hard rule; the warships' lane through the chain is open water; the islets include a farm with a paddock,
// houses and gun islets with turret and flak slots; the large island has its village (with the green), a farmstead and paddock beyond it, the
// wood, the pond, the jetty and the airbase (a runway of at least 200 px, hangars, blast pens, gun pits); the same seed gives the same plan
{ let fails = 0; const c = { farmIsle: 0, paddock: 0, houses: 0, guns: 0, green: 0, wood: 0, pond: 0, jetty: 0, runway: 0, hangars: 0, pens: 0 }, ms = [];
  for (let seed = 1; seed <= 100; seed++) { const t = performance.now(), p = CG.generate({ seed, preset: 'islands' }); ms.push(performance.now() - t); const m = CG.validate(p);
    if (!m.pass) { fails++; if (fails <= 3) fail(`islands seed ${seed}: overlap ${m.overlapPx}, off the street ${m.noFrontage}, tank reach ${m.tankReach.toFixed(3)}, lane blocked ${m.lanesBlocked}`); }
    const isleY = Math.round(p.L * p.P.big[0]), kinds = new Set(p.slots.filter(s => s.y < isleY).map(s => s.kind));
    if (p.farms.some(f => f.y0 < isleY)) c.farmIsle++; if (p.pastures.some(q => q.y0 > p.village.y1)) c.paddock++; if (p.items.some(i => i.t === 'house' && i.y0 < isleY)) c.houses++;
    if (kinds.has('bunker') && kinds.has('flak')) c.guns++; if (p.village.green) c.green++; if (p.wood.n > 400) c.wood++; if (p.pond) c.pond++; if (p.jetty && p.jetty.y1 - p.jetty.y0 > 12) c.jetty++;
    if (p.airbase && p.airbase.y1 - p.airbase.y0 >= 200) c.runway++; if (p.airbase && p.airbase.hangars >= 2) c.hangars++; if (p.slots.some(s => s.kind === 'parked')) c.pens++;
    { const st = new Map(), by0 = Math.round(p.L * p.P.big[0]); for (let i = 0; i < p.K.length; i++) { if (p.K[i] !== CG.K.FIELD || ((i / p.W) | 0) < by0) continue; const x = i % p.W, y = (i / p.W) | 0, id = p.F[i]; let o = st.get(id); if (!o) st.set(id, o = { n: 0, x0: x, x1: x, y0: y, y1: y }); o.n++; o.x0 = Math.min(o.x0, x); o.x1 = Math.max(o.x1, x); o.y0 = Math.min(o.y0, y); o.y1 = Math.max(o.y1, y); }
      const sm = [...st.values()].filter(o => o.n < 400 || Math.min(o.x1 - o.x0, o.y1 - o.y0) + 1 < 12).length; if (sm) { fails++; if (fails <= 3) fail(`islands seed ${seed}: ${sm} small fields on the large island`); } } // no slivers where the shore cut a field
    if (seed <= 3 && hash(p) !== hash(CG.generate({ seed, preset: 'islands' }))) fail(`islands seed ${seed}: the same seed gave a different plan`); }
  const low = Object.entries(c).filter(([k, v]) => v < (k === 'paddock' || k === 'pens' || k === 'houses' ? 90 : 100));
  if (low.length) fail(`islands: too few of ${low.map(([k, v]) => k + ' ' + v).join(', ')}`); ms.sort((a, b) => a - b);
  console.log(`${fails || low.length ? 'FAIL' : 'ok  '} islands: ${100 - fails}/100 pass, plan ${ms[50].toFixed(0)} ms median; of 100: ${Object.entries(c).map(([k, v]) => k + ' ' + v).join(', ')}`); }
// the desert (Enigma Run level 2): every hard rule in 60 desert ports with their beach towns and 60 desert villages; houses and farmsteads
// have flat roofs, every church is a domed hall, every tree a palm, open desert and no fields (owner: no farmland in the desert); the beach
// town is at war (owner mockup E): its promenade, obstacles in the shallows, wire, casemates and bunker slots on the beach, the pier cut
// through; the village pond is a well; the port's density follows portDensity. The desert palette must not leak: a temperate town painted
// after a desert one is the same as painted on its own.
{ let fails = 0; const c = { desert: 0, flat: 0, domes: 0, palms: 0, noFields: 0, prom: 0, war: 0, pier: 0, wells: 0 }, ms = [];
  for (const preset of ['portDesert', 'villageDesert']) for (let seed = 1; seed <= 60; seed++) { const t = performance.now(), p = CG.generate({ seed, preset }); ms.push(performance.now() - t); const m = CG.validate(p);
    if (!m.pass) { fails++; if (fails <= 3) fail(`${preset} seed ${seed}: overlap ${m.overlapPx}, off the street ${m.noFrontage}, tank reach ${m.tankReach.toFixed(3)}, lanes blocked ${m.lanesBlocked}, trains blocked ${m.trainBlocked}`); }
    let nd = 0, prom = 0, nf = 0; for (let i = 0; i < p.K.length; i++) { if (p.K[i] === CG.K.DESERT) nd++; if (p.K[i] === CG.K.FIELD) nf++; if (p.K[i] === CG.K.WALK && p.B[i] === -15) prom++; }
    if (nd > 15000) c.desert++; if (!nf) c.noFields++; if (p.items.every(b => !['house', 'terrace', 'block', 'farm', 'farmhouse'].includes(b.t) || b.part || b.style === 'flat')) c.flat++;
    if (p.churches.every(ch => ch.dome)) c.domes++; if (p.trees.length && p.trees.every(t => t.palm)) c.palms++;
    if (preset === 'portDesert') { const bt = p.beachTown, pr = bt && bt.pier, w = bt && bt.war; if (prom > 500) c.prom++; if (w && w.hedgehogs >= 20 && w.casemates >= 1 && w.bunkers >= 1 && p.coils.length >= 1) c.war++;
      if (pr && pr.cut && p.K[(pr.y0 + 2) * p.W + pr.cut] === CG.K.SEA) c.pier++; }
    else if (p.wells && p.wells.length === 1 && !p.K.some((k, i) => k === CG.K.WATER && p.B[i] === -7)) c.wells++; }
  const need = { desert: 120, flat: 120, domes: 120, palms: 120, noFields: 120, prom: 60, war: 60, pier: 60, wells: 60 }, low = Object.entries(c).filter(([k, v]) => v < need[k]);
  if (low.length) fail(`desert: too few of ${low.map(([k, v]) => k + ' ' + v + '/' + need[k]).join(', ')}`); ms.sort((a, b) => a - b);
  const built = pd => { let n = 0; for (let seed = 1; seed <= 10; seed++) { const p = CG.generate({ seed, preset: 'portDesert', params: { portDensity: pd } }); for (const k of p.K) if (k === CG.K.BLDG) n++; } return n; }, bl = [0, 0.5, 1].map(built), dens = bl[0] < bl[1] && bl[1] < bl[2];
  if (!dens) fail(`desert: the port's built area does not grow with portDensity (${bl.join(', ')})`);
  const pnt = p => { const img = { data: new Uint8ClampedArray(p.W * 600 * 4) }; CG.paint(p, img, 300, 600, { noFx: true }); return img.data; }, town = CG.generate({ seed: 4, preset: 'town' }), a = pnt(town);
  pnt(CG.generate({ seed: 4, preset: 'villageDesert' })); const b = pnt(town), leak = a.some((v, i) => v !== b[i]); if (leak) fail('desert: the desert palette leaked into a temperate town painted after it');
  console.log(`${fails || low.length || leak || !dens ? 'FAIL' : 'ok  '} desert: ${120 - fails}/120 pass, plan ${ms[60].toFixed(0)} ms median; ${Object.entries(c).map(([k, v]) => k + ' ' + v).join(', ')}; built area by port density ${bl.join(' < ')}; no palette leak`); }
// the desert's open land (desertLand): oasis villages of three sizes (damage grows with size), a held village and a strongpoint in the open
// (owner mockups G, H, I, D2, D3), 60 seeds each. Every hard rule; the grove, pool, square with the domed hall and the well; houses and ruins by
// size; in a held village every part of the kit (trench, pits, wire, mines with signs, the ditch, the roadblock, the bunker and tank slots, a
// net, roof nests); in a strongpoint six pits, two nets, the tank slot and wire with a gap; and the track always free: no trench, ditch, pit or
// spoil on it, so tanks pass
{ let fails = 0; const c = { grove: 0, hall: 0, sizes: 0, held: 0, post: 0, track: 0 }, ms = [], ruinShare = { oasisSmall: 0, oasis: 0, oasisLarge: 0 }, houses = { oasisSmall: 0, oasis: 0, oasisLarge: 0 };
  for (const preset of ['oasisSmall', 'oasis', 'oasisLarge', 'oasisHeld', 'desertPost']) for (let seed = 1; seed <= 60; seed++) { const t = performance.now(), p = CG.generate({ seed, preset }); ms.push(performance.now() - t); const m = CG.validate(p);
    if (!m.pass) { fails++; if (fails <= 3) fail(`${preset} seed ${seed}: overlap ${m.overlapPx}, tank reach ${m.tankReach.toFixed(3)}`); }
    let bad = 0; for (let y = 0; y < p.L; y++) for (let x = Math.round(p.mx[y] - 4); x <= p.mx[y] + 4; x++) if ([CG.K.TRENCH, CG.K.DITCH, CG.K.SPOIL].includes(p.K[y * p.W + x])) bad++; if (!bad) c.track++;
    const O = p.oasis[0]; if (O) { let pool = 0, palms = p.trees.filter(t => t.palm).length; for (let i = 0; i < p.K.length; i++) if (p.K[i] === CG.K.WATER && p.B[i] === -16) pool++; if (pool > 60 && palms >= 12) c.grove++; if (O.hall && p.wells.length) c.hall++;
      if (ruinShare[preset] !== undefined) { ruinShare[preset] += O.houses ? O.ruins / O.houses : 0; houses[preset] += O.houses; } }
    const kinds = p.slots.map(s => s.kind);
    if (preset === 'oasisHeld' && p.K.includes(CG.K.TRENCH) && p.K.includes(CG.K.DITCH) && p.pits.length >= 4 && p.coils.length >= 2 && p.mines.length > 40 && p.signs.length > 6 && p.barriers.length && kinds.includes('bunker') && kinds.includes('tank') && p.nets.length && p.slots.some(s => s.on === 'roof')) c.held++;
    if (preset === 'desertPost' && p.pits.length >= 8 && p.nets.length >= 3 && kinds.includes('tank') && p.coils.length >= 1 && p.mines.length > 40) c.post++; }
  for (const k in ruinShare) ruinShare[k] = +(ruinShare[k] / 60).toFixed(2), houses[k] = +(houses[k] / 60).toFixed(1);
  if (ruinShare.oasisSmall < ruinShare.oasis && ruinShare.oasis < ruinShare.oasisLarge && houses.oasisSmall < houses.oasis && houses.oasis < houses.oasisLarge) c.sizes = 1;
  const low = Object.entries(c).filter(([k, v]) => v < ({ grove: 240, hall: 240, sizes: 1, held: 60, post: 60, track: 300 })[k]); ms.sort((a, b) => a - b);
  if (low.length) fail(`desert land: too few of ${low.map(([k, v]) => k + ' ' + v).join(', ')}`);
  console.log(`${fails || low.length ? 'FAIL' : 'ok  '} desert land: ${300 - fails}/300 pass, plan ${ms[150].toFixed(1)} ms median; ${Object.entries(c).map(([k, v]) => k + ' ' + v).join(', ')}; houses by size ${Object.values(houses).join(' < ')}, ruined share ${Object.values(ruinShare).join(' < ')}`); }
// the rest of level 2 (owner mockups V, P, J, A), 60 seeds each, with the railway straight down the strip: every hard rule (trains clear, tanks
// reach every track pixel); the valley's wadi and oil field (derricks, pumpjacks, tanks, a well burning); the pass's 120 px gorge, its deep
// ravine with the stone viaduct (20 px across, the rails over the whole ravine) and the road bridge, sangars and the fort with four towers; the
// junction's branch (a straight train run of 150 px or more), platform, station and wagons; the airbase's runway, pens, hangar and tower
{ let fails = 0; const c = { valley: 0, pass: 0, gorge: 0, junction: 0, airbase: 0 }, ms = [];
  for (const preset of ['desertValley', 'desertPass', 'desertJunction', 'desertAirbase']) for (let seed = 1; seed <= 60; seed++) { const t = performance.now(), p = CG.generate({ seed, preset }); ms.push(performance.now() - t); const m = CG.validate(p);
    if (!m.pass || m.trainBlocked) { fails++; if (fails <= 3) fail(`${preset} seed ${seed}: overlap ${m.overlapPx}, tank reach ${m.tankReach.toFixed(3)}, trains blocked ${m.trainBlocked}`); }
    const n = k => { let q = 0; for (const v of p.K) if (v === k) q++; return q; };
    if (preset === 'desertValley' && n(CG.K.WADI) > 3000 && n(CG.K.CLIFF) > 30000 && p.derricks.length >= 2 && p.pumps.length >= 3 && p.derricks.some(d => d.burn) && p.items.filter(i => i.label === 'Oil tank').length >= 2) c.valley++;
    if (preset === 'desertPass') { const rv = p.ravines[0], vd = p.viaducts[0], W = p.W; let deck = 0; for (let x = 0; x < W; x++) if (p.K[(rv.y0 + 20) * W + x] === CG.K.RBRIDGE) deck++;
      let railOver = true; for (let y = vd.y0; y <= vd.y1; y++) if (p.RM[y * W + vd.x - 3] !== 2 || p.RM[y * W + vd.x + 3] !== 2) railOver = false;
      const bridge = p.K.some(k => k === CG.K.BRIDGE), towers = p.items.filter(i => i.label === 'Fort tower').length;
      if (n(CG.K.RAVINE) > 4000 && deck === 20 && railOver && bridge && p.sangars.length >= 2 && towers === 4) c.pass++;
      const mid = Math.round((rv.y0 + p.L * 0.94) / 2), gw = p.wallR[mid] - p.wallL[mid]; if (gw >= 104 && gw <= 136) c.gorge++; }
    if (preset === 'desertJunction') { const br = p.trainRuns.find(r => r.line === 'branch'); if (br && br.y1 - br.y0 >= 150 && p.K.some((k, i) => k === CG.K.PLAZA && p.B[i] === -5) && p.items.some(i => i.t === 'station') && p.wagons.length >= 3) c.junction++; }
    if (preset === 'desertAirbase') { const A = p.airbase; if (A && A.y1 - A.y0 >= 400 && p.slots.filter(s2 => s2.kind === 'parked').length >= 3 && p.items.some(i => i.part === 'tenthangar') && p.items.some(i => i.label === 'Control tower') && p.slots.filter(s2 => s2.kind === 'flak').length >= 1) c.airbase++; } }
  const low = Object.entries(c).filter(([k, v]) => v < 60); ms.sort((a, b) => a - b);
  if (low.length) fail(`desert segments: too few of ${low.map(([k, v]) => k + ' ' + v).join(', ')}`);
  console.log(`${fails || low.length ? 'FAIL' : 'ok  '} desert segments: ${240 - fails}/240 pass, plan ${ms[120].toFixed(1)} ms median; of 60 each: ${Object.entries(c).map(([k, v]) => k + ' ' + v).join(', ')}`); }
// Level 2 as one plan (sandSea, 20 seeds): every hard rule, the port and the desert joined (one track, trains clear), every segment's feature,
// and side tracks (tank routes off the main track, at least four per level) for the game's tanks to turn into
{ let fails = 0, low = 0, ms = []; for (let seed = 1; seed <= 20; seed++) { const t = performance.now(), p = CG.generate({ seed, preset: 'sandSea' }); ms.push(performance.now() - t); const m = CG.validate(p);
    if (!m.pass) { fails++; if (fails <= 3) fail(`sandSea seed ${seed}: overlap ${m.overlapPx}, tank reach ${m.tankReach.toFixed(3)}, trains blocked ${m.trainBlocked}, lanes blocked ${m.lanesBlocked}`); }
    const sides = p.streets.filter(s => s.side).length; if (!(sides >= 4 && p.viaducts.length === 1 && p.airbase && p.oasis.length === 2 && p.derricks.length >= 2 && p.trainRuns.length >= 3 && p.beachTown && p.beachTown.war)) low++; }
  ms.sort((a, b) => a - b); if (low) fail(`sandSea: ${low} of 20 plans miss a feature or side tracks`);
  console.log(`${fails || low ? 'FAIL' : 'ok  '} level 2 whole plan: ${20 - fails}/20 pass, every feature and side tracks in ${20 - low}, plan ${ms[10].toFixed(0)} ms median`); }
// Level 2, nothing stands on a road or the railway (owner review): no gun slot, pit, shell hole, oil spill or oasis on a track, a road or the rail's
// corridor; the oasis grove never straddles the line; the port's road wears through to the dirt track and the valley's rock rises from the join's
// first rows (no straight cliff edge and no hard road end where the port plan meets the desert)
{ let bad = 0, first = ''; const note = m => { bad++; if (!first) first = m; };
  for (let seed = 1; seed <= 40; seed++) { const p = CG.generate({ seed, preset: 'sandSea' }), W = p.W, Lp = p.port.y1 + 1, kAt = (x, y) => (x < 0 || x >= W || y < 0 || y >= p.L) ? -1 : p.K[Math.round(y) * W + Math.round(x)], bAt = (x, y) => (x < 0 || x >= W || y < 0 || y >= p.L) ? -1 : p.B[Math.round(y) * W + Math.round(x)];
    const onWay = (x, y) => { const k = kAt(x, y); return k === CG.K.ROAD || k === CG.K.BRIDGE || k === CG.K.RAIL || k === CG.K.RBRIDGE || (y >= Lp && bAt(x, y) === -50); };
    for (const sl of p.slots) if (sl.y >= Lp && sl.on === 'pit' && onWay(sl.x, sl.y)) note(`seed ${seed}: a ${sl.kind} pit at ${sl.x},${sl.y} on a road or the rail`);
    for (const c of p.craters) if (c.y >= Lp && onWay(c.x, c.y)) note(`seed ${seed}: a shell hole at ${c.x},${c.y} on a road or the rail`);
    for (const sp of p.spills || []) if (kAt(sp.x, sp.y) === CG.K.ROAD) note(`seed ${seed}: an oil spill at ${sp.x},${sp.y} on a road`);
    for (const o of p.oasis) { const rx = (p.trainRuns.find(r => r.line === 'main' && o.y >= r.y0 && o.y <= r.y1) || {}).x; if (rx !== undefined && Math.abs(o.x - rx) < o.rx) note(`seed ${seed}: an oasis at ${o.x},${o.y} across the railway`); }
    for (const cl of p.coils) for (const [x, y] of cl) if (y >= Lp && kAt(x, y) === CG.K.RAIL) note(`seed ${seed}: wire at ${Math.round(x)},${Math.round(y)} across the rail`);
    if (!(p.wallL[Lp] < 8 && W - p.wallR[Lp] < 8)) note(`seed ${seed}: the valley's rock starts with an edge at the join (${p.wallL[Lp]}, ${p.wallR[Lp]})`);
    if (!p.roadBlend || p.roadBlend[0] >= Lp || p.roadBlend[1] <= Lp) note(`seed ${seed}: no road blend across the join`); }
  if (bad) fail(`level 2 clear ways: ${bad} problems, first: ${first}`); else console.log('ok   level 2 clear ways: 40 seeds, nothing on a road or the rail, the grove clear of the line, the join without an edge'); }
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
for (const preset of ['port', 'portSouth', 'coast']) for (const damage of [0, 0.6]) { let fails = 0, piers = 0, ships = 0, lights = 0, bunker = 0, berth = 0, painted = 0, wetRail = 0, ot = 0, chan = 0, side = 0; const forms = {};
  for (let seed = 1; seed <= 100; seed++) { const p = CG.generate({ seed, preset, params: { damage } }), m = CG.validate(p); forms[p.coast.mode] = (forms[p.coast.mode] || 0) + 1;
    if (!m.pass) { fails++; if (fails <= 3) fail(`${preset} damage ${damage} seed ${seed}: overlap ${m.overlapPx}, off the street ${m.noFrontage}, tank reach ${m.tankReach.toFixed(3)}, trains blocked ${m.trainBlocked}`); }
    piers += p.port.piers; ships += p.ships.length; lights += p.items.filter(i => i.part === 'lighthouse').length; if (p.items.some(i => i.part === 'bunker')) bunker++; if (p.ships.some(sh => sh.kind === 'uboat')) painted++;
    { const sl = p.slots.find(q => q.kind === 'sub'); let wet = !!sl; if (sl) for (let y = sl.y - sl.h / 2; y < sl.y + sl.h / 2; y++) for (let x = sl.x - sl.w / 2; x < sl.x + sl.w / 2; x++) if (p.K[y * p.W + x] !== CG.K.SEA) wet = false; if (wet) berth++; } if (p.oldTown) ot++;
    if (p.port.side) { side++; if (p.port.side.channel >= 28 && p.ships.some(sh => sh.kind === 'coaster' && sh.ori === 'v')) chan++; }
    for (let i = 0; i < p.K.length; i++) if (p.RM[i] && p.K[i] === CG.K.SEA) wetRail++; }
    // (lanesBlocked is part of every pass: the fairways and the fleet area are open water with no ship in them)
  let fleet = 0; for (let seed = 1; seed <= 30; seed++) if (CG.generate({ seed, preset, params: { damage } }).fleetArea) fleet++;
  const ok = piers >= 300 && ships >= 900 && lights === 200 && bunker === 100 && berth === 100 && !painted && chan === side && !wetRail && (preset === 'coast' || (forms.end > 20 && forms.corner > 20 && fleet === 30));
  if (!ok) fail(`${preset}: piers ${piers}, ships ${ships}, lighthouses ${lights}, bunkers ${bunker}, submarine berths ${berth}, painted submarines ${painted}, channels ${chan}/${side}, rail in the sea ${wetRail}, forms ${JSON.stringify(forms)}`);
  console.log(`${fails || !ok ? 'FAIL' : 'ok  '} ${preset.padEnd(9)} damage ${damage}: ${100 - fails}/100 pass (${Object.entries(forms).map(([k, v]) => k + ' ' + v).join(', ')}), ${(piers / 100).toFixed(1)} piers and ${(ships / 100).toFixed(1)} ships per port, lighthouses, U-boat bunker and a berth of open water for the game's submarine (12 x 46 px) in every one, fairways for destroyers and submarines (40 px, 30 in a side channel) clear in every one${preset === 'coast' ? '' : ', a fleet area for the flagship beyond every breakwater'}, a ship passing in every side channel, old town in ${ot}`);
}
// the beach landing: every hard rule, beach exits from the coastal road, a bunker line in the dunes (at least four bunkers), a coastal battery
// with its radar, obstacles and wire on the sand, the sea before the beach open for the flagship, nothing standing in the sea
for (const damage of [0, 0.6]) { let fails = 0, exits = 0, bunkers = 0, minB = 99, bat = 0, radar = 0, obst = 0, fleet = 0, wet = 0;
  for (let seed = 1; seed <= 60; seed++) { const p = CG.generate({ seed, preset: 'beach', params: { damage } }), m = CG.validate(p);
    if (!m.pass) { fails++; if (fails <= 3) fail(`beach damage ${damage} seed ${seed}: overlap ${m.overlapPx}, off the street ${m.noFrontage}, tank reach ${m.tankReach.toFixed(3)}, lanes blocked ${m.lanesBlocked}`); }
    const nb = p.beachSlots.filter(b => b.kind === 'bunker' && b.on !== 'radar').length; bunkers += nb; minB = Math.min(minB, nb); if (p.battery >= 3) bat++; if (p.beachSlots.some(b => b.on === 'radar')) radar++;
    if ((p.coast.exits || []).length >= 2) exits++; if (p.obstacles.length > 40 && p.wires.length) obst++; if (p.fleetArea) fleet++;
    for (const it of p.items) for (let y = it.y0; y < it.y0 + it.h; y++) for (let x = it.x0; x < it.x0 + it.w; x++) if (p.K[y * p.W + x] === CG.K.SEA && p.B[y * p.W + x] === it.id) wet++; }
  const ok = !fails && exits === 60 && minB >= 4 && bat === 60 && radar >= 50 && obst === 60 && fleet === 60 && !wet;
  if (!ok) fail(`beach damage ${damage}: exits ${exits}, bunkers min ${minB}, batteries ${bat}, radar ${radar}, obstacles ${obst}, fleet ${fleet}, in the sea ${wet}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} beach     damage ${damage}: ${60 - fails}/60 pass, two or more exits in ${exits}, ${(bunkers / 60).toFixed(1)} bunkers in the dunes (at least ${minB}), a battery in ${bat} and a radar in ${radar}, obstacles and wire in ${obst}, the flagship's sea open in ${fleet}`);
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
// a whole level (as Enigma Run level 6 builds it): 4224 px of river town with the station kept to its stretch near the end, works only in
// theirs, and the airfield's perimeter in the last 64 rows (perimeter road, fence, gate, apron, tracks ending at buffer stops)
{ const L = 4224, params = { L, density: [[0, 0.05], [0.061, 0.05], [0.212, 0.3], [0.333, 0.5], [0.44, 0.65], [0.576, 0.8], [0.674, 1], [0.773, 1], [0.856, 0.9], [0.947, 0.9], [1, 0.9]], damageCurve: [[0, 0], [0.33, 0.09], [0.576, 0.24], [0.674, 0.36], [0.773, 0.45], [0.856, 0.6], [1, 0.48]], damage: 1, farms: 0.4,
    road0: 120, stationAt: [0.894, 1 - 170 / L], stationRoom: 64, industryAt: [0.727, 0.818], power: true, perimeter: 64, river: Object.assign({}, CG.PRESETS.river.river, { at: 0.52 }) };
  let fails = 0, st = 0, ind = 0, out = 0, per = 0, stops = 0;
  for (let seed = 1; seed <= 30; seed++) { const p = CG.generate({ seed, preset: 'river', params }), m = CG.validate(p);
    if (!m.pass) { fails++; if (fails <= 3) fail(`level seed ${seed}: overlap ${m.overlapPx}, off the street ${m.noFrontage}, tank reach ${m.tankReach.toFixed(3)}, trains blocked ${m.trainBlocked}`); }
    if (p.station && p.station.y >= 0.87 * L && p.station.y1 < p.perimeter.y0) st++;
    for (const q of p.quarters) if (q.style === 'industry') { const f = (q.y0 + q.y1) / 2 / L; if (f > 0.7 && f < 0.84) ind++; else out++; }
    const pm = p.perimeter; if (p.L === L && pm && p.K[(pm.apron + 5) * p.W + 3] === CG.K.APRON && p.K[pm.road * p.W + 3] === CG.K.ROAD && Math.abs(p.mx[L - 1] - p.mx[pm.y0 - 1]) < 1) per++; if (pm && pm.stops.length >= 1) stops++; }
  const ok = !fails && st === 30 && !out && ind >= 20 && per === 30 && stops === 30;
  if (!ok) fail(`level: station in its stretch ${st}/30, works in theirs ${ind} (outside ${out}), perimeter ${per}/30, buffer stops ${stops}/30`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} whole level (4224 px): ${30 - fails}/30 pass, station in its stretch in ${st}, ${ind} works quarters in theirs and ${out} outside, the airfield's perimeter in ${per}, buffer stops in ${stops}`); }
// Enigma level 3, the whole level (longNight preset): every hard rule, the yard with wagons and its train runs to the end, the airbase, the
// forest, the pylon line and the searchlight posts (each with a generator) in every seed
{ let fails = 0, have = 0, posts = 0;
  for (let seed = 1; seed <= 30; seed++) { const p = CG.generate({ seed, preset: 'longNight' }); if (!CG.validate(p).pass) fails++;
    const runs = [93, 131, 55, 169].every(x => p.trainRuns.some(r => r.x === x && r.y1 === p.L - 1));
    if (p.yard && p.yard.wagons.length >= 20 && runs && p.airbase && p.airbase.planes.length >= 4 && p.forest && p.pylons && p.pylons.filter(q => q.ok).length >= 4 && p.searchPosts.length >= 4 && p.slots.filter(q => q.kind === 'gen').length >= 3) have++; posts += p.searchPosts.length; }
  const ok = !fails && have === 30; if (!ok) fail(`level 3: ${fails} fail the rules, ${have}/30 have all their parts`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} level 3 (The Long Night): ${30 - fails}/30 pass, all parts in ${have}, ${(posts / 30).toFixed(1)} searchlight posts per level`); }
// Enigma level 4, the Iron Forest (forest land): every hard rule; on the cliff coast the sea, stacks, coves, three tiers of cliff with the road's
// gorge from the slipway to the plateau, the clifftop battery (three casemates with arty slots), a lighthouse, a radar, a pillbox and a flak pit on
// the ledges; in the conifer forest crowns of every size class and all three kinds, two forest roads that are tank routes, firebreaks, plantations,
// clearings and clear-cuts, and the forest's guns (flak sites cut into the trees, bunkers at the firebreaks, guns in the clearings and cuts). The same seed gives the same plan, and painting in bands equals painting whole.
{ let fails = 0, miss = 0; const need = (ok, m) => { if (!ok) { miss++; if (miss <= 5) fail('forest land: ' + m); } };
  for (const preset of ['cliffCoast', 'coniferForest']) for (let seed = 1; seed <= 60; seed++) { const p = CG.generate({ seed, preset }), m = CG.validate(p); if (!m.pass) { fails++; if (fails <= 3) fail(`${preset} seed ${seed}: overlap ${m.overlapPx}, tank reach ${m.tankReach}`); }
    need(p.conifers.every(c => c.length > 100) && [0, 1, 2].every(sp => p.conifers.some(c => c.some(t => t.sp === sp))), `${preset} ${seed}: conifers of every size and kind`);
    if (preset === 'cliffCoast') { const CL = p.cliffs, n = k => p.K.reduce((a, v) => a + (v === k), 0), parts = new Set(p.items.map(i => i.part));
      need(CL && CL.foot.length === 3 && CL.stacks.length >= 2 && n(CG.K.SEA) > 3000 && n(CG.K.CRAG) > 8000 && n(CG.K.LEDGE) > 3000, `cliffCoast ${seed}: sea, stacks and three tiers`);
      const st = p.streets[0]; need(st.y0 === CL.gorge.y0 && p.K[st.y0 * p.W + Math.round(p.mx[st.y0])] === CG.K.ROAD, `cliffCoast ${seed}: the road begins at the slipway`);
      need(p.items.filter(i => i.part === 'casemate').length >= 2 && parts.has('lighthouse') && parts.has('radar') && parts.has('pillbox') && p.slots.some(s => s.kind === 'flak') && p.slots.filter(s => s.kind === 'arty').length >= 2, `cliffCoast ${seed}: the battery, lighthouse, radar and ledge guns`); }
    else need(p.forest.roads.length === 2 && p.streets.filter(s => s.tank).length === 3 && p.forest.rides.length >= 2 && p.forest.plantations.length >= 1 && p.forest.clearings.length >= 1 && p.forest.cuts.length >= 1, `coniferForest ${seed}: roads, rides, plantations, clearings, cuts`);
    need(p.forest.sites.filter(q => q.kind === 'flak').length >= (preset === 'coniferForest' ? 4 : 1) && p.slots.filter(q => q.kind === 'flak').length >= (preset === 'coniferForest' ? 6 : 3) && (preset !== 'coniferForest' || (p.slots.some(q => q.kind === 'bunker') && p.slots.some(q => q.kind === 'arty'))), `${preset} ${seed}: the forest's gun sites`);
    if (seed <= 3) { if (hash(p) !== hash(CG.generate({ seed, preset }))) fail(`${preset} seed ${seed}: the same seed gave a different plan`);
      const whole = { data: new Uint8ClampedArray(p.W * 64 * 4) }, part = { data: new Uint8ClampedArray(p.W * 16 * 4) }, y0 = 192; CG.paint(p, whole, y0, 64, {}); let diff = 0;
      for (let b = 0; b < 4; b++) { CG.paint(p, part, y0 + b * 16, 16, {}); for (let r = 0; r < 16; r++) for (let q = 0; q < p.W * 4; q++) if (part.data[r * p.W * 4 + q] !== whole.data[((3 - b) * 16 + r) * p.W * 4 + q]) diff++; }
      if (diff) fail(`${preset} seed ${seed}: painting in bands differs from painting whole (${diff})`); } }
  console.log(`ok   forest land: 120 plans, ${fails} failing a hard rule, ${miss} missing a feature`); }
// Enigma level 5, the Winter Line (P.climate 'winter'): every hard rule in the frozen sea, the harbour in its bay, the mountain village and
// the level's first part as one plan (a town plan with the mountain land joined on top). The sea freezes (pack, floes, fast ice) with a hole or two for the U-boats (each open water, long enough
// for one to surface, a 'sub' slot on 'ice'); the harbour's water stays open with ice only along its quays (owner), and in the level the frozen
// sea never meets the harbour's water; the mountain village has its mountains (snow slopes, rock, shadows, conifers), chalets on the road and on terraces,
// the chapel, the sawmill, the cable car, avalanche fences and (nearly always) the ski jump, and no village green; every deciduous tree is bare; roofs are white; the river freezes; the winter palette does not leak;
// the same seed gives the same plan, and painting in bands equals painting whole.
{ let fails = 0, miss = 0; const need = (ok, m) => { if (!ok) { miss++; if (miss <= 5) fail('winter: ' + m); } }, c = { holes2: 0, breaks: 0, jumps: 0 }, ms = [];
  const count = (p, k, b) => { let n = 0; for (let i = 0; i < p.K.length; i++) if (p.K[i] === k && (b === undefined || p.B[i] === b)) n++; return n; };
  const runs = [['frozenSea', 60], ['portWinter', 60], ['mountainVillage', 60], ['winterLine', 30]];
  for (const [preset, N] of runs) for (let seed = 1; seed <= N; seed++) { const t = performance.now(), p = CG.generate({ seed, preset }); ms.push(performance.now() - t); const m = CG.validate(p);
    if (!m.pass) { fails++; if (fails <= 3) fail(`${preset} seed ${seed}: overlap ${m.overlapPx}, off the street ${m.noFrontage}, tank reach ${m.tankReach.toFixed(3)}, lanes blocked ${m.lanesBlocked}`); }
    need(p.trees.every(t2 => t2.bare || t2.palm), `${preset} ${seed}: a tree in leaf`);
    if (preset === 'frozenSea' || preset === 'winterLine') { const holes = p.slots.filter(q => q.kind === 'sub' && q.on === 'ice');
      need(count(p, CG.K.ICE) > 15000 && count(p, CG.K.ICE, -81) > 3000 && count(p, CG.K.ICE, -80) > 1500 && count(p, CG.K.ICE, -84) > 1500, `${preset} ${seed}: pack, floes and fast ice`);
      need(holes.length >= 1 && holes.every(h => { for (let y = h.y - 22; y <= h.y + 22; y++) for (let x = h.x - 5; x <= h.x + 5; x++) if (p.K[y * p.W + x] !== CG.K.SEA) return false; return true; }), `${preset} ${seed}: an ice hole of open water for a U-boat`);
      if (holes.length >= 2) c.holes2++; if (p.iceBreaks.length) c.breaks++; }
    if (preset === 'portWinter' || preset === 'winterLine') { const CO = p.coast; let open = 0, all = 0; for (let y = CO.hy0 + 20; y < CO.hy1 - 20; y++) for (let x = 0; x < p.W; x++) { const k = p.K[y * p.W + x]; if (x > CO.qx + 6 && (k === CG.K.SEA || k === CG.K.ICE)) { all++; if (k === CG.K.SEA) open++; } }
      need(all > 2000 && (preset === 'winterLine' ? open / all < 0.05 && p.iceBreaks.filter(b => b.harbour && b.y > CO.hy0 && b.y < CO.hy1).length === 1 && !p.slots.some(q => q.kind === 'sub' && q.on === 'pen') : open / all > 0.7) && count(p, CG.K.ICE, -85) > 200 && p.items.some(i => i.part === 'bunker'), `${preset} ${seed}: ${preset === 'winterLine' ? 'the harbour frozen over with one place for a U-boat to break through' : 'open water in the harbour'}, ice along its quays, the U-boat bunker`); }
    if (preset === 'winterLine') { const W = p.W, seen = new Uint8Array(p.K.length), st = []; for (let x = 0; x < W; x++) { seen[x] = 1; st.push(x); } // flood the frozen sea from the level's first row
      while (st.length) { const i = st.pop(), x = i % W; for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (j >= 0 && j < p.K.length && !seen[j] && (p.K[j] === CG.K.SEA || p.K[j] === CG.K.ICE)) { seen[j] = 1; st.push(j); } }
      let met = 0; for (let y = p.coast.hy0; y < p.coast.hy1; y++) for (let x = 0; x < W; x++) if (seen[y * W + x]) met++; need(!met, `winterLine ${seed}: the frozen sea meets the harbour's water`);
      need(!p.oldTown && p.parts && p.parts[1].y0 === (18 + 5 + 8) * 64, `winterLine ${seed}: no village green, the mountain land joined after the farmland`);
      { const yTn = Math.min(...p.tunnels.map(t => t.y)); let yRd = 0; for (let y = 0; y < p.L; y++) for (let x = 0; x < W; x++) if (p.K[y * W + x] === CG.K.ROAD) yRd = y; // the road ends in a depot well short of the mountain: no tunnel for it, a gravel turnaround, two gun turrets, a tank trap
        const dep = p.slots.filter(q => q.on === 'lot' && q.kind === 'arty' && q.y > yRd - 40 && q.y < yTn), rows = [0, 1, 2, 3, 4].map(k => p.K[(yTn - 6 - 24 * k) * W + 8] === CG.K.SLOPE || p.K[(yTn - 6 - 24 * k) * W + 8] === CG.K.CRAG);
        need(p.tunnels.length === 2 && yRd < yTn - 500 && dep.length >= 2 && p.obstacles.filter(o => o.kind === 'trap').length >= 6 && p.wires.length >= 2 && p.slots.some(q => q.kind === 'bunker' && q.on === 'pad') && rows.every(Boolean) && count(p, CG.K.ICE, -89) > 1500 && [30, 80, 140].every(d => { for (let x = 0; x < W; x++) if (p.K[(yTn - d) * W + x] === CG.K.ICE && p.B[(yTn - d) * W + x] === -88) return true; return false; }), `winterLine ${seed}: a glacier and its stream down to the tunnel face; the road ends at ${yRd} in a depot (${dep.length} turrets, ${p.tunnels.length} tunnels, mountain at the sides ${rows})`); } }
    if (preset === 'mountainVillage' || preset === 'winterLine') { const A = p.alpine;
      need(count(p, CG.K.SLOPE) > 8000 && count(p, CG.K.CRAG, -70) > 100 && p.shadeM && p.shadeM.some(v => v) && p.conifers.reduce((a, k) => a + k.length, 0) > 40, `${preset} ${seed}: the mountains, their shadows and conifers`);
      need(A && A.chapel && A.sawmill && A.cable && A.chalets >= 10 && A.terraces >= 1 && p.avalanche.length >= 3 && p.cables.length === 1 && p.slots.some(q => q.kind === 'flak') && p.slots.some(q => q.kind === 'bunker'), `${preset} ${seed}: the village's parts ${JSON.stringify(A)}`);
      if (A && A.jump) c.jumps++; }
    if (seed <= 3) { if (hash(p) !== hash(CG.generate({ seed, preset }))) fail(`${preset} seed ${seed}: the same seed gave a different plan`);
      const whole = { data: new Uint8ClampedArray(p.W * 64 * 4) }, part = { data: new Uint8ClampedArray(p.W * 16 * 4) }, y0 = 128; CG.paint(p, whole, y0, 64, {}); let diff = 0;
      for (let b = 0; b < 4; b++) { CG.paint(p, part, y0 + b * 16, 16, {}); for (let r = 0; r < 16; r++) for (let q = 0; q < p.W * 4; q++) if (part.data[r * p.W * 4 + q] !== whole.data[((3 - b) * 16 + r) * p.W * 4 + q]) diff++; }
      if (diff) fail(`${preset} seed ${seed}: painting in bands differs from painting whole (${diff})`); } }
  if (c.holes2 < 72 || c.breaks < 72 || c.jumps < 81) fail(`winter: two ice holes in ${c.holes2}/90, a place to break through in ${c.breaks}/90, a ski jump in ${c.jumps}/90`);
  // white roofs, a frozen river, and no leak: a temperate town painted after a winter one is the same as painted alone
  const pnt = p => { const img = { data: new Uint8ClampedArray(p.W * p.L * 4) }; CG.paint(p, img, 0, p.L, { noFx: true }); return img.data; }, lum = (d, i) => 0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2];
  const v = CG.generate({ seed: 4, preset: 'villageWinter' }), dv = pnt(v); let roof = 0, rn = 0; for (let i = 0; i < v.K.length; i++) if (v.K[i] === CG.K.BLDG && !v.items[v.B[i]].round) { rn++; if (lum(dv, i) > 170) roof++; }
  const rv = CG.generate({ seed: 4, preset: 'river', params: { climate: 'winter' } }), dr = pnt(rv); let ice = 0, wn = 0; for (let i = 0; i < rv.K.length; i++) if (rv.K[i] === CG.K.RIVER) { wn++; ice += lum(dr, i); }
  const town = CG.generate({ seed: 4, preset: 'town' }), a0 = pnt(town); pnt(v); const leak = pnt(town).some((x, i) => x !== a0[i]);
  need(roof / rn > 0.6, `snow on ${(100 * roof / rn).toFixed(0)}% of roof pixels`); need(ice / wn > 120, `the river is not frozen (mean light ${(ice / wn).toFixed(0)})`); if (leak) fail('winter: the winter palette leaked into a temperate town painted after it');
  ms.sort((a, b) => a - b);
  console.log(`${fails || miss || leak ? 'FAIL' : 'ok  '} winter: ${180 - fails}/180 plans pass, ${miss} missing a feature; two ice holes in ${c.holes2}/90, a place to break through in ${c.breaks}/90, a ski jump in ${c.jumps}/90; ${(100 * roof / rn).toFixed(0)}% of roof pixels white, the river frozen, no palette leak; plan ${ms[90].toFixed(0)} ms median`); }
// Enigma level 5's gorge finale (preset winterGorge, owner: option 1): the plan reaches on past the level's end as the boss's arena. The four
// tracks (x 36, 68 | 156, 188) leave the spur's tunnels and never break; the gorge is open by the level's end; every arena row has the chasm between
// the two viaducts' decks (the bridge's truss aside); galleries over the outer tracks on both sides, never within the boss train's 13 px of an inner
// track; tunnel spurs on both sides; cornices over open stretches (none with a gallery under it unless marked) and over some galleries; at least
// one bridge from outer track to outer track across the chasm, clear of galleries and spurs; ground types; the same seed gives the same plan;
// painting in bands equals painting whole.
{ let miss = 0; const need = (ok, m) => { if (!ok) { miss++; if (miss <= 6) fail('gorge: ' + m); } }, ms = [], tot = { gal: 0, spurs: 0, corn: 0, over: 0, br: 0 };
  const hsh = d => { let x = 2166136261; for (let i = 0; i < d.length; i++) { x ^= d[i]; x = Math.imul(x, 16777619); } return x >>> 0; };
  for (let seed = 1; seed <= 12; seed++) { const t0 = performance.now(), p = CG.generate({ seed, preset: 'winterGorge' }); ms.push(performance.now() - t0); const v = CG.validate(p), G = p.gorge, W = p.W, Lr = 84 * 64;
    need(v.pass, `seed ${seed}: a hard rule fails`); if (!G) { need(false, `seed ${seed}: no gorge`); continue; }
    const at = (x, y) => y * W + x, Kr = p.K, Br = p.B, K = CG.K;
    need(p.L === Lr + 48 * 64 && G.y1 === p.L - 1, `seed ${seed}: the arena is not 48 chunks past the level's end`);
    need(G.yb < Lr && G.yb > Lr - 220, `seed ${seed}: the gorge opens at ${G.yb}, not just before the level's end (${Lr})`);
    for (const tx of [36, 68, 156, 188]) { let brk = 0; for (let y = G.y0; y < p.L; y++) if (p.RM[at(tx - 3, y)] !== 2) brk++; need(!brk, `seed ${seed}: the track at x ${tx} breaks in ${brk} rows`); }
    let noCh = 0, noDeck = 0, galIn = 0; for (let y = G.yb; y < p.L; y++) { const mid = Kr[at(112, y)], bm = Br[at(112, y)]; if (!(mid === K.RAVINE && bm === -71) && !(mid === K.RBRIDGE && bm === -25)) noCh++;
      if (y >= G.yb + 60) for (const x of [30, 74, 150, 194]) { const k = Kr[at(x, y)]; if (k !== K.RBRIDGE && k !== K.SLOPE && k !== K.CRAG) noDeck++; } // (the decks begin slanted away from the chasm and blend into the valley's snow over their first 60 rows)
      for (const x of [55, 81, 143, 169]) if (Kr[at(x, y)] === K.RBRIDGE && Br[at(x, y)] === -24) galIn++; }
    need(!noCh, `seed ${seed}: ${noCh} arena rows without the chasm`); need(!noDeck, `seed ${seed}: ${noDeck} deck pixels missing`); need(!galIn, `seed ${seed}: a gallery reaches the boss's room (${galIn})`);
    for (const s of [-1, 1]) { need(G.gal.filter(q => q.s === s).length >= 3, `seed ${seed}: fewer than 3 galleries on side ${s}`); need(G.corn.filter(q => q.s === s && !q.over).length >= 5, `seed ${seed}: fewer than 5 open cornices on side ${s}`); need(G.spurs.some(q => q.s === s), `seed ${seed}: no spur on side ${s}`); }
    for (const q of G.corn) { let n = 0; for (let y = q.y - q.half; y <= q.y + q.half; y++) for (let x = 0; x < W; x++) if (Kr[at(x, y)] === K.SLOPE && Br[at(x, y)] === -72) n++; need(n >= 25, `seed ${seed}: the cornice at ${q.y} has ${n} px`);
      if (!q.over) need(!G.gal.some(g => g.s === q.s && g.y1 > q.y - q.half && g.y0 < q.y + q.half), `seed ${seed}: an open cornice at ${q.y} lies over a gallery`); }
    need(G.bridges.length >= 1, `seed ${seed}: no bridge`);
    for (const b of G.bridges) { let ym = -1; for (let y = b.ya; y <= b.yb; y++) { let tr = 0; for (let x = 100; x <= 124; x++) if (Kr[at(x, y)] === K.RBRIDGE && Br[at(x, y)] === -25) tr++; if (tr) ym = y; } need(ym > 0, `seed ${seed}: the bridge at ${b.ya} has no truss over the chasm`);
      need(!G.gal.some(g => g.y1 > b.ya - 30 && g.y0 < b.yb + 30) && !G.spurs.some(q => q.y1 > b.ya - 30 && q.y0 < b.yb + 30), `seed ${seed}: a gallery or spur at the bridge at ${b.ya}`);
      const r0 = p.RM[at((b.lr > 0 ? 36 : 188) - 3, b.ya)], r1 = p.RM[at((b.lr > 0 ? 188 : 36) - 3, b.yb)]; need(r0 === 2 && r1 === 2, `seed ${seed}: the bridge at ${b.ya} does not meet the outer tracks`); }
    const y = G.yb + 40; need(CG.typeAt(p, 112, y) === 'ravine' && CG.typeAt(p, 68, y) === 'railbridge', `seed ${seed}: ground types ${CG.typeAt(p, 112, y)}, ${CG.typeAt(p, 68, y)}`);
    tot.gal += G.gal.length; tot.spurs += G.spurs.length; tot.corn += G.corn.length; tot.over += G.corn.filter(q => q.over).length; tot.br += G.bridges.length;
    if (seed === 1) { const q = CG.generate({ seed, preset: 'winterGorge' }); need(hsh(q.K) === hsh(p.K) && hsh(new Uint8Array(q.B.buffer)) === hsh(new Uint8Array(p.B.buffer)), 'the same seed gives another plan');
      const y0 = G.yb - 32, whole = { data: new Uint8ClampedArray(W * 64 * 4) }, part = { data: new Uint8ClampedArray(W * 16 * 4) }; CG.paint(p, whole, y0, 64, {}); let diff = 0;
      for (let b = 0; b < 4; b++) { CG.paint(p, part, y0 + b * 16, 16, {}); for (let r = 0; r < 16; r++) for (let k = 0; k < W * 4; k++) if (part.data[r * W * 4 + k] !== whole.data[((3 - b) * 16 + r) * W * 4 + k]) diff++; }
      need(!diff, `painting in bands differs from painting whole (${diff})`); } }
  ms.sort((a, b) => a - b);
  console.log(`${miss ? 'FAIL' : 'ok  '} gorge finale: 12 plans, ${miss} problems; ${tot.gal} galleries, ${tot.spurs} spurs, ${tot.corn} cornices (${tot.over} over galleries), ${tot.br} bridges; plan ${ms[6].toFixed(0)} ms median`); }
// cloud types: the same sprite from the same kind and seed, sized within the type's range, visible, and only the solid types cast a shadow
{ let bad2 = 0; const solid = new Set(['cumulus', 'scattered', 'storm']);
  for (const k of CG.CLOUD_KINDS) for (let seed = 1; seed <= 20; seed++) { const a = CG.cloud(k, seed), b = CG.cloud(k, seed); let n = 0; for (let i = 3; i < a.data.length; i += 4) if (a.data[i]) n++;
    if (a.w !== b.w || a.data.some((v, i) => v !== b.data[i]) || n < a.w * a.h * 0.08 || !!a.shadow !== solid.has(k)) bad2++; }
  if (bad2) fail(`cloud types: ${bad2} sprites are not deterministic, too faint or have the wrong shadow`); console.log(`${bad2 ? 'FAIL' : 'ok  '} cloud types (${CG.CLOUD_KINDS.join(', ')}): 20 seeds each, deterministic and visible`); }
// the game carries a copy of the generator (index.html, cityGenSrc): it must be the current one (node scripts/embed-citygen.mjs)
{ const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8'), src = readFileSync(new URL('../tools/citygen.js', import.meta.url), 'utf8'), open = '<script type="text/plain" id="cityGenSrc">\n';
  const a = html.indexOf(open), b = html.indexOf('</script>', a), same = a >= 0 && html.slice(a + open.length, b) === src;
  if (!same) fail('index.html carries an old copy of tools/citygen.js: run node scripts/embed-citygen.mjs'); console.log(`${same ? 'ok  ' : 'FAIL'} the game's copy of the generator is current`); }
if (bad) { console.error(`\n${bad} problem(s)`); process.exit(1); }
console.log('\nCity generator checks pass.');
