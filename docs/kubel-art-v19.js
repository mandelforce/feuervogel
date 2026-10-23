/* Kuebelwagen art v19: a Volkswagen Type 82 Kuebelwagen made for easy recognition, with the driver at the size of the game's standard soldier (proposal, not wired into the game).
   The standard soldier on foot (SPR.troop) is 5 x 7 px, so the shoulders here are 5 px wide and the helmet about 4 px; two seats of 5 px side by side need a hull 12 px wide,
   so the sprite is 12 x 20 against the staff car's 8 x 13 (and the 10 x 16 of v16).
   What makes a Kuebelwagen from above: a flat boxy body with slab sides, a short bonnet with the SPARE WHEEL lying on top of it, a flat windscreen with a frame,
   an open cabin with a rear bench, a flat rear engine deck with cooling louvres, round headlamps on the front fenders, wheels outside the body.
   Front to the south, 16 headings through the game's rotSet, the hull mirrored exactly, the steering wheel on the driver's side. Needs the game's toolkit.
     kv_open:   field grey, open, driver and passenger.
     kv_closed: field grey, the canvas top raised.
     kv_desert: dark yellow (the desert paint), open, driver and passenger. */
const KV_WHL = '#141416', KV_GLS = '#8cc0e0', KV_GREY = ['#2a2e34', '#454b52', '#69727a', '#8e98a0', '#b4bec6'], KV_DESERT = ['#3a2e16', '#5c4a26', '#86703e', '#b09858', '#d4c08a'];
const KV_COAT = ['#242c1e', '#3c4a30', '#566a44', '#74905c'], KV_HELM = ['#161c20', '#2a3640', '#44566a', '#6e8498'], KV_CANVAS = ['#4a4430', '#6a6248', '#8a8260', '#a89e78'];
function kvMirror(x, w, h) {
  const c = x.canvas, ox = (c.width - w) / 2, oy = (c.height - h) / 2, d = x.getImageData(ox, oy, w, h), a = d.data;
  for (let j = 0; j < h; j++) for (let i = 0; i < w / 2; i++) { const s = (j * w + i) * 4, t = (j * w + (w - 1 - i)) * 4; a[t] = a[s]; a[t + 1] = a[s + 1]; a[t + 2] = a[s + 2]; a[t + 3] = a[s + 3]; }
  x.putImageData(d, ox, oy);
}
function kvSoldier(x, cx, cy) {                                           // shoulders 5 px wide, a helmet about 4 px, like the standard soldier
  ellS(x, KV_COAT, cx, cy, 2.6, 1.7, 0.2);
  ellS(x, ['#0e1014'], cx, cy + 2.1, 2.2, 2.2, 0); ellS(x, KV_HELM, cx, cy + 2.1, 1.8, 1.8, 0.3); rect(x, '#e8f0f4', Math.round(cx - 1.5), Math.round(cy + 1.2), 1, 1);
}
function kvHull(x, P, closed) {
  for (const y of [3, 13]) { rect(x, KV_WHL, 0, y, 1, 4); rect(x, KV_WHL, 11, y, 1, 4); }              // wheels outside the body
  boxS(x, P, 1, 0, 10, 20, 0.1);                                                                          // the slab-sided body
  boxS(x, P, 1, 0, 10, 5, 0.25); for (const j of [1, 2, 3]) rect(x, 'rgba(0,0,0,0.4)', 2, j, 8, 1);       // the rear engine deck with louvres
  rect(x, '#b02a1c', 1, 0, 1, 1); rect(x, '#b02a1c', 10, 0, 1, 1);                                        // tail lamps
  boxS(x, P, 1, 3, 2, 3, 0.05); boxS(x, P, 1, 13, 2, 3, 0.05);                                              // the squared fenders over the wheels
  rect(x, KV_GLS, 1, 14, 10, 1); rect(x, '#0e1014', 1, 13, 10, 1); rect(x, '#e8f6ff', 2, 14, 2, 1);        // the flat windscreen in its frame
  boxS(x, P, 2, 15, 8, 4, 0.3); rect(x, '#0e1014', 2, 19, 8, 1);                                         // the bonnet, the bumper
  ellS(x, ['#0e1014'], 6, 17, 3.2, 3.2, 0); ellS(x, ['#1e2024', '#2e3236'], 6, 17, 2.4, 2.4, 0.3); ellS(x, P, 6, 17, 1.2, 1.2, 0.35);   // the spare wheel lying on the bonnet
  rect(x, '#fff0a0', 1, 18, 1, 2); rect(x, '#fff0a0', 10, 18, 1, 2);                                      // round headlamps on the fenders
  if (closed) { boxS(x, KV_CANVAS, 1, 5, 10, 8, 0.05); for (const j of [6, 8, 10]) rect(x, 'rgba(0,0,0,0.32)', 1, j, 10, 1); rect(x, 'rgba(255,255,255,0.12)', 2, 5, 8, 1); }
  else { rect(x, '#3a4046', 1, 5, 10, 3); rect(x, '#3a4046', 1, 9, 5, 4); rect(x, '#3a4046', 6, 9, 5, 4); }   // the rear bench and the two front seats
}
const kvCar = (P, closed) => rotSet(sprite(12, 20, x => {
  kvHull(x, P, closed); kvMirror(x, 12, 20);
  if (!closed) {
    kvSoldier(x, 3.5, 9.4); kvSoldier(x, 8.5, 9.4);                                                        // driver and passenger
    rect(x, '#141416', 2, 12, 3, 1); rect(x, '#d8b48a', 1, 12, 1, 1); rect(x, '#d8b48a', 5, 12, 1, 1);     // the steering wheel and the hands
  }
}));
function makeKubelV19() { return { kv_open: kvCar(KV_GREY, false), kv_closed: kvCar(KV_GREY, true), kv_desert: kvCar(KV_DESERT, false) }; }
