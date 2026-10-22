/* Boat art v11: three designs each for the PT boat, the destroyer and the submarine (proposal, not wired into the game).
   Same sizes and gun mounts as the originals (PT 12 x 34, destroyer 28 x 80, submarine 12 x 46, bow to the south), so they drop in: the gun
   sprites (ptGun, dGun) stay as they are and sit where the originals put them (PT gun at y 24, destroyer guns at y 62 and y 16, submarine gun at y 33).
   Written with the game's own toolkit (sprite, polyS, boxS, ellS, disk, rect, RP, SUBR), so the dither and the plain 1 px edge stay as in the original.
     pt_s:  German S-boat, long and slim, bridge forward of the middle, depth charges and a 20 mm tub aft.
     pt_v:  Vosper-style motor torpedo boat, raked bow with spray rails, double bridge, twin exhausts.
     pt_r:  R-boat style minesweeper, broad flush hull, round gun tub aft, life rafts along the sides.
     de_z:  Z-class destroyer, long forecastle, bridge, two funnels, quad torpedo mount, depth charge racks aft.
     de_s:  single-funnel escort, big bridge, two deckhouses, deck railing.
     de_o:  old flush-deck destroyer, three thin funnels, torpedo mounts both sides.
     su_7:  Type VII U-boat, planked casing, conning tower with wintergarden, net cutter.
     su_9:  Type IX, bigger tower with an AA platform behind it, deck slots.
     su_21: Type XXI, smooth hull, a small streamlined fin instead of a tower. */

const LIGHT = '#c8d4de', DARKB = '#0e1014', GLASSB = '#8cc0e0';
function railB(x, pts, col = LIGHT) { for (const [a, b, w, h] of pts) rect(x, col, a, b, w, h); }

function ptS() {
  return sprite(12, 34, x => {
    polyS(x, RP.hull, [[6, 34], [2, 27], [1, 14], [1, 3], [3, 0], [9, 0], [11, 3], [11, 14], [10, 27]], 0.05);
    polyS(x, RP.teak, [[6, 31], [3.5, 25], [3, 5], [9, 5], [8.5, 25]], 0);
    boxS(x, RP.hull, 3, 12, 6, 8, 0.1); boxS(x, RP.hull, 4, 13, 4, 3, 0.25); rect(x, GLASSB, 4, 17, 4, 1);
    disk(x, '#26303c', 6, 6, 2); rect(x, DARKB, 6, 4, 1, 2); rect(x, '#3a3a40', 5, 6, 3, 1);         // the 20 mm tub aft
    for (const dx of [3, 8]) rect(x, '#18181a', dx, 8, 1, 2);                                          // depth charges
    rect(x, DARKB, 4, 0, 1, 1); rect(x, DARKB, 7, 0, 1, 1);                                            // exhausts
    railB(x, [[2, 20, 1, 4], [9, 20, 1, 4]]);
  });
}
function ptV() {
  return sprite(12, 34, x => {
    polyS(x, RP.hull, [[6, 34], [2, 24], [1, 10], [1, 3], [3, 0], [9, 0], [11, 3], [11, 10], [10, 24]], 0.08);
    polyS(x, RP.teak, [[6, 30], [3.5, 22], [3, 5], [9, 5], [8.5, 22]], 0);
    railB(x, [[1, 10, 1, 8], [10, 10, 1, 8]]);                                                          // light spray rails
    for (let k = 0; k < 6; k++) { rect(x, '#d8e4ee', 2 + (k >> 1), 22 + k, 1, 1); rect(x, '#d8e4ee', 9 - (k >> 1), 22 + k, 1, 1); }   // the raked bow
    boxS(x, RP.hull, 3, 9, 6, 7, 0.1); boxS(x, RP.hull, 4, 11, 4, 4, 0.25); rect(x, GLASSB, 4, 15, 4, 1);
    boxS(x, RP.hull, 4, 6, 4, 3, 0.05); rect(x, DARKB, 5, 7, 2, 1);                                   // the second step
    rect(x, '#2a2a30', 3, 18, 2, 2); rect(x, '#2a2a30', 7, 18, 2, 2);                                  // torpedo tubes
    rect(x, DARKB, 3, 0, 2, 1); rect(x, DARKB, 7, 0, 2, 1);
  });
}
function ptR() {
  return sprite(12, 34, x => {
    polyS(x, RP.hull, [[6, 34], [1, 26], [0, 12], [0, 3], [2, 0], [10, 0], [12, 3], [12, 12], [11, 26]], 0.05);
    polyS(x, RP.teak, [[6, 31], [2.5, 25], [2, 5], [10, 5], [9.5, 25]], 0);
    boxS(x, RP.hull, 3, 12, 6, 9, 0.1); rect(x, GLASSB, 4, 18, 4, 1); disk(x, '#26303c', 6, 14, 2);    // a round bridge top
    disk(x, '#26303c', 6, 7, 3); rect(x, DARKB, 5, 5, 1, 3); rect(x, DARKB, 7, 5, 1, 3);               // the round gun tub aft
    for (const [rx, ry] of [[1, 9], [10, 9], [1, 16], [10, 16]]) { rect(x, '#d8d0b0', rx, ry, 1, 3); rect(x, '#a89870', rx, ry + 3, 1, 1); }   // life rafts
    rect(x, DARKB, 3, 0, 2, 1); rect(x, DARKB, 7, 0, 2, 1);
  });
}

