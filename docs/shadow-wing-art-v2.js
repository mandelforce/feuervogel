/* Shadow Wing art v2: the v1 recipes with bolder silhouette changes (proposal, not wired into the game).
   Same 100 x 40 canvas and shading as the game's SPR.wing, so the hit box (hw 44, hh 12) stays valid; a recipe now carries its own hull
   polygon and add-on parts. The nose (the bottom point) and the cockpit stay put in every variant, so the wing reads as one aircraft.
     ch  level 1, Channel: today's shape (the reference)
     sd  level 2, Sea of Sand: a crescent, the tips curving forward into horns
     nt  level 3, The Long Night: swept, needle tips raked far back, a deep notch in the trailing edge
     fr  level 4, The Iron Forest: a tail boom with a fin on the centre line, a third pod
     wn  level 5, The Winter Line: a sawtooth leading edge, four teeth a side
     bc  level 6, The Burning City: two heavy gun nacelles hung forward of the leading edge
   Needs the game's globals: sprite, polyS, ellS, rect, cross, camo, RP. */


// hulls are drawn as the right half and mirrored: sym(nose, half, top) gives the whole polygon
const wingSym = (nose, half, top) => [nose, ...half, top, ...half.slice().reverse().map(([x, y]) => [100 - x, y])];
// the leading edge (nose to tip) with n sawtooth teeth: each tooth juts out 6 px and snaps back to the line
function wingSaw(n) {
  const a = [50, 39], b = [99, 12], d = [b[0] - a[0], b[1] - a[1]], L = Math.hypot(d[0], d[1]), nx = -d[1] / L * -1, ny = d[0] / L * -1; // outward normal (down and to the right)
  const p = t => [a[0] + d[0] * t, a[1] + d[1] * t], o = [];
  for (let i = 1; i < n; i++) { const t0 = i / n, t1 = (i + 0.8) / n, tip = p(t1); o.push(p(t0)); o.push([tip[0] + nx * 6, tip[1] + ny * 6]); }
  return o;
}

const WING_RAMPS2 = {
  night: ['#06070b', '#0e1018', '#181c2a', '#252b3e', '#363f58', '#4c5878'],
  soot: ['#0e0a0a', '#1e1414', '#302220', '#46322d', '#62463e', '#80594c'],
  frost: ['#4a5260', '#7a8494', '#a4aebc', '#c8d0da', '#e4eaf2', '#f8fbff']
};
const WING_RECIPES2 = {
  ch: { ramp: RP.grey, camo: [0.6, 0.8, 0.15, 11], hull: [[50, 39], [99, 12], [97, 6], [72, 13], [50, 7], [28, 13], [3, 6], [1, 12]], pods: [[40, 12], [60, 12]], marks: [[20, 13], [80, 13]] },
  sd: { ramp: RP.sand, camo: [0.56, 0.74, 0.13, 23], hull: wingSym([50, 39], [[66, 31], [82, 25], [90, 28], [94, 36], [98, 36], [99, 28], [97, 17], [88, 11], [72, 8]], [50, 5]), pods: [[40, 10], [60, 10]], podRx: 4.2, filters: true, marks: [[20, 17], [80, 17]] },
  nt: { ramp: WING_RAMPS2.night, camo: [0.62, 0.7, 0.15, 5], hull: [[50, 39], [99, 8], [99, 1], [79, 9], [64, 12], [50, 8], [36, 12], [21, 9], [1, 1], [1, 8]], pods: [[41, 11], [59, 11]], exhaust: '#ff9a2e', lights: [[2, 3], [97, 3]], dim: [[22, 10], [78, 10]] },
  fr: { ramp: RP.olive, camo: [0.5, 0.66, 0.2, 31], splinter: true, hull: [[50, 39], [99, 12], [97, 6], [72, 13], [58, 10], [57, 1], [43, 1], [42, 10], [28, 13], [3, 6], [1, 12]], pods: [[38, 12], [62, 12]], fin: true, boom: [47, 0, 6, 12], marks: [[20, 13], [80, 13]] },
  wn: { ramp: WING_RAMPS2.frost, camo: [0.64, 0.82, 0.14, 7], hull: wingSym([50, 39], [...wingSaw(4), [99, 12], [97, 6], [72, 13]], [50, 7]), pods: [[40, 12], [60, 12]], bands: [[3, 7, 6, 2], [91, 7, 6, 2]], marks: [[22, 13], [78, 13]] },
  bc: { ramp: WING_RAMPS2.soot, camo: [0.58, 0.7, 0.16, 17], hull: [[50, 39], [99, 12], [97, 6], [72, 13], [50, 7], [28, 13], [3, 6], [1, 12]], nacelles: [[30, 26], [70, 26]], noTurrets: true, pods: [[40, 12], [60, 12]], exhaust: '#ff6a1c', scorch: true, fires: [[22, 17], [74, 17]], marks: [[18, 13], [82, 13]] }
};
const WING_NAMES2 = { ch: 'LEVEL 1  CHANNEL', sd: 'LEVEL 2  SEA OF SAND', nt: 'LEVEL 3  LONG NIGHT', fr: 'LEVEL 4  IRON FOREST', wn: 'LEVEL 5  WINTER LINE', bc: 'LEVEL 6  BURNING CITY' };

