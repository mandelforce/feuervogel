#!/usr/bin/env node
// The city from a segment list (docs/daily-sortie-plan.md section 12, step 5.1). Node only, about 15 seconds.
//   node tests/citysegs.mjs
// preset 'portSouth' with params.segs [{ t, n }] must give exactly the plan the game's sortiePlanHarbour gives the Campaign's level 6 from the same stretches, so the Campaign's level 6 does not change
// and a composed list builds the same kind of city. Checks: (1) the generator's urbanisation and damage table equals the game's SORTIE_UD for the city's templates; (2) golden hashes of the Campaign's
// level 6 plans, made by the generator before the segment-native step (a change to the Campaign's plan fails here); (3) the plan from a segment list equals the plan from the game's parameters (worked out
// here line for line from the game's function), for the Campaign's list, reordered and longer lists, and the first loop's harbour; (4) a list with no works, no station and no sea still builds.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url), CG = require('../tools/citygen.js'), html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
let failed = 0, passed = 0; const ok = (c, m) => { if (c) passed++; else { failed++; console.log('FAIL ' + m); } };
const hashPlan = p => { let h = 2166136261 >>> 0; const mix = v => { h = Math.imul(h ^ (v | 0), 16777619) >>> 0; }, str = t => { for (let i = 0; i < t.length; i++) mix(t.charCodeAt(i)); };
  for (const k of Object.keys(p).sort()) { if (k === 'P' || k === 'stage' || k === 'seed') continue; const v = p[k]; str(k); if (ArrayBuffer.isView(v)) { for (let i = 0; i < v.length; i++) mix(v[i] * 1000); } else if (Array.isArray(v)) str(JSON.stringify(v)); else if (v && typeof v === 'object') str(JSON.stringify(v)); else if (typeof v === 'number') mix(v * 1000); } return h; };
const CH = 64;
// 1. the table
{ const m = html.match(/const SORTIE_UD = (\{[^\n]*\});/); ok(!!m, 'index.html has SORTIE_UD'); if (m) { const G = new Function('return ' + m[1])(); let same = true; for (const t in CG.CITY_UD) if (JSON.stringify(G[t]) !== JSON.stringify(CG.CITY_UD[t])) { same = false; console.log('       ' + t + ': game ' + JSON.stringify(G[t]) + ', generator ' + JSON.stringify(CG.CITY_UD[t])); }
  ok(same, "the generator's urbanisation and damage per template equal the game's SORTIE_UD (" + Object.keys(CG.CITY_UD).length + ' templates)'); } }
/* the game's sortiePlanHarbour, line for line */
function gameParams(segsIn, haze) { let at = 0; const segs = segsIn.map(([t, n]) => { const r = { t, start: at, n }; at += n; return r; }), n = at, L = n * CH, dens = [], dmg = []; let lastU = 0;
  for (const g of segs) { const v = CG.CITY_UD[g.t] || [lastU, 0], u = v[0] === null ? lastU : v[0]; lastU = u; const f = (g.start + g.n / 2) / n; dens.push([f, u]); dmg.push([f, v[1] * 0.6]); }
  dens.unshift([0, dens[1][1]]); dens.push([1, dens[dens.length - 1][1]]); dmg.unshift([0, dmg[1][1]]); dmg.push([1, dmg[dmg.length - 1][1]]);
  const fr = t => { const g = segs.find(q => q.t === t); return [g.start / n, (g.start + g.n) / n]; }, sea = segs.find(g => g.t === 'open_sea'), hb = segs.find(g => g.t === 'harbour_south');
  return { L, density: dens, damageCurve: dmg, damage: 1, stationAt: [fr('station_main')[0], 1 - 170 / L], stationRoom: 64, industryAt: fr('industrial_power'), power: true, perimeter: CH,
    coast: Object.assign({}, CG.PRESETS.portSouth.coast, { mode: 'corner', cs: 1, openSide: true, end: (sea.n * CH + 40) / L, side: [hb.n * CH * 0.55 / L, hb.n * CH * 0.7 / L] }, haze ? { land: 0.56, pier: [30, 50], sideChannel: 62 } : null) }; }
const CAMP = [['open_sea', 5], ['harbour_south', 14], ['city_centre', 8], ['city_town', 7], ['industrial_power', 6], ['ruins', 5], ['station_main', 6]];
// 2. goldens: the Campaign's level 6 plan (its seeds 1944 and 1945), plain and the first loop's harbour, from the generator before this step
const GOLD = [[1944, false, 610118893], [1944, true, 1261992138], [1945, false, 4050192364], [1945, true, 2771531616]];
for (const [seed, haze, want] of GOLD) ok(hashPlan(CG.generate({ seed, preset: 'portSouth', params: gameParams(CAMP, haze) })) === want, `the Campaign's level 6 plan is unchanged (seed ${seed}${haze ? ', first loop harbour' : ''})`);
// 3. a segment list gives the same plan
const LISTS = [CAMP,
  [['open_sea', 5], ['harbour_south', 14], ['city_town', 7], ['city_centre', 8], ['ruins', 5], ['industrial_power', 6], ['station_main', 6]],
  [['open_sea', 4], ['harbour_south', 12], ['city_suburb', 6], ['city_centre', 9], ['city_town', 6], ['industrial_power', 7], ['ruins', 4], ['station_main', 7]],
  [['open_sea', 6], ['harbour_south', 15], ['city_town', 8], ['industrial_power', 5], ['city_centre', 7], ['ruins', 6], ['station_main', 5]]];
let same = 0, n = 0; for (const list of LISTS) for (const seed of [1, 1944]) for (const haze of [false, true]) { n++; const a = hashPlan(CG.generate({ seed, preset: 'portSouth', params: gameParams(list, haze) })), b = hashPlan(CG.generate({ seed, preset: 'portSouth', params: { segs: list.map(([t, c]) => ({ t, n: c })), harbour6: haze } })); if (a === b) same++; }
ok(same === n, `a plan from a segment list equals the plan from the game's parameters (${same} of ${n}: the Campaign's list, reordered and longer lists, the loop's harbour)`);
// 4. a list without the works, the station or the sea still builds (the composer's grammar may leave them out)
{ let good = true; for (const list of [[['harbour_south', 14], ['city_centre', 8], ['city_town', 7]], [['open_sea', 5], ['harbour_south', 14], ['ruins', 6], ['city_centre', 8]], [['open_sea', 5], ['harbour_south', 14], ['city_centre', 8], ['station_main', 6]]]) { try { const p = CG.generate({ seed: 5, preset: 'portSouth', params: { segs: list.map(([t, c]) => ({ t, n: c })) } }), v = CG.validate(p); if (p.L !== list.reduce((a, q) => a + q[1], 0) * CH || !v.pass) good = false; } catch (e) { good = false; console.log('       ' + e.message); } }
  ok(good, 'a list without the works, the station or the sea builds, with the right length, and passes CityGen.validate'); }
if (failed) { console.log(`\n${failed} check(s) failed, ${passed} passed`); process.exit(1); }
console.log(`City from segments checks pass (${passed}).`);
