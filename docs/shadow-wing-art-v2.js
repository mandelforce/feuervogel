/* Shadow Wing art v2: the v1 recipes with bolder silhouette changes (proposal, not wired into the game).
   Same 100 x 40 canvas and shading as the game's SPR.wing, so the hit box (hw 44, hh 12) stays valid; a recipe now carries its own hull
   polygon and add-on parts. The nose (the bottom point) and the cockpit stay put in every variant, so the wing reads as one aircraft.
     ch  level 1, Channel: today's shape (the reference)
     sd  level 2, Sea of Sand: broad, blunt tips, a drop tank on each tip
     nt  level 3, The Long Night: swept, needle tips raked far back, a deep notch in the trailing edge
     fr  level 4, The Iron Forest: a tail boom with a fin on the centre line, a third pod
     wn  level 5, The Winter Line: blunt winglets dropped forward at the tips, ski-like
     bc  level 6, The Burning City: shot-up, the left tip broken off in jagged steps
   Needs the game's globals: sprite, polyS, ellS, rect, cross, camo, RP. */

const WING_RAMPS2 = {
  night: ['#06070b', '#0e1018', '#181c2a', '#252b3e', '#363f58', '#4c5878'],
  soot: ['#0e0a0a', '#1e1414', '#302220', '#46322d', '#62463e', '#80594c'],
  frost: ['#4a5260', '#7a8494', '#a4aebc', '#c8d0da', '#e4eaf2', '#f8fbff']
};
const WING_RECIPES2 = {
  ch: { ramp: RP.grey, camo: [0.6, 0.8, 0.15, 11], hull: [[50, 39], [99, 12], [97, 6], [72, 13], [50, 7], [28, 13], [3, 6], [1, 12]], pods: [[40, 12], [60, 12]], marks: [[20, 13], [80, 13]] },
  sd: { ramp: RP.sand, camo: [0.56, 0.74, 0.13, 23], hull: [[50, 39], [91, 22], [98, 17], [99, 8], [95, 4], [72, 8], [50, 5], [28, 8], [5, 4], [1, 8], [2, 17], [9, 22]], pods: [[40, 11], [60, 11]], podRx: 4.2, filters: true, tanks: [[4, 12], [96, 12]], marks: [[22, 12], [78, 12]] },
  nt: { ramp: WING_RAMPS2.night, camo: [0.62, 0.7, 0.15, 5], hull: [[50, 39], [99, 8], [99, 1], [79, 9], [64, 12], [50, 8], [36, 12], [21, 9], [1, 1], [1, 8]], pods: [[41, 11], [59, 11]], exhaust: '#ff9a2e', lights: [[2, 3], [97, 3]], dim: [[22, 10], [78, 10]] },
  fr: { ramp: RP.olive, camo: [0.5, 0.66, 0.2, 31], splinter: true, hull: [[50, 39], [99, 12], [97, 6], [72, 13], [58, 10], [57, 1], [43, 1], [42, 10], [28, 13], [3, 6], [1, 12]], pods: [[38, 12], [62, 12]], fin: true, boom: [47, 0, 6, 12], marks: [[20, 13], [80, 13]] },
  wn: { ramp: WING_RAMPS2.frost, camo: [0.64, 0.82, 0.14, 7], hull: [[50, 39], [89, 16], [95, 12], [98, 14], [99, 25], [90, 25], [89, 19], [72, 14], [50, 7], [28, 14], [11, 19], [10, 25], [1, 25], [2, 14], [5, 12]], pods: [[40, 12], [60, 12]], bands: [[3, 17, 6, 2], [91, 17, 6, 2]], marks: [[26, 19], [74, 19]] },
  bc: { ramp: WING_RAMPS2.soot, camo: [0.58, 0.7, 0.16, 17], hull: [[50, 39], [99, 12], [97, 6], [72, 13], [50, 7], [34, 11], [26, 8], [22, 14], [17, 11], [14, 18], [9, 16], [8, 24], [3, 22]], pods: [[40, 12], [60, 12]], exhaust: '#ff6a1c', scorch: true, fires: [[26, 16], [16, 19], [72, 16]], marks: [[80, 13]] }
};
const WING_NAMES2 = { ch: 'LEVEL 1  CHANNEL', sd: 'LEVEL 2  SEA OF SAND', nt: 'LEVEL 3  LONG NIGHT', fr: 'LEVEL 4  IRON FOREST', wn: 'LEVEL 5  WINTER LINE', bc: 'LEVEL 6  BURNING CITY' };

