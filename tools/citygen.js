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
const K = { NONE: 0, ROAD: 1, STREET: 2, WALK: 3, BLDG: 4, PLAZA: 5, FRONT: 6, GARDEN: 7, COURT: 8, PARK: 9, LOT: 10, CHYARD: 11, FIELD: 12, MEADOW: 13, RUBBLE: 14, WATER: 15, ORCHARD: 16 };
// what the game's placement and spawn code calls each kind (its terrain-type vocabulary)
const TT = ['field', 'road', 'street', 'street', 'roof', 'yard', 'yard', 'grass', 'yard', 'park', 'yard', 'grass', 'field', 'grass', 'rubble', 'river', 'grass'];
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
    collectorOffset: [70, 56], collectorMinU: 0.5, outerLocalMinU: 0.7, outerLocalChance: 0.72, blockMergeChance: 0.08,
    widths: { arterialLow: 9, arterialHigh: 18, collector: 12, local: 7, carriage: 10 },
    houses: { detached: [0.3], terraceTo: 0.62 },
    lotChance: 0.05, lotChanceDamage: 0.08,
    squares: true, cathedral: true, parishSpacing: 560, parishMinU: 0.45, parkSpacing: 700,
    trees: 1,
    slots: { flakSpacing: 44, artySpacing: 72, flakPer300: 2.2, artyPer300: 1.1 },
  },
};

