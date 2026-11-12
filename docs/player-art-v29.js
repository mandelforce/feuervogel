/* Player art v29: mockups for the player ships (proposal, not wired into the game).
   Drawn with the game's own sprite toolkit (sprite, pip, clamp, PI from index.html), at game size, nose up, in the three banking frames (-1, 0, 1).
     the seven existing ships, three variations each: A polish (same silhouette and size), B rework, C bold redesign
     The Moth as a player ship: three variations, each at two candidate sizes (M and L) between a player ship and the boss hull (SPR.protoMoth, 57 x 41)
     four new ships, two variations each: Eisvogel (kingfisher), Schwalbe (swallow), Hornisse (hornet), Libelle (dragonfly)
   makePlayersV29() returns a list of { id, ship, v, name, idea, w, h, frames: [left, level, right], flames: [[ox, top], ...], fc, hit }.
   flames: where the engine flames start, measured from the sprite's middle like drawPlayer's own table; fc: the three flame colours.

   How a ship is drawn: every part is described once, for one half, in half coordinates (a = columns out from the centre line, y = row). The renderer mirrors it,
   so the level frame is symmetric pixel for pixel, and squeezes the wing on the inside of a turn (0.7) the way the game's own ships do. Parts are shapes, not
   bitmaps, so a banked wing is drawn afresh and stays sharp. Look: the Enigma art's rules, as far as they fit a bird: one light from the top left, a lit leading
   edge and a shadowed trailing edge on every wing, pure dark separation lines round every part that lies on another, little dither, bold detail only. */
