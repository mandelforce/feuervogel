#!/usr/bin/env node
// Kit robustness probe for the Daily Sortie composer (docs/daily-sortie-plan.md, phase 0). Node only, no browser.
//
// For each of the three segment-native presets (sandSea, ironForest, winterGorge) it generates plans from mutated
// segment lists and records what the preset tolerates: the original; the middle reordered; every ordered pair of
// middle templates made neighbours; one template repeated (next to itself, and apart); one dropped; one length
// -50 % / +50 %; one length swept from 1 to 20 chunks; the total -20 % / +20 %; the opener or the approach broken;
// each opener and approach segment from 1 chunk to twice its length.
//
// Each plan is checked for: a throw; CityGen.validate; its length (segments x 64 px, plus the arena); and whether
// each segment's own feature lies in that segment ("outside": a feature in a stretch of another template;
// "missing": a segment without the feature its template brings).
//
//   node tests/compose-probe.mjs                      all three kits, 20 seeds per mutation
//   node tests/compose-probe.mjs --kit desert         one kit (desert | forest | winter)
//   node tests/compose-probe.mjs --seeds 5            fewer seeds (quicker)
//   node tests/compose-probe.mjs --group sweep        one group of mutations (original | reorder | adjacent | repeat | drop | length | sweep | total | ends | endlen)
//   node tests/compose-probe.mjs --json out.json      also write every row and the per-pair numbers
//   node tests/compose-probe.mjs --verbose            also list every failing plan
//
// It never fails the build (exit 0): it measures. The grammar derived from it is in section 6 of the plan.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const CG = require('../tools/citygen.js');
const K = CG.K, CH = 64, TOL = 40; // TOL: px a feature may reach into a neighbouring stretch (the presets ease features in over about 40 px)

const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i < 0 ? dflt : process.argv[i + 1]; };
const SEEDS = +arg('seeds', 20), ONLY = arg('kit', null), GROUP = arg('group', null), JSON_OUT = arg('json', null), VERBOSE = process.argv.includes('--verbose');

// a pure hash, so the probe's own choices (a shuffle, where a copy goes) are the same on every run
const hash = (a, b) => { let h = Math.imul(a | 0, 0x9E3779B1) ^ Math.imul(b | 0, 0x85EBCA6B); h = Math.imul(h ^ (h >>> 15), 0x2C1B3C6D); h = Math.imul(h ^ (h >>> 12), 0x297A2D39); return ((h ^ (h >>> 15)) >>> 0) / 4294967296; };
const shuffle = (list, seed) => { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(hash(seed, 100 + i) * (i + 1)); const q = a[i]; a[i] = a[j]; a[j] = q; } return a; };

// rows of the plan holding at least `min` px of a ground kind, as the middle row of each unbroken run
const kindRuns = (p, kind, min = 1, b) => { const out = []; let y0 = -1; for (let y = 0; y <= p.L; y++) { let n = 0; if (y < p.L) for (let x = 0; x < p.W; x++) { const i = y * p.W + x; if (p.K[i] === kind && (b === undefined || p.B[i] === b)) n++; } if (n >= min) { if (y0 < 0) y0 = y; } else if (y0 >= 0) { out.push([y0, y - 1]); y0 = -1; } } return out; };

