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
import { writeFileSync } from 'node:fs';
import { KITS, TOL, check } from './kit-check.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i < 0 ? dflt : process.argv[i + 1]; };
const SEEDS = +arg('seeds', 20), ONLY = arg('kit', null), GROUP = arg('group', null), JSON_OUT = arg('json', null), VERBOSE = process.argv.includes('--verbose');

// a pure hash, so the probe's own choices (a shuffle, where a copy goes) are the same on every run
const hash = (a, b) => { let h = Math.imul(a | 0, 0x9E3779B1) ^ Math.imul(b | 0, 0x85EBCA6B); h = Math.imul(h ^ (h >>> 15), 0x2C1B3C6D); h = Math.imul(h ^ (h >>> 12), 0x297A2D39); return ((h ^ (h >>> 15)) >>> 0) / 4294967296; };
const shuffle = (list, seed) => { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(hash(seed, 100 + i) * (i + 1)); const q = a[i]; a[i] = a[j]; a[j] = q; } return a; };

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
