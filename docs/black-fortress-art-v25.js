// Black Fortress hull art (Enigma Run level 6 boss), drawn with the game's own sprite toolkit. The old drawing is the base (same shapes, same shading, its stray seam pixels removed), recoloured by tone and given detail
// where the structure carries it. A (gunmetal bomber, the old palette finished) is the one baked into the Enigma art set as 'skyfort' (index.html, <script id="enigmaArt">); B (bone armour) and C (raven) stay as
// alternatives. Same 204 x 144 size and centre as SPR.skyfort, so the parts, the tilt, the scaling and the breakup are untouched. Run it inside the game (a local build: __sf(code)); it returns data: URLs.
// More airframes (manta, dart, citadel, bat, zeppelin, carrier) were drawn as a study and are not in the game.
(() => {
// Black Fortress, second pass: the old drawing as the base (same shapes, same shading), its stray seam pixels removed, recoloured by tone, then detail added
// where the structure carries it. 204 x 144, prow to the south, engine flames leave from the south end of each nacelle.
const W = 204, H = 144, CX = 102;
const px = (x, c, i, j) => { x.fillStyle = c; x.fillRect(i, j, 1, 1); };
const DK = '#0a0a0e', LT = '#d8d6cc', CW = '#d8f2ff', CY = '#8cc0e0';
const DSTEEL = ['#0c0d10', '#16181d', '#22252c', '#323640', '#474c58', '#62687a'];
const WING = [[2, 74], [30, 82], [70, 90], [134, 90], [174, 82], [202, 74], [204, 62], [192, 66], [186, 50], [172, 58], [164, 44], [150, 54], [138, 42], [66, 42], [54, 54], [40, 44], [32, 58], [18, 50], [12, 66], [0, 62]];
const STAB = [[56, 2], [148, 2], [142, 12], [62, 12]], TIPL = [[60, 0], [70, 0], [69, 6]], TIPR = [[134, 0], [144, 0], [135, 6]], PROW = [[84, 118], [120, 118], [114, 138], [102, 144], [90, 138]];
const CLAWL = [[76, 90], [82, 102], [86, 90]], CLAWR = [[118, 90], [122, 102], [128, 90]];
const NAC = [[62, 82], [142, 82], [26, 86], [178, 86]], RINGS = [[80, 44, 9], [124, 44, 9], [46, 70, 5], [158, 70, 5], [14, 74, 5], [190, 74, 5]];
// ---- the clean silhouette: only the old shapes
const M = new Uint8Array(W * H);
const set = (i, j) => { if (i >= 0 && j >= 0 && i < W && j < H) M[j * W + i] = 1; };
const boxM = (a, b, w, h) => { for (let j = b; j < b + h; j++) for (let i = a; i < a + w; i++) set(i, j); };
const polyM = pts => { let bx = 1e9, by = 1e9, bx2 = -1e9, by2 = -1e9; for (const [a, b] of pts) { bx = Math.min(bx, a); by = Math.min(by, b); bx2 = Math.max(bx2, a); by2 = Math.max(by2, b); } for (let j = Math.floor(by); j < Math.ceil(by2); j++) for (let i = Math.floor(bx); i < Math.ceil(bx2); i++) if (pip(pts, i + 0.5, j + 0.5)) set(i, j); };
const ellM = (cx, cy, rx, ry) => { for (let j = Math.floor(cy - ry); j <= Math.ceil(cy + ry); j++) for (let i = Math.floor(cx - rx); i <= Math.ceil(cx + rx); i++) { const dx = (i + 0.5 - cx) / rx, dy = (j + 0.5 - cy) / ry; if (dx * dx + dy * dy <= 1) set(i, j); } };
const diskM = (cx, cy, r) => { for (let dy = -r; dy <= r; dy++) { const w = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy + r * 0.6))); for (let xx = Math.round(cx) - w; xx <= Math.round(cx) + w; xx++) set(xx, Math.round(cy) + dy); } };
boxM(64, 6, 10, 56); boxM(130, 6, 10, 56); polyM(STAB); polyM(TIPL); polyM(TIPR); polyM(WING); for (const [a, b] of NAC) ellM(a, b, 7.5, 17); ellM(102, 74, 25, 68); for (const [a, b, r] of RINGS) diskM(a, b, r + 1); boxM(90, 106, 24, 16); polyM(PROW); polyM(CLAWL); polyM(CLAWR);
const inM = (i, j) => i >= 0 && j >= 0 && i < W && j < H && M[j * W + i] === 1;
const inHull = (i, j) => { const dx = (i + 0.5 - 102) / 25, dy = (j + 0.5 - 74) / 68; return dx * dx + dy * dy <= 1; };
const inWing = (i, j) => pip(WING, i + 0.5, j + 0.5);
const inNac = (i, j) => NAC.some(([a, b]) => { const dx = (i + 0.5 - a) / 8.5, dy = (j + 0.5 - b) / 18; return dx * dx + dy * dy <= 1; });
const inRing = (i, j) => RINGS.some(([a, b, r]) => Math.hypot(i + 0.5 - a, j + 0.5 - b) <= r + 1.8);
const onWing = (i, j) => inWing(i, j) && !inNac(i, j) && !inRing(i, j) && !(i > 36 && i < 50 && j > 56 && j < 68) && !(i > 154 && i < 168 && j > 56 && j < 68); // bare wing surface: not under a nacelle, ring or cross
const mirror = f => { f(false); f(true); };
const X = (i, m) => m ? 203 - i : i;

