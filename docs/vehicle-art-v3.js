/* Vehicle art v3: the clean style for every vehicle except the tanks (proposal, not wired into the game).
   Load docs/tank-art-v3.js first: this file reuses its renderer (shapes drawn at 6x, reduced by averaging, snapped to a small palette, light fixed at
   the top left of the screen) and its shapes helpers. Style rules are in docs/tank-art-style.md.
   Each vehicle is a draw function in local coordinates: origin at the sprite centre, +y is the way the original art faces (south, towards the bottom).
   Sizes match the originals (plus the game's own 1 px outline), so every sprite drops in where the old one was drawn.
   makeVehiclesV3() returns plain sprite objects ({c, f, k, w, h}) for the fixed ones and arrays of 16 headings for the ones the game rotates. */

const VEH_V3 = {
  iron: ['#141618', '#24282c', '#3a4046', '#565e66', '#7c858e'],
  wood: ['#2e1c12', '#4a2e1c', '#6a4428', '#8a5c38', '#a87850'],
  locoRed: ['#2a0c0a', '#4a1612', '#6a221a', '#8a3226', '#a84434'],
  ammo: ['#3a0e0a', '#5e1810', '#8a2618', '#b0382a', '#cc5a48'],
  brass: ['#5a4010', '#8a6418', '#c09030', '#e8c060'],
  diesel: ['#1e2418', '#30382a', '#4a5440', '#66725a', '#8a9878'],
  sub: ['#141a20', '#222c36', '#34424e', '#4a5a68', '#6a7c8a'],
  sower: ['#1c1f24', '#30343a', '#4a4e50', '#686a64', '#8a8878', '#aaa690', '#c6c2aa'],
  fuel: ['#2a2014', '#3e3020', '#5a4630', '#6e5a40', '#8a7656']
};
const tnV3 = (r, soft) => { const q = i => r[Math.min(i, r.length - 1)]; return r.length > 6 ? [r[1], r[3], r[5], r[6]] : soft ? [q(1), q(2), q(3), q(4)] : [q(1), q(3), q(4), q(4)]; };

function rasterWH(dw, dh, ang, palette, draw) {
  const SS = TANK_V3.SS, NW = dw * SS, NH = dh * SS, [big, x] = mk(NW, NH);
  x.setTransform(SS, 0, 0, SS, NW / 2, NH / 2); const base = x.getTransform();
  x.rotate(ang); x.lineJoin = 'round'; x.lineCap = 'round';
  draw(x, base);
  const src = x.getImageData(0, 0, NW, NH).data, [c, y] = mk(dw, dh), out = y.createImageData(dw, dh), pal = palette.map(hexRGB);
  for (let j = 0; j < dh; j++) for (let i = 0; i < dw; i++) {
    let r = 0, g = 0, b = 0, a = 0, q2 = 0;
    for (let v = 0; v < SS; v++) for (let u = 0; u < SS; u++) { const k = ((j * SS + v) * NW + i * SS + u) * 4, al = src[k + 3]; if (al) { r += src[k] * al; g += src[k + 1] * al; b += src[k + 2] * al; a += al; q2 += (src[k] * src[k] + src[k + 1] * src[k + 1] + src[k + 2] * src[k + 2]) * al; } }
    if (a < 255 * SS * SS * 0.5) continue;
    r /= a; g /= a; b /= a;
    if (TANK_V3.dither && a > 255 * SS * SS * 0.98 && Math.sqrt(Math.max(0, q2 / a - (r * r + g * g + b * b))) < 16) { const o = ditherV3(r, g, b, i, j); if (o) { const k = (j * dw + i) * 4; out.data[k] = o[0]; out.data[k + 1] = o[1]; out.data[k + 2] = o[2]; out.data[k + 3] = 255; continue; } }
    let best = 0, bd = 1e9;
    for (let p = 0; p < pal.length; p++) { const dr = pal[p][0] - r, dg = pal[p][1] - g, db = pal[p][2] - b, dd = dr * dr * 0.9 + dg * dg * 1.2 + db * db * 0.8; if (dd < bd) { bd = dd; best = p; } }
    const o = (j * dw + i) * 4; out.data[o] = pal[best][0]; out.data[o + 1] = pal[best][1]; out.data[o + 2] = pal[best][2]; out.data[o + 3] = 255;
  }
  y.putImageData(out, 0, 0); outline(c, OUT); return finalize(c);
}
function palV3(...ramps) { return [].concat(...ramps, TANK_V3.metal, TANK_V3.track, TANK_V3.lamp, RP.glass, ['#fff0a0', '#ecebe2', '#d8503a', '#101012']); }

