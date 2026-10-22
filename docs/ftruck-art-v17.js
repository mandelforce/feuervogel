/* Fuel truck art v17: three designs where the tank is the first thing you see (proposal, not wired into the game). 12 x 24 against 10 x 22.
   The tank is a big shaded cylinder with a bright highlight down the middle, rounded ends, ring seams and dome hatches, in a colour that stands apart from the olive cab:
   a silver steel tank, an olive tank with red warning bands and a flame sign, and a yellow tank with a hazard stripe aft. Exactly symmetric (shading too: lit from above),
   front to the south, 16 headings through the game's rotSet, the game's dither. Needs the game's toolkit (sprite, boxS, ellS, pick, rect, rotSet, RP).
     ft_silver: polished steel tank, red hatch caps.
     ft_flame:  olive tank, two red bands, a white square with a flame.
     ft_yellow: yellow tank, a black band, red and white stripe aft, hose reel. */
const FT_WHL = '#141416', FT_GLS = '#8cc0e0', FT_CAB = ['#1e2214', '#30382a', '#4a5440', '#66725a'];
function ftMirror(x, w, h) {
  const c = x.canvas, ox = (c.width - w) / 2, oy = (c.height - h) / 2, d = x.getImageData(ox, oy, w, h), a = d.data;
  for (let j = 0; j < h; j++) for (let i = 0; i < w / 2; i++) { const s = (j * w + i) * 4, t = (j * w + (w - 1 - i)) * 4; a[t] = a[s]; a[t + 1] = a[s + 1]; a[t + 2] = a[s + 2]; a[t + 3] = a[s + 3]; }
  x.putImageData(d, ox, oy);
}
function ftCylinder(x, ramp, x0, y0, w, h) {                                // a shaded cylinder, lit from above: bright in the middle, dark at the edges, rounded ends
  for (let j = y0; j < y0 + h; j++) for (let i = x0; i < x0 + w; i++) {
    const end = Math.min(j - y0, y0 + h - 1 - j); if (end === 0 && (i === x0 || i === x0 + w - 1)) continue;   // rounded corners
    const t = (i - x0 + 0.5) / w, l = 0.12 + 0.95 * Math.pow(Math.sin(Math.PI * t), 0.9) - (end < 2 ? 0.12 : 0);
    x.fillStyle = pick(ramp, Math.max(0, Math.min(1, l)), i, j); x.fillRect(i, j, 1, 1);
  }
}
function ftBase(x, tankRamp, tankFn) {
  for (const y of [2, 9, 16]) { rect(x, FT_WHL, 0, y, 1, 3); rect(x, FT_WHL, 11, y, 1, 3); }
  boxS(x, ['#14161a', '#22262c', '#343a44', '#444c58'], 1, 0, 10, 18, 0.0);                               // the chassis under the tank
  ftCylinder(x, tankRamp, 1, 1, 10, 16);
  tankFn(x);
  boxS(x, FT_CAB, 1, 17, 10, 7, 0.18); rect(x, FT_GLS, 2, 21, 8, 1); rect(x, '#e8f6ff', 2, 21, 2, 1); rect(x, '#0e1014', 3, 23, 6, 1);   // the cab, the windscreen, the grille
  rect(x, '#fff0a0', 1, 23, 1, 1); rect(x, '#fff0a0', 10, 23, 1, 1);
}
const SILVER = ['#2a3038', '#4a5460', '#7a8794', '#aab6c2', '#e4ecf2'];
const OLIVE = ['#14200e', '#24381a', '#3a5428', '#587838', '#7e9c58'];
const YELLOW = ['#5a3a08', '#9a6a10', '#d49a18', '#f0c828', '#fff0a0'];
const ftSilver = () => rotSet(sprite(12, 24, x => {
  ftBase(x, SILVER, g => {
    for (const j of [5, 10, 15]) rect(g, 'rgba(20,26,34,0.5)', 1, j, 10, 1);                              // ring seams
    ellS(g, ['#2a0e0a', '#6a1a12', '#b02a1c', '#e04a30'], 5, 8, 2.4, 2.4, 0.3); rect(g, '#f0f4f8', 5, 7, 1, 1);   // the red hatch cap
    rect(g, '#141416', 3, 12, 1, 2);
  });
  ftMirror(x, 12, 24);
}));
const ftFlame = () => rotSet(sprite(12, 24, x => {
  ftBase(x, OLIVE, g => {
    for (const j of [4, 13]) { rect(g, '#d83a2a', 1, j, 10, 2); rect(g, '#f0f0e8', 1, j + 2, 10, 1); }    // two red warning bands
    rect(g, '#f0f0e8', 3, 7, 5, 4); rect(g, '#d83a2a', 5, 8, 1, 2); rect(g, '#f08a20', 5, 7, 1, 1);     // the white square and its flame (the left half is kept)
    ellS(g, ['#14200e', '#2a3a1a', '#4a5a30'], 5, 15, 2, 1.2, 0.2);
  });
  ftMirror(x, 12, 24);
}));
const ftYellow = () => rotSet(sprite(12, 24, x => {
  ftBase(x, YELLOW, g => {
    rect(g, '#141416', 1, 8, 10, 2);                                                                      // a black band
    for (let i = 1; i < 11; i++) { rect(g, i % 2 ? '#d83a2a' : '#f0f0e8', i, 1, 1, 2); }                    // the red and white stripe aft
    ellS(g, ['#2a1a08', '#5a3a10', '#9a6a20', '#c89a38'], 5, 12.5, 2.2, 2.2, 0.2); rect(g, '#141416', 5, 12, 1, 1);   // hose reel
    ellS(g, ['#2a1a08', '#5a3a10', '#9a6a20', '#c89a38'], 5, 4.6, 1.6, 1.4, 0.2);
  });
  ftMirror(x, 12, 24);
}));
function makeFtrucksV17() { return { ft_silver: ftSilver(), ft_flame: ftFlame(), ft_yellow: ftYellow() }; }