// ---- the old drawing, as it was, except that its seam lines stay on the hull
function drawOriginal(x) {
  boxS(x, DSTEEL, 64, 6, 10, 56, 0.05); boxS(x, DSTEEL, 130, 6, 10, 56, 0.05);
  polyS(x, DSTEEL, STAB, 0, 0.4);
  polyS(x, DSTEEL, TIPL, 0.2, 0.3); polyS(x, DSTEEL, TIPR, 0.2, 0.3);
  polyS(x, DSTEEL, WING, 0.02, 0.45);
  for (let j = 0; j < 144; j++) for (let i = 0; i < 204; i++) {
    if (!pip(WING, i + 0.5, j + 0.5)) continue;
    if (!pip(WING, i + 0.5, j + 2.5)) rect(x, '#7a1414', i, j, 1, 1);
    else if (((i * 3 + j * 7) % 23 === 0) && hash(i, j) < 0.6) rect(x, DSTEEL[1], i, j, 1, 1);
  }
  for (let k = 0; k < 6; k++) rect(x, 'rgba(0,0,0,0.35)', 20 + k * 28, 60, 1, 18);
  for (const [a, b] of NAC) { ellS(x, DSTEEL, a, b, 7.5, 17, 0.06); rect(x, '#3a0a0a', a - 3, b - 17, 6, 3); }
  ellS(x, DSTEEL, 102, 74, 25, 68, 0.06);
  for (let j = 16; j < 134; j += 8) { for (let i = 80; i < 124; i++) if (inHull(i, j)) rect(x, 'rgba(0,0,0,0.45)', i, j, 1, 1); rect(x, DSTEEL[4], 101, j + 2, 2, 4); }
  for (const sx of [86, 116]) for (let j = 22; j < 128; j += 6) rect(x, DSTEEL[0], sx, j, 2, 2);
  for (const [a, b, r] of RINGS) { disk(x, '#000000', a, b, r + 1); disk(x, DSTEEL[1], a, b, r); }
  boxS(x, DSTEEL, 90, 106, 24, 16, -0.12); for (let i = 92; i < 112; i += 4) rect(x, '#050506', i, 108, 2, 12);
  polyS(x, DSTEEL, PROW, 0.12, 0.5);
  rect(x, '#2a0606', 90, 125, 24, 6); ellS(x, ['#3a0808', '#7a1010', '#c02020', '#ff4a3a', '#ffb0a0'], 102, 128, 10, 2.6, 0.2);
  polyS(x, DSTEEL, CLAWL, 0.1, 0.3); polyS(x, DSTEEL, CLAWR, 0.1, 0.3);
  cross(x, 42, 62); cross(x, 162, 62);
}
// ---- tone mapping: every pixel of the old steel ramp moves to the same step of the concept's ramp
function remap(x, o) {
  const im = x.getImageData(1, 1, W, H), d = im.data, src = DSTEEL.map(hexRGB);
  for (let k = 0; k < d.length; k += 4) {
    if (d[k + 3] < 110) continue;
    let bi = -1, bd = 1e9; src.forEach((c, n) => { const e = (c[0] - d[k]) ** 2 + (c[1] - d[k + 1]) ** 2 + (c[2] - d[k + 2]) ** 2; if (e < bd) { bd = e; bi = n; } });
    if (bd < 500) { const c = hexRGB(o.ramp[bi]); d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; }
    else if (d[k] === 122 && d[k + 1] === 20 && d[k + 2] === 20) { const c = hexRGB(o.edge); d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; }
  }
  x.putImageData(im, 1, 1);
}
const quad = (a, b, w, h) => [[a, b], [a + w, b], [a + w, b + h], [a, b + h]];
function details(x, o) {
  // twin tail booms and stabiliser: panel seams, rivets, hinge, lights
  for (const bx of [64, 130]) for (let j = 14; j < 60; j += 8) { rect(x, 'rgba(0,0,0,0.4)', bx, j, 10, 1); px(x, o.light, bx + 1, j + 3); px(x, o.light, bx + 8, j + 3); }
  rect(x, 'rgba(0,0,0,0.5)', 60, 8, 86, 1); for (let i = 62; i < 146; i += 6) px(x, o.light, i, 4);
  px(x, CW, 63, 1); px(x, CW, 140, 1);
  // wing: lit leading edge, dashed flap hinge parallel to the trailing edge, rivets on the ribs
  for (let i = 0; i < W; i++) { let top = -1, bot = -1; for (let j = 0; j < H; j++) if (inWing(i, j)) { if (top < 0) top = j; bot = j; }
    if (top >= 0 && top > 36) px(x, o.rim, i, top + 1);
    if (bot >= 0 && i > 3 && i < 200 && (i % 4 !== 0) && Math.abs(i - CX) > 34 && onWing(i, bot - 5)) px(x, 'rgba(0,0,0,0.5)', i, bot - 5); }
  for (let k = 0; k < 6; k++) for (const i of [20 + k * 28]) for (let j = 62; j < 78; j += 4) if (inWing(i, j)) px(x, o.light, i + 1, j);
  o.wing && o.wing(x);
  // nacelles: intake with blades at the north end, exhaust nozzle at the south end (that is where the flames leave)
  for (const [a, b] of NAC) {
    rect(x, o.rim, a - 3, b - 18, 6, 1); for (const gx of [a - 2, a, a + 2]) px(x, o.blade, gx, b - 16); rect(x, 'rgba(0,0,0,0.4)', a - 6, b - 13, 12, 1);   // intake: lit lip and grille over the old dark slot
    rect(x, 'rgba(0,0,0,0.4)', a - 6, b - 5, 12, 1); rect(x, 'rgba(0,0,0,0.4)', a - 6, b + 5, 12, 1);
    ellS(x, ['#1a0606', '#3a0a0a', '#5a1010'], a, b + 14.5, 5, 2.4, 0.1); disk(x, '#050506', a, b + 14, 2); px(x, o.nozzleGlow, a - 1, b + 14); px(x, o.nozzleGlow, a, b + 14);
    px(x, o.light, a - 5, b - 2); px(x, o.light, a - 5, b - 1); px(x, o.light, a - 5, b + 8);
  }
  // hull: panel seams down both sides, a command blister with glass, vent slits
  for (const sx of [93, 111]) for (let j = 14; j < 136; j++) if (inHull(sx, j) && j % 3 !== 0) px(x, 'rgba(0,0,0,0.35)', sx, j);
  for (let j = 18; j < 132; j += 8) for (const sx of [89, 115]) if (inHull(sx, j)) px(x, o.light, sx, j + 1);
  disk(x, DK, 102, 96, 5); ellS(x, o.ramp, 102, 96, 7, 4.6, 0.12); rect(x, '#142436', 97, 95, 10, 2); for (const gx of [98, 102, 105]) px(x, CW, gx, 95); px(x, CY, 100, 96);
  mirror(m => { for (let k = 0; k < 4; k++) rect(x, '#050506', X(88, m) - (m ? 3 : 0), 78 + k * 3, 4, 1); });
  // turret collars: dashes on the rim (inside the old size)
  for (const [a, b, r] of RINGS) for (let k = 0; k < Math.round(r * 2.4); k++) { const an = k * TAU / Math.round(r * 2.4); px(x, k % 2 ? o.dash : DK, Math.round(a + Math.cos(an) * (r - 0.3)), Math.round(b + Math.sin(an) * (r - 0.3))); }
  // bomb bay: hazard bands on both edges, door seam
  for (let i = 90; i < 114; i++) { px(x, (i >> 1) % 2 ? LT : DK, i, 106); px(x, ((i + 1) >> 1) % 2 ? LT : DK, i, 121); }
  rect(x, 'rgba(0,0,0,0.6)', 101, 107, 2, 14);
  // prow: layered armour, framed eye
  for (let k = 0; k < 3; k++) for (let i = 0; i < 10 - k * 3; i++) { px(x, 'rgba(0,0,0,0.4)', 102 - i, 132 + k * 2 + (i >> 1)); px(x, 'rgba(0,0,0,0.4)', 101 + i, 132 + k * 2 + (i >> 1)); }
  rect(x, DK, 89, 124, 26, 1); rect(x, DK, 89, 131, 26, 1);
  o.hull && o.hull(x);
}
function build(o) {
  return sprite(W, H, x => {
    drawOriginal(x); remap(x, o); details(x, o);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const d = x.getImageData(i + 1, j + 1, 1, 1).data[3]; if (inM(i, j) && d < 110) px(x, DK, i, j); else if (!inM(i, j) && d >= 110) x.clearRect(i, j, 1, 1); }
  });
}
// A: the original palette, finished
const A = { ramp: DSTEEL, edge: '#7a1414', light: '#62687a', rim: '#62687a', blade: '#62687a', dash: '#62687a', nozzleGlow: '#7a1414' };
// B: bone ceramic: the same tones, white; seams between plates
const BN = ['#2a2c32', '#5a5c66', '#8c8e98', '#b8bac4', '#e2e4ea', '#fafbfd'];
const B = { ramp: BN, edge: '#7a1414', light: '#fafbfd', rim: '#fafbfd', blade: '#8c8e98', dash: '#16181d', nozzleGlow: '#c02020',
  wing(x) { for (let j = 42; j < 92; j++) for (let i = 0; i < W; i++) if (onWing(i, j) && Math.abs(i - CX) > 30) { const row = Math.floor(j / 9), cu = (i + (row % 2) * 7) % 14; if ((cu === 0 && j % 9 !== 0) || (j % 9 === 0 && cu < 12)) px(x, '#2a2c32', i, j); } },
  hull(x) { for (let j = 14; j < 134; j += 8) for (let i = 80; i < 124; i++) if (inHull(i, j + 4) && (i + j) % 2 === 0 && Math.abs(i - 102) > 3) px(x, '#2a2c32', i, j + 4); } };
