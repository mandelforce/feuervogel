// Iron Leviathan hull art (Enigma Run level 1 boss), drawn with the game's own sprite toolkit. Same 80 x 232 size, hull and deck outline as SPR.bship, so the deck
// mask, hit zones and turret positions stay valid. Run it inside the game (a local build: __sf(code)); it returns data: URLs. Hull B (dazzle grey) is the one
// baked into the Enigma art set as 'bship' (index.html, <script id="enigmaArt">); hull A (teak, same detail) stays as the alternative. Yellow and amber are kept
// off the deck on purpose: enemy shots are deep orange.
(() => {
// Iron Leviathan hull concepts, drawn with the game's own sprite toolkit (80 x 232, nose to the south, same hull and deck polygons as SPR.bship).
const HULL = [[40, 232], [24, 214], [10, 186], [4, 150], [4, 40], [10, 14], [22, 2], [58, 2], [70, 14], [76, 40], [76, 150], [70, 186], [56, 214]];
const DECK = [[40, 222], [26, 206], [14, 182], [9, 150], [9, 42], [14, 18], [25, 7], [55, 7], [66, 18], [71, 42], [71, 150], [66, 182], [54, 206]];
const inH = (i, j) => pip(HULL, i + 0.5, j + 0.5), inD = (i, j) => pip(DECK, i + 0.5, j + 0.5);
const px = (x, c, i, j) => { x.fillStyle = c; x.fillRect(i, j, 1, 1); };
const DK = '#16161a', LT = '#d8d6cc';
const TURRETS = [[40, 192], [40, 168], [40, 56], [40, 32]], AAS = [[16, 132], [64, 132], [16, 96], [64, 96]];
// a dark separation line just outside a polygon (the tank art's black part lines), only where it lies on the deck
function sep(x, pts, col = DK, clip = true) {
  let bx = 1e9, by = 1e9, bx2 = -1e9, by2 = -1e9; for (const [a, b] of pts) { bx = Math.min(bx, a); by = Math.min(by, b); bx2 = Math.max(bx2, a); by2 = Math.max(by2, b); }
  for (let j = Math.floor(by) - 1; j <= Math.ceil(by2); j++) for (let i = Math.floor(bx) - 1; i <= Math.ceil(bx2); i++) {
    if (pip(pts, i + 0.5, j + 0.5) || (clip && !inD(i, j))) continue;
    if (pip(pts, i - 0.5, j + 0.5) || pip(pts, i + 1.5, j + 0.5) || pip(pts, i + 0.5, j - 0.5) || pip(pts, i + 0.5, j + 1.5)) px(x, col, i, j);
  }
}
function mirror(f) { f(false); f(true); }
const X = (i, m) => m ? 79 - i : i; // mirrored pixel column
function funnel(x, cx, cy, rx, ry, band) {
  disk(x, DK, cx, cy, Math.max(rx, ry) + 2);
  ellS(x, RP.hull, cx, cy, rx + 1, ry + 1, 0.12);
  for (let j = Math.floor(cy - ry); j <= Math.ceil(cy + ry); j++) for (let i = Math.floor(cx - rx); i <= Math.ceil(cx + rx); i++) {
    const dx = (i + 0.5 - cx) / rx, dy = (j + 0.5 - cy) / ry, d = dx * dx + dy * dy;
    if (d <= 1 && d > 0.74) px(x, band, i, j);
    else if (d <= 0.74 && d > 0.62) px(x, '#5a6678', i, j);
    else if (d <= 0.62 && d > 0.5) px(x, '#3a3a40', i, j);
    else if (d <= 0.5) px(x, d > 0.22 ? '#121214' : '#1e1c1a', i, j);
  }
  px(x, LT, Math.round(cx - rx * 0.62), Math.round(cy - ry * 0.62)); px(x, LT, Math.round(cx - rx * 0.62) + 1, Math.round(cy - ry * 0.62) - 1 + 1);
}
function build(o) {
  return sprite(80, 232, x => {
    // ---- hull, belt armour
    polyS(x, RP.hull, HULL, o.dark ? -0.1 : 0.05, 0.4);
    for (let j = 6; j < 228; j++) for (let i = 0; i < 80; i++) if (inH(i, j) && !inD(i, j)) {
      if (j % 12 === 5) px(x, '#26303c', i, j);                       // plate seams across the belt
      else if (j % 12 === 6 && i < 40) px(x, '#98a8b8', i, j);        // lit lower edge of each plate (light top left)
      else if ((i + j) % 17 === 0) px(x, '#26303c', i, j);            // rivet
    }
    if (o.boot) for (let j = 0; j < 232; j++) for (let i = 0; i < 80; i++) if (inH(i, j) && !inD(i, j) && !inH(i - 1, j) ) px(x, o.boot, i, j);
    // ---- deck
    if (o.deck === 'teak') {
      polyS(x, RP.teak, DECK, 0, 0.3);
      for (let j = 7; j < 223; j++) for (let i = 9; i < 72; i++) {
        if (!inD(i, j)) continue;
        const pl = Math.floor((i - 9) / 3), cell = hash(pl, Math.floor((j + pl * 5) / 19));
        let l = 0.5 + (pl % 2 ? 0.05 : -0.02) + 0.14 * (1 - i / 80) - 0.04 * cell;
        x.fillStyle = pick(RP.teak, clamp(l, 0, 1), i, j); x.fillRect(i, j, 1, 1);
        if ((i - 9) % 3 === 0) px(x, 'rgba(34,22,12,0.42)', i, j);
        if (hash(pl + 3, Math.floor((j + pl * 5) / 19)) > 0.92 && (j + pl * 5) % 19 === 0) px(x, 'rgba(34,22,12,0.55)', i, j); // butt joints
      }
    } else { // dazzle: angular bands of three greys, broken up by cell
      for (let j = 7; j < 223; j++) for (let i = 9; i < 72; i++) {
        if (!inD(i, j)) continue;
        const cx = Math.floor(i / 22), cy = Math.floor(j / 26), h = hash(cx + 7, cy + 11), s = h > 0.5 ? 1 : -1;
        const a = Math.floor((i * 0.86 * s + j * 0.5) / 7 + h * 9), b = Math.floor((i * 0.5 - j * 0.86 * s) / 9 + h * 5);
        const k = ((a % 4) + 4) % 4, m = ((b % 5) + 5) % 5;
        let l = k === 0 ? 0.78 : k === 1 ? 0.5 : k === 2 ? 0.28 : (m < 2 ? 0.62 : 0.36);
        l += 0.1 * (1 - i / 80) - 0.05;
        px(x, pick(RP.hull, clamp(l, 0, 1), i, j), i, j);
      }
    }
    // ---- forecastle: steel plating with capstans, bollards and cable
    const fore = [[13, 178], [67, 178], [66, 183], [54, 206], [40, 222], [26, 206], [14, 183]];
    for (let j = 176; j < 224; j++) for (let i = 8; i < 73; i++) if (inD(i, j) && pip(fore, i + 0.5, j + 0.5)) { x.fillStyle = pick(RP.hull, 0.42 + 0.1 * (1 - i / 80), i, j); x.fillRect(i, j, 1, 1); if ((j - 178) % 6 === 0) px(x, '#26303c', i, j); }
    sep(x, fore, '#1e2632');
    for (const sx of [30, 50]) { for (let k = 0; k < 14; k++) px(x, k % 2 ? '#3a3a40' : DK, sx + Math.round((40 - sx) * k / 26), 206 - k); ellS(x, RP.hull, sx, 207, 3, 3, 0.1); disk(x, DK, sx, 207, 1); }
    mirror(m => { for (const [bx, by] of [[20, 192], [19, 200], [17, 186]]) { const i = X(bx, m); px(x, DK, i, by); px(x, '#98a8b8', i, by - 1); px(x, DK, i + (m ? -2 : 2), by); px(x, '#98a8b8', i + (m ? -2 : 2), by - 1); } });
    disk(x, '#3a3a40', 40, 200, 3); disk(x, DK, 40, 200, 1); px(x, '#98a8b8', 39, 199);
    rect(x, LT, 38, 221, 4, 2);
    // ---- steel hatch covers on the open deck, with a lit edge
    mirror(m => { for (const [hx, hy, hw, hh] of [[14, 22, 8, 5], [13, 62, 7, 6]]) { const a = m ? 80 - hx - hw : hx; if (!inD(a, hy) || !inD(a + hw - 1, hy + hh - 1)) continue; boxS(x, RP.hull, a, hy, hw, hh, 0.02); sep(x, [[a, hy], [a + hw, hy], [a + hw, hy + hh], [a, hy + hh]], DK); px(x, '#98a8b8', a + 1, hy + 1); } });
    // ---- barbette collars (the turret sprites sit on top; only the collar shows)
    for (const [cx, cy] of TURRETS) {
      disk(x, DK, cx, cy, 12); ellS(x, RP.hull, cx, cy, 11, 11, 0.0); disk(x, '#26303c', cx, cy, 9);
      for (let k = 0; k < 24; k++) { const an = k * TAU / 24; px(x, k % 2 ? '#d8d6cc' : DK, Math.round(cx + Math.cos(an) * 10.3), Math.round(cy + Math.sin(an) * 10.3)); }
    }
    // ---- AA gun tubs: steel ring, sandbag dither, ready-use locker
    for (const [cx, cy] of AAS) {
      disk(x, DK, cx, cy, 7); ellS(x, RP.hull, cx, cy, 6.6, 6.6, 0.05); disk(x, '#26303c', cx, cy, 5);
      for (let k = 0; k < 16; k++) { const an = k * TAU / 16 + 0.2; px(x, k % 2 ? '#b8a878' : '#8a7448', Math.round(cx + Math.cos(an) * 6.1), Math.round(cy + Math.sin(an) * 6.1)); }
      const lx = cx < 40 ? cx - 6 : cx + 4; const ly = cy + 8; boxS(x, RP.olive, lx, ly, 6, 3, 0.1); sep(x, [[lx, ly], [lx + 6, ly], [lx + 6, ly + 3], [lx, ly + 3]], DK);
    }
    // ---- soot behind the funnels
    for (let j = 40; j < 80; j++) for (let i = 28; i < 53; i++) if (inD(i, j) && bay(i, j) < 0.55 * (j - 40) / 40 * (1 - Math.abs(i - 40) / 14)) px(x, 'rgba(22,16,12,0.38)', i, j);
    // ---- superstructure: three tiers with chamfers, walkways, glass
    const base = [[26, 90], [54, 90], [56, 94], [56, 144], [52, 148], [28, 148], [24, 144], [24, 94]];
    polyS(x, RP.hull, base, 0.05, 0.3); sep(x, base, DK);
    mirror(m => { for (let j = 94; j < 146; j++) { const i = X(25, m); px(x, j % 2 ? DK : '#6c7e90', i, j); } });
    const t2 = [[27, 98], [53, 98], [53, 138], [47, 143], [33, 143], [27, 138]]; polyS(x, RP.hull, t2, 0.14, 0.3); sep(x, t2, DK, false);
    const t3 = [[31, 116], [49, 116], [49, 136], [45, 141], [35, 141], [31, 136]]; polyS(x, RP.hull, t3, 0.24, 0.3); sep(x, t3, DK, false);
    const t4 = [[34, 126], [46, 126], [46, 135], [43, 139], [37, 139], [34, 135]]; polyS(x, RP.hull, t4, 0.34, 0.3); sep(x, t4, DK, false);
    // glass
    mirror(m => { for (let j = 120; j < 134; j++) px(x, '#24486a', X(31, m), j); px(x, '#d8f2ff', X(31, m), 121); px(x, '#8cc0e0', X(31, m), 127); });
    for (let i = 36; i < 44; i++) px(x, '#24486a', i, 139); px(x, '#d8f2ff', 37, 139); px(x, '#8cc0e0', 41, 139);
    // bridge wings with amber lamps, searchlights
    mirror(m => { const a = m ? 56 : 24; boxS(x, RP.hull, a, 127, 7, 8, 0.1); sep(x, [[a, 127], [a + 7, 127], [a + 7, 135], [a, 135]], DK, false); px(x, '#8cc0e0', X(26, m), 133); px(x, '#d8f2ff', X(26, m), 132); disk(x, '#3a3a40', X(28, m), 106, 2); px(x, '#d8f2ff', X(28, m), 106); });
    // range finder, mattress radar, vents and skylights
    rect(x, DK, 34, 122, 12, 2); px(x, '#98a8b8', 34, 122); px(x, '#98a8b8', 45, 122); rect(x, '#3a3a40', 39, 120, 2, 6); px(x, '#a82a26', 40, 119);
    rect(x, '#1e2632', 33, 108, 14, 6); for (let i = 33; i < 47; i += 2) rect(x, '#6c7e90', i, 108, 1, 6); for (let j = 108; j < 114; j += 2) rect(x, '#6c7e90', 33, j, 14, 1); sep(x, [[33, 108], [47, 108], [47, 114], [33, 114]], DK, false);
    mirror(m => { for (const [vx, vy] of [[28, 112], [27, 100], [29, 93]]) { disk(x, DK, X(vx, m), vy, 2); px(x, '#98a8b8', X(vx, m) + (m ? 1 : -1), vy - 1); } rect(x, '#24486a', X(30, m) - (m ? 2 : 0), 140, 3, 2); });
    // funnels
    funnel(x, 40, 80, 7, 8, o.band1); funnel(x, 40, 98, 6, 6, o.band2);
    // ---- boats on davits
    mirror(m => { for (const by of [104, 150]) { const bx = m ? 66.5 : 12.5; ellS(x, RP.white, bx, by + 6, 3, 7, 0.1); rect(x, '#3a2e26', Math.round(bx) - 1, by + 1, 2, 10); for (const ty of [by + 3, by + 6, by + 9]) rect(x, '#8a7448', Math.round(bx) - 2, ty, 4, 1); rect(x, DK, m ? 70 : 9, by + 1, 1, 2); rect(x, DK, m ? 70 : 9, by + 11, 1, 2); } });
    // ---- stern: depth-charge racks, crane, ensign staff
    mirror(m => { for (const dy of [12, 15]) { const i = X(17, m); disk(x, DK, i, dy, 1); px(x, '#6c7e90', i, dy - 1); disk(x, DK, i + (m ? -4 : 4), dy, 1); } rect(x, DK, X(21, m), 20, 1, 8); });
    rect(x, '#3a3a40', 39, 3, 1, 8); rect(x, '#a82a26', 40, 4, 5, 3); rect(x, LT, 40, 5, 5, 1);
  });
}
const out = {};
const cur = SPR.bship;
const sets = { cur, A: build({ deck: 'teak', band1: '#a82a26', band2: '#d8d6cc' }), B: build({ deck: 'dazzle', band1: '#d8d6cc', band2: '#a82a26', dark: true }) };
for (const k in sets) out[k] = sets[k].c.toDataURL();
out.main = SPR.bMain[4].c.toDataURL(); out.aa = SPR.bAA[4].c.toDataURL(); out.sailor = SPR.sailor[2].c.toDataURL();
out.mainW = [SPR.bMain[4].c.width, SPR.bMain[4].c.height]; out.aaW = [SPR.bAA[4].c.width, SPR.bAA[4].c.height];
out.size = [cur.c.width, cur.c.height];
// pixel check: silhouette of both repaints must equal the original's
const a0 = cur.c.getContext('2d').getImageData(0, 0, cur.c.width, cur.c.height).data;
out.sil = {};
for (const k of ['A', 'B']) { const a1 = sets[k].c.getContext('2d').getImageData(0, 0, cur.c.width, cur.c.height).data; let d = 0; for (let n = 3; n < a0.length; n += 4) if ((a0[n] > 0) !== (a1[n] > 0)) d++; out.sil[k] = d; }
return out;
})()
