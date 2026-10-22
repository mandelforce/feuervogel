/* Road vehicle art v12: three designs each for the truck, armoured car, motorbike, staff car and fuel truck (proposal, not wired into the game).
   Same sizes as the originals (truck 10 x 20, armoured car 12 x 20, motorbike 10 x 15, staff car 8 x 13, fuel truck 10 x 22), front to the south,
   turned into the 16 headings with the game's own rotSet, so they drop in. Written with the game's own toolkit (sprite, polyS, boxS, ellS, disk, rect, rotSet, RP):
   the dither and the plain 1 px edge stay as in the originals. Every design is exactly symmetric (drawn on the left half and mirrored onto the right),
   except the motorbike with a sidecar, which is lopsided by nature.
     truck:  tr_blitz   Opel Blitz, tarp with ribs, a hood and a grille.
             tr_open    open bed, wooden floor with crates, folded tarp behind the cab.
             tr_hoops   canvas on hoops, a white stripe over the cab roof.
     acar:   ac_222     Sd.Kfz. 222, open turret with a mesh screen, twin barrels, four wheels a side.
             ac_231     Sd.Kfz. 231, tall boxy hull with a box turret and one long barrel.
             ac_234     Sd.Kfz. 234 Puma, wedge nose, big hexagonal turret, long gun.
     moto:   mo_solo    solo bike, rider in a helmet, handlebar, headlight.
             mo_side    bike with sidecar and an MG (lopsided).
             mo_kette   Kettenkrad half-track, tracks on both sides, one front wheel.
     staff:  st_kubel   Kuebelwagen, open seats, windscreen, spare wheel.
             st_horch   long-hooded staff car, canvas folded behind.
             st_radio   command car with a radio box and a whip antenna.
     ftruck: ft_round   round tank on a flat bed, dome hatch, hose reel (like the original, tidied).
             ft_ribs    ribbed tank with a ladder and a dome.
             ft_bands   tank with two yellow bands and a red and white warning stripe aft. */

function mirrorLeftR(x, w, h) {
  const c = x.canvas, ox = (c.width - w) / 2, oy = (c.height - h) / 2;     // the sprite helper pads the canvas for the outline
  const d = x.getImageData(ox, oy, w, h), a = d.data, half = w / 2;
  for (let j = 0; j < h; j++) for (let i = 0; i < half; i++) { const s = (j * w + i) * 4, t = (j * w + (w - 1 - i)) * 4; a[t] = a[s]; a[t + 1] = a[s + 1]; a[t + 2] = a[s + 2]; a[t + 3] = a[s + 3]; }
  x.putImageData(d, ox, oy);
}
const WHL = '#141416', GLS = '#8cc0e0', LMP = '#fff0a0';
const symR = (w, h, fn) => rotSet(sprite(w, h, x => { fn(x); mirrorLeftR(x, w, h); }));
const wheelsR = (x, w, ys, hgt = 3) => { for (const y of ys) { rect(x, WHL, 0, y, 1, hgt); rect(x, WHL, w - 1, y, 1, hgt); } };