// C: raven: the same tones, violet; scalloped coverts on the wing, violet light on the seams
const RV = ['#0a0812', '#14102a', '#201a40', '#322a5a', '#4a3e7a', '#6a5aa0'];
const C = { ramp: RV, edge: '#563aa4', light: '#bba4ff', rim: '#8466dc', blade: '#8466dc', dash: '#bba4ff', nozzleGlow: '#8466dc',
  wing(x) { for (let j = 44; j < 92; j++) for (let i = 0; i < W; i++) if (onWing(i, j) && Math.abs(i - CX) > 30) { const row = Math.floor((j - 44) / 6), u = (i + (row % 2) * 4) % 8, v = (j - 44) % 6, sc = u < 4 ? u * 0.5 : (7 - u) * 0.5; if (v >= 4 + sc) px(x, '#0a0812', i, j); else if (v === 0 && u > 0 && u < 7) px(x, '#4a3e7a', i, j); } },
  hull(x) { for (let j = 20; j < 126; j += 16) { px(x, '#8466dc', 100, j); px(x, '#8466dc', 103, j); } } };
const sets = { cur: SPR.skyfort, A: build(A), B: build(B), C: build(C) }, out = {};
for (const k in sets) out[k] = sets[k].c.toDataURL();
out.main = SPR.bMain[4].c.toDataURL(); out.aa = SPR.bAA[4].c.toDataURL();
const a0 = SPR.skyfort.c.getContext('2d').getImageData(0, 0, W + 2, H + 2).data; out.sil = {}; out.stray = {};
for (const k of ['A', 'B', 'C']) { const a1 = sets[k].c.getContext('2d').getImageData(0, 0, W + 2, H + 2).data; let d = 0, e = 0; for (let n = 3; n < a0.length; n += 4) { const p = a0[n] > 0, q = a1[n] > 0; if (p !== q) d++; if (p && !q) e++; } out.sil[k] = d; out.stray[k] = e; }
// ratio of old to new pixel counts as a sanity check
let c0 = 0, c1 = 0; const a1 = sets.A.c.getContext('2d').getImageData(0, 0, W + 2, H + 2).data; for (let n = 3; n < a0.length; n += 4) { if (a0[n] > 0) c0++; if (a1[n] > 0) c1++; } out.counts = [c0, c1];
return out;
})()
