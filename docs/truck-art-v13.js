/* Truck art v13: four alternatives of a typical military transport truck, a little larger than the original (12 x 24 against 10 x 20) with a new front
   (proposal, not wired into the game). The front is rebuilt: a wide cab roof, a windscreen across the cab, a narrower hood with a grille, fender wings
   at the corners with the headlights in them. Front to the south, 16 headings through the game's rotSet, exactly symmetric (drawn on the left half and
   mirrored). Needs mirrorLeftR, symR and the colour constants from docs/road-art-v12.js, and the game's toolkit.
     tr_canvas:  3-tonne canvas truck, tarp over ribs.
     tr_stake:   stake-bed, wooden bed with side boards, jerrycans and crates, a tarp roll behind the cab.
     tr_box:     box-body command truck, roof ventilator and antenna, a door line aft.
     tr_troop:   troop carrier, canvas cover rolled back to show two benches and helmets.
   The hit box (hw 5, hh 9) would grow to about hw 6, hh 11 with the bigger sprite. */

function cabV13(x) {
  boxS(x, RP.fg, 1, 15, 10, 5, 0.14); rect(x, 'rgba(255,255,255,0.12)', 3, 15, 6, 1);          // the wide cab roof
  rect(x, '#8cc0e0', 2, 20, 8, 1); rect(x, '#e8f6ff', 2, 20, 2, 1);                             // the windscreen
  boxS(x, RP.fg, 3, 21, 6, 3, 0.05); rect(x, '#0e1014', 3, 23, 6, 1); rect(x, '#3a3e44', 4, 22, 4, 1);   // the hood, the grille
  boxS(x, RP.fg, 1, 21, 2, 3, 0.2); boxS(x, RP.fg, 9, 21, 2, 3, 0.2);                         // the fender wings
  rect(x, '#fff0a0', 1, 23, 1, 1); rect(x, '#fff0a0', 10, 23, 1, 1);                          // headlights
}
const wheelsV13 = x => { for (const y of [4, 17]) { rect(x, WHL, 0, y, 1, 5); rect(x, WHL, 11, y, 1, 5); } };
const trCanvas = () => symR(12, 24, x => {
  wheelsV13(x);
  boxS(x, RP.olive, 1, 0, 10, 15, 0.05); for (const j of [2, 5, 8, 11]) rect(x, 'rgba(0,0,0,0.38)', 1, j, 10, 1); rect(x, 'rgba(255,255,255,0.1)', 4, 1, 4, 13);
  rect(x, '#d8d0b0', 4, 0, 4, 1);
  cabV13(x);
});
const trStake = () => symR(12, 24, x => {
  wheelsV13(x);
  boxS(x, RP.olive, 1, 0, 10, 15, 0.1); rect(x, '#3a2e1c', 2, 1, 8, 10); for (let j = 2; j < 11; j += 2) rect(x, 'rgba(0,0,0,0.3)', 2, j, 8, 1);   // the wooden floor
  boxS(x, RP.teak, 2, 1, 4, 4, 0.15); boxS(x, RP.teak, 6, 1, 4, 3, 0.25); boxS(x, RP.teak, 3, 5, 6, 3, 0.2);                                         // crates
  for (const jx of [2, 9]) { boxS(x, ['#1a2412', '#2a3a1c', '#3e5228', '#566e38'], jx, 8, 2, 3, 0.1); rect(x, '#e8c040', jx, 9, 2, 1); }            // jerrycans
  boxS(x, RP.sand, 1, 11, 10, 3, 0.1); rect(x, 'rgba(0,0,0,0.3)', 1, 12, 10, 1);                                                                    // the tarp roll
  cabV13(x);
});
const trBox = () => symR(12, 24, x => {
  wheelsV13(x);
  boxS(x, RP.fg, 1, 0, 10, 15, 0.12); rect(x, 'rgba(0,0,0,0.3)', 5, 0, 2, 3); rect(x, 'rgba(0,0,0,0.3)', 1, 3, 10, 1);          // the door line aft
  boxS(x, ['#2c3a30', '#3e5040', '#5a7260', '#7a927e'], 3, 6, 6, 5, 0.1); rect(x, '#0e1014', 5, 8, 2, 2);                          // the roof ventilator
  rect(x, '#9aa4ae', 2, 12, 1, 1); rect(x, '#9aa4ae', 9, 12, 1, 1); rect(x, '#0e1014', 4, 13, 4, 1);                                  // the antenna feet, the gutter
  cabV13(x);
});
const trTroop = () => symR(12, 24, x => {
  wheelsV13(x);
  boxS(x, RP.olive, 1, 0, 10, 15, 0.05); rect(x, '#2a2a1a', 2, 1, 8, 12);                                                            // the bed seen from above
  rect(x, '#5a4630', 2, 2, 8, 2); rect(x, '#5a4630', 2, 6, 8, 2); rect(x, '#5a4630', 2, 10, 8, 2);                                   // benches
  for (const j of [1, 5, 9]) for (let i = 2; i < 10; i += 2) { rect(x, '#5a6a50', i, j, 1, 1); rect(x, '#3e4a36', i, j + 1, 1, 1); }   // helmets
  boxS(x, RP.sand, 1, 12, 10, 3, 0.1); for (const j of [12, 14]) rect(x, 'rgba(0,0,0,0.35)', 1, j, 10, 1);                          // the canvas rolled back behind the cab
  cabV13(x);
});
function makeTrucksV13() { return { tr_canvas: trCanvas(), tr_stake: trStake(), tr_box: trBox(), tr_troop: trTroop() }; }
