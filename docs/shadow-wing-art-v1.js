/* Shadow Wing art v1: one recipe-driven builder and six level variants (proposal, not wired into the game).
   The shape and the shading are those of the game's SPR.wing (100 x 40, a flying wing seen from above, nose down). A variant is a
   recipe: { ramp, camo, tip, pods, extra, exhaust, marks }. Nothing but the recipe differs between the levels.
     ch  level 1, Cross the Channel: today's wing, sea-grey (the reference variant)
     sd  level 2, Sea of Sand: sand livery, deep dust-filter intakes on the pods
     nt  level 3, The Long Night: near-black, amber exhaust glow, red and green wingtip lights
     fr  level 4, The Iron Forest: splinter green, a third pod on the centre line
     wn  level 5, The Winter Line: white wash over grey, red recognition bands on the tips
     bc  level 6, The Burning City: soot black, scorch marks, fires in the left wing
   Needs the game's globals: sprite, polyS, ellS, rect, cross, camo, RP. */

const WING_BASE = [[50, 39], [99, 12], [97, 6], [72, 13], [50, 7], [28, 13], [3, 6], [1, 12]];
const WING_RAMPS = {
  night: ['#06070b', '#0e1018', '#181c2a', '#252b3e', '#363f58', '#4c5878'],
  soot: ['#0e0a0a', '#1e1414', '#302220', '#46322d', '#62463e', '#80594c'],
  frost: ['#4a5260', '#7a8494', '#a4aebc', '#c8d0da', '#e4eaf2', '#f8fbff']
};
const WING_RECIPES = {
  ch: { ramp: RP.grey, camo: [0.6, 0.8, 0.15, 11], pods: [[40, 12], [60, 12]], exhaust: null, marks: 'cross' },
  sd: { ramp: RP.sand, camo: [0.56, 0.74, 0.13, 23], pods: [[40, 12], [60, 12]], podRx: 4.2, filters: true, exhaust: null, marks: 'cross' },
  nt: { ramp: WING_RAMPS.night, camo: [0.62, 0.7, 0.15, 5], pods: [[40, 12], [60, 12]], exhaust: '#ff9a2e', lights: true, marks: 'dim' },
  fr: { ramp: RP.olive, camo: [0.5, 0.66, 0.2, 31], splinter: true, pods: [[40, 12], [50, 14], [60, 12]], exhaust: null, marks: 'cross' },
  wn: { ramp: WING_RAMPS.frost, camo: [0.64, 0.82, 0.14, 7], pods: [[40, 12], [60, 12]], exhaust: null, bands: '#c0302a', marks: 'cross' },
  bc: { ramp: WING_RAMPS.soot, camo: [0.58, 0.7, 0.16, 17], pods: [[40, 12], [60, 12]], exhaust: '#ff6a1c', scorch: true, fires: true, marks: 'cross' }
};
const WING_NAMES = { ch: 'LEVEL 1  CHANNEL', sd: 'LEVEL 2  SEA OF SAND', nt: 'LEVEL 3  LONG NIGHT', fr: 'LEVEL 4  IRON FOREST', wn: 'LEVEL 5  WINTER LINE', bc: 'LEVEL 6  BURNING CITY' };

function wingSpriteV1(r) {
  return sprite(100, 40, x => {
    polyS(x, r.ramp, WING_BASE, 0, 0.5);
    if (r.splinter) { // angular splinter bands (the forest wing), over the hull only
      const c = x.canvas, d = x.getImageData(0, 0, c.width, c.height), a = d.data;
      for (let j = 0; j < c.height; j++) for (let i = 0; i < c.width; i++) { const k = (j * c.width + i) * 4; if (!a[k + 3]) continue;
        const u = Math.floor((i * 0.82 + j * 0.57) / 9), v = Math.floor((i * -0.47 + j * 0.88 + 200) / 8);
        if (((u + v * 2) % 3 + 3) % 3 === 0) { a[k] *= 0.62; a[k + 1] *= 0.7; a[k + 2] *= 0.58; } }
      x.putImageData(d, 0, 0);
    }
    camo(x, ...r.camo);
    if (r.bands) { rect(x, r.bands, 2, 7, 6, 2); rect(x, r.bands, 92, 7, 6, 2); } // recognition bands on the tips
    if (r.scorch) { // soot streaks and burnt patches
      for (const [sx, sy, sw, sh] of [[14, 9, 10, 3], [70, 10, 12, 3], [34, 16, 8, 4], [58, 17, 9, 3], [6, 8, 5, 2]]) rect(x, 'rgba(8,6,6,0.55)', sx, sy, sw, sh);
    }
    const prx = r.podRx || 3;
    for (const [px, py] of r.pods) ellS(x, r.ramp, px, py, prx, 4, -0.15);
    if (r.filters) for (const [px, py] of r.pods) { rect(x, '#2a2218', px - 3, py - 5, 7, 2); rect(x, '#8a7648', px - 2, py - 5, 5, 1); } // dust filters over the intakes
    for (const [px, py] of r.pods) rect(x, '#101014', px - 2, py - 4, 5, 2); // exhausts
    if (r.exhaust) for (const [px, py] of r.pods) { rect(x, r.exhaust, px - 1, py - 5, 3, 1); rect(x, '#fff0b0', px, py - 5, 1, 1); }
    ellS(x, RP.glass, 50, 31, 3, 3.5, 0.15); // cockpit
    ellS(x, RP.glass, 32, 20, 2.5, 2.5, 0.1); ellS(x, RP.glass, 68, 20, 2.5, 2.5, 0.1); // gun turrets
    if (r.lights) { rect(x, '#ff3030', 2, 9, 2, 2); rect(x, '#30ff60', 96, 9, 2, 2); rect(x, '#e8e8ff', 50, 38, 1, 1); } // navigation lights
    if (r.marks === 'cross') { cross(x, 20, 13); cross(x, 80, 13); }
    else if (r.marks === 'dim') for (const mx of [20, 80]) { rect(x, '#5a5a62', mx - 2, 12, 5, 3); rect(x, '#5a5a62', mx - 1, 11, 3, 5); }
    if (r.fires) for (const [fx, fy] of [[27, 17], [34, 12], [71, 17]]) { rect(x, '#e0601c', fx, fy, 3, 2); rect(x, '#f8a83a', fx + 1, fy - 1, 2, 2); rect(x, '#fff2a8', fx + 1, fy, 1, 1); }
  });
}
function makeWingsV1() { const o = {}; for (const k in WING_RECIPES) o[k] = wingSpriteV1(WING_RECIPES[k]); return o; }
