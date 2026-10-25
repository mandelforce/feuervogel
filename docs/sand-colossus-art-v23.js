// Sand Colossus hull art (Enigma Run level 2 boss), drawn with the game's own sprite toolkit on the exact outline and both track frames of SPR.fortHull, so the hit zones,
// the turret ring, the four gun mounts and the mortar stay where they are. A (dunkelgelb panzer: hard-edged camo, bolted skirts, tarp roll, jerrycans, fan hatches) is the one baked into
// the Enigma art set as 'fortHull' (index.html, <script id="enigmaArt">); B (olive steel) and C (stone fortress) stay as alternatives. Run it inside the game (a local build:
// __sf(code)); it returns data: URLs. Lamps are white and cyan: enemy shots are orange.
(() => {
// Sand Colossus hull concepts (96 x 112, gun end to the south, two track frames), drawn with the game's sprite toolkit on the same silhouette as SPR.fortHull.
const HP = [[14, 0], [82, 0], [86, 8], [86, 98], [78, 112], [18, 112], [10, 98], [10, 8]];
const px = (x, c, i, j) => { x.fillStyle = c; x.fillRect(i, j, 1, 1); };
const DK = '#16161a', LT = '#d8d6cc', CW = '#d8f2ff', CY = '#8cc0e0';
const TR2 = ['#0c0c0e', '#1c1c20', '#2e2e34', '#46464e', '#62626a'];
const DY2 = ['#2a2010', '#4a3a1e', '#6e5a32', '#927a48', '#b8a068', '#d4c08a'];
const MAINS = [[18, 92], [78, 92]], AAS = [[22, 16], [74, 16]], CORE = [48, 50], MORT = [48, 12];
// the old silhouette without its outline ring, rebuilt from the old shapes
const oMask = new Uint8Array(96 * 112);
for (let j = 2; j < 110; j++) for (let i = 0; i < 96; i++) if (i < 18 || i >= 78) oMask[j * 96 + i] = 1;
for (let j = 0; j < 112; j++) for (let i = 10; i < 86; i++) if (pip(HP, i + 0.5, j + 0.5)) oMask[j * 96 + i] = 1;
const inM = (i, j) => i >= 0 && j >= 0 && i < 96 && j < 112 && oMask[j * 96 + i] === 1;
const quad = (a, b, w, h) => [[a, b], [a + w, b], [a + w, b + h], [a, b + h]];
function sep(x, pts, col = DK) {
  let bx = 1e9, by = 1e9, bx2 = -1e9, by2 = -1e9; for (const [a, b] of pts) { bx = Math.min(bx, a); by = Math.min(by, b); bx2 = Math.max(bx2, a); by2 = Math.max(by2, b); }
  for (let j = Math.floor(by) - 1; j <= Math.ceil(by2); j++) for (let i = Math.floor(bx) - 1; i <= Math.ceil(bx2); i++) {
    if (pip(pts, i + 0.5, j + 0.5) || !inM(i, j)) continue;
    if (pip(pts, i - 0.5, j + 0.5) || pip(pts, i + 1.5, j + 0.5) || pip(pts, i + 0.5, j - 0.5) || pip(pts, i + 0.5, j + 1.5)) px(x, col, i, j);
  }
}
const mirror = f => { f(false); f(true); };
const X = (i, m) => m ? 95 - i : i;

function tracks(x, fr, o) {
  for (const sx of [0, 78]) {
    boxS(x, TR2, sx, 2, 18, 108, -0.05);
    for (let j = 3 + fr * 2; j < 109; j += 4) { rect(x, '#08080a', sx, j, 18, 1); rect(x, '#56565e', sx + 1, j + 1, 2, 1); rect(x, '#56565e', sx + 15, j + 1, 2, 1); if (o.grousers) { px(x, '#8a8a92', sx + 4, j + 1); px(x, '#8a8a92', sx + 12, j + 1); } }
    for (let k = 0; k < 6; k++) { const wy = 12 + k * 17; disk(x, '#1a1a1e', sx + 9, wy, 6); disk(x, '#3e3e46', sx + 9, wy, 5); disk(x, '#2a2a30', sx + 9, wy, 2); rect(x, '#62626a', sx + 7, wy - 3, 1, 1); if (o.hubs) for (let a = 0; a < 6; a++) { const an = a * TAU / 6; px(x, '#98a0a8', Math.round(sx + 9 + Math.cos(an) * 3.4), Math.round(wy + Math.sin(an) * 3.4)); } }
  }
}
function draw(x, fr, o) {
  tracks(x, fr, o);
  polyS(x, o.body, HP, 0.05, 0.35);
  o.surface(x);
  // skirt plates over the inner track edge
  for (const sx of [10, 80]) {
    for (let j = 6; j < 104; j += 14) { boxS(x, o.body, sx, j, 6, 13, 0.1); sep(x, quad(sx, j, 6, 13), DK); px(x, o.bolt, sx + 1, j + 2); px(x, o.bolt, sx + 4, j + 10); }
  }
  // rear engine deck: louvres, two fan hatches, exhausts
  boxS(x, o.body, 24, 2, 48, 20, -0.12); sep(x, quad(24, 2, 48, 20), DK);
  for (let i = 27; i < 70; i += 3) rect(x, 'rgba(0,0,0,0.5)', i, 5, 1, 13);
  for (const hx of [33, 63]) { disk(x, DK, hx, 12, 5); ellS(x, o.body, hx, 12, 4.4, 4.4, 0.1); disk(x, '#16161a', hx, 12, 3); for (let a = 0; a < 3; a++) { const an = a * PI / 3; for (let r = -2; r <= 2; r++) px(x, '#46464e', Math.round(hx + Math.cos(an) * r), Math.round(12 + Math.sin(an) * r)); } }
  for (const ex of [32, 64]) { disk(x, '#0a0a0c', ex, 26, 4); disk(x, '#2a2420', ex, 26, 3); disk(x, '#0a0a0c', ex, 26, 1); px(x, '#98a0a8', ex - 2, 24); }
  disk(x, DK, MORT[0], MORT[1], 8); ellS(x, o.body, MORT[0], MORT[1], 7.2, 7.2, 0.05); disk(x, '#26282c', MORT[0], MORT[1], 6);
  o.deck && o.deck(x);
  // side bins
  for (const [a, b] of [[20, 40], [70, 40], [20, 62], [70, 62]]) { boxS(x, o.body, a, b, 6, 10, 0.1); sep(x, quad(a, b, 6, 10), DK); rect(x, o.stripe, a + 1, b + 4, 4, 1); px(x, o.bolt, a + 1, b + 1); }
  // front glacis: bevelled plate, visors, towing hooks, lamps
  boxS(x, o.body, 18, 84, 60, 22, 0.15); boxS(x, o.body, 22, 88, 52, 6, 0.25); sep(x, quad(18, 84, 60, 22), DK); sep(x, quad(22, 88, 52, 6), DK);
  for (let i = 22; i < 74; i += 6) { rect(x, '#2a2010', i, 96, 4, 3); rect(x, '#4a3a1e', i, 96, 4, 1); }
  mirror(m => { rect(x, DK, X(28, m) - (m ? 5 : 0), 90, 6, 2); px(x, CW, X(29, m), 90); disk(x, DK, X(22, m), 103, 2); px(x, '#98a0a8', X(21, m), 102); });
  rect(x, DK, 44, 89, 8, 3); px(x, '#98a0a8', 45, 89); disk(x, '#26282c', 48, 100, 3); rect(x, DK, 47, 100, 2, 6); // bow gun mount
  for (const sx of [20, 74]) { ellS(x, ['#5a6a78', '#8ca0b0', '#d8f2ff', '#ffffff'], sx, 106, 2, 1.5, 0.4); }
  for (let j = 4; j < 108; j += 6) { rect(x, o.rim, 12, j, 1, 1); rect(x, o.rim, 83, j, 1, 1); }
  // rings: core turret, side guns, AA mounts
  disk(x, DK, CORE[0], CORE[1], 23); ellS(x, o.body, CORE[0], CORE[1], 22, 22, 0.02); disk(x, '#1e1810', CORE[0], CORE[1], 19); disk(x, '#3a2e1a', CORE[0], CORE[1], 17);
  for (let k = 0; k < 28; k++) { const an = k * TAU / 28; px(x, k % 2 ? LT : DK, Math.round(CORE[0] + Math.cos(an) * 20.6), Math.round(CORE[1] + Math.sin(an) * 20.6)); }
  for (const [a, b] of MAINS) { disk(x, DK, a, b, 8); ellS(x, o.body, a, b, 7.2, 7.2, 0.05); disk(x, '#3a2e1a', a, b, 6); for (let k = 0; k < 12; k++) { const an = k * TAU / 12; px(x, k % 2 ? LT : DK, Math.round(a + Math.cos(an) * 6.9), Math.round(b + Math.sin(an) * 6.9)); } }
  for (const [a, b] of AAS) { disk(x, DK, a, b, 7); ellS(x, o.body, a, b, 6.2, 6.2, 0.05); disk(x, '#3a2e1a', a, b, 5); o.tub && o.tub(x, a, b); }
  cross(x, 30, 72); cross(x, 66, 72);
  // keep exactly the old silhouette
  for (let j = 0; j < 112; j++) for (let i = 0; i < 96; i++) { const want = inM(i, j), d = x.getImageData(i + 1, j + 1, 1, 1).data[3]; if (want && d < 110) px(x, DK, i, j); else if (!want && d >= 110) x.clearRect(i, j, 1, 1); }
}
const build = (fr, o) => sprite(96, 112, x => draw(x, fr, o));
const dither = (x, i, j, col, a) => { if (inM(i, j) && bay(i, j) < a) px(x, col, i, j); };
// A: dunkelgelb panzer: hard-edged camo, bolts, stowage, tarp roll
const OA = {
  body: DY2, bolt: '#2a2010', stripe: '#5a4a2a', rim: '#d4c08a', hubs: true, grousers: true,
  surface(x) {
    for (let j = 0; j < 112; j++) for (let i = 10; i < 86; i++) { if (!inM(i, j)) continue; const n = vnoise(i * 0.07 + 17, j * 0.1), m = vnoise(i * 0.11 + 40, j * 0.08 + 9); if (n > 0.64) px(x, pick(['#2a3018', '#3a4222', '#4a5430'], 0.45, i, j), i, j); else if (m < 0.26) px(x, pick(['#3a2a16', '#5a4a2a', '#6e5a32'], 0.5, i, j), i, j); }
    for (let i = 12; i < 84; i++) if ((i - 12) % 12 !== 0) { px(x, 'rgba(0,0,0,0.3)', i, 24); px(x, 'rgba(0,0,0,0.3)', i, 82); }
    for (const [a, b] of [[16, 28], [78, 28], [16, 78], [78, 78]]) px(x, '#2a2010', a, b);
    for (let j = 26; j < 82; j++) for (let i = 10; i < 86; i++) if (hash(i, j) < 0.04) px(x, '#d4c08a', i, j);
  },
  deck(x) {
    rect(x, '#6e5a32', 28, 79, 40, 3); rect(x, '#927a48', 28, 79, 40, 1); rect(x, '#3a2a16', 28, 82, 40, 1); for (const sx of [32, 48, 64]) { rect(x, '#2a2010', sx, 79, 1, 4); } // tarp roll with straps
    mirror(m => { for (let q = 0; q < 2; q++) { const a = X(80, m) - (m ? 3 : 0), b = 38 + q * 6; boxS(x, ['#1a2210', '#2e3a1a', '#4a5a2c', '#6a7c3c'], a, b, 4, 5, 0.1); px(x, LT, a + 1, b + 2); px(x, LT, a + 2, b + 2); } });
    for (let j = 28; j < 36; j += 2) rect(x, '#3a2a16', 88 - 3, j, 4, 1);
    for (let k = 0; k < 14; k++) px(x, k % 2 ? '#2a2010' : '#5a4a2a', 22 + k, 85);   // spare track links along the glacis edge
  },
  tub(x, cx, cy) { for (let k = 0; k < 10; k++) { const an = k * TAU / 10; px(x, k % 2 ? '#b8a068' : '#6e5a32', Math.round(cx + Math.cos(an) * 5.4), Math.round(cy + Math.sin(an) * 5.4)); } },
};
// B: olive-grey weathered steel with sand dust, hazard marked hatches (the best contrast for orange shots)
const OB = {
  body: ['#161a10', '#262d1a', '#3a4428', '#52603a', '#7a8858', '#9aa874'], bolt: '#101408', stripe: '#d8d6cc', rim: '#9aa874', hubs: true, grousers: false,
  surface(x) {
    for (let j = 0; j < 112; j++) for (let i = 10; i < 86; i++) { if (!inM(i, j)) continue; if ((j % 14 === 0 && i > 12 && i < 84) || (i % 22 === 8 && j > 22 && j < 84)) px(x, '#161a10', i, j); else if ((j % 14 === 1 && i > 12 && i < 84)) px(x, '#7a8858', i, j); else if ((i + j * 3) % 19 === 0 && j > 22) px(x, '#161a10', i, j); }
    for (let k = 0; k < 40; k++) { const i = 14 + ((k * 37) % 70), j0 = 24 + ((k * 53) % 40); for (let t = 0; t < 12; t++) dither(x, i, j0 + t, '#d4c08a', 0.5 * (1 - t / 12)); }  // sand streaks
    for (let j = 84; j < 112; j++) for (let i = 18; i < 78; i++) dither(x, i, j, '#d4c08a', 0.12);
  },
  deck(x) {
    mirror(m => { const a = X(36, m) - (m ? 9 : 0); boxS(x, ['#161a10', '#262d1a', '#3a4428', '#52603a', '#7a8858'], a, 70, 10, 8, 0.1); sep(x, quad(a, 70, 10, 8), '#0a0c06'); for (let t = 0; t < 10; t++) px(x, ((a + t) >> 1) % 2 ? LT : DK, a + t, 76); });
    for (let i = 32; i < 64; i += 4) rect(x, '#0a0c06', i, 80, 2, 2);
  },
  tub(x, cx, cy) { for (let k = 0; k < 10; k++) { const an = k * TAU / 10; px(x, k % 2 ? '#9aa874' : '#3a4428', Math.round(cx + Math.cos(an) * 5.4), Math.round(cy + Math.sin(an) * 5.4)); } },
};
// C: fortress on tracks: pale stone armour wings, sandbag walls, camouflage net
const OC = {
  body: ['#4a4036', '#6a5e50', '#8a7c68', '#aa9c84', '#c8baa0', '#e2d6bc'], bolt: '#3a3228', stripe: '#6a5e50', rim: '#e2d6bc', hubs: false, grousers: true,
  surface(x) {
    for (let j = 0; j < 112; j++) for (let i = 10; i < 86; i++) { if (!inM(i, j)) continue; if (hash(i >> 2, j >> 2) > 0.8) px(x, pick(['#4a4036', '#6a5e50', '#8a7c68'], 0.35, i, j), i, j); if (j % 28 === 0) px(x, '#4a4036', i, j); }
    // net over the rear deck: diamond mesh, dark green
    for (let j = 24; j < 38; j++) for (let i = 24; i < 72; i++) if (((i + j) % 6 === 0 || (i - j + 100) % 6 === 0) && inM(i, j)) px(x, '#2a3018', i, j);
  },
  deck(x) {
    mirror(m => { const w = [[X(12, m), 28], [X(26, m), 34], [X(26, m), 80], [X(12, m), 84]]; polyS(x, ['#4a4036', '#6a5e50', '#8a7c68', '#aa9c84', '#c8baa0'], w, 0.15, 0.4); sep(x, w, DK); for (let j = 38; j < 78; j += 6) { rect(x, '#2a2218', Math.min(X(14, m), X(24, m)), j, 8, 2); rect(x, '#6a5e50', Math.min(X(14, m), X(24, m)), j, 8, 1); } });
    for (let i = 20; i < 76; i += 4) { ellS(x, ['#6a5a30', '#8a7848', '#b8a468', '#d4c690'], i + 1, 107, 2.2, 1.6, 0.1); }   // sandbag wall along the glacis
  },
  tub(x, cx, cy) { for (let k = 0; k < 12; k++) { const an = k * TAU / 12 + 0.2; px(x, k % 2 ? '#d4c690' : '#8a7848', Math.round(cx + Math.cos(an) * 5.6), Math.round(cy + Math.sin(an) * 5.6)); } },
};
const out = {};
const sets = { cur: SPR.fortHull, A: [build(0, OA), build(1, OA)], B: [build(0, OB), build(1, OB)], C: [build(0, OC), build(1, OC)] };
for (const k in sets) out[k] = sets[k].map(s => s.c.toDataURL());
out.main = SPR.dGun[4].c.toDataURL(); out.aa = SPR.bAA[4].c.toDataURL(); out.mortar = SPR.mortar[4].c.toDataURL(); out.core = SPR.fortTur[4].c.toDataURL();
out.dims = { hull: [SPR.fortHull[0].c.width, SPR.fortHull[0].c.height], main: [SPR.dGun[4].c.width, SPR.dGun[4].c.height], aa: [SPR.bAA[4].c.width, SPR.bAA[4].c.height], mortar: [SPR.mortar[4].c.width, SPR.mortar[4].c.height], core: [SPR.fortTur[4].c.width, SPR.fortTur[4].c.height] };
out.sil = {};
for (const k of ['A', 'B', 'C']) { let d = 0; for (const f of [0, 1]) { const a0 = SPR.fortHull[f].c.getContext('2d').getImageData(0, 0, 98, 114).data, a1 = sets[k][f].c.getContext('2d').getImageData(0, 0, 98, 114).data; for (let n = 3; n < a0.length; n += 4) if ((a0[n] > 0) !== (a1[n] > 0)) d++; } out.sil[k] = d; }
return out;
})()
