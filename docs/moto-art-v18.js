/* Motorbike art v18: three rocket launcher bikes (Raketenwerfer, Panzerschreck) with a soldier in the sidecar (proposal, not wired into the game).
   The soldier on foot in the game is the 5 x 7 px SPR.troop (3 walking frames, hit box 6 x 6); the two soldiers on these bikes use the same scale (a helmet about 4 px,
   shoulders about 6 px). The sprite is 14 x 24 (the bike and sidecar are 14 x 18 as in docs/moto-art-v15.js) so the tube can reach out past the front.
   Front to the south, 16 headings through the game's rotSet, lopsided like the original bike with sidecar. Needs docs/moto-art-v15.js (bikeAndSidecar, soldier, colours)
   and the game's toolkit.
     mo_panzerschreck: the sidecar soldier shoulders a Panzerschreck tube with a flared rear and a small blast shield, pointing forward over the nose.
     mo_rw43:          a Raketenwerfer 43 (Puppchen) on a pivot in the sidecar behind a gun shield, the soldier loads from behind it.
     mo_rack:          a rack of four launch tubes in the sidecar, one soldier on the pillion seat behind the driver loading it. */
const RW_TUBE = ['#14161a', '#262a30', '#3e444c', '#5c646e'];
function tubeV(x, cx, y0, y1, w = 2) { boxS(x, RW_TUBE, cx, y0, w, y1 - y0, 0.1); rect(x, '#0a0a0c', cx, y1 - 1, w, 1); }
const moPanzerschreck = () => rotSet(sprite(14, 24, x => {
  bikeAndSidecar(x);
  tubeV(x, 10, 12, 23);                                                      // the tube over the soldier's shoulder, past the nose
  polyS(x, RW_TUBE, [[8, 7], [13, 7], [12, 10], [9, 10]], 0.2, 0.3);          // the flared rear end of the tube
  boxS(x, ['#26282c', '#3a3e44', '#565c66'], 9, 14, 4, 2, 0.2);                // the blast shield
  rect(x, '#e8c040', 10, 20, 2, 1);                                           // a yellow marking
}));
const moRW43 = () => rotSet(sprite(14, 24, x => {
  bikeAndSidecar(x);
  tubeV(x, 10, 12, 23); rect(x, '#6a6e74', 10, 12, 2, 1);                      // the launcher tube on its pivot
  polyS(x, ['#26282c', '#3a3e44', '#565c66', '#7a808a'], [[8, 15], [13, 15], [13, 17], [8, 17]], 0.25, 0.3);          // the gun shield
  rect(x, '#0a0a0c', 8, 17, 5, 1); rect(x, '#9aa4ae', 8, 15, 1, 1); rect(x, '#9aa4ae', 12, 15, 1, 1);
  disk(x, '#26282c', 10.5, 13, 1);                                            // the pivot
}));
const moRack = () => rotSet(sprite(14, 24, x => {
  bikeAndSidecar(x);
  for (const tx of [8, 9, 11, 12]) { boxS(x, RW_TUBE, tx, 11, 1, 10, 0.1); rect(x, '#0a0a0c', tx, 20, 1, 1); }          // four launch tubes side by side
  rect(x, '#0a0a0c', 8, 13, 5, 1); rect(x, '#0a0a0c', 8, 17, 5, 1);                                                      // the rack frames
  soldier(x, 3.5, 1.2);                                                                                                      // a loader on the pillion seat behind the driver
  rect(x, MV_COAT[1], 1, 3, 1, 3); rect(x, MV_COAT[1], 6, 3, 1, 3);
}));
function makeRocketMotosV18() { return { mo_panzerschreck: moPanzerschreck(), mo_rw43: moRW43(), mo_rack: moRack() }; }
