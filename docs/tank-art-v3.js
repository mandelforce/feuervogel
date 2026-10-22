/* Tank art v3: the clean compromise (proposal, not wired into the game).
   v2 draws one south-facing bitmap full of 1 px detail and lets the game rotate it, so at 22.5 and 45 degrees the detail turns to mush.
   v3 draws bold shapes instead and renders EVERY heading from the shapes themselves:
     - each of the 16 headings is drawn at 6x with the shapes rotated (never a rotated bitmap), then reduced by averaging,
     - every pixel snaps to the nearest colour of a small palette, so there is no dither and no stray in-between colour,
     - the light stays at the top left in screen space whatever the heading (flat tone bands, not gradients), so a turning tank keeps one look,
     - detail is kept to shapes that survive at 16 px: tread links, wheel rings, bevelled plates, hatch, lamps, vented muzzle.
   Same sizes, same 1 px game outline and the same {c, f, k, w, h} sprite objects as rotSet, so nothing else in the game changes. */

const TANK_V3 = {
  metal: ['#0a0a0c', '#26272c', '#4a4c54', '#767a84', '#a8acb6'],
  track: ['#121214', '#242428', '#3a3a40', '#56565e'],
  lamp: ['#6e2a0c', '#d0561c', '#f8a83a', '#fff2a8'],
  char: ['#08080a', '#141418', '#222228', '#34343c', '#4a4a54'],
  SS: 6
};

function rasterV3(d, ang, palette, draw) {
  const SS = TANK_V3.SS, N = d * SS, [big, x] = mk(N, N);
  x.setTransform(SS, 0, 0, SS, N / 2, N / 2); const base = x.getTransform();
  x.rotate(ang); x.lineJoin = 'round'; x.lineCap = 'round';
  draw(x, base);
  const src = x.getImageData(0, 0, N, N).data, [c, y] = mk(d, d), out = y.createImageData(d, d), pal = palette.map(hexRGB);
  for (let j = 0; j < d; j++) for (let i = 0; i < d; i++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let v = 0; v < SS; v++) for (let u = 0; u < SS; u++) { const k = ((j * SS + v) * N + i * SS + u) * 4, al = src[k + 3]; if (al) { r += src[k] * al; g += src[k + 1] * al; b += src[k + 2] * al; a += al; } }
    if (a < 255 * SS * SS * 0.5) continue;
    r /= a; g /= a; b /= a; let best = 0, bd = 1e9;
    for (let p = 0; p < pal.length; p++) { const dr = pal[p][0] - r, dg = pal[p][1] - g, db = pal[p][2] - b, dd = dr * dr * 0.9 + dg * dg * 1.2 + db * db * 0.8; if (dd < bd) { bd = dd; best = p; } }
    const o = (j * d + i) * 4; out.data[o] = pal[best][0]; out.data[o + 1] = pal[best][1]; out.data[o + 2] = pal[best][2]; out.data[o + 3] = 255;
  }
  y.putImageData(out, 0, 0); outline(c, OUT); return finalize(c);
}
// flat tone bands lit from the top left in SCREEN space: the shape is filled, then clipped and overlaid with world-aligned bands
function shadeV3(x, base, path, cx, cy, r, tones, line) {
  const [lo, mid, hi, top] = tones, SS = base.a, p = new DOMPoint(cx, cy).matrixTransform(x.getTransform());
  x.save(); path(); x.fillStyle = mid; x.fill(); x.clip(); x.setTransform(1, 0, 0, 1, 0, 0);
  const k = r * SS * 0.85, g = x.createLinearGradient(p.x - k, p.y - k, p.x + k, p.y + k);
  for (const [o, c] of [[0, top], [0.2, top], [0.2, hi], [0.42, hi], [0.42, mid], [0.7, mid], [0.7, lo], [1, lo]]) g.addColorStop(o, c);
  x.fillStyle = g; x.fillRect(0, 0, x.canvas.width, x.canvas.height); x.restore();
  if (line) { path(); x.lineWidth = 0.6; x.strokeStyle = line; x.stroke(); }
}
function rrV3(x, X, Y, W, H, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + W, Y, X + W, Y + H, r); x.arcTo(X + W, Y + H, X, Y + H, r); x.arcTo(X, Y + H, X, Y, r); x.arcTo(X, Y, X + W, Y, r); x.closePath(); }
function discV3(x, cx, cy, r, col) { x.fillStyle = col; x.beginPath(); x.arc(cx, cy, r, 0, 6.2832); x.fill(); }

