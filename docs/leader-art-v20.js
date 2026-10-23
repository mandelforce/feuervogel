/* Fighter leader art v20: four versions of the formation leader on the picked Fw 190 (proposal). The classic leader is the plain fighter tinted red on its wings and nose,
   with a red and white ribbon trailing behind it (the ribbon is drawn by the game, not part of the sprite). Here the leader is the same Fw 190 as its wingmen, so the
   leader is told apart by its markings, as on real aircraft, all readable from above at 16 headings: coloured wing tips, tail, cowl and spinner, or a band behind the wings.
   Same size and headings as the Fw 190, with the one-pixel black cross on its white disc. Needs docs/tank-art-v3.js, docs/vehicle-art-v3.js and docs/fighter-art-v6.js.
     ld_red:    red wing outers and tailplane, a red cowl band (closest to the classic leader).
     ld_nose:   a red spinner and cowl, a red tail fin, white wing tips.
     ld_band:   the yellow Reichsverteidigung band across the fuselage behind the wings, yellow tailplane tips and spinner.
     ld_check:  a black and white chequered cowl band and wing tips. */
const LD_RED = ['#3a0a08', '#7a1410', '#b8261c', '#e04a30'], LD_REDC = '#c8281c', LD_WHITE = '#f2f0e6', LD_BLACK = '#0a0a0c', LD_YEL = '#f0c828';
function ldWing(x) { x.beginPath(); x.ellipse(0, -0.4, 13.2, 3.9, 0, 0, 6.2832); }
function ldTail(x) { x.beginPath(); x.ellipse(0, -9.4, 5.4, 2, 0, 0, 6.2832); }
function ldClip(x, path, fn) { x.save(); path(x); x.clip(); fn(); x.restore(); }
function ldBandCowl(x, col) { x.fillStyle = col; x.fillRect(-2.7, 6.6, 5.4, 0.9); }
const LEADERS_V20 = {
  ld_red(x) {
    ldClip(x, ldWing, () => { x.fillStyle = LD_REDC; x.fillRect(-14, -5, 6.5, 10); x.fillRect(7.5, -5, 6.5, 10); });
    ldClip(x, ldTail, () => { x.fillStyle = LD_REDC; x.fillRect(-6, -12, 12, 5); });
    ldBandCowl(x, LD_REDC);
  },
  ld_nose(x) {
    ldBandCowl(x, LD_REDC); discV3(x, 0, 8.6, 1.0, LD_REDC); discV3(x, 0, 8.6, 0.4, LD_BLACK);
    x.fillStyle = LD_REDC; x.fillRect(-0.45, -11.2, 0.9, 8.5);
    ldClip(x, ldWing, () => { x.fillStyle = LD_WHITE; x.fillRect(-14, -5, 2.2, 10); x.fillRect(11.8, -5, 2.2, 10); });
  },
  ld_band(x) {
    x.fillStyle = LD_YEL; x.fillRect(-2.5, -6.8, 5, 1.4);
    ldClip(x, ldTail, () => { x.fillStyle = LD_YEL; x.fillRect(-6, -12, 2.2, 5); x.fillRect(3.8, -12, 2.2, 5); });
    discV3(x, 0, 8.6, 1.0, LD_YEL); discV3(x, 0, 8.6, 0.4, LD_BLACK);
  },
  ld_check(x) {
    for (let i = 0; i < 4; i++) { x.fillStyle = i % 2 ? LD_BLACK : LD_WHITE; x.fillRect(-2.7 + i * 1.35, 6.6, 1.35, 0.9); }
    ldClip(x, ldWing, () => { for (let k = 0; k < 3; k++) for (let j = 0; j < 4; j++) { x.fillStyle = (k + j) % 2 ? LD_BLACK : LD_WHITE; x.fillRect(-13.6 + k * 1.7, -3.4 + j * 1.7, 1.7, 1.7); x.fillRect(8.5 + k * 1.7, -3.4 + j * 1.7, 1.7, 1.7); } });
    ldClip(x, ldTail, () => { for (let k = 0; k < 3; k++) { x.fillStyle = k % 2 ? LD_BLACK : LD_WHITE; x.fillRect(-5.4 + k * 1.8, -11.4, 1.8, 3.4); x.fillRect(0 + k * 1.8, -11.4, 1.8, 3.4); } });
  }
};
function makeLeadersV20() {
  const ev = n => n + (n & 1), out = {};
  TANK_V3.soft = true;
  TANK_V3.dither = { ramps: [LW.green, LW.grey, RP.yel, RP.glass, TANK_V3.metal, LD_RED], body: LW.green, camo: 0.45 };
  try {
    const pal = palV3(LW.green, LW.grey, RP.yel, ['#f2f0e6', '#e8f6ff'], LD_RED, [LD_REDC, LD_YEL, LD_BLACK]), d = ev(Math.ceil(Math.hypot(28, 26)) + 2);
    for (const [k, over] of Object.entries(LEADERS_V20)) {
      out[k] = [];
      for (let i = 0; i < 16; i++) { const a = i * TAU / 16 - PI / 2; out[k].push(rasterWH(d, d, a, pal, (x, base) => { fw190V6(x, base); over(x); }, crossPostV6('fw190', a, d))); }
    }
  } finally { TANK_V3.soft = false; TANK_V3.dither = null; }
  return out;
}