function deZ(extra) {
  return symSprite(28, 80, x => {
    polyS(x, RP.hull, [[14, 80], [2, 58], [1, 9], [5, 1], [23, 1], [27, 9], [26, 58]], 0.05);
    polyS(x, RP.teak, [[14, 73], [4, 56], [3, 10], [6, 3], [22, 3], [25, 10], [24, 56]], 0);
    railB(x, [[3, 12, 1, 40], [24, 12, 1, 40]], 'rgba(200,212,222,0.55)');
    disk(x, '#26303c', 14, 62, 5); disk(x, '#26303c', 14, 16, 5);
    boxS(x, RP.hull, 8, 44, 12, 12, 0.1); boxS(x, RP.hull, 10, 46, 8, 6, 0.25); rect(x, GLASSB, 10, 55, 8, 1); rect(x, DARKB, 13, 41, 2, 3);   // the bridge, a mast base ahead of it
    ellS(x, RP.hull, 14, 36, 4, 3, 0.1); disk(x, '#121214', 14, 35, 1);
    ellS(x, RP.hull, 14, 28, 4, 3, 0.1); disk(x, '#121214', 14, 27, 1);                                  // two funnels
    for (const tx of [10, 13, 16]) rect(x, '#2a2a30', tx, 21, 2, 4); rect(x, DARKB, 9, 20, 10, 1);      // the torpedo mount
    for (const k of [0, 1, 2]) { rect(x, '#18181a', 6 + k * 2, 8, 1, 2); rect(x, '#18181a', 20 - k * 2, 8, 1, 2); }   // depth charge racks
    if (extra) extra(x);
  });
}
function deS(extra) {
  return symSprite(28, 80, x => {
    polyS(x, RP.hull, [[14, 80], [3, 60], [2, 9], [6, 1], [22, 1], [26, 9], [25, 60]], 0.05);
    polyS(x, RP.teak, [[14, 74], [5, 58], [4, 10], [7, 3], [21, 3], [24, 10], [23, 58]], 0);
    railB(x, [[4, 10, 1, 46], [23, 10, 1, 46]], 'rgba(200,212,222,0.55)');
    disk(x, '#26303c', 14, 62, 5); disk(x, '#26303c', 14, 16, 5);
    boxS(x, RP.hull, 7, 42, 14, 14, 0.1); boxS(x, RP.hull, 9, 44, 10, 8, 0.28); rect(x, GLASSB, 9, 53, 10, 1); rect(x, GLASSB, 9, 47, 10, 1);   // a big bridge
    ellS(x, RP.hull, 14, 31, 5, 4.5, 0.08); disk(x, '#121214', 14, 30, 2);                               // one wide funnel
    boxS(x, RP.hull, 9, 21, 10, 5, 0.05); boxS(x, RP.hull, 10, 6, 8, 5, 0.05);                         // two deckhouses
    rect(x, DARKB, 13, 38, 2, 1); rect(x, DARKB, 13, 40, 2, 1);
    if (extra) extra(x);
  });
}
function deO(extra) {
  return symSprite(28, 80, x => {
    polyS(x, RP.hull, [[14, 80], [4, 56], [3, 9], [7, 1], [21, 1], [25, 9], [24, 56]], 0.05);
    polyS(x, RP.teak, [[14, 73], [6, 54], [5, 10], [8, 3], [20, 3], [23, 10], [23, 54]], 0);
    disk(x, '#26303c', 14, 62, 5); disk(x, '#26303c', 14, 16, 5);
    boxS(x, RP.hull, 10, 44, 8, 8, 0.12); rect(x, GLASSB, 10, 50, 8, 1);                                // a small bridge
    for (const fy of [27, 34, 41]) { ellS(x, RP.hull, 14, fy, 3, 2.5, 0.12); disk(x, '#121214', 14, fy - 1, 1); }   // three thin funnels
    for (const sx of [3, 22]) { rect(x, '#2a2a30', sx, 22, 3, 2); rect(x, '#2a2a30', sx, 25, 3, 2); rect(x, DARKB, sx, 21, 3, 1); }   // torpedo mounts, both sides
    if (extra) extra(x);
  });
}

