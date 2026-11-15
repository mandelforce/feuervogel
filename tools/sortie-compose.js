/* FEUERVOGEL 89 sortie composer (docs/daily-sortie-plan.md): puts a level-length segment list together from a kit.
   Pure and deterministic: the same kit, seed and sub-seed always give the same sortie. No DOM, no game globals, no Math.random,
   so the Node test (tests/compose.mjs) and the game run this same file. The game carries a copy in index.html
   (the block with id sortieComposeSrc, refreshed by node scripts/embed-citygen.mjs; tests/compose.mjs fails while it is old).

   A kit is one climate's ground: its generator preset, a fixed opener and approach, a vocabulary of middle templates with a
   grammar (which may follow which, how often, how long), the level whose boss, theme and art it borrows, and its encounters.
   The grammar is what the presets tolerate, measured by tests/compose-probe.mjs (sections 6.2 and 6.6 of the plan). The length
   ranges below are narrower than what is merely valid: they keep every stretch long enough to play and short enough not to drag.

   composeSortie(kitId, seed, sub) -> { v, kit, level, seed, sub, base (the seed with the sub-seed mixed in: the game's sortie seed), attempt, segs: [{ t, start, n }], len, encPlan, wingC (the chunk the Shadow Wing comes at), boss, arena,
     climate, timeOfDay, gen: { preset, seed, params } }  (gen is what CityGen.generate takes)
   dailySeed('YYYY-MM-DD') -> { date, n, day, kit, seed, sub }   the day is UTC, the kit by rotation, sub from DAILY_REROLL
   composeDaily('YYYY-MM-DD') -> composeSortie of that day, with .date
   check(kitId, sortie) -> [] or the list of broken rules (gate 1). composeSortie only returns a sortie that passes it. */