// small shared parts
function wheelV3(x, cx, cy, w, h) { const M = TANK_V3.metal; rrV3(x, cx - w / 2, cy - h / 2, w, h, Math.min(w, h) * 0.35); x.fillStyle = M[0]; x.fill(); x.fillStyle = TANK_V3.track[2]; x.fillRect(cx - w / 2 + 0.25, cy - h / 2 + 0.5, Math.min(0.6, w * 0.35), h - 1); }
function glassV3(x, X, Y, W, H) { const G = RP.glass; x.fillStyle = G[2]; x.fillRect(X, Y, W, H); x.fillStyle = G[4]; x.fillRect(X, Y, W * 0.45, Math.min(0.8, H * 0.5)); x.fillStyle = G[1]; x.fillRect(X, Y + H - 0.45, W, 0.45); }
function crossV3(x, cx, cy) { x.fillStyle = '#101012'; x.fillRect(cx - 3, cy - 1.45, 6, 2.9); x.fillRect(cx - 1.45, cy - 3, 2.9, 6); x.fillStyle = '#ecebe2'; x.fillRect(cx - 2.5, cy - 0.85, 5, 1.7); x.fillRect(cx - 0.85, cy - 2.5, 1.7, 5); }
function lampV3(x, cx, cy, r) { discV3(x, cx, cy, r, '#fff0a0'); }
function polyV3(x, pts) { x.beginPath(); pts.forEach(([a, b], i) => i ? x.lineTo(a, b) : x.moveTo(a, b)); x.closePath(); }
function lineV3(x, x0, y0, x1, y1, col, w) { x.strokeStyle = col; x.lineWidth = w; x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke(); }
function capsuleV3(x, cx, cy, rx, ry) { x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, 6.2832); }

/* ---------- road vehicles (rotated into 16 headings) ---------- */
function truckV3(x, base) {
  const F = RP.fg, O = RP.olive, M = TANK_V3.metal;
  for (const y of [-5, 4.6]) for (const sd of [-1, 1]) wheelV3(x, sd * 4.6, y, 1.6, 4);
  shadeV3(x, base, () => rrV3(x, -4, -10, 8, 13.4, 1), 0, -3, 9, tnV3(O), O[0]);
  x.fillStyle = O[1]; for (const y of [-7.4, -4.4, -1.4]) x.fillRect(-3.6, y, 7.2, 0.7);
  shadeV3(x, base, () => rrV3(x, -3, 3.4, 6, 6.6, 1.2), 0, 6.7, 4, tnV3(F), F[0]);
  glassV3(x, -2.1, 7.5, 4.2, 1.5); lampV3(x, -2.3, 9.6, 0.5); lampV3(x, 2.3, 9.6, 0.5);
  x.fillStyle = M[0]; x.fillRect(-4, -10.2, 8, 0.7);
}
function acarV3(x, base) {
  const F = RP.fg, M = TANK_V3.metal;
  for (const y of [-6.2, -0.4, 5.4]) for (const sd of [-1, 1]) wheelV3(x, sd * 5.3, y, 1.4, 3.4);
  shadeV3(x, base, () => polyV3(x, [[-4.4, -9.6], [4.4, -9.6], [4.9, -6], [4.9, 5], [3.2, 9.6], [-3.2, 9.6], [-4.9, 5], [-4.9, -6]]), 0, 0, 10, tnV3(F), F[0]);
  x.fillStyle = F[1]; x.fillRect(-4.9, 3.6, 9.8, 0.6);
  shadeV3(x, base, () => rrV3(x, -0.8, 1.6, 1.6, 5.6, 0.4), 0, 4.4, 3, [M[1], M[2], M[3], M[4]], M[0]);
  shadeV3(x, base, () => polyV3(x, [[-2.5, -2.8], [2.5, -2.8], [3.1, -0.8], [3.1, 1.2], [1.8, 2.8], [-1.8, 2.8], [-3.1, 1.2], [-3.1, -0.8]]), 0, 0, 3.4, tnV3(F), F[0]);
  discV3(x, -1.1, -1.3, 0.8, F[1]); crossV3(x, 0, -6.4);
  glassV3(x, -2, 6.6, 4, 0.9); lampV3(x, -3, 9.1, 0.5); lampV3(x, 3, 9.1, 0.5);
}
function motoV3(x, base) {
  const O = RP.fg, M = TANK_V3.metal;
  wheelV3(x, -1.6, 5.4, 1.4, 3.2); wheelV3(x, -1.6, -5.4, 1.4, 3.2); wheelV3(x, 4.9, 0.4, 1.3, 3.2);
  shadeV3(x, base, () => rrV3(x, 0.9, -3.2, 3.8, 8.4, 1.4), 2.8, 1, 5, tnV3(O), O[0]);
  shadeV3(x, base, () => rrV3(x, -2.9, -4.6, 2.6, 9.6, 1.1), -1.6, 0, 5, tnV3(O, true), O[0]);
  x.fillStyle = M[0]; x.fillRect(-4.2, 3.4, 5.2, 0.8);                                   // handlebars
  discV3(x, -1.6, -0.2, 1.7, RP.fg[3]); discV3(x, -1.6, -0.9, 1.1, RP.fg[4]);            // rider and helmet
  x.fillStyle = M[1]; x.fillRect(2.4, 3.4, 1.4, 1.2); lampV3(x, -1.6, 6.8, 0.5);
}
function staffV3(x, base) {
  const G = RP.grey, M = TANK_V3.metal;
  for (const y of [-3.5, 3.5]) for (const sd of [-1, 1]) wheelV3(x, sd * 3.5, y, 1.3, 2.6);
  shadeV3(x, base, () => rrV3(x, -3, -6, 6, 12, 1.2), 0, 0, 6, tnV3(G), G[0]);
  glassV3(x, -2, 1.6, 4, 1.6); x.fillStyle = G[1]; x.fillRect(-3, -1, 6, 0.5);
  lampV3(x, -2.1, 5.4, 0.45); lampV3(x, 2.1, 5.4, 0.45);
  x.fillStyle = '#d8503a'; x.fillRect(-2.7, 3.7, 0.6, 1.4);                              // a pennant on the wing
}
function ftruckV3(x, base) {
  const U = VEH_V3.fuel, F = RP.fg, Y = RP.yel, M = TANK_V3.metal;
  for (const y of [-7.5, -1.5, 7]) for (const sd of [-1, 1]) wheelV3(x, sd * 4.6, y, 1.6, 3.6);
  shadeV3(x, base, () => rrV3(x, -3.9, -10.6, 7.8, 14, 3.6), 0, -3.6, 8, tnV3(U), U[0]);
  x.fillStyle = Y[3]; x.fillRect(-3.9, -3.9, 7.8, 1.5); x.fillStyle = M[0]; x.fillRect(-3.9, -4.4, 7.8, 0.4); x.fillRect(-3.9, -2.4, 7.8, 0.4);   // hazard band
  discV3(x, 0, -8, 1.2, M[1]); discV3(x, -0.2, -8.2, 0.55, M[3]);
  shadeV3(x, base, () => rrV3(x, -3.2, 4.4, 6.4, 6.4, 1.1), 0, 7.6, 4, tnV3(F), F[0]);
  glassV3(x, -2.2, 8.3, 4.4, 1.4); lampV3(x, -2.4, 10.3, 0.5); lampV3(x, 2.4, 10.3, 0.5);
}

