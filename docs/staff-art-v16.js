/* Staff car art v16: the three staff car designs (Kuebelwagen, long-hooded Horch, command car with radio) each as an open and a closed version, with a soldier
   steering in the open ones (proposal, not wired into the game). 10 x 16 against 8 x 13 so the soldiers read: shoulders, a steel-grey helmet with a dark rim and a highlight,
   hands on a steering wheel; the open cars also carry a passenger. The hull is mirrored exactly, the steering wheel sits on the driver's side. Front to the south,
   16 headings through the game's rotSet, the game's dither. Needs the game's toolkit (sprite, boxS, ellS, rect, rotSet, RP).
     kubel_open / kubel_closed:  Kuebelwagen, folded or raised canvas top.
     horch_open / horch_closed:  long-hooded Horch.
     radio_open / radio_closed:  command car, radio box and antenna aft, an operator with headphones in the open one. */
const SC_WHL = '#141416', SC_GLS = '#8cc0e0', SC_COAT = ['#242c1e', '#3c4a30', '#566a44', '#74905c'], SC_HELM = ['#161c20', '#2a3640', '#44566a', '#6e8498'], SC_CANVAS = ['#4a4430', '#6a6248', '#8a8260', '#a89e78'];
function scMirror(x, w, h) {
  const c = x.canvas, ox = (c.width - w) / 2, oy = (c.height - h) / 2, d = x.getImageData(ox, oy, w, h), a = d.data;
  for (let j = 0; j < h; j++) for (let i = 0; i < w / 2; i++) { const s = (j * w + i) * 4, t = (j * w + (w - 1 - i)) * 4; a[t] = a[s]; a[t + 1] = a[s + 1]; a[t + 2] = a[s + 2]; a[t + 3] = a[s + 3]; }
  x.putImageData(d, ox, oy);
}
function scSoldier(x, cx, cy, o = {}) {                                  // shoulders and a helmet, seen from above, facing south
  ellS(x, SC_COAT, cx, cy, 2.1, 1.5, 0.2);
  ellS(x, ['#0e1014'], cx, cy + 1.9, 1.8, 1.8, 0); ellS(x, SC_HELM, cx, cy + 1.9, 1.4, 1.4, 0.3); rect(x, '#e8f0f4', Math.round(cx - 1), Math.round(cy + 1.2), 1, 1);
  if (o.phones) { rect(x, '#e8e8e8', Math.round(cx - 2), Math.round(cy + 1.4), 1, 1); rect(x, '#e8e8e8', Math.round(cx + 1), Math.round(cy + 1.4), 1, 1); }
}
function scBody(x, o) {                                                  // hull, seats, windscreen, hood: drawn on one side, mirrored afterwards
  for (const [a, b] of [[0, 2], [0, 10]]) rect(x, SC_WHL, a, b, 1, 4);
  boxS(x, RP.grey, 1, 0, 8, 16, 0.1);
  rect(x, SC_WHL, 2, 0, 3, 1);                                            // spare wheel (the left half is mirrored)
  if (o.radio) { boxS(x, ['#1e2a1e', '#2c3a2c', '#44584a', '#5c7260'], 2, 1, 6, 4, 0.1); rect(x, '#d8e8f0', 3, 2, 2, 1); rect(x, '#9aa4ae', 2, 5, 1, 1); }
  rect(x, SC_GLS, 1, o.wsY, 8, 1);                                        // the windscreen
  boxS(x, RP.grey, 2, o.wsY + 1, 6, 15 - o.wsY, 0.3); rect(x, '#5a5e64', 4, o.wsY + 1, 2, 15 - o.wsY);   // the hood, a ridge
  rect(x, '#fff0a0', 1, 15, 1, 1);                                        // headlights
  if (o.closed) { boxS(x, SC_CANVAS, 1, o.topY, 8, o.wsY - o.topY, 0.05); for (let j = o.topY + 2; j < o.wsY; j += 2) rect(x, 'rgba(0,0,0,0.3)', 1, j, 8, 1); rect(x, 'rgba(255,255,255,0.12)', 2, o.topY, 6, 1); }
  else { rect(x, '#2a2e32', 1, o.seatY, 4, 3); rect(x, '#2a2e32', 5, o.seatY, 4, 3); }              // the seats
}
function scCar(o) {
  return rotSet(sprite(10, 16, x => {
    scBody(x, o); scMirror(x, 10, 16);
    if (!o.closed) {
      scSoldier(x, 3, o.seatY + 0.5);                                      // the driver
      rect(x, '#141416', 2, o.wsY - 1, 3, 1); rect(x, '#d8b48a', 1, o.wsY - 1, 1, 1); rect(x, '#d8b48a', 5, o.wsY - 1, 1, 1);   // the steering wheel and the hands
      scSoldier(x, 7, o.seatY + 0.5, { phones: o.radio });                 // the passenger
    }
  }));
}
const SCARS = {
  kubel_open: { wsY: 11, seatY: 5 }, kubel_closed: { wsY: 11, topY: 3, closed: true },
  horch_open: { wsY: 8, seatY: 3 },  horch_closed: { wsY: 8, topY: 1, closed: true },
  radio_open: { wsY: 11, seatY: 6, radio: true }, radio_closed: { wsY: 11, topY: 6, closed: true, radio: true }
};
function makeStaffV16() { const out = {}; for (const [k, o] of Object.entries(SCARS)) out[k] = scCar(o); return out; }
