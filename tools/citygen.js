/* FEUERVOGEL 89 settlement generator ("city lab"), version 1: the town core.
   Pure and deterministic: the same parameters and seed always give the same plan. No DOM, no game globals, so the lab page
   (tools/citylab.html), the Node test (tests/citygen.mjs) and later the game itself run this same file.

   How a town is built (best practice from procedural city work: streets first, buildings second; constraints first; density from a centre;
   landmarks by quota; nothing overlaps by construction; per-object random streams):
     1. fields     urbanisation U(y) and damage D(y) along the strip; lateral falloff from the main road so the town frays along its roads
     2. streets    the main road (arterial, tank route), horizontal cross streets, collectors parallel to the main road, local streets;
                   streets end in T-junctions on cross streets; widths by class (tanks need a 10 px carriageway)
     3. landmarks  market square at the densest point, the big church facing it, parish churches by quota and spacing, parks
     4. frontage   plots walk along every street in order of importance and claim space on an occupancy raster: detached houses with front
                   and back gardens at low U, terraces in between, closed perimeter blocks at high U; vacant lots are left on purpose
     5. interiors  what is left inside blocks becomes back gardens, paved courtyards (with sheds) or meadow; outside the town, fields
     6. dressing   trees, damage (damaged roofs, ruins, fires, craters), and slots: places for flak and artillery on lots, flat roofs,
                   squares, courtyards and parks
   The result is a plan: raster layers (kind and owner per pixel) plus lists (streets, buildings, trees, slots, ...). A renderer paints it in
   the game's pixel style (CityGen.paint); the game asks the same plan what is at a point (CityGen.typeAt).

   Coordinates: x 0..W-1 left to right, y 0..L-1 from the start of the town (bottom of the screen) upward, in pixels. */
