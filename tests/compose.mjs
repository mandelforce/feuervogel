#!/usr/bin/env node
// The Daily Sortie's composer (tools/sortie-compose.js, docs/daily-sortie-plan.md phase 1). Node only, no browser.
//   node tests/compose.mjs                 every check (gate 2 on 300 seeds per kit: about 10 minutes, most of it the winter plans)
//   node tests/compose.mjs --plans 30      gate 2 on fewer seeds per kit
//   node tests/compose.mjs --shard 2/4     every 4th gate 2 plan, from the 2nd (the other checks run in every shard)
//   node tests/compose.mjs --kit desert    one kit
//   node tests/compose.mjs --verbose       also print example sequences and every template's numbers
// Checks: the hash is the game's; determinism; gate 1 on 10,000 seeds per kit (every composed list keeps the kit's rules, checked here
// again independently of the module's own check); the daily seed (UTC date, rotation, reroll table); variety over 1,000 seeds (every
// middle template appears, the orders differ); gate 2 (the generator's plan of a composed list: no throw, CityGen.validate, the length,
// every template's feature in its own segment, the structures share under the template's limit, the plan time); and that the copy of
// the composer in index.html is current (node scripts/embed-citygen.mjs).
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { KITS as PROBE, check as checkPlan, CH } from './kit-check.mjs';
const require = createRequire(import.meta.url);
const SC = require('../tools/sortie-compose.js');

const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i < 0 ? dflt : process.argv[i + 1]; };
const PLANS = +arg('plans', 300), ONLY = arg('kit', null), VERBOSE = process.argv.includes('--verbose'), SHARD = String(arg('shard', '1/1')).split('/').map(Number);
let failed = 0, passed = 0;
const ok = (cond, msg) => { if (cond) passed++; else { failed++; console.log('FAIL ' + msg); } return cond; };
const kits = SC.KIT_ORDER.filter(k => !ONLY || k === ONLY), J = x => JSON.stringify(x);
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8'), src = readFileSync(new URL('../tools/sortie-compose.js', import.meta.url), 'utf8');

// 1. the hash is the game's sortieHash (the composer may never drift from it: both must give the same numbers for the same seed)
{ const m = html.match(/function sortieHash\(a, b\) \{[^\n]*\}/); ok(!!m, 'index.html has sortieHash');
  if (m) { const game = new Function(m[0] + '; return sortieHash;')(); let same = 0; for (let i = 0; i < 2000; i++) if (game(i * 7919 - 5000, i * 31 + 3) === SC.hash(i * 7919 - 5000, i * 31 + 3)) same++; ok(same === 2000, `the composer's hash equals the game's sortieHash (${same}/2000)`); } }

// 2. the embedded copy is current
{ const open = '<script type="text/plain" id="sortieComposeSrc">\n', a = html.indexOf(open), b = html.indexOf('</script>\n<script type="text/plain" id="gameSrc">', a);
  ok(a >= 0 && b > a && html.slice(a + open.length, b) === src, "the game's copy of the composer is current (node scripts/embed-citygen.mjs)");
  ok(/\['cityGenSrc', 'sortieComposeSrc', 'gameSrc'\]/.test(html), 'the loader runs the composer between the generator and the game'); }

// 3. determinism
for (const k of kits) { let same = 0, subDiff = 0, seedDiff = 0; const N = 200;
  for (let s = 1; s <= N; s++) { const a = J(SC.composeSortie(k, s * 7 - 300)), b = J(SC.composeSortie(k, s * 7 - 300)); if (a === b) same++;
    const segs = S => J(S.segs); if (segs(SC.composeSortie(k, s, 0)) !== segs(SC.composeSortie(k, s, 1))) subDiff++; if (segs(SC.composeSortie(k, s)) !== segs(SC.composeSortie(k, s + 1))) seedDiff++; }
  ok(same === N, `${k}: the same seed gives the same sortie (${same}/${N})`);
  ok(subDiff >= N * 0.9 && seedDiff >= N * 0.9, `${k}: another sub-seed or seed gives another list (${subDiff} and ${seedDiff} of ${N})`); }

