/* Shadow Wing art v3: three variations each for levels 2, 3 and 4 (proposal, not wired into the game). Option A is the shape of v2.
   Needs docs/shadow-wing-art-v2.js (the builder wingSpriteV2, wingSym, WING_RECIPES2) and the game's globals.
     2A crescent (v2)      2B manta: rounded, with a tail stinger      2C twin tip booms
     3A needle dart (v2)   3B serrated trailing edge, three teeth      3C open windows, a ghost wing
     4A centre boom (v2)   4B twin tail booms behind the pods (P-38)        4C fuselage spine, bulbous front */
const WING_BASE_HULL = WING_RECIPES2.ch.hull;
const WING_VARIANTS3 = {
  '2A': WING_RECIPES2.sd,
  '2B': { ramp: RP.sand, camo: [0.56, 0.74, 0.13, 23], hull: wingSym([50, 39], [[66, 33], [82, 25], [93, 18], [99, 12], [99, 7], [92, 4], [72, 6]], [50, 3]), booms: [[48, 0, 4, 5]], pods: [[40, 10], [60, 10]], podRx: 4.2, filters: true, marks: [[20, 12], [80, 12]] },
  '2C': { ramp: RP.sand, camo: [0.56, 0.74, 0.13, 23], hull: WING_BASE_HULL, booms: [[92, 0, 5, 11], [3, 0, 5, 11]], pods: [[40, 11], [60, 11]], podRx: 4.2, filters: true, marks: [[20, 14], [80, 14]] },
  '3A': WING_RECIPES2.nt,
  '3B': { ramp: WING_RAMPS2.night, camo: [0.62, 0.7, 0.15, 5], hull: wingSym([50, 39], [[99, 13], [99, 9], [86, 2], [78, 12], [67, 2], [58, 12]], [50, 5]), pods: [[41, 12], [59, 12]], exhaust: '#ff9a2e', lights: [[2, 6], [97, 6]], dim: [[24, 12], [76, 12]] },
  '3C': { ramp: WING_RAMPS2.night, camo: [0.62, 0.7, 0.15, 5], hull: wingSym([50, 39], [[99, 10], [96, 5], [76, 11]], [50, 6]), holes: [[[32, 16], [45, 16], [38, 26]], [[68, 16], [55, 16], [62, 26]]], noTurrets: true, pods: [[50, 9]], exhaust: '#ff9a2e', lights: [[2, 6], [97, 6]], dim: [[16, 9], [84, 9]] },
  '4A': WING_RECIPES2.fr,
  '4B': { ramp: RP.olive, camo: [0.5, 0.66, 0.2, 31], splinter: true, hull: WING_BASE_HULL, booms: [[35, 0, 5, 11], [60, 0, 5, 11]], pods: [[38, 12], [62, 12]], marks: [[20, 13], [80, 13]] },
  '4C': { ramp: RP.olive, camo: [0.5, 0.66, 0.2, 31], splinter: true, hull: WING_BASE_HULL, spine: true, pods: [[32, 12], [68, 12]], marks: [[18, 13], [82, 13]] }
};
const WING_NAMES3 = { '2A': '2A  CRESCENT', '2B': '2B  MANTA', '2C': '2C  TIP BOOMS', '3A': '3A  NEEDLE DART', '3B': '3B  SERRATED', '3C': '3C  OPEN WINDOWS', '4A': '4A  CENTRE BOOM', '4B': '4B  TWIN BOOMS', '4C': '4C  SPINE' };
function makeWingsV3() { const o = {}; for (const k in WING_VARIANTS3) o[k] = wingSpriteV2(WING_VARIANTS3[k]); return o; }
