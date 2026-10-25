// Night Hammer carriage art (Enigma Run level 3 boss), drawn with the game's own sprite toolkit. A, B, C are same-size repaints of SPR.rgBase on its exact outline; L1 to L3 add
// length behind it (ammunition tender, girder frame, pusher locomotive) on the night splinter camo of B. The girder frame (L2, 82 x 216, 64 px longer) is the one baked into the
// Enigma art set as 'rgBase' (index.html, <script id="enigmaArt">). The old carriage keeps its coordinates: the game draws the long sprite at e.y - (h - 152) / 2, so the parts, barrel and
// lights stay where they were. Run it inside the game (a local build: __sf(code)); it returns data: URLs. Lamps are cold white and cyan: enemy shots are orange.
(() => {
// Night Hammer carriage concepts (80 x 150, muzzle end to the south), drawn with the game's sprite toolkit on the same silhouette as SPR.rgBase.
const PLAT = [[8, 30], [72, 30], [76, 40], [76, 110], [72, 120], [8, 120], [4, 110], [4, 40]];
const inP = (i, j) => pip(PLAT, i + 0.5, j + 0.5);
const px = (x, c, i, j) => { x.fillStyle = c; x.fillRect(i, j, 1, 1); };
const DK = '#16161a', LT = '#d8d6cc', CY = '#8cc0e0', CW = '#d8f2ff';
const MAIN = [[12, 97], [68, 97]], AA = [[12, 47], [68, 47]], LIGHTS = [[20, 13], [60, 13]], CORE = [40, 60];
const orig = SPR.rgBase, od = orig.c.getContext('2d').getImageData(0, 0, orig.c.width, orig.c.height).data;
// the old silhouette without its outline ring, rebuilt from the old shapes (two bogies with their axle boxes, and the platform)
const oMask = new Uint8Array(80 * 150);
for (const j of [2, 116]) { for (let jj = j; jj < j + 32; jj++) for (let ii = 20; ii < 60; ii++) oMask[jj * 80 + ii] = 1; for (let i = 0; i < 4; i++) for (let jj = 0; jj < 5; jj++) for (const ax of [18, 19, 60, 61]) oMask[(j + 3 + i * 8 + jj) * 80 + ax] = 1; }
for (let j = 30; j < 120; j++) for (let i = 4; i < 77; i++) if (pip(PLAT, i + 0.5, j + 0.5)) oMask[j * 80 + i] = 1;
const oAlpha = (i, j) => i >= 0 && j >= 0 && i < 80 && j < 150 && oMask[j * 80 + i] === 1;
function sep(x, pts, col = DK) {
  let bx = 1e9, by = 1e9, bx2 = -1e9, by2 = -1e9; for (const [a, b] of pts) { bx = Math.min(bx, a); by = Math.min(by, b); bx2 = Math.max(bx2, a); by2 = Math.max(by2, b); }
  for (let j = Math.floor(by) - 1; j <= Math.ceil(by2); j++) for (let i = Math.floor(bx) - 1; i <= Math.ceil(bx2); i++) {
    if (pip(pts, i + 0.5, j + 0.5) || !oAlpha(i, j)) continue;
    if (pip(pts, i - 0.5, j + 0.5) || pip(pts, i + 1.5, j + 0.5) || pip(pts, i + 0.5, j - 0.5) || pip(pts, i + 0.5, j + 1.5)) px(x, col, i, j);
  }
}
const quad = (a, b, w, h) => [[a, b], [a + w, b], [a + w, b + h], [a, b + h]];
function mirror(f) { f(false); f(true); }
const X = (i, m) => m ? 79 - i : i;
function hazard(x, a, b, w, h, c1, c2) { for (let j = b; j < b + h; j++) for (let i = a; i < a + w; i++) if (oAlpha(i, j)) px(x, ((i + j) >> 1) % 2 ? c1 : c2, i, j); }
function bolts(x, pts, col) { for (const [i, j] of pts) { px(x, col, i, j); } }

function drawCarriage(x, o) {
  {
    // ---- rail bogies (front and rear): frame, axle boxes with lit tyres, brake cylinders, coupler plate
    for (const j of [2, 116]) {
      boxS(x, o.iron, 20, j, 40, 32, 0); sep(x, quad(20, j, 40, 32), DK);
      for (let i = 0; i < 4; i++) { const yy = j + 3 + i * 8; for (const ax of [18, 60]) { rect(x, '#0a0a0c', ax, yy, 2, 5); px(x, '#6a7c8a', ax + (ax < 40 ? 0 : 1), yy); } rect(x, '#0a0a0c', 22, yy + 2, 36, 1); px(x, '#56565e', 22, yy + 2); }
      for (const bx of [29, 51]) { ellS(x, o.iron, bx, j + 16, 4, 6, 0.12); sep(x, [[bx - 4, j + 12], [bx + 4, j + 12], [bx + 4, j + 20], [bx - 4, j + 20]], DK); rect(x, DK, bx - 1, j + 14, 2, 4); }
      boxS(x, o.iron, 33, j < 50 ? j + 2 : j + 24, 14, 6, 0.15); rect(x, DK, 38, j < 50 ? j + 4 : j + 26, 4, 2);
    }
    // ---- platform
    polyS(x, o.body, PLAT, 0.05, 0.4);
    // ---- surface: per concept
    o.surface(x);
    // ---- edge: lit rim on the north-west, shadow on the south-east, one-pixel chamfer line inside
    for (let j = 30; j < 121; j++) for (let i = 4; i < 77; i++) if (inP(i, j) && !inP(i - 2, j) && !inP(i, j - 2)) px(x, o.rim, i, j);
    // ---- gun cradle housing (the barrel sprite is drawn over its middle)
    const hs = o.housing(x);
    // ---- turret rings, rendered as collars (turret sprites sit on top)
    for (const [cx, cy] of MAIN) { disk(x, DK, cx, cy, 9); ellS(x, o.body, cx, cy, 8.2, 8.2, 0.05); disk(x, '#26282c', cx, cy, 7); for (let k = 0; k < 16; k++) { const an = k * TAU / 16; px(x, k % 2 ? LT : DK, Math.round(cx + Math.cos(an) * 7.8), Math.round(cy + Math.sin(an) * 7.8)); } }
    for (const [cx, cy] of AA) { disk(x, DK, cx, cy, 7); ellS(x, o.body, cx, cy, 6.4, 6.4, 0.05); disk(x, '#26282c', cx, cy, 5); o.tub && o.tub(x, cx, cy); }
    // ---- marking: the cross stays where it was
    cross(x, 40, 104);
    // ---- stabiliser jacks, cable runs and ladders at the sides
    mirror(m => {
      for (const jy of [62, 78]) { const a = m ? 70 : 5; boxS(x, o.iron, a, jy, 5, 8, 0.08); sep(x, quad(a, jy, 5, 8), DK); rect(x, '#0a0a0c', X(7, m), jy + 3, 1, 2); px(x, '#98a8b8', X(6, m), jy + 1); }
      for (let j = 54; j < 62; j += 2) rect(x, '#0a0a0c', X(5, m), j, 4, 1);
      for (let k = 0; k < 8; k++) px(x, k % 2 ? '#34424e' : DK, X(22 + (k >> 1), m), 88 + k);        // cable run from the housing toward the main gun ring
    });
    // ---- lamps: cold white and cyan only (enemy shots are orange)
    mirror(m => { px(x, CW, X(26, m), 44); px(x, CY, X(26, m), 45); px(x, CY, X(26, m), 84); px(x, CW, X(26, m), 83); });
    // ---- pedestals under the search lights, which are drawn over this hull
    for (const [lx, ly] of LIGHTS) { disk(x, DK, lx, ly, 8); ellS(x, o.iron, lx, ly, 7, 7, 0.0); disk(x, '#26282c', lx, ly, 6); }
    // ---- keep exactly the old silhouette
    for (let j = 0; j < 150; j++) for (let i = 0; i < 80; i++) { const want = oAlpha(i, j); const d = x.getImageData(i + 1, j + 1 + (o.dy || 0), 1, 1).data[3]; if (want && d < 110) px(x, DK, i, j); else if (!want && d >= 110) x.clearRect(i, j, 1, 1); }
  }
}
function build(o) { return sprite(80, 150, x => drawCarriage(x, o)); }
// A: steel carriage with armour plates and hazard stripes
const A = build({
  iron: IRON, body: RP.grey, rim: '#c4c9ce',
  surface(x) {
    for (let j = 31; j < 120; j++) for (let i = 4; i < 77; i++) if (inP(i, j)) {
      if ((j - 30) % 18 === 0 || (i - 4) % 24 === 0) px(x, '#33373d', i, j);
      else if ((j - 30) % 18 === 1 || (i - 4) % 24 === 1) px(x, '#9aa1a8', i, j);
      else if (((i - 4) % 24 === 3 || (i - 4) % 24 === 21) && (j - 30) % 6 === 3) px(x, '#1d2024', i, j);
    }
    hazard(x, 8, 32, 64, 2, LT, DK); hazard(x, 8, 116, 64, 2, LT, DK);
  },
  housing(x) {
    const hs = quad(24, 42, 32, 44); boxS(x, IRON, 24, 42, 32, 44, 0.18); sep(x, hs, DK);
    boxS(x, IRON, 27, 45, 26, 38, 0.1); sep(x, quad(27, 45, 26, 38), '#0a0a0c');
    mirror(m => { for (let j = 48; j < 80; j += 4) { rect(x, '#0a0a0c', m ? 48 : 28, j, 4, 1); px(x, '#4a535a', m ? 48 : 28, j + 1); } boxS(x, RP.grey, m ? 46 : 28, 44, 6, 4, 0.3); rect(x, '#24486a', X(30, m), 46, 3, 1); px(x, CW, X(30, m), 46); });
    rect(x, DK, 31, 78, 18, 5); for (let i = 31; i < 49; i += 3) px(x, '#6f767e', i, 79);
    return hs;
  },
});
// B: night splinter camouflage
const OB = ({
  iron: ['#10141a', '#1c242c', '#2c3640', '#444f5a', '#66727e'], body: ['#14180f', '#232a1a', '#343c26', '#4a5334', '#656e48'], rim: '#8a9468',
  surface(x) {
    for (let j = 31; j < 120; j++) for (let i = 4; i < 77; i++) if (inP(i, j)) {
      const cx = Math.floor(i / 17), cy = Math.floor(j / 15), h = hash(cx + 3, cy + 5), s = h > 0.5 ? 1 : -1;
      const a = Math.floor((i * 0.9 * s + j * 0.43) / 6 + h * 8), k = ((a % 3) + 3) % 3;
      const c = k === 0 ? '#14180f' : k === 1 ? '#2a3120' : '#434b2e'; px(x, pick(['#0e1109', '#1b2114', c, '#4a5334', '#656e48'], k === 0 ? 0.08 : k === 1 ? 0.32 : 0.56, i, j), i, j);
      if (k === 2 && (j + i) % 29 === 0) px(x, '#7a845a', i, j);
    }
    for (let j = 33; j < 118; j += 21) for (let i = 8; i < 73; i += 4) if (inP(i, j)) px(x, '#0a0c07', i, j);
  },
  housing(x) {
    const hs = quad(24, 42, 32, 44); boxS(x, ['#10141a', '#1c242c', '#2c3640', '#444f5a', '#66727e'], 24, 42, 32, 44, 0.05); sep(x, hs, '#07090b');
    for (let j = 44; j < 84; j += 3) rect(x, 'rgba(0,0,0,0.4)', 26, j, 28, 1);
    mirror(m => { boxS(x, ['#10141a', '#1c242c', '#2c3640', '#444f5a', '#66727e'], m ? 47 : 27, 45, 6, 6, 0.2); sep(x, quad(m ? 47 : 27, 45, 6, 6), '#07090b'); px(x, CW, X(29, m), 47); });
    rect(x, '#a82a26', 39, 44, 3, 2); px(x, '#f48a60', 40, 44);   // red beacon
    return hs;
  },
  tub(x, cx, cy) { for (let k = 0; k < 10; k++) { const an = k * TAU / 10; px(x, k % 2 ? '#4a5334' : '#2a3120', Math.round(cx + Math.cos(an) * 5.2), Math.round(cy + Math.sin(an) * 5.2)); } },
});
const B = build(OB);

// C: casemate, a sloped armoured roof with shutters and sandbags
const C = build({
  iron: IRON, body: RP.conc.slice(0, 5), rim: '#d6d8dc',
  surface(x) {
    for (let j = 31; j < 120; j++) for (let i = 4; i < 77; i++) if (inP(i, j)) {
      if (hash(i >> 2, j >> 2) > 0.74) px(x, pick(RP.conc, 0.3, i, j), i, j);
      if ((j - 30) % 30 === 0) px(x, '#2e3034', i, j);
    }
    for (let j = 33; j < 118; j += 4) mirror(m => { for (let i = 6; i < 14; i += 2) px(x, 'rgba(0,0,0,0.35)', X(i, m), j); });
  },
  housing(x) {
    const roof = [[22, 46], [58, 46], [62, 52], [62, 80], [58, 86], [22, 86], [18, 80], [18, 52]];
    polyS(x, RP.conc, roof, 0.1, 0.4); sep(x, roof, DK);
    const slab = [[26, 50], [54, 50], [54, 82], [26, 82]]; polyS(x, IRON, slab, 0.12, 0.3); sep(x, slab, '#0a0a0c');
    for (const sx of [26, 51]) for (let j = 54; j < 80; j += 4) { rect(x, '#0a0a0c', sx, j, 3, 2); px(x, '#6a7c8a', sx, j); }
    for (let k = 0; k < 14; k++) { const an = k * TAU / 14; px(x, k % 2 ? '#b8a878' : '#8a7448', Math.round(40 + Math.cos(an) * 24), Math.round(66 + Math.sin(an) * 22)); }
    return roof;
  },
  tub(x, cx, cy) { for (let k = 0; k < 12; k++) { const an = k * TAU / 12 + 0.2; px(x, k % 2 ? '#b8a878' : '#8a7448', Math.round(cx + Math.cos(an) * 5.6), Math.round(cy + Math.sin(an) * 5.6)); } },
});

// ---------- lengthened carriages: the old carriage keeps its coordinates (parts, barrel, turrets); length is added behind it (north) ----------
const IB = ['#10141a', '#1c242c', '#2c3640', '#444f5a', '#66727e'];
const camoAt = (i, j) => { const cx = Math.floor(i / 17), cy = Math.floor(j / 15), h = hash(cx + 3, cy + 5), s = h > 0.5 ? 1 : -1, a = Math.floor((i * 0.9 * s + j * 0.43) / 6 + h * 8), k = ((a % 3) + 3) % 3; return pick(['#0e1109', '#1b2114', '#2a3120', '#4a5334', '#656e48'], k === 0 ? 0.08 : k === 1 ? 0.32 : 0.56, i, j); };
const camoRect = (x, a, b, w, h) => { for (let j = b; j < b + h; j++) for (let i = a; i < a + w; i++) px(x, camoAt(i, j), i, j); };
const axles = (x, y0, n, st) => { for (let k = 0; k < n; k++) { const yy = y0 + k * st; for (const ax of [18, 60]) { rect(x, '#0a0a0c', ax, yy, 2, 5); px(x, '#6a7c8a', ax + (ax < 40 ? 0 : 1), yy); } rect(x, '#0a0a0c', 22, yy + 2, 36, 1); px(x, '#444f5a', 22, yy + 2); } };
const buffers = (x, y) => { for (const bx of [27, 53]) { disk(x, DK, bx, y, 3); ellS(x, IB, bx, y, 2.4, 2.4, 0.15); px(x, '#98a8b8', bx - 1, y - 1); } };
const gangway = (x, a, b) => { for (let j = a; j < b; j++) rect(x, j % 2 ? '#2c3640' : '#0a0a0c', 33, j, 14, 1); rect(x, DK, 32, a, 1, b - a); rect(x, DK, 47, a, 1, b - a); };
const slab = (x, a, b, w, h, bias = 0.15) => { boxS(x, IB, a, b, w, h, bias); sep(x, quad(a, b, w, h), '#07090b'); };
function extAmmo(x, R) { // armoured ammunition tender
  const y0 = 4, y1 = R - 12; camoRect(x, 20, y0, 40, y1 - y0); sep(x, quad(20, y0, 40, y1 - y0), '#07090b');
  for (let k = 0; k < 3; k++) { const py = y0 + 5 + k * 21; slab(x, 25, py, 30, 18); rect(x, DK, 38, py + 8, 4, 2); }
  rect(x, '#07090b', 27, y0 + 7, 26, 14); for (let r = 0; r < 3; r++) for (const cx of [31, 37, 43, 49]) { disk(x, '#0a0a0c', cx, y0 + 10 + r * 4, 1); px(x, '#98a8b8', cx, y0 + 10 + r * 4); } // open hatch: shell noses
  rect(x, '#98a8b8', 22, y0 + 33, 12, 1); disk(x, DK, 22, y0 + 33, 2); px(x, '#98a8b8', 21, y0 + 32);   // ammunition hoist boom
  hazard2(x, 20, y0 + 1, 40, 2);
  axles(x, y0 + 3, 2, 7); axles(x, y1 - 17, 2, 7);
  mirror(m => { px(x, CW, X(23, m), y0 + 3); px(x, CY, X(23, m), y1 - 4); });
  buffers(x, y0 + 1); gangway(x, y1, R + 3); buffers(x, y1 + 3);
}
function hazard2(x, a, b, w, h) { for (let j = b; j < b + h; j++) for (let i = a; i < a + w; i++) px(x, ((i + j) >> 1) % 2 ? LT : DK, i, j); }
function extFrame(x, R) { // open girder frame to a counterweight bogie: the ground shows through
  const yb = 4;
  for (const gx of [8, 66]) { for (let j = yb + 20; j < R + 31; j++) { for (let i = gx; i < gx + 6; i++) px(x, i === gx ? '#66727e' : i === gx + 5 ? '#1c242c' : '#2c3640', i, j); if ((j - yb) % 7 === 0) rect(x, '#07090b', gx, j, 6, 1); } rect(x, DK, gx - 1, yb + 20, 1, R + 11 - yb - 20); rect(x, DK, gx + 6, yb + 20, 1, R + 11 - yb - 20); }
  for (const cy of [yb + 22, yb + 38, R + 18]) { slab(x, 14, cy, 52, 5, 0.1); rect(x, DK, 14, cy + 2, 52, 1); }
  for (let k = 0; k < 9; k++) { const yy = yb + 28 + k * 4; if (yy < R + 16) for (let t = 0; t < 4; t++) px(x, '#1c242c', 14 + t, yy + t % 2); }   // diagonal bracing, left
  slab(x, 35, yb + 24, 10, R - 8 - yb - 18, 0.1); for (let j = yb + 26; j < R - 6; j += 4) rect(x, '#07090b', 35, j, 10, 1);   // central draw bar
  camoRect(x, 20, yb, 40, 26); sep(x, quad(20, yb, 40, 26), '#07090b');
  for (let k = 0; k < 4; k++) { slab(x, 24 + k * 8, yb + 3, 7, 20, 0.2); hazard2(x, 24 + k * 8, yb + 3, 7, 2); } // counterweight blocks
  axles(x, yb + 3, 3, 8); buffers(x, yb + 1);
  mirror(m => { for (const q of [yb + 28, R + 6]) { slab(x, X(15, m) - (m ? 2 : 0), q, 3, 7, 0.25); px(x, CW, X(16, m), q + 1); } });
}
function extLoco(x, R) { // pusher locomotive: hood with fans and stacks, glazed cab next to the gun carriage
  const y0 = 4, hy = y0, hh = 46, cy = y0 + hh + 2, ch = R - 14 - cy;
  camoRect(x, 20, y0, 40, R - 14 - y0); sep(x, quad(20, y0, 40, R - 14 - y0), '#07090b');
  slab(x, 24, hy + 2, 32, hh - 2, 0.12);
  for (let k = 0; k < 3; k++) { const fy = hy + 9 + k * 14; disk(x, DK, 40, fy, 6); ellS(x, IB, 40, fy, 5.4, 5.4, 0.2); disk(x, '#0a0a0c', 40, fy, 4); for (let a = 0; a < 4; a++) { const an = a * TAU / 8 + 0.4; for (let r = 1; r < 4; r++) px(x, '#444f5a', Math.round(40 + Math.cos(an) * r), Math.round(fy + Math.sin(an) * r)), px(x, '#444f5a', Math.round(40 - Math.cos(an) * r), Math.round(fy - Math.sin(an) * r)); } }
  mirror(m => { for (let j = hy + 4; j < hy + hh - 2; j += 3) px(x, '#444f5a', X(22, m), j); for (const sy of [hy + 6, hy + 22]) { disk(x, DK, X(28, m), sy, 2); px(x, '#66727e', X(27, m), sy - 1); } });
  slab(x, 22, cy, 36, ch, 0.18);                                   // cab
  rect(x, '#24486a', 26, cy + ch - 5, 28, 2); for (const gx of [28, 41, 51]) px(x, CW, gx, cy + ch - 5); rect(x, DK, 39, cy + ch - 5, 2, 2);
  mirror(m => { rect(x, '#24486a', X(23, m) - (m ? 0 : 0), cy + 4, 1, ch - 10); px(x, CW, X(23, m), cy + 5); });
  disk(x, '#3a3a40', 40, cy + 5, 2); px(x, CW, 40, cy + 5);       // roof lamp
  axles(x, y0 + 4, 2, 8); axles(x, cy + 2, 2, 8);
  buffers(x, y0 + 1); gangway(x, R - 14, R + 3); buffers(x, R - 12);
}
function buildLong(R, fn) {
  return sprite(80, 150 + R, x => { x.save(); x.translate(0, R); drawCarriage(x, Object.assign({ dy: R }, OB)); x.restore(); fn(x, R); });
}

const L1 = buildLong(84, extAmmo), L2 = buildLong(64, extFrame), L3 = buildLong(100, extLoco);
const out = { R: { L1: 84, L2: 64, L3: 100 } };
const sets = { cur: orig, B, L1, L2, L3 };
for (const k in sets) out[k] = sets[k].c.toDataURL();
out.main = SPR.bMain[4].c.toDataURL(); out.aa = SPR.bAA[4].c.toDataURL(); out.light = SPR.searchBase.c.toDataURL(); out.barrel = SPR.rgBarrel[4].c.toDataURL();
out.dims = { L1: [L1.c.width, L1.c.height], L2: [L2.c.width, L2.c.height], L3: [L3.c.width, L3.c.height] };
return out;
})()