/* ---------- rail (fixed, facing south) ---------- */
function carWheelsV3(x, ys) { for (const y of ys) for (const sd of [-1, 1]) wheelV3(x, sd * 6.7, y, 1.4, 5); }
function locoV3(x, base) {
  // contrast kept close to the original: bright brass and window yellow, pure black separation lines, and the original's coal heap
  const I = VEH_V3.iron, R = VEH_V3.locoRed, B = VEH_V3.brass, M = TANK_V3.metal, K = '#0a0a0c', RR = RP.red;
  const hash = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
  const toneI = [I[2], I[3], I[4], '#b4bcc4'], toneR = [R[2], R[3], R[4], '#d4624c'];
  for (const y of [3, 9, 15]) for (const sd of [-1, 1]) { discV3(x, sd * 6.6, y, 2.4, K); discV3(x, sd * 6.6, y, 1.9, '#7a2218'); discV3(x, sd * 6.6, y, 1.05, '#e8583c'); discV3(x, sd * 6.6, y, 0.4, K); }
  for (const sd of [-1, 1]) lineV3(x, sd * 6.6, 3, sd * 6.6, 15, M[4], 0.7);
  for (const sd of [-1, 1]) for (const y of [-19.5, -12.5]) { x.fillStyle = '#5a1a14'; x.fillRect(sd * 6.9 - 0.7, y, 1.4, 3); }
  // tender with the coal heap: black and dark grey chunks, a few lit
  shadeV3(x, base, () => rrV3(x, -6, -21, 12, 12.4, 0.8), 0, -15, 7, toneI, K, 0.9);
  for (let i = -4; i < 4; i++) for (let j = -19; j < -11; j++) { const h = hash(i, j); x.fillStyle = h < 0.45 ? '#0c0c0e' : h < 0.85 ? '#26262a' : '#3c3c42'; x.fillRect(i, j, 1, 1); }
  // cab: bright red, a black roof line, windows in a black frame with bright yellow panes
  shadeV3(x, base, () => rrV3(x, -7, -8, 14, 8.4, 1), 0, -4, 6, toneR, K, 0.9);
  x.fillStyle = K; x.fillRect(-7, -5, 14, 0.8);
  for (const wx of [-4.8, 1.8]) { x.fillStyle = K; x.fillRect(wx - 0.4, -3.4, 3.8, 1.9); x.fillStyle = '#ffd84a'; x.fillRect(wx, -3, 3, 1.1); x.fillStyle = '#fff4b0'; x.fillRect(wx, -3, 1, 0.55); }
  // boiler: bright iron, light bands each under a black line, brass dome with a bright crown
  shadeV3(x, base, () => rrV3(x, -5.4, 1, 10.8, 17.2, 5), 0, 9, 8, toneI, K, 0.9);
  for (const y of [4.6, 9.6, 14.2]) { x.fillStyle = K; x.fillRect(-5.2, y + 0.7, 10.4, 0.5); x.fillStyle = M[4]; x.fillRect(-5.2, y, 10.4, 0.7); }
  shadeV3(x, base, () => { x.beginPath(); x.arc(0, 6, 2.2, 0, 6.2832); }, 0, 6, 2.4, [B[1], B[2], B[3], '#fff0a0'], K, 0.7);
  discV3(x, -0.5, 5.4, 0.6, '#fff4b0');
  discV3(x, 0, 11, 1.5, I[3]); discV3(x, 0, 11, 0.8, I[4]);
  discV3(x, 0, 16.2, 2.1, K); discV3(x, 0, 16.2, 1.0, M[2]);
  x.fillStyle = K; x.fillRect(-1.7, 17.9, 3.4, 1.9); x.fillStyle = '#fff0a0'; x.fillRect(-1.1, 18.2, 2.2, 1.1);
  shadeV3(x, base, () => polyV3(x, [[-5, 18.8], [5, 18.8], [0, 21]]), 0, 19.6, 3, [RR[2], RR[3], RR[4], RR[4]], K, 0.7);
}
function locoDV3(x, base) {
  const A = VEH_V3.diesel, M = TANK_V3.metal;
  for (const y of [-17, -10, 6, 13]) for (const sd of [-1, 1]) { discV3(x, sd * 6.6, y, 2.1, '#1a1a1e'); discV3(x, sd * 6.6, y, 0.8, '#7c858e'); }
  shadeV3(x, base, () => polyV3(x, [[-6, -20], [6, -20], [7, -16], [7, 14], [4, 20], [-4, 20], [-7, 14], [-7, -16]]), 0, 0, 20, tnV3(A, true), A[0]);
  x.fillStyle = M[3]; x.fillRect(-6.4, -17, 0.5, 30); x.fillRect(5.9, -17, 0.5, 30);                       // hand rails
  x.fillStyle = A[1]; for (const y of [-14.5, -2, 8]) x.fillRect(-6.4, y, 12.8, 0.6);                          // roof seams
  for (const y of [-12, 3]) { shadeV3(x, base, () => rrV3(x, -3.2, y, 6.4, 4.8, 0.6), 0, y + 2.4, 3, [M[0], M[1], M[2], M[3]], M[0]); x.fillStyle = M[0]; for (const gx of [-1.6, 0, 1.6]) x.fillRect(gx - 0.2, y + 0.8, 0.5, 3.2); }
  discV3(x, -3, -3.6, 1.1, M[0]); discV3(x, 3, -3.6, 1.1, M[0]);
  shadeV3(x, base, () => rrV3(x, -4.6, 10, 9.2, 6.6, 1.2), 0, 13, 5, tnV3(A), A[0]);
  glassV3(x, -3.4, 14, 6.8, 1.5); lampV3(x, 0, 18.2, 0.8);
}
function boxcarV3(x, base) {
  // close to the original: an even, bright plank body, dark plank seams with a light edge under each, a lit ridge down the middle, black end bars
  const W = VEH_V3.wood, M = TANK_V3.metal, K = '#0a0a0c';
  carWheelsV3(x, [-8.5, 1.5, 11.5]);
  const mix = (p, q, f) => '#' + [0, 1, 2].map(k => Math.round(hexRGB(p)[k] + (hexRGB(q)[k] - hexRGB(p)[k]) * f).toString(16).padStart(2, '0')).join('');
  // in the raster style every plank sits between two wood tones, so the dither covers the whole car like the original's
  shadeV3(x, base, () => rrV3(x, -6, -14, 12, 28, 0.6), 0, 0, TANK_V3.soft ? 15 : 30, TANK_V3.soft ? [W[2], mix(W[2], W[3], 0.55), mix(W[3], W[4], 0.3), mix(W[3], W[4], 0.7)] : [W[2], W[3], W[4], W[4]], K, 0.8);
  for (let y = -11; y < 13; y += 4) { x.fillStyle = W[1]; x.fillRect(-6, y, 12, 0.6); x.fillStyle = W[4]; x.fillRect(-6, y + 0.6, 12, 0.4); }
  x.fillStyle = W[1]; x.fillRect(0.4, -14, 0.5, 28); x.fillStyle = '#c89868'; x.fillRect(-0.2, -14, 0.6, 28);
  x.fillStyle = K; x.fillRect(-6, -14, 12, 1); x.fillRect(-6, 13, 12, 1);
  discV3(x, 3, -11, 1.2, K); discV3(x, 3, -11, 0.6, W[4]);
}
function ammocarV3(x, base) {
  const A = VEH_V3.ammo, Y = RP.yel, M = TANK_V3.metal;
  carWheelsV3(x, [-8.5, 1.5, 11.5]);
  shadeV3(x, base, () => rrV3(x, -6, -14, 12, 28, 0.6), 0, 0, 14, tnV3(A, true), A[0]);
  for (let i = -6; i < 6; i += 2) { x.fillStyle = Y[3]; polyV3(x, [[i, 2], [i + 1, 2], [i + 2, -2], [i + 1, -2]]); x.fill(); }
  x.fillStyle = M[0]; x.fillRect(-6, -2.5, 12, 0.5); x.fillRect(-6, 2, 12, 0.5);
  x.fillStyle = Y[3]; polyV3(x, [[0, -11.4], [2.4, -9], [0, -6.6], [-2.4, -9]]); x.fill(); x.fillStyle = M[0]; x.fillRect(-0.45, -10.6, 0.9, 2.2);
}
function flatcarV3(x, base) {
  const I = VEH_V3.iron, S = RP.sand, M = TANK_V3.metal;
  carWheelsV3(x, [-8.5, 1.5, 11.5]);
  shadeV3(x, base, () => rrV3(x, -6, -14, 12, 28, 0.6), 0, 0, 14, tnV3(I, true), I[0]);
  x.fillStyle = I[1]; for (let y = -10.6; y < 13; y += 4) x.fillRect(-6, y, 12, 0.5);
  for (let a = 0; a < 8; a++) { const an = a * 6.2832 / 8 + 0.3927; shadeV3(x, base, () => { x.beginPath(); x.ellipse(Math.cos(an) * 4.4, Math.sin(an) * 5.8, 2, 1.6, an, 0, 6.2832); }, Math.cos(an) * 4.4, Math.sin(an) * 5.8, 2, [S[1], S[2], S[3], S[4]], S[0]); }
  discV3(x, 0, 0, 2.6, '#2a2418');
}
function flakGunV3(x, base) {
  const C = RP.conc, M = TANK_V3.metal, toneM = [M[2], M[3], M[4], '#d8dce4'];
  for (const gx of [-1.7, 0.7]) { shadeV3(x, base, () => rrV3(x, gx - 0.1, 1, 1.4, 12, 0.4), gx + 0.6, 6, 3, toneM, M[0]); x.fillStyle = M[0]; x.fillRect(gx - 0.1, 12.2, 1.4, 0.8); }
  shadeV3(x, base, () => polyV3(x, [[-2.4, -3.8], [2.4, -3.8], [4, -1.8], [4, 1.8], [2.4, 3.8], [-2.4, 3.8], [-4, 1.8], [-4, -1.8]]), 0, 0, 4.4, tnV3(C), C[0]);
  x.fillStyle = M[0]; x.fillRect(-1.2, -1.8, 2.4, 2.4); x.fillStyle = M[2]; x.fillRect(-1.2, -1.8, 1, 1);
}