// ---------- deterministic randomness ----------
function h32(a, b) { let h = Math.imul((a | 0) ^ 0x7F4A7C15, 0x9E3779B1) ^ Math.imul(((b | 0) + 0x165667B1) | 0, 0x85EBCA6B); h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; h = Math.imul(h, 0x297A2D39); h ^= h >>> 15; return h >>> 0; }
// tags: one random stream per kind of decision, so changing one part of the generator does not reshuffle the others
const T = { ROAD: 1, CROSS: 2, COL: 3, LOC: 4, BLD: 5, SQ: 6, CH: 7, PARK: 8, LOT: 9, TREE: 10, DMG: 11, SLOT: 12, INT: 13, SHED: 14, CRATER: 15, ROOF: 16 };
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
  const plan = { v: 1, seed, preset: opts.preset || 'town', W, L, P, K: Kr, B: Br, U: new Float32Array(L), D: new Float32Array(L), mx: new Float32Array(L), aw: new Float32Array(L),
    streets: [], items: [], trees: [], slots: [], craters: [], fires: [], squares: [], churches: [], parks: [], lots: [] };

  // 1. fields
  const road = P.road || { c: 82 + rnd(T.ROAD, 1) * 60, amp: 18 + rnd(T.ROAD, 2) * 26, fr: 0.0026 + rnd(T.ROAD, 3) * 0.0034, ph: rnd(T.ROAD, 4) * 6.283 };
  for (let y = 0; y < L; y++) {
    plan.U[y] = clamp(curve(P.density, y / (L - 1)), 0, 1);
    plan.D[y] = clamp(curve(P.damageCurve, y / (L - 1)) * P.damage * (0.4 + 0.6 * plan.U[y]) / 0.6, 0, 1);
    plan.mx[y] = clamp(road.c + road.amp * Math.sin(y * road.fr + road.ph) + 2.5 * Math.sin(y * 0.021 + road.ph), 34, W - 34);
    const u = plan.U[y]; plan.aw[y] = u < 0.35 ? P.widths.arterialLow : lerp(P.widths.arterialLow, P.widths.arterialHigh, smooth(0.35, 0.75, u));
  }
  const Uy = y => plan.U[clamp(y | 0, 0, L - 1)], Dy = y => plan.D[clamp(y | 0, 0, L - 1)], MX = y => plan.mx[clamp(y | 0, 0, L - 1)], AW = y => plan.aw[clamp(y | 0, 0, L - 1)];
  // urbanisation at a point: full inside the core around the main road, fading through the fray zone
  const uAt = (x, y) => { const U = Uy(y), cw = P.coreBase + P.coreGrow * Math.pow(U, 1.4), d = Math.abs(x - MX(y)); return U * clamp(1 - (d - cw) / P.fray, 0, 1); };
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

  // 2. streets
  // a street: { cls: 'arterial' | 'collector' | 'local', axis: 'v' | 'h', tank, pts: [[x, y, w]] (v: one point per y; h: per x), y0, y1 | x0, x1, side }
  function paintV(st) { // x of the centre and width per row
    for (const [xc, y, w] of st.pts) {
      const half = w / 2, car = st.tank ? P.widths.carriage / 2 : Math.min(half, 3.5);
      for (let x = Math.floor(xc - half); x < Math.ceil(xc + half); x++) {
        if (!inB(x, y)) continue; const i = idx(x, y), cur = Kr[i], d = Math.abs(x + 0.5 - xc);
        const k = d < car ? (st.tank ? K.ROAD : K.STREET) : K.WALK;
        if (cur === K.ROAD || (cur === K.STREET && k === K.WALK)) continue; Kr[i] = k; Br[i] = -2 - st.id;
      }
    }
  }
  function paintH(st) {
    for (const [x, yc, w] of st.pts) {
      const half = w / 2, car = st.tank ? P.widths.carriage / 2 : Math.min(half, 3.5);
      for (let y = Math.floor(yc - half); y < Math.ceil(yc + half); y++) {
        if (!inB(x, y)) continue; const i = idx(x, y), cur = Kr[i], d = Math.abs(y + 0.5 - yc);
        const k = d < car ? (st.tank ? K.ROAD : K.STREET) : K.WALK;
        if (cur === K.ROAD || (cur === K.STREET && k === K.WALK)) continue; Kr[i] = k; Br[i] = -2 - st.id;
      }
    }
  }
  const addStreet = st => { st.id = plan.streets.length; plan.streets.push(st); return st; };

  // 2a. the main road, the whole length: the arterial and the tanks' main route
  { const pts = []; for (let y = 0; y < L; y++) pts.push([plan.mx[y], y, plan.aw[y]]); addStreet({ cls: 'arterial', axis: 'v', tank: true, pts, y0: 0, y1: L - 1 }); }

  // 2b. cross streets: horizontal, spacing shrinking with U; each side of the main road has its own (staggered crossroads outside the centre)
  const cross = { '-1': [], '1': [] };
  { let y = 0, n = 0;
    while (y < L && Uy(y) < P.crossMinU) y += 4;
    while (y < L - 20) {
      const U = Uy(y);
      for (const s of [-1, 1]) {
        const st = Math.round(U < 0.75 ? (rnd(T.CROSS, n, s + 2) - 0.5) * P.stagger : 0), yc = y + st;
        if (yc < 6 || yc > L - 7) continue;
        const xEdge = MX(yc) + s * AW(yc) / 2; let x = xEdge, ext = 0;
        while (x > 2 && x < W - 3 && uAt(x, yc) >= P.crossEndU) { x += s; ext++; }
        if (x <= 2 || x >= W - 3) ext += 8; // reaches the edge of the strip: run off it
        if (ext < 22) continue;
        const coll = U >= 0.6, w = coll ? P.widths.collector : P.widths.local, bend = U < 0.8 ? (rnd(T.CROSS, n, s + 7) - 0.5) * 4 : 0;
        const pts = []; const xa = Math.round(MX(yc)), xb = Math.round(clamp(xEdge + s * ext, -1, W)); // from the main road's centre, so the carriageways join
        for (let xx = Math.min(xa, xb); xx <= Math.max(xa, xb); xx++) { if (xx < 0 || xx >= W) continue; const f = clamp(Math.abs(xx - xEdge) / Math.max(1, ext), 0, 1); pts.push([xx, yc + bend * Math.sin(f * Math.PI), w]); }
        const S = addStreet({ cls: coll ? 'collector' : 'local', axis: 'h', tank: coll, pts, yc, side: s, x0: Math.min(xa, xb), x1: Math.max(xa, xb), w });
        cross[s].push(S);
      }
      y += Math.max(30, lerp(P.crossSpacing[0], P.crossSpacing[1], smooth(0.15, 1, U)) * (0.85 + 0.3 * rnd(T.CROSS, n, 9))); n++;
    }
  }
  // the y of a cross street at an x (the bend), or null if it does not reach that x
  const crossYat = (S, x) => { const p = S.pts.find(q => q[0] === Math.round(x)); return p ? p[1] : null; };

  // 2c. streets parallel to the main road between pairs of cross streets on the same side: collectors, then outer local streets.
  // A segment exists only where both cross streets reach it, so every one ends in a T-junction; some are left out so blocks vary.
  function parallel(s, offAt, cls, minU, chance, tag) {
    const list = cross[s];
    for (let k = 0; k + 1 < list.length; k++) {
      const A = list[k], Bc = list[k + 1], ym = (A.yc + Bc.yc) / 2, U = Uy(ym);
      if (U < minU || rnd(tag, k, s + 3) > chance) continue;
      const xm = MX(ym) + s * offAt(ym); if (xm < 8 || xm > W - 9 || uAt(xm, ym) < 0.42) continue;
      const ya = crossYat(A, MX(A.yc) + s * offAt(A.yc)), yb = crossYat(Bc, MX(Bc.yc) + s * offAt(Bc.yc));
      if (ya === null || yb === null) continue;
      const tank = cls === 'collector' && U >= 0.65 && A.tank && Bc.tank, w = tank ? P.widths.collector : P.widths.local, pts = []; // a tank route must join tank routes at both ends
      const y0 = Math.round(ya), y1 = Math.round(yb);
      let ok = true;
      for (let y = y0; y <= y1; y++) { const x = MX(y) + s * offAt(y); if (x < 6 || x > W - 7) { ok = false; break; } pts.push([x, y, w]); }
      if (ok && pts.length > 12) addStreet({ cls: tank ? 'collector' : 'local', axis: 'v', tank, pts, y0, y1, side: s, off: offAt(ym) });
    }
  }
  const phC = rnd(T.COL, 1) * 6.283;
  const colOff = y => lerp(P.collectorOffset[0], P.collectorOffset[1], Uy(y)) + 6 * Math.sin(y * 0.004 + phC);
  const outOff = y => colOff(y) + lerp(64, 50, Uy(y)) + 4 * Math.sin(y * 0.006 + phC * 2);
  for (const s of [-1, 1]) { parallel(s, colOff, 'collector', P.collectorMinU, 1 - P.blockMergeChance, T.COL); parallel(s, outOff, 'local', P.outerLocalMinU, P.outerLocalChance, T.LOC); }

  for (const st of plan.streets) (st.axis === 'v' ? paintV : paintH)(st);

  // 3. landmarks
  // 3a. the market square: at the densest point, on the wider side of the main road, its south edge on a cross street
  let peakY = 0; for (let y = 0; y < L; y++) if (plan.U[y] > plan.U[peakY] + 1e-6) peakY = y;
  if (P.squares) {
    const cands = [...cross['1'], ...cross['-1']].filter(S => Math.abs(S.yc - peakY) < 260).sort((a, b) => Math.abs(a.yc - peakY) - Math.abs(b.yc - peakY) + ((MX(a.yc) < W / 2) === (a.side > 0) ? -40 : 0) - ((MX(b.yc) < W / 2) === (b.side > 0) ? -40 : 0));
    for (const best of cands) { if (plan.squares.length) break; const s = best.side;
      const y0 = Math.ceil(best.yc + best.w / 2) + 1; let xEdge = Math.round(MX(y0 + 12));
      for (let q = 0; q < 24 && !(free(xEdge, y0) && free(xEdge, y0 + 12)); q++) xEdge += s; // past the main road and its pavement
      let h = 0; while (h < 36 && free(xEdge + s * 4, y0 + h) && free(xEdge + s * 20, y0 + h)) h++; // up to the next street
      let w = 0; while (h >= 24 && w < 48 && free(xEdge + s * w, y0) && free(xEdge + s * w, y0 + h - 1) && free(xEdge + s * w, y0 + (h >> 1))) w++;
      if (w >= 30) {
        const x0 = s > 0 ? xEdge : xEdge - w + 1;
        for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (free(x, y)) { Kr[idx(x, y)] = K.PLAZA; Br[idx(x, y)] = -1; }
        const sq = { x0, y0, w, h, cx: x0 + w / 2, cy: y0 + h / 2, side: s };
        plan.squares.push(sq); peakY = sq.cy;
        for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) if (x * x + y * y <= 16) { const i = idx(Math.round(sq.cx) + x, Math.round(sq.cy) + y); Kr[i] = x * x + y * y <= 9 ? K.WATER : K.WALK; }
      }
    }
  }
  // 3b. churches. Parts in church space: u across, v along from the front (tower) to the apse.
  function churchParts(big) {
    return big ? [{ p: 'tower', u0: -5, v0: 0, w: 10, h: 11 }, { p: 'nave', u0: -7, v0: 11, w: 14, h: 30 }, { p: 'trans', u0: -15, v0: 26, w: 30, h: 8 }, { p: 'apse', u0: -7, v0: 41, w: 14, h: 7, r: 7 }]
      : [{ p: 'tower', u0: -4, v0: 0, w: 8, h: 8 }, { p: 'nave', u0: -6, v0: 8, w: 12, h: 22 }, { p: 'trans', u0: -11, v0: 19, w: 22, h: 6 }, { p: 'apse', u0: -6, v0: 30, w: 12, h: 5, r: 6 }];
  }
  function placeChurch(cx, yFront, dir, big) { // dir 1: the church extends up (north) from its front at yFront, -1: down
    const parts = churchParts(big), len = big ? 48 : 35, half = big ? 16 : 12, m = 3;
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
  }
  { // parish churches: on the north side of a cross street, facing it, spaced out, where the town is dense enough
    const spots = [];
    for (const s of [-1, 1]) for (const S of cross[s]) if (Uy(S.yc) >= P.parishMinU) spots.push(S);
    spots.sort((a, b) => rnd(T.CH, a.id) - rnd(T.CH, b.id));
    for (const S of spots) {
      const yF = Math.ceil(S.yc + S.w / 2) + 1;
      if (plan.churches.some(c => Math.abs(c.yFront - yF) < P.parishSpacing)) continue;
      for (let q = 0; q <= S.x1 - S.x0; q += 3) { const cx = S.side > 0 ? S.x1 - 16 - q : S.x0 + 16 + q; if (Math.abs(cx - MX(yF)) < 26 || cx < 16 || cx > W - 17) continue; if (placeChurch(cx, yF, 1, false)) break; } // the first spot along the street with room
    }
  }
  // 3c. parks: one block between the main road and a collector, now and then, away from the square
  { const blocks = [];
    for (const s of [-1, 1]) for (let k = 0; k + 1 < cross[s].length; k++) { const A = cross[s][k], Bc = cross[s][k + 1], ym = (A.yc + Bc.yc) / 2; if (Uy(ym) >= 0.5 && Uy(ym) <= 0.93 && Bc.yc - A.yc < 80) blocks.push({ s, A, B: Bc, ym }); }
    blocks.sort((a, b) => rnd(T.PARK, a.A.id) - rnd(T.PARK, b.A.id));
    for (const bk of blocks) {
      if (plan.parks.some(p => Math.abs(p.ym - bk.ym) < P.parkSpacing) || plan.squares.some(q => Math.abs(q.cy - bk.ym) < 160) || plan.churches.some(c => Math.abs(c.yFront - bk.ym) < 70)) continue;
      const ya = Math.ceil(bk.A.yc + bk.A.w / 2) + 1, yb = Math.floor(bk.B.yc - bk.B.w / 2) - 1; let n = 0;
      const rows = [];
      for (let y = ya; y <= yb; y++) { let x = Math.round(MX(y) + bk.s * (AW(y) / 2 + 1)); const xs = x; while (free(x, y) && Math.abs(x - xs) < 90) x += bk.s; rows.push([y, Math.min(xs, x - bk.s), Math.max(xs, x - bk.s)]); }
      if (!rows.length || rows.some(r => r[2] - r[1] < 24)) continue;
      for (const [y, a, b] of rows) for (let x = a; x <= b; x++) { Kr[idx(x, y)] = K.PARK; n++; }
      plan.parks.push({ s: bk.s, ym: bk.ym, ya, yb, area: n });
    }
  }

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
  function building(t, x0, y0, w, h, ori, front, rn) {
    const own = t === 'house' || rnd(T.ROOF, plotN, 2) < 0.12; // detached houses and the odd rebuilt house have their own roof
    const roof = own ? [0, 0, 2, 1, 0, 3][(rnd(T.ROOF, plotN, 3) * 6) | 0] : rn.pal, style = own && t !== 'house' ? (rnd(T.ROOF, plotN, 4) < 0.5 ? 'hip' : 'gable') : t === 'house' ? (rnd(T.ROOF, plotN, 4) < 0.4 ? 'hip' : 'gable') : rn.style;
    const it = addItem({ t, x0, y0, w, h, ori, front, style, roof, seed: h32(seed, plotN), dmg: 0, run: own ? -1 - plotN : rn.id });
    fill(x0, y0, w, h, K.BLDG, it.id); plotN++; return it;
  }
  function frontV(st, s, fillMode) { // a street running along y: plots on side s (+1 east, -1 west). fillMode: a second pass that closes gaps in rows
    let y = st.y0 + 2, run = 0, n = 0, last = null;
    while (y < st.y1 - 4) {
      const xc0 = st.pts[clamp(y - st.y0, 0, st.pts.length - 1)][0], u = uAt(xc0 + s * 14, y), t = typeAt(u), k = h32(st.id * 977 + (s > 0 ? 1 : 0) + (fillMode ? 7777 : 0), n++);
      const r = (i) => h32(k, i) / 4294967296;
      if (u < 0.06 || (t === 'house' && (fillMode || r(1) > clamp((u - 0.05) * 4, 0, 0.92)))) { y += 6; continue; }
      const lot = !fillMode && r(2) < P.lotChance + P.lotChanceDamage * Dy(y);
      let w, d, sb, gap, gd;
      if (lot) { w = 14 + (r(3) * 5 | 0); d = 14 + (r(4) * 4 | 0); sb = 0; gap = 1; gd = 0; }
      else if (t === 'house') { w = 10 + (r(3) * 4 | 0); d = 9 + (r(4) * 3 | 0); sb = 3 + (r(5) * 3 | 0); gap = 5 + (r(6) * 8 | 0); gd = 12 + (r(7) * 10 | 0); }
      else if (t === 'terrace') { w = 7 + (r(3) * 3 | 0); d = 11 + (r(4) * 3 | 0); sb = 1 + (r(5) * 2 | 0); run++; gap = run >= 3 + (r(6) * 4 | 0) ? (run = 0, 3 + (r(8) * 4 | 0)) : 0; gd = 10 + (r(7) * 7 | 0); }
      else { w = 9 + (r(3) * 7 | 0); d = 11 + (r(4) * 4 | 0); sb = 0; gap = 0; gd = 0; }
      const rn = runFor('v' + st.id + ':' + s + ':' + y, u, t, d); if (!lot && t !== 'house') d = rn.d; // a row keeps one depth
      if (fillMode) { sb = t === 'terrace' ? 1 : 0; gd = 0; gap = 0; w = 14; while (w >= 5) { let e2 = s > 0 ? -1e9 : 1e9; for (let yy = y; yy < y + w; yy++) { const p = st.pts[clamp(yy - st.y0, 0, st.pts.length - 1)]; const e = p[0] + s * p[2] / 2; e2 = s > 0 ? Math.max(e2, e) : Math.min(e2, e); } const xq = s > 0 ? Math.ceil(e2) + sb : Math.floor(e2) - sb - d; if (rectFree(xq, y, d, w, 0)) break; w--; } if (w < 5) { y += 2; continue; } }
      let edge = s > 0 ? -1e9 : 1e9; // the street's outer edge along the plot (it curves)
      for (let yy = y; yy < y + w; yy++) { const p = st.pts[clamp(yy - st.y0, 0, st.pts.length - 1)]; const e = p[0] + s * p[2] / 2; edge = s > 0 ? Math.max(edge, e) : Math.min(edge, e); }
      const xf = s > 0 ? Math.ceil(edge) + sb : Math.floor(edge) - sb, x0 = s > 0 ? xf : xf - d;
      if (!rectFree(x0, y, d, w, 0)) { y += 2; continue; }
      if (lot) { fill(x0, y, d, w, K.LOT, -1); plan.lots.push({ x0, y0: y, w: d, h: w, street: st.id, tank: st.tank }); y += w + gap; continue; }
      const b = building(t, x0, y, d, w, 'v', s > 0 ? 'W' : 'E', rn); rn.end = 'v' + st.id + ':' + s + ':' + (y + w + gap);
      for (let yy = y; yy < y + w; yy++) { const p = st.pts[clamp(yy - st.y0, 0, st.pts.length - 1)]; const e = s > 0 ? Math.ceil(p[0] + p[2] / 2) : Math.floor(p[0] - p[2] / 2); for (let x = Math.min(e, xf); x <= Math.max(e, xf); x++) if (free(x, yy)) { Kr[idx(x, yy)] = K.FRONT; Br[idx(x, yy)] = b.id; } }
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
      const r = (q) => h32(k, q) / 4294967296;
      if (u < 0.06 || (t === 'house' && (fillMode || r(1) > clamp((u - 0.05) * 4, 0, 0.92)))) { i += 6; continue; }
      const lot = !fillMode && r(2) < P.lotChance + P.lotChanceDamage * Dy(yc);
      let w, d, sb, gap, gd;
      if (lot) { w = 14 + (r(3) * 5 | 0); d = 14 + (r(4) * 4 | 0); sb = 0; gap = 1; gd = 0; }
      else if (t === 'house') { w = 11 + (r(3) * 4 | 0); d = 9 + (r(4) * 3 | 0); sb = 3 + (r(5) * 3 | 0); gap = 5 + (r(6) * 8 | 0); gd = 12 + (r(7) * 10 | 0); }
      else if (t === 'terrace') { w = 7 + (r(3) * 3 | 0); d = 11 + (r(4) * 3 | 0); sb = 1 + (r(5) * 2 | 0); run++; gap = run >= 3 + (r(6) * 4 | 0) ? (run = 0, 3 + (r(8) * 4 | 0)) : 0; gd = 10 + (r(7) * 7 | 0); }
      else { w = 9 + (r(3) * 7 | 0); d = 11 + (r(4) * 4 | 0); sb = 0; gap = 0; gd = 0; }
      const rn = runFor('h' + st.id + ':' + s + ':' + i, u, t, d); if (!lot && t !== 'house') d = rn.d;
      if (fillMode) { sb = t === 'terrace' ? 1 : 0; gd = 0; gap = 0; w = 14; while (w >= 5 && i + w < pts.length) { let e2 = s > 0 ? -1e9 : 1e9; for (let q = i; q < i + w; q++) { const e = pts[q][1] + s * pts[q][2] / 2; e2 = s > 0 ? Math.max(e2, e) : Math.min(e2, e); } const yq = s > 0 ? Math.ceil(e2) + sb : Math.floor(e2) - sb - d; if (rectFree(x, yq, w, d, 0)) break; w--; } if (w < 5 || i + w >= pts.length) { i += 2; continue; } }
      if (i + w >= pts.length) break;
      let edge = s > 0 ? -1e9 : 1e9; for (let q = i; q < i + w; q++) { const e = pts[q][1] + s * pts[q][2] / 2; edge = s > 0 ? Math.max(edge, e) : Math.min(edge, e); }
      const yf = s > 0 ? Math.ceil(edge) + sb : Math.floor(edge) - sb, y0 = s > 0 ? yf : yf - d;
      if (!rectFree(x, y0, w, d, 0)) { i += 2; continue; }
      if (lot) { fill(x, y0, w, d, K.LOT, -1); plan.lots.push({ x0: x, y0, w, h: d, street: st.id, tank: st.tank }); i += w + gap; continue; }
      const b = building(t, x, y0, w, d, 'h', s > 0 ? 'S' : 'N', rn); rn.end = 'h' + st.id + ':' + s + ':' + (i + w + gap);
      for (let q = i; q < i + w; q++) { const e = s > 0 ? Math.ceil(pts[q][1] + pts[q][2] / 2) : Math.floor(pts[q][1] - pts[q][2] / 2), xx = pts[q][0]; for (let y = Math.min(e, yf); y <= Math.max(e, yf); y++) if (free(xx, y)) { Kr[idx(xx, y)] = K.FRONT; Br[idx(xx, y)] = b.id; } }
      if (gd > 0) { const back = sideBack(st, s, t);
        for (let xx = x; xx < x + w + (gap > 0 && gap < 9 ? gap : 0); xx++) { const p = pts[clamp(i + xx - x, 0, pts.length - 1)], bl = Math.round(p[1] + s * (p[2] / 2 + back));
          for (let y = s > 0 ? y0 + d : y0 - 1; s > 0 ? y < bl : y > bl; y += s) { if (!free(xx, y)) break; Kr[idx(xx, y)] = K.GARDEN; Br[idx(xx, y)] = b.id; } } }
      i += w + gap;
    }
  }
  // how far behind the street the gardens of one street side end (detached houses have longer gardens than terraces)
  function sideBack(st, s, t) { return (t === 'house' ? 31 : 26) + (h32(st.id * 31 + s + 7, seed) % 8); }
  const order = { arterial: 0, collector: 1, local: 2 };
  const sorted = plan.streets.slice().sort((a, b) => order[a.cls] - order[b.cls] || (a.axis === 'v' ? 0 : 1) - (b.axis === 'v' ? 0 : 1) || a.id - b.id);
  for (const st of sorted) for (const s of [-1, 1]) (st.axis === 'v' ? frontV : frontH)(st, s, false);
  for (const st of sorted) for (const s of [-1, 1]) (st.axis === 'v' ? frontV : frontH)(st, s, true); // close the gaps in rows and at corners

  // 5. interiors: every enclosed region left over. Outside the town (touching the strip's sides at low U) it is fields;
  // inside, paved courtyards with sheds where dense, shared back gardens in between, meadow at the fringe.
  { const seen = new Uint8Array(N), stack = new Int32Array(N); let reg = 0;
    for (let start = 0; start < N; start++) {
      if (Kr[start] !== K.NONE || seen[start]) continue;
      let sp = 0, n = 0, su = 0, edge = false; stack[sp++] = start; seen[start] = 1; const cells = [];
      while (sp) { const i = stack[--sp], x = i % W, y = (i / W) | 0; cells.push(i); n++; if (n % 7 === 0) su += uAt(x, y); if (x === 0 || x === W - 1) edge = true;
        if (x > 0 && !seen[i - 1] && Kr[i - 1] === K.NONE) { seen[i - 1] = 1; stack[sp++] = i - 1; }
        if (x < W - 1 && !seen[i + 1] && Kr[i + 1] === K.NONE) { seen[i + 1] = 1; stack[sp++] = i + 1; }
        if (y > 0 && !seen[i - W] && Kr[i - W] === K.NONE) { seen[i - W] = 1; stack[sp++] = i - W; }
        if (y < L - 1 && !seen[i + W] && Kr[i + W] === K.NONE) { seen[i + W] = 1; stack[sp++] = i + W; } }
      const um = n >= 7 ? su / Math.floor(n / 7) : uAt(start % W, (start / W) | 0);
      const k = (edge && um < 0.5) || um < 0.12 ? K.FIELD : um >= 0.62 ? K.COURT : um >= 0.28 ? K.GARDEN : K.MEADOW;
      for (const i of cells) Kr[i] = k;
      if (k === K.COURT && n > 260) { // sheds and workshops against the back walls of the block
        for (let q = 0; q < Math.min(4, n / 260); q++) {
          const i0 = cells[(rnd(T.SHED, reg, q) * cells.length) | 0], x0 = i0 % W, y0 = (i0 / W) | 0, w = 6 + (rnd(T.SHED, reg, q + 9) * 4 | 0), h = 5 + (rnd(T.SHED, reg, q + 19) * 3 | 0);
          let ok = x0 + w < W && y0 + h < L; for (let y = y0 - 1; ok && y <= y0 + h; y++) for (let x = x0 - 1; ok && x <= x0 + w; x++) if (!inB(x, y) || Kr[idx(x, y)] !== K.COURT) ok = false;
          if (ok) { const it = addItem({ t: 'shed', x0, y0, w, h, ori: w >= h ? 'h' : 'v', style: rnd(T.SHED, reg, q + 29) < 0.5 ? 'flat' : 'gable', roof: 3, seed: h32(seed, 9000 + reg * 8 + q), dmg: 0 }); fill(x0, y0, w, h, K.BLDG, it.id); }
        }
      }
      reg++;
    }
  }

  // 5b. the village edge: where back gardens meet the fields, some stretches have a belt of orchard (fruit trees on meadow), the others a hedge
  { // the belt's depth is measured straight across rows and columns, so it has straight edges like a real plot, not a staircase
    const depth = (x, y) => { const r = rnd(T.INT, Math.floor(y / 56) * 2 + (x < MX(y) ? 0 : 1), 77); return r < 0.35 ? 0 : 6 + Math.floor(r * 9); }; // stretches of about 56 px
    const mark = [];
    for (let y = 0; y < L; y++) for (let x = 0; x < W; x++) { const i = idx(x, y); if (Kr[i] !== K.GARDEN) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const dp = depth(x, y); if (!dp) continue;
        for (let k = 1; k <= dp; k++) { const xx = x + dx * k, yy = y + dy * k; if (!inB(xx, yy)) break; const j = idx(xx, yy); if (Kr[j] !== K.FIELD) break; mark.push(j); } } }
    for (const j of mark) Kr[j] = K.ORCHARD;
  }
  // 5c. fields: long strips running away from the main road, grouped into field blocks with hedges between them (a strip field system),
  // so field edges follow the village instead of a fixed grid
  { const fRow = new Int32Array(L), fGrp = new Int32Array(L), fRowEdge = new Uint8Array(L), fGrpEdge = new Uint8Array(L); let y = 0, r = 0, g = 0, inG = 0, gLen = 3 + (rnd(T.INT, 902, 0) * 4 | 0);
    while (y < L) { const hgt = 8 + (rnd(T.INT, 901, r) * 15 | 0); for (let k = 0; k < hgt && y < L; k++, y++) { fRow[y] = r; fGrp[y] = g; fRowEdge[y] = k === 0 ? 1 : 0; fGrpEdge[y] = k === 0 && inG === 0 ? 1 : 0; } r++; if (++inG >= gLen) { inG = 0; g++; gLen = 3 + (rnd(T.INT, 902, g) * 4 | 0); } }
    Object.assign(plan, { fRow, fGrp, fRowEdge, fGrpEdge, fPhase: Array.from({ length: g + 1 }, (_, k) => rnd(T.INT, 903, k) * 40), fBand: Array.from({ length: g + 1 }, (_, k) => 64 + rnd(T.INT, 904, k) * 34) });
  }
  // 6a. damage: roofs damaged, ruins (rubble with the walls standing), some burning; craters off the carriageways
  for (const it of plan.items) {
    const d = Dy(it.y0 + it.h / 2), v = d + (rnd(T.DMG, it.id) - 0.5) * 0.55 - (it.t === 'church' ? 0.25 : 0);
    it.dmg = d < 0.05 ? 0 : v < 0.38 ? 0 : v < 0.62 ? 1 : v < 0.86 ? 2 : 3;
    if (it.dmg >= 2 && it.part !== 'apse') { for (let y = it.y0 + 1; y < it.y0 + it.h - 1; y++) for (let x = it.x0 + 1; x < it.x0 + it.w - 1; x++) if (Br[idx(x, y)] === it.id) Kr[idx(x, y)] = K.RUBBLE; }
    if (it.dmg === 3) plan.fires.push({ x: it.x0 + it.w / 2, y: it.y0 + it.h / 2 });
  }
  { let n = 0; for (let y = 8; y < L - 8; y += 9) for (let x = 8; x < W - 8; x += 9) {
    const d = Dy(y); if (rnd(T.CRATER, x, y) > d * 0.09) continue;
    const r = 2 + rnd(T.CRATER, x, y + 1) * 3, cx = x + (rnd(T.CRATER, x + 1, y) - 0.5) * 6, cy = y + (rnd(T.CRATER, x + 2, y) - 0.5) * 6; let ok = true;
    for (let yy = Math.floor(cy - r); ok && yy <= cy + r; yy++) for (let xx = Math.floor(cx - r); ok && xx <= cx + r; xx++) { if (!inB(xx, yy)) { ok = false; break; } const k = Kr[idx(xx, yy)]; if (k === K.ROAD || k === K.STREET || k === K.BLDG || k === K.PLAZA || k === K.WATER) ok = false; }
    if (ok) { plan.craters.push({ x: cx, y: cy, r }); n++; }
  } }

  // 6b. trees: gardens, parks, churchyards, front gardens, the meadow; avenue trees on the main road's wide pavements.
  // A tree needs its whole crown on open ground, so none stands on a street, a building or a lot.
  { const okK = new Uint8Array(24); for (const k of [K.GARDEN, K.PARK, K.CHYARD, K.FRONT, K.MEADOW, K.COURT]) okK[k] = 1;
    const dens = [0, 0, 0, 0, 0, 0, 0.1, 0.2, 0.05, 0.55, 0, 0.3, 0, 0.1, 0, 0, 0];
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
      plan.trees.push({ x: tx, y: ty, r, v: (rnd(T.TREE, x, y + 4) * 3) | 0 });
    }
    for (let y = 6; y < L - 6; y += 14) { if (plan.aw[y] < 17) continue; for (const s of [-1, 1]) { const tx = Math.round(plan.mx[y] + s * (plan.aw[y] / 2 - 2)); let ok = true; for (let yy = y - 3; ok && yy <= y + 3; yy++) for (let xx = tx - 1; xx <= tx + 1; xx++) if (!inB(xx, yy) || Kr[idx(xx, yy)] !== K.WALK) { ok = false; break; } if (ok) plan.trees.push({ x: tx, y, r: 3, v: 2, avenue: true }); } }
  }

  // 6c. slots: places the game may fill with flak, artillery, AA towers and bunkers. Lots next to tank streets suit artillery; lots and flat roofs
  // suit flak; squares and parks suit AA towers; large courtyards hide artillery. Spaced out; the number per 300 px rises with U.
  { const cands = [];
    for (const l of plan.lots) cands.push({ kind: l.w >= 16 && l.h >= 16 && l.tank ? 'arty' : 'flak', on: 'lot', x: l.x0 + l.w / 2, y: l.y0 + l.h / 2, r: Math.min(l.w, l.h) / 2 });
    for (const it of plan.items) if (it.t === 'block' && it.style === 'flat' && it.dmg < 2 && it.w >= 11 && it.h >= 11) cands.push({ kind: 'flak', on: 'roof', x: it.x0 + it.w / 2, y: it.y0 + it.h / 2, r: Math.min(it.w, it.h) / 2, item: it.id });
    for (const sq of plan.squares) cands.push({ kind: 'aatower', on: 'plaza', x: sq.x0 + (sq.side > 0 ? sq.w - 7 : 7), y: sq.y0 + sq.h - 7, r: 6 });
    for (const pk of plan.parks) cands.push({ kind: 'aatower', on: 'park', x: Math.round(plan.mx[(pk.ya + pk.yb) >> 1] + pk.s * 34), y: (pk.ya + pk.yb) >> 1, r: 8 });
    for (let y = 10; y < L - 10; y += 12) for (let x = 10; x < W - 10; x += 12) if (Kr[idx(x, y)] === K.COURT && rectFreeK(x - 8, y - 8, 16, 16, K.COURT)) cands.push({ kind: 'arty', on: 'court', x, y, r: 8 });
    function rectFreeK(x0, y0, w, h, k) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (!inB(x, y) || Kr[idx(x, y)] !== k) return false; return true; }
    cands.forEach((c, i) => { c.o = rnd(T.SLOT, i); });
    cands.sort((a, b) => a.o - b.o);
    const band = 300, quota = {};
    for (const c of cands) {
      const U = Uy(c.y), q = c.kind === 'arty' ? P.slots.artyPer300 : P.slots.flakPer300, b = (c.y / band) | 0, key = c.kind + b;
      if ((quota[key] || 0) >= Math.max(c.kind === 'aatower' ? 1 : 0, Math.round(q * U))) continue;
      const sp = c.kind === 'arty' ? P.slots.artySpacing : P.slots.flakSpacing;
      if (plan.slots.some(o => (o.x - c.x) ** 2 + (o.y - c.y) ** 2 < sp * sp)) continue;
      quota[key] = (quota[key] || 0) + 1; delete c.o; c.id = plan.slots.length; plan.slots.push(c);
    }
  }
  return plan;
}

