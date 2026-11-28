/* FEUERVOGEL 89 sortie composer (docs/daily-sortie-plan.md): puts a level-length segment list together from a kit.
   Pure and deterministic: the same kit, seed and sub-seed always give the same sortie. No DOM, no game globals, no Math.random,
   so the Node test (tests/compose.mjs) and the game run this same file. The game carries a copy in index.html
   (the block with id sortieComposeSrc, refreshed by node scripts/embed-citygen.mjs; tests/compose.mjs fails while it is old).

   A kit is one climate's ground: its generator preset, a fixed opener and approach, a vocabulary of middle templates with a
   grammar (which may follow which, how often, how long), the level whose boss, theme and art it borrows, and its encounters.
   The grammar is what the presets tolerate, measured by tests/compose-probe.mjs (sections 6.2 and 6.6 of the plan). The length
   ranges below are narrower than what is merely valid: they keep every stretch long enough to play and short enough not to drag.

   composeSortie(kitId, seed, sub) -> { v, kit, level, seed, sub, base (the seed with the sub-seed mixed in: the game's sortie seed), attempt, segs: [{ t, start, n }], len, encPlan, wingC (the chunk the Shadow Wing comes at), boss, arena,
     climate, timeOfDay, gen: { preset, seed, params } }  (gen is what CityGen.generate takes)
   composeSortie(kitId, seed, sub, flavour): flavour 'plain' (default), 'rank', 'variant' or 'loop' (section 11.2 of the plan): adds .flavour, .ground, .rank
   composeSortie(kitId, seed, sub, flavour, twist): twist 'none' (default) or one of TWISTS (section 11.1): adds .twist. A twist never changes the segment list;
     it is a rule or a look the game applies (index.html, twistOf()), so the same seed gives the same segments with or without it.
   dailySeed('YYYY-MM-DD') -> { date, n, day, kit, seed, sub, flavour, twist }   the day is UTC, the kit by rotation, sub from DAILY_REROLL, the flavour by weight,
     the twist by its own rotation (TWIST_ORDER: seven days, so one twist never comes two days running and a kit meets it once in 21 days); DAILY_PLAIN lists dates
     the vetting made plainer (1: flavour plain; 2: flavour plain and no twist)
   composeDaily('YYYY-MM-DD') -> composeSortie of that day, with .date
   check(kitId, sortie) -> [] or the list of broken rules (gate 1). composeSortie only returns a sortie that passes it. */
