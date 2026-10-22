/* Fighter art v6: four complete redesigns of the enemy fighter as German WW2 aircraft (proposal, not wired into the game).
   Seen from above, nose to the south like the original, about the same size class (24 to 26 px wide), turning through 16 headings.
   Drawn with the clean + raster renderer (docs/tank-art-v3.js and docs/vehicle-art-v3.js must be loaded first): every heading is drawn from the shapes,
   the light stays at the top left of the screen, and the original's ordered dither is laid on the screen pixels, so the planes stay sharp at 22.5 and 45 degrees.
     bf109: Messerschmitt Bf 109, slim fuselage, tapered wings, pointed yellow-nosed cowl, framed canopy behind the wing
     fw190: Focke-Wulf Fw 190, round radial cowling with a yellow band, broad rounded wings, bubble canopy far aft
     me262: Messerschmitt Me 262 jet, swept wings, two engine pods with dark intakes, triangular fuselage, no propeller
     bf110: Messerschmitt Bf 110 twin-engine fighter, two long engine nacelles with yellow spinners, slim fuselage, twin tail fins
   Colours follow the Luftwaffe palette: dark green and grey-green uppersurfaces with a mottle, yellow nose and wing-tip marks, white crosses with black edges. */

const LW = {
  green: ['#16241a', '#24382a', '#365238', '#4e7048', '#6e9060'],
  grey: ['#2c3436', '#434e50', '#5e6c68', '#7e8e86', '#a0b0a4']
};
const lwTones = r => [r[1], r[3], r[4], r[4]];
const lwDark = r => [r[1], r[2], r[3], r[4]];     // a step darker, for the grey-green wings
function lwPatches(x, clipPath, col, patches) {
  x.save(); clipPath(); x.clip(); x.fillStyle = col; for (const q of patches) { polyV3(x, q); x.fill(); } x.restore();
}
function lwCross(x, cx, cy) { x.fillStyle = '#0a0a0c'; x.fillRect(cx - 2.6, cy - 1.3, 5.2, 2.6); x.fillRect(cx - 1.3, cy - 2.6, 2.6, 5.2); x.fillStyle = '#f2f0e6'; x.fillRect(cx - 2.1, cy - 0.8, 4.2, 1.6); x.fillRect(cx - 0.8, cy - 2.1, 1.6, 4.2); }
function sym(pts) { return pts.concat(pts.slice().reverse().map(([a, b]) => [-a, b])); }   // right half, nose to tail, mirrored into a closed outline

