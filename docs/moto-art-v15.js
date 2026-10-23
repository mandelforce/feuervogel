/* Motorbike art v15: four variations of the original motorbike with sidecar, with a clearer soldier driving and one in the sidecar (proposal, not wired into the game).
   Bigger than the original (14 x 18 against 10 x 15) so both soldiers read: a helmet with a rim and a highlight, shoulders in a field-grey coat, arms to the handlebar.
   Lopsided by nature, like the original (bike on the left, sidecar on the right), so not mirrored. Front to the south, 16 headings through the game's rotSet.
   Needs the game's toolkit (sprite, polyS, boxS, ellS, rect, rotSet, RP).
     mo_a: driver and passenger.
     mo_b: the passenger with an MG on a mount.
     mo_c: goggles on both helmets, scarf and belt marks on the coats.
     mo_d: a canvas cover half open on the sidecar, a spare wheel and a jerrycan aft. */
const MV_WHL = '#141416', MV_BIKE = ['#12141a', '#1e222a', '#2e343e', '#444c58'], MV_COAT = ['#2c3426', '#48563c', '#66785a', '#88a078'], MV_HELM = ['#2a3238', '#4a5660', '#7a8a94', '#b0c0c8'];
function soldier(x, cx, cy, o = {}) {                        // shoulders and a helmet, seen from above, facing south
  ellS(x, MV_COAT, cx, cy, 3.2, 2.2, 0.2);
  if (o.belt) rect(x, '#141416', Math.round(cx - 2), Math.round(cy + 0.5), 5, 1);
  if (o.scarf) rect(x, '#d8d0b0', Math.round(cx - 1), Math.round(cy + 1.5), 3, 1);
  ellS(x, ['#0e1014'], cx, cy + 2.7, 2.3, 2.3, 0);           // the dark rim of the helmet
  ellS(x, MV_HELM, cx, cy + 2.7, 1.9, 1.9, 0.3); rect(x, '#e8f0f4', Math.round(cx - 1), Math.round(cy + 1.8), 1, 1);   // the helmet and its highlight
  if (o.goggles) { rect(x, '#d8e8f0', Math.round(cx - 1), Math.round(cy + 4.2), 1, 1); rect(x, '#d8e8f0', Math.round(cx + 1), Math.round(cy + 4.2), 1, 1); }
}
function bikeAndSidecar(x, o = {}) {
  rect(x, MV_WHL, 3, 0, 2, 3); rect(x, MV_WHL, 3, 15, 2, 3); rect(x, MV_WHL, 13, 7, 1, 4);                     // wheels
  boxS(x, MV_BIKE, 2, 3, 4, 12, 0.1); rect(x, MV_WHL, 0, 13, 8, 1);                                              // the bike and the handlebar
  rect(x, MV_WHL, 6, 6, 2, 1); rect(x, MV_WHL, 6, 11, 2, 1);                                                      // the struts to the sidecar
  polyS(x, ['#1c2016', '#2c3222', '#3e4630', '#566040'], [[8, 4], [12, 4], [13, 6], [13, 13], [11, 16], [8, 15]], 0.1, 0.4);   // the sidecar
  rect(x, '#0e1014', 9, 6, 3, 8);                                                                                  // its seat well
  soldier(x, 3.5, 6.2, { goggles: o.goggles, belt: o.goggles, scarf: o.goggles });                                // the driver
  rect(x, MV_COAT[1], 1, 8, 1, 4); rect(x, MV_COAT[1], 6, 8, 1, 4); rect(x, '#d8b48a', 1, 12, 1, 1); rect(x, '#d8b48a', 6, 12, 1, 1);   // arms, hands on the handlebar
  soldier(x, 10.5, 6.8, { goggles: o.goggles, belt: o.goggles, scarf: o.goggles });                                // the passenger
  rect(x, '#fff0a0', 3, 17, 2, 1);                                                                                  // the headlight
}
const moA = () => rotSet(sprite(14, 18, x => { bikeAndSidecar(x); }));
const moB = () => rotSet(sprite(14, 18, x => { bikeAndSidecar(x); rect(x, MV_WHL, 10, 13, 1, 5); rect(x, '#6a6e74', 10, 13, 1, 1); boxS(x, MV_BIKE, 11, 12, 2, 2, 0.3); rect(x, MV_WHL, 9, 12, 3, 1); }));   // the MG, its mount and ammo box
const moC = () => rotSet(sprite(14, 18, x => { bikeAndSidecar(x, { goggles: true }); }));
const moD = () => rotSet(sprite(14, 18, x => {
  bikeAndSidecar(x);
  boxS(x, ['#6a5c3c', '#8a7a50', '#a89868', '#c0b080'], 8, 11, 5, 4, 0.1); for (const j of [12, 14]) rect(x, 'rgba(0,0,0,0.35)', 8, j, 5, 1);   // the half-open canvas on the sidecar
  disk(x, '#26282c', 6, 2, 1); rect(x, '#2a3a1c', 1, 1, 2, 3); rect(x, '#e8c040', 1, 2, 2, 1);                                                    // spare wheel and a jerrycan aft
}));
function makeMotosV15() { return { mo_a: moA(), mo_b: moB(), mo_c: moC(), mo_d: moD() }; }
