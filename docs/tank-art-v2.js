/* Polished tank art (proposal, not wired into the game).
   Drop-in replacements for tankHull / tankTurret in index.html's sprite section. Same canvas sizes (16 x 22 hull and 12 x 30 turret for the
   tank, 20 x 28 and 16 x 40 for the heavy tank), same toolkit (sprite, boxS, polyS, ellS, rect, rotSet) and same 1 px outline, so the
   game's rotation, flash and wreck code work unchanged. Light comes from the top left, as in the rest of the sprites.
   Arcade style, in the manner of Toaplan's Fire Shark: link-by-link tracks with bright hubs, a bevelled glacis with hatch, lamps and
   tow cable, a domed turret with a lit cupola, a vented barrel with muzzle brake, a swept antenna. Details are single pixels. */

const TANK_V2 = {
  metal: ['#0a0a0c', '#26272c', '#4a4c54', '#767a84', '#a8acb6'],
  lamp: ['#6e2a0c', '#d0561c', '#f8a83a', '#fff2a8'],
  glass: ['#142436', '#24486a', '#4a7ea6', '#8cc0e0'],
  char: ['#08080a', '#141418', '#222228', '#34343c', '#4a4a54']
};

function tankHullV2(frame, ramp, w, h, o = {}) {
  const big = !!o.big, wreck = !!o.wreck, tw = big ? 4 : 3, bw = w - tw * 2, M = TANK_V2.metal, T = RP.track, n = ramp.length;
  const R = i => ramp[Math.max(0, Math.min(n - 1, i))], ty = Math.round(h * 0.5), g0 = Math.round(h * 0.7), d1 = Math.round(h * 0.3);
  return sprite(w, h, x => {
    // body: bevelled plate, light from the top left, then a quiet camouflage
    boxS(x, ramp, tw, 0, bw, h, 0.07);
    if (!wreck) camo(x, 0.66, 0.88, 0.3, w + (big ? 3 : 0));
    // engine deck: two louvre bands and the exhausts
    for (const j of [2, 4]) { rect(x, 'rgba(0,0,0,0.34)', tw + 1, j, bw - 2, 1); rect(x, 'rgba(255,255,255,0.14)', tw + 1, j + 1, bw - 2, 1); }
    rect(x, M[0], tw + 1, 0, 2, 2); rect(x, M[0], w - tw - 3, 0, 2, 2); rect(x, M[2], tw + 1, 0, 1, 1); rect(x, M[2], w - tw - 3, 0, 1, 1);
    // seams around the turret ring plate, with a rivet row on the deck edge
    rect(x, 'rgba(0,0,0,0.4)', tw, d1 + 2, bw, 1); rect(x, 'rgba(0,0,0,0.4)', tw, g0 - 1, bw, 1);
    for (let i = tw + 1; i < w - tw - 1; i += 3) rect(x, R(n - 1), i, d1 + 3, 1, 1);
    // glacis: lit bevel, driver hatch, machine gun, lamps, tow cable, rounded nose
    rect(x, R(n - 1), tw, g0, bw, 1); rect(x, R(n - 2), tw, g0 + 1, bw, 1);
    const hx = tw + 1, hy = g0 + 2;
    rect(x, R(1), hx, hy, 4, 3); rect(x, M[0], hx + 1, hy + 1, 2, 1); rect(x, R(n - 1), hx, hy, 3, 1); rect(x, R(n - 1), hx, hy + 1, 1, 1);
    rect(x, M[1], w - tw - 4, hy + 1, 2, 2); rect(x, M[3], w - tw - 4, hy + 1, 1, 1);
    rect(x, R(1), tw + 1, h - 3, bw - 2, 1); rect(x, M[3], tw + 1, h - 3, 1, 1); rect(x, M[3], w - tw - 2, h - 3, 1, 1);
    rect(x, '#fff0a0', tw, h - 2, 1, 1); rect(x, '#fff0a0', w - tw - 1, h - 2, 1, 1);
    rect(x, R(0), tw, h - 1, bw, 1); x.clearRect(tw, h - 1, 1, 1); x.clearRect(w - tw - 1, h - 1, 1, 1);
    // tracks: dark gap, lit link edge, shifted a link between the two frames; sprocket and idler rings, round ends
    for (const sx of [0, w - tw]) {
      boxS(x, T, sx, 1, tw, h - 2, -0.05);
      for (let j = 1 + frame; j < h - 1; j += 2) { rect(x, M[0], sx, j, tw, 1); if (j + 1 < h - 1) rect(x, T[3], sx + (sx === 0 ? 0 : tw - 1), j + 1, 1, 1); }
      for (const hyy of [3, h - 4]) { rect(x, M[0], sx, hyy - 1, tw, 3); rect(x, M[2], sx + 1, hyy, tw - 2, 1); rect(x, M[3], sx + 1, hyy, 1, 1); }
      for (const [ex, ey] of [[sx, 1], [sx + tw - 1, 1], [sx, h - 2], [sx + tw - 1, h - 2]]) x.clearRect(ex, ey, 1, 1);
    }
    // heavy tank: skirt plates over the outer half of each track
    if (big && o.skirts !== false) for (let j = 5; j < h - 6; j += 5) for (const sx of [0, w - 2]) { boxS(x, ramp, sx, j, 2, 4, -0.06); rect(x, M[0], sx, j + 4, 2, 1); }
    // stowage on the rear mudguards: a crate and a rolled tarp
    if (!big) { rect(x, RP.olive[2], 0, 6, 2, 3); rect(x, RP.olive[4], 0, 6, 1, 1); rect(x, M[0], 0, 9, 2, 1); rect(x, RP.sand[3], w - 3, 6, 3, 2); rect(x, RP.sand[4], w - 3, 6, 3, 1); rect(x, M[1], w - 3, 8, 3, 1); }
    if (wreck) {
      // burnt out: the open turret ring with a dying fire, and soot
      const cx = Math.round(w / 2), r = big ? 5 : 4;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const d = dx * dx + dy * dy; if (d <= r * r) { x.fillStyle = d < (r - 1) * (r - 1) ? '#0a0a0c' : TANK_V2.char[2]; x.fillRect(cx + dx, ty + dy, 1, 1); } }
      rect(x, TANK_V2.lamp[1], cx - 2, ty, 1, 1); rect(x, TANK_V2.lamp[2], cx - 1, ty - 1, 1, 1); rect(x, TANK_V2.lamp[3], cx, ty, 1, 1); rect(x, TANK_V2.lamp[0], cx + 1, ty + 1, 1, 1);
      for (const [ex, ey] of [[-5, 6], [3, 7], [-3, -7], [4, -4]]) rect(x, TANK_V2.char[0], cx + ex, ty + ey, 2, 1);
    }
  });
}