/* ---------- sea ---------- */
function ptV3(x, base) {
  const H = RP.hull, T = RP.teak, M = TANK_V3.metal;
  shadeV3(x, base, () => polyV3(x, [[0, 17], [-5, 5], [-5, -14], [-3, -17], [3, -17], [5, -14], [5, 5]]), 0, 0, 17, tnV3(H, true), H[0]);
  shadeV3(x, base, () => polyV3(x, [[0, 13.4], [-3, 4], [-3, -13], [3, -13], [3, 4]]), 0, 0, 13, tnV3(T, true), T[0]);
  shadeV3(x, base, () => rrV3(x, -3, -7, 6, 8.2, 0.8), 0, -3, 5, tnV3(H), H[0]);
  glassV3(x, -2.2, -0.2, 4.4, 0.9);
  discV3(x, 0, 7, 2.4, M[1]); discV3(x, 0, 7, 1.6, M[0]);
}
function ptGunV3(x, base) {
  const H = RP.hull, M = TANK_V3.metal, toneM = [M[2], M[3], M[4], '#d8dce4'];
  for (const gx of [-1.4, 0.4]) shadeV3(x, base, () => rrV3(x, gx, 1.5, 1, 8, 0.3), gx + 0.5, 5.5, 3, toneM, M[0]);
  shadeV3(x, base, () => polyV3(x, [[-1.6, -2.8], [1.6, -2.8], [2.8, -1.2], [2.8, 1.2], [1.6, 2.8], [-1.6, 2.8], [-2.8, 1.2], [-2.8, -1.2]]), 0, 0, 3.2, tnV3(H), H[0]);
}
function destroyerV3(x, base) {
  const H = RP.hull, T = RP.teak, M = TANK_V3.metal, I = VEH_V3.iron;
  shadeV3(x, base, () => polyV3(x, [[0, 40], [-12, 16], [-13, -31], [-9, -39], [9, -39], [13, -31], [12, 16]]), 0, 0, 40, tnV3(H, true), H[0]);
  shadeV3(x, base, () => polyV3(x, [[0, 32], [-10, 15], [-11, -30], [-8, -37], [8, -37], [11, -30], [10, 15]]), 0, 0, 36, tnV3(T, true), T[0]);
  x.fillStyle = T[1]; for (let y = -34; y < 28; y += 6) x.fillRect(-8, y, 16, 0.5);
  shadeV3(x, base, () => rrV3(x, -5, -8, 10, 16, 1.2), 0, 0, 9, tnV3(H), H[0]);
  shadeV3(x, base, () => rrV3(x, -4, -1, 8, 6, 0.8), 0, 2, 5, [H[2], H[3], H[4], H[4]], H[0]);
  glassV3(x, -3.4, 5.6, 6.8, 1.1); x.fillStyle = H[0]; x.fillRect(-5, 0, 10, 0.5);
  shadeV3(x, base, () => { x.beginPath(); x.ellipse(0, -12, 3.2, 4.2, 0, 0, 6.2832); }, 0, -12, 4, tnV3(H, true), H[0]); discV3(x, 0, -14, 2, M[0]);
  for (const y of [22, -24]) { discV3(x, 0, y, 5, '#26303c'); discV3(x, 0, y, 3.9, M[1]); }
}
function dGunV3(x, base) {
  const H = RP.hull, M = TANK_V3.metal, toneM = [M[2], M[3], M[4], '#d8dce4'];
  for (const gx of [-2.5, 0.9]) { shadeV3(x, base, () => rrV3(x, gx, 2, 1.6, 11.4, 0.4), gx + 0.8, 7.7, 3, toneM, M[0]); x.fillStyle = M[0]; x.fillRect(gx, 12.6, 1.6, 0.8); }
  shadeV3(x, base, () => polyV3(x, [[-2.6, -4.6], [2.6, -4.6], [4.4, -2.4], [4.4, 2.4], [2.6, 4.6], [-2.6, 4.6], [-4.4, 2.4], [-4.4, -2.4]]), 0, 0, 5, tnV3(H), H[0]);
  x.fillStyle = M[0]; x.fillRect(-1.4, -1.2, 2.8, 2.4);
}
function subV3(x, base) {
  const S = VEH_V3.sub, M = TANK_V3.metal;
  shadeV3(x, base, () => polyV3(x, [[0, 23], [-5, 13], [-5, -17], [0, -23], [5, -17], [5, 13]]), 0, 0, 23, tnV3(S, true), S[0]);
  x.fillStyle = S[0]; x.fillRect(-0.3, -19, 0.6, 38);
  shadeV3(x, base, () => rrV3(x, -3, -8, 6, 12.4, 1.8), 0, -2, 5, [S[2], S[3], S[4], S[4]], S[0]);
  x.fillStyle = M[0]; x.fillRect(-0.9, -6, 1.8, 1.8); x.fillStyle = S[1]; x.fillRect(-2.6, 0.4, 5.2, 0.5);
}

