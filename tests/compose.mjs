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
for (const k of kits) { const kit = SC.KITS[k], bad = {}, att = {}, N = 10000; let worst = 0, mod = 0; const APS = (kit.approaches || [kit.approach]).concat(kit.seaApproach ? [kit.seaApproach] : []), OPS = kit.openers || [kit.opener];
  const note = m => { bad[m] = (bad[m] || 0) + 1; }, V = variety[k] = { orders: new Set(), sets: new Set(), tmpl: {}, len: [], mids: [], enc: {}, encN: [], wing: [], first: {}, hot3: 0 };
  for (let s = 0; s < N; s++) { const seed = (SC.hash(s, 4242) * 4294967296) | 0; let S; try { S = SC.composeSortie(k, seed); } catch (e) { note('throws: ' + e.message.slice(0, 60)); continue; }
    att[S.attempt] = (att[S.attempt] || 0) + 1; worst = Math.max(worst, S.attempt); if (SC.check(k, S).length) mod++;
    const segs = S.segs.filter(g => !g.legacy && !g.main), tl = S.segs.filter(g => g.legacy || g.main).reduce((a, g) => a + g.n, 0), mainSegs = S.segs.filter(g => g.main); let at = 0; /* (a sea ending's legacy stretches come after the plan's own: checked by the module's check and in section 6b) */
    for (const g of segs) { if (g.start !== at) note('a gap in the segments'); at += g.n; }
    if (S.len !== at + tl || at < kit.len[0] || at > kit.len[1]) note('total length');
    const O = OPS.find(o => J(segs.slice(0, o.length).map(g => [g.t, g.n])) === J(o)); if (!O) { note('opener'); continue; } const A = APS.find(a => J(segs.slice(-a.length).map(g => [g.t, g.n])) === J(a)); if (!A) note('approach'); const mid = A ? segs.slice(O.length, segs.length - A.length) : []; if (!A) continue;
    const cnt = {}; mid.forEach((g, i) => { const m = kit.middle[g.t]; if (!m) { note('unknown template'); return; } cnt[g.t] = (cnt[g.t] || 0) + 1; if (g.n < m.len[0] || g.n > m.len[1]) note('segment length');
      const prev = i ? mid[i - 1].t : O[O.length - 1][0]; if (prev === g.t) note('a template twice in a row'); if (!kit.follows[prev].includes(g.t)) note('follows'); });
    for (const t in cnt) if (cnt[t] > kit.middle[t].max) note('max'); if (mid[mid.length - 1].t === A[0][0]) note('approach repeats'); if (mid.length < (kit.minMiddle || 4)) note('too few middle segments');
    let free = -1; const ids = new Set(); for (const e of S.encPlan) { const g = (kit.legacy || kit.main ? S.segs : segs).find(q => e.c >= q.start && e.c < q.start + q.n), def = g && (kit.enc[g.t] || []).find(q => q.id === e.id);
      if (!def) { note('an encounter outside its segment'); continue; } if (ids.has(e.id)) note('an encounter twice'); ids.add(e.id); if (e.c < free) note('encounters too close'); if (!(e.until > e.c && e.live === true)) note('encounter fields'); free = e.c + Math.ceil(def.frames / 174) + 2; if (e.c < S.wingC + 18 + 2 && e.c + Math.ceil(def.frames / 174) + 2 > S.wingC) note('an encounter in the Shadow Wing\'s time'); }
    { const tot = kit.legacy || kit.main ? at + tl : at; if (!(S.wingC >= Math.round(tot * 0.375) && S.wingC <= Math.round(tot * 0.55) && S.wingC + 18 <= tot)) note('the Shadow Wing\'s place'); }
    if (S.v !== SC.VERSION || S.kit !== k || S.level !== kit.level || S.gen.preset !== kit.preset || J(S.gen.params.segs.map(g => ({ t: g.t, n: g.n }))) !== J(segs.concat(mainSegs).map(g => ({ t: g.t, n: g.n })))) note('sortie fields'); /* (a segment may carry the day's ground dials, p) */
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
{ const D = [14, 15, 16, 17, 18, 19].map(n => SC.dailySeed('2026-11-' + n)), K = SC.KIT_ORDER.length, a = D[0], b = D[1];
  ok(new Set(D.slice(0, K).map(x => x.kit)).size === K && D[K].kit === D[0].kit, `the kit rotates day by day, every kit once in ${K} days (${D.map(x => x.kit).join(', ')})`);
  ok(a.seed !== b.seed && J(SC.dailySeed('2026-11-14')) === J(a) && a.n === 20261114 && a.sub === 0, 'a date gives its own seed, the same every time');
  let thrown = 0; for (const bad of ['2026-02-30', '2026-13-01', '14.11.2026', '', '2026-1-1']) try { SC.dailySeed(bad); } catch (e) { thrown++; } ok(thrown === 5, `a date that is none is refused (${thrown}/5)`);
  ok(SC.dateKeyUTC(Date.UTC(2026, 10, 14, 23, 59, 59)) === '2026-11-14' && SC.dateKeyUTC(Date.UTC(2026, 10, 15, 0, 0, 0)) === '2026-11-15', 'the day changes at midnight UTC');
  const S0 = SC.composeDaily('2026-11-14'); SC.DAILY_REROLL['2026-11-14'] = 3; const S3 = SC.composeDaily('2026-11-14'); delete SC.DAILY_REROLL['2026-11-14'];
  ok(S0.sub === 0 && S3.sub === 3 && S3.kit === S0.kit && J(S0.segs) !== J(S3.segs) && J(SC.composeDaily('2026-11-14').segs) === J(S0.segs), 'a date in the reroll table gets another sortie of the same kit, and the table is the only thing that changes it');
  ok(SC.composeDaily('2026-11-14', 'forest', 2).kit === 'forest' && S0.date === '2026-11-14' && typeof SC.composeVersion === 'number', 'the test link can force a kit and a sub-seed; the sortie carries its date and the composer its version');
  let all = 0; const seen = Object.fromEntries(SC.KIT_ORDER.map(k => [k, 0])); for (let i = 0; i < 366; i++) { const key = SC.dateKeyUTC(Date.UTC(2027, 0, 1) + i * 86400000); try { const S = SC.composeDaily(key); if (!SC.check(S.kit, S).length) { all++; seen[S.kit]++; } } catch (e) { /* counted as missing */ } }
  ok(all === 366 && Object.values(seen).every(n => n === Math.floor(366 / SC.KIT_ORDER.length) || n === Math.ceil(366 / SC.KIT_ORDER.length)), `every day of a year composes, ${Math.floor(366 / SC.KIT_ORDER.length)} or ${Math.ceil(366 / SC.KIT_ORDER.length)} days per kit (${all}; ${J(seen)})`); }

// 6b. the ground dials (docs/ground-variety-plan.md): a day's dials never touch the list, the encounters or the Wing; they stay in their ranges; off means off
{ const CGEN = require('../tools/citygen.js'); let seg = true, enc = true, off = true, some = 0, N = 0, range = true, tamper = true; const used = {}, N1 = 150;
  for (const k of kits) for (let s = 0; s < N1; s++) { if (SC.dialNames(SC.KITS[k]).length) N++; /* (the share of days that draw dials is of the kits that have dials) */ const seed = (SC.hash(s, 5151) * 4294967296) | 0, A = SC.composeSortie(k, seed, 0), B = SC.composeSortie(k, seed, 0, 'plain', 'none', 'off'), A0 = SC.composeSortie(k, seed, 0, 'plain', 'none', 'on');
    if (J(A.segs) !== J(B.segs)) seg = false; if (J(A.encPlan) !== J(B.encPlan) || A.wingC !== B.wingC) enc = false;
    if (B.dialNames.length || B.gen.params.segs.some(g => g.p) || SC.dialNames(SC.KITS[k]).some(d => B.gen.params[d] !== undefined)) off = false;
    if (A.dialNames.length) { some++; for (const d of A.dialNames) used[k + ':' + d] = true; } if (SC.check(k, A).length || SC.check(k, B).length || J(A0.gen) !== J(A.gen)) range = false; }
  ok(seg && enc, 'dials never change the segment list, the encounters or the Shadow Wing (3 kits x ' + N1 + ' seeds, dials on against off)');
  ok(off, 'dials off: no segment carries p and no dial is set globally');
  ok(range, 'every composed sortie, with dials and without, passes gate 1 (which checks each dial against its range)');
  { let weak = 0, withD = 0, count = true; for (const k of kits) for (let s = 0; s < 400; s++) { const C = SC.composeSortie(k, (SC.hash(s, 6161) * 4294967296) | 0, 0); if (!C.dialNames.length) continue; withD++; if (!C.dialNames.some(d => SC.KITS[k].dials.strong.includes(d))) weak++; if (C.dialNames.length < SC.DIAL_PICK[0] || C.dialNames.length > SC.DIAL_PICK[1]) count = false; }
    ok(withD > 0 && weak === 0 && count, 'a day that draws dials draws at least one strong dial, and still two or three in all (' + withD + ' days, ' + weak + ' without a strong one)'); }
  { let thrown = 0, lakesOk = true; for (const k of kits) for (const f of SC.FLAVOURS) for (const dl of ['on', 'off']) for (let s = 0; s < 25; s++) { try { const C = SC.composeSortie(k, (SC.hash(s, 8181) * 4294967296) | 0, 0, f, 'none', dl); if (k === 'forest' && (f === 'variant' || f === 'loop') && C.gen.params.lakes !== 1) lakesOk = false; if (dl === 'off' && C.dialNames.length) lakesOk = false; } catch (e) { thrown++; } }
    ok(thrown === 0 && lakesOk, 'every kit x flavour x dials on or off composes (a loop ground with dials off included), and the forest loop grounds keep their lakes (' + thrown + ' failures)'); }
  { let segsSame = true, dialsSame = true, night = true; for (const k of kits) for (let s = 0; s < 40; s++) { const seed = (SC.hash(s, 9393) * 4294967296) | 0, A = SC.composeSortie(k, seed, 0, 'plain', 'none', 'on', 'day');
      for (const t of SC.TODS) { const B = SC.composeSortie(k, seed, 0, 'plain', 'none', 'on', t); if (J(A.segs) !== J(B.segs) || J(A.encPlan) !== J(B.encPlan) || A.wingC !== B.wingC) segsSame = false; if (J(A.gen) !== J(B.gen) || J(A.dialNames) !== J(B.dialNames)) dialsSame = false; if (B.tod !== t) segsSame = false; }
      if (SC.composeSortie(k, seed, 0, 'plain', 'night', 'on', 'sunset').tod !== 'day' || SC.composeSortie(k, seed, 0, 'plain', 'none', 'on', 'bogus').tod !== 'day') night = false; }
    ok(segsSame && dialsSame, 'the light of the day never changes the segment list, the encounters, the Wing, the dials or the generator input (3 kits x 40 seeds x 3 lights)');
    ok(night, 'a Night run day is always flown at noon, and an unknown light is noon');
    const dk = n => SC.dateKeyUTC(Date.UTC(2026, 0, 1) + n * 86400000), cnt = { day: 0, morning: 0, sunset: 0 }; let nightGraded = 0; for (let n = 0; n < 1100; n++) { const D = SC.dailySeed(dk(n)); cnt[D.tod]++; if (D.twist === 'night' && D.tod !== 'day') nightGraded++; }
    ok(nightGraded === 0 && cnt.morning > 130 && cnt.sunset > 130 && cnt.day > 600 && cnt.day < 800, 'the date draws the light: ' + J(cnt) + ' over 1,100 days (60 % noon before Night run days are set to noon), none graded on a Night run day'); }
  { let inPool = true, all = true; for (const k of kits) { const seen = new Set(); for (let s = 0; s < 3000; s++) { const C = SC.composeSortie(k, (SC.hash(s, 3) * 4294967296) | 0, 0); seen.add(C.bossVar.variant); if (!SC.KITS[k].bosses.some(b => b.id === C.bossVar.variant && b.kind === C.bossVar.kind)) inPool = false; } if (!SC.KITS[k].bosses.every(b => seen.has(b.id))) all = false; }
    ok(inPool && all, "every kit draws only bosses of its pool, and every entry of every pool in 3,000 draws (" + kits.map(k => k + ' ' + SC.KITS[k].bosses.length).join(', ') + ' entries)');
    const same = kits.every(k => { const A = SC.composeSortie(k, 4242, 0), B = SC.composeSortie(k, 4242, 0, 'plain', 'none', 'on', 'sunset'); return J(A.segs) === J(B.segs) && J(A.bossVar) === J(B.bossVar); }); ok(same, 'the boss does not depend on the light, and the list does not depend on the boss'); }
  ok(some > N * (1 - SC.DIAL_NONE) * 0.85 && some < N * (1 - SC.DIAL_NONE) * 1.15, 'about ' + (100 - 100 * SC.DIAL_NONE) + ' % of days draw dials (' + some + ' of ' + N + ')');
  const every = kits.every(k => SC.dialNames(SC.KITS[k]).every(d => used[k + ':' + d])); ok(every, 'every dial of every kit is drawn on some day: ' + kits.map(k => k + ' ' + SC.dialNames(SC.KITS[k]).length).join(', '));
  /* gate 1 rejects what it should */
  for (const k of kits.filter(q => SC.dialNames(SC.KITS[q]).length)) { let S = null; for (let s = 0; s < 60 && !S; s++) { const C = SC.composeSortie(k, s * 97 + 5, 0); if (C.gen.params.segs.some(g => g.p)) S = C; } if (!S) { tamper = false; continue; }
    const mk = f => { const T = JSON.parse(J(S)); f(T); return SC.check(k, T).length > 0; }, pk = Object.keys(S.gen.params.segs.find(g => g.p).p)[0];
    if (!mk(T => { T.gen.params.segs.find(g => g.p).p[pk] = 99; }) || !mk(T => { T.gen.params.segs.find(g => g.p).p.bogus = 1; }) || !mk(T => { T.dials = 'off'; })) tamper = false; }
  ok(tamper, 'gate 1 rejects a dial out of its range, a dial the template does not take, and dials on a day that has them off');
  /* the composer's forest table is the generator's; every dial name and range is one the generator's own tables know (it clamps the rest away) */
  { const norm = T => J(Object.keys(T).sort().map(t => [t, ['roads', 'rides', 'plantations', 'clearings', 'cuts', 'guns'].map(q => T[t][q] || 0)])); ok(norm(CGEN.FOREST_BASE) === norm(SC.FOREST_BASE), "the composer's FOREST_BASE equals the generator's (an absent count is 0)"); }
  const known = { desert: CGEN.DESERT_DIALS, forest: CGEN.FOREST_DIALS, winter: CGEN.WINTER_DIALS, city: CGEN.CITY_DIALS, temperate: CGEN.ISLES_DIALS }; let inside = true;
  for (const k of kits) for (const t in SC.KITS[k].dials.seg) for (const d in SC.KITS[k].dials.seg[t]) { const g = known[k][d], r = SC.KITS[k].dials.seg[t][d]; if (!g || r[0] < g[0] || r[1] > g[1]) { inside = false; console.log('       ' + k + ' ' + t + ' ' + d + ' ' + r.join('..') + ' is outside the generator table ' + (g || []).join('..')); } }
  ok(inside, "every per-segment dial range lies inside the generator's own table");
  /* the forest's crowns dial: more crowns the higher it is, across the whole range (an upper half that did nothing was the first version's flaw) */
  if (kits.includes('forest')) { const K = SC.KITS.forest, C = SC.composeSortie('forest', 777, 0, 'plain', 'none', 'off'), n = c => CGEN.generate(Object.assign({}, C.gen, { params: Object.assign({}, C.gen.params, { segs: C.gen.params.segs.map(g => K.dials.seg[g.t] ? Object.assign({}, g, { p: { crowns: c } }) : g) }) })).conifers.reduce((a, x) => a + x.length, 0), r = K.dials.seg.forest_conifer.crowns, v = [r[0], (r[0] + 1) / 2, 1, (1 + r[1]) / 2, r[1]].map(n);
    ok(v.every((x, i) => !i || x > v[i - 1] * 1.05) && Math.abs(v[2] - n(1)) === 0, 'forest crowns: ' + v.join(' < ') + ' crowns across ' + r.join(' to ')); }
  /* each dial reaches the plan: one sortie per kit, the dial at both ends of its range (the full extremes are tests/dials-probe.mjs) */
  const sig = pl => { let h = 2166136261 >>> 0; const mix = v => { h = Math.imul(h ^ (v | 0), 16777619) >>> 0; }; for (const key of Object.keys(pl).sort()) { if (key === 'P' || key === 'stage') continue; const v = pl[key]; if (ArrayBuffer.isView(v)) { for (let i = 0; i < v.length; i += 7) mix(v[i] * 1000); } else if (Array.isArray(v)) { mix(v.length); if (Array.isArray(v[0])) mix(v.reduce((q, x) => q + x.length, 0)); } } return h; }; /* (a list of lists, like the conifers: count the items too) */
  for (const k of kits.filter(q => q !== 'winter' || !process.argv.includes('--fast'))) { const K = SC.KITS[k], dead = [];
    const findC = d => { for (let s = 4242; s < 4642; s++) { const C = SC.composeSortie(k, s, 0, 'plain', 'none', 'off'); if (K.dials.global[d] || C.gen.params.segs.some(g => (K.dials.seg[g.t] || {})[d])) return C; } return null; }; /* (a dial of a river stretch needs a list with a river) */
    for (const d of SC.dialNames(K)) { const C = findC(d); if (!C) { dead.push(d + ' (no list takes it)'); continue; } const base = sig(CGEN.generate(C.gen)); let hit = false; for (const end of [0, 1]) { const params = Object.assign({}, C.gen.params); if (K.dials.global[d]) params[d] = K.dials.global[d][end]; params.segs = C.gen.params.segs.map(g => (K.dials.seg[g.t] || {})[d] ? Object.assign({}, g, { p: { [d]: K.dials.seg[g.t][d][end] } }) : g); if (sig(CGEN.generate(Object.assign({}, C.gen, { params }))) !== base) hit = true; } if (!hit) dead.push(d); }
    ok(dead.length === 0, k + ': every dial changes the plan' + (dead.length ? ' (not: ' + dead.join(', ') + ')' : '')); } }

// 7. gate 2: the generator's plan of each composed list
const BASE = { desert: 246, forest: 163, winter: 1265, city: 230, temperate: 100 }; // p95 plan time of the hand-made lists, ms, Node alone (plan section 6.4; city: CI runners measured a median of 278-290 ms with the dockyard, river and yard stretches, so 230 leaves headroom); the limit is 1.5 times it, on the median
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
