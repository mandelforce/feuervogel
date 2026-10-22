/* Sower art v9: four cockpit and nose variants of the Sower, each after a real German WW2 aircraft (proposal, not wired into the game).
   The original is kept as it is (wing, engines, camouflage, panel lines, size 104 x 80), only the nose and the cockpit glazing change.
   The body below is copied from the game's SPR.sower; pre() draws a solid nose before the camouflage, post() draws the glazing after the panel lines.
     bf110: Messerschmitt Bf 110, solid gun nose with four muzzles, one long greenhouse canopy over pilot and gunner.
     he111: Heinkel He 111 H, glazed bombardier nose, stepped, with the pilot's canopy offset to the left behind it.
     he177: Heinkel He 177 Greif, pointed nose, angular framed greenhouse canopy.
     fw200: Focke-Wulf Fw 200 Condor, rounded solid nose, split flush canopy, round dorsal turret.
   Needs the game's globals: sprite, polyS, ellS, rect, RP, SOWER_RP. */

function sowerBodyV9(pre, post) {
  return sprite(104, 80, x => {
    const ramp = SOWER_RP, dark = '#14161a';
    // the wing: tapered, rounded tips, a little sweep to the leading edge; flaps and ailerons along its trailing edge
    const wing = [[1, 33], [4, 29], [12, 26], [28, 23], [44, 21], [60, 21], [76, 23], [92, 26], [100, 29], [103, 33], [102, 37], [96, 39], [80, 41], [62, 44], [42, 44], [24, 41], [8, 39], [2, 37]];
    polyS(x, ramp, wing, 0.08, 0.35);
    // the tailplane, elliptic, its elevators; the fin seen edge-on along the middle
    ellS(x, ramp, 52, 71, 21, 5.5, 0.05);
    // the fuselage: a long body tapering to the tail
    polyS(x, ramp, [[47, 6], [57, 6], [58, 14], [58, 36], [57, 50], [55, 66], [54, 76], [50, 76], [49, 66], [47, 50], [46, 36], [46, 14]], 0.15, 0.3);
    // the engine nacelles: forward of the wing, cowling rings, running back past the trailing edge
    for (const nx of [29, 75]) { polyS(x, ramp, [[nx - 4, 12], [nx + 4, 12], [nx + 5, 18], [nx + 5, 40], [nx + 3, 49], [nx - 3, 49], [nx - 5, 40], [nx - 5, 18]], 0.12, 0.35); }
    pre(x, ramp);   // the nose, solid parts
    // splinter camouflage: angular dark grey patches (two sets of slanted bands crossed) over the khaki grey
    { const c = x.canvas, d = x.getImageData(0, 0, c.width, c.height), a = d.data;
      for (let j = 0; j < c.height; j++) for (let i = 0; i < c.width; i++) { const k = (j * c.width + i) * 4; if (!a[k + 3]) continue;
        const u = Math.floor((i * 0.82 + j * 0.57) / 13), v = Math.floor((i * -0.47 + j * 0.88 + 200) / 11), w2 = Math.floor((i * 0.2 - j * 0.98 + 300) / 17);
        if (((u + v * 2 + w2) % 3 + 3) % 3 === 0) { a[k] *= 0.6; a[k + 1] *= 0.62; a[k + 2] *= 0.68; } }
      x.putImageData(d, 0, 0); }
    // panel lines: the ailerons and flaps, the wing root, the elevators, the fuselage frames
    const ln = (x0, y0, x1, y1, col = 'rgba(16,18,22,0.55)') => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); x.fillStyle = col; for (let q = 0; q <= n; q++) x.fillRect(Math.round(x0 + (x1 - x0) * q / n), Math.round(y0 + (y1 - y0) * q / n), 1, 1); };
    ln(6, 36, 24, 38); ln(24, 38, 24, 40); ln(80, 38, 98, 36); ln(80, 38, 80, 40); ln(36, 40, 44, 41); ln(60, 41, 68, 40); // ailerons, flaps
    ln(45, 22, 45, 44); ln(59, 22, 59, 44); ln(34, 70, 46, 71); ln(58, 71, 70, 70); // the wing root, the elevators' hinge
    for (const fy of [20, 30, 46, 58]) ln(47, fy, 57, fy, 'rgba(16,18,22,0.35)');
    rect(x, dark, 51, 64, 2, 14); rect(x, '#5a5e60', 51, 64, 1, 12); // the fin, edge-on
    // the engines: cowling rings, exhaust stubs, the oil cooler under each
    for (const nx of [29, 75]) { rect(x, dark, nx - 4, 16, 9, 1); rect(x, '#787a74', nx - 3, 13, 7, 1); for (const ex of [nx - 5, nx + 5]) { rect(x, '#3a2a20', ex, 20, 1, 6); rect(x, '#6a3a24', ex, 21, 1, 1); } rect(x, dark, nx - 2, 44, 5, 2); }
    // the spinners, yellow, ahead of the cowlings
    for (const nx of [29, 75]) { rect(x, dark, nx - 2, 11, 6, 1); ellS(x, RP.yel, nx + 0.5, 9.5, 1.8, 2, 0.2); }
    post(x, ln, dark, ramp);
  });
}
const swGlass = (x, cx, cy, rx, ry, a = 0.2) => ellS(x, RP.glass, cx, cy, rx, ry, a);
const swGlint = (x, a, b, w = 2, h = 1) => rect(x, '#e8f6ff', a, b, w, h);
const swBars = (x, ln, pts) => { for (const p of pts) ln(...p, 'rgba(40,46,52,0.6)'); };
const SOWER_NOSES = {
  bf110: {
    pre: (x, R) => { ellS(x, R, 52, 9, 5.8, 8, 0.1); },
    post: (x, ln, dark) => {
      for (const mx of [49, 51, 53, 55]) rect(x, dark, mx, 1, 1, 2);
      swGlass(x, 52, 25, 3.6, 11.5, 0.15); swBars(x, ln, [[48, 18, 56, 18], [49, 24, 55, 24], [49, 30, 55, 30], [52, 14, 52, 36]]); swGlint(x, 50, 16); swGlint(x, 49, 21, 1, 2);
      rect(x, dark, 52, 40, 1, 3);
      rect(x, '#e8f0f0', 16, 26, 2, 1); rect(x, '#e8f0f0', 86, 26, 2, 1);
    }
  },
  he111: {
    pre: (x, R) => { ellS(x, R, 52, 9, 5.8, 8, 0.1); },
    post: (x, ln, dark) => {
      swGlass(x, 52, 9, 4.8, 6.4, 0.2); swBars(x, ln, [[48, 6, 56, 6], [48, 10, 56, 10], [52, 3, 52, 15], [50, 4, 50, 14], [54, 4, 54, 14]]); swGlint(x, 50, 5); swGlint(x, 49, 8, 1, 2);
      swGlass(x, 49.5, 20, 2.8, 4.6, 0.15); swBars(x, ln, [[47, 19, 52, 19], [49, 16, 49, 24]]); swGlint(x, 48, 17, 1, 2);
      swGlass(x, 52, 33, 2.4, 3.2, 0.15); rect(x, '#18181c', 52, 30, 1, 3); rect(x, dark, 52, 40, 1, 3);
      rect(x, '#e8f0f0', 16, 26, 2, 1); rect(x, '#e8f0f0', 86, 26, 2, 1);
    }
  },
  he177: {
    pre: (x, R) => { polyS(x, R, [[52, 0], [57, 8], [58, 14], [46, 14], [47, 8]], 0.12, 0.3); },
    post: (x, ln, dark) => {
      rect(x, dark, 51, 2, 2, 1);
      x.save(); polyS(x, RP.glass, [[48, 14], [56, 14], [57, 20], [56, 30], [48, 30], [47, 20]], 0.15, 0.4); x.restore();
      swBars(x, ln, [[48, 18, 56, 18], [48, 23, 56, 23], [48, 27, 56, 27], [52, 14, 52, 30], [50, 14, 49, 30], [54, 14, 55, 30]]); swGlint(x, 49, 15, 2, 1);
      swGlass(x, 52, 36, 2.4, 3, 0.15); rect(x, dark, 52, 40, 1, 3);
      rect(x, '#e8f0f0', 16, 26, 2, 1); rect(x, '#e8f0f0', 86, 26, 2, 1);
    }
  },
  fw200: {
    pre: (x, R) => { ellS(x, R, 52, 9, 6, 8.5, 0.1); },
    post: (x, ln, dark) => {
      swGlass(x, 52, 6, 2.2, 2, 0.2); swGlint(x, 51, 5, 1, 1);
      swGlass(x, 49.6, 18, 2.3, 3.8, 0.15); swGlass(x, 54.4, 18, 2.3, 3.8, 0.15); rect(x, dark, 52, 14, 1, 8); swGlint(x, 48, 15, 1, 2);
      swGlass(x, 52, 31, 3, 3.6, 0.2); swBars(x, ln, [[49, 31, 55, 31], [52, 28, 52, 35]]); rect(x, dark, 52, 40, 1, 3);
      rect(x, '#e8f0f0', 16, 26, 2, 1); rect(x, '#e8f0f0', 86, 26, 2, 1);
    }
  }
};
function makeSowersV9() { const o = {}; for (const [k, n] of Object.entries(SOWER_NOSES)) o[k] = sowerBodyV9(n.pre, n.post); return o; }