/* ---------- air ---------- */
function fighterV3(x, base) {
  const F = RP.fg, Y = RP.yel, G = RP.glass;
  shadeV3(x, base, () => polyV3(x, [[-11, -2], [-6, -3], [6, -3], [11, -2], [10, 2], [-10, 2]]), 0, 0, 11, tnV3(F), F[0]);
  shadeV3(x, base, () => polyV3(x, [[-5, -9], [5, -9], [4, -6], [-4, -6]]), 0, -7.5, 5, tnV3(F), F[0]);
  shadeV3(x, base, () => { x.beginPath(); x.ellipse(0, -0.5, 2.8, 8.6, 0, 0, 6.2832); }, 0, 0, 8, tnV3(F), F[0]);
  x.fillStyle = G[2]; x.beginPath(); x.ellipse(0, -2, 1.6, 2.4, 0, 0, 6.2832); x.fill(); x.fillStyle = G[4]; x.fillRect(-1.1, -3.6, 0.8, 0.8);
  shadeV3(x, base, () => { x.beginPath(); x.ellipse(0, 6.6, 2.6, 2, 0, 0, 6.2832); }, 0, 6.6, 2.6, tnV3(Y), Y[0]);
  crossV3(x, -7, 0); crossV3(x, 7, 0);
}
function heavyV3(x, base) {
  const G = RP.grey, M = TANK_V3.metal;
  shadeV3(x, base, () => polyV3(x, [[-15, -3], [-11, -3.4], [11, -3.4], [15, -3], [14, 2], [10, 2.6], [-10, 2.6], [-14, 2]]), 0, 0, 15, tnV3(G, true), G[0]);
  shadeV3(x, base, () => polyV3(x, [[-5, -11], [5, -11], [4, -8], [-4, -8]]), 0, -9.5, 5, tnV3(G, true), G[0]);
  for (const nx of [-7, 7]) { shadeV3(x, base, () => { x.beginPath(); x.ellipse(nx, 0, 2.4, 6.4, 0, 0, 6.2832); }, nx, 0, 6, tnV3(G, true), G[0]); x.fillStyle = M[0]; x.fillRect(nx - 0.6, 5.4, 1.2, 1.6); }
  shadeV3(x, base, () => { x.beginPath(); x.ellipse(0, 0, 2.6, 11, 0, 0, 6.2832); }, 0, 0, 11, tnV3(G, true), G[0]);
  x.fillStyle = RP.glass[2]; x.beginPath(); x.ellipse(0, 4, 1.6, 2.6, 0, 0, 6.2832); x.fill(); x.beginPath(); x.ellipse(0, -5, 1.2, 1.6, 0, 0, 6.2832); x.fill(); x.fillStyle = RP.glass[4]; x.fillRect(-1, 2.2, 0.8, 0.8);
  crossV3(x, -10, -1); crossV3(x, 10, -1); lampV3(x, 0, 10.4, 0.7);
}
function bomberV3(x, base) {
  const F = RP.fg, M = TANK_V3.metal;
  shadeV3(x, base, () => polyV3(x, [[-23, -5], [-19, -5.4], [19, -5.4], [23, -5], [21, 1], [19, 1.4], [-19, 1.4], [-21, 1]]), 0, 0, 23, tnV3(F), F[0]);
  shadeV3(x, base, () => polyV3(x, [[-8, -17], [8, -17], [6, -13], [-6, -13]]), 0, -15, 8, tnV3(F), F[0]);
  for (const nx of [-14, -7, 7, 14]) { shadeV3(x, base, () => { x.beginPath(); x.ellipse(nx, -1, 2.2, 4.6, 0, 0, 6.2832); }, nx, -1, 4.6, tnV3(F, true), F[0]); x.fillStyle = M[0]; x.fillRect(nx - 0.8, 3.4, 1.6, 0.7); }
  shadeV3(x, base, () => { x.beginPath(); x.ellipse(0, -1, 3.6, 16, 0, 0, 6.2832); }, 0, -1, 16, tnV3(F), F[0]);
  x.fillStyle = F[1]; polyV3(x, [[-20, -3], [-16, -3.2], [-15, 0], [-21, 0.4]]); x.fill(); polyV3(x, [[20, -3], [16, -3.2], [15, 0], [21, 0.4]]); x.fill();
  x.fillStyle = RP.glass[2]; x.beginPath(); x.ellipse(0, 12, 2.8, 3, 0, 0, 6.2832); x.fill(); x.beginPath(); x.ellipse(0, -8, 2, 2, 0, 0, 6.2832); x.fill(); x.fillStyle = RP.glass[4]; x.fillRect(-1.6, 10.4, 1, 0.9);
  crossV3(x, -18, -2); crossV3(x, 18, -2);
}
function sowerV3(x, base) {
  const S = VEH_V3.sower, ton = tnV3(S), dark = '#14161a', Y = RP.yel, G = RP.glass;
  // local origin = (52, 40) of the old sprite; the Sower flies nose up
  const P = pts => pts.map(([a, b]) => [a - 52, b - 40]);
  shadeV3(x, base, () => polyV3(x, P([[1, 33], [4, 29], [12, 26], [28, 23], [44, 21], [60, 21], [76, 23], [92, 26], [100, 29], [103, 33], [102, 37], [96, 39], [80, 41], [62, 44], [42, 44], [24, 41], [8, 39], [2, 37]])), 0, -4, 52, ton, S[0]);
  shadeV3(x, base, () => { x.beginPath(); x.ellipse(0, 31, 21, 5.5, 0, 0, 6.2832); }, 0, 31, 21, ton, S[0]);
  for (const nx of [29, 75]) shadeV3(x, base, () => polyV3(x, P([[nx - 4, 12], [nx + 4, 12], [nx + 5, 18], [nx + 5, 40], [nx + 3, 49], [nx - 3, 49], [nx - 5, 40], [nx - 5, 18]])), nx - 52, 1, 18, ton, S[0]);
  shadeV3(x, base, () => polyV3(x, P([[47, 6], [57, 6], [58, 14], [58, 36], [57, 50], [55, 66], [54, 76], [50, 76], [49, 66], [47, 50], [46, 36], [46, 14]])), 0, 1, 36, ton, S[0]);
  // splinter camouflage: a few flat angular patches clipped to the airframe
  x.save(); x.beginPath(); x.rect(-52, -40, 104, 80); x.clip();
  x.fillStyle = S[1]; for (const q of [[[8, 29], [22, 27], [18, 36], [6, 35]], [[84, 28], [98, 30], [96, 37], [82, 36]], [[34, 22], [44, 21], [42, 31], [32, 30]], [[62, 22], [72, 23], [74, 32], [64, 31]], [[20, 40], [34, 38], [38, 44], [24, 43]], [[70, 40], [84, 38], [80, 43], [68, 43]]]) { polyV3(x, P(q)); x.globalAlpha = 0.9; x.fill(); }
  x.restore(); x.globalAlpha = 1;
  x.fillStyle = dark; x.fillRect(-2.5, 24, 5, 14); x.fillStyle = '#5a5e60'; x.fillRect(-2.5, 24, 1, 12);
  for (const nx of [29, 75]) { x.fillStyle = dark; x.fillRect(nx - 52 - 4, -24, 9, 0.8); x.fillStyle = '#787a74'; x.fillRect(nx - 52 - 3, -27, 7, 0.8); shadeV3(x, base, () => { x.beginPath(); x.ellipse(nx - 52 + 0.5, -30.5, 1.9, 2.1, 0, 0, 6.2832); }, nx - 52, -30.5, 2, tnV3(Y), Y[0]); }
  x.fillStyle = G[2]; x.beginPath(); x.ellipse(0, -29, 5.6, 8, 0, 0, 6.2832); x.fill();
  x.fillStyle = 'rgba(40,46,52,0.7)'; x.fillRect(-0.3, -37, 0.6, 15); for (const gy of [-34, -30, -26]) x.fillRect(-4, gy, 8, 0.5);
  x.fillStyle = G[4]; x.fillRect(-2, -34, 2, 1); x.fillRect(-3, -31, 1, 2);
  x.fillStyle = G[2]; x.beginPath(); x.ellipse(0, -7, 2.4, 3.2, 0, 0, 6.2832); x.fill();
  x.fillStyle = '#e8f0f0'; x.fillRect(-36, -14, 2, 0.8); x.fillRect(34, -14, 2, 0.8);
}