(function (root) {
'use strict';

// ---------- pixel kinds (one per raster cell) ----------
const K = { NONE: 0, ROAD: 1, STREET: 2, WALK: 3, BLDG: 4, PLAZA: 5, FRONT: 6, GARDEN: 7, COURT: 8, PARK: 9, LOT: 10, CHYARD: 11, FIELD: 12, MEADOW: 13, RUBBLE: 14, WATER: 15, ORCHARD: 16, RIVER: 17, BRIDGE: 18, QUAY: 19, BANK: 20, TRACK: 21, WORKS: 22, RAIL: 23, RBRIDGE: 24, SEA: 25, BEACH: 26, TRENCH: 27, APRON: 28 };
// what the game's placement and spawn code calls each kind (its terrain-type vocabulary)
const TT = ['field', 'road', 'street', 'street', 'roof', 'yard', 'yard', 'grass', 'yard', 'park', 'yard', 'grass', 'field', 'grass', 'rubble', 'river', 'grass', 'river', 'bridge', 'street', 'sand', 'field', 'yard', 'rail', 'railbridge', 'sea', 'sand', 'mud', 'apron'];
const KIND_NAMES = Object.keys(K);

// ---------- presets ----------
// Every number that shapes a town lives here, so the lab can tune it and a level can pick a preset.
const PRESETS = {
  town: {
    label: 'Town core',
    W: 224, L: 1800,
    density: [[0, 0.04], [0.16, 0.28], [0.38, 0.66], [0.58, 1], [0.8, 0.86], [1, 0.6]], // [share of L, U]
    damage: 0.25, // damage at the densest point; scales the curve below
    damageCurve: [[0, 0], [0.5, 0.6], [1, 1]],
    road: null, // null: drawn from the seed; or { c, amp, fr, ph }
    coreBase: 26, coreGrow: 150, fray: 46, // lateral town width: core half-width = coreBase + coreGrow * U^1.4, then a fray zone
    crossSpacing: [150, 46], // cross street spacing at U 0 and U 1
    crossMinU: 0.22, crossEndU: 0.3, stagger: 10,
    quarterLen: [220, 420], fieldLanesU: 0.6, gridChance: 0.65, gridTilt: [0.02, 0.32], gridTiltBias: 2.2, followSkew: 0.08, followJog: 0.1, blockScale: [0.8, 1.25], crossMinGap: 26, minBlockDepth: 30, // quarters (2a'')
    collectorOffset: [70, 56], collectorMinU: 0.5, outerLocalMinU: 0.7, outerLocalChance: 0.72, blockMergeChance: 0.08,
    widths: { arterialLow: 9, arterialHigh: 18, collector: 12, local: 7, carriage: 10 },
    houses: { detached: [0.3], terraceTo: 0.62 },
    lotChance: 0.05, lotChanceDamage: 0.08,
    squares: true, cathedral: true, parishSpacing: 560, parishMinU: 0.45, parkSpacing: 700,
    trees: 1,
    // step 2: the old town inside a ring boulevard, roundabouts with diagonal avenues, and the city's public buildings
    oldTown: { rx: [62, 82], ry: [104, 138], ring: 14, lane: 6, belt: [10, 15], minU: 0.75 },
    stars: 1, star: { ro: 17, ri: 8, rays: true },
    civic: { townHall: true, government: true, domedHall: true, store: true, gasworks: true },
    railway: true, harbour: false, // a railway line along the town's edge with a station; a harbour district on a river bank (river presets)
    industry: 0.2, industryMaxU: 0.75, power: false, farms: 0, // industrial quarters (chance per quarter), a power station, courtyard farmsteads
    slots: { flakSpacing: 44, artySpacing: 72, flakPer300: 2.2, artyPer300: 1.1 },
  },
};
// River town: the town core with a river across it at the denser end, quays and riverside streets in town, natural banks outside,
// an old-town island on the main road reached by two bridges, and one more bridge for a collector.
PRESETS.river = Object.assign({}, PRESETS.town, { harbour: true, label: 'River town', river: { at: 0.62, width: 28, amp: 6, island: true, rx: 42, ry: 16, channel: 11 } }); // a long, slim island along the current
// Two rivers: the river town plus a narrower second river (a tributary, no island) further along
// A village (Angerdorf): the main road splits round a lens-shaped green with the church and a pond; courtyard farmsteads along the roads,
// fields all round, farm tracks; no old town, no public buildings, no railway
PRESETS.village = Object.assign({}, PRESETS.town, { label: 'Village', L: 1200,
  density: [[0, 0.02], [0.25, 0.14], [0.45, 0.36], [0.62, 0.4], [0.8, 0.22], [1, 0.03]], damage: 0.15, coreBase: 18, coreGrow: 90, fray: 34,
  crossSpacing: [150, 90], crossMinU: 0.2, squares: false, cathedral: false, parishMinU: 2, parkSpacing: 1e9, lotChance: 0.02,
  oldTown: { green: true, rx: [30, 40], rxMin: 28, ry: [62, 90], ring: 10, lane: 6, belt: [0, 0], minU: 0.25 },
  stars: 0, civic: {}, railway: false, harbour: false, industry: 0, farms: 0.62, houses: { detached: [0.45], terraceTo: 0.8 } });
// A crossroads village (Haufendorf at a crossing): a second main road crosses the strip, the village grows along both roads, and its centre
// at the crossing has a square with a lime tree and a well, the church and the inn
PRESETS.crossroads = Object.assign({}, PRESETS.village, { label: 'Crossroads village', oldTown: null, crossroads: { w: 10 }, villageCentre: true, farms: 0.55 });
// A port city: the sea along one side, the town inland of the waterfront street, an old town, and a huge harbour along a long stretch of the
// coast (breakwaters and lighthouses, finger piers with ships, a U-boat bunker, a shipyard, warehouses and the harbour railway); beaches elsewhere
PRESETS.port = Object.assign({}, PRESETS.town, { label: 'Port city', density: [[0, 0.04], [0.2, 0.3], [0.45, 0.7], [0.62, 1], [0.8, 0.95], [1, 0.9]],
  coast: { mode: 'mix', land: 0.67, amp: 8, end: 0.8, side: [0.16, 0.22], harbour: [0.32, 0.4], pier: [26, 40], channel: 28 }, harbour: false, rivers: null, river: null, industry: 0.12,
  oldTown: Object.assign({}, PRESETS.town.oldTown, { rx: [34, 42], rxMin: 30, ry: [96, 124], minU: 0.6 }), collectorOffset: [58, 46], stationRoom: 64 });
// A south port: the same, mirrored along the strip: the level begins over the sea and the town starts at a quay near the south end
PRESETS.portSouth = Object.assign({}, PRESETS.port, { label: 'South port', density: [[0, 0.9], [0.2, 1], [0.38, 0.95], [0.55, 0.7], [0.8, 0.3], [1, 0.04]], coast: Object.assign({}, PRESETS.port.coast, { end: 0.2, dir: -1 }) });
// A beach landing: the level begins over the sea; a curving beach with obstacles and wire, the Atlantic Wall in the dunes (casemates, pillboxes,
// Tobruk pits, a trench), beach exits closed by anti-tank walls and dragon's teeth, a coastal battery with radar behind the coastal road, and
// bocage (small fields in thick hedgerows) with villages and farmsteads inland
PRESETS.beach = Object.assign({}, PRESETS.town, { label: 'Beach landing', L: 1600, density: [[0, 0], [0.2, 0.04], [0.34, 0.22], [0.55, 0.48], [0.75, 0.6], [1, 0.42]], damage: 0.35,
  coast: { mode: 'beach', dir: -1, end: 0.18, land: 0.67, amp: 12, beach: [52, 64], dune: 28, pier: [26, 40] }, oldTown: null, harbour: false, railway: false, industry: 0, bocage: true, stars: 0,
  civic: {}, cathedral: false, farms: 0.4, houses: { detached: [0.42], terraceTo: 0.75 } });
// A coastal city with only the side harbour (the sea along one side the whole way)
PRESETS.coast = Object.assign({}, PRESETS.port, { label: 'Coastal city', density: PRESETS.town.density, coast: Object.assign({}, PRESETS.port.coast, { mode: 'side' }) });
// An industrial estate: industrial quarters with wide service roads, halls, tank farms, coal yards and a power station; workers' terraces between
PRESETS.industrial = Object.assign({}, PRESETS.town, { label: 'Industrial estate', L: 1800,
  density: [[0, 0.05], [0.15, 0.4], [0.5, 0.62], [0.85, 0.58], [1, 0.3]], damage: 0.3, squares: false, cathedral: false, parishSpacing: 900,
  oldTown: null, stars: 0, civic: { gasworks: true }, railway: true, harbour: false, industry: 0.8, industryMaxU: 1, power: true });
PRESETS.rivers = Object.assign({}, PRESETS.river, { label: 'Two rivers', rivers: [PRESETS.river.river, { at: 0.86, width: 20, amp: 9, island: false, rx: 0, ry: 0, channel: 0 }] });

// ---------- deterministic randomness ----------
function h32(a, b) { let h = Math.imul((a | 0) ^ 0x7F4A7C15, 0x9E3779B1) ^ Math.imul(((b | 0) + 0x165667B1) | 0, 0x85EBCA6B); h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; h = Math.imul(h, 0x297A2D39); h ^= h >>> 15; return h >>> 0; }
// tags: one random stream per kind of decision, so changing one part of the generator does not reshuffle the others
const T = { ROAD: 1, CROSS: 2, COL: 3, LOC: 4, BLD: 5, SQ: 6, CH: 7, PARK: 8, LOT: 9, TREE: 10, DMG: 11, SLOT: 12, INT: 13, SHED: 14, CRATER: 15, ROOF: 16, QTR: 17, OLD: 18, STAR: 19, CIV: 20, HB: 21, RAIL: 22, SEA: 23 };
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function curve(pts, f) { // piecewise linear through [x, y] points
  if (f <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (f <= pts[i][0]) { const a = pts[i - 1], b = pts[i]; return a[1] + (b[1] - a[1]) * (f - a[0]) / (b[0] - a[0] || 1); }
  return pts[pts.length - 1][1];
}

// ---------- the generator ----------
function generate(opts) {
  const P = Object.assign({}, PRESETS[opts.preset || 'town'], opts.params || {});
  const seed = opts.seed | 0, W = P.W, L = P.L | 0;
  const rnd = (tag, i, j = 0) => h32(h32(seed, tag), h32(i | 0, j | 0)) / 4294967296;
  const noise1 = (tag, t) => { const i = Math.floor(t), f = t - i, a = rnd(tag, i), b = rnd(tag, i + 1); return a + (b - a) * f * f * (3 - 2 * f); };

  const N = W * L, Kr = new Uint8Array(N), Br = new Int32Array(N).fill(-1);
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()), stage = {}; let tLap = now();
  const lap = name => { if (name === 'setup') { tLap = now(); } const t = now(); stage[name] = +(t - tLap).toFixed(2); tLap = t; }; // time per stage, shown in the lab
  const plan = { v: 1, tunnels: [], seed, preset: opts.preset || 'town', W, L, P, K: Kr, B: Br, U: new Float32Array(L), D: new Float32Array(L), mx: new Float32Array(L), aw: new Float32Array(L),
    streets: [], items: [], trees: [], slots: [], craters: [], fires: [], squares: [], churches: [], parks: [], lots: [], bridges: [], boats: [], stage };

  // 0. the coast (port presets). Three forms: 'side' (the sea along one side of the strip, the harbour along its quay), 'end' (the town ends
  // at a straight quay across the strip near its far end and the sea lies beyond: a horizontal harbour) and 'corner' (both: the side coast
  // appears in the last stretch before the end quay, and its side harbour opens into the horizontal one). xs: the side coastline per row
  // (beyond the strip where there is none), wf: the side waterfront street's line; yC: the end quay's y, wfH: the end waterfront street's y.
  let CO = null;
  if (P.coast) { const c0 = P.coast, mode = c0.mode === 'mix' ? (rnd(T.SEA, 9) < 0.5 ? 'end' : 'corner') : (c0.mode || 'side');
    const cs = c0.cs || (rnd(T.SEA, 1) < 0.5 ? 1 : -1), /* cs: the side the sea lies on (+1 east), random unless given */ qx = cs > 0 ? W * c0.land : W * (1 - c0.land), ph = rnd(T.SEA, 2) * 6.283, ph2 = rnd(T.SEA, 3) * 6.283, out = cs > 0 ? W + 40 : -40;
    const hd = c0.dir || 1, yC = mode === 'side' ? null : Math.round(L * c0.end), ycol = new Float32Array(W).fill(yC === null ? NaN : yC);
    let wfH = yC === null ? (hd > 0 ? Infinity : -Infinity) : yC - hd * 34, beachD = 0, duneD = 0;
    if (mode === 'beach') { beachD = Math.round(lerp(c0.beach[0], c0.beach[1], rnd(T.SEA, 10))); duneD = c0.dune; const pb = rnd(T.SEA, 11) * 6.283, pb2 = rnd(T.SEA, 12) * 6.283; let far = hd > 0 ? 1e9 : -1e9; // a natural shoreline, gently curving
      for (let x = 0; x < W; x++) { ycol[x] = yC + c0.amp * Math.sin(x * 0.026 + pb) + 4 * Math.sin(x * 0.083 + pb2); far = hd > 0 ? Math.min(far, ycol[x]) : Math.max(far, ycol[x]); }
      wfH = Math.round(far - hd * (beachD + duneD + 6)); } // the coastal road behind the dunes // hd: +1 the sea beyond the end quay is north, -1 south
    let hy0 = null, hy1 = null, from = 0;
    if (mode === 'side') { const hl = Math.round(L * lerp(c0.harbour[0], c0.harbour[1], rnd(T.SEA, 4))); hy0 = Math.round(clamp(L * (0.5 + (rnd(T.SEA, 5) - 0.5) * 0.2) - hl / 2, 120, L - hl - 120)); hy1 = hy0 + hl; }
    if (mode === 'corner') { const hl = Math.round(L * lerp(c0.side[0], c0.side[1], rnd(T.SEA, 4))); if (hd > 0) { hy1 = yC - 2; hy0 = hy1 - hl; from = hy0 - 170; } else { hy0 = yC + 2; hy1 = hy0 + hl; from = hy1 + 170; } } // the side coast begins well before its harbour
    const xs = new Float32Array(L), wf = new Float32Array(L);
    for (let y = 0; y < L; y++) { const nat = qx + cs * (c0.amp * Math.sin(y * 0.004 + ph) + 4 * Math.sin(y * 0.013 + ph2) + 6), b = hy0 === null ? 0 : smooth(hy0 - 50, hy0 - 10, y) * (1 - smooth(hy1 + 10, hy1 + 50, y));
      const pastH = mode === 'corner' && (hd > 0 ? y > hy1 : y < hy0); let x = lerp(nat, qx, pastH ? 1 : b); if (mode === 'end' || mode === 'beach') x = out; if (mode === 'corner') x = lerp(out, x, hd > 0 ? smooth(from - 70, from, y) : 1 - smooth(from, from + 70, y)); // in a corner the coast swings in from the strip's side
      xs[y] = x; wf[y] = x - cs * lerp(16, 42, pastH ? 1 : b); } // the quayside behind a harbour is 30 px deep, the beach elsewhere 9
    CO = { mode, cs, hd, qx, xs, wf, hy0, hy1, yC, ycol, wfH, beachD, duneD, side: mode !== 'end' && mode !== 'beach' }; plan.coast = CO; }
  const past = (y, m) => !!CO && (CO.hd > 0 ? y > CO.wfH - m : y < CO.wfH + m); // beyond the end waterfront street (towards the end quay), with a margin
  const sideSea = (x, y, m) => !!CO && CO.cs * (x - CO.wf[clamp(Math.round(y), 0, L - 1)]) > -m; // beyond the side waterfront street
  const seaSide = (x, y, m) => sideSea(x, y, m) || past(y, m); // ... or beyond the end waterfront street
  const isSea = (x, y) => !!CO && (CO.cs * (x - CO.xs[clamp(Math.round(y), 0, L - 1)]) >= 0 || (CO.yC !== null && (CO.hd > 0 ? y >= CO.ycol[clamp(Math.round(x), 0, W - 1)] : y <= CO.ycol[clamp(Math.round(x), 0, W - 1)])));
  // 1. fields
  const road = P.road || CO && CO.side && { c: CO.cs > 0 ? CO.qx * 0.6 : W - (W - CO.qx) * 0.6, amp: 6 + rnd(T.ROAD, 2) * 8, fr: 0.0026 + rnd(T.ROAD, 3) * 0.0034, ph: rnd(T.ROAD, 4) * 6.283 } || { c: 82 + rnd(T.ROAD, 1) * 60, amp: 18 + rnd(T.ROAD, 2) * 26, fr: 0.0026 + rnd(T.ROAD, 3) * 0.0034, ph: rnd(T.ROAD, 4) * 6.283 };
  for (let y = 0; y < L; y++) {
    plan.U[y] = clamp(curve(P.density, y / (L - 1)), 0, 1);
    plan.D[y] = clamp(curve(P.damageCurve, y / (L - 1)) * P.damage * (0.4 + 0.6 * plan.U[y]) / 0.6, 0, 1);
    plan.mx[y] = clamp(road.c + road.amp * Math.sin(y * road.fr + road.ph) + 2.5 * Math.sin(y * 0.021 + road.ph), 34, W - 34);
    if (P.stationAt) plan.mx[y] = lerp(plan.mx[y], W / 2 + 5 * Math.sin(y * 0.011), smooth(L * P.stationAt[0] - 260, L * P.stationAt[0] - 20, y)); // room for the station either side: the road swings to the middle
    if (P.road0 != null && y < 200) plan.mx[y] = lerp(clamp(P.road0, 34, W - 34), plan.mx[y], smooth(0, 200, y)); // the game's road enters here: start where it is
    const u = plan.U[y]; plan.aw[y] = u < 0.35 ? P.widths.arterialLow : lerp(P.widths.arterialLow, P.widths.arterialHigh, smooth(0.35, 0.75, u));
  }
  const Uy = y => plan.U[clamp(y | 0, 0, L - 1)], Dy = y => plan.D[clamp(y | 0, 0, L - 1)], MX = y => plan.mx[clamp(y | 0, 0, L - 1)], AW = y => plan.aw[clamp(y | 0, 0, L - 1)];
  // urbanisation at a point: full inside the core around the main road, fading through the fray zone
  const uBase = (x, y) => { const U = Uy(y), cw = P.coreBase + P.coreGrow * Math.pow(U, 1.4), d = Math.abs(x - MX(y)); return U * clamp(1 - (d - cw) / P.fray, 0, 1); };
  // a crossroads village: a second main road crosses the strip at the densest point, and the village grows along it as well
  let XR = null;
  if (P.crossroads) { let yPk = 0; for (let y = 0; y < L; y++) if (plan.U[y] > plan.U[yPk] + 1e-6) yPk = y; yPk = clamp(yPk, 120, L - 120);
    const ph = rnd(T.STAR, 7) * 6.283, sl = (rnd(T.STAR, 8) - 0.5) * 0.16, x0 = MX(yPk);
    XR = { y: yPk, U: plan.U[yPk], yAt: x => yPk + sl * (x - x0) + 3 * (Math.sin(x * 0.028 + ph) - Math.sin(x0 * 0.028 + ph)), done: false }; plan.crossroads = XR; }
  const uAt = XR ? (x, y) => Math.max(uBase(x, y), XR.U * clamp(1 - (Math.abs(y - XR.yAt(clamp(x, 0, W - 1))) - 16) / 26, 0, 1) * (1 - 0.45 * Math.min(1, Math.abs(x - MX(XR.y)) / 110))) : uBase;
  plan.uAt = uAt;

  // raster helpers
  const idx = (x, y) => y * W + x;
  const inB = (x, y) => x >= 0 && x < W && y >= 0 && y < L;
  const free = (x, y) => inB(x, y) && Kr[idx(x, y)] === K.NONE;
  function rectFree(x0, y0, w, h, m = 0) {
    if (x0 - m < 0 || y0 - m < 0 || x0 + w + m > W || y0 + h + m > L) return false;
    for (let y = y0 - m; y < y0 + h + m; y++) { const r = y * W; for (let x = x0 - m; x < x0 + w + m; x++) if (Kr[r + x] !== K.NONE) return false; }
    return true;
  }
  function fill(x0, y0, w, h, k, id, onlyFree) {
    for (let y = Math.max(0, y0); y < Math.min(L, y0 + h); y++) { const r = y * W; for (let x = Math.max(0, x0); x < Math.min(W, x0 + w); x++) { const i = r + x; if (onlyFree && Kr[i] !== K.NONE) continue; Kr[i] = k; if (id !== undefined) Br[i] = id; } }
  }
  const addItem = it => { it.id = plan.items.length; plan.items.push(it); return it; };
  // the railway's mask: 1 ballast, 2 rail, 3 sleeper. It stays under level crossings and the train shed, so the painter can show the rails there.
  // the railway's mask: 1 ballast, 2 rail, 3 sleeper, 4 verge (the clear corridor beside the track), 5 bridge truss, 6 bridge deck
  const RM = plan.RM = new Uint8Array(N), rank = [0, 3, 5, 4, 1, 2, 3];
  function layTrack(xc, y) { const r1 = Math.round(xc - 1.5), r2 = r1 + 3;
    for (let x = r1 - 2; x <= r2 + 2; x++) { if (!inB(x, y)) continue; const i = idx(x, y), m = x === r1 || x === r2 ? 2 : (y % 3 === 0 && x >= r1 - 1 && x <= r2 + 1) ? 3 : 1;
      if (rank[m] > rank[RM[i]]) RM[i] = m; if (Kr[i] === K.NONE || Kr[i] === K.WORKS) { Kr[i] = K.RAIL; Br[i] = -1; } } }
  // a whole line, one row at a time (x per row, NaN where there is none). Rails as the game draws them: at -3 and +2 from the track's x, joined
  // across rows where the line runs on a slant; ballast and sleepers to 4 px, the corridor to 8 px; over water a deck with a truss each side
  function layLine(xs) {
    for (let y = 0; y < L; y++) { const xc = xs[y]; if (xc !== xc) continue; const xp = xs[y - 1] === xs[y - 1] && y > 0 ? xs[y - 1] : xc, xn = y < L - 1 && xs[y + 1] === xs[y + 1] ? xs[y + 1] : xc;
      const d = (xn - xp) / 2, sf = Math.sqrt(1 + d * d), rc = Math.round(xc), rp = Math.round(xp), rails = [[Math.min(rc, rp) - 3, Math.max(rc, rp) - 3], [Math.min(rc, rp) + 2, Math.max(rc, rp) + 2]];
      for (let x = Math.floor(xc - 8.6 * sf); x <= Math.ceil(xc + 8.6 * sf); x++) { if (!inB(x, y)) continue; const i = idx(x, y), dx = Math.abs(x + 0.5 - (xc + 0.5)) / sf, onRail = rails.some(r => x >= r[0] && x <= r[1]);
        const wet = Kr[i] === K.RIVER || Kr[i] === K.RBRIDGE;
        if (wet) { if (dx > 8.6) continue; const m = onRail ? 2 : dx <= 4 ? (y % 5 < 2 ? 3 : 6) : dx <= 7 ? 6 : 5; if (rank[m] >= rank[RM[i]] || Kr[i] === K.RIVER) RM[i] = m; Kr[i] = K.RBRIDGE; Br[i] = -1; continue; }
        if (dx > 8.2) continue; const m = onRail ? 2 : dx <= 4 ? (y % 5 < 2 ? 3 : 1) : 4;
        if (m === 4 && !(Kr[i] === K.NONE || Kr[i] === K.WORKS || Kr[i] === K.RAIL)) continue; // the corridor only on open ground
        if (rank[m] > rank[RM[i]]) RM[i] = m;
        if (Kr[i] === K.NONE || Kr[i] === K.WORKS || Kr[i] === K.BANK || (Kr[i] === K.QUAY && m !== 4)) { Kr[i] = K.RAIL; Br[i] = -1; } } } }
  function layTrackH(x, yc) { const r1 = Math.round(yc - 1.5), r2 = r1 + 3; // a track running along x, one column
    for (let y = r1 - 2; y <= r2 + 2; y++) { if (!inB(x, y)) continue; const i = idx(x, y), m = y === r1 || y === r2 ? 2 : (x % 3 === 0 && y >= r1 - 1 && y <= r2 + 1) ? 3 : 1;
      if (rank[m] > rank[RM[i]]) RM[i] = m; if (Kr[i] === K.NONE || Kr[i] === K.WORKS) { Kr[i] = K.RAIL; Br[i] = -1; } } }

  // the field strips' rows (heights 10 to 24 px, in groups that form field blocks): laid out first, because the lanes of the suburbs follow them
  const fRow = new Int32Array(L), fGrp = new Int32Array(L), rowEdges = [];
  { let y = 0, r = 0, g = 0, inG = 0, gLen = 3 + (rnd(T.INT, 902, 0) * 4 | 0);
    while (y < L) { const hgt = 10 + (rnd(T.INT, 901, r) * 14 | 0); for (let k = 0; k < hgt && y < L; k++, y++) { fRow[y] = r; fGrp[y] = g; } rowEdges.push(y); r++; if (++inG >= gLen) { inG = 0; g++; gLen = 3 + (rnd(T.INT, 902, g) * 4 | 0); } } }

  lap('setup');
  // 2. streets
  // a street: { cls: 'arterial' | 'collector' | 'local', axis: 'v' | 'h', tank, pts: [[x, y, w]] (v: one point per y; h: per x), y0, y1 | x0, x1, side }
  function paintV(st) { // x of the centre and width per row
    const pp = st.pts; for (let q = 0; q < pp.length; q++) { if (!pp[q][2]) continue; const [xc, y, w] = pp[q], dd = (pp[Math.min(q + 1, pp.length - 1)][0] - pp[Math.max(q - 1, 0)][0]) / Math.max(1, Math.min(q + 1, pp.length - 1) - Math.max(q - 1, 0)), sf = Math.sqrt(1 + dd * dd); // wider across a slanted row, so the street keeps its width
      const half = w / 2 * sf, car = (st.tank ? P.widths.carriage / 2 : Math.min(w / 2, 3.5)) * sf;
      for (let x = Math.floor(xc - half); x < Math.ceil(xc + half); x++) {
        if (!inB(x, y)) continue; const i = idx(x, y), cur = Kr[i], d = Math.abs(x + 0.5 - xc);
        if (cur === K.RBRIDGE) continue; // a rail bridge stays
        if (cur === K.RIVER || cur === K.BRIDGE) { Kr[i] = K.BRIDGE; Br[i] = -2 - st.id; continue; } // the deck of a bridge
        const k = d < car ? (st.tank ? K.ROAD : K.STREET) : K.WALK;
        if (cur === K.ROAD || (cur === K.STREET && k === K.WALK)) continue; Kr[i] = k; Br[i] = -2 - st.id;
      }
    }
  }
  function paintH(st) {
    const pp = st.pts; for (let q = 0; q < pp.length; q++) { const [x, yc, w] = pp[q], dd = (pp[Math.min(q + 1, pp.length - 1)][1] - pp[Math.max(q - 1, 0)][1]) / Math.max(1, Math.min(q + 1, pp.length - 1) - Math.max(q - 1, 0)), sf = Math.sqrt(1 + dd * dd);
      const half = w / 2 * sf, car = (st.tank ? P.widths.carriage / 2 : Math.min(w / 2, 3.5)) * sf;
      for (let y = Math.floor(yc - half); y < Math.ceil(yc + half); y++) {
        if (!inB(x, y)) continue; const i = idx(x, y), cur = Kr[i], d = Math.abs(y + 0.5 - yc);
        const k = d < car ? (st.tank ? K.ROAD : K.STREET) : K.WALK;
        if (cur === K.ROAD || cur === K.RBRIDGE || (cur === K.STREET && k === K.WALK)) continue; Kr[i] = k; Br[i] = -2 - st.id;
      }
    }
  }
  const addStreet = st => { st.id = plan.streets.length; plan.streets.push(st); return st; };

  // 2a. the main road, the whole length: the arterial and the tanks' main route
  { const pts = []; for (let y = 0; y < L; y++) pts.push([plan.mx[y], y, plan.aw[y]]); addStreet({ cls: 'arterial', axis: 'v', tank: true, pts, y0: 0, y1: L - 1 }); }

  // 2a0. the sea; the beach outside a harbour, the quayside ground inside one; the waterfront streets along the side shore (while in town) and
  // along the end quay (across the strip, joining the main road, which ends there)
  if (CO) { const cs = CO.cs;
    for (let y = 0; y < L; y++) { const hb = CO.hy0 !== null && y >= CO.hy0 - 30 && y <= CO.hy1 + 30;
      for (let x = 0; x < W; x++) { const i = idx(x, y); if (isSea(x, y)) { Kr[i] = K.SEA; continue; } if (CO.yC !== null && past(y, -6)) { if (CO.mode === 'beach') { Kr[i] = K.BEACH; if (Math.abs(y - CO.ycol[x]) > CO.beachD) Br[i] = -13; } else Kr[i] = K.WORKS; continue; } // the beach, then the dunes (-13)
        const d = cs * (x - CO.xs[y]), dw = cs * (x - CO.wf[y]);
        if (dw > (hb ? 7 : 6)) Kr[i] = hb && y >= CO.hy0 && y <= CO.hy1 ? K.WORKS : d > -3 && Uy(y) >= 0.55 ? K.QUAY : K.BEACH; } } // a sea wall where the town is dense
    if (CO.side) { let y0, y1; const mid = (CO.hy0 + CO.hy1) >> 1; for (y0 = mid; y0 > 0 && uAt(CO.wf[y0], y0) >= 0.2; y0--); for (y1 = mid; y1 < L - 1 && uAt(CO.wf[y1], y1) >= 0.2; y1++);
      y0 = Math.max(0, Math.min(y0, CO.hy0 - 40)); y1 = Math.min(L - 1, Math.max(y1, CO.hy1 + 40)); if (CO.yC !== null) { if (CO.hd > 0) { y0 = Math.max(y0, CO.hy0 - 120); y1 = Math.round(CO.wfH); } else { y0 = Math.round(CO.wfH); y1 = Math.min(y1, CO.hy1 + 120); } }
      const pts = []; for (let y = y0; y <= y1; y++) if (cs * (CO.wf[y] - (cs > 0 ? W - 4 : 3)) < 0) pts.push([CO.wf[y], y, P.widths.collector]);
      if (pts.length > 30) CO.street = addStreet({ cls: 'collector', axis: 'v', tank: true, pts, y0: pts[0][1], y1: pts[pts.length - 1][1], side: cs, waterfront: true }); }
    if (CO.yC !== null) { const yH = Math.round(CO.wfH), xe = CO.side ? Math.round(CO.wf[yH]) : (cs > 0 ? W - 1 : 0), xa = cs > 0 ? 0 : W - 1, pts = [];
      for (let x = Math.min(xa, xe); x <= Math.max(xa, xe); x++) pts.push([x, yH, P.widths.collector]);
      CO.endStreet = addStreet({ cls: 'collector', axis: 'h', tank: true, pts, yc: yH, side: 1, x0: pts[0][0], x1: pts[pts.length - 1][0], w: P.widths.collector, waterfront: true });
      for (const p of plan.streets[0].pts) if (past(p[1], -1)) p[2] = 0;
      if (CO.mode === 'beach') { CO.exits = []; const xm = Math.round(MX(yH)), xs2 = [xm]; for (const f of [0.18, 0.5, 0.82]) { const x = Math.round(W * f + (rnd(T.SEA, 20, f * 10) - 0.5) * 20); if (xs2.every(o => Math.abs(o - x) > 60) && x > 20 && x < W - 21) xs2.push(x); }
        for (const x of xs2.slice(0, 3)) { const yEnd = Math.round(CO.ycol[x] - CO.hd * 10), pts = []; for (let y = Math.min(yH, yEnd); y <= Math.max(yH, yEnd); y++) pts.push([x, y, 8]); // a beach exit: a road down through a gap in the dunes onto the sand
          CO.exits.push(addStreet({ cls: 'local', axis: 'v', tank: false, pts, y0: pts[0][1], y1: pts[pts.length - 1][1], side: 1, exit: true })); } } } } // the main road ends at the end quay (or the coastal road)
  // 2a'. rivers (river presets): planned before the other streets, so the town adapts to them. Water first, then quays (in town) or natural
  // banks (outside), an island's quay ring; the arterial will cross on bridges, other streets end at the riverside streets.
  const RVs = [];
  (P.rivers || (P.river ? [P.river] : [])).forEach((R0, ri) => {
    const tg = 950 + ri * 20, Y0 = Math.round(L * R0.at), ph = rnd(T.INT, tg, 1) * 6.283, yc = new Float32Array(W), hw = new Float32Array(W);
    const ix = clamp(Math.round(MX(Y0)), 70, W - 70), iy0 = Y0 + R0.amp * Math.sin(ix * 0.022 + ph), rx = Math.min(R0.rx + ((rnd(T.INT, tg, 2) * 8) | 0), Math.min(ix, W - ix) - 22), ry = R0.ry + ((rnd(T.INT, tg, 3) * 3) | 0); // the island never reaches the strip's edge
    for (let x = 0; x < W; x++) { const dx = Math.abs(x - ix), wgt = R0.island ? smooth(0, 1, clamp((rx + 36 - dx) / (36 + rx * 0.35), 0, 1)) : 0; // the river widens gently over a long stretch
      yc[x] = Y0 + R0.amp * Math.sin(x * 0.022 + ph) - (R0.island ? (iy0 - Y0) * wgt : 0); hw[x] = R0.width / 2 + (ry + R0.channel - R0.width / 2) * wgt + (uAt(x, Y0) < 0.3 ? (noise1(T.INT + ri, x * 0.2) - 0.5) * 3 : 0); }
    const iy = R0.island ? Math.round(yc[ix]) : 0, isl = (x, y) => R0.island && ((x + 0.5 - ix) / rx) ** 2 + ((y + 0.5 - iy) / ry) ** 2 < 1;
    let yMin = L, yMax = 0;
    for (let x = 0; x < W; x++) {
      const town = uAt(x, Y0) >= 0.3, top = yc[x] + hw[x], bot = yc[x] - hw[x]; yMin = Math.min(yMin, bot); yMax = Math.max(yMax, top);
      for (let y = Math.floor(bot) - 3; y <= Math.ceil(top) + 3; y++) { if (!inB(x, y)) continue; const i = idx(x, y), d = Math.max(bot - (y + 0.5), (y + 0.5) - top);
        if (isl(x, y)) continue; Kr[i] = d < 0 ? K.RIVER : d < (town ? 2 : 3) ? (town ? K.QUAY : K.BANK) : Kr[i]; }
    }
    if (R0.island) for (let y = iy - ry; y <= iy + ry; y++) for (let x = ix - rx; x <= ix + rx; x++) { if (!inB(x, y) || !isl(x, y)) continue; const e = ((x + 0.5 - ix) / (rx - 2)) ** 2 + ((y + 0.5 - iy) / (ry - 2)) ** 2; if (e >= 1) Kr[idx(x, y)] = K.QUAY; }
    RVs.push({ id: ri, Y0, yc, hw, ix, iy, rx, ry, island: !!R0.island, flow: rnd(T.INT, tg, 4) < 0.5 ? -1 : 1, yMin: yMin - 16, yMax: yMax + 16 });
  });
  const RV = RVs.find(R => R.island) || null; plan.rivers = RVs; plan.river = RVs[0] || null; // RV: the river with the old-town island
  const riverAt = y => RVs.find(R => y > R.yMin && y < R.yMax) || null; // a river band, where no cross street goes
  // 2a'''. the old town (Altstadt): an oval of narrow lanes around the market square, inside a ring boulevard where the town wall stood. It sits
  // at the densest point, or beside the river if one runs there, and the main road runs through it. Its square, town hall and big church
  // get a zone on one side of the main road that the lanes leave free.
  let OT = null;
  if (P.oldTown) { const O = P.oldTown; let yPk = 0; for (let y = 0; y < L; y++) if (plan.U[y] > plan.U[yPk] + 1e-6) yPk = y;
    const ry = Math.round(lerp(O.ry[0], O.ry[1], rnd(T.OLD, 1))), cand = [yPk]; for (const R of RVs) cand.push(Math.round(R.yMin - ry - 24), Math.round(R.yMax + ry + 24));
    if (CO && CO.hy0 !== null) cand.push(CO.hy1 + ry + 50, CO.hy0 - ry - 50, CO.hy1 + ry + 120, CO.hy0 - ry - 120); if (CO && CO.yC !== null) cand.push(Math.round(CO.wfH - CO.hd * (ry + 50)), Math.round(CO.wfH - CO.hd * (ry + 140))); // a port's old town beside the harbour, where the shore leaves more land
    for (const cy of cand) { if (OT) break; if (cy < ry + 40 || cy > L - ry - 40 || Uy(cy) < O.minU || RVs.some(R => cy + ry + 20 > R.yMin && cy - ry - 20 < R.yMax)) continue;
      for (let rx = Math.min(Math.round(lerp(O.rx[0], O.rx[1], rnd(T.OLD, 2))), (W >> 1) - 16); rx >= (O.rxMin || 54) && !OT; rx -= 6) {
        let cx = O.green ? MX(cy) : clamp(MX(cy), rx + 16, W - rx - 16); let ok = true;
        if (CO && !O.green) { const lim = CO.cs > 0 ? CO.wf[cy] - rx - O.ring / 2 - 16 : CO.wf[cy] + rx + O.ring / 2 + 16, lim2 = rx + O.ring / 2 + 27; cx = CO.cs > 0 ? clamp(cx, lim2, lim) : clamp(cx, lim, W - 1 - lim2); } // between the railway's edge and the waterfront
        if (O.green) for (let y = cy - ry; ok && y <= cy + ry; y += 4) { const t = (y - cy) / ry, hw2 = rx * (1 - t * t) + O.ring / 2; if (MX(y) - hw2 < 6 || MX(y) + hw2 > W - 7) ok = false; } // room for the lens in the strip
        else for (let y = cy - ry * 0.85; ok && y <= cy + ry * 0.85; y += 8) { const t = (y - cy) / ry; if (Math.abs(MX(y) - cx) > rx * Math.sqrt(1 - t * t) * 0.55) ok = false; } // the main road runs well inside
        if (ok && CO && (past(cy + ry + O.ring + 24, 0) || past(cy - ry - O.ring - 24, 0))) ok = false;
        if (ok && CO) for (let y = Math.max(0, cy - ry); ok && y <= Math.min(L - 1, cy + ry); y += 4) if (CO.cs * (cx + CO.cs * (rx + O.ring / 2 + 10) - CO.wf[y]) > 0) ok = false; // inland of the waterfront, a row of houses between
        if (ok && P.railway && !O.green && cx - rx - O.ring / 2 < 27 && W - 1 - (cx + rx + O.ring / 2) < 27) ok = false; // leave one edge for the railway
        if (ok) OT = { cx, cy, rx, ry, rw: O.ring, green: !!O.green };
      } }
    if (OT && !OT.green) { // the zone for the square and its buildings, on the roomier side of the main road
      const room = s => OT.rx - s * (MX(OT.cy) - OT.cx) - AW(OT.cy) / 2 - OT.rw / 2, zs = room(1) >= room(-1) ? 1 : -1, xe = MX(OT.cy) + zs * (AW(OT.cy) / 2 + 1);
      OT.zone = { s: zs, x0: Math.round(Math.min(xe, xe + zs * 54)), x1: Math.round(Math.max(xe, xe + zs * 54)), y0: OT.cy - 74, y1: OT.cy + 40 }; }
    plan.oldTown = OT; }
  // the old town is an oval round a fixed centre; a village green is a lens that the main road forks round, so its centre follows the road
  const octr = y => OT.green ? MX(y) : OT.cx;
  const ovalHalf = (y, ex) => { const t = (y - OT.cy) / (OT.ry + (OT.green ? 0 : ex)); return t * t >= 1 ? 0 : OT.green ? Math.max(0, OT.rx * (1 - t * t) + ex) : (OT.rx + ex) * Math.sqrt(1 - t * t); }; // half its width at y, grown by ex
  const inOval = (x, y, ex) => !!OT && Math.abs(x - octr(y)) < ovalHalf(y, ex);
  if (OT && OT.green) for (const p of plan.streets[0].pts) if (ovalHalf(p[1], 0) > OT.rw / 2 + 2) p[2] = 0; // the main road gives way to the green: traffic forks round it
  // the railway's side (2a''''' builds the line): the edge the old town leaves free, away from the main road's side; the harbour takes the other
  const railOK = []; // the edges a straight line could take (the old town leaves them free)
  const ySt = P.stationAt ? L * (P.stationAt[0] + Math.min(P.stationAt[1], 0.97)) / 2 : L / 2; // with a station stretch, the edge with more room there
  for (const sr of !P.railway ? [] : (P.railSide ? [P.railSide, -P.railSide] : MX(ySt) < W / 2 ? [1, -1] : [-1, 1])) { /* railSide: the edge a game's rail arrives on */ if (CO && CO.side && sr === CO.cs) continue; const xA = sr > 0 ? W - 19 : 18; let ok = true; for (let y = 0; ok && y < L; y += 3) if (OT && inOval(xA, y, OT.rw / 2 + 8)) ok = false; if (ok) railOK.push(sr); }
  let railSide = railOK[0] || 0;
  // 2a''''. the harbour district (river presets): on one bank, from the strip's edge inward, D px deep behind the quay: a basin cut into the
  // bank, warehouses, cranes, works with chimneys and a harbour railway. The riverside street on that bank bends round its land side, and
  // other streets end at it.
  let HB = null;
  if (P.harbour && RVs.length) for (const R of RVs.slice().sort((a, b) => a.island - b.island)) { const D = 52, len = 104 + ((rnd(T.HB, 1) * 26) | 0);
    for (const bank of rnd(T.HB, 2) < 0.5 ? ['N', 'S'] : ['S', 'N']) for (const [s, eo] of (P.railSide ? [[-P.railSide, 0], [P.railSide, 31], [P.railSide, 0], [-P.railSide, 31]] : [[1, 0], [-1, 0], [1, 31], [-1, 31]]).filter(([q, o]) => o ? railOK.includes(q) : !(railOK.length === 1 && railOK[0] === q))) { if (HB) continue; // the edge the railway does not need; or the railway's edge, clear of its corridor
      let mxr = -1e9, mxl = 1e9; for (let y = Math.round(R.Y0 - 90); y <= R.Y0 + 90; y += 6) { mxr = Math.max(mxr, MX(y) + AW(y) / 2); mxl = Math.min(mxl, MX(y) - AW(y) / 2); }
      let room = (s > 0 ? W - 1 - (mxr + 40) : mxl - 40) - eo; if (R.island) room = Math.min(room, (s > 0 ? W - 1 - (R.ix + R.rx + 8) : R.ix - R.rx - 8) - eo); // clear of the main road (a row of blocks between) and of the island
      const ln = Math.min(len, Math.floor(room)); if (ln < (eo ? 48 : 56)) continue; // beside the railway a narrower harbour will do
      const x0 = s > 0 ? W - eo - ln : eo, x1 = s > 0 ? W - 1 - eo : eo + ln - 1;
      const edge = x => bank === 'N' ? R.yc[x] + R.hw[x] : R.yc[x] - R.hw[x]; let lo = 1e9, hi = -1e9;
      for (let x = x0; x <= x1; x++) { const e = edge(x), f = e + (bank === 'N' ? D : -D); lo = Math.min(lo, e, f); hi = Math.max(hi, e, f); }
      if (OT && hi > OT.cy - OT.ry - 40 && lo < OT.cy + OT.ry + 40) continue;
      HB = { eo, river: R.id, bank, s, x0, x1, D, dir: bank === 'N' ? 1 : -1, yLo: Math.floor(lo), yHi: Math.ceil(hi), edge }; }
    if (HB) break; }
  plan.harbour = HB;
  if (HB && !HB.eo && railOK.length > 1) railSide = railOK.find(q => q !== HB.s); else if (HB && HB.eo) railSide = HB.s; // the railway takes the edge the harbour left
  // 2a'''''. the railway, built for the game's trains: 16 px wide, running straight north and south on rails 5 px apart, up to about 200 px long.
  // The main line runs straight along one edge of the strip for its whole length (crossing rivers on rail bridges), with an 8 px clear
  // corridor either side. At the station it gets a second platform track 22 px away (room for two trains side by side); that track leaves
  // the station as a second line that curves across the town to the other edge and runs on straight from there. plan.trainRuns lists the
  // straight stretches where trains can run.
  let RL = null, ST = null;
  (() => { if (!P.railway) return; const belt = P.oldTown && P.oldTown.belt ? P.oldTown.belt[1] : 0;
    const clearOf = (x, y, m) => x > 9 && x < W - 10 && !(CO && (CO.cs * (x - CO.xs[clamp(Math.round(y), 0, L - 1)]) > -6 || past(y, 10))) && !(OT && inOval(x, y, OT.rw / 2 + m)) /* through the green belt is fine */ && !(HB && x >= HB.x0 - m && x <= HB.x1 + m && y >= HB.yLo - m && y <= HB.yHi + m);
    for (const sr of railSide ? [railSide] : []) { if (RL) break; const xA = sr > 0 ? W - 19 : 18; let ok = true;
      const yTop = CO && CO.hd > 0 ? Math.min(L, Math.round(CO.wfH) - 12) : L, yBot = CO && CO.hd < 0 && CO.yC !== null ? Math.max(0, Math.round(CO.wfH) + 12) : 0; // in a port the line ends at a buffer stop before the end quay's street
      for (let y = yBot; ok && y < yTop; y += 3) if (!clearOf(xA, y, 8)) ok = false; // the 8 px corridor
      if (!ok) continue;
      RL = { sr, xA, lines: [] }; plan.trainRuns = [{ x: xA, y0: yBot, y1: yTop - 1, line: 'main' }];
      const cands = [], sA = P.stationAt || [0.25, 0.9]; for (let y = Math.round(L * sA[0]); y < L * sA[1]; y += 16) cands.push(y); /* stationAt: the share of the length the station may stand in */ cands.sort((a, b) => rnd(T.RAIL, a) - rnd(T.RAIL, b));
      for (const ys of cands) { if (ST) break; const U = Uy(ys); if (U < 0.5 || U > 0.97 || ys < 90 || ys > L - 110) continue;
        if (OT && Math.abs(ys - OT.cy) < OT.ry + OT.rw + 80) continue; if (CO && (past(ys + 100, 0) || past(ys - 90, 0))) continue; if (RVs.some(R => ys > R.yMin - 90 && ys < R.yMax + 100)) continue; if (HB && ys > HB.yLo - 90 && ys < HB.yHi + 100) continue;
        let room = true; for (let y = ys - 70; room && y <= ys + 90; y += 4) if (Math.abs(xA - MX(y)) - AW(y) / 2 < (P.stationRoom || 90)) room = false; // the station, its square and a row of blocks
        if (room) ST = { y: ys, sr, xL: xA, x0: Math.min(xA + sr * 10, xA - sr * 62), x1: Math.max(xA + sr * 10, xA - sr * 62), y0: ys - 70, y1: ys + 90, done: false }; }
      const lineA = new Float32Array(L).fill(xA); for (let y = 0; y < L; y++) if (y >= yTop || y < yBot) lineA[y] = NaN; RL.lines.push({ id: 'main', xs: lineA });
      if (!ST) break;
      const ys = ST.y, xP = xA - sr * 22, xE = CO && CO.hy0 !== null ? CO.qx - CO.cs * 26 : sr > 0 ? 18 : W - 19; let B = null; // in a port the branch is the harbour railway along the quayside
      for (const dir of [1, -1]) { const y0 = dir > 0 ? ST.y1 + 2 : ST.y0 - 2; let Lc = 280 + ((rnd(T.RAIL, 5) * 60) | 0);
        if (CO && CO.hy0 !== null) { const tgt = dir > 0 ? Math.max(CO.hy0 + 70, y0 + 150) : Math.min(CO.hy1 - 70, y0 - 150); Lc = (tgt - y0) * dir; if (tgt > CO.hy1 - 40 || tgt < CO.hy0 + 60 || Lc > 900) continue; } // its curve ends on the quayside
        const y1 = y0 + dir * Lc; if (y1 < 40 || y1 > L - 41) continue;
        const xs = new Float32Array(L).fill(NaN); let good = true, yEnd = dir > 0 ? L - 1 : 0;
        for (let k = 0; good && k <= Lc; k++) { const y = y0 + dir * k, x = xP + (xE - xP) * smooth(0, 1, k / Lc); if (k % 3 === 0 && (!clearOf(x, y, 10) || (riverAt(y) && Math.abs(x - MX(y)) < AW(y) / 2 + 14))) good = false; xs[y] = x; } // never across the main road over water
        if (!good) continue;
        for (let y = y1 + dir; dir > 0 ? y < L : y >= 0; y += dir) { if (!clearOf(xE, y, 10) || (CO && CO.hy0 !== null && (y < CO.hy0 + 56 || y > CO.hy1 - 4))) { yEnd = y - dir * 14; break; } xs[y] = xE; } // straight on along the far edge, to a buffer stop before anything in its way
        for (let y = yEnd + dir; dir > 0 ? y < L : y >= 0; y += dir) xs[y] = NaN;
        const cand = { id: 'branch', xs, dir, y0, y1, yEnd }; if (!B || Math.abs(yEnd - y1) > Math.abs(B.yEnd - B.y1)) B = cand; } // the direction with the longer straight run
      // the platform track: from the station's throats (where it fans out of the main line over 28 px) along the platforms, and on into the branch
      const P2 = B ? B.xs : new Float32Array(L).fill(NaN);
      for (let y = ys - 62; y <= ys + 62; y++) { const off = y < ys - 34 ? (B && B.dir < 0 ? 1 : smooth(ys - 62, ys - 34, y)) : y > ys + 34 ? (B && B.dir > 0 ? 1 : 1 - smooth(ys + 34, ys + 62, y)) : 1; P2[y] = xA - sr * 22 * off; }
      if (B) { const a = B.dir > 0 ? ys + 62 : B.y0, b = B.dir > 0 ? B.y0 : ys - 62; for (let y = Math.min(a, b); y <= Math.max(a, b); y++) P2[y] = xP; }
      RL.lines.push({ id: B ? 'branch' : 'platform', xs: P2 });
      if (B && CO && CO.hy0 !== null) plan.tunnels.push({ x: Math.round(xE), y: B.yEnd, dir: B.dir }); // in a port the harbour railway runs on into a tunnel
      if (B && Math.abs(B.yEnd - B.y1) >= 240) plan.trainRuns.push({ x: xE, y0: Math.min(B.y1, B.yEnd), y1: Math.max(B.y1, B.yEnd), line: 'branch' });
      RL.branch = B ? { dir: B.dir, y0: B.y0, y1: B.y1, yEnd: B.yEnd, xE } : null;
    } })();
  plan.railway = RL; plan.station = ST; if (!plan.trainRuns) plan.trainRuns = [];
  const railNear = (x, y, m) => !!RL && RL.lines.some(l => { const xx = l.xs[clamp(Math.round(y), 0, L - 1)]; return xx === xx && Math.abs(x - xx) < m; });
  const zones = []; if (HB) zones.push({ x0: HB.x0, x1: HB.x1, y0: HB.yLo, y1: HB.yHi }); if (ST) zones.push(ST); // ground that streets stop at
  const inZone = (x, y, m) => zones.some(z => x >= z.x0 - m && x <= z.x1 + m && y >= z.y0 - m && y <= z.y1 + m);
  // 2a''. quarters. A town grows in stretches of different age, and each stretch has its own street pattern, so the blocks are not copies of
  // each other and the seams between quarters give skewed junctions and odd-shaped blocks, as in a real town:
  //   'fields'  the suburb's lanes lie on the old field strips' edges, straight and square to the main road, and run on into the fields as farm tracks
  //   'grid'    a planned quarter: straight cross streets tilted against the main road, straight streets along it that ignore its bends
  //   'follow'  the old pattern: streets that follow the main road's bends, each cross street a little askew
  const quarters = [];
  { let y = 0, q = 0, yPk = 0; for (let yy = 0; yy < L; yy++) if (plan.U[yy] > plan.U[yPk] + 1e-6) yPk = yy; // the old core, around the market square, is never a planned grid
    while (y < L) {
      const len = Math.round(lerp(P.quarterLen[0], P.quarterLen[1], rnd(T.QTR, q))), U = Uy(y + len / 2), r = rnd(T.QTR, q, 1);
      let style = U < P.fieldLanesU ? 'fields' : r < P.gridChance ? 'grid' : 'follow';
      const iA = P.industryAt, inA = iA && (y + len / 2) / L >= iA[0] && (y + len / 2) / L <= iA[1]; // industryAt: the share of the length where every quarter is works (and nowhere else)
      if (iA ? inA && !(OT && y < OT.cy + OT.ry + 60 && y + len > OT.cy - OT.ry - 60) : P.industry && U >= 0.25 && U <= P.industryMaxU && rnd(T.QTR, q, 7) < P.industry && (P.industry >= 0.7 || Math.abs(y + len / 2 - yPk) > len / 2 + 160) && !(OT && y < OT.cy + OT.ry + 60 && y + len > OT.cy - OT.ry - 60)) style = 'industry'; // an industrial estate: wide straight service roads
      if (style === 'grid' && RVs.some(R => y < R.yMax + 30 && y + len > R.yMin - 30)) style = 'follow'; // the riverside streets set the pattern there
      if (style === 'grid' && y < yPk + 130 && y + len > yPk - 130) style = 'follow';
      if (style === 'grid' && OT && y < OT.cy + OT.ry + 60 && y + len > OT.cy - OT.ry - 60) style = 'follow';
      const slope = style === 'grid' ? (rnd(T.QTR, q, 2) < 0.5 ? -1 : 1) * lerp(P.gridTilt[0], P.gridTilt[1], Math.pow(rnd(T.QTR, q, 3), P.gridTiltBias)) : 0; // most grids lean a little, steep ones are rare
      quarters.push({ id: q, y0: y, y1: Math.min(L, y + len), style, slope, lean: (rnd(T.QTR, q, 6) - 0.5) * 0.1, scale: style === 'industry' ? 1.5 + rnd(T.QTR, q, 4) * 0.4 : lerp(P.blockScale[0], P.blockScale[1], rnd(T.QTR, q, 4)), off: 0.88 + rnd(T.QTR, q, 5) * 0.24 });
      y += len; q++;
    }
  }
  const qAt = y => { for (const q of quarters) if (y < q.y1) return q; return quarters[quarters.length - 1]; };
  plan.quarters = quarters; plan.tracks = [];
  // the y of a cross street at an x, or null if it does not reach that x
  const crossYat = (S, x) => { const i = Math.round(x) - S.pts[0][0]; return i >= 0 && i < S.pts.length ? S.pts[i][1] : null; };
  // 2b'. roundabouts (Stern): a round place on the main road with a column on a lawn in the middle; a cross street leaves it on each side and
  // diagonal avenues run out from it, as at the Grosser Stern in Berlin. Chosen first, so the cross streets make room for them.
  plan.stars = [];
  if (P.stars) { const cands = []; for (const q of quarters) cands.push(q.y0, Math.round((q.y0 + q.y1) / 2));
    cands.sort((a, b) => rnd(T.STAR, a) - rnd(T.STAR, b));
    for (const y of cands) { if (plan.stars.length >= P.stars * Math.max(1, Math.floor(L / 1800))) break;
      if (y < 80 || y > L - 80 || Uy(y) < 0.6 || past(y, 100) || (OT && Math.abs(y - OT.cy) < OT.ry + 80) || RVs.some(R => y > R.yMin - 70 && y < R.yMax + 70) || plan.stars.some(o => Math.abs(o.y - y) < 420) || (ST && y > ST.y0 - 60 && y < ST.y1 + 60) || (RL && RL.branch && y > Math.min(RL.branch.y0, RL.branch.y1) - 40 && y < Math.max(RL.branch.y0, RL.branch.y1) + 40) || (HB && y > HB.yLo - 60 && y < HB.yHi + 60)) continue;
      const x = MX(y); if (x < 44 || x > W - 44) continue;
      plan.stars.push({ x, y, ro: P.star.ro, ri: P.star.ri, k: 0.55 + rnd(T.STAR, y, 1) * 0.25, done: false }); } }
  // 2b. cross streets, across the main road; spacing shrinks with U and with the quarter's block size. Each side of the main road has its own
  // (staggered crossroads outside the centre), except in a planned grid, where they cross the main road as one straight line.
  const cross = { '-1': [], '1': [] };
(() => {   { let y = 0, n = 0;
    while (y < L && Uy(y) < P.crossMinU) y += 4;
    while (y < L - 20) {
      const star = plan.stars.find(o => !o.done && o.y < y + 30); if (star) { star.done = true; y = star.y; } // a roundabout's own cross streets
      const stn = !star && ST && !ST.done && ST.y < y + 30; if (stn) { ST.done = true; y = ST.y; } // the station street, to the station's square
      const xing = !star && !stn && XR && !XR.done && XR.y < y + 30; if (xing) { XR.done = true; y = XR.y; } // the crossing main road, right across the strip
      const U = Uy(y), Q = qAt(y);
      for (const s of [-1, 1]) {
        let yc = star ? star.y : stn ? ST.y : xing ? XR.y : y + (Q.style === 'grid' || Q.style === 'industry' ? 0 : Math.round((rnd(T.CROSS, n, s + 2) - 0.5) * P.stagger * (U < 0.75 ? 1 : 0.6))); // staggered crossroads, except in a planned grid
        if (!star && !stn && !xing && Q.style === 'fields') { let best = yc, bd = 1e9; for (const e of rowEdges) { const dd = Math.abs(e - yc); if (dd < bd) { bd = dd; best = e; } } yc = best; } // on the edge between two field strips
        if (yc < 6 || yc > L - 7 || (!star && plan.stars.some(o => Math.abs(o.y - yc) < P.crossMinGap + 4)) || (!stn && ST && Math.abs(ST.y - yc) < P.crossMinGap + 4) || (!xing && XR && Math.abs(XR.y - yc) < P.crossMinGap + 4) || past(yc, P.crossMinGap)) continue;
        let xa = MX(yc), xEdge = xa + s * AW(yc) / 2;
        if (star) { xa = star.x + s * (star.ro - 2); xEdge = star.x + s * (star.ro + 2); }
        if (OT && !star) { const dy = Math.abs(yc - OT.cy); if (dy < OT.ry + OT.rw / 2 + 16) { if (dy > OT.ry * 0.72) continue; // none across the old town: they start at the ring, and none near its ends
          xa = octr(yc) + s * ovalHalf(yc, 0); xEdge = octr(yc) + s * (ovalHalf(yc, OT.rw / 2) + 1); if (xEdge < 3 || xEdge > W - 4) continue; } }
        const slope = star || stn ? 0 : Q.style === 'grid' ? Q.slope : Q.style === 'follow' ? (rnd(T.CROSS, n, s + 11) - 0.5) * 2 * P.followSkew : 0;
        const bend = !star && !stn && Q.style === 'follow' && U < 0.8 ? (rnd(T.CROSS, n, s + 7) - 0.5) * 4 : 0;
        const line = xing ? xx => XR.yAt(clamp(xx, 0, W - 1)) : (xx, f) => yc + slope * (xx - xa) + bend * Math.sin(f * Math.PI);
        let x = xEdge, ext = 0;
        while (x > 2 && x < W - 3 && (xing || uAt(x, line(x, ext / 80)) >= P.crossEndU)) { x += s; ext++; }
        const runsOff = x <= 2 || x >= W - 3; if (runsOff) ext += 8; // reaches the edge of the strip: run off it
        if (ext < 22) continue;
        const coll = U >= 0.6 || Q.style === 'industry' || xing, w = xing ? P.crossroads.w : coll ? P.widths.collector : P.widths.local; // service roads and the crossing road take lorries and tanks
        const pts = [], xb = Math.round(clamp(xEdge + s * ext, -1, W)), xr = Math.round(xa); // from the main road's centre, so the carriageways join
        for (let xx = Math.min(xr, xb); xx <= Math.max(xr, xb); xx++) { if (xx < 0 || xx >= W) continue; const f = clamp(Math.abs(xx - xEdge) / Math.max(1, ext), 0, 1); pts.push([xx, line(xx, f), w]); }
        // inside the strip, out of the river, and never too close to the previous cross street on this side (where a tilted quarter meets a straight one)
        let clipped = false; // streets end where they meet the harbour or the station (the station street at the station's square)
        { const ord = s > 0 ? pts : pts.slice().reverse(); let k = 0; while (k < ord.length && !inZone(ord[k][0], ord[k][1], stn ? 0 : 4) && !(s === (CO && CO.cs) && seaSide(ord[k][0], ord[k][1], 0))) k++; // ... or at the waterfront street
          if (k < ord.length && CO && s === CO.cs && seaSide(ord[k][0], ord[k][1], 0) && k + 1 < ord.length) k++; // onto its carriageway
          if (k < ord.length) { clipped = true; const keep = ord.slice(0, k); pts.length = 0; for (const p of (s > 0 ? keep : keep.reverse())) pts.push(p); } }
        if (pts.length < 2 || (clipped && Math.abs(pts[s > 0 ? pts.length - 1 : 0][0] - xa) < AW(yc) / 2 + 22)) continue;
        let ok = pts.every(p => p[1] >= 6 && p[1] <= L - 7 && !riverAt(p[1]) && !past(p[1], 14));
        const prev = cross[s][cross[s].length - 1];
        if (ok && prev) for (const p of pts) { const yp = crossYat(prev, p[0]); if (yp !== null && p[1] - yp < P.crossMinGap) { if (star) { prev.dead = true; cross[s].pop(); } else ok = false; break; } } // a roundabout's street wins
        if (!ok) continue;
        const S = addStreet({ cls: coll ? 'collector' : 'local', axis: 'h', tank: coll, pts, yc, side: s, x0: pts[0][0], x1: pts[pts.length - 1][0], w, slope, quarter: Q.id, station: stn || undefined, xroad: xing || undefined });
        cross[s].push(S);
        if (Q.style === 'fields' && !runsOff && !clipped) { const tp = []; for (let xx = xb + s; xx >= 0 && xx < W; xx += s) tp.push([xx, line(xx, 1)]); if (tp.length > 12) plan.tracks.push(tp); } // on into the fields as a farm track
      }
      y += Math.max(30, lerp(P.crossSpacing[0], P.crossSpacing[1], smooth(0.15, 1, U)) * Q.scale * (Q.style === 'fields' ? 0.7 : 1) * (0.85 + 0.3 * rnd(T.CROSS, n, 9))); n++; // lanes on every few field strips
    }
  } })();
  // riverside streets: along both banks, from the main road outward while in town, joined into the cross streets so that the streets
  // parallel to the main road end on them; collectors (tank routes) where the town is dense
  for (const R of RVs) {
    for (const bank of ['S', 'N']) for (const s of [-1, 1]) {
      const U = Uy(R.Y0), coll = U >= 0.6, w = coll ? P.widths.collector : P.widths.local, hb = HB && HB.river === R.id && HB.bank === bank && HB.s === s;
      const yAt = x => { const sh = hb ? (HB.D + 3) * smooth(0, 1, s > 0 ? (x - HB.x0 + 14) / 14 : (HB.x1 + 14 - x) / 14) : 0; return bank === 'N' ? R.yc[x] + R.hw[x] + 2 + w / 2 + sh : R.yc[x] - R.hw[x] - 2 - w / 2 - sh; }; // round the harbour's land side
      const x0 = Math.round(MX(R.Y0)), pts = []; let x = x0;
      while (x >= 0 && x < W && (uAt(x, yAt(x)) >= 0.33 || (hb && pts.length > 20))) { pts.push([x, yAt(x), w]); x += s; } // it serves the harbour to the strip's edge
      if (pts.length < 24) continue; pts.sort((a, b) => a[0] - b[0]);
      const S = addStreet({ cls: coll ? 'collector' : 'local', axis: 'h', tank: coll, pts, yc: yAt(x0), side: s, x0: pts[0][0], x1: pts[pts.length - 1][0], w, quay: bank, river: R.id });
      cross[s].push(S);
    }
  }
  if (CO && CO.endStreet) for (const s of ['-1', '1']) cross[s].push(CO.endStreet); // streets along the main road end at the end quay's street
  for (const s of ['-1', '1']) cross[s].sort((a, b) => a.yc - b.yc);

  // 2c. streets along the main road between pairs of cross streets on the same side: collectors, then outer local streets.
  // A segment exists only where both cross streets reach it, so every one ends in a T-junction; some are left out so blocks vary.
  // Its line depends on the quarter: in 'follow' it keeps an offset from the main road and so follows its bends; elsewhere it is straight
  // (with a slight lean), so the main road's bends leave blocks of changing depth between them.
  function parallel(s, lineAt, cls, minU, chance, tag) {
    const list = cross[s];
    for (let k = 0; k + 1 < list.length; k++) {
      const A = list[k], Bc = list[k + 1], ym = (A.yc + Bc.yc) / 2, U = Uy(ym), overRiver = A.quay === 'S' && Bc.quay === 'N' && A.river === Bc.river, OR = overRiver ? RVs[A.river] : null, Q = qAt(ym), jog = Q.style === 'follow' ? 1 + (rnd(tag, k, s + 5) - 0.5) * 2 * P.followJog : 1, lx = y => MX(y) + (lineAt(s, y, Q) - MX(y)) * jog; // old streets jog a little at each junction
      if (overRiver && plan.bridges.some(b => b.river === OR.id)) continue; // one more street crosses each river on a bridge: a collector, or the outer street past the island
      if (!overRiver && (U < minU || rnd(tag, k, s + 3) > chance || (Q.style === 'industry' && cls === 'local'))) continue;
      const xm = lx(ym); if (xm < 8 || xm > W - 9 || uAt(xm, ym) < 0.42) continue;
      if (overRiver && OR.island && Math.abs(xm - OR.ix) < OR.rx + 16) continue; // the collector's bridge must be clear of the island
      let ya = crossYat(A, lx(A.yc)), yb = crossYat(Bc, lx(Bc.yc));
      if (ya === null || yb === null) continue;
      ya = crossYat(A, lx(ya)) ?? ya; yb = crossYat(Bc, lx(yb)) ?? yb; // where the line actually meets a tilted cross street
      const tank = (cls === 'collector' || overRiver) && U >= 0.65 && A.tank && Bc.tank, w = tank ? P.widths.collector : P.widths.local, pts = []; // a tank route must join tank routes at both ends
      const y0 = Math.round(ya), y1 = Math.round(yb);
      let ok = y1 - y0 > 12;
      for (let y = y0; ok && y <= y1; y++) { const x = lx(y); if (x < 6 || x > W - 7 || Math.abs(x - MX(y)) < AW(y) / 2 + P.minBlockDepth || inOval(x, y, OT ? OT.rw / 2 + P.minBlockDepth : 0) || inZone(x, y, 6) || railNear(x, y, 16) || sideSea(x, y, 22) || past(y, -2)) { ok = false; break; } pts.push([x, y, w]); }
      if (ok) { const S = addStreet({ cls: tank ? 'collector' : 'local', axis: 'v', tank, pts, y0, y1, side: s, off: Math.abs(xm - MX(ym)), quarter: Q.id }); if (overRiver) plan.bridges.push({ street: S.id, x: Math.round(pts[(pts.length / 2) | 0][0]), kind: 'collector', river: OR.id }); }
    }
  }
  const phC = rnd(T.COL, 1) * 6.283;
  const colOff = y => lerp(P.collectorOffset[0], P.collectorOffset[1], Uy(y)) + 6 * Math.sin(y * 0.004 + phC);
  const outGap = y => lerp(64, 50, Uy(y)) + 4 * Math.sin(y * 0.006 + phC * 2);
  const colLine = (s, y, Q) => { if (Q.style === 'follow') return MX(y) + s * colOff(y) * Q.off; const yq = clamp((Q.y0 + Q.y1) / 2, 0, L - 1); return MX(yq) + s * colOff(yq) * Q.off + Q.lean * (y - yq); };
  const outLine = (s, y, Q) => colLine(s, y, Q) + s * outGap(Q.style === 'follow' ? y : (Q.y0 + Q.y1) / 2);
  for (const s of [-1, 1]) { parallel(s, colLine, 'collector', P.collectorMinU, 1 - P.blockMergeChance, T.COL); parallel(s, outLine, 'local', P.outerLocalMinU, P.outerLocalChance, T.LOC); }

  (() => { if (OT) { // the ring boulevard, in four arcs (two along x at the ends, two along y at the sides) so each is a plain street; a tank route
    const th = Math.atan(OT.ry / OT.rx), a = OT.rx * Math.cos(th), b = OT.ry * Math.sin(th);
    if (OT.green) for (const sx of [-1, 1]) { const pts = [], y0 = OT.cy - OT.ry, y1 = OT.cy + OT.ry; for (let y = y0; y <= y1; y++) pts.push([MX(y) + sx * ovalHalf(y, 0), y, OT.rw]); // the green's two lanes leave the main road and meet it again
      addStreet({ cls: 'ring', axis: 'v', tank: true, pts, y0, y1, side: sx }); }
    else for (const sy of [-1, 1]) { const pts = []; for (let x = Math.floor(OT.cx - a - 3); x <= Math.ceil(OT.cx + a + 3); x++) { const t = (x - OT.cx) / OT.rx; if (t * t < 1) pts.push([x, OT.cy + sy * OT.ry * Math.sqrt(1 - t * t), OT.rw]); }
      addStreet({ cls: 'ring', axis: 'h', tank: true, pts, yc: OT.cy + sy * OT.ry, side: sy, x0: pts[0][0], x1: pts[pts.length - 1][0], w: OT.rw }); }
    if (!OT.green) for (const sx of [-1, 1]) { const pts = [], y0 = Math.floor(OT.cy - b - 3), y1 = Math.ceil(OT.cy + b + 3); for (let y = y0; y <= y1; y++) { const t = (y - OT.cy) / OT.ry; pts.push([OT.cx + sx * OT.rx * Math.sqrt(Math.max(0, 1 - t * t)), y, OT.rw]); }
      addStreet({ cls: 'ring', axis: 'v', tank: true, pts, y0, y1, side: sx }); }
    // the old town's lanes: narrow and winding, from the main road out to the ring, a few joined by lanes along the main road; none in the zone
    const Z = OT.zone, lanes = { '-1': [], '1': [] }; let y = OT.cy - OT.ry + OT.rw + 6 + rnd(T.OLD, 3) * 8, n = 0;
    while (!OT.green && y < OT.cy + OT.ry - OT.rw - 6) {
      for (const s of [-1, 1]) {
        const yc = Math.round(y + (rnd(T.OLD, n, s + 5) - 0.5) * 9); if (s === Z.s && yc > Z.y0 - 5 && yc < Z.y1 + 5) continue;
        const xa = MX(yc), slope = (rnd(T.OLD, n, s + 7) - 0.5) * 0.36, amp = 1.2 + rnd(T.OLD, n, s + 9) * 2.4, ph = rnd(T.OLD, n, s + 11) * 6.283;
        const line = xx => yc + slope * (xx - xa) + amp * (Math.sin((xx - xa) * 0.085 + ph) - Math.sin(ph));
        const pts = []; for (let xx = Math.round(xa); xx > 1 && xx < W - 2; xx += s) { const yy = line(xx); pts.push([xx, yy, P.oldTown.lane]); if (!inOval(xx, yy, 0)) break; } // ends on the ring's carriageway
        if (Math.abs(pts[pts.length - 1][0] - xa) - AW(yc) / 2 < 16) continue;
        pts.sort((p1, p2) => p1[0] - p2[0]);
        const prev = lanes[s][lanes[s].length - 1]; let ok = true;
        if (prev) for (const p of pts) { const yp = crossYat(prev, p[0]); if (yp !== null && p[1] - yp < 17) { ok = false; break; } }
        if (!ok) continue;
        lanes[s].push(addStreet({ cls: 'local', axis: 'h', tank: false, pts, yc, side: s, x0: pts[0][0], x1: pts[pts.length - 1][0], w: P.oldTown.lane, old: true }));
      }
      y += 17 + rnd(T.OLD, n, 13) * 12; n++;
    }
    for (const s of [-1, 1]) for (let k = 0; k + 1 < lanes[s].length; k++) { // lanes along the main road, between two lanes, winding a little
      const A = lanes[s][k], Bc = lanes[s][k + 1], ym = (A.yc + Bc.yc) / 2; if (rnd(T.OLD, k, s + 20) > 0.85) continue;
      const xe = MX(ym) + s * AW(ym) / 2, xr = octr(ym) + s * ovalHalf(ym, -OT.rw / 2); if ((xr - xe) * s < 40) continue;
      const xm = (xe + xr) / 2 + (rnd(T.OLD, k, s + 22) - 0.5) * 10, ph = rnd(T.OLD, k, s + 24) * 6.283, lx = yy => xm + 2.2 * Math.sin(yy * 0.11 + ph);
      if (s === Z.s && xm > Z.x0 - 6 && xm < Z.x1 + 6 && Bc.yc > Z.y0 - 6 && A.yc < Z.y1 + 6) continue;
      let ya = crossYat(A, xm), yb = crossYat(Bc, xm); if (ya === null || yb === null) continue; ya = Math.round(crossYat(A, lx(ya)) ?? ya); yb = Math.round(crossYat(Bc, lx(yb)) ?? yb);
      if (yb - ya < 14) continue; const pts = []; for (let yy = ya; yy <= yb; yy++) pts.push([lx(yy), yy, P.oldTown.lane]);
      addStreet({ cls: 'local', axis: 'v', tank: false, pts, y0: ya, y1: yb, side: s, old: true });
    }
  } })();
  for (const st of plan.stars) if (P.star.rays) for (const sx of [-1, 1]) for (const sy of [-1, 1]) { // diagonal avenues out of the roundabout
    const pts = []; for (let x = Math.round(st.x + sx * st.ro * 0.6); x > 1 && x < W - 2; x += sx) { const y = st.y + sy * st.k * Math.abs(x - st.x);
      if (y < 6 || y > L - 7 || riverAt(y) || inOval(x, y, OT ? OT.rw : 0) || uAt(x, y) < P.crossEndU || seaSide(x, y, 8)) break; pts.push([x, y, 8]); }
    if (pts.length < 26) continue; pts.sort((p1, p2) => p1[0] - p2[0]);
    addStreet({ cls: 'local', axis: 'h', tank: false, pts, yc: st.y, side: sx, x0: pts[0][0], x1: pts[pts.length - 1][0], w: 8, ray: true, slope: sy * sx * st.k });
  }
  (() => { if (RL) for (const l of RL.lines) layLine(l.xs); })(); // every line with its corridor, and rail bridges over the water
  for (const st of plan.streets) if (!st.dead) (st.axis === 'v' ? paintV : paintH)(st);
  for (const st of plan.stars) { // the roundabout: a carriageway ring round a lawn with a column, a pavement outside
    for (let y = Math.floor(st.y - st.ro - 3); y <= st.y + st.ro + 3; y++) for (let x = Math.floor(st.x - st.ro - 3); x <= st.x + st.ro + 3; x++) { if (!inB(x, y)) continue;
      const r = Math.hypot(x + 0.5 - st.x, y + 0.5 - st.y), i = idx(x, y);
      if (r < st.ri) { Kr[i] = K.PLAZA; Br[i] = -4; } else if (r < st.ro) { Kr[i] = K.ROAD; Br[i] = -2; } else if (r < st.ro + 2.5 && Kr[i] !== K.ROAD && Kr[i] !== K.STREET) { Kr[i] = K.WALK; Br[i] = -2; } }
    const it = addItem({ t: 'monument', label: 'Victory column', round: true, x0: Math.floor(st.x - 3), y0: Math.floor(st.y - 3), w: 6, h: 6, acx: st.x, acy: st.y, r: 2.6, seed: h32(seed, 31000 + st.y), dmg: 0 });
    for (let y = it.y0; y < it.y0 + it.h; y++) for (let x = it.x0; x < it.x0 + it.w; x++) if (Math.hypot(x + 0.5 - st.x, y + 0.5 - st.y) < it.r) { Kr[idx(x, y)] = K.BLDG; Br[idx(x, y)] = it.id; }
  }
  (() => { if (OT) { // the green belt where the wall stood: a strip of park outside the ring along some of its length
    const bw = Math.round(lerp(P.oldTown.belt[0], P.oldTown.belt[1], rnd(T.OLD, 40))), a0 = rnd(T.OLD, 41) * 6.283, arcs = [[a0, a0 + 1.4 + rnd(T.OLD, 42)], [a0 + 3.1, a0 + 4.2 + rnd(T.OLD, 43)]];
    OT.belt = bw; OT.arcs = arcs;
    for (let y = Math.floor(OT.cy - OT.ry - OT.rw - bw); y <= OT.cy + OT.ry + OT.rw + bw; y++) for (let x = 0; x < W; x++) { if (!inB(x, y) || Kr[idx(x, y)] !== K.NONE) continue;
      if (inOval(x, y, OT.rw / 2) || !inOval(x, y, OT.rw / 2 + bw)) continue;
      let an = Math.atan2((y - OT.cy) / OT.ry, (x - OT.cx) / OT.rx); if (an < 0) an += 6.283;
      if (arcs.some(([p, q]) => (an >= p && an <= q) || (an + 6.283 >= p && an + 6.283 <= q))) { Kr[idx(x, y)] = K.PARK; Br[idx(x, y)] = -3; } }
  } })();
  for (const tp of plan.tracks) for (const [x, yc] of tp) for (let y = Math.round(yc) - 1; y <= Math.round(yc) + 1; y++) if (free(x, y)) Kr[idx(x, y)] = K.TRACK; // farm tracks: 3 px of dirt
  if (RVs.length) { // the main road's bridges: each run of deck under it
    let run = null; for (let y = 0; y < L; y++) { const x = Math.round(plan.mx[y]), b = Kr[idx(x, y)] === K.BRIDGE;
      if (b && !run) run = { y0: y, x }; if (!b && run) { plan.bridges.push({ street: 0, x: run.x, y0: run.y0, y1: y - 1, kind: 'arterial', river: (riverAt(run.y0) || RVs[0]).id }); run = null; } }
    for (const b of plan.bridges) if (b.y0 === undefined) { const st = plan.streets[b.street]; let y0 = null, y1 = null; for (const [x, y] of st.pts) if (Kr[idx(Math.round(x), y)] === K.BRIDGE) { if (y0 === null) y0 = y; y1 = y; } b.y0 = y0; b.y1 = y1; }
  }

  lap('streets');
  // 3. landmarks
  // 3a. the market square: at the densest point, on the wider side of the main road, its south edge on a cross street
  let peakY = 0; for (let y = 0; y < L; y++) if (plan.U[y] > plan.U[peakY] + 1e-6) peakY = y;
  // a public building around one or two courtyards: wings of thickness t on all sides (and a middle wing when long enough), with a tower or a
  // dome over the entrance on its front side. All its parts share a group, so their roofs and checks belong together.
  let grpN = 0;
  function hall(x0, y0, w, h, front, o) {
    if (!rectFree(x0, y0, w, h, 0)) return null;
    const g = ++grpN, t = o.thick || 7, run = -60000 - g, alongY = front === 'W' || front === 'E', parts = [];
    const mk = (x, y, ww, hh, ori, part) => { const it = addItem({ t: 'civic', label: o.label, part, x0: x, y0: y, w: ww, h: hh, ori, front, style: o.style || 'hip', roof: o.roof, seed: h32(seed, 40000 + g * 16 + parts.length), dmg: 0, run, group: g }); fill(x, y, ww, hh, K.BLDG, it.id); parts.push(it); return it; };
    fill(x0 + t, y0 + t, w - 2 * t, h - 2 * t, K.COURT, -1);
    if (!alongY) { mk(x0, y0, w, t, 'h', 'wing'); mk(x0, y0 + h - t, w, t, 'h', 'wing'); mk(x0, y0 + t, t, h - 2 * t, 'v', 'wing'); mk(x0 + w - t, y0 + t, t, h - 2 * t, 'v', 'wing'); if (o.middle && w >= 40) mk(x0 + (w >> 1) - (t >> 1), y0 + t, t, h - 2 * t, 'v', 'wing'); }
    else { mk(x0, y0, t, h, 'v', 'wing'); mk(x0 + w - t, y0, t, h, 'v', 'wing'); mk(x0 + t, y0, w - 2 * t, t, 'h', 'wing'); mk(x0 + t, y0 + h - t, w - 2 * t, t, 'h', 'wing'); if (o.middle && h >= 40) mk(x0 + t, y0 + (h >> 1) - (t >> 1), w - 2 * t, t, 'h', 'wing'); }
    const fx = front === 'W' ? x0 + t / 2 : front === 'E' ? x0 + w - t / 2 : x0 + w / 2, fy = front === 'S' ? y0 + t / 2 : front === 'N' ? y0 + h - t / 2 : y0 + h / 2;
    if (o.tower) mk(Math.round(fx - 3), Math.round(fy - 3), 6, 6, 'v', 'tower');
    if (o.dome) { const r = o.dome, it = addItem({ t: 'civic', label: o.label, part: 'dome', round: true, x0: Math.floor(fx - r), y0: Math.floor(fy - r), w: 2 * r + 2, h: 2 * r + 2, acx: fx, acy: fy, r, roof: 5, seed: h32(seed, 40000 + g * 16 + 15), dmg: 0, group: g });
      for (let y = it.y0; y < it.y0 + it.h; y++) for (let x = it.x0; x < it.x0 + it.w; x++) if (inB(x, y) && Math.hypot(x + 0.5 - fx, y + 0.5 - fy) < r) { Kr[idx(x, y)] = K.BLDG; Br[idx(x, y)] = it.id; } parts.push(it); }
    plan.civic.push({ label: o.label, x0, y0, w, h, group: g }); return { g, parts, fx, fy };
  }
  function roundBuilding(cx, cy, r, o) { // a round building (a domed hall, a gasometer), its pixels inside the circle
    const it = addItem(Object.assign({ round: true, x0: Math.floor(cx - r), y0: Math.floor(cy - r), w: 2 * r + 2, h: 2 * r + 2, acx: cx, acy: cy, r, dmg: 0, seed: h32(seed, 45000 + plan.items.length) }, o));
    for (let y = it.y0; y < it.y0 + it.h; y++) for (let x = it.x0; x < it.x0 + it.w; x++) if (inB(x, y) && Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < r) { Kr[idx(x, y)] = K.BLDG; Br[idx(x, y)] = it.id; }
    return it;
  }
  plan.civic = []; plan.works = []; plan.farms = []; plan.heaps = []; plan.steam = [];
  const isInd = y => qAt(y).style === 'industry';
  const civ = P.civic || {};
  const rectIs = (x0, y0, w, h, k) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (!inB(x, y) || Kr[idx(x, y)] !== k) return false; return true; };
  // 3a''. the harbour district: a works yard behind a quay wall, a basin cut into the bank with a quay round it, warehouses along the basin,
  // cranes on the quays, a works hall with a sawtooth roof and a chimney, and a harbour railway along the land side
  plan.basins = []; plan.cranes = []; plan.stacks = [];
  (() => { if (HB) { const dir = HB.dir, e = HB.edge;
    for (let x = HB.x0; x <= HB.x1; x++) { const eq = e(x); for (let k = -3; k <= HB.D; k++) { const y = Math.round(eq + dir * k); if (!inB(x, y)) continue; const i = idx(x, y); if (Kr[i] === K.BANK) Kr[i] = K.QUAY; else if (Kr[i] === K.NONE) { Kr[i] = K.WORKS; Br[i] = -1; } } }
    const bw = 20, bd = 32, bx = clamp(Math.round((HB.x0 + HB.x1) / 2 + (rnd(T.HB, 3) - 0.5) * 16 - bw / 2), HB.x0 + 20, HB.x1 - bw - 20);
    let mouth = dir > 0 ? 1e9 : -1e9; for (let x = bx - 2; x < bx + bw + 2; x++) mouth = dir > 0 ? Math.min(mouth, e(x)) : Math.max(mouth, e(x));
    const yE = Math.round(mouth) + dir * bd;
    for (let x = bx - 2; x < bx + bw + 2; x++) for (let y = Math.round(e(x)) - dir; dir > 0 ? y <= yE + 2 : y >= yE - 2; y += dir) { if (!inB(x, y)) continue; const i = idx(x, y);
      Kr[i] = (x < bx || x >= bx + bw || (dir > 0 ? y > yE : y < yE)) ? K.QUAY : K.RIVER; Br[i] = -1; }
    const bs = { x0: bx, x1: bx + bw - 1, ya: Math.min(Math.round(mouth), yE), yb: Math.max(Math.round(mouth), yE), dir }; plan.basins.push(bs);
    for (const [wx, sd] of [[bx - 17, -1], [bx + bw + 5, 1]]) { let ee = dir > 0 ? -1e9 : 1e9; for (let x = wx; x < wx + 12; x++) ee = dir > 0 ? Math.max(ee, e(x)) : Math.min(ee, e(x));
      const wy = dir > 0 ? Math.ceil(ee) + 4 : Math.floor(ee) - 4 - 30; if (!rectIs(wx, wy, 12, 30, K.WORKS)) continue;
      const it = addItem({ t: 'works', label: 'Warehouse', x0: wx, y0: wy, w: 12, h: 30, ori: 'v', style: rnd(T.HB, wx) < 0.3 ? 'flat' : 'gable', roof: rnd(T.HB, wx, 1) < 0.5 ? 1 : 3, seed: h32(seed, 52000 + wx), dmg: 0 }); fill(wx, wy, 12, 30, K.BLDG, it.id);
      plan.cranes.push({ x: sd < 0 ? bx - 3 : bx + bw + 2, y: Math.round(mouth) + dir * (6 + (sd > 0 ? 12 : 0)), dx: -sd, dy: dir * 0.35 }); } // cranes swing their jibs over the basin
    { const far = (HB.x1 - (bx + bw)) > (bx - HB.x0) ? [bx + bw + 20, HB.x1 - 3] : [HB.x0 + 3, bx - 20], hw = Math.min(28, far[1] - far[0] - 2), hx = Math.round(far[0] + (far[1] - far[0] - hw) / 2);
      if (hw >= 16) { let ee = dir > 0 ? -1e9 : 1e9; for (let x = hx; x < hx + hw; x++) ee = dir > 0 ? Math.max(ee, e(x)) : Math.min(ee, e(x));
        const hy = dir > 0 ? Math.ceil(ee) + 9 : Math.floor(ee) - 9 - 18;
        if (rectIs(hx, hy, hw, 18, K.WORKS)) { const it = addItem({ t: 'works', label: 'Works', x0: hx, y0: hy, w: hw, h: 18, ori: 'h', style: 'saw', roof: 3, seed: h32(seed, 53000), dmg: 0 }); fill(hx, hy, hw, 18, K.BLDG, it.id);
          const cx = hx + hw - 4, cy = dir > 0 ? hy + 18 + 5 : hy - 5; if (rectIs(cx - 3, cy - 3, 6, 6, K.WORKS)) { roundBuilding(cx, cy, 2.7, { t: 'works', label: 'Chimney', part: 'chimney' }); plan.stacks.push({ x: cx, y: cy }); }
          plan.cranes.push({ x: Math.round(hx + hw / 2), y: Math.round(ee) + dir * 3, dx: 0.3, dy: -dir }); } } } // a crane on the river quay, its jib over the river
    for (let x = HB.x0; x <= HB.x1; x++) { if (x >= bx - 3 && x <= bx + bw + 2) continue; const y = e(x) + dir * (HB.D - 6); if (inB(x, Math.round(y)) && (Kr[idx(x, Math.round(y))] === K.WORKS || Kr[idx(x, Math.round(y))] === K.RAIL)) layTrackH(x, y); } // the harbour railway along the land side
  } })();
  // 3a0. the port, with room for the game's warships, which sail straight north or south on the water: a destroyer is 28 px wide and 80 long,
  // a submarine 12 by 46, the flagship (the battleship boss) 80 by 232 in the middle of the strip. Every harbour keeps a straight fairway
  // 40 px wide clear from its quay out to the open sea (plan.shipLanes), and beyond the end breakwater a fleet area of at least 96 by 240 px
  // stays open (plan.fleetArea). The end harbour (horizontal, the sea north or south of the quay): finger piers out from the quay with ships
  // moored along them, a channel at least 28 px wide beyond their heads, a breakwater across with a 40 px entrance (on the fairway) between two
  // lighthouses; the U-boat bunker at the land-side end, a shipyard at the other ('end' form); warehouses, cranes and the harbour railway on the
  // quayside. The side harbour: short piers, a channel 36 px wide between their heads and the breakwater (the fairway: a destroyer passes),
  // open at its far end; in the 'side' form with its own bunker, shipyard and lighthouses, in the 'corner' form opening into the end harbour.
  plan.ships = []; plan.gantries = []; plan.shipLanes = []; plan.fleetArea = null;
  (() => { if (!CO) return; const cs = CO.cs, hd = CO.hd, mw = 5, CH = 28, CS = P.coast.sideChannel || 41, FW = 40, kinds = ['freighter', 'freighter', 'tanker', 'coaster'];
    const fillR = (x0, x1, y0, y1, k, br, only) => { for (let y = Math.round(Math.min(y0, y1)); y <= Math.max(y0, y1); y++) for (let x = Math.round(Math.min(x0, x1)); x <= Math.max(x0, x1); x++) { if (!inB(x, y)) continue; const i = idx(x, y); if (only && !only.includes(Kr[i])) continue; Kr[i] = k; Br[i] = br; } };
    const bunker = (x0, y0, w, h) => addItem({ t: 'works', label: 'U-boat bunker', part: 'bunker', x0, y0, w, h, ori: 'v', style: 'flat', roof: 3, seed: h32(seed, 64000 + x0 + y0), dmg: 0 });
    const port = { piers: 0 }, seaWs = cs > 0 ? W - CO.qx : CO.qx, PLs = Math.max(20, Math.min(P.coast.pier[1], Math.floor(seaWs - CS - mw - 6))), sideLaneX = CO.side ? CO.qx + cs * (PLs + 17) : null; // the side fairway: 30 px of the channel next to the pier heads (a destroyer is 28)
    let yM = null;
    // the end harbour
    if (CO.yC !== null && CO.mode !== 'beach') { const yQ = CO.yC, PLh = 40 + ((rnd(T.SEA, 6) * 10) | 0), Y = d => yQ + hd * d; yM = Y(PLh + CH); // Y: d px from the quay out to sea
      const xLand = cs > 0 ? 0 : W - 1, xMoleEnd = CO.side ? CO.qx + cs * (PLs + CS) : (cs > 0 ? W - 1 : 0), XA = d => xLand + cs * d, span = Math.abs(xMoleEnd - xLand);
      // the fairway: on the side channel in a corner harbour (ships sail straight on), otherwise somewhere along the quay clear of the bunker
      const fx = CO.side ? Math.round(sideLaneX) : Math.round(XA(74)), gx0 = fx - FW / 2, gx1 = fx + FW / 2 - 1; // in the 'end' form right beside the bunker, the piers beyond
      fillR(xLand, xMoleEnd, yM, Y(PLh + CH + mw - 1), K.QUAY, -11, [K.SEA]); fillR(gx0, gx1, yM, Y(PLh + CH + mw - 1), K.SEA, -10);
      for (let y = Math.min(yQ, yM); y <= Math.max(yQ, yM); y++) for (let x = 0; x < W; x++) if (Kr[idx(x, y)] === K.SEA && (x - xMoleEnd) * cs <= 0) Br[idx(x, y)] = -10; // calm water in the harbour
      roundBuilding(gx0 - 3, Y(PLh + CH + 2), 3, { t: 'works', label: 'Lighthouse', part: 'lighthouse', red: true }); roundBuilding(gx1 + 4, Y(PLh + CH + 2), 3, { t: 'works', label: 'Lighthouse', part: 'lighthouse', red: false });
      port.mole = [{ x: gx0 - 10, y: Y(PLh + CH + 2) }, { x: gx1 + 10, y: Y(PLh + CH + 2) }];
      const laneFree = (xa, xb) => Math.max(xa, xb) < gx0 - 4 || Math.min(xa, xb) > gx1 + 4; // keep piers and their ships off the fairway
      // the U-boat bunker at the land-side end, astride the quay, its four pens open to the sea
      { const bx0 = Math.round(Math.min(XA(4), XA(50))), by0 = Math.round(Math.min(Y(-16), Y(25))), it = bunker(bx0, by0, 47, 42);
        for (let y = it.y0; y < it.y0 + it.h; y++) for (let x = bx0; x < bx0 + it.w; x++) { const k = Math.floor((x - bx0 - 4) / 11), pen = (y - yQ) * hd > 14 && k >= 0 && k < 4 && (x - bx0 - 4) % 11 < 7; if (pen) { Kr[idx(x, y)] = K.SEA; Br[idx(x, y)] = -10; } else { Kr[idx(x, y)] = K.BLDG; Br[idx(x, y)] = it.id; } }
      }
      // piers out from the quay, ships along them
      const piers = []; for (let d = CO.side ? 62 : 120; d < span - (CO.side ? 30 : 46); d += 38) { const px = Math.round(XA(d)); if (laneFree(px - 19, px + 18)) piers.push(d); }
      piers.forEach((d, k) => { const px = Math.round(XA(d)); fillR(px - 7, px + 6, yQ, Y(PLh), K.WORKS, -1, [K.SEA]);
        for (let q = 0; q <= PLh; q++) for (const x of [px - 7, px + 6]) if (inB(x, Y(q))) Kr[idx(x, Y(q))] = K.QUAY; fillR(px - 7, px + 6, Y(PLh), Y(PLh), K.QUAY, -1);
        const it = addItem({ t: 'works', label: 'Pier shed', x0: px - 3, y0: Math.round(Math.min(Y(4), Y(PLh - 5))), w: 7, h: PLh - 9, ori: 'v', style: rnd(T.SEA, px, 1) < 0.5 ? 'gable' : 'flat', roof: rnd(T.SEA, px, 2) < 0.5 ? 1 : 3, seed: h32(seed, 65000 + k), dmg: 0 }); fill(it.x0, it.y0, it.w, it.h, K.BLDG, it.id);
        for (const q of [8, 22, 36]) { plan.cranes.push({ x: px - 6, y: Y(q), dx: -1, dy: 0.3 * hd }); plan.cranes.push({ x: px + 5, y: Y(q + 5), dx: 1, dy: 0.3 * hd }); }
        for (const [x0, sd] of [[px + 8, 1], [px - 18, -1]]) { if (rnd(T.SEA, px, sd + 5) < 0.2 || (sd < 0 && k === 0 && d - 50 < 26)) continue; const len = Math.min(PLh - 2, 30 + ((rnd(T.SEA, px, sd + 7) * 10) | 0));
          plan.ships.push({ kind: kinds[(rnd(T.SEA, px, sd + 9) * 4) | 0], ori: 'v', bow: hd, x0, y0: Math.round(Math.min(Y(2), Y(1 + len))), w: 10, h: len, dmg: rnd(T.SEA, px, sd + 11) < Dy(yQ) * 0.5 }); } });
      port.piers += piers.length;
      { const sx = Math.round(Math.min(XA(span * 0.3), XA(span * 0.3 + 34))); if (laneFree(sx, sx + 34)) plan.ships.push({ kind: 'freighter', ori: 'h', bow: -cs, x0: sx, y0: Math.round(Y(PLh + CH / 2)) - 5, w: 34, h: 10 }); } // a ship under way in the channel, off the fairway
      if (!CO.side) { for (let q = 0; q < 2; q++) { const sx = Math.round(XA(span - 44 + q * 16)); if (!laneFree(sx, sx + 9)) continue; fillR(sx, sx + 9, Y(-12), Y(38), K.QUAY, -12, [K.SEA, K.WORKS]); plan.ships.push({ kind: 'hull', ori: 'v', bow: hd, x0: sx, y0: Math.round(Math.min(Y(-6), Y(33))), w: 9, h: 40 }); }
        for (const q of [2, 26]) plan.gantries.push({ h: true, y: Y(q), x0: Math.round(Math.min(XA(span - 46), XA(span - 14))), x1: Math.round(Math.max(XA(span - 46), XA(span - 14))) }); }
      for (let d = 56; d < span - 8; d += 22) plan.cranes.push({ x: Math.round(XA(d)), y: Y(-3), dx: 0.25, dy: hd });
      const wy0 = hd > 0 ? yQ - 16 : yQ + 5;
      for (let d = 56; d + 30 < span; ) { const len = 28 + ((rnd(T.SEA, d, 3) * 10) | 0), x0 = Math.round(Math.min(XA(d), XA(d + len - 1))); if (rectIs(x0, wy0, len, 12, K.WORKS)) { const it = addItem({ t: 'works', label: 'Warehouse', x0, y0: wy0, w: len, h: 12, ori: 'h', style: rnd(T.SEA, d, 4) < 0.4 ? 'flat' : 'gable', roof: rnd(T.SEA, d, 5) < 0.5 ? 1 : 3, seed: h32(seed, 67000 + d), dmg: 0 }); fill(x0, wy0, len, 12, K.BLDG, it.id); } d += len + 4; }
      for (let x = 0; x < W; x++) { const y = Y(-24); if (inB(x, y) && (Kr[idx(x, y)] === K.WORKS || Kr[idx(x, y)] === K.RAIL)) layTrackH(x, y); }
      // the fairway from the quay out through the entrance to the strip's end, and the fleet area beyond the breakwater (no ship at anchor in it)
      plan.shipLanes.push({ x: fx, w: FW, y0: Math.min(Y(4), hd > 0 ? L - 1 : 0), y1: Math.max(Y(4), hd > 0 ? L - 1 : 0), kind: 'fairway' });
      const fa0 = Y(PLh + CH + mw + 6), fa1 = hd > 0 ? L - 1 : 0; if (Math.abs(fa1 - fa0) >= 240) plan.fleetArea = { x0: 64, x1: 159, y0: Math.min(fa0, fa1), y1: Math.max(fa0, fa1) };
      for (const x0 of [cs > 0 ? 6 : W - 16, cs > 0 ? W - 16 : 6]) if (rnd(T.SEA, x0) < 0.8) { const ya = Y(PLh + CH + mw + 20 + ((rnd(T.SEA, x0, 2) * 40) | 0)); if (ya > 0 && ya < L - 42) plan.ships.push({ kind: rnd(T.SEA, x0, 1) < 0.6 ? 'freighter' : 'tanker', ori: 'v', bow: hd, x0, y0: Math.min(ya, ya + hd * 40), w: 10, h: 40 }); } // at anchor, at the edges
      port.yM = yM; }
    // the side harbour
    if (CO.side && CO.hy0 !== null) { const qx = CO.qx, hy0 = CO.hy0, hy1 = CO.hy1, X = d => qx + cs * d, corner = CO.mode === 'corner', PL = PLs, moleD = PL + CS;
      // its closed end: the end away from the end harbour (the near end in the 'side' form); the breakwater runs from there to its head, or to the end breakwater
      const yClosed = corner ? (hd > 0 ? hy0 - 16 : hy1 + 16) : hy0 - 16, yHead = corner ? yM : hy1 - 34, yOpen = hy1 + 16;
      const open = !!P.coast.openSide; // openSide: no breakwater round the side harbour; its water runs out to the edge (room for the game's warships)
      if (!open) { fillR(X(-40), X(moleD + mw - 1), yClosed - 2, yClosed + 2, K.QUAY, -11, [K.SEA, K.BEACH]); fillR(X(moleD), X(moleD + mw - 1), Math.min(yClosed, yHead), Math.max(yClosed, yHead), K.QUAY, -11, [K.SEA]); }
      if (!corner && !open) fillR(X(-40), X(PL - 2), yOpen - 2, yOpen + 2, K.QUAY, -11, [K.SEA, K.BEACH]); // the far arm covers the pier heads only: the channel stays open
      for (let y = Math.min(yClosed, yHead) + 3; y <= Math.max(yClosed, corner ? yHead : yOpen - 3); y++) for (let x = 0; x < W; x++) { const d = cs * (x - qx); if (d >= 0 && (open || d < moleD) && Kr[idx(x, y)] === K.SEA) Br[idx(x, y)] = -10; }
      if (!corner && !open) { roundBuilding(X(moleD + mw / 2), yHead, 3.2, { t: 'works', label: 'Lighthouse', part: 'lighthouse', red: true }); roundBuilding(X(PL - 3), yOpen, 2.8, { t: 'works', label: 'Lighthouse', part: 'lighthouse', red: false }); port.mole = [{ x: Math.round(X(moleD + 2)), y: yHead - 12 }, { x: Math.round(X(PL - 12)), y: yOpen }]; }
      let pStart = hy0 + 30, pEnd = corner ? hy1 - 30 : yHead - 34;
      if (!corner) { const x0 = Math.round(Math.min(X(-16), X(PL - 4))), w = Math.abs(Math.round(X(PL - 4)) - Math.round(X(-16))) + 1, it = bunker(x0, hy0 + 6, w, 47);
        for (let y = it.y0; y < it.y0 + it.h; y++) for (let x = x0; x < x0 + it.w; x++) { const d = cs * (x - qx), k = Math.floor((y - it.y0 - 4) / 11), pen = d > PL - 14 && k >= 0 && k < 4 && (y - it.y0 - 4) % 11 < 7; if (pen) { Kr[idx(x, y)] = K.SEA; Br[idx(x, y)] = -10; } else { Kr[idx(x, y)] = K.BLDG; Br[idx(x, y)] = it.id; } }
        pStart = hy0 + 80; }
      const piers = []; for (let py = pStart; py < pEnd; py += 64 + ((rnd(T.SEA, py) * 10) | 0)) piers.push(py);
      piers.forEach((py, k) => { fillR(X(0), X(PL), py - 9, py + 8, K.WORKS, -1, [K.SEA]);
        for (let y = py - 9; y <= py + 8; y++) for (let x = Math.round(Math.min(X(0), X(PL))); x <= Math.max(X(0), X(PL)); x++) { const d = cs * (x - qx); if (inB(x, y) && d > 0 && (y === py - 9 || y === py + 8 || d >= PL - 1)) Kr[idx(x, y)] = K.QUAY; }
        const x0 = Math.round(Math.min(X(3), X(PL - 4))), it = addItem({ t: 'works', label: 'Pier shed', x0, y0: py - 4, w: Math.max(6, PL - 7), h: 9, ori: 'h', style: rnd(T.SEA, py, 1) < 0.5 ? 'gable' : 'flat', roof: rnd(T.SEA, py, 2) < 0.5 ? 1 : 3, seed: h32(seed, 68000 + k), dmg: 0 }); fill(it.x0, it.y0, it.w, it.h, K.BLDG, it.id);
        for (const d of [6, PL - 8]) { plan.cranes.push({ x: Math.round(X(d)), y: py - 7, dx: 0.3 * cs, dy: -1 }); plan.cranes.push({ x: Math.round(X(d + 3)), y: py + 6, dx: 0.3 * cs, dy: 1 }); }
        const next = piers[k + 1] || pEnd + 20;
        for (const [y0, sd] of [[py + 11, 1], [next - 9 - 2 - 9, -1]]) { if (rnd(T.SEA, py, sd + 5) < 0.2 || next - py < 44) continue; const len = Math.min(PL - 1, 26 + ((rnd(T.SEA, py, sd + 7) * 6) | 0)); // coasters along the short piers
          plan.ships.push({ kind: len < 24 ? 'coaster' : kinds[(rnd(T.SEA, py, sd + 9) * 4) | 0], ori: 'h', bow: cs, x0: Math.round(Math.min(X(1), X(1 + len))), y0, w: len, h: 9, dmg: rnd(T.SEA, py, sd + 11) < Dy(y0) * 0.5 }); } });
      port.piers += piers.length;
      const lxa = Math.round(sideLaneX - 15), lxb = Math.round(sideLaneX + 15) - 1;
      if (!P.coast.openSide) plan.ships.push({ kind: 'coaster', ori: 'v', bow: corner ? hd : 1, x0: cs > 0 ? lxb + 1 : lxa - 9, y0: Math.round(lerp(hy0 + 60, hy1 - 60, rnd(T.SEA, 12))), w: 9, h: 30 }); // a coaster passing along the breakwater, leaving the fairway clear
      if (!corner) { const last = piers.length ? piers[piers.length - 1] + 12 : hy0 + 70, ys0 = Math.max(last + 30, yHead - 4), n = Math.min(3, Math.floor((yOpen - 8 - ys0) / 16));
        for (let q = 0; q < n; q++) { const y0 = ys0 + q * 16; fillR(X(-12), X(PL - 4), y0, y0 + 10, K.QUAY, -12, [K.SEA, K.WORKS]); plan.ships.push({ kind: 'hull', ori: 'h', bow: cs, x0: Math.round(Math.min(X(-6), X(PL - 6))), y0: y0 + 1, w: PL - 2, h: 9 }); }
        if (n) for (const d of [4, PL - 10]) plan.gantries.push({ x: Math.round(X(d)), y0: ys0 - 2, y1: ys0 + n * 16 }); }
      for (let y = hy0 + 60; y < hy1 - 6; y += 22) plan.cranes.push({ x: Math.round(X(-3)), y, dx: cs, dy: 0.25 });
      for (let y = hy0 + 58; y + 30 < hy1; ) { const len = Math.min(28 + ((rnd(T.SEA, y, 3) * 10) | 0), hy1 - 16 - y), x0 = Math.round(Math.min(X(-16), X(-4))); if (len >= 14 && rectIs(x0, y, 13, len, K.WORKS)) { /* the last one stops short of the tunnel portal */ const it = addItem({ t: 'works', label: 'Warehouse', x0, y0: y, w: 13, h: len, ori: 'v', style: rnd(T.SEA, y, 4) < 0.4 ? 'flat' : 'gable', roof: rnd(T.SEA, y, 5) < 0.5 ? 1 : 3, seed: h32(seed, 66000 + y), dmg: 0 }); fill(x0, y, 13, len, K.BLDG, it.id); } y += len + 4; }
      if (!(RL && RL.branch)) { for (let y = hy0 + 56; y < hy1 - 4; y++) layTrack(X(-26) + cs * 6 * smooth(hy1 - 20, hy1 - 4, y), y); plan.tunnels.push({ x: Math.round(X(-26) + cs * 6), y: hy1 - 5, dir: 1 }); } // the quayside track bends out past the last warehouse into a tunnel, its hill on the open ground at the harbour's end
      // the fairway along the channel: from the closed end out of the harbour (past its head, or into the end harbour and through its entrance)
      const lx = Math.round(sideLaneX), ly0 = Math.min(yClosed + 4, corner ? yM : L - 1), ly1 = Math.max(yClosed + 4, corner ? (hd > 0 ? L - 1 : 0) : L - 1);
      plan.shipLanes.push({ x: lx, w: 30, y0: corner && hd < 0 ? 0 : Math.min(ly0, ly1), y1: corner && hd < 0 ? yClosed - 4 : Math.max(ly0, ly1), kind: 'channel' });
      if (P.coast.openSide) { const a = cs > 0 ? lxa : 1, b = cs > 0 ? W - 2 : lxb; if (b - a + 1 >= 30) plan.shipLanes.push({ x: (a + b + 1) / 2, w: b - a + 1, y0: Math.min(ly0, ly1) + 4, y1: Math.max(ly0, ly1) - 4, kind: 'warships' }); } // (clear of the end breakwater it opens onto) // the channel and where the breakwater would be: open water for the warships
      port.side = { PL, moleD, channel: CS }; }
    // the game's submarine (12 x 46 px, upright) waits by each U-boat bunker, on the harbour's own water: at the pens (at most 8 px from the
    // bunker) clear of the fairways and the moored ships, or else reaching into a fairway there (the submarine is an enemy, not traffic),
    // or else where a ship lying at the pens moves off; failing all, the nearest berth further off. It becomes a 'sub' slot: the game puts its own submarine there (no painted one).
    plan.subSlots = [];
    { const SW = 12, SH = 46, box = sh => ({ x0: sh.x0 - 2, x1: sh.x0 + sh.w + 1, y0: sh.y0 - 2, y1: sh.y0 + sh.h + 1 }), hit = (a, x0, y0) => x0 <= a.x1 && x0 + SW - 1 >= a.x0 && y0 <= a.y1 && y0 + SH - 1 >= a.y0;
      const lanes = plan.shipLanes.map(l => ({ x0: Math.round(l.x - l.w / 2), x1: Math.round(l.x + l.w / 2) - 1, y0: l.y0, y1: l.y1 })), taken = [];
      const water = (x0, y0) => { if (x0 < 1 || x0 + SW > W - 1 || y0 < 1 || y0 + SH > L - 1) return false; for (let y = y0; y < y0 + SH; y++) for (let x = x0 - 1; x <= x0 + SW; x++) { const i = idx(x, y); if (Kr[i] !== K.SEA || Br[i] !== -10) return false; } return true; }; // a pixel of water either side; bow and stern may touch
      for (const bk of plan.items.filter(it => it.label === 'U-boat bunker')) { let best = null;
        for (const [inLane, moveShip, near] of [[false, false, 8], [true, false, 8], [true, true, 8], [false, true, 1e9], [true, true, 1e9]]) { if (best) break;
          for (let y0 = bk.y0 - SH - 60; y0 <= bk.y0 + bk.h + 60; y0 += 2) for (let x0 = bk.x0 - SW - 40; x0 <= bk.x0 + bk.w + 40; x0 += 2) {
            const dx = Math.max(bk.x0 - (x0 + SW), 0, x0 - (bk.x0 + bk.w)), dy = Math.max(bk.y0 - (y0 + SH), 0, y0 - (bk.y0 + bk.h)), d = dx * dx + dy * dy + Math.abs(x0 + SW / 2 - (bk.x0 + bk.w / 2)) * 0.01; // the gap to the bunker (then nearest its middle)
            if (d > near * near || (best && d >= best.d)) continue; if (taken.some(a => hit(a, x0, y0)) || (!inLane && lanes.some(a => hit(a, x0, y0))) || (!moveShip && plan.ships.some(sh => hit(box(sh), x0, y0))) || !water(x0, y0)) continue;
            best = { x0, y0, d }; } }
        if (!best) continue;
        plan.ships = plan.ships.filter(sh => !hit(box(sh), best.x0, best.y0)); // a moored ship that was in the way moves off
        taken.push({ x0: best.x0 - 2, x1: best.x0 + SW + 1, y0: best.y0 - 2, y1: best.y0 + SH + 1 });
        plan.subSlots.push({ kind: 'sub', on: 'pen', x: best.x0 + SW / 2, y: best.y0 + SH / 2, w: SW, h: SH, r: 6, item: bk.id }); } }
    plan.port = port;
  })();
  // 3a0'. the beach landing (Atlantic Wall): obstacles in the shallows and on the wet sand (Czech hedgehogs, mined stakes), barbed wire along the
  // top of the beach, a line of bunkers in the dunes (casemates with their guns to the sea, pillboxes, Tobruk pits) joined by a zigzag trench,
  // every beach exit closed by anti-tank walls and dragon's teeth with a casemate either side, wrecked landing craft and shell craters on the
  // sand; behind the coastal road a coastal battery (four big casemates, its trench, a radar dish). The sea before the beach stays open for
  // the flagship (plan.fleetArea). Bunkers are the game's 'bunker' slots, the battery its 'arty' slots.
  plan.obstacles = []; plan.wires = []; plan.barrels = []; plan.beachSlots = [];
  (() => { if (!CO || CO.mode !== 'beach') return; const hd = CO.hd, B = x => CO.ycol[clamp(Math.round(x), 0, W - 1)], In = (x, d) => Math.round(B(x) - hd * d) /* d px inland of the shoreline */, g = ++grpN;
    const exitX = (CO.exits || []).map(e => e.pts[0][0]), nearExit = (x, m) => exitX.some(e => Math.abs(e - x) < m);
    const casemate = (cx, yS, w, h, big, label) => { const x0 = Math.round(cx - w / 2), y0 = hd < 0 ? yS : yS - h + 1; for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (!inB(x, y) || Kr[idx(x, y)] === K.BLDG || Kr[idx(x, y)] === K.STREET || Kr[idx(x, y)] === K.ROAD) return null;
      const it = addItem({ t: 'works', label, part: 'casemate', x0, y0, w, h, ori: 'h', style: 'flat', roof: 3, seed: h32(seed, 70000 + x0 + y0 * 7), dmg: 0, sea: -hd, group: g }); fill(x0, y0, w, h, K.BLDG, it.id);
      plan.barrels.push({ x: Math.round(cx), y: hd < 0 ? y0 - 1 : y0 + h, len: big ? 8 : 4, dir: hd }); plan.beachSlots.push({ kind: big ? 'arty' : 'bunker', on: big ? 'battery' : 'casemate', x: Math.round(cx), y: Math.round(y0 + h / 2), r: Math.max(w, h) / 2, item: it.id }); return it; };
    const round = (cx, cy, r, part, label) => { for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if (!inB(x, y) || Kr[idx(x, y)] === K.BLDG || Kr[idx(x, y)] === K.STREET) return null;
      const it = roundBuilding(cx, cy, r, { t: 'works', label, part, sea: -hd, group: g }); plan.beachSlots.push({ kind: 'bunker', on: part, x: Math.round(cx), y: Math.round(cy), r, item: it.id }); return it; };
    // obstacles: hedgehogs in the shallows and on the wet sand, a row of mined stakes above them
    for (let x = 4; x < W - 4; x += 11) { const j = (rnd(T.SEA, x, 30) - 0.5) * 6; if (!nearExit(x, 6) || rnd(T.SEA, x, 31) < 0.3) plan.obstacles.push({ kind: 'hedgehog', x: Math.round(x + j), y: In(x, -7 + rnd(T.SEA, x, 32) * 3) }); plan.obstacles.push({ kind: 'hedgehog', x: Math.round(x + 5 - j), y: In(x, 9 + rnd(T.SEA, x, 33) * 4) }); }
    for (let x = 2; x < W - 2; x += 8) plan.obstacles.push({ kind: 'stake', x: Math.round(x + (rnd(T.SEA, x, 34) - 0.5) * 3), y: In(x, 20 + rnd(T.SEA, x, 35) * 5) });
    // barbed wire along the top of the beach, open at the exits (where the anti-tank walls stand)
    { let run = []; for (let x = 0; x < W; x++) { if (nearExit(x, 20)) { if (run.length) plan.wires.push(run); run = []; continue; } run.push([x, In(x, CO.beachD - 5)]); } if (run.length) plan.wires.push(run); }
    // the bunker line in the dunes, joined by a zigzag trench behind it
    const yDune = x => In(x, CO.beachD + 2); let k = 0;
    // a casemate either side of every exit first, then the line between them, every 14-21 px with room kept to its neighbours
    const line = []; for (const ex of exitX) for (const sd of [-1, 1]) { const x = clamp(ex + sd * 30, 11, W - 12); if (line.some(o => Math.abs(o.x - x) < 20)) continue; if (casemate(x, yDune(x), 18, 12, false, 'Casemate')) line.push({ x, h: 9 }); }
    for (let x = 9; x < W - 9; x += 14 + ((rnd(T.SEA, x, 36) * 8) | 0)) { if (nearExit(x, 16)) continue; const fits = t => line.every(o => Math.abs(o.x - x) >= o.h + [8, 5, 3][t] + 3); let t = k % 3; while (t < 3 && !fits(t)) t++; if (t > 2) continue; const h = [8, 5, 3][t];
      const it = t === 0 ? casemate(x, yDune(x), 16, 11, false, 'Casemate') : t === 1 ? round(x + 0.5, yDune(x) - hd * 6, 4.5, 'pillbox', 'Pillbox') : round(x + 0.5, yDune(x) - hd * 5, 2.8, 'tobruk', 'Tobruk pit'); if (it) { line.push({ x, h }); k++; } }
    for (let x = 0; x < W; x++) { const yt = In(x, CO.beachD + 18) + Math.round(Math.abs(((x / 7) % 2) - 1) * 4 - 2); for (const y of [yt, yt + 1]) if (inB(x, y) && Kr[idx(x, y)] === K.BEACH && Br[idx(x, y)] === -13) Kr[idx(x, y)] = K.TRENCH; }
    // the beach exits: anti-tank walls either side of the road, dragon's teeth on the sand before them, a casemate either side
    for (const ex of exitX) { const yw = In(ex, CO.beachD - 1);
      for (const sd of [-1, 1]) { const x0 = sd < 0 ? ex - 22 : ex + 6, x1 = sd < 0 ? ex - 6 : ex + 22; let ok = true; for (let x = x0; x <= x1 && ok; x++) for (let y = yw; y <= yw + 2; y++) if (!inB(x, y) || Kr[idx(x, y)] !== K.BEACH) ok = false;
        if (ok) { const it = addItem({ t: 'works', label: 'Anti-tank wall', part: 'atwall', x0, y0: yw, w: x1 - x0 + 1, h: 3, ori: 'h', style: 'flat', roof: 3, seed: h32(seed, 71000 + x0), dmg: 0, group: g }); fill(x0, yw, it.w, 3, K.BLDG, it.id); }
        for (let r = 0; r < 2; r++) for (let x = (sd < 0 ? ex - 22 : ex + 6); x <= (sd < 0 ? ex - 7 : ex + 21); x += 4) plan.obstacles.push({ kind: 'tooth', x: x + r * 2, y: yw + hd * (4 + r * 4) });
      } }
    // wrecked landing craft at the waterline, shell craters on the sand
    for (let q = 0; q < 4; q++) { const x = Math.round(lerp(14, W - 24, rnd(T.SEA, q, 40))); if (nearExit(x, 10)) continue; plan.ships.push({ kind: 'lcvp', ori: 'v', bow: -hd, x0: x, y0: Math.min(In(x, -10 + rnd(T.SEA, q, 41) * 14), In(x, 4 + rnd(T.SEA, q, 41) * 14)), w: 7, h: 14, dmg: rnd(T.SEA, q, 42) < 0.6 }); }
    for (let q = 0; q < 26; q++) { const x = 6 + rnd(T.CRATER, q, 50) * (W - 12), d = 4 + rnd(T.CRATER, q, 51) * (CO.beachD + CO.duneD - 6), y = In(x, d), r = 2 + rnd(T.CRATER, q, 52) * 3; let ok = true;
      for (let yy = Math.floor(y - r); ok && yy <= y + r; yy++) for (let xx = Math.floor(x - r); xx <= x + r; xx++) if (!inB(xx, yy) || Kr[idx(xx, yy)] !== K.BEACH) { ok = false; break; } if (ok) plan.craters.push({ x, y, r }); }
    // the coastal battery behind the coastal road, a radar dish beside it
    { const yb = Math.round(CO.wfH - hd * 18), xs3 = [-66, -22, 22, 66].map(dx => W / 2 + dx + (rnd(T.SEA, 60) - 0.5) * 20); let n = 0;
      for (const x of xs3) if (casemate(x, hd < 0 ? yb : yb, 20, 14, true, 'Battery casemate')) n++;
      if (n) { for (let x = Math.round(xs3[0]); x <= xs3[3]; x++) { const y = Math.round(yb - hd * 20 + Math.sin(x * 0.4) * 1.5); for (const yy of [y, y + 1]) if (free(x, yy)) Kr[idx(x, yy)] = K.TRENCH; }
        const rx = xs3[3] + 26, ry = yb - hd * 8; if (rx < W - 10) round(rx, ry, 5, 'radar', 'Radar'); plan.battery = n; } }
    // the sea before the beach stays open for the flagship
    { let near = hd < 0 ? 1e9 : -1e9; for (let x = 64; x <= 159; x++) near = hd < 0 ? Math.min(near, CO.ycol[x]) : Math.max(near, CO.ycol[x]); const y0 = hd < 0 ? 0 : Math.round(near + 30), y1 = hd < 0 ? Math.round(near - 30) : L - 1; if (y1 - y0 >= 240) plan.fleetArea = { x0: 64, x1: 159, y0, y1 }; }
  })();
  // 3a'''. the station: platforms between the tracks, a glass train shed, the station building with a clock tower facing its square, a goods
  // shed on the siding with a loading ramp, a round water tower, and the rail yard's ground
  (() => { if (ST) { const sr = ST.sr, ys = ST.y, xo = off => ST.xL - sr * off, R = (o0, o1) => [Math.round(Math.min(xo(o0), xo(o1))), Math.round(Math.max(xo(o0), xo(o1)))], g = ++grpN;
    const plat = (o0, o1, y0, y1) => { const [a, b] = R(o0, o1); for (let y = y0; y <= y1; y++) for (let x = a; x <= b; x++) if (inB(x, y) && (Kr[idx(x, y)] === K.NONE || (Kr[idx(x, y)] === K.RAIL && RM[idx(x, y)] === 1))) { Kr[idx(x, y)] = K.PLAZA; Br[idx(x, y)] = -5; } };
    plat(9, 13, ys - 34, ys + 34); plat(31, 35, ys - 34, ys + 34); plat(31, 35, ys + 38, ys + 70); // an island platform between the two tracks, a side platform, the loading ramp
    { const [a, b] = R(-9, 35); const it = addItem({ t: 'station', label: 'Train shed', part: 'shed', x0: a, y0: ys - 24, w: b - a + 1, h: 49, ori: 'h', style: 'glass', roof: 3, seed: h32(seed, 54000), dmg: 0, group: g }); fill(a, ys - 24, b - a + 1, 49, K.BLDG, it.id); }
    { const [a, b] = R(36, 47); const it = addItem({ t: 'civic', label: 'Station', part: 'hall', x0: a, y0: ys - 21, w: b - a + 1, h: 43, ori: 'v', front: sr > 0 ? 'W' : 'E', style: 'hip', roof: 3, seed: h32(seed, 54001), dmg: 0, group: g }); fill(a, ys - 21, b - a + 1, 43, K.BLDG, it.id);
      const [ta] = R(sr > 0 ? 47 : 42, sr > 0 ? 42 : 47); const tw = addItem({ t: 'civic', label: 'Station', part: 'tower', x0: ta, y0: ys - 3, w: 6, h: 6, ori: 'v', style: 'hip', roof: 5, seed: h32(seed, 54002), dmg: 0, group: g }); fill(ta, ys - 3, 6, 6, K.BLDG, tw.id); }
    { const [a, b] = R(48, 62); fill(a, ys - 16, b - a + 1, 33, K.PLAZA, -1, true); }
    { const [a, b] = R(36, 45); if (rectFree(a, ys + 38, b - a + 1, 33, 0)) { const it = addItem({ t: 'works', label: 'Goods shed', x0: a, y0: ys + 38, w: b - a + 1, h: 33, ori: 'v', style: 'gable', roof: 1, seed: h32(seed, 54003), dmg: 0, group: g }); fill(a, ys + 38, b - a + 1, 33, K.BLDG, it.id); } }
    { const cx = xo(42), cy = ys - 46; if (rectFree(Math.floor(cx - 5), cy - 5, 10, 10, 0)) roundBuilding(cx, cy, 4.2, { t: 'works', label: 'Water tower', part: 'watertower', group: g }); }
    { const [a, b] = R(-10, 47); for (let y = ST.y0; y <= ST.y1; y++) for (let x = a; x <= b; x++) if (inB(x, y) && Kr[idx(x, y)] === K.NONE) { Kr[idx(x, y)] = K.WORKS; Br[idx(x, y)] = -1; } }
    plan.civic.push({ label: 'Station', x0: R(-9, 62)[0], y0: ST.y0, w: R(-9, 62)[1] - R(-9, 62)[0], h: ST.y1 - ST.y0, group: g });
  } })();
  // 3a'. the old town's market square, in its zone beside the main road, with the town hall on its north side and a tower over the entrance
  if (OT && P.squares) { const Z = OT.zone, s = Z.s, h = 28 + ((rnd(T.SQ, 1) * 7) | 0), w = Math.min(44, Z.x1 - Z.x0 - 6), y0 = Math.round(OT.cy - h / 2);
    if (w >= 28) { const x0 = s > 0 ? Z.x0 : Z.x1 - w + 1;
      fill(x0, y0, w, h, K.PLAZA, -1, true);
      const sq = { x0, y0, w, h, cx: x0 + w / 2, cy: y0 + h / 2, side: s }; plan.squares.push(sq); peakY = sq.cy;
      for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) if (x * x + y * y <= 16) { const i = idx(Math.round(sq.cx) + x, Math.round(sq.cy) + y); Kr[i] = x * x + y * y <= 9 ? K.WATER : K.WALK; }
      if (civ.townHall) { let done = false; // clear of the main road's curve and the ring: narrower, or a little further from the main road
        for (const hh of [20, 18, 16]) for (let dx = 0; dx <= 10 && !done; dx += 2) for (const cut of [0, 4, 8]) if (!done && w - 2 - dx - cut >= 24) done = !!hall(s > 0 ? x0 + 1 + dx : x0 + 1 + cut, y0 + h, w - 2 - dx - cut, hh, 'S', { label: 'Town hall', roof: 3, thick: 6, tower: true }); }
    } }
  if (P.squares && !plan.squares.length) {
    const cands = [...cross['1'], ...cross['-1']].filter(S => Math.abs(S.yc - peakY) < 260).sort((a, b) => Math.abs(a.yc - peakY) - Math.abs(b.yc - peakY) + ((MX(a.yc) < W / 2) === (a.side > 0) ? -40 : 0) - ((MX(b.yc) < W / 2) === (b.side > 0) ? -40 : 0));
    for (const best of cands) { if (plan.squares.length) break; const s = best.side;
      let yTop = best.yc; for (let q = 0; q < 50; q++) { const yy = crossYat(best, MX(best.yc) + s * q); if (yy !== null) yTop = Math.max(yTop, yy); } // a tilted street: clear it over the square's width
      const y0 = Math.ceil(yTop + best.w / 2) + 1; let xEdge = Math.round(MX(y0 + 12));
      for (let q = 0; q < 24 && !(free(xEdge, y0) && free(xEdge, y0 + 12)); q++) xEdge += s; // past the main road and its pavement
      let h = 0; while (h < 36 && free(xEdge + s * 4, y0 + h) && free(xEdge + s * 20, y0 + h)) h++; // up to the next street
      let w = 0; for (; h >= 24; h -= 3) { w = 0; while (w < 48 && free(xEdge + s * w, y0) && free(xEdge + s * w, y0 + h - 1) && free(xEdge + s * w, y0 + (h >> 1))) w++; if (w >= 30) break; } // lower, if a tilted street above cuts it short
      if (w >= 30) {
        const x0 = s > 0 ? xEdge : xEdge - w + 1;
        for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (free(x, y)) { Kr[idx(x, y)] = K.PLAZA; Br[idx(x, y)] = -1; }
        for (let x = x0; x < x0 + w; x++) { const yy = crossYat(best, x); if (yy === null) continue; for (let y = Math.ceil(yy + best.w / 2); y < y0; y++) if (free(x, y)) { Kr[idx(x, y)] = K.PLAZA; Br[idx(x, y)] = -1; } } // the wedge down to the street is paved too
        const sq = { x0, y0, w, h, cx: x0 + w / 2, cy: y0 + h / 2, side: s };
        plan.squares.push(sq); peakY = sq.cy;
        for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) if (x * x + y * y <= 16) { const i = idx(Math.round(sq.cx) + x, Math.round(sq.cy) + y); Kr[i] = x * x + y * y <= 9 ? K.WATER : K.WALK; }
      }
    }
  }
  // 3b. churches. Parts in church space: u across, v along from the front (tower) to the apse. big: true (the main church), false (parish), 'chapel'.
  const it0 = 0;
  function churchParts(big) {
    if (big === 'chapel') return [{ p: 'tower', u0: -3, v0: 0, w: 6, h: 6 }, { p: 'nave', u0: -5, v0: 6, w: 10, h: 14 }, { p: 'apse', u0: -5, v0: 20, w: 10, h: 4, r: 5 }];
    return big ? [{ p: 'tower', u0: -5, v0: 0, w: 10, h: 11 }, { p: 'nave', u0: -7, v0: 11, w: 14, h: 30 }, { p: 'trans', u0: -15, v0: 26, w: 30, h: 8 }, { p: 'apse', u0: -7, v0: 41, w: 14, h: 7, r: 7 }]
      : [{ p: 'tower', u0: -4, v0: 0, w: 8, h: 8 }, { p: 'nave', u0: -6, v0: 8, w: 12, h: 22 }, { p: 'trans', u0: -11, v0: 19, w: 22, h: 6 }, { p: 'apse', u0: -6, v0: 30, w: 12, h: 5, r: 6 }];
  }
  function placeChurch(cx, yFront, dir, big) { // dir 1: the church extends up (north) from its front at yFront, -1: down
    const parts = churchParts(big), len = big === 'chapel' ? 24 : big ? 48 : 35, half = big === 'chapel' ? 8 : big ? 16 : 12, m = big === 'chapel' ? 1 : 3;
    // the churchyard starts right at the street (the front steps), with a margin at the sides and the back
    const x0 = Math.round(cx - half - m), y0 = Math.round(dir > 0 ? yFront : yFront - len - m - 1), hh0 = len + m + 2;
    if (!rectFree(x0, y0, half * 2 + 2 * m, hh0, 0)) return null;
    const ch = { cx, yFront, dir, big, parts: [] };
    fill(x0, y0, half * 2 + 2 * m, hh0, K.CHYARD, -1); yFront += dir; // one pixel of steps before the tower
    for (const q of parts) {
      const it = addItem({ t: 'church', part: q.p, big, x0: Math.round(cx + q.u0), w: q.w, h: q.h, y0: Math.round(dir > 0 ? yFront + q.v0 : yFront - q.v0 - q.h), ori: q.p === 'trans' ? 'h' : 'v', style: 'gable', seed: 3, dmg: 0, church: ch, r: q.r, dir });
      if (q.p === 'apse') { const ccx = cx, ccy = dir > 0 ? it.y0 : it.y0 + it.h; it.acx = ccx; it.acy = ccy; for (let y = it.y0; y < it.y0 + it.h; y++) for (let x = it.x0; x < it.x0 + it.w; x++) if ((x + 0.5 - ccx) ** 2 + (y + 0.5 - ccy) ** 2 <= q.r * q.r) { Kr[idx(x, y)] = K.BLDG; Br[idx(x, y)] = it.id; } }
      else fill(it.x0, it.y0, it.w, it.h, K.BLDG, it.id);
      ch.parts.push(it.id);
    }
    plan.churches.push(ch); return ch;
  }
  if (P.cathedral && plan.squares.length) { // facing the square: north of it, or south, or beside it
    const sq = plan.squares[0];
    let done = false; for (const dx of [0, 6, -6, 12, -12, 18, -18]) if (!done) done = !!(placeChurch(sq.cx + dx, sq.y0 + sq.h, 1, true) || placeChurch(sq.cx + dx, sq.y0 - 2, -1, true));
    for (const dy of [0, 10, -10, 20]) if (!done) done = !!placeChurch(sq.cx + sq.side * (sq.w / 2 + 20), sq.y0 + dy, 1, true); // beside the square
    if (OT) for (const dx of [0, 6, 12, 18, -6, 24]) if (!done) done = !!(placeChurch(sq.cx + sq.side * dx, sq.y0 - 2, -1, false) || placeChurch(sq.cx + sq.side * dx, sq.y0 + sq.h, 1, false)); // a smaller main church fits the old town
  }
  { // parish churches: on the north side of a cross street, facing it, spaced out, where the town is dense enough
    const spots = [];
    for (const s of [-1, 1]) for (const S of cross[s]) if (Uy(S.yc) >= P.parishMinU && !isInd(S.yc) && !isInd(S.yc + 40)) spots.push(S); // never among the works
    spots.sort((a, b) => rnd(T.CH, a.id) - rnd(T.CH, b.id));
    for (const S of spots) {
      const yF = Math.ceil(S.yc + S.w / 2) + 1;
      if (plan.churches.some(c => Math.abs(c.yFront - yF) < P.parishSpacing)) continue;
      for (let q = 0; q <= S.x1 - S.x0; q += 3) { const cx = S.side > 0 ? S.x1 - 16 - q : S.x0 + 16 + q; if (Math.abs(cx - MX(yF)) < 26 || cx < 16 || cx > W - 17) continue;
        let yS = -1e9; for (let xx = cx - 15; xx <= cx + 15; xx++) { const yy = crossYat(S, xx); if (yy !== null) yS = Math.max(yS, yy); } if (yS < -1e8) continue; // the street's edge along the front (it may be tilted)
        if (placeChurch(cx, Math.ceil(yS + S.w / 2) + 1, 1, false)) break; } // the first spot along the street with room
    }
  }
  // 3b'. the island's old town: a chapel beside the main road, then a ring of houses facing the water from the quay
  if (RV && RV.island) {
    for (const sd of [1, -1]) { const ch = placeChurch(RV.ix + sd * (AW(RV.iy) / 2 + 13), RV.iy - 12, 1, 'chapel'); if (ch) { ch.island = true; break; } }
    for (let a = 0; a < 6.283; a += 0.11) {
      const ex = RV.ix + Math.cos(a) * (RV.rx - 2.5), ey = RV.iy + Math.sin(a) * (RV.ry - 2.5), horiz = Math.abs(Math.cos(a)) * RV.ry < Math.abs(Math.sin(a)) * RV.rx; // facing north or south, or east or west
      const w = 8 + ((rnd(T.BLD, Math.round(a * 100), 7) * 4) | 0), d = 9 + ((rnd(T.BLD, Math.round(a * 100), 8) * 2) | 0);
      let x0, y0, bw, bh; if (horiz) { bw = w; bh = d; x0 = Math.round(ex - w / 2); y0 = Math.sin(a) > 0 ? Math.round(ey - d) : Math.round(ey); } else { bw = d; bh = w; y0 = Math.round(ey - w / 2); x0 = Math.cos(a) > 0 ? Math.round(ex - d) : Math.round(ex); }
      if (!rectFree(x0, y0, bw, bh, 0)) continue;
      const it = addItem({ t: 'block', x0, y0, w: bw, h: bh, ori: horiz ? 'h' : 'v', front: horiz ? (Math.sin(a) > 0 ? 'N' : 'S') : (Math.cos(a) > 0 ? 'E' : 'W'), style: rnd(T.ROOF, it0 + a * 10 | 0) < 0.3 ? 'hip' : 'gable', roof: [0, 1, 2, 0, 3][(rnd(T.ROOF, a * 100 | 0, 5) * 5) | 0], seed: h32(seed, 50000 + Math.round(a * 100)), dmg: 0, run: -9000 - Math.round(a * 100), quayFront: true });
      fill(x0, y0, bw, bh, K.BLDG, it.id);
    }
  }
  // 3c'. the city's public buildings, each on a whole block beside the main road: a government building around two courtyards with a dome
  // over its entrance and a forecourt with a fountain; a domed hall (a theatre) on its own square with a portico; a department store with
  // a flat roof and skylights
  { const blocks = [];
    for (const s of [-1, 1]) for (let k = 0; k + 1 < cross[s].length; k++) { const A = cross[s][k], Bc = cross[s][k + 1], ym = (A.yc + Bc.yc) / 2;
      if (!A.dead && !Bc.dead && Bc.yc - A.yc < 90 && !(OT && Math.abs(ym - OT.cy) < OT.ry + OT.rw + 10) && !RVs.some(R => ym > R.yMin - 10 && ym < R.yMax + 10)) blocks.push({ s, A, B: Bc, ym }); }
    const rectOf = bk => { const ya = Math.ceil(bk.A.yc + bk.A.w / 2) + 1, yb = Math.floor(bk.B.yc - bk.B.w / 2) - 1, rows = [];
      for (let y = ya; y <= yb; y++) { let x = Math.round(MX(y) + bk.s * (AW(y) / 2 + 1)); const xs = x; while (free(x, y) && Math.abs(x - xs) < 80) x += bk.s; rows.push([y, Math.min(xs, x - bk.s), Math.max(xs, x - bk.s)]); }
      while (rows.length && rows[0][2] - rows[0][1] < 24) rows.shift(); while (rows.length && rows[rows.length - 1][2] - rows[rows.length - 1][1] < 24) rows.pop();
      if (rows.length < 20) return null; return { y0: rows[0][0], y1: rows[rows.length - 1][0], x0: Math.max(...rows.map(r => r[1])), x1: Math.min(...rows.map(r => r[2])) }; };
    const take = (tag, minU, fn) => { const list = blocks.filter(bk => Uy(bk.ym) >= minU && !isInd(bk.ym)).sort((a, b) => rnd(T.CIV, a.A.id, tag) - rnd(T.CIV, b.A.id, tag));
      for (const bk of list) { if (plan.civic.some(c => Math.abs(c.y0 + c.h / 2 - bk.ym) < 130) || plan.squares.some(q => Math.abs(q.cy - bk.ym) < 120) || plan.churches.some(c => Math.abs(c.yFront - bk.ym) < 60) || plan.stars.some(o => Math.abs(o.y - bk.ym) < 30)) continue;
        const R = rectOf(bk); if (R && fn(bk, R, R.x1 - R.x0 + 1, R.y1 - R.y0 + 1)) return true; } return false; };
    if (civ.government) take(1, 0.62, (bk, R, w, h) => { const s = bk.s, fd = 9, bw = Math.min(62, w - fd - 1), bh = Math.min(50, h - 2); if (bw < 34 || bh < 30) return false;
      const bx0 = s > 0 ? R.x0 + fd : R.x1 - fd - bw + 1, by0 = R.y0 + ((h - bh) >> 1);
      if (!hall(bx0, by0, bw, bh, s > 0 ? 'W' : 'E', { label: 'Government building', roof: 5, thick: 7, middle: true, dome: 5 })) return false;
      const fx0 = s > 0 ? R.x0 : R.x1 - fd + 1; fill(fx0, by0, fd, bh, K.PLAZA, -1, true); // the forecourt, with a round fountain
      const fcx = fx0 + fd / 2 - s * 1.5, fcy = by0 + bh / 2; for (let y = Math.floor(fcy - 3); y <= fcy + 3; y++) for (let x = Math.floor(fcx - 3); x <= fcx + 3; x++) { const r = Math.hypot(x + 0.5 - fcx, y + 0.5 - fcy); if (r < 3.2 && Kr[idx(x, y)] === K.PLAZA) Kr[idx(x, y)] = r < 2.2 ? K.WATER : K.WALK; }
      return true; });
    if (civ.domedHall) take(2, 0.7, (bk, R, w, h) => { const s = bk.s, r = Math.min(13, Math.floor(Math.min(w - 12, h) / 2) - 3); if (r < 9) return false;
      fill(R.x0, R.y0, w, h, K.PLAZA, -1, true); const cx = (R.x0 + R.x1 + 1) / 2 + s * 4, cy = (R.y0 + R.y1 + 1) / 2, g = ++grpN;
      const pw = 6, ph = 12, px0 = Math.round(s > 0 ? cx - r - pw + 2 : cx + r - 2), py0 = Math.round(cy - ph / 2);
      const po = addItem({ t: 'civic', label: 'Domed hall', part: 'portico', x0: px0, y0: py0, w: pw, h: ph, ori: 'h', front: s > 0 ? 'W' : 'E', style: 'gable', roof: 3, seed: h32(seed, 46000 + g), dmg: 0, group: g }); fill(px0, py0, pw, ph, K.BLDG, po.id);
      roundBuilding(cx, cy, r, { t: 'civic', label: 'Domed hall', part: 'dome', roof: 5, group: g });
      plan.civic.push({ label: 'Domed hall', x0: R.x0, y0: R.y0, w, h, group: g }); return true; });
    if (civ.store) take(3, 0.75, (bk, R, w, h) => { const s = bk.s, bw = Math.min(36, w - 1), bh = Math.min(28, h - 2); if (bw < 24 || bh < 20) return false;
      const x0 = s > 0 ? R.x0 : R.x1 - bw + 1, y0 = R.y0 + ((h - bh) >> 1); if (!rectFree(x0, y0, bw, bh, 0)) return false; const g = ++grpN;
      const it = addItem({ t: 'store', label: 'Department store', x0, y0, w: bw, h: bh, ori: 'h', front: s > 0 ? 'W' : 'E', style: 'flat', roof: 3, seed: h32(seed, 47000 + g), dmg: 0, group: g }); fill(x0, y0, bw, bh, K.BLDG, it.id);
      plan.civic.push({ label: 'Department store', x0, y0, w: bw, h: bh, group: g }); return true; });
  }
  // 3c. parks: one block between the main road and a collector, now and then, away from the square
  { const blocks = [];
    for (const s of [-1, 1]) for (let k = 0; k + 1 < cross[s].length; k++) { const A = cross[s][k], Bc = cross[s][k + 1], ym = (A.yc + Bc.yc) / 2; if (Uy(ym) >= 0.5 && Uy(ym) <= 0.93 && Bc.yc - A.yc < 80) blocks.push({ s, A, B: Bc, ym }); }
    blocks.sort((a, b) => rnd(T.PARK, a.A.id) - rnd(T.PARK, b.A.id));
    for (const bk of blocks) {
      if (isInd(bk.ym) || plan.parks.some(p => Math.abs(p.ym - bk.ym) < P.parkSpacing) || plan.squares.some(q => Math.abs(q.cy - bk.ym) < 160) || plan.churches.some(c => Math.abs(c.yFront - bk.ym) < 70) || (OT && Math.abs(bk.ym - OT.cy) < OT.ry + OT.rw) || plan.civic.some(c => Math.abs(c.y0 + c.h / 2 - bk.ym) < 90)) continue;
      const ya = Math.ceil(bk.A.yc + bk.A.w / 2) + 1, yb = Math.floor(bk.B.yc - bk.B.w / 2) - 1; let n = 0;
      const rows = [];
      for (let y = ya; y <= yb; y++) { let x = Math.round(MX(y) + bk.s * (AW(y) / 2 + 1)); const xs = x; while (free(x, y) && Math.abs(x - xs) < 90) x += bk.s; rows.push([y, Math.min(xs, x - bk.s), Math.max(xs, x - bk.s)]); }
      while (rows.length && rows[0][2] - rows[0][1] < 24) rows.shift(); while (rows.length && rows[rows.length - 1][2] - rows[rows.length - 1][1] < 24) rows.pop(); // rows cut short by a tilted street
      if (rows.length < 20 || rows.some(r => r[2] - r[1] < 24)) continue;
      for (const [y, a, b] of rows) for (let x = a; x <= b; x++) { Kr[idx(x, y)] = K.PARK; n++; }
      plan.parks.push({ s: bk.s, ym: bk.ym, ya, yb, area: n });
    }
  }
  // 3c''. the village green (Angerdorf): the church in the middle with its churchyard, a pond with reeds, and grass (lime trees come with the trees)
  if (OT && OT.green) {
    for (const dx of [0, -6, 6, -12, 12]) if (placeChurch(Math.round(MX(OT.cy - 18) + dx), Math.round(OT.cy - 18), 1, false)) break;
    const pcx = MX(OT.cy - OT.ry * 0.58) + (rnd(T.OLD, 50) - 0.5) * 8, pcy = OT.cy - OT.ry * 0.58, prx = 7 + rnd(T.OLD, 51) * 3, pry = 4.5;
    for (let y = Math.floor(pcy - pry - 1); y <= pcy + pry + 1; y++) for (let x = Math.floor(pcx - prx - 1); x <= pcx + prx + 1; x++) if (free(x, y) && ((x + 0.5 - pcx) / prx) ** 2 + ((y + 0.5 - pcy) / pry) ** 2 < 1) { Kr[idx(x, y)] = K.WATER; Br[idx(x, y)] = -7; }
    for (let y = Math.floor(OT.cy - OT.ry); y <= OT.cy + OT.ry; y++) for (let x = Math.floor(octr(y) - OT.rx); x <= octr(y) + OT.rx; x++) if (free(x, y) && inOval(x, y, -OT.rw / 2)) { Kr[idx(x, y)] = K.PARK; Br[idx(x, y)] = -6; }
  }
  // 3c''''. the village centre at the crossroads: a square with a big lime tree and a well in one corner of the crossing, the church facing the
  // crossing road in another, the inn on a third corner
  if (P.villageCentre && XR) { const yc = XR.y, xm = MX(yc), hw = P.crossroads.w / 2, quads = [[1, 1], [-1, 1], [1, -1], [-1, -1]].sort((a, b) => rnd(T.SQ, a[0] + 3, a[1] + 3) - rnd(T.SQ, b[0] + 3, b[1] + 3));
    const roadEdge = (xa, xb, up) => { let e = up > 0 ? -1e9 : 1e9; for (let x = Math.floor(xa); x <= xb; x++) { const yy = XR.yAt(clamp(x, 0, W - 1)) + up * hw; e = up > 0 ? Math.max(e, yy) : Math.min(e, yy); } return e; };
    let stage = 0;
    for (const [s, up] of quads) { const xe = xm + s * (AW(yc) / 2 + 1);
      if (stage === 0) { const w = 30, h = 24, x0 = s > 0 ? Math.ceil(xe) : Math.floor(xe) - w + 1, ye = roadEdge(x0, x0 + w - 1, up), y0 = up > 0 ? Math.ceil(ye) + 1 : Math.floor(ye) - h;
        if (!rectFree(x0 + 3, y0 + 1, w - 5, h - 2, 0)) continue;
        fill(x0, y0, w, h, K.PLAZA, -1, true);
        for (let x = x0; x < x0 + w; x++) { const e = XR.yAt(clamp(x, 0, W - 1)) + up * hw; for (let y = up > 0 ? Math.ceil(e) : y0 + h; up > 0 ? y < y0 : y <= Math.floor(e); y++) if (free(x, y)) { Kr[idx(x, y)] = K.PLAZA; Br[idx(x, y)] = -1; } } // down to the road
        const sq = { x0, y0, w, h, cx: x0 + w / 2, cy: y0 + h / 2, side: s, village: true }; plan.squares.push(sq);
        plan.trees.push({ x: Math.round(sq.cx + s * 4), y: Math.round(sq.cy), r: 5, v: 2, lime: true });
        for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (x * x + y * y <= 4) { const i = idx(Math.round(sq.cx - s * 8) + x, Math.round(sq.cy) + y); Kr[i] = x * x + y * y <= 1 ? K.WATER : K.WALK; } // the village well
        stage = 1; continue; }
      if (stage === 1) { let done = false; for (let q = 0; q <= 30 && !done; q += 3) { const cx = Math.round(xm + s * (AW(yc) / 2 + 16 + q)), e = roadEdge(cx - 15, cx + 15, up);
          done = !!placeChurch(cx, up > 0 ? Math.ceil(e) + 1 : Math.floor(e) - 1, up, false); }
        if (done) { stage = 2; continue; } }
      if (stage === 2) for (let dx = 0; dx <= 36 && stage === 2; dx += 3) { const w = 16, h = 11, x0 = s > 0 ? Math.ceil(xe) + dx : Math.floor(xe) - w + 1 - dx, ye = roadEdge(x0, x0 + w - 1, up), y0 = up > 0 ? Math.ceil(ye) : Math.floor(ye) - h + 1; // at the corner, or a little along the road
        if (rectFree(x0, y0, w, h, 0)) { const it = addItem({ t: 'block', label: 'Inn', x0, y0, w, h, ori: 'h', front: up > 0 ? 'S' : 'N', style: 'hip', roof: 1, seed: h32(seed, 63000), dmg: 0, run: -300000 }); fill(x0, y0, w, h, K.BLDG, it.id); stage = 3;
          for (let x = x0; x < x0 + w; x++) { const e = XR.yAt(clamp(x, 0, W - 1)) + up * hw; for (let y = up > 0 ? Math.ceil(e) : y0 + h; up > 0 ? y < y0 : y <= Math.floor(e); y++) if (free(x, y)) { Kr[idx(x, y)] = K.FRONT; Br[idx(x, y)] = it.id; } } } } } // its forecourt down to the road
  }
  // 3c'''. the power station, on a large block of an industrial quarter: turbine hall towards the street, boiler house, two tall chimneys and,
  // where there is room, two cooling towers with their steam
  if (P.power) { const cand = [];
    for (const s of [-1, 1]) for (let k = 0; k + 1 < cross[s].length; k++) { const A = cross[s][k], Bc = cross[s][k + 1], ym = (A.yc + Bc.yc) / 2; if (!A.dead && !Bc.dead && isInd(ym) && Bc.yc - A.yc >= 60) cand.push({ s, A, B: Bc, ym }); }
    cand.sort((a, b) => rnd(T.CIV, a.A.id, 30) - rnd(T.CIV, b.A.id, 30));
    for (const bk of cand) { const s = bk.s, ya = Math.ceil(bk.A.yc + bk.A.w / 2) + 2, yb = Math.floor(bk.B.yc - bk.B.w / 2) - 2; let x0 = -1e9, x1 = 1e9;
      for (let y = ya; y <= yb; y++) { let x = Math.round(MX(y) + s * (AW(y) / 2 + 2)); const xs = x; while (free(x, y) && Math.abs(x - xs) < 110) x += s; const a = Math.min(xs, x - s), b = Math.max(xs, x - s); x0 = Math.max(x0, a); x1 = Math.min(x1, b); }
      const w = x1 - x0 + 1, h = yb - ya + 1; if (w < 46 || h < 48) continue;
      fill(x0, ya, w, h, K.WORKS, -1); const g = ++grpN, near = s > 0 ? x0 : x1, xo = (o, ww) => s > 0 ? near + o : near - o - ww + 1;
      const mk = (o, ww, y0, hh, ori, style, roof, label) => { const it = addItem({ t: 'works', label, x0: xo(o, ww), y0, w: ww, h: hh, ori, style, roof, seed: h32(seed, 61000 + plan.items.length), dmg: 0, group: g }); fill(it.x0, y0, ww, hh, K.BLDG, it.id); return it; };
      mk(2, 13, ya + 3, h - 6, 'v', 'flat', 3, 'Turbine hall'); mk(15, 15, ya + Math.round(h * 0.2), Math.round(h * 0.6), 'v', 'gable', 4, 'Boiler house');
      for (const f of [0.3, 0.7]) { const cx = xo(35, 0) + 0.5, cy = ya + h * f; roundBuilding(cx, cy, 3.6, { t: 'works', label: 'Chimney', part: 'chimney', group: g }); plan.stacks.push({ x: cx, y: cy, big: true }); }
      const cr = Math.min(12, Math.floor((w - 44) / 2), Math.floor(h / 4) - 1); if (cr >= 8) for (const f of [0.27, 0.73]) { const cx = xo(42 + cr, 0) + 0.5, cy = ya + h * f; roundBuilding(cx, cy, cr, { t: 'works', label: 'Cooling tower', part: 'cooling', group: g }); plan.steam.push({ x: cx, y: cy, r: cr }); }
      plan.heaps.push({ x: xo(24, 0), y: ya + h * 0.1 + 4, r: 5, coal: true }, { x: xo(24, 0), y: yb - h * 0.1 - 4, r: 4.5, coal: true });
      plan.civic.push({ label: 'Power station', x0: Math.min(x0, x1), y0: ya, w, h, group: g }); break; } }
  // 3d. the gasworks at the edge of the town: a yard on a cross street with two round gas holders and a small works building
  if (civ.gasworks) { const cands = [...cross['-1'], ...cross['1']].filter(S => !S.dead && !S.quay && Uy(S.yc) >= 0.25 && Uy(S.yc) <= 0.66).sort((a, b) => rnd(T.CIV, a.id, 9) - rnd(T.CIV, b.id, 9));
    for (const S of cands) { if (plan.works.length) break;
      for (const up of [1, -1]) { if (plan.works.length) break; const w = 46, h = 30, x0 = S.side > 0 ? S.x1 - w - 3 : S.x0 + 3; if (x0 < 2 || x0 + w > W - 2) continue;
        let ye = up > 0 ? -1e9 : 1e9; for (let x = x0; x < x0 + w; x++) { const yy = crossYat(S, x); if (yy === null) { ye = null; break; } ye = up > 0 ? Math.max(ye, yy) : Math.min(ye, yy); } if (ye === null) continue;
        const y0 = up > 0 ? Math.ceil(ye + S.w / 2) + 1 : Math.floor(ye - S.w / 2) - h; if (!rectFree(x0, y0, w, h, 1)) continue;
        fill(x0, y0, w, h, K.WORKS, -1); const g = ++grpN, cy = y0 + h / 2 + up * 2;
        for (const cx of [x0 + 12, x0 + 34]) roundBuilding(cx, cy, 9.5, { t: 'works', label: 'Gasometer', part: 'gasometer', group: g });
        const bx = x0 + 18, by = up > 0 ? y0 + 1 : y0 + h - 7; const it = addItem({ t: 'works', label: 'Gasworks', part: 'hall', x0: bx, y0: by, w: 10, h: 6, ori: 'h', style: 'gable', roof: 1, seed: h32(seed, 48000 + g), dmg: 0, group: g }); fill(bx, by, 10, 6, K.BLDG, it.id);
        plan.works.push({ x0, y0, w, h, street: S.id }); plan.civic.push({ label: 'Gasworks', x0, y0, w, h, group: g }); } } }

  lap('landmarks');
  // 4. frontage: plots along every street, most important streets first; nothing overlaps because each plot claims the raster
  const typeAt = u => u < P.houses.detached[0] ? 'house' : u < P.houses.terraceTo ? 'terrace' : 'block';
  let plotN = 0;
  // Roofs: houses next to each other on one street side form a run that shares a roof material and depth (a row of houses built together),
  // and their roofs join without outlines. The material mix depends on U: red tile at the fringe, more brown tile and slate in the centre.
  let run = { id: -1, end: null, pal: 0, d: 0, style: 'gable' }, runN = 0;
  function runFor(key, u, t, d) {
    if (run.end !== key) { runN++; const r = rnd(T.ROOF, runN), q = rnd(T.ROOF, runN, 1);
      run = { id: runN, end: null, d, pal: u > 0.75 ? [0, 0, 1, 2, 2, 3, 0, 0, 1, 2, 3, 6][(r * 12) | 0] : u > 0.4 ? [0, 0, 0, 1, 2, 0][(r * 6) | 0] : [0, 0, 2, 0][(r * 4) | 0],
        style: t === 'block' ? (q < 0.2 ? 'flat' : q < 0.4 ? 'hip' : 'gable') : t === 'house' ? (q < 0.4 ? 'hip' : 'gable') : 'gable' }; }
    return run;
  }
  function building(t, x0, y0, w, h, ori, front, rn, old) {
    const own = old || t === 'house' || rnd(T.ROOF, plotN, 2) < 0.12; // detached houses, old-town houses and the odd rebuilt house have their own roof
    let roof = own ? [0, 0, 2, 1, 0, 3][(rnd(T.ROOF, plotN, 3) * 6) | 0] : rn.pal, style = own && t !== 'house' ? (rnd(T.ROOF, plotN, 4) < 0.5 ? 'hip' : 'gable') : t === 'house' ? (rnd(T.ROOF, plotN, 4) < 0.4 ? 'hip' : 'gable') : rn.style;
    if (old) { roof = [0, 0, 1, 1, 2, 2, 6, 3, 0, 1][(rnd(T.ROOF, plotN, 3) * 10) | 0]; style = rnd(T.ROOF, plotN, 4) < 0.88 ? 'gable' : 'hip'; } // narrow gabled town houses in many tile colours
    const it = addItem({ t, x0, y0, w, h, ori, front, style, roof, seed: h32(seed, plotN), dmg: 0, run: own ? -1 - plotN : rn.id, old: !!old });
    fill(x0, y0, w, h, K.BLDG, it.id); plotN++; return it;
  }
  function frontV(st, s, fillMode) { // a street running along y: plots on side s (+1 east, -1 west). fillMode: a second pass that closes gaps in rows
    let y = st.y0 + 2, run = 0, n = 0, last = null;
    while (y < st.y1 - 4) {
      const xc0 = st.pts[clamp(y - st.y0, 0, st.pts.length - 1)][0], u = uAt(xc0 + s * 14, y), t = typeAt(u), k = h32(st.id * 977 + (s > 0 ? 1 : 0) + (fillMode ? 7777 : 0), n++);
      const r = (i) => h32(k, i) / 4294967296, old = !!OT && !OT.green && inOval(xc0 + s * 8, y, -OT.rw / 2);
      if (OT && OT.green && inOval(xc0 + s * 8, y, -OT.rw / 2)) { y += 4; continue; } // nothing is built on the village green
      if (!fillMode) { const sp = special(st, s, 'v', y, u, t, r); if (sp) { y += sp; continue; } }
      if (isInd(y)) { y += 4; continue; } // in an industrial quarter only industrial plots
      if (u < 0.06 || (t === 'house' && !old && (fillMode || r(1) > clamp((u - 0.05) * 4, 0, 0.92)))) { y += 6; continue; }
      const lot = !fillMode && r(2) < P.lotChance + P.lotChanceDamage * Dy(y);
      let w, d, sb, gap, gd;
      if (lot) { w = 14 + (r(3) * 5 | 0); d = 14 + (r(4) * 4 | 0); sb = 0; gap = 1; gd = 0; }
      else if (old) { w = 5 + (r(3) * 4 | 0); d = 8 + (r(4) * 4 | 0); sb = 0; gap = r(6) < 0.06 ? 2 : 0; gd = 0; } // the old town: narrow houses, gable to the lane
      else if (t === 'house') { w = 10 + (r(3) * 4 | 0); d = 9 + (r(4) * 3 | 0); sb = 3 + (r(5) * 3 | 0); gap = 5 + (r(6) * 8 | 0); gd = 12 + (r(7) * 10 | 0); }
      else if (t === 'terrace') { w = 7 + (r(3) * 3 | 0); d = 11 + (r(4) * 3 | 0); sb = 1 + (r(5) * 2 | 0); run++; gap = run >= 3 + (r(6) * 4 | 0) ? (run = 0, 3 + (r(8) * 4 | 0)) : 0; gd = 10 + (r(7) * 7 | 0); }
      else { w = 9 + (r(3) * 7 | 0); d = 11 + (r(4) * 4 | 0); sb = 0; gap = 0; gd = 0; }
      const rn = runFor('v' + st.id + ':' + s + ':' + y, u, t, d); if (!lot && !old && t !== 'house') d = rn.d; // a row keeps one depth
      if (fillMode) { sb = t === 'terrace' ? 1 : 0; gd = 0; gap = 0; w = 14; while (w >= 5) { let e2 = s > 0 ? -1e9 : 1e9; for (let yy = y; yy < y + w; yy++) { const p = st.pts[clamp(yy - st.y0, 0, st.pts.length - 1)]; const e = p[0] + s * p[2] / 2; e2 = s > 0 ? Math.max(e2, e) : Math.min(e2, e); } const xq = s > 0 ? Math.ceil(e2) + sb : Math.floor(e2) - sb - d; if (rectFree(xq, y, d, w, 0)) break; w--; } if (w < 5) { y += 2; continue; } }
      let edge = s > 0 ? -1e9 : 1e9; // the street's outer edge along the plot (it curves)
      for (let yy = y; yy < y + w; yy++) { const p = st.pts[clamp(yy - st.y0, 0, st.pts.length - 1)]; const e = p[0] + s * p[2] / 2; edge = s > 0 ? Math.max(edge, e) : Math.min(edge, e); }
      { const pc = st.pts[clamp(y + (w >> 1) - st.y0, 0, st.pts.length - 1)], ex = Math.abs(edge - (pc[0] + s * pc[2] / 2)) + sb - 6; if (ex > 0) sb = Math.max(0, sb - Math.ceil(ex)); } // a tilted street: less setback, so the house still faces it
      if (old) { const xs = s > 0 ? Math.ceil(edge) : Math.floor(edge) - 1, yy = y + (w >> 1); let fd = 0; while (fd < d && free(xs + s * fd, yy)) fd++; if (fd >= 6) d = fd - (fd < d ? 1 : 0); } // shallower where the block is narrow, leaving a pixel to the house behind
      const xf = s > 0 ? Math.ceil(edge) + sb : Math.floor(edge) - sb, x0 = s > 0 ? xf : xf - d;
      if (y + (w >> 1) > st.y1 - 2 || !rectFree(x0, y, d, w, 0) || !frontClear(st, s, 'v', y, w, xf)) { y += 2; continue; } // its middle faces the street
      if (lot) { fill(x0, y, d, w, K.LOT, -1); plan.lots.push({ x0, y0: y, w: d, h: w, street: st.id, tank: st.tank }); y += w + gap; continue; }
      const b = building(old ? 'terrace' : t, x0, y, d, w, old ? 'h' : 'v', s > 0 ? 'W' : 'E', rn, old); rn.end = 'v' + st.id + ':' + s + ':' + (y + w + gap);
      for (let yy = y; yy < y + w; yy++) { const p = st.pts[clamp(yy - st.y0, 0, st.pts.length - 1)]; const e = s > 0 ? Math.ceil(p[0] + p[2] / 2) : Math.floor(p[0] - p[2] / 2); for (let x = Math.min(e, xf); x <= Math.max(e, xf); x++) if (free(x, yy) || (Kr[idx(x, yy)] === K.PARK && Br[idx(x, yy)] === -3)) { Kr[idx(x, yy)] = K.FRONT; Br[idx(x, yy)] = b.id; } } // a sliver of green belt becomes front yard
      if (gd > 0) { const back = sideBack(st, s, t); // the gardens of a street side end together on one back line that follows the street
        for (let yy = y; yy < y + w + (gap > 0 && gap < 9 ? gap : 0); yy++) { const p = st.pts[clamp(yy - st.y0, 0, st.pts.length - 1)], bl = Math.round(p[0] + s * (p[2] / 2 + back));
          for (let x = s > 0 ? x0 + d : x0 - 1; s > 0 ? x < bl : x > bl; x += s) { if (!free(x, yy)) break; Kr[idx(x, yy)] = K.GARDEN; Br[idx(x, yy)] = b.id; } } }
      y += w + gap;
    }
  }
  function frontH(st, s, fillMode) { // a street running along x: plots on side s (+1 north, -1 south)
    const pts = st.pts; if (!pts.length) return;
    let i = 2, run = 0, n = 0;
    while (i < pts.length - 4) {
      const x = pts[i][0], yc = pts[i][1], u = uAt(x, yc + s * 12), t = typeAt(u), k = h32(st.id * 977 + 500 + (s > 0 ? 1 : 0) + (fillMode ? 7777 : 0), n++);
      const r = (q) => h32(k, q) / 4294967296, old = !!OT && !OT.green && inOval(x, yc + s * 8, -OT.rw / 2);
      if (OT && OT.green && inOval(x, yc + s * 8, -OT.rw / 2)) { i += 4; continue; }
      if (!fillMode) { const sp = special(st, s, 'h', i, u, t, r); if (sp) { i += sp; continue; } }
      if (isInd(yc)) { i += 4; continue; }
      if (u < 0.06 || (t === 'house' && !old && (fillMode || r(1) > clamp((u - 0.05) * 4, 0, 0.92)))) { i += 6; continue; }
      const lot = !fillMode && r(2) < P.lotChance + P.lotChanceDamage * Dy(yc);
      let w, d, sb, gap, gd;
      if (lot) { w = 14 + (r(3) * 5 | 0); d = 14 + (r(4) * 4 | 0); sb = 0; gap = 1; gd = 0; }
      else if (old) { w = 5 + (r(3) * 4 | 0); d = 8 + (r(4) * 4 | 0); sb = 0; gap = r(6) < 0.06 ? 2 : 0; gd = 0; }
      else if (t === 'house') { w = 11 + (r(3) * 4 | 0); d = 9 + (r(4) * 3 | 0); sb = 3 + (r(5) * 3 | 0); gap = 5 + (r(6) * 8 | 0); gd = 12 + (r(7) * 10 | 0); }
      else if (t === 'terrace') { w = 7 + (r(3) * 3 | 0); d = 11 + (r(4) * 3 | 0); sb = 1 + (r(5) * 2 | 0); run++; gap = run >= 3 + (r(6) * 4 | 0) ? (run = 0, 3 + (r(8) * 4 | 0)) : 0; gd = 10 + (r(7) * 7 | 0); }
      else { w = 9 + (r(3) * 7 | 0); d = 11 + (r(4) * 4 | 0); sb = 0; gap = 0; gd = 0; }
      const rn = runFor('h' + st.id + ':' + s + ':' + i, u, t, d); if (!lot && !old && t !== 'house') d = rn.d;
      if (fillMode) { sb = t === 'terrace' ? 1 : 0; gd = 0; gap = 0; w = 14; while (w >= 5 && i + w < pts.length) { let e2 = s > 0 ? -1e9 : 1e9; for (let q = i; q < i + w; q++) { const e = pts[q][1] + s * pts[q][2] / 2; e2 = s > 0 ? Math.max(e2, e) : Math.min(e2, e); } const yq = s > 0 ? Math.ceil(e2) + sb : Math.floor(e2) - sb - d; if (rectFree(x, yq, w, d, 0)) break; w--; } if (w < 5 || i + w >= pts.length) { i += 2; continue; } }
      if (i + w >= pts.length) break;
      let edge = s > 0 ? -1e9 : 1e9; for (let q = i; q < i + w; q++) { const e = pts[q][1] + s * pts[q][2] / 2; edge = s > 0 ? Math.max(edge, e) : Math.min(edge, e); }
      { const pc = pts[clamp(i + (w >> 1), 0, pts.length - 1)], ex = Math.abs(edge - (pc[1] + s * pc[2] / 2)) + sb - 6; if (ex > 0) sb = Math.max(0, sb - Math.ceil(ex)); } // a tilted street: less setback, so the house still faces it
      if (old) { const ys = s > 0 ? Math.ceil(edge) : Math.floor(edge) - 1, xx = x + (w >> 1); let fd = 0; while (fd < d && free(xx, ys + s * fd)) fd++; if (fd >= 6) d = fd - (fd < d ? 1 : 0); }
      const yf = s > 0 ? Math.ceil(edge) + sb : Math.floor(edge) - sb, y0 = s > 0 ? yf : yf - d;
      if (i + (w >> 1) > pts.length - 3 || !rectFree(x, y0, w, d, 0) || !frontClear(st, s, 'h', i, w, yf)) { i += 2; continue; }
      if (lot) { fill(x, y0, w, d, K.LOT, -1); plan.lots.push({ x0: x, y0, w, h: d, street: st.id, tank: st.tank }); i += w + gap; continue; }
      const b = building(old ? 'terrace' : t, x, y0, w, d, old ? 'v' : 'h', s > 0 ? 'S' : 'N', rn, old); rn.end = 'h' + st.id + ':' + s + ':' + (i + w + gap);
      for (let q = i; q < i + w; q++) { const e = s > 0 ? Math.ceil(pts[q][1] + pts[q][2] / 2) : Math.floor(pts[q][1] - pts[q][2] / 2), xx = pts[q][0]; for (let y = Math.min(e, yf); y <= Math.max(e, yf); y++) if (free(xx, y) || (Kr[idx(xx, y)] === K.PARK && Br[idx(xx, y)] === -3)) { Kr[idx(xx, y)] = K.FRONT; Br[idx(xx, y)] = b.id; } }
      if (gd > 0) { const back = sideBack(st, s, t);
        for (let xx = x; xx < x + w + (gap > 0 && gap < 9 ? gap : 0); xx++) { const p = pts[clamp(i + xx - x, 0, pts.length - 1)], bl = Math.round(p[1] + s * (p[2] / 2 + back));
          for (let y = s > 0 ? y0 + d : y0 - 1; s > 0 ? y < bl : y > bl; y += s) { if (!free(xx, y)) break; Kr[idx(xx, y)] = K.GARDEN; Br[idx(xx, y)] = b.id; } } }
      i += w + gap;
    }
  }
  // A special plot in the street's own frame (u along the street from a, v away from its edge): a courtyard farmstead (farmhouse gable to the
  // street, stable along one side, barn across the back, a farmyard between) or an industrial plot (a sawtooth hall, a warehouse, oil tanks,
  // works with a chimney, or a coal yard) on a works yard. Returns the length it used along the street, or 0.
  function special(st, s, axis, a, u, t, r) {
    const pts = st.pts, pAt = q => axis === 'v' ? pts[clamp(q - st.y0, 0, pts.length - 1)] : pts[clamp(q, 0, pts.length - 1)], yHere = axis === 'v' ? a : pAt(a)[1];
    const ind = isInd(yHere), farm = !ind && P.farms && t === 'house' && r(11) < P.farms; if (!ind && !farm) return 0;
    const PL = ind ? 30 + (r(12) * 18 | 0) : 26 + (r(12) * 8 | 0), PD = ind ? 24 + (r(13) * 12 | 0) : 27 + (r(13) * 7 | 0);
    if (axis === 'v' ? a + PL > st.y1 - 2 : a + PL > pts.length - 3) return 0;
    let edge = s > 0 ? -1e9 : 1e9, near = s > 0 ? 1e9 : -1e9; for (let q = a; q < a + PL; q++) { const p = pAt(q), e = (axis === 'v' ? p[0] : p[1]) + s * p[2] / 2; edge = s > 0 ? Math.max(edge, e) : Math.min(edge, e); near = s > 0 ? Math.min(near, e) : Math.max(near, e); }
    if (Math.abs(edge - near) > 6) return 0; // too steep a curve for one long straight front
    const f = s > 0 ? Math.ceil(edge) : Math.floor(edge), u0 = axis === 'v' ? a : pAt(a)[0];
    const R = (uu, v0, du, dv) => axis === 'v' ? { x0: s > 0 ? f + v0 : f - v0 - dv, y0: u0 + uu, w: dv, h: du } : { x0: u0 + uu, y0: s > 0 ? f + v0 : f - v0 - dv, w: du, h: dv };
    const at2 = (uu, vv) => axis === 'v' ? [s > 0 ? f + vv : f - vv, u0 + uu] : [u0 + uu, s > 0 ? f + vv : f - vv];
    const all = R(0, 0, PL, PD); if (!rectFree(all.x0, all.y0, all.w, all.h, 0) || !frontClear(st, s, axis, a, PL, f)) return 0;
    const along = axis, across = axis === 'v' ? 'h' : 'v', front = axis === 'v' ? (s > 0 ? 'W' : 'E') : (s > 0 ? 'S' : 'N'), g = ++grpN;
    const mk = (rr, tt, ori, style, roof, label) => { const it = addItem({ t: tt, label, x0: rr.x0, y0: rr.y0, w: rr.w, h: rr.h, ori, front, style, roof, seed: h32(seed, 62000 + plan.items.length), dmg: 0, group: g, run: -200000 - plan.items.length }); fill(rr.x0, rr.y0, rr.w, rr.h, K.BLDG, it.id); return it; };
    const apron = (k, id) => { for (let q = a; q < a + PL; q++) { const p = pAt(q), e = (axis === 'v' ? p[0] : p[1]) + s * p[2] / 2, eq = s > 0 ? Math.ceil(e) : Math.floor(e) - 1, w0 = axis === 'v' ? q : p[0]; // between the curving street and the plot's straight front
      for (let v = Math.min(eq, s > 0 ? f : f - 1); v <= Math.max(eq, s > 0 ? f - 1 : f); v++) { const xx = axis === 'v' ? v : w0, yy = axis === 'v' ? w0 : v; if (free(xx, yy)) { Kr[idx(xx, yy)] = k; Br[idx(xx, yy)] = id; } } } };
    if (farm) { fill(all.x0, all.y0, all.w, all.h, K.COURT, -1); const sd = r(14) < 0.5;
      const fh = mk(R(sd ? PL - 11 : 1, 0, 10, 12), 'house', across, 'gable', [0, 0, 2, 0, 1][(r(15) * 5) | 0], 'Farmhouse'); apron(K.FRONT, fh.id);
      mk(R(sd ? 1 : PL - 9, 3, 8, PD - 12), 'farm', across, 'gable', [0, 2, 7][(r(16) * 3) | 0], 'Stable');
      mk(R(0, PD - 9, PL, 9), 'farm', along, 'gable', [2, 7, 7, 0][(r(17) * 4) | 0], 'Barn');
      plan.farms.push(all); return PL + 2 + (r(18) * 7 | 0); }
    fill(all.x0, all.y0, all.w, all.h, K.WORKS, -1); apron(K.WORKS, -1); const kind = r(16);
    if (kind < 0.3) { mk(R(2, 6, PL - 4, PD - 8), 'works', along, 'saw', 3, 'Factory hall'); mk(R(2, 0, 9, 5), 'works', along, 'flat', 3, 'Office'); }
    else if (kind < 0.5) mk(R(2, 3, PL - 4, PD - 6), 'works', along, 'flat', 3, 'Warehouse');
    else if (kind < 0.68) { const rr = Math.min(6.5, (PD - 6) / 2), n = Math.max(1, Math.floor((PL - 4) / (2 * rr + 3)));
      for (let q = 0; q < n; q++) { const [cx, cy] = at2(3 + rr + q * (2 * rr + 3), PD / 2); roundBuilding(cx, cy, rr, { t: 'works', label: 'Oil tank', part: 'tank', group: g }); } }
    else if (kind < 0.85) { mk(R(2, 4, PL - 13, PD - 7), 'works', along, 'gable', 1, 'Works'); const [cx, cy] = at2(PL - 6, PD / 2); roundBuilding(cx + 0.5, cy + 0.5, 2.7, { t: 'works', label: 'Chimney', part: 'chimney', group: g }); plan.stacks.push({ x: cx + 0.5, y: cy + 0.5 }); }
    else { mk(R(1, 1, 9, 7), 'works', along, 'gable', 3, 'Coal shed'); for (let q = 0; q < 2; q++) { const [cx, cy] = at2(15 + q * 13, PD / 2 + 2); plan.heaps.push({ x: cx, y: cy, r: 5 + r(19 + q) * 2, coal: r(21) < 0.7 }); } }
    return PL + 3 + (r(18) * 4 | 0);
  }
  // the strip between the street's edge and a plot's front must still be open (on a tilted street it is a wedge, and a neighbour's garden may have taken it)
  function frontClear(st, s, axis, a, w, f) {
    for (let q = a; q < a + w; q++) { const p = axis === 'v' ? st.pts[clamp(q - st.y0, 0, st.pts.length - 1)] : st.pts[clamp(q, 0, st.pts.length - 1)];
      const e = axis === 'v' ? (s > 0 ? Math.ceil(p[0] + p[2] / 2) : Math.floor(p[0] - p[2] / 2)) : (s > 0 ? Math.ceil(p[1] + p[2] / 2) : Math.floor(p[1] - p[2] / 2));
      for (let v = Math.min(e, f); v < Math.max(e, f); v++) { const k = axis === 'v' ? Kr[idx(clamp(v, 0, W - 1), clamp(q, 0, L - 1))] : Kr[idx(clamp(p[0], 0, W - 1), clamp(v, 0, L - 1))]; if (k !== K.NONE && k !== K.FRONT && k !== K.WALK && k !== K.STREET && k !== K.ROAD) return false; } } // the street's own edge pixel too
    return true;
  }
  // how far behind the street the gardens of one street side end (detached houses have longer gardens than terraces)
  function sideBack(st, s, t) { return (t === 'house' ? 31 : 26) + (h32(st.id * 31 + s + 7, seed) % 8); }
  const order = { arterial: 0, ring: 1, collector: 1, local: 2 };
  const sorted = plan.streets.filter(st => !st.dead).sort((a, b) => order[a.cls] - order[b.cls] || (a.axis === 'v' ? 0 : 1) - (b.axis === 'v' ? 0 : 1) || a.id - b.id);
  for (const st of sorted) for (const s of [-1, 1]) (st.axis === 'v' ? frontV : frontH)(st, s, false);
  for (const st of sorted) for (const s of [-1, 1]) (st.axis === 'v' ? frontV : frontH)(st, s, true); // close the gaps in rows and at corners

  lap('frontage');
  // 5. interiors: every enclosed region left over. Outside the town (touching the strip's sides at low U) it is fields;
  // inside, paved courtyards with sheds where dense, shared back gardens in between, meadow at the fringe.
  (() => { // label each region in one flood fill, keeping only its statistics; then one pass over the raster gives every pixel its region's kind
    const RG = new Int32Array(N).fill(-1), stack = new Int32Array(N), regs = [];
    for (let start = 0; start < N; start++) {
      if (Kr[start] !== K.NONE || RG[start] >= 0) continue;
      const r = regs.length; let sp = 0, n = 0, su = 0, ns = 0, edge = false, x0 = W, x1 = 0, y0 = L, y1 = 0; stack[sp++] = start; RG[start] = r;
      while (sp) { const i = stack[--sp], x = i % W, y = (i / W) | 0; n++; if ((n & 7) === 0) { su += uAt(x, y); ns++; } if (x === 0 || x === W - 1) edge = true;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && RG[i - 1] < 0 && Kr[i - 1] === K.NONE) { RG[i - 1] = r; stack[sp++] = i - 1; }
        if (x < W - 1 && RG[i + 1] < 0 && Kr[i + 1] === K.NONE) { RG[i + 1] = r; stack[sp++] = i + 1; }
        if (y > 0 && RG[i - W] < 0 && Kr[i - W] === K.NONE) { RG[i - W] = r; stack[sp++] = i - W; }
        if (y < L - 1 && RG[i + W] < 0 && Kr[i + W] === K.NONE) { RG[i + W] = r; stack[sp++] = i + W; } }
      const um = ns ? su / ns : uAt(start % W, (start / W) | 0);
      const indR = isInd((y0 + y1) >> 1) && um >= 0.22 && !(edge && um < 0.5); // inside an industrial quarter: waste ground (beyond its edge, fields as anywhere)
      regs.push({ waste: indR, k: indR ? K.MEADOW : (edge && um < 0.5) || um < 0.12 ? K.FIELD : um >= 0.62 ? K.COURT : um >= 0.28 ? K.GARDEN : K.MEADOW, n, x0, x1, y0, y1 });
    }
    for (let i = 0; i < N; i++) if (RG[i] >= 0) { const R = regs[RG[i]]; Kr[i] = R.k; if (R.waste) Br[i] = -8; } // -8: waste ground between the works
    regs.forEach((R, reg) => { // sheds and workshops in large courtyards
      if (R.k !== K.COURT || R.n <= 260) return;
      for (let q = 0; q < Math.min(4, R.n / 260); q++) {
        const x0 = R.x0 + ((rnd(T.SHED, reg, q) * (R.x1 - R.x0 + 1)) | 0), y0 = R.y0 + ((rnd(T.SHED, reg, q + 40) * (R.y1 - R.y0 + 1)) | 0), w = 6 + (rnd(T.SHED, reg, q + 9) * 4 | 0), h = 5 + (rnd(T.SHED, reg, q + 19) * 3 | 0);
        let ok = x0 + w < W && y0 + h < L && RG[idx(x0, y0)] === reg; for (let y = y0 - 1; ok && y <= y0 + h; y++) for (let x = x0 - 1; ok && x <= x0 + w; x++) if (!inB(x, y) || Kr[idx(x, y)] !== K.COURT) ok = false;
        if (ok) { const it = addItem({ t: 'shed', x0, y0, w, h, ori: w >= h ? 'h' : 'v', style: rnd(T.SHED, reg, q + 29) < 0.5 ? 'flat' : 'gable', roof: 3, seed: h32(seed, 9000 + reg * 8 + q), dmg: 0 }); fill(x0, y0, w, h, K.BLDG, it.id); }
      }
    });
  })(); // its own function, so the engine optimises it (generate is too big to be optimised whole)

  lap('interiors');
  // 5b. the village edge: where back gardens meet the fields, some stretches have a belt of orchard (fruit trees on meadow), the others a hedge
  (() => { // the belt's depth is measured straight across rows and columns, so it has straight edges like a real plot, not a staircase
    const dep = new Uint8Array((Math.ceil(L / 56) + 1) * 2); for (let k = 0; k < dep.length; k++) { const r = rnd(T.INT, k, 77); dep[k] = r < 0.35 ? 0 : 6 + Math.floor(r * 9); } // per stretch of 56 px and side
    const depth = (x, y) => dep[Math.floor(y / 56) * 2 + (x < MX(y) ? 0 : 1)];
    const mark = [];
    for (let y = 0; y < L; y++) for (let x = 0; x < W; x++) { const i = idx(x, y); if (Kr[i] !== K.GARDEN) continue;
      if (!((x > 0 && Kr[i - 1] === K.FIELD) || (x < W - 1 && Kr[i + 1] === K.FIELD) || (y > 0 && Kr[i - W] === K.FIELD) || (y < L - 1 && Kr[i + W] === K.FIELD))) continue; // only the garden's edge onto a field
      const dp = depth(x, y); if (!dp) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        for (let k = 1; k <= dp; k++) { const xx = x + dx * k, yy = y + dy * k; if (!inB(xx, yy)) break; const j = idx(xx, yy); if (Kr[j] !== K.FIELD) break; mark.push(j); } } }
    for (const j of mark) Kr[j] = K.ORCHARD;
  })(); // its own function, so the engine optimises it (generate is too big to be optimised whole)
  lap('orchards');
  // 5c. fields: parcels in field blocks. Blocks are bands at a distance from the main road, in groups of rows, with hedges between them.
  // Near the village the strips run away from the road; in some blocks at the far edge they run parallel to it. Every strip is a parcel,
  // and parcels that come out too small or too thin (cut off by gardens, orchards or a block edge) are merged into a neighbour, so there
  // are no slivers of field.
  (() => {
    const phase = k => rnd(T.INT, 903, k) * 40, bandW = k => 64 + rnd(T.INT, 904, k) * 34;
    const F = new Int32Array(N).fill(-1), keyId = new Map(), parcels = [], blocks = new Map();
    const blockOf = block => { let bi = blocks.get(block); if (bi) return bi; // per block: strips parallel or not, and the parallel strips' edges
      const par = (block & 31) >= 1 && rnd(T.INT, 905, block) < 0.5, edges = []; if (par) { let acc = 0; for (let q = 0; q < 16; q++) { acc += 10 + (rnd(T.INT, 906, block * 16 + q) * 12 | 0); edges.push(acc); } }
      blocks.set(block, bi = { par, edges }); return bi; };
    let lastKey = -1, lastId = -1, lastBlock = -1, lastBi = null; // neighbouring pixels nearly always share a parcel and a block
    for (let y = 0; y < L; y++) { const gg = fGrp[y], ph = phase(gg), bw = bandW(gg), mx = MX(y);
      for (let x = 0; x < W; x++) { const i = idx(x, y); if (Kr[i] !== K.FIELD) continue;
        const side = x < mx ? 0 : 1, dd = Math.abs(x - mx) + ph, band = Math.floor(dd / bw), bpos = dd - band * bw, block = gg * 64 + side * 32 + band;
        const bi = block === lastBlock ? lastBi : (lastBi = blockOf(block)), par = bi.par; lastBlock = block; // a far block (band 1 or more) may have strips parallel to the road
        let sub; if (par) { let q = 0; while (q < 15 && bpos >= bi.edges[q]) q++; sub = 1000 + q; } else sub = fRow[y];
        const key = block * 4096 + sub; let id = key === lastKey ? lastId : keyId.get(key);
        if (id === undefined) { id = parcels.length; keyId.set(key, id); parcels.push({ block, par, crop: rnd(T.INT, 907, key % 1000003), n: 0, x0: x, x1: x, y0: y, y1: y }); }
        lastKey = key; lastId = id; F[i] = id; const P0 = parcels[id]; P0.n++; if (x < P0.x0) P0.x0 = x; if (x > P0.x1) P0.x1 = x; if (y < P0.y0) P0.y0 = y; if (y > P0.y1) P0.y1 = y; } }
    // merge small or thin parcels into the neighbour they share the most border with (same block first)
    for (let pass = 0; pass < 2; pass++) {
      const cells = new Map(); // the pixels of every small or thin parcel, found inside its own bounding box
      parcels.forEach((P0, id) => { if (P0.n === 0 || (P0.n >= 170 && Math.min(P0.x1 - P0.x0, P0.y1 - P0.y0) >= 6)) return; const a = [];
        for (let y = P0.y0; y <= P0.y1; y++) for (let x = P0.x0; x <= P0.x1; x++) { const i = idx(x, y); if (F[i] === id) a.push(i); } if (a.length) cells.set(id, a); });
      for (const [id, list] of cells) {
        const votes = new Map(); for (const i of list) { const x = i % W; for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (j >= 0 && j < N && F[j] >= 0 && F[j] !== id) { const o = F[j]; votes.set(o, (votes.get(o) || 0) + (parcels[o].block === parcels[id].block ? 3 : 1)); } }
        let best = -1, bv = 0; for (const [o, v] of votes) if (v > bv || (v === bv && o < best)) { best = o; bv = v; }
        for (const i of list) { if (best >= 0) F[i] = best; else { F[i] = -1; Kr[i] = K.MEADOW; } }
        if (best >= 0) { const B0 = parcels[best], P0 = parcels[id]; B0.n += P0.n; B0.x0 = Math.min(B0.x0, P0.x0); B0.x1 = Math.max(B0.x1, P0.x1); B0.y0 = Math.min(B0.y0, P0.y0); B0.y1 = Math.max(B0.y1, P0.y1); }
        parcels[id].n = 0;
      }
    }
    plan.F = F; plan.parcels = parcels;
  })(); // its own function, so the engine optimises it (generate is too big to be optimised whole)
  lap('fields');
  // 6a. damage. Kinds of destruction: 1 shell hole in the roof, 2 half collapsed (one end of the roof has fallen in), 3 gutted shell (roof gone,
  // walls standing), 4 collapsed into a mound. Damage comes in clusters (a bomb hits a block), churches only lose part of a roof, and some ruins
  // burn. A collapsed house spills into yards and gardens but never onto a street, so tank routes stay open.
  const noise2 = (tag, x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = rnd(tag, xi, yi), b = rnd(tag, xi + 1, yi), c = rnd(tag, xi, yi + 1), dd = rnd(tag, xi + 1, yi + 1); return a + (b - a) * sx + (c - a) * sy + (a - b - c + dd) * sx * sy; };
  const spillOK = new Uint8Array(24); for (const k of [K.FRONT, K.GARDEN, K.COURT, K.MEADOW, K.LOT, K.CHYARD, K.PARK, K.ORCHARD]) spillOK[k] = 1;
  for (const it of plan.items) {
    const cx = it.x0 + it.w / 2, cy = it.y0 + it.h / 2, d = Dy(cy);
    // even at full damage the houses are a mix (about 10 intact, 15 holed, 20 half collapsed, 25 gutted, 30 collapsed in 100)
    const v = 0.12 + d * 0.62 + (noise2(T.DMG, cx * 0.03, cy * 0.03) - 0.5) * 0.7 * Math.min(1, d * 3) + (rnd(T.DMG, it.id) - 0.5) * 0.3 - (it.church ? 0.25 : 0);
    let t = d < 0.04 ? 0 : v < 0.40 ? 0 : v < 0.55 ? 1 : v < 0.67 ? 2 : v < 0.79 ? 3 : 4;
    if (it.church) t = Math.min(t, it.part === 'nave' || it.part === 'trans' ? 2 : 1);
    if (it.round || it.part === 'tower' || it.part === 'shed' || it.part === 'bunker' || it.part === 'casemate' || it.part === 'atwall') t = Math.min(t, it.t === 'monument' ? 0 : 1); // domes, gas holders and towers only take shell holes
    if (t >= 2 && t < 4 && (it.w < 6 || it.h < 6)) t = 4;
    it.dmg = t;
    if (t === 2) { const along = it.ori === 'h' ? it.w : it.h; it.cut = { end: rnd(T.DMG, it.id, 2) < 0.5 ? 0 : 1, at: Math.max(2, Math.round(along * (0.35 + rnd(T.DMG, it.id, 3) * 0.3))) }; }
    it.fire = t > 0 && rnd(T.DMG, it.id, 5) < [0, 0.04, 0.2, 0.26, 0.05][t] * clamp(d * 1.8, 0, 1);
    if (it.round && it.part !== 'tank') it.fire = false; // of the round buildings only an oil tank burns
    if (t >= 2) for (let y = it.y0; y < it.y0 + it.h; y++) for (let x = it.x0; x < it.x0 + it.w; x++) { const i = idx(x, y); if (Br[i] !== it.id) continue; // the ground the game sees: rubble
      const lx = x - it.x0, ly = it.y0 + it.h - 1 - y, inner = lx > 0 && ly > 0 && lx < it.w - 1 && ly < it.h - 1;
      if (t === 4 || (t === 3 && inner) || (t === 2 && inCut(it, lx, ly))) Kr[i] = K.RUBBLE; }
    if (t === 4) for (let y = it.y0 - 3; y < it.y0 + it.h + 3; y++) for (let x = it.x0 - 3; x < it.x0 + it.w + 3; x++) {
      if (!inB(x, y)) continue; const i = idx(x, y); if (!spillOK[Kr[i]]) continue;
      const dd = Math.max(it.x0 - x, x - (it.x0 + it.w - 1), it.y0 - y, y - (it.y0 + it.h - 1)); if (rnd(T.DMG, x * 3 + 1, y * 5 + it.id) < 0.85 - dd * 0.27) { Kr[i] = K.RUBBLE; Br[i] = it.id; } }
    if (it.fire) plan.fires.push({ x: cx, y: cy, w: it.w, h: it.h, x0: it.x0, y0: it.y0, item: it.id, seed: h32(seed, 77000 + it.id) % 100000 });
  }
  { let n = 0; for (let y = 8; y < L - 8; y += 9) for (let x = 8; x < W - 8; x += 9) {
    const d = Dy(y); if (rnd(T.CRATER, x, y) > d * 0.09) continue;
    const r = 2 + rnd(T.CRATER, x, y + 1) * 3, cx = x + (rnd(T.CRATER, x + 1, y) - 0.5) * 6, cy = y + (rnd(T.CRATER, x + 2, y) - 0.5) * 6; let ok = true;
    for (let yy = Math.floor(cy - r); ok && yy <= cy + r; yy++) for (let xx = Math.floor(cx - r); ok && xx <= cx + r; xx++) { if (!inB(xx, yy)) { ok = false; break; } const k = Kr[idx(xx, yy)]; if (k === K.ROAD || k === K.STREET || k === K.BLDG || k === K.PLAZA || k === K.WATER || k === K.RIVER || k === K.BRIDGE || k === K.QUAY || k === K.RAIL || k === K.RBRIDGE || k === K.SEA) ok = false; }
    if (ok) { plan.craters.push({ x: cx, y: cy, r }); n++; }
  } }

  // 6a'. the river: barges moored at the quays (not near a bridge), and bunker slots at every bridgehead
  for (const R of RVs) {
    for (const bank of ['S', 'N']) for (let x = 6; x < W - 20; x += 34) {
      if (rnd(T.INT, 960 + (bank === 'N' ? 1 : 0) + R.id * 20, x) < 0.45 || plan.bridges.some(b => b.river === R.id && Math.abs(b.x - x - 6) < 22)) continue;
      const w = 12 + ((rnd(T.INT, 961, x) * 5) | 0), h = 5, xx = x + ((rnd(T.INT, 962, x) * 8) | 0), edge = bank === 'N' ? Math.floor(R.yc[xx] + R.hw[xx]) - 1 : Math.ceil(R.yc[xx] - R.hw[xx]) + 1;
      const y0 = bank === 'N' ? edge - h + 1 : edge; let ok = Kr[idx(xx, bank === 'N' ? edge + 2 : edge - 2)] === K.QUAY;
      for (let y = y0 - 1; ok && y < y0 + h + 1; y++) for (let q = xx - 1; q < xx + w + 1; q++) if (!inB(q, y) || Kr[idx(q, y)] !== K.RIVER) { ok = false; break; }
      if (ok) plan.boats.push({ x0: xx, y0, w, h, cargo: (rnd(T.INT, 963, x) * 3) | 0, dmg: rnd(T.INT, 964, x) < Dy(y0) * 0.5 });
    }
  }
  lap('damage');
  // 6b. trees: gardens, parks, churchyards, front gardens, the meadow; avenue trees on the main road's wide pavements.
  // A tree needs its whole crown on open ground, so none stands on a street, a building or a lot.
  (() => { const okK = new Uint8Array(24); for (const k of [K.GARDEN, K.PARK, K.CHYARD, K.FRONT, K.MEADOW, K.COURT]) okK[k] = 1;
    okK[K.BANK] = 1; const dens = [0, 0, 0, 0, 0, 0, 0.1, 0.2, 0.05, 0.55, 0, 0.3, 0, 0.1, 0, 0, 0, 0, 0, 0, 0.5]; // willows on the natural banks
    const taken = new Uint8Array(N);
    // orchard: fruit trees in loose rows, every 6 px, staggered
    for (let y = 3; y < L - 3; y += 6) for (let x = 3 + ((y / 6) & 1) * 3; x < W - 3; x += 6) {
      const tx = x + ((rnd(T.TREE, x, y + 9) * 2) | 0), ty = y; if (!inB(tx, ty) || Kr[idx(tx, ty)] !== K.ORCHARD || rnd(T.TREE, x, y + 8) < 0.12) continue; let ok = true;
      for (let yy = ty - 2; ok && yy <= ty + 2; yy++) for (let xx = tx - 2; xx <= tx + 2; xx++) if (!inB(xx, yy) || taken[idx(xx, yy)] || Kr[idx(xx, yy)] !== K.ORCHARD) { ok = false; break; }
      if (!ok) continue; for (let yy = ty - 2; yy <= ty + 2; yy++) for (let xx = tx - 2; xx <= tx + 2; xx++) taken[idx(xx, yy)] = 1;
      plan.trees.push({ x: tx, y: ty, r: 2, v: 3, fruit: true });
    }
    for (let y = 4; y < L - 4; y += 6) for (let x = 3; x < W - 3; x += 6) {
      const tx = Math.round(x + (rnd(T.TREE, x, y) - 0.5) * 5), ty = Math.round(y + (rnd(T.TREE, x, y + 1) - 0.5) * 5); if (!inB(tx, ty)) continue;
      const k = Kr[idx(tx, ty)]; if (!okK[k] || rnd(T.TREE, x, y + 2) > dens[k] * P.trees) continue;
      const r = k === K.PARK ? 3 + (rnd(T.TREE, x, y + 3) * 3 | 0) : 2 + (rnd(T.TREE, x, y + 3) * 2.6 | 0); let ok = true;
      for (let yy = ty - r; ok && yy <= ty + r; yy++) for (let xx = tx - r; xx <= tx + r; xx++) { if (!inB(xx, yy) || taken[idx(xx, yy)] || !okK[Kr[idx(xx, yy)]]) { ok = false; break; } }
      if (!ok) continue;
      for (let yy = ty - r; yy <= ty + r; yy++) for (let xx = tx - r; xx <= tx + r; xx++) taken[idx(xx, yy)] = 1;
      plan.trees.push({ x: tx, y: ty, r, v: k === K.BANK ? 4 : (rnd(T.TREE, x, y + 4) * 3) | 0 });
    }
    for (let y = 6; y < L - 6; y += 14) { if (plan.aw[y] < 17) continue; for (const s of [-1, 1]) { const tx = Math.round(plan.mx[y] + s * (plan.aw[y] / 2 - 2)); let ok = true; for (let yy = y - 3; ok && yy <= y + 3; yy++) for (let xx = tx - 1; xx <= tx + 1; xx++) if (!inB(xx, yy) || Kr[idx(xx, yy)] !== K.WALK) { ok = false; break; } if (ok) plan.trees.push({ x: tx, y, r: 3, v: 2, avenue: true }); } }
  })(); // its own function, so the engine optimises it (generate is too big to be optimised whole)

  if (P.bocage && plan.F) { const F = plan.F; // hedgerow trees along the field boundaries
    for (let y = 4; y < L - 4; y += 7) for (let x = 3; x < W - 3; x += 7) { const tx = x + ((rnd(T.TREE, x, y + 40) * 4) | 0), ty = y + ((rnd(T.TREE, x, y + 41) * 4) | 0), i = idx(tx, ty); if (!inB(tx, ty) || F[i] < 0 || rnd(T.TREE, x, y + 42) > 0.55) continue;
      if (![i - 2, i + 2, i - 2 * W, i + 2 * W].some(j => j >= 0 && j < N && F[j] >= 0 && F[j] !== F[i])) continue; plan.trees.push({ x: tx, y: ty, r: 2 + ((rnd(T.TREE, x, y + 43) * 2) | 0), v: (rnd(T.TREE, x, y + 44) * 3) | 0 }); } }
  lap('trees');
  // 6c. slots: places the game may fill with flak, artillery, AA towers and bunkers. Lots next to tank streets suit artillery; lots and flat roofs
  // suit flak; squares and parks suit AA towers; large courtyards hide artillery. Spaced out; the number per 300 px rises with U.
  (() => { const cands = [];
    for (const l of plan.lots) cands.push({ kind: l.w >= 16 && l.h >= 16 && l.tank ? 'arty' : 'flak', on: 'lot', x: l.x0 + l.w / 2, y: l.y0 + l.h / 2, r: Math.min(l.w, l.h) / 2 });
    for (const it of plan.items) if ((it.t === 'block' || it.t === 'store') && it.style === 'flat' && it.dmg < 2 && it.w >= 11 && it.h >= 11) cands.push({ kind: 'flak', on: 'roof', x: it.x0 + it.w / 2, y: it.y0 + it.h / 2, r: Math.min(it.w, it.h) / 2, item: it.id });
    for (const b of plan.bridges) if (b.y0 !== null) for (const [yy, sd] of [[b.y0 - 6, -1], [b.y1 + 6, 1]]) for (const dx of [-1, 1]) { // bridgeheads are defended
      const st = plan.streets[b.street], p = st.pts.find(q => Math.round(q[1]) === yy) || st.pts[0], x = Math.round(p[0] + dx * (p[2] / 2 + 5));
      if (inB(x, yy) && Kr[idx(x, yy)] !== K.ROAD && Kr[idx(x, yy)] !== K.RIVER) cands.push({ kind: 'bunker', on: 'bridgehead', x, y: yy, r: 4, prio: true }); }
    for (let y = 8; y < L - 8; y += 10) for (let x = 8; x < W - 8; x += 10) if (Kr[idx(x, y)] === K.WORKS && rectFreeK(x - 5, y - 5, 10, 10, K.WORKS)) cands.push({ kind: 'flak', on: 'yard', x, y, r: 5 }); // harbour, rail and gas works yards
    if (plan.port && plan.port.mole) for (const m of plan.port.mole) cands.push({ kind: 'arty', on: 'mole', x: m.x, y: m.y, r: 3, prio: true }); // coastal guns on the breakwater heads
    for (const b of plan.beachSlots || []) cands.push(Object.assign({ prio: true }, b));
    for (const b of plan.subSlots || []) cands.push(Object.assign({ prio: true }, b));
    for (const it of plan.items) if (it.part === 'bunker' && it.dmg < 2) cands.push({ kind: 'flak', on: 'roof', x: it.x0 + it.w / 2, y: it.y0 + it.h / 2, r: 8, item: it.id, prio: true });
    for (const sq of plan.squares) cands.push({ kind: 'aatower', on: 'plaza', x: sq.x0 + (sq.side > 0 ? sq.w - 7 : 7), y: sq.y0 + sq.h - 7, r: 6 });
    for (const pk of plan.parks) cands.push({ kind: 'aatower', on: 'park', x: Math.round(plan.mx[(pk.ya + pk.yb) >> 1] + pk.s * 34), y: (pk.ya + pk.yb) >> 1, r: 8 });
    for (let y = 10; y < L - 10; y += 12) for (let x = 10; x < W - 10; x += 12) if (Kr[idx(x, y)] === K.COURT && rectFreeK(x - 8, y - 8, 16, 16, K.COURT)) cands.push({ kind: 'arty', on: 'court', x, y, r: 8 });
    function rectFreeK(x0, y0, w, h, k) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (!inB(x, y) || Kr[idx(x, y)] !== k) return false; return true; }
    cands.forEach((c, i) => { c.o = c.prio ? -1 + rnd(T.SLOT, i) * 0.01 : rnd(T.SLOT, i); });
    cands.sort((a, b) => a.o - b.o);
    const band = 300, quota = {};
    for (const c of cands) {
      const U = Uy(c.y), q = c.kind === 'arty' ? P.slots.artyPer300 : P.slots.flakPer300, b = (c.y / band) | 0, key = c.kind + b;
      if (c.kind !== 'bunker' && !c.prio && (quota[key] || 0) >= Math.max(c.kind === 'aatower' ? 1 : 0, Math.round(q * U))) continue;
      const sp = c.on === 'battery' ? 30 : c.kind === 'arty' ? P.slots.artySpacing : c.kind === 'bunker' ? 14 : P.slots.flakSpacing; // a battery's guns stand close together
      const grp = k => k === 'bunker' ? 1 : k === 'sub' ? 2 : 0; /* bunkers, submarines and guns are spaced apart only within their own kind */ if (plan.slots.some(o => grp(o.kind) === grp(c.kind) && (o.x - c.x) ** 2 + (o.y - c.y) ** 2 < sp * sp)) continue;
      quota[key] = (quota[key] || 0) + 1; delete c.o; c.id = plan.slots.length; plan.slots.push(c);
    }
  })(); // its own function, so the engine optimises it (generate is too big to be optimised whole)
  lap('slots');
  return plan;
}