function bf109V6(x, base) {
  const G = LW.green, S = LW.grey, Y = RP.yel, K = '#0a0a0c';
  const tail = [[-5.8, -11.2], [5.8, -11.2], [4.4, -8], [-4.4, -8]];
  shadeV3(x, base, () => polyV3(x, tail), 0, -9.6, 6, lwDark(S));
  const wing = [[-12.6, -1.4], [-2.2, -3.6], [2.2, -3.6], [12.6, -1.4], [12.6, 0.9], [2.2, 3.4], [-2.2, 3.4], [-12.6, 0.9]];
  shadeV3(x, base, () => polyV3(x, wing), 0, 0, 13, lwDark(S));
  lwPatches(x, () => polyV3(x, wing), G[2], [[[-12.6, -1.4], [-7, -2.6], [-6, 0.4], [-12.6, 0.9]], [[12.6, -1.4], [7, -2.6], [6, 0.4], [12.6, 0.9]], [[-4, -3.6], [-1, -3.6], [-1.5, 3.4], [-4.6, 3.4]], [[4, -3.6], [1, -3.6], [1.5, 3.4], [4.6, 3.4]]]);
  x.fillStyle = Y[3]; x.fillRect(-12.6, -1.4, 1.6, 2.3); x.fillRect(11, -1.4, 1.6, 2.3);               // yellow wing tips
  x.fillStyle = S[4]; x.fillRect(-12.4, 0.5, 9.8, 0.5); x.fillRect(2.6, 0.5, 9.8, 0.5);               // lit leading edge
  const fus = sym([[0.8, -11.4], [1.4, -6], [1.9, -1.5], [1.9, 3], [1.4, 6.5], [0.7, 8.7]]);
  shadeV3(x, base, () => polyV3(x, fus), 0, -1, 10, lwTones(G), K, 0.8);
  x.fillStyle = G[1]; x.fillRect(-0.25, -11.4, 0.5, 8);                                            // tail fin seen edge-on
  shadeV3(x, base, () => polyV3(x, [[-1.3, 6.4], [1.3, 6.4], [0.9, 8.8], [-0.9, 8.8]]), 0, 7.6, 2, lwTones(Y), K, 0.7);   // yellow nose cowl
  discV3(x, 0, 9.1, 0.8, '#f2f0e6'); discV3(x, 0, 9.1, 0.35, K);                                    // spinner
  x.fillStyle = K; x.fillRect(-0.9, 5.3, 0.5, 0.5); x.fillRect(0.4, 5.3, 0.5, 0.5);                  // cowl guns
  shadeV3(x, base, () => rrV3(x, -1.2, -3.8, 2.4, 4.8, 1), 0, -1.4, 2.4, [RP.glass[1], RP.glass[2], RP.glass[3], '#e8f6ff'], K, 0.7);   // canopy
  x.fillStyle = K; x.fillRect(-1.2, -1.6, 2.4, 0.4); x.fillRect(-0.2, -3.8, 0.4, 4.8);
  lwCross(x, -8.2, -0.6); lwCross(x, 8.2, -0.6);
}
function fw190V6(x, base) {
  const G = LW.green, S = LW.grey, Y = RP.yel, K = '#0a0a0c', M = TANK_V3.metal;
  shadeV3(x, base, () => { x.beginPath(); x.ellipse(0, -9.4, 5.4, 2, 0, 0, 6.2832); }, 0, -9.4, 5.4, lwTones(S));
  const wing = () => { x.beginPath(); x.ellipse(0, -0.4, 13.2, 3.9, 0, 0, 6.2832); };
  shadeV3(x, base, wing, 0, 0, 13, lwDark(S));
  lwPatches(x, wing, G[2], [[[-13.4, -3], [-8, -3.6], [-7, 1], [-13.4, 1.5]], [[13.4, -3], [8, -3.6], [7, 1], [13.4, 1.5]], [[-3.6, -4], [-0.6, -4], [-1.2, 3.4], [-4.4, 3.2]], [[3.6, -4], [0.6, -4], [1.2, 3.4], [4.4, 3.2]]]);
  x.fillStyle = Y[3]; x.fillRect(-13.2, -1.4, 1.5, 2.2); x.fillRect(11.7, -1.4, 1.5, 2.2);
  const fus = sym([[1.1, -11.2], [1.8, -6], [2.3, -1], [2.5, 3], [2.4, 5.2]]);
  shadeV3(x, base, () => polyV3(x, fus), 0, -2, 11, lwTones(G), K, 0.8);
  x.fillStyle = G[1]; x.fillRect(-0.25, -11.2, 0.5, 8.5);
  shadeV3(x, base, () => rrV3(x, -2.9, 4.6, 5.8, 3.6, 1.6), 0, 6.4, 3.4, [M[1], M[2], M[3], M[4]], K, 0.8);    // the round radial cowling
  x.fillStyle = Y[3]; x.fillRect(-2.7, 6.6, 5.4, 0.9); x.fillStyle = K; x.fillRect(-2.7, 6.3, 5.4, 0.3); x.fillRect(-2.7, 7.5, 5.4, 0.3);   // yellow cowl band
  discV3(x, 0, 8.6, 1.0, '#f2f0e6'); discV3(x, 0, 8.6, 0.4, K);
  shadeV3(x, base, () => { x.beginPath(); x.ellipse(0, -1.8, 1.6, 2.5, 0, 0, 6.2832); }, 0, -1.8, 2.5, [RP.glass[1], RP.glass[2], RP.glass[3], '#e8f6ff'], K, 0.7);   // bubble canopy
  x.fillStyle = K; x.fillRect(-1.6, -1.6, 3.2, 0.4);
  lwCross(x, -8.6, -0.5); lwCross(x, 8.6, -0.5);
}
function me262V6(x, base) {
  const G = LW.green, S = LW.grey, K = '#0a0a0c', M = TANK_V3.metal;
  shadeV3(x, base, () => polyV3(x, [[-4.6, -11], [4.6, -11], [3.4, -8.4], [-3.4, -8.4]]), 0, -9.7, 5, lwTones(S));
  const wing = [[-12.8, -8.6], [-1.6, -3.4], [1.6, -3.4], [12.8, -8.6], [12.8, -6.4], [1.8, 1.6], [-1.8, 1.6], [-12.8, -6.4]];
  shadeV3(x, base, () => polyV3(x, wing), 0, -4, 13, lwDark(S));
  lwPatches(x, () => polyV3(x, wing), G[2], [[[-12.8, -8.6], [-8, -6.5], [-8, -3.8], [-12.8, -6.4]], [[12.8, -8.6], [8, -6.5], [8, -3.8], [12.8, -6.4]], [[-5, -5], [-2, -3.4], [-2, 1.2], [-6, -1.4]], [[5, -5], [2, -3.4], [2, 1.2], [6, -1.4]]]);
  x.fillStyle = S[4]; x.fillRect(-12.4, -6.9, 0.5, 0.5);
  for (const sd of [-1, 1]) {   // the two jet pods
    const px = sd * 4.9;
    shadeV3(x, base, () => rrV3(x, px - 1.4, -4.2, 2.8, 9.2, 1.3), px, 0.4, 5, lwTones(G), K, 0.8);
    discV3(x, px, 4.5, 1.0, K); discV3(x, px, 4.5, 0.55, M[2]);            // dark intake with a lit rim
    x.fillStyle = K; x.fillRect(px - 0.8, -4.4, 1.6, 0.8);               // exhaust
  }
  const fus = sym([[0.2, 10.2], [1.0, 7], [1.6, 3], [1.7, -2], [1.3, -7], [0.6, -11.4]]);
  shadeV3(x, base, () => polyV3(x, fus), 0, 0, 11, lwTones(G), K, 0.8);
  x.fillStyle = G[1]; x.fillRect(-0.25, -11.4, 0.5, 6);
  shadeV3(x, base, () => rrV3(x, -1.0, 1.4, 2.0, 4.2, 1), 0, 3.5, 2.2, [RP.glass[1], RP.glass[2], RP.glass[3], '#e8f6ff'], K, 0.7);   // canopy
  x.fillStyle = K; x.fillRect(-1.0, 3.2, 2.0, 0.4);
  discV3(x, 0, 9.6, 0.5, '#f2f0e6');
  lwCross(x, -9.6, -7.2); lwCross(x, 9.6, -7.2);
}
function bf110V6(x, base) {
  const G = LW.green, S = LW.grey, Y = RP.yel, K = '#0a0a0c';
  shadeV3(x, base, () => polyV3(x, [[-6.6, -11], [6.6, -11], [6, -8.2], [-6, -8.2]]), 0, -9.6, 7, lwTones(S));
  for (const sd of [-1, 1]) { x.fillStyle = K; x.fillRect(sd * 6.3 - 0.45, -11.2, 0.9, 3.2); x.fillStyle = G[3]; x.fillRect(sd * 6.3 - 0.25, -11.2, 0.5, 2.8); }   // the twin tail fins, edge-on
  const wing = [[-13.2, -2.6], [-2.4, -4.2], [2.4, -4.2], [13.2, -2.6], [13.2, 0.4], [2.4, 3.2], [-2.4, 3.2], [-13.2, 0.4]];
  shadeV3(x, base, () => polyV3(x, wing), 0, -0.5, 13, lwDark(S));
  lwPatches(x, () => polyV3(x, wing), G[2], [[[-13.2, -2.6], [-8.5, -3.2], [-8.5, 0.2], [-13.2, 0.4]], [[13.2, -2.6], [8.5, -3.2], [8.5, 0.2], [13.2, 0.4]]]);
  x.fillStyle = Y[3]; x.fillRect(-13.2, -2.4, 1.5, 2.6); x.fillRect(11.7, -2.4, 1.5, 2.6);
  for (const sd of [-1, 1]) {
    const px = sd * 4.6;
    shadeV3(x, base, () => rrV3(x, px - 1.5, -6.4, 3, 12.6, 1.4), px, 0, 6, lwTones(G), K, 0.8);
    shadeV3(x, base, () => polyV3(x, [[px - 1.1, 5.6], [px + 1.1, 5.6], [px + 0.7, 7.4], [px - 0.7, 7.4]]), px, 6.5, 2, lwTones(Y), K, 0.6);
    discV3(x, px, 7.8, 0.7, '#f2f0e6'); discV3(x, px, 7.8, 0.3, K);
  }
  const fus = sym([[0.5, 5.4], [1.3, 2.4], [1.7, -2], [1.4, -7], [0.7, -10.8]]);
  shadeV3(x, base, () => polyV3(x, fus), 0, -2, 9, lwTones(G), K, 0.8);
  shadeV3(x, base, () => rrV3(x, -1.1, -3.4, 2.2, 6.4, 1), 0, -0.2, 3, [RP.glass[1], RP.glass[2], RP.glass[3], '#e8f6ff'], K, 0.7);
  x.fillStyle = K; x.fillRect(-1.1, -0.2, 2.2, 0.4); x.fillRect(-0.2, -3.4, 0.4, 6.4);
  lwCross(x, -9.0, -1.0); lwCross(x, 9.0, -1.0);
}
function makeFightersV6() {
  const ev = n => n + (n & 1), out = {};
  TANK_V3.soft = true;
  TANK_V3.dither = { ramps: [LW.green, LW.grey, RP.yel, RP.glass, TANK_V3.metal], body: LW.green, camo: 0.45 };
  try {
    const pal = palV3(LW.green, LW.grey, RP.yel, ['#f2f0e6', '#e8f6ff']), d = ev(Math.ceil(Math.hypot(28, 26)) + 2);
    for (const [k, fn] of [['bf109', bf109V6], ['fw190', fw190V6], ['me262', me262V6], ['bf110', bf110V6]]) { out[k] = []; for (let i = 0; i < 16; i++) out[k].push(rasterWH(d, d, i * TAU / 16 - PI / 2, pal, fn)); }
  } finally { TANK_V3.soft = false; TANK_V3.dither = null; }
  return out;
}