/* ---------- truck, 10 x 20 ---------- */
function cabR(x, o = {}) {
  boxS(x, RP.fg, 2, 13, 6, 4, 0.12); rect(x, GLS, 3, 16, 4, 1);                                       // the cab and the windscreen
  boxS(x, RP.fg, 3, 17, 4, 3, 0.05); rect(x, '#26282c', 4, 19, 2, 1); rect(x, '#0e1014', 3, 17, 1, 2); rect(x, '#0e1014', 6, 17, 1, 2);   // hood and grille
  rect(x, LMP, 2, 19, 1, 1); rect(x, LMP, 7, 19, 1, 1);
  if (o.roof) rect(x, '#e8e0c8', 3, 14, 4, 1);
}
const trBlitz = () => symR(10, 20, x => {
  wheelsR(x, 10, [3, 13], 4);
  boxS(x, RP.olive, 1, 0, 8, 13, 0.05); for (const j of [3, 6, 9]) rect(x, 'rgba(0,0,0,0.35)', 1, j, 8, 1); rect(x, 'rgba(255,255,255,0.1)', 4, 1, 2, 11);
  cabR(x);
});
const trOpen = () => symR(10, 20, x => {
  wheelsR(x, 10, [3, 13], 4);
  boxS(x, RP.olive, 1, 0, 8, 13, 0.1); rect(x, '#3a2e1c', 2, 1, 6, 9);                                  // the wooden floor
  for (let j = 2; j < 10; j += 2) rect(x, 'rgba(0,0,0,0.3)', 2, j, 6, 1);
  boxS(x, RP.teak, 2, 1, 3, 4, 0.15); boxS(x, RP.teak, 5, 1, 3, 3, 0.25); boxS(x, RP.teak, 3, 5, 4, 4, 0.2);   // crates
  boxS(x, RP.sand, 2, 10, 6, 3, 0.1); rect(x, 'rgba(0,0,0,0.3)', 2, 11, 6, 1);                           // the folded tarp behind the cab
  cabR(x);
});
const trHoops = () => symR(10, 20, x => {
  wheelsR(x, 10, [3, 13], 4);
  boxS(x, RP.sand, 1, 0, 8, 13, 0.0); for (const j of [2, 4, 6, 8, 10]) rect(x, 'rgba(0,0,0,0.4)', 1, j, 8, 1);   // the hoops
  rect(x, 'rgba(255,255,255,0.18)', 4, 1, 2, 11); rect(x, '#d8d0b0', 4, 0, 2, 1);
  cabR(x, { roof: true });
});

/* ---------- armoured car, 12 x 20 ---------- */
const mesh = (x, cx, cy, r) => { for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (i * i + j * j <= r * r && (i + j) % 2 === 0) rect(x, 'rgba(10,10,12,0.45)', cx + i, cy + j, 1, 1); };
const acWheels = x => { for (const y of [2, 6, 10, 14]) { rect(x, WHL, 0, y, 1, 3); rect(x, WHL, 11, y, 1, 3); } };
const ac222 = () => symR(12, 20, x => {
  acWheels(x);
  polyS(x, RP.fg, [[3, 1], [9, 1], [11, 4], [11, 16], [9, 19], [3, 19], [1, 16], [1, 4]], 0.08, 0.4);
  for (let j = 4; j < 16; j += 4) rect(x, 'rgba(0,0,0,0.35)', 2, j, 8, 1);
  ellS(x, RP.fg, 6, 9, 3.6, 3.6, 0.28); mesh(x, 6, 9, 3); disk(x, '#2a2a2e', 6, 9, 1);                    // the open turret with its screen
  rect(x, WHL, 5, 12, 2, 7); rect(x, '#6a6e74', 5, 12, 2, 1); rect(x, GLS, 4, 17, 4, 1); rect(x, LMP, 2, 19, 1, 1); rect(x, LMP, 9, 19, 1, 1);
});
const ac231 = () => symR(12, 20, x => {
  acWheels(x);
  boxS(x, RP.fg, 2, 1, 8, 18, 0.1); boxS(x, RP.fg, 3, 14, 6, 5, 0.22); rect(x, GLS, 4, 17, 4, 1);          // a tall boxy hull, the driver's visor
  for (let j = 4; j < 13; j += 4) rect(x, 'rgba(0,0,0,0.35)', 2, j, 8, 1);
  boxS(x, RP.fg, 3, 5, 6, 6, 0.3); boxS(x, RP.fg, 4, 6, 4, 4, 0.4); rect(x, WHL, 5, 11, 2, 7);           // the box turret and its barrel
  rect(x, '#6a6e74', 5, 11, 2, 1); rect(x, LMP, 2, 19, 1, 1); rect(x, LMP, 9, 19, 1, 1);
});
const ac234 = () => symR(12, 20, x => {
  acWheels(x);
  polyS(x, RP.fg, [[2, 0], [10, 0], [11, 6], [11, 14], [8, 19], [4, 19], [1, 14], [1, 6]], 0.08, 0.4);
  polyS(x, RP.fg, [[6, 19], [3, 14], [9, 14]], 0.25, 0.3);                                               // the sloped wedge nose
  for (let j = 3; j < 12; j += 4) rect(x, 'rgba(0,0,0,0.35)', 2, j, 8, 1);
  polyS(x, RP.fg, [[3, 7], [9, 7], [10, 9], [9, 12], [3, 12], [2, 9]], 0.35, 0.3); disk(x, '#2a2a2e', 6, 9, 1);   // the hexagonal turret
  rect(x, WHL, 5, 12, 2, 8); rect(x, '#6a6e74', 5, 12, 2, 1); rect(x, '#2a2a2e', 5, 19, 2, 1); rect(x, GLS, 4, 14, 4, 1);
});