(function (root) {
'use strict';
const VERSION = 7; // composeVersion: raise it with any change that alters what a date gives (the kits, the walk, the hash use); anything keyed by date uses date + version
const CH_S = 174; // frames the level scrolls one chunk (measured: the boss trigger comes 2.9 s per chunk after the start, tests/daily-baseline.json)

// The game's sortieHash, bit for bit (tests/compose.mjs compares the two): a pure hash of two integers, 0 <= result < 1.
function hash(a, b) { let h = Math.imul(a | 0, 0x9E3779B1) ^ Math.imul(b | 0, 0x85EBCA6B); h = Math.imul(h ^ (h >>> 15), 0x2C1B3C6D); h = Math.imul(h ^ (h >>> 12), 0x297A2D39); return ((h ^ (h >>> 15)) >>> 0) / 4294967296; }
const hashInt = (a, b) => (hash(a, b) * 4294967296) | 0;

/* The kits. Lengths in chunks (64 px).
   opener, approach: fixed, in order: [template, chunks].
   middle[t]: len [min, max]; max: how often it may appear; heat: how hard the stretch fights (0 quiet .. 1 hot), for the rhythm
     (the composer's own estimate from each template's gun sites and features; tune it with the flight gate's numbers);
     built: the highest share of structures a segment of it may have (gate 2; twice the hand-made level's highest, plus 5 points).
   follows[t]: what may come directly after t (the opener's last template and every middle one). The approach may follow any
     middle template that differs from its first.
   len: the total, in chunks. boss: { add: n } the trigger n chunks past the level's end, or { yard: true } (level 5's rule, which the
     game works out from the screen). arena: chunks of plan past the level's end. params: the generator's, besides segs.
   enc[t]: encounters a segment of t may hold: { id, at: chunks into the segment, end: chunks before its end the try is given up,
     frames: how long it runs (measured in the first loops, tests/daily-baseline.json), first/last: only in the level's first or
     last segment of that template }. Taken from the loops' hand-made plans (buildSortie). Only those that work on the first pass's ground
     are listed (flown in phase 2: every event of these finds its place; see section 8 of the plan). */
/* The bosses (plan 12.9, 12.10). Every kit's end ground is its level's own boss arena (legacy ground: the city's airfield apron, the desert's sand, the forest's grass with its central rail, the winter's snowy rail yard), and a boss fights on any arena in the game; what differs is whether it belongs there. The probe (tests/daily-gate.mjs --boss) flew every boss on every arena: all 24 fights end the level. So a kit's pool is its own boss, and the others whose ground the arena provides: the sky fortress flies, so any; the land fortress on open ground, any of the four; the train and the supergun need the arena's central rail, which the forest and the winter arenas have (x 112); the ship needs water and the castle its own castle ground, so neither is in a pool yet (no arena has water; the castle has no other climate's version). The forms: the boss as it is, heavy (20 % more hit points), light (30 % fewer), and for the sky fortress the first loop's twin lance pods (a lance form with more hit points took up to 5.8 minutes on Ace and was dropped). */
const BOSS_FORMS = { plain: {}, heavy: { hpK: 1.2 }, light: { hpK: 0.7 }, yard: { yard: true } }, /* (yard: the Campaign's two-train boss on a yard ground of eight tracks with crossovers, in the desert and the city, plan 12.22) */ FORT_FORMS = { lance: { lance: true }, light: { hpK: 0.65 }, small: { small: true, hpK: 0.8 } }; /* (small: the sky fortress at three quarters of its size, plan 12.22) */
const CASTLE_SKINS = { sand: 1, ice: 1, fort: 1 }; /* the castle's climates (plan 12.20): the forest's Ravenhold recoloured in sandstone, ice and whitewashed stone */
const MOTH_FORMS = { storm: { storm: true, hpK: 1.25 } }; /* (the Moth's stronger form: a quarter more hit points and a wider, longer blinding attack, plan 12.22) */
function bossPool(spec) { const out = []; for (const [kind, forms] of spec) for (const [id, w] of forms) { const f = kind === 'skyfort' && FORT_FORMS[id] ? FORT_FORMS[id] : kind === 'castle' && CASTLE_SKINS[id] ? { castle: id } : kind === 'moth' && MOTH_FORMS[id] ? MOTH_FORMS[id] : BOSS_FORMS[id] || {}; out.push(Object.assign({ id: kind === 'skyfort' ? id : kind + ':' + id, w, kind }, f, kind === 'ship' || kind === 'wolfpack' || kind === 'squadron' || kind === 'slipway' || kind === 'ghostship' || kind === 'leviathan' ? { sea: true, not: ['rail_yard'] } : kind === 'train' && id === 'yard' ? { not: ['rail_yard'] } /* (the city's own rail-yard ending has tracks of its own) */ : null)); } return out; }
const KITS = {
  desert: { id: 'desert', level: 2, preset: 'sandSea', params: { variant: 0 }, arena: 0, boss: { add: 5 }, climate: 'desert', timeOfDay: 'day', len: [62, 82],
    opener: [['harbour_commercial', 6], ['beach_town', 5]], approach: [['desert_open', 9]],
    islandOpen: { share: 0.3, variants: [[['open_sea', 2], ['island_chain', 4], ['island_archipelago', 4]], [['open_sea', 2], ['island_archipelago', 4], ['island_fortress', 4]], [['open_sea', 2], ['island_fortress', 4], ['island_chain', 4]]] }, /* (in 30 % of the days the level opens over the sea among bands of sandy islets, before the port: the temperate kit's bands in the desert's look, plan 12.22) */
    openers: [[['harbour_commercial', 6], ['beach_town', 5]], [['harbour_dock', 6], ['beach_town', 5]]], openerShare: 0.3, /* (shared piece, plan 12.20: the city's dockyard, the side harbour's shipyard with hulls on slipways, along the desert port's end quay, in 30 % of the days) */
    middle: {
      valley: { len: [7, 12], max: 2, heat: 0.4, built: 0.15 },
      village: { len: [7, 8], max: 1, heat: 0.8, built: 0.55 }, // (not shorter: the held village's defences reach 190 px south of its middle and must stay inside its own segment; at 4 to 6 chunks they ran into the port, the pass's rock or the open desert's hamlet in 42 of 216 composed lists, at 7 in 0 of 63)
      oasis_town: { len: [7, 9], max: 1, heat: 0.7, built: 0.45 }, // a large held oasis (new, ground plan phase 5); not next to the village (two heavy defences), nor before the open desert, whose roadside hamlet reaches into it
      station_junction: { len: [6, 10], max: 1, heat: 0.5, built: 0.27 },
      desert_open: { len: [4, 7], max: 2, heat: 0.1, built: 0.23 },
      airbase_desert: { len: [7, 10], max: 1, heat: 0.7, built: 0.42 },
      pass: { len: [8, 12], max: 1, heat: 0.9, built: 0.17 } },
    fixedBuilt: { harbour_commercial: 0.8, harbour_dock: 0.8, beach_town: 0.36, desert_open: 0.23 },
    follows: {
      beach_town: ['valley', 'village', 'oasis_town', 'station_junction', 'desert_open', 'airbase_desert', 'pass'],
      valley: ['village', 'oasis_town', 'station_junction', 'desert_open', 'airbase_desert', 'pass'],
      village: ['valley', 'station_junction', 'desert_open', 'airbase_desert', 'pass'],
      oasis_town: ['valley', 'station_junction', 'desert_open', 'airbase_desert', 'pass'],
      station_junction: ['valley', 'village', 'oasis_town', 'desert_open', 'airbase_desert', 'pass'],
      desert_open: ['valley', 'station_junction', 'airbase_desert', 'pass'], // (not the village: a later open desert's roadside hamlet reaches up to 70 px past its segment's end, into the village's defences: 3 of 300 composed lists)
      airbase_desert: ['valley', 'village', 'oasis_town', 'station_junction', 'desert_open', 'pass'],
      pass: ['valley', 'village', 'oasis_town', 'station_junction', 'desert_open', 'airbase_desert'] },
    enc: { island_fortress: [{ id: 'fortstrike', at: 1, end: 2, frames: 1100 }], island_archipelago: [{ id: 'reefpatrol', at: 1, end: 2, frames: 1000 }], oasis_town: [{ id: 'flaklane', at: 0, end: 1, frames: 1140 }], station_junction: [{ id: 'junctionrun', at: 0, end: 2, frames: 1100 }], pass: [{ id: 'viaductstrike', at: 1, end: 2, frames: 1100 }], harbour_dock: [{ id: 'dockraid', at: 1, end: 2, frames: 1100 }], valley: [{ id: 'dunesweep', at: 1, end: 2, frames: 1100 }], airbase_desert: [{ id: 'dunebattery', at: 1, end: 2, frames: 1100 }], village: [{ id: 'oasisambush', at: 0, end: 1, frames: 1180 }], desert_open: [{ id: 'burningfield', at: 0, end: 1, frames: 1080, first: true, middle: true }, { id: 'fuelconvoy', at: 1, end: 2, frames: 1280, last: true }] } },
  forest: { id: 'forest', level: 4, preset: 'ironForest', params: { roadEnd: 112 }, arena: 0, boss: { add: 3 }, climate: 'forest', timeOfDay: 'day', len: [50, 66],
    opener: [['beach_cliff', 3]], approach: [['farmland_approach', 7]],
    middle: {
      forest_conifer: { len: [5, 9], max: 2, heat: 0.3, built: 0.21 },
      forest_fortified: { len: [6, 9], max: 2, heat: 0.9, built: 0.18 },
      clearing_village: { len: [4, 6], max: 1, heat: 0.5, built: 0.16 },
      airbase_forest_hidden: { len: [5, 8], max: 1, heat: 0.6, built: 0.22 },
      valley: { len: [5, 8], max: 1, heat: 0.3, built: 0.2 } },
    fixedBuilt: { beach_cliff: 0.1, farmland_approach: 0.13 },
    follows: {
      beach_cliff: ['forest_conifer', 'forest_fortified', 'clearing_village', 'airbase_forest_hidden', 'valley'],
      forest_conifer: ['forest_fortified', 'clearing_village', 'airbase_forest_hidden', 'valley'],
      forest_fortified: ['forest_conifer', 'clearing_village', 'airbase_forest_hidden', 'valley'],
      clearing_village: ['forest_conifer', 'forest_fortified', 'airbase_forest_hidden', 'valley'],
      airbase_forest_hidden: ['forest_conifer', 'forest_fortified', 'clearing_village', 'valley'],
      valley: ['forest_conifer', 'forest_fortified', 'clearing_village', 'airbase_forest_hidden'] },
    enc: { beach_cliff: [{ id: 'cliffbattery', at: 1, end: 1, frames: 1280 }], forest_conifer: [{ id: 'ridgesweep', at: 1, end: 2, frames: 1100 }], forest_fortified: [{ id: 'ridgeflak', at: 1, end: 2, frames: 1100 }] } }, // (not 'valleyconvoy': without the first loop's river three of its eight events make nothing, and it holds the air waves for 2100 frames)
  winter: { id: 'winter', level: 5, preset: 'winterGorge', params: { joinRoad: 1 }, arena: 48, boss: { yard: true }, climate: 'winter', timeOfDay: 'day', len: [78, 90],
    islandOpen: { share: 0.3, take: 12, variants: [[['open_sea', 2], ['island_chain', 5], ['island_archipelago', 5]], [['open_sea', 2], ['island_archipelago', 5], ['island_fortress', 5]], [['open_sea', 2], ['island_fortress', 5], ['island_chain', 5]]] }, /* (in 30 % of the days the first 12 chunks of the frozen sea are bands of snowy islets: the sea's own chunks, so the length is the same, plan 12.22) */
    opener: [['open_sea_ice', 18], ['harbour_winter', 5], ['farmland_winter', 8]], approach: [['pass', 7], ['farmland_winter', 11]],
    middle: {
      village: { len: [4, 6], max: 1, heat: 0.5, built: 0.31 },
      lake_valley: { len: [6, 8], max: 1, heat: 0.3, built: 0.19 },
      station_winter: { len: [6, 9], max: 1, heat: 0.5, built: 0.13 },
      airbase_snow: { len: [6, 8], max: 1, heat: 0.6, built: 0.13 },
      forest_conifer: { len: [5, 8], max: 2, heat: 0.3, built: 0.13 } },
    fixedBuilt: { open_sea_ice: 0.05, harbour_winter: 0.72, farmland_winter: 0.41, pass: 0.14 },
    groundBuilt: { pass: 0.36 }, /* with the loop's ground (flavours variant and loop) the pass opens into a basin with a base in it: 33 % built in every plan (plan 11.6) */
    follows: {
      farmland_winter: ['village', 'lake_valley', 'station_winter', 'airbase_snow', 'forest_conifer'],
      village: ['lake_valley', 'station_winter', 'airbase_snow', 'forest_conifer'],
      lake_valley: ['village', 'station_winter', 'airbase_snow', 'forest_conifer'],
      station_winter: ['village', 'lake_valley', 'airbase_snow', 'forest_conifer'],
      airbase_snow: ['village', 'lake_valley', 'station_winter', 'forest_conifer'],
      forest_conifer: ['village', 'lake_valley', 'station_winter', 'airbase_snow'] },
    enc: { island_fortress: [{ id: 'fortstrike', at: 1, end: 2, frames: 1100 }], island_archipelago: [{ id: 'reefpatrol', at: 1, end: 2, frames: 1000 }], village: [{ id: 'flaklane', at: 0, end: 1, frames: 1140 }], station_winter: [{ id: 'stationraid', at: 0, end: 2, frames: 1100 }], open_sea_ice: [{ id: 'iceraid', at: 4, end: 6, frames: 1180 }], lake_valley: [{ id: 'iceroad', at: 1, end: 2, frames: 1280 }], forest_conifer: [{ id: 'whiteoutraid', at: 1, end: 2, frames: 1100 }], airbase_snow: [{ id: 'snowbattery', at: 1, end: 2, frames: 1100 }] } }, // (not 'basebreak': without the first loop's basin its two flak guns find no place and it is called off, 5 of 5 flights)
  /* the city (level 6, docs/daily-sortie-plan.md section 12, step 5.2): in over the sea to the south harbour, then the city in any order, the works once, the main station last. The first kit built on the
     segment-native city plan (CityGen: preset portSouth with params.segs). Lengths and limits from the first probe (tests/compose.mjs gate 2). No scripted encounter of its own yet (the loop's harbour raid
     is the Campaign's, behind its first loop); the Shadow Wing and the regular timetable. */
  city: { id: 'city', level: 6, preset: 'portSouth', params: {}, arena: 0, boss: { add: 5 }, climate: 'city', timeOfDay: 'dusk', len: [44, 60],
    opener: [['open_sea', 5], ['harbour_south', 14]], approach: [['station_main', 6]],
    openers: [[['open_sea', 5], ['harbour_south', 14]], [['open_sea', 5], ['harbour_dock', 14]]], openerShare: 0.35, // the harbour is the plain south harbour, or in 35 % of the days the dockyard (the side harbour's shipyard: slipways with hulls on them under gantries, the piers on the first half of the side)
    approaches: [[['station_main', 6]], [['rail_yard', 7]]], approachShare: 0.35, // the level ends in the main station, or in 35 % of the days in a marshalling yard (the rail city: tracks that run on into the arena, level 3's yard)
    gapBefore: { rail_yard: { city_centre: 14 } }, // (the yard narrows the strip for 640 px before it: with the city centre within about 800 px of it the market square was lost in 8 of 40 lists: at least 14 chunks between the centre and the yard)
    cityArena: { n: 48, kinds: ['skyfort', 'fortress', 'rival', 'moth', 'raven', 'shadowwing'], scenes: ['gunline', 'tankcol', 'tankfarm', 'airbase', 'silo', 'bridgedef', 'dam'], tracks: ['longtrain', 'railgun'], sea: ['ship', 'wolfpack', 'squadron', 'ghostship', 'slipway'], yard: ['train'] }, // (yard: the two-train boss, whose rail yard is the arena) // (tracks: the bosses on a rail of their own, laid down the arena; sea: the sea endings, whose coast and open sea are the arena, from the level's sea tail on) // (scenes: the land endings, whose own scene the game lays in one of the arena's scene zones) // the generated boss arena (docs/daily-sortie-generator-audit.md A2): 48 chunks of airfield behind the perimeter fence, for the bosses that fight on a plain airfield, the land endings (their scene in a zone of it) and the bosses on a rail of their own (laid down it); after the rail yard ending its tracks run on through it; a sea ending and the two-train yard keep the Campaign's arena
    arenaTracks: { rail_yard: [55, 169] }, // the yard's two outer tracks (the generator's yard has them at x 55 and 169), painted on through the arena
    middle: {
      city_suburb: { len: [5, 8], max: 2, heat: 0.3, built: 0.9 },
      city_town: { len: [6, 9], max: 2, heat: 0.5, built: 0.95 },
      city_river: { len: [5, 7], max: 2, heat: 0.6, built: 0.95 }, // a river across the city with its bridges (the first with an island, a second without); the generator's river city
      city_centre: { len: [7, 10], max: 1, heat: 0.9, built: 0.95 },
      ruins: { len: [4, 7], max: 2, heat: 0.7, built: 0.95 },
      industrial_power: { len: [7, 9], max: 1, heat: 0.8, built: 0.95 } }, // (a city is built up: the limits sit just above the highest shares measured on 300 lists, 54 % harbour, 65 % suburb, 85 % the rest; the works at least 7 chunks: a quarter of the estate is 220 to 400 px and must have its centre in the stretch)
    require: ['city_centre'], // (every city has its centre: the old town, ring and market square sit at the densest point, and without a centre they land in the harbour stretch, where on the left edge they can block the railway and so the station)
    beforeApproach: ['city_suburb', 'city_town', 'ruins', 'industrial_power'], // (not the city centre: its old town ring takes the room the station needs, 22 of 200 lists lost their station)
    fixedBuilt: { open_sea: 0.1, harbour_south: 0.7, harbour_dock: 0.7, station_main: 0.95, rail_yard: 0.95 },
    follows: {
      harbour_south: ['city_suburb', 'city_town', 'city_centre', 'city_river', 'ruins', 'industrial_power'],
      harbour_dock: ['city_suburb', 'city_town', 'city_centre', 'city_river', 'ruins', 'industrial_power'],
      city_suburb: ['city_town', 'city_centre', 'city_river', 'ruins', 'industrial_power'],
      city_town: ['city_suburb', 'city_centre', 'city_river', 'ruins', 'industrial_power'],
      city_centre: ['city_suburb', 'city_town', 'city_river', 'ruins', 'industrial_power'],
      city_river: ['city_suburb', 'city_town', 'city_centre', 'ruins', 'industrial_power'],
      ruins: ['city_suburb', 'city_town', 'city_centre', 'city_river', 'industrial_power'],
      industrial_power: ['city_suburb', 'city_town', 'city_centre', 'city_river', 'ruins'] },
    /* the boss: bossPool('skyfort') below (plan 12.9, 12.10) */
    bosses: null,
    /* encounters (the game's ENC tables; the first three are the Campaign's level 6 loop's, the four others are new, on their patterns, one for each structure the kit added: plan 12.8) */
    enc: { harbour_south: [{ id: 'harbourraid', at: 1, end: 2, frames: 1100 }], harbour_dock: [{ id: 'dockraid', at: 1, end: 2, frames: 1100 }], city_centre: [{ id: 'cityflak', at: 0, end: 1, frames: 1100 }],
      city_river: [{ id: 'bridgestrike', at: 0, end: 1, frames: 1100 }], industrial_power: [{ id: 'worksstrike', at: 0, end: 1, frames: 1100 }], station_main: [{ id: 'stationrun', at: 0, end: 2, frames: 1100 }], rail_yard: [{ id: 'yardbreakout', at: 0, end: 2, frames: 1100 }] } },
  /* the temperate kit (level 1, plan 12.20): from the carrier over the open sea, bands of islets (the Campaign's chain, a ring of fortress islets, an archipelago of homes and rocks), the large island with the village and the airbase,
     then the old land, painted as level 1's own legacy chunks (a fortified beach, farmland, a village, a wood, a coast, the open sea the ship fights on). The plan is the generator's segment-native islands up to the beach (S.legacyTail
     is the old land after it); every sortie of the kit ends over open sea. The old land's order is its own small walk (kit.legacy). */
  temperate: { id: 'temperate', level: 1, preset: 'islands', params: {}, arena: 0, boss: { add: 1 }, climate: 'temperate', timeOfDay: 'day', len: [28, 40], /* (the plan's chunks, the carrier to the open sea before the beach; the old land after it, kit.legacy.len, is on top) */
    opener: [['carrier_start', 4], ['open_sea', 6]], approach: [['open_sea', 3]],
    middle: {
      island_chain: { len: [5, 7], max: 2, heat: 0.5, built: 0.1 },
      island_fortress: { len: [5, 7], max: 1, heat: 0.8, built: 0.1 },
      island_archipelago: { len: [6, 8], max: 1, heat: 0.4, built: 0.1 },
      island_lagoon: { len: [8, 8], max: 1, heat: 0.6, built: 0.3 }, /* (a ring island with a harbour in it: quay, cranes, ships, warehouses; plan 12.22) */
      island_airbase: { len: [9, 9], max: 1, heat: 0.7, built: 0.3 },
      open_sea: { len: [2, 4], max: 3, heat: 0.1, built: 0.06 } },
    require: ['island_airbase'],
    follows: {
      open_sea: ['island_chain', 'island_fortress', 'island_archipelago', 'island_lagoon', 'island_airbase'],
      island_chain: ['island_fortress', 'island_archipelago', 'island_lagoon', 'island_airbase', 'open_sea'],
      island_fortress: ['island_chain', 'island_archipelago', 'island_lagoon', 'island_airbase', 'open_sea'],
      island_archipelago: ['island_chain', 'island_fortress', 'island_lagoon', 'island_airbase', 'open_sea'],
      island_lagoon: ['island_chain', 'island_fortress', 'island_archipelago', 'island_airbase', 'open_sea'],
      island_airbase: ['open_sea'] },
    minMiddle: 3,
    fixedBuilt: { carrier_start: 0, open_sea: 0.06 },
    main: { open: [['main_shore', 3]], close: [['main_cove', 3]], gate: [['main_gate', 2]], /* (with built-up extras after it the mainland ends in a gate instead: the generator's perimeter street, road junction and rail slope that the old land's grid meets, plan 12.22) */ /* (the mainland ends at a north shore of its own, with a jetty: plan 12.22, so that the sea of the boss's arena begins at generated ground, not at the legacy coast) */ middle: { main_farm: { len: [4, 7], max: 2, heat: 0.3 }, main_river: { len: [5, 7], max: 1, heat: 0.3 }, /* (farmland with a river across it and a bridge on the main road, plan 12.22) */ main_village: { len: [3, 5], max: 1, heat: 0.6 }, main_wood: { len: [3, 5], max: 1, heat: 0.4 } }, len: [16, 22], minMiddle: 3 }, /* (the mainland after the open sea: generator-made ground, plan 12.21: a fortified shore, farmland, a village and a wood, as stretches the walk reorders) */
    legacy: { open: [], close: [['coast_down', 1], ['open_sea', 4]], closeCove: [['open_sea', 4]], len: [4, 17], minMiddle: 0, /* (with extras: the land goes on into them and ends at the legacy coast; with none the mainland has closed itself with its own cove (kit.main.close) and only the open sea is left) */ pick: [0.3, 0.75], /* (what is left of the old land: none, one or two of level 3's built-up grounds, then the coast and the sea) */
      middle: {}, follows: {},
      extras: { main_town: { len: [3, 5] }, main_estate: { len: [4, 6] }, main_airbase: { len: [5, 6] } }, /* (the old land's built-up ground (audit A3, owner: "do step 4"): a town, an industrial estate, the searchlight airbase, generated as the mainland's last stretches (the islands builder copies the generator's town, industrial and airbase plans in, as main_village); they were level 3's legacy town and works ground, city_small, industrial_light and airbase_searchlight, after a gate) */
      extrasFollow: (() => { const all = ['main_town', 'main_estate', 'main_airbase'], f = {}; for (const t of all) f[t] = all.filter(q => q !== t && !(t === 'main_town' && q === 'main_estate') && !(t === 'main_estate' && q === 'main_town')); return f; })() }, /* (the same picks as before: the town and the estate still do not follow each other) */
    enc: { open_sea: [{ id: 'firstcontact', at: 0, end: 1, frames: 2760, first: true, share: 0.45 }]  /* (level 1's first contact lasts 2,760 frames: the carrier's take-off holds it, tests/daily-baseline.json; in 45 % of the days, so that the island bands' encounters have room before the Wing) */, island_fortress: [{ id: 'fortstrike', at: 1, end: 2, frames: 1100 }], island_archipelago: [{ id: 'reefpatrol', at: 1, end: 2, frames: 1000 }], main_farm: [{ id: 'anvil', at: 0, end: 1, frames: 1080, first: true }, { id: 'formations', at: 1, end: 1, frames: 720, last: true }], main_river: [{ id: 'anvil', at: 0, end: 1, frames: 1080 }, { id: 'formations', at: 1, end: 1, frames: 720 }] } },
};
/* Mountain stretches (owner, 2026-11-27: "mountain sections for the generator and daily sortie of all climates"): a middle template in every land kit, 'mountain'
   ('main_mountain' on the temperate mainland), 6 to 8 chunks, at most once a day, after and before any other middle template (the city's beforeApproach keeps it
   off the boss's approach). The generator (CityGen, mountainStretches) builds it on the kit's own line in the climate's look, a cliff or an incline drawn from the
   plan's seed; its flak sites are plan slots, so its encounter is the flak lane. */
for (const k of ['desert', 'forest', 'winter', 'city']) { const K0 = KITS[k]; K0.middle.mountain = { len: [6, 8], max: 1, heat: 0.5, built: 0.3 }; for (const t in K0.follows) if (!K0.follows[t].includes('mountain')) K0.follows[t].push('mountain'); K0.follows.mountain = Object.keys(K0.middle).filter(t => t !== 'mountain'); K0.enc.mountain = [{ id: 'flaklane', at: 1, end: 2, frames: 1140 }]; }
KITS.city.middle.mountain.len = [5, 7]; /* (the city also requires its centre: a shorter mountain keeps its walk's tries low) */
KITS.temperate.main.middle.main_mountain = { len: [5, 7], max: 1, heat: 0.5 }; KITS.temperate.enc.main_mountain = [{ id: 'flaklane', at: 1, end: 2, frames: 1140 }];
/* a mountain day: MOUNTAIN_SHARE of the days (own stream 7101) take one mountain stretch for sure (the kit's walk requires it); the others walk without it, as before */
const MOUNTAIN_SHARE = 0.3;
function mountainKit(kit, base) { const mt = kit.middle.mountain ? 'mountain' : kit.main && kit.main.middle.main_mountain ? 'main_mountain' : null; if (!mt) return kit;
  const on = hash(base | 0, 7101) < MOUNTAIN_SHARE, drop = m => { const r = Object.assign({}, m); delete r[mt]; return r; };
  if (mt === 'mountain') return on ? Object.assign({}, kit, { require: (kit.require || []).concat(['mountain']) }) : Object.assign({}, kit, { middle: drop(kit.middle) });
  return Object.assign({}, kit, { main: Object.assign({}, kit.main, on ? { require: ['main_mountain'] } : { middle: drop(kit.main.middle) }) }); }
const KIT_ORDER = ['desert', 'forest', 'winter', 'city', 'temperate']; // the daily rotation (owner: rotation, so consecutive days differ)
const CASTLE_RUIN_SHARE = 0.3;
const RAVEN_MID_SHARE = 0.3; /* the share of days whose mid-level fight is the Raven prototype */
const WING_AT = 0.375, WING_LATE = 0.55, WING_CH = 18; // the Shadow Wing's encounter: where it comes as a share of the level (the Campaign's levels 2 to 6: chunk 18 of 48) and the chunks it takes (2864 frames and its rest); WING_LATE: how far an encounter before it may push it back (the loops' own plans have it between 0.29 and 0.6)
const RAIL_ARENA = 11; /* chunks of icy gorge after the winter's approach, the supergun's arena: two tracks in the middle */
const ICE_ARENA = 11; /* chunks of frozen sea after the winter's harbour, the wolfpack's arena */
const FAST_K = 1.2; /* the Fast scroll twist: the ground runs 20 % faster (the game's scrollFor), so an encounter and the Shadow Wing, which run fixed frames, cover 20 % more chunks */
const ATTEMPTS = 64, MIN_MIDDLE = 4, ENC_REST = 2; // tries per sub-seed; fewest middle segments; chunks of rest between an encounter's end and the next one's start

// Encounters by segment: at most one per segment, each id once, none starting before the last one has run its length and ENC_REST chunks have passed.
// The Shadow Wing has its place among them: the game brings it once the spawn line passes its chunk and no encounter is on, and while it is up no
// other encounter starts. So it is laid in here as one more encounter (from WING_AT of the level on, after whatever runs then, WING_LATE at the latest), and an encounter whose
// segment the Wing covers is left out instead of being planned and then given up by the game. Returns { enc: [{ id, c, until, live }], wingC }.
function encPlanFor(kit, segs, base, sk = 1) { /* sk: the scroll factor (FAST_K on a Fast scroll day): chunks per encounter and for the Wing grow with it */
  const out = [], used = {}, len = segs.reduce((a, g) => a + g.n, 0), wing0 = Math.round(len * WING_AT), wing1 = Math.round(len * WING_LATE), wingCh = Math.ceil(WING_CH * sk); let free = 0, wingC = -1;
  const layWing = () => { wingC = Math.max(wing0, free); free = wingC + wingCh + ENC_REST; };
  const opLen = kit.islandOpen ? (kit.islandOpen.variants.find(v => v.every((q, k) => segs[k] && segs[k].t === q[0] && segs[k].n === q[1])) || []).length : 0;
  segs.forEach((g, k) => { const list = kit.enc[g.t]; if (!list) return;
    const firstOf = segs.findIndex(q => q.t === g.t) === k, lastOf = segs.map(q => q.t).lastIndexOf(g.t) === k, inMiddle = k >= opLen + (kit.openers ? kit.openers[0] : kit.opener).length && k < segs.length - kit.approach.length;
    for (const e of list) { if (used[e.id] || (e.share !== undefined && !(hash(base | 0, 6900) < e.share)) || (e.first && !firstOf) || (e.last && !lastOf) || (e.middle && !inMiddle)) continue;
      const need = Math.ceil(e.frames * sk / CH_S), c0 = g.start + e.at, until = Math.max(c0 + 1, g.start + g.n - e.end);
      if (wingC < 0 && Math.max(c0, free) + need + ENC_REST > wing1) layWing(); /* (it would keep the Wing waiting past its latest place: the Wing first) */
      const c = Math.max(c0, free); if (c >= until || c >= g.start + g.n) continue; /* (no room left in its segment) */
      if ((kit.legacy || kit.land) && c + need > len - 4) continue; /* (the boss comes one chunk into the last stretch, or on a land day right after the mainland's last one: an encounter that would still run then is left out, not cut short) */
      out.push({ id: e.id, c, until, live: true }); used[e.id] = true; free = c + need + ENC_REST; break; } });
  if (wingC < 0) layWing();
  return { enc: out, wingC };
}

// Gate 1: every rule a composed list must keep. Returns the broken ones (an empty list: it passes).
const J2 = JSON.stringify;
/* The old land of a kit with legacy ground after its plan (the temperate kit): its opening stretches, a walk over the kit's own small grammar, its closing stretches */
function checkLegacy(L, tail) {
  if (L.closeCove && J2(tail.map(g => [g.t, g.n])) === J2(L.closeCove)) return []; /* (no extras: only the open sea after the cove) */
  const bad = [], t = tail.map(g => [g.t, g.n]), no = L.open.length, nc = L.close.length;
  if (t.length < no + nc) return ['the old land is too short: ' + J2(t)];
  L.open.forEach((q, k) => { if (J2(t[k]) !== J2(q)) bad.push('old land opens with ' + J2(t[k]) + ', not ' + J2(q)); }); L.close.forEach((q, k) => { if (J2(t[t.length - nc + k]) !== J2(q)) bad.push('old land closes with ' + J2(t[t.length - nc + k]) + ', not ' + J2(q)); });
  const mid = t.slice(no, t.length - nc), cnt = {}; if (mid.length < (L.minMiddle === undefined ? 1 : L.minMiddle)) bad.push('old land: only ' + mid.length + ' middle stretches');
  mid.forEach((q, k) => { const m = L.middle[q[0]]; if (!m) { bad.push(q[0] + ' is not an old-land template'); return; } cnt[q[0]] = (cnt[q[0]] || 0) + 1; if (q[1] < m.len[0] || q[1] > m.len[1]) bad.push(q[0] + ' at ' + q[1] + ' chunks, outside ' + m.len.join('..'));
    const prev = k ? mid[k - 1][0] : L.open.length ? L.open[L.open.length - 1][0] : null; if (prev && !(L.follows[prev] || []).includes(q[0])) bad.push(q[0] + ' may not follow ' + prev); });
  for (const q in cnt) if (cnt[q] > L.middle[q].max) bad.push(q + ' ' + cnt[q] + ' times in the old land');
  const sum = t.reduce((a, q) => a + q[1], 0); if (sum < L.len[0] || sum > L.len[1]) bad.push('old land of ' + sum + ' chunks, outside ' + L.len.join('..'));
  return bad;
}
/* The mainland of a kit (kit.main): generator-made land stretches after the plan's approach, in the plan's own list (S.segs entries with main: true) */
function checkMain(M, list, cove, ex) {
  const bad = [], t = list.map(g => [g.t, g.n]), no = M.open.length, CL = cove ? M.close || [] : ex && ex.length ? ex : M.gate || [], nc = CL.length, exN = !cove && ex ? ex.reduce((a, q) => a + q[1], 0) : 0; if (t.length < no + nc) return ['the mainland is too short: ' + J2(t)];
  CL.forEach((q, k) => { if (J2(t[t.length - nc + k]) !== J2(q)) bad.push('the mainland closes with ' + J2(t[t.length - nc + k]) + ', not ' + J2(q)); });
  M.open.forEach((q, k) => { if (J2(t[k]) !== J2(q)) bad.push('the mainland opens with ' + J2(t[k]) + ', not ' + J2(q)); });
  const mid = t.slice(no, t.length - nc), cnt = {}; if (mid.length < (M.minMiddle || 1)) bad.push('mainland: only ' + mid.length + ' middle stretches');
  mid.forEach((q, k) => { const m = M.middle[q[0]]; if (!m) { bad.push(q[0] + ' is not a mainland template'); return; } cnt[q[0]] = (cnt[q[0]] || 0) + 1; if (q[1] < m.len[0] || q[1] > m.len[1]) bad.push(q[0] + ' at ' + q[1] + ' chunks, outside ' + m.len.join('..')); if (k && mid[k - 1][0] === q[0]) bad.push(q[0] + ' twice in a row'); });
  for (const q in cnt) if (cnt[q] > M.middle[q].max) bad.push(q + ' ' + cnt[q] + ' times in the mainland');
  if (exN && t.length > nc && t[t.length - nc - 1][0] === 'main_village') bad.push('the village right before the built-up stretches');
  const sum = t.reduce((a, q) => a + q[1], 0); if (sum < M.len[0] + exN || sum > M.len[1] + exN) bad.push('mainland of ' + sum + ' chunks, outside ' + (M.len[0] + exN) + '..' + (M.len[1] + exN));
  return bad;
}
function check(kitId, S) {
  let kit = KITS[kitId]; const bad = []; if (!kit) return ['no kit ' + kitId]; const wa0 = archiDay(kit, S.base, S.seaPick); if (!!S.archi !== wa0) bad.push(wa0 ? 'an archipelago day composed as another' : 'an archipelago day on a day that is not one'); if (wa0) { kit = kit.archiKit; if (S.land) bad.push('an archipelago day composed as a land day'); } else { const wl = !!(kit.landKit && hash((S.base | 0), 6980) < kit.landShare); if (!!S.land !== wl) bad.push(wl ? 'a land day composed as a sea day' : 'a land day on a day that is not one'); if (S.land && kit.landKit) kit = kit.landKit; if (!!S.arenaLand !== !!S.land) bad.push('arenaLand does not match the land day'); }
  const all = S.segs || [], segs0 = all.filter(g => !g.legacy && !g.main), IV = kit.islandOpen && kit.islandOpen.variants.find(v => v.every((q, k) => segs0[k] && segs0[k].t === q[0] && segs0[k].n === q[1])) || [], segs = segs0.slice(IV.length), tail = all.filter(g => g.legacy), mainL = all.filter(g => g.main), mainLen = mainL.reduce((a, g) => a + g.n, 0); /* (a sea ending: legacy stretches after the plan's own, plan 12.11) */
  const tk = IV.length && kit.islandOpen.take || 0, O = (kit.openers || [kit.opener]).map(o => tk ? [[o[0][0], o[0][1] - tk]].concat(o.slice(1)) : o).find(o => o.every((q, k) => segs[k] && segs[k].t === q[0] && segs[k].n === q[1])) || kit.opener, A = (kit.approaches || [kit.approach]).concat(kit.seaApproach ? [kit.seaApproach] : []).find(a => a.length <= segs.length && a.every((q, k) => { const g = segs[segs.length - a.length + k]; return g && g.t === q[0] && g.n === q[1]; })) || kit.approach, mid = segs.slice(O.length, segs.length - A.length); /* (a kit may end in more than one way: kit.approaches, the first that the list ends in) */
  if (S.castleRuin && !(S.bossVar && S.bossVar.kind === 'castle')) bad.push('a castle ruin without a castle');
  { const wa = airDay(kit, S.base, S.bossVar), gp = (S.gen && S.gen.params) || {}; if (!!S.arenaAir !== wa) bad.push(wa ? 'an airfield day without its airfield' : 'an airfield on a day that is not one'); if (wa && gp.finale !== 'airhead') bad.push('an airfield day whose line ends at ' + gp.finale); if (!wa && gp.finale === 'airhead') bad.push('a railhead without its airfield'); const wsn = snowDay(kit, S.bossVar); if (!!S.arenaSnow !== wsn) bad.push(wsn ? 'a winter land ending without its snowfield' : 'a snowfield on a day that is not a land ending'); if (wsn !== (gp.finale === 'railend')) bad.push('a land ending whose line ends at ' + gp.finale); if (wsn && J2(segs.slice(-kit.airApproach.length).map(g => [g.t, g.n])) !== J2(kit.airApproach)) bad.push('a land ending that does not end in its approach'); if (wa && J2(segs.slice(-kit.airApproach.length).map(g => [g.t, g.n])) !== J2(kit.airApproach)) bad.push('an airfield day that does not end in its approach'); }
  { const ap = all.filter(g => !g.legacy && !g.main), last = ap[ap.length - 1], want = cityArenaFor(kit, S.bossVar, S.legacyTail | 0, S.base), wt = want ? cityArenaTracks(kit, [[last ? last.t : '']]) : null, gp = (S.gen && S.gen.params) || {}; if ((S.cityArena | 0) !== want) bad.push('cityArena ' + (S.cityArena | 0) + ', the boss and ending want ' + want); if (S.cityArena && gp.cityArena !== S.cityArena) bad.push('cityArena not in the generator input'); if (String(gp.cityArenaTracks || '') !== String(wt || '')) bad.push('the arena\'s tracks ' + (gp.cityArenaTracks || 'none') + ', the ending wants ' + (wt || 'none')); if (!!gp.cityArenaScenes !== (!!want && cityArenaScenes(kit, S.bossVar))) bad.push('the arena\'s scene zones do not match the boss'); if (!!gp.cityArenaSea !== (!!want && arenaSeaFor(kit, S.bossVar))) bad.push('the arena\'s sea does not match the ending'); { const tl = all.filter(g => g.legacy).map(g => [g.t, g.n]), wg = want && kit.legacy ? arenaGap(tl) : 0, wo = !!(want && ((kit.legacy && !tl.some(q => q[0] === 'coast_down')) || kit.archi)); if ((gp.cityArenaGap | 0) !== wg) bad.push('the arena begins ' + (gp.cityArenaGap | 0) + ' chunks after the plan, the old land wants ' + wg); if (!!gp.cityArenaOpen !== wo) bad.push('the arena\'s coast does not match the old land'); if (!!gp.cityArenaIsles !== !!(want && arenaSeaFor(kit, S.bossVar) && kit.cityArena.isles)) bad.push('the arena\'s islets do not match the kit'); } if (!!gp.cityArenaYard !== (!!want && !!(S.bossVar && S.bossVar.yard))) bad.push('the arena\'s yard does not match the boss'); { const ws = want && !(S.bossVar && (arenaSeaFor(kit, S.bossVar) || S.bossVar.yard)) ? arenaStyle(kit, S.base, S.bossVar) : null; if ((gp.cityArenaStyle || null) !== ws) bad.push('the arena\'s style ' + gp.cityArenaStyle + ', wanted ' + ws); const wf = ws ? arenaFeature(kit, S.bossVar, S.base, ws) : null; if ((gp.cityArenaFeature || null) !== wf) bad.push('the arena\'s feature ' + gp.cityArenaFeature + ', wanted ' + wf); } if (String(gp.cityArenaBossTracks || '') !== String(want && S.bossVar && S.bossVar.track !== undefined ? [].concat(S.bossVar.track) : '')) bad.push('the arena\'s boss rails do not match the boss'); }
  if (!IV.length && segs0[0] && /^island_/.test(segs0[0].t)) bad.push('an island opener that is not one of the kit\'s'); let at = IV.reduce((a2, q) => a2 + q[1], 0); segs.forEach((g, k) => { if (g.start !== at) bad.push('segment ' + k + ' starts at ' + g.start + ', not ' + at); if (!(g.n >= 1) || g.n !== Math.floor(g.n)) bad.push('segment ' + k + ' has length ' + g.n); at += g.n; });
  { const wantTail = kit.legacy ? null : S.bossVar && (S.bossVar.sea || kit.archi) && kit.seaTail ? kit.seaTail : [], tl = tail.reduce((a, g) => a + g.n, 0); let ta = at + mainLen; if (kit.main) { { const ex = extrasWalk(kit, S.base | 0); bad.push(...checkMain(kit.main, mainL, !ex.length, ex)); } let ma = at; mainL.forEach(g => { if (g.start !== ma) bad.push('mainland stretch starts at ' + g.start + ', not ' + ma); ma += g.n; }); } else if (mainL.length) bad.push('the kit has no mainland'); if (kit.legacy) bad.push(...checkLegacy(kit.legacy, tail)); else if (J2(tail.map(g => [g.t, g.n])) !== J2(wantTail)) bad.push('the sea ending is ' + J2(tail.map(g => [g.t, g.n])) + ', not ' + J2(wantTail)); tail.forEach(g => { if (g.start !== ta) bad.push('legacy stretch starts at ' + g.start + ', not ' + ta); ta += g.n; }); { const gt = mainL.find(g => g.t === 'main_gate'); if (gt && (!tail.length || gt.next !== tail[0].t)) bad.push('the gate is for ' + gt.next + ', the ground after it is ' + (tail[0] && tail[0].t)); if (gt && mainL[mainL.length - 1] !== gt) bad.push('the gate is not the last mainland stretch'); }
    if (S.len !== at + mainLen + tl) bad.push('len ' + S.len + ', segments ' + (at + mainLen + tl)); if ((S.legacyTail | 0) !== tl) bad.push('legacyTail ' + S.legacyTail + ', stretches ' + tl); if (!!S.arenaSea !== !!tl) bad.push('arenaSea does not match the sea ending'); }
  if (at < kit.len[0] || at > kit.len[1]) bad.push('total ' + at + ' outside ' + kit.len.join('..'));
  O.forEach((q, k) => { const g = segs[k]; if (!g || g.t !== q[0] || g.n !== q[1]) bad.push('opener ' + k + ' is not ' + q.join(' ')); });
  A.forEach((q, k) => { const g = segs[segs.length - A.length + k]; if (!g || g.t !== q[0] || g.n !== q[1]) bad.push('approach ' + k + ' is not ' + q.join(' ')); });
  if (mid.length < (kit.minMiddle || MIN_MIDDLE)) bad.push('only ' + mid.length + ' middle segments');
  const count = {}; mid.forEach((g, k) => { const m = kit.middle[g.t]; if (!m) { bad.push(g.t + ' is not a middle template'); return; }
    count[g.t] = (count[g.t] || 0) + 1; if (g.n < m.len[0] || g.n > m.len[1]) bad.push(g.t + ' at ' + g.n + ' chunks, outside ' + m.len.join('..'));
    const prev = k ? mid[k - 1].t : O[O.length - 1][0]; if (!(kit.follows[prev] || []).includes(g.t)) bad.push(g.t + ' may not follow ' + prev); });
  for (const t in count) if (count[t] > kit.middle[t].max) bad.push(t + ' ' + count[t] + ' times, at most ' + kit.middle[t].max);
  if (mid.length && mid[mid.length - 1].t === A[0][0]) bad.push('the approach repeats the last middle template');
  if (mid.length && kit.beforeApproach && !kit.beforeApproach.includes(mid[mid.length - 1].t)) bad.push(mid[mid.length - 1].t + ' may not come directly before the approach');
  for (const t of kit.require || []) if (!mid.some(g => g.t === t)) bad.push('the kit requires ' + t);
  if (kit.bosses && !(S.bossVar && kit.bosses.some(b => b.id === S.bossVar.variant && b.kind === S.bossVar.kind && !!b.lance === !!S.bossVar.lance && !!b.storm === !!S.bossVar.storm && !!b.small === !!S.bossVar.small && !!b.yard === !!S.bossVar.yard && (b.castle || '') === (S.bossVar.castle || '') && (b.hpK || 1) === (S.bossVar.hpK || 1)))) bad.push('the boss is none of the kit\'s: ' + JSON.stringify(S.bossVar || null));
  for (const [t, need] of Object.entries((kit.gapBefore || {})[A[0][0]] || {})) { const i = mid.map(g => g.t).lastIndexOf(t); if (i >= 0) { const gap = mid.slice(i + 1).reduce((a, g) => a + g.n, 0); if (gap < need) bad.push('only ' + gap + ' chunks between ' + t + ' and ' + A[0][0] + ', at least ' + need); } }
  /* spec 4.4, as far as a list can break it: a harbour needs the sea before it (it is the opener's, behind the sea or first over it); a station needs rail
     (every kit's preset lays its line the whole length); one airbase at most (max). The rest is the generator's to keep, and gate 2 checks it. */
  /* the ground dials: only the kit's own, inside their ranges, and none on a day without (S.dials 'off') */
  if (S.gen && S.gen.params && kit.dials) { const D = kit.dials, P = S.gen.params, ps = P.segs || [], have = [];
    ps.forEach((g, k) => { if (!g.p) return; const T = D.seg[g.t] || {}; for (const q in g.p) { have.push(q); const r = T[q]; if (!r) bad.push('dial ' + q + ' on ' + g.t + ' is not allowed'); else if (!(g.p[q] >= r[0] - 1e-9 && g.p[q] <= r[1] + 1e-9)) bad.push('dial ' + q + ' = ' + g.p[q] + ' on ' + g.t + ' outside ' + r.join('..')); } });
    const loopSet = S.ground ? LOOP_PARAMS[kitId] || {} : {}; /* (what the loop ground sets itself, such as the forest's lakes, is not a dial) */
    for (const q in D.global) if (P[q] !== undefined && loopSet[q] === undefined) { have.push(q); if (!(P[q] >= D.global[q][0] - 1e-9 && P[q] <= D.global[q][1] + 1e-9)) bad.push('dial ' + q + ' = ' + P[q] + ' outside ' + D.global[q].join('..')); }
    if (S.dials === 'off' && have.length) bad.push('dials off, yet ' + have.join(',') + ' are set'); }
  const sk = S.twist === 'fast' ? FAST_K : 1, enc = S.encPlan || [], ids = {}, spans = [[S.wingC, S.wingC + Math.ceil(WING_CH * sk), 'the Shadow Wing']];
  { const tot = kit.legacy || kit.main ? all.reduce((a, g) => a + g.n, 0) : at; if (!(S.wingC >= Math.round(tot * WING_AT) && S.wingC <= Math.round(tot * WING_LATE)) || S.wingC + WING_CH > tot) bad.push('the Shadow Wing at chunk ' + S.wingC + ' of ' + tot); }
  enc.forEach(e => { const g = (kit.legacy || kit.main ? all : segs0).find(q => e.c >= q.start && e.c < q.start + q.n), def = g && (kit.enc[g.t] || []).find(q => q.id === e.id);
    if (!def) { bad.push('encounter ' + e.id + ' at chunk ' + e.c + ' is in no segment that holds it'); return; }
    if (ids[e.id]) bad.push('encounter ' + e.id + ' twice'); ids[e.id] = true; if (!(e.until > e.c)) bad.push('encounter ' + e.id + ' has no room');
    spans.push([e.c, e.c + Math.ceil(def.frames * sk / CH_S), e.id]); });
  spans.sort((a, b) => a[0] - b[0]); for (let k = 1; k < spans.length; k++) if (spans[k][0] < spans[k - 1][1] + ENC_REST) bad.push(spans[k][2] + ' starts at chunk ' + spans[k][0] + ', before ' + spans[k - 1][2] + ' is over and rested');
  return bad;
}

// One try at a middle: a seeded walk over the grammar, then the lengths fitted to the target. Returns [[t, n], ...] or null.
function walk(kit, target, r, ap, op) {
  ap = ap || kit.approach; op = op || kit.opener;
  const T = Object.keys(kit.middle), seq = [], count = {}; let sum = 0, prev = op[op.length - 1][0];
  for (;;) {
    const heat = seq.slice(-2).map(q => kit.middle[q[0]].heat), hot2 = heat.length === 2 && heat[0] >= 0.6 && heat[1] >= 0.6, quiet1 = heat.length > 0 && heat[heat.length - 1] < 0.4;
    const cand = T.filter(t => t !== prev && kit.follows[prev].includes(t) && (count[t] || 0) < kit.middle[t].max && sum + kit.middle[t].len[0] <= target); if (!cand.length) break;
    /* weights: a template already used counts a third; after two hot stretches a quiet one is three times as likely and another hot one a quarter; two quiet ones in a row half */
    const w = cand.map(t => { const h = kit.middle[t].heat; return (count[t] ? 1 / 3 : 1) * (kit.require && kit.require.includes(t) && !count[t] ? (kit.gapBefore && kit.gapBefore[ap[0][0]] && seq.length < 2 ? 8 : 3) : 1) /* (a required template not yet in the list is three times as likely: fewer lists thrown away) */ * (hot2 ? (h < 0.4 ? 3 : h >= 0.6 ? 0.25 : 1) : 1) * (quiet1 && h < 0.4 ? 0.5 : 1); }), tot = w.reduce((a, b) => a + b, 0);
    let x = r() * tot, k = 0; while (k < cand.length - 1 && x >= w[k]) { x -= w[k]; k++; }
    const t = cand[k], m = kit.middle[t], n = Math.min(target - sum, m.len[0] + Math.floor(r() * (m.len[1] - m.len[0] + 1)));
    seq.push([t, n]); count[t] = (count[t] || 0) + 1; sum += n; prev = t;
  }
  /* fit: the chunks still missing go, one at a time, to the segment with the most room left (the first of equals) */
  for (let rest = target - sum; rest > 0; rest--) { let best = -1, room = 0; seq.forEach((q, k) => { const f = kit.middle[q[0]].len[1] - q[1]; if (f > room) { room = f; best = k; } }); if (best < 0) return null; seq[best][1]++; }
  if (seq.length < (kit.minMiddle || MIN_MIDDLE) || seq[seq.length - 1][0] === ap[0][0] || (kit.beforeApproach && !kit.beforeApproach.includes(seq[seq.length - 1][0])) || (kit.require && !kit.require.every(t => seq.some(q => q[0] === t))) || (kit.gapBefore && kit.gapBefore[ap[0][0]] && Object.entries(kit.gapBefore[ap[0][0]]).some(([t, need]) => { const i = seq.map(q => q[0]).lastIndexOf(t); return i >= 0 && seq.slice(i + 1).reduce((a, q) => a + q[1], 0) < need; }))) return null;
  return seq;
}

/* Ground dials (docs/ground-variety-plan.md): what a day does to the ground, besides the segment list. Per kit, kit.dials = { global, seg, int }:
     global: { dial: [lo, hi] }  a generator parameter for the whole level (the builder reads it from params);
     seg:    { template: { dial: [lo, hi] } }  a value for the segments of that template only (the builder reads segs[i].p);
     int:    the dials that are counts (rounded).
   A day draws DIAL_PICK[0]..[1] of the kit's dials (or none: DIAL_NONE of the days, and every day listed in DAILY_PLAIN), and each segment that can take a drawn dial gets its own
   value, so two villages of one sortie differ. The draw has its own hash stream (6000 and up): the segment list, the encounters and the Wing do not read it. The ranges are
   strong: the dials that changed the most of a frame in the game's contact sheets (plan 4.3); a day that draws dials draws at least one of them (the others, such as the forest's tracks or the desert's house mix, change little alone).
   what gate 2 and the flight gate were run on (tests/dials-probe.mjs); the generator clamps anything outside its own table (tools/citygen.js: *_DIALS). */
const DIAL_NONE = 0.2, DIAL_PICK = [2, 3];
const FOREST_BASE = { forest_conifer: { roads: 2, rides: 3, plantations: 2, clearings: 1, cuts: 1, guns: 3 }, forest_fortified: { roads: 1, rides: 4, plantations: 1, clearings: 1, cuts: 2, guns: 7 }, clearing_village: { roads: 0, rides: 1, plantations: 0, clearings: 3, cuts: 2, guns: 2 },
  airbase_forest_hidden: { roads: 2, rides: 2, plantations: 2, clearings: 1, cuts: 1, guns: 4 }, valley: { roads: 1, rides: 2, plantations: 1, clearings: 2, cuts: 1, guns: 3 } }; // (a copy of the generator's FOREST_BASE; tests/compose.mjs compares the two)
const FOREST_CAP = { roads: 4, rides: 6, plantations: 4, clearings: 5, cuts: 4, guns: 9 }; // (the generator's own limits, FOREST_DIALS)
const forestSeg = () => { const o = {}; for (const t in FOREST_BASE) { const b = FOREST_BASE[t]; o[t] = {}; for (const k of ['roads', 'rides', 'plantations', 'clearings', 'cuts']) o[t][k] = [Math.max(0, b[k] - 3), Math.min(FOREST_CAP[k], b[k] + 3)]; o[t].guns = [Math.max(1, b.guns - 2), Math.min(FOREST_CAP.guns, b.guns + 2)]; o[t].crowns = [0.4, 1.5]; } return o; }; // a count within 3 of the template's own, guns within 2; crowns: how thick the woods are (1 is as it was)
const DIALS = {
  desert: { global: { wear: [0.25, 0.85], portDensity: [0.25, 0.8], portDamage: [0.2, 0.9], mixVillage: [0.15, 0.9] },
    seg: { village: { damage: [0.05, 0.6], mix: [0.15, 1] }, oasis_town: { damage: [0.05, 0.6], mix: [0.15, 1] }, desert_open: { damage: [0.05, 0.5], mix: [0.15, 1] } }, int: [], strong: ['wear', 'portDamage', 'portDensity'] },
  forest: { global: { lakes: [1, 1] }, /* the first loop's lakes, one in each stretch of forest with room for it (a switch: drawn, it is on) */ seg: forestSeg(), int: ['lakes', 'roads', 'rides', 'plantations', 'clearings', 'cuts', 'guns'], strong: ['lakes', 'crowns', 'clearings', 'plantations', 'cuts', 'guns'] },
  winter: { global: { trees: [0.4, 1.8], lotChance: [0.02, 0.15] },
    seg: { village: { treeK: [0.3, 2.2], floorW: [-4, 18] }, lake_valley: { treeK: [0.3, 2.2], floorW: [-6, 22] }, station_winter: { treeK: [0.3, 2.2], floorW: [-6, 22] }, airbase_snow: { treeK: [0.3, 2.2], floorW: [-6, 22] }, forest_conifer: { treeK: [0.3, 2.2], floorW: [-6, 22] } }, int: [], strong: ['treeK', 'floorW'] },
};
/* the city's dials (read by CityGen's cityFromSegs): whole level, the harbour's side channel and shore (ranges from tests: a narrower channel blocks the ship lanes; the shore's position did in every invalid draw, so it is no dial), the old town's size, parks, trees, vacant lots; per stretch, its urbanisation (an offset) and its damage (a factor), and for a river stretch its width, its wobble, an island or not and a harbour district on its bank */
const CITY_DMG = { damage: [0.4, 1.6] }, U = r => Object.assign({ urban: r }, CITY_DMG); /* (urban: an offset of the stretch's urbanisation; per stretch such that no stretch but the city centre (1.0) can reach 0.93, so the centre stays the densest point, where the old town and the market square go) */
DIALS.city = { global: { sideChannel: [41, 62], shoreAmp: [4, 14], oldTownK: [1, 1.25], trees: [0.4, 1.8], parkSpacing: [400, 1000], lotChance: [0.02, 0.15] },
  seg: { harbour_south: U([-0.2, 0.05]), harbour_dock: U([-0.2, 0.05]), city_suburb: U([-0.2, 0.2]), city_town: U([-0.2, 0.2]), city_centre: CITY_DMG, ruins: U([-0.25, 0]), industrial_power: CITY_DMG,
    city_river: Object.assign({}, U([-0.2, 0.1]), { riverW: [20, 36], riverAmp: [4, 10], riverIsland: [0, 1], riverPort: [0, 1] }) },
  int: ['riverIsland', 'riverPort'], strong: ['damage', 'urban', 'oldTownK', 'sideChannel', 'riverW'] };
const BANDS = { count: [-2, 2], size: [0.8, 1.25] };
DIALS.temperate = { global: { bigW: [165, 210], lane: [38, 56] }, seg: { island_chain: BANDS, island_fortress: BANDS, island_archipelago: BANDS }, int: ['count', 'bigW', 'lane'], strong: ['count', 'size', 'bigW'] }; /* (the islet bands: how many islets more or fewer and how big; the large island's width and the warships' lane) */
for (const id in DIALS) KITS[id].dials = DIALS[id];
/* each kit's boss pool: its own boss and forms of it (about half the days), then the others that fit its arena */
KITS.desert.seaTail = KITS.forest.seaTail = KITS.city.seaTail = KITS.winter.seaTail = [['coast_down', 1], ['open_sea', 6]]; KITS.winter.seaTail = [['open_sea', 7]]; KITS.desert.seaTail = [['coast_down', 1], ['open_sea', 5]]; /* (one open-sea chunk less in the desert: its sea ending's last quiet stretch ran to 12.3 s before the boss in one sweep seed) */ /* (no legacy coast: the plan's own harbour basin meets the open sea) */ KITS.winter.seaApproach = [['pass', 7], ['farmland_winter', 14]]; KITS.winter.airApproach = [['pass', 7], ['farmland_winter', 14]]; KITS.winter.airParams = { finale: 'airhead' }; /* (an airfield ending: the line runs on 3 chunks further, as for the harbour, to the airfield's railhead) */ /* (a sea ending: the line runs on 3 chunks further, to its freight harbour) */ KITS.winter.seaParams = { finale: 'depot' }; KITS.winter.iceShare = 0.5; /* (half the harbours are frozen) */ /* (the winter: a sea ending has no gorge in its plan) */ // a sea ending (legacy ground after the plan's end: the coast, then open sea that the arena goes on into), for the ship; not the winter's, whose arena is its own gorge
KITS.temperate.bosses = bossPool([['ship', [['plain', 4]]], ['castle', [['fort', 2]]], ['skyfort', [['plain', 2], ['lance', 2], ['light', 1], ['small', 1]]], ['slipway', [['plain', 1]]], ['squadron', [['plain', 2]]], ['wolfpack', [['plain', 2]]], ['ghostship', [['plain', 1]]], ['shadowwing', [['plain', 1]]], ['raven', [['plain', 1]]], ['moth', [['plain', 1], ['storm', 1]]], ['rival', [['plain', 1]]]]);
KITS.desert.bosses = bossPool([['canyon', [['plain', 1]]], ['dam', [['plain', 1]]], ['sandstorm', [['plain', 1]]], ['bridgedef', [['plain', 1]]], ['silo', [['plain', 1]]], ['train', [['yard', 2]]], ['fortress', [['plain', 3], ['heavy', 1], ['light', 1]]], ['castle', [['sand', 2]]], ['longtrain', [['plain', 1]]], ['railgun', [['plain', 1]]], ['skyfort', [['plain', 2], ['lance', 2], ['light', 1], ['small', 1]]], ['ship', [['plain', 1]]], ['wolfpack', [['plain', 1]]], ['shadowwing', [['plain', 1]]], ['raven', [['plain', 1]]], ['moth', [['plain', 1], ['storm', 1]]], ['slipway', [['plain', 1]]], ['squadron', [['plain', 1]]], ['gunline', [['plain', 1]]], ['tankcol', [['plain', 1]]], ['tankfarm', [['plain', 1]]], ['airbase', [['plain', 1]]], ['rival', [['plain', 1]]], ['ghostship', [['plain', 1]]], ['crawler', [['plain', 2]]]]);
KITS.temperate.cityArena = { n: 48, kinds: [], legacySea: ['ship', 'slipway', 'squadron', 'wolfpack', 'ghostship', 'skyfort', 'shadowwing', 'raven', 'moth', 'rival'], isles: true }; /* (the temperate kit's ending: every day ends over the sea after the old land; the arena is the Campaign's coast after the old land's built-up stretches (or, after the mainland's own cove, open sea), and the open sea with the day's islets, from the coast on; the sea-fort castle keeps the Campaign's sea for its floor) */
/* The temperate kit's land days (owner: "options for more land; there should also be temperate levels that are focused on land in general"): in landShare of its days a short
   crossing (the carrier, a little open sea, the large island with its airbase, perhaps one band of islets) and then a long mainland that runs on to the level's end, with no cove,
   no gate and no old land; the boss fights on a generated arena of the same mainland (KITS.temperate.landKit.cityArena, style 'land': farmland, woods and streams, with open
   pasture for a land ending's scene). Its own pool: the land endings and the bosses that fight over land. The kit's other days are as before. */
KITS.temperate.landShare = 0.4;
KITS.temperate.landKit = Object.assign({}, KITS.temperate, { land: true, len: [19, 28], opener: [['carrier_start', 4], ['open_sea', 4]], approach: [['open_sea', 2]], minMiddle: 1,
  middle: { island_chain: { len: [4, 7], max: 1, heat: 0.5, built: 0.1 }, island_fortress: { len: [4, 7], max: 1, heat: 0.8, built: 0.1 }, island_archipelago: { len: [5, 7], max: 1, heat: 0.4, built: 0.1 }, island_airbase: { len: [9, 12], max: 1, heat: 0.7, built: 0.3 }, open_sea: { len: [1, 4], max: 1, heat: 0.1, built: 0.06 } }, /* (the large island is 620 rows whatever the stretch: a longer one has open sea after it) */
  follows: { open_sea: ['island_chain', 'island_fortress', 'island_archipelago', 'island_airbase'], island_chain: ['island_airbase', 'open_sea'], island_fortress: ['island_airbase', 'open_sea'], island_archipelago: ['island_airbase', 'open_sea'], island_airbase: [] }, /* (the crossing: the large island last, perhaps a band of islets and a little more open sea before it) */
  main: { open: [['main_shore', 3]], close: [], gate: [], middle: { main_farm: { len: [4, 7], max: 3, heat: 0.3 }, main_river: { len: [5, 7], max: 2, heat: 0.3 }, main_village: { len: [3, 5], max: 1, heat: 0.6 }, main_wood: { len: [3, 5], max: 3, heat: 0.4 } }, len: [27, 35], minMiddle: 5 },
  legacy: null, seaTail: null,
  enc: Object.assign({}, KITS.temperate.enc, { main_village: [{ id: 'flaklane', at: 0, end: 1, frames: 1140 }], main_wood: [{ id: 'fuelconvoy', at: 1, end: 2, frames: 1280 }] }), /* (a long mainland: the village's flak lane and a fuel convoy on the road through a wood as well) */
  bosses: bossPool([['gunline', [['plain', 2]]], ['tankcol', [['plain', 2]]], ['tankfarm', [['plain', 1]]], ['airbase', [['plain', 1]]], ['silo', [['plain', 1]]], ['bridgedef', [['plain', 1]]], ['dam', [['plain', 1]]], ['fortress', [['plain', 2], ['heavy', 1]]], ['skyfort', [['plain', 1], ['lance', 1], ['small', 1]]], ['moth', [['plain', 1]]], ['raven', [['plain', 1]]], ['rival', [['plain', 1]]], ['shadowwing', [['plain', 1]]]]),
  cityArena: { n: 48, style: 'land', kinds: ['fortress', 'skyfort', 'moth', 'raven', 'rival', 'shadowwing'], scenes: ['gunline', 'tankcol', 'tankfarm', 'airbase', 'silo', 'bridgedef', 'dam'] } });
KITS.temperate.landKit.main.middle.main_mountain = KITS.temperate.main.middle.main_mountain; /* (the land days' mainland takes the mountain too) */
KITS.desert.cityArena = { n: 48, style: 'desert', airfieldShare: 0.25, kinds: ['fortress', 'skyfort', 'moth', 'rival', 'raven', 'shadowwing'], scenes: ['gunline', 'tankcol', 'tankfarm', 'airbase', 'silo', 'bridgedef', 'dam'], tracks: ['longtrain', 'railgun'], sea: ['ship', 'wolfpack', 'squadron', 'ghostship', 'slipway'] }; /* (the desert's generated boss arena, owner: variations of the desert's own boss area, and the city's final airfield as one option in a quarter of its days; the sand crawler keeps the Campaign's original area, and so for now do the castle, the two-train yard and the escapes) */
KITS.forest.bosses = bossPool([['canyon', [['plain', 1]]], ['dam', [['plain', 1]]], ['bridgedef', [['plain', 1]]], ['silo', [['plain', 1]]], ['castle', [['plain', 3], ['heavy', 1], ['light', 1]]], ['longtrain', [['plain', 2]]], ['fortress', [['plain', 1], ['heavy', 1]]], ['skyfort', [['plain', 1], ['lance', 1], ['small', 1]]], ['train', [['plain', 1]]], ['railgun', [['plain', 1]]], ['ship', [['plain', 1]]], ['wolfpack', [['plain', 1]]], ['shadowwing', [['plain', 1]]], ['raven', [['plain', 1]]], ['moth', [['plain', 1], ['storm', 1]]], ['slipway', [['plain', 1]]], ['squadron', [['plain', 1]]], ['gunline', [['plain', 1]]], ['tankcol', [['plain', 1]]], ['tankfarm', [['plain', 1]]], ['airbase', [['plain', 1]]], ['rival', [['plain', 1]]], ['ghostship', [['plain', 1]]]]);
KITS.forest.cityArena = { n: 48, style: 'forest', airfieldShare: 0.25, kinds: ['fortress', 'skyfort', 'moth', 'rival', 'raven', 'shadowwing'], scenes: ['gunline', 'tankcol', 'tankfarm', 'airbase', 'silo', 'bridgedef', 'dam'], tracks: ['longtrain', 'railgun'], sea: ['ship', 'wolfpack', 'squadron', 'ghostship', 'slipway'] }; KITS.forest.bosses.find(b => b.kind === 'railgun').track = [93, 131]; KITS.forest.cityArena.features = { burnt: ['fortress', 'rival', 'skyfort', 'moth', 'raven', 'shadowwing', 'gunline', 'tankcol'], fortified: ['gunline', 'tankcol', 'fortress', 'tankfarm', 'silo', 'skyfort'], logging: ['fortress', 'tankcol', 'tankfarm', 'rival', 'skyfort', 'moth'], water: ['skyfort', 'moth', 'raven', 'shadowwing', 'rival', 'bridgedef', 'dam'], strip: ['rival', 'shadowwing', 'skyfort', 'raven'], cutting: ['longtrain', 'railgun'], mountain: ['skyfort', 'moth', 'raven', 'shadowwing', 'rival'] }; KITS.forest.cityArena.featureShare = 0.7; /* (the forest's own ideas, owner: all six; each for the bosses it suits, on 70 % of the forest-style days that have one, on its own hash stream) */ /* (the forest's generated boss arena, owner: variations of its own Campaign boss area, the castle ground, and the city's final airfield as one option in a quarter of its days; land endings with scene zones, the long train and the supergun on their own rails (the supergun's pair at x 93 and 131, as the desert's and the city's), the sea endings on the generated coast and sea; the castle keeps its own floor, and the canyon run and the two trains keep the Campaign's ground) */
KITS.winter.bosses = bossPool([['iceshelf', [['plain', 1]]], ['train', [['plain', 3], ['heavy', 1], ['light', 1]]], ['longtrain', [['plain', 2]]], ['castle', [['ice', 2]]], ['railgun', [['plain', 2]]], ['fortress', [['plain', 1], ['heavy', 1]]], ['skyfort', [['plain', 1], ['lance', 1], ['small', 1]]], ['ship', [['plain', 1]]], ['wolfpack', [['plain', 2]]], ['shadowwing', [['plain', 1]]], ['raven', [['plain', 1]]], ['moth', [['plain', 1], ['storm', 1]]], ['slipway', [['plain', 1]]], ['squadron', [['plain', 1]]], ['rival', [['plain', 1]]], ['ghostship', [['plain', 1]]], ['leviathan', [['plain', 2]]], ['gunline', [['plain', 1]]], ['tankcol', [['plain', 1]]], ['tankfarm', [['plain', 1]]], ['airbase', [['plain', 1]]], ['silo', [['plain', 1]]], ['bridgedef', [['plain', 1]]], ['dam', [['plain', 1]]]]); /* (the land endings: owner, winter land endings on a snowfield) */
KITS.winter.bosses.find(b => b.kind === 'railgun').rail = true; KITS.winter.bosses.find(b => b.kind === 'longtrain').rail = true; KITS.forest.bosses.find(b => b.kind === 'longtrain').track = 112; /* (the forest's arena is the castle road: a single rail is painted down its middle, plan 12.20) */ /* (the winter's supergun: its own gorge with two tracks in the middle, plan 12.18) */
KITS.winter.bosses.filter(b => b.kind === 'wolfpack' || b.kind === 'leviathan' || b.kind === 'iceshelf').forEach(b => { b.ice = true; }); /* (the winter's wolfpack breaks up through the ice of a frozen arena: plan 12.14) */
KITS.winter.cityArena = { n: 48, kinds: [], sea: ['ship', 'squadron', 'ghostship', 'slipway'] }; /* (the winter's sea endings: the open sea after the freight harbour is the generator's, the winter's own frozen sea with the day's drift ice, from the level's sea tail on; its other endings already end on the generator's gorge, rail gorge and frozen depot) */
KITS.winter.cityArena.air = { kinds: ['fortress', 'skyfort', 'moth', 'raven', 'rival', 'shadowwing'], share: 0.4 }; KITS.winter.cityArena.scenes = ['gunline', 'tankcol', 'tankfarm', 'airbase', 'silo', 'bridgedef', 'dam']; KITS.winter.snowParams = { finale: 'railend' }; /* (the winter's land endings: the line ends at a railhead on the valley floor and the boss's scene lies on a generated snowfield, the winter's own valley opened out flat, CityGen addSnowArena) */ /* (owner: the city's final airfield as one option for the winter, with hangars that can be destroyed: in 40 % of the days whose boss fights on a plain airfield (its own stream) the line ends at a railhead instead of the gorge, and the boss fights over a snowy airfield) */
KITS.city.bosses = bossPool([['dam', [['plain', 1]]], ['bridgedef', [['plain', 1]]], ['silo', [['plain', 1]]], ['train', [['yard', 2]]], ['skyfort', [['plain', 3], ['lance', 3], ['light', 2], ['small', 1]]], ['longtrain', [['plain', 1]]], ['railgun', [['plain', 1]]], ['fortress', [['plain', 2], ['heavy', 1]]], ['ship', [['plain', 2]]], ['wolfpack', [['plain', 1]]], ['shadowwing', [['plain', 1]]], ['raven', [['plain', 1]]], ['moth', [['plain', 1], ['storm', 1]]], ['slipway', [['plain', 1]]], ['squadron', [['plain', 1]]], ['gunline', [['plain', 1]]], ['tankcol', [['plain', 1]]], ['tankfarm', [['plain', 1]]], ['airbase', [['plain', 1]]], ['rival', [['plain', 1]]], ['ghostship', [['plain', 1]]]]);
for (const k of ['desert', 'city']) { KITS[k].bosses.find(b => b.kind === 'longtrain').track = 112; KITS[k].bosses.find(b => b.kind === 'railgun').track = [93, 131]; } KITS.city.bosses.filter(b => b.kind === 'longtrain' || b.kind === 'railgun').forEach(b => { b.not = ['rail_yard']; }); /* (a single rail, or the supergun's pair at x 93 and 131, painted down the arena of a kit without one: plan 12.20; the city's yard ending has its own tracks) */
/* Archipelago days (owner: "a new climate / biome variation of all existing ones but with mainly water and just a few islands"): in ARCHI_SHARE of every kit's days (its own
   stream, 6985) the level is open sea with a few bands of islets far apart, in the kit's own climate, and no land: the generator's islands builder with no large island and
   fewer islets per band (params.sparse), its climate's look (params.climate: the desert's sand and palms, the forest's rocky shores, the winter's snow and shore ice, the city's
   built-up islets), the kit's own level for its art, boss and timetable. Every band is followed by open sea, so water is most of the picture. The boss fights over a generated
   open sea after four chunks of the level's sea (seaTail, the temperate kit's cove ending: cityArena.legacySea, cityArenaOpen, its islets), the winter's with drift ice. Its pool:
   the sea endings and the bosses that fight in the air. A day may be forced either way with composeSortie's last argument (the level picker's Sea button, ?daily=...&sea=on). */
const ARCHI_SHARE = 0.2;
const ARCHI_MID = { island_chain: { len: [4, 6], max: 2, heat: 0.5, built: 0.06 }, island_fortress: { len: [4, 6], max: 1, heat: 0.8, built: 0.06 }, island_archipelago: { len: [5, 7], max: 1, heat: 0.4, built: 0.06 },
  island_lagoon: { len: [8, 8], max: 1, heat: 0.6, built: 0.1 }, open_sea: { len: [3, 6], max: 4, heat: 0.1, built: 0.01 } }; /* (built: the structures' share a stretch may reach; measured 4 % at most on a band, 5 % on the lagoon, none on the open sea) */ /* (the lagoon's ring island needs its 8 chunks, as in the temperate kit) */
const ARCHI_BANDS = ['island_chain', 'island_fortress', 'island_archipelago', 'island_lagoon'];
function archiKit(id) {
  const k = KITS[id], temp = id === 'temperate', ice = id === 'winter', sea = ['ship', 'squadron', 'ghostship'].concat(ice ? [] : ['wolfpack']), air = ['skyfort', 'moth', 'raven', 'rival', 'shadowwing'];
  const follows = { open_sea: ARCHI_BANDS.slice() }; for (const t of ARCHI_BANDS) follows[t] = ['open_sea'];
  return Object.assign({}, k, { archi: true, preset: 'islands', params: { climate: k.climate, sparse: 1, opener: true }, len: [36, 46], arena: 0,
    opener: temp ? [['carrier_start', 4], ['open_sea', 4]] : [['open_sea', 4]], approach: [['open_sea', 3]], openers: null, approaches: null, islandOpen: null, seaApproach: null, airApproach: null, airParams: null, snowParams: null,
    middle: ARCHI_MID, follows, minMiddle: 5, require: null, beforeApproach: null, gapBefore: null, groundBuilt: null, fixedBuilt: { carrier_start: 0, open_sea: 0.01 }, arenaTracks: null,
    legacy: null, main: null, landKit: null, landShare: 0, seaTail: [['open_sea', 4]], seaParams: null, iceShare: null,
    enc: Object.assign({ island_fortress: [{ id: 'fortstrike', at: 1, end: 2, frames: 1100 }], island_archipelago: [{ id: 'reefpatrol', at: 1, end: 2, frames: 1000 }] }, temp ? { open_sea: [{ id: 'firstcontact', at: 0, end: 1, frames: 2760, first: true, share: 0.45 }] } : ice ? { open_sea: [{ id: 'iceraid', at: 1, end: 1, frames: 1180, middle: true }] } : null),
    bosses: bossPool([['ship', [['plain', 3]]], ['squadron', [['plain', 2]]], ['ghostship', [['plain', 1]]]].concat(ice ? [] : [['wolfpack', [['plain', 2]]]], [['skyfort', [['plain', 1], ['small', 1]]], ['moth', [['plain', 1]]], ['raven', [['plain', 1]]], ['rival', [['plain', 1]]], ['shadowwing', [['plain', 1]]]])),
    cityArena: { n: 48, kinds: [], legacySea: sea.concat(air), isles: true },
    dials: { global: { lane: [38, 56] }, seg: { island_chain: BANDS, island_fortress: BANDS, island_archipelago: BANDS }, int: ['count', 'lane'], strong: ['count', 'size'] } });
}
for (const id in KITS) { KITS[id].archiKit = archiKit(id); KITS[id].archiShare = ARCHI_SHARE; }
/* an archipelago day: forced by sea ('on' or 'off'), else the kit's share on its own stream */
function archiDay(kit, base, sea) { return !!kit.archiKit && (sea === 'on' || (sea !== 'off' && hash(base | 0, 6985) < kit.archiShare)); }
const dialNames = kit => { const all = Object.keys(kit.dials.global); for (const t in kit.dials.seg) for (const k in kit.dials.seg[t]) if (!all.includes(k)) all.push(k); return all; };
// The day's dials for a kit: { names, global: { dial: value }, seg: [p | null, one per segment] }. names is empty on a day with none.
/* The date's boss for a kit that has more than one: a weighted draw on its own stream (6600); the object the game reads. */
function bossFor(kit, base, ap) {
  if (!kit.bosses) return null; const pool = kit.bosses.filter(b => !(b.not && ap && b.not.includes(ap[0][0])) && !(b.sea && !kit.seaTail && !kit.legacy)); /* (an entry may exclude an ending: the ship, which needs a sea ending, not the rail yard's) */
  const tot = pool.reduce((a, b) => a + b.w, 0); let x = hash(base, 6600) * tot, b = pool[pool.length - 1]; for (const q of pool) { x -= q.w; if (x < 0) { b = q; break; } }
  const o = { kind: b.kind, variant: b.id }; if (b.castle) o.castle = b.castle; if (b.track) o.track = b.track; if (b.lance) o.lance = true; if (b.hpK) o.hpK = b.hpK; if (b.storm) o.storm = true; if (b.small) o.small = true; if (b.yard) o.yard = true; if (b.ice) o.ice = true; else if (b.rail) o.rail = true; else if (b.sea) o.sea = true; return o; /* (ice: the arena is the plan's own frozen sea, so no legacy tail) */
}
function dialsFor(kit, base, segs, ground) {
  const all = dialNames(kit), names = [], none = { names, global: {}, seg: segs.map(() => null) };
  if (!all.length || hash(base, 6000) < DIAL_NONE) return none;
  const pool = all.filter(k => !(ground && LOOP_PARAMS[kit.id] && LOOP_PARAMS[kit.id][k] !== undefined)) /* (a loop ground already sets it) */, want = Math.min(pool.length, DIAL_PICK[0] + Math.floor(hash(base, 6001) * (DIAL_PICK[1] - DIAL_PICK[0] + 1)));
  for (let i = 0; names.length < want; i++) names.push(pool.splice(Math.floor(hash(base, 6100 + i) * pool.length), 1)[0]);
  const strong = kit.dials.strong.filter(k => pool.includes(k) || names.includes(k)); if (!names.some(k => strong.includes(k))) names[names.length - 1] = strong[Math.floor(hash(base, 6050) * strong.length)]; /* (swap the last pick for a strong dial: the count stays) */
  names.sort();
  const val = (rng, r, k) => { const v = r[0] + hash(base, rng) * (r[1] - r[0]); return kit.dials.int.includes(k) ? Math.round(v) : Math.round(v * 100) / 100; };
  const global = {}; for (const k of names) if (kit.dials.global[k]) global[k] = val(6200 + all.indexOf(k), kit.dials.global[k], k);
  const seg = segs.map((g, i) => { const T = kit.dials.seg[g.t]; if (!T) return null; const p = {}; for (const k of names) if (T[k]) p[k] = val(6300 + i * 16 + all.indexOf(k), T[k], k); return Object.keys(p).length ? p : null; });
  return { names, global, seg };
}

/* Flavours (plan section 11.2): the Campaign's loop content on a composed list. 'plain' is the first pass; 'rank' the first loop's rank on the first pass's ground;
   'variant' the loop's ground (desert variant, forest autumn and lakes, winter variant 1); 'loop' both. The segment list is the same whatever the flavour
   (the walk does not read it), so a flavour changes what the ground looks like and how hard it plays, not the order. */
const FLAVOURS = ['plain', 'rank', 'variant', 'loop'], FLAVOUR_WEIGHT = { plain: 0.1, rank: 0.3, variant: 0.3, loop: 0.3 };
const LOOP_PARAMS = { temperate: { burn: true }, desert: { variant: 1 }, forest: { autumn: 1, lakes: 1 }, winter: { variant: 1 }, city: { harbour6: true } }; /* (the city's loop ground: the first loop's harbour, the shore moved, longer piers, a wider side channel) */
/* The old land after a plan (kit.legacy): opening stretches, a walk over its own grammar to the target length, closing stretches. Its own hash stream (6800), so the plan's list does not read it. */
/* The old land's built-up stretches of a day (kit.legacy.extras, its own stream 6800): none, one or two of the town, the estate and the airbase, as the mainland's last stretches */
function extrasWalk(kit, base) {
  const L = kit.legacy; if (!L || !L.pick || !L.extras) return []; const ls = hashInt(base, 6800); let n = 0; const r = () => hash(ls, n++), x = r(), k = x < L.pick[0] ? 0 : x < L.pick[1] ? 1 : 2, names = Object.keys(L.extras), mid = [];
  while (mid.length < k) { const prev = mid.length ? mid[mid.length - 1][0] : null, cand = names.filter(t => !mid.some(q => q[0] === t) && (!prev || (L.extrasFollow[prev] || []).includes(t))); if (!cand.length) break; const t = cand[Math.floor(r() * cand.length)], m = L.extras[t]; mid.push([t, m.len[0] + Math.floor(r() * (m.len[1] - m.len[0] + 1))]); }
  return mid.length === 2 ? [mid[0], ['main_farm', 4], mid[1]] : mid; /* (two of them: four chunks of farmland between, where the main road bends from one's line to the other's; the airbase's runs beside its airfield) */
}
function legacyWalk(kit, base) {
  const L = kit.legacy; if (L.pick) return extrasWalk(kit, base).length ? L.close.slice() : (L.closeCove || L.close).slice(); /* (after built-up stretches the coast and the sea; after the mainland's own cove only the sea) */
  const fixed = L.open.concat(L.close).reduce((a, q) => a + q[1], 0), pk = { middle: L.middle, follows: L.follows, minMiddle: L.minMiddle }; let n = 0; const r = () => hash(ls, n++);
  for (let k = 0; k < 40; k++) { const mid = walk(pk, L.len[0] + Math.floor(r() * (L.len[1] - L.len[0] + 1)) - fixed, r, L.close, L.open); if (mid) return L.open.concat(mid, L.close); }
  throw new Error('sortie-compose: no old land for kit ' + kit.id);
}
/* The mainland of a kit (kit.main): its opening stretch, a walk over its own grammar (own hash stream 6850) */
function mainWalk(kit, base, cove, ex) {
  const M = kit.main, CL = cove ? M.close || [] : ex && ex.length ? ex : M.gate || [], exN = !cove && ex ? ex.reduce((a, q) => a + q[1], 0) : 0, ls = hashInt(base, 6850), fixed = M.open.concat(CL).reduce((a, q) => a + q[1], 0), names = Object.keys(M.middle), follows = {}; for (const t of names.concat(M.open.map(q => q[0]))) follows[t] = names.slice(); let n = 0; const r = () => hash(ls, n++);
  for (let k = 0; k < 40; k++) { const mid = walk({ middle: M.middle, follows, minMiddle: M.minMiddle, require: M.require }, M.len[0] + Math.floor(r() * (M.len[1] - M.len[0] + 1)) + exN - fixed, r, CL.length ? CL : [['_end', 0]], M.open); /* (the built-up stretches come on top of the mainland's own length, as the legacy ones did) */ if (mid && !(exN && mid.length && mid[mid.length - 1][0] === 'main_village')) return M.open.concat(mid, CL); } /* (not the village right before them: neither can bend the main road, open land between does) */
  throw new Error('sortie-compose: no mainland for kit ' + kit.id);
}
/* The city's generated arena: on a day whose boss fights on a plain airfield, with no sea tail and no boss on a track (the long train, the supergun, the two-train yard). With the rail yard ending
   the yard's tracks run on through it (cityArenaTracks). */
function cityArenaFor(kit, bs, tail, base) { const A = kit.cityArena; if (A && A.air && bs && !tail && !bs.sea && A.air.kinds.includes(bs.kind)) return airDay(kit, base, bs) ? A.n : 0; /* (the winter: the airfield on its share of the days, else the kit's own gorge) */ if (A && bs && A.legacySea && tail > 0) return A.legacySea.includes(bs.kind) ? A.n + tail : 0; /* (the temperate kit: every ending is over the sea after the old land) */ if (A && bs && bs.sea && (A.sea || []).includes(bs.kind) && tail > 0) return A.n + tail; /* (a sea ending: the arena is the level's sea tail and 48 chunks beyond it) */ if (A && bs && bs.yard && !tail && (A.yard || []).includes(bs.kind)) return A.n; /* (the two-train yard: the arena is its yard) */ if (!A || tail || !bs || !(A.kinds.includes(bs.kind) || (A.scenes || []).includes(bs.kind) || (bs.track && (A.tracks || []).includes(bs.kind))) || (bs.track && !(A.tracks || []).includes(bs.kind)) || bs.yard || bs.sea) return 0; return A.n; }
function airDay(kit, base, bs) { const A = kit.cityArena; return !!(A && A.air && bs && !bs.sea && A.air.kinds.includes(bs.kind) && hash(base | 0, 6995) < A.air.share); } /* (a winter airfield day: its own stream) */
function snowDay(kit, bs) { const A = kit.cityArena; return !!(A && A.air && bs && (A.scenes || []).includes(bs.kind)); } /* (a winter land ending: the snowfield) */
function arenaStyle(kit, base, bs) { const A = kit.cityArena; if (A && A.air) return snowDay(kit, bs) ? 'snow' : 'airfield'; return A && A.style ? (A.airfieldShare && hash(base | 0, 6990) < A.airfieldShare ? 'airfield' : A.style) : null; } /* (a kit with its own arena style: the desert's own, or the airfield on its own stream) */
function arenaSeaFor(kit, bs) { return !!(bs && (bs.sea || (kit.cityArena && (kit.cityArena.legacySea || []).includes(bs.kind)))); } /* (an ending whose arena is the generated coast and sea) */
function arenaFeature(kit, bs, base, style) { const A = kit.cityArena, F = A && A.features; if (!F || !bs || style !== A.style || hash(base | 0, 6997) >= (A.featureShare || 0)) return null; const ok = Object.keys(F).filter(k => F[k].includes(bs.kind)); return ok.length ? ok[Math.floor(hash(base | 0, 6996) * ok.length)] : null; } /* (a kit's own arena ideas: the forest's burnt stretch, fortified edge, logging camp, stream or lake, hidden airstrip, the rails' opening through a belt of forest, a mountain in the cliff coast's make; streams 6997 and 6996, apart from the winter's airfield day on 6995) */
function arenaGap(tail) { let g = 0; for (const q of tail || []) { if (q[0] === 'coast_down' || q[0] === 'open_sea') break; g += q[1]; } return g; } /* (the old land's built-up stretches before the coast: legacy ground between the plan and its arena) */
function cityArenaScenes(kit, bs) { return !!(kit.cityArena && bs && (kit.cityArena.scenes || []).includes(bs.kind)); } /* (a land ending: scene zones in the arena) */
function cityArenaTracks(kit, ap) { return kit.arenaTracks && kit.arenaTracks[ap[0][0]] ? kit.arenaTracks[ap[0][0]].slice() : null; }
function composeSortie(kitId, seed, sub, flavour, twist, dials, tod, sea) {
  let kit = KITS[kitId]; if (!kit) throw new Error('sortie-compose: no kit ' + kitId);
  flavour = FLAVOURS.includes(flavour) ? flavour : 'plain'; twist = TWISTS.includes(twist) ? twist : 'none'; dials = dials === 'off' ? 'off' : 'on'; tod = TODS.includes(tod) && twist !== 'night' ? tod : 'day'; const ground = flavour === 'variant' || flavour === 'loop', rank = flavour === 'rank' || flavour === 'loop';
  seed = seed | 0; sub = sub | 0; const base = sub ? hashInt(seed, 7919 + sub) : seed; sea = sea === 'on' || sea === 'off' ? sea : undefined; const archi = archiDay(kit, base, sea); if (archi) kit = kit.archiKit; /* (an archipelago day: open sea and a few islets in the kit's climate, its own stream) */ else if (kit.landKit && hash(base, 6980) < kit.landShare) kit = kit.landKit; /* (a land day: the kit's land variant, its own stream) */ kit = mountainKit(kit, base); /* (a mountain day, its own stream) */ let ap = kit.approaches ? kit.approaches[hash(base, 6500) < (kit.approachShare || 0.35) ? 1 : 0] : kit.approach /* (the way the level ends: its own stream) */;
  const op0 = kit.openers ? kit.openers[hash(base, 6501) < (kit.openerShare || 0.35) ? 1 : 0] : kit.opener /* (the way the level opens: its own stream) */, isl = kit.islandOpen && hash(base, 6502) < kit.islandOpen.share ? kit.islandOpen.variants[Math.floor(hash(base, 6503) * kit.islandOpen.variants.length)] : [], op = isl.concat(isl.length && kit.islandOpen.take ? [[op0[0][0], op0[0][1] - kit.islandOpen.take]].concat(op0.slice(1)) : op0) /* (an island opener: bands of islets before the port, plan 12.22) */; let fixed = op.concat(ap).reduce((a, q) => a + q[1], 0);
  let bs = bossFor(kit, base, ap); if (bs && (bs.sea || bs.ice) && kit.seaApproach) { ap = kit.seaApproach; fixed = op.concat(ap).reduce((a, q) => a + q[1], 0); } const air = airDay(kit, base, bs), snow = snowDay(kit, bs); if (air || snow) { ap = kit.airApproach; fixed = op.concat(ap).reduce((a, q) => a + q[1], 0); } /* (a winter airfield day: the line runs on to the airfield's railhead) */ let tail = bs && (bs.sea || kit.archi) && kit.seaTail ? kit.seaTail : null; if (kit.legacy) tail = legacyWalk(kit, base); /* (an archipelago day ends over the sea whatever its boss) */ const ex = extrasWalk(kit, base), main = kit.main ? mainWalk(kit, base, !ex.length, ex) : null; /* (the mainland closes itself with a cove when the day has no built-up stretches; else they are its last stretches) */ const tailLen = tail ? tail.reduce((a, q) => a + q[1], 0) : 0; /* (the boss is drawn first: the ship needs a sea ending, which is added after the list) */
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const as = hashInt(base, 1000 + attempt); let n = 0; const r = () => hash(as, n++);
    const total = kit.len[0] + Math.floor(r() * (kit.len[1] - kit.len[0] + 1)), mid = walk(kit, total - fixed, r, ap, op); if (!mid) continue;
    const segs = []; let at = 0; for (const [t, len] of op.concat(mid, ap)) { segs.push({ t, start: at, n: len }); at += len; }
    const planN = segs.length; if (main) for (const [t, len] of main) { const g = { t, start: at, n: len, main: true }; if (t === 'main_gate' && tail && tail.length) g.next = tail[0][0]; /* (the gate is built for the ground that follows it) */ segs.push(g); at += len; }
    const coreAt = at, core = segs.slice(); if (tail) for (const [t, len] of tail) { segs.push({ t, start: at, n: len, legacy: true }); at += len; }
    const dl = dials === 'on' ? dialsFor(kit, base, core.slice(0, planN), ground) : { names: [], global: {}, seg: segs.map(() => null) };
    const params = Object.assign({}, kit.params, ground ? LOOP_PARAMS[kitId] : {}, dl.global, { segs: core.map((g, i) => Object.assign({ t: g.t, n: g.n }, g.next ? { next: g.next } : null, dl.seg[i] ? { p: dl.seg[i] } : null)) }); if (kit.preset === 'ironForest') params.L = coreAt * 64; if ((tail || (bs && bs.ice)) && kit.seaParams) Object.assign(params, kit.seaParams); if (bs && bs.ice) { params.harbourIce = true; params.depotArena = ICE_ARENA; } else if (bs && bs.rail) { params.finale = 'railgorge'; params.railArena = RAIL_ARENA; } else if (tail && kit.iceShare) params.harbourIce = hash(base, 6700) < kit.iceShare; /* (a sea ending replaces the kit's own arena: the winter's gorge) */
    const cityArena = cityArenaFor(kit, bs, tail ? tailLen : 0, base); if (air) Object.assign(params, kit.airParams); else if (snow) Object.assign(params, kit.snowParams); if (cityArena && arenaSeaFor(kit, bs)) { params.cityArena = cityArena; params.cityArenaSea = true; if (kit.legacy) { const gp = arenaGap(tail); if (gp) params.cityArenaGap = gp; if (!tail.some(q => q[0] === 'coast_down')) params.cityArenaOpen = true; } if (kit.archi) params.cityArenaOpen = true; /* (an archipelago day: the arena is open sea, no coast) */ if (kit.cityArena.isles) params.cityArenaIsles = true; } /* (the temperate kit: the arena begins after the old land's built-up stretches, at its coast, or is open sea after the mainland's own cove) */ else if (cityArena && bs.yard) { params.cityArena = cityArena; params.cityArenaYard = true; } else if (cityArena) { const st = arenaStyle(kit, base, bs); if (st) params.cityArenaStyle = st; const fe = arenaFeature(kit, bs, base, st); if (fe) params.cityArenaFeature = fe; params.cityArena = cityArena; const tr = cityArenaTracks(kit, ap); if (tr) params.cityArenaTracks = tr; if (cityArenaScenes(kit, bs)) params.cityArenaScenes = true; if (bs.track) params.cityArenaBossTracks = [].concat(bs.track); }
    const ep = encPlanFor(kit, kit.legacy ? segs : core, base, twist === 'fast' ? FAST_K : 1), S = { v: VERSION, flavour, twist, dials, dialNames: dl.names, tod, ground, rank, kit: kitId, level: kit.level, seed, sub, base, attempt, segs, len: at, encPlan: ep.enc, wingC: ep.wingC, boss: Object.assign({}, kit.boss), arena: bs && bs.ice ? ICE_ARENA : bs && bs.rail ? RAIL_ARENA : tail && kit.seaParams ? 0 : kit.arena, climate: kit.climate, timeOfDay: kit.timeOfDay,
      gen: { preset: kit.preset, seed: (hash((base + kit.level * 977) | 0, 61) * 2147483647) | 0, params } };
    if (hash(base, 6950) < RAVEN_MID_SHARE) S.ravenMid = true; /* (the mid-level fight is the Raven prototype's duel instead of the Shadow Wing: its own stream, plan 12.22) */
    if (bs && bs.kind === 'castle' && hash(base, 6960) < CASTLE_RUIN_SHARE) S.castleRuin = true; /* (a castle as a ruin, Ravenhold too: breaches in the walls, cracked and scorched courts; looks only, its own stream) */
    if (bs && bs.yard) S.arenaYard = true; /* (the arena is a rail yard: eight tracks with crossovers, the two-train boss's ground) */
    if (bs) S.bossVar = bs; if (tail) { S.legacyTail = tailLen; S.arenaSea = true; } if (kit.land) { S.land = true; S.arenaLand = true; } if (kit.archi) S.archi = true; if (sea) S.seaPick = sea; /* (an archipelago day; a forced pick is kept, so the sortie is rebuilt the same) */ if (air) S.arenaAir = true; if (snow) S.arenaSnow = true; /* (a winter airfield day: the arena is a snowy airfield) */ /* (a land day: the level and its arena are land) */
    if (cityArena) { S.cityArena = cityArena; S.arena = cityArena; } /* (the city's generated airfield arena: the plan runs on past the level's end) */
    if (kit.arenaTracks && kit.arenaTracks[ap[0][0]]) S.arenaTracks = kit.arenaTracks[ap[0][0]].slice(); else if (bs && bs.track) S.arenaTracks = [].concat(bs.track); /* (an ending whose tracks run on into the boss arena: the rails are painted there) */
    if (!check(kitId, S).length) return S;
  }
  throw new Error('sortie-compose: kit ' + kitId + ', seed ' + seed + ', sub ' + sub + ': no valid sortie in ' + ATTEMPTS + ' tries (the grammar is wrong)');
}

/* Time of day as ground (docs/ground-variety-plan.md, phase 4): the light of the day, drawn from the date. 'day' is the first pass's noon; 'morning' and 'sunset' are the Campaign's own
   gradings (the ground, the trees and the clouds; morning also the dawn glow), which the game applies to a plan's chunks as it does to the loops of levels 1 and 2. Night is a twist (Night run), so it is
   not drawn here, and a night-run day is always 'day' (two darkenings would fight). The segment list, the encounters and the dials do not read it. */
const TODS = ['day', 'morning', 'sunset'], TOD_WEIGHT = { day: 0.6, morning: 0.2, sunset: 0.2 };
function todFor(n) { let x = hash(DAILY_SALT + 5, n), k = 0; for (; k < TODS.length - 1; k++) { x -= TOD_WEIGHT[TODS[k]]; if (x < 0) break; } return TODS[k]; }

// The daily seed. A date listed in DAILY_REROLL uses that sub-seed instead of 0 (the flight gate adds dates whose sortie fails).
const DAILY_SALT = 0x0F0E89, DAILY_REROLL = {}, DAILY_PLAIN = {};
/* The twists (plan 11.1, 11.8): one a day, by rotation. The order puts unlike ones next to each other (sight, enemies, ship, world). 'none' is no twist (only for a date in DAILY_PLAIN at 3, or a forced sortie). DAILY_PLAIN levels: 1 no dials and the light of noon, 2 also flavour plain, 3 also no twist. */
const TWISTS = ['night', 'swarm', 'fixed', 'fog', 'elite', 'fast', 'nova'], TWIST_ORDER = TWISTS, TWIST_NAMES = { none: '', night: 'NIGHT RUN', fog: 'FOG', fixed: 'FIXED WEAPON', swarm: 'SWARM DAY', elite: 'ELITE DAY', fast: 'FAST SCROLL', nova: 'NOVA STORM' };
const FIXED_WEAPONS = ['S', 'L', 'H', 'A']; /* Scatter, Lance, Seeker, Arc: the day's own, from the seed */
function twistFor(day) { return TWIST_ORDER[((day % TWIST_ORDER.length) + TWIST_ORDER.length) % TWIST_ORDER.length]; }
function fixedWeapon(seed) { return FIXED_WEAPONS[Math.floor(hash(seed | 0, 4242) * FIXED_WEAPONS.length)]; }
function flavourFor(n) { let x = hash(DAILY_SALT + 3, n), k = 0; for (; k < FLAVOURS.length - 1; k++) { x -= FLAVOUR_WEIGHT[FLAVOURS[k]]; if (x < 0) break; } return FLAVOURS[k]; } /* by weight, from the date alone */
function dailySeed(dateKey) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey)); if (!m) throw new Error('sortie-compose: a date is YYYY-MM-DD, not ' + dateKey);
  const y = +m[1], mo = +m[2], d = +m[3], ms = Date.UTC(y, mo - 1, d), back = new Date(ms); if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) throw new Error('sortie-compose: no such day ' + dateKey);
  const n = y * 10000 + mo * 100 + d, day = Math.round(ms / 86400000), plain = DAILY_PLAIN[m[0]] | 0;
  return { date: m[0], n, day, kit: KIT_ORDER[((day % KIT_ORDER.length) + KIT_ORDER.length) % KIT_ORDER.length], seed: hashInt(DAILY_SALT, n), sub: DAILY_REROLL[m[0]] | 0, flavour: plain > 1 ? 'plain' : flavourFor(n), twist: plain > 2 ? 'none' : twistFor(day), dials: plain ? 'off' : 'on', tod: plain || (plain > 2 ? 'none' : twistFor(day)) === 'night' ? 'day' : todFor(n) };
}
function dateKeyUTC(ms) { return new Date(ms).toISOString().slice(0, 10); } // the day a moment belongs to (owner: UTC, so every player has the same day)
function composeDaily(dateKey, kitId, sub, flavour, twist, dials, tod, sea) { // kitId, sub, flavour, twist: forced, for the test link (?daily=2026-11-14&kit=forest&sub=3&flavour=loop&twist=night&dials=off&tod=sunset; twist=none for no twist)
  const D = dailySeed(dateKey), S = composeSortie(kitId || D.kit, D.seed, sub === undefined || sub === null ? D.sub : sub, flavour || D.flavour, twist || D.twist, dials || D.dials, tod || D.tod, sea); S.date = D.date; return S;
}

const SortieCompose = { VERSION, composeVersion: VERSION, ICE_ARENA, RAIL_ARENA, bossFor, TODS, TOD_WEIGHT, todFor, DIALS, DIAL_NONE, DIAL_PICK, FOREST_BASE, dialsFor, dialNames, FLAVOURS, FLAVOUR_WEIGHT, LOOP_PARAMS, KITS, KIT_ORDER, DAILY_REROLL, DAILY_PLAIN, TWISTS, TWIST_ORDER, TWIST_NAMES, FIXED_WEAPONS, twistFor, fixedWeapon, hash, composeSortie, check, archiDay, ARCHI_SHARE, encPlanFor, dailySeed, dateKeyUTC, composeDaily };
if (typeof module !== 'undefined' && module.exports) module.exports = SortieCompose;
root.SortieCompose = SortieCompose;
})(typeof globalThis !== 'undefined' ? globalThis : this);
