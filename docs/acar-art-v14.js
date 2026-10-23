/* Armoured car art v14: four variations of the original armoured car with a centred cross, 13 x 22 against 12 x 20 (proposal, not wired into the game).
   The width is odd so the middle is a pixel column: the one-pixel black cross on its flat round white disc, the barrel and the windscreen sit exactly on it,
   and the rest is mirrored about it. Same look as the original (grey-green hull, ribs, round turret, black barrel, blue windscreen, lamps, the game's dither).
   Front to the south, 16 headings through the game's rotSet. Needs the game's toolkit and the constants from docs/road-art-v12.js.
     ac_o1: the original, centred, cross on the rear deck.
     ac_o2: eight wheels, a longer-looking hull with extra ribs.
     ac_o3: twin barrels, a mesh screen over the turret.
     ac_o4: a bigger turret with the cross on its roof. */
const FGX = ['#1e2214', '#30382a', '#4a5440', '#66725a', '#8a9878'];
function mirrorOdd(x, w, h) {
  const c = x.canvas, ox = (c.width - w) / 2, oy = (c.height - h) / 2;
  const d = x.getImageData(ox, oy, w, h), a = d.data;
  for (let j = 0; j < h; j++) for (let i = 0; i < (w - 1) / 2; i++) { const s = (j * w + i) * 4, t = (j * w + (w - 1 - i)) * 4; a[t] = a[s]; a[t + 1] = a[s + 1]; a[t + 2] = a[s + 2]; a[t + 3] = a[s + 3]; }
  x.putImageData(d, ox, oy);
}
function crossCentred(x, cx, cy) {                                           // white round disc 5 px across, one pixel black cross lines, flat
  x.fillStyle = '#f2f0e6'; for (const [dy, hw] of [[-2, 1], [-1, 2], [0, 2], [1, 2], [2, 1]]) x.fillRect(cx - hw, cy + dy, 2 * hw + 1, 1);
  x.fillStyle = '#0a0a0c'; x.fillRect(cx - 2, cy, 5, 1); x.fillRect(cx, cy - 2, 1, 5);
}
function acarBase(x, wheelYs) {
  for (const y of wheelYs) { rect(x, '#141416', 0, y, 1, 3); rect(x, '#141416', 12, y, 1, 3); }
  polyS(x, FGX, [[3, 1], [10, 1], [12, 4], [12, 18], [10, 21], [3, 21], [1, 18], [1, 4]], 0.08, 0.4);
}
function acarSprite(draw, cross) {
  return rotSet(sprite(13, 22, x => { draw(x); mirrorOdd(x, 13, 22); if (cross) crossCentred(x, cross[0], cross[1]); }));
}
const acO1 = () => acarSprite(x => {
  acarBase(x, [3, 9, 15]); for (let j = 4; j < 18; j += 4) rect(x, 'rgba(0,0,0,0.35)', 2, j, 9, 1);
  ellS(x, FGX, 6.5, 11, 3.2, 3.2, 0.5); rect(x, '#141416', 6, 13, 1, 7); rect(x, '#8cc0e0', 4, 19, 5, 1); rect(x, '#fff0a0', 2, 21, 1, 1); rect(x, '#fff0a0', 10, 21, 1, 1);
}, [6, 5]);
const acO2 = () => acarSprite(x => {
  acarBase(x, [2, 7, 12, 17]); for (let j = 3; j < 19; j += 3) rect(x, 'rgba(0,0,0,0.35)', 2, j, 9, 1);
  ellS(x, FGX, 6.5, 11, 3.2, 3.2, 0.5); rect(x, '#141416', 6, 13, 1, 7); rect(x, '#8cc0e0', 4, 19, 5, 1); rect(x, '#fff0a0', 2, 21, 1, 1); rect(x, '#fff0a0', 10, 21, 1, 1);
}, [6, 5]);
const acO3 = () => acarSprite(x => {
  acarBase(x, [3, 9, 15]); for (let j = 4; j < 18; j += 4) rect(x, 'rgba(0,0,0,0.35)', 2, j, 9, 1);
  ellS(x, FGX, 6.5, 11, 3.8, 3.8, 0.5);
  for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) if (i * i + j * j <= 10 && (i + j) % 2 === 0) rect(x, 'rgba(10,10,12,0.45)', 6 + i, 11 + j, 1, 1);   // the mesh screen
  rect(x, '#141416', 5, 13, 1, 6); rect(x, '#141416', 7, 13, 1, 6); rect(x, '#2a2a2e', 6, 13, 1, 2);                                                      // twin barrels
  rect(x, '#8cc0e0', 4, 19, 5, 1); rect(x, '#fff0a0', 2, 21, 1, 1); rect(x, '#fff0a0', 10, 21, 1, 1);
}, [6, 5]);
const acO4 = () => acarSprite(x => {
  acarBase(x, [3, 9, 15]); for (let j = 4; j < 18; j += 4) rect(x, 'rgba(0,0,0,0.35)', 2, j, 9, 1);
  ellS(x, FGX, 6.5, 10, 4.2, 4.2, 0.5); rect(x, '#141416', 6, 14, 1, 6); rect(x, '#8cc0e0', 4, 19, 5, 1); rect(x, '#fff0a0', 2, 21, 1, 1); rect(x, '#fff0a0', 10, 21, 1, 1);
}, [6, 10]);
function makeAcarsV14() { return { ac_o1: acO1(), ac_o2: acO2(), ac_o3: acO3(), ac_o4: acO4() }; }