// 4. gate 1 on 10,000 seeds per kit. The rules are checked here from the kit table, apart from SC.check.
const variety = {};
for (const k of kits) { const kit = SC.KITS[k], O = kit.opener, A = kit.approach, bad = {}, att = {}, N = 10000; let worst = 0, mod = 0;
  const note = m => { bad[m] = (bad[m] || 0) + 1; }, V = variety[k] = { orders: new Set(), sets: new Set(), tmpl: {}, len: [], mids: [], enc: {}, encN: [], wing: [], first: {}, hot3: 0 };
  for (let s = 0; s < N; s++) { const seed = (SC.hash(s, 4242) * 4294967296) | 0; let S; try { S = SC.composeSortie(k, seed); } catch (e) { note('throws: ' + e.message.slice(0, 60)); continue; }
    att[S.attempt] = (att[S.attempt] || 0) + 1; worst = Math.max(worst, S.attempt); if (SC.check(k, S).length) mod++;
    const segs = S.segs, mid = segs.slice(O.length, segs.length - A.length); let at = 0;
    for (const g of segs) { if (g.start !== at) note('a gap in the segments'); at += g.n; }
    if (S.len !== at || at < kit.len[0] || at > kit.len[1]) note('total length');
    if (J(segs.slice(0, O.length).map(g => [g.t, g.n])) !== J(O)) note('opener'); if (J(segs.slice(-A.length).map(g => [g.t, g.n])) !== J(A)) note('approach');
    const cnt = {}; mid.forEach((g, i) => { const m = kit.middle[g.t]; if (!m) { note('unknown template'); return; } cnt[g.t] = (cnt[g.t] || 0) + 1; if (g.n < m.len[0] || g.n > m.len[1]) note('segment length');
      const prev = i ? mid[i - 1].t : O[O.length - 1][0]; if (prev === g.t) note('a template twice in a row'); if (!kit.follows[prev].includes(g.t)) note('follows'); });
    for (const t in cnt) if (cnt[t] > kit.middle[t].max) note('max'); if (mid[mid.length - 1].t === A[0][0]) note('approach repeats'); if (mid.length < 4) note('too few middle segments');
    let free = -1; const ids = new Set(); for (const e of S.encPlan) { const g = segs.find(q => e.c >= q.start && e.c < q.start + q.n), def = g && (kit.enc[g.t] || []).find(q => q.id === e.id);
      if (!def) { note('an encounter outside its segment'); continue; } if (ids.has(e.id)) note('an encounter twice'); ids.add(e.id); if (e.c < free) note('encounters too close'); if (!(e.until > e.c && e.live === true)) note('encounter fields'); free = e.c + Math.ceil(def.frames / 174) + 2; if (e.c < S.wingC + 18 + 2 && e.c + Math.ceil(def.frames / 174) + 2 > S.wingC) note('an encounter in the Shadow Wing\'s time'); }
    if (!(S.wingC >= Math.round(at * 0.375) && S.wingC <= Math.round(at * 0.55) && S.wingC + 18 <= at)) note('the Shadow Wing\'s place');
    if (S.v !== SC.VERSION || S.kit !== k || S.level !== kit.level || S.gen.preset !== kit.preset || J(S.gen.params.segs) !== J(segs.map(g => ({ t: g.t, n: g.n })))) note('sortie fields');
    if (s < 1000) { V.orders.add(mid.map(g => g.t).join('>')); V.sets.add(mid.map(g => g.t + g.n).join('>')); V.len.push(at); V.mids.push(mid.length); V.encN.push(S.encPlan.length); V.wing.push(S.wingC / at); for (const e of S.encPlan) V.enc[e.id] = (V.enc[e.id] || 0) + 1;
      for (const t in cnt) (V.tmpl[t] = V.tmpl[t] || { in: 0, n: 0 }).in++; mid.forEach(g => { V.tmpl[g.t].n++; }); V.first[mid[0].t] = (V.first[mid[0].t] || 0) + 1;
      for (let i = 2; i < mid.length; i++) if ([0, 1, 2].every(d => kit.middle[mid[i - d].t].heat >= 0.6)) { V.hot3++; break; } } }
  const nb = Object.values(bad).reduce((a, b) => a + b, 0);
  ok(nb === 0, `${k}: gate 1 on ${N} seeds` + (nb ? ': ' + Object.entries(bad).map(([m, c]) => c + 'x ' + m).join(', ') : '')); ok(mod === 0, `${k}: the module's own check agrees (${mod} lists it rejects)`);
  ok(worst < 32, `${k}: no seed needs more than half the tries (worst ${worst + 1} of 64)`);
  console.log(`     ${k}: tries needed, of ${N}: ` + Object.entries(att).map(([a, c]) => `${+a + 1}: ${c}`).join(', ')); }