function su7() {
  return sprite(12, 46, x => {
    polyS(x, SUBR, [[6, 46], [1, 37], [1, 7], [6, 0], [11, 7], [11, 37]], 0.05, 0.4);
    polyS(x, RP.teak, [[6, 43], [3, 35], [3, 6], [6, 2], [9, 6], [9, 35]], -0.32, 0.3);                // the planked casing
    for (let j = 6; j < 40; j += 3) rect(x, 'rgba(20,14,8,0.5)', 3, j, 6, 1);
    rect(x, 'rgba(0,0,0,0.3)', 6, 4, 1, 38);
    boxS(x, SUBR, 3, 16, 6, 12, 0.22); rect(x, '#0a0c10', 5, 18, 2, 2); rect(x, GLASSB, 5, 25, 2, 1);   // the conning tower
    rect(x, DARKB, 3, 28, 6, 1); rect(x, DARKB, 3, 15, 6, 1); rect(x, '#9aa4ae', 4, 13, 4, 1);          // wintergarden rail
    rect(x, DARKB, 6, 44, 1, 2);                                                                         // net cutter
  });
}
function su9() {
  return sprite(12, 46, x => {
    polyS(x, SUBR, [[6, 46], [1, 37], [1, 7], [6, 0], [11, 7], [11, 37]], 0.08, 0.4);
    polyS(x, RP.teak, [[6, 44], [3, 36], [3, 6], [6, 2], [9, 6], [9, 36]], -0.34, 0.3);
    for (let j = 4; j < 42; j += 4) { rect(x, 'rgba(20,14,8,0.5)', 3, j, 2, 1); rect(x, 'rgba(20,14,8,0.5)', 7, j, 2, 1); }   // slots in the casing
    rect(x, 'rgba(0,0,0,0.3)', 6, 4, 1, 38);
    boxS(x, SUBR, 2, 15, 8, 14, 0.2); boxS(x, SUBR, 3, 17, 6, 6, 0.3); rect(x, GLASSB, 4, 26, 4, 1);     // a bigger tower
    ellS(x, SUBR, 6, 12, 3.5, 2.2, 0.1); rect(x, DARKB, 4, 11, 4, 1);                                   // the AA platform behind it
    rect(x, '#0a0c10', 5, 19, 2, 2); rect(x, DARKB, 6, 44, 1, 2);
  });
}
function su21() {
  return sprite(12, 46, x => {
    polyS(x, SUBR, [[6, 46], [2, 38], [1, 20], [1, 8], [6, 0], [11, 8], [11, 20], [10, 38]], 0.0, 0.45);
    rect(x, 'rgba(0,0,0,0.3)', 6, 3, 1, 40);
    for (const j of [10, 20, 30, 38]) rect(x, 'rgba(10,14,20,0.45)', 2, j, 8, 1);                      // hull frames
    ellS(x, SUBR, 6, 22, 2.6, 7, 0.28); rect(x, '#0a0c10', 5, 18, 2, 1); rect(x, GLASSB, 5, 26, 2, 1); // the streamlined fin
    rect(x, DARKB, 6, 44, 1, 2);
  });
}
function makeBoatsV11() { return { pt_s: ptS(), pt_v: ptV(), pt_r: ptR(), de_z: deZ(), de_s: deS(), de_o: deO(), su_7: su7(), su_9: su9(), su_21: su21() }; }