// the fallen end of a half-collapsed roof (lx, ly inside the building, ly down the screen); the break line is jagged
function inCut(b, lx, ly) {
  const along = b.ori === 'h' ? lx : ly, across = b.ori === 'h' ? ly : lx, Lg = b.ori === 'h' ? b.w : b.h, j = ((hh(b.seed, across * 7 + 3) * 3) | 0) - 1;
  return b.cut.end === 0 ? along + j < b.cut.at : along - j >= Lg - b.cut.at;
}
// ---------- what the game asks ----------
function typeAt(plan, x, y) { x |= 0; y |= 0; if (x < 0 || x >= plan.W || y < 0 || y >= plan.L) return 'field'; return TT[plan.K[y * plan.W + x]]; }

// ---------- validation: the numbers the lab shows and the seed sweep checks ----------
function validate(plan) {
  const { W, L, K: Kr, B: Br } = plan, m = {};
  // overlaps: every pixel of a rectangular building must be its own (or its ruin)
  let ov = 0; for (const it of plan.items) { if (it.part === 'apse' || it.round || it.part === 'bunker') continue; for (let y = it.y0; y < it.y0 + it.h; y++) for (let x = it.x0; x < it.x0 + it.w; x++) { const i = y * W + x, o = Br[i] >= 0 ? plan.items[Br[i]] : null;
    if (!(o === it || (it.church && o && o.church === it.church) || (it.group && o && o.group === it.group)) || (Kr[i] !== K.BLDG && Kr[i] !== K.RUBBLE)) ov++; } } // a tower or dome sits on its own building's wing // a church's parts cross each other on purpose
  m.overlapPx = ov;
  // frontage: a house, terrace or block must have a street, pavement or square within 6 px in front of it
  let nf = 0, nb = 0; for (const it of plan.items) { if (it.t !== 'house' && it.t !== 'terrace' && it.t !== 'block') continue; nb++; if (it.quayFront) continue; // island houses face the quay
    const cx = (it.x0 + it.w / 2) | 0, cy = (it.y0 + it.h / 2) | 0, dir = { W: [-1, 0, it.x0 - 1, cy], E: [1, 0, it.x0 + it.w, cy], S: [0, -1, cx, it.y0 - 1], N: [0, 1, cx, it.y0 + it.h] }[it.front];
    let ok = false; for (let k = 0; k < 8 && !ok; k++) { const x = dir[2] + dir[0] * k, y = dir[3] + dir[1] * k; if (x >= 0 && x < W && y >= 0 && y < L) { const kk = Kr[y * W + x]; if (kk === K.ROAD || kk === K.STREET || kk === K.WALK || kk === K.PLAZA) ok = true; else if (kk !== K.FRONT && kk !== K.RUBBLE && kk !== K.RAIL) break; } } // rubble spilled into a front yard, or a railway at a level crossing, still faces the street
    if (!ok) nf++; }
  m.buildings = nb; m.noFrontage = nf;
  // tank network: every tank-carriageway pixel reachable from the main road at the bottom, through tank carriageway only
  { const seen = new Uint8Array(W * L), st = []; let tot = 0, got = 0; for (let i = 0; i < W * L; i++) if (Kr[i] === K.ROAD) tot++;
    let y0r = 0; while (y0r < L - 1 && !Kr.subarray(y0r * W, y0r * W + W).includes(K.ROAD)) y0r++; // from the lowest row the tank routes reach (the strip may begin over the sea)
    for (let x = 0; x < W; x++) if (Kr[y0r * W + x] === K.ROAD) { seen[y0r * W + x] = 1; st.push(y0r * W + x); }
    while (st.length) { const i = st.pop(); if (Kr[i] === K.ROAD) got++; const x = i % W; for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (j >= 0 && j < W * L && !seen[j] && (Kr[j] === K.ROAD || (Kr[j] === K.BRIDGE && plan.streets[-2 - Br[j]] && plan.streets[-2 - Br[j]].tank))) { seen[j] = 1; st.push(j); } }
    m.tankReach = tot ? got / tot : 1; m.tankStreets = plan.streets.filter(s => s.tank).length;
    for (const R of plan.rivers || []) if (R.island) { const i = R.iy * W + Math.round(plan.mx[R.iy]); m.islandReach = !!seen[i]; } }
  m.bridges = plan.bridges.length; m.boats = plan.boats.length;
  m.streets = plan.streets.length;
  // churches: how many, and the closest two
  m.churches = plan.churches.length; m.churchMinGap = Infinity;
  const spaced = plan.churches.filter(c => !c.island); // the island chapel stands apart from the parish rule
  for (let i = 0; i < spaced.length; i++) for (let j = i + 1; j < spaced.length; j++) m.churchMinGap = Math.min(m.churchMinGap, Math.abs(spaced[i].yFront - spaced[j].yFront));
  if (!isFinite(m.churchMinGap)) m.churchMinGap = null;
  // density: share of built ground per 128 px band against a target from U, mean absolute error in percentage points
  let err = 0, nbd = 0; m.bands = [];
  for (let y0 = 0; y0 + 128 <= L; y0 += 128) { let bld = 0, area = 0, us = 0; for (let y = y0; y < y0 + 128; y++) { us += plan.U[y]; for (let x = 0; x < W; x++) { const k = Kr[y * W + x]; area++; if (k === K.BLDG || k === K.RUBBLE) bld++; } }
    const U = us / 128, got = bld / area, want = 0.02 + 0.36 * U; err += Math.abs(got - want); nbd++; m.bands.push({ y0, U: +U.toFixed(2), built: +got.toFixed(3), want: +want.toFixed(3) }); }
  m.densityErr = nbd ? +(100 * err / nbd).toFixed(1) : 0;
  const by = {}; for (const s of plan.slots) by[s.kind] = (by[s.kind] || 0) + 1; m.slots = by;
  m.slotsPer1000 = +(plan.slots.length * 1000 / L).toFixed(1);
  // the game's trains fit their runs: nothing built within 8 px of the track (the train shed aside), no tree crown over it
  { let blk = 0; for (const r of plan.trainRuns || []) for (let y = r.y0; y <= r.y1; y++) for (let x = r.x - 8; x <= r.x + 8; x++) { if (x < 0 || x >= W) continue; const i = y * W + x; if (Kr[i] === K.BLDG && !(plan.items[Br[i]] && plan.items[Br[i]].part === 'shed')) blk++; }
    for (const t of plan.trees) for (const r of plan.trainRuns || []) if (t.y >= r.y0 - t.r && t.y <= r.y1 + t.r && Math.abs(t.x - r.x) < 8 + t.r) blk++;
    m.trainBlocked = blk; m.trainRuns = (plan.trainRuns || []).length; }
  // the game's warships fit: every fairway and the fleet area are open water, with no moored or passing ship in them
  { let blk = 0; const ships = plan.ships || [], inShip = (x, y) => ships.some(sh => x >= sh.x0 && x < sh.x0 + sh.w && y >= sh.y0 && y < sh.y0 + sh.h);
    const areas = (plan.shipLanes || []).map(l => ({ x0: Math.round(l.x - l.w / 2), x1: Math.round(l.x + l.w / 2) - 1, y0: l.y0, y1: l.y1 })).concat(plan.fleetArea ? [plan.fleetArea] : []);
    for (const a of areas) for (let y = Math.max(0, a.y0); y <= Math.min(L - 1, a.y1); y++) for (let x = Math.max(0, a.x0); x <= Math.min(W - 1, a.x1); x++) { const k = Kr[y * W + x]; if (k !== K.SEA || inShip(x, y)) blk++; }
    m.lanesBlocked = blk; m.shipLanes = (plan.shipLanes || []).length; m.fleetArea = !!plan.fleetArea; }
  m.oldTown = !!plan.oldTown; m.stars = (plan.stars || []).length; m.civic = (plan.civic || []).map(c => c.label);
  m.squares = plan.squares.length; m.parks = plan.parks.length; m.trees = plan.trees.length; m.lots = plan.lots.length; m.ruins = plan.items.filter(i => i.dmg >= 2).length;
  m.pass = m.overlapPx === 0 && m.noFrontage === 0 && m.tankReach === 1 && (m.churchMinGap === null || m.churchMinGap >= plan.P.parishSpacing * 0.9) && m.trainBlocked === 0 && m.lanesBlocked === 0 && (plan.rivers || []).every(R => plan.bridges.filter(b => b.river === R.id).length >= (R.island ? 2 : 1)) && m.islandReach !== false;
  return m;
}

