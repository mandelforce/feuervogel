/* Shadow Wing art v5: the six chosen ships with visible guns (proposal, not wired into the game). Needs the v2, v3 and v4 art files.
   Chosen looks: 1 today's shape, 2 tip booms (2C), 3 needle dart (3A), 4 the first forest wing (third pod), 5 skis (5C), 6 gun nacelles.
   Guns, in sprite coordinates (the 100 x 40 drawing, before the 1 px outline): turrets on the leading edge (the burst), a nose cannon (the fan),
   a centre turret (ring, spiral, twin ring), five small barrels under the leading edge (the curtain), a heavy barrel (the triple shell), guns on the skis or
   nacelles (the lanes). MUZZLES lists where each shot starts, so a bullet never appears out of nowhere. */
const WING_GUNS = { barrels: [[31, 21, 2, 10], [67, 21, 2, 10], [49, 34, 2, 5]], domes: [[50, 21, 3.5]] };
const wingEdgeY = x => 39 - (50 - x) * 27 / 49; // the leading edge of the base hull
// the curtain guns: five small barrels under the leading edge (two a side, the middle one is the nose cannon); WING_PORTS are their muzzles
const WING_PORT_X = [12, 22, 50, 78, 88], wingPortY = x => Math.round(wingEdgeY(x < 50 ? x : 100 - x));
const WING_PORT_BARRELS = WING_PORT_X.filter(x => x !== 50).map(x => [x, wingPortY(x) - 1, 1, 4]);
const WING_PORTS = WING_PORT_X.map(x => x === 50 ? [50, 39] : [x, wingPortY(x) + 3]);
const WING_FINAL = [
  { ...WING_RECIPES2.ch, ...WING_GUNS },
  { ...WING_VARIANTS3['2C'], ...WING_GUNS, barrels: [...WING_GUNS.barrels, ...WING_PORT_BARRELS] },
  { ...WING_RECIPES2.nt, ...WING_GUNS, barrels: [[31, 21, 2, 9], [67, 21, 2, 9], [49, 34, 2, 5]] },
  { ramp: RP.olive, camo: [0.5, 0.66, 0.2, 31], splinter: true, hull: WING_RECIPES2.ch.hull, pods: [[40, 12], [50, 14], [60, 12]], marks: [[20, 13], [80, 13]], ...WING_GUNS, barrels: [...WING_GUNS.barrels, [49, 22, 2, 7]] },
  { ...WING_VARIANTS4['5C'], ...WING_GUNS, barrels: [...WING_GUNS.barrels, [49, 22, 2, 7], [27, 31, 2, 5], [71, 31, 2, 5], ...WING_PORT_BARRELS] },
  { ...WING_RECIPES2.bc, domes: WING_GUNS.domes, barrels: [[49, 34, 2, 5]] }
];
const WING_MUZZLES = [
  { burst: [[32, 31], [68, 31]], nose: [50, 39], center: [50, 21] },
  { burst: [[32, 31], [68, 31]], nose: [50, 39], center: [50, 21], ports: WING_PORTS },
  { burst: [[32, 30], [68, 30]], nose: [50, 39], center: [50, 21] },
  { burst: [[32, 31], [68, 31]], nose: [50, 39], center: [50, 21], heavy: [50, 29] },
  { burst: [[32, 31], [68, 31]], nose: [50, 39], center: [50, 21], ports: WING_PORTS, heavy: [50, 29], lanes: [[28, 36], [72, 36]] },
  { burst: [[30, 38], [70, 38]], nose: [50, 39], center: [50, 21], lanes: [[30, 38], [70, 38]] }
];
function makeWingsV5() { return WING_FINAL.map(wingSpriteV2); }
