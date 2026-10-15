# Enigma Run: world generator specification (draft 2)

Status: draft 2. Draft 1 was written by Sonnet and then reviewed adversarially by an Opus agent against `index.html`; its findings are folded in below (see "Changes from review" at the end, which also lists what I verified myself and what is still the reviewer's claim). It builds on `docs/enigma-world-audit.md` (read that first). Numbers in this file are starting values to tune, not decisions. Items marked **[you]** are for the owner to add or decide. Items marked **[verify]** are claims from the review that phase 1 must confirm in code before anything depends on them.

## 0. Scope

- **Enigma Run** is a separate mode: a Settings button opens a level picker (levels 1 to 6, one at a time), modelled on the existing practice picker (`#diffAsk` with the stage row `#dStage`). The Campaign, its stages, scoring, leaderboard and the golden replay checksums stay untouched.
- The new levels are produced by a **world generator** that is also meant to feed generative mode later.
- Visual and structural redesign comes first. Enemies, bosses and set pieces are reused from the campaign and are only attached to the new places through "slots" (section 5). New enemy types are out of scope for now except those listed in section 11.
- **Naming:** the existing Enigma slider is the "Enigma look" (`ENIGMA_T`, `run.enigma`). To avoid a collision the mode's run data is `run.sortie` (null for the Campaign), and the user-facing button is still called "Enigma Run".
- **Enigma runs never count.** They do not reach the leaderboard, `saveHi`, `loopsWon` or the Campaign progress. A flag on the run (`run.sortie != null`) is checked in `lbEligible`, `saveHi` and the stage-complete path (phase 1). The resume record stores `{level, seed}` and `resumeRun` rebuilds the sortie. [you] may later want a local best per level.
- **Enigma levels end in their own way.** Finishing a level shows results and returns to the level picker: no `run.stage++`, no `loopsWon++`, no hand-over to the next Campaign stage.
- Hard rules carried over from `ARCHITECTURE.md`: visuals use the free random stream and never the run's seeded stream; the dither (`bay`, `pickI`) stays as it is; bump `VERSION` in `index.html` and `sw.js`; add a `CHANGELOG.md` line.

## 1. Architecture in one picture

```
 sortie parameters ──► buildSortie(seed, params) ──► SORTIE (plain data)
 (level 1..6, seed,                                      │
  climate, weather,        ┌─────────────────────────────┤
  density curve)           ▼                             ▼
                    segment list              roads[], rails[], sites[]
                    (composition)             (lines)    (planned landmarks)
                           │                                 │
        ┌──────────────────┴───────────────┬─────────────────┘
        ▼                                  ▼
  info(p) → {segment, climate, ...}   classify(wx, wy)  → terrain type
        │                                  │  (reads roads/rails/sites)
        ▼                                  ▼
  director / worldLife            pixelColor + drawFeatures (+ scatter)
  (enemy slots)                   workChunk (existing pipeline)
```

Three ideas:

1. **The sortie is data.** `buildSortie` runs once when the level starts (and again, lazily, for endless/generative mode) and returns a plain object. Terrain code only reads it. This is the `castleInfo()` pattern made general.
2. **Two kinds of content.** *Sites* are planned, validated landmarks (harbour, air base, station, castle, carrier, factory complex, village, city district). *Scatter* is the existing stateless cell-hash decoration (trees, single houses, fields, scars), now filtered by masks that the sites provide.
3. **Same pipeline.** Chunks are still `W x CH` (224 x 64) canvases built by `workChunk`, then `drawFeatures`. The new code supplies `classify`, `pixelColor` and a feature pass for Enigma Run; the campaign code path is selected by `run.enigmaRun == null`.

### 1.1 Decoupling theme

The sortie carries the fields that the campaign hides in `th`:

| Field | Meaning | Replaces |
|---|---|---|
| `climate` | `temperate`, `desert`, `winter`, `forest` (dark conifer) | palette, tree set, house set, field style |
| `weather` | a weather plan (section 8) | `snowF`, `dustF`, rain by theme |
| `timeOfDay` | `day`, `dusk`, `night`, `dawn` | night tint (but see below) |
| `bossKind` | key into `BOSS` | `BOSS_KINDS[curTheme]` |
| `song` | key into `STAGE_SONGS` | `STAGE_SONGS[curTheme]` |

**How the old code is handled (changed after review).** `curTheme` is one global that `predictInfo`, the director, `spawnGround`, `worldLife`, `SET_PIECES`, `BOSS_KINDS`, the night shots of searchlights and about 80 other places read, and many of them affect the simulation, not only the look. So:

1. For a whole Enigma level, `curTheme`, `prevTheme` and `featTheme` are set to the matching **legacy theme** (level 1 -> 0, 2 -> 2, 3 -> 3, 4 -> 4, 5 -> 1, 6 -> 5). Enemies, set pieces, boss, music and night behaviour then work as in the Campaign.
2. The **terrain and look code branches on the sortie, not on `th`**: `predictInfo`/`info`, `classify`, `pixelColor`, `drawFeatures`, the palette choice, the winter blend, the tree and house sets. When `run.sortie` is set they read `sortie.climate` and the segment; when it is null the old code runs unchanged.
3. `timeOfDay: night` is **not only a tint**: `nightF` comes from `th === 3` and gives searchlights extra shots. Level 3 keeps `curTheme = 3`. A night in another level is visual only unless [you] want the extra shots as well.
4. **Boss arenas follow the campaign's terrain contract exactly**, with the campaign's biome name and theme, because the boss code expects specific ground (audit "Campaign-only"): `sea` for the ship; `bossland` with `th 1` giving `ryard` with `YARD_T` for the train; `BOSSRAIL` +/- 19 for the railgun (`th 3`); `castle` with `th 4` for the castle; `secret` with `th 5` for `finalAirfield`/`finalStartY` for the sky fortress. The fortress arena (`th 2`) uses the campaign's `bossland`. Making these arenas free-form is a later project. [verify]

## 2. Roads and rails as lists of lines (decision: lists; two tiers after review)

The campaign has one road, `roadX(wy)`. Enigma Run has `sortie.roads`, a list. The review showed that one kind of line cannot serve both convoys and town streets, so there are **two tiers**.

### Tier A: routes (the roads that vehicles use)

```
route = { id, kind, w, pts:[[x,y],...], from, to }
kind  ∈ track | country | highway
```

- A route is **monotone in y**: x is a function of y. It can drift, curve and fork (a fork is a second route with `from` on the first), but not loop back.
- At most **2 routes per chunk**. Only routes carry road-following enemies (`convoy`, `march`, `lightVehicle`, tanks with `road: true`), which need x as a function of y.
- `roadX(wy)` returns the **first route active at that y**. Where no route exists (open sea, an island, a boss arena) it returns a fixed fallback x **and `routeActive(wy)` is false**; the director and placement helpers must check `routeActive` before they spawn anything on the road. This replaces the old assumption that a road always exists. (Today `convoy` and `march` spawn at `roadX` without checking terrain.)
- Rails are routes with `kind: rail`, with a gentler minimum curve and the same monotone rule. Sidings are short rails with `from`/`to` on the main rail. Level crossings are a site connector.
- Bridges are **connectors**: a route that meets water gets a `bridge` span, drawn by the existing `bridge` and `railbridge` terrain types and attacked by the existing `G('bridge')`.

### Tier B: streets (the roads inside a site)

Streets in villages, cities, harbours (quays, harbour-front), air bases (runway, taxiways), camps and industrial yards belong to the **site's `ground()`**, as `cityCell` does today. They are plain lists of straight segments `[x0,y0,x1,y1,w,kind]`, indexed per chunk, with perpendicular point-to-segment distance, so they can be diagonal, radial or horizontal. A city may have dozens per chunk; they do not count toward the route budget.

### Drawing and queries

- `classify` records the signed offset to the matched route or street in `CL.rd` and `pixelColor` uses that offset. It no longer assumes the main road at `rx` (today `pixelColor` draws every road relative to `rx`, so a second road would be drawn wrongly).
- "On road" for routes is `|wx - x(wy)| < w/2` as today; routes are therefore limited to a gentle slope. The builder rejects any route that turns more than about 35 degrees from vertical. Steeper lines are streets (Tier B).
- Queries for new code: `routeDist(wx, wy)`, `routeNear(wx, wy, r)`, `streetDist(wx, wy)`. They read the chunk's pre-built lists of active routes and streets (built when the chunk starts), not the global list.
- Cost: one table read per active route (4 px lookup table per route, built at sortie time) plus one distance check per street in the chunk's list.

[you] Enemies that drive on routes could later get "route objects" (a route id plus a lane). For now they keep the `roadX`-lane logic on the first route.

## 3. Composition: segments

A **segment** is one stretch of the level with a template. The sortie is a list of segments, each `{template, lengthChunks, params}`. Templates describe the arrangement before any individual feature is placed.

### 3.1 Template entry format (lean)

Every template and every feature in this document uses the same five groups of fields:

```
id          unique key
where       ground and context it needs (e.g. coast + navigable water)
connects    connectors it offers or needs (sea, road, rail, river, city edge, ...)
footprint   visual size, combat clearance (room that must stay open)
role        decoration | landmark | target | hazard | spawner | boss-arena
            plus gameplay: slots it provides, what happens when destroyed
variants    climates, sizes, damage levels it supports (Section 4.3)
status      planned | implemented | tested
```

More fields are added only when a feature needs them.

### 3.2 Segment templates (Tier 1)

Each template lists: what the ground is, how the screen is arranged (the "rhythm"), the density target and the connectors.

| Template | Arrangement | Density target (structures share of area) | Connectors |
|---|---|---|---|
| `open_sea` | Deep water with shoals and reefs; occasional ship wake; no land. | 0 to 5 percent | sea in, sea out |
| `island_chain` | 3 to 6 islands of mixed size, each with a role (bare, forested, fortified, airbase, lighthouse), separated by clear channels at least 60 px wide. | 15 to 25 percent | sea in, sea out |
| `fleet` | Open sea with a convoy or a carrier group. The carrier is a spawner mini-boss (section 11). | 10 to 20 percent | sea in, sea out |
| `beach_fortified` | A sand strip with sandbags, hedgehogs, bunkers, wire and searchlights; a road or track from the beach inland. | 20 to 30 percent | sea, road, rail optional |
| `beach_town` | Sand strip with a promenade, small buildings and a pier; a road running along the shore. | 25 to 35 percent | sea, road, city edge |
| `harbour_small` / `harbour_commercial` / `harbour_naval` | A water basin open to the sea, quays, cranes, warehouses, a rail spur. The naval version has a pen for a submarine boss. | 35 to 50 percent, with a clear sea side | sea, road, rail, city/fields edge |
| `farmland` | Fields in parcels, hedges or fences, scattered farmsteads, a road, small copses. | 10 to 25 percent | road, rail, river |
| `village` | A cluster of 8 to 20 houses around a church or square on a main road, with gardens, fading into farmland. | 30 to 40 percent, fading to 10 | road, farmland edge |
| `forest_deciduous` / `forest_conifer` | Trees at varied density, clearings, a river or track; edges are feathered. | 20 to 40 percent | road(s), river |
| `forest_fortified` | Forest with 2 to 3 roads, bunker lines, supply depots, tank parks, a camp. | 25 to 40 percent | roads, rail optional |
| `airbase_*` | Runway, taxiways, hangars, tower, fuel, flak ring. Variants: in forest, in desert, in snow, next to harbour, next to city, on island. | 30 to 45 percent, with the runway open | road, rail optional |
| `station_*` | Platforms, sheds, sidings, goods yard. Sizes: halt, village, junction, marshalling yard. | 20 to 40 percent | rail, road |
| `industrial_*` | Light, heavy, military production, power station. Chimneys with smoke; pipes and pylons. | 40 to 55 percent | road, rail, river/harbour optional |
| `city_*` | Street layout (medieval, grid, radial, harbour-front) times building style (brick, desert, winter, modern), density fading from suburb to centre; river with bridges, squares, parks, churches. | 35 to 60 percent, fading | road(s), river, rail |
| `castle_*` | Farmland, desert and winter variants, a fortified approach and an arena for the boss. | 25 to 35 percent | road |
| `ruins_*` | Any built template at damage level heavy, as an overlay (section 7). | inherits | inherits |
| `boss_arena_*` | A flat, low-detail area sized for one boss (sea, harbour basin, rail yard, salt pan, castle court, air). | 5 to 15 percent | inherits |
| `pass` / `valley` | Relief that narrows the playfield: cliff walls, river valley, desert canyon. | 15 to 30 percent | road, river |

**Density is defined as the area share of a chunk covered by built structures**: buildings, runways, hangars, quays, platforms, factory halls, tanks, fortifications and roads' paved width. Trees, fields, hedges, water and scatter decoration do **not** count. The range in the table is the allowed average over the segment; the **peak** of any single chunk may exceed it by at most 10 percentage points. Where a cell says "fading to 10", the first value applies to the centre of the segment and the second to its edges, and the validator checks both.

Templates used by the level sequences in section 10 and not listed above are variants of the listed ones with the same rules, defined here so the names resolve:

| Variant | Based on | Difference |
|---|---|---|
| `beach_cliff` | `beach_fortified` | cliff coast with clifftop batteries, no sand strip |
| `open_sea_ice` | `open_sea` | ice floes, winter palette |
| `harbour_winter`, `industrial_harbour` | `harbour_*` | winter palette; industrial hinterland |
| `farmland_winter`, `farmland_approach` | `farmland` | winter palette; a road leading to a castle gate |
| `clearing_village` | `village` | in a forest clearing, logging camp |
| `lake_valley` | `valley` | a lake and river instead of a canyon |
| `rail_corridor` | `station_*` | two parallel rails and no platform |
| `airbase_searchlight` | `airbase_*` | searchlights; night |
| `castle_forest` | `castle_*` | forest variant (new; see 4.4) |
| `city_suburb`, `city_centre` | `city_*` | density fade ends (low, high) |
| `station_main` | `station_*` | large terminus |
| `ruins` | any built template | **an overlay, not a template**: segments in section 10 written as `ruins N` mean "the previous template at damage `ruined`" |

### 3.3 Transitions

Two segments meet at an explicit **seam** of 1 to 2 chunks. A seam is a mini-template that gradually changes ground colour, density and decoration (for example `farmland -> village`: houses appear along the road first, gardens appear, field hedges drop out). Each template declares the transitions it accepts in `connects`; unsupported pairs go through a fallback seam (`farmland`, or `open_sea`), never a hard cut.

The existing `wob(wx, wy)` warp that makes chunk borders irregular is kept at seams.

## 4. Features (sites) and scatter

### 4.1 Sites

A **site** is placed at plan time by the sortie builder and validated. It has a rectangle, a ground override (like `castleInfo`), a draw routine, its connectors, and **slots**.

```
site = { id, type, config, x, y, w, h, climate, damage,
         ground(wx, wy) → terrain type or null,
         draw(ctx, wy0),
         connects:[{kind, x, y, dir}],
         slots:[{kind, x, y, r}],       // where enemies or targets may be placed
         clear:[{x, y, w, h}] }         // combat clearance, nothing may be placed here
```

`classify` asks the chunk's site list (built when the chunk starts; sites are indexed by chunk) before its default rules.

### 4.2 Scatter

Existing hash-cell decoration stays for trees, single houses, fields, copses, battle scars and critters. It differs from the campaign in two ways: every call is filtered by `mask(wx, wy)` (sites, roads, rails, water, clearance zones) and every scatter type reads its density from the segment's `density` and `climate`, not from `th`.

### 4.3 Variants, not copies

A feature has up to three variant axes: **climate** (palette, roof style, tree set), **size** (small, standard, large) and **damage** (section 7). Only supported or adaptable combinations exist (section 4.4); the rest are rejected by the builder.

### 4.4 Compatibility rules

Three states per combination: **S** supported (designed and tested), **A** adaptable (generated from shared assets, checked by eye), **F** forbidden (never generated).

| Feature | temperate | desert | winter | forest (dark conifer) | Notes |
|---|---|---|---|---|---|
| Farmland, farmstead | S | A (irrigated, terraced) | S | A (small fields near a castle or village only) | |
| Village | S | A (flat roofs) | S | A | |
| Harbour | S | A | A (ice, icebreaker) | A | needs navigable water on one side |
| Airbase | S | S | A | A (camouflaged) | runway needs 30 px clear margin |
| Station | S | A | S | A | needs rail |
| Industry | S | A (oil field) | A | F | needs road |
| City | S | A | A | F | |
| Castle | S | A | S | S (forest variant: new asset) | |
| Forest deciduous | S | F | A | F | |
| Forest conifer | A | F | S | S | needs a new conifer sprite |
| Island fort, carrier | S | S | A (ice floes) | A | needs open sea |
| Beach defences | S | S | A | A | |

Hard rules (the builder rejects the sortie if one fails):

1. A harbour needs navigable water on one side and a road or rail on the other.
2. A station needs a rail; a level crossing needs a road and a rail.
3. A bridge is only generated where a road or rail crosses water.
4. The carrier and ships only appear on open sea at least 80 px wide in x.
5. No two sites overlap; every site keeps its `clear` rectangles free of any other site, route, rail or scatter object. **Exception:** the site's own streets, runway and taxiways, and the route or rail that enters it through its declared connector.
6. Palm trees only in desert, snow trees only in winter. Conifers not in desert.
7. No spawner is placed where it first appears within 24 px of the left or right screen edge (everything comes on from the top edge, so the side margin is what matters), checked as a scrolling sequence (section 9).

## 5. Gameplay semantics

Every site and template exposes the same small interface to the director. This replaces `tryLand` guesses.

| Property | Use |
|---|---|
| `role` | decoration, landmark, target, hazard, spawner, boss-arena |
| `slots` | named positions the director may use: `flak`, `bunker`, `tank_park`, `convoy_start`, `convoy_end`, `parking`, `hangar_door`, `dock`, `fuel`, `gate`, `boss_anchor` |
| `clear` | combat clearance (see 4.1) |
| `onDestroy` | what changes: a spawner stops, a bridge breaks (existing `bridgeDown`), a chimney stops smoking, rubble appears |
| `threat` | small number the director uses to balance a screen (a flak gun adds more than a hangar) |

The **carrier** example: `role: spawner + landmark + boss-arena`; `slots: deck_guns[], launch_points[]`; `clear` around the deck; `onDestroy` for the deck stops fighter launches. If the deck is destroyed, no new fighters appear; the hull stays as a wreck.

Rule from the review request: the director must never place a gun where a large building blocks its line of fire, nor a boss on a visually busy area. Boss arenas have density at most 15 percent and no scatter inside the clear rectangle.

## 6. Ground, relief and water

- **Sea:** depth bands (shoal, mid, deep) from noise, drawn with the existing sea palette steps. Islands are a field `landMask(wx, wy)` from a few metaballs placed by `island_chain`, with a beach ring (existing `sand` + `surf`). Reefs are decoration on shoals.
- **Coast:** `coastLine` is kept for straight coasts. Bays and harbour basins come from sites that override `ground`. Cliffs are a coast variant with a 3 to 5 px dark band.
- **Relief is visual only.** A relief value in `[0,1]` per pixel from noise and authored ridges shifts the ground colour one palette step (light from the upper left). Relief shading itself never changes `terrainType`. Cliff walls and bare rock are the exception: they get their own terrain type `rock`, which ground enemies and scatter treat like water (never placed on it), so `tryLand` cannot put a gun on a drawn cliff. `rock` is new vocabulary only inside Enigma Run; the Campaign never produces it, so the replay checksums stay independent.
- **Rivers:** polylines like roads (monotone in y), width 5 to 11, with estuary and canal kinds. Bridges per section 2.
- **Ground cover** (grass, scrub, bare earth, rock, snow) is a separate layer from landform, so one landform can be reused in several climates.

## 7. Damage

Damage has three separate parts:

| Part | Values | Where it lives |
|---|---|---|
| Condition | intact, light, heavy, ruined | per site and per segment (a segment overlay `damage:'heavy'`) |
| Persistent traces | craters, rubble, scorch, wrecks, burnt trees, trenches | scatter layer, density scaled by condition |
| Active effects | flames, smoke columns, sparks | `chunkFires` and `smokePuff` (existing), at most N per screen |

Rules:

- The existing static "battle scars" (15 percent of cells everywhere) become the `light` level and are no longer on by default in every stage; level 6 uses `heavy` and `ruined`.
- Active effects have a per-screen budget (starting value: 6 smoke columns, 4 fires) and never run inside a boss arena's clear rectangle.
- Destruction during play keeps using the existing runtime system (`worldDamage`, `burntTrees`, `damagedHouses`, `bridgeDown`).

## 8. Atmosphere

A **weather plan** is a list of states over level progress, not a per-theme switch:

```
weatherPlan = [ { until: 0.3, sky: 'clear',   cloud: 0.2 },
                { until: 0.6, sky: 'rain',    cloud: 0.7, rain: 0.5, wind: [-0.1, 0] },
                { until: 1.0, sky: 'thunder', cloud: 0.9, rain: 0.8, wind: [-0.2, 0] } ]
```

| Parameter | Range | Effect |
|---|---|---|
| `cloud` | 0 to 1 | cloud count and opacity (builds on the Enigma cloud sprites) |
| `rain`, `snow` | 0 to 1 | particle density; ground accumulation for snow (palette shift) |
| `wind` | vector | drifts particles and clouds; **gameplay wind** (`world.windX`) only when `gust` is set, as in the sandstorm boss |
| `mist` | 0 to 1 | low fog drawn under bullets, enemies and the player, over the ground only |
| `heat` | 0 to 1 | sinusoidal horizontal shimmer on the ground layer only |
| `timeOfDay` | day, dusk, night, dawn | tint and light contrast |
| `lightning` | on/off | existing lightning and thunder |

Hard rule: every weather effect is drawn **under** bullets, enemies, pickups and the player, except the existing faded high-cloud overlay. Mist and snowstorm may reduce terrain contrast but never bullet contrast.

## 9. Validation

Run at build time in a test harness over many seeds, and optionally as a debug overlay. Every rule has a metric; the numbers are starting values.

1. **Hard constraints** (section 4.4): any failure rejects the seed.
2. **Density:** per chunk, `structure area / chunk area` as defined in 3.2, against the template's range (average) and range + 10 points (peak).
3. **Negative space:** in every 224 x 120 px window of the level, an open lane at least 40 px wide with no structure, route-side object or site `clear` violation. Boss arenas: at most 15 percent structure and none in the clear rectangle.
4. **Rhythm:** over a sliding window of 6 chunks, the density must vary: the difference between the densest and the sparsest chunk is at least 15 points; no more than 3 consecutive chunks above 50 percent; at least one chunk under 25 percent in every 8; each landmark site has at least 1 chunk of density under 30 percent before it ("approach").
5. **Readability:** for every climate palette, take the 3 darkest, 3 brightest and the mean ground colours and compare each with every enemy bullet colour: luminance difference of at least a set amount (start: 25 of 255) **or** hue difference of at least 40 degrees. Stack the maximum of every weather effect, smoke and fire on top (alpha-composite) and re-run; the bullet colours must still pass. This is a table test on palettes, not a screenshot test.
6. **Connectivity:** every route and rail has both ends at a seam or a level edge; every site connector meets a route, street, rail or water.
7. **Performance:** a **chunk micro-benchmark per template** (new; `tests/perf.mjs` only measures frame times against `perf-baseline.json`, it does not measure chunk build time). Compare with the Campaign baseline; a few percent allowed. Also `drawFeatures` time per chunk, which today runs in one call.
8. **Determinism:** same seed gives the same sortie and the same chunk pixels, in a fresh page and in a page that previously ran another level. `node tests/replay.mjs` is unchanged.
9. **State hygiene (new):** a replay case that plays an Enigma level and then the golden Campaign scenario **in the same page** and checks the golden checksums. The existing `tests/replay.mjs` opens a fresh page per scenario and cannot see leaks.
10. **Visual review:** a contact sheet of N seeds for each level and template (Playwright, as in `docs/enigma-prompt.md`).

## 9a. Engineering rules for the generator (new, from review)

**State.** Starting an Enigma level must call one `resetTerrainState()` (also called when a Campaign run starts, and by `toTitle`) that clears everything the terrain code caches: `roadCache`, `farmCache`, `tentCache`, `houseCache`, `fieldOkCache`, `railEndCache`, `parcelRowCache`, `parcelBlkCache`, `flowCache`, `canopyCache`, `castleCache`, `finalCache` (its key omits the seed), `chunkHouses`, `chunkFires`, `rxW`, `towerRows`, `towerCells`, `setPieceDone`, `bridgeDown`, `bridgeSpawned`, `critters`, `props`, `burntTrees`, `damagedHouses`; and must reset the shared singletons `CL`, `TRGB`, `engSat`, `world.featTheme`, `world.curTheme`/`prevTheme`/`prevLand`/`blendFrom`/`blendTo`/`blendY`/`stageBaseP` and `world.SEED`. `createRun` gets a `sortie: null` key so a stale value cannot leak into the next Campaign run. `toTitle` clears the sortie, and the tutorial and title screen always use the original terrain. [verify] each name against the code in phase 1; the list is the reviewer's.

**Randomness.** `buildSortie` uses only a pure hash or splitmix sequence from `(seed, level, segmentIndex)`. It never uses `Math.random`, so lazily extended sorties (later, for generative mode) give the same result whenever they are built.

**Build limits.** `buildSortie` rejects and re-rolls a placement at most N times (start: 8) and then falls back to a fixed, hand-checked layout for that segment. It never loops without a limit while the game is running.

**Per-pixel and per-chunk rules.**
- `classify` returns the shared `CL` object. A site's `ground()` must **not** call `terrainType` or `classify`; it gets plain coordinates and returns a type, so it cannot overwrite `CL` mid-call.
- `classify` warps `wy` by `wob(wx, wy)` (up to about 14.5 px). Site rectangles are tested on the **unwarped** `wy`, against sites indexed for chunks p-1 to p+1.
- Do not copy `castleInfo`'s per-call string cache key; use a numeric sortie id.
- `drawFeatures` is split into passes (ground details, trees, buildings, effects) that `workChunk` can spread over several frames in Enigma Run. Urgent chunks (level start, `setLook`) ignore the budget, so the first chunks use a cheaper first pass.
- Masks (`mask(wx, wy)`) used by scatter are looked up per cell, not per pixel.

**Compatibility with the director.** Phase 1 maps every template to a legacy `info.b` string (`country`, `forest`, `base`, `city`, `factory`, ...). The old director only spawns by those strings, so an unmapped template would get no ground enemies, and a mapped one must never imply a road that does not exist (see `routeActive`). [verify] the full list of `info(p).b` consumers (about 18 direct checks).

## 10. The six levels as segment sequences (draft, for you to change) [you]

Lengths in chunks. Order is the Campaign order. Bosses and music are the campaign's.

**How a level ends (changed after review).** In the Campaign the boss spawns when the chunk counter `qTop` reaches `round(37 * 1.3) + ceil(XH / CH)` = 48 plus a margin (theme 1 gets extra), set pieces and the "still" zone use a progress `u = qTop / 48`, a wing spawns at chunk 18, and the **last biome never ends** (`biomeForQ` returns the boss ground for every later q). The castle boss is reported to need about 19 chunks of castle ground after its trigger because it is anchored far above where it spawns. [verify] Therefore:

- `buildSortie` emits `bossQ` (the chunk at which the boss triggers) and `len`. `directorInner` takes the trigger and the `u` normalisation from the sortie when one exists.
- The **last segment is open-ended** (it never ends, like the campaign's last biome), and its `lengthChunks` is only its minimum.
- Seams are **counted inside** the lengths below.
- A level's `bossQ` is about 44 to 48 unless a sequence is deliberately shorter; the wing spawn and set-piece positions are derived from `bossQ`, not from the fixed 18 and 48. Boss arenas use the campaign contract from 1.1 (their length is whatever the campaign's boss needs).



**Target lengths (owner decision):** at least a Campaign stage (about 48 chunks), later levels longer: L1 48, L2 48, L3 50, L4 52, L5 54, L6 58, all before the open-ended boss arena. Waves are time-driven in the Campaign (`waveCd`), so a longer level simply has more waves; the ARC pacing is normalised by `bossQ` (see above). [verify]

**Level 1: Cross the Channel** (temperate, day, scattered cloud, rain showers in the second half). Boss: the flagship. Total 48.
`open_sea 3` -> `island_chain 6` -> `fleet 5` (**carrier gate**, see 13) -> `beach_fortified 3` -> `farmland 7` (river with bridge) -> `village 4` -> `forest_deciduous 4` -> `airbase_forest 5` -> `farmland 3` -> `harbour_small 4` -> `open_sea 4` -> boss arena (sea).

**Level 2: Sea of Sand** (desert, heat shimmer, dust, sandstorm gusts at the boss). Boss: Sand Colossus. Total 48.
`harbour_commercial 4` (desert) -> `beach_town 3` -> `valley 7` (oil field, wadi) -> `village 4` (desert) -> `station_junction 6` (convoy on the road) -> `desert_open 4` (oasis, irrigated fields) -> `airbase_desert 6` -> `pass 7` (fortified) -> `desert_open 7` (quiet approach) -> boss arena.

**Level 3: The Long Night** (night, lightning, then low mist). Boss: the supergun. Total 50.
`beach_fortified 3` (searchlights) -> `industrial_power 7` (pylons, smoke) -> `station_marshalling 7` -> `farmland 7` (night, mist) -> `village 3` (lit windows) -> `airbase_searchlight 6` -> `forest_deciduous 5` -> `industrial_light 6` -> `rail_corridor 6` (two rails) -> boss arena.

**Level 4: The Iron Forest** (dark conifer, rain, mist). Boss: Ravenhold castle. Total 52.
`beach_cliff 3` -> `forest_conifer 8` (several roads, convoys) -> `forest_fortified 7` -> `clearing_village 4` (logging camp) -> `airbase_forest_hidden 6` (camouflaged) -> `forest_fortified 7` -> `forest_conifer 5` -> `valley 6` (river valley) -> `farmland_approach 6` -> `castle_forest` (boss; reported to need about 19 chunks of castle ground, [verify]).

**Level 5: The Winter Line** (winter, light snow rising to a snowstorm). Boss: the armoured train. Total 54.
`open_sea_ice 3` -> `harbour_winter 4` -> `farmland_winter 7` -> `village 4` -> `lake_valley 6` -> `station_winter 8` (train convoy) -> `airbase_snow 6` -> `forest_conifer 6` (snowstorm) -> `pass 6` -> `farmland_winter 4` -> boss arena (rail yard).

**Level 6: The Burning City** (temperate, dusk, smoke; damage grows from none to ruined). Boss: the skyfortress duel. Total 58. **It starts simple and grows into a city** (owner decision):
`open_sea 2` -> `coast_plain 2` -> `farmland 7` (**no river**) -> `village 5` -> `city_suburb 6` (light damage) -> `city_town 5` -> `city_river 12` -> `city_centre 6` (heavy damage) -> `industrial_power 5` (smoke) -> `ruins 4` (ruined) -> `station_main 4` -> boss arena (air).

`city_river` is a **new river, not the campaign's** (`riverY`/`riverD`): a wide river drawn as a polyline (section 6, monotone in y, width about 14 to 20 px), with quays, and a **small city island** in the middle (old town: streets, a church and a square) connected by **3 to 4 bridges**. The bridges are real bridges (`bridge` terrain, attackable `G('bridge')`, breakable via `bridgeDown`) and are also the only crossings for the city routes. Density rises smoothly from the village (about 35 percent) through suburb and town to the centre (up to 60 percent) and the street layout changes with it: a main road with houses along it, then a grid with an irregular old centre, then radial streets around the island's square.

New templates this needs: `desert_open`, `industrial_light`, `coast_plain`, `city_town`, `city_river` (variants defined in 3.2, add to the table when phase 1 starts).

Each level also needs: one named landmark, one "quiet" stretch of at least 2 chunks, and a pre-boss approach. **[you]** add what each level should have in your mind that I have not written.

## 11. New content needed (beyond the campaign), by tier

| Tier | Item | Needed by | Notes |
|---|---|---|---|
| 1 | Conifer sprites (3 sizes + snow version) | levels 4, 5 | `SPR.treeSets` has no conifer |
| 1 | Village layout (cluster, gardens) | 1, 2, 4, 5 | extends `houseAt` |
| 1 | Multi-road support (section 2) | all | |
| 1 | Island and bay shapes | 1, 5 | |
| 1 | City generator with density fade and bridges | 6 | replaces fixed grid in the new mode only |
| 1 | Weather plan and fog | all | |
| 1 | Damage levels | 6 | |
| 2 | Harbour (small, commercial, naval) | 1, 2, 5, 6 | |
| 2 | Carrier (spawner mini-boss) | 1 | |
| 2 | Giant submarine boss | later | needs a naval pen |
| 2 | Air base variants | 1 to 5 | |
| 3 | Everything else from the catalogue | generative mode | vineyards, stadium, chemical plant, monastery, oil terminal, ... |

## 12. Implementation phases (reordered after review)

1. **Foundations and safety** (no visible change to the Campaign): `run.sortie`, `buildSortie` skeleton with `bossQ` and `len`, the Enigma end-of-level path, the leaderboard/progress flags, `resetTerrainState()`, the legacy-theme mapping per level, the template-to-`info.b` mapping, the hard constraints (9.1) and the determinism and state-hygiene tests (9.8, 9.9), Settings button and level picker, a debug contact-sheet page, and the chunk micro-benchmark (9.7). Also confirm every **[verify]** item.
2. **Ground**: sea, islands, coast, rivers, `rock`, relief, climate palettes, conifers.
3. **Routes, rails and streets**: Tier A and Tier B, drawn by `CL.rd`, with the director's `routeActive` check.
4. **Settlements and forests**: farmland, villages, forest templates, then the city and industry.
5. **Sites with slots**: harbour, air base, station, castle; wiring to the director.
6. **Atmosphere and damage**: weather plan, fog, damage levels.
7. **Tuning**: densities, rhythm, readability thresholds, performance.
8. **Generative mode**: note that `settings.mode` is forced to `'camp'` at load (line 508 of `index.html`), so generative mode is currently unreachable. This phase first has to decide how the mode is switched on. Lazy sortie extension comes after that.

Each phase ends with a contact sheet of the six levels and a full test run.

## 13. Decisions and open questions

**Decided by the owner**
1. The **carrier must be destroyed to continue** (a gate). Mechanism still open, see below.
2. **Every level keeps the Campaign's boss fight unchanged.**
3. Density ceilings: roughly the right direction; to be checked on contact sheets in phase 7.
4. **Scores do not count anywhere** for now (no local best).
5. **Campaign order** for levels 1 to 6.
6. **Level length** matches a Campaign stage at least, later levels longer (section 10).
7. **Level 6** starts simple and grows into a real city with its own new river, a small city island and connecting bridges (section 10).

**Still open [you]**
- A. **Carrier gate mechanics.** Options: (a) the scroll stops while the carrier is alive, like a boss; (b) the carrier follows the screen and the segment after it only starts when it is destroyed; (c) the boss trigger is blocked until it is destroyed, but the scroll continues and the carrier sails back into view. Draft preference: (a), the simplest and the same as a boss.
- B. Should a night in a level other than level 3 also give searchlights their extra shots (1.1, item 3), or stay visual?
- C. Enemy route objects (section 2): now or later? Draft preference: later.
- D. What each level should additionally have (named landmark, special moments, a favourite thing you want to see). Section 10 is waiting for this.
- E. Which level is built first as the vertical slice? Draft preference: level 6, because it is the hardest and the most visibly broken today; otherwise level 1.

## 14. Changes from review (draft 1 -> draft 2)

The Opus review was run against `index.html` without edits. I checked these claims myself before accepting them: generative mode is unreachable (`settings.mode = 'camp'` at line 508); `lbEligible` is `run.endless || run.start === 1`; `createRun` has no key for the new mode so a stale flag would survive into the next run; the boss trigger is `round(37*STAGE_LEN) + ...` and `loopsWon++` is tied to completing a stage. Everything else in this file marked **[verify]** is still the reviewer's claim.

Findings folded in: end-of-level and boss-trigger rework (10); theme plan changed (1.1); state leaks and the reset list (9a); leaderboard and progress flags (0); two-tier roads and the `CL.rd` drawing fix (2); perf rules (9a); reordered phases (12); PRNG rule (9a); density and rhythm metrics (3.2, 9); missing template names and compatibility fixes (3.2, 4.4); `rock` terrain (6); naming `run.sortie` (0); audit corrections (audit file).