/* ---------- build everything ---------- */
function makeVehiclesV3() {
  const ev = n => n + (n & 1), PI16 = i => i * TAU / 16 - PI / 2, out = {};
  const dirs = (w, h, pal, draw) => { const d = ev(Math.ceil(Math.hypot(w, h)) + 2), a = []; for (let i = 0; i < 16; i++) a.push(rasterWH(d, d, PI16(i), pal, draw)); return a; };
  const fixed = (w, h, pal, draw) => rasterWH(ev(w + 2), ev(h + 2), 0, pal, draw);
  const fg = RP.fg, I = VEH_V3.iron;
  out.truck = dirs(10, 20, palV3(RP.fg, RP.olive), truckV3);
  out.acar = dirs(12, 20, palV3(RP.fg), acarV3);
  out.moto = dirs(10, 15, palV3(RP.fg), motoV3);
  out.staff = dirs(8, 13, palV3(RP.grey), staffV3);
  out.ftruck = dirs(10, 22, palV3(VEH_V3.fuel, RP.fg, RP.yel), ftruckV3);
  out.loco = fixed(16, 42, palV3(I, VEH_V3.locoRed, VEH_V3.brass, RP.red), locoV3);
  out.locoD = fixed(16, 40, palV3(VEH_V3.diesel), locoDV3);
  out.boxcar = fixed(14, 28, palV3(VEH_V3.wood), boxcarV3);
  out.ammocar = fixed(14, 28, palV3(VEH_V3.ammo, RP.yel), ammocarV3);
  out.flatcar = fixed(14, 28, palV3(I, RP.sand), flatcarV3);
  out.flakGun = dirs(12, 28, palV3(RP.conc), flakGunV3);
  out.pt = fixed(12, 34, palV3(RP.hull, RP.teak), ptV3);
  out.ptGun = dirs(8, 20, palV3(RP.hull), ptGunV3);
  out.destroyer = fixed(28, 80, palV3(RP.hull, RP.teak, I, ['#26303c']), destroyerV3);
  out.dGun = dirs(12, 30, palV3(RP.hull), dGunV3);
  out.sub = fixed(12, 46, palV3(VEH_V3.sub), subV3);
  out.fighter = dirs(22, 18, palV3(RP.fg, RP.yel), fighterV3);
  out.heavy = fixed(30, 24, palV3(RP.grey), heavyV3);
  out.bomber = fixed(46, 34, palV3(RP.fg), bomberV3);
  out.sower = fixed(104, 80, palV3(VEH_V3.sower, RP.yel, ['#5a5e60', '#787a74', '#14161a', '#e8f0f0']), sowerV3);
  return out;
}

