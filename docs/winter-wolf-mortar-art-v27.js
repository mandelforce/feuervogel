// Winter Wolf mortar turret, the first loop's level 5 (build 1.2.5.90): the avalanche mortar that stands in the rear flak position of each train. One picture, 'bMortar', baked into the Enigma art set;
// the game turns it with the aim (the tube points south, +y, like the flak guns' sprites) and draws the shells' fire and the rack's glow itself. Both trains use it: dark steel, so it sits on the white
// and the charcoal car alike. Run it inside the game (a local build: __sf(code)); it returns { M: data URL, dims }.
(() => {
const W = 22, H = 30, cx = 11, cy = 11;                         // base disc centre; the tube runs south from it
const DK = '#16161a', ST = ['#23282f', '#343b45', '#4a535f', '#66717e', '#8794a3', '#aab6c4'], RED = '#d84a34', RED2 = '#ff7a52', AMB = '#f4d050', WH = '#d8f2ff';
const M = sprite(W, H, x => {
  disk(x, DK, cx, cy, 9);                                         // the turntable: outline, steel disc, an inner ring with bolts
  ellS(x, ST, cx, cy, 8.2, 8.2, 0.1); disk(x, '#2a3038', cx, cy, 5.6);
  for (let k = 0; k < 8; k++) { const a = k * TAU / 8 + 0.2; rect(x, k % 2 ? '#aab6c4' : DK, Math.round(cx + Math.cos(a) * 7), Math.round(cy + Math.sin(a) * 7), 1, 1); }
  for (const sx of [-1, 1]) {                                     // two ammunition boxes either side, red-tipped shells showing
    rect(x, DK, cx + sx * 8 - 2, cy - 5, 5, 9); rect(x, ST[2], cx + sx * 8 - 1, cy - 4, 3, 7); rect(x, ST[4], cx + sx * 8 - 1, cy - 4, 3, 1);
    rect(x, RED, cx + sx * 8 - 1, cy - 2, 1, 2); rect(x, RED, cx + sx * 8 + 1, cy - 2, 1, 2); rect(x, AMB, cx + sx * 8, cy + 1, 1, 1); }
  rect(x, DK, cx - 4, cy + 3, 9, 15);                             // the tube, south: a thick barrel with a dark outline
  for (let j = 0; j < 14; j++) { const l = 0.2 + 0.1 * (j % 4 === 0 ? 1 : 0); rect(x, ST[2], cx - 3, cy + 4 + j, 7, 1); rect(x, ST[4], cx - 3, cy + 4 + j, 2, 1); rect(x, ST[1], cx + 2, cy + 4 + j, 2, 1); }
  rect(x, RED, cx - 3, cy + 8, 7, 2); rect(x, RED2, cx - 3, cy + 8, 7, 1);   // the red band: a mortar
  rect(x, DK, cx - 5, cy + 16, 11, 3); rect(x, ST[5], cx - 4, cy + 16, 9, 1); rect(x, '#07090b', cx - 2, cy + 17, 5, 2);   // the muzzle ring and its bore
  rect(x, WH, cx - 4, cy + 16, 1, 1); rect(x, WH, cx + 4, cy + 16, 1, 1);
  rect(x, DK, cx - 3, cy - 3, 7, 7); ellS(x, ST, cx, cy + 0.5, 3.2, 3.2, 0.15); rect(x, AMB, cx, cy, 1, 1);   // the breech cap on the disc
}, { oc: '#0a0b0e' });
return { M: M.c.toDataURL(), dims: [M.c.width, M.c.height] };
})()
