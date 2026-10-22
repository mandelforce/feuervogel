/* Plane art v5: the four aircraft refined, staying close to the originals (proposal, not wired into the game).
   Written with the game's own sprite toolkit (sprite, polyS, ellS, rect, cross, rotSet), so the original's ordered-dither shading and its
   crisp 1 px pixels stay exactly as they are. What changes, in line with the last round on the tanks and trains:
     - pure black separation lines round every part: tailplane, wings, nacelles, fuselage, canopy, spinner,
     - brighter tones and more contrast on the body colours, brighter yellow spinners and lamps,
     - glass in a black frame with a white glint,
     - the same sizes, outline, orientation and drawing positions as the originals, so each sprite drops in where the old one was.
   Needs the game's globals: sprite, polyS, ellS, rect, cross, camo, rotSet, RP and, for the Sower, SOWER_RP. */

const PK = '#0a0a0c';
function kPoly(x, pts, w = 1.3) { x.save(); x.beginPath(); pts.forEach(([a, b], i) => i ? x.lineTo(a, b) : x.moveTo(a, b)); x.closePath(); x.lineJoin = 'round'; x.lineWidth = w; x.strokeStyle = PK; x.stroke(); x.restore(); }
function kEll(x, cx, cy, rx, ry, w = 1.3) { x.save(); x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, 6.2832); x.lineWidth = w; x.strokeStyle = PK; x.stroke(); x.restore(); }
// a part: black edge first, then the game's dithered fill on top
function partPoly(x, ramp, pts, bias, grad, w) { kPoly(x, pts, w); polyS(x, ramp, pts, bias, grad); }
function partEll(x, ramp, cx, cy, rx, ry, bias, w) { kEll(x, cx, cy, rx, ry, w); ellS(x, ramp, cx, cy, rx, ry, bias); }
function glassPart(x, cx, cy, rx, ry, glint) { partEll(x, RP.glass, cx, cy, rx, ry, 0.3, 1.5); if (glint) rect(x, '#e8f6ff', cx - 1, cy - Math.round(ry * 0.6), 1, 1); }

