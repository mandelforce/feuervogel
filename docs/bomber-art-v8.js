/* Bomber art v8: four German WW2 bombers as replacement suggestions for the bomber (46 x 34), proposal, not wired into the game.
   Written with the game's own sprite toolkit (sprite, polyS, ellS, rect, cross, camo), like the original, so the dither stays and there are no hard
   black outlines, only the game's own 1 px edge. The engines sit under the wings as in the original: from above only the nacelle tips show,
   before and behind the wing. Nose to the south, one fixed sprite each, 42 to 54 px wide.
     he111: Heinkel He 111, glazed bulbous nose, broad rounded wing, two engines.
     ju88: Junkers Ju 88 A, straight wing, all-glass nose, two engines.
     do17: Dornier Do 17 "Flying Pencil", slim body, twin fins, two engines.
     ju87: Junkers Ju 87 Stuka, gull wing, single engine, wheel spats.
   Needs the game's globals (sprite, polyS, ellS, rect, cross, camo, RP) and LW from docs/fighter-art-v6.js. */

function bmGlass(x, cx, cy, rx, ry, bars) {
  ellS(x, RP.glass, cx, cy, rx, ry, 0.15);
  if (bars) { rect(x, '#1a1a1a', cx, Math.floor(cy - ry) + 1, 1, Math.ceil(ry * 2) - 1); rect(x, '#1a1a1a', Math.floor(cx - rx) + 1, Math.round(cy), Math.ceil(rx * 2) - 1, 1); }
  rect(x, '#e8f6ff', Math.round(cx - rx * 0.5), Math.round(cy - ry * 0.55), 1, 1);
}
function bmNacelle(x, G, ex, cy, rx, ry) { ellS(x, G, ex, cy, rx, ry, 0.05); rect(x, '#1a1a1a', ex - 1, Math.round(cy + ry) - 1, 2, 1); rect(x, RP.yel[3], ex, Math.round(cy + ry), 1, 1); }
function makeHe111V8() {
  return sprite(54, 42, x => {
    const G = LW.green, S = LW.grey;
    polyS(x, S, [[17, 1], [37, 1], [35, 6], [19, 6]]);
    polyS(x, G, [[0, 17], [3, 14], [51, 14], [54, 17], [51, 21], [3, 21]]);
    rect(x, RP.yel[3], 0, 16, 2, 3); rect(x, RP.yel[3], 52, 16, 2, 3);
    polyS(x, G, [[25, 3], [29, 3], [30.5, 17], [23.5, 17]]);
    for (const ex of [14, 40]) bmNacelle(x, G, ex, 17.5, 2.5, 5.2);
    ellS(x, G, 27, 25, 4.2, 12);
    camo(x, 0.58, 0.72, 0.25, 3);
    bmGlass(x, 27, 35, 3.6, 4.6, true); bmGlass(x, 27, 13, 1.8, 2.2);
    cross(x, 7, 17); cross(x, 47, 17);
  });
}
function makeJu88V8() {
  return sprite(50, 42, x => {
    const G = LW.green, S = LW.grey;
    polyS(x, S, [[15, 1], [35, 1], [33, 7], [17, 7]]);
    polyS(x, G, [[0, 17], [2, 15], [48, 15], [50, 17], [48, 23], [2, 23]]);
    rect(x, RP.yel[3], 0, 17, 2, 3); rect(x, RP.yel[3], 48, 17, 2, 3);
    polyS(x, G, [[23, 3], [27, 3], [28.5, 17], [21.5, 17]]);
    for (const ex of [12, 38]) bmNacelle(x, G, ex, 18.5, 2.7, 5.6);
    ellS(x, G, 25, 25, 4.3, 12.5);
    camo(x, 0.58, 0.72, 0.25, 7);
    bmGlass(x, 25, 34, 3.4, 5.4, true); bmGlass(x, 25, 14, 1.8, 2.4);
    cross(x, 6, 18); cross(x, 44, 18);
  });
}
function makeDo17V8() {
  return sprite(46, 42, x => {
    const G = LW.green, S = LW.grey;
    polyS(x, S, [[13, 1], [33, 1], [32, 5], [14, 5]]);
    rect(x, G[2], 12, 0, 2, 7); rect(x, G[2], 32, 0, 2, 7); rect(x, G[4], 12, 0, 1, 7); rect(x, G[4], 32, 0, 1, 7);
    polyS(x, G, [[3, 16], [5, 14], [41, 14], [43, 16], [41, 21], [5, 21]]);
    rect(x, RP.yel[3], 3, 15, 2, 3); rect(x, RP.yel[3], 41, 15, 2, 3);
    for (const ex of [11, 35]) bmNacelle(x, G, ex, 17, 2.2, 4.8);
    ellS(x, G, 23, 22, 2.8, 19.5);
    camo(x, 0.58, 0.72, 0.25, 5);
    bmGlass(x, 23, 35, 2.4, 4, true); bmGlass(x, 23, 15, 1.6, 2);
    cross(x, 8, 17); cross(x, 38, 17);
  });
}
function makeJu87V8() {
  return sprite(46, 40, x => {
    const G = LW.green, S = LW.grey;
    polyS(x, S, [[15, 1], [31, 1], [30, 5], [16, 5]]);
    polyS(x, G, [[0, 13], [10, 13], [16, 10], [30, 10], [36, 13], [46, 13], [45, 19], [35, 22], [11, 22], [1, 19]]);
    rect(x, RP.yel[3], 0, 14, 2, 4); rect(x, RP.yel[3], 44, 14, 2, 4);
    for (const sx of [11, 35]) { ellS(x, G, sx, 20, 1.9, 4.2, -0.1); rect(x, '#1a1a1a', sx - 1, 24, 2, 1); }
    ellS(x, G, 23, 20, 3.6, 16);
    bmNacelle(x, G, 23, 32, 3.4, 3.8);
    camo(x, 0.58, 0.72, 0.25, 9);
    bmGlass(x, 23, 20, 1.8, 3.2, true); bmGlass(x, 23, 12, 1.5, 2);
    cross(x, 6, 16); cross(x, 40, 16);
  });
}
function makeBombersV8() { return { he111: makeHe111V8(), ju88: makeJu88V8(), do17: makeDo17V8(), ju87: makeJu87V8() }; }