/* ---------- motorbike, 10 x 15 ---------- */
const MOT = ['#1e2214', '#30382a', '#4a5440', '#66725a'], RID = ['#2a3018', '#4a5430', '#6a7444', '#8a9460'];
const moSolo = () => symR(10, 15, x => {
  rect(x, WHL, 4, 0, 2, 2); rect(x, WHL, 4, 13, 2, 2);                                                   // the wheels
  boxS(x, MOT, 3, 2, 4, 11, 0.1); rect(x, WHL, 1, 10, 8, 1);                                              // the body, the handlebar
  ellS(x, RID, 5, 6, 3, 2.4, 0.2); ellS(x, RID, 5, 8.4, 1.8, 1.8, 0.35); rect(x, '#d8e8f0', 4, 9, 2, 1);   // the rider, the helmet
  rect(x, LMP, 4, 14, 2, 1);
});
const moSide = () => rotSet(sprite(10, 15, x => {                                                        // the original idea with an MG: lopsided by nature
  rect(x, WHL, 2, 0, 2, 2); rect(x, WHL, 2, 13, 2, 2); rect(x, WHL, 9, 7, 1, 3);
  boxS(x, MOT, 1, 2, 4, 11, 0.1); rect(x, WHL, 0, 10, 6, 1);
  ellS(x, RID, 3, 6, 2, 2.2, 0.25); rect(x, '#d8e8f0', 2, 8, 2, 1);
  polyS(x, ['#3e4428', '#565e3a', '#727c50', '#949e6c'], [[5, 4], [9, 5], [9, 12], [7, 13], [5, 12]], 0.1, 0.4);
  ellS(x, RID, 7, 8, 1.6, 1.6, 0.3); rect(x, WHL, 7, 11, 1, 4); rect(x, LMP, 3, 14, 1, 1);
}));
const moKette = () => symR(10, 15, x => {
  boxS(x, ['#141416', '#26282c', '#3a3e44'], 0, 2, 2, 9, 0.0); boxS(x, ['#141416', '#26282c', '#3a3e44'], 8, 2, 2, 9, 0.0);   // the tracks
  for (let j = 3; j < 11; j += 2) { rect(x, '#5a5e64', 0, j, 2, 1); rect(x, '#5a5e64', 8, j, 2, 1); }
  boxS(x, MOT, 2, 1, 6, 11, 0.1); rect(x, WHL, 4, 12, 2, 3); rect(x, WHL, 1, 10, 8, 1);                 // the body, the front wheel, the handlebar
  ellS(x, RID, 5, 5, 2.8, 2.4, 0.2); ellS(x, RID, 5, 7.4, 1.8, 1.8, 0.35); rect(x, '#d8e8f0', 4, 8, 2, 1);
  rect(x, LMP, 2, 12, 1, 1); rect(x, LMP, 7, 12, 1, 1);
});