// 5. variety over the first 1,000 of those seeds
for (const k of kits) { const kit = SC.KITS[k], V = variety[k], T = Object.keys(kit.middle), avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  ok(T.every(t => V.tmpl[t] && V.tmpl[t].in > 0), `${k}: every middle template appears in 1,000 sorties` + (T.some(t => !V.tmpl[t]) ? ' (never: ' + T.filter(t => !V.tmpl[t]).join(', ') + ')' : ''));
  ok(V.orders.size >= 50, `${k}: at least 50 different orders in 1,000 sorties (${V.orders.size})`);
  console.log(`     ${k}: ${V.orders.size} orders, ${V.sets.size} lists with lengths; ${Math.min(...V.len)} to ${Math.max(...V.len)} chunks (mean ${avg(V.len).toFixed(1)}), ${Math.min(...V.mids)} to ${Math.max(...V.mids)} middle segments; ${avg(V.encN).toFixed(2)} encounters a sortie (${Object.entries(V.enc).map(([id, c]) => id + ' ' + (c / 10).toFixed(0) + ' %').join(', ')}); the Shadow Wing at ${(100 * Math.min(...V.wing)).toFixed(0)} to ${(100 * Math.max(...V.wing)).toFixed(0)} % of the level; three hot stretches in a row in ${(V.hot3 / 10).toFixed(1)} %`);
  console.log('     in % of sorties: ' + T.map(t => `${t} ${((V.tmpl[t] || { in: 0 }).in / 10).toFixed(0)}`).join(', ') + '; first: ' + T.map(t => `${t} ${((V.first[t] || 0) / 10).toFixed(0)}`).join(', '));
  if (VERBOSE) for (let s = 1; s <= 5; s++) { const S = SC.composeSortie(k, s); console.log(`     seed ${s}, ${S.len} chunks: ` + S.segs.map(g => g.t + ' ' + g.n).join(', ') + ' | ' + S.encPlan.map(e => e.id + ' at ' + e.c).join(', ')); } }