// The kits: the segment lists the game flies today (buildSortie's scaled ENIGMA_SEQ), split into the fixed opener, the middle and the approach.
// markers(plan): where each template's own feature landed, [{ t, y, what }]. needs: the feature every segment of a template must hold.
const KITS = {
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
  winter: { preset: 'winterGorge', arena: 48, params: segs => ({ segs }),
    opener: [['open_sea_ice', 18], ['harbour_winter', 5], ['farmland_winter', 8]],
    middle: [['village', 5], ['lake_valley', 7], ['station_winter', 9], ['airbase_snow', 7], ['forest_conifer', 7]],
    approach: [['pass', 7], ['farmland_winter', 11]],
    needs: { open_sea_ice: 'ice hole', village: 'alpine village', lake_valley: 'lake', pass: 'gate' },
    markers: p => { const m = [];
      for (const s of p.slots) if (s.kind === 'sub') m.push({ t: 'open_sea_ice', y: s.y, what: 'ice hole' });
      if (p.alpine && p.alpine.y0 !== undefined) { m.push({ t: 'village', y: p.alpine.y0 + TOL, what: 'alpine village' }); m.push({ t: 'village', y: p.alpine.y1 - TOL, what: 'alpine village' }); if (p.alpine.chapel) m.push({ t: 'village', y: p.alpine.chapel.y, what: 'alpine village' }); }
      if (p.lake) { m.push({ t: 'lake_valley', y: p.lake.y0 + TOL, what: 'lake' }); m.push({ t: 'lake_valley', y: p.lake.y1 - TOL, what: 'lake' }); }
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
const builtShare = (p, y0, y1) => { let n = 0; for (let i = y0 * p.W; i < y1 * p.W; i++) if (BUILT.has(p.K[i])) n++; return n / ((y1 - y0) * p.W); };

function check(kit, segs, seed) {
  const res = { flags: [], notes: [], ms: 0, pairs: [] };
  for (let i = 1; i < segs.length; i++) res.pairs.push(segs[i - 1].t + '>' + segs[i].t);
  let p; const t0 = performance.now();
  try { p = CG.generate({ seed, preset: kit.preset, params: kit.params(segs.map(g => ({ t: g.t, n: g.n }))) }); } catch (e) { res.flags.push('throw'); res.notes.push('throw: ' + String(e && e.message || e).slice(0, 90)); return res; }
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

// ---------- the mutations ----------
const S = list => list.map(([t, n]) => ({ t, n }));
const uniq = list => [...new Set(list)];
function mutations(kit) {
  const O = kit.opener, M = kit.middle, A = kit.approach, T = uniq(M.map(q => q[0])), all = m => S(O.concat(m, A)), out = [];
  const add = (group, name, make) => out.push({ group, name, make });
  add('original', 'original', () => all(M));
  add('reorder', 'middle shuffled', seed => all(shuffle(M, seed)));
  for (const a of T) for (const b of T) { if (a === b) continue; /* b right after a: the pair as neighbours, everything else in place */
    add('adjacent', a + ' > ' + b, () => { const m = M.slice(), ib = m.findIndex(q => q[0] === b), qb = m.splice(ib, 1)[0], ia = m.findIndex(q => q[0] === a); m.splice(ia + 1, 0, qb); return all(m); }); }
  for (const t of T) { add('repeat', t + ' twice, side by side', () => { const m = M.slice(), i = m.findIndex(q => q[0] === t); m.splice(i + 1, 0, m[i].slice()); return all(m); });
    add('repeat', t + ' twice, apart', () => { const m = M.slice(), i = m.findIndex(q => q[0] === t), c = m[i].slice(), j = i < m.length / 2 ? m.length : 0; m.splice(j, 0, c); return all(m); }); }
  M.forEach((q, i) => add('drop', q[0] + (M.filter(r => r[0] === q[0]).length > 1 ? ' #' + (M.slice(0, i).filter(r => r[0] === q[0]).length + 1) : '') + ' dropped', () => all(M.filter((_, k) => k !== i))));
  for (const t of T) for (const f of [0.5, 1.5]) add('length', t + (f < 1 ? ' -50 %' : ' +50 %'), () => all(M.map(q => q[0] === t ? [q[0], Math.max(1, Math.round(q[1] * f))] : q)));
  for (const t of T) for (const n of [1, 2, 3, 4, 14, 20]) add('sweep', t + ' at ' + n + ' chunks', () => { let done = false; return all(M.map(q => q[0] === t && !done ? (done = true, [q[0], n]) : q)); });
  for (const f of [0.8, 1.2]) { add('total', 'every segment ' + (f < 1 ? '-20 %' : '+20 %'), () => S(O.concat(M, A).map(q => [q[0], Math.max(1, Math.round(q[1] * f))])));
    add('total', 'the middle ' + (f < 1 ? '-20 %' : '+20 %') + ' (opener and approach kept)', () => all(M.map(q => [q[0], Math.max(1, Math.round(q[1] * f))]))); }
  /* the fixed ends: is the plan's claim (opener first, approach last) a real limit? */
  add('ends', 'opener dropped', () => S(M.concat(A)));
  if (O.length > 1) add('ends', 'opener: first segment dropped', () => S(O.slice(1).concat(M, A)));
  if (O.length > 1) add('ends', 'opener: last segment dropped', () => S(O.slice(0, -1).concat(M, A)));
  add('ends', 'opener moved behind the first middle segment', () => S([M[0]].concat(O, M.slice(1), A)));
  add('ends', 'approach dropped', () => S(O.concat(M)));
  add('ends', 'approach moved before the last middle segment', () => S(O.concat(M.slice(0, -1), A, [M[M.length - 1]])));
  add('ends', 'opener half as long', () => S(O.map(q => [q[0], Math.max(1, Math.round(q[1] / 2))]).concat(M, A)));
  add('ends', 'approach half as long', () => S(O.concat(M, A.map(q => [q[0], Math.max(1, Math.round(q[1] / 2))]))));
  /* how short or long may each fixed segment be? */
  O.concat(A).forEach((q, i) => { for (const n of uniq([1, 2, 3, 4, Math.round(q[1] * 1.5), q[1] * 2])) { if (n === q[1]) continue; add('endlen', (i < O.length ? 'opener ' : 'approach ') + q[0] + ' at ' + n + ' chunks (' + q[1] + ' today)', () => S(O.concat(M, A).map((r, k) => { const j = k < O.length ? k : k - M.length; return (k < O.length || k >= O.length + M.length) && j === i ? [r[0], n] : r; }))); } });
  return out;
}
const SEEDS_OF = { endlen: Math.max(3, Math.round(SEEDS / 2)), adjacent: Math.max(3, Math.round(SEEDS / 4)), sweep: Math.max(3, Math.round(SEEDS / 4)), repeat: Math.max(3, Math.round(SEEDS / 2)) }; // (these groups have many rows; 20 seeds are spread over them)

const FLAGS = ['throw', 'invalid', 'length', 'outside', 'missing', 'preset'];
const report = { seeds: SEEDS, tol: TOL, kits: {} };
for (const id of Object.keys(KITS)) { if (ONLY && ONLY !== id) continue;
  const kit = KITS[id], rows = [], pair = {}, built = {}, stat = {}, ms = [], t0 = Date.now();
  for (const mu of mutations(kit)) { if (GROUP && GROUP !== mu.group) continue; const n = SEEDS_OF[mu.group] || SEEDS, row = { group: mu.group, name: mu.name, n, ok: 0, ms: [], notes: {} }; for (const f of FLAGS) row[f] = 0;
    for (let seed = 1; seed <= n; seed++) { const segs = mu.make(seed), r = check(kit, segs, seed); if (!r.flags.length) row.ok++; for (const f of r.flags) row[f]++; for (const nt of r.notes) row.notes[nt] = (row.notes[nt] || 0) + 1;
      if (r.ms) { row.ms.push(r.ms); if (mu.group === 'original') ms.push(r.ms); }
      const hard = r.flags.includes('throw') || r.flags.includes('invalid') || r.flags.includes('length'); if (mu.group !== 'ends' && mu.group !== 'endlen') for (const pr of r.pairs) { const q = pair[pr] || (pair[pr] = { n: 0, hard: 0, soft: 0 }); q.n++; if (hard) q.hard++; else if (r.flags.length) q.soft++; }
      if (mu.group === 'original' || mu.group === 'reorder') { for (const b of r.built || []) (built[b.t] || (built[b.t] = [])).push(b.v); for (const s of r.stats || []) (stat[s.t] || (stat[s.t] = [])).push(s.v); }
      if (VERBOSE && r.flags.length) console.log(`  ${id} ${mu.name} seed ${seed}: ${r.notes.join(' | ')}`); }
    rows.push(row); }
  // print: one line per group, then every row that is not clean
  const total = kit.opener.concat(kit.middle, kit.approach).reduce((a, q) => a + q[1], 0);
  console.log(`\n=== ${id} (${kit.preset}, ${total} chunks${kit.arena ? ' + ' + kit.arena + ' arena' : ''}), ${rows.reduce((a, r) => a + r.n, 0)} plans in ${((Date.now() - t0) / 1000).toFixed(0)} s ===`);
  console.log('group      plans   clean  throw invalid length outside missing preset');
  for (const g of uniq(rows.map(r => r.group))) { const rs = rows.filter(r => r.group === g), sum = k => rs.reduce((a, r) => a + r[k], 0); console.log(`${g.padEnd(10)} ${String(sum('n')).padStart(5)} ${String(sum('ok')).padStart(7)} ${FLAGS.map(f => String(sum(f)).padStart(f.length + 1)).join('')}`); }
  console.log('rows that are not clean:');
  for (const r of rows) { if (r.ok === r.n) continue; console.log(`  [${r.group}] ${r.name}: ${r.ok}/${r.n} clean`); for (const [nt, c] of Object.entries(r.notes).sort((a, b) => b[1] - a[1]).slice(0, 4)) console.log(`      ${c}x ${nt}`); }
  ms.sort((a, b) => a - b); const pct = (a, q) => a.length ? a[Math.min(a.length - 1, Math.floor(a.length * q))] : 0, allMs = rows.flatMap(r => r.ms).sort((a, b) => a - b);
  console.log(`plan time, original list: median ${pct(ms, 0.5).toFixed(0)} ms, p95 ${pct(ms, 0.95).toFixed(0)} ms; every mutation: median ${pct(allMs, 0.5).toFixed(0)} ms, p95 ${pct(allMs, 0.95).toFixed(0)} ms, worst ${(allMs[allMs.length - 1] || 0).toFixed(0)} ms`);
  console.log('structures share per template (original and shuffled lists): ' + Object.entries(built).map(([t, a]) => `${t} ${(100 * Math.min(...a)).toFixed(0)}..${(100 * Math.max(...a)).toFixed(0)} %`).join(', '));
  if (Object.keys(stat).length) console.log('flak per chunk per template: ' + Object.entries(stat).map(([t, a]) => `${t} ${(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2)}`).join(', '));
  /* the neighbour pairs the hand-made list does not have: these are what `follows` has to decide */
  const base = kit.opener.concat(kit.middle, kit.approach).map(q => q[0]), have = new Set(base.slice(1).map((t, i) => base[i] + '>' + t)), fresh = Object.entries(pair).filter(e => !have.has(e[0])).sort((a, b) => (b[1].hard + b[1].soft) / b[1].n - (a[1].hard + a[1].soft) / a[1].n);
  const cleanP = fresh.filter(e => !e[1].hard && !e[1].soft);
  console.log(`new neighbour pairs (not in today's list; the ends groups apart): ${fresh.length} tried, ${cleanP.length} always clean`);
  for (const [pr, q] of fresh) if (q.hard || q.soft) console.log(`  ${pr}: ${q.n} plans, ${q.hard} hard (throw, invalid, length), ${q.soft} soft (outside, missing, preset)`);
  report.kits[id] = { preset: kit.preset, chunks: total, arena: kit.arena, planMs: { median: +pct(ms, 0.5).toFixed(1), p95: +pct(ms, 0.95).toFixed(1), allMedian: +pct(allMs, 0.5).toFixed(1), allP95: +pct(allMs, 0.95).toFixed(1), worst: +(allMs[allMs.length - 1] || 0).toFixed(1) },
    rows: rows.map(r => ({ group: r.group, name: r.name, n: r.n, ok: r.ok, throw: r.throw, invalid: r.invalid, length: r.length, outside: r.outside, missing: r.missing, preset: r.preset, notes: r.notes })), pairs: pair,
    built: Object.fromEntries(Object.entries(built).map(([t, a]) => [t, [+Math.min(...a).toFixed(3), +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(3), +Math.max(...a).toFixed(3)]])),
    stats: Object.fromEntries(Object.entries(stat).map(([t, a]) => [t, +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2)])) };
}
if (JSON_OUT) { writeFileSync(JSON_OUT, JSON.stringify(report, null, 1)); console.log('\nwrote ' + JSON_OUT); }
