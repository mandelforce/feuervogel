/* Bomber art v10: four variations of an improved He 111 with four engines, in the original bomber's olive colour (proposal, not wired into the game).
   Like the original: the game's sprite toolkit, dither, plain 1 px edge, no black part lines, engines on the wing with only the nacelle tips showing.
   Needs bmGlass from docs/bomber-art-v8.js and the game's sprite, polyS, ellS, rect, cross, camo, RP.
     a: rounded wing, bulbous fully glazed nose, single tailplane.
     b: tapered wing, stepped nose with the pilot's canopy offset to the left, tailplane with end fins.
     c: straight wing, short glazed nose, dorsal turret and twin fins, bigger inboard engines.
     d: swept wing, long body with an angular greenhouse nose, big tailplane. */
function bmNac4(x, ex, cy, rx, ry) { ry += 1.8; ellS(x, RP.fg, ex, cy, rx, ry, -0.04); rect(x, '#1a1a1a', ex - 1, Math.round(cy + ry) - 1, 2, 1); }
function makeHe111V10(o) {
  return sprite(54, o.h || 42, x => {
    const F = RP.fg, tail = o.tail, wing = o.wing, n = o.h ? o.h - 42 : 0;
    polyS(x, F, tail);
    if (o.endFins) for (const fx of o.endFins) { rect(x, F[1], fx, 0, 2, 7); rect(x, F[3], fx, 0, 1, 7); }
    polyS(x, F, wing);
    polyS(x, F, [[25, 3], [29, 3], [30.5, 17], [23.5, 17]]);
    for (const [ex, ry, rx] of o.eng) bmNac4(x, ex, 17.5, rx, ry);
    ellS(x, F, 27, 25 + n / 2, 4.2, 12 + n / 2);
    camo(x, 0.58, 0.72, 0.25, o.seed);
    o.nose(x);
    cross(x, 7, 17); cross(x, 47, 17);
  });
}
const HE111_V10 = {
  a: { seed: 3, tail: [[17, 1], [37, 1], [35, 6], [19, 6]], wing: [[0, 17], [3, 14], [51, 14], [54, 17], [51, 21], [3, 21]], eng: [[9, 5, 2.2], [17, 5, 2.2], [37, 5, 2.2], [45, 5, 2.2]],
    nose: x => { bmGlass(x, 27, 35, 3.6, 4.6, true); bmGlass(x, 27, 13, 1.8, 2.2); } },
  b: { seed: 5, tail: [[16, 1], [38, 1], [36, 6], [18, 6]], endFins: [15, 37], wing: [[0, 19], [6, 14], [48, 14], [54, 19], [50, 21], [4, 21]], eng: [[9, 5, 2.2], [17, 5.4, 2.3], [37, 5.4, 2.3], [45, 5, 2.2]],
    nose: x => { bmGlass(x, 27, 36, 3, 3.8, true); bmGlass(x, 24.8, 29, 2, 3.2); rect(x, '#1a1a1a', 24, 28, 3, 1); bmGlass(x, 27, 13, 1.8, 2.2); } },
  c: { seed: 7, tail: [[15, 1], [39, 1], [37, 6], [17, 6]], endFins: [14, 38], wing: [[0, 15], [4, 14], [50, 14], [54, 15], [52, 21], [2, 21]], eng: [[9, 4.6, 2.1], [18, 6, 2.6], [36, 6, 2.6], [45, 4.6, 2.1]],
    nose: x => { bmGlass(x, 27, 34, 3, 3.6, true); bmGlass(x, 27, 27, 2.2, 3); bmGlass(x, 27, 13, 1.8, 2.2); } },
  d: { seed: 9, h: 44, tail: [[12, 1], [42, 1], [39, 7], [15, 7]], wing: [[0, 20], [6, 15], [48, 15], [54, 20], [50, 22], [4, 22]], eng: [[9, 5, 2.2], [17, 5.4, 2.3], [37, 5.4, 2.3], [45, 5, 2.2]],
    nose: x => { polyS(x, RP.glass, [[24, 35], [30, 35], [31, 40], [30, 43], [24, 43], [23, 40]], 0.15, 0.4); for (const g of [37, 40]) rect(x, '#1a1a1a', 24, g, 6, 1); rect(x, '#1a1a1a', 27, 35, 1, 8); rect(x, '#e8f6ff', 25, 36, 2, 1); bmGlass(x, 27, 14, 1.8, 2.2); } }
};
// the chosen variant c, one pixel wider (55) so the middle is a pixel column: the cockpit bars and every part sit exactly on the centre line, mirrored about it
function bmGlassC(x, cx, cy, rx, ry, bars) {
  ellS(x, RP.glass, cx, cy, rx, ry, 0.15);
  if (bars) { const c = Math.floor(cx), w = 2 * Math.floor(rx) + 1; rect(x, '#1a1a1a', c, Math.floor(cy - ry) + 1, 1, Math.ceil(ry * 2) - 1); rect(x, '#1a1a1a', c - (w - 1) / 2, Math.round(cy), w, 1); }
  rect(x, '#e8f6ff', Math.floor(cx) - 1, Math.round(cy - ry * 0.55), 1, 1);
}
function makeHe111V10C() {
  return sprite(55, 42, x => {
    const F = RP.fg;
    polyS(x, F, [[15, 1], [40, 1], [38, 6], [17, 6]]);
    for (const fx of [14, 39]) { rect(x, F[1], fx, 0, 2, 7); rect(x, F[3], fx, 0, 1, 7); }
    polyS(x, F, [[0, 16], [4, 14], [51, 14], [55, 16], [53, 21], [2, 21]]);
    polyS(x, F, [[25, 3], [30, 3], [31.5, 17], [23.5, 17]]);
    for (const [ex, r0, rx] of [[9.5, 4.6, 2.1], [18.5, 6, 2.6], [36.5, 6, 2.6], [45.5, 4.6, 2.1]]) { const ry = r0 + 1.8; ellS(x, F, ex, 17.5, rx, ry, -0.04); rect(x, '#1a1a1a', ex - 1.5, Math.round(17.5 + ry) - 1, 3, 1); }
    ellS(x, F, 27.5, 25, 4.2, 12);
    camo(x, 0.58, 0.72, 0.25, 7);
    bmGlassC(x, 27.5, 34, 3, 3.6, true); bmGlassC(x, 27.5, 27, 2.2, 3); bmGlassC(x, 27.5, 13, 1.8, 2.2);
    cross(x, 7, 17); cross(x, 47, 17);
  });
}
function makeBombersV10() { const o = {}; for (const [k, v] of Object.entries(HE111_V10)) o[k] = makeHe111V10(v); o.c = makeHe111V10C(); return o; }