function wingSpriteV2(r) {
  return sprite(100, 40, x => {
    polyS(x, r.ramp, r.hull, 0, 0.5);
    if (r.boom) { const [bx, by, bw, bh] = r.boom; rect(x, r.ramp[2], bx, by, bw, bh); rect(x, r.ramp[3], bx + 1, by, 2, bh); rect(x, r.ramp[1], bx + bw - 1, by, 1, bh); } // the tail boom, lit from the left
    if (r.fin) { polyS(x, r.ramp, [[44, 1], [56, 1], [54, 6], [46, 6]], 0.05, 0.4); rect(x, '#101014', 48, 0, 4, 1); } // the tailplane across the boom's end
    if (r.tanks) for (const [tx, ty] of r.tanks) ellS(x, RP.olive, tx + 1, ty + 4, 2.8, 8, 0.1); // drop tanks along the tips (olive, so they stand out from the sand)
    if (r.splinter) { // angular splinter bands (the forest wing)
      const c = x.canvas, d = x.getImageData(0, 0, c.width, c.height), a = d.data;
      for (let j = 0; j < c.height; j++) for (let i = 0; i < c.width; i++) { const k = (j * c.width + i) * 4; if (!a[k + 3]) continue;
        const u = Math.floor((i * 0.82 + j * 0.57) / 9), v = Math.floor((i * -0.47 + j * 0.88 + 200) / 8);
        if (((u + v * 2) % 3 + 3) % 3 === 0) { a[k] *= 0.62; a[k + 1] *= 0.7; a[k + 2] *= 0.58; } }
      x.putImageData(d, 0, 0);
    }
    camo(x, ...r.camo);
    if (r.bands) for (const [bx, by, bw, bh] of r.bands) rect(x, '#c0302a', bx, by, bw, bh); // recognition bands on the winglets
    if (r.scorch) for (const [sx, sy, sw, sh] of [[40, 15, 8, 3], [70, 10, 12, 3], [54, 18, 9, 3], [20, 9, 6, 2]]) rect(x, 'rgba(8,6,6,0.55)', sx, sy, sw, sh);
    const prx = r.podRx || 3;
    for (const [px, py] of r.pods) ellS(x, r.ramp, px, py, prx, 4, -0.15);
    if (r.filters) for (const [px, py] of r.pods) { rect(x, '#2a2218', px - 3, py - 5, 7, 2); rect(x, '#8a7648', px - 2, py - 5, 5, 1); }
    for (const [px, py] of r.pods) rect(x, '#101014', px - 2, py - 4, 5, 2);
    if (r.exhaust) for (const [px, py] of r.pods) { rect(x, r.exhaust, px - 1, py - 5, 3, 1); rect(x, '#fff0b0', px, py - 5, 1, 1); }
    ellS(x, RP.glass, 50, 31, 3, 3.5, 0.15);
    ellS(x, RP.glass, 32, 20, 2.5, 2.5, 0.1); ellS(x, RP.glass, 68, 20, 2.5, 2.5, 0.1);
    if (r.lights) { rect(x, '#ff3030', r.lights[0][0], r.lights[0][1], 2, 2); rect(x, '#30ff60', r.lights[1][0], r.lights[1][1], 2, 2); rect(x, '#e8e8ff', 50, 38, 1, 1); }
    if (r.marks) for (const [mx, my] of r.marks) cross(x, mx, my);
    if (r.dim) for (const [mx, my] of r.dim) { rect(x, '#5a5a62', mx - 2, my + 1, 5, 3); rect(x, '#5a5a62', mx - 1, my, 3, 5); }
    if (r.fires) for (const [fx, fy] of r.fires) { rect(x, '#e0601c', fx, fy, 3, 2); rect(x, '#f8a83a', fx + 1, fy - 1, 2, 2); rect(x, '#fff2a8', fx + 1, fy, 1, 1); }
  });
}
function makeWingsV2() { const o = {}; for (const k in WING_RECIPES2) o[k] = wingSpriteV2(WING_RECIPES2[k]); return o; }