function tankTurretV2(ramp, w, h, big) {
  const M = TANK_V2.metal, n = ramp.length, R = i => ramp[Math.max(0, Math.min(n - 1, i))];
  return sprite(w, h, x => {
    const cx = w / 2, cy = h / 2, f = big ? 1.45 : 1.15, bw = big ? 3 : 2, bx = Math.round(cx - bw / 2), by = Math.round(cy + 3.5 * f), tip = h - 1;
    // barrel: lit left, dark right, a bore evacuator bulge, and a vented muzzle brake
    const ev = by + Math.round((tip - by) * 0.4);
    for (let j = by; j <= tip - 3; j++) {
      const e = j === ev || j === ev + 1 ? 1 : 0;
      for (let i = -e; i < bw + e; i++) x.fillStyle = bw === 3 ? [M[4], M[2], M[1]][i < 0 ? 0 : i >= bw ? 2 : i] : (i < bw / 2 ? M[3] : M[1]), x.fillRect(bx + i, j, 1, 1);
    }
    rect(x, M[4], bx - 1, tip - 2, bw + 2, 1); rect(x, M[0], bx - 1, tip - 1, bw + 2, 1); rect(x, M[2], bx - 1, tip, bw + 2, 1); rect(x, M[0], bx, tip, bw, 1);
    rect(x, M[1], bx + bw, tip - 2, 1, 1); rect(x, M[1], bx + bw, tip, 1, 1);
    // mantlet
    boxS(x, M, Math.round(cx - bw / 2 - 2), Math.round(cy + 3 * f), bw + 4, big ? 4 : 3, -0.05);
    // turret: sloped front, bustle at the back, dithered light from the top left, lit rim on the upper left
    const pts = [[cx - 3.5 * f, cy - 4.4 * f], [cx + 3.5 * f, cy - 4.4 * f], [cx + 4.6 * f, cy - 2 * f], [cx + 4.6 * f, cy + 1.6 * f], [cx + 3 * f, cy + 4 * f], [cx - 3 * f, cy + 4 * f], [cx - 4.6 * f, cy + 1.6 * f], [cx - 4.6 * f, cy - 2 * f]];
    polyS(x, ramp, [[cx - 3.2 * f, cy - 6.4 * f], [cx + 3.2 * f, cy - 6.4 * f], [cx + 3.6 * f, cy - 4 * f], [cx - 3.6 * f, cy - 4 * f]], -0.02, 0.4); // bustle
    polyS(x, ramp, pts, 0.14, 0.8);
    rect(x, 'rgba(0,0,0,0.4)', Math.round(cx - 3 * f), Math.round(cy - 4 * f), Math.round(6 * f), 1);
    rect(x, M[0], Math.round(cx), Math.round(cy - 6 * f), 1, 2);
    // commander cupola with an open hatch, and its machine gun
    const px = Math.round(cx - 2.8 * f), py = Math.round(cy - 1.6 * f);
    rect(x, R(1), px, py, 3, 3); rect(x, M[0], px + 1, py + 1, 1, 1); rect(x, R(n - 1), px, py, 2, 1); rect(x, R(n - 1), px, py + 1, 1, 1);
    rect(x, M[0], px + 3, py + 2, 1, big ? 4 : 3); rect(x, M[3], px + 3, py + 2, 1, 1);
    // loader hatch with the amber lamp
    const lx = Math.round(cx + 1.2 * f), ly = Math.round(cy - 2.4 * f);
    rect(x, R(1), lx, ly, 3, 2); rect(x, TANK_V2.lamp[2], lx, ly, 2, 1); rect(x, TANK_V2.lamp[1], lx + 2, ly, 1, 1); rect(x, TANK_V2.lamp[3], lx, ly, 1, 1);
    // rivets on the front slope; smoke dischargers on the heavy tank; antenna swept to the rear
    for (const sx of [-3, 3]) rect(x, R(n - 1), Math.round(cx + sx * f), Math.round(cy + 2.6 * f), 1, 1);
    if (big) for (const sx of [-7, 6]) { rect(x, M[0], Math.round(cx + sx), Math.round(cy + 1), 1, 3); rect(x, M[3], Math.round(cx + sx), Math.round(cy + 1), 1, 1); }
    const ax = Math.round(cx + 3.6 * f), ay = Math.round(cy - 6.4 * f);
    rect(x, M[0], ax, ay - (big ? 5 : 4), 1, big ? 5 : 4); rect(x, '#d84a34', ax, ay - (big ? 5 : 4), 1, 1);
  });
}

/* the sets the game builds at start-up: hull frames, turret, wreck. ramp is the body colour (RP.dy tan, RP.fg olive, RP.grey steel ...) */
function makeTankV2(ramp, big, skirts = true) {
  const w = big ? 20 : 16, h = big ? 28 : 22;
  return {
    hull: [rotSet(tankHullV2(0, ramp, w, h, { big, skirts })), rotSet(tankHullV2(1, ramp, w, h, { big, skirts }))],
    tur: rotSet(tankTurretV2(ramp, big ? 16 : 12, big ? 40 : 30, big)),
    wreck: rotSet(tankHullV2(0, TANK_V2.char, w, h, { big, wreck: true }))
  };
}