function makePlayersV29() {
  const K = '#0c0a10';
  const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const dth = (i, j) => (B4[(j & 3) * 4 + (i & 3)] + 0.5) / 16 - 0.5;
  // a tone of a ramp with a little ordered dither (d = 1 is the game's full raster, 0 is flat bands)
  const Q = (ramp, l, e, d = 0.5) => { const n = ramp.length, v = Math.round(clamp(l, 0, 1) * (n - 1) + dth(e.i, e.j) * d); return ramp[v < 0 ? 0 : v >= n ? n - 1 : v]; };
  const lit = e => e.s ? -0.05 : 0.05; // the light comes from the left

  function build(W, H, bank, draw, o = {}) {
    const c = (W - 1) / 2, fac = [bank < 0 ? 0.7 : bank > 0 ? 1.04 : 1, bank > 0 ? 0.7 : bank < 0 ? 1.04 : 1], sb = Math.round(bank * 0.6);
    const buf = new Array(W * H).fill(null);
    const put = (i, j, col, over) => { if (col && i >= 0 && i < W && j >= 0 && j < H && (!over || buf[j * W + i])) buf[j * W + i] = col; };
    const A = (i, w) => { const k = i - c - (w ? 0 : sb), s = k < 0 ? 0 : 1; return [s, Math.abs(k) / (w ? fac[s] : 1)]; };
    const shape = (inside, shade, q = {}) => {
      const w = !!q.w, m = new Uint8Array(W * H);
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const [s, a] = A(i, w); if (inside(a, j + 0.5, s)) m[j * W + i] = 1; }
      const M = (i, j) => i >= 0 && i < W && j >= 0 && j < H && m[j * W + i] === 1;
      if (q.sep) for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (!m[j * W + i] && buf[j * W + i] && (M(i - 1, j) || M(i + 1, j) || M(i, j - 1) || M(i, j + 1))) buf[j * W + i] = q.sep === true ? K : q.sep;
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        if (!m[j * W + i]) continue;
        const [s, a] = A(i, w), sg = s ? 1 : -1;
        const e = { i, j, s, lead: !M(i, j - 1), trail: !M(i, j + 1), outer: !M(i + sg, j), inner: a > 0.6 && !M(i - sg, j), lead2: M(i, j - 1) && !M(i, j - 2), trail2: M(i, j + 1) && !M(i, j + 2) };
        put(i, j, shade(a, j, e));
      }
    };
    const g = {
      W, H, bank, K,
      poly: (pts, shade, q) => shape((a, y) => pip(pts, a, y), shade, q),
      ell: (ca, cy, ra, ry, shade, q) => shape((a, y) => ((a - ca) / ra) ** 2 + ((y - cy) / ry) ** 2 <= 1, shade, q),
      // a dot on both sides (a columns out); lines and dots only paint over the ship unless q.free
      dot: (a, y, col, q = {}) => { for (const sg of a === 0 ? [1] : [-1, 1]) put(Math.round(c + (q.w ? 0 : sb) + sg * a * (q.w ? fac[sg < 0 ? 0 : 1] : 1)), Math.round(y), col, !q.free); },
      line: (a0, y0, a1, y1, col, q) => { const n = Math.ceil(Math.max(Math.abs(a1 - a0), Math.abs(y1 - y0)) * 1.5) || 1; for (let k = 0; k <= n; k++) g.dot(a0 + (a1 - a0) * k / n, y0 + (y1 - y0) * k / n, col, q); },
      px: (list, q) => { for (const [a, y, col] of list) g.dot(a, y, col, q); }
    };
    draw(g);
    const pad = o.outline === false ? 1 : 0; // ships without an outline keep an empty border, so every sprite has the same frame
    return sprite(W + pad * 2, H + pad * 2, x => { for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (buf[j * W + i]) { x.fillStyle = buf[j * W + i]; x.fillRect(i + pad, j + pad, 1, 1); } }, { outline: o.outline !== false, oc: o.oc || '#120e1a' });
  }

  const out = [];
  const FL = { fire: ['#ff7a3a', '#ffb03a', '#fff0a0'], ember: ['#ff4a1a', '#ffb838', '#fff6c0'], teal: ['#18c4b0', '#5ff0dc', '#e0fff8'], violet: ['#8466dc', '#bba4ff', '#e8dcff'], ice: ['#3aa0e8', '#8ad8ff', '#f0fcff'], amber: ['#e89018', '#ffd050', '#fff8c8'] };
  function add(ship, v, name, idea, W, H, draw, o = {}) {
    const frames = [-1, 0, 1].map(b => build(W, H, b, draw, o));
    out.push({ id: ship + ' ' + v, ship, v, name, idea, w: frames[1].w, h: frames[1].h, frames, flames: o.flames || [[-3, 12], [3, 12]], fc: o.fc || FL.fire, hit: o.hit || 'unchanged', size: o.size || '' });
  }

  /* ---------- shared parts ---------- */
  const GLASS = ['#0c3236', '#14605c', '#21988a', '#4ccfae', '#a8f6dc'];
  // a nozzle: a dark mouth with a glowing rim, where a flame starts
  const nozzle = (g, a, y, glow, q) => { g.dot(a, y - 1, K, q); g.dot(a, y, glow[0], q); };
  // glass in a dark frame with one white glint (a canopy on the back)
  const canopy = (g, y0, y1, hw, G = GLASS) => {
    g.poly([[-1, y0 - 1], [hw + 1, y0 + 1], [hw + 1, y1 - 2], [-1, y1 + 1]], () => K);
    g.poly([[-1, y0], [hw, y0 + 1.5], [hw, y1 - 2.5], [-1, y1]], (a, y, e) => Q(G, 0.75 - (y - y0) / (y1 - y0) * 0.6 + (e.s ? -0.1 : 0.1), e, 0.3));
    g.dot(0, y0 + 1, '#f0fff8');
  };
  // feather lines: from each notch of the trailing edge a short dark line toward the shoulder
  const quills = (g, notches, to, col, len = 0.55) => { for (const [a, y] of notches) g.line(a, y - 1, a + (to[0] - a) * len, y + (to[1] - y) * len, col, { w: 1 }); };

  /* ================= Feuervogel / Nachtvogel / Rooster: the original's drawing ================= */
  const WING_FV = [[2, 8], [8, 10], [13, 14], [16, 19], [17, 27], [14, 23], [12, 29], [10, 24], [8, 28], [6, 23], [4, 26], [2, 21]];
  const SK = {
    feuer: { PA: ['#1c1238', '#34226a', '#563aa4', '#8466dc', '#bba4ff', '#e8dcff'], PC: GLASS, EDGE: GLASS, bar: ['#f4f2e8', '#b8b4c8', '#16141c'], eye: ['#ff5a3a', '#ffd08a'], beak: '#1a0a14', glow: ['#4ccfae', '#e8fff6'] },
    nacht: { PA: ['#06050a', '#0e0c16', '#171526', '#241f3c', '#352e58', '#4b4278'], PC: ['#171526', '#2e2750', '#4b4278', '#6e62a8', '#a99cdc'], EDGE: ['#2e2750', '#4b4278', '#6e62a8', '#a99cdc', '#d8ccff'], bar: ['#8a7cc8', '#4b4278', '#06050a'], eye: ['#ff5a3a', '#ffd08a'], beak: '#06050a', glow: ['#a99cdc', '#f0e8ff'] },
    gold: { PA: ['#3a2208', '#6a4210', '#a87018', '#e0a830', '#f8d870', '#fff4c0'], PC: ['#4a2a10', '#8a6018', '#c09030', '#f0c860', '#fff0b0'], EDGE: ['#6a2a10', '#c05a1a', '#f08a2a', '#ffc060', '#ffe0a0'], bar: ['#f4f2e8', '#c8b890', '#1a1a1e'], eye: ['#1a0a14', '#fff4c0'], beak: '#f0a020', glow: ['#ffc060', '#fff4c0'], TAIL: ['#0a1a18', '#123a34', '#1e6a58', '#3aa088', '#8ae0c0'] }
  };
  const RED = ['#7a1010', '#a01c1c', '#d83a2a', '#ff6a4a', '#ffb090'];
  const roosterHead = (g, P) => {
    g.poly([[-1, 0], [2, 3], [3, 7], [1, 10], [-1, 10]], (a, y, e) => Q(P.PA, 0.72 - a * 0.07 * (e.s ? 1 : 0.3) - y * 0.012, e, 0.3));
    g.px([[0, 0, '#ffd060'], [1, 0, '#f0a020'], [0, 1, '#c07010']]);
    for (let y = 2; y <= 8; y++) g.dot(0, y, y % 2 ? RED[2] : RED[3]);
    g.px([[1, 2, RED[3]], [1, 4, RED[3]], [1, 3, RED[1]], [1, 6, RED[2]], [2, 5, P.eye[0]], [2, 6, RED[1]]]);
  };
  function fvPolish(g, P) {
    const gold = !!P.TAIL, T = P.TAIL || P.PA;
    g.poly(gold ? [[-1, 22], [2, 22], [9, 35], [5, 33], [3, 30], [-1, 34]] : [[-1, 22], [2, 22], [7, 35], [3, 31], [-1, 29]], (a, y, e) => e.lead || (e.inner && gold) ? T[3] : e.outer ? T[1] : Q(T, 0.5 - (y - 22) * 0.015 + lit(e), e, 0.4));
    g.poly(WING_FV, (a, y, e) => {
      if (e.lead && y < 20) return Q(P.EDGE, 0.85 - (a > 12 ? 0.2 : 0), e, 0.3);
      if (e.lead2 && y < 19) return P.PA[4];
      if (e.trail) return P.PA[1];
      if (y >= 13 && y < 22 && a > 9.2 && a <= 11.2) return y === 21 ? P.bar[1] : P.bar[0];
      if (y >= 13 && y < 22 && a > 7.2 && a <= 9.2) return P.bar[2];
      return Q(P.PA, 0.62 - a * 0.012 - (y - 9) * 0.02 + lit(e), e, 0.45);
    }, { w: 1 });
    quills(g, [[14, 23], [10, 24], [6, 23]], [7, 8], P.PA[1], 0.3);
    g.poly([[3, 20], [6, 25], [4, 25], [2, 23]], (a, y, e) => Q(P.PC, 0.7 - (y - 20) * 0.08, e, 0.3), { sep: 1 });
    g.ell(0, 16, 3.6, 10, (a, y, e) => Q(P.PA, 0.6 + (e.s ? -a * 0.09 : a * 0.02) - (y - 12) * 0.012, e, 0.35), { sep: 1 });
    for (let y = 10; y < 25; y++) g.dot(0, y, Q(P.PC, 0.95 - (y - 10) * 0.04, { i: 0, j: y }, 0));
    if (gold) roosterHead(g, P);
    else {
      g.poly([[-1, 0], [2, 3], [3, 7], [1, 10], [-1, 10]], (a, y, e) => Q(P.PA, 0.78 - a * 0.07 * (e.s ? 1 : 0.3) - y * 0.015, e, 0.3));
      g.px([[0, 0, P.beak], [0, 1, P.beak], [0, 2, P.beak], [1, 2, P.beak], [2, 5, P.eye[0]], [1, 6, P.eye[1]]]);
    }
    nozzle(g, 3, 28, P.glow);
  }
  // B: sharper swept wings with three pointed primaries, crystal engine pods in the wing roots, a forked tail, a crystal canopy
  function fvRework(g, P) {
    const gold = !!P.TAIL, T = P.TAIL || P.PA;
    g.poly([[-1, 23], [3, 24], [6, 37], [3, 34], [1, 30], [-1, 30]], (a, y, e) => e.inner || e.lead ? T[4] : e.outer ? T[1] : Q(T, 0.55 - (y - 23) * 0.02, e, 0.3));
    g.poly([[2, 9], [7, 9], [13, 12], [17, 17], [18, 24], [18, 30], [15, 25], [14, 31], [11, 25], [10, 30], [7, 24], [5, 27], [2, 22]], (a, y, e) => {
      if (e.lead && y < 24) return Q(P.EDGE, 0.9, e, 0);
      if (e.lead2 && y < 22) return a < 12 ? P.EDGE[2] : P.PA[4];
      if (e.trail || e.outer) return P.PA[1];
      const band = y - a * 0.45; // tone bands that follow the sweep
      return Q(P.PA, (band < 8 ? 0.72 : band < 12 ? 0.58 : 0.42) + lit(e), e, 0.25);
    }, { w: 1 });
    quills(g, [[15, 25], [11, 25], [7, 24]], [5, 10], P.PA[0], 0.45);
    for (const [a, y] of [[18, 29], [14, 30], [10, 29]]) g.dot(a, y, P.EDGE[3], { w: 1 });
    g.poly([[4.4, 20], [6.6, 20], [6.6, 29], [4.4, 29]], (a, y, e) => e.lead ? P.PA[4] : y > 26 ? P.PC[2] : (a < 5.5) === !e.s ? P.PA[2] : P.PA[1], { sep: 1 });
    g.dot(5, 28, P.glow[0]); g.dot(6, 28, P.glow[0]);
    g.ell(0, 17, 3.2, 10.5, (a, y, e) => Q(P.PA, 0.62 + (e.s ? -a * 0.1 : a * 0.02) - (y - 12) * 0.012, e, 0.3), { sep: 1 });
    canopy(g, 13, 20, 1, P.PC.length === 5 ? P.PC : GLASS);
    for (let y = 21; y < 27; y++) g.dot(0, y, P.PC[3]);
    if (gold) roosterHead(g, P);
    else {
      g.poly([[-1, 0], [2, 3], [3, 7], [2, 10], [-1, 11]], (a, y, e) => Q(P.PA, 0.8 - a * 0.07 * (e.s ? 1 : 0.3) - y * 0.015, e, 0.3));
      g.px([[0, 0, P.beak], [0, 1, P.beak], [0, 2, P.beak], [1, 2, P.beak], [2, 5, P.eye[0]], [1, 6, P.eye[1]], [0, 8, P.PC[3]]]);
      g.line(3, 8, 5, 11, P.EDGE[3], { free: 1 }); g.dot(5, 11, P.EDGE[4], { free: 1 }); // swept-back crest spikes
    }
  }
  for (const [ship, P, fc] of [['Feuervogel', SK.feuer, FL.fire], ['Nachtvogel', SK.nacht, FL.violet], ['Rooster', SK.gold, FL.fire]]) {
    add(ship, 'A', 'Polish', 'The same drawing, cleaned up: dark lines round the body, a lit leading edge, quills, glowing nozzles.', 35, 36, g => fvPolish(g, P), { fc });
    if (ship === 'Feuervogel') add(ship, 'B', 'Rework', 'Three pointed primaries, crystal engine pods in the wing roots, a forked tail and a crystal canopy.', 37, 38, g => fvRework(g, P), { fc, flames: [[-5, 11], [5, 11]], size: '+2 px each way' });
  }
  /* Feuervogel C: forward-swept crescent wings with crystal blades, a bare glowing core, three tail streamers */
  add('Feuervogel', 'C', 'Bold', 'Forward-swept crescent wings tipped with crystal blades, a bare glowing core and three long tail streamers.', 41, 40, g => {
    const P = SK.feuer;
    g.poly([[1, 25], [3.4, 25], [6.6, 39], [5.4, 39], [2, 30]], (a, y, e) => y > 35 ? P.PC[3] : e.outer ? P.PA[2] : P.PA[3]);
    g.poly([[-1, 25], [1.2, 25], [0.6, 39], [-1, 39]], (a, y, e) => y > 35 ? P.PC[4] : P.PA[3]);
    g.poly([[2, 12], [6, 10], [11, 9], [16, 6], [19, 2], [20, 6], [19, 12], [16, 17], [12, 20], [9, 25], [7, 21], [5, 26], [2, 22]], (a, y, e) => {
      if (e.lead) return a > 15 ? P.PC[4] : P.PA[5];
      if (e.lead2) return P.PA[4];
      if (e.trail) return P.PA[1];
      const d = y - 20 + a * 0.75;
      return Q(P.PA, (d < -2 ? 0.7 : d < 3 ? 0.55 : 0.4) + lit(e), e, 0.25);
    }, { w: 1 });
    g.poly([[16.5, 6], [19, 1], [20.4, 6], [19, 12.5]], (a, y, e) => e.outer ? P.PC[4] : Q(P.PC, 0.85 - (y - 1) * 0.05, e, 0.2), { w: 1, sep: 1 });
    quills(g, [[9, 25], [5, 26]], [4, 10], P.PA[0], 0.5);
    g.line(4, 13, 14, 10, P.PA[2], { w: 1 }); g.line(4, 16, 13, 15, P.PA[1], { w: 1 });
    g.ell(0, 18, 3.2, 11, (a, y, e) => Q(P.PA, 0.6 + (e.s ? -a * 0.1 : a * 0.02) - (y - 12) * 0.01, e, 0.3), { sep: 1 });
    g.ell(0, 18, 2.6, 2.6, () => K); g.ell(0, 18, 1.6, 1.6, (a, y, e) => e.lead ? '#e8fff6' : P.PC[3]); g.dot(0, 18, '#ffffff');
    g.dot(0, 22, P.PC[3]); g.dot(0, 24, P.PC[2]); g.dot(0, 14, P.PC[3]); g.dot(0, 12, P.PC[2]);
    g.poly([[-1, 3], [2, 6], [3, 9], [1, 12], [-1, 12]], (a, y, e) => Q(P.PA, 0.8 - a * 0.07 * (e.s ? 1 : 0.3) - (y - 3) * 0.015, e, 0.3));
    g.px([[0, 3, P.beak], [0, 4, P.beak], [1, 5, P.beak], [2, 8, P.eye[0]], [1, 9, P.eye[1]]]);
    nozzle(g, 3, 26, P.glow);
  }, { flames: [[-3, 8], [3, 8]], size: '41 x 40 art (+6 wide, +4 tall)', hit: 'keep the hit box; the wing tips reach further forward' });

  /* Nachtvogel B: a night bird with a bat's scalloped wings and glowing violet ribs */
  add('Nachtvogel', 'B', 'Rework', 'Scalloped trailing edge between three glowing violet ribs, a spade tail, ember eyes.', 37, 37, g => {
    const P = SK.nacht;
    g.poly([[-1, 23], [2, 24], [4, 31], [1, 36], [-1, 36]], (a, y, e) => e.outer ? P.PA[5] : P.PA[3]);
    g.poly([[2, 8], [8, 8], [14, 11], [18, 17], [18, 26], [16, 23], [14, 23], [12, 28], [10, 24], [8, 24], [6, 29], [4, 25], [2, 25]], (a, y, e) => {
      if (e.lead) return a > 13 ? P.EDGE[2] : P.EDGE[3];
      if (e.trail) return P.PA[0];
      return Q(P.PA, 0.55 - (y - 9) * 0.02 - a * 0.008 + lit(e), e, 0.4);
    }, { w: 1 });
    for (const [a, y] of [[18, 26], [12, 28], [6, 29]]) { g.line(3, 10, a, y - 1, P.EDGE[2], { w: 1 }); g.line(3 + (a - 3) * 0.55, 10 + (y - 11) * 0.55, a, y - 1, P.EDGE[3], { w: 1 }); g.dot(a, y - 1, P.EDGE[4], { w: 1 }); }
    g.ell(0, 16, 3.4, 10, (a, y, e) => Q(P.PA, 0.5 + (e.s ? -a * 0.09 : a * 0.03), e, 0.3), { sep: '#020204' });
    for (let y = 11; y < 25; y += 2) g.dot(0, y, P.EDGE[y < 17 ? 3 : 2]);
    g.poly([[-1, 0], [2, 3], [3, 7], [1, 10], [-1, 10]], (a, y, e) => Q(P.PA, 0.72 - a * 0.08 * (e.s ? 1 : 0.3), e, 0.3), { sep: '#020204' });
    g.px([[2, 5, '#ff5a3a'], [1, 6, '#ffd08a'], [0, 0, P.PA[0]], [0, 1, P.PA[0]]]);
    nozzle(g, 3, 26, P.glow);
  }, { fc: FL.violet, flames: [[-3, 9], [3, 9]], size: '+2 wide, +1 tall' });
  /* Nachtvogel C: an owl-shaped flying wing, no tail, a saw-tooth trailing edge and a violet rim light */
  add('Nachtvogel', 'C', 'Bold', 'A tailless flying wing shaped like a gliding owl: saw-tooth trailing edge, violet rim light, two glowing eye slits.', 41, 30, g => {
    const P = SK.nacht;
    g.poly([[-1, 2], [3, 4], [9, 7], [15, 12], [20, 19], [19, 24], [15, 20], [12, 25], [8, 21], [5, 26], [2, 22], [-1, 27]], (a, y, e) => {
      if (e.lead) return a < 4 ? P.EDGE[4] : a < 14 ? P.EDGE[3] : P.EDGE[2];
      if (e.lead2) return P.PA[5];
      if (e.trail) return P.PA[0];
      const ch = (y + Math.round(a * 0.75)) % 5 === 0 && y > 9; // feather chevrons
      return ch ? P.PA[1] : Q(P.PA, 0.52 - (y - 6) * 0.012 + lit(e), e, 0.3);
    }, { w: 1 });
    g.poly([[-1, 6], [2.4, 8], [3, 15], [1.6, 22], [-1, 25]], (a, y, e) => Q(P.PA, 0.62 + (e.s ? -a * 0.1 : a * 0.03) - (y - 6) * 0.012, e, 0.3), { sep: '#020204' });
    g.px([[2, 8, '#ff5a3a'], [3, 8, '#ffd08a'], [1, 9, '#ff5a3a'], [0, 6, P.PA[0]], [0, 7, P.PA[0]]]);
    for (let y = 12; y < 23; y += 2) g.dot(0, y, P.EDGE[y < 17 ? 3 : 2]);
    for (const a of [6, 11, 16]) g.line(a, a * 0.75 + 5, a + 1.5, a * 0.75 + 11, P.EDGE[1], { w: 1 });
    nozzle(g, 2, 22, P.glow); nozzle(g, 8, 21, P.glow, { w: 1 });
  }, { fc: FL.violet, flames: [[-2, 8], [2, 8], [-8, 7], [8, 7]], size: '41 x 30 art (+6 wide, 6 shorter)', hit: 'keep the hit box; the ship is shorter, so its middle sits further forward' });

  /* Rooster B: layered feather rows, a hackle cape and a fan of sickle tail feathers */
  const GREEN = ['#06100e', '#0a1a18', '#123a34', '#1e6a58', '#3aa088', '#8ae0c0'];
  add('Rooster', 'B', 'Rework', 'Broad wings in scalloped feather rows, an orange hackle cape, a fan of green sickle feathers.', 37, 39, g => {
    const P = SK.gold;
    for (const t of [[[1, 24], [4, 24], [9, 29], [11, 36], [9, 36], [6, 30], [2, 28]], [[-1, 24], [2, 26], [4, 33], [3, 38], [1, 35], [-1, 31]]])
      g.poly(t, (a, y, e) => e.lead || (e.outer && y < 34) ? GREEN[5] : e.inner ? GREEN[1] : Q(GREEN, 0.55 - (y - 24) * 0.012, e, 0.3), { sep: 1 });
    g.poly([[2, 9], [8, 9], [13, 12], [17, 17], [18, 23], [16, 27], [13, 25], [11, 29], [8, 26], [6, 29], [4, 25], [2, 26]], (a, y, e) => {
      if (e.lead) return Q(P.EDGE, 0.8, e, 0.3);
      if (e.trail) return P.PA[1];
      const r = y - a * 0.25, row = Math.floor(r / 4), ph = ((r % 4) + 4) % 4, col = Math.round(a + (row & 1) * 2);
      if (a < 7 && r < 13) return Q(P.EDGE, 0.75 - (r - 9) * 0.1, e, 0.6); // the hackle cape
      if ((ph >= 3 && col % 4 !== 0) || (ph >= 2 && ph < 3 && col % 4 === 0)) return P.PA[1]; // scalloped row ends
      return Q(P.PA, 0.78 - ph * 0.09 - row * 0.03 + lit(e), e, 0.2);
    }, { w: 1 });
    g.ell(0, 16, 3.6, 10, (a, y, e) => Q(P.PA, 0.66 + (e.s ? -a * 0.09 : a * 0.02) - (y - 12) * 0.012, e, 0.3), { sep: 1 });
    for (let y = 11; y < 25; y++) g.dot(0, y, y % 3 ? P.EDGE[2] : P.EDGE[3]);
    roosterHead(g, P); g.px([[2, 8, RED[2]], [2, 9, RED[1]], [1, 9, RED[3]]]);
    nozzle(g, 3, 27, P.glow);
  }, { size: '+2 wide, +3 tall' });
  /* Rooster C: the fighting cock: short strong wings and a tail fan wider than the wings */
  add('Rooster', 'C', 'Bold', 'A fighting cock: short strong wings, a big comb, and a fan of sickle plumes that spreads wider than the wings.', 41, 40, g => {
    const P = SK.gold;
    for (const t of [[[1, 20], [9, 20], [16, 23], [20, 28], [20, 34], [16, 29], [11, 26], [5, 25], [1, 25]], [[1, 24], [7, 26], [12, 30], [14, 36], [13, 39], [9, 34], [5, 31], [1, 30]], [[-1, 26], [3, 30], [5, 36], [4, 39], [1, 36], [-1, 34]]])
      g.poly(t, (a, y, e) => e.lead ? GREEN[5] : e.lead2 ? GREEN[4] : e.trail ? GREEN[1] : Q(GREEN, 0.5 - (a + y - 24) * 0.008, e, 0.3), { w: 1, sep: 1 });
    g.poly([[2, 9], [7, 9], [12, 12], [14, 17], [13, 23], [10, 20], [8, 24], [5, 20], [2, 23]], (a, y, e) => {
      if (e.lead) return Q(P.EDGE, 0.85, e, 0.2);
      if (e.trail) return P.PA[1];
      if (a < 6 && y < 14) return Q(P.EDGE, 0.7 - (y - 9) * 0.08, e, 0.6);
      const ph = (y + 1) % 4;
      return ph === 3 && Math.round(a) % 3 ? P.PA[1] : Q(P.PA, 0.8 - ph * 0.08 + lit(e), e, 0.2);
    }, { w: 1, sep: 1 });
    g.ell(0, 16, 4, 10, (a, y, e) => Q(P.PA, 0.68 + (e.s ? -a * 0.08 : a * 0.02) - (y - 12) * 0.012, e, 0.3), { sep: 1 });
    for (let y = 11; y < 25; y++) g.dot(0, y, y % 3 ? P.EDGE[2] : P.EDGE[3]);
    roosterHead(g, P);
    g.px([[1, 1, RED[3]], [1, 5, RED[3]], [1, 7, RED[2]], [2, 8, RED[2]], [2, 9, RED[1]], [1, 9, RED[3]], [0, 9, RED[2]]]);
    nozzle(g, 3, 27, P.glow);
  }, { size: '41 x 40 art (+6 wide, +4 tall)', hit: 'keep the hit box: the tail fan is feathers, not hull' });

  /* ================= Phoenix: ember wings with a glowing rim and no outline ================= */
  const PH = { BODY: ['#2a0806', '#5a1408', '#a02a0c', '#e0561a', '#ffa030', '#ffe080'], FILL: ['#3a0c06', '#6a160a', '#a02a0c', '#e0561a', '#ffa030'], RIM: ['#c8300c', '#f2701c', '#ffa030', '#ffd060'], TAILP: ['#7a1006', '#c8300c', '#f2701c', '#ffb838', '#fff0a0'], HOT: ['#ffa030', '#ffe080', '#fff6c0'] };
  const DEEP = '#5a1408';
  const bead = (g, a, y, q) => { for (const [da, dy, col] of [[0, -1, '#ffd060'], [-1, 0, '#ffd060'], [1, 0, '#ffb838'], [0, 1, '#f2701c'], [0, 0, '#ffffff']]) g.dot(a + da, y + dy, col, Object.assign({ free: 1 }, q)); };
  function phoenixHead(g, y0 = 0) {
    g.poly([[-1, y0 + 3], [1.5, y0 + 3], [2.5, y0 + 4], [2.5, y0 + 9], [1.5, y0 + 10], [-1, y0 + 10]], (a, y, e) => a < 0.5 ? '#ffa030' : e.outer ? '#c8300c' : '#e0561a');
    g.px([[0, y0, '#ffe9a0'], [0, y0 + 1, '#ffd060'], [1, y0 + 2, '#e8a020'], [0, y0 + 2, '#ffd060'], [0, y0 + 3, '#ffd060'], [0, y0 + 7, '#ffe9a0'], [1, y0 + 4, '#2a0806'], [2, y0 + 5, '#2a0806'], [1, y0 + 5, '#fff6c0'], [1, y0 + 6, '#ffffff']], { free: 1 });
    const GR = ['#ffe9a0', '#ffd060', '#ffa030', '#f2701c'];
    [[3, 3], [4, 4], [5, 5], [6, 6]].forEach(([a, y], k) => g.dot(a, y0 + y, GR[k], { free: 1 }));
    g.px([[7, y0 + 6, '#fff6c0'], [8, y0 + 6, '#ffe9a0'], [7, y0 + 7, '#ffe9a0'], [8, y0 + 7, '#ffd060']], { free: 1 });
  }
  const phoenixBody = (g, cy, rx, ry) => {
    g.ell(0, cy, rx, ry, (a, y, e) => Q(PH.BODY, 0.2 + (y - cy + ry) / (ry * 2) * 0.7 + (1 - a / (rx + 0.5)) * 0.15, e, 0.3), { sep: DEEP });
    for (let y = cy - 6; y < cy + ry - 1; y++) g.dot(0, y, Q(PH.HOT, 0.95 - (y - cy + 6) * 0.04, { i: 0, j: y }, 0));
  };
  add('Phoenix', 'A', 'Polish', 'The same drawing with a cleaner feather fan, a dark line round the body and a hotter, steadier rim.', 35, 36, g => {
    for (const t of [[[-1, 22], [1, 26], [3, 31], [4, 35], [1, 31], [-1, 30]], [[-1, 22], [0.6, 22], [0.6, 35], [-1, 35]]]) g.poly(t, (a, y) => Q(PH.TAILP, Math.min(1, (y - 20) / 15), { i: 0, j: 0 }, 0));
    g.poly(WING_FV, (a, y, e) => {
      if (e.lead || e.outer) return Q(PH.RIM, y < 20 ? 0.6 + (y - 8) / 30 : 0.9 - (y - 20) / 16, e, 0);
      if (e.trail) return y > 24 ? PH.TAILP[3] : PH.RIM[0];
      if (y >= 21) return Q(PH.TAILP, (y - 20) / 10 + 0.2, e, 0.3);
      const st = Math.floor(Math.atan2(y - 10, Math.max(0.5, a - 3)) * 8), dist = Math.hypot(a - 3, y - 10);
      return Q(PH.FILL, 0.12 + (st & 1 ? 0.3 : 0) + dist / 34, e, 0.15);
    }, { w: 1 });
    for (let y = 24; y < 34; y++) g.dot(y > 29 ? 8 : 7, y, Q(PH.TAILP, (y - 24) / 10, { i: 0, j: y }, 0), { w: 1, free: 1 });
    phoenixBody(g, 16, 3.6, 10); phoenixHead(g);
  }, { outline: false, fc: FL.ember, flames: [[-4, 12], [3, 13]] });
  add('Phoenix', 'B', 'Rework', 'Wings of flame tongues that cool from a yellow core to deep red, and three tail plumes that end in beads.', 37, 41, g => {
    g.poly([[1, 24], [3, 24], [7, 35], [5, 35]], (a, y) => Q(PH.TAILP, 0.9 - (y - 24) / 14, { i: 0, j: 0 }, 0)); bead(g, 6, 37);
    g.poly([[-1, 24], [1.3, 24], [0.6, 37], [-1, 37]], (a, y) => Q(PH.TAILP, 1 - (y - 24) / 16, { i: 0, j: 0 }, 0)); bead(g, 0, 38);
    g.poly([[2, 9], [8, 8], [14, 11], [18, 16], [18, 22], [17, 28], [15, 22], [14, 30], [12, 23], [10, 31], [8, 24], [6, 29], [4, 23], [2, 24]], (a, y, e) => {
      if (e.lead) return Q(PH.RIM, 0.95 - a * 0.02, e, 0);
      if (e.outer && y > 14) return PH.RIM[1];
      if (e.trail && !e.trail2) return '#fff0a0';
      const d = Math.hypot((a - 2) * 0.8, y - 13);
      return Q(['#5a1408', '#a02a0c', '#c8300c', '#f2701c', '#ffa030', '#ffd060'], 1 - d / 17 + lit(e), e, 0.35);
    }, { w: 1 });
    quills(g, [[15, 22], [12, 23], [8, 24], [4, 23]], [3, 9], '#7a1006', 0.4);
    phoenixBody(g, 17, 3.4, 10.5); phoenixHead(g);
  }, { outline: false, fc: FL.ember, flames: [[-4, 10], [4, 10]], size: '+2 wide, +5 tall (tail plumes)' });
  add('Phoenix', 'C', 'Bold', 'No wings at all: three tiers of flame petals down each side, like a burning lotus, round a white-hot body.', 37, 41, g => {
    const petal = (pts, base) => g.poly(pts, (a, y, e) => e.lead ? '#fff0a0' : e.lead2 ? '#ffb838' : e.trail || e.inner ? '#7a1006' : Q(['#a02a0c', '#c8300c', '#e0561a', '#f2701c', '#ffa030'], base - (a * 0.02) + lit(e), e, 0.3), { w: 1, sep: DEEP });
    g.poly([[-1, 26], [2, 27], [3, 33], [1, 37], [-1, 40]], (a, y, e) => e.outer ? '#f2701c' : Q(PH.TAILP, 0.5 + (y - 26) / 28, e, 0.3));
    petal([[2, 20], [6, 22], [9, 26], [10, 31], [8, 36], [6, 30], [4, 27], [2, 26]], 0.45);
    petal([[2, 15], [8, 16], [13, 19], [15, 24], [14, 30], [11, 24], [7, 21], [2, 21]], 0.6);
    petal([[2, 9], [9, 8], [15, 11], [18, 16], [17, 23], [14, 17], [8, 15], [2, 16]], 0.75);
    for (const [a, y] of [[17, 22], [14, 29], [8, 35]]) g.dot(a, y, '#fff6c0', { w: 1 });
    phoenixBody(g, 17, 2.8, 11); phoenixHead(g);
  }, { outline: false, fc: FL.ember, flames: [[-3, 12], [3, 12]], size: '+2 wide, +5 tall' });

  /* ================= Raptor: bronze and teal ================= */
  const BRONZE = ['#241408', '#4a2c10', '#86541c', '#c08a2c', '#e8c060', '#fff0b0'], TEAL = ['#06302c', '#0e5c54', '#1e9a88', '#58d0b8', '#b8f4e4'];
  const raptorHead = (g, pale) => {
    g.poly([[-1, 0], [2, 3], [3, 7], [1, 10], [-1, 10]], (a, y, e) => Q(pale || BRONZE, 0.75 - a * 0.08 * (e.s ? 1 : 0.3) - y * 0.01, e, 0.3));
    g.px([[0, 0, TEAL[3]], [0, 1, TEAL[3]], [1, 1, TEAL[2]], [0, 2, TEAL[1]], [2, 5, '#140c08'], [2, 4, pale ? '#86541c' : BRONZE[1]]]);
  };
  const raptorBody = (g, rx = 3.4) => {
    g.ell(0, 16, rx, 10, (a, y, e) => Q(BRONZE, 0.55 + (e.s ? -a * 0.09 : a * 0.03) - (y - 12) * 0.008, e, 0.3), { sep: 1 });
    for (let y = 10; y < 25; y++) g.dot(0, y, Q(TEAL, 0.95 - (y - 10) * 0.04, { i: 0, j: y }, 0));
  };
  add('Raptor', 'A', 'Polish', 'The same bird with a crisp teal rim, flat bronze feather bands, dark quills and a banded tail.', 35, 36, g => {
    g.poly([[-1, 22], [1.4, 22], [4, 35], [-1, 30]], (a, y, e) => y === 28 || y === 29 ? TEAL[0] : e.outer ? TEAL[4] : Q(TEAL, 0.35 + (y - 22) / 22, e, 0.3));
    g.poly([[2, 8], [8, 9], [13, 12], [17, 16], [16, 22], [14, 20], [14, 27], [11, 23], [10, 30], [7, 25], [5, 31], [3, 24], [2, 20]], (a, y, e) => {
      if (e.lead || (e.outer && y < 22)) return Q(TEAL, 0.9 - a * 0.015, e, 0);
      if (e.trail) return y > 25 ? TEAL[2] : BRONZE[1];
      const st = Math.floor(Math.atan2(y - 10, Math.max(0.5, a - 3)) * 8), dist = Math.hypot(a - 3, y - 10);
      return Q(BRONZE, 0.2 + (st & 1 ? 0.28 : 0) + dist / 40 + lit(e), e, 0.15);
    }, { w: 1 });
    quills(g, [[14, 20], [11, 23], [7, 25], [3, 24]], [5, 9], BRONZE[0], 0.3);
    raptorBody(g); raptorHead(g);
  }, { fc: FL.teal, flames: [[-4, 15], [3, 16]] });
  add('Raptor', 'B', 'Rework', 'A falcon: long pointed sickle wings with dark bars, a fanned tail with a dark band, a dark cap and moustache.', 39, 38, g => {
    g.poly([[-1, 22], [1.6, 22], [4.4, 33], [2.4, 36.5], [-1, 37]], (a, y, e) => y >= 35 ? TEAL[3] : y === 32 || y === 33 ? BRONZE[0] : e.outer ? BRONZE[4] : Math.round(a) % 2 ? BRONZE[2] : BRONZE[3]);
    g.poly([[2, 9], [8, 8], [14, 11], [18, 17], [19, 28], [16, 23], [13, 25], [11, 21], [8, 23], [6, 20], [2, 21]], (a, y, e) => {
      if (e.lead) return Q(TEAL, 0.9 - a * 0.012, e, 0);
      if (e.lead2) return BRONZE[5];
      if (e.trail || e.outer) return BRONZE[1];
      const bar = ((Math.floor((y * 0.9 - a * 0.55) / 2) % 2) + 2) % 2;
      return bar && y > 11 ? BRONZE[a > 12 ? 1 : 2] : Q(BRONZE, 0.68 - a * 0.008 + lit(e), e, 0.2);
    }, { w: 1 });
    raptorBody(g, 3.2);
    g.poly([[-1, 0], [2, 3], [3, 7], [1, 10], [-1, 10]], (a, y, e) => y < 6 ? Q(BRONZE, 0.3, e, 0.2) : Q(BRONZE, 0.78 - a * 0.06, e, 0.2));
    g.px([[0, 0, TEAL[3]], [0, 1, TEAL[3]], [1, 1, TEAL[2]], [0, 2, TEAL[1]], [2, 5, '#fff0b0'], [3, 7, BRONZE[0]], [2, 8, BRONZE[0]], [2, 7, BRONZE[5]]]);
  }, { fc: FL.teal, flames: [[-3, 13], [3, 13]], size: '+4 wide, +2 tall' });
  add('Raptor', 'C', 'Bold', 'A soaring eagle: broad plank wings with five splayed finger feathers at each tip, a pale head and a teal wedge tail.', 41, 38, g => {
    g.poly([[-1, 22], [2, 22], [4.5, 31], [2, 34.5], [-1, 36]], (a, y, e) => y >= 32 ? TEAL[3] : y >= 30 ? TEAL[1] : e.outer ? BRONZE[4] : Math.round(a) % 2 ? BRONZE[2] : BRONZE[3]);
    g.poly([[2, 10], [8, 8], [14, 8], [20, 6.4], [20, 8.6], [15.5, 10.5], [20, 10.9], [20, 12.6], [15.5, 13.5], [20, 14.4], [20, 16.1], [15.5, 16.5], [19.5, 18], [19, 19.7], [15, 19], [13, 21.5], [10, 23], [7, 22], [5, 24], [2, 23]], (a, y, e) => {
      if (a > 15.5) return e.lead ? BRONZE[4] : e.trail ? BRONZE[0] : BRONZE[2];
      if (e.lead) return Q(TEAL, 0.9, e, 0);
      if (e.lead2) return BRONZE[4];
      if (e.trail) return BRONZE[1];
      const r = y - 9;
      return r < 4 ? Q(BRONZE, 0.72 + lit(e), e, 0.2) : r < 8 ? Q(BRONZE, 0.55 + lit(e), e, 0.2) : Q(BRONZE, 0.38 + lit(e), e, 0.2);
    }, { w: 1 });
    for (const a of [5, 8, 11, 14]) g.line(a, 21, a - 1.5, 16, BRONZE[1], { w: 1 });
    raptorBody(g, 3.6); raptorHead(g, ['#86541c', '#c8b890', '#e8dcc0', '#f6f0dc', '#fffdf6']);
  }, { fc: FL.teal, flames: [[-3, 13], [3, 13]], size: '41 x 38 art (+6 wide, +2 tall)', hit: 'keep the hit box' });

  /* ================= Rotkehlchen (robin) ================= */
  const BROWN = ['#1c1410', '#34261c', '#4e3a2a', '#6e5640', '#917658', '#b8a07c'], ORANGE = ['#4a1408', '#8a2410', '#c8401a', '#ee6a24', '#ff9a40', '#ffd08a'], FIRE = ['#7a1410', '#c82a1a', '#ff5a2a', '#ffa030', '#ffe080'], CRIM = ['#3a0808', '#7a1410', '#c82a1a', '#ff4a2a', '#ff8a5a'], SLATE = ['#3a4450', '#5a6876', '#8494a0', '#b4c0c8'];
  const robinHead = (g, pts, y0 = 0) => {
    g.poly(pts, (a, y, e) => Q(ORANGE, 0.72 - a * 0.06 * (e.s ? 1 : 0.2) - (y - y0) * 0.02, e, 0.3));
    g.px([[0, y0, '#2a1a10'], [0, y0 + 1, '#2a1a10'], [3, y0 + 5, '#141010'], [3, y0 + 4, '#ffe080']]);
  };
  add('Rotkehlchen', 'A', 'Polish', 'The same robin: a steadier flame rim, flat brown feather bands with two covert lines, a rounder orange hood.', 35, 36, g => {
    g.poly([[-1, 24], [2, 24], [4, 35], [-1, 31]], (a, y, e) => y > 32 ? CRIM[3] : e.outer ? BROWN[4] : Q(BROWN, 0.45, e, 0.3));
    g.poly([[2, 7], [5, 12], [13, 20], [17, 29], [12, 27], [8, 31], [5, 26], [2, 28]], (a, y, e) => {
      if (e.lead || e.outer) return y >= 25 ? Q(CRIM, 0.8, e, 0) : Q(FIRE, 0.95 - a * 0.03, e, 0);
      if (e.trail) return BROWN[1];
      const d = y - a * 0.95;
      return Q(BROWN, (d < 9 ? 0.7 : d < 13 ? 0.55 : 0.4) + lit(e), e, 0.25);
    }, { w: 1 });
    g.line(4, 17, 11, 24, BROWN[1], { w: 1 }); g.line(4, 21, 8, 25, BROWN[1], { w: 1 });
    g.ell(0, 16, 4, 10, (a, y, e) => Q(BROWN, 0.6 + (e.s ? -a * 0.08 : a * 0.02) - (y - 10) * 0.012, e, 0.3), { sep: 1 });
    robinHead(g, [[-1, 0], [2.5, 3], [4, 7], [2, 10], [-1, 10]]);
  }, { flames: [[-4, 12], [3, 13]] });
  add('Rotkehlchen', 'B', 'Rework', 'Round and sturdy like the real bird: rounded wings with a buff wing bar, an orange bib over the shoulders edged in slate grey.', 35, 36, g => {
    g.poly([[-1, 24], [3, 24], [4, 34], [-1, 35]], (a, y, e) => e.trail ? CRIM[3] : e.outer ? BROWN[4] : Math.round(a) % 2 ? BROWN[2] : BROWN[3]);
    g.poly([[2, 10], [7, 9], [12, 11], [15, 15], [16, 21], [14, 27], [11, 24], [9, 28], [6, 24], [4, 27], [2, 23]], (a, y, e) => {
      if (e.lead) return Q(FIRE, 0.9 - a * 0.03, e, 0);
      if (e.trail || e.outer) return BROWN[1];
      if (y === 18 || y === 19) return a > 4 ? (y === 18 ? BROWN[5] : BROWN[4]) : BROWN[3]; // the buff wing bar
      return Q(BROWN, (y < 15 ? 0.68 : 0.42) + lit(e), e, 0.25);
    }, { w: 1 });
    quills(g, [[11, 24], [6, 24]], [6, 12], BROWN[0], 0.3);
    for (const [a, y] of [[14, 26], [9, 27], [4, 26]]) g.dot(a, y, CRIM[3], { w: 1 });
    g.ell(0, 17, 4.6, 9.5, (a, y, e) => Q(BROWN, 0.6 + (e.s ? -a * 0.07 : a * 0.02) - (y - 10) * 0.012, e, 0.3), { sep: 1 });
    g.poly([[-1, 7], [4, 7], [6.5, 10], [5, 14], [2, 13], [-1, 15]], (a, y, e) => e.trail || (e.outer && y > 10) ? SLATE[2] : Q(ORANGE, 0.75 - a * 0.05 * (e.s ? 1 : 0.2) - (y - 7) * 0.03, e, 0.3), { sep: 1 });
    robinHead(g, [[-1, 1], [2.5, 3], [4, 6], [3, 9], [-1, 10]], 1);
  }, { size: 'unchanged' });
  add('Rotkehlchen', 'C', 'Bold', 'The smallest ship of all: a tight dart with swept wings, a big orange hood and a fanned ember tail.', 29, 32, g => {
    g.poly([[-1, 20], [2, 20], [6, 29], [3, 31], [-1, 31]], (a, y, e) => e.trail ? FIRE[3] : e.trail2 ? CRIM[3] : e.outer ? BROWN[4] : Math.round(a) % 2 ? BROWN[2] : BROWN[3]);
    g.poly([[2, 8], [6, 10], [11, 15], [14, 22], [14, 26], [11, 22], [8, 24], [6, 20], [2, 21]], (a, y, e) => {
      if (e.lead) return Q(FIRE, 0.95 - a * 0.04, e, 0);
      if (e.trail || e.outer) return a > 9 ? CRIM[3] : BROWN[1];
      return Q(BROWN, (y - a * 0.9 < 9 ? 0.68 : 0.45) + lit(e), e, 0.25);
    }, { w: 1 });
    g.line(4, 15, 9, 20, BROWN[1], { w: 1 });
    g.ell(0, 14, 3.8, 8.5, (a, y, e) => Q(BROWN, 0.6 + (e.s ? -a * 0.08 : a * 0.02), e, 0.3), { sep: 1 });
    g.poly([[-1, 0], [3, 2], [5, 6], [4, 10], [2, 12], [-1, 13]], (a, y, e) => e.trail ? SLATE[2] : Q(ORANGE, 0.78 - a * 0.05 * (e.s ? 1 : 0.2) - y * 0.025, e, 0.3), { sep: 1 });
    g.px([[0, 0, '#2a1a10'], [0, 1, '#2a1a10'], [3, 5, '#141010'], [3, 4, '#ffe080']]);
  }, { flames: [[-3, 9], [3, 9]], size: '29 x 32 art (6 narrower, 4 shorter)', hit: 'keep the hit box; a smaller sprite makes it look more generous' });

  /* ================= Schneevogel: a white swan-ship ================= */
  const SN = ['#8f8aa0', '#c3bdb6', '#e1dccf', '#f2eee4', '#fffdf6'], ST = ['#2c2e38', '#4a4d58', '#6c707c', '#9298a4', '#c4c9d2', '#e8ecf2'], ICE = ['#7e90b4', '#a8b8d4', '#ccd8ea'];
  const snow = (e, l) => e.lead ? SN[4] : e.trail ? SN[1] : e.trail2 ? SN[2] : l;
  const snowBall = (g, cy, rx, ry, q) => g.ell(0, cy, rx, ry, (a, y, e) => { const dx = (e.s ? a : -a) / rx, dy = (y + 0.5 - cy) / ry, l = -0.5 * dx - 0.7 * dy - (dx * dx + dy * dy) * 0.4; return l > 0.35 ? SN[4] : l > -0.1 ? SN[3] : l > -0.55 ? SN[2] : SN[1]; }, q);
  const nacelle = (g, a, y0, y1) => { g.poly([[a - 0.6, y0], [a + 1.6, y0], [a + 1.6, y1], [a - 0.6, y1]], (aa, y, e) => e.lead ? ST[5] : (aa < a + 0.5) === !e.s ? ST[4] : ST[2], { sep: 1 }); g.dot(a, y0 + 1, GLASS[3]); g.dot(a + 1, y0 + 1, GLASS[2]); };
  const SWING = [[3.2, 15.6], [6.6, 16.4], [10.4, 19], [13.8, 22.7], [16.2, 25.6], [17.9, 28], [17.9, 29], [15.8, 27], [14.8, 30.6], [12.6, 27.5], [11, 30.4], [9, 27.9], [7, 28.8], [4.2, 26.6]];
  add('Schneevogel', 'A', 'Polish', 'The same swan-ship with ice-blue feather seams, a dark line round body and nacelles, and a clearer canopy.', 37, 38, g => {
    for (const t of [[[-1, 24], [4, 24], [5.2, 34.4], [-1, 27]], [[-1, 24], [3, 24], [0.6, 37.4], [-1, 37.4]]]) g.poly(t, (a, y, e) => snow(e, e.outer ? SN[2] : SN[3]), { sep: ICE[0] });
    g.poly(SWING, (a, y, e) => snow(e, SN[3]), { w: 1 });
    for (const [a, y] of [[15.8, 27], [12.6, 27.5], [9, 27.9]]) g.line(a, y - 1, a - (a - 11) * 0.5 - 2, y - 6, ICE[1], { w: 1 });
    g.line(5, 19, 13, 25, ICE[2], { w: 1 });
    nacelle(g, 5, 21, 28);
    snowBall(g, 21.5, 3.3, 8.6, { sep: ICE[0] });
    g.poly([[-1, 9], [2.1, 9], [3, 16], [-1, 16]], (a, y, e) => e.outer ? SN[e.s ? 2 : 4] : SN[3]);
    g.poly([[-1, 14.6], [2.2, 14.6], [2.6, 18.8], [-1, 22.4]], (a, y, e) => e.lead ? ST[5] : (e.s ? ST[2] : ST[4]), { sep: 1 });
    g.poly([[-1, 15.4], [1.4, 15.4], [1.6, 18.6], [-1, 21]], (a, y, e) => Q(GLASS, 0.8 - (y - 15) * 0.1, e, 0.2)); g.dot(0, 16, '#e8fff6');
    for (let y = 24; y < 29; y++) g.dot(0, y, SN[2]);
    snowBall(g, 8.2, 2.9, 3.2);
    g.poly([[-1, 0.8], [1.1, 4], [1.8, 6.2], [-1, 6.2]], (a, y, e) => a < 0.5 ? '#d8cdb0' : '#b8a880');
    g.px([[0, 1, '#2a2018'], [0, 3, '#5a4a30'], [0, 4, '#5a4a30'], [3, 8, '#141018']]);
  }, { oc: '#16121e', fc: FL.teal, flames: [[-5, 9], [5, 9]], size: '37 x 38 art (the original is 36 x 38)' });
  add('Schneevogel', 'B', 'Rework', 'A fuller swan: broader wings in three feather tiers with ice-blue shadows, an orange beak with a black knob, a longer tail.', 41, 42, g => {
    for (const t of [[[-1, 27], [4, 27], [7, 38], [3, 36], [-1, 31]], [[-1, 27], [3, 27], [0.6, 41], [-1, 41]]]) g.poly(t, (a, y, e) => snow(e, e.outer ? SN[2] : SN[3]), { sep: ICE[0] });
    g.poly([[3, 16], [7, 16], [12, 18], [16, 22], [19, 27], [20, 32], [18, 30], [17, 36], [14, 31], [13, 37], [10, 32], [8, 36], [5, 31], [3, 32]], (a, y, e) => {
      if (e.lead) return SN[4];
      if (e.trail) return ICE[0];
      const d = y - 16 - Math.max(0, a - 6) * 0.72; // distance behind the leading edge
      if (Math.abs(d - 4) < 0.5 || Math.abs(d - 8) < 0.5) return ICE[1];
      if ((d > 4.5 && d < 5.6) || (d > 8.5 && d < 9.6)) return SN[4];
      return d < 4 ? SN[3] : d < 8 ? SN[3] : SN[2];
    }, { w: 1 });
    quills(g, [[18, 30], [14, 31], [10, 32], [5, 31]], [8, 14], ICE[0], 0.25);
    nacelle(g, 5, 23, 31);
    snowBall(g, 23, 3.6, 9.5, { sep: ICE[0] });
    g.poly([[-1, 8], [2, 8], [3, 17], [-1, 17]], (a, y, e) => e.outer ? SN[e.s ? 2 : 4] : SN[3]);
    canopy(g, 16, 23, 1.4);
    for (let y = 25; y < 31; y++) g.dot(0, y, SN[2]);
    snowBall(g, 7.5, 3, 3.3);
    g.poly([[-1, 0], [1.2, 2], [1.8, 5.4], [-1, 5.4]], (a, y, e) => a < 0.5 ? '#ffb040' : '#e8801c');
    g.px([[0, 0, '#2a2018'], [0, 5, '#141018'], [1, 5, '#141018'], [3, 7, '#141018'], [2, 6, '#141018']]);
  }, { oc: '#16121e', fc: FL.teal, flames: [[-5, 11], [5, 11]], size: '41 x 42 art (+5 wide, +6 tall)', hit: 'keep the hit box' });
  add('Schneevogel', 'C', 'Bold', 'A crane instead of a swan: long straight glider wings with black finger tips, a dark neck, a red crown, legs trailing behind.', 41, 40, g => {
    g.line(1, 28, 1, 39, '#3a3440', { free: 1 }); g.dot(1, 39, '#6a6470', { free: 1 });
    g.poly([[-1, 25], [4, 25], [5, 31], [2, 30], [-1, 33]], (a, y, e) => e.trail ? '#2a2630' : e.outer ? ST[3] : ST[4]);
    g.poly([[3, 15], [9, 14], [15, 15], [20, 16.5], [20, 18.2], [18, 18.6], [20, 19], [20, 20.8], [18, 21.2], [19.5, 21.6], [19, 23.4], [15, 22.5], [11, 24.5], [7, 23.5], [3, 25.5]], (a, y, e) => {
      if (a > 15.5) return e.lead ? '#5a5664' : '#1c1a22';
      if (e.lead) return SN[4];
      if (e.trail) return y > 22 ? '#2a2630' : ICE[0];
      return y >= 21 ? ST[3] : y >= 19 ? SN[2] : SN[3];
    }, { w: 1 });
    for (const a of [6, 9, 12]) g.line(a, 20, a, 23, ST[1], { w: 1 });
    snowBall(g, 21, 3.3, 8, { sep: ICE[0] });
    canopy(g, 16, 22, 1.2);
    g.poly([[-1, 5], [1.6, 5], [2.2, 15], [-1, 15]], (a, y, e) => a < 0.5 ? SN[3] : '#2a2630', { sep: 1 });
    g.ell(0, 5, 2.4, 2.6, (a, y, e) => y < 4 ? '#d83a2a' : e.outer ? '#2a2630' : SN[3]);
    g.poly([[-1, 0], [0.8, 0], [1.2, 3], [-1, 3]], () => '#d8cdb0'); g.px([[0, 0, '#8a7a58'], [2, 5, '#141018'], [0, 3, '#ff6a4a']]);
  }, { oc: '#16121e', fc: FL.ice, flames: [[-3, 10], [3, 10]], size: '41 x 40 art (+5 wide, +2 tall)', hit: 'keep the hit box; the wings are much thinner than they are wide' });

  /* ================= The Moth as a player ship =================
     The boss hull's drawing (buildMothArt in index.html: 55 x 39 art), scaled by k and turned nose up. Two candidate sizes: M (k 0.75) and L (k 0.87). */
  const DUST = ['#1c1814', '#34291f', '#54443a', '#7a6654', '#a08a70', '#c8b894'], CREAM = ['#2a2218', '#4a3c2a', '#7a6648', '#a89470', '#d0c09c', '#f0e6c8'], ROSE = ['#5a2420', '#8a3c30', '#c86a5a', '#e09a70'];
  const MOTHS = {
    A: { R: DUST, fore: [[3.5, 11], [12.5, 10], [20.5, 12], [26.5, 17], [27.5, 22], [24.5, 24], [17.5, 23], [10.5, 22], [3.5, 22]], hind: [[3.5, 20], [11.5, 23], [18.5, 26], [20.5, 31], [16.5, 34], [10.5, 33], [3.5, 30]], eyes: [[16.5, 17, 4.5]], eyes2: [[13.5, 29, 2.6]], pods: [[20.5, 27, 6], [11.5, 31, 7]], body: [[-1, 6], [3.5, 9], [5, 16], [3.5, 22], [2.5, 34], [-1, 38]], h: 39 },
    B: { R: DUST, fore: [[3, 10], [10, 8.5], [18, 10], [24, 15], [27.5, 24], [23, 22], [16, 20], [9, 20], [3, 20]], hind: [[3, 19], [10, 21], [15, 25], [14.5, 30], [9, 29.5], [3, 26]], eyes: [[19, 15.5, 3]], eyes2: [], pods: [[9.5, 27, 6]], body: [[-1, 6], [4, 9], [5.6, 16], [4.6, 24], [3, 35], [-1, 39]], h: 40, hawk: true },
    C: { R: CREAM, fore: [[3.5, 11], [12, 9], [20, 10], [26, 14], [27.5, 20], [24, 23.5], [17, 22.5], [10, 22], [3.5, 22]], hind: [[3.5, 20], [12, 22], [19, 25], [21, 29], [18, 32.5], [15.4, 33], [14.6, 40], [12.6, 46], [11.4, 40], [10, 33], [3.5, 30]], eyes: [[17, 16, 4.5]], eyes2: [[14.5, 27.5, 3.5]], pods: [[7, 31, 6]], body: [[-1, 6], [3.5, 9], [5, 16], [3.5, 22], [2.5, 32], [-1, 36]], h: 47, luna: true }
  };
  function moth(g, k, V) {
    const R = V.R, yo = 4 - 4 * k, Y = y => y * k + yo, S = pts => pts.map(([a, y]) => [a * k, Y(y)]);
    const pods = () => { for (const [pa, py, ry] of V.pods) {
      g.ell(pa * k, Y(py), 2.6 * k + 1.3, ry * k + 1, () => K, { w: 1 });
      g.ell(pa * k, Y(py), 2.6 * k + 0.3, ry * k, (a, y, e) => e.lead ? R[5] : Q(R, 0.7 + (e.s ? -1 : 1) * (a - pa * k) * 0.12, e, 0.3), { w: 1 });
      g.dot(pa * k, Y(py + ry) - 1, '#ffb040', { w: 1 }); g.dot(pa * k, Y(py + ry) - 2, K, { w: 1 });
    } };
    pods();
    const wingSh = (top, span, hind) => (a, y, e) => {
      if (e.lead) return R[5];
      if (e.trail) return (e.i & 1) ? R[3] : '#2a1e16';
      const u = a / k, v = (y - yo) / k; // the boss hull's own coordinates
      if (V.hawk && hind && v > 22.5 && v < 27) return v < 24.5 ? ROSE[3] : ROSE[2];
      if (!hind && Math.abs(v - 12.5) < 0.7 && u > 6 && u < 22 && ((e.i + e.j) & 1)) return R[4];
      for (const [b, n] of [[15, 0], [19, 1], [24, 2]]) if (u > 4.5 && u < 23.5 && Math.abs(v - (b + 1.6 * Math.sin(u * 0.9 + n))) < 0.5 / k) return R[1];
      return Q(R, 0.72 - (v - top) / span * 0.32 + lit(e), e, 0.35);
    };
    g.poly(S(V.hind), wingSh(20, 14, true), { w: 1 });
    g.poly(S(V.fore), wingSh(10, 14, false), { w: 1, sep: R[0] });
    const spot = ([ea, ey, r], cols) => g.ell(ea * k, Y(ey), r * k, r * k, (a, y) => { const d = Math.hypot(a - ea * k, y + 0.5 - Y(ey)) / (r * k); return d < 0.3 ? cols[0] : d < 0.56 ? cols[1] : d < 0.8 ? cols[2] : cols[3]; }, { w: 1 });
    for (const s of V.eyes) spot(s, ['#fff0b0', '#34291f', '#c8a060', '#34291f']);
    for (const s of V.eyes2) spot(s, V.luna ? ['#fff0b0', '#34291f', '#c86a5a', '#34291f'] : ['#fff0b0', '#34291f', '#c8a060', '#c8a060']);
    // the body: a furry thorax and a tapering, ringed abdomen
    g.poly(S(V.body), (a, y, e) => { const v = (y - yo) / k; if (v > 23 && Math.floor((v - 23) / 3 * Math.max(1, k)) !== Math.floor((v - 23 - 1 / k) / 3 * Math.max(1, k))) return K; if (V.hawk && v > 23) return Math.floor((v - 23) / 3 * Math.max(1, k)) & 1 ? ROSE[2] : Q(R, 0.5 - a * 0.06, e, 0.3); return Q(R, 0.6 + (e.s ? -a * 0.09 : a * 0.02), e, 0.5); }, { sep: 1 });
    g.ell(0, Y(15), 4.6 * k, 6.5 * k, (a, y, e) => ((e.i * 7 + e.j * 5) % 4 === 0) ? R[5] : Q(R, 0.72 + (e.s ? -a * 0.09 : a * 0.02), e, 0.5), { sep: 1 });
    if (V.hawk) g.px([[0, Y(13), R[5]], [1, Y(13), R[5]], [0, Y(14), R[5]], [1, Y(14), K], [0, Y(15), R[5]], [1, Y(15), R[4]], [0, Y(16), R[4]]].map(([a, y, c]) => [a, Math.round(y), c]));
    // the head: lamp eyes and feathered antennae
    for (const [a, y, c] of [[0, 4, R[5]], [1, 4, R[5]], [2, 4, R[4]], [0, 5, '#ffb0a0'], [1, 5, '#ffb0a0'], [2, 5, '#ff3a2a'], [0, 6, R[4]], [1, 6, R[4]], [2, 6, R[3]]]) g.dot(a, y, c, { free: 1 });
    for (const [a, y] of [[2, 3], [3, 2], [4, 1], [5, 0], [6, 0]]) g.dot(a, y, R[5], { free: 1 });
    for (const [a, y] of [[3, 3], [4, 2], [5, 1], [2, 2], [3, 1], [4, 0], [6, 1]]) g.dot(a, y, R[3], { free: 1 });
  }
  for (const v of ['A', 'B', 'C']) for (const [sz, k] of [['M', 0.75], ['L', 0.87]]) {
    const V = MOTHS[v], W = Math.round(55 * k / 2) * 2 - 1, H = Math.ceil(V.h * k + 4 - 4 * k);
    const fl = []; for (const [pa, py, ry] of V.pods) { const ox = Math.round(pa * k), top = Math.round((py + ry) * k + 4 - 4 * k - H / 2) - 1; fl.push([-ox, top], [ox, top]); }
    add('The Moth', v + ' ' + sz, { A: 'Dust', B: 'Hawk moth', C: 'Moon moth' }[v] + ', size ' + sz,
      { A: 'The boss hull itself, made smaller: zig-zag bands, a gold-ringed eye on each wing, four engine pods, lamp eyes.', B: 'A hawk moth: long narrow forewings swept back, rose-banded hindwings and abdomen, a pale skull mark, two pods.', C: 'A moon moth in pale dust: broad wings, four eyes, and long hindwing tails that trail behind.' }[v],
      W, H, g => moth(g, k, V), { oc: '#0a080c', fc: FL.amber, flames: fl, size: Math.round(k * 100) + '% of the boss hull', hit: sz === 'M' ? 'about 1.3 x the standard hit box' : 'about 1.5 x the standard hit box' });
  }

  /* ================= new ships ================= */
  const BLUE = ['#06203a', '#0c3c6a', '#1464a4', '#1e96d8', '#5cd0f4', '#c8f6ff'], NAVY = ['#080c1c', '#101a38', '#1c2c5c', '#2e4688', '#5878c0', '#a8c0f0'];
  /* Eisvogel (kingfisher): the Feuervogel's cold twin. Electric blue back with a cyan stripe, orange flanks, a long dark dagger beak. */
  function eisvogel(g, wing, tail, spread) {
    g.poly(tail, (a, y, e) => a < 0.6 ? BLUE[4] : e.outer ? BLUE[0] : BLUE[2]);
    g.poly(wing, (a, y, e) => {
      if (e.lead) return BLUE[5];
      if (e.trail) return spread ? ORANGE[3] : BLUE[0];
      if (y - a * 0.75 > (spread ? 13.5 : 14.5)) return (Math.round(a * 1.2 + y) % 3 === 0) ? BLUE[0] : BLUE[1]; // dark flight feathers
      return (Math.round(a) + y) % 3 === 0 && y % 2 === 0 ? BLUE[5] : Q(BLUE, 0.6 + lit(e), e, 0.3);              // spotted coverts
    }, { w: 1 });
    g.poly([[2, 20], [5.5, 22], [4.4, 27], [2, 27]], (a, y, e) => Q(ORANGE, 0.7 - (y - 20) * 0.05, e, 0.3), { sep: 1 });
    g.ell(0, 17, 3.6, 9, (a, y, e) => a < 0.6 ? '#b8f8ff' : a < 1.6 ? BLUE[4] : Q(BLUE, 0.5 + (e.s ? -0.1 : 0.08), e, 0.3), { sep: 1 });
    g.poly([[-1, 5], [2.5, 6], [4, 9], [3.4, 12.5], [-1, 13.5]], (a, y, e) => (Math.round(a) + y) % 2 === 0 && y < 11 && a > 0.5 ? BLUE[4] : Q(BLUE, 0.55 - a * 0.04, e, 0.2), { sep: 1 });
    g.px([[3, 12, '#f4f2e8'], [4, 11, '#f4f2e8'], [4, 10, ORANGE[3]], [3, 9, '#0c0a10'], [3, 8, ORANGE[4]]]);
    g.poly([[-1, -1], [0.6, 0], [1.6, 5.6], [-1, 5.6]], (a, y, e) => a < 0.6 ? '#3a3440' : '#141018'); g.dot(1, 5, ORANGE[2]);
  }
  add('Eisvogel', 'A', 'Dive', 'A kingfisher in its dive: wings half folded into a dart, the long beak leading.', 31, 34, g => eisvogel(g, [[2, 11], [6, 10], [11, 13], [14, 19], [15, 27], [12, 23], [9, 27], [6, 22], [2, 23]], [[-1, 24], [2, 24], [3, 31], [-1, 33]], false), { fc: FL.ice, flames: [[-3, 12], [3, 12]], size: '31 x 34 art (4 narrower)' });
  add('Eisvogel', 'B', 'Hover', 'The same bird hovering: broad spread wings with orange showing along the trailing edge.', 37, 36, g => eisvogel(g, [[2, 10], [8, 9], [14, 11], [18, 16], [18, 22], [15, 27], [12, 23], [9, 28], [6, 23], [2, 24]], [[-1, 24], [2.4, 24], [4, 33], [1.4, 31], [-1, 35]], true), { fc: FL.ice, flames: [[-3, 12], [3, 12]], size: '37 x 36 art (+2 wide)' });

  /* Schwalbe (swallow): glossy blue-black, sickle wings, a deep forked tail with white spots, a red forehead. */
  function schwalbe(g, wing, tail, split) {
    g.poly(tail, (a, y, e) => e.outer ? NAVY[4] : e.inner || (split && a < 0.6 && y > 29) ? NAVY[0] : NAVY[2]);
    for (const [a, y] of split ? [[1, 26], [1, 28]] : [[2, 26], [3, 28], [3, 30]]) g.dot(a, y, '#f4f2e8');
    g.poly(wing, (a, y, e) => e.lead ? NAVY[5] : e.lead2 ? NAVY[4] : e.trail || e.outer ? NAVY[0] : Q(NAVY, 0.48 - (y - 10) * 0.012 + lit(e), e, 0.3), { w: 1 });
    g.line(4, 13, wing[3][0] - 2, wing[3][1] + 1, NAVY[1], { w: 1 }); g.line(4, 15, wing[4][0] - 3, wing[4][1] - 2, NAVY[1], { w: 1 });
    g.ell(0, 15, 3.4, 8.5, (a, y, e) => !e.s && Math.round(a) === 1 && y > 10 && y < 19 ? NAVY[5] : Q(NAVY, 0.5 + (e.s ? -a * 0.08 : a * 0.03), e, 0.3), { sep: 1 });
    g.poly([[-1, 2], [2, 3.5], [3.4, 7], [2, 10], [-1, 10]], (a, y, e) => Q(NAVY, 0.6 - a * 0.06, e, 0.2));
    g.px([[0, 1, '#141018'], [0, 2, '#d83a2a'], [0, 3, '#ff6a4a'], [1, 3, '#d83a2a'], [2, 6, '#0c0a10'], [3, 8, '#c8401a'], [3, 7, '#f0e0c8']]);
  }
  add('Schwalbe', 'A', 'Glide', 'A swallow gliding: long sickle wings and two tail streamers spread wide.', 39, 40, g => schwalbe(g, [[2, 10], [7, 9], [13, 11], [17, 15], [19, 21], [19, 28], [16, 22], [12, 18], [8, 17.5], [5, 18.5], [2, 19]], [[-1, 22], [2.4, 22], [4, 30], [7, 39], [5.4, 39], [2, 32], [-1, 28]], false), { fc: FL.ice, flames: [[-2, 9], [2, 9]], size: '39 x 40 art (+4 wide, +4 tall)', hit: 'keep the hit box' });
  add('Schwalbe', 'B', 'Stoop', 'The swallow at speed: wings swept hard back, the tail closed to one long needle.', 33, 40, g => schwalbe(g, [[2, 10], [6, 10], [11, 14], [15, 21], [16, 31], [13, 25], [10, 21], [7, 19], [2, 19]], [[-1, 22], [2.4, 22], [2.6, 30], [1.6, 39], [-1, 39]], true), { fc: FL.ice, flames: [[-2, 9], [2, 9]], size: '33 x 40 art (2 narrower, +4 tall)' });

  /* Hornisse (hornet): The Moth's quarrelsome cousin. Amber wings, a black and yellow ringed abdomen with a sting, big dark eyes. */
  const YEL = ['#5a3a06', '#a06a0c', '#e0a018', '#ffc830', '#ffe880'], DKB = ['#120c0a', '#241812', '#3a2618', '#5a3c22'], AMB = ['#3a2408', '#7a4c10', '#b87a1c', '#e0aa40', '#f4d688'];
  function hornisse(g, fore, hind, asian) {
    const wing = (pts, sep) => g.poly(pts, (a, y, e) => e.lead ? '#fff0c0' : e.trail || e.outer ? AMB[1] : (Math.round(a * 0.8 + y * 0.6) % 4 === 0) ? AMB[2] : Q(AMB, 0.78 + lit(e), e, 0.2), { w: 1, sep });
    wing(hind); wing(fore, AMB[0]);
    g.poly([[-1, 17], [3, 18], [4.4, 23], [3.4, 30], [1.4, 35], [-1, 37]], (a, y, e) => {
      const band = ((y - 19) % 4 + 4) % 4 < 2;
      if (asian) return y > 30 ? Q(ORANGE, 0.7 - a * 0.08, e, 0.2) : y === 24 || y === 25 ? YEL[3] : Q(DKB, 0.5 + (e.s ? -0.2 : 0.2), e, 0.3);
      return band ? DKB[e.s ? 0 : 1] : Q(YEL, 0.8 + (e.s ? -a * 0.1 : -a * 0.03), e, 0.2);
    }, { sep: 1 });
    g.dot(0, 37, K, { free: 1 });
    g.ell(0, 13, 3.6, 4.5, (a, y, e) => ((e.i * 3 + e.j * 5) % 4 === 0) ? DKB[3] : Q(DKB, 0.4 + (e.s ? -0.15 : 0.15), e, 0.3), { sep: 1 });
    g.px([[3, 11, YEL[2]], [2, 10, YEL[3]]]);
    g.ell(0, 7, 3.3, 2.8, (a, y, e) => Q(asian ? ORANGE : YEL, 0.75 - a * 0.05, e, 0.2), { sep: 1 });
    g.px([[3, 7, '#5a1010'], [3, 6, '#8a1c14'], [2, 6, '#5a1010'], [2, 5, '#c83a2a'], [0, 4, K], [1, 4, DKB[2]]]);
    g.line(1, 4, 3, 1, K, { free: 1 }); g.line(3, 1, 5, 0, K, { free: 1 });
  }
  add('Hornisse', 'A', 'Wasp', 'A hornet with its amber wings swept back over a black and yellow ringed abdomen.', 35, 38, g => hornisse(g, [[2, 12], [7, 11], [14, 15], [17, 21], [17, 26], [13, 24], [8, 20], [2, 17]], [[2, 16], [7, 20], [11, 25], [11, 29], [7, 27], [2, 21]], false), { fc: FL.amber, flames: [[-3, 6], [3, 6]], size: '35 x 38 art (standard)' });
  add('Hornisse', 'B', 'Gunship', 'An Asian hornet held like an aeroplane: wings straight out, a dark abdomen with one yellow ring and an orange tip.', 39, 38, g => hornisse(g, [[2, 11], [9, 9], [16, 10], [19, 13], [18, 16], [11, 16.5], [2, 16.5]], [[2, 16], [9, 17], [14, 19], [14.5, 22], [9, 22.5], [2, 20]], true), { fc: FL.amber, flames: [[-3, 6], [3, 6]], size: '39 x 38 art (+4 wide)' });

  /* Libelle (dragonfly): a needle body in metal green and blue, four narrow glass wings, large eyes. */
  const MET = ['#04302c', '#0c6c5c', '#18a890', '#50e0c0', '#c0fff0'], GLS = ['#5a8cb0', '#9cc8e0', '#d0ecf8', '#f4fcff'];
  function libelle(g, fore, hind, banded) {
    const wing = pts => g.poly(pts, (a, y, e) => {
      if (e.lead) return GLS[3];
      if (e.trail || e.outer) return GLS[0];
      if (banded && a > 6.5) return a > 13 ? GLS[1] : Q(NAVY, 0.55 + lit(e), e, 0.4);
      if (!banded && a > 15.6 && a < 18.4 && e.lead2) return '#1c2c5c'; // the wing mark near the tip
      return Math.round(a) % 4 === 0 ? GLS[1] : GLS[2];
    }, { w: 1, sep: GLS[0] });
    wing(hind); wing(fore);
    g.poly([[-1, 14], [1.4, 14], [1.4, 36], [-1, 39]], (a, y, e) => y % 4 === 1 ? K : a < 0.6 ? (y > 28 ? BLUE[4] : MET[3]) : (y > 28 ? BLUE[2] : MET[1]), { sep: 1 });
    g.px([[1, 38, K], [1, 39, K]], { free: 1 });
    g.ell(0, 11.5, 2.7, 4, (a, y, e) => e.lead ? MET[4] : a < 0.6 ? MET[3] : Q(MET, 0.5 + (e.s ? -0.2 : 0.15), e, 0.2), { sep: 1 });
    g.ell(0, 5.5, 3.2, 2.5, (a, y, e) => a < 0.6 ? MET[0] : e.lead ? MET[4] : MET[2], { sep: 1 });
    g.px([[2, 4, '#f4fcff'], [0, 3, K]]);
  }
  add('Libelle', 'A', 'Darter', 'A dragonfly with four glass wings held straight out, each with a dark mark near the tip.', 41, 40, g => libelle(g, [[1.5, 9], [8, 7], [16, 6.5], [20, 8], [19.5, 11], [12, 12], [1.5, 12]], [[1.5, 13], [9, 14], [17, 15.5], [20, 18], [18, 21], [10, 19], [1.5, 16]], false), { fc: FL.teal, flames: [[-2, -3], [2, -3]], size: '41 x 40 art (+6 wide, +4 tall)', hit: 'keep the hit box: the body is only 3 px wide' });
  add('Libelle', 'B', 'Demoiselle', 'A demoiselle: wings swept back in a V with a dark blue band, the same needle body.', 33, 40, g => libelle(g, [[1.5, 9], [6, 9], [13, 15], [16, 23], [14, 25.5], [9, 19], [1.5, 13]], [[1.5, 13], [7, 18], [11, 25], [11, 30.5], [8, 29], [4, 22], [1.5, 17]], true), { fc: FL.teal, flames: [[-2, -3], [2, -3]], size: '33 x 40 art (2 narrower, +4 tall)' });

  return out;
}
