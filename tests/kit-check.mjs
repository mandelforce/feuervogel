// The plan checks shared by tests/compose-probe.mjs (what do the presets tolerate?) and tests/compose.mjs (gate 2 of the Daily Sortie's composer):
// for each kit the hand-made segment list, where each template's own feature must lie, and check(): one plan generated and judged.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export const CG = require('../tools/citygen.js');
export const K = CG.K, CH = 64, TOL = 40; // TOL: px a feature may reach into a neighbouring stretch (the presets ease features in over about 40 px)

// rows of the plan holding at least `min` px of a ground kind, as [first, last] of each unbroken run
export const kindRuns = (p, kind, min = 1, b) => { const out = []; let y0 = -1; for (let y = 0; y <= p.L; y++) { let n = 0; if (y < p.L) for (let x = 0; x < p.W; x++) { const i = y * p.W + x; if (p.K[i] === kind && (b === undefined || p.B[i] === b)) n++; } if (n >= min) { if (y0 < 0) y0 = y; } else if (y0 >= 0) { out.push([y0, y - 1]); y0 = -1; } } return out; };

// The kits: the segment lists the game flies today (buildSortie's scaled ENIGMA_SEQ), split into the fixed opener, the middle and the approach.
// markers(plan): where each template's own feature landed, [{ t, y, what }]. needs: the feature every segment of a template must hold.
export const KITS = {
  desert: { preset: 'sandSea', arena: 0, params: segs => ({ segs, variant: 0 }),
    opener: [['harbour_commercial', 6], ['beach_town', 5]],
    middle: [['valley', 11], ['village', 6], ['station_junction', 9], ['desert_open', 6], ['airbase_desert', 9], ['pass', 11]],
    approach: [['desert_open', 9]],
    needs: { valley: 'derrick', village: 'held oasis', station_junction: 'junction', airbase_desert: 'runway', pass: 'viaduct' },
    markers: p => { const m = [];
      for (const d of p.derricks || []) m.push({ t: 'valley', y: d.y, what: 'derrick' });
      for (const o of p.oasis || []) m.push(o.held ? { t: 'village', y: o.y, what: 'held oasis' } : { t: 'desert_open', y: o.y, what: o.size === 'small' ? 'small oasis' : 'hamlet' });
      for (const w of p.wagons || []) m.push({ t: 'station_junction', y: w.y, what: 'junction' });
      for (const c of p.canopies || []) m.push({ t: 'station_junction', y: (c.y0 + c.y1) / 2, what: 'junction' });
      for (const [a, b] of kindRuns(p, K.RUNWAY, 4)) m.push({ t: 'airbase_desert', y: (a + b) / 2, what: 'runway' });
      for (const v of p.viaducts || []) m.push({ t: 'pass', y: (v.y0 + v.y1) / 2, what: 'viaduct' });
      for (const i of p.industry || []) if (i.kind === 'brickworks') m.push({ t: 'desert_open', y: i.y + i.h / 2, what: 'brickworks' });
      return m; },
    extra: (p, rg) => { const out = [], port = rg.filter(r => r.t === 'harbour_commercial' || r.t === 'beach_town').reduce((a, r) => a + r.y1 - r.y0, 0);
      if (!p.port || p.port.y1 + 1 !== port) out.push('port ends at ' + (p.port ? p.port.y1 + 1 : 'none') + ', its segments at ' + port);
      if (!p.beachTown) out.push('no beach town');
      const small = (p.oasis || []).filter(o => o.size === 'small').length; if (rg.some(r => r.t === 'desert_open') && small !== 1) out.push(small + ' small oases (the landmark)');
      if (p.fort === undefined && rg.some(r => r.t === 'pass')) out.push('no fort');
      return out; } },
  forest: { preset: 'ironForest', arena: 0, params: segs => ({ L: segs.reduce((a, g) => a + g.n, 0) * CH, segs, roadEnd: 112 }),
    opener: [['beach_cliff', 3]],
    middle: [['forest_conifer', 9], ['forest_fortified', 8], ['clearing_village', 5], ['airbase_forest_hidden', 7], ['forest_fortified', 8], ['forest_conifer', 6], ['valley', 7]],
    approach: [['farmland_approach', 7]],
    needs: { beach_cliff: 'sea', farmland_approach: 'trench' },
    markers: p => { const m = [];
      for (const [a, b] of kindRuns(p, K.SEA, 8)) { m.push({ t: 'beach_cliff', y: a, what: 'sea' }); m.push({ t: 'beach_cliff', y: b, what: 'sea' }); }
      for (const [a, b] of kindRuns(p, K.TRENCH, 2)) m.push({ t: 'farmland_approach', y: (a + b) / 2, what: 'trench' });
      return m; },
    extra: (p, rg) => { const out = [], x = p.mx[p.L - 1]; if (!(Math.abs(x - 112) <= 3)) out.push('the road ends at x ' + Math.round(x) + ', not 112 (the castle road)');
      let sea0 = 0; for (let xx = 0; xx < p.W; xx++) if (p.K[xx] === K.SEA) sea0++; if (sea0 < p.W * 0.5) out.push('the level does not open over the sea');
      return out; },
    /* guns per chunk by template: the only thing that tells the forest templates apart */
    stats: (p, rg) => rg.map(r => ({ t: r.t, v: p.slots.filter(s => s.kind === 'flak' && s.y >= r.y0 && s.y < r.y1).length / ((r.y1 - r.y0) / CH), name: 'flak per chunk' })) },
  winter: { preset: 'winterGorge', arena: 48, params: segs => ({ segs, joinRoad: 1 }), /* joinRoad: what the composer will pass (the Campaign's level 5 does not: its plans stay as they are) */
    opener: [['open_sea_ice', 18], ['harbour_winter', 5], ['farmland_winter', 8]],
    middle: [['village', 5], ['lake_valley', 7], ['station_winter', 9], ['airbase_snow', 7], ['forest_conifer', 7]],
    approach: [['pass', 7], ['farmland_winter', 11]],
    needs: { open_sea_ice: 'ice hole', village: 'alpine village', lake_valley: 'lake', pass: 'gate' },
    markers: p => { const m = [];
      for (const s of p.slots) if (s.kind === 'sub') m.push({ t: 'open_sea_ice', y: s.y, what: 'ice hole' });
      /* the middle of each village and lake: a segment needs one of its own, a neighbour's edge does not count */
      for (const A of p.alpines || []) { m.push({ t: 'village', y: (A.y0 + A.y1) / 2, what: 'alpine village' }); if (A.chapel) m.push({ t: 'village', y: A.chapel.y, what: 'chapel' }); }
      for (const Lk of p.iceLakes || []) m.push({ t: 'lake_valley', y: (Lk.y0 + Lk.y1) / 2, what: 'lake' });
      for (const it of p.items) if (it.label === 'Guard hut') m.push({ t: 'pass', y: it.y0, what: 'gate' });
      return m; },
    extra: (p, rg) => { const out = [], Lr = rg.reduce((a, r) => Math.max(a, r.t === '(arena)' ? 0 : r.y1), 0), G = p.gorge;
      if (!G) out.push('no gorge'); else { if (!(G.yb < Lr && G.yb > Lr - 220)) out.push('the gorge opens at ' + G.yb + ', level end ' + Lr); if (G.y1 !== p.L - 1) out.push('the gorge ends at ' + G.y1 + ', plan ' + p.L);
        for (const tx of [36, 68, 156, 188]) { let brk = 0; for (let y = G.y0; y < p.L; y++) if (p.RM[y * p.W + tx - 3] !== 2) brk++; if (brk) { out.push('a track breaks in the gorge'); break; } } }
      if ((p.tunnels || []).length !== 4) out.push((p.tunnels || []).length + ' tunnel mouths, not 4');
      const first = rg[0]; if (first.t !== 'open_sea_ice') out.push('the level does not open over the frozen sea');
      return out; } },
};

