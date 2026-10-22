/* Heavy fighter art v7: four larger WW2 designs to replace the bat-shaped original (proposal, not wired into the game).
   The original is 30 x 24 px. These are 36 to 40 px wide and 32 to 36 long, seen from above with the nose to the south, like the original.
   Drawn with the clean + raster renderer: needs docs/tank-art-v3.js, docs/vehicle-art-v3.js and docs/fighter-art-v6.js loaded first (it shares the
   Luftwaffe palette and the helpers). Fixed orientation, one sprite each, like the original.
     bf110z: Messerschmitt Bf 110 Zerstoerer. Straight wings, two long nacelles with yellow spinners, glazed canopy, four nose cannons, twin tail fins.
     ju88: Junkers Ju 88 C. Broad wings, fully glazed bulbous nose, long framed canopy, big single tailplane.
     he219: Heinkel He 219 Uhu night fighter. Dark night finish, twin fins, and the stag-antler radar antennae on the nose.
     do335: Dornier Do 335 Pfeil. A fat central fuselage with a propeller at each end, short straight wings, cruciform tail.
   The game draws the propeller flicker at the nacelles itself (at x = +/-7 now), so the nacelle positions here (+/-7.4 to +/-8) would need the same offset. */

const NIGHT = ['#0c1016', '#171e28', '#222c3a', '#323f52', '#46566c'];
const glassTones = [RP.glass[1], RP.glass[2], RP.glass[3], '#e8f6ff'];
function canopyV7(x, base, X, Y, W, H, frames) {
  shadeV3(x, base, () => rrV3(x, X, Y, W, H, Math.min(W, H) * 0.45), X + W / 2, Y + H / 2, Math.max(W, H) * 0.7, glassTones, '#0a0a0c', 0.7);
  x.fillStyle = '#0a0a0c'; for (const f of frames || []) x.fillRect(X, Y + f, W, 0.4); x.fillRect(X + W / 2 - 0.2, Y, 0.4, H);
}
function spinnerV7(x, base, cx, cy, r, col) { shadeV3(x, base, () => { x.beginPath(); x.ellipse(cx, cy, r, r * 1.3, 0, 0, 6.2832); }, cx, cy, r, lwTones(col), '#0a0a0c', 0.6); discV3(x, cx, cy + r * 0.3, r * 0.4, '#f2f0e6'); }