// ---------- what the game asks ----------
function typeAt(plan, x, y) { x |= 0; y |= 0; if (x < 0 || x >= plan.W || y < 0 || y >= plan.L) return 'field'; return TT[plan.K[y * plan.W + x]]; }

// ---------- validation: the numbers the lab shows and the seed sweep checks ----------
function validate(plan) {
  const { W, L, K: Kr, B: Br } = plan, m = {};
  // overlaps: every pixel of a rectangular building must be its own (or its ruin)
  let ov = 0; for (const it of plan.items) { if (it.part === 'apse') continue; for (let y = it.y0; y < it.y0 + it.h; y++) for (let x = it.x0; x < it.x0 + it.w; x++) { const i = y * W + x, o = Br[i] >= 0 ? plan.items[Br[i]] : null;
    if (!(o === it || (it.church && o && o.church === it.church)) || (Kr[i] !== K.BLDG && Kr[i] !== K.RUBBLE)) ov++; } } // a church's parts cross each other on purpose
  m.overlapPx = ov;
  // frontage: a house, terrace or block must have a street, pavement or square within 6 px in front of it
  let nf = 0, nb = 0; for (const it of plan.items) { if (it.t !== 'house' && it.t !== 'terrace' && it.t !== 'block') continue; nb++;
    const cx = (it.x0 + it.w / 2) | 0, cy = (it.y0 + it.h / 2) | 0, dir = { W: [-1, 0, it.x0 - 1, cy], E: [1, 0, it.x0 + it.w, cy], S: [0, -1, cx, it.y0 - 1], N: [0, 1, cx, it.y0 + it.h] }[it.front];
    let ok = false; for (let k = 0; k < 8 && !ok; k++) { const x = dir[2] + dir[0] * k, y = dir[3] + dir[1] * k; if (x >= 0 && x < W && y >= 0 && y < L) { const kk = Kr[y * W + x]; if (kk === K.ROAD || kk === K.STREET || kk === K.WALK || kk === K.PLAZA) ok = true; else if (kk !== K.FRONT) break; } }
    if (!ok) nf++; }
  m.buildings = nb; m.noFrontage = nf;
  // tank network: every tank-carriageway pixel reachable from the main road at the bottom, through tank carriageway only
  { const seen = new Uint8Array(W * L), st = []; let tot = 0, got = 0; for (let i = 0; i < W * L; i++) if (Kr[i] === K.ROAD) tot++;
    for (let x = 0; x < W; x++) if (Kr[x] === K.ROAD) { seen[x] = 1; st.push(x); }
    while (st.length) { const i = st.pop(); got++; const x = i % W; for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (j >= 0 && j < W * L && !seen[j] && Kr[j] === K.ROAD) { seen[j] = 1; st.push(j); } }
    m.tankReach = tot ? got / tot : 1; m.tankStreets = plan.streets.filter(s => s.tank).length; }
  m.streets = plan.streets.length;
  // churches: how many, and the closest two
  m.churches = plan.churches.length; m.churchMinGap = Infinity;
  for (let i = 0; i < plan.churches.length; i++) for (let j = i + 1; j < plan.churches.length; j++) m.churchMinGap = Math.min(m.churchMinGap, Math.abs(plan.churches[i].yFront - plan.churches[j].yFront));
  if (!isFinite(m.churchMinGap)) m.churchMinGap = null;
  // density: share of built ground per 128 px band against a target from U, mean absolute error in percentage points
  let err = 0, nbd = 0; m.bands = [];
  for (let y0 = 0; y0 + 128 <= L; y0 += 128) { let bld = 0, area = 0, us = 0; for (let y = y0; y < y0 + 128; y++) { us += plan.U[y]; for (let x = 0; x < W; x++) { const k = Kr[y * W + x]; area++; if (k === K.BLDG || k === K.RUBBLE) bld++; } }
    const U = us / 128, got = bld / area, want = 0.02 + 0.36 * U; err += Math.abs(got - want); nbd++; m.bands.push({ y0, U: +U.toFixed(2), built: +got.toFixed(3), want: +want.toFixed(3) }); }
  m.densityErr = nbd ? +(100 * err / nbd).toFixed(1) : 0;
  const by = {}; for (const s of plan.slots) by[s.kind] = (by[s.kind] || 0) + 1; m.slots = by;
  m.slotsPer1000 = +(plan.slots.length * 1000 / L).toFixed(1);
  m.squares = plan.squares.length; m.parks = plan.parks.length; m.trees = plan.trees.length; m.lots = plan.lots.length; m.ruins = plan.items.filter(i => i.dmg >= 2).length;
  m.pass = m.overlapPx === 0 && m.noFrontage === 0 && m.tankReach === 1 && (m.churchMinGap === null || m.churchMinGap >= plan.P.parishSpacing * 0.9);
  return m;
}