const riverOf = (plan, y) => { let best = plan.rivers[0], bd = 1e9; for (const R of plan.rivers) { const d = Math.abs(y - R.Y0); if (d < bd) { bd = d; best = R; } } return best; };
// ---------- painting, in the game's pixel style ----------
// The palettes and the dither are the game's own (index.html: C2, RP.tree, TR, BAYER/pickI), so a plan looks the same in the lab and in the game.
const HX = a => a.map(h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
const C = {
  roofs: [HX(['#4e160e', '#701f14', '#93301e', '#b2472e', '#cc6644']), HX(['#3e120c', '#561a12', '#70261a', '#8a3624', '#a44a34']), HX(['#3a2618', '#523622', '#6c482e', '#86603e', '#a07a54']),
    HX(['#22262e', '#323844', '#46505c', '#5e6a78', '#7c8896']), HX(['#1a1c22', '#262a32', '#343a44', '#464e5a', '#5c6672']), HX(['#1a4236', '#24584a', '#30705e', '#448a76', '#62a690']), HX(['#4a3a16', '#665020', '#82682c', '#9e823c', '#b89c52']), HX(['#3e3420', '#5a4c2c', '#76663c', '#92824e', '#ac9c66'])], // 7: straw thatch
  tar: HX(['#202024', '#2a2a30', '#34343a', '#3e3e46']), cobble: HX(['#34322f', '#3e3b37', '#48443f', '#524e48']), side: HX(['#66625c', '#7a766f', '#8e8a82']),
  pave: HX(['#6e685e', '#7e786c', '#8e887c', '#9e988c']), water: HX(['#1e4a66', '#2c6684', '#4a88a6']), yard: HX(['#3a3a30', '#46463a', '#525244']),
  grass: HX(['#2e4a22', '#38582a', '#446832', '#52783c']), soil: HX(['#3e3020', '#4e3e2a', '#5e4c34']), steel: HX(['#b8bcc4'])[0], fence: HX(['#2a241c'])[0], shadow: HX(['#16141a'])[0],
  asph: HX(['#2c2c30', '#36363c', '#404048', '#4a4a52']), mark: HX(['#d8d6cc'])[0], rubble: HX(['#2a2622', '#3e3832', '#544c44', '#6a6258', '#827a6e']),
  facade: [HX(['#5e5444', '#8a7e6a', '#a69a82']), HX(['#3e1c14', '#5e2a1c', '#7a3a26']), HX(['#3e3c38', '#5a5852', '#74726a'])],
  tree: HX(['#0e1e0a', '#183014', '#22441a', '#2f5a22', '#40722c', '#58903a']),
  field: { grass: HX(['#24401a', '#2e5220', '#3a6428', '#4a7832', '#5e8e40']), wheat: HX(['#7a6428', '#9a8236', '#b8a048', '#d4bc64', '#e8d488']), soil: HX(['#3a2818', '#523a22', '#6c4e30', '#86643e']), crop: HX(['#1e3a14', '#2a4e1a', '#3a6424', '#4e7c30']), hedge: HX(['#12240e', '#1a3214', '#24421a']) },
  sea: HX(['#0c2638', '#123148', '#183d58', '#20496a', '#2c587c', '#3e6c90']), foam: HX(['#c8dce4', '#e8f2f4'])[0],
  gravel: HX(['#4a4638', '#5a5546', '#6a6454']), rail: HX(['#8a8e96', '#b0b4bc']), crane: HX(['#b8902e', '#7a5a1c']), sett: HX(['#403c36', '#4e4a42', '#5c574e', '#6a6459']), river: HX(['#12303a', '#173c48', '#1e4a56', '#285a66', '#3a6e78', '#5a8a90']), hull: HX(['#2a2018', '#4a3826', '#6a543a']), beam: HX(['#5a3a20'])[0], char: HX(['#1a1612', '#241e18', '#30281e']), fruit: HX(['#c8483a', '#e0c04a']), conc: HX(['#4e4c48', '#5e5c58', '#6e6c68', '#7e7c78']), sand: HX(['#6e6448', '#86795a']), lit: HX(['#e8c870'])[0], dark: HX(['#1a1c22'])[0], fire: HX(['#f4d050', '#f08a30', '#c84020']),
};
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16 - 0.5);
const bay = (i, j) => BAYER[((j & 3) << 2) | (i & 3)];
const pickI = (n, l, i, j) => { const v = Math.round(l * (n - 1) + bay(i, j) * 0.95); return v < 0 ? 0 : v >= n ? n - 1 : v; };
const hh = (x, y) => h32(x * 7919 + 13, y * 104729 + 7) / 4294967296;
function vn(x, y) { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hh(xi, yi), b = hh(xi + 1, yi), c = hh(xi, yi + 1), d = hh(xi + 1, yi + 1); return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy; }