/* The train vehicles in the clean style, flat (dither false) or with the original's ordered-dither raster shading (dither true).
   Same sizes and the same south-facing orientation as the originals. flakGun is the turret that sits on the flatcar (16 headings). */
function makeTrainsV3(dither) {
  const ev = n => n + (n & 1), I = VEH_V3.iron, out = {};
  TANK_V3.soft = !!dither;
  TANK_V3.dither = dither ? { ramps: [I, VEH_V3.locoRed, VEH_V3.brass, VEH_V3.diesel, VEH_V3.wood, VEH_V3.ammo, RP.sand, RP.conc, RP.red, TANK_V3.metal, ['#0a0a0c', '#101012', '#18181c']], body: null, camo: 0 } : null;
  try {
    const fixed = (w, h, pal, draw) => rasterWH(ev(w + 2), ev(h + 2), 0, pal, draw);
    out.loco = fixed(16, 42, palV3(I, VEH_V3.locoRed, VEH_V3.brass, RP.red), locoV3);
    out.locoD = fixed(16, 40, palV3(VEH_V3.diesel), locoDV3);
    out.boxcar = fixed(14, 28, palV3(VEH_V3.wood), boxcarV3);
    out.ammocar = fixed(14, 28, palV3(VEH_V3.ammo, RP.yel), ammocarV3);
    out.flatcar = fixed(14, 28, palV3(I, RP.sand), flatcarV3);
    const d = ev(Math.ceil(Math.hypot(12, 28)) + 2); out.flakGun = []; for (let i = 0; i < 16; i++) out.flakGun.push(rasterWH(d, d, i * TAU / 16 - PI / 2, palV3(RP.conc), flakGunV3));
  } finally { TANK_V3.soft = false; TANK_V3.dither = null; }
  return out;
}
