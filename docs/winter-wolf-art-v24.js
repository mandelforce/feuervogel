// Winter Wolf twin trains (Enigma Run level 5 boss), drawn with the game's own sprite toolkit on the exact outlines of SPR.bLoco and SPR.bCar. 'Snow and Coal' is baked into the Enigma art set:
// Alpha (white, charcoal tiger stripes and fangs) as bLoco, bCarG, bCarR, bCarF and Omega (charcoal, pale chevrons and white fangs, half a tooth out of phase so the teeth bite into each other)
// as bLoco2, bCarG2, bCarR2, bCarF2: locomotive, gun car, rocket car, flak car. The game turns Omega over whole (its locomotive leads at the top). The other colourways (w2 to w4) and fang
// shapes (lev5f section: saw, big, canine, hook, icicle, jaws) stay as alternatives. Run it inside the game (a local build: __sf(code)); it returns data: URLs.
(() => {
// Winter Wolf twin trains: locomotive 30 x 56 and three cars 26 x 44, same outlines as SPR.bLoco / SPR.bCar, three twin concepts, each with its own livery per train.
const LB = [[3, 0], [27, 0], [28, 6], [28, 42], [22, 50], [8, 50], [2, 42], [2, 6]];
const NB = [[2, 48], [28, 48], [26, 52], [22, 50], [19, 56], [15, 52], [11, 56], [8, 50], [4, 52]];
const px = (x, c, i, j) => { x.fillStyle = c; x.fillRect(i, j, 1, 1); };
const DK = '#16161a', CW = '#d8f2ff', CY = '#8cc0e0';
const lMask = new Uint8Array(30 * 56), cMask = new Uint8Array(26 * 44);
for (const j of [6, 16, 26, 36, 44]) for (let jj = 0; jj < 6; jj++) for (const i of [0, 1, 2, 27, 28, 29]) if (j + jj < 56) lMask[(j + jj) * 30 + i] = 1;
for (let j = 0; j < 56; j++) for (let i = 0; i < 30; i++) if (pip(LB, i + 0.5, j + 0.5) || pip(NB, i + 0.5, j + 0.5)) lMask[j * 30 + i] = 1;
for (let j = 0; j < 50; j++) for (let i = 3; i < 28; i++) if (vnoise(i * 0.18, j * 0.18) > 0.62) lMask[j * 30 + i] = 1; // the old art's dark noise pixels, which stray a little past the outline at the top right corner
for (const j of [4, 14, 26, 36]) for (let jj = 0; jj < 6; jj++) for (const i of [0, 1, 24, 25]) cMask[(j + jj) * 26 + i] = 1;
for (let j = 0; j < 44; j++) for (let i = 2; i < 24; i++) cMask[j * 26 + i] = 1;
const inL = (i, j) => i >= 0 && j >= 0 && i < 30 && j < 56 && lMask[j * 30 + i] === 1;
const inC = (i, j) => i >= 0 && j >= 0 && i < 26 && j < 44 && cMask[j * 26 + i] === 1;
const inLB = (i, j) => pip(LB, i + 0.5, j + 0.5), inCB = (i, j) => i >= 2 && i < 24 && j >= 0 && j < 44;
const WOLF = ['X.........X', 'XX.......XX', 'XXX.....XXX', 'XXXXXXXXXXX', 'XXEXXXXXEXX', '.XXXXXXXXX.', '..XXXXXXX..', '...XXXXX...', '....XXX....'];
function wolf(x, cx, cy, col, eye) { WOLF.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const c = r[i]; if (c === 'X') px(x, col, cx - 5 + i, cy + j); else if (c === 'E') px(x, eye, cx - 5 + i, cy + j); } }); }
const dashRing = (x, cx, cy, r, c1, c2) => { for (let k = 0; k < Math.round(r * 2.4); k++) { const an = k * TAU / Math.round(r * 2.4); px(x, k % 2 ? c1 : c2, Math.round(cx + Math.cos(an) * r), Math.round(cy + Math.sin(an) * r)); } };
function collar(x, cx, cy, o, r = 8) { disk(x, DK, cx, cy, r + 1); ellS(x, o.ramp, cx, cy, r + 0.2, r + 0.2, 0.08); disk(x, '#26303c', cx, cy, r - 1.6); dashRing(x, cx, cy, r - 0.8, o.dash, DK); }
function tub(x, cx, cy, o) { disk(x, DK, cx, cy, 5); ellS(x, o.ramp, cx, cy, 4.4, 4.4, 0.1); disk(x, '#26303c', cx, cy, 3); for (let k = 0; k < 9; k++) { const an = k * TAU / 9; px(x, k % 2 ? '#d8d6cc' : '#8a9ab2', Math.round(cx + Math.cos(an) * 3.9), Math.round(cy + Math.sin(an) * 3.9)); } }
function edges(x, o, inside, w, h) {
  const F = o.fang || 'saw', ph = o.phase || 0;
  const rows = []; for (let j = 0; j < h; j++) { let a = -1, b = -1; for (let i = 3; i < w - 3; i++) if (inside(i, j)) { if (a < 0) a = i; b = i; } rows.push(a < 0 || b - a < 12 ? null : [a, b]); }
  const depth = j => { const t = j + ph;
    if (F === 'saw') { const q = t % 6; return (q < 3 ? q + 1 : 6 - q) * 1; }
    if (F === 'big') { const q = t % 12; return Math.round((q < 6 ? q + 1 : 12 - q) * 0.9); }
    if (F === 'canine') { const q = t % 14; return q < 8 ? Math.round(6 * (1 - Math.abs(q - 3.5) / 4.2)) : Math.round(3 * (1 - Math.abs(q - 11) / 3.6)); }
    if (F === 'hook') { const q = t % 10; return q < 9 ? Math.round((q + 1) * 0.55) : 0; }
    return 0; };
  if (F === 'saw' || F === 'big' || F === 'canine' || F === 'hook') {
    rows.forEach((r, j) => { if (!r) return; const d = depth(j); for (let k = 0; k <= d; k++) for (const [bx, sd] of [[r[0], 1], [r[1], -1]]) { const xx = bx + sd * (1 + k); px(x, k === d && d > 1 ? o.trim2 : o.trim, xx, j); } });
    rows.forEach((r, j) => { if (r && depth(j) > 0 && depth(j) < depth(j - 1 < 0 ? 0 : j - 1) + 2) { } });
  } else { rows.forEach((r, j) => { if (r) { px(x, o.trim, r[0] + 2, j); px(x, o.trim, r[1] - 2, j); } }); }
  if (F === 'icicle' || F === 'jaws') {
    const top = []; for (let i = 3; i < w - 3; i++) if (inside(i, 2)) top.push(i);
    const bot = []; for (let i = 3; i < w - 3; i++) if (inside(i, h - 3)) bot.push(i);
    for (const [cols, sd, y0] of [[top, 1, 0], [bot, -1, h - 1]]) cols.forEach((i, n) => {
      let L = 0; if (F === 'icicle') L = n % 3 === (ph % 3) ? 3 + ((hash(i + ph, 5) * 6) | 0) : 0; else L = (n + (sd < 0 ? 2 : 0)) % 4 < 2 ? 3 - ((n + (sd < 0 ? 2 : 0)) % 4) * 1 : 0;
      for (let k = 0; k < L; k++) { const yy = y0 + sd * (k + (F === 'icicle' ? 1 : 1)); if (inside(i, yy) || yy >= 0) px(x, k === L - 1 ? o.trim2 : (F === 'icicle' ? '#cfe4f6' : o.trim), i, yy); }
    });
  }
}
function paint(x, o, inside, w, h, kind) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (inside(i, j)) { const c = o.pat(i, j, kind); if (c) px(x, c, i, j); } }
function wheels(x, js, xs, ww, hh, o) { for (const j of js) for (const i of xs) { rect(x, '#141416', i, j, ww, hh); px(x, '#6a7078', i + (i < 10 ? 0 : ww - 1), j); } }
function enforce(x, w, h, inside) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const want = inside(i, j), d = x.getImageData(i + 1, j + 1, 1, 1).data[3]; if (want && d < 110) px(x, DK, i, j); else if (!want && d >= 110) x.clearRect(i, j, 1, 1); } }