// ---------- painting, in the game's pixel style ----------
// The palettes and the dither are the game's own (index.html: C2, RP.tree, TR, BAYER/pickI), so a plan looks the same in the lab and in the game.
const HX = a => a.map(h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
const C = {
  roofs: [HX(['#4e160e', '#701f14', '#93301e', '#b2472e', '#cc6644']), HX(['#3e120c', '#561a12', '#70261a', '#8a3624', '#a44a34']), HX(['#3a2618', '#523622', '#6c482e', '#86603e', '#a07a54']),
    HX(['#22262e', '#323844', '#46505c', '#5e6a78', '#7c8896']), HX(['#1a1c22', '#262a32', '#343a44', '#464e5a', '#5c6672']), HX(['#1a4236', '#24584a', '#30705e', '#448a76', '#62a690']), HX(['#4a3a16', '#665020', '#82682c', '#9e823c', '#b89c52'])],
  tar: HX(['#202024', '#2a2a30', '#34343a', '#3e3e46']), cobble: HX(['#34322f', '#3e3b37', '#48443f', '#524e48']), side: HX(['#66625c', '#7a766f', '#8e8a82']),
  pave: HX(['#6e685e', '#7e786c', '#8e887c', '#9e988c']), water: HX(['#1e4a66', '#2c6684', '#4a88a6']), yard: HX(['#3a3a30', '#46463a', '#525244']),
  grass: HX(['#2e4a22', '#38582a', '#446832', '#52783c']), soil: HX(['#3e3020', '#4e3e2a', '#5e4c34']), steel: HX(['#b8bcc4'])[0], fence: HX(['#2a241c'])[0], shadow: HX(['#16141a'])[0],
  asph: HX(['#2c2c30', '#36363c', '#404048', '#4a4a52']), mark: HX(['#d8d6cc'])[0], rubble: HX(['#2a2622', '#3e3832', '#544c44', '#6a6258', '#827a6e']),
  facade: [HX(['#5e5444', '#8a7e6a', '#a69a82']), HX(['#3e1c14', '#5e2a1c', '#7a3a26']), HX(['#3e3c38', '#5a5852', '#74726a'])],
  tree: HX(['#0e1e0a', '#183014', '#22441a', '#2f5a22', '#40722c', '#58903a']),
  field: { grass: HX(['#24401a', '#2e5220', '#3a6428', '#4a7832', '#5e8e40']), wheat: HX(['#7a6428', '#9a8236', '#b8a048', '#d4bc64', '#e8d488']), soil: HX(['#3a2818', '#523a22', '#6c4e30', '#86643e']), crop: HX(['#1e3a14', '#2a4e1a', '#3a6424', '#4e7c30']), hedge: HX(['#12240e', '#1a3214', '#24421a']) },
  gravel: HX(['#4a4638', '#5a5546', '#6a6454']), fruit: HX(['#c8483a', '#e0c04a']), conc: HX(['#4e4c48', '#5e5c58', '#6e6c68', '#7e7c78']), sand: HX(['#6e6448', '#86795a']), lit: HX(['#e8c870'])[0], dark: HX(['#1a1c22'])[0], fire: HX(['#f4d050', '#f08a30', '#c84020']),
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
    if (lx === 3 && ly === 3) return C.shadow; if (lx === 3 && ly === 4) return C.conc[3]; // roof hatch
    return C.conc[pickI(4, 0.45 + (hh(wx, wy) - 0.5) * 0.35 + (vn(wx * 0.3, wy * 0.3) - 0.5) * 0.2, wx, wy)];
  }
  const along = b.ori === 'h', a = along ? lx : ly, c = along ? ly : lx, Lg = along ? w : h, Dd = along ? h : w, mid = (Dd - 1) / 2;
  let l = c < mid ? 0.78 : 0.34;
  if (Math.abs(c - mid) < 0.6) l = 0.95;
  if (style === 'hip') { const e = Math.min(c, Dd - 1 - c); if (a < e) l = 0.62; else if (Lg - 1 - a < e) l = 0.22; }
  if (a % 3 === 0) l -= 0.08;
  const ch = 2 + ((hh(b.seed, 9) * Math.max(1, Lg - 5)) | 0);
  if (!b.church && Math.abs(c - (mid - 2)) < 1 && (a === ch || a === ch + 1)) return a === ch ? C.side[2] : C.shadow; // chimney
  return ramp[pickI(5, l, wx, wy)];
}
// fields as strips running away from the main road, in blocks separated by hedges (5c)
function stripPix(plan, x, y) {
  const r = plan.fRow[y], g = plan.fGrp[y], side = x < plan.mx[y] ? 0 : 1, dd = Math.abs(x - plan.mx[y]) + plan.fPhase[g], band = Math.floor(dd / plan.fBand[g]), bpos = dd - band * plan.fBand[g];
  if (plan.fGrpEdge[y] || bpos < 1.5) return C.field.hedge[pickI(3, 0.5 + (hh(x, y) - 0.5) * 0.7, x, y)];
  const t = hh(r * 7 + band * 131 + side * 977, 5), edge = plan.fRowEdge[y] ? -0.22 : 0;
  if (t < 0.28) return C.field.wheat[pickI(5, 0.55 + edge + (y % 3 === 0 ? -0.2 : 0) + (vn(x * 0.1, y * 0.1) - 0.5) * 0.3, x, y)];
  if (t < 0.46) return C.field.soil[pickI(4, 0.5 + edge + (y % 2 === 0 ? 0.25 : -0.05), x, y)];
  if (t < 0.72) return C.field.crop[pickI(4, 0.5 + edge + (y % 3 === 0 ? 0.15 : -0.1) + (vn(x * 0.08, y * 0.08) - 0.5) * 0.3, x, y)];
  return C.field.grass[pickI(5, 0.5 + edge + (vn(x * 0.08, y * 0.08) - 0.5) * 0.6, x, y)];
}
function fieldPix(x, y) { // (unused: the old grid fields)
  const fw = 52, fh = 40, ri = Math.floor(y / fh), off = hh(ri, 77) * fw, ci = Math.floor((x + off) / fw), fx = ((x + off) % fw + fw) % fw, fy = ((y % fh) + fh) % fh, t = hh(ci * 3 + 1, ri * 5 + 2);
  if (fx < 2 || fy < 2) return C.field.hedge[pickI(3, 0.5 + (hh(x, y) - 0.5) * 0.6, x, y)];
  if (t < 0.3) return C.field.wheat[pickI(5, 0.55 + (fx % 4 === 0 ? -0.3 : 0) + (vn(x * 0.1, y * 0.1) - 0.5) * 0.3, x, y)];
  if (t < 0.5) return C.field.soil[pickI(4, 0.5 + (fy % 3 === 0 ? 0.3 : -0.05), x, y)];
  if (t < 0.75) return C.field.crop[pickI(4, 0.5 + (fx % 3 === 0 ? 0.15 : -0.1) + (vn(x * 0.08, y * 0.08) - 0.5) * 0.3, x, y)];
  return C.field.grass[pickI(5, 0.5 + (vn(x * 0.08, y * 0.08) - 0.5) * 0.6, x, y)];
}
// Paint plan rows y0 .. y0 + h - 1 into an ImageData that is W wide and h tall (screen row 0 = plan row y0 + h - 1, so north is up).
function paint(plan, img, y0, h) {
  const { W, L, K: Kr, B: Br, items } = plan, d = img.data, at = (x, y) => (y < 0 || y >= L || x < 0 || x >= W) ? -1 : y * W + x;
  const bAt = (x, y) => { const i = at(x, y); if (i < 0) return null; const k = Kr[i]; return (k === K.BLDG) && Br[i] >= 0 ? items[Br[i]] : null; };
  const streetOf = i => Br[i] <= -2 ? plan.streets[-2 - Br[i]] : null;
  for (let sr = 0; sr < h; sr++) {
    const y = y0 + h - 1 - sr; if (y < 0 || y >= L) continue;
    for (let x = 0; x < W; x++) {
      const i = y * W + x, k = Kr[i]; let c;
      switch (k) {
        case K.BLDG: { const b = items[Br[i]]; if (!b) { c = C.shadow; break; }
          if (b.part === 'apse') { const rr = Math.hypot(x + 0.5 - b.acx, y + 0.5 - b.acy); c = C.roofs[5][pickI(5, rr > b.r - 1 ? 0 : 0.8 - (x - b.x0) / (b.w * 1.4), x, y)]; break; }
          if (b.part === 'tower') { const lx = x - b.x0, ly = b.y0 + b.h - 1 - y; c = (lx === 0 || ly === 0 || lx === b.w - 1 || ly === b.h - 1) ? C.roofs[5][0] : C.roofs[5][pickI(5, 0.3 + 0.5 * (1 - Math.max(Math.abs(lx - b.w / 2), Math.abs(ly - b.h / 2)) / (b.w / 2)), x, y)]; break; }
          const ramp = b.church ? C.roofs[5] : C.roofs[b.roof || 0], lx = x - b.x0, ly = b.y0 + b.h - 1 - y;
          // a roof joins its neighbour in the same row: no outline on that side, a soft party-wall seam instead
          const join = (xx, yy) => { const o = at(xx, yy); if (o < 0 || Kr[o] !== K.BLDG) return false; const n = items[Br[o]]; return n && n !== b && n.run === b.run && n.ori === b.ori; };
          const jl = lx === 0 && join(x - 1, y), jr = lx === b.w - 1 && join(x + 1, y), jt = ly === 0 && join(x, y + 1), jb = ly === b.h - 1 && join(x, y - 1);
          if (jl || jr || jt || jb) { const bb = { w: b.w + 2, h: b.h + 2, ori: b.ori, style: b.style === 'hip' ? 'gable' : b.style, seed: b.seed, church: true }; c = roofPix(lx + 1, ly + 1, bb, ramp, x, y); if (jl || jt) c = [c[0] * 0.82 | 0, c[1] * 0.82 | 0, c[2] * 0.82 | 0]; }
          else c = roofPix(lx, ly, b, ramp, x, y);
          if (b.dmg === 1 && lx > 0 && ly > 0 && lx < b.w - 1 && ly < b.h - 1) { // one shell hole: charred rafters around a dark opening
            const hx = 1.5 + hh(b.seed, 1) * (b.w - 3), hy = 1.5 + hh(b.seed, 2) * (b.h - 3), rr = Math.hypot(lx - hx, ly - hy), rh = 1.6 + hh(b.seed, 3) * 1.4;
            if (rr < rh) c = (lx + ly) % 3 === 0 ? C.rubble[1] : C.shadow; else if (rr < rh + 1.2) c = [c[0] * 0.55 | 0, c[1] * 0.5 | 0, c[2] * 0.5 | 0]; }
          if (b.dmg >= 2) c = C.side[0]; // standing walls of a ruin
          break; }
        case K.RUBBLE: { const n = vn(x * 0.25, y * 0.25); c = C.rubble[pickI(5, n * 0.9 + (hh(x, y) - 0.5) * 0.35, x, y)]; break; }
        case K.ROAD: { const st = streetOf(i); if (st && st.cls === 'arterial') { const dx = Math.abs(x + 0.5 - plan.mx[y]); if (plan.aw[y] >= 17 && Math.abs(dx - 3.2) > 0.8 && Math.abs(dx - 3.2) < 1.5) { c = C.steel; break; } if (dx < 0.6 && plan.aw[y] < 17 && (y % 12) < 6) { c = C.mark; break; } }
          c = C.asph[pickI(4, 0.5 + (vn(x * 0.25, y * 0.25) - 0.5) * 0.4, x, y)]; break; }
        case K.STREET: c = C.cobble[pickI(4, 0.45 + (((x >> 1) + (y >> 1)) & 1 ? 0.1 : -0.06) + (hh(x, y) - 0.5) * 0.3, x, y)]; break;
        case K.WALK: c = C.side[pickI(3, 0.55 + (hh(x, y) - 0.5) * 0.4, x, y)]; break;
        case K.PLAZA: c = C.pave[pickI(4, 0.5 + ((((x >> 2) + (y >> 2)) & 1) ? 0.15 : -0.1), x, y)]; break;
        case K.WATER: c = C.water[pickI(3, 0.5 + Math.sin(x * 0.7 + y * 0.4) * 0.25, x, y)]; break;
        case K.FRONT: { const b = Br[i] >= 0 ? items[Br[i]] : null; c = b && b.t === 'house' ? C.grass[pickI(4, 0.55 + (vn(x * 0.15, y * 0.15) - 0.5) * 0.4, x, y)] : C.pave[pickI(4, 0.35 + (hh(x, y) - 0.5) * 0.3, x, y)]; break; }
        case K.GARDEN: { const o = Br[i];
          if ((x > 0 && Kr[i - 1] === K.FIELD) || (x < W - 1 && Kr[i + 1] === K.FIELD) || (y > 0 && Kr[i - W] === K.FIELD) || (y < L - 1 && Kr[i + W] === K.FIELD)) { c = C.field.hedge[pickI(3, 0.55 + (hh(x, y) - 0.5) * 0.7, x, y)]; break; } // the hedge along the village edge
          if ((x > 0 && Kr[i - 1] === K.ORCHARD) || (x < W - 1 && Kr[i + 1] === K.ORCHARD) || (y > 0 && Kr[i - W] === K.ORCHARD) || (y < L - 1 && Kr[i + W] === K.ORCHARD)) { c = C.fence; break; } // the garden fence onto the orchard if (o >= 0 && ((x > 0 && Br[i - 1] !== o && Kr[i - 1] === K.GARDEN) || (y > 0 && Br[i - W] !== o && Kr[i - W] === K.GARDEN))) { c = C.fence; break; }
          const bed = o >= 0 && hh(o, 5) < 0.35 && ((x + (o & 3)) % 9 < 4) && ((y + o) % 11 < 5); c = bed ? C.soil[pickI(3, y % 2 ? 0.3 : 0.7, x, y)] : C.grass[pickI(4, 0.5 + (vn(x * 0.12, y * 0.12) - 0.5) * 0.5, x, y)]; break; }
        case K.COURT: c = (vn(x * 0.18, y * 0.18) > 0.62) ? C.grass[pickI(4, 0.35, x, y)] : C.yard[pickI(3, 0.5 + (hh(x, y) - 0.5) * 0.5, x, y)]; break;
        case K.PARK: { const pk = plan.parks.find(p => y >= p.ya && y <= p.yb); const px = pk ? x - plan.mx[(pk.ya + pk.yb) >> 1] : x, py = pk ? y - pk.ya : y;
          if (pk && Math.abs(Math.abs(px) - 20 - (py * 0.6) % 20) < 1.1) { c = C.pave[1]; break; } c = C.grass[pickI(4, 0.55 + (vn(x * 0.1, y * 0.1) - 0.5) * 0.6, x, y)]; break; }
        case K.LOT: { const sl = plan.slots.find(s => s.on === 'lot' && Math.abs(s.x - x) <= s.r && Math.abs(s.y - y) <= s.r);
          if (sl) { const rr = Math.hypot(x + 0.5 - sl.x, y + 0.5 - sl.y), ring = sl.kind === 'arty' ? 6 : 4.5; if (Math.abs(rr - ring) < 1.1) { c = ((Math.atan2(y - sl.y, x - sl.x) * 3 | 0) & 1) ? C.sand[1] : C.sand[0]; break; } } // sandbag ring of a gun pit
          c = C.gravel[pickI(3, 0.5 + (hh(x, y) - 0.5) * 0.6, x, y)]; break; }
        case K.CHYARD: c = ((x * 3 + y * 5) % 23 === 0 && hh(x, y) < 0.6) ? C.side[2] : C.grass[pickI(4, 0.45 + (vn(x * 0.2, y * 0.2) - 0.5) * 0.4, x, y)]; break; // gravestones
        case K.MEADOW: c = C.grass[pickI(4, 0.5 + (vn(x * 0.07, y * 0.07) - 0.5) * 0.7 + (hh(x, y) - 0.5) * 0.15, x, y)]; break;
        case K.ORCHARD: c = (hh(x, y) < 0.02) ? C.field.wheat[4] : C.field.grass[pickI(5, 0.62 + (vn(x * 0.09, y * 0.09) - 0.5) * 0.35, x, y)]; break; // mown meadow, a few flowers
        default: c = stripPix(plan, x, y);
      }
      // facades and shadows: the view is slightly from the south, so a building shows its south wall below its roof (as in the game)
      if (k !== K.BLDG) {
        let f = null; for (let kk = 1; kk <= 3; kk++) { const b = bAt(x, y + kk); if (b) { f = [b, kk]; break; } }
        if (f) { const [b, kk] = f; if (b.part === 'apse' || b.dmg >= 2) { if (kk === 1) c = C.shadow; }
          else if (kk === 3) c = C.shadow; else { const pal = C.facade[b.church ? 2 : (hh(b.seed, 51) * 3) | 0]; c = x % 3 === 1 ? (hh(x >> 1, b.seed + kk) < (b.dmg ? 0.04 : 0.12) ? C.lit : C.dark) : pal[kk === 1 ? 2 : 1]; } }
        else if (bAt(x - 1, y) || bAt(x - 2, y + 1) || bAt(x - 1, y + 4)) c = [c[0] * 0.55 | 0, c[1] * 0.55 | 0, c[2] * 0.6 | 0];
      }
      const o = (sr * W + x) * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
    }
  }
  // craters, trees (shadow first), fires: drawn over the ground
  const put = (x, y, c, a = 1) => { const sr = y0 + h - 1 - y; if (x < 0 || x >= W || sr < 0 || sr >= h) return; const o = (sr * W + x) * 4; if (a >= 1) { d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; } else { d[o] = d[o] * (1 - a) + c[0] * a; d[o + 1] = d[o + 1] * (1 - a) + c[1] * a; d[o + 2] = d[o + 2] * (1 - a) + c[2] * a; } };
  for (const cr of plan.craters) { if (cr.y + cr.r < y0 || cr.y - cr.r >= y0 + h) continue;
    for (let yy = Math.floor(cr.y - cr.r - 2); yy <= cr.y + cr.r + 2; yy++) for (let xx = Math.floor(cr.x - cr.r - 2); xx <= cr.x + cr.r + 2; xx++) { const rr = Math.hypot(xx + 0.5 - cr.x, yy + 0.5 - cr.y); if (rr < cr.r) put(xx, yy, rr < cr.r - 1.2 ? C.rubble[0] : C.rubble[2]); else if (rr < cr.r + 2 && hh(xx, yy) < 0.6) put(xx, yy, C.shadow, 0.45); } }
  for (const t of plan.trees) { if (t.y + t.r + 4 < y0 || t.y - t.r - 4 >= y0 + h) continue;
    for (let yy = -t.r; yy <= t.r; yy++) for (let xx = -t.r; xx <= t.r; xx++) if (xx * xx + yy * yy <= t.r * t.r) put(t.x + xx + 2, t.y + yy - 2, C.shadow, 0.4);
    for (let yy = -t.r; yy <= t.r; yy++) for (let xx = -t.r; xx <= t.r; xx++) { const dd = (xx * xx + yy * yy) / (t.r * t.r); if (dd > 1) continue;
      if (dd > 0.72) { put(t.x + xx, t.y + yy, C.tree[0]); continue; }
      if (t.fruit && dd < 0.7 && hh(t.x * 5 + xx, t.y * 3 + yy) < 0.14) { put(t.x + xx, t.y + yy, hh(t.x, t.y) < 0.5 ? C.fruit[0] : C.fruit[1]); continue; }
      const l = 0.42 + 0.38 * (-0.55 * xx / t.r + 0.75 * yy / t.r) + 0.3 * (Math.sqrt(1 - dd) - 0.5) + (t.fruit ? 0.12 : (t.v - 1) * 0.05); put(t.x + xx, t.y + yy, C.tree[pickI(6, clamp(l, 0, 1), t.x + xx, t.y + yy)]); } }
  for (const f of plan.fires) { if (f.y + 6 < y0 || f.y - 6 >= y0 + h) continue; for (let yy = -2; yy <= 3; yy++) for (let xx = -2; xx <= 2; xx++) if (hh(f.x * 3 + xx, f.y * 5 + yy) < 0.7 - Math.abs(xx) * 0.15 - yy * 0.06) put(Math.round(f.x) + xx, Math.round(f.y) + yy, C.fire[Math.min(2, Math.abs(xx) + (yy > 1 ? 1 : 0))]); }
  // flat roofs that carry a flak slot: mark the gun platform (painted above via b.slot)
}
// flat roofs with a slot get a gun platform; call once after generate (keeps paint() free of searches)
function markSlotRoofs(plan) { for (const s of plan.slots) if (s.on === 'roof' && s.item !== undefined) plan.items[s.item].slot = true; }

const CityGen = { VERSION: 1, K, KIND_NAMES, TT, PRESETS, generate: o => { const p = generate(o); markSlotRoofs(p); return p; }, validate, typeAt, paint, palette: C };
if (typeof module !== 'undefined' && module.exports) module.exports = CityGen;
root.CityGen = CityGen;
})(typeof globalThis !== 'undefined' ? globalThis : this);