// "structures" share of a stretch (spec 3.2, approximately): buildings, rubble, works, runways, aprons, quays, paved squares and yards, roads, streets and bridges
const BUILT = new Set(['BLDG', 'RUBBLE', 'WORKS', 'RUNWAY', 'APRON', 'QUAY', 'PLAZA', 'LOT', 'COURT', 'ROAD', 'STREET', 'BRIDGE', 'RBRIDGE'].map(k => K[k]).filter(k => k !== undefined));
export const builtShare = (p, y0, y1) => { let n = 0; for (let i = y0 * p.W; i < y1 * p.W; i++) if (BUILT.has(p.K[i])) n++; return n / ((y1 - y0) * p.W); };

// One plan made and judged. gen: { preset, seed, params } to use instead of the kit's own (the composer's output carries one).
export function check(kit, segs, seed, gen) {
  const res = { flags: [], notes: [], ms: 0, pairs: [] };
  for (let i = 1; i < segs.length; i++) res.pairs.push(segs[i - 1].t + '>' + segs[i].t);
  let p; const t0 = performance.now();
  try { p = CG.generate(gen || { seed, preset: kit.preset, params: kit.params(segs.map(g => ({ t: g.t, n: g.n }))) }); } catch (e) { res.flags.push('throw'); res.notes.push('throw: ' + String(e && e.message || e).slice(0, 90)); return res; }
  res.ms = performance.now() - t0;
  const want = (segs.reduce((a, g) => a + g.n, 0) + kit.arena) * CH;
  if (p.L !== want) { res.flags.push('length'); res.notes.push('plan ' + p.L + ' px, segments ' + want); }
  let v; try { v = CG.validate(p); } catch (e) { res.flags.push('throw'); res.notes.push('validate throws: ' + String(e && e.message || e).slice(0, 90)); return res; }
  if (!v.pass) { res.flags.push('invalid'); const why = []; if (v.overlapPx) why.push('overlap ' + v.overlapPx); if (v.noFrontage) why.push('no frontage ' + v.noFrontage); if (v.tankReach !== 1) why.push('tank reach ' + v.tankReach.toFixed(3)); if (v.trainBlocked) why.push('trains blocked ' + v.trainBlocked); if (v.lanesBlocked) why.push('lanes blocked ' + v.lanesBlocked); if (v.onRoad) why.push('on road ' + v.onRoad); if (!why.length) why.push('churches, bridges or island'); res.notes.push('invalid: ' + why.join(', ')); }
  let y = 0; const rg = segs.map(g => { const r = { t: g.t, y0: y, y1: y + g.n * CH }; y = r.y1; return r; }); if (kit.arena) rg.push({ t: '(arena)', y0: y, y1: y + kit.arena * CH });
  const marks = kit.markers(p), out = new Set(), miss = new Set();
  for (const m of marks) if (!rg.some(r => r.t === m.t && m.y >= r.y0 - TOL && m.y < r.y1 + TOL)) { const r = rg.find(q => m.y >= q.y0 && m.y < q.y1); out.add(m.what + ' in ' + (r ? r.t : 'nothing')); }
  for (const r of rg) { const need = kit.needs[r.t]; if (need && !marks.some(m => m.what === need && m.y >= r.y0 - TOL && m.y < r.y1 + TOL)) miss.add(need + ' (' + r.t + ')'); }
  if (out.size) { res.flags.push('outside'); res.notes.push('outside: ' + [...out].join('; ')); }
  if (miss.size) { res.flags.push('missing'); res.notes.push('missing: ' + [...miss].join('; ')); }
  const ex = kit.extra(p, rg); if (ex.length) { res.flags.push('preset'); res.notes.push('preset: ' + ex.join('; ')); }
  res.built = rg.filter(r => r.t !== '(arena)').map(r => ({ t: r.t, v: builtShare(p, r.y0, r.y1) }));
  res.stats = kit.stats ? kit.stats(p, rg.filter(r => r.t !== '(arena)')) : [];
  return res;
}