function buildLoco(o) {
  return sprite(30, 56, x => {
    wheels(x, [6, 16, 26, 36, 44], [0, 27], 3, 6, o);
    polyS(x, o.ramp, LB, 0.05, 0.4); paint(x, o, inLB, 30, 56, 'loco'); edges(x, o, inLB, 30, 50);
    for (const j of [11, 17, 33]) for (let i = 4; i < 26; i++) if (inL(i, j) && !(i > 7 && i < 23 && j === 17)) px(x, 'rgba(0,0,0,0.28)', i, j);
    for (let j = 9; j < 46; j += 6) { px(x, o.rivet, 5, j); px(x, o.rivet, 24, j); }
    // exhaust stacks (rear)
    disk(x, DK, 15, 7, 4); ellS(x, o.ramp, 15, 7, 3.4, 3.4, 0.12); disk(x, '#0a0a0c', 15, 7, 2);
    for (const sx of [9, 20]) { rect(x, DK, sx - 1, 3, 5, 5); boxS(x, o.ramp, sx, 4, 3, 3, 0.15); rect(x, '#0a0a0c', sx + 1, 5, 1, 1); }
    // turret ring, wolf, glass, lamps, plate
    collar(x, 15, 24, o, 8);
    if (o.wolf) wolf(x, 15, 32, o.stencil, CW);
    rect(x, DK, 6, 38, 18, 6); rect(x, '#0a1a2a', 7, 39, 16, 4); for (let i = 9; i < 22; i += 5) px(x, CW, i, 40); px(x, CY, 13, 41); rect(x, '#2a3646', 7, 43, 16, 1);
    for (const lx of [5, 24]) { disk(x, DK, lx, 46, 2); px(x, o.lamp, lx, 46); px(x, o.lamp, lx - (lx < 15 ? 0 : 1), 45); }
    rect(x, o.stencil, 12, 47, 6, 1);
    polyS(x, o.noseRamp, NB, 0.1, 0.4); for (let j = 48; j < 56; j++) for (let i = 2; i < 28; i++) if (pip(NB, i + 0.5, j + 0.5) && j < 53 && ((i + j) >> 1) % 2) px(x, o.noseStripe, i, j);
    enforce(x, 30, 56, inL);
  });
}
function buildCar(o, kind) {
  return sprite(26, 44, x => {
    wheels(x, [4, 14, 26, 36], [0, 24], 2, 6, o);
    boxS(x, o.ramp, 2, 0, 22, 44, 0.05); paint(x, o, inCB, 26, 44, 'car'); boxS(x, o.ramp, 5, 4, 16, 36, -0.12);
    for (let j = 5; j < 40; j++) for (let i = 5; i < 21; i++) { const c = o.pat(i, j, 'car'); if (c && ((i + j) % 2 === 0 || o.solidInner)) px(x, c, i, j); }
    edges(x, o, inCB, 26, 44);
    for (const [a, b] of [[5, 4], [20, 4], [5, 39], [20, 39]]) px(x, o.rivet, a, b);
    for (let j = 6; j < 40; j += 6) { px(x, o.rivet, 3, j); px(x, o.rivet, 22, j); }
    for (let i = 4; i < 22; i++) { px(x, 'rgba(0,0,0,0.3)', i, 4); px(x, 'rgba(0,0,0,0.3)', i, 39); }
    if (kind === 'gun') { collar(x, 13, 22, o, 8); for (const j of [8, 33]) { boxS(x, o.ramp, 8, j, 10, 3, 0.2); rect(x, DK, 8, j, 10, 1); px(x, o.stencil, 12, j + 1); px(x, o.stencil, 13, j + 1); } }
    else if (kind === 'rocket') { collar(x, 13, 22, o, 8); for (const j of [6, 34]) for (let i = 7; i < 19; i++) for (let jj = 0; jj < 3; jj++) px(x, ((i + jj + j) >> 1) % 2 ? '#d8d6cc' : DK, i, j + jj); }
    else { tub(x, 7, 32, o); tub(x, 19, 12, o); rect(x, DK, 10, 21, 6, 3); px(x, CW, 11, 22); px(x, CW, 14, 22); for (let i = 5; i < 21; i += 4) px(x, o.stencil, i, 8 + (i > 12 ? 0 : 24)); }
    rect(x, DK, 6, 0, 14, 2); rect(x, DK, 6, 42, 14, 2); for (const bx of [8, 16]) { px(x, '#98a8b8', bx, 0); px(x, '#98a8b8', bx, 42); }
    enforce(x, 26, 44, inC);
  });
}
const base = { rivet: '#26303c', dash: '#d8d6cc' };
const mk = (f, ph, c) => Object.assign({}, base, { ramp: c.ramp, noseRamp: c.nose, noseStripe: c.noseStripe, trim: c.trim, trim2: c.trim2, stencil: c.stencil, lamp: '#d8f2ff', dash: c.dash || '#d8d6cc', wolf: false, fang: f, phase: ph, pat: c.pat });
const stripes = col => (i, j) => (Math.floor((i * 0.8 + j * 0.6) / 5) % 4 === 0 ? col : null);
const chevrons = col => (i, j) => ((j + Math.abs(i - 14) * 1.2) / 6 | 0) % 3 === 0 ? col : null;
const CHAR = ['#0e1014', '#1c2026', '#2e343e', '#4a525e', '#6a7482'];
const WS = {
  w1: [{ ramp: ['#5a6270', '#8a94a2', '#b8c2ce', '#e0e6ee', '#ffffff'], nose: CHAR, noseStripe: '#f6f9fc', trim: '#2e343e', trim2: '#ffffff', stencil: '#2e343e', pat: stripes('#2e343e') },
       { ramp: CHAR, nose: ['#5a6270', '#8a94a2', '#b8c2ce', '#e0e6ee', '#ffffff'], noseStripe: '#2e343e', trim: '#e8edf2', trim2: '#8a94a2', stencil: '#e8edf2', pat: chevrons('#d8dee6') }],
  w2: [{ ramp: ['#6a5e4a', '#9a8c74', '#c4b89c', '#e6dcc4', '#f8f2e2'], nose: ['#1c1610', '#2e241a', '#4a3a2a', '#6e5a40', '#9a8462'], noseStripe: '#f8f2e2', trim: '#4a3a2a', trim2: '#f8f2e2', stencil: '#4a3a2a', pat: stripes('#5a4a38') },
       { ramp: ['#2a2e34', '#464c54', '#6a7078', '#9aa0a8', '#d4d8de'], nose: ['#464c54', '#6a7078', '#9aa0a8', '#d4d8de', '#ffffff'], noseStripe: '#2a2e34', trim: '#d4d8de', trim2: '#ffffff', stencil: '#f0f4f8', pat: chevrons('#eef2f6') }],
  w3: [{ ramp: ['#6a7a74', '#98a8a2', '#c4d0cc', '#e4ece8', '#ffffff'], nose: ['#161a10', '#262d1a', '#3a4428', '#52603a', '#7a8858'], noseStripe: '#f6f9fc', trim: '#4a5e3a', trim2: '#ffffff', stencil: '#3a4a2a', pat: stripes('#3a4a3a') },
       { ramp: ['#0e1a14', '#1a2e22', '#2a4632', '#40624a', '#5e8466'], nose: ['#6a7a74', '#98a8a2', '#c4d0cc', '#e4ece8', '#ffffff'], noseStripe: '#1a2e22', trim: '#dce8de', trim2: '#8aa890', stencil: '#dce8de', pat: chevrons('#bcd0c0') }],
  w4: [{ ramp: ['#4a4e56', '#7c828c', '#a8aeb8', '#d0d6de', '#f4f6fa'], nose: ['#06070a', '#0e1014', '#181c22', '#262c34', '#3a424e'], noseStripe: '#f4f6fa', trim: '#16161a', trim2: '#ffffff', stencil: '#16161a', pat: (i, j) => (j % 3 === 0 ? '#e4e8ee' : null) },
       { ramp: ['#06070a', '#0e1014', '#181c22', '#262c34', '#3a424e'], nose: ['#4a4e56', '#7c828c', '#a8aeb8', '#d0d6de', '#f4f6fa'], noseStripe: '#16161a', trim: '#c8ced8', trim2: '#ffffff', stencil: '#d0d6de', pat: (i, j) => ((i + j) % 9 === 0 ? '#2a313a' : null) }],
};
const V = {}; for (const k in WS) V[k] = [mk('big', 0, WS[k][0]), mk('big', 6, WS[k][1])];
const out = {};
for (const c in V) out[c] = V[c].map(o => ({ loco: buildLoco(o).c.toDataURL(), cars: ['gun', 'rocket', 'flak'].map(k => buildCar(o, k).c.toDataURL()) }));
out.cur = { loco: SPR.bLoco.c.toDataURL(), car: SPR.bCar.c.toDataURL() };
out.main = SPR.bMain[4].c.toDataURL(); out.aa = SPR.bAA[4].c.toDataURL(); out.rocket = SPR.rocketPod[4].c.toDataURL();
return out;
})()