function wingSpriteV2(r) {
  return sprite(100, 40, x => {
    polyS(x, r.ramp, r.hull, 0, 0.5);
    if (r.boom) { const [bx, by, bw, bh] = r.boom; rect(x, r.ramp[2], bx, by, bw, bh); rect(x, r.ramp[3], bx + 1, by, 2, bh); rect(x, r.ramp[1], bx + bw - 1, by, 1, bh); } // the tail boom, lit from the left
    if (r.floats) for (const [fx, fy, frx, fry] of r.floats) ellS(x, r.ramp, fx, fy, frx, fry, 0.05); // long floats or skis along the wing
    if (r.fins) for (const f of r.fins) polyS(x, r.ramp, f, 0.05, 0.4); // fins behind the trailing edge
    if (r.booms) for (const [bx, by, bw, bh] of r.booms) { rect(x, r.ramp[2], bx, by, bw, bh); rect(x, r.ramp[3], bx, by, 1, bh); rect(x, r.ramp[1], bx + bw - 1, by, 1, bh); } // more tail booms
    if (r.plane) { const [bx, by, bw, bh] = r.plane; rect(x, r.ramp[2], bx, by, bw, bh); rect(x, r.ramp[3], bx, by, bw, 1); } // a tailplane between booms
    if (r.spine) { polyS(x, r.ramp, [[44, 0], [56, 0], [57, 30], [53, 37], [47, 37], [43, 30]], 0.05, 0.4); ellS(x, r.ramp, 50, 28, 6, 8, 0.1); } // a fuselage spine down the centre line, a bulbous front
    if (r.fin) { polyS(x, r.ramp, [[44, 1], [56, 1], [54, 6], [46, 6]], 0.05, 0.4); rect(x, '#101014', 48, 0, 4, 1); } // the tailplane across the boom's end
    if (r.nacelles) for (const [nx, ny] of r.nacelles) { polyS(x, r.ramp, [[nx - 4, ny - 8], [nx + 4, ny - 8], [nx + 4, ny + 8], [nx + 2, ny + 11], [nx - 2, ny + 11], [nx - 4, ny + 8]], -0.05, 0.45); } // heavy gun nacelles hung forward of the leading edge
    if (r.tanks) for (const [tx, ty] of r.tanks) ellS(x, RP.olive, tx + 1, ty + 4, 2.8, 8, 0.1); // drop tanks along the tips (olive, so they stand out from the sand)
    if (r.splinter) { // angular splinter bands (the forest wing)
      const c = x.canvas, d = x.getImageData(0, 0, c.width, c.height), a = d.data;
      for (let j = 0; j < c.height; j++) for (let i = 0; i < c.width; i++) { const k = (j * c.width + i) * 4; if (!a[k + 3]) continue;
        const u = Math.floor((i * 0.82 + j * 0.57) / 9), v = Math.floor((i * -0.47 + j * 0.88 + 200) / 8);
        if (((u + v * 2) % 3 + 3) % 3 === 0) { a[k] *= 0.62; a[k + 1] *= 0.7; a[k + 2] *= 0.58; } }
      x.putImageData(d, 0, 0);
    }
    camo(x, ...r.camo);
    if (r.holes) { x.save(); x.globalCompositeOperation = 'destination-out'; for (const h of r.holes) { x.beginPath(); h.forEach(([hx, hy], i) => i ? x.lineTo(hx, hy) : x.moveTo(hx, hy)); x.closePath(); x.fill(); } x.restore(); } // cut-out windows
    if (r.bands) for (const [bx, by, bw, bh] of r.bands) rect(x, '#c0302a', bx, by, bw, bh); // recognition bands on the winglets
    if (r.scorch) for (const [sx, sy, sw, sh] of [[40, 15, 8, 3], [70, 10, 12, 3], [54, 18, 9, 3], [20, 9, 6, 2]]) rect(x, 'rgba(8,6,6,0.55)', sx, sy, sw, sh);
    const prx = r.podRx || 3;
    for (const [px, py] of r.pods) ellS(x, r.ramp, px, py, prx, 4, -0.15);
    if (r.filters) for (const [px, py] of r.pods) { rect(x, '#2a2218', px - 3, py - 5, 7, 2); rect(x, '#8a7648', px - 2, py - 5, 5, 1); }
    for (const [px, py] of r.pods) rect(x, '#101014', px - 2, py - 4, 5, 2);
    if (r.exhaust) for (const [px, py] of r.pods) { rect(x, r.exhaust, px - 1, py - 5, 3, 1); rect(x, '#fff0b0', px, py - 5, 1, 1); }
    ellS(x, RP.glass, 50, 31, 3, 3.5, 0.15);
    if (!r.noTurrets) { ellS(x, RP.glass, 32, 20, 2.5, 2.5, 0.1); ellS(x, RP.glass, 68, 20, 2.5, 2.5, 0.1); }
    if (r.nacelles) for (const [nx, ny] of r.nacelles) { rect(x, '#101014', nx - 1, ny + 8, 3, 4); rect(x, '#6a6a72', nx, ny + 8, 1, 3); rect(x, '#101014', nx - 3, ny - 4, 7, 1); rect(x, '#101014', nx - 3, ny + 1, 7, 1); } // barrels, hatch lines
    if (r.lights) { rect(x, '#ff3030', r.lights[0][0], r.lights[0][1], 2, 2); rect(x, '#30ff60', r.lights[1][0], r.lights[1][1], 2, 2); rect(x, '#e8e8ff', 50, 38, 1, 1); }
    if (r.marks) for (const [mx, my] of r.marks) cross(x, mx, my);
    if (r.dim) for (const [mx, my] of r.dim) { rect(x, '#5a5a62', mx - 2, my + 1, 5, 3); rect(x, '#5a5a62', mx - 1, my, 3, 5); }
    if (r.fires) for (const [fx, fy] of r.fires) { rect(x, '#e0601c', fx, fy, 3, 2); rect(x, '#f8a83a', fx + 1, fy - 1, 2, 2); rect(x, '#fff2a8', fx + 1, fy, 1, 1); }
  });
}
function makeWingsV2() { const o = {}; for (const k in WING_RECIPES2) o[k] = wingSpriteV2(WING_RECIPES2[k]); return o; }