/* ===== the chosen S-boat, reworked to be exactly symmetric: drawn on the left half, then mirrored onto the right (pixel column c to 11 - c) ===== */
function mirrorLeft(x, w, h) {
  const c = x.canvas, ox = (c.width - w) / 2, oy = (c.height - h) / 2;     // the sprite helper pads the canvas for the outline
  const d = x.getImageData(ox, oy, w, h), a = d.data, half = w / 2;
  for (let j = 0; j < h; j++) for (let i = 0; i < half; i++) { const s = (j * w + i) * 4, t = (j * w + (w - 1 - i)) * 4; a[t] = a[s]; a[t + 1] = a[s + 1]; a[t + 2] = a[s + 2]; a[t + 3] = a[s + 3]; }
  x.putImageData(d, ox, oy);
}
function sBoatHull(x) {
  polyS(x, RP.hull, [[6, 34], [2, 27], [1, 14], [1, 3], [3, 0], [9, 0], [11, 3], [11, 14], [10, 27]], 0.05);
  polyS(x, RP.teak, [[6, 31], [3.5, 25], [3, 5], [9, 5], [8.5, 25]], 0);
}
const sBoatV = {
  base(x) {                                                       // as the chosen S-boat
    boxS(x, RP.hull, 3, 12, 6, 8, 0.1); boxS(x, RP.hull, 4, 13, 4, 3, 0.25); rect(x, GLASSB, 4, 17, 4, 1);
    rect(x, '#26303c', 4, 5, 4, 3); rect(x, '#26303c', 3, 6, 6, 1); rect(x, DARKB, 5, 5, 2, 1);
    for (const dx of [3, 8]) rect(x, '#18181a', dx, 8, 1, 2);
    rect(x, DARKB, 4, 0, 1, 1); rect(x, DARKB, 7, 0, 1, 1);
    railB(x, [[2, 20, 1, 4], [9, 20, 1, 4]]);
  },
  bridge(x) {                                                     // a wider armoured bridge with wing windows, mast mark
    boxS(x, RP.hull, 2, 11, 8, 9, 0.1); boxS(x, RP.hull, 4, 12, 4, 4, 0.28);
    rect(x, GLASSB, 3, 17, 2, 1); rect(x, GLASSB, 7, 17, 2, 1); rect(x, GLASSB, 5, 16, 2, 1);
    rect(x, DARKB, 5, 9, 2, 1); rect(x, '#9aa4ae', 5, 13, 2, 1);
    rect(x, '#26303c', 4, 5, 4, 3); rect(x, DARKB, 5, 5, 2, 1);
    rect(x, DARKB, 4, 0, 1, 1); rect(x, DARKB, 7, 0, 1, 1);
  },
  flak(x) {                                                       // twin 2 cm flak aft, torpedo tubes on the quarters
    boxS(x, RP.hull, 4, 13, 4, 6, 0.1); rect(x, GLASSB, 4, 17, 4, 1);
    rect(x, '#26303c', 3, 5, 6, 4); rect(x, DARKB, 4, 4, 1, 2); rect(x, DARKB, 7, 4, 1, 2); rect(x, '#3a3a40', 5, 6, 2, 2);
    for (const tx of [2, 9]) { rect(x, '#2a2a30', tx, 14, 1, 6); rect(x, '#5a626c', tx, 14, 1, 1); }
    rect(x, DARKB, 4, 0, 1, 1); rect(x, DARKB, 7, 0, 1, 1);
  },
  camo(x) {                                                       // the wave pattern painted on the deck, small bridge
    for (let j = 5; j < 26; j++) for (let i = 3; i < 9; i++) if (((i + j) >> 1) % 3 === 0) rect(x, 'rgba(24,32,42,0.55)', i, j, 1, 1);
    boxS(x, RP.hull, 4, 12, 4, 6, 0.12); rect(x, GLASSB, 4, 16, 4, 1);
    rect(x, '#26303c', 4, 5, 4, 3); rect(x, DARKB, 5, 5, 2, 1);
    rect(x, DARKB, 4, 0, 1, 1); rect(x, DARKB, 7, 0, 1, 1);
    rect(x, '#d8d6cc', 1, 9, 1, 2); rect(x, '#d8d6cc', 10, 9, 1, 2);     // the white stripe at the sides
  }
};
function sBoat(variant) { return sprite(12, 34, x => { sBoatHull(x); sBoatV[variant](x); mirrorLeft(x, 12, 34); }); }
function makeSBoatsV11() { return { pt_sym: sBoat('base'), pt_bridge: sBoat('bridge'), pt_flak: sBoat('flak'), pt_camo: sBoat('camo') }; }

/* ===== the destroyers, exactly symmetric (drawn on the left half and mirrored), each with a variation ===== */
function symSprite(w, h, fn) { return sprite(w, h, x => { fn(x); mirrorLeft(x, w, h); }); }
const deExtra = {
  camo(x) { for (let j = 6; j < 62; j++) for (let i = 4; i < 14; i++) if (((i + j) >> 2) % 4 === 0 && j % 2) rect(x, 'rgba(14,22,32,0.4)', i, j, 1, 1); rect(x, '#d8d6cc', 2, 30, 1, 14); },   // the dazzle pattern and a white hull stripe
  davits(x) { for (const [bx, by] of [[5, 22], [5, 30]]) { rect(x, '#d8d0b0', bx, by, 2, 5); rect(x, '#a89870', bx, by + 5, 2, 1); } rect(x, DARKB, 8, 14, 5, 1); },      // boats on the left, mirrored to the right
  lights(x) { disk(x, '#3a4654', 10, 40, 2); rect(x, GLASSB, 9, 39, 1, 1); rect(x, DARKB, 12, 49, 2, 1); rect(x, '#9aa4ae', 8, 46, 4, 1); }                                        // searchlight platforms, a raised bridge wing
};
function makeDestroyersV11() {
  return { de_z_sym: deZ(), de_z_camo: deZ(deExtra.camo), de_s_sym: deS(), de_s_davits: deS(deExtra.davits), de_o_sym: deO(), de_o_lights: deO(deExtra.lights) };
}