// 6. the daily seed
{ const a = SC.dailySeed('2026-11-14'), b = SC.dailySeed('2026-11-15'), c = SC.dailySeed('2026-11-16'), d = SC.dailySeed('2026-11-17');
  ok(a.kit !== b.kit && b.kit !== c.kit && a.kit !== c.kit && d.kit === a.kit, `the kit rotates day by day (${[a, b, c, d].map(x => x.kit).join(', ')})`);
  ok(a.seed !== b.seed && J(SC.dailySeed('2026-11-14')) === J(a) && a.n === 20261114 && a.sub === 0, 'a date gives its own seed, the same every time');
  let thrown = 0; for (const bad of ['2026-02-30', '2026-13-01', '14.11.2026', '', '2026-1-1']) try { SC.dailySeed(bad); } catch (e) { thrown++; } ok(thrown === 5, `a date that is none is refused (${thrown}/5)`);
  ok(SC.dateKeyUTC(Date.UTC(2026, 10, 14, 23, 59, 59)) === '2026-11-14' && SC.dateKeyUTC(Date.UTC(2026, 10, 15, 0, 0, 0)) === '2026-11-15', 'the day changes at midnight UTC');
  const S0 = SC.composeDaily('2026-11-14'); SC.DAILY_REROLL['2026-11-14'] = 3; const S3 = SC.composeDaily('2026-11-14'); delete SC.DAILY_REROLL['2026-11-14'];
  ok(S0.sub === 0 && S3.sub === 3 && S3.kit === S0.kit && J(S0.segs) !== J(S3.segs) && J(SC.composeDaily('2026-11-14').segs) === J(S0.segs), 'a date in the reroll table gets another sortie of the same kit, and the table is the only thing that changes it');
  ok(SC.composeDaily('2026-11-14', 'forest', 2).kit === 'forest' && S0.date === '2026-11-14' && typeof SC.composeVersion === 'number', 'the test link can force a kit and a sub-seed; the sortie carries its date and the composer its version');
  let all = 0; const seen = { desert: 0, forest: 0, winter: 0 }; for (let i = 0; i < 366; i++) { const key = SC.dateKeyUTC(Date.UTC(2027, 0, 1) + i * 86400000); try { const S = SC.composeDaily(key); if (!SC.check(S.kit, S).length) { all++; seen[S.kit]++; } } catch (e) { /* counted as missing */ } }
  ok(all === 366 && Object.values(seen).every(n => n === 122), `every day of a year composes, 122 days per kit (${all}; ${J(seen)})`); }

// 7. gate 2: the generator's plan of each composed list
const BASE = { desert: 246, forest: 163, winter: 1265 }; // p95 plan time of the hand-made lists, ms, Node alone (plan section 6.4); the limit is 1.5 times it, on the median
for (const k of kits) { const kit = SC.KITS[k], P = PROBE[k], flags = {}, notes = {}, ms = [], built = {}; let n = 0, clean = 0, over = 0; const t0 = Date.now();
  for (let s = 0; s < PLANS; s++) { if (s % SHARD[1] !== SHARD[0] - 1) continue; n++; const S = SC.composeSortie(k, (SC.hash(s, 777) * 4294967296) | 0), r = checkPlan(P, S.segs, S.gen.seed, S.gen);
    for (const f of r.flags) flags[f] = (flags[f] || 0) + 1; for (const nt of r.notes) notes[nt] = (notes[nt] || 0) + 1; if (r.ms) ms.push(r.ms); let ovr = false;
    for (const b of r.built || []) { const lim = (kit.middle[b.t] || {}).built || kit.fixedBuilt[b.t]; (built[b.t] = built[b.t] || []).push(b.v); if (lim !== undefined && b.v > lim) ovr = true; }
    if (ovr) over++; if (!r.flags.length && !ovr) clean++; }
  ms.sort((a, b) => a - b); const med = ms[Math.floor(ms.length / 2)] || 0, p95 = ms[Math.floor(ms.length * 0.95)] || 0;
  ok(clean === n, `${k}: gate 2 on ${n} composed lists: ${clean} clean` + (clean < n ? ` (${Object.entries(flags).map(([f, c]) => f + ' ' + c).join(', ')}${over ? ', structures over the limit ' + over : ''})` : ''));
  if (clean < n) for (const [nt, c] of Object.entries(notes).sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`       ${c}x ${nt}`);
  ok(med <= BASE[k] * 1.5, `${k}: plan time median ${med.toFixed(0)} ms, limit ${(BASE[k] * 1.5).toFixed(0)} ms`);
  console.log(`     ${k}: plan time median ${med.toFixed(0)} ms, p95 ${p95.toFixed(0)} ms; ${((Date.now() - t0) / 1000).toFixed(0)} s for ${n} plans`);
  if (VERBOSE || over) console.log('     structures share, highest per template (limit): ' + Object.entries(built).map(([t, a]) => `${t} ${(100 * Math.max(...a)).toFixed(0)} % (${(100 * ((kit.middle[t] || {}).built || kit.fixedBuilt[t] || 0)).toFixed(0)})`).join(', ')); }

if (failed) { console.log(`\n${failed} check(s) failed, ${passed} passed`); process.exit(1); }
console.log(`\nComposer checks pass (${passed}).`);
