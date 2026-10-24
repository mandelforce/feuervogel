/* Shadow Wing art v4: options for level 5, The Winter Line (proposal, not wired into the game). Needs docs/shadow-wing-art-v2.js.
     5A sawtooth leading edge (v2)   5B stepped ice-crystal edge   5C skis: two long floats under the wing
     5D V-tail: two fins behind the trailing edge   5E forked tips   5F ice crown: spikes along the trailing edge
   Chosen so far: level 1 today's shape, 2C tip booms, 3A needle dart, 4 the first forest wing (base hull, a third pod). */
const WING_FROST = { ramp: WING_RAMPS2.frost, camo: [0.64, 0.82, 0.14, 7], bands: [[3, 7, 6, 2], [91, 7, 6, 2]], marks: [[22, 13], [78, 13]] };
const WING_VARIANTS4 = {
  '5A': WING_RECIPES2.wn,
  '5B': { ...WING_FROST, hull: wingSym([50, 39], [[60, 35], [60, 31], [70, 31], [70, 26], [80, 26], [80, 21], [90, 21], [90, 16], [99, 16], [99, 12], [97, 6], [72, 13]], [50, 7]), pods: [[40, 12], [60, 12]], marks: [[22, 13], [78, 13]] },
  '5C': { ...WING_FROST, hull: WING_RECIPES2.ch.hull, floats: [[28, 19, 3.6, 14], [72, 19, 3.6, 14]], noTurrets: true, pods: [[40, 12], [60, 12]], marks: [[14, 11], [86, 11]] },
  '5D': { ...WING_FROST, hull: WING_RECIPES2.ch.hull, fins: [[[60, 11], [67, 12], [77, 0], [71, 0]], [[40, 11], [33, 12], [23, 0], [29, 0]]], pods: [[40, 12], [60, 12]] },
  '5E': { ...WING_FROST, hull: wingSym([50, 39], [[70, 29], [88, 20], [99, 15], [96, 12], [90, 11], [96, 3], [92, 1], [78, 9], [72, 13]], [50, 7]), bands: [[90, 2, 4, 2], [6, 2, 4, 2]], pods: [[40, 12], [60, 12]], marks: [[22, 13], [78, 13]] },
  '5F': { ...WING_FROST, hull: wingSym([50, 39], [[99, 12], [97, 6], [88, 10], [86, 1], [80, 10], [75, 1], [69, 11], [63, 3], [58, 10]], [50, 7]), bands: [[3, 7, 6, 2], [91, 7, 6, 2]], pods: [[40, 12], [60, 12]] }
};
const WING_NAMES4 = { '5A': '5A  SAWTOOTH', '5B': '5B  STEPPED CRYSTAL', '5C': '5C  SKIS', '5D': '5D  V-TAIL', '5E': '5E  FORKED TIPS', '5F': '5F  ICE CROWN' };
function makeWingsV4() { const o = {}; for (const k in WING_VARIANTS4) o[k] = wingSpriteV2(WING_VARIANTS4[k]); return o; }