// one roof pixel (the game's roofPix): lx, ly inside the building with ly growing down the screen
function roofPix(lx, ly, b, ramp, wx, wy) {
  const w = b.w, h = b.h, style = b.style;
  if (lx === 0 || ly === 0 || lx === w - 1 || ly === h - 1) return ramp[0];
  if (style === 'flat') { // a gravel roof behind a parapet: light enough to read as a roof, not a hole
    if (lx === 1 || ly === 1 || lx === w - 2 || ly === h - 2) return ly === 1 || lx === w - 2 ? C.conc[3] : C.conc[1];
    if (b.slot && Math.abs(lx - w / 2 + 0.5) < 2.6 && Math.abs(ly - h / 2 + 0.5) < 2.6) { const e = Math.max(Math.abs(lx - w / 2 + 0.5), Math.abs(ly - h / 2 + 0.5)); return e > 1.8 ? C.sand[(lx + ly) & 1] : C.gravel[0]; } // a sandbagged gun platform
    if (b.t === 'store') { if (lx % 6 === 3 && ly > 2 && ly < h - 3) return ly % 2 ? C.roofs[3][4] : C.roofs[3][3]; if (lx % 6 === 4 && ly > 2 && ly < h - 3) return C.conc[0]; } // rows of glass skylights
    if (lx === 3 && ly === 3) return C.shadow; if (lx === 3 && ly === 4) return C.conc[3]; // roof hatch
    return C.conc[pickI(4, 0.45 + (hh(wx, wy) - 0.5) * 0.35 + (vn(wx * 0.3, wy * 0.3) - 0.5) * 0.2, wx, wy)];
  }
  const along = b.ori === 'h', a = along ? lx : ly, c = along ? ly : lx, Lg = along ? w : h, Dd = along ? h : w, mid = (Dd - 1) / 2;
  if (style === 'saw') { const ph = c % 5; return ph === 0 ? C.roofs[3][4] : ph === 1 ? ramp[0] : ramp[pickI(5, 0.25 + ph * 0.14, wx, wy)]; } // a sawtooth roof: rows of north lights
  let l = c < mid ? 0.78 : 0.34;
  if (Math.abs(c - mid) < 0.6) l = 0.95;
  if (style === 'hip') { const e = Math.min(c, Dd - 1 - c); if (a < e) l = 0.62; else if (Lg - 1 - a < e) l = 0.22; }
  if (a % 3 === 0) l -= 0.08;
  const ch = 2 + ((hh(b.seed, 9) * Math.max(1, Lg - 5)) | 0);
  if (!b.church && Math.abs(c - (mid - 2)) < 1 && (a === ch || a === ch + 1)) return a === ch ? C.side[2] : C.shadow; // chimney
  return ramp[pickI(5, l, wx, wy)];
}
// a round building's pixel: a copper dome with ribs and a lantern, a gas holder inside its guide frame, or a column with a gilded figure
function roundPix(b, x, y) {
  const dx = x + 0.5 - b.acx, dy = y + 0.5 - b.acy, rr = Math.hypot(dx, dy), e = rr / b.r, an = Math.atan2(dy, dx), light = (-dx + dy) / b.r; // lit from the upper left
  if (b.t === 'monument') { if (rr < 1.3) return C.fire[0]; if (rr < 1.9) return C.fire[1]; return e > 0.86 ? C.shadow : C.side[light > 0 ? 2 : 1]; }
  if (b.part === 'pillbox') { if (e > 0.88) return C.shadow; const toward = (b.sea < 0 ? -dy : dy) / b.r; if (e > 0.62 && toward > 0.3 && Math.abs(dx) < b.r * 0.7) return C.shadow; return C.conc[pickI(4, 0.6 - e * 0.25 + light * 0.3, x, y)]; } // a pillbox: slits towards the sea
  if (b.part === 'tobruk') return e > 0.85 ? C.shadow : e > 0.45 ? C.conc[pickI(4, 0.55 + light * 0.3, x, y)] : C.char[0]; // a Tobruk pit: a ring of concrete round the open hole
  if (b.part === 'radar') { if (e > 0.92) return C.shadow; return ((((an / 6.283 + 1) * 10) % 1) < 0.18 || Math.abs(e - 0.55) < 0.07) ? C.conc[0] : C.side[pickI(3, 0.5 + light * 0.35 - e * 0.2, x, y)]; } // a Wurzburg dish: ribs and a ring
  if (b.part === 'lighthouse') { if (e > 0.9) return C.shadow; if (rr < 1.1) return C.lit; const band = Math.floor(e * 4) % 2; return band ? (b.red ? C.fire[2] : C.field.crop[2]) : C.side[2]; } // a lighthouse: lantern, bands
  if (b.part === 'cooling') { if (e > 0.94) return C.shadow; if (e > 0.78) return C.conc[pickI(4, 0.55 + light * 0.5, x, y)]; if (e > 0.72) return C.shadow; return SMOKE[pickI(4, 0.1 + (vn(x * 0.35, y * 0.35) - 0.5) * 0.5 + (1 - e) * 0.5, x, y)]; } // a cooling tower: a lit concrete rim round a shaft full of steam // a cooling tower: a lit concrete rim, the dark shaft inside
  if (b.part === 'tank') { if (e > 0.88) return C.shadow; if (rr < 1.1) return C.conc[0]; return C.side[pickI(3, 0.6 - e * 0.25 + light * 0.4 - (Math.abs(e - 0.6) < 0.06 ? 0.3 : 0) - (b.dmg ? (hh(x, y) < 0.3 ? 0.4 : 0) : 0), x, y)]; } // an oil tank: a light steel roof with a ring seam and a vent
  if (b.part === 'chimney') return e > 0.55 ? C.roofs[1][pickI(5, 0.45 + light * 0.3, x, y)] : C.shadow; // a brick stack, black inside
  if (b.part === 'watertower') { if (rr < 1.2) return C.conc[3]; if (e > 0.88) return C.shadow; return C.roofs[0][pickI(5, 0.6 - e * 0.3 + light * 0.35 - ((((an / 6.283 + 1) * 12) % 1) < 0.15 ? 0.2 : 0), x, y)]; } // a conical tiled roof on a brick drum
  if (b.part === 'gasometer') {
    if (e > 0.86) return (((an / 6.283 + 1) * 14) | 0) % 2 ? C.conc[0] : C.shadow; // the guide frame: posts round a dark ring
    if (b.dmg === 1 && Math.hypot(dx - b.r * 0.25, dy + b.r * 0.2) < 2.2) return C.shadow;
    const seam = Math.abs(((an / 6.283 + 1) * 10) % 1 - 0.5) > 0.45 && e > 0.3, ring = Math.abs(e - 0.55) < 0.06;
    return C.roofs[3][pickI(5, 0.55 - e * 0.25 + light * 0.25 - (seam || ring ? 0.22 : 0), x, y)]; }
  if (rr < 1.6) return C.conc[3]; if (rr < 2.4) return C.roofs[5][1]; // the lantern on top
  if (e > 0.9) return C.shadow; // the dome's drum casts a dark rim
  if (b.dmg === 1) { const hr = Math.hypot(dx - b.r * 0.3, dy + b.r * 0.25); if (hr < b.r * 0.18) return ((x + y) & 1) ? C.beam : C.shadow; if (hr < b.r * 0.26) return C.char[1]; }
  const rib = Math.abs(((an / 6.283 + 1) * 16) % 1 - 0.5) > 0.42 && e > 0.3;
  return C.roofs[5][pickI(5, 0.8 - e * 0.4 + light * 0.35 - (rib ? 0.3 : 0), x, y)];
}
// a field pixel from its parcel (5c): a hedge where the field block changes, a furrow line between strips, the crop's own pattern
function parcelPix(plan, i, x, y) {
  const F = plan.F, W = plan.W, id = F[i]; if (id < 0) return C.field.grass[pickI(5, 0.5, x, y)];
  const P = plan.parcels[id], nb = j => j >= 0 && j < F.length && F[j] >= 0 && F[j] !== id ? plan.parcels[F[j]] : null;
  const a = nb(x > 0 ? i - 1 : -1), b2 = nb(i - W), c2 = nb(x < W - 1 ? i + 1 : -1), d2 = nb(i + W);
  if ([a, b2, c2, d2].some(o => o && (o.block !== P.block || plan.P.bocage))) return C.field.hedge[pickI(3, 0.4 + (hh(x, y) - 0.5) * 0.7, x, y)]; // a hedge between field blocks (in bocage country between every field)
  if (plan.P.bocage && [nb(x > 1 ? i - 2 : -1), nb(i - 2 * W), nb(x < W - 2 ? i + 2 : -1), nb(i + 2 * W)].some(o => o)) return C.field.hedge[pickI(3, 0.62 + (hh(x, y) - 0.5) * 0.6, x, y)]; // ... thick
  const edge = (a || b2) ? -0.22 : 0, lines = P.par ? x % 3 === 0 : y % 3 === 0, t = P.crop;
  if (t < 0.28) return C.field.wheat[pickI(5, 0.55 + edge + (lines ? -0.2 : 0) + (vn(x * 0.1, y * 0.1) - 0.5) * 0.3, x, y)];
  if (t < 0.46) return C.field.soil[pickI(4, 0.5 + edge + ((P.par ? x : y) % 2 === 0 ? 0.25 : -0.05), x, y)];
  if (t < 0.72) return C.field.crop[pickI(4, 0.5 + edge + (lines ? 0.15 : -0.1) + (vn(x * 0.08, y * 0.08) - 0.5) * 0.3, x, y)];
  return C.field.grass[pickI(5, 0.5 + edge + (vn(x * 0.08, y * 0.08) - 0.5) * 0.6, x, y)];
}
// Paint plan rows y0 .. y0 + h - 1 into an ImageData that is W wide and h tall (screen row 0 = plan row y0 + h - 1, so north is up).
function paint(plan, img, y0, h, opts) { // opts.seaPix(x, y, harbour, calm) -> [r, g, b]: the host's own water colour for open sea and harbour basins (the surf stays); opts.apronPix(x, y): its own apron concrete
  const seaPix = opts && opts.seaPix, { W, L, K: Kr, B: Br, items } = plan, d = img.data, at = (x, y) => (y < 0 || y >= L || x < 0 || x >= W) ? -1 : y * W + x;
  const bAt = (x, y) => { const i = at(x, y); if (i < 0) return null; const k = Kr[i]; return (k === K.BLDG) && Br[i] >= 0 ? items[Br[i]] : null; };
  const streetOf = i => Br[i] <= -2 ? plan.streets[-2 - Br[i]] : null, RMx = plan.RM || new Uint8Array(W * L);
  for (let sr = 0; sr < h; sr++) {
    const y = y0 + h - 1 - sr; if (y < 0 || y >= L) continue;
    for (let x = 0; x < W; x++) {
      const i = y * W + x, k = Kr[i]; let c;
      if (RMx[i] === 2 && (k === K.ROAD || k === K.STREET || k === K.WALK)) c = C.rail[(y & 1) ? 0 : 1]; // a level crossing: the rails run through the road
      else switch (k) {
        case K.BLDG: { const b = items[Br[i]]; if (!b) { c = C.shadow; break; }
          if (b.round) { c = roundPix(b, x, y); break; }
          if (b.part === 'casemate' || b.part === 'atwall') { const lx = x - b.x0, ly = y - b.y0, edge = lx === 0 || ly === 0 || lx === b.w - 1 || ly === b.h - 1, seaRow = b.sea < 0 ? ly <= 1 : ly >= b.h - 2; // concrete, camouflage, the embrasure on the sea side
            c = b.part === 'casemate' && seaRow && Math.abs(lx - b.w / 2 + 0.5) < b.w * 0.3 ? C.shadow : edge ? C.shadow : C.conc[pickI(4, 0.5 + (vn(x * 0.3, y * 0.3) - 0.5) * 0.7 - (lx === 1 || ly === b.h - 2 ? -0.15 : 0), x, y)];
            if (b.part === 'casemate' && !edge && vn(x * 0.2 + 9, y * 0.2) > 0.68) c = C.field.hedge[1]; break; }
          if (b.part === 'bunker') { const lx = x - b.x0, ly = y - b.y0, edge = lx === 0 || ly === 0 || lx === b.w - 1 || ly === b.h - 1; // a U-boat bunker: a metres-thick concrete roof, beams, camouflage
            c = edge ? C.shadow : (lx % 7 === 0 || ly % 9 === 0) ? C.conc[1] : C.conc[pickI(4, 0.55 + (vn(x * 0.12, y * 0.12) - 0.5) * 0.5 - (b.dmg && hh(x >> 1, y >> 1) < 0.08 ? 0.5 : 0), x, y)]; break; }
          if (b.part === 'shed') { const lx = x - b.x0, u = (lx + 0.5) / b.w, arch = 1 - (2 * u - 1) ** 2; // the train shed: an arched glass roof on iron ribs, the tracks showing through
            c = lx === 0 || lx === b.w - 1 || y === b.y0 || y === b.y0 + b.h - 1 ? C.shadow : (y - b.y0) % 4 === 0 ? C.conc[0] : C.roofs[3][pickI(5, 0.25 + arch * 0.55 - (RMx[i] === 2 ? 0.2 : 0) + (b.dmg && hh(x >> 1, y >> 1) < 0.12 ? -0.5 : 0), x, y)]; break; }
          if (b.part === 'apse') { const rr = Math.hypot(x + 0.5 - b.acx, y + 0.5 - b.acy); c = C.roofs[5][pickI(5, rr > b.r - 1 ? 0 : 0.8 - (x - b.x0) / (b.w * 1.4), x, y)]; break; }
          if (b.part === 'tower') { const lx = x - b.x0, ly = b.y0 + b.h - 1 - y; c = (lx === 0 || ly === 0 || lx === b.w - 1 || ly === b.h - 1) ? C.roofs[5][0] : C.roofs[5][pickI(5, 0.3 + 0.5 * (1 - Math.max(Math.abs(lx - b.w / 2), Math.abs(ly - b.h / 2)) / (b.w / 2)), x, y)]; break; }
          const ramp = b.church ? C.roofs[5] : C.roofs[b.roof || 0], lx = x - b.x0, ly = b.y0 + b.h - 1 - y;
          // a roof joins its neighbour in the same row: no outline on that side, a soft party-wall seam instead
          const join = (xx, yy) => { const o = at(xx, yy); if (o < 0 || Kr[o] !== K.BLDG) return false; const n = items[Br[o]]; return n && n !== b && n.run === b.run && n.ori === b.ori && n.dmg < 2 && b.dmg < 2; };
          const jl = lx === 0 && join(x - 1, y), jr = lx === b.w - 1 && join(x + 1, y), jt = ly === 0 && join(x, y + 1), jb = ly === b.h - 1 && join(x, y - 1);
          if (jl || jr || jt || jb) { const bb = { w: b.w + 2, h: b.h + 2, ori: b.ori, style: b.style === 'hip' ? 'gable' : b.style, seed: b.seed, church: true }; c = roofPix(lx + 1, ly + 1, bb, ramp, x, y); if (jl || jt) c = [c[0] * 0.82 | 0, c[1] * 0.82 | 0, c[2] * 0.82 | 0]; }
          else c = roofPix(lx, ly, b, ramp, x, y);
          const along = b.ori === 'h' ? lx : ly;
          if (b.dmg === 1 && lx > 0 && ly > 0 && lx < b.w - 1 && ly < b.h - 1) { // a shell hole: rafters across a dark opening, scorched tiles around it
            const hx = 1.5 + hh(b.seed, 1) * (b.w - 3), hy = 1.5 + hh(b.seed, 2) * (b.h - 3), rr = Math.hypot(lx - hx, ly - hy), rh = 1.5 + hh(b.seed, 3) * 1.6;
            if (rr < rh) c = along % 2 === 0 ? C.beam : C.shadow; else if (rr < rh + 1.5 && hh(x, y) < 0.8) c = [c[0] * 0.5 | 0, c[1] * 0.42 | 0, c[2] * 0.4 | 0]; }
          if (b.dmg === 2) { // the standing part of a half-collapsed roof: torn tiles and rafter stubs along the break
            const near = inCut(b, b.ori === 'h' ? lx - (b.cut.end ? -1 : 1) : lx, b.ori === 'h' ? ly : ly - (b.cut.end ? -1 : 1));
            if (near) c = hh(x, y) < 0.45 ? C.beam : hh(x + 9, y) < 0.5 ? C.shadow : [c[0] * 0.6 | 0, c[1] * 0.5 | 0, c[2] * 0.5 | 0]; }
          if (b.dmg === 3) { // a gutted shell: the tops of the walls, lit on the upper and left sides, with breaches
            c = hh(x * 5, y * 3) < 0.1 ? C.shadow : (ly === 0 || lx === 0) ? C.conc[3] : C.conc[1]; }
          break; }
        case K.RUBBLE: { const b = Br[i] >= 0 ? items[Br[i]] : null;
          if (b && b.dmg === 3) { // inside a gutted shell: charred floor, rubble heaps, the stub of an inner wall, fallen beams
            const lx = x - b.x0, ly = b.y0 + b.h - 1 - y, n = vn(x * 0.35 + b.id, y * 0.35);
            const wall = (b.ori === 'h' ? lx === (b.w >> 1) : ly === (b.h >> 1)) && hh(x, y) < 0.7, beam = Math.abs(((lx - ly * 0.7 + hh(b.seed, 4) * 6) % 6 + 6) % 6) < 0.7 && hh(x >> 1, y) < 0.75;
            c = wall ? C.conc[2] : beam ? C.beam : n > 0.56 ? C.rubble[pickI(5, 0.35 + (n - 0.56) * 2.2, x, y)] : C.char[pickI(3, 0.45 + (hh(x, y) - 0.5) * 0.7, x, y)];
          } else if (b && b.dmg === 2) { // the fallen end of a roof: debris with broken rafters
            c = hh(x, y) < 0.14 ? C.beam : hh(x * 3, y * 5) < 0.12 ? C.roofs[b.roof || 0][2] : C.rubble[pickI(5, 0.25 + vn(x * 0.4, y * 0.4) * 0.6, x, y)];
          } else if (b && b.dmg === 4) { // a mound: highest in the middle, lit from the upper left, roof-tile shards, a chimney stub still standing
            const mx = b.x0 + b.w / 2, my = b.y0 + b.h / 2, dx = (x + 0.5 - mx) / (b.w / 2 + 3), dy = (y + 0.5 - my) / (b.h / 2 + 3), hgt = Math.max(0, 1 - dx * dx - dy * dy);
            const sx = Math.round(b.x0 + 1 + hh(b.seed, 11) * Math.max(0, b.w - 4)), sy = Math.round(b.y0 + 1 + hh(b.seed, 12) * Math.max(0, b.h - 4));
            if ((x === sx || x === sx + 1) && (y === sy || y === sy + 1)) { c = x === sx ? C.facade[1][2] : C.facade[1][1]; break; }
            if (x === sx + 2 && (y === sy || y === sy - 1)) { c = C.shadow; break; }
            const lit = 0.28 + hgt * 0.42 + (-dx * 0.35 + dy * 0.35) * (0.4 + hgt) + (vn(x * 0.45, y * 0.45) - 0.5) * 0.28; // the lower right side is in shade
            c = hh(x * 3, y * 7) < 0.05 ? C.roofs[b.roof || 0][pickI(5, 0.25 + hh(x, y) * 0.4, x, y)] : C.rubble[pickI(5, lit, x, y)];
          } else { const n = vn(x * 0.25, y * 0.25); c = C.rubble[pickI(5, n * 0.9 + (hh(x, y) - 0.5) * 0.35, x, y)]; }
          break; }
        case K.ROAD: { c = C.asph[pickI(4, 0.5 + (vn(x * 0.25, y * 0.25) - 0.5) * 0.4, x, y)]; break; }
        case K.STREET: { const st = streetOf(i); if (st && st.old) { c = C.sett[pickI(4, 0.55 + ((x + (y >> 1)) % 3 === 0 ? -0.3 : 0.08) + (hh(x, y) - 0.5) * 0.35, x, y)]; break; } } // the old town's light setts
          c = C.cobble[pickI(4, 0.45 + (((x >> 1) + (y >> 1)) & 1 ? 0.1 : -0.06) + (hh(x, y) - 0.5) * 0.3, x, y)]; break;
        case K.WALK: c = C.side[pickI(3, 0.55 + (hh(x, y) - 0.5) * 0.4, x, y)]; break;
        case K.PLAZA: if (Br[i] === -5) { const ed = [at(x - 1, y), at(x + 1, y)].some(j => j >= 0 && Kr[j] !== K.PLAZA && Kr[j] !== K.BLDG); c = ed ? C.conc[3] : C.pave[pickI(4, 0.55 + (hh(x, y) - 0.5) * 0.25, x, y)]; break; } // a platform, its edge lighter
          if (Br[i] === -4) { const st = plan.stars.reduce((a, o) => Math.abs(o.y - y) < Math.abs(a.y - y) ? o : a), r = Math.hypot(x + 0.5 - st.x, y + 0.5 - st.y); // the roundabout's lawn with a ring of flowers and a stone kerb
            c = r > st.ri - 1 ? C.side[2] : Math.abs(r - st.ri + 2.6) < 0.7 ? C.fruit[(x + y) & 1] : r < 3.6 ? C.pave[2] : C.grass[pickI(4, 0.6 + (hh(x, y) - 0.5) * 0.3, x, y)]; break; }
          c = C.pave[pickI(4, 0.5 + ((((x >> 2) + (y >> 2)) & 1) ? 0.15 : -0.1), x, y)]; break;
        case K.WATER: if (Br[i] === -7) { const ed = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].some(j => j >= 0 && Kr[j] !== K.WATER); c = ed ? C.field.hedge[2] : C.river[pickI(6, 0.35 + Math.sin(x * 0.5 + y) * 0.08, x, y)]; break; } // the pond, reeds round its edge
          c = C.water[pickI(3, 0.5 + Math.sin(x * 0.7 + y * 0.4) * 0.25, x, y)]; break;
        case K.FRONT: { const b = Br[i] >= 0 ? items[Br[i]] : null; c = b && b.t === 'house' ? C.grass[pickI(4, 0.55 + (vn(x * 0.15, y * 0.15) - 0.5) * 0.4, x, y)] : C.pave[pickI(4, 0.35 + (hh(x, y) - 0.5) * 0.3, x, y)]; break; }
        case K.GARDEN: { const o = Br[i];
          if ((x > 0 && Kr[i - 1] === K.FIELD) || (x < W - 1 && Kr[i + 1] === K.FIELD) || (y > 0 && Kr[i - W] === K.FIELD) || (y < L - 1 && Kr[i + W] === K.FIELD)) { c = C.field.hedge[pickI(3, 0.55 + (hh(x, y) - 0.5) * 0.7, x, y)]; break; } // the hedge along the village edge
          if ((x > 0 && Kr[i - 1] === K.ORCHARD) || (x < W - 1 && Kr[i + 1] === K.ORCHARD) || (y > 0 && Kr[i - W] === K.ORCHARD) || (y < L - 1 && Kr[i + W] === K.ORCHARD)) { c = C.fence; break; } // the garden fence onto the orchard if (o >= 0 && ((x > 0 && Br[i - 1] !== o && Kr[i - 1] === K.GARDEN) || (y > 0 && Br[i - W] !== o && Kr[i - W] === K.GARDEN))) { c = C.fence; break; }
          const bed = o >= 0 && hh(o, 5) < 0.35 && ((x + (o & 3)) % 9 < 4) && ((y + o) % 11 < 5); c = bed ? C.soil[pickI(3, y % 2 ? 0.3 : 0.7, x, y)] : C.grass[pickI(4, 0.5 + (vn(x * 0.12, y * 0.12) - 0.5) * 0.5, x, y)]; break; }
        case K.COURT: c = (vn(x * 0.18, y * 0.18) > 0.62) ? C.grass[pickI(4, 0.35, x, y)] : C.yard[pickI(3, 0.5 + (hh(x, y) - 0.5) * 0.5, x, y)]; break;
        case K.PARK: if (Br[i] === -6) { c = hh(x, y) < 0.012 ? C.field.wheat[4] : C.grass[pickI(4, 0.62 + (vn(x * 0.1, y * 0.1) - 0.5) * 0.4, x, y)]; break; } // the village green
          if (Br[i] === -3 && plan.oldTown) { const O = plan.oldTown, mid = O.rw / 2 + O.belt / 2, e = Math.hypot((x + 0.5 - O.cx) / (O.rx + mid), (y + 0.5 - O.cy) / (O.ry + mid)); // the green belt and its promenade
            c = Math.abs(e - 1) * (O.rx + mid) < 1.1 ? C.gravel[pickI(3, 0.6, x, y)] : C.grass[pickI(4, 0.52 + (vn(x * 0.12, y * 0.12) - 0.5) * 0.5, x, y)]; break; }
          { const pk = plan.parks.find(p => y >= p.ya && y <= p.yb); const px = pk ? x - plan.mx[(pk.ya + pk.yb) >> 1] : x, py = pk ? y - pk.ya : y;
          if (pk && Math.abs(Math.abs(px) - 20 - (py * 0.6) % 20) < 1.1) { c = C.pave[1]; break; } c = C.grass[pickI(4, 0.55 + (vn(x * 0.1, y * 0.1) - 0.5) * 0.6, x, y)]; break; }
        case K.LOT: { const sl = plan.slots.find(s => s.on === 'lot' && Math.abs(s.x - x) <= s.r && Math.abs(s.y - y) <= s.r);
          if (sl) { const rr = Math.hypot(x + 0.5 - sl.x, y + 0.5 - sl.y), ring = sl.kind === 'arty' ? 6 : 4.5; if (Math.abs(rr - ring) < 1.1) { c = ((Math.atan2(y - sl.y, x - sl.x) * 3 | 0) & 1) ? C.sand[1] : C.sand[0]; break; } } // sandbag ring of a gun pit
          c = C.gravel[pickI(3, 0.5 + (hh(x, y) - 0.5) * 0.6, x, y)]; break; }
        case K.CHYARD: c = ((x * 3 + y * 5) % 23 === 0 && hh(x, y) < 0.6) ? C.side[2] : C.grass[pickI(4, 0.45 + (vn(x * 0.2, y * 0.2) - 0.5) * 0.4, x, y)]; break; // gravestones
        case K.MEADOW: if (Br[i] === -8) { const n = vn(x * 0.13, y * 0.13); c = n > 0.64 ? C.soil[pickI(3, 0.5 + (hh(x, y) - 0.5) * 0.6, x, y)] : C.grass[pickI(4, 0.3 + n * 0.4 + (hh(x, y) - 0.5) * 0.3, x, y)]; break; } // waste ground: rough grass and bare earth
          c = C.grass[pickI(4, 0.5 + (vn(x * 0.07, y * 0.07) - 0.5) * 0.7 + (hh(x, y) - 0.5) * 0.15, x, y)]; break;
        case K.RIVER: { const R = riverOf(plan, y), cx2 = clamp(x, 0, W - 1), bs = plan.basins && plan.basins.find(q => x >= q.x0 && x <= q.x1 && y >= q.ya && y <= q.yb);
          let e = bs ? Math.min(x - bs.x0 + 0.5, bs.x1 - x + 0.5, bs.dir > 0 ? bs.yb - y + 0.5 : y - bs.ya + 0.5) : R.hw[cx2] - Math.abs(y + 0.5 - R.yc[cx2]); // a harbour basin's still water
          if (R.island) e = Math.min(e, (Math.sqrt(((x + 0.5 - R.ix) / R.rx) ** 2 + ((y + 0.5 - R.iy) / R.ry) ** 2) - 1) * R.ry);
          let l = 0.32 + (vn(x * 0.06, y * 0.25) - 0.5) * 0.18 + Math.sin(x * 0.11 + y * 0.9) * 0.04; // slow current
          if (((x + Math.floor(y * 7.3)) % 17) < 3 && hh(x >> 2, y) < 0.35) l += 0.16; // streaks of the current
          if (e < 1.5) l += 0.4; else if (e < 3.5) l += 0.2; // the shallow edge
          const sh = [at(x - 1, y + 1), at(x - 2, y + 1), at(x - 3, y + 2)].some(j => j >= 0 && (Kr[j] === K.BRIDGE || Kr[j] === K.RBRIDGE)); if (sh) l -= 0.45; // the bridge's shadow on the water
          const pl = at(x - 1, y), pr = at(x + 1, y); if (((pl >= 0 && Kr[pl] === K.BRIDGE) || (pr >= 0 && Kr[pr] === K.BRIDGE)) && (y % 9) < 3) { c = C.conc[2]; break; } // a pier
          c = C.river[pickI(6, l, x, y)]; break; }
        case K.BRIDGE: { const st = streetOf(i), sp = st && st.cls !== 'arterial' ? (st.pts.find(q => q[1] === y) || st.pts[0]) : null, xc = st ? (sp ? sp[0] : plan.mx[y]) : x, wd = st ? (sp ? sp[2] : plan.aw[y]) : 8, dd = Math.abs(x + 0.5 - xc);
          if (dd > wd / 2 - 1) { c = (y % 3) === 0 ? C.shadow : x < xc ? C.conc[3] : C.conc[2]; break; } // balustrade: stone posts, lit on the left
          if (dd > (st && st.tank ? 5 : 3.5)) { c = C.side[pickI(3, 0.6, x, y)]; break; }
          c = st && st.tank ? C.asph[pickI(4, 0.5 + (vn(x * 0.25, y * 0.25) - 0.5) * 0.4, x, y)] : C.cobble[pickI(4, 0.45 + (hh(x, y) - 0.5) * 0.3, x, y)]; break; }
        case K.QUAY: if (Br[i] === -11) { const sea = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].some(j => j >= 0 && Kr[j] === K.SEA); c = sea ? C.rubble[pickI(5, 0.35 + hh(x, y) * 0.5, x, y)] : ((x + (y >> 1)) % 4 === 0 || y % 3 === 0) ? C.conc[0] : C.conc[2]; break; } // a breakwater: dressed stone, rubble where the sea breaks on it
          if (Br[i] === -12) { c = (x + y) % 3 === 0 ? C.conc[1] : C.conc[3]; break; } // a slipway's concrete ramp
          { const nW = (j => j >= 0 && (Kr[j] === K.RIVER || Kr[j] === K.SEA)); if (nW(at(x, y - 1)) || nW(at(x, y + 1)) || nW(at(x - 1, y)) || nW(at(x + 1, y))) { c = hh(x, y) < 0.06 ? C.shadow : C.conc[0]; break; } // the wall face above the water
          c = C.pave[pickI(4, 0.62 + (hh(x >> 1, y) - 0.5) * 0.25 + ((x % 6) === 0 ? -0.15 : 0), x, y)]; break; }
        case K.WORKS: { const nb = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].some(j => j >= 0 && (Kr[j] === K.MEADOW || Kr[j] === K.FIELD || Kr[j] === K.GARDEN || Kr[j] === K.COURT)); // a cinder yard with oil stains, fenced where it meets open ground
          c = nb ? ((x + y) % 2 ? C.fence : C.conc[1]) : hh(x >> 1, y >> 1) < 0.015 ? C.char[1] : C.gravel[pickI(3, 0.35 + (vn(x * 0.2, y * 0.2) - 0.5) * 0.5, x, y)]; break; }
        case K.RAIL: { const m = RMx[i]; c = m === 2 ? C.rail[(y & 1) ? 0 : 1] : m === 3 ? C.beam : m === 4 ? (hh(x, y) < 0.18 ? C.gravel[1] : C.grass[pickI(4, 0.3 + (vn(x * 0.2, y * 0.2) - 0.5) * 0.4, x, y)]) : C.gravel[pickI(3, 0.25 + (hh(x, y) - 0.5) * 0.5, x, y)]; break; } // ballast, sleepers, rails, the grassy verge
        case K.RBRIDGE: { const m = RMx[i]; c = m === 2 ? C.rail[(y & 1) ? 0 : 1] : m === 3 ? C.beam : m === 5 ? ((y % 4) < 2 ? C.conc[0] : C.shadow) : C.char[1]; break; } // a rail bridge: iron truss each side, a deck with sleepers
        case K.SEA: { if (seaPix && Br[i] === -10) { c = seaPix(x, y, true); break; } // a host's own water (the game's sea), calmer in the harbour
          if (Br[i] === -10) { c = C.sea[pickI(6, 0.26 + (vn(x * 0.08, y * 0.08) - 0.5) * 0.12 + Math.sin(x * 0.4 + y * 0.9) * 0.03, x, y)]; break; } // calm water in the harbour
          const cs = plan.coast.cs, d = Math.max(cs * (x - plan.coast.xs[y]), plan.coast.yC !== null ? (y - plan.coast.ycol[x]) * plan.coast.hd : -1e9), j = at(x - cs, y);
          const jh = plan.coast.yC !== null ? at(x, y - plan.coast.hd) : -1; if (d < 1.5 && ((j >= 0 && Kr[j] === K.BEACH) || (jh >= 0 && Kr[jh] === K.BEACH))) { c = C.foam; break; } if (d < 3.5 && j >= 0 && hh(x, y >> 1) < 0.4) { c = C.sea[5]; break; } // the surf on the beach
          if (seaPix) { c = seaPix(x, y, false, plan.calm ? plan.calm[i] / 255 : 0); break; } // (calm: how close a harbour basin is)
          c = C.sea[pickI(6, 0.62 - Math.min(d, 70) * 0.006 + Math.sin(x * 0.21 + y * 0.13 + Math.sin(y * 0.05) * 2) * 0.07 + (vn(x * 0.05, y * 0.04) - 0.5) * 0.18, x, y)]; break; } // deeper away from the shore, long swells
        case K.APRON: { if (opts && opts.apronPix) { c = opts.apronPix(x, y); break; } let l = 0.58 + (vn(x * 0.1, y * 0.1) - 0.5) * 0.25; if ((x - 4) % 24 === 0 || y % 24 === 0) l -= 0.3; if (vn(x * 0.05 + 70, y * 0.05) > 0.72) l -= 0.15; c = C.conc[pickI(4, l, x, y)]; break; } // an airfield's concrete apron (as the game's final airfield)
        case K.TRENCH: { const rim = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].some(j => j >= 0 && Kr[j] !== K.TRENCH); c = rim ? C.sand[1] : C.char[pickI(3, 0.5 + (hh(x, y) - 0.5) * 0.4, x, y)]; break; } // a trench: dark, a sandbag rim
        case K.BEACH: if (Br[i] === -13) { c = hh(x, y) < 0.16 || vn(x * 0.15, y * 0.15) > 0.62 ? C.field.hedge[pickI(3, 0.5 + hh(x, y) * 0.4, x, y)] : C.sand[pickI(2, 0.45 + (vn(x * 0.25, y * 0.25) - 0.5) * 0.6, x, y)]; break; } // dunes: sand under marram grass
        { const cs = plan.coast ? plan.coast.cs : 1, j = at(x + cs, y), wet = j >= 0 && Kr[j] === K.SEA; c = wet ? C.sand[0] : hh(x, y) < 0.05 ? C.field.hedge[2] : C.sand[pickI(2, 0.55 + (vn(x * 0.2, y * 0.2) - 0.5) * 0.6, x, y)]; break; } // sand, wet at the waterline, tufts of dune grass
        case K.TRACK: { const up = y + 1 < L && Kr[i + W] === K.TRACK, dn = y > 0 && Kr[i - W] === K.TRACK; // two wheel ruts with grass between them
          c = up && dn ? C.field.grass[pickI(5, 0.3 + (hh(x, y) - 0.5) * 0.5, x, y)] : C.sand[hh(x, y) < 0.7 ? 0 : 1]; break; }
        case K.BANK: c = hh(x, y) < 0.22 ? C.field.wheat[1] : (y + x * 3) % 5 === 0 ? C.field.hedge[2] : C.soil[pickI(3, 0.4 + (vn(x * 0.3, y * 0.3) - 0.5) * 0.5, x, y)]; break; // mud and reeds
        case K.ORCHARD: c = (hh(x, y) < 0.02) ? C.field.wheat[4] : C.field.grass[pickI(5, 0.62 + (vn(x * 0.09, y * 0.09) - 0.5) * 0.35, x, y)]; break; // mown meadow, a few flowers
        default: c = parcelPix(plan, i, x, y);
      }
      // facades and shadows: the view is slightly from the south, so a building shows its south wall below its roof (as in the game)
      if (k !== K.BLDG) {
        let f = null; for (let kk = 1; kk <= 3; kk++) { const b = bAt(x, y + kk); if (b) { f = [b, kk]; break; } }
        if (f) { const [b, kk] = f; if (b.part === 'apse' || b.dmg >= 3) { if (kk === 1) c = C.shadow; }
          else if (b.part === 'casemate' || b.part === 'atwall' || b.part === 'pillbox' || b.part === 'tobruk' || b.part === 'radar') { if (kk === 1) c = C.conc[0]; else if (kk === 2) c = C.shadow; } // low concrete: a bare wall, no windows
          else if (kk === 3) c = C.shadow; else { const pal = C.facade[b.church ? 2 : (hh(b.seed, 51) * 3) | 0]; c = x % 3 === 1 ? (hh(x >> 1, b.seed + kk) < (b.dmg ? 0.04 : 0.12) ? C.lit : C.dark) : pal[kk === 1 ? 2 : 1]; } }
        else if (bAt(x - 1, y) || bAt(x - 2, y + 1) || bAt(x - 1, y + 4)) c = [c[0] * 0.55 | 0, c[1] * 0.55 | 0, c[2] * 0.6 | 0];
      }
      const o = (sr * W + x) * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
    }
  }
  // craters, trees (shadow first), fires: drawn over the ground
  const put = (x, y, c, a = 1) => { const sr = y0 + h - 1 - y; if (x < 0 || x >= W || sr < 0 || sr >= h) return; const o = (sr * W + x) * 4; if (a >= 1) { d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; } else { d[o] = d[o] * (1 - a) + c[0] * a; d[o + 1] = d[o + 1] * (1 - a) + c[1] * a; d[o + 2] = d[o + 2] * (1 - a) + c[2] * a; } };
  for (const cr of plan.craters) { if (cr.y + cr.r + 3 < y0 || cr.y - cr.r - 3 >= y0 + h) continue; // its rim reaches 2 px past r
    for (let yy = Math.floor(cr.y - cr.r - 2); yy <= cr.y + cr.r + 2; yy++) for (let xx = Math.floor(cr.x - cr.r - 2); xx <= cr.x + cr.r + 2; xx++) { const rr = Math.hypot(xx + 0.5 - cr.x, yy + 0.5 - cr.y); if (rr < cr.r) put(xx, yy, rr < cr.r - 1.2 ? C.rubble[0] : C.rubble[2]); else if (rr < cr.r + 2 && hh(xx, yy) < 0.6) put(xx, yy, C.shadow, 0.45); } }
  for (const b of plan.boats) { if (b.y0 + b.h < y0 || b.y0 >= y0 + h) continue; // a barge: dark hull, a lighter deck, cargo, a cabin at the stern
    for (let yy = b.y0; yy < b.y0 + b.h; yy++) for (let xx = b.x0; xx < b.x0 + b.w; xx++) { const lx = xx - b.x0, ly = yy - b.y0, edge = lx === 0 || ly === 0 || lx === b.w - 1 || ly === b.h - 1;
      let c = edge ? C.hull[0] : lx >= b.w - 4 ? (ly === 1 ? C.conc[3] : C.conc[1]) : b.cargo === 0 ? C.char[pickI(3, 0.5 + hh(xx, yy) * 0.4, xx, yy)] : b.cargo === 1 ? C.hull[pickI(3, 0.6 + ((lx % 4 === 0) ? -0.4 : 0), xx, yy)] : C.gravel[pickI(3, 0.6, xx, yy)];
      if (b.dmg && hh(xx * 3, yy) < 0.25) c = C.shadow; put(xx, yy, c); }
    for (let xx = b.x0 + 1; xx < b.x0 + b.w + 1; xx++) put(xx, b.y0 - 1, C.shadow, 0.4); }
  for (const sh of plan.ships || []) { const horiz = sh.ori !== 'v', Lg = horiz ? sh.w : sh.h, Dg = horiz ? sh.h : sh.w; if ((horiz ? sh.y0 + sh.h : sh.y0 + sh.h) < y0 - 2 || sh.y0 > y0 + h + 2) continue;
    for (let pass = 0; pass < 2; pass++) for (let a = 0; a < Lg; a++) for (let q = 0; q < Dg; q++) { // a ship from above: hull tapering to the bow, deck, hatches, the bridge and the funnel aft; its shadow first
      const u = sh.bow > 0 ? a : Lg - 1 - a, half = (Dg - 1) / 2, cb = Math.abs(q - half), tb = Lg - 1 - u; let wd = half + 0.5; if (tb < 9) wd *= Math.sqrt((tb + 0.5) / 9.5); if (u < 2) wd -= (2 - u) * 0.5; if (cb > wd) continue;
      const px = horiz ? sh.x0 + a : sh.x0 + q, py = horiz ? sh.y0 + q : sh.y0 + a; if (pass === 0) { put(px + 2, py - 2, C.shadow, 0.3); continue; }
      const edge = cb > wd - 1, f = u / Lg; let c;
      if (sh.kind === 'uboat') c = edge ? C.shadow : Math.abs(f - 0.55) < 0.07 && cb < 1.6 ? C.conc[2] : C.conc[0];
      else if (sh.kind === 'lcvp') c = edge ? C.shadow : f > 0.82 ? C.conc[2] : cb < half - 1 && f > 0.15 ? (sh.dmg && hh(px, py) < 0.4 ? C.char[0] : C.char[1]) : C.field.crop[1]; // a landing craft: its ramp, the open well, olive sides
      else if (sh.kind === 'hull') { if (!(edge || u % 3 === 0 || cb < 0.6)) continue; c = u % 3 === 0 && !edge ? C.rust || C.roofs[1][2] : C.beam; } // ribs on the keel, open between them
      else { const bridge = f > 0.08 && f < 0.24, funnel = Math.abs(f - 0.14) < 0.035 && cb < 1.3;
        c = edge ? C.shadow : funnel ? (cb < 0.6 ? C.fire[2] : C.char[0]) : bridge ? (q % 2 === 0 && Math.abs(f - 0.2) < 0.02 ? C.dark : C.side[2])
          : sh.kind === 'tanker' ? (cb < 0.6 ? C.conc[3] : C.roofs[1][1]) : (f > 0.3 && f < 0.92 && (u % 7) > 1 && cb < half - 1) ? C.char[1] : C.conc[1];
        if (sh.dmg && hh(px * 3, py * 5) < 0.18) c = C.char[0]; }
      put(px, py, c); } }
  if (plan.perimeter) { const pm = plan.perimeter; // the airfield's fence (posts and wire), the gate's barrier, buffer stops at the end of the tracks
    if (pm.fence >= y0 - 2 && pm.fence <= y0 + h + 2) for (let x = 0; x < W; x++) { if (Math.abs(x + 0.5 - pm.gate) < pm.gw / 2 + 1) continue; if (x % 5 === 0) { put(x, pm.fence, C.beam); put(x, pm.fence + 1, C.beam); put(x + 1, pm.fence - 1, C.shadow, 0.35); } else put(x, pm.fence + (x % 2), C.dark); }
    if (pm.fence >= y0 - 2 && pm.fence <= y0 + h + 2) for (let x = Math.round(pm.gate - pm.gw / 2); x <= pm.gate + pm.gw / 2 - 2; x++) put(x, pm.fence, ((x >> 1) % 2) ? C.lit : C.fire[1]);
    for (const b of pm.stops) { if (b.y < y0 - 3 || b.y > y0 + h + 3) continue; for (let x = b.x0; x <= b.x1; x++) { put(x, b.y, C.fire[1]); put(x, b.y + 1, C.dark); } } }
  for (const tn of plan.tunnels || []) { if (tn.y + 26 < y0 || tn.y - 26 >= y0 + h) continue; const { x: tx, y: ty, dir } = tn, soft = k => k === K.BEACH || k === K.MEADOW || k === K.FRONT || k === K.GARDEN || k === K.LOT || k === K.WORKS || k === K.NONE || k === K.FIELD || k === K.PARK || k === K.RUBBLE || k === K.RAIL || k === K.TRACK || k === K.BANK;
    // sized for the game's trains (16 px wide): a 22 px round-topped mouth in a 28 x 7 px sandstone face, the track's centre its axis; over it a
    // mound of sandy rock up to 36 px across and 24 rows long, symmetric about the track, as wide as the open ground allows on both sides (never over a street or a building)
    const open = (xx, yy) => { const j = at(xx, yy); return j >= 0 && soft(Kr[j]); };
    let hwPrev = 12;
    for (let k = 1; k <= 24; k++) { const yy = ty + dir * (k + 6); let hw = Math.min(hwPrev + 1.5, 12 + k * 1.2, 18, 18 - Math.max(0, k - 14) * 1.6); // wider than the portal, round at its far end let free = 0; while (free < hw && open(tx - 1 - free, yy) && open(tx + free, yy)) free++; hw = Math.min(hw, free); if (hw < 4) break; hwPrev = hw;
      for (let xx = tx - Math.floor(hw); xx < tx + Math.floor(hw); xx++) { const e = Math.abs(xx + 0.5 - tx) / hw, n = hh(xx * 3, yy * 5);
        put(xx, yy, e > 0.88 ? TUN[0] : n < 0.07 ? C.conc[1] : n < 0.11 ? C.field.grass[1] : TUN[pickI(5, 0.85 - e * 0.6 - k * 0.015 + (vn(xx * 0.3, yy * 0.3) - 0.5) * 0.35, xx, yy)]); } } // rocks and a few grass tufts
    const MW = [11, 11, 11, 11, 10, 7.5, 0]; // the mouth's half-width per row: straight sides, a round top
    for (let r = 0; r <= 6; r++) for (let xx = tx - 14; xx <= tx + 13; xx++) { const yy = ty + dir * r, dx = xx + 0.5 - tx, inner = Math.abs(dx) < MW[r], j = at(xx, yy);
      if (!inner && j >= 0 && (Kr[j] === K.BLDG || Kr[j] === K.ROAD || Kr[j] === K.STREET)) continue; // never over a building or a carriageway
      let c; if (inner) c = r === 0 ? C.dark : r <= 2 ? C.shadow : TUN_IN; // the mouth, darkening into the tunnel
      else { const course = r % 2 ? (xx + 2) % 6 === 0 : xx % 6 === 0; c = r === 6 || Math.abs(dx) > 13 ? TUN[0] : Math.abs(dx) < MW[r] + 1.6 ? TUN[4] : course ? TUN[1] : TUN[pickI(5, 0.62 + (hh(xx, yy) - 0.5) * 0.3 + (r <= 1 ? -0.15 : 0), xx, yy)]; } // dressed sandstone blocks, a light arch ring
      put(xx, yy, c); }
    for (let xx = tx - 14; xx <= tx + 13; xx++) { const j = at(xx, ty - dir); if (j >= 0 && soft(Kr[j])) put(xx, ty - dir, C.shadow, 0.4); } }
  for (const o of plan.obstacles || []) { if (o.y < y0 - 4 || o.y > y0 + h + 4) continue; // Czech hedgehogs, mined stakes, dragon's teeth
    if (o.kind === 'hedgehog') { for (let k = -2; k <= 2; k++) { put(o.x + k, o.y + k, C.shadow); put(o.x + k, o.y - k, C.shadow); } put(o.x + 1, o.y - 1, C.conc[3]); put(o.x - 1, o.y + 1, C.conc[3]); put(o.x + 3, o.y - 2, C.shadow, 0.35); }
    else if (o.kind === 'stake') { put(o.x, o.y, C.beam); put(o.x, o.y + 1, C.beam); put(o.x, o.y + 2, C.fence); put(o.x + 1, o.y + 2, C.dark); put(o.x + 1, o.y - 1, C.shadow, 0.35); }
    else { put(o.x, o.y, C.conc[3]); put(o.x + 1, o.y, C.conc[2]); put(o.x, o.y - 1, C.conc[1]); put(o.x + 1, o.y - 1, C.shadow); } }
  for (const wr of plan.wires || []) for (const [wx, wy] of wr) { if (wy < y0 - 2 || wy > y0 + h + 2) continue; if (wx % 6 === 0) { put(wx, wy, C.beam); put(wx, wy + 1, C.beam); } else if ((wx + wy) % 2 === 0) put(wx, wy + ((wx >> 1) % 2), C.dark); } // barbed wire on posts
  for (const br of plan.barrels || []) for (let k = 0; k < br.len; k++) { put(br.x, br.y + br.dir * k, C.dark); put(br.x + 1, br.y + br.dir * k - 1, C.shadow, 0.3); } // the guns
  for (const gt of plan.gantries || []) { if (gt.h) { for (let xx = gt.x0; xx <= gt.x1; xx++) { put(xx, gt.y, C.crane[(xx >> 1) % 2]); put(xx + 1, gt.y - 1, C.shadow, 0.35); } continue; } if (gt.y1 < y0 || gt.y0 > y0 + h) continue; for (let yy = gt.y0; yy <= gt.y1; yy++) { put(gt.x, yy, C.crane[(yy >> 1) % 2]); put(gt.x + 1, yy - 1, C.shadow, 0.35); } } // a gantry crane over the slipways
  for (const cr of plan.cranes || []) { if (cr.y + 14 < y0 || cr.y - 14 >= y0 + h) continue; // a crane: a dark base on the quay, a yellow lattice jib over the water, its shadow
    for (let k = 1; k <= 11; k++) put(Math.round(cr.x + cr.dx * k) + 2, Math.round(cr.y + cr.dy * k) - 2, C.shadow, 0.35);
    for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) put(cr.x + xx, cr.y + yy, C.hull[0]);
    for (let k = 1; k <= 11; k++) put(Math.round(cr.x + cr.dx * k), Math.round(cr.y + cr.dy * k), C.crane[k % 2]); put(Math.round(cr.x + cr.dx * 11), Math.round(cr.y + cr.dy * 11) - 1, C.shadow); }
  for (const hp of plan.heaps || []) for (let yy = Math.floor(hp.y - hp.r); yy <= hp.y + hp.r; yy++) for (let xx = Math.floor(hp.x - hp.r); xx <= hp.x + hp.r; xx++) { // coal or gravel heaps
    const dx = (xx + 0.5 - hp.x) / hp.r, dy = (yy + 0.5 - hp.y) / hp.r, q = 1 - dx * dx - dy * dy; if (q <= 0) continue; const l = 0.2 + q * 0.4 + (-dx + dy) * 0.25;
    put(xx, yy, hp.coal ? C.char[pickI(3, l, xx, yy)] : C.gravel[pickI(3, l, xx, yy)]); }
  for (const sm of plan.steam || []) for (let k = 0; k <= 6; k++) { const px = sm.x + WIND[0] * k * 4, py = sm.y + WIND[1] * k * 4, r = sm.r * (0.7 + k * 0.12); // steam from a cooling tower, white and dissolving downwind
    for (let yy = Math.floor(py - r); yy <= py + r; yy++) for (let xx = Math.floor(px - r); xx <= px + r; xx++) { const dd = Math.hypot(xx + 0.5 - px, yy + 0.5 - py) / r; if (dd < 1 && hh(xx * 5, yy * 3) < 0.8 - dd * 0.3) put(xx, yy, SMOKE[3], (0.36 - k * 0.045) * (1 - dd * 0.5)); } }
  for (const sk of plan.stacks || []) for (let k = 1; k <= (sk.big ? 8 : 5); k++) { const px = sk.x + WIND[0] * k * 3, py = sk.y + WIND[1] * k * 3, r = 1.2 + k * 0.5; // a thin smoke plume from the chimney
    for (let yy = Math.floor(py - r); yy <= py + r; yy++) for (let xx = Math.floor(px - r); xx <= px + r; xx++) if (Math.hypot(xx + 0.5 - px, yy + 0.5 - py) < r && hh(xx * 7, yy * 3) < 0.7) put(xx, yy, SMOKE[Math.min(3, 1 + (k >> 1))], 0.34 - k * 0.04); }
  for (const t of plan.trees) { if (t.y + t.r + 4 < y0 || t.y - t.r - 4 >= y0 + h) continue;
    for (let yy = -t.r; yy <= t.r; yy++) for (let xx = -t.r; xx <= t.r; xx++) if (xx * xx + yy * yy <= t.r * t.r) put(t.x + xx + 2, t.y + yy - 2, C.shadow, 0.4);
    for (let yy = -t.r; yy <= t.r; yy++) for (let xx = -t.r; xx <= t.r; xx++) { const dd = (xx * xx + yy * yy) / (t.r * t.r); if (dd > 1) continue;
      if (dd > 0.72) { put(t.x + xx, t.y + yy, C.tree[0]); continue; }
      if (t.fruit && dd < 0.7 && hh(t.x * 5 + xx, t.y * 3 + yy) < 0.14) { put(t.x + xx, t.y + yy, hh(t.x, t.y) < 0.5 ? C.fruit[0] : C.fruit[1]); continue; }
      const l = 0.42 + 0.38 * (-0.55 * xx / t.r + 0.75 * yy / t.r) + 0.3 * (Math.sqrt(1 - dd) - 0.5) + (t.fruit ? 0.12 : t.v === 4 ? 0.2 : (t.v - 1) * 0.05); put(t.x + xx, t.y + yy, C.tree[pickI(6, clamp(l, 0, 1), t.x + xx, t.y + yy)]); } }
  // soot around gutted and burning houses
  for (const it of items) { if (!(it.dmg >= 3 || it.fire) || it.y0 + it.h + 4 < y0 || it.y0 - 4 >= y0 + h) continue;
    for (let yy = it.y0 - 4; yy < it.y0 + it.h + 4; yy++) for (let xx = it.x0 - 4; xx < it.x0 + it.w + 4; xx++) { const o = at(xx, yy); if (o < 0 || Kr[o] === K.BLDG || Br[o] === it.id) continue;
      const dd = Math.max(it.x0 - xx, xx - (it.x0 + it.w - 1), it.y0 - yy, yy - (it.y0 + it.h - 1)); if (dd > 0 && hh(xx * 3, yy * 7) < 0.75 - dd * 0.17) put(xx, yy, C.char[0], 0.42); } }
  if (opts && opts.night) paintNight(plan, d, y0, h);
  const fput = opts && opts.night ? (x, y, c, a) => put(x, y, nightC(c), a) : put; // at night the smoke is graded like the ground, the flames stay bright
  if (!(opts && opts.noFx)) for (const f of plan.fires) { const bx = fireBox(f); if (bx.y1 < y0 || bx.y0 >= y0 + h) continue; fireFx(plan, f, 0, fput); }
}
// Night (opts.night, Enigma level 3): a moonlit grade over everything painted so far (darker, less saturated, blue), with the blackout's
// lit windows turned dark, then the plan's own lights added on top (nightLights). Fires are drawn after it, at full brightness. Every light
// comes from the plan, not from pixels, so a chunk painted in bands is the same as one painted whole.
const nightC = c => { if (c[0] > 190) return c; const l = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]; return [(l + (c[0] - l) * 0.4) * 0.42 + 6, (l + (c[1] - l) * 0.4) * 0.48 + 9, (l + (c[2] - l) * 0.4) * 0.66 + 24]; }; // the grade for one colour; fire colours pass
function paintNight(plan, d, y0, h) {
  const W = plan.W, L = plan.L, lit = C.lit, dk = C.dark;
  for (let sr = 0; sr < h; sr++) { const y = y0 + h - 1 - sr; if (y < 0 || y >= L) continue;
    for (let x = 0, o = sr * W * 4; x < W; x++, o += 4) { let r = d[o], g = d[o + 1], b = d[o + 2];
      if (r === lit[0] && g === lit[1] && b === lit[2]) { r = dk[0]; g = dk[1]; b = dk[2]; } // blacked out
      const l = 0.299 * r + 0.587 * g + 0.114 * b; d[o] = (l + (r - l) * 0.4) * 0.42 + 6; d[o + 1] = (l + (g - l) * 0.4) * 0.48 + 9; d[o + 2] = (l + (b - l) * 0.4) * 0.66 + 24; } }
  const add = (x, y, c, a) => { const sr = y0 + h - 1 - y; if (x < 0 || x >= W || sr < 0 || sr >= h) return; const o = (sr * W + x) * 4; d[o] += c[0] * a; d[o + 1] += c[1] * a; d[o + 2] += c[2] * a; }; // Uint8Clamped: saturates
  for (const q of nightLights(plan)) { if (q.y + q.r < y0 || q.y - q.r >= y0 + h) continue;
    if (q.r > 0) for (let yy = Math.floor(q.y - q.r); yy <= q.y + q.r; yy++) for (let xx = Math.floor(q.x - q.r); xx <= q.x + q.r; xx++) { const e = Math.hypot(xx + 0.5 - q.x, yy + 0.5 - q.y) / q.r; if (e < 1) add(xx, yy, q.c, q.a * (1 - e) * (1 - e)); }
    if (q.px) for (const [xx, yy, c] of q.px) add(xx, yy, c, 1); }
}
const NL = { warm: HX(['#e8c46e'])[0], warm2: HX(['#c8a05a'])[0], fire: HX(['#ff8028'])[0], furnace: HX(['#ff5a28'])[0], shift: HX(['#ff9638'])[0], steam: HX(['#ff8c46'])[0] };
// The plan's lights at night, built once per plan: about one house in ten shows a crack of light in a facade window (blocks and public buildings up
// to three), halls on a night shift glow through their painted-over north lights, chimneys and furnaces glow, cooling-tower steam is lit from
// below, and every fire lights the street around it. { x, y, r, c, a } is a glow (plan coordinates), px a list of bright pixels [x, y, colour].
function nightLights(plan) {
  if (plan.lights) return plan.lights;
  const out = [], { W, L, K: Kr, B: Br, items } = plan, kAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= L) ? -1 : Kr[y * W + x];
  const facadeOf = (x, y) => { for (let kk = 1; kk <= 3; kk++) { const j = kAt(x, y + kk); if (j === K.BLDG) return items[Br[(y + kk) * W + x]]; } return null; };
  for (const it of items) {
    if (it.t === 'works') { const cx = it.x0 + it.w / 2, cy = it.y0 + it.h / 2;
      if (it.style === 'saw' && hh(it.id, 9) < 0.45) { const px = []; for (let y = it.y0 + 1; y < it.y0 + it.h - 1; y += 3) for (let x = it.x0 + 1; x < it.x0 + it.w - 1; x++) px.push([x, y, NL.shift.map(v => v * 0.45)]); out.push({ x: cx, y: cy, r: 0, px }); }
      if (it.style === 'chimney' || it.part === 'chimney') out.push({ x: cx, y: cy, r: 12, c: NL.furnace, a: 0.7 });
      if (it.part === 'cooling') out.push({ x: cx, y: cy, r: it.w * 0.9, c: NL.steam, a: 0.35 });
      continue; }
    if (!['house', 'terrace', 'block', 'farm', 'civic', 'store', 'station'].includes(it.t) || it.dmg >= 2 || it.fire || it.round) continue;
    const n = it.t === 'block' || it.t === 'civic' || it.t === 'station' ? 3 : 1;
    for (let k = 0; k < n; k++) { if (hh(it.id, 50 + k) > 0.1) continue;
      for (let tries = 0; tries < 4; tries++) { // a window on the south facade: the column every third pixel, one or two rows below the wall
        const x = it.x0 + 1 + 3 * Math.floor(hh(it.id, 60 + k * 4 + tries) * Math.max(1, (it.w - 2) / 3)), y = it.y0 - 1 - (hh(it.id, 70 + k) < 0.5 ? 0 : 1);
        if (x % 3 !== 1 || x >= it.x0 + it.w || kAt(x, y) === K.BLDG || kAt(x, y) < 0 || facadeOf(x, y) !== it) continue;
        out.push({ x: x + 0.5, y: y + 0.5, r: 6, c: NL.warm, a: 0.45, px: [[x, y, NL.warm]] }); break; } } }
  for (const f of plan.fires) out.push({ x: f.x, y: f.y, r: Math.max(f.w, f.h) + 16, c: NL.fire, a: 0.42 });
  return (plan.lights = out);
}
// A burning house (spec: convincing fire): an orange glow on its surroundings, flames from the core licking past the roof edge and leaning with
// the wind, embers, and a dithered smoke plume drifting downwind. t is time in seconds: paint() draws t = 0; paintFx() animates it.
const TUN = HX(['#5a4a32', '#7a6644', '#968058', '#b29a6c', '#ccb486']), TUN_IN = HX(['#241c14'])[0]; // a tunnel portal's sandstone
const FIRE = HX(['#fff3c4', '#f6d04a', '#f08a30', '#c63c1c']), GLOW = HX(['#ff8a32'])[0], SMOKE = HX(['#3a3532', '#5e5853', '#857e78', '#a8a19a']), WIND = [0.45, 1];
function fireFx(plan, f, t, put) {
  const s = f.seed, cx = f.x, cy = f.y, w = f.w, x0 = f.x0, y0 = f.y0, x1 = x0 + w - 1, y1 = y0 + f.h - 1, R = Math.max(w, f.h) / 2 + 9;
  for (let yy = Math.floor(cy - R); yy <= cy + R; yy++) for (let xx = Math.floor(cx - R); xx <= cx + R; xx++) { const r = Math.hypot(xx + 0.5 - cx, yy + 0.5 - cy) / R; if (r < 1) put(xx, yy, GLOW, 0.18 * (1 - r) * (1 - r) * (0.8 + 0.2 * Math.sin(t * 9 + s))); }
  // flames break through at one to three hot spots, with a small white core, and lick a few pixels past the roof, leaning with the wind
  const nh = 1 + (s % 3), hot = []; for (let k = 0; k < nh; k++) hot.push([x0 + 1 + hh(s, k) * Math.max(1, w - 2), y0 + 1 + hh(s, k + 5) * Math.max(1, f.h - 2), 1.6 + Math.min(w, f.h) * (0.18 + hh(s, k + 9) * 0.14)]);
  for (let yy = y0 - 1; yy <= y1 + 7; yy++) for (let xx = x0 - 2; xx <= x1 + 5; xx++) {
    let heat = 0; for (const [hx, hy, hr] of hot) { const up = Math.max(0, yy - hy), dx = xx + 0.5 - hx - up * 0.4, dy = (yy + 0.5 - hy) * (yy > hy ? 0.55 : 1.2); heat = Math.max(heat, 1 - Math.hypot(dx, dy) / hr); }
    if (heat <= 0) continue;
    const v = heat * 0.95 + (vn(xx * 0.8 + (s % 97), yy * 0.6 - t * 7) - 0.5) * 0.55 - (yy > y1 ? (yy - y1) * 0.06 : 0);
    if (v > 0.82) put(xx, yy, FIRE[0]); else if (v > 0.66) put(xx, yy, FIRE[1]); else if (v > 0.5) put(xx, yy, FIRE[2]); else if (v > 0.36) put(xx, yy, FIRE[3]);
  }
  for (let k = 0; k < 4; k++) { const ph = (t * 0.8 + k / 4 + (s % 13) / 13) % 1, ex = cx + WIND[0] * ph * 14 + Math.sin(k * 3 + t * 5) * 2, ey = y1 + ph * 16; if (hh(k + s, Math.floor(t * 8)) < 0.7) put(Math.round(ex), Math.round(ey), FIRE[1]); }
  // the smoke column: dense and dark near the fire, spreading and thinning downwind
  for (let k = 0; k < 12; k++) { const ph = ((k + t * 1.4) % 12) / 12, d = ph * 64, px = cx + WIND[0] * d + Math.sin(ph * 7 + s) * 2.5, py = y1 + 2 + WIND[1] * d, r = 2.6 + ph * 8, a = 0.92 * (1 - ph * 0.85);
    for (let yy = Math.floor(py - r); yy <= py + r; yy++) for (let xx = Math.floor(px - r); xx <= px + r; xx++) { const q = ((xx + 0.5 - px) ** 2 + (yy + 0.5 - py) ** 2) / (r * r); if (q > 1) continue;
      if (bay(xx, yy) + 0.5 + (hh(xx * 7 + k, yy * 3 + Math.floor(t * 4)) - 0.5) * 0.45 < a * (1 - q * 0.6) * 1.15) put(xx, yy, ph < 0.12 ? SMOKE[0] : q > 0.55 ? SMOKE[3] : ph < 0.45 ? SMOKE[1] : SMOKE[2], ph < 0.12 ? 0.55 : 0.4); } } // see-through: the ground shows through the column // dark at the source, a lighter rim, greyer downwind
}
// The box a fire draws into (plan coordinates), for the animated layer.
// The rivers' flow for one moment t (seconds), as the game's drawRiverFlow does it: light streaks drifting with the current in four lanes
// (faster in the middle), plus glints that flash about four times a second. Returns small rectangles in plan coordinates for the caller
// to draw over the painted ground: { x, y, w, a (alpha), c (colour) }, one pixel high. Only rows y0 .. y1 are looked at.
function riverFx(plan, t, y0, y1) {
  const out = [], W = plan.W, Kr = plan.K, lo = y0 === undefined ? 0 : y0, hi = y1 === undefined ? plan.L : y1, wet = (x, y) => x >= 0 && x < W && y >= lo && y < hi && Kr[y * W + x] === K.RIVER;
  for (const R of plan.rivers || []) { if (R.yMax < lo || R.yMin > hi) continue;
    for (const lane of [-0.62, -0.22, 0.22, 0.62]) { const spd = Math.abs(lane) < 0.4 ? 20 : 12;
      for (let i = 0; i < 10; i++) {
        const x = Math.round((((i * 26 + R.flow * t * spd + lane * 97) % (W + 24)) + W + 24) % (W + 24) - 12); if (x < 0 || x >= W) continue;
        const y = Math.round(R.yc[x] + lane * R.hw[x]), ph = (i + Math.round(lane * 10) + 8) & 3; let ok = true; for (let q = 0; q < (ph === 0 ? 4 : 3); q++) if (!wet(x + q, y)) ok = false; if (!ok) continue;
        out.push({ x, y, w: ph === 0 ? 4 : 3, a: ph === 0 ? 0.75 : 0.45, c: ph === 0 ? '#e4f4fa' : '#9fd3e8' });
        if (ph === 0 && wet(R.flow > 0 ? x - 3 : x + 5, y) && wet(R.flow > 0 ? x - 2 : x + 6, y)) out.push({ x: R.flow > 0 ? x - 3 : x + 5, y, w: 2, a: 0.35, c: '#e4f4fa' }); // a fading tail behind it
      } }
    const fr = Math.floor(t * 4);
    for (let j = 0; j < 10; j++) { const hx = h32(R.id * 977 + j, fr), x = hx % W, y = Math.round(R.yc[x] + (((hx >>> 12) % 1000) / 1000 - 0.5) * 1.6 * R.hw[x]);
      if (wet(x, y) && wet(x + 1, y)) out.push({ x, y, w: 2, a: 0.7, c: (hx & 1) ? '#a8d4ee' : '#5a9ac8' }); }
  }
  if (plan.coast) { const CO = plan.coast, fr = Math.floor(t * 4), sea = (x, y) => x >= 0 && x < W && y >= lo && y < hi && Kr[y * W + x] === K.SEA;
    for (let j = 0; j < Math.ceil((hi - lo) / 6); j++) { const hx = h32(9001 + j, fr), y = lo + (hx >>> 8) % Math.max(1, hi - lo), x = hx % W; // glints on the open sea
      if (sea(x, y) && sea(x + 1, y) && plan.B[y * W + x] !== -10) out.push({ x, y, w: 2, a: 0.65, c: (hx & 1) ? '#a8d4ee' : '#5a9ac8' }); }
    if (CO.yC !== null && CO.mode === 'beach') for (let x = 0; x < W; x += 2) { const ph = Math.sin(t * 1.4 + x * 0.07) * 0.5 + 0.5, y = Math.round(CO.ycol[x] + CO.hd * (1 + ph * 2)); if (y >= lo && y < hi && sea(x, y) && ph > 0.35) out.push({ x, y, w: 2, a: 0.5 * ph, c: '#e8f2f4' }); } // the surf on a horizontal beach
    for (let y = lo; y < hi; y++) { const x = Math.round(CO.xs[y]) + (CO.cs > 0 ? 0 : -1), j = x - CO.cs; // the surf running up the beach and back
      if (j >= 0 && j < W && Kr[y * W + j] === K.BEACH && sea(x, y)) { const ph = Math.sin(t * 1.6 + y * 0.09) * 0.5 + 0.5; if (ph > 0.55) out.push({ x: CO.cs > 0 ? x : x - 1, y, w: 2, a: 0.55 * ph, c: '#e8f2f4' }); } }
  }
  return out;
}
function fireBox(f) { const R = Math.max(f.w, f.h) / 2 + 10; return { x0: Math.floor(Math.min(f.x0 - 12, f.x - R)), y0: Math.floor(Math.min(f.y0 - 14, f.y - R)), x1: Math.ceil(Math.max(f.x0 + f.w + 30, f.x + R, f.x + WIND[0] * 64 + 14)), y1: Math.ceil(f.y0 + f.h + WIND[1] * 64 + 15) }; } // everything a fire draws: its glow reaches R around it, its smoke column 64 px downwind
// Animated fire into a transparent ImageData covering the plan box bx (from fireBox), at time t.
function paintFx(plan, f, img, bx, t, night) { // night: smoke graded as in paint(opts.night)
  const d = img.data, w = bx.x1 - bx.x0, hgt = bx.y1 - bx.y0; d.fill(0);
  fireFx(plan, f, t, (x, y, c, a = 1) => { if (night) c = nightC(c); const col = x - bx.x0, row = bx.y1 - 1 - y; if (col < 0 || col >= w || row < 0 || row >= hgt) return; const o = (row * w + col) * 4, ea = d[o + 3] / 255, na = a + ea * (1 - a);
    if (na <= 0) return; d[o] = (c[0] * a + d[o] * ea * (1 - a)) / na; d[o + 1] = (c[1] * a + d[o + 1] * ea * (1 - a)) / na; d[o + 2] = (c[2] * a + d[o + 2] * ea * (1 - a)) / na; d[o + 3] = na * 255; });
  // flat roofs that carry a flak slot: mark the gun platform (painted above via b.slot)
}
// The airfield's perimeter (params.perimeter = h rows): the town is generated h rows shorter, its shares of the length scaled to match, and
// the last h rows are added after it. Along the town's end a perimeter road (a tank route joined to the main road), the fence, a grass
// verge, then the airfield's concrete apron; the main road runs on through a gate between two guard houses; every track ends at a buffer
// stop just before the fence. A town that ends at an airfield then ends at a fence, not at a cut.
function withPerimeter(o) {
  const P0 = Object.assign({}, PRESETS[o.preset || 'town'], o.params || {}), h = P0.perimeter | 0; if (!h) return generate(o);
  const L = P0.L | 0, L1 = L - h, k = L / L1, sc = f => f * k, cv = c => c && c.map(([f, v]) => [sc(f), v]), q = Object.assign({}, o.params, { L: L1, perimeter: 0 });
  for (const key of ['density', 'damageCurve']) if (P0[key]) q[key] = cv(P0[key]);
  for (const key of ['stationAt', 'industryAt']) if (P0[key]) q[key] = P0[key].map(sc);
  if (P0.river) q.river = Object.assign({}, P0.river, { at: sc(P0.river.at) }); if (P0.rivers) q.rivers = P0.rivers.map(r => Object.assign({}, r, { at: sc(r.at) }));
  const plan = generate(Object.assign({}, o, { params: q })); addPerimeter(plan, h); return plan;
}
function addPerimeter(plan, h) {
  const { W } = plan, L0 = plan.L, L = L0 + h, grow = (a, T, fill) => { const b = new T(W * L); if (fill !== undefined) b.fill(fill); b.set(a); return b; };
  const Kr = plan.K = grow(plan.K, Uint8Array), Br = plan.B = grow(plan.B, Int32Array, -1), RM = plan.RM = grow(plan.RM, Uint8Array);
  for (const key of ['U', 'D', 'mx', 'aw']) { const a = new Float32Array(L); a.set(plan[key]); a.fill(plan[key][L0 - 1], L0); plan[key] = a; }
  plan.L = L; const mx = plan.mx[L0 - 1], aw = plan.aw[L0 - 1], yS = L0 + 4, fence = L0 + 11, apron = L0 + 26, gw = Math.round(aw + 6);
  const st = { cls: 'collector', axis: 'h', tank: true, pts: [], yc: yS, side: 1, x0: 0, x1: W - 1, w: 8, perimeter: true }; st.id = plan.streets.length; plan.streets.push(st);
  for (let x = 0; x < W; x++) st.pts.push([x, yS, 8]);
  const ar = { cls: 'arterial', axis: 'v', tank: true, pts: [], y0: L0, y1: L - 1 }; ar.id = plan.streets.length; plan.streets.push(ar);
  for (let y = L0; y < L; y++) { ar.pts.push([mx, y, aw]); for (let x = 0; x < W; x++) { const i = y * W + x, dS = Math.abs(y + 0.5 - (yS + 0.5)), dA = Math.abs(x + 0.5 - mx);
    if (dA < 5) { Kr[i] = K.ROAD; Br[i] = -2 - ar.id; } else if (dS < 3) { Kr[i] = K.ROAD; Br[i] = -2 - st.id; } else if (dS < 4.5 || dA < aw / 2) { Kr[i] = K.WALK; Br[i] = -2 - (dS < 4.5 ? st.id : ar.id); }
    else Kr[i] = y >= apron ? K.APRON : K.MEADOW; } }
  const stops = []; // the tracks run on over the perimeter road (a level crossing) and end before the fence
  { const xs = []; for (let x = 0; x < W; x++) if (RM[(L0 - 1) * W + x] === 2) xs.push(x); // the rails in the town's last row, in pairs 5 px apart
    for (let q = 0; q + 1 < xs.length; q++) { const a = xs[q], b = xs[q + 1]; if (b - a < 4 || b - a > 6) continue; q++;
      for (let y = L0; y < fence - 2; y++) { const src = y - 3 * Math.ceil((y - L0 + 1) / 3); for (let xx = a - 2; xx <= b + 2; xx++) { const i = y * W + xx, m = RM[src * W + xx]; if (!m || m > 3) continue; RM[i] = m; if (Kr[i] === K.MEADOW) Kr[i] = K.RAIL; } }
      stops.push({ x0: a - 1, x1: b + 1, y: fence - 3 }); } }
  for (const sd of [-1, 1]) { const x0 = Math.round(mx + sd * (gw / 2 + 3) - (sd < 0 ? 7 : 0)), it = { t: 'works', label: 'Guard house', part: 'shed', x0, y0: fence + 2, w: 7, h: 6, ori: 'h', style: 'flat', roof: 3, seed: h32(plan.seed, 72000 + x0), dmg: 0 };
    let ok = x0 >= 0 && x0 + 7 <= W; for (let y = it.y0; ok && y < it.y0 + it.h; y++) for (let x = x0; x < x0 + 7; x++) if (Kr[y * W + x] !== K.MEADOW) ok = false;
    if (ok) { it.id = plan.items.length; plan.items.push(it); for (let y = it.y0; y < it.y0 + it.h; y++) for (let x = x0; x < x0 + 7; x++) { Kr[y * W + x] = K.BLDG; Br[y * W + x] = it.id; } } }
  plan.perimeter = { y0: L0, road: yS, fence, apron, gate: mx, gw, stops };
}
// How calm the open sea is near a harbour basin (plan.calm, 0..255 per pixel): 255 in the basin, fading to 0 over 28 px of open sea, so
// a host's water (opts.seaPix) can blend the basin's calm water into the open sea where no breakwater divides them. Two chamfer passes.
function calmWater(plan) {
  if (!plan.coast) return; const { W, L, K: Kr, B: Br } = plan, D = new Float32Array(W * L).fill(1e9), R = 28;
  for (let i = 0; i < W * L; i++) if (Kr[i] === K.SEA && Br[i] === -10) D[i] = 0;
  for (let y = 0; y < L; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (Kr[i] !== K.SEA || !D[i]) continue; let d = D[i]; if (x > 0) d = Math.min(d, D[i - 1] + 1); if (y > 0) { d = Math.min(d, D[i - W] + 1); if (x > 0) d = Math.min(d, D[i - W - 1] + 1.41); if (x < W - 1) d = Math.min(d, D[i - W + 1] + 1.41); } D[i] = d; }
  for (let y = L - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; if (Kr[i] !== K.SEA || !D[i]) continue; let d = D[i]; if (x < W - 1) d = Math.min(d, D[i + 1] + 1); if (y < L - 1) { d = Math.min(d, D[i + W] + 1); if (x < W - 1) d = Math.min(d, D[i + W + 1] + 1.41); if (x > 0) d = Math.min(d, D[i + W - 1] + 1.41); } D[i] = d; }
  const c = plan.calm = new Uint8Array(W * L); for (let i = 0; i < W * L; i++) if (Kr[i] === K.SEA && D[i] < R) c[i] = Math.round(255 * (1 - D[i] / R));
}
// flat roofs with a slot get a gun platform; call once after generate (keeps paint() free of searches)
function markSlotRoofs(plan) { for (const s of plan.slots) if (s.on === 'roof' && s.item !== undefined) plan.items[s.item].slot = true; }

const CityGen = { VERSION: 1, K, KIND_NAMES, TT, PRESETS, generate: o => { const p = withPerimeter(o); markSlotRoofs(p); calmWater(p); return p; }, validate, typeAt, paint, paintFx, riverFx, fireBox, nightLights, palette: C };
if (typeof module !== 'undefined' && module.exports) module.exports = CityGen;
root.CityGen = CityGen;
})(typeof globalThis !== 'undefined' ? globalThis : this);