(function (root) {
'use strict';
const VERSION = 1; // composeVersion: raise it with any change that alters what a date gives (the kits, the walk, the hash use); anything keyed by date uses date + version
const CH_S = 174; // frames the level scrolls one chunk (measured: the boss trigger comes 2.9 s per chunk after the start, tests/daily-baseline.json)

// The game's sortieHash, bit for bit (tests/compose.mjs compares the two): a pure hash of two integers, 0 <= result < 1.
function hash(a, b) { let h = Math.imul(a | 0, 0x9E3779B1) ^ Math.imul(b | 0, 0x85EBCA6B); h = Math.imul(h ^ (h >>> 15), 0x2C1B3C6D); h = Math.imul(h ^ (h >>> 12), 0x297A2D39); return ((h ^ (h >>> 15)) >>> 0) / 4294967296; }
const hashInt = (a, b) => (hash(a, b) * 4294967296) | 0;

/* The kits. Lengths in chunks (64 px).
   opener, approach: fixed, in order: [template, chunks].
   middle[t]: len [min, max]; max: how often it may appear; heat: how hard the stretch fights (0 quiet .. 1 hot), for the rhythm
     (the composer's own estimate from each template's gun sites and features; tune it with the flight gate's numbers);
     built: the highest share of structures a segment of it may have (gate 2; twice the hand-made level's highest, plus 5 points).
   follows[t]: what may come directly after t (the opener's last template and every middle one). The approach may follow any
     middle template that differs from its first.
   len: the total, in chunks. boss: { add: n } the trigger n chunks past the level's end, or { yard: true } (level 5's rule, which the
     game works out from the screen). arena: chunks of plan past the level's end. params: the generator's, besides segs.
   enc[t]: encounters a segment of t may hold: { id, at: chunks into the segment, end: chunks before its end the try is given up,
     frames: how long it runs (measured in the first loops, tests/daily-baseline.json), first/last: only in the level's first or
     last segment of that template }. Taken from the loops' hand-made plans (buildSortie). Only those that work on the first pass's ground
     are listed (flown in phase 2: every event of these finds its place; see section 8 of the plan). */
const KITS = {
  desert: { id: 'desert', level: 2, preset: 'sandSea', params: { variant: 0 }, arena: 0, boss: { add: 5 }, climate: 'desert', timeOfDay: 'day', len: [62, 82],
    opener: [['harbour_commercial', 6], ['beach_town', 5]], approach: [['desert_open', 9]],
    middle: {
      valley: { len: [7, 12], max: 2, heat: 0.4, built: 0.15 },
      village: { len: [7, 8], max: 1, heat: 0.8, built: 0.55 }, // (not shorter: the held village's defences reach 190 px south of its middle and must stay inside its own segment; at 4 to 6 chunks they ran into the port, the pass's rock or the open desert's hamlet in 42 of 216 composed lists, at 7 in 0 of 63)
      station_junction: { len: [6, 10], max: 1, heat: 0.5, built: 0.27 },
      desert_open: { len: [4, 7], max: 2, heat: 0.1, built: 0.23 },
      airbase_desert: { len: [7, 10], max: 1, heat: 0.7, built: 0.42 },
      pass: { len: [8, 12], max: 1, heat: 0.9, built: 0.17 } },
    fixedBuilt: { harbour_commercial: 0.8, beach_town: 0.36, desert_open: 0.23 },
    follows: {
      beach_town: ['valley', 'village', 'station_junction', 'desert_open', 'airbase_desert', 'pass'],
      valley: ['village', 'station_junction', 'desert_open', 'airbase_desert', 'pass'],
      village: ['valley', 'station_junction', 'desert_open', 'airbase_desert', 'pass'],
      station_junction: ['valley', 'village', 'desert_open', 'airbase_desert', 'pass'],
      desert_open: ['valley', 'station_junction', 'airbase_desert', 'pass'], // (not the village: a later open desert's roadside hamlet reaches up to 70 px past its segment's end, into the village's defences: 3 of 300 composed lists)
      airbase_desert: ['valley', 'village', 'station_junction', 'desert_open', 'pass'],
      pass: ['valley', 'village', 'station_junction', 'desert_open', 'airbase_desert'] },
    enc: { village: [{ id: 'oasisambush', at: 0, end: 1, frames: 1180 }], desert_open: [{ id: 'burningfield', at: 0, end: 1, frames: 1080, first: true, middle: true }, { id: 'fuelconvoy', at: 1, end: 2, frames: 1280, last: true }] } },
  forest: { id: 'forest', level: 4, preset: 'ironForest', params: { roadEnd: 112 }, arena: 0, boss: { add: 3 }, climate: 'forest', timeOfDay: 'day', len: [50, 66],
    opener: [['beach_cliff', 3]], approach: [['farmland_approach', 7]],
    middle: {
      forest_conifer: { len: [5, 9], max: 2, heat: 0.3, built: 0.21 },
      forest_fortified: { len: [6, 9], max: 2, heat: 0.9, built: 0.18 },
      clearing_village: { len: [4, 6], max: 1, heat: 0.5, built: 0.16 },
      airbase_forest_hidden: { len: [5, 8], max: 1, heat: 0.6, built: 0.22 },
      valley: { len: [5, 8], max: 1, heat: 0.3, built: 0.2 } },
    fixedBuilt: { beach_cliff: 0.1, farmland_approach: 0.13 },
    follows: {
      beach_cliff: ['forest_conifer', 'forest_fortified', 'clearing_village', 'airbase_forest_hidden', 'valley'],
      forest_conifer: ['forest_fortified', 'clearing_village', 'airbase_forest_hidden', 'valley'],
      forest_fortified: ['forest_conifer', 'clearing_village', 'airbase_forest_hidden', 'valley'],
      clearing_village: ['forest_conifer', 'forest_fortified', 'airbase_forest_hidden', 'valley'],
      airbase_forest_hidden: ['forest_conifer', 'forest_fortified', 'clearing_village', 'valley'],
      valley: ['forest_conifer', 'forest_fortified', 'clearing_village', 'airbase_forest_hidden'] },
    enc: { beach_cliff: [{ id: 'cliffbattery', at: 1, end: 1, frames: 1280 }] } }, // (not 'valleyconvoy': without the first loop's river three of its eight events make nothing, and it holds the air waves for 2100 frames)
  winter: { id: 'winter', level: 5, preset: 'winterGorge', params: { joinRoad: 1 }, arena: 48, boss: { yard: true }, climate: 'winter', timeOfDay: 'day', len: [78, 90],
    opener: [['open_sea_ice', 18], ['harbour_winter', 5], ['farmland_winter', 8]], approach: [['pass', 7], ['farmland_winter', 11]],
    middle: {
      village: { len: [4, 6], max: 1, heat: 0.5, built: 0.31 },
      lake_valley: { len: [6, 8], max: 1, heat: 0.3, built: 0.19 },
      station_winter: { len: [6, 9], max: 1, heat: 0.5, built: 0.13 },
      airbase_snow: { len: [6, 8], max: 1, heat: 0.6, built: 0.13 },
      forest_conifer: { len: [5, 8], max: 2, heat: 0.3, built: 0.13 } },
    fixedBuilt: { open_sea_ice: 0.05, harbour_winter: 0.72, farmland_winter: 0.41, pass: 0.14 },
    follows: {
      farmland_winter: ['village', 'lake_valley', 'station_winter', 'airbase_snow', 'forest_conifer'],
      village: ['lake_valley', 'station_winter', 'airbase_snow', 'forest_conifer'],
      lake_valley: ['village', 'station_winter', 'airbase_snow', 'forest_conifer'],
      station_winter: ['village', 'lake_valley', 'airbase_snow', 'forest_conifer'],
      airbase_snow: ['village', 'lake_valley', 'station_winter', 'forest_conifer'],
      forest_conifer: ['village', 'lake_valley', 'station_winter', 'airbase_snow'] },
    enc: { open_sea_ice: [{ id: 'iceraid', at: 4, end: 6, frames: 1180 }], lake_valley: [{ id: 'iceroad', at: 1, end: 2, frames: 1280 }] } }, // (not 'basebreak': without the first loop's basin its two flak guns find no place and it is called off, 5 of 5 flights)
};
const KIT_ORDER = ['desert', 'forest', 'winter']; // the daily rotation (owner: rotation, so consecutive days differ)
const WING_AT = 0.375, WING_LATE = 0.55, WING_CH = 18; // the Shadow Wing's encounter: where it comes as a share of the level (the Campaign's levels 2 to 6: chunk 18 of 48) and the chunks it takes (2864 frames and its rest); WING_LATE: how far an encounter before it may push it back (the loops' own plans have it between 0.29 and 0.6)
const ATTEMPTS = 64, MIN_MIDDLE = 4, ENC_REST = 2; // tries per sub-seed; fewest middle segments; chunks of rest between an encounter's end and the next one's start

// Encounters by segment: at most one per segment, each id once, none starting before the last one has run its length and ENC_REST chunks have passed.
// The Shadow Wing has its place among them: the game brings it once the spawn line passes its chunk and no encounter is on, and while it is up no
// other encounter starts. So it is laid in here as one more encounter (from WING_AT of the level on, after whatever runs then, WING_LATE at the latest), and an encounter whose
// segment the Wing covers is left out instead of being planned and then given up by the game. Returns { enc: [{ id, c, until, live }], wingC }.
function encPlanFor(kit, segs) {
  const out = [], used = {}, len = segs.reduce((a, g) => a + g.n, 0), wing0 = Math.round(len * WING_AT), wing1 = Math.round(len * WING_LATE); let free = 0, wingC = -1;
  const layWing = () => { wingC = Math.max(wing0, free); free = wingC + WING_CH + ENC_REST; };
  segs.forEach((g, k) => { const list = kit.enc[g.t]; if (!list) return;
    const firstOf = segs.findIndex(q => q.t === g.t) === k, lastOf = segs.map(q => q.t).lastIndexOf(g.t) === k, inMiddle = k >= kit.opener.length && k < segs.length - kit.approach.length;
    for (const e of list) { if (used[e.id] || (e.first && !firstOf) || (e.last && !lastOf) || (e.middle && !inMiddle)) continue;
      const need = Math.ceil(e.frames / CH_S), c0 = g.start + e.at, until = Math.max(c0 + 1, g.start + g.n - e.end);
      if (wingC < 0 && Math.max(c0, free) + need + ENC_REST > wing1) layWing(); /* (it would keep the Wing waiting past its latest place: the Wing first) */
      const c = Math.max(c0, free); if (c >= until || c >= g.start + g.n) continue; /* (no room left in its segment) */
      out.push({ id: e.id, c, until, live: true }); used[e.id] = true; free = c + need + ENC_REST; break; } });
  if (wingC < 0) layWing();
  return { enc: out, wingC };
}

// Gate 1: every rule a composed list must keep. Returns the broken ones (an empty list: it passes).
function check(kitId, S) {
  const kit = KITS[kitId], bad = []; if (!kit) return ['no kit ' + kitId];
  const segs = S.segs || [], O = kit.opener, A = kit.approach, mid = segs.slice(O.length, segs.length - A.length);
  let at = 0; segs.forEach((g, k) => { if (g.start !== at) bad.push('segment ' + k + ' starts at ' + g.start + ', not ' + at); if (!(g.n >= 1) || g.n !== Math.floor(g.n)) bad.push('segment ' + k + ' has length ' + g.n); at += g.n; });
  if (S.len !== at) bad.push('len ' + S.len + ', segments ' + at);
  if (at < kit.len[0] || at > kit.len[1]) bad.push('total ' + at + ' outside ' + kit.len.join('..'));
  O.forEach((q, k) => { const g = segs[k]; if (!g || g.t !== q[0] || g.n !== q[1]) bad.push('opener ' + k + ' is not ' + q.join(' ')); });
  A.forEach((q, k) => { const g = segs[segs.length - A.length + k]; if (!g || g.t !== q[0] || g.n !== q[1]) bad.push('approach ' + k + ' is not ' + q.join(' ')); });
  if (mid.length < MIN_MIDDLE) bad.push('only ' + mid.length + ' middle segments');
  const count = {}; mid.forEach((g, k) => { const m = kit.middle[g.t]; if (!m) { bad.push(g.t + ' is not a middle template'); return; }
    count[g.t] = (count[g.t] || 0) + 1; if (g.n < m.len[0] || g.n > m.len[1]) bad.push(g.t + ' at ' + g.n + ' chunks, outside ' + m.len.join('..'));
    const prev = k ? mid[k - 1].t : O[O.length - 1][0]; if (!(kit.follows[prev] || []).includes(g.t)) bad.push(g.t + ' may not follow ' + prev); });
  for (const t in count) if (count[t] > kit.middle[t].max) bad.push(t + ' ' + count[t] + ' times, at most ' + kit.middle[t].max);
  if (mid.length && mid[mid.length - 1].t === A[0][0]) bad.push('the approach repeats the last middle template');
  /* spec 4.4, as far as a list can break it: a harbour needs the sea before it (it is the opener's, behind the sea or first over it); a station needs rail
     (every kit's preset lays its line the whole length); one airbase at most (max). The rest is the generator's to keep, and gate 2 checks it. */
  const enc = S.encPlan || [], ids = {}, spans = [[S.wingC, S.wingC + WING_CH, 'the Shadow Wing']];
  if (!(S.wingC >= Math.round(at * WING_AT) && S.wingC <= Math.round(at * WING_LATE)) || S.wingC + WING_CH > at) bad.push('the Shadow Wing at chunk ' + S.wingC + ' of ' + at);
  enc.forEach(e => { const g = segs.find(q => e.c >= q.start && e.c < q.start + q.n), def = g && (kit.enc[g.t] || []).find(q => q.id === e.id);
    if (!def) { bad.push('encounter ' + e.id + ' at chunk ' + e.c + ' is in no segment that holds it'); return; }
    if (ids[e.id]) bad.push('encounter ' + e.id + ' twice'); ids[e.id] = true; if (!(e.until > e.c)) bad.push('encounter ' + e.id + ' has no room');
    spans.push([e.c, e.c + Math.ceil(def.frames / CH_S), e.id]); });
  spans.sort((a, b) => a[0] - b[0]); for (let k = 1; k < spans.length; k++) if (spans[k][0] < spans[k - 1][1] + ENC_REST) bad.push(spans[k][2] + ' starts at chunk ' + spans[k][0] + ', before ' + spans[k - 1][2] + ' is over and rested');
  return bad;
}

// One try at a middle: a seeded walk over the grammar, then the lengths fitted to the target. Returns [[t, n], ...] or null.
function walk(kit, target, r) {
  const T = Object.keys(kit.middle), seq = [], count = {}; let sum = 0, prev = kit.opener[kit.opener.length - 1][0];
  for (;;) {
    const heat = seq.slice(-2).map(q => kit.middle[q[0]].heat), hot2 = heat.length === 2 && heat[0] >= 0.6 && heat[1] >= 0.6, quiet1 = heat.length > 0 && heat[heat.length - 1] < 0.4;
    const cand = T.filter(t => t !== prev && kit.follows[prev].includes(t) && (count[t] || 0) < kit.middle[t].max && sum + kit.middle[t].len[0] <= target); if (!cand.length) break;
    /* weights: a template already used counts a third; after two hot stretches a quiet one is three times as likely and another hot one a quarter; two quiet ones in a row half */
    const w = cand.map(t => { const h = kit.middle[t].heat; return (count[t] ? 1 / 3 : 1) * (hot2 ? (h < 0.4 ? 3 : h >= 0.6 ? 0.25 : 1) : 1) * (quiet1 && h < 0.4 ? 0.5 : 1); }), tot = w.reduce((a, b) => a + b, 0);
    let x = r() * tot, k = 0; while (k < cand.length - 1 && x >= w[k]) { x -= w[k]; k++; }
    const t = cand[k], m = kit.middle[t], n = Math.min(target - sum, m.len[0] + Math.floor(r() * (m.len[1] - m.len[0] + 1)));
    seq.push([t, n]); count[t] = (count[t] || 0) + 1; sum += n; prev = t;
  }
  /* fit: the chunks still missing go, one at a time, to the segment with the most room left (the first of equals) */
  for (let rest = target - sum; rest > 0; rest--) { let best = -1, room = 0; seq.forEach((q, k) => { const f = kit.middle[q[0]].len[1] - q[1]; if (f > room) { room = f; best = k; } }); if (best < 0) return null; seq[best][1]++; }
  if (seq.length < MIN_MIDDLE || seq[seq.length - 1][0] === kit.approach[0][0]) return null;
  return seq;
}

function composeSortie(kitId, seed, sub) {
  const kit = KITS[kitId]; if (!kit) throw new Error('sortie-compose: no kit ' + kitId);
  seed = seed | 0; sub = sub | 0; const base = sub ? hashInt(seed, 7919 + sub) : seed, fixed = kit.opener.concat(kit.approach).reduce((a, q) => a + q[1], 0);
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const as = hashInt(base, 1000 + attempt); let n = 0; const r = () => hash(as, n++);
    const total = kit.len[0] + Math.floor(r() * (kit.len[1] - kit.len[0] + 1)), mid = walk(kit, total - fixed, r); if (!mid) continue;
    const segs = []; let at = 0; for (const [t, len] of kit.opener.concat(mid, kit.approach)) { segs.push({ t, start: at, n: len }); at += len; }
    const params = Object.assign({}, kit.params, { segs: segs.map(g => ({ t: g.t, n: g.n })) }); if (kit.preset === 'ironForest') params.L = at * 64;
    const ep = encPlanFor(kit, segs), S = { v: VERSION, kit: kitId, level: kit.level, seed, sub, base, attempt, segs, len: at, encPlan: ep.enc, wingC: ep.wingC, boss: Object.assign({}, kit.boss), arena: kit.arena, climate: kit.climate, timeOfDay: kit.timeOfDay,
      gen: { preset: kit.preset, seed: (hash((base + kit.level * 977) | 0, 61) * 2147483647) | 0, params } };
    if (!check(kitId, S).length) return S;
  }
  throw new Error('sortie-compose: kit ' + kitId + ', seed ' + seed + ', sub ' + sub + ': no valid sortie in ' + ATTEMPTS + ' tries (the grammar is wrong)');
}

// The daily seed. A date listed in DAILY_REROLL uses that sub-seed instead of 0 (the flight gate adds dates whose sortie fails).
const DAILY_SALT = 0x0F0E89, DAILY_REROLL = {};
function dailySeed(dateKey) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey)); if (!m) throw new Error('sortie-compose: a date is YYYY-MM-DD, not ' + dateKey);
  const y = +m[1], mo = +m[2], d = +m[3], ms = Date.UTC(y, mo - 1, d), back = new Date(ms); if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) throw new Error('sortie-compose: no such day ' + dateKey);
  const n = y * 10000 + mo * 100 + d, day = Math.round(ms / 86400000);
  return { date: m[0], n, day, kit: KIT_ORDER[((day % KIT_ORDER.length) + KIT_ORDER.length) % KIT_ORDER.length], seed: hashInt(DAILY_SALT, n), sub: DAILY_REROLL[m[0]] | 0 };
}
function dateKeyUTC(ms) { return new Date(ms).toISOString().slice(0, 10); } // the day a moment belongs to (owner: UTC, so every player has the same day)
function composeDaily(dateKey, kitId, sub) { // kitId, sub: forced, for the test link (?daily=2026-11-14&kit=forest&sub=3)
  const D = dailySeed(dateKey), S = composeSortie(kitId || D.kit, D.seed, sub === undefined || sub === null ? D.sub : sub); S.date = D.date; return S;
}

const SortieCompose = { VERSION, composeVersion: VERSION, KITS, KIT_ORDER, DAILY_REROLL, hash, composeSortie, check, encPlanFor, dailySeed, dateKeyUTC, composeDaily };
if (typeof module !== 'undefined' && module.exports) module.exports = SortieCompose;
root.SortieCompose = SortieCompose;
})(typeof globalThis !== 'undefined' ? globalThis : this);
