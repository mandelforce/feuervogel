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
const K = { NONE: 0, ROAD: 1, STREET: 2, WALK: 3, BLDG: 4, PLAZA: 5, FRONT: 6, GARDEN: 7, COURT: 8, PARK: 9, LOT: 10, CHYARD: 11, FIELD: 12, MEADOW: 13, RUBBLE: 14, WATER: 15, ORCHARD: 16, RIVER: 17, BRIDGE: 18, QUAY: 19, BANK: 20, TRACK: 21, WORKS: 22, RAIL: 23, RBRIDGE: 24, SEA: 25, BEACH: 26, TRENCH: 27, APRON: 28, ROCK: 29, RUNWAY: 30, DESERT: 31, SPOIL: 32, DITCH: 33, OASIS: 34, CLIFF: 35, WADI: 36, RAVINE: 37 };
// what the game's placement and spawn code calls each kind (its terrain-type vocabulary)
const TT = ['field', 'road', 'street', 'street', 'roof', 'yard', 'yard', 'grass', 'yard', 'park', 'yard', 'grass', 'field', 'grass', 'rubble', 'river', 'grass', 'river', 'bridge', 'street', 'sand', 'field', 'yard', 'rail', 'railbridge', 'sea', 'sand', 'mud', 'apron', 'sand', 'concrete', 'sand', 'sand', 'mud', 'grass', 'rock', 'sand', 'ravine'];
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
// Islands (Enigma Run level 1): open sea with a chain of small islands (rocky gun islets with flak and turrets, islets with a few houses on a lane
// and sometimes a lighthouse, tiny farms with a paddock of cows and a field), then one large island: a village (the village preset, clipped to
// the shore) with its green, pond and farmsteads, then fields with a small wood, a pond and a paddock, then an airbase (runway along the strip,
// taxiway, apron with hangars, control tower, fuel dump, blast pens, gun pits), a jetty where the road meets the shore. A lane stays open for warships.
PRESETS.islands = Object.assign({}, PRESETS.town, { label: 'Islands', L: 1792, density: [[0, 0], [1, 0]], damage: 0, chain: [0.33, 0.56], big: [0.565, 0.935], bigW: 186,
  isles: [5, 7], isleR: [[34, 42], [16, 30]], lane: 44, /* islets: how many, the radius of the two largest and of the others */ villageL: 290, gapL: 72, oldTown: null, railway: false, harbour: false, civic: {} });
// A coastal city with only the side harbour (the sea along one side the whole way)
PRESETS.coast = Object.assign({}, PRESETS.port, { label: 'Coastal city', density: PRESETS.town.density, coast: Object.assign({}, PRESETS.port.coast, { mode: 'side' }) });
// An industrial estate: industrial quarters with wide service roads, halls, tank farms, coal yards and a power station; workers' terraces between
PRESETS.industrial = Object.assign({}, PRESETS.town, { label: 'Industrial estate', L: 1800,
  density: [[0, 0.05], [0.15, 0.4], [0.5, 0.62], [0.85, 0.58], [1, 0.3]], damage: 0.3, squares: false, cathedral: false, parishSpacing: 900,
  oldTown: null, stars: 0, civic: { gasworks: true }, railway: true, harbour: false, industry: 0.8, industryMaxU: 1, power: true });
// The desert (Enigma Run level 2, P.climate 'desert'; see desertize): a port with its commercial harbour at the south end and the east side
// harbour opening into it, a beach town along the shore past it (a wide beach, a promenade with palms, bathing huts and a pleasure pier),
// plastered houses with flat roofs, a whitewashed domed hall in the church's place, date palms, irrigated plots and open desert beyond
PRESETS.portDesert = Object.assign({}, PRESETS.portSouth, { label: 'Desert port and beach town', L: 1000, climate: 'desert', damage: 0.6, damageCurve: [[0, 0.6], [0.3, 0.75], [0.5, 1], [0.75, 0.5], [1, 0.2]], portDensity: 0.5, stars: 0, civic: { store: true },
  density: [[0, 0.8], [0.25, 0.85], [0.45, 0.45], [0.7, 0.3], [1, 0.05]],
  coast: Object.assign({}, PRESETS.portSouth.coast, { mode: 'corner', cs: 1, openSide: true, end: 0.12, side: [0.2, 0.24], beachRun: 300, beachW: 24, prom: 7, pleasurePier: 44, war: true }) }); // at war (owner mockup E); port density middle (portDensity 0.5) for level 2
// A desert village: the village preset's plan in the desert: courtyard farmsteads with flat roofs, the domed hall and a well on the green, palm groves
PRESETS.villageDesert = Object.assign({}, PRESETS.village, { label: 'Desert village', climate: 'desert', damage: 0.1 });
// The desert's open land (desertLand): an oasis village of each size, a held one, and a strongpoint in the open (owner mockups G, H, I, D2, D3)
PRESETS.oasis = Object.assign({}, PRESETS.town, { label: 'Oasis village', builder: 'desert', climate: 'desert', L: 640, damage: 0.2, features: [{ kind: 'oasis', at: 0.5, size: 'medium' }] });
PRESETS.oasisSmall = Object.assign({}, PRESETS.oasis, { label: 'Oasis hamlet (small)', damage: 0.07, features: [{ kind: 'oasis', at: 0.5, size: 'small' }] });
PRESETS.oasisLarge = Object.assign({}, PRESETS.oasis, { label: 'Oasis town (large)', damage: 0.42, features: [{ kind: 'oasis', at: 0.5, size: 'large' }] });
PRESETS.oasisHeld = Object.assign({}, PRESETS.oasis, { label: 'Oasis village, held', features: [{ kind: 'oasis', at: 0.58, size: 'medium', held: true }] });
PRESETS.desertPost = Object.assign({}, PRESETS.oasis, { label: 'Strongpoint in the desert', damage: 0.1, features: [{ kind: 'post', at: 0.5 }] });
// the rest of level 2 (owner mockups V, P, J, A), each with the railway straight down the strip (x 74, inside the pass's gorge)
// Enigma Run level 2 as one plan (sandSea): the sortie's segment sequence, scaled to 56 chunks (the lab shows it at the level's length)
PRESETS.sandSea = Object.assign({}, PRESETS.oasis, { label: 'Level 2, Sea of Sand (whole level)', builder: 'sandSea', L: 3584, portDensity: 0.5,
  segs: [{ t: 'harbour_commercial', n: 5 }, { t: 'beach_town', n: 4 }, { t: 'valley', n: 8 }, { t: 'village', n: 5 }, { t: 'station_junction', n: 7 }, { t: 'desert_open', n: 5 }, { t: 'airbase_desert', n: 7 }, { t: 'pass', n: 8 }, { t: 'desert_open', n: 7 }] });
PRESETS.desertValley = Object.assign({}, PRESETS.oasis, { label: 'Valley with oil field and wadi', rail: { x: 74 }, features: [{ kind: 'valley', at0: 0.08, at1: 0.92 }] });
PRESETS.desertPass = Object.assign({}, PRESETS.oasis, { label: 'Fortified pass with viaduct', L: 700, rail: { x: 74 }, features: [{ kind: 'pass', at0: 0.06, at1: 0.94 }] });
PRESETS.desertJunction = Object.assign({}, PRESETS.oasis, { label: 'Railway junction', rail: { x: 74 }, features: [{ kind: 'junction', at0: 0.05, at1: 0.95 }] });
PRESETS.desertAirbase = Object.assign({}, PRESETS.oasis, { label: 'Desert airbase', rail: { x: 74 }, features: [{ kind: 'airbase', at0: 0.05, at1: 0.95 }] });
PRESETS.rivers = Object.assign({}, PRESETS.river, { label: 'Two rivers', rivers: [PRESETS.river.river, { at: 0.86, width: 20, amp: 9, island: false, rx: 0, ry: 0, channel: 0 }] });

// ---------- deterministic randomness ----------
function h32(a, b) { let h = Math.imul((a | 0) ^ 0x7F4A7C15, 0x9E3779B1) ^ Math.imul(((b | 0) + 0x165667B1) | 0, 0x85EBCA6B); h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; h = Math.imul(h, 0x297A2D39); h ^= h >>> 15; return h >>> 0; }
// tags: one random stream per kind of decision, so changing one part of the generator does not reshuffle the others
const T = { ROAD: 1, CROSS: 2, COL: 3, LOC: 4, BLD: 5, SQ: 6, CH: 7, PARK: 8, LOT: 9, TREE: 10, DMG: 11, SLOT: 12, INT: 13, SHED: 14, CRATER: 15, ROOF: 16, QTR: 17, OLD: 18, STAR: 19, CIV: 20, HB: 21, RAIL: 22, SEA: 23, ISLE: 24 };
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
  if (P.portDensity !== undefined) P.density = P.density.map(([f, v]) => [f, v * (0.5 + 0.5 * clamp(P.portDensity, 0, 1))]); // a port's density: 0 sparse (half the preset's U), 0.5 middle, 1 the preset's own
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
    if (mode === 'corner') { const hl = Math.round(L * lerp(c0.side[0], c0.side[1], rnd(T.SEA, 4))); const run = c0.beachRun || 170; if (hd > 0) { hy1 = yC - 2; hy0 = hy1 - hl; from = hy0 - run; } else { hy0 = yC + 2; hy1 = hy0 + hl; from = hy1 + run; } } // beachRun: a beach town along the side coast past the harbour // the side coast begins well before its harbour
    const xs = new Float32Array(L), wf = new Float32Array(L);
    for (let y = 0; y < L; y++) { const nat = qx + cs * (c0.amp * Math.sin(y * 0.004 + ph) + 4 * Math.sin(y * 0.013 + ph2) + 6), b = hy0 === null ? 0 : smooth(hy0 - 50, hy0 - 10, y) * (1 - smooth(hy1 + 10, hy1 + 50, y));
      const pastH = mode === 'corner' && (hd > 0 ? y > hy1 : y < hy0); let x = lerp(nat, qx, pastH ? 1 : b); if (mode === 'end' || mode === 'beach') x = out; if (mode === 'corner') x = lerp(out, x, hd > 0 ? smooth(from - 70, from, y) : 1 - smooth(from, from + 70, y)); // in a corner the coast swings in from the strip's side
      xs[y] = x; wf[y] = x - cs * lerp(c0.beachRun ? (c0.beachW || 16) + 6 + (c0.prom || 0) : 16, 42, pastH ? 1 : b); } // (a beach town: a wider beach and a promenade between it and the street) // the quayside behind a harbour is 30 px deep, the beach elsewhere 9
    CO = { mode, cs, hd, qx, xs, wf, hy0, hy1, yC, ycol, wfH, beachD, duneD, from, side: mode !== 'end' && mode !== 'beach' }; plan.coast = CO;
    if (c0.beachRun && mode === 'corner') CO.bt = hd < 0 ? { y0: hy1 + 50, y1: from - 10 } : { y0: from + 10, y1: hy0 - 50 }; } // the beach town's stretch of shore
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
        if (CO.bt && y >= CO.bt.y0 - 30 && y <= CO.bt.y1 + 30 && dw > 6 && dw <= 6 + (P.coast.prom || 0)) { Kr[i] = K.WALK; Br[i] = -15; continue; } // the beach town's promenade
        if (dw > (hb ? 7 : 6)) Kr[i] = hb && y >= CO.hy0 && y <= CO.hy1 ? K.WORKS : d > -3 && Uy(y) >= 0.55 && !CO.bt ? K.QUAY : K.BEACH; } } // a sea wall where the town is dense (a beach town keeps its sand)
    if (CO.side) { let y0, y1; const mid = (CO.hy0 + CO.hy1) >> 1; for (y0 = mid; y0 > 0 && uAt(CO.wf[y0], y0) >= 0.2; y0--); for (y1 = mid; y1 < L - 1 && uAt(CO.wf[y1], y1) >= 0.2; y1++);
      y0 = Math.max(0, Math.min(y0, CO.hy0 - 40)); y1 = Math.min(L - 1, Math.max(y1, CO.hy1 + 40)); if (CO.yC !== null) { if (CO.hd > 0) { y0 = Math.max(y0, CO.hy0 - 120); y1 = Math.round(CO.wfH); } else { y0 = Math.round(CO.wfH); y1 = Math.min(Math.max(y1, CO.bt ? CO.bt.y1 + 20 : 0), CO.bt ? CO.bt.y1 + 20 : CO.hy1 + 120); } }
      const pts = []; for (let y = y0; y <= y1; y++) if (cs * (CO.wf[y] - (cs > 0 ? W - 4 : 3)) < 0) pts.push([CO.wf[y], y, P.widths.collector]);
      if (pts.length > 30) CO.street = addStreet({ cls: 'collector', axis: 'v', tank: true, pts, y0: pts[0][1], y1: pts[pts.length - 1][1], side: cs, waterfront: true }); }
    if (CO.yC !== null) { const yH = Math.round(CO.wfH), xe = CO.side ? Math.round(CO.wf[yH]) : (cs > 0 ? W - 1 : 0), xa = cs > 0 ? 0 : W - 1, pts = [];
      for (let x = Math.min(xa, xe); x <= Math.max(xa, xe); x++) pts.push([x, yH, P.widths.collector]);
      CO.endStreet = addStreet({ cls: 'collector', axis: 'h', tank: true, pts, yc: yH, side: 1, x0: pts[0][0], x1: pts[pts.length - 1][0], w: P.widths.collector, waterfront: true });
      for (const p of plan.streets[0].pts) if (past(p[1], -1)) p[2] = 0;
      if (CO.mode === 'beach') { CO.exits = []; const xm = Math.round(MX(yH)), xs2 = [xm]; for (const f of [0.18, 0.5, 0.82]) { const x = Math.round(W * f + (rnd(T.SEA, 20, f * 10) - 0.5) * 20); if (xs2.every(o => Math.abs(o - x) > 60) && x > 20 && x < W - 21) xs2.push(x); }
        for (const x of xs2.slice(0, 3)) { const yEnd = Math.round(CO.ycol[x] - CO.hd * 10), pts = []; for (let y = Math.min(yH, yEnd); y <= Math.max(yH, yEnd); y++) pts.push([x, y, 8]); // a beach exit: a road down through a gap in the dunes onto the sand
          CO.exits.push(addStreet({ cls: 'local', axis: 'v', tank: false, pts, y0: pts[0][1], y1: pts[pts.length - 1][1], side: 1, exit: true })); } } } } // the main road ends at the end quay (or the coastal road)
  // 2a0'. the beach town (coast.beachRun): palms along the promenade, bathing huts in rows on the sand, and a pleasure pier on piles out
  // into the sea with a round pavilion at its head
  if (CO && CO.bt) { const cs = CO.cs, bt = CO.bt, pr = P.coast.prom || 0; plan.beachTown = { y0: bt.y0, y1: bt.y1, pier: null, huts: 0 };
    for (let y = bt.y0 + 6; y <= bt.y1 - 6; y += 13) { const x = Math.round(CO.wf[y] + cs * (6 + pr / 2)); if (inB(x, y) && Kr[idx(x, y)] === K.WALK) plan.trees.push({ x, y, r: 2, v: 1, prom: true, stump: !!P.coast.war && rnd(T.SEA, 44, y) < 0.5 }); }
    const py = Math.round(lerp(bt.y0, bt.y1, 0.55 + (rnd(T.SEA, 40) - 0.5) * 0.2)), pw = 6, plen = P.coast.pleasurePier || 44, xb = Math.round(CO.wf[py] + cs * (7 + pr)), xh = Math.round(CO.xs[py] + cs * plen);
    for (let y = py; y < py + pw; y++) for (let x = Math.min(xb, xh); x <= Math.max(xb, xh); x++) if (inB(x, y) && (Kr[idx(x, y)] === K.BEACH || Kr[idx(x, y)] === K.SEA)) { Kr[idx(x, y)] = K.QUAY; Br[idx(x, y)] = -14; }
    const hx = clamp(xh, 8, W - 9), hy = py + pw / 2; for (let y = Math.floor(hy - 7); y <= hy + 7; y++) for (let x = hx - 7; x <= hx + 7; x++) if (inB(x, y) && Math.hypot(x + 0.5 - hx, y + 0.5 - hy) < 7 && Kr[idx(x, y)] === K.SEA) { Kr[idx(x, y)] = K.QUAY; Br[idx(x, y)] = -14; } // the deck round the pavilion
    const pv = { t: 'civic', label: 'Pier pavilion', part: 'pavilion', round: true, x0: hx - 5, y0: Math.floor(hy - 5), w: 11, h: 11, acx: hx + 0.5, acy: hy, r: 4.6, dmg: 0, seed: h32(seed, 41000) }; pv.id = plan.items.length; plan.items.push(pv);
    for (let y = pv.y0; y < pv.y0 + pv.h; y++) for (let x = pv.x0; x < pv.x0 + pv.w; x++) if (inB(x, y) && Math.hypot(x + 0.5 - pv.acx, y + 0.5 - pv.acy) < pv.r) { Kr[idx(x, y)] = K.BLDG; Br[idx(x, y)] = pv.id; }
    plan.beachTown.pier = { x0: Math.min(xb, xh), x1: Math.max(xb, xh), y0: py, y1: py + pw - 1, head: [hx, hy] };
    for (let y = bt.y0 + 10; !P.coast.war && y < bt.y1 - 14; y += 40 + ((rnd(T.SEA, 41, y) * 30) | 0)) { if (Math.abs(y - py) < 24) continue; const n = 3 + ((rnd(T.SEA, 42, y) * 3) | 0); // a row of bathing huts just below the promenade, gables to the sea
      for (let k = 0; k < n; k++) { const yy = y + k * 6, x0 = Math.round(CO.wf[yy] + cs * (8 + pr)) - (cs < 0 ? 4 : 0); let ok = true; for (let q = yy - 1; ok && q < yy + 6; q++) for (let x = x0 - 1; x < x0 + 5; x++) if (!inB(x, q) || Kr[idx(x, q)] !== K.BEACH) ok = false; if (!ok) continue;
        const it = { t: 'works', label: 'Bathing hut', part: 'hut', x0, y0: yy, w: 4, h: 5, ori: 'h', style: 'gable', roof: 0, stripe: (rnd(T.SEA, 43, yy) * 3) | 0, seed: h32(seed, 41100 + yy), dmg: 0 }; it.id = plan.items.length; plan.items.push(it);
        for (let q = yy; q < yy + 5; q++) for (let x = x0; x < x0 + 4; x++) { Kr[idx(x, q)] = K.BLDG; Br[idx(x, q)] = it.id; } plan.beachTown.huts++; } } 
    if (P.coast.war) { const bw = plan.beachTown; bw.war = { hedgehogs: 0, casemates: 0, bunkers: 0 }; bw.obs = []; // the beach town at war (owner mockup E): obstacles in the shallows, stakes and wire on the beach, casemates and bunkers facing the sea, the pier cut
      for (let y = bt.y0; y <= bt.y1; y += 12) for (let k = 0; k < 3; k++) { const yy = y + (k % 2) * 6, x = Math.round(CO.xs[clamp(yy, 0, L - 1)] + cs * (5 + k * 9) + (rnd(T.SEA, 50, yy * 3 + k) - 0.5) * 3); if (rnd(T.SEA, 51, yy * 5 + k) < 0.85 && inB(x, yy) && Kr[idx(x, yy)] === K.SEA && Math.abs(yy - py - 3) > 8) { bw.obs.push({ kind: 'hedgehog', x, y: yy }); bw.war.hedgehogs++; } }
      for (let y = bt.y0; y <= bt.y1; y += 9) { const x = Math.round(CO.xs[y] - cs * 3); if (inB(x, y) && Kr[idx(x, y)] === K.BEACH && Math.abs(y - py - 3) > 6) bw.obs.push({ kind: 'stake', x, y }); }
      const wx = y => CO.wf[clamp(Math.round(y), 0, L - 1)] + cs * (6 + pr + 3); plan.coils = plan.coils || []; let cur = [];
      for (let y = bt.y0; y <= bt.y1; y += 4) { if (Math.abs(y - py - 3) < 8) { if (cur.length > 1) plan.coils.push(cur); cur = []; continue; } cur.push([wx(y), y]); } if (cur.length > 1) plan.coils.push(cur);
      const len = bt.y1 - bt.y0; [0.22, 0.78].forEach((f, k) => { const y0 = Math.round(bt.y0 + len * f), x0 = Math.round(CO.wf[y0] + cs * (6 + pr + 5)) - (cs < 0 ? 10 : 0); let ok = true; for (let q = y0 - 1; ok && q < y0 + 15; q++) for (let x = x0 - 1; x < x0 + 11; x++) if (!inB(x, q) || Kr[idx(x, q)] !== K.BEACH) { ok = false; break; } if (!ok) return;
        const it = { t: 'works', label: 'Casemate', part: 'casemate', x0, y0, w: 10, h: 14, ori: 'v', style: 'flat', roof: 3, seed: h32(seed, 42000 + k), dmg: 0, seaX: cs }; it.id = plan.items.length; plan.items.push(it); for (let q = y0; q < y0 + 14; q++) for (let x = x0; x < x0 + 10; x++) { Kr[idx(x, q)] = K.BLDG; Br[idx(x, q)] = it.id; } bw.war.casemates++; });
      [0.42, 0.95].forEach(f => { const y = Math.round(bt.y0 + len * f), x = Math.round(CO.wf[y] + cs * (6 + pr + 10)); let ok = true; for (let q = y - 7; ok && q < y + 7; q++) for (let xx = x - 7; xx < x + 7; xx++) if (!inB(xx, q) || Kr[idx(xx, q)] !== K.BEACH) { ok = false; break; } if (!ok) return;
        for (let q = y - 6; q < y + 6; q++) for (let xx = x - 6; xx < x + 6; xx++) Kr[idx(xx, q)] = K.APRON; plan.slots.push({ kind: 'bunker', on: 'beach', x, y, r: 6, id: plan.slots.length }); bw.war.bunkers++; });
      const pc = Math.round(lerp(xb, xh, 0.45)); for (let y = py; y < py + pw; y++) for (let x = pc - 4; x <= pc + 4; x++) if (inB(x, y) && Kr[idx(x, y)] === K.QUAY) { Kr[idx(x, y)] = K.SEA; Br[idx(x, y)] = -1; } bw.pier.cut = pc; } }
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
  plan.obstacles = plan.beachTown && plan.beachTown.obs ? plan.beachTown.obs : []; plan.wires = []; plan.barrels = []; plan.beachSlots = []; // (a beach town at war has put its obstacles in already)
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
const C_TEMP = {
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
  gravel: HX(['#4a4638', '#5a5546', '#6a6454']), rail: HX(['#8a8e96', '#b0b4bc']), crane: HX(['#b8902e', '#7a5a1c']), sett: HX(['#403c36', '#4e4a42', '#5c574e', '#6a6459']), river: HX(['#12303a', '#173c48', '#1e4a56', '#285a66', '#3a6e78', '#5a8a90']), hull: HX(['#2a2018', '#4a3826', '#6a543a']), beam: HX(['#5a3a20'])[0], char: HX(['#1a1612', '#241e18', '#30281e']), fruit: HX(['#c8483a', '#e0c04a']), conc: HX(['#4e4c48', '#5e5c58', '#6e6c68', '#7e7c78']), sand: HX(['#6e6448', '#86795a']), lit: HX(['#e8c870'])[0], dark: HX(['#1a1c22'])[0], fire: HX(['#f4d050', '#f08a30', '#c84020']), dome: HX(['#8a8070', '#b4ab98', '#d4ccba', '#ece6d8', '#fbf8f0']),
};
// The desert climate (P.climate 'desert'): the game's own desert colours (index.html THEME_TR[2]) for sand, scrub and soil, irrigated green
// crops and date palms, plastered walls and flat roofs in a few washes, sandstone paving, white domes. C is the palette paint() works with.
const C_DESERT = Object.assign({}, C_TEMP, {
  grass: HX(['#8a7646', '#9e8a56', '#b29e68', '#c4b07c']), soil: HX(['#7a5c3a', '#8e6e48', '#a4865a']), yard: HX(['#94784e', '#a48a5e', '#b49c70']),
  tree: HX(['#26240e', '#363c16', '#4a5a24', '#5c702e', '#728a3a', '#8ea24c']),
  field: { grass: HX(['#8a7646', '#9e8a56', '#b29e68', '#c4b07c', '#d4c292']), wheat: HX(['#a47c44', '#b8904e', '#caa462', '#dab676', '#e8ca8e']), soil: HX(['#6a4c2e', '#7a5c3a', '#8e6e48', '#a4865a']), crop: HX(['#3e4c1e', '#4e5e2c', '#5e7034', '#70843e']), hedge: HX(['#6a5236', '#7e6444', '#947a56']) },
  cobble: HX(['#7a6a50', '#88785c', '#968668', '#a49474']), sett: HX(['#8a7a5e', '#98886a', '#a69676', '#b4a482']), side: HX(['#a29274', '#b4a486', '#c6b698']),
  pave: HX(['#a8987a', '#b8a888', '#c6b696', '#d4c4a4']), asph: HX(['#6a5c44', '#76684e', '#827458', '#8e8062']), gravel: HX(['#8a7a5c', '#9c8c6c', '#ae9e7e']),
  rubble: HX(['#4a3e30', '#6a5a46', '#8a785e', '#a8967a', '#c4b296']), conc: HX(['#8e8066', '#a2947a', '#b6a88e', '#c8bca4']), sand: HX(['#c49e62', '#d6b276']),
  facade: [HX(['#8e8472', '#c8bea8', '#e0d8c4']), HX(['#7a5a36', '#a8804e', '#c49a62']), HX(['#6e6252', '#9a8c76', '#b4a68e'])], fence: HX(['#5a4630'])[0], shadow: HX(['#241c14'])[0],
  water: HX(['#1e6a74', '#2a8890', '#4aaaa8']), river: HX(['#0e3a40', '#14484e', '#1c5a5e', '#286c6c', '#3a8280', '#5aa09a']),
  dune: HX(['#b4884c', '#c69c5c', '#d6b070', '#e4c488', '#f0d6a2']), dome: HX(['#8a8070', '#b4ab98', '#d4ccba', '#ece6d8', '#fbf8f0']),
  wash: [HX(['#7e7464', '#b4ab98', '#d4ccba', '#ece6d8']), HX(['#8c7646', '#ae9660', '#ccb682', '#e6d4a6']), HX(['#7a5e4e', '#a88a74', '#c4a690', '#dcc2ae']), HX(['#7a6c50', '#a49676', '#c2b492', '#dccfb0']), HX(['#6a5e4c', '#9a8e7a', '#b4a68e', '#d0c4ac'])], // white, sand (the game's desert house), pink, buff, and stone (a fort's towers)
  rock: HX(['#4e3c2a', '#6a5238', '#88694a', '#a6865e', '#c2a276', '#dabd92']), deep: HX(['#0e0a06', '#1a120a', '#241a10', '#2e2216']), stone: HX(['#6a5e4c', '#9a8e7a', '#b4a68e', '#d0c4ac']), canvas: HX(['#8a7048', '#b49668', '#c2a676', '#d6be8e']),
  hatch: HX(['#3a2a18'])[0], dirt: HX(['#946e42', '#a88052', '#bc9464', '#cea878']), spoil: HX(['#6e5636', '#9c7e50', '#c4a46c', '#dcbe86', '#ecd4a0']), trench: HX(['#2e2216', '#4a3a26']),
  bag: HX(['#d8c290', '#c2aa76', '#a68e5c', '#5e4a30']), pool: HX(['#0a3442', '#0e4a5a', '#146272', '#1c7c8a', '#2a96a2', '#48b0b4', '#78ccc4']), net: HX(['#6e5432', '#8a6c40', '#9c7c4c', '#b8975c', '#d6b678']), wire: HX(['#1e1a16', '#4a443c', '#2a2016']),
});
let C = C_TEMP;
const usePalette = plan => { C = plan.P && plan.P.climate === 'desert' ? C_DESERT : C_TEMP; };
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16 - 0.5);
const bay = (i, j) => BAYER[((j & 3) << 2) | (i & 3)];
const pickI = (n, l, i, j) => { const v = Math.round(l * (n - 1) + bay(i, j) * 0.95); return v < 0 ? 0 : v >= n ? n - 1 : v; };
const hh = (x, y) => h32(x * 7919 + 13, y * 104729 + 7) / 4294967296;
function vn(x, y) { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hh(xi, yi), b = hh(xi + 1, yi), c = hh(xi, yi + 1), d = hh(xi + 1, yi + 1); return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy; }