function makeFighterV5() {
  return sprite(22, 18, x => {
    const F = RP.fg;
    polyS(x, F, [[6, 0], [16, 0], [15, 3], [7, 3]], 0.14, 0.5);
    polyS(x, F, [[0, 7], [22, 7], [21, 11], [1, 11]], 0.14, 0.5);
    rect(x, '#b0bc84', 1, 7, 7, 1); rect(x, '#b0bc84', 14, 7, 7, 1);       // lit leading edges
    partEll(x, F, 11, 8.5, 2.8, 8.5, 0.16);
    camo(x, 0.6, 0.72, 0.35, 3);
    glassPart(x, 11, 7, 1.7, 2.5, true);
    partEll(x, RP.yel, 11, 15.6, 2.7, 2.1, 0.4, 1.7); rect(x, '#fff6b0', 10, 14, 2, 1);
    cross(x, 4, 9); cross(x, 18, 9);
  });
}
function makeHeavyV5() {
  return sprite(30, 24, x => {
    const G = ['#14161a', '#262a32', '#3c424c', '#58606c', '#7e8896', '#a8b2c0'];   // the original's blue-grey, a step brighter
    polyS(x, G, [[0, 9], [30, 9], [29, 14], [1, 14]], 0.0, 0.5);
    polyS(x, G, [[10, 1], [20, 1], [19, 4], [11, 4]], 0.02, 0.4);
    for (const nx of [8, 22]) { partEll(x, G, nx, 12, 2.5, 6, 0.1); rect(x, '#0a0a0c', nx, 17, 1, 2); rect(x, '#c4c9ce', nx - 1, 7, 1, 1); }
    partEll(x, G, 15, 12, 2.7, 11, 0.12);
    rect(x, '#9aa1a8', 4, 9, 4, 1); rect(x, '#9aa1a8', 22, 9, 4, 1);   // lit leading edges
    glassPart(x, 15, 16, 1.7, 2.7, true); glassPart(x, 15, 7, 1.3, 1.7, true);
    cross(x, 5, 11); cross(x, 25, 11);
    rect(x, PK, 13, 21, 5, 2); rect(x, '#ffe27a', 14, 21, 3, 1);
  });
}
function makeBomberV5() {
  return sprite(46, 34, x => {
    const F = RP.fg;
    polyS(x, F, [[15, 0], [31, 0], [29, 4], [17, 4]], 0.12, 0.4);
    polyS(x, F, [[0, 12], [46, 12], [44, 18], [2, 18]], 0.1, 0.5);
    rect(x, '#b0bc84', 1, 12, 10, 1); rect(x, '#b0bc84', 35, 12, 10, 1);
    for (const ex of [9, 16, 30, 37]) partEll(x, F, ex, 16, 2.3, 4.6, 0.16);
    partEll(x, F, 23, 16, 3.7, 16, 0.14);
    camo(x, 0.58, 0.7, 0.25, 7);
    glassPart(x, 23, 29, 2.9, 3.1, true); glassPart(x, 23, 9, 2.1, 2.1, true);
    for (const ex of [9, 16, 30, 37]) { rect(x, PK, ex - 1, 20, 3, 1); }
    cross(x, 5, 15); cross(x, 41, 15);
  });
}
function makeSowerV5() {
  return sprite(104, 80, x => {
    const ramp = SOWER_RP, dark = PK;
    const wing = [[1, 33], [4, 29], [12, 26], [28, 23], [44, 21], [60, 21], [76, 23], [92, 26], [100, 29], [103, 33], [102, 37], [96, 39], [80, 41], [62, 44], [42, 44], [24, 41], [8, 39], [2, 37]];
    polyS(x, ramp, wing, 0.1, 0.35);
    ellS(x, ramp, 52, 71, 21, 5.5, 0.08);
    partPoly(x, ramp, [[47, 6], [57, 6], [58, 14], [58, 36], [57, 50], [55, 66], [54, 76], [50, 76], [49, 66], [47, 50], [46, 36], [46, 14]], 0.18, 0.3, 1.7);
    for (const nx of [29, 75]) partPoly(x, ramp, [[nx - 4, 12], [nx + 4, 12], [nx + 5, 18], [nx + 5, 40], [nx + 3, 49], [nx - 3, 49], [nx - 5, 40], [nx - 5, 18]], 0.14, 0.35, 1.7);
    { const c = x.canvas, d = x.getImageData(0, 0, c.width, c.height), a = d.data;
      for (let j = 0; j < c.height; j++) for (let i = 0; i < c.width; i++) { const k = (j * c.width + i) * 4; if (!a[k + 3]) continue;
        const u = Math.floor((i * 0.82 + j * 0.57) / 13), v = Math.floor((i * -0.47 + j * 0.88 + 200) / 11), w2 = Math.floor((i * 0.2 - j * 0.98 + 300) / 17);
        if (((u + v * 2 + w2) % 3 + 3) % 3 === 0) { a[k] *= 0.6; a[k + 1] *= 0.62; a[k + 2] *= 0.68; } }
      x.putImageData(d, 0, 0); }
    const ln = (x0, y0, x1, y1, col = 'rgba(10,12,14,0.8)') => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); x.fillStyle = col; for (let q = 0; q <= n; q++) x.fillRect(Math.round(x0 + (x1 - x0) * q / n), Math.round(y0 + (y1 - y0) * q / n), 1, 1); };
    ln(6, 36, 24, 38); ln(24, 38, 24, 40); ln(80, 38, 98, 36); ln(80, 38, 80, 40); ln(36, 40, 44, 41); ln(60, 41, 68, 40);
    ln(45, 22, 45, 44); ln(59, 22, 59, 44); ln(34, 70, 46, 71); ln(58, 71, 70, 70);
    for (const fy of [20, 30, 46, 58]) ln(47, fy, 57, fy, 'rgba(10,12,14,0.5)');
    rect(x, dark, 51, 64, 2, 14); rect(x, '#8a8e90', 51, 64, 1, 12);
    for (const nx of [29, 75]) { rect(x, dark, nx - 4, 16, 9, 1); rect(x, '#aaa690', nx - 3, 13, 7, 1); for (const ex of [nx - 5, nx + 5]) { rect(x, '#3a2a20', ex, 20, 1, 6); rect(x, '#d86a30', ex, 21, 1, 1); } rect(x, dark, nx - 2, 44, 5, 2); }
    for (const nx of [29, 75]) { rect(x, dark, nx - 3, 10, 8, 2); ellS(x, RP.yel, nx + 0.5, 9.2, 2, 2.2, 0.45); rect(x, '#fff6b0', nx, 8, 1, 1); }
    partEll(x, RP.glass, 52, 11, 5.8, 8.2, 0.3, 1.7);
    for (const gy of [6, 10, 14]) ln(48, gy, 56, gy, 'rgba(10,12,14,0.85)'); ln(52, 3, 52, 18, 'rgba(10,12,14,0.85)'); ln(49, 7, 49, 16, 'rgba(10,12,14,0.55)'); ln(55, 7, 55, 16, 'rgba(10,12,14,0.55)');
    rect(x, '#ffffff', 50, 6, 2, 1); rect(x, '#e8f6ff', 49, 9, 1, 2);
    partEll(x, RP.glass, 52, 33, 2.5, 3.3, 0.3, 1.5); rect(x, dark, 52, 30, 1, 3); rect(x, dark, 52, 40, 1, 3);
    rect(x, '#ffffff', 16, 26, 2, 1); rect(x, '#ffffff', 86, 26, 2, 1);
  });
}
function makePlanesV5() { return { fighter: rotSet(makeFighterV5()), heavy: makeHeavyV5(), bomber: makeBomberV5(), sower: makeSowerV5() }; }