function hullV3(x, base, ramp, w, h, frame, o) {
  const big = !!o.big, tw = big ? 4 : 3.2, hw = w / 2, hh = h / 2, bh = hw - tw + 0.2, M = TANK_V3.metal, T = TANK_V3.track, n = ramp.length, R = i => ramp[Math.max(0, Math.min(n - 1, i))];
  const up = n > 5 ? 1 : 0, toneR = [R(1 + up), R(3 + up), R(4 + up), R(4 + up)], toneT = ['#0a0a0c', '#0a0a0c', '#101012', '#18181c'], toneM = [M[1], M[2], M[3], M[4]];   // black tracks; the 6-step grey ramp is shifted up one step so it keeps the original's brighter grey
  // tracks: lit-from-top-left body, link bars that move a half link per frame, hubs at both ends
  for (const sd of [-1, 1]) {
    const x0 = sd < 0 ? -hw : hw - tw, path = () => rrV3(x, x0, -hh + 0.4, tw, h - 0.8, 1.1);
    shadeV3(x, base, path, x0 + tw / 2, 0, hh, toneT);
    x.save(); path(); x.clip(); const sp = 3, off = frame * sp / 2;
    for (let yy = -hh + off - 1; yy < hh; yy += sp) { x.fillStyle = T[3]; x.fillRect(x0 + 0.35, yy, tw - 0.7, 1.05); }
    x.restore();
    for (const yy of [-hh + 2.7, hh - 2.7]) { discV3(x, x0 + tw / 2, yy, tw * 0.5, M[0]); discV3(x, x0 + tw / 2, yy, tw * 0.36, M[2]); discV3(x, x0 + tw / 2 - 0.25, yy - 0.25, tw * 0.16, M[4]); }
    if (big) for (let yy = -hh + 4.5; yy < hh - 6; yy += 5.5) { const sx = sd < 0 ? x0 : x0 + tw - 1.3; shadeV3(x, base, () => rrV3(x, sx, yy, 1.3, 3.2, 0.4), sx + 0.6, yy + 1.6, 3, toneR, M[0]); }   // thin skirt plates: the tracks stay visible between them
  }
  // hull plate; the long-gun tank has a longer sloped front and a narrower nose
  const gl = o.long ? 9 : 7.2, cs = o.long ? 2.6 : 1.4;
  const body = () => { x.beginPath(); x.moveTo(-bh, -hh + 0.5); x.lineTo(bh, -hh + 0.5); x.lineTo(bh, hh - gl); x.lineTo(bh - cs, hh - 0.35); x.lineTo(-bh + cs, hh - 0.35); x.lineTo(-bh, hh - gl); x.closePath(); };
  shadeV3(x, base, body, 0, 0, hh, toneR, R(0));
  x.save(); body(); x.clip();
  for (const yy of [-hh + 2.4, -hh + 4.4]) { x.fillStyle = R(1); x.fillRect(-bh, yy, bh * 2, 0.8); }          // engine louvres
  x.fillStyle = R(0); x.fillRect(-bh, -hh + 8.2, bh * 2, 0.55); x.fillRect(-bh, hh - gl - 0.5, bh * 2, 0.55);       // seams
  x.fillStyle = R(Math.min(n - 1, 4)); x.fillRect(-bh, hh - gl + 0.2, bh * 2, 0.8);                                 // lit bevel of the front plate
  if (o.long) for (const sd of [-1, 1]) { x.fillStyle = M[2]; x.fillRect(sd * (bh - 0.9) - 0.35, -hh + 1.2, 0.7, h * 0.46); x.fillStyle = M[4]; x.fillRect(sd * (bh - 0.9) - 0.35, -hh + 1.2, 0.7, 0.8); } // tool rails along the deck
  x.restore();
  discV3(x, -bh + 2.2, hh - gl * 0.6, 1.45, R(1)); discV3(x, -bh + 2.2, hh - gl * 0.6, 0.75, M[0]);                    // driver hatch
  discV3(x, bh - 2.1, hh - gl * 0.58, 1.0, M[1]); discV3(x, bh - 2.4, hh - gl * 0.62, 0.45, M[3]);                         // machine gun ball
  for (const sd of [-1, 1]) { discV3(x, sd * (bh - 0.9), hh - 1.7, 0.6, '#fff0a0'); x.fillStyle = M[0]; x.fillRect(sd * (bh - 1.6) - 0.8, -hh + 0.5, 1.6, 1.3); } // headlamps, exhausts
  if (!o.wreck) for (const sd of [-1, 1]) discV3(x, sd * (bh - 0.8), -hh + 3.2, 0.5, TANK_V3.lamp[1]);        // tail lamps
  if (o.wreck) { discV3(x, 0, 0, big ? 4.9 : 4.1, TANK_V3.char[3]); discV3(x, 0, 0, big ? 4.1 : 3.4, '#0a0a0c'); discV3(x, -0.4, 0.3, 1.5, TANK_V3.lamp[1]); discV3(x, -0.5, 0.1, 0.95, TANK_V3.lamp[2]); discV3(x, -0.6, 0, 0.4, TANK_V3.lamp[3]); }
}
function turretV3(x, base, ramp, cw, ch, big, long) {
  const M = TANK_V3.metal, n = ramp.length, R = i => ramp[Math.max(0, Math.min(n - 1, i))], f = long ? 1.02 : big ? 1.4 : 1.12, bw = long ? 2.2 : big ? 3.4 : 2.7, by = 3.4 * f, tip = ch / 2 - 0.5, len = tip - by, toneM = [M[2], M[3], M[4], '#d8dce4'], up = n > 5 ? 1 : 0, toneR = [R(1 + up), R(3 + up), R(4 + up), R(4 + up)];
  // barrel with a lit side, a bore evacuator and a vented muzzle brake
  shadeV3(x, base, () => rrV3(x, -bw / 2, by, bw, len, 0.4), 0, by + len / 2, bw * 3, toneM, M[0]);
  const evp = long ? 0.34 : 0.42, bl = long ? 5.4 : 2.8, bB = long ? bw + 2.0 : bw + 1.6;
  shadeV3(x, base, () => rrV3(x, -bw / 2 - 0.55, by + len * evp, bw + 1.1, long ? 2.0 : 1.3, 0.4), 0, by + len * evp + 0.6, 3, toneM, M[0]);
  if (long) for (const q of [0.6, 0.67]) { x.fillStyle = M[4]; x.fillRect(-bw / 2 - 0.2, by + len * q, bw + 0.4, 0.7); }   // two lit bands
  shadeV3(x, base, () => rrV3(x, -bB / 2, tip - bl, bB, bl, long ? 0.25 : 0.5), 0, tip - bl / 2, 3, toneM, M[0]);
  x.fillStyle = M[0]; if (long) { x.fillRect(-bB / 2, tip - bl * 0.68, bB, 0.6); x.fillRect(-bB / 2, tip - bl * 0.32, bB, 0.6); x.fillRect(-bw / 2, tip - 0.5, bw, 0.5); } else x.fillRect(-bB / 2, tip - bl * 0.55, bB, 0.55);   // brake slits
  shadeV3(x, base, () => rrV3(x, -bw / 2 - (long ? 2.6 : 1.8), by - 0.8, bw + (long ? 5.2 : 3.6), long ? 3.2 : 2.8, 0.9), 0, by + 0.6, 4, toneM, M[0]);   // mantlet
  // bustle, then the turret itself: rounded sloped shape
  shadeV3(x, base, () => rrV3(x, -3.7 * f, -6.6 * f, 7.4 * f, 3.4 * f, 1.0), 0, -5 * f, 4, [R(1 + up), R(2 + up), R(3 + up), R(4 + up)], M[0]);
  const tur = () => { x.beginPath(); x.moveTo(-3.2 * f, -4.8 * f); x.lineTo(3.2 * f, -4.8 * f); x.lineTo(4.6 * f, -3.2 * f); x.lineTo(4.6 * f, 1.4 * f); x.lineTo(2.9 * f, 4.2 * f); x.lineTo(-2.9 * f, 4.2 * f); x.lineTo(-4.6 * f, 1.4 * f); x.lineTo(-4.6 * f, -3.2 * f); x.closePath(); };
  shadeV3(x, base, tur, 0, 0, 5.5 * f, toneR, R(0));
  // cupola with machine gun, loader hatch with the amber lamp, rivets on the front slope
  discV3(x, -2.5 * f, -2.9 * f, 1.3 * f, R(1)); discV3(x, -2.5 * f, -2.9 * f, 0.7 * f, M[1]); discV3(x, -2.75 * f, -3.15 * f, 0.26 * f, M[4]);
  shadeV3(x, base, () => rrV3(x, 0.9 * f, -3.9 * f, 3.2 * f, 2.5 * f, 0.5), 2.5 * f, -2.6 * f, 2.5, [R(1 + up), R(2 + up), R(3 + up), R(4 + up)], R(0));
  x.fillStyle = TANK_V3.lamp[2]; x.fillRect(2.7 * f, -3.6 * f, 1.0, 1.0);
  if (big) for (const sd of [-1, 1]) { x.fillStyle = M[0]; x.fillRect(sd * 5.9 - 0.4, 0.8, 0.9, 2.8); }
}
function makeTankV3(ramp, big, long) {
  const w = big ? 20 : 16, h = long ? 24 : big ? 28 : 22, cw = big ? 16 : 12, ch = long ? 52 : big ? 40 : 30, ev = n => n + (n & 1), dh = ev(Math.ceil(Math.hypot(w, h)) + 2), dt = ev(Math.ceil(Math.hypot(cw, ch)) + 2);
  const pal = [...ramp, ...TANK_V3.metal, ...TANK_V3.track, ...TANK_V3.lamp, '#fff0a0'], palW = [...TANK_V3.char, ...TANK_V3.metal, ...TANK_V3.track, ...TANK_V3.lamp];
  const set = (d, palette, draw) => { const a = []; for (let i = 0; i < 16; i++) a.push(rasterV3(d, i * TAU / 16 - PI / 2, palette, draw)); return a; };
  return {
    hull: [0, 1].map(fr => set(dh, pal, (x, b) => hullV3(x, b, ramp, w, h, fr, { big, long }))),
    tur: set(dt, pal, (x, b) => turretV3(x, b, ramp, cw, ch, big, long)),
    wreck: set(dh, palW, (x, b) => hullV3(x, b, TANK_V3.char, w, h, 0, { big, long, wreck: true }))
  };
}