// one roof pixel (the game's roofPix): lx, ly inside the building with ly growing down the screen
function roofPix(lx, ly, b, ramp, wx, wy) {
  const w = b.w, h = b.h, style = b.style;
  if (lx === 0 || ly === 0 || lx === w - 1 || ly === h - 1) return b.wash !== undefined && style === 'flat' ? C.wash[b.wash][0] : ramp[0];
  if (style === 'flat') { // a gravel roof behind a parapet: light enough to read as a roof, not a hole (in the desert a plastered roof terrace in its wash)
    const R = b.wash !== undefined ? C.wash[b.wash] : C.conc;
    if (b.wash !== undefined && !b.slot) { if (ly === 1 || lx === 1) return R[3]; if (ly === h - 2 || lx === w - 2) return R[1]; if (w > 6 && h > 6 && (lx === w - 4 || lx === w - 3) && (ly === 2 || ly === 3)) return C.hatch; return R[2]; } // the desert: like the game's desert houses (light top and left, a darker bottom and right, a roof hatch)
    if (lx === 1 || ly === 1 || lx === w - 2 || ly === h - 2) return ly === 1 || lx === w - 2 ? R[3] : R[1];
    if (b.slot && Math.abs(lx - w / 2 + 0.5) < 2.6 && Math.abs(ly - h / 2 + 0.5) < 2.6) { const e = Math.max(Math.abs(lx - w / 2 + 0.5), Math.abs(ly - h / 2 + 0.5)); return e > 1.8 ? C.sand[(lx + ly) & 1] : C.gravel[0]; } // a sandbagged gun platform
    if (b.t === 'store') { if (lx % 6 === 3 && ly > 2 && ly < h - 3) return ly % 2 ? C.roofs[3][4] : C.roofs[3][3]; if (lx % 6 === 4 && ly > 2 && ly < h - 3) return C.conc[0]; } // rows of glass skylights
    if (lx === 3 && ly === 3) return C.shadow; if (lx === 3 && ly === 4) return R[3]; // roof hatch
    return R[pickI(4, 0.45 + (hh(wx, wy) - 0.5) * 0.35 + (vn(wx * 0.3, wy * 0.3) - 0.5) * 0.2, wx, wy)];
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
  if (b.part === 'pavilion' || (b.part === 'dome' && C === C_DESERT)) { if (e > 0.88) return C.shadow; if (rr < 1.2) return C.lit; return C.dome[pickI(5, domeLit(dx / b.r, dy / b.r, e), x, y)]; } // a white dome (a pier pavilion; in the desert any dome)
  if (b.part === 'pillbox') { if (e > 0.88) return C.shadow; const toward = (b.sea < 0 ? -dy : dy) / b.r; if (e > 0.62 && toward > 0.3 && Math.abs(dx) < b.r * 0.7) return C.shadow; return C.conc[pickI(4, 0.6 - e * 0.25 + light * 0.3, x, y)]; } // a pillbox: slits towards the sea
  if (b.part === 'tobruk') return e > 0.85 ? C.shadow : e > 0.45 ? C.conc[pickI(4, 0.55 + light * 0.3, x, y)] : C.char[0]; // a Tobruk pit: a ring of concrete round the open hole
  if (b.part === 'radar') { if (e > 0.92) return C.shadow; return ((((an / 6.283 + 1) * 10) % 1) < 0.18 || Math.abs(e - 0.55) < 0.07) ? C.conc[0] : C.side[pickI(3, 0.5 + light * 0.35 - e * 0.2, x, y)]; } // a Wurzburg dish: ribs and a ring
  if (b.part === 'lighthouse') { if (e > 0.9) return C.shadow; if (rr < 1.1) return C.lit; const band = Math.floor(e * 4) % 2; return band ? (b.red ? C.fire[2] : C.field.crop[2]) : C.side[2]; } // a lighthouse: lantern, bands
  if (b.part === 'cooling') { if (e > 0.94) return C.shadow; if (e > 0.78) return C.conc[pickI(4, 0.55 + light * 0.5, x, y)]; if (e > 0.72) return C.shadow; return SMOKE[pickI(4, 0.1 + (vn(x * 0.35, y * 0.35) - 0.5) * 0.5 + (1 - e) * 0.5, x, y)]; } // a cooling tower: a lit concrete rim round a shaft full of steam // a cooling tower: a lit concrete rim, the dark shaft inside
  if (b.part === 'tank') { if (e > 0.88) return C.shadow; if (rr < 1.1) return C.conc[0]; return C.side[pickI(3, 0.6 - e * 0.25 + light * 0.4 - (Math.abs(e - 0.6) < 0.06 ? 0.3 : 0) - (b.dmg ? (hh(x, y) < 0.3 ? 0.4 : 0) : 0), x, y)]; } // an oil tank: a light steel roof with a ring seam and a vent
  if (b.part === 'chimney') return e > 0.55 ? C.roofs[1][pickI(5, 0.45 + light * 0.3, x, y)] : C.shadow; // a brick stack, black inside
  if (b.part === 'watertower') { if (rr < 1.2) return C.conc[3]; if (e > 0.88) return C.shadow; if (C === C_DESERT) return C.wash[1][clamp(Math.round(2.6 - e * 1.4 + light * 0.9), 0, 3)]; return C.roofs[0][pickI(5, 0.6 - e * 0.3 + light * 0.35 - ((((an / 6.283 + 1) * 12) % 1) < 0.15 ? 0.2 : 0), x, y)]; } // a conical tiled roof on a brick drum
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
  usePalette(plan); const desert = C === C_DESERT, seaPix = opts && opts.seaPix, sandPix = opts && opts.sandPix, { W, L, K: Kr, B: Br, items } = plan, d = img.data, at = (x, y) => (y < 0 || y >= L || x < 0 || x >= W) ? -1 : y * W + x;
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
          if (b.part === 'casemate' || b.part === 'atwall') { const lx = x - b.x0, ly = y - b.y0, edge = lx === 0 || ly === 0 || lx === b.w - 1 || ly === b.h - 1, seaRow = b.seaX ? (b.seaX > 0 ? lx >= b.w - 2 : lx <= 1) : b.sea < 0 ? ly <= 1 : ly >= b.h - 2; // concrete, camouflage, the embrasure on the sea side
            c = b.part === 'casemate' && seaRow && (b.seaX ? Math.abs(ly - b.h / 2 + 0.5) < b.h * 0.3 : Math.abs(lx - b.w / 2 + 0.5) < b.w * 0.3) ? C.shadow : edge ? C.shadow : C.conc[pickI(4, 0.5 + (vn(x * 0.3, y * 0.3) - 0.5) * 0.7 - (lx === 1 || ly === b.h - 2 ? -0.15 : 0), x, y)];
            if (b.part === 'casemate' && !edge && vn(x * 0.2 + 9, y * 0.2) > 0.68) c = C.field.hedge[1]; break; }
          if (b.part === 'fort') { const lx = x - b.x0, ly = y - b.y0, t = b.outer === 'S' ? ly : b.outer === 'N' ? b.h - 1 - ly : b.outer === 'W' ? lx : b.w - 1 - lx; // a fort's wall: battlements on its outer edge, dressed stone, the inner face in shadow
            c = t === 0 ? (((x + y) >> 1) % 2 === 0 ? C.stone[3] : C.stone[0]) : t >= 5 ? C.stone[0] : (y + (x >> 1)) % 3 === 0 ? C.stone[1] : t < 3 ? C.stone[3] : C.stone[2]; break; }
          if (b.part === 'eshed') { const lx = x - b.x0, ly = y - b.y0; c = lx === 0 || ly === 0 || lx === b.w - 1 || ly === b.h - 1 ? C.wash[1][0] : lx === 1 || ly === b.h - 2 ? C.wash[1][3] : (ly % 8 === 4 && lx > 3 && lx < b.w - 4) ? C.hatch : C.wash[1][2]; break; } // an engine shed: a long flat roof with smoke vents
          if (b.part === 'tent') { const lx = x - b.x0, ly = y - b.y0; c = lx === 0 || ly === 0 || lx === b.w - 1 || ly === b.h - 1 ? C.canvas[0] : ly === (b.h >> 1) ? C.canvas[3] : ly < (b.h >> 1) ? C.canvas[2] : C.canvas[1]; break; } // a tent: a ridge, the two sides of the canvas
          if (b.part === 'tenthangar') { const lx = x - b.x0, ly = y - b.y0; c = lx === 0 || lx === b.w - 1 ? C.canvas[0] : ly % 6 === 0 ? C.canvas[0] : lx === 1 ? C.canvas[3] : (lx >> 1) & 1 ? C.canvas[1] : C.canvas[2]; if (ly < 2 && Math.abs(lx - b.w / 2) < 8) c = C.hatch; break; } // a canvas hangar on hoops, its door to the taxiway
          if (b.part === 'hut') { const lx = x - b.x0, ly = y - b.y0; c = lx === 0 || lx === b.w - 1 || ly === 0 || ly === b.h - 1 ? C.shadow : ly % 2 === 0 ? [C.fire[2], C.water[1], C.crane[0]][b.stripe] : C.foam; break; } // a bathing hut: a striped canvas roof
          if (b.part === 'bunker') { const lx = x - b.x0, ly = y - b.y0, edge = lx === 0 || ly === 0 || lx === b.w - 1 || ly === b.h - 1; // a U-boat bunker: a metres-thick concrete roof, beams, camouflage
            c = edge ? C.shadow : (lx % 7 === 0 || ly % 9 === 0) ? C.conc[1] : C.conc[pickI(4, 0.55 + (vn(x * 0.12, y * 0.12) - 0.5) * 0.5 - (b.dmg && hh(x >> 1, y >> 1) < 0.08 ? 0.5 : 0), x, y)]; break; }
          if (b.part === 'shed') { const lx = x - b.x0, u = (lx + 0.5) / b.w, arch = 1 - (2 * u - 1) ** 2; // the train shed: an arched glass roof on iron ribs, the tracks showing through
            c = lx === 0 || lx === b.w - 1 || y === b.y0 || y === b.y0 + b.h - 1 ? C.shadow : (y - b.y0) % 4 === 0 ? C.conc[0] : C.roofs[3][pickI(5, 0.25 + arch * 0.55 - (RMx[i] === 2 ? 0.2 : 0) + (b.dmg && hh(x >> 1, y >> 1) < 0.12 ? -0.5 : 0), x, y)]; break; }
          if (b.church && b.church.dome) { c = domedHallPix(b, x, y); break; } // in the desert: a whitewashed domed hall
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
            c = hh(x, y) < 0.14 ? C.beam : hh(x * 3, y * 5) < 0.12 ? (b.wash !== undefined ? C.wash[b.wash][3] : C.roofs[b.roof || 0][2]) : C.rubble[pickI(5, 0.25 + vn(x * 0.4, y * 0.4) * 0.6, x, y)];
          } else if (b && b.dmg === 4) { // a mound: highest in the middle, lit from the upper left, roof-tile shards, a chimney stub still standing
            const mx = b.x0 + b.w / 2, my = b.y0 + b.h / 2, dx = (x + 0.5 - mx) / (b.w / 2 + 3), dy = (y + 0.5 - my) / (b.h / 2 + 3), hgt = Math.max(0, 1 - dx * dx - dy * dy);
            const sx = Math.round(b.x0 + 1 + hh(b.seed, 11) * Math.max(0, b.w - 4)), sy = Math.round(b.y0 + 1 + hh(b.seed, 12) * Math.max(0, b.h - 4));
            if ((x === sx || x === sx + 1) && (y === sy || y === sy + 1)) { c = x === sx ? C.facade[1][2] : C.facade[1][1]; break; }
            if (x === sx + 2 && (y === sy || y === sy - 1)) { c = C.shadow; break; }
            const lit = 0.28 + hgt * 0.42 + (-dx * 0.35 + dy * 0.35) * (0.4 + hgt) + (vn(x * 0.45, y * 0.45) - 0.5) * 0.28; // the lower right side is in shade
            c = hh(x * 3, y * 7) < 0.05 ? (b.wash !== undefined ? C.wash[b.wash][3] : C.roofs[b.roof || 0][pickI(5, 0.25 + hh(x, y) * 0.4, x, y)]) : C.rubble[pickI(5, lit, x, y)];
          } else { const n = vn(x * 0.25, y * 0.25); c = C.rubble[pickI(5, n * 0.9 + (hh(x, y) - 0.5) * 0.35, x, y)]; }
          break; }
        case K.ROAD: { const st = streetOf(i); if (st && st.dirt) { const rut = Math.abs(Math.abs(x + 0.5 - plan.mx[y]) - plan.aw[y] / 4) < 0.8; c = rut ? C.dirt[0] : C.dirt[pickI(4, 0.55 + (hh(x, y) - 0.5) * 0.5, x, y)]; break; } // a desert track: packed dirt, two ruts
          c = C.asph[pickI(4, 0.5 + (vn(x * 0.25, y * 0.25) - 0.5) * 0.4, x, y)]; break; }
        case K.STREET: { const st = streetOf(i); if (st && st.old) { c = C.sett[pickI(4, 0.55 + ((x + (y >> 1)) % 3 === 0 ? -0.3 : 0.08) + (hh(x, y) - 0.5) * 0.35, x, y)]; break; } } // the old town's light setts
          c = C.cobble[pickI(4, 0.45 + (((x >> 1) + (y >> 1)) & 1 ? 0.1 : -0.06) + (hh(x, y) - 0.5) * 0.3, x, y)]; break;
        case K.WALK: c = C.side[pickI(3, 0.55 + (hh(x, y) - 0.5) * 0.4, x, y)]; break;
        case K.PLAZA: if (Br[i] === -5) { const ed = [at(x - 1, y), at(x + 1, y)].some(j => j >= 0 && Kr[j] !== K.PLAZA && Kr[j] !== K.BLDG); c = ed ? C.conc[3] : C.pave[pickI(4, 0.55 + (hh(x, y) - 0.5) * 0.25, x, y)]; break; } // a platform, its edge lighter
          if (Br[i] === -4) { const st = plan.stars.reduce((a, o) => Math.abs(o.y - y) < Math.abs(a.y - y) ? o : a), r = Math.hypot(x + 0.5 - st.x, y + 0.5 - st.y); // the roundabout's lawn with a ring of flowers and a stone kerb
            c = r > st.ri - 1 ? C.side[2] : Math.abs(r - st.ri + 2.6) < 0.7 ? C.fruit[(x + y) & 1] : r < 3.6 ? C.pave[2] : C.grass[pickI(4, 0.6 + (hh(x, y) - 0.5) * 0.3, x, y)]; break; }
          c = C.pave[pickI(4, 0.5 + ((((x >> 2) + (y >> 2)) & 1) ? 0.15 : -0.1), x, y)]; break;
        case K.WATER: if (Br[i] === -16) { const ed = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].some(j => j >= 0 && Kr[j] !== K.WATER); c = ed ? C.pool[6] : C.pool[pickI(7, 0.35 + Math.sin(x * 0.5 + y) * 0.06, x, y)]; break; } // an oasis pool
          if (Br[i] === -7) { const ed = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].some(j => j >= 0 && Kr[j] !== K.WATER); c = ed ? C.field.hedge[2] : C.river[pickI(6, 0.35 + Math.sin(x * 0.5 + y) * 0.08, x, y)]; break; } // the pond, reeds round its edge
          c = C.water[pickI(3, 0.5 + Math.sin(x * 0.7 + y * 0.4) * 0.25, x, y)]; break;
        case K.FRONT: { const b = Br[i] >= 0 ? items[Br[i]] : null; c = b && b.t === 'house' ? C.grass[pickI(4, 0.55 + (vn(x * 0.15, y * 0.15) - 0.5) * 0.4, x, y)] : C.pave[pickI(4, 0.35 + (hh(x, y) - 0.5) * 0.3, x, y)]; break; }
        case K.GARDEN: { const o = Br[i];
          if ((x > 0 && Kr[i - 1] === K.FIELD) || (x < W - 1 && Kr[i + 1] === K.FIELD) || (y > 0 && Kr[i - W] === K.FIELD) || (y < L - 1 && Kr[i + W] === K.FIELD)) { c = C.field.hedge[pickI(3, 0.55 + (hh(x, y) - 0.5) * 0.7, x, y)]; break; } // the hedge along the village edge
          if ((x > 0 && Kr[i - 1] === K.ORCHARD) || (x < W - 1 && Kr[i + 1] === K.ORCHARD) || (y > 0 && Kr[i - W] === K.ORCHARD) || (y < L - 1 && Kr[i + W] === K.ORCHARD)) { c = C.fence; break; } /* the garden fence onto the orchard */
          if (o >= 0 && ((x > 0 && Br[i - 1] !== o && Kr[i - 1] === K.GARDEN) || (y > 0 && Br[i - W] !== o && Kr[i - W] === K.GARDEN))) { c = C.fence; break; }
          const bed = o >= 0 && hh(o, 5) < 0.35 && ((x + (o & 3)) % 9 < 4) && ((y + o) % 11 < 5); c = bed ? C.soil[pickI(3, y % 2 ? 0.3 : 0.7, x, y)] : C.grass[pickI(4, 0.5 + (vn(x * 0.12, y * 0.12) - 0.5) * 0.5, x, y)]; break; }
        case K.COURT: if (desert && plan.oasis) { c = C.dirt[pickI(4, 0.62 + (hh(x, y) - 0.5) * 0.5, x, y)]; break; } c = (vn(x * 0.18, y * 0.18) > 0.62) ? C.grass[pickI(4, 0.35, x, y)] : C.yard[pickI(3, 0.5 + (hh(x, y) - 0.5) * 0.5, x, y)]; break;
        case K.PARK: if (Br[i] === -6) { c = hh(x, y) < 0.012 ? C.field.wheat[4] : C.grass[pickI(4, 0.62 + (vn(x * 0.1, y * 0.1) - 0.5) * 0.4, x, y)]; break; } // the village green
          if (Br[i] === -3 && plan.oldTown) { const O = plan.oldTown, mid = O.rw / 2 + O.belt / 2, e = Math.hypot((x + 0.5 - O.cx) / (O.rx + mid), (y + 0.5 - O.cy) / (O.ry + mid)); // the green belt and its promenade
            c = Math.abs(e - 1) * (O.rx + mid) < 1.1 ? C.gravel[pickI(3, 0.6, x, y)] : C.grass[pickI(4, 0.52 + (vn(x * 0.12, y * 0.12) - 0.5) * 0.5, x, y)]; break; }
          { const pk = plan.parks.find(p => y >= p.ya && y <= p.yb); const px = pk ? x - plan.mx[(pk.ya + pk.yb) >> 1] : x, py = pk ? y - pk.ya : y;
          if (pk && Math.abs(Math.abs(px) - 20 - (py * 0.6) % 20) < 1.1) { c = C.pave[1]; break; } c = C.grass[pickI(4, 0.55 + (vn(x * 0.1, y * 0.1) - 0.5) * 0.6, x, y)]; break; }
        case K.LOT: { const sl = plan.slots.find(s => s.on === 'lot' && Math.abs(s.x - x) <= s.r && Math.abs(s.y - y) <= s.r);
          if (sl) { const rr = Math.hypot(x + 0.5 - sl.x, y + 0.5 - sl.y), ring = sl.kind === 'arty' ? 6 : 4.5; if (Math.abs(rr - ring) < 1.1) { c = ((Math.atan2(y - sl.y, x - sl.x) * 3 | 0) & 1) ? C.sand[1] : C.sand[0]; break; } } // sandbag ring of a gun pit
          c = C.gravel[pickI(3, 0.5 + (hh(x, y) - 0.5) * 0.6, x, y)]; break; }
        case K.CHYARD: c = ((x * 3 + y * 5) % 23 === 0 && hh(x, y) < 0.6) ? C.side[2] : C.grass[pickI(4, 0.45 + (vn(x * 0.2, y * 0.2) - 0.5) * 0.4, x, y)]; break; // gravestones
        case K.MEADOW: if (Br[i] === -30) { const ed = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].some(q => q >= 0 && Br[q] !== -30); c = ed ? ((x + y) % 3 === 0 ? C.beam : C.fence) : C.grass[pickI(4, 0.62 + (vn(x * 0.15, y * 0.15) - 0.5) * 0.4, x, y)]; break; } // a paddock: grazed grass inside a post-and-rail fence
          if (Br[i] === -31) { c = C.field.grass[pickI(5, 0.12 + (vn(x * 0.2, y * 0.2) - 0.5) * 0.3, x, y)]; break; } // the floor of a wood, dark under the trees
          if (Br[i] === -8) { const n = vn(x * 0.13, y * 0.13); c = n > 0.64 ? C.soil[pickI(3, 0.5 + (hh(x, y) - 0.5) * 0.6, x, y)] : C.grass[pickI(4, 0.3 + n * 0.4 + (hh(x, y) - 0.5) * 0.3, x, y)]; break; } // waste ground: rough grass and bare earth
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
          if (Br[i] === -14) { const ed = [at(x, y - 1), at(x, y + 1)].some(j => j >= 0 && Kr[j] !== K.QUAY && Kr[j] !== K.BLDG); c = ed ? (x % 4 === 0 ? C.beam : C.hull[1]) : (x % 3 === 0 ? C.hull[1] : C.hull[2]); break; } // the pleasure pier: planks across it, a rail along each side
          { const nW = (j => j >= 0 && (Kr[j] === K.RIVER || Kr[j] === K.SEA)); if (nW(at(x, y - 1)) || nW(at(x, y + 1)) || nW(at(x - 1, y)) || nW(at(x + 1, y))) { c = hh(x, y) < 0.06 ? C.shadow : C.conc[0]; break; } // the wall face above the water
          c = C.pave[pickI(4, 0.62 + (hh(x >> 1, y) - 0.5) * 0.25 + ((x % 6) === 0 ? -0.15 : 0), x, y)]; break; }
        case K.WORKS: { const nb = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].some(j => j >= 0 && (Kr[j] === K.MEADOW || Kr[j] === K.FIELD || Kr[j] === K.GARDEN || Kr[j] === K.COURT)); // a cinder yard with oil stains, fenced where it meets open ground
          c = nb ? ((x + y) % 2 ? C.fence : C.conc[1]) : hh(x >> 1, y >> 1) < 0.015 ? C.char[1] : C.gravel[pickI(3, 0.35 + (vn(x * 0.2, y * 0.2) - 0.5) * 0.5, x, y)]; break; }
        case K.RAIL: { const m = RMx[i]; c = m === 2 ? C.rail[(y & 1) ? 0 : 1] : m === 3 ? C.beam : m === 4 ? (hh(x, y) < 0.18 ? C.gravel[1] : C.grass[pickI(4, 0.3 + (vn(x * 0.2, y * 0.2) - 0.5) * 0.4, x, y)]) : C.gravel[pickI(3, 0.25 + (hh(x, y) - 0.5) * 0.5, x, y)]; break; } // ballast, sleepers, rails, the grassy verge
        case K.RBRIDGE: { const m = RMx[i]; if (Br[i] === -21) { const k = x + 0.5 - plan.rail.x; c = m === 2 ? C.rail[(y & 1) ? 0 : 1] : m === 3 ? C.beam : Math.abs(k) > 8.5 ? C.stone[0] : Math.abs(k) > 7 ? C.stone[3] : C.stone[1]; break; } /* the stone viaduct: parapets, its deck, sleepers and rails */ c = m === 2 ? C.rail[(y & 1) ? 0 : 1] : m === 3 ? C.beam : m === 5 ? ((y % 4) < 2 ? C.conc[0] : C.shadow) : C.char[1]; break; } // a rail bridge: iron truss each side, a deck with sleepers
        case K.SEA: { if (seaPix && Br[i] === -10) { c = seaPix(x, y, true); break; } // a host's own water (the game's sea), calmer in the harbour
          if (plan.shore) { const dd = plan.shore[i]; // around islands: foam where the waves break on a beach or the rocks, a lighter band of surf, then the sea
            if (dd <= 1 && hh(x >> 1, y) < 0.8) { c = C.foam; break; } if (dd <= 3 && hh(x, y >> 1) < 0.45) { c = C.sea[5]; break; }
            if (seaPix) { c = seaPix(x, y, false, 0); break; } c = C.sea[pickI(6, 0.62 - Math.min(dd, 70) * 0.006 + Math.sin(x * 0.21 + y * 0.13 + Math.sin(y * 0.05) * 2) * 0.07 + (vn(x * 0.05, y * 0.04) - 0.5) * 0.18, x, y)]; break; }
          if (Br[i] === -10) { c = C.sea[pickI(6, 0.26 + (vn(x * 0.08, y * 0.08) - 0.5) * 0.12 + Math.sin(x * 0.4 + y * 0.9) * 0.03, x, y)]; break; } // calm water in the harbour
          const cs = plan.coast.cs, d = Math.max(cs * (x - plan.coast.xs[y]), plan.coast.yC !== null ? (y - plan.coast.ycol[x]) * plan.coast.hd : -1e9), j = at(x - cs, y);
          const jh = plan.coast.yC !== null ? at(x, y - plan.coast.hd) : -1; if (d < 1.5 && ((j >= 0 && Kr[j] === K.BEACH) || (jh >= 0 && Kr[jh] === K.BEACH))) { c = C.foam; break; } if (d < 3.5 && j >= 0 && hh(x, y >> 1) < 0.4) { c = C.sea[5]; break; } // the surf on the beach
          if (seaPix) { c = seaPix(x, y, false, plan.calm ? plan.calm[i] / 255 : 0); break; } // (calm: how close a harbour basin is)
          c = C.sea[pickI(6, 0.62 - Math.min(d, 70) * 0.006 + Math.sin(x * 0.21 + y * 0.13 + Math.sin(y * 0.05) * 2) * 0.07 + (vn(x * 0.05, y * 0.04) - 0.5) * 0.18, x, y)]; break; } // deeper away from the shore, long swells
        case K.APRON: { if (desert && plan.airbase && plan.airbase.desert) { c = [[210, 188, 142], [220, 198, 154]][(hh(x, y) * 2) | 0]; break; } if (desert && plan.pits) { c = C.conc[pickI(4, 0.6 + (hh(x, y) - 0.5) * 0.3, x, y)]; break; } if (opts && opts.apronPix) { c = opts.apronPix(x, y); break; } let l = 0.58 + (vn(x * 0.1, y * 0.1) - 0.5) * 0.25; if ((x - 4) % 24 === 0 || y % 24 === 0) l -= 0.3; if (vn(x * 0.05 + 70, y * 0.05) > 0.72) l -= 0.15; c = C.conc[pickI(4, l, x, y)]; break; } // an airfield's concrete apron (as the game's final airfield)
        case K.TRENCH: { if (desert) { c = (x + y) % 3 === 0 ? C.trench[1] : C.trench[0]; break; } const rim = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].some(j => j >= 0 && Kr[j] !== K.TRENCH); c = rim ? C.sand[1] : C.char[pickI(3, 0.5 + (hh(x, y) - 0.5) * 0.4, x, y)]; break; } // a trench: dark, a sandbag rim
        case K.BEACH: if (Br[i] === -13) { c = hh(x, y) < 0.16 || vn(x * 0.15, y * 0.15) > 0.62 ? C.field.hedge[pickI(3, 0.5 + hh(x, y) * 0.4, x, y)] : C.sand[pickI(2, 0.45 + (vn(x * 0.25, y * 0.25) - 0.5) * 0.6, x, y)]; break; } // dunes: sand under marram grass
        { const cs = plan.coast ? plan.coast.cs : 1, j = at(x + cs, y), wet = plan.coast ? j >= 0 && Kr[j] === K.SEA : [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].some(q => q >= 0 && Kr[q] === K.SEA); /* round an island: wet on every side */ c = wet ? C.sand[0] : hh(x, y) < 0.05 ? C.field.hedge[2] : C.sand[pickI(2, 0.55 + (vn(x * 0.2, y * 0.2) - 0.5) * 0.6, x, y)]; break; } // sand, wet at the waterline, tufts of dune grass
        case K.TRACK: { const up = y + 1 < L && Kr[i + W] === K.TRACK, dn = y > 0 && Kr[i - W] === K.TRACK; // two wheel ruts with grass between them
          c = up && dn ? C.field.grass[pickI(5, 0.3 + (hh(x, y) - 0.5) * 0.5, x, y)] : C.sand[hh(x, y) < 0.7 ? 0 : 1]; break; }
        case K.BANK: c = hh(x, y) < 0.22 ? C.field.wheat[1] : (y + x * 3) % 5 === 0 ? C.field.hedge[2] : C.soil[pickI(3, 0.4 + (vn(x * 0.3, y * 0.3) - 0.5) * 0.5, x, y)]; break; // mud and reeds
        case K.ROCK: { const n = vn(x * 0.32 + 5, y * 0.32), sea = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].some(q => q >= 0 && Kr[q] === K.SEA); // boulders lit from the upper left, wet and dark at the water
          c = sea && hh(x, y) < 0.5 ? C.rubble[1] : n > 0.6 ? C.conc[3] : n > 0.5 ? C.conc[2] : n > 0.4 ? C.rubble[4] : n > 0.3 ? C.rubble[3] : C.rubble[2]; if (vn(x * 0.32 + 5.3, y * 0.32 - 0.3) > n + 0.08) c = C.rubble[1]; break; }
        case K.RUNWAY: { const A = plan.airbase; if (A.desert) { const lx = x - (A.rx - A.rw / 2), sand = [[228, 210, 170], [236, 220, 182], [242, 228, 194]]; // a runway of rolled sand: dark edges, white markers along them, tyre marks
            c = lx === 0 || lx === A.rw - 1 ? C.spoil[1] : (lx === 1 || lx === A.rw - 2) && y % 16 < 2 ? C.dome[4] : Math.abs(Math.abs(lx - A.rw / 2 + 0.5) - 4) < 1 && hh(x, y >> 1) < 0.5 ? C.spoil[2] : sand[pickI(3, 0.5 + (vn(x * 0.1, y * 0.1) - 0.5) * 0.5, x, y)]; break; }
          const lx = x - (A.rx - A.rw / 2), end = Math.min(y - A.y0, A.y1 - y); let l = 0.62 + (vn(x * 0.12, y * 0.12) - 0.5) * 0.2; // concrete with edge lines, a dashed centre line, threshold bars, tyre marks
          if (lx === 0 || lx === A.rw - 1) { c = C.conc[1]; break; } if (lx === 1 || lx === A.rw - 2) { c = C.mark; break; }
          if (end < 10 && end > 2 && lx >= 3 && lx <= A.rw - 4 && (lx - 3) % 3 < 2) { c = C.mark; break; }
          if (Math.abs(lx - A.rw / 2 + 0.5) < 1 && end > 14 && (y >> 3) % 2 === 0) { c = C.mark; break; }
          if (end > 12 && end < 70 && Math.abs(Math.abs(lx - A.rw / 2 + 0.5) - 3) < 1.5 && hh(x, y >> 1) < 0.5) l -= 0.3; if (y % 20 === 0) l -= 0.12; c = C.conc[pickI(4, l, x, y)]; break; }
        case K.DESERT: { if (sandPix) { c = sandPix(x, y); break; } const n = vn(x * 0.02, y * 0.02); // open desert: the Campaign's desert ground (a host passes its own sand, as the game does)
          c = C.dune[pickI(5, 0.5 + Math.sin(x * 0.05 + n * 6 + y * 0.09) * 0.3 + (vn(x * 0.1, y * 0.1) - 0.5) * 0.2, x, y)]; break; }
        case K.SPOIL: c = C.spoil[pickI(5, (-40 - Br[i]) / 20, x, y)]; break; // dug sand heaped beside a trench or a ditch (Br: -40 - its light, 0..20)
        case K.DITCH: { const t = (-70 - Br[i]) / 16; c = t < 0.22 ? C.spoil[4] : t < 0.4 ? C.spoil[2] : t < 0.62 ? C.dirt[0] : t < 0.8 ? [90, 66, 40] : [58, 42, 24]; break; } // an anti-tank ditch: the far side lit, the floor, the near side in shadow (Br: -70 - across, 0..16)
        case K.CLIFF: { const left = x <= plan.wallL[y], e = left ? plan.wallL[y] : plan.wallR[y], d = left ? e - x : x - e; // rock: big masses lit from the upper left in a few flat tones, dark crevices, the cliff face along the edge
          if (d < 7) { const st = ((y + (x * 3 >> 1)) % 4) === 0; c = left ? (st || d < 2 ? C.rock[0] : C.rock[1]) : (st ? C.rock[3] : d < 2 ? C.rock[5] : C.rock[4]); break; } // a left wall's face looks east, away from the light; a right wall's face is lit; strata
          const hg = (xx, yy) => vn(xx * 0.035 + 17, yy * 0.035) * 0.7 + vn(xx * 0.09 + 17, yy * 0.09) * 0.3, g = (hg(x - 1, y - 1) - hg(x + 1, y + 1)) * 9, cr = Math.abs(vn(x * 0.06 + 26, y * 0.06) - 0.5) < 0.025;
          c = cr ? C.rock[0] : C.rock[clamp(Math.round(2.4 + g * 2.2 + (hg(x, y) - 0.5) * 1.2 + bay(x, y) * 0.8), 1, 5)]; break; }
        case K.WADI: { const t = -Br[i]; c = t === 91 ? C.spoil[1] : t === 92 ? C.spoil[2] : hh(x, y) < 0.12 ? C.spoil[1] : hh(x + 7, y) < 0.06 ? C.spoil[4] : C.dune[pickI(5, 0.62 + Math.sin(x * 0.6 + y * 0.2) * 0.15, x, y)]; break; } // a dry riverbed: pebbly sand between low banks
        case K.RAVINE: { const rv = plan.ravines.find(q => y >= q.y0 - 4 && y <= q.y1 + 4), tp = rv.top(x), bt = rv.bot(x), t = (tp - y) / Math.max(1, tp - bt); // a deep ravine: the far wall's face, lit at its rim and darkening with depth in strata, the black floor far below, the near lip in shadow
          if (t < 0.05) c = C.rock[5]; else if (t < 0.46) { const q = (t - 0.05) / 0.41, col = vn(x * 0.25, 3 + rv.s) > 0.6 ? 1 : 0; c = ((y + (x >> 2)) % 3 === 0) ? C.rock[Math.max(0, 3 - Math.round(q * 4) - col)] : C.rock[clamp(Math.round(4.2 - q * 4.6 - col + bay(x, y) * 0.9), 0, 4)]; } // the far wall's face: lit at the rim, strata and buttresses, darkening downward
          else if (t < 0.88) { const q = (t - 0.46) / 0.42; c = C.deep[clamp(Math.round(2.4 - q * 3 + (vn(x * 0.2, y * 0.3) - 0.5) * 1.2 + bay(x, y) * 0.8), 0, 3)]; } else c = t < 0.95 ? C.deep[1] : C.rock[2]; break; } // the depths, black at the bottom; the near lip in shadow
        case K.OASIS: c = C.dirt[pickI(4, 0.6 + (hh(x, y) - 0.5) * 0.5 + (vn(x * 0.2, y * 0.2) - 0.5) * 0.3, x, y)]; break; // the watered ground of an oasis
        case K.ORCHARD: if (plan.P.climate === 'desert') { c = ((x + y * 3) % 7 === 0) ? C.field.hedge[0] : C.field.soil[pickI(4, 0.55 + (vn(x * 0.2, y * 0.2) - 0.5) * 0.4, x, y)]; break; } // a palm grove: watered earth, irrigation channels
          c = (hh(x, y) < 0.02) ? C.field.wheat[4] : C.field.grass[pickI(5, 0.62 + (vn(x * 0.09, y * 0.09) - 0.5) * 0.35, x, y)]; break; // mown meadow, a few flowers
        default: c = parcelPix(plan, i, x, y);
      }
      // facades and shadows: the view is slightly from the south, so a building shows its south wall below its roof (as in the game)
      if (k !== K.BLDG && desert) { const sb = bAt(x - 3, y + 3); if (sb && !(sb.part === 'apse')) c = [c[0] * 0.6 + 7 | 0, c[1] * 0.6 + 6 | 0, c[2] * 0.6 + 10 | 0]; } // the desert: no facades, the shadow of the game's sprites (3 px right, 3 px down)
      else if (k !== K.BLDG) {
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
    for (let k = 1; k <= 24; k++) { const yy = ty + dir * (k + 6); let hw = Math.min(hwPrev + 1.5, 12 + k * 1.2, 18, 18 - Math.max(0, k - 14) * 1.6); /* wider than the portal, round at its far end */ let free = 0; while (free < hw && open(tx - 1 - free, yy) && open(tx + free, yy)) free++; hw = Math.min(hw, free); if (hw < 4) break; hwPrev = hw;
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
    else if (o.kind === 'buffer') { for (let k = -4; k <= 4; k++) { put(o.x + k, o.y, C.fire[1]); put(o.x + k, o.y + 1, C.dark); } }
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
    if (t.palm && t.stump) { put(t.x, t.y, C.tree[0]); put(t.x + 1, t.y, C.tree[1]); put(t.x, t.y - 1, C.tree[1]); put(t.x + 1, t.y - 1, C.tree[2]); for (let k = 1; k <= 4; k++) put(t.x + 1 + k, t.y - 1 - (k >> 1), C.tree[k % 2 ? 3 : 2]); put(t.x + 2, t.y - 2, C.shadow, 0.35); continue; } // a palm shot off, its crown on the ground
    if (t.palm) { palmPix(t, put); continue; }
    if (t.scrub) { for (let yy = -2; yy <= 2; yy++) for (let xx = -2; xx <= 2; xx++) { const dd = xx * xx + yy * yy; if (dd > 5) continue; put(t.x + xx + 2, t.y + yy - 2, C.shadow, 0.35); } for (let yy = -2; yy <= 2; yy++) for (let xx = -2; xx <= 2; xx++) { const dd = xx * xx + yy * yy; if (dd > 5) continue; put(t.x + xx, t.y + yy, C.field.crop[pickI(4, 0.45 + (-xx + yy) * 0.12, t.x + xx, t.y + yy)]); } continue; } // desert scrub
    for (let yy = -t.r; yy <= t.r; yy++) for (let xx = -t.r; xx <= t.r; xx++) if (xx * xx + yy * yy <= t.r * t.r) put(t.x + xx + 2, t.y + yy - 2, C.shadow, 0.4);
    for (let yy = -t.r; yy <= t.r; yy++) for (let xx = -t.r; xx <= t.r; xx++) { const dd = (xx * xx + yy * yy) / (t.r * t.r); if (dd > 1) continue;
      if (dd > 0.72) { put(t.x + xx, t.y + yy, C.tree[0]); continue; }
      if (t.fruit && dd < 0.7 && hh(t.x * 5 + xx, t.y * 3 + yy) < 0.14) { put(t.x + xx, t.y + yy, hh(t.x, t.y) < 0.5 ? C.fruit[0] : C.fruit[1]); continue; }
      const l = 0.42 + 0.38 * (-0.55 * xx / t.r + 0.75 * yy / t.r) + 0.3 * (Math.sqrt(1 - dd) - 0.5) + (t.fruit ? 0.12 : t.v === 4 ? 0.2 : (t.v - 1) * 0.05); put(t.x + xx, t.y + yy, C.tree[pickI(6, clamp(l, 0, 1), t.x + xx, t.y + yy)]); } }
  if (plan.wallL) for (let sr = 0; sr < h; sr++) { const y = y0 + h - 1 - sr, e = plan.wallL[y]; if (e < 0) continue; const n = 5 + Math.round(vn(y * 0.05, 3) * 4); for (let k = 1; k <= n; k++) { const x = Math.round(e) + k; if (x >= 0 && x < W && Kr[y * W + x] !== K.CLIFF && Kr[y * W + x] !== K.RAVINE) put(x, y, C.shadow, 0.35); } } // a left wall throws its shadow on the floor
  for (const sp of plan.spills || []) for (let yy = -sp.r; yy <= sp.r; yy++) for (let xx = Math.round(-sp.r * 1.4); xx <= sp.r * 1.4; xx++) { const e = Math.hypot(xx / 1.4, yy) / sp.r + (vn((sp.x + xx) * 0.2, (sp.y + yy) * 0.2) - 0.5) * 0.5; if (e < 1) put(sp.x + xx, sp.y + yy, e < 0.6 ? C.deep[0] : C.char[1]); } // spilt oil
  for (const pp of plan.pipes || []) for (let q = 0; q + 1 < pp.length; q++) { const [ax, ay] = pp[q], [bx, by] = pp[q + 1], n = Math.ceil(Math.hypot(bx - ax, by - ay) * 2); if (Math.max(ay, by) < y0 - 2 || Math.min(ay, by) > y0 + h + 2) continue; // a pipeline on low supports
    for (let k = 0; k <= n; k++) { const px = Math.round(ax + (bx - ax) * k / n), py = Math.round(ay + (by - ay) * k / n); put(px, py, C.conc[1]); put(px + 1, py, C.conc[1]); put(px, py + 1, C.side[2]); put(px + 1, py + 1, C.side[2]); } put(ax + 2, ay - 1, C.shadow, 0.4); put(ax, ay - 1, C.hatch); }
  for (const pj of plan.pumps || []) { if (pj.y < y0 - 8 || pj.y > y0 + h + 8) continue; const { x: px, y: py, d } = pj; for (let k = -3; k <= 5; k++) { put(px + k + 1, py - 2, C.shadow, 0.4); put(px + k, py + 1, C.conc[2]); put(px + k, py, C.conc[0]); } put(px + 5 * d, py + 1, C.hatch); put(px + 5 * d, py, C.hatch); put(px + 5 * d, py - 1, C.hatch); put(px, py - 1, C.dark); put(px + 1, py - 1, C.dark); // a pumpjack: its beam, the horsehead, the base, an oil stain
    for (let yy = -3; yy <= 2; yy++) for (let xx = -2; xx <= 3; xx++) if (xx * xx + yy * yy < 7) put(px + 1 + xx, py - 4 + yy, C.char[0], 0.45); }
  for (const dk of plan.derricks || []) { if (dk.y < y0 - 20 || dk.y > y0 + h + 20) continue; const { x: cx, y: cy } = dk; for (let k = 0; k < 14; k++) { put(cx + 3 + k, cy - 3 - (k >> 1), C.shadow, 0.35); put(cx + 4 + k, cy - 3 - (k >> 1), C.shadow, 0.35); } // a lattice derrick: its long shadow, the square base, the lattice, the crown block
    for (let k = -5; k <= 5; k++) { put(cx + k, cy - 5, C.dark); put(cx + k, cy + 5, C.dark); put(cx - 5, cy + k, C.dark); put(cx + 5, cy + k, C.dark); put(cx + k, cy + k, C.char[2]); put(cx + k, cy - k, C.char[2]); }
    for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) put(cx + xx, cy + yy, C.side[2]); put(cx, cy, C.dark); }
  for (const sg of plan.sangars || []) { if (sg.y < y0 - 9 || sg.y > y0 + h + 9) continue; for (let k = 0; k < sg.r * 5; k++) { const a = k / (sg.r * 5) * 5.4 + 0.4 + (sg.x > W / 2 ? 3.14 : 0), px = Math.round(sg.x + Math.cos(a) * sg.r), py = Math.round(sg.y + Math.sin(a) * sg.r), l = hh(k, sg.s * 9); // a stone sangar on a ledge, open at the back
      put(px + 1, py - 2, C.shadow, 0.4); put(px, py, l > 0.6 ? C.stone[2] : l > 0.3 ? C.stone[1] : C.stone[0]); put(px + 1, py, l > 0.5 ? C.stone[1] : C.stone[0]); put(px, py - 1, C.stone[0]); } }
  for (const vd of plan.viaducts || []) for (const pyy of vd.piers) { if (pyy < y0 - 6 || pyy > y0 + h + 6) continue; for (let yy = pyy; yy < pyy + 4; yy++) { put(vd.x - 11, yy, C.stone[1]); put(vd.x - 12, yy, C.stone[0]); put(vd.x + 10, yy, C.stone[2]); put(vd.x + 11, yy, C.stone[0]); for (let k = 12; k < 20; k++) put(vd.x + k, yy - 2, C.deep[0], 0.6); } } // the viaduct's piers either side of the deck, their shadow down into the ravine
  for (const vd of plan.viaducts || []) for (let yy = vd.y0; yy <= vd.y1; yy++) for (let k = 10; k < 16; k++) put(vd.x + k, yy - 1, C.deep[0], 0.45); // the deck's shadow on the ravine's far wall
  for (const wg of plan.wagons || []) { if (wg.y + 16 < y0 || wg.y - 16 > y0 + h) continue; for (let yy = -13; yy <= 13; yy++) for (let xx = -6; xx <= 5; xx++) { const edge = Math.abs(yy) === 13 || xx === -6 || xx === 5; put(wg.x + xx + 2, wg.y + yy - 2, C.shadow, 0.35); // a wagon on the siding: a boxcar's ribbed roof or a flatcar's load
      put(wg.x + xx, wg.y + yy, wg.burn ? (hh(xx, yy) < 0.5 ? C.char[0] : C.char[2]) : edge ? C.hull[0] : wg.kind === 'box' ? (yy % 4 === 0 ? C.hull[1] : C.hull[2]) : (Math.abs(yy) < 8 && Math.abs(xx) < 4 ? C.canvas[2] : C.hull[1])); } }
  for (const cn of plan.canopies || []) for (let y = Math.max(cn.y0, y0); y <= Math.min(cn.y1, y0 + h); y++) for (let x = cn.x0; x <= cn.x1; x++) put(x, y, x === cn.x0 ? C.hatch : y % 4 === 0 ? C.canvas[0] : C.canvas[1]); // the platform's canopy
  for (const dr of plan.drums || []) { put(dr.x, dr.y, C.hull[0]); put(dr.x + 1, dr.y, C.char[2]); put(dr.x, dr.y - 1, C.char[2]); put(dr.x + 1, dr.y - 1, C.hull[0]); }
  for (const pt of plan.pits || []) { if (pt.y + pt.r + 3 < y0 || pt.y - pt.r - 3 >= y0 + h) continue; const n = Math.max(8, Math.round(pt.r * 2.4)); // a pit's ring of sandbags, each bag drawn, lit from the upper left
    for (let k = 0; k < n; k++) { const a = k / n * 6.283, bx = pt.x + Math.cos(a) * pt.r, by = pt.y + Math.sin(a) * pt.r, lit = -Math.cos(a) + Math.sin(a); put(Math.round(bx + Math.cos(a) * 2) + 1, Math.round(by + Math.sin(a) * 2) - 1, C.shadow, 0.35);
      for (let q = -1; q <= 1; q++) put(Math.round(bx - Math.sin(a) * q * 0.9), Math.round(by + Math.cos(a) * q * 0.9), q === 1 ? C.bag[3] : C.bag[lit > 0.4 ? 0 : lit > -0.6 ? 1 : 2]); put(Math.round(bx + Math.cos(a)), Math.round(by + Math.sin(a)), C.bag[2]); } }
  for (const cl of plan.coils || []) for (let q = 0; q + 1 < cl.length; q++) { const [ax, ay] = cl[q], [bx, by] = cl[q + 1], Lg = Math.hypot(bx - ax, by - ay) || 1, n = Math.ceil(Lg / 0.35), ux = (bx - ax) / Lg, uy = (by - ay) / Lg; // concertina wire: coils looping along the belt, iron pickets
    if (Math.max(ay, by) + 4 < y0 || Math.min(ay, by) - 4 >= y0 + h) continue;
    for (let k = 0; k < n; k++) { const px = ax + (bx - ax) * k / n, py = ay + (by - ay) * k / n, ph = (q * n + k) * 0.55, o = Math.sin(ph) * 2.2, f = Math.cos(ph); put(Math.round(px - uy * o + ux * f * 0.8), Math.round(py + ux * o + uy * f * 0.8), f > 0 ? C.wire[0] : C.wire[1]); }
    for (let k = 0; k < Lg; k += 8) { const px = Math.round(ax + ux * k), py = Math.round(ay + uy * k); put(px, py, C.wire[2]); put(px, py + 1, C.wire[2]); put(px, py - 1, C.wire[2]); put(px + 1, py - 2, C.shadow, 0.35); } }
  for (const mn of plan.mines || []) { if (mn.y < y0 - 2 || mn.y > y0 + h + 2) continue; put(mn.x, mn.y, C.spoil[1]); put(mn.x + 1, mn.y, C.spoil[1]); put(mn.x, mn.y - 1, C.spoil[0]); put(mn.x + 1, mn.y - 1, C.spoil[0]); } // buried mines: only small scars in the sand
  for (const sg of plan.signs || []) { if (sg.y < y0 - 4 || sg.y > y0 + h + 4) continue; put(sg.x, sg.y, C.hatch); put(sg.x, sg.y + 1, C.hatch); put(sg.x, sg.y - 1, C.hatch); put(sg.x + 1, sg.y - 2, C.shadow, 0.35); // a marker post with a warning sign
    if (sg.k) { put(sg.x - 1, sg.y + 2, C.dome[4]); put(sg.x, sg.y + 2, C.fire[2]); put(sg.x + 1, sg.y + 2, C.dome[4]); put(sg.x - 1, sg.y + 3, C.dome[4]); put(sg.x, sg.y + 3, C.dome[4]); put(sg.x + 1, sg.y + 3, C.dome[4]); } else { put(sg.x - 1, sg.y + 1, C.fire[2]); put(sg.x + 1, sg.y + 1, C.fire[2]); } }
  for (const br of plan.barriers || []) { if (br.y < y0 - 2 || br.y > y0 + h + 2) continue; for (let xx = br.x0; xx <= br.x1; xx++) { put(xx, br.y, (((xx - br.x0) >> 1) % 2) ? C.dome[4] : C.fire[2]); put(xx + 1, br.y - 1, C.shadow, 0.35); } } // a barrier pole across the road
  for (const wl of plan.wells || []) { if (wl.y + 4 < y0 || wl.y - 4 >= y0 + h) continue; // a well: a stone ring round dark water, a wooden frame across it, its shadow
    for (let yy = -4; yy <= 4; yy++) for (let xx = -4; xx <= 4; xx++) { const rr = Math.hypot(xx, yy); if (rr < 3.6) put(wl.x + xx + 1, wl.y + yy - 1, C.shadow, 0.35); }
    for (let yy = -3; yy <= 3; yy++) for (let xx = -3; xx <= 3; xx++) { const rr = Math.hypot(xx + 0.5, yy + 0.5); if (rr < 1.6) put(wl.x + xx, wl.y + yy, C.dark); else if (rr < 3.2) put(wl.x + xx, wl.y + yy, (xx < 0 || yy >= 0) ? C.wash[0][3] : C.wash[0][1]); }
    for (let xx = -3; xx <= 2; xx++) put(wl.x + xx, wl.y, C.beam); }
  for (const nt of plan.nets || []) { if (nt.y + nt.ry + 4 < y0 || nt.y - nt.ry - 4 >= y0 + h) continue; // a sand-coloured camouflage net on poles: blotched, a mesh, a ragged edge; what is under it is only a darker shape
    const ex = (xx, yy) => Math.hypot(xx / nt.rx, yy / nt.ry) + (vn((nt.x + xx) * 0.4, (nt.y + yy) * 0.4 + nt.s) - 0.5) * 0.35;
    for (let yy = -nt.ry - 2; yy <= nt.ry + 2; yy++) for (let xx = -nt.rx - 2; xx <= nt.rx + 2; xx++) if (ex(xx, yy) < 1) put(nt.x + xx + 3, nt.y + yy - 3, C.shadow, 0.3);
    for (let yy = -nt.ry - 2; yy <= nt.ry + 2; yy++) for (let xx = -nt.rx - 2; xx <= nt.rx + 2; xx++) { const e = ex(xx, yy); if (e >= 1) continue; const bl = vn((nt.x + xx) * 0.22 + nt.s, (nt.y + yy) * 0.22), mesh = (xx + yy) % 3 === 0 || (xx - yy) % 3 === 0;
      let c2 = bl > 0.62 ? C.net[1] : bl < 0.35 ? C.net[4] : C.net[3]; if (mesh) c2 = bl > 0.62 ? C.net[0] : C.net[2]; if (nt.under && !mesh && Math.abs(xx) < nt.rx * 0.5 && Math.abs(yy) < nt.ry * 0.45) c2 = C.net[1]; if (e > 0.9 && hh(nt.x + xx, nt.y + yy) < 0.5) c2 = C.net[0]; put(nt.x + xx, nt.y + yy, c2); } }
  // soot around gutted and burning houses
  for (const it of items) { if (!(it.dmg >= 3 || it.fire) || it.y0 + it.h + 4 < y0 || it.y0 - 4 >= y0 + h) continue;
    for (let yy = it.y0 - 4; yy < it.y0 + it.h + 4; yy++) for (let xx = it.x0 - 4; xx < it.x0 + it.w + 4; xx++) { const o = at(xx, yy); if (o < 0 || Kr[o] === K.BLDG || Br[o] === it.id) continue;
      const dd = Math.max(it.x0 - xx, xx - (it.x0 + it.w - 1), it.y0 - yy, yy - (it.y0 + it.h - 1)); if (dd > 0 && hh(xx * 3, yy * 7) < 0.75 - dd * 0.17) put(xx, yy, C.char[0], 0.42); } }
  if (!(opts && opts.noFx)) for (const f of plan.fires) { const bx = fireBox(f); if (bx.y1 < y0 || bx.y0 >= y0 + h) continue; fireFx(plan, f, 0, put); }
}
// The desert's domed hall (it takes the church's place and footprint, never a minaret): a big white dome over the crossing, a small dome on
// the front tower, a half dome over the apse, flat plastered roofs on the nave and the transepts. Domes are lit from the upper left.
function domeLit(dx, dy, dd) { return 0.42 + 0.42 * (-0.55 * dx + 0.75 * dy) + 0.25 * (Math.sqrt(Math.max(0, 1 - dd * dd)) - 0.5); }
function domedHallPix(b, x, y) {
  const D = b.church.dome, ddx = (x + 0.5 - D.x) / D.r, ddy = (y + 0.5 - D.y) / D.r, dd = Math.hypot(ddx, ddy);
  if (dd < 1) { if (dd > 0.86) return C.dome[0]; if (dd < 0.16) return C.dome[4]; if (dd < 0.27) return C.dome[1]; return C.dome[pickI(5, domeLit(ddx, ddy, dd), x, y)]; } // the drum's rim, a lantern on top
  if (b.part === 'tower' || b.part === 'apse') { const cx = b.part === 'apse' ? b.acx : b.x0 + b.w / 2, cy = b.part === 'apse' ? b.acy : b.y0 + b.h / 2, r = b.part === 'apse' ? b.r : b.w / 2, ex = (x + 0.5 - cx) / r, ey = (y + 0.5 - cy) / r, e = Math.hypot(ex, ey);
    if (e < 1) return e > 0.8 ? C.dome[0] : C.dome[pickI(5, domeLit(ex, ey, e), x, y)];
    return C.wash[0][1]; }
  const lx = x - b.x0, ly = b.y0 + b.h - 1 - y; return roofPix(lx, ly, { w: b.w, h: b.h, style: 'flat', wash: 0, t: b.t, seed: b.seed }, null, x, y);
}
// A date palm from above: 6 or 7 fronds radiating from a dark heart, lighter along each frond and toward the light, dark at the tips; its shadow first
function palmPix(t, put) {
  const R = t.r + 1.2, rot = hh(t.x, t.y) * 6.283, nf = 6 + ((hh(t.y, t.x) * 2) | 0), TAU = 6.283;
  const on = (xx, yy) => { const d = Math.hypot(xx, yy); if (d > R) return 0; if (d < 1.1) return 2; const a = Math.atan2(yy, xx) - rot, g = Math.abs((((a * nf / TAU) % 1) + 1.5) % 1 - 0.5) * TAU / nf * d; return g < 0.62 + 0.45 * (1 - d / R) ? 1 : 0; };
  const n = Math.ceil(R);
  for (let yy = -n; yy <= n; yy++) for (let xx = -n; xx <= n; xx++) if (on(xx, yy)) put(t.x + xx + 2, t.y + yy - 2, C.shadow, 0.4);
  for (let yy = -n; yy <= n; yy++) for (let xx = -n; xx <= n; xx++) { const o = on(xx, yy); if (!o) continue; const d = Math.hypot(xx, yy);
    if (o === 2) { put(t.x + xx, t.y + yy, C.tree[1]); continue; } if (d > R - 0.9) { put(t.x + xx, t.y + yy, C.tree[1]); continue; }
    put(t.x + xx, t.y + yy, C.tree[pickI(6, clamp(0.78 - d / R * 0.4 + (-0.4 * xx + 0.55 * yy) / R * 0.35, 0, 1), t.x + xx, t.y + yy)]); }
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
function paintFx(plan, f, img, bx, t) {
  usePalette(plan); const d = img.data, w = bx.x1 - bx.x0, hgt = bx.y1 - bx.y0; d.fill(0);
  fireFx(plan, f, t, (x, y, c, a = 1) => { const col = x - bx.x0, row = bx.y1 - 1 - y; if (col < 0 || col >= w || row < 0 || row >= hgt) return; const o = (row * w + col) * 4, ea = d[o + 3] / 255, na = a + ea * (1 - a);
    if (na <= 0) return; d[o] = (c[0] * a + d[o] * ea * (1 - a)) / na; d[o + 1] = (c[1] * a + d[o + 1] * ea * (1 - a)) / na; d[o + 2] = (c[2] * a + d[o + 2] * ea * (1 - a)) / na; d[o + 3] = na * 255; });
  // flat roofs that carry a flak slot: mark the gun platform (painted above via b.slot)
}
// The airfield's perimeter (params.perimeter = h rows): the town is generated h rows shorter, its shares of the length scaled to match, and
// the last h rows are added after it. Along the town's end a perimeter road (a tank route joined to the main road), the fence, a grass
// verge, then the airfield's concrete apron; the main road runs on through a gate between two guard houses; every track ends at a buffer
// stop just before the fence. A town that ends at an airfield then ends at a fence, not at a cut.
// ---------- islands (preset 'islands', Enigma Run level 1) ----------
// Open sea; a chain of small islands in P.chain (shares of L), kept clear of a lane for the game's warships (plan.shipLanes); one large
// island in P.big: from the south its jetty, the village (the village preset generated on its own and clipped to the shore), fields with a
// small wood, a pond, a paddock and a farmstead, then the airbase. Ground kinds added: ROCK (rocky shore, game 'sand') and RUNWAY ('concrete').
// plan.shore: each sea pixel's distance to land (for the surf); plan.pastures: fenced paddocks where the game puts its cows.
function islands(o) {
  const P = Object.assign({}, PRESETS.islands, o.params || {}), seed = o.seed | 0, W = P.W, L = P.L | 0, N = W * L;
  const rnd = (tag, i, j = 0) => h32(h32(seed, tag), h32(i | 0, j | 0)) / 4294967296;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()), t0 = now();
  const Kr = new Uint8Array(N).fill(K.SEA), Br = new Int32Array(N).fill(-1), F = new Int32Array(N).fill(-1), land = new Uint8Array(N);
  const idx = (x, y) => y * W + x, inB = (x, y) => x >= 0 && x < W && y >= 0 && y < L;
  const plan = { v: 1, tunnels: [], seed, preset: 'islands', W, L, P, K: Kr, B: Br, F, parcels: [], U: new Float32Array(L), D: new Float32Array(L), mx: new Float32Array(L).fill(W / 2), aw: new Float32Array(L).fill(8),
    streets: [], items: [], trees: [], slots: [], craters: [], fires: [], squares: [], churches: [], parks: [], lots: [], bridges: [], boats: [], stage: {}, ships: [], shipLanes: [], obstacles: [], farms: [], coast: null,
    isles: [], pastures: [], airbase: null, jetty: null, village: null, quarters: [], trainRuns: [], tracks: [], stars: [], civic: [], works: [], heaps: [], steam: [], basins: [], cranes: [], stacks: [], gantries: [], wires: [], barrels: [], beachSlots: [], rivers: [], river: null };
  const addItem = it => { it.id = plan.items.length; plan.items.push(it); return it; };
  const set = (x, y, k, b = -1) => { if (inB(x, y)) { const i = idx(x, y); Kr[i] = k; Br[i] = b; } };
  const fillR = (x0, y0, w, h, k, b = -1) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, k, b); };
  const free = (x, y) => inB(x, y) && Kr[idx(x, y)] === K.MEADOW && Br[idx(x, y)] === -1; // open grass on an island, nothing on it yet
  const rectFree = (x0, y0, w, h) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (!free(x, y)) return false; return true; };
  let nSeed = 0; const sd = () => h32(seed, 90000 + nSeed++);
  const near = (w, h, cx, cy, R, ok) => { let b = null, bd = 1e9; for (let y = Math.round(cy - R); y <= cy + R; y += 2) for (let x = Math.round(cx - R); x <= cx + R; x += 2) { const d = Math.hypot(x + w / 2 - cx, y + h / 2 - cy); if (d < bd && (!ok || ok(x, y)) && rectFree(x - 1, y - 1, w + 2, h + 2)) { b = [x, y]; bd = d; } } return b; }; // the free spot for a w x h rectangle closest to (cx, cy)
  const building = (t, x0, y0, w, h, ori, front, o2) => { const n = plan.items.length, it = addItem(Object.assign({ t, x0, y0, w, h, ori, front, style: rnd(T.ISLE, 500, n) < 0.4 ? 'hip' : 'gable', roof: [0, 0, 2, 1, 0, 3][(rnd(T.ISLE, 600, n) * 6) | 0], seed: sd(), dmg: 0, run: -90000 - n }, o2 || {})); fillR(x0, y0, w, h, K.BLDG, it.id); return it; };
  const round = (cx, cy, r, o2) => { const it = addItem(Object.assign({ round: true, x0: Math.floor(cx - r), y0: Math.floor(cy - r), w: 2 * Math.ceil(r) + 2, h: 2 * Math.ceil(r) + 2, acx: cx, acy: cy, r, dmg: 0, seed: sd() }, o2));
    for (let y = it.y0; y < it.y0 + it.h; y++) for (let x = it.x0; x < it.x0 + it.w; x++) if (inB(x, y) && Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < r) set(x, y, K.BLDG, it.id); return it; };
  const tree = (x, y, r, v) => plan.trees.push({ x: Math.round(x), y: Math.round(y), r, v: v === undefined ? (rnd(T.TREE, x * 7 + 3, y) * 4) | 0 : v });
  const slot = (kind, on, x, y, r) => { const c = { kind, on, x: Math.round(x), y: Math.round(y), r, id: plan.slots.length }; plan.slots.push(c); return c; };
  const gunPit = (x, y) => { const x0 = Math.round(x) - 6, y0 = Math.round(y) - 6; fillR(x0, y0, 12, 12, K.LOT); plan.lots.push({ x0, y0, w: 12, h: 12 }); return slot('flak', 'lot', x0 + 6, y0 + 6, 4.5); }; // a gun pit in a sandbag ring
  const parcel = (x0, y0, w, h, block) => { const id = plan.parcels.length; plan.parcels.push({ block, crop: rnd(T.ISLE, 700, id) * (block >= 900 ? 0.7 : 1), /* an islet's field is never grass */ par: rnd(T.ISLE, 800, id) < 0.5 }); let n = 0;
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (free(x, y)) { const i = idx(x, y); Kr[i] = K.FIELD; F[i] = id; n++; } return n; };

  // 1. shapes. The large island: a long rounded body, its two shores wandering a little; the islets: rounded blobs with a wavy outline.
  const by0 = Math.round(L * P.big[0]), by1 = Math.round(L * P.big[1]), BL = by1 - by0, ph = rnd(T.ISLE, 1) * 6.283, ph2 = rnd(T.ISLE, 2) * 6.283;
  const bc = y => W / 2 + 5 * Math.sin(y * 0.007 + ph);
  for (let y = Math.max(0, by0); y <= Math.min(L - 1, by1); y++) { const f = Math.abs((y - by0) / BL * 2 - 1), e = Math.pow(Math.max(0, 1 - f * f * f), 1 / 3), hw = P.bigW / 2 * e;
    const a = bc(y) - hw + 5 * Math.sin(y * 0.031 + ph2) + 3 * Math.sin(y * 0.09 + ph), b = bc(y) + hw + 5 * Math.sin(y * 0.027 + ph) + 3 * Math.sin(y * 0.11 + ph2);
    for (let x = Math.max(0, Math.ceil(a)); x <= Math.min(W - 1, Math.floor(b)); x++) land[idx(x, y)] = 1; }
  const cy0 = Math.round(L * P.chain[0]), cy1 = Math.round(L * P.chain[1]), lw = P.lane, lx = Math.round(lerp(18 + lw / 2, W - 18 - lw / 2, rnd(T.ISLE, 3)));
  plan.shipLanes.push({ x: lx, w: lw, y0: cy0, y1: Math.min(cy1, by0 - 50), kind: 'fairway' }); // (it ends before the jetty)
  const want = P.isles[0] + ((rnd(T.ISLE, 4) * (P.isles[1] - P.isles[0] + 1)) | 0), isl = []; let lastOk = 0;
  for (let k = 0; k < 900 && isl.length < want; k++) { const shrink = Math.max(0.5, 1 - (k - lastOk) * 0.004); // an islet that will not fit gets smaller, try by try
    const bigOne = isl.length < 2, R = P.isleR[bigOne ? 0 : 1], rx = Math.round(lerp(R[0], R[1], rnd(T.ISLE, bigOne ? 10 : 11, k)) * shrink), ry = Math.round(rx * lerp(0.62, 0.95, rnd(T.ISLE, 12, k)));
    const cx = Math.round(lerp(rx * 1.25 + 6, W - rx * 1.25 - 6, rnd(T.ISLE, 13, k))), cy = Math.round(lerp(cy0 + ry * 1.25 + 6, cy1 - ry * 1.25 - 6, rnd(T.ISLE, 14, k)));
    if (Math.abs(cx - lx) < lw / 2 + rx * 1.25 + 4) continue; // the warships' lane stays open
    if (isl.some(q => Math.hypot((q.cx - cx) / (q.rx * 1.25 + rx * 1.25 + 18), (q.cy - cy) / (q.ry * 1.25 + ry * 1.25 + 18)) < 1)) continue; // open water between islets
    lastOk = k; isl.push({ cx, cy, rx, ry, a: [rnd(T.ISLE, 15, k) * 6.283, rnd(T.ISLE, 16, k) * 6.283, rnd(T.ISLE, 17, k) * 6.283] }); }
  isl.sort((a, b) => b.rx * b.ry - a.rx * a.ry); // the largest islet is the farm, the next one has houses, the rest are mostly gun islets and rocks
  isl.forEach((q, n) => { q.id = n; q.type = n === 0 ? 'farm' : n === 1 ? 'houses' : n === 2 ? 'guns' : q.rx < 21 ? (rnd(T.ISLE, 20, n) < 0.6 ? 'rock' : 'guns') : rnd(T.ISLE, 21, n) < 0.3 ? 'houses' : 'guns';
    const lim = th => 1 + 0.12 * Math.sin(3 * th + q.a[0]) + 0.07 * Math.sin(5 * th + q.a[1]) + 0.04 * Math.sin(8 * th + q.a[2]);
    for (let y = Math.floor(q.cy - q.ry * 1.3); y <= q.cy + q.ry * 1.3; y++) for (let x = Math.floor(q.cx - q.rx * 1.3); x <= q.cx + q.rx * 1.3; x++) { if (!inB(x, y)) continue; const dx = (x + 0.5 - q.cx) / q.rx, dy = (y + 0.5 - q.cy) / q.ry; if (Math.hypot(dx, dy) < lim(Math.atan2(dy, dx))) land[idx(x, y)] = 2 + n; } });
  if (isl.length > 2 && !isl.some(q => q.type === 'guns')) isl[2].type = 'guns';
  // distance from the shore, inland (dL) and out to sea (dS): two chamfer passes each
  const dist = src => { const D = new Float32Array(N).fill(1e9); for (let i = 0; i < N; i++) if (src(i)) D[i] = 0; const R2 = 1.4142;
    for (let y = 0; y < L; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!D[i]) continue; let d = D[i]; if (x > 0) d = Math.min(d, D[i - 1] + 1); if (y > 0) { d = Math.min(d, D[i - W] + 1); if (x > 0) d = Math.min(d, D[i - W - 1] + R2); if (x < W - 1) d = Math.min(d, D[i - W + 1] + R2); } D[i] = d; }
    for (let y = L - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; if (!D[i]) continue; let d = D[i]; if (x < W - 1) d = Math.min(d, D[i + 1] + 1); if (y < L - 1) { d = Math.min(d, D[i + W] + 1); if (x < W - 1) d = Math.min(d, D[i + W + 1] + R2); if (x > 0) d = Math.min(d, D[i + W - 1] + R2); } D[i] = d; }
    return D; };
  const dL = dist(i => !land[i]), dS = dist(i => !!land[i]);
  plan.shore = new Uint8Array(N); for (let i = 0; i < N; i++) if (!land[i]) plan.shore[i] = Math.min(255, Math.round(dS[i]));
  // 2. ground: a beach or rocks along the shore (rockier on the small islets, rocks all round a rock), grass inland
  for (let i = 0; i < N; i++) { if (!land[i]) continue; const x = i % W, y = (i / W) | 0, q = land[i] >= 2 ? isl[land[i] - 2] : null, bw = 2.5 + 3.5 * vn(x * 0.06 + 11, y * 0.06);
    const rock = vn(x * 0.05 + 40, y * 0.05) > (q ? (q.type === 'rock' || q.type === 'guns' ? 0.36 : 0.55) : 0.64) || (q && q.type === 'rock' && dL[i] < bw + 3);
    Kr[i] = dL[i] <= bw ? (rock ? K.ROCK : K.BEACH) : K.MEADOW; }
  plan.stage.shapes = +(now() - t0).toFixed(2);

  // 3. the large island's village: the village preset generated on its own, its road on the island's axis, then copied in and clipped to the
  // shore. Whatever would reach the beach is left out whole (a farmstead with all its buildings, a church with all its parts); so is a house
  // that would lose the street it fronts.
  const VL = P.villageL, vy0 = by0 + 26, v = generate({ seed: h32(seed, 77), preset: 'village', params: { L: VL, road: { c: bc(vy0 + VL / 2), amp: 4, fr: 0.004, ph: ph2 }, damage: 0, density: [[0, 0.05], [0.3, 0.32], [0.55, 0.4], [0.8, 0.25], [1, 0.05]] } });
  const inner = (x, y) => inB(x, y) && land[idx(x, y)] === 1 && Kr[idx(x, y)] === K.MEADOW;
  const drop = new Uint8Array(v.items.length), clear = (x0, y0, w, h) => { for (let y = y0 - 2; y < y0 + h + 2; y++) for (let x = x0 - 2; x < x0 + w + 2; x++) if (!inner(x, y + vy0)) return false; return true; };
  for (const it of v.items) if (!clear(it.x0, it.y0, it.w, it.h)) drop[it.id] = 1;
  for (const f of v.farms) if (!clear(f.x0, f.y0, f.w, f.h)) for (const it of v.items) if (it.x0 >= f.x0 - 1 && it.x0 + it.w <= f.x0 + f.w + 1 && it.y0 >= f.y0 - 1 && it.y0 + it.h <= f.y0 + f.h + 1) drop[it.id] = 1;
  for (const it of v.items) if (drop[it.id] && (it.church || it.group)) for (const o2 of v.items) if ((it.church && o2.church === it.church) || (it.group && o2.group === it.group)) drop[o2.id] = 1;
  const vin = new Uint8Array(W * VL); for (let y = 0; y < VL; y++) for (let x = 0; x < W; x++) vin[y * W + x] = inner(x, y + vy0) ? 1 : 0;
  plan.items = v.items; plan.streets = v.streets; plan.parcels = v.parcels; plan.farms = v.farms; plan.churches = v.churches; plan.oldTown = v.oldTown; plan.parks = v.parks; plan.squares = v.squares;
  for (let y = 0; y < VL; y++) for (let x = 0; x < W; x++) { const j = y * W + x; if (!vin[j]) continue; const i = idx(x, y + vy0); let k = v.K[j], b = v.B[j];
    if (b >= 0 && drop[b]) { k = K.MEADOW; b = -1; } if (k === K.NONE) k = K.MEADOW; Kr[i] = k; Br[i] = b; if (k === K.FIELD) F[i] = v.F[j]; }
  for (let y = 0; y < VL; y++) { plan.mx[y + vy0] = v.mx[y]; plan.aw[y + vy0] = v.aw[y]; plan.U[y + vy0] = v.U[y]; }
  for (const it of v.items) { if (drop[it.id]) { it.w = it.h = 0; it.gone = true; it.t = 'gone'; continue; } it.y0 += vy0; if (it.acy !== undefined) it.acy += vy0; }
  const sh = o2 => { for (const key of ['y', 'y0', 'y1', 'ya', 'yb', 'yc', 'cy', 'yFront', 'Y0']) if (typeof o2[key] === 'number') o2[key] += vy0; };
  for (const st of v.streets) { st.pts = st.pts.map(p => [p[0], p[1] + vy0, p[2]]); sh(st); }
  for (const f of v.farms) sh(f); for (const c of v.churches) sh(c); for (const q of v.parks) sh(q); for (const q of v.squares) sh(q); if (v.oldTown) sh(v.oldTown);
  for (const t of v.trees) { const y = t.y + vy0; if (inB(t.x, y) && land[idx(t.x, y)] === 1 && Kr[idx(t.x, y)] !== K.BEACH && Kr[idx(t.x, y)] !== K.ROCK) plan.trees.push(Object.assign({}, t, { y })); }
  for (const l of v.lots) { const y0 = l.y0 + vy0; if (Kr[idx(l.x0, y0)] === K.LOT) plan.lots.push(Object.assign({}, l, { y0 })); }
  { const front = it => { const cx = (it.x0 + it.w / 2) | 0, cy = (it.y0 + it.h / 2) | 0, d = { W: [-1, 0, it.x0 - 1, cy], E: [1, 0, it.x0 + it.w, cy], S: [0, -1, cx, it.y0 - 1], N: [0, 1, cx, it.y0 + it.h] }[it.front];
      for (let k = 0; k < 8; k++) { const x = d[2] + d[0] * k, y = d[3] + d[1] * k; if (inB(x, y)) { const kk = Kr[idx(x, y)]; if (kk === K.ROAD || kk === K.STREET || kk === K.WALK || kk === K.PLAZA) return true; if (kk !== K.FRONT && kk !== K.RUBBLE && kk !== K.RAIL) return false; } } return false; }; // validate()'s rule
    for (const it of plan.items) if (!it.gone && (it.t === 'house' || it.t === 'terrace' || it.t === 'block') && !front(it)) { // its street was cut off by the shore
      for (let y = vy0; y < vy0 + VL; y++) for (let x = 0; x < W; x++) { const i = idx(x, y); if (Br[i] === it.id) { Kr[i] = K.MEADOW; Br[i] = -1; } } it.w = it.h = 0; it.gone = true; it.t = 'gone'; } }
  plan.village = { y0: vy0, y1: vy0 + VL - 1, items: plan.items.filter(it => !it.gone).length, farms: v.farms.filter(f => Kr[idx(f.x0 + 1, f.y0 + 1)] === K.COURT).length, green: !!v.oldTown };
  plan.stage.village = +(now() - t0).toFixed(2);

  // 4. the main road beyond the village: south to the shore and out on a jetty (a barge moored beside it), north through the fields to the airbase
  const rowOf = y => { const out = []; for (let x = 0; x < W; x++) { const k = v.K[y * W + x]; if (k === K.ROAD || k === K.WALK) out.push([x, k]); } return out; };
  const ay0 = vy0 + VL + P.gapL, ay1 = by1 - 6, rwX = Math.round(W / 2 - 42), txX = rwX + 32, apX0 = txX + 6, apX1 = apX0 + 44, roadTo = apX0 + 12; // the airbase's lines (runway, taxiway, apron)
  { const r0 = rowOf(0), m0 = v.mx[0]; let y = vy0 - 1;
    for (; y > by0; y--) { let cut = false; for (const [x, k] of r0) { if (inner(x, y)) set(x, y, k, -1); else if (Math.abs(x + 0.5 - m0) < 5) cut = true; } if (cut) break; plan.mx[y] = m0; plan.aw[y] = v.aw[0]; }
    const jx0 = Math.round(m0) - 5, jw = 10; let jy = y; for (; jy > by0 - 40 && jy > 0; jy--) { let wet = 0; for (let x = jx0; x < jx0 + jw; x++) { if (inB(x, jy) && Kr[idx(x, jy)] === K.SEA) wet++; set(x, jy, K.QUAY, -1); } if (wet === jw && jy < y - 24) break; } // the jetty runs out past the surf
    plan.jetty = { x0: jx0, w: jw, y0: jy, y1: y }; plan.boats.push({ x0: jx0 + jw + 2, y0: jy + 2, w: 18, h: 7, cargo: 1, dmg: 0 }); }
  { const r1 = rowOf(VL - 1), m1 = v.mx[VL - 1];
    for (let y = vy0 + VL; y < ay0 + 60; y++) { if (Kr[idx(Math.round(plan.mx[y - 1]), y)] === K.APRON) break; const f = smooth(vy0 + VL + 10, ay0 - 10, y), m = lerp(m1, roadTo, f); plan.mx[y] = m; plan.aw[y] = v.aw[VL - 1];
      for (const [x0, k] of r1) { const x = Math.round(x0 - m1 + m); if (inner(x, y) || (inB(x, y) && land[idx(x, y)] === 1 && Kr[idx(x, y)] !== K.BEACH && Kr[idx(x, y)] !== K.ROCK)) set(x, y, k, -1); } } }
  // 5. between the village and the airbase: a small wood on the roomier side of the road, a pond and a fenced paddock with a farmstead on the
  // other, fields (hedged parcels) in what is left
  { const g0 = vy0 + VL + 4, g1 = ay0 - 8, gm = (g0 + g1) >> 1, rm = plan.mx[gm], room = sd2 => { let n = 0; for (let x = Math.round(rm) + sd2 * 12; inB(x, gm) && land[idx(x, gm)] === 1 && Kr[idx(x, gm)] === K.MEADOW; x += sd2) n++; return n; };
    const s = room(-1) > room(1) ? -1 : 1, fcx = rm + s * (12 + room(s) / 2), fr = Math.min(room(s) / 2 - 4, 38), fry = Math.min((g1 - g0) / 2, 34), wood = [];
    for (let y = Math.floor(gm - fry); y <= gm + fry; y++) for (let x = Math.floor(fcx - fr); x <= fcx + fr; x++) { const e = Math.hypot((x + 0.5 - fcx) / fr, (y + 0.5 - gm) / fry) + (vn(x * 0.12, y * 0.12 + 9) - 0.5) * 0.35; if (e < 1 && free(x, y)) { set(x, y, K.MEADOW, -31); wood.push([x, y]); } }
    for (let y = Math.floor(gm - fry); y <= gm + fry; y += 4) for (let x = Math.floor(fcx - fr); x <= fcx + fr; x += 4) { const jx = x + Math.round((rnd(T.TREE, x, y) - 0.5) * 3), jy = y + Math.round((rnd(T.TREE, y, x) - 0.5) * 3); if (inB(jx, jy) && Br[idx(jx, jy)] === -31) tree(jx, jy, 3 + ((rnd(T.TREE, jx + 5, jy) * 2) | 0)); }
    plan.wood = { x: Math.round(fcx), y: gm, rx: Math.round(fr), ry: Math.round(fry), n: wood.length };
    const o = -s, px = Math.round(rm + o * 30), py = gm + 8, prx = 11, pry = 7; // the pond, reeds round it, two willows
    for (let y = py - pry; y <= py + pry; y++) for (let x = px - prx; x <= px + prx; x++) if (Math.hypot((x + 0.5 - px) / prx, (y + 0.5 - py) / pry) < 1 && free(x, y)) set(x, y, K.WATER, -7);
    tree(px + o * (prx + 3), py + 3, 4, 1); tree(px - o * 4, py + pry + 3, 3, 2); plan.pond = { x: px, y: py, rx: prx, ry: pry };
    const side = (x, y) => (x + 10 - rm) * o > 14; // on the pond's side of the road
    const fm = near(20, 26, px + o * 26, py - 18, 40, side); // the farmstead: the farmhouse and a byre round the yard, the barn across the back
    if (fm) { const [fx0, fy] = fm, fy0 = fy + 7; fillR(fx0, fy0, 20, 9, K.COURT); building('farmhouse', fx0, fy0 + 9, 10, 7, 'h', 'S'); building('barn', fx0 + 11, fy0 + 9, 9, 10, 'v', 'S', { roof: 2 }); building('barn', fx0, fy0 - 7, 20, 6, 'h', 'N', { roof: 2 }); plan.farms.push({ x0: fx0, y0: fy, w: 20, h: 26 }); }
    const pd = near(34, 22, fm ? fm[0] + 10 : px, fm ? fm[1] - 14 : py, 46, side); // the paddock with its cows, beside the farmstead
    if (pd) { fillR(pd[0], pd[1], 34, 22, K.MEADOW, -30); plan.pastures.push({ x0: pd[0], y0: pd[1], x1: pd[0] + 33, y1: pd[1] + 21, n: 4 }); }
    let blk = 50; for (const sd2 of [-1, 1]) for (let y = g0 - 6; y < ay0; y += 30) for (let k = 0; k < 3; k++) { const x0 = Math.round(rm + sd2 * (10 + k * 34) - (sd2 < 0 ? 34 : 0)); parcel(x0, y, 34, 30, blk++); } }
  // 6. the airbase: a concrete runway along the strip with markings, a taxiway joined to it at both ends and in the middle, the apron with
  // hangars, the control tower and a fuel dump, blast pens for parked planes beside the runway, gun pits and an AA tower slot; grass between
  { const inn = (x0, x1, y) => { for (let x = x0; x <= x1; x++) if (!inB(x, y) || land[idx(x, y)] !== 1 || dL[idx(x, y)] < 7) return false; return true; };
    let ra0 = ay0, ra1 = ay1; while (ra0 < ay1 && !inn(rwX - 14, txX + 8, ra0)) ra0++; while (ra1 > ra0 && !inn(rwX - 14, txX + 8, ra1)) ra1--;
    if (ra1 - ra0 > 120) {
      for (let y = ra0; y <= ra1; y++) for (let x = rwX - 10; x < rwX + 10; x++) set(x, y, K.RUNWAY, -1);
      const t0y = ra0 + 6, t1y = ra1 - 6, mid = (ra0 + ra1) >> 1;
      for (let y = t0y; y <= t1y; y++) for (let x = txX - 4; x < txX + 4; x++) set(x, y, K.APRON, -1);
      for (const yy of [t0y, mid, t1y - 7]) fillR(rwX + 10, yy, txX - rwX - 6, 8, K.APRON);
      const apY0 = Math.max(t0y + 14, mid - 40), apY1 = Math.min(t1y - 14, mid + 40); let apx1 = apX1; while (apx1 > apX0 + 24 && !inn(apX0, apx1 + 24, apY0) ) apx1--; while (apx1 > apX0 + 24 && !inn(apX0, apx1 + 24, apY1)) apx1--;
      fillR(txX + 4, apY0, apx1 - txX - 4, apY1 - apY0, K.APRON);
      const hg = []; for (let y = apY0 + 2; y + 22 <= apY1 - 12; y += 25) { const it = building('works', apx1, y, 22, 22, 'h', 'W', { label: 'Hangar', style: 'gable', roof: 3 }); hg.push(it); }
      building('works', apX0 + 2, apY1 - 11, 10, 10, 'h', 'S', { label: 'Control tower', style: 'flat', roof: 3 }); slot('aatower', 'apron', apX0 + 24, apY1 + 8, 8);
      { const fy = apY1 + 4, fx = apx1 - 4; if (inn(fx, fx + 22, fy + 18)) { fillR(fx, fy, 24, 18, K.WORKS); for (const [dx, dy] of [[6, 5], [16, 5], [11, 13]]) round(fx + dx, fy + dy, 3.5, { t: 'works', label: 'Fuel tank', part: 'tank' }); } }
      for (let k = 0; k < 3; k++) { const py = ra0 + 30 + k * Math.floor((ra1 - ra0 - 60) / 2) - 8, px0 = rwX - 10 - 22; if (!rectFree(px0 - 1, py - 1, 20, 18)) continue; // a blast pen: earth walls on three sides, open to the runway
        fillR(px0, py, 20, 16, K.BANK); fillR(px0 + 3, py + 3, 17, 10, K.APRON); slot('parked', 'pen', px0 + 11, py + 8, 6); }
      for (const [gx, gy] of [[rwX + 18, ra0 - 4], [rwX - 4, ra1 + 2], [apx1 + 10, apY0 - 12], [txX + 14, ra1 - 22], [rwX - 20, mid]]) if (rectFree(gx - 7, gy - 7, 14, 14)) gunPit(gx, gy);
      plan.airbase = { rx: rwX, rw: 20, y0: ra0, y1: ra1, tx: txX, ap: [txX + 4, apY0, apx1 + 22, apY1], hangars: hg.length }; } }
  // 7. the islets
  for (const q of isl) {
    const on = (x, y, m) => inB(x, y) && land[idx(x, y)] === q.id + 2 && Kr[idx(x, y)] === K.MEADOW && Br[idx(x, y)] === -1 && dL[idx(x, y)] >= m, pts = [];
    for (let y = Math.floor(q.cy - q.ry * 1.3); y <= q.cy + q.ry * 1.3; y++) for (let x = Math.floor(q.cx - q.rx * 1.3); x <= q.cx + q.rx * 1.3; x++) if (on(x, y, 0)) pts.push([x, y, dL[idx(x, y)]]);
    const best = (m, avoid, gap) => { let b = null; for (const p of pts) if (p[2] >= m && on(p[0], p[1], m) && !(avoid || []).some(a => Math.hypot(a[0] - p[0], a[1] - p[1]) < gap) && (!b || p[2] + rnd(T.ISLE, p[0], p[1]) * 2 > b[2])) b = p; return b; };
    const got = [];
    if (q.type === 'guns' || q.type === 'rock') { // a turret (the game's bunker) and a flak pit, as far apart as the islet allows
      const b = best(q.type === 'rock' ? 6 : 7, null, 0); if (b) { if (q.type === 'guns') { fillR(b[0] - 6, b[1] - 6, 12, 12, K.APRON); slot('bunker', 'isle', b[0], b[1], 6); got.push(b); const c = best(6, got, 16) || best(5, got, 12); if (c) { gunPit(c[0], c[1]); got.push(c); } } else { gunPit(b[0], b[1]); got.push(b); } }
      if (q.type === 'guns') { const c = best(5, got, 14); if (c && rectFree(c[0] - 5, c[1] - 3, 10, 6)) { const it = building('works', c[0] - 5, c[1] - 3, 10, 6, 'h', 'S', { part: 'casemate', label: 'Casemate', sea: -1, style: 'flat', roof: 3 }); got.push(c); } } }
    if (q.type === 'houses') { // a lane across the islet, a few houses facing it with gardens behind, sometimes a lighthouse on the shore
      const ly = q.cy - 2; let xa = null, xb = null; for (let x = q.cx - q.rx * 1.3; x <= q.cx + q.rx * 1.3; x++) if (on(Math.round(x), ly, 3) && on(Math.round(x), ly + 3, 3)) { if (xa === null) xa = Math.round(x); xb = Math.round(x); }
      if (xa !== null && xb - xa > 16) { const st = { cls: 'local', axis: 'h', tank: false, pts: [], yc: ly + 2, x0: xa, x1: xb, w: 4, id: plan.streets.length }; plan.streets.push(st); for (let x = xa; x <= xb; x++) { st.pts.push([x, ly + 2, 4]); for (let y = ly; y < ly + 4; y++) set(x, y, K.STREET, -2 - st.id); }
        let n = 0; for (let x = xa + 2; x + 8 <= xb; x += 11) for (const up of [1, -1]) { const w = 7 + ((rnd(T.ISLE, 30, x * 3 + up) * 3) | 0), h = 7, y0 = up > 0 ? ly + 4 : ly - h; if (n >= 8 || rnd(T.ISLE, 31, x * 5 + up) < 0.12 || !rectFree(x - 1, up > 0 ? y0 : y0 - 3, w + 2, h + 3)) continue;
          const it = building('house', x, y0, w, h, 'h', up > 0 ? 'S' : 'N'); n++; for (let y = up > 0 ? y0 + h : y0 - 3; y < (up > 0 ? y0 + h + 3 : y0); y++) for (let xx = x; xx < x + w; xx++) if (free(xx, y)) set(xx, y, K.GARDEN, it.id); tree(x + w / 2, up > 0 ? y0 + h + 2 : y0 - 2, 2, 4); } }
      if (rnd(T.ISLE, 32, q.id) < 0.6) { let tip = null; for (let y = Math.floor(q.cy - q.ry * 1.3); y <= q.cy + q.ry * 1.3; y++) for (let x = Math.floor(q.cx - q.rx * 1.3); x <= q.cx + q.rx * 1.3; x++) if (inB(x, y) && land[idx(x, y)] === q.id + 2 && dL[idx(x, y)] >= 3 && dL[idx(x, y)] < 5 && (!tip || x > tip[0])) tip = [x, y];
        if (tip) round(tip[0], tip[1], 3, { t: 'works', label: 'Lighthouse', part: 'lighthouse', red: rnd(T.ISLE, 33, q.id) < 0.5 }); } }
    if (q.type === 'farm') { // a tiny farm: the farmhouse and the barn round a yard, a paddock with cows, a field
      const isle = (x, y) => land[idx(x, y)] === q.id + 2, fm = near(18, 15, q.cx - 19, q.cy - 7, q.rx, isle);
      if (fm) { const [fx0, fy0] = fm; fillR(fx0, fy0 + 6, 18, 4, K.COURT); building('farmhouse', fx0, fy0 + 10, 9, 5, 'h', 'S'); building('barn', fx0 + 10, fy0 + 10, 8, 5, 'h', 'S', { roof: 2 }); building('barn', fx0, fy0, 18, 6, 'h', 'N', { roof: 2 }); plan.farms.push({ x0: fx0, y0: fy0, w: 18, h: 15 }); }
      const pw = q.rx > 30 ? 22 : 16, ph = q.rx > 30 ? 15 : 12, pd = near(pw, ph, q.cx + 10, q.cy - 6, q.rx, isle); if (pd) { fillR(pd[0], pd[1], pw, ph, K.MEADOW, -30); plan.pastures.push({ x0: pd[0], y0: pd[1], x1: pd[0] + pw - 1, y1: pd[1] + ph - 1, n: q.rx > 30 ? 4 : 3 }); }
      for (const [fx, fy] of [[q.cx, q.cy + q.ry * 0.55], [q.cx, q.cy - q.ry * 0.6]]) { const fw = Math.min(34, Math.round(q.rx * 0.7)), fh = Math.min(14, Math.round(q.ry * 0.38)), fd = near(fw, fh, fx, fy, q.rx, isle); if (fd) parcel(fd[0], fd[1], fw, fh, 900 + q.id * 3 + (fy > q.cy ? 1 : 0)); } } // fields, as large as the islet allows
    for (const p of pts) if (on(p[0], p[1], 4) && rnd(T.TREE, p[0] * 3, p[1]) < (q.type === 'houses' ? 0.012 : 0.006)) tree(p[0], p[1], 2 + ((rnd(T.TREE, p[1], p[0]) * 2) | 0)); // a few trees on the grass
    plan.isles.push({ cx: q.cx, cy: q.cy, rx: q.rx, ry: q.ry, type: q.type }); }
  if (!plan.slots.some(c => c.kind === 'flak' && c.y < by0)) for (const q of isl) { const g = near(9, 9, q.cx, q.cy, q.rx * 1.2, (x, y) => land[idx(x, y)] === q.id + 2); if (g) { gunPit(g[0] + 5, g[1] + 5); break; } } // the chain always has a flak gun
  plan.stage.total = +(now() - t0).toFixed(2);
  return plan;
}
// ---------- the desert (Enigma Run level 2): open desert with oasis villages and strongpoints ----------
// Built by its own function, as the islands are: a dirt track (the tank route) along the strip, and features placed on it by share of the length
// (P.features: { kind: 'oasis', at, size: 'small' | 'medium' | 'large', held } or { kind: 'post', at }). An oasis village (owner mockups G, H, I):
// a pool in a grove of date palms on one side of the track, packed flat-roofed houses sharing their walls on the other (and all round it when
// large), a small square with the white domed hall and a well; the larger the village, the heavier the damage. A held village and a strongpoint
// in the open (mockups D2, D3) carry the fortification kit: fire trenches in fire bays and traverses with their spoil on the enemy side, dug-in
// pits with sandbag rings (gun slots), belts of concertina wire, a marked minefield with a lane for the track, an anti-tank ditch with a
// roadblock where the track crosses, camouflage nets, a tank dug in hull-down, MG nests on flat roofs and a bunker; the track always keeps a way through.
function desertLand(o) {
  const P = Object.assign({}, PRESETS[o.preset] || PRESETS.oasis, o.params || {}), seed = o.seed | 0, W = P.W, L = P.L | 0, N = W * L;
  const rnd = (tag, i, j = 0) => h32(h32(seed, tag), h32(i | 0, j | 0)) / 4294967296, TD = 31;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()), t0 = now();
  const Kr = new Uint8Array(N).fill(K.DESERT), Br = new Int32Array(N).fill(-1);
  const idx = (x, y) => y * W + x, inB = (x, y) => x >= 0 && x < W && y >= 0 && y < L;
  const plan = { v: 1, tunnels: [], seed, preset: o.preset, W, L, P, K: Kr, B: Br, F: new Int32Array(N).fill(-1), parcels: [], U: new Float32Array(L), D: new Float32Array(L), mx: new Float32Array(L), aw: new Float32Array(L).fill(9),
    streets: [], items: [], trees: [], slots: [], craters: [], fires: [], squares: [], churches: [], parks: [], lots: [], bridges: [], boats: [], stage: {}, ships: [], shipLanes: [], obstacles: [], farms: [], coast: null, quarters: [], trainRuns: [], stars: [], civic: [], works: [], heaps: [], steam: [], basins: [], cranes: [], stacks: [], gantries: [], wires: [], barrels: [], beachSlots: [], rivers: [], river: null,
    wells: [], pits: [], coils: [], mines: [], signs: [], nets: [], barriers: [], oasis: [], posts: [] };
  const addItem = it => { it.id = plan.items.length; plan.items.push(it); return it; };
  const set = (x, y, k, b = -1) => { if (inB(x, y)) { const i = idx(x, y); Kr[i] = k; Br[i] = b; } };
  const open = (x, y) => inB(x, y) && (Kr[idx(x, y)] === K.DESERT || Kr[idx(x, y)] === K.OASIS) && Br[idx(x, y)] === -1;
  const rectOpen = (x0, y0, w, h) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (!inB(x, y) || Kr[idx(x, y)] !== K.DESERT || Br[idx(x, y)] !== -1) return false; return true; };
  const slot = (kind, on, x, y, r, item) => { const c = { kind, on, x: Math.round(x), y: Math.round(y), r, id: plan.slots.length }; if (item !== undefined) c.item = item; plan.slots.push(c); return c; };
  let nSeed = 0; const sd = () => h32(seed, 93000 + nSeed++);
  // 1. the track
  const c0 = 70 + rnd(TD, 1) * 84, amp = 6 + rnd(TD, 2) * 10, fr = 0.005 + rnd(TD, 3) * 0.006, ph = rnd(TD, 4) * 6.283;
  const feats = P.features || [], span = F => [Math.round(L * F.at0), Math.round(L * F.at1)];
  const roadT = y => { let sw = 0, st = 0; for (const F of feats) { if (F.at0 === undefined) continue; const [a, b] = span(F), f = smooth(a - 70, a, y) * (1 - smooth(b, b + 70, y)); sw += f; st += f * (F.roadX !== undefined ? F.roadX : F.kind === 'airbase' ? 34 : 142); } return [sw ? st / sw : null, Math.min(1, sw)]; }; /* neighbouring features blend, so the track swings across smoothly */ // a valley, pass, junction or airbase sets where the track runs
  for (let y = 0; y < L; y++) { let m = clamp(c0 + amp * Math.sin(y * fr + ph), 34, W - 34); const [t, w] = roadT(y); if (w > 0) m = lerp(m, t + 4 * Math.sin(y * 0.02 + ph), w); plan.mx[y] = P.road0 !== undefined ? lerp(P.road0, m, smooth(0, 200, y)) : m; }
  const ar = { cls: 'arterial', axis: 'v', tank: true, dirt: true, pts: [], y0: 0, y1: L - 1 }; ar.id = plan.streets.length; plan.streets.push(ar);
  for (let y = 0; y < L; y++) { ar.pts.push([plan.mx[y], y, 9]); for (let x = Math.floor(plan.mx[y] - 5); x <= plan.mx[y] + 5; x++) if (Math.abs(x + 0.5 - plan.mx[y]) < 4.5) set(x, y, K.ROAD, -2 - ar.id); }
  const MX = y => plan.mx[clamp(Math.round(y), 0, L - 1)];
  // the railway (P.rail): a main line straight down the strip, a 16 px corridor kept clear for the game's trains, level crossings where the track crosses it
  const RM = plan.RM = new Uint8Array(N), RX = P.rail ? P.rail.x : null, RA = P.rail && P.rail.x0 !== undefined ? P.rail.x0 : RX, RB = P.rail && P.rail.x1 !== undefined ? P.rail.x1 : RX;
  const RXat = y => y < 160 ? lerp(RA, RX, smooth(0, 160, y)) : y > L - 161 ? lerp(RX, RB, smooth(L - 161, L - 1, y)) : RX; // (the line can come in and leave at another x, curving over 160 px)
  const layRail = (xAt, y0, y1) => { for (let y = y0; y <= y1; y++) { const c = Math.round(xAt(y)); for (let k = -6; k <= 5; k++) { const x = c + k; if (!inB(x, y)) continue; const i = idx(x, y), m = (k === -3 || k === 2) ? 2 : (y % 3 === 0 && k >= -5 && k <= 4) ? 3 : 1;
      if (Kr[i] === K.ROAD) { if (m === 2) RM[i] = 2; continue; } if (Kr[i] === K.RBRIDGE) { RM[i] = Math.max(RM[i], m); continue; } Kr[i] = K.RAIL; Br[i] = -1; RM[i] = m; } } };
  if (RX !== null) { for (let y = 0; y < L; y++) { const c = Math.round(RXat(y)); for (let x = c - 8; x <= c + 8; x++) if (inB(x, y) && Kr[idx(x, y)] === K.DESERT) Br[idx(x, y)] = -50; } const r0 = RA === RX ? 0 : 160, r1 = RB === RX ? L - 1 : L - 161; plan.trainRuns.push({ x: RX, y0: r0, y1: r1, line: 'main' }); plan.rail = { x: RX }; }
  // rock walls (valley, pass): the strip's edges rise as rock (K.CLIFF, game type 'rock': the plane flies over, ground units keep off); edges per row in plan.walls
  const WL = plan.wallL = new Float32Array(L).fill(-1), WR = plan.wallR = new Float32Array(L).fill(W);
  for (const F of feats) { if (F.kind !== 'valley' && F.kind !== 'pass') continue; const [a, b] = span(F), ph2 = rnd(TD, 90, a);
    for (let y = Math.max(0, a - 40); y < Math.min(L, b + 40); y++) { const ramp = smooth(a - 40, a + 30, y) * (1 - smooth(b - 30, b + 40, y)); if (ramp <= 0) continue;
      let l, r; if (F.kind === 'valley') { l = 34 + Math.sin(y * 0.02 + ph2) * 10 + vn(y * 0.05, 1 + ph2) * 10; r = 194 - Math.sin(y * 0.017 + ph2) * 10 - vn(y * 0.05, 2 + ph2) * 10; }
      else { const nr = smooth(a, a + 110, y) * (1 - smooth(b - 60, b, y)); l = lerp(20, 52, nr) + vn(y * 0.06, 4 + ph2) * 8; r = lerp(204, 172, nr) - vn(y * 0.06, 5 + ph2) * 8; } // the pass closes in to a 120 px gorge
      WL[y] = Math.max(WL[y], lerp(-1, l, ramp)); WR[y] = Math.min(WR[y], lerp(W, r, ramp)); } }
  for (let y = 0; y < L; y++) for (let x = 0; x < W; x++) { if (x > WL[y] && x < WR[y]) continue; const i = idx(x, y); if (Kr[i] === K.DESERT) { Kr[i] = K.CLIFF; Br[i] = -1; } }
  // damage: kinds as the town's (1 a shell hole, 2 one end fallen in, 3 gutted, 4 collapsed), a share of the houses by the village's size
  const damage = (it, d) => { const v = rnd(TD, 500, it.id); if (v >= d) return; const q = v / d, t = q < 0.25 ? 1 : q < 0.5 ? 2 : q < 0.75 ? 3 : 4; it.dmg = (t >= 2 && t < 4 && (it.w < 6 || it.h < 6)) ? 4 : t;
    if (it.dmg === 2) it.cut = { end: rnd(TD, 501, it.id) < 0.5 ? 0 : 1, at: Math.max(2, Math.round((it.ori === 'h' ? it.w : it.h) * (0.35 + rnd(TD, 502, it.id) * 0.3))) };
    if (it.dmg >= 2) for (let y = it.y0; y < it.y0 + it.h; y++) for (let x = it.x0; x < it.x0 + it.w; x++) { const lx = x - it.x0, ly = it.y0 + it.h - 1 - y, inner = lx > 0 && ly > 0 && lx < it.w - 1 && ly < it.h - 1; if (it.dmg === 4 || (it.dmg === 3 && inner) || (it.dmg === 2 && inCut(it, lx, ly))) Kr[idx(x, y)] = K.RUBBLE; }
    it.fire = rnd(TD, 503, it.id) < [0, 0.05, 0.25, 0.3, 0.08][it.dmg] * clamp(d * 3, 0.3, 1); if (it.fire) plan.fires.push({ x: it.x0 + it.w / 2, y: it.y0 + it.h / 2, w: it.w, h: it.h, x0: it.x0, y0: it.y0, item: it.id, seed: h32(seed, 97000 + it.id) % 100000 }); };
  const cube = (x0, y0, w, h, g) => { const q = rnd(TD, 510, plan.items.length) * 20; const it = addItem({ t: 'cube', x0, y0, w, h, ori: w >= h ? 'h' : 'v', style: 'flat', wash: q < 9 ? 0 : q < 16 ? 1 : q < 18 ? 2 : 3, seed: sd(), dmg: 0, run: -93000 - plan.items.length, group: g });
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, K.BLDG, it.id); return it; };
  // a packed block: houses of mixed sizes sharing their walls (a guillotine split, every house at least 9 px across), now and then a courtyard
  const block = (x0, y0, w, h, tag) => { const out = [], split = (a, b, w2, h2, d) => { const vert = w2 > h2 ? rnd(tag, d, a) < 0.8 : rnd(tag, d, b) < 0.2;
      if ((w2 < 30 && h2 < 30) || d > 4 || (vert ? w2 : h2) < 22) { out.push([a, b, w2, h2]); return; } if (vert) { const c = Math.round(w2 * (0.35 + rnd(tag, a, b) * 0.3)); split(a, b, c, h2, d + 1); split(a + c, b, w2 - c, h2, d + 1); } else { const c = Math.round(h2 * (0.35 + rnd(tag, b, a) * 0.3)); split(a, b, w2, c, d + 1); split(a, b + c, w2, h2 - c, d + 1); } };
    split(x0, y0, w, h, 0); const made = []; out.forEach(([a, b, w2, h2], k) => { if (rnd(tag, 900, k) < 0.12 && w2 > 8 && h2 > 8) { for (let y = b; y < b + h2; y++) for (let x = a; x < a + w2; x++) set(x, y, K.COURT); if (rnd(tag, 901, k) < 0.5) plan.trees.push({ x: Math.round(a + w2 / 2), y: Math.round(b + h2 / 2), r: 2, v: 1, palm: true }); return; } made.push(cube(a, b, w2, h2)); }); return made; };
  // 2. the features
  const SZ = { small: { rx: 30, ry: 32, d: 0.07, blocks: 2 }, medium: { rx: 40, ry: 64, d: 0.2, blocks: 10 }, large: { rx: 36, ry: 34, d: 0.42, blocks: 14 } };
  for (const [fi, F] of (P.features || []).entries()) { const yc = Math.round(L * F.at);
    if (F.kind === 'oasis') { const Z = SZ[F.size || 'medium'], m = MX(yc), sGr = (F.side || (W - m > m ? 1 : -1)), houses = [], g0 = plan.items.length;
      const rx = Math.min(Z.rx, (sGr > 0 ? W - m : m) / 2 - 10), gx = Math.round(m + sGr * (rx + 14)), gy = yc, ry = Z.ry; // the grove beside the track
      for (let y = gy - ry - 3; y <= gy + ry + 3; y++) for (let x = gx - rx - 3; x <= gx + rx + 3; x++) { if (!inB(x, y) || Kr[idx(x, y)] !== K.DESERT || Br[idx(x, y)] !== -1) continue; const e = Math.hypot((x + 0.5 - gx) / rx, (y + 0.5 - gy) / ry) + (vn(x * 0.15, y * 0.15 + fi) - 0.5) * 0.3; if (e < 1) set(x, y, K.OASIS); }
      const prx = Math.max(8, Math.round(rx * 0.36)), pry = Math.max(7, Math.round(Math.min(ry * 0.26, prx * 1.3)));
      for (let y = gy - pry - 1; y <= gy + pry + 1; y++) for (let x = gx - prx - 1; x <= gx + prx + 1; x++) { const e = Math.hypot((x + 0.5 - gx) / prx, (y + 0.5 - gy) / pry) + (vn(x * 0.2, y * 0.2 + 7) - 0.5) * 0.2; if (e < 1 && inB(x, y) && Br[idx(x, y)] === -1 && (Kr[idx(x, y)] === K.OASIS || Kr[idx(x, y)] === K.DESERT)) set(x, y, K.WATER, -16); }
      const nP = Math.round(rx * ry * 0.034); for (let k = 0; k < nP; k++) { const a = k * 2.399 + rnd(TD, 20, fi) * 6, rr = Math.sqrt(0.12 + 0.88 * rnd(TD, 21, k + fi * 300)), px = Math.round(gx + Math.cos(a) * rx * rr * 0.92), py = Math.round(gy + Math.sin(a) * ry * rr * 0.92);
        if (!inB(px, py) || Kr[idx(px, py)] !== K.OASIS || (RX !== null && Math.abs(px - RXat(py)) < 12) || [[-2, 0], [2, 0], [0, -2], [0, 2]].some(([dx, dy]) => inB(px + dx, py + dy) && Kr[idx(px + dx, py + dy)] === K.WATER)) continue; plan.trees.push({ x: px, y: py, r: 2 + (rnd(TD, 22, k) < 0.35 ? 1 : 0), v: 1, palm: true }); }
      // the houses: packed blocks on the other side of the track (all round the grove when the village is large), the square with the hall
      const hs = -sGr, span = F.size === 'large' ? 150 : F.size === 'small' ? 70 : 120, sq = { w: 30, h: 24 };
      const xsAt = y => Math.round(MX(y) + hs * 8), blocks = [];
      for (let yy = gy - span; yy < gy + span; ) { const bh = 26 + Math.round(rnd(TD, 30, yy) * 20); let xa = xsAt(yy), n = 0;
        while (n < (F.size === 'small' ? 1 : 3)) { const bw = 26 + Math.round(rnd(TD, 31, yy + n) * 20), x0 = hs > 0 ? xa : xa - bw; if (x0 < 4 || x0 + bw > W - 4) break; blocks.push([x0, yy, bw, bh]); xa += hs * (bw + 8); n++; }
        yy += bh + 8; }
      if (F.size === 'large') for (let yy = gy - span; yy < gy + span; yy += 40) { const x0 = sGr > 0 ? Math.min(W - 40, gx + rx + 8) : Math.max(4, gx - rx - 44); blocks.push([x0, yy, 36, 32]); } // beyond the grove too
      blocks.sort((a, b) => Math.abs(a[1] + a[3] / 2 - gy) - Math.abs(b[1] + b[3] / 2 - gy));
      let hall = null;
      { const bx = hs > 0 ? xsAt(gy) : xsAt(gy) - 34, by = gy - 14; if (rectOpen(bx, by - 2, 34, 30)) { for (let y = by; y < by + 26; y++) for (let x = bx; x < bx + 34; x++) set(x, y, K.PLAZA); // the square: the domed hall at its back, the well in front
          const g = 9300 + fi, hx = hs > 0 ? bx + 12 : bx, it = addItem({ t: 'civic', label: 'Domed hall', x0: hx, y0: by + 4, w: 22, h: 18, ori: 'h', style: 'flat', wash: 0, seed: sd(), dmg: 0, group: g }); for (let y = it.y0; y < it.y0 + it.h; y++) for (let x = it.x0; x < it.x0 + it.w; x++) set(x, y, K.BLDG, it.id);
          const r = 7, dcx = hx + 11, dcy = by + 13, dm = addItem({ t: 'civic', label: 'Domed hall', part: 'dome', round: true, x0: Math.floor(dcx - r), y0: Math.floor(dcy - r), w: 2 * r + 2, h: 2 * r + 2, acx: dcx, acy: dcy, r, roof: 5, seed: sd(), dmg: 0, group: g });
          for (let y = dm.y0; y < dm.y0 + dm.h; y++) for (let x = dm.x0; x < dm.x0 + dm.w; x++) if (inB(x, y) && Math.hypot(x + 0.5 - dcx, y + 0.5 - dcy) < r) set(x, y, K.BLDG, dm.id);
          plan.wells.push({ x: hs > 0 ? bx + 5 : bx + 29, y: by + 13 }); hall = { x0: bx, y0: by, w: 34, h: 26 }; plan.squares.push({ x0: bx, y0: by, w: 34, h: 26, cx: bx + 17, cy: by + 13, side: hs, village: true }); } }
      let nb = 0; for (const [x0, y0, w0, h0] of blocks) { if (nb >= Z.blocks) break; let w = w0, h = h0; while ((w > 18 || h > 18) && !rectOpen(x0 - 1, y0 - 1, w + 2, h + 2)) { if (w > 18) w -= 4; if (h > 18) h -= 4; } if (!rectOpen(x0 - 1, y0 - 1, w + 2, h + 2)) continue; /* a block that meets the square shrinks to fit */ houses.push(...block(x0, y0, w, h, 400 + fi * 50 + nb)); nb++; }
      for (const it of houses) damage(it, Z.d);
      const nc = F.size === 'small' ? 2 : F.size === 'medium' ? 4 : 7; for (let k = 0; k < nc * 3 && plan.craters.length < 400; k++) { const x = Math.round(16 + rnd(TD, 40, k + fi * 99) * (W - 32)), y = Math.round(gy - span - 30 + rnd(TD, 41, k + fi * 99) * (2 * span + 60)), r = 2 + rnd(TD, 42, k) * 3;
        let ok = true; for (let yy = y - 5; ok && yy <= y + 5; yy++) for (let xx = x - 5; xx <= x + 5; xx++) if (!inB(xx, yy) || Kr[idx(xx, yy)] !== K.DESERT) { ok = false; break; } if (ok && k % 3 === 0) plan.craters.push({ x, y, r }); }
      plan.oasis.push({ x: gx, y: gy, rx, ry, size: F.size || 'medium', houses: houses.length, ruins: houses.filter(h2 => h2.dmg >= 2).length, hall: !!hall, held: !!F.held, y0: gy - span, y1: gy + span });
      if (F.held) fortify(gy - span - 12, houses, { gx, gy, rx, ry });
    } else if (F.kind === 'post') strongpoint(yc, fi);
    else if (F.kind === 'valley') oilValley(F, fi); else if (F.kind === 'pass') fortPass(F, fi); else if (F.kind === 'junction') junction(F, fi); else if (F.kind === 'airbase') airbase(F, fi); }
  if (RX !== null) layRail(RXat, 0, L - 1);
  // the fortification kit
  function zigTrench(pts, side, gapX) { // a fire trench along a polyline: fire bays and traverses (a square zigzag), 3 px wide, its spoil on the enemy side (side: +1 the left of the direction of travel)
    const cells = []; for (let q = 0; q + 1 < pts.length; q++) { const [ax, ay] = pts[q], [bx, by] = pts[q + 1], Lg = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / Lg, uy = (by - ay) / Lg, nx = -uy * side, ny = ux * side;
      for (let t = 0; t <= Lg; t += 0.5) { const bay = Math.floor((q * 1000 + t) / 9) % 2 ? 3 : 0, px = ax + ux * t - nx * bay, py = ay + uy * t - ny * bay; if (gapX && Math.abs(px - MX(py)) < gapX) continue; cells.push([px, py, nx, ny]); } }
    const tr = new Set(); for (const [px, py] of cells) for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) { const x = Math.round(px + xx), y = Math.round(py + yy); if (open(x, y) || (inB(x, y) && Kr[idx(x, y)] === K.SPOIL)) tr.add(idx(x, y)); }
    for (const i of tr) { Kr[i] = K.TRENCH; Br[i] = -1; }
    for (const [px, py, nx, ny] of cells) for (let k = 2; k <= 6; k++) { const x = Math.round(px + nx * k), y = Math.round(py + ny * k); if (!open(x, y)) continue; const t = (k - 2) / 4, lit = clamp(0.8 - t * 0.7 + (-nx + ny) * 0.15, 0, 1); set(x, y, K.SPOIL, -40 - Math.round(lit * 20)); } }
  function pitAt(xs, y, r, kind) { for (const x of xs) { let ok = true; for (let yy = y - r - 3; ok && yy <= y + r + 3; yy++) for (let xx = x - r - 3; xx <= x + r + 3; xx++) if (!open(xx, yy)) { ok = false; break; } if (ok) return pit(x, y, r, kind); } return null; } // a pit on the first open spot
  function pit(x, y, r, kind) { for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) { const k = inB(x + xx, y + yy) ? Kr[idx(x + xx, y + yy)] : -1; if (Math.hypot(xx + 0.5, yy + 0.5) < r - 1 && (k === K.DESERT || k === K.OASIS || k === K.SPOIL || k === K.COURT || k === K.WORKS)) set(x + xx, y + yy, K.TRENCH); } /* never into a building, a road or the railway */ plan.pits.push({ x, y, r }); return slot(kind, 'pit', x, y, r - 1); }
  function coil(pts, gapX) { let cur = []; const flush = () => { if (cur.length > 1) plan.coils.push(cur); cur = []; }; for (let q = 0; q + 1 < pts.length; q++) { const [ax, ay] = pts[q], [bx, by] = pts[q + 1], n = Math.ceil(Math.hypot(bx - ax, by - ay) / 4);
      for (let k = 0; k <= n; k++) { const px = ax + (bx - ax) * k / n, py = ay + (by - ay) * k / n; if (!inB(Math.round(px), Math.round(py)) || (gapX && Math.abs(px - MX(py)) < gapX)) { flush(); continue; } cur.push([px, py]); } } flush(); }
  function minesAlong(pts, depth, side, gapX) { let k = 0; for (let q = 0; q + 1 < pts.length; q++) { const [ax, ay] = pts[q], [bx, by] = pts[q + 1], Lg = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / Lg, uy = (by - ay) / Lg, nx = -uy * side, ny = ux * side;
      for (let t = 0; t < Lg; t += 3, k++) { const px = ax + ux * t, py = ay + uy * t; if (gapX && Math.abs(px - MX(py)) < gapX) continue; if (k % 5 === 0) plan.signs.push({ x: Math.round(px), y: Math.round(py), k: (k / 5) % 2 === 0 });
        for (let r = 1; r <= depth; r++) { if (rnd(TD, 60, k * 7 + r) < 0.45) continue; const x = Math.round(px + nx * (r * 3 + (k % 2) * 1.5)), y = Math.round(py + ny * (r * 3 + (k % 2) * 1.5)); if (open(x, y) && open(x + 1, y)) plan.mines.push({ x, y }); } } } }
  function ditch(y0, gapX) { const w = 8; for (let x = 0; x < W; x++) { const yc = y0 + 3 * Math.sin(x * 0.02 + seed) + (vn(x * 0.3, 5) - 0.5) * 1.6; if (Math.abs(x + 0.5 - MX(yc)) < gapX) continue;
      for (let q = -w / 2; q <= w / 2; q += 0.5) { const y = Math.round(yc - q); if (!open(x, y)) continue; const t = clamp((q + w / 2 + (vn(x * 0.5, y * 0.5) - 0.5) * 1.5) / w, 0, 1); set(x, y, K.DITCH, -70 - Math.round(t * 16)); } // the near (south) side in shadow, the far side lit
      for (let k = 1; k <= 4; k++) { const y = Math.round(yc + w / 2 + k); if (open(x, y)) set(x, y, K.SPOIL, -40 - [8, 13, 18, 12][k - 1]); } } } // its spoil on the defenders' side
  function roadblock(y) { const m = MX(y); for (const d of [-1, 1]) { const x0 = Math.round(m + d * 9 - (d < 0 ? 4 : 0)), it = addItem({ t: 'works', label: 'Roadblock', part: 'block', x0, y0: y - 3, w: 4, h: 6, ori: 'v', style: 'flat', roof: 3, seed: sd(), dmg: 0 }); for (let yy = it.y0; yy < it.y0 + 6; yy++) for (let x = x0; x < x0 + 4; x++) set(x, yy, K.BLDG, it.id);
      plan.obstacles.push({ kind: 'hedgehog', x: Math.round(m + d * 20), y: y + (d > 0 ? 1 : -1) }); } plan.barriers.push({ x0: Math.round(m - 6), x1: Math.round(m + 6), y }); }
  function dugTank(x, y, dir) { for (let yy = -9; yy <= 9; yy++) for (let xx = -7; xx <= 7; xx++) if (open(x + xx, y + yy)) set(x + xx, y + yy, K.OASIS); // a scrape, its spoil heaped in front and at the sides, a tank slot in it
    for (let xx = -10; xx <= 10; xx++) for (let k = 1; k <= 3; k++) { const yy = y - dir * (9 + k); if (open(x + xx, yy)) set(x + xx, yy, K.SPOIL, -40 - [16, 12, 7][k - 1]); }
    for (const sx of [-1, 1]) for (let yy = -8; yy <= 9; yy++) for (let k = 1; k <= 2; k++) { const xx = x + sx * (7 + k); if (open(xx, y + yy)) set(xx, y + yy, K.SPOIL, -40 - (sx < 0 ? 15 : 8)); }
    return slot('tank', 'pit', x, y, 6); }
  function bunkerPad(x, y) { for (let yy = y - 6; yy < y + 6; yy++) for (let xx = x - 6; xx < x + 6; xx++) if (open(xx, yy)) set(xx, yy, K.APRON); return slot('bunker', 'pad', x, y, 6); }
  function netOver(x, y, rx, ry, under) { plan.nets.push({ x, y, rx, ry, s: plan.nets.length * 3.1, under }); }
  // a held village (mockup D2): its approach from the south closed by, going north: the ditch and the roadblock, the minefield, two belts of wire, the fire trench with its pits, a bunker at the track, a tank dug in on the flank
  function fortify(yT, houses, gr) { const across = (y, a = 2.5) => { const pts = []; for (let x = 0; x <= W; x += 16) pts.push([x, y + a * Math.sin(x * 0.025 + seed)]); return pts; };
    zigTrench(across(yT), -1, 10); for (let x = 22; x < W - 10; x += 46) { const y = yT + 9, m = MX(y); if (Math.abs(x - m) < 18) continue; pit(x, y, 4, (x / 46 | 0) % 2 ? 'arty' : 'flak'); }
    bunkerPad(Math.round(MX(yT + 6) + 16), yT + 6); const tx = MX(yT) > W / 2 ? 24 : W - 24; dugTank(tx, yT - 18, 1);
    coil(across(yT - 18, 3), 8); coil(across(yT - 25, 3), 8); minesAlong(across(yT - 32, 2), 3, -1, 9); const yD = yT - 54; ditch(yD, 8); roadblock(yD + 8);
    const fl = gr && pit(Math.round(gr.gx + (gr.gx > W / 2 ? -1 : 1) * (gr.rx - 4)), gr.gy - gr.ry + 10, 6, 'flak'); if (fl) netOver(fl.x, fl.y, 13, 10, false);
    const flat = houses.filter(h2 => !h2.dmg && h2.w >= 12 && h2.h >= 12).slice(0, 2); for (const h2 of flat) { slot('flak', 'roof', h2.x0 + h2.w / 2, h2.y0 + h2.h / 2, 3, h2.id); h2.wash = h2.wash; } }
  // a strongpoint in the open (mockup D3): a ring of six pits joined by fire trenches round a command bunker, two flak guns under nets, a tank dug in, ammunition under a net; wire and mines all round with one gap towards the track
  function strongpoint(yc, fi) { const m = MX(yc), s2 = W - m > m ? 1 : -1, rx = Math.max(30, Math.min(52, ((s2 > 0 ? W - m : m) - 64) / 2)), ry = 60, cx = Math.round(m + s2 * (rx + 34)), cy = yc, ring = [];
    for (let k = 0; k <= 12; k++) { const a = k / 12 * 6.283, j = k % 12 === 0 ? 0 : (rnd(TD, 70, k + fi * 20) - 0.5) * 12; ring.push([cx + Math.cos(a) * (rx + j), cy + Math.sin(a) * (ry + j * 0.8)]); } ring[12] = ring[0];
    for (let k = 0; k < 6; k++) zigTrench([ring[k * 2], ring[k * 2 + 1], ring[(k * 2 + 2) % 12]], -1, 0);
    for (let k = 0; k < 6; k++) { const [px, py] = ring[k * 2]; pit(Math.round(px), Math.round(py), 5, k % 3 === 0 ? 'arty' : 'flak'); }
    const cs = addItem({ t: 'works', label: 'Command bunker', part: 'casemate', x0: cx - 8, y0: cy - 5, w: 16, h: 11, ori: 'h', style: 'flat', roof: 3, seed: sd(), dmg: 0, sea: 1 }); for (let y = cs.y0; y < cs.y0 + cs.h; y++) for (let x = cs.x0; x < cs.x0 + cs.w; x++) set(x, y, K.BLDG, cs.id);
    for (const [dx, dy] of [[-18, -22], [20, 18]]) { const f = pit(cx + Math.round(dx * rx / 52), cy + dy, 6, 'flak'); netOver(f.x, f.y, 13, 10, false); }
    dugTank(cx + Math.round(18 * rx / 52), cy - 34, -1); netOver(cx - Math.round(18 * rx / 52), cy + 32, 12, 8, true);
    const outer = []; for (let k = 0; k <= 32; k++) { const a = k / 32 * 6.283; outer.push([cx + Math.cos(a) * (rx + 26), cy + Math.sin(a) * (ry + 30)]); }
    const segs = []; let cur = []; for (const p2 of outer) { if (s2 * (p2[0] - cx) < -(rx + 10) && Math.abs(p2[1] - cy) < 22) { if (cur.length > 1) segs.push(cur); cur = []; } else cur.push(p2); } if (cur.length > 1) segs.push(cur); // the gap towards the track
    for (const sg of segs) { coil(sg, 0); minesAlong(sg, 2, 1, 0); }
    plan.posts.push({ x: cx, y: cy, rx, ry }); }
  // the valley (owner mockup V): the wadi down its floor between the railway and the track, an oil field (derricks, pumpjacks, tanks on a pad, a
  // pipeline along the track, a flak pit), one well burning with an oil spill
  function oilValley(F, fi) { const [a, b] = span(F), lo = RX !== null ? RX + 12 : WL[(a + b) >> 1] + 12; plan.wadis = plan.wadis || []; plan.derricks = plan.derricks || []; plan.pumps = plan.pumps || []; plan.pipes = plan.pipes || []; plan.spills = plan.spills || [];
    const wc = new Float32Array(L).fill(NaN), ph2 = rnd(TD, 100, fi) * 6.283; for (let y = Math.max(0, a - 30); y < Math.min(L, b + 30); y++) { const hi = MX(y) - 14; wc[y] = clamp(lerp(lo + 8, hi - 8, 0.5) + Math.sin(y * 0.03 + ph2) * 9, lo + 8, hi - 8); }
    const wd = { xc: wc, w: 12, y0: Math.max(0, a - 30), y1: Math.min(L - 1, b + 29) }; plan.wadis.push(wd);
    for (let y = wd.y0; y <= wd.y1; y++) for (let x = Math.floor(wc[y] - 9); x <= wc[y] + 9; x++) { if (!inB(x, y)) continue; const e = Math.abs(x + 0.5 - wc[y]) - wd.w / 2 + (vn(x * 0.2, y * 0.2 + fi) - 0.5) * 3; if (e < 2 && Kr[idx(x, y)] === K.DESERT && Br[idx(x, y)] === -1) set(x, y, K.WADI, e > 0 ? -91 : e > -1.5 ? -92 : -93); }
    const pipe = []; for (let y = a; y <= b; y += 8) pipe.push([Math.round(MX(y) + 9), y]); plan.pipes.push(pipe); for (const [x, y] of pipe) if (open(x, y)) Br[idx(x, y)] = -51;
    const spots = []; for (let k = 0; k < 40 && spots.length < 9; k++) { const y = Math.round(lerp(a + 20, b - 20, rnd(TD, 101, k + fi * 50))), sideR = rnd(TD, 102, k) < 0.45, x = Math.round(sideR ? lerp(MX(y) + 16, WR[y] - 10, rnd(TD, 103, k)) : lerp(lo + 2, MX(y) - 12, rnd(TD, 103, k)));
      let ok = true; for (let yy = y - 7; ok && yy <= y + 7; yy++) for (let xx = x - 7; xx <= x + 7; xx++) if (!open(xx, yy)) { ok = false; break; } if (!ok || spots.some(q => Math.hypot(q[0] - x, q[1] - y) < 24)) continue; spots.push([x, y]); }
    spots.forEach(([x, y], k) => { if (k % 3 === 0) { plan.derricks.push({ x, y, burn: k === 3 }); for (let yy = y - 5; yy <= y + 5; yy++) for (let xx = x - 5; xx <= x + 5; xx++) Br[idx(xx, yy)] = -51; if (k === 3) { plan.spills.push({ x: x + 5, y: y - 6, r: 6 }); plan.fires.push({ x, y, w: 8, h: 8, x0: x - 4, y0: y - 4, item: -1, seed: h32(seed, 98000 + k) % 100000 }); } }
      else { plan.pumps.push({ x, y, d: x > MX(y) ? -1 : 1 }); for (let yy = y - 3; yy <= y + 3; yy++) for (let xx = x - 4; xx <= x + 5; xx++) Br[idx(xx, yy)] = -51; } });
    { let done2 = false; for (let tries = 0, ty0 = Math.round(lerp(a, b, 0.55)); !done2 && tries < 14; tries++) { const ty = ty0 + (tries % 2 ? 1 : -1) * Math.ceil(tries / 2) * 20; // the tank farm: three tanks in a column on a fenced pad, wherever the floor has room beside the wadi
      for (let x0 = (RX !== null ? RX + 10 : 20); !done2 && x0 + 20 < WR[ty] - 2; x0 += 3) { if (!rectOpen(x0 - 1, ty - 27, 22, 56)) continue; done2 = true;
        for (let y = ty - 26; y < ty + 28; y++) for (let x = x0; x < x0 + 20; x++) set(x, y, K.WORKS);
        for (let k = -1; k <= 1; k++) { const cx = x0 + 10, cy = ty + k * 17, r = 7, it = addItem({ t: 'works', label: 'Oil tank', part: 'tank', round: true, x0: Math.floor(cx - r), y0: Math.floor(cy - r), w: 2 * r + 2, h: 2 * r + 2, acx: cx, acy: cy, r, dmg: 0, seed: sd() }); for (let y = it.y0; y < it.y0 + it.h; y++) for (let x = it.x0; x < it.x0 + it.w; x++) if (inB(x, y) && Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < r) set(x, y, K.BLDG, it.id); }
        const fp = pitAt([x0 + 34, x0 - 14, x0 + 48], ty + 38, 6, 'flak'); if (fp) netOver(fp.x, fp.y, 12, 9, false); } } }
    for (let k = 0; k < 4; k++) { const x = Math.round(lerp(lo, WR[a] - 10, rnd(TD, 104, k + fi))), y = Math.round(lerp(a, b, rnd(TD, 105, k + fi))); let ok = true; for (let yy = y - 5; ok && yy <= y + 5; yy++) for (let xx = x - 5; xx <= x + 5; xx++) if (!open(xx, yy)) { ok = false; break; } if (ok) plan.craters.push({ x, y, r: 3 + rnd(TD, 106, k) * 2 }); } }
  // the pass (owner mockup P): the walls close in to a 120 px gorge; a deep ravine across it, the railway on a stone viaduct 20 px wide (16 px trains fit
  // between its parapets) and the track on its own bridge; stone sangars on the ledges; at the top a fort astride the track with a roadblock at its gate
  function fortPass(F, fi) { const [a, b] = span(F), yR = Math.round(lerp(a, b, F.ravine !== undefined ? F.ravine : 0.42)), depth = 44; plan.ravines = plan.ravines || []; plan.viaducts = plan.viaducts || []; plan.sangars = plan.sangars || [];
    const rv = { y0: yR, y1: yR + depth, s: fi * 7.3 }; plan.ravines.push(rv); const top = x => yR + depth - Math.round(vn(x * 0.15, 9 + rv.s) * 4), bot = x => yR + Math.round(vn(x * 0.15, 10 + rv.s) * 4); rv.top = top; rv.bot = bot;
    for (let x = 0; x < W; x++) for (let y = bot(x); y <= top(x); y++) { const i = idx(x, y); if (Kr[i] === K.ROAD) { Kr[i] = K.BRIDGE; continue; } if (RX !== null && Math.abs(x + 0.5 - RX) < 10) { Kr[i] = K.RBRIDGE; Br[i] = -21; continue; } Kr[i] = K.RAVINE; Br[i] = -1; }
    if (RX !== null) plan.viaducts.push({ x: RX, y0: bot(RX), y1: top(RX), piers: [yR + 12, yR + 28] });
    for (const [k, sd2] of [[0.2, -1], [0.3, 1], [0.7, -1], [0.8, 1]]) { const y = Math.round(lerp(a, b, k)); if (Math.abs(y - yR - depth / 2) < depth) continue; const x = Math.round(sd2 < 0 ? WL[y] - 7 : WR[y] + 7); if (!inB(x, y) || Kr[idx(x, y)] !== K.CLIFF) continue; plan.sangars.push({ x, y, r: 6, s: k * 10 }); slot('flak', 'ledge', x, y, 4); }
    const fy = b - 60, fx = Math.round(MX(fy)), fw = 64, fh = 40, g = 9500 + fi, X0 = fx - fw / 2, Y0 = fy - fh / 2; // the fort
    const wall = (x0, y0, w, h, outer) => { const it = addItem({ t: 'works', label: 'Fort', part: 'fort', outer, x0, y0, w, h, ori: w > h ? 'h' : 'v', style: 'flat', roof: 3, seed: sd(), dmg: 0, group: g }); for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (inB(x, y) && Kr[idx(x, y)] !== K.ROAD && Kr[idx(x, y)] !== K.RAIL && Br[idx(x, y)] !== -50) set(x, y, K.BLDG, it.id); };
    for (let y = Y0 + 6; y < Y0 + fh - 6; y++) for (let x = X0 + 6; x < X0 + fw - 6; x++) if (open(x, y) || (inB(x, y) && Kr[idx(x, y)] === K.CLIFF)) set(x, y, K.COURT);
    wall(X0, Y0, fw / 2 - 9, 6, 'S'); wall(fx + 9, Y0, fw / 2 - 9, 6, 'S'); wall(X0, Y0 + fh - 6, fw / 2 - 9, 6, 'N'); wall(fx + 9, Y0 + fh - 6, fw / 2 - 9, 6, 'N'); wall(X0, Y0 + 6, 6, fh - 12, 'W'); wall(X0 + fw - 6, Y0 + 6, 6, fh - 12, 'E'); // gates north and south on the track
    for (const [tx2, ty2] of [[X0 - 3, Y0 - 3], [X0 + fw - 7, Y0 - 3], [X0 - 3, Y0 + fh - 7], [X0 + fw - 7, Y0 + fh - 7]]) { const it = addItem({ t: 'works', label: 'Fort tower', x0: tx2, y0: ty2, w: 10, h: 10, ori: 'h', style: 'flat', wash: 4, seed: sd(), dmg: 0, group: g }); for (let y = ty2; y < ty2 + 10; y++) for (let x = tx2; x < tx2 + 10; x++) if (inB(x, y) && Kr[idx(x, y)] !== K.ROAD && Kr[idx(x, y)] !== K.RAIL) set(x, y, K.BLDG, it.id); }
    const fp = pit(fx - 18, fy - 4, 5, 'flak'); const hb = cube(fx + 10, fy - 2, 14, 12, g); hb.wash = 1; roadblock(Y0 - 8); plan.fort = { x: fx, y: fy, w: fw, h: fh }; }
  // the junction (owner mockup J): the main line and a branch curving in from the south, an island platform between the branch and a siding, the
  // station with its side platform and canopy, wagons on the siding, an engine shed at its end, a water tower
  function junction(F, fi) { if (RX === null) return; const [a, b] = span(F), x2 = RX - 50, yb0 = a + 30, yb1 = b - 20, xs = RX - 26; plan.wagons = plan.wagons || []; plan.canopies = plan.canopies || [];
    const bx = y => lerp(RX, x2, smooth(yb0, yb0 + 70, y)); layRail(bx, yb0, yb1); plan.tunnels; plan.trainRuns.push({ x: x2, y0: yb0 + 70, y1: yb1, line: 'branch' }); for (let y = yb0; y <= yb1 + 8; y++) for (let x = x2 - 8; x <= x2 + 8; x++) if (open(x, y)) Br[idx(x, y)] = -50; // the branch's clear corridor plan.obstacles.push({ kind: 'buffer', x: x2, y: yb1 + 2 });
    const sx = y => lerp(RX, xs, smooth(yb0 + 30, yb0 + 80, y)); layRail(sx, yb0 + 30, yb1 - 40); // a siding
    const p0 = yb0 + 90, p1 = yb1 - 60; for (let y = p0; y < p1; y++) for (let x = x2 + 7; x <= xs - 7; x++) if (inB(x, y)) set(x, y, K.PLAZA, -5); // the island platform
    for (let y = p0; y < p1; y++) for (let x = RX + 9; x <= RX + 14; x++) set(x, y, K.PLAZA, -5); plan.canopies.push({ x0: RX + 9, x1: RX + 14, y0: p0 + 10, y1: p1 - 10 });
    const st = cube(RX + 16, Math.round((p0 + p1) / 2 - 30), 30, 60); st.t = 'station'; st.wash = 0; plan.wells; { const r = 6, cx = st.x0 + 15, cy = st.y0 + 30, it = addItem({ t: 'station', label: 'Station', part: 'dome', round: true, x0: cx - r, y0: cy - r, w: 2 * r + 2, h: 2 * r + 2, acx: cx, acy: cy, r, roof: 5, seed: sd(), dmg: 0, group: st.group = 9600 + fi }); for (let y = it.y0; y < it.y0 + it.h; y++) for (let x = it.x0; x < it.x0 + it.w; x++) if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < r) set(x, y, K.BLDG, it.id); }
    for (let k = 0; k < 4; k++) plan.wagons.push({ x: xs, y: yb1 - 70 - k * 31, kind: k % 2 ? 'box' : 'flat', burn: k === 1 }); plan.fires.push({ x: xs, y: yb1 - 101, w: 10, h: 24, x0: xs - 5, y0: yb1 - 113, item: -1, seed: h32(seed, 98500) % 100000 });
    { const ex0 = xs - 7, ey0 = yb1 - 50, it = addItem({ t: 'works', label: 'Engine shed', part: 'eshed', x0: ex0, y0: ey0, w: 15, h: 44, ori: 'v', style: 'flat', wash: 1, seed: sd(), dmg: 0 }); for (let y = ey0; y < ey0 + 44; y++) for (let x = ex0; x < ex0 + 15; x++) set(x, y, K.BLDG, it.id); plan.stacks.push({ x: ex0 + 7, y: ey0 + 30 }); } // (the siding runs into it)
    { const cx = RX + 30, cy = st.y0 + 72, r = 5; if (rectOpen(cx - r - 1, cy - r - 1, 2 * r + 3, 2 * r + 3)) { const it = addItem({ t: 'works', label: 'Water tower', part: 'watertower', round: true, x0: cx - r, y0: cy - r, w: 2 * r + 2, h: 2 * r + 2, acx: cx, acy: cy, r, dmg: 0, seed: sd() }); for (let y = it.y0; y < it.y0 + it.h; y++) for (let x = it.x0; x < it.x0 + it.w; x++) if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < r) set(x, y, K.BLDG, it.id); } }
    const fp = pitAt([Math.round(MX(st.y0) + 22), Math.round(MX(st.y0) - 20), Math.round(MX(st.y0) + 40)], st.y0 + 20, 6, 'flak'); if (fp) netOver(fp.x, fp.y, 12, 9, false); for (let k = 0; k < 3; k++) { const x = Math.round(lerp(x2 - 10, W - 20, rnd(TD, 110, k))), y = Math.round(lerp(a, b, rnd(TD, 111, k))); if (open(x, y) && open(x + 4, y + 4) && open(x - 4, y - 4)) plan.craters.push({ x, y, r: 3 }); } }
  // the airbase (owner mockup A): a runway of rolled sand with white edge markers, a taxiway joined at both ends, blast pens of heaped sand with
  // parked-plane slots, tents, a canvas hangar, the tower in a ring of sandbags, fuel drums under a net, flak pits under nets; shell holes on the runway, a plane burning
  function airbase(F, fi) { const [a, b] = span(F), rx = RX !== null ? RX + 40 : 112, tx = rx + 30, y0 = a + 40, y1 = b - 40; plan.tents = plan.tents || []; plan.drums = plan.drums || [];
    const pave = (x, y, k) => { if (inB(x, y) && Kr[idx(x, y)] !== K.ROAD && Kr[idx(x, y)] !== K.RAIL && Br[idx(x, y)] !== -50) set(x, y, k); }; // (never over the track or the railway)
    for (let y = y0; y <= y1; y++) { for (let x = rx - 10; x < rx + 10; x++) pave(x, y, K.RUNWAY); for (let x = tx - 4; x < tx + 4; x++) pave(x, y, K.APRON); }
    for (const yy of [y0, (y0 + y1) >> 1, y1 - 7]) for (let y = yy; y < yy + 8; y++) for (let x = rx + 10; x < tx - 4; x++) pave(x, y, K.APRON);
    plan.airbase = { rx, rw: 20, y0, y1, tx, desert: true };
    for (let k = 0; k < 4; k++) { const py = Math.round(lerp(y0 + 30, y1 - 30, k / 3)), px = tx + 22; if (px + 14 > W - 2) break; // a blast pen: sand heaped on three sides, open to the taxiway
      for (let y = py - 15; y <= py + 15; y++) for (let x = tx + 4; x <= px + 15; x++) { if (!inB(x, y)) continue; const dE = x - (px + 10), dN = y - (py + 10), dS = (py - 10) - y, edge = dE > 0 || dN > 0 || dS > 0; if (!open(x, y)) continue; if (!edge) { if (Math.abs(y - py) <= 10) set(x, y, K.APRON); continue; } if (x < px - 10) continue; const t = Math.max(dE, dN, dS), lv = dN > 0 ? (t >= 5 ? 9 : t >= 3 ? 20 : 15) : t >= 5 ? 0 : t >= 3 ? (dS > 0 ? 3 : 6) : 11; set(x, y, K.SPOIL, -40 - lv); } // banks 5 px thick: the north bank lit, the south and east banks in shade, a dark foot; the floor rolled hard
      slot('parked', 'pen', px, py, 7); }
    for (let k = 0; k < 6; k++) { const ty2 = Math.round(lerp(y0 + 20, y1 - 60, (k >> 1) / 2)) + (k % 2) * 14, tx2 = RX !== null ? RX + 12 : rx - 26; if (tx2 + 9 > rx - 11 || !rectOpen(tx2, ty2, 9, 7)) continue; const it = addItem({ t: 'works', label: 'Tent', part: 'tent', x0: tx2, y0: ty2, w: 9, h: 7, ori: 'h', style: 'flat', seed: sd(), dmg: 0 }); for (let y = ty2; y < ty2 + 7; y++) for (let x = tx2; x < tx2 + 9; x++) if (open(x, y)) set(x, y, K.BLDG, it.id); }
    { const hy = Math.round(lerp(y0, y1, 0.2)), hx = tx + 18; if (rectOpen(hx, hy, 34, 28) && hx + 34 < W) { const it = addItem({ t: 'works', label: 'Hangar', part: 'tenthangar', x0: hx, y0: hy, w: 34, h: 28, ori: 'v', style: 'flat', seed: sd(), dmg: 0 }); for (let y = hy; y < hy + 28; y++) for (let x = hx; x < hx + 34; x++) set(x, y, K.BLDG, it.id); } }
    { const ty2 = Math.round(lerp(y0, y1, 0.62)), t2 = cube(tx + 20, ty2, 12, 12); t2.t = 'works'; t2.label = 'Control tower'; t2.wash = 0; plan.pits.push({ x: tx + 26, y: ty2 + 6, r: 10 }); }
    { const dy = Math.round(lerp(y0, y1, 0.85)), dx = tx + 30; for (let k = 0; k < 6; k++) plan.drums.push({ x: dx - 8 + (k % 3) * 6, y: dy - 3 + ((k / 3) | 0) * 6 }); netOver(dx - 2, dy, 15, 11, false); }
    for (const f of [0.35, 0.92]) { const fp = pitAt([rx - 24, tx + 44, tx + 60, tx + 76], Math.round(lerp(y0, y1, f)), 6, 'flak'); if (fp) netOver(fp.x, fp.y, 12, 9, false); }
    for (const [f, r] of [[0.25, 5], [0.6, 4], [0.75, 3]]) plan.craters.push({ x: rx + Math.round((rnd(TD, 120, f * 10) - 0.5) * 10), y: Math.round(lerp(y0, y1, f)), r });
    const fy = Math.round(lerp(y0, y1, 0.47)); plan.fires.push({ x: rx, y: fy, w: 12, h: 12, x0: rx - 6, y0: fy - 6, item: -1, seed: h32(seed, 98700) % 100000 }); }
  // 3. scrub on the open sand
  for (let y = 4; y < L - 4; y += 11) for (let x = 4; x < W - 4; x += 11) { if (rnd(TD, 80, x * 7 + y) > 0.04) continue; const px = x + Math.round(rnd(TD, 81, x + y * 3) * 8), py = y + Math.round(rnd(TD, 82, x * 5 + y) * 8); let ok = true; for (let yy = py - 3; ok && yy <= py + 3; yy++) for (let xx = px - 3; xx <= px + 3; xx++) if (!open(xx, yy)) { ok = false; break; } if (ok && !plan.mines.some(q => Math.abs(q.x - px) < 4 && Math.abs(q.y - py) < 4)) plan.trees.push({ x: px, y: py, r: 2, v: 0, scrub: true }); }
  for (let y = 0; y < L; y++) { plan.U[y] = 0.1; plan.D[y] = 0.1; }
  plan.stage.total = +(now() - t0).toFixed(2);
  return plan;
}
// ---------- Enigma Run level 2 (Sea of Sand): one plan over the whole level ----------
// o.params.segs: the sortie's segments in order, { t, n } (template, chunks of 64 px). The harbour and the beach town are the desert port
// (portDesert: the level opens over the sea, the end quay 1.5 chunks in, the east harbour beside it, the beach town at war after it, middle
// density), the rest is desert land with each segment's feature: the valley, the held oasis village, the junction, the small oasis (the
// level's landmark), the airbase, the fortified pass, and the quiet desert before the boss. The railway leaves the port along its west edge
// (x 18), runs at x 74 through the desert (inside the pass's gorge) and ends at x 18 again, where the Campaign's boss ground has its line.
// The two plans are generated apart and then joined row on row: buildings and streets renumbered, every position moved up by the port's length.
function sandSea(o) {
  const P0 = Object.assign({}, PRESETS.sandSea, o.params || {}), segs = P0.segs, CHp = P0.chunk || 64, seed = o.seed | 0, W = 224;
  const port = segs.filter(g => g.t === 'harbour_commercial' || g.t === 'beach_town'), hn = (segs.find(g => g.t === 'harbour_commercial') || { n: 5 }).n, Lp = port.reduce((a, g) => a + g.n, 0) * CHp;
  const L = segs.reduce((a, g) => a + g.n, 0) * CHp, Ld = L - Lp, yC = Math.round(CHp * 1.5), hl = Math.round(hn * CHp * 0.62), run = Math.max(120, Lp - (yC + 2 + hl) - 70);
  const pp = Object.assign({}, { L: Lp, railSide: -1, portDensity: P0.portDensity, density: [[0, 0.85], [0.35, 0.8], [0.6, 0.4], [0.85, 0.15], [1, 0.04]], damage: 0.6, damageCurve: PRESETS.portDesert.damageCurve,
    coast: Object.assign({}, PRESETS.portDesert.coast, { end: yC / Lp, side: [hl / Lp, hl / Lp], beachRun: run }) });
  const A = withPerimeter({ seed: h32(seed, 1), preset: 'portDesert', params: pp }); markSlotRoofs(A); calmWater(A); desertize(A);
  let at = 0; const feats = []; for (const g of segs) { const s0 = at, s1 = at + g.n * CHp; at = s1; if (s0 < Lp) continue; const a0 = (s0 - Lp) / Ld, a1 = (s1 - Lp) / Ld, mid = (a0 + a1) / 2;
    if (g.t === 'valley') feats.push({ kind: 'valley', at0: a0 + 0.004, at1: a1 }); else if (g.t === 'village') feats.push({ kind: 'oasis', at: mid, size: 'medium', held: true }); else if (g.t === 'station_junction') feats.push({ kind: 'junction', at0: a0, at1: a1 });
    else if (g.t === 'airbase_desert') feats.push({ kind: 'airbase', at0: a0, at1: a1 }); else if (g.t === 'pass') feats.push({ kind: 'pass', at0: a0, at1: a1 }); else if (g.t === 'desert_open' && !feats.some(f => f.size === 'small')) feats.push({ kind: 'oasis', at: mid, size: 'small' }); }
  const B = desertLand({ seed: h32(seed, 2), preset: 'oasis', params: { L: Ld, road0: A.mx[Lp - 1], rail: { x: 74, x0: 18, x1: 18 }, features: feats } });
  // join: rasters row on row, lists with B's positions moved up by Lp and its ids renumbered
  const N = W * L, nI = A.items.length, nS = A.streets.length, cat = (T2, a, b) => { const r = new T2(a.length + b.length); r.set(a); r.set(b, a.length); return r; };
  const plan = Object.assign({}, B, { preset: 'sandSea', L, P: Object.assign({}, B.P, { climate: 'desert' }), seed });
  plan.K = cat(Uint8Array, A.K, B.K); plan.F = cat(Int32Array, A.F || new Int32Array(W * Lp).fill(-1), B.F); plan.RM = cat(Uint8Array, A.RM || new Uint8Array(W * Lp), B.RM);
  const Bb = Int32Array.from(B.B); for (let i = 0; i < Bb.length; i++) { const k = B.K[i], v = Bb[i]; if (v >= 0) Bb[i] = v + nI; else if (v <= -2 && (k === K.ROAD || k === K.BRIDGE || k === K.STREET)) Bb[i] = -2 - (-2 - v + nS); } plan.B = cat(Int32Array, A.B, Bb);
  for (const key of ['U', 'D', 'mx', 'aw']) plan[key] = cat(Float32Array, A[key], B[key]);
  plan.wallL = cat(Float32Array, new Float32Array(Lp).fill(-1), B.wallL); plan.wallR = cat(Float32Array, new Float32Array(Lp).fill(W), B.wallR);
  const up = q => { const r = Object.assign({}, q); for (const k of ['y', 'y0', 'y1', 'ya', 'yb', 'yc', 'cy', 'acy', 'yFront', 'Y0', 'yMin', 'yMax']) if (typeof r[k] === 'number') r[k] += Lp; return r; };
  plan.items = A.items.concat(B.items.map(it => { const r = up(it); r.id = it.id + nI; if (r.group !== undefined && r.group >= 0) r.group = 'b' + r.group; if (r.run !== undefined && r.run >= 0) r.run = r.run + 1e6; return r; }));
  plan.streets = A.streets.concat(B.streets.map(st => { const r = up(st); r.id = st.id + nS; r.pts = st.pts.map(p => [p[0], p[1] + Lp, p[2]]); return r; }));
  plan.slots = A.slots.concat(B.slots.map(sl => { const r = up(sl); if (r.item !== undefined) r.item += nI; return r; })); plan.slots.forEach((sl, i) => { sl.id = i; });
  plan.fires = A.fires.concat(B.fires.map(f => { const r = up(f); if (r.item >= 0) r.item += nI; return r; }));
  for (const key of ['trees', 'craters', 'trainRuns', 'obstacles', 'pits', 'mines', 'signs', 'nets', 'barriers', 'wells', 'derricks', 'pumps', 'spills', 'sangars', 'wagons', 'canopies', 'drums', 'squares', 'oasis', 'posts', 'stacks', 'boats', 'ships', 'shipLanes', 'cranes', 'gantries', 'heaps', 'steam', 'basins', 'tunnels', 'churches', 'parks', 'lots', 'quarters', 'farms', 'civic', 'works', 'stars', 'subSlots', 'beachSlots'])
    plan[key] = (A[key] || []).concat((B[key] || []).map(up));
  plan.coils = (A.coils || []).concat((B.coils || []).map(c => c.map(p => [p[0], p[1] + Lp]))); plan.wires = A.wires || []; plan.barrels = A.barrels || [];
  plan.pipes = (B.pipes || []).map(c => c.map(p => [p[0], p[1] + Lp]));
  plan.viaducts = (B.viaducts || []).map(v => Object.assign(up(v), { piers: v.piers.map(y => y + Lp) }));
  plan.ravines = (B.ravines || []).map(r => Object.assign(up(r), { top: x => r.top(x) + Lp, bot: x => r.bot(x) + Lp }));
  plan.wadis = []; plan.airbase = B.airbase ? up(B.airbase) : null; plan.fort = B.fort ? up(B.fort) : null; plan.rail = B.rail; plan.coast = A.coast; plan.calm = A.calm ? cat(Uint8Array, A.calm, new Uint8Array(W * Ld)) : null;
  plan.beachTown = A.beachTown; plan.station = A.station; plan.harbour = A.harbour; plan.rivers = []; plan.river = null; plan.bridges = A.bridges || []; plan.perimeter = null; plan.oldTown = A.oldTown || null;
  plan.port = { y0: 0, y1: Lp - 1, quay: yC }; plan.land = { y0: Lp, y1: L - 1 }; plan.stage = { port: A.stage && A.stage.total, land: B.stage.total };
  return plan;
}
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
// ---------- climate: the desert (Enigma Run level 2) ----------
// A pass over a finished plan (P.climate 'desert'), so a temperate plan is never touched: houses, terraces, blocks and farmsteads get flat
// plastered roofs in a few washes; the church becomes a whitewashed domed hall (its dome over the crossing, never a minaret); every tree is a
// date palm; the village pond is a well with a stone ring on a paved spot; and beyond the irrigated land round the settlement (about 20 to 46 px
// from the nearest house or garden) open meadow gives way to open desert (K.DESERT, game type 'sand'); fields are always sand (owner: no farmland in the desert).
function desertize(plan) {
  const { W, L, K: Kr, B: Br } = plan, N = W * L;
  for (const b of plan.items) { if (b.round || b.church || b.part) continue;
    if (b.t === 'house' || b.t === 'terrace' || b.t === 'block' || b.t === 'farmhouse' || b.t === 'barn' || b.t === 'farm') { b.style = 'flat'; const q = h32(b.seed | 0, 77) % 20; b.wash = q < 9 ? 0 : q < 16 ? 1 : q < 18 ? 2 : 3; } }
  for (const ch of plan.churches || []) { const parts = ch.parts.map(id => plan.items[id]), nave = parts.find(p => p.part === 'nave'), tr = parts.find(p => p.part === 'trans'); if (!nave) continue;
    const D = ch.dome = { x: nave.x0 + nave.w / 2, y: tr ? tr.y0 + tr.h / 2 : nave.y0 + nave.h / 2, r: nave.w / 2 + (ch.big === true ? 3 : 2) };
    for (let y = Math.floor(D.y - D.r); y <= D.y + D.r; y++) for (let x = Math.floor(D.x - D.r); x <= D.x + D.r; x++) { if (x < 0 || x >= W || y < 0 || y >= L) continue; const i = y * W + x; // the dome overhangs the nave into the churchyard
      if (Kr[i] === K.CHYARD && Math.hypot(x + 0.5 - D.x, y + 0.5 - D.y) < D.r) { Kr[i] = K.BLDG; Br[i] = nave.id; } } }
  for (const t of plan.trees) { t.palm = true; t.fruit = false; }
  { let sx = 0, sy = 0, n = 0; for (let i = 0; i < N; i++) if (Kr[i] === K.WATER && Br[i] === -7) { sx += i % W; sy += (i / W) | 0; n++; Kr[i] = K.PLAZA; Br[i] = -1; }
    plan.wells = n ? [{ x: Math.round(sx / n), y: Math.round(sy / n) }] : []; }
  const S = new Float32Array(N).fill(1e9), set = k => k === K.BLDG || k === K.GARDEN || k === K.COURT || k === K.FRONT || k === K.ORCHARD || k === K.STREET || k === K.PLAZA || k === K.CHYARD || k === K.PARK || k === K.WORKS || k === K.QUAY;
  for (let i = 0; i < N; i++) if (set(Kr[i])) S[i] = 0;
  for (let y = 0; y < L; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!S[i]) continue; let d = S[i]; if (x > 0) d = Math.min(d, S[i - 1] + 1); if (y > 0) { d = Math.min(d, S[i - W] + 1); if (x > 0) d = Math.min(d, S[i - W - 1] + 1.41); if (x < W - 1) d = Math.min(d, S[i - W + 1] + 1.41); } S[i] = d; }
  for (let y = L - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; if (!S[i]) continue; let d = S[i]; if (x < W - 1) d = Math.min(d, S[i + 1] + 1); if (y < L - 1) { d = Math.min(d, S[i + W] + 1); if (x < W - 1) d = Math.min(d, S[i + W + 1] + 1.41); if (x > 0) d = Math.min(d, S[i + W - 1] + 1.41); } S[i] = d; }
  for (let i = 0; i < N; i++) { const k = Kr[i]; if (k !== K.FIELD && !(k === K.MEADOW && Br[i] === -1) && k !== K.NONE) continue; const x = i % W, y = (i / W) | 0;
    if (k === K.FIELD || S[i] > 20 + 26 * vn(x * 0.025 + 3, y * 0.02)) { Kr[i] = K.DESERT; if (plan.F) plan.F[i] = -1; } } // no farmland in the desert (owner): fields become open sand
}
// flat roofs with a slot get a gun platform; call once after generate (keeps paint() free of searches)
function markSlotRoofs(plan) { for (const s of plan.slots) if (s.on === 'roof' && s.item !== undefined) plan.items[s.item].slot = true; }

const CityGen = { VERSION: 1, K, KIND_NAMES, TT, PRESETS, generate: o => { const bd = (PRESETS[o.preset] || {}).builder; if (bd === 'sandSea') return sandSea(o); const p = o.preset === 'islands' ? islands(o) : bd === 'desert' ? desertLand(o) : withPerimeter(o); markSlotRoofs(p); calmWater(p); if (p.P && p.P.climate === 'desert' && p.P.builder !== 'desert') desertize(p); return p; }, validate, typeAt, paint, paintFx, riverFx, fireBox, palette: C_TEMP, desert: C_DESERT };
if (typeof module !== 'undefined' && module.exports) module.exports = CityGen;
root.CityGen = CityGen;
})(typeof globalThis !== 'undefined' ? globalThis : this);