// a black cross on a white square, for the Pfeil (the Zerstoerer keeps the white cross with black border)
function lwCrossB(x, cx, cy) { x.fillStyle = '#f2f0e6'; x.fillRect(cx - 3, cy - 3, 6, 6); x.fillStyle = '#0a0a0c'; x.fillRect(cx - 1, cy - 2.6, 2, 5.2); x.fillRect(cx - 2.6, cy - 1, 5.2, 2); }
function bf110zV7(x, base) {
  const G = LW.green, S = LW.grey, Y = RP.yel, K = '#0a0a0c';
  shadeV3(x, base, () => polyV3(x, [[-9, -15.4], [9, -15.4], [7.4, -12], [-7.4, -12]]), 0, -13.7, 9, lwDark(S));
  for (const sd of [-1, 1]) { x.fillStyle = K; x.fillRect(sd * 8.6 - 0.6, -15.8, 1.2, 4.6); x.fillStyle = G[3]; x.fillRect(sd * 8.6 - 0.3, -15.8, 0.6, 4.2); }
  const wing = [[-19.4, -3], [-2.6, -5.6], [2.6, -5.6], [19.4, -3], [19.4, 0.8], [2.6, 4.4], [-2.6, 4.4], [-19.4, 0.8]];
  shadeV3(x, base, () => polyV3(x, wing), 0, -0.5, 19, lwDark(S));
  lwPatches(x, () => polyV3(x, wing), G[2], [[[-19.4, -3], [-12, -4.2], [-11, 0.6], [-19.4, 0.8]], [[19.4, -3], [12, -4.2], [11, 0.6], [19.4, 0.8]], [[-4.6, -5.6], [-1, -5.6], [-1.6, 4.4], [-5, 4]], [[4.6, -5.6], [1, -5.6], [1.6, 4.4], [5, 4]]]);
  x.fillStyle = Y[3]; x.fillRect(-19.4, -2.8, 1.8, 3.4); x.fillRect(17.6, -2.8, 1.8, 3.4);
  x.fillStyle = S[4]; x.fillRect(-19, 0.4, 13, 0.5); x.fillRect(6, 0.4, 13, 0.5);
  for (const sd of [-1, 1]) {
    const px = sd * 7.6;
    shadeV3(x, base, () => rrV3(x, px - 2, -9, 4, 18.6, 1.8), px, 0.3, 9, lwTones(G), K, 0.8);
    x.fillStyle = K; x.fillRect(px - 2, 5.6, 4, 0.5);
    for (const e of [-1, 1]) { x.fillStyle = K; x.fillRect(px + e * 1.1 - 0.3, -3.8, 0.6, 1.2); }
    spinnerV7(x, base, px, 10.4, 1.35, Y);
  }
  const fus = sym([[0.6, 13.4], [1.6, 9], [2.3, 3], [2.3, -3], [1.7, -9.5], [0.8, -16]]);
  shadeV3(x, base, () => polyV3(x, fus), 0, -1, 14, lwTones(G), K, 0.8);
  x.fillStyle = K; for (const [a, b] of [[-0.9, 12.2], [0.4, 12.2], [-1.2, 10.8], [0.7, 10.8]]) x.fillRect(a, b, 0.5, 0.5);   // nose cannons
  canopyV7(x, base, -1.5, -6.2, 3, 10, [-3, -0.4, 2.2]);
  lwCross(x, -13.4, -1.4); lwCross(x, 13.4, -1.4);
}
function ju88V7(x, base) {
  const G = LW.green, S = LW.grey, Y = RP.yel, K = '#0a0a0c';
  shadeV3(x, base, () => polyV3(x, [[-10.4, -16], [10.4, -16], [8.2, -12.2], [-8.2, -12.2]]), 0, -14, 10, lwDark(S));
  x.fillStyle = K; x.fillRect(-0.4, -17, 0.8, 8); x.fillStyle = G[3]; x.fillRect(-0.15, -17, 0.3, 7.6);
  const wing = [[-19.2, -4.6], [-2.8, -6.2], [2.8, -6.2], [19.2, -4.6], [19.2, -0.8], [2.8, 5], [-2.8, 5], [-19.2, -0.8]];
  shadeV3(x, base, () => polyV3(x, wing), 0, -0.5, 19, lwDark(S));
  lwPatches(x, () => polyV3(x, wing), G[2], [[[-19.2, -4.6], [-11, -5.4], [-10, -0.4], [-19.2, -0.8]], [[19.2, -4.6], [11, -5.4], [10, -0.4], [19.2, -0.8]], [[-6, -6], [-2.4, -6.2], [-2.8, 5], [-6.4, 3.4]], [[6, -6], [2.4, -6.2], [2.8, 5], [6.4, 3.4]]]);
  x.fillStyle = S[4]; x.fillRect(-19, -0.6, 13.6, 0.5); x.fillRect(5.4, -0.6, 13.6, 0.5);
  for (const sd of [-1, 1]) {
    const px = sd * 8.4;
    shadeV3(x, base, () => rrV3(x, px - 2.3, -8, 4.6, 16.4, 2), px, 0, 8.6, lwTones(G), K, 0.8);
    x.fillStyle = K; x.fillRect(px - 2.3, 4.2, 4.6, 0.5); x.fillRect(px - 0.3, -8.6, 0.6, 1);
    spinnerV7(x, base, px, 9.6, 1.5, Y);
  }
  const fus = sym([[1.0, 12.8], [2.3, 10], [3, 4], [2.8, -4], [1.9, -11.5], [0.7, -17]]);
  shadeV3(x, base, () => polyV3(x, fus), 0, -2, 14, lwTones(G), K, 0.8);
  canopyV7(x, base, -2, 6.2, 4, 6.4, [1.6, 3.2]);      // the fully glazed nose
  canopyV7(x, base, -1.7, -3.2, 3.4, 8.6, [2, 4.2]);   // the long canopy
  discV3(x, 0, -7.4, 1.1, RP.glass[2]); discV3(x, 0, -7.4, 0.5, K);
  lwCross(x, -13.6, -1.6); lwCross(x, 13.6, -1.6);
}
function he219V7(x, base) {
  const N = NIGHT, S = LW.grey, K = '#0a0a0c', Y = RP.yel;
  const nt = r => [r[1], r[2], r[3], r[4]];
  shadeV3(x, base, () => polyV3(x, [[-9.4, -15.2], [9.4, -15.2], [7.6, -11.8], [-7.6, -11.8]]), 0, -13.6, 9, nt(N));
  for (const sd of [-1, 1]) { x.fillStyle = K; x.fillRect(sd * 8.8 - 0.6, -16, 1.2, 5); x.fillStyle = N[4]; x.fillRect(sd * 8.8 - 0.3, -16, 0.6, 4.6); }
  const wing = [[-19, -3.6], [-2.8, -5.8], [2.8, -5.8], [19, -3.6], [19, -0.4], [2.8, 4.6], [-2.8, 4.6], [-19, -0.4]];
  shadeV3(x, base, () => polyV3(x, wing), 0, -0.5, 19, nt(N));
  lwPatches(x, () => polyV3(x, wing), N[1], [[[-19, -3.6], [-11, -4.6], [-10, 0.2], [-19, -0.4]], [[19, -3.6], [11, -4.6], [10, 0.2], [19, -0.4]], [[-5.5, -5.8], [-2, -5.8], [-2.4, 4.6], [-6, 3.4]], [[5.5, -5.8], [2, -5.8], [2.4, 4.6], [6, 3.4]]]);
  x.fillStyle = N[4]; x.fillRect(-18.6, -0.2, 13, 0.5); x.fillRect(5.6, -0.2, 13, 0.5);
  for (const sd of [-1, 1]) {
    const px = sd * 8;
    shadeV3(x, base, () => rrV3(x, px - 2.2, -8.6, 4.4, 17.2, 2), px, 0, 9, nt(N), K, 0.8);
    x.fillStyle = K; x.fillRect(px - 2.2, 4.6, 4.4, 0.5);
    for (const e of [-1, 1]) { x.fillStyle = '#d86a30'; x.fillRect(px + e * 1.3 - 0.3, -8.8, 0.6, 0.7); }     // exhaust glow
    spinnerV7(x, base, px, 9.4, 1.4, ['#14181e', '#2a313c', '#4a5564', '#8a96a4', '#aab4c0']);
  }
  const fus = sym([[0.8, 10.4], [1.9, 7], [2.5, 2], [2.4, -4], [1.7, -10.5], [0.7, -15.6]]);
  shadeV3(x, base, () => polyV3(x, fus), 0, -2, 14, nt(N), K, 0.8);
  canopyV7(x, base, -1.7, -3.8, 3.4, 8.4, [-1, 1.4, 3.8]);
  x.strokeStyle = '#9aa6b4'; x.lineWidth = 0.55; x.lineCap = 'round';          // the stag-antler radar antennae on the nose
  for (const sd of [-1, 1]) { x.beginPath(); x.moveTo(sd * 0.5, 10.2); x.lineTo(sd * 3.4, 15.6); x.moveTo(sd * 1.5, 12.4); x.lineTo(sd * 4.6, 12); x.moveTo(sd * 2.4, 14); x.lineTo(sd * 5.2, 14.4); x.stroke(); }
  lwCross(x, -13.4, -1.2); lwCross(x, 13.4, -1.2);
}
function do335V7(x, base) {
  const G = LW.green, S = LW.grey, Y = RP.yel, K = '#0a0a0c';
  x.fillStyle = K; x.fillRect(-0.4, -15.6, 0.8, 9); x.fillStyle = G[3]; x.fillRect(-0.15, -15.6, 0.3, 8.4);          // the upper fin, edge-on
  shadeV3(x, base, () => polyV3(x, [[-7, -11.4], [7, -11.4], [5.6, -8.2], [-5.6, -8.2]]), 0, -9.8, 7, lwDark(S));
  const wing = [[-15.4, -3.4], [-3.4, -5], [3.4, -5], [15.4, -3.4], [15.4, -0.2], [3.4, 3.8], [-3.4, 3.8], [-15.4, -0.2]];
  shadeV3(x, base, () => polyV3(x, wing), 0, -0.5, 15, lwDark(S));
  lwPatches(x, () => polyV3(x, wing), G[2], [[[-15.4, -3.4], [-9, -4.2], [-8, 0.2], [-15.4, -0.2]], [[15.4, -3.4], [9, -4.2], [8, 0.2], [15.4, -0.2]], [[-5, -5], [-2, -5], [-2.4, 3.8], [-6, 2.8]], [[5, -5], [2, -5], [2.4, 3.8], [6, 2.8]]]);
  x.fillStyle = Y[3]; x.fillRect(-15.4, -3.2, 1.8, 3); x.fillRect(13.6, -3.2, 1.8, 3);
  x.fillStyle = S[4]; x.fillRect(-15, -0.1, 11, 0.5); x.fillRect(4, -0.1, 11, 0.5);
  const fus = sym([[0.7, 13.8], [2.2, 10.4], [3.3, 4], [3.4, -4], [2.6, -10.5], [1, -14.4]]);
  shadeV3(x, base, () => polyV3(x, fus), 0, -0.5, 15, lwTones(G), K, 0.9);
  x.fillStyle = K; x.fillRect(-3.2, 7.6, 6.4, 0.4); x.fillRect(-3.4, -8, 6.8, 0.4);                                    // engine and fuel hatches
  canopyV7(x, base, -1.5, -2.2, 3, 7, [1.2, 3.6]);
  spinnerV7(x, base, 0, 14.4, 1.7, Y);                                                                                   // front propeller
  shadeV3(x, base, () => { x.beginPath(); x.ellipse(0, -15.2, 1.5, 1.2, 0, 0, 6.2832); }, 0, -15.2, 1.5, lwTones(Y), K, 0.6); discV3(x, 0, -15.4, 0.55, '#f2f0e6');   // rear propeller
  lwCrossB(x, -9.5, -1.3); lwCrossB(x, 9.5, -1.3);
}
function makeHeaviesV7() {
  const ev = n => n + (n & 1), out = {};
  TANK_V3.soft = true;
  TANK_V3.dither = { ramps: [LW.green, LW.grey, NIGHT, RP.yel, RP.glass, TANK_V3.metal], body: LW.green, camo: 0.45 };
  try {
    const pal = palV3(LW.green, LW.grey, NIGHT, RP.yel, ['#f2f0e6', '#e8f6ff', '#9aa6b4', '#d86a30']);
    const mk = (fn, w, h) => rasterWH(ev(w + 2), ev(h + 2), 0, pal, fn);
    out.bf110z = mk(bf110zV7, 40, 34); out.ju88 = mk(ju88V7, 40, 36); out.he219 = mk(he219V7, 40, 36); out.do335 = mk(do335V7, 34, 34);
  } finally { TANK_V3.soft = false; TANK_V3.dither = null; }
  return out;
}