/* ---------- staff car, 8 x 13 ---------- */
const stWheels = x => { for (const [a, b] of [[0, 2], [7, 2], [0, 9], [7, 9]]) rect(x, WHL, a, b, 1, 3); };
const stKubel = () => symR(8, 13, x => {
  stWheels(x);
  boxS(x, RP.grey, 1, 0, 6, 13, 0.1); rect(x, '#2a2e32', 2, 3, 4, 2); rect(x, '#2a2e32', 2, 6, 4, 2);       // two open seats
  rect(x, WHL, 2, 0, 4, 1); rect(x, '#3a3e44', 3, 0, 2, 1);                                                // the spare wheel
  rect(x, GLS, 1, 9, 6, 1); boxS(x, RP.grey, 2, 10, 4, 3, 0.25); rect(x, LMP, 1, 12, 1, 1); rect(x, LMP, 6, 12, 1, 1);
});
const stHorch = () => symR(8, 13, x => {
  stWheels(x);
  boxS(x, RP.grey, 1, 0, 6, 13, 0.08); rect(x, '#4a4e54', 1, 1, 6, 3);                                    // the canvas folded behind
  rect(x, '#2a2e32', 2, 5, 4, 2); rect(x, GLS, 1, 7, 6, 1);
  boxS(x, RP.grey, 2, 8, 4, 5, 0.3); rect(x, '#5a5e64', 3, 8, 2, 5); rect(x, '#d84a34', 1, 12, 1, 1); rect(x, '#d84a34', 6, 12, 1, 1);   // the long hood, fender flags
});
const stRadio = () => symR(8, 13, x => {
  stWheels(x);
  boxS(x, RP.grey, 1, 0, 6, 13, 0.1); boxS(x, ['#1e2a1e', '#2c3a2c', '#44584a', '#5c7260'], 2, 1, 4, 4, 0.1); rect(x, '#d8e8f0', 3, 2, 2, 1);   // the radio box
  rect(x, '#0e1014', 3, 0, 2, 1); rect(x, '#9aa4ae', 3, 5, 2, 1);                                         // the antenna foot
  rect(x, '#2a2e32', 2, 6, 4, 1); rect(x, GLS, 1, 9, 6, 1); boxS(x, RP.grey, 2, 10, 4, 3, 0.25); rect(x, LMP, 1, 12, 1, 1); rect(x, LMP, 6, 12, 1, 1);
});

/* ---------- fuel truck, 10 x 22 ---------- */
const FT = ['#2a2014', '#3e3020', '#5a4630', '#6e5a40'], FG = ['#1a2412', '#2a3a1c', '#3e5228', '#566e38'], FC = ['#1e2214', '#30382a', '#4a5440', '#66725a'];
const ftCab = x => { boxS(x, FC, 1, 14, 8, 8, 0.15); rect(x, GLS, 2, 19, 6, 1); rect(x, LMP, 1, 21, 1, 1); rect(x, LMP, 8, 21, 1, 1); rect(x, '#0e1014', 3, 21, 4, 1); };
const ftRound = () => symR(10, 22, x => {
  wheelsR(x, 10, [2, 9, 16], 3);
  boxS(x, FT, 1, 0, 8, 14, 0.1); ellS(x, FG, 5, 7, 3.4, 5.6, 0.25); rect(x, '#e8c040', 3, 8, 4, 1); rect(x, '#0e1014', 4, 1, 2, 2);     // the round tank, a yellow band, the hose reel
  rect(x, '#0e1014', 3, 4, 4, 1); disk(x, '#26303c', 5, 4, 1);
  ftCab(x);
});
const ftRibs = () => symR(10, 22, x => {
  wheelsR(x, 10, [2, 9, 16], 3);
  boxS(x, FT, 1, 0, 8, 14, 0.1); boxS(x, FG, 2, 1, 6, 12, 0.2); for (let j = 3; j < 13; j += 3) rect(x, 'rgba(0,0,0,0.4)', 2, j, 6, 1);   // ribbed tank
  rect(x, '#9aa4ae', 1, 2, 1, 9); rect(x, '#9aa4ae', 8, 2, 1, 9);                                         // the ladder rails
  ellS(x, FG, 5, 7, 1.8, 1.8, 0.4); disk(x, '#26303c', 5, 7, 1);
  ftCab(x);
});
const ftBands = () => symR(10, 22, x => {
  wheelsR(x, 10, [2, 9, 16], 3);
  boxS(x, FT, 1, 0, 8, 14, 0.1); ellS(x, FG, 5, 7, 3.6, 6.2, 0.2);
  rect(x, '#e8c040', 2, 4, 6, 1); rect(x, '#e8c040', 2, 10, 6, 1); disk(x, '#26303c', 5, 7, 1);           // two yellow bands
  for (let i = 1; i < 9; i++) rect(x, i % 2 ? '#d84a34' : '#e8e0c8', i, 0, 1, 1);                         // the warning stripe aft
  ftCab(x);
});

function makeRoadV12() {
  return { tr_blitz: trBlitz(), tr_open: trOpen(), tr_hoops: trHoops(), ac_222: ac222(), ac_231: ac231(), ac_234: ac234(),
    mo_solo: moSolo(), mo_side: moSide(), mo_kette: moKette(), st_kubel: stKubel(), st_horch: stHorch(), st_radio: stRadio(),
    ft_round: ftRound(), ft_ribs: ftRibs(), ft_bands: ftBands() };
}
