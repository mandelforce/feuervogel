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
3. **Night fire is local to the searchlight** (owner decision, refined). What the Campaign code does today, as I read it (not play-tested): at night (`nightF > 0.5`) **every** flak gun fires an extra burst of 3 fast shells (speed x1.4) after each normal shot, wherever it stands; separately, when a searchlight beam catches the player, `world.spotted` is set for 45 frames and then **every** flak gun and flatcar on screen reloads at double speed; a generator within 190 px powers each searchlight, and a radar within 140 px makes a flak gun's aim tighter. None of this depends on how close a gun is to a beam. **Enigma Run rule:** the faster, better-aimed shots (the burst, the double shot, the tighter aim) only come from **turrets within a set distance of a searchlight's origin** (start: 70 px) **while that searchlight is on**. Destroy the searchlight or its generator and its turrets lose the bonus. This gives the player something to attack, makes the beam readable, and gives the generator a reason to place turrets in clusters around searchlights (a slot type `searchlight_post`). It is a sortie parameter, `nightFire`, used only in Enigma Run, tuned with `tests/balance.mjs`; the Campaign keeps its global behaviour and its checksums. **Level 3 uses the same local rule** (owner decision, for consistency): in Enigma Run the global night burst and the global `spotted` reload bonus are replaced by `nightFire` everywhere. It applies to flak guns (the gun type that has the burst today). [verify] where flak, flatcar and searchlight code reads `nightF` and `spotted` (`ENT.flak`, `ENT.flatcar`, `ENT.search`).
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

The **carrier** example (changed by the owner): it is the **opening scene of level 1**, not a gate. The player steals the Feuervogel from the carrier at the start, the ship is shown launching from the deck amid panic, and the carrier cannot be destroyed because the player is leaving it behind. `role: scripted-start + landmark`; `slots: deck_guns[], launch_points[]`; `clear` around the deck. Fighters launch from `launch_points` for a fixed time and pursue the player; the carrier scrolls off the bottom. Owner details: the deck has **turrets that can be destroyed**; the hull cannot. The pursuit lasts **15 to 25 seconds** (to be tuned; start at 20). At the start the carrier is **large and nearly fills the screen**, and it **shrinks and slides off** as the Feuervogel climbs away (a scale-down from about 1.0 to 0.5 while it scrolls off the bottom; this is a drawn scale, not terrain). Launch fighters use the existing `fighter` entity; the turrets reuse `flak` or `main` turret logic. The scene belongs to the `carrier_start` segment and must not change the Campaign's own intro.

Rule from the review request: the director must never place a gun where a large building blocks its line of fire, nor a boss on a visually busy area. Boss arenas have density at most 15 percent and no scatter inside the clear rectangle.

### 5.1 Generators and power (current state and options)

Today the only game mechanic tied to a generator (`G('gen')`: 8 hp, 1200 points, harmless, puffs smoke) is **powering a searchlight**: a searchlight finds the nearest generator within 190 px, and when that generator is destroyed the searchlight goes dark after about 60 frames. Generators are spawned only beside searchlights in the night stage (campaign stage 4 or later, or in Endless). I found no generator on air bases and no other effect. In Enigma Run a `generator` site carries `powers: [siteIds]` so the link is data, not a distance search. The first use is `searchlight_post`: a searchlight, a generator and the turrets near it. Possible later uses, none of them decided: runway lights and flak at an air base, a radar, factory machinery, a harbour crane. [you]

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



**Story frame (owner):** at the start of level 1 the player steals the Feuervogel from the enemy carrier, which causes panic, and many planes launch after the player. Then the player decides to go against the raven clan and its hideouts. The six levels are the hunt for those hideouts.

**Target lengths (owner decision):** levels may be longer than a Campaign stage (about 48 chunks) so they can hold the new content and feel less dense: **L1 56, L2 56, L3 58, L4 60, L5 62, L6 70**, all before the open-ended boss arena. The chunk counts written in the sequences below are **weights**: `buildSortie` scales them to the target length (rounding, keeping each segment at its minimum). Waves are time-driven in the Campaign (`waveCd`), so a longer level has more waves; the ARC pacing is normalised by `bossQ` (see above). [verify] The wave rate per second may need to be lowered so the longer levels do not feel denser; tune in phase 7.

**Order conflict to resolve [you]:** the landmarks you gave for levels 4 and 5 are the reverse of the Campaign order (Campaign stage 4 is the Iron Forest with the castle, stage 5 is the Winter Line with the train). The sequences below keep the Campaign order and the landmarks are attached to the matching level by theme (frozen sea and submarines -> Winter Line, castle and dense forest -> Iron Forest). If you want the order swapped, the bosses swap with it (the train in level 4, the castle in level 5).

**Level 1: Cross the Channel** (temperate, day, scattered cloud, rain showers in the second half). Boss: the flagship. Total 48.
`carrier_start 4` (**opening scene**) -> `open_sea 3` -> `island_chain 6` -> `island_large 5` (one large island with farmland, fields and a farmstead) -> `beach_fortified 3` -> `farmland 7` (river with bridge) -> `village 4` -> `forest_deciduous 4` -> `airbase_forest 5` -> `farmland 3` -> `harbour_small 4` -> `open_sea 4` -> boss arena (sea).
*Landmarks:* the carrier start and the ship boss; many small islands; one large island with farmland.

**Level 1, revised by the owner:** the carrier, then a lot of ocean, then islands (small ones first, then a larger one with the airbase), then ocean, then the beach fortifications, which are basically the reworked land of the old stage 1, then ocean again. As weights (length 56): `carrier_start` 4, `open_sea` 6, `island_chain` 6, `island_airbase` 9, `open_sea` 3, `beach_fortified` 3, `farmland` 8, `village` 4, `forest_deciduous` 4, `farmland` 4, `coast_down` 1, `open_sea` 4. The forest airbase and the small harbour are gone; the airbase is on the large island.

**Level 2: Sea of Sand** (desert, heat shimmer, dust, sandstorm gusts at the boss). Boss: Sand Colossus. Total 48.
`harbour_commercial 4` (desert) -> `beach_town 3` -> `valley 7` (oil field, wadi) -> `village 4` (desert) -> `station_junction 6` (convoy on the road) -> `desert_open 4` (oasis, irrigated fields) -> `airbase_desert 6` -> `pass 7` (fortified) -> `desert_open 7` (quiet approach) -> boss arena.
*Landmark:* a small oasis (`oasis`) with a pool of water, palm trees, a few houses and a well. It is placed in the `desert_open 4` segment.

**Level 3: The Long Night** (night, lightning, then low mist). Boss: the supergun. Total 50.
`beach_fortified 3` (searchlights) -> `industrial_power 7` (pylons, smoke) -> `farmland 7` (night, mist) -> `city_small 4` (lit windows, searchlights, burning houses) -> `airbase_searchlight 6` -> `forest_deciduous 5` -> `industrial_light 6` -> `rail_corridor 6` (two rails) -> `station_marshalling 7` (right before the boss, its tracks running into the arena) -> boss arena. (Order changed by the owner after the mockup, see 16.z.)
*Landmark:* a small city (`city_small`, replaces the `village 3`) with searchlights and **some burning houses**: it has been attacked recently (damage `heavy` with active fires, within the fire budget of section 7). Night shots apply (1.1, item 3).

**Level 4: The Iron Forest** (dark conifer, rain, mist). Boss: Ravenhold castle. Total 52.
`beach_cliff 3` -> `forest_conifer 8` (several roads, convoys) -> `forest_fortified 7` -> `clearing_village 4` (logging camp) -> `airbase_forest_hidden 6` (camouflaged) -> `forest_fortified 7` -> `forest_conifer 5` -> `valley 6` (river valley) -> `farmland_approach 6` -> `castle_forest` (boss; reported to need about 19 chunks of castle ground, [verify]).
*Landmarks (owner, listed as level 5):* the **castle at the end**, a fortification line before it, **dense forest with mist**.

**Level 5: The Winter Line** (winter, light snow rising to a snowstorm). Boss: the armoured train. Total 54.
`open_sea_ice 3` -> `harbour_winter 4` -> `farmland_winter 7` -> `village 4` -> `lake_valley 6` -> `station_winter 8` (train convoy) -> `airbase_snow 6` -> `forest_conifer 6` (snowstorm) -> `pass 6` -> `farmland_winter 4` -> boss arena (rail yard).
*Landmarks (owner, listed as level 4):* **part of the sea is frozen** (`open_sea_ice`), **submarines come up through holes in the ice** (`ice_hole`, with a surfacing animation, built on the existing `ice` terrain and `G('sub')`), and **it begins to snow partway through** (weather plan: clear -> light snow -> snow -> snowstorm).

**Level 6: The Burning City** (temperate, dusk, smoke; damage grows from none to ruined). Boss: the skyfortress duel. Total 58. **It starts simple and grows into a city** (owner decision):
`open_sea 2` -> `coast_plain 2` -> `farmland 7` (**no river**) -> `village 5` -> `city_suburb 6` (light damage) -> `city_town 5` -> `city_river 12` -> `city_centre 6` (heavy damage) -> `industrial_power 5` (smoke) -> `ruins 4` (ruined) -> `station_main 4` -> boss arena (air).

*Landmarks:* **damage around the industry, the airfield and the base**; **burning parts of the city**; the story is that the allies fought a big battle here and **lost**, so **shot-down planes lie on the ground** (`wreck_plane`: allied fighters and bombers, plus a few of the player's own side), with craters, burnt vehicles and smoke columns. Damage grows along the level: none in the farmland, light in the suburb, heavy in the centre and industry, ruined near the base.

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
| 1 | Carrier start scene (deck, launch points, pursuit fighters, scroll-off) | 1 | scripted opening, not a gate |
| 1 | Ice holes with surfacing submarines | 4/5 (winter) | builds on `ice` terrain and `G('sub')` |
| 1 | Oasis (pool, palms, well, houses) | 2 | palms exist (`palm()`); well and pool are new |
| 1 | Small city with searchlights and burning houses | 3 | uses the damage overlay and `chunkFires` |
| 1 | Plane wrecks (allied fighters and bombers on the ground) | 6 | new sprites; the Campaign has tank and truck wrecks only |
| 1 | Large farmland island | 1 | island template with its own fields |
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

## 12a. Phase 1 status (done on branch `claude/kind-mccarthy-g4g06h`)

Built: `run.sortie` and `buildSortie` (pure hash, segments scaled to the level lengths, `bossQ: null`); the legacy-theme mapping (level n -> `STAGE_ORDER[n-1]`); Settings > Enigma Run (title screen only) and a level picker that reuses the practice picker; the flags (no board, best, play data, loops, new-best banner); the Enigma end of level (results, then the picker; no congratulations, no next stage); resume as `{level, seed}`; `resetTerrainState()` called by `newGame`; `tests/enigma.mjs`, `tests/contact.mjs` and a chunk-build benchmark; the CI step. The Campaign is unchanged: `node tests/replay.mjs` matches `golden.json` and the smoke test passes.

Findings from building it:
- **The review's leak list is real.** With the reset disabled, `parcelRowCache`, `parcelBlkCache`, `flowCache`, `chunkHouses`, `chunkFires`, `castleCache`, `finalCache`, `featTheme` and `TRGB` survived into the next run. These leaks already exist in the Campaign (a fresh page is never affected, so the golden test could not see them); the reset removes them, which is the only Campaign-side change and it only touches second and later runs in one session. Not detected by the same-page golden test alone (it passed even without the reset), hence the separate marker test.
- **Artifacts** found in Enigma Run levels behave as in Practice (they are stored); only the board, best score, loops, play data and resume rules were changed. [you] say if artifacts should not count either.
- **Level 1 as Campaign stage 1:** `run.start` is 1 for level 1, so the flags check `run.sortie` and not `run.start`.
- **Chunk build time (this machine, ms per 224x64 chunk, mean / p95):** level 1 13.4 / 19.4, level 2 12.3 / 22.0, level 3 12.3 / 17.3, level 4 12.0 / 19.7, level 5 11.8 / 19.6, **level 6 20.8 / 43.4** (the city and factory ground costs about twice the others). This is the baseline the new ground must stay near.
- Confirmed from the review: generative mode is unreachable; the boss trigger is a fixed chunk count (so `bossQ` is left `null` until the ground is the sortie's own).
- Still **[verify]** for phase 2: the castle boss's ground length, the `info(p).b` consumers, which theme checks affect the simulation.
- The first picture of today's level 6 (contact sheet, `tests/contact.mjs`): sea, plain farmland, a uniform red-roof city grid with a tree-lined road and a few squares, a grey factory block, then the concrete airfield hall. This is what phase 2 onwards replaces.

## 13. Decisions and open questions

**Decided by the owner**
1. The **carrier must be destroyed to continue** (a gate). Mechanism still open, see below.
2. **Every level keeps the Campaign's boss fight unchanged.**
3. Density ceilings: roughly the right direction; to be checked on contact sheets in phase 7.
4. **Scores do not count anywhere** for now (no local best).
5. **Campaign order** for levels 1 to 6.
6. **Level length** matches a Campaign stage at least, later levels longer (section 10).
7. **Level 6** starts simple and grows into a real city with its own new river, a small city island and connecting bridges (section 10).

**Resolved**
- **Level order stays as the Campaign order** (levels 4 and 5 are not swapped; the landmarks stay attached by theme as written in section 10).
- **Level 3 follows the local night rule** like every other night level.

**Changed by the owner in the latest round**
- The carrier is **not a gate**. It is the opening scene of level 1: the player steals the Feuervogel from it and cannot destroy it. Pursuing planes launch from it (section 5).
- **Night has a gameplay effect** in any night level: better-aimed shots and some double shots (1.1, item 3).
- **Route objects are deferred** (see Reminders below).
- **Level 6 is built first** (vertical slice).
- **Levels may be longer** (section 10).

**Still open [you]**
- C. **Carrier numbers:** answered (turrets destroyable, 15 to 25 seconds, large then smaller). Fine-tune when it can be played.
- D. Anything else you want each level to contain; the landmarks above are recorded as given.

## 13a. Reminders for the owner

- **Route objects** for enemies that drive on roads (section 2): built (owner decision, section 17.5).
- **Local best score per level**: not now. Revisit after the first playable level.

## 14. Changes from review (draft 1 -> draft 2)

The Opus review was run against `index.html` without edits. I checked these claims myself before accepting them: generative mode is unreachable (`settings.mode = 'camp'` at line 508); `lbEligible` is `run.endless || run.start === 1`; `createRun` has no key for the new mode so a stale flag would survive into the next run; the boss trigger is `round(37*STAGE_LEN) + ...` and `loopsWon++` is tied to completing a stage. Everything else in this file marked **[verify]** is still the reviewer's claim.

Findings folded in: end-of-level and boss-trigger rework (10); theme plan changed (1.1); state leaks and the reset list (9a); leaderboard and progress flags (0); two-tier roads and the `CL.rd` drawing fix (2); perf rules (9a); reordered phases (12); PRNG rule (9a); density and rhythm metrics (3.2, 9); missing template names and compatibility fixes (3.2, 4.4); `rock` terrain (6); naming `run.sortie` (0); audit corrections (audit file).


## 15. Phase 2: level 6 ground design (draft, before code)

Scope: the **ground of level 6 only** (The Burning City), as a vertical slice. Other levels keep the Campaign ground. No new routes or street lists yet (phase 3 does those properly); no new enemy types; the bridges reuse the existing bridge target. Boss, music and enemies are the Campaign's.

### 15.1 How it plugs in

- `buildSortie(6)` gets `gen: 6`. When `run.sortie && run.sortie.gen`, `predictInfo(p)` (via `info(p)`) returns, for a chunk `p` at sortie chunk `c = p - world.stageBaseP`, an info object `{ b, th: 5, q: c, e: { t, i, f, c } }`: `t` the template, `i` the segment index, `f` the position inside the segment (0 to 1), `c` the sortie chunk. `b` is the **legacy biome name** the old director and placement code understand (section 9a): open_sea -> `sea`; the first chunk of coast_plain -> `coastUp`; farmland, village, suburb, town, city_river, city_centre, ruins -> `country` or `city` as listed in 15.3; industrial_power, station_main -> `factory`. Chunks before the start are `sea`; chunks from `c >= len` on are **`secret` with `th 5`** (the Campaign's final airfield, which the boss code requires, see 1.1 item 4).
- `classify` and `pixelColor` branch at the top: `if (I.e) return classifyE(...)` / `colorE(...)`. With no sortie (the Campaign) the code path and the result are unchanged (checked by the replay test and its terrain fingerprints). `classifyE` returns the same terrain-type vocabulary (`sea surf sand grass field forest road river bridge street roof park yard concrete`) so placement, critters and the director keep working. For templates that are the legacy ground (open_sea, the coast chunk, farmland, industrial_power, station_main) `classifyE` simply calls the legacy branch with `th 5`.
- The director paces the level from the sortie: `sortie.arcLen = len + 5` replaces the Campaign's fixed 48 for the progress `u`, for the wing spawn (18 chunks) and for the artifact's position; the boss trigger is `sortie.bossAt = len + 5` (plus the same screen-height term as the Campaign) so the boss comes the same distance after the secret ground begins as in the Campaign. With no sortie all factors are 1 and nothing changes.

### 15.2 The urbanisation field

One smooth value `U(c)` from 0 (open farmland) to 1 (city centre), a piecewise-linear curve over the level's chunks through these control points (each segment's own value at its middle, linear between, so there are no hard changes at segment borders):

| Segment | U | damage D |
|---|---|---|
| open_sea, coast_plain | 0 | 0 |
| farmland | 0.05 | 0 |
| village | 0.30 | 0 |
| city_suburb | 0.50 | 0.15 |
| city_town | 0.65 | 0.25 |
| city_river | 0.80 | 0.40 |
| city_centre | 1.00 | 0.60 |
| industrial_power | n/a (legacy factory) | 0.75 |
| ruins | 0.90 | 1.00 |
| station_main | n/a (legacy factory) | 0.80 |

`U` drives house density, how many city blocks are built, and block kinds. `D` drives battle scars, fires and rubble (15.6). Both are functions of `c` and `wy` only (plus hash noise), so a chunk looks the same whenever it is built.

### 15.3 Farmland, villages, suburb, town

- **Farmland (U about 0.05):** the legacy `country` ground with `th 5` (fields, hedges, copses, farms, the main road). The legacy river and lake are not used (`th 5` already excludes them), so there is **no river** here (owner decision).
- **Villages (U 0.15 to 0.4):** still the legacy field ground, but houses **cluster**. A village centre is placed every 2 to 4 chunks on the main road by hash; within about 45 px of a centre the house chance is raised to about 0.9 and houses sit on both sides of the road in a loose row with gaps, plus a small green; outside the clusters the house chance falls to a low value. Church spire and a few lit windows are added later. Implemented as a change to the chance in `houseCand`/`houseOK` for sortie chunks only.
- **Suburb and town (U 0.4 to 0.7):** the legacy city **block grid** (56 x 48 cells, `cityCell`, the same building and roof drawing) but each cell has a **state** from `U` and noise: built (the existing kinds), garden (green plot with one or two houses), or open (field or grass). The probability of "built" rises with `U`; street lanes are drawn only where at least one neighbouring cell is built, otherwise the cell is field. Result: the city fades into the fields instead of starting at a straight line, and the grid becomes dense gradually. The kind mix also changes with `U`: row houses and gardens in the suburb, perimeter blocks, squares and churches toward the town.

### 15.4 The river city

A **new** river, not `riverY`/`riverD`:

- It runs **east to west across the strip** (so the main road and the grid's vertical streets cross it, and the existing bridge target, a vertical deck on a horizontal river, can be reused). Its centre line is `yc(wx) = y0 + 9 sin(wx * 0.021 + ph) + 5 sin(wx * 0.07)`, width **26 px** away from the island (the Campaign's is 7 to 11), banks with an irregular edge (noise of about 2 px), shallow edge colour, and a **quay wall** (stone band 3 px) on both banks with a **riverside street** along it.
- At one place in the segment the river **splits around a small island**: an ellipse about 70 px wide and 36 px tall (the old town), with a channel of about 11 px on each side. The island is covered by `perim` and `church` cells of the city grid (a church and a square in the middle), clipped to the ellipse, with its own quay.
- **Bridges:** at the main road and at two vertical grid streets, one bridge across each channel (north channel: bank to island; south channel: island to bank), i.e. up to **three pairs**. Each bridge is the existing `G('bridge')` target placed by the director from the sortie (`world.enemies.push(G('bridge', x, y, { hh, bkey, small }))`), and breaks through the existing `bridgeDown` mechanism; the terrain under a bridge is `bridge` (`river` after it is broken), as in the Campaign.
- Terrain types: `river` (counts as water for placement and critters), `bridge`, quay as `street`.
- Placement of the river and island is fixed by the sortie from `rng`, not from `Math.random`, so it is the same every run; it is stored as `sortie.river = { c0, y0, ph, ix, iy, iw, ih, bridges: [x...] }`.

### 15.5 Centre, industry, ruins, station

- **City centre (U 1.0):** the densest blocks: perimeter blocks, squares with fountains, churches, parks; the main road becomes the boulevard (legacy `cityColorBase` already draws it with tram rails).
- **Industrial power (legacy factory with `th 5`):** the halls, tanks and yards of the Campaign's factory zone; chimneys with smoke exist. Pylons and cooling towers are later assets.
- **Ruins:** the city cells forced to `rubble` with a weighted mix of `perim` ruins; the damage overlay is at 1.0.
- **Station main:** mapped to the legacy factory ground for now; the terminus design is later.

### 15.6 Damage (visual and fires, no new enemy)

The static battle scars (`drawFeatures`, 15 percent of 46 px cells on field, grass, mud and forest) become a function of `D`: density `0.15 * D / 0.6` capped at 0.35, and also drawn on city ground. Fires and smoke columns use the existing `chunkFires` and `smokePuff` at a budget that rises with `D` (up to 6 columns per screen, never in the boss arena). Burning houses are rubble cells with a fire. Plane wrecks are a later asset (new sprites).

### 15.7 Limits, performance and tests

- Per-pixel cost: the river and island are analytic (O(1)); cell state is cached per cell (a `Map` keyed by cell, cleared in `resetTerrainState`); no per-pixel loops over lists. **Budget:** mean chunk build time at most 1.3 times the Campaign's level 6 (about 21 ms, so at most 28 ms mean, 55 ms p95), measured by `node tests/enigma.mjs --bench`.
- `classifyE` and everything it calls must not call `terrainType`/`classify` re-entrantly (shared `CL` object) and must test the unwarped `wy` for river and island checks, with the chunk lookup widened by the warp (about 15 px).
- Tests: the level-6 contact sheet (reviewed by eye), a **terrain fingerprint of level 6** (like the Campaign's, stored in a new `tests/enigma.json`, because the world must be deterministic), the bench, the same-page Enigma-then-Campaign check, and the unchanged Campaign replay.
- **Out of scope:** street and route lists (phase 3), radial streets, plane wrecks, pylons and cooling towers, the real station terminus, other levels.

### 15.8 Review of section 15 (Opus, against the code) and the revised plan

Verified by me before accepting: the bridge sprite is 24 x 32 px (5 px abutments, deck between) and the short variant is squashed to 20 px; the Campaign terrain fingerprint (`SF.terrainPrints`) hashes only `terrainType`, so it cannot see changes to colours, features, houses or trees; my phase-1 boss override replaced the whole trigger expression including the screen-height term. The rest is the reviewer's evidence; each step below re-checks what it touches.

Changes to the design:

1. **Boss trigger:** the sortie stores `bossAt = len + 5`; `directorInner` adds the Campaign's `ceil(XH / CH)` term itself (device-dependent, never stored in the sortie, so resume stays device-independent).
2. **Info objects:** sortie chunks get the **full `predictInfo` shape** (`b, th, q, river: false, rw: 7, island: null, lake: null, rails, rail`), memoised on the sortie object. Sea, secret and every legacy-ground template carry **no `e`** and take the unchanged path. The new river lives in `I.e.river`, never in `I.river` (the legacy river code assumes `riverY`).
3. **No recursion:** `classify`'s body is split into `classifyLegacy`; the `I.e` branch runs after `CL` is reset. `colorE` sets `engSat` like `pixelColor` does.
4. **Title after a level:** `classifyE`/`colorE` take the sortie from `I.e`, not `run.sortie`, and `toTitle` drops the chunks when it clears a sortie.
5. **River and bridges:** no `5 sin(0.07 wx)` term; the river is flattened within 20 px of each bridge; a new **long bridge** variant (`squash(SPR.bridge, 38)` and its broken version) chosen by `e.long` in the bridge's look and death (the Campaign never sets it); bridge terrain covers the full road width and convoy lanes.
6. **Island:** snapped to **one grid cell** (about 84 x 60, centre at `ci * 56 + 32, ri * 48 + 28`) so a whole church or square cell fits; the main road does not cross it. Bridges: **one pair** to the island (north and south channel) on a grid street, plus **one or two full-river crossings** (the main road and one street). "Up to three pairs" was impossible.
7. **Buildings never touch water:** `cityBldAt` returns null for a building whose rectangle meets the river band; the river edges are precomputed per column (`riverTop[wx]`, `riverBot[wx]`), with bank noise depending on `wx` only.
8. **Placement guards (sortie runs only):** spires and blocks need a built cell and no river; `avenueTrees` need dry ground; `convoy`, `march`, `lightVehicle` refuse water; garden houses are drawn as cell pixels **or** as `houseAt` sprites, not both (decision: sprites, so `chunkHouses`, `critterHouse` and `worldDamage` keep working); the city spawn lists also accept `field` and `grass` in sortie runs.
9. **Mapping written out:** farmland, village -> `country`; suburb, town, river, centre, ruins -> `city`; industrial, station -> `factory`. **The template decides how a cell is drawn; `U` only changes density inside it.** `U` across the industrial and station segments is defined as the value of the city segment before them.
10. **Seams:** road width and style become a function of `U` (the 12 px country road widens into the 28 px boulevard over a few chunks); open city cells use the same `fieldColor` as farmland; the river is tested **before** the template dispatch, so it is never cut along the warped chunk line.
11. **Villages:** inside a village cluster the `vnoise` gate of `houseOK` is bypassed and houses go into road-relative slots.
12. **Pacing:** `u`, `flakBarrels`, the subs check, the wing (`14 * STAGE_LEN`) and the artifact position all scale by `arcLen / 48`. `len` must stay below about 85 chunks (`finalStartY` scans 90).
13. **Safety net first:** a **Campaign pixel hash** of finished chunks (features included) for all six stages, so changes to shared functions (`drawFeatures`, `pixelColor`, `cityBldAt`) are caught.
14. **Performance budget per template:** city chunks p95 at most 1.15 x the legacy city chunk; legacy grounds within 5 percent; the bench covers chunks 0 to `len + 5`, split into pixel pass and features. The reviewer measured today: city 33.5 ms mean (49 max) per chunk for the pixel pass, country 11.7, factory and secret 9.6; `drawFeatures` under 1 ms. Cell state goes in a typed array per sortie (not a `Map`); open and garden cells skip the facade and shadow lookups.
15. **Determinism:** fires are chosen per chunk by hash and `D` (not per screen); houses are registered in a deterministic first pass. Level 6 is checked by **identity** (fresh page vs after a Campaign run vs after resume, same chunk pixel hash) rather than a golden file that would change with every look tweak.
16. Minor: scar density formula fixed (farmland keeps the Campaign's 15 percent; city cells get scars only on yard, rubble and street); the new river gets ducks and flow lines later.

**Step order** (each step ends with a contact sheet, `replay.mjs`, `enigma.mjs` and the bench):
1. Safety net: Campaign pixel-hash golden; bench over the whole level split by template and pass; level-6 identity check.
2. Plumbing, no new pixels: full infos with the legacy ground for every template, `bossAt` plus the screen term, arc scaling, secret from `len`, the `toTitle` reset. A bot run must reach the duel and the picker.
3. City cell state and `U`: built / garden / open, the lane rule, road style by `U`, gates for props, avenue trees, trees and spawn lists.
4. Villages: road-relative clusters.
5. River and bridges: column arrays, quays, building clipping, long bridge, the sortie bridge spawner, convoy guards; then the island and its bridge pair.
6. Damage: scars, fires and ruins by `D`.

## 16. The settlement generator and the city lab (replaces the grid city of 15.3 to 15.5)

The owner judged the grid-based city of phase 2 unrealistic (too many churches, the avenue cutting through blocks, edges along chunk lines cutting houses, overlapping houses). The city is rebuilt as a **settlement generator** that is reusable for every level and for generative mode: `tools/citygen.js` (pure, deterministic, no DOM), with a lab page `tools/citylab.html` (published as a private artifact) and a Node test `tests/citygen.mjs`.

**Method** (best practice from procedural city work): streets first, buildings second; constraints first; density from a centre; landmarks by quota; nothing overlaps by construction (an occupancy raster); one random stream per kind of decision. Pipeline: urbanisation and damage fields (with lateral fray from the main road) -> streets (main road as arterial and tank route, horizontal cross streets with staggered crossroads outside the centre, collectors and local streets parallel to the main road, every street ending in a T-junction) -> landmarks (market square at the densest point, the big church facing it, parish churches spaced at least 560 px, parks) -> frontage plots along every street in order of importance (detached houses with front and back gardens, terraces, closed perimeter blocks; rows share roof material and depth and their roofs join; vacant lots left on purpose; a second pass closes gaps and corners) -> interiors (courtyards with sheds, back gardens, meadow; fields outside the town) -> trees, damage (shell holes in roofs, ruins, fires, craters, never on carriageways) and **slots** for the game's guns: flak on lots and flat roofs (sandbagged roof platforms), artillery on large lots next to tank streets and in courtyards, AA towers on the square and in parks.

**Gameplay contract:** tank routes are carriageways at least 10 px wide (main road, collectors, collector cross streets), all connected to the main road (checked). Slots are spaced (44 px flak, 72 px artillery) with a quota per 300 px rising with U. The plan answers `CityGen.typeAt(plan, x, y)` in the game's terrain-type vocabulary.

**Performance (measured):** plan about 30 ms median per 1800 px town in Node (built once per level); painting about 2.3 ms per 224 x 64 chunk in the browser (the legacy city chunk costs about 33 ms). 800 plans (4 density curves x 2 damage levels x 100 seeds) all pass the hard rules.

**Next:** tune the look in the lab with the owner (new building and street assets are allowed), then presets (village, old town with a radial core, river town with island and bridges, harbour front, industrial estate), then the integration into level 6 (the plan as the sortie's settlement layer, chunks painted from it, the director placing guns in the slots).

**Village edge (owner feedback: gardens lay on top of fields).** The gardens of one street side now end together on a back line that follows the street; where gardens meet the fields, about two thirds of the 56 px stretches get an orchard belt (6 to 14 px of fruit trees on mown meadow, straight-edged) and the rest a hedge; a fence separates gardens from the orchard. Fields are no longer a fixed grid: they are long strips running away from the main road, in blocks of 3 to 6 strips with hedges between the blocks (a strip field system), so field edges follow the village.

**Field parcels (owner feedback: mix strip directions, no mini strips).** Fields are parcels inside field blocks (bands at a distance from the main road, in groups of rows, hedged). Near the village the strips run away from the road; about half of the far blocks have strips parallel to the road instead. A parcel smaller than 170 px or thinner than 6 px is merged into the neighbour it shares the most border with (preferring its own block), or becomes meadow, so no slivers remain. The generator now times each stage (`plan.stage`, shown in the lab): about 40 to 50 ms per town in Node, the orchard and parcel stages being the largest after the region fill.

**Destruction and fire (owner feedback: different kinds of destroyed houses, more convincing fires).** Four kinds of destruction: a shell hole (rafters across the opening, scorched tiles), half collapsed (one end of the roof fallen in along a jagged break, debris and broken rafters inside), a gutted shell (walls standing, charred floor, rubble heaps, the stub of an inner wall, fallen beams) and collapsed (a shaded mound with roof-tile shards and a chimney stub, spilling into yards and gardens but never onto a street). Damage comes in clusters; even at full damage the houses are a mix (about 10 intact, 15 holed, 20 half collapsed, 25 gutted, 30 collapsed in 100); churches only lose part of a roof. Soot darkens the ground around gutted and burning houses. Fires break through at one to three hot spots with a small white core, lick past the roof leaning with the wind, glow on their surroundings, throw embers and send up a dithered smoke column (dark at the source, lighter grey downwind). `CityGen.paintFx` animates a fire inside its own small box (`CityGen.fireBox`); the lab animates every fire about 12 times a second, which is the per-frame cost the game would pay for the fires on screen.

**River town preset (`preset: 'river'`).** The river is planned before the streets: 28 px wide, gently curving, across the town at the denser end, with stone quays (wall face above the water) and riverside streets on both banks in town, natural banks (mud, reeds, willows) outside. A long, slim old-town island sits on the main road with channels of about 11 px; the main road crosses onto it on one bridge and off it on another, and houses ring the island facing the water. Cross streets are not generated in the river band; the riverside streets take their place in the cross-street lists, so every street parallel to the main road ends on them, and exactly one more street (a collector, or the outer street past the island's tip) crosses the whole river on a bridge, clear of the island (54 in 60 towns get it). Bridges are decks with a stone balustrade, piers and a shadow on the water; they are tank routes, and the checks require at least two bridges and the island reachable by tanks. Bridgeheads get bunker slots; barges are moored at the quays. Ground kinds added: river, bridge, quay, bank (game types river, bridge, street, sand). 200 river towns (100 seeds, with and without damage) pass all rules, 2.93 bridges per town on average; plan time about the town core's once warmed up.

**Quarters (owner feedback: the town bends with the main road, every block looks like a copy).** A town now grows in quarters of 220 to 420 px, each with its own street pattern, so blocks differ and the seams between quarters give skewed junctions and wedge-shaped blocks:
- *Field lanes* (suburb, U below 0.6): the lanes lie on the edges between the old field strips, straight and square to the main road, and run on into the fields as farm tracks (two dirt ruts with grass between them; new ground kind `track`, game type `field`). The strips beyond a lane line up with it.
- *Planned grid* (65 percent of the other quarters): straight cross streets tilted 6 to 13 degrees against the main road (the lab allows up to 22), crossing it as one line, and straight streets along it with a slight lean that ignore its bends, so the blocks between change depth. Houses step along a tilted street, each facing it.
- *Follows the main road* (the old pattern): streets keep their distance from the main road and follow its bends, but each cross street is a little askew, crossroads are staggered even in the centre, and the streets along the main road jog a little at each junction.
The quarter around the densest point (the market square, the old core) and the quarters at the river are never planned grids. On a tilted street the square reaches down to the street (the wedge is paved), churches front the street where it actually runs, a house keeps at most 6 px of front yard, and a house is only placed where the strip in front of it is still open. 100 seeds with every quarter a grid tilted 17 to 22 degrees pass all hard rules for both presets; plan time unchanged (about 35 to 45 ms).

**Round 2 of owner feedback (no markings, tilts, rivers).** The main road has no markings any more (tested: no marking pixels are painted). Grid tilt is a generator variable (`gridTilt` [min, max], `gridTiltBias`): from about 1 degree up to 18, drawn so that most planned grids lean only a little and steep ones are rare. Rivers are a list (`P.rivers`); the new **Two rivers** preset adds a narrower tributary without an island further along, with its own riverside streets, bridges and barges; the checks require two bridges over an island river and at least one over any other. No bomb craters fall in rivers, on bridges or on quays. `CityGen.riverFx(plan, t)` gives the river's motion for any moment, as the game's `drawRiverFlow` does it: light streaks drifting with the current in four lanes (faster in the middle, each river flowing its own way) and glints that flash about four times a second; the lab animates them with the fires.

**Step 2: old town, round elements, public buildings.**
- *Old town (Altstadt):* an oval of 54 to 82 by 104 to 138 px around the densest point (or beside the river when one runs there), inside a 14 px **ring boulevard** where the town wall stood. The ring is a tank route in four arcs (two along y, two along x, so each is a plain street of the generator); streets keep their true width across slopes now. Outside, a **green belt** with a promenade follows the ring along two stretches. Inside, narrow winding lanes in light setts run from the main road to the ring, a few joined by lanes along the main road; the houses are narrow (5 to 8 px), gable to the lane, each with its own roof in many tile colours, as deep as the block allows. Cross streets do not cross the old town: next to it they start at the ring (radial streets), and none run near its ends; collectors stay clear of it. The market square, the **town hall** (a hollow building with a copper tower over its entrance, facing the square) and the main church (a parish-size church when the cathedral does not fit) share a zone beside the main road that the lanes leave free. No planned grids next to the old town.
- *Roundabout (Stern):* one per 1800 px, on the main road at a quarter seam, away from the old town and rivers: a 17 px carriageway ring round a lawn with a flower ring and a victory column with a gilded figure; a cross street leaves it on each side (it replaces any cross street too close) and four diagonal avenues run out from it at 29 to 37 degrees until the town ends.
- *Public buildings,* each on a whole block beside the main road where the town is dense: a **government building** around two courtyards (copper hip roofs, a dome over its entrance, a forecourt with a round fountain); a **domed hall** (theatre) on its own square, a ribbed copper dome with a lantern and a portico; a **department store** with a flat roof and rows of glass skylights (its roof is a flak slot). At the town's edge, a **gasworks**: a cinder yard on a cross street with two round gas holders in their guide frames and a small brick works building. Domes, gas holders and towers only take shell holes; the column takes none. Ground kind added: works yard (game type `yard`).
- In 100 default towns: an old town in 94, town hall 94, government building 64, domed hall 79, department store 92, gasworks 100, a roundabout in every one; all hard rules hold in all 1,400 test towns (tested in CI).
- *Performance:* with step 2 the generator function grew past the size V8 will optimise, and plan time tripled; the heavy raster stages (cross streets, old town, belt, interiors, orchards, fields, trees, slots) now run as their own small functions, which the engine optimises, and a plan takes about 45 ms again.

**Industry on the river and the railway.**
- *Harbour district* (river presets, in 95 of 100 river towns): on one bank, from the strip's edge inward (up to 130 px, clear of the main road with a row of blocks between, and of the island), 52 px deep behind a quay wall. A basin 20 x 32 px is cut into the bank with a quay round it; warehouses stand along both sides of the basin; cranes on the quays swing their yellow lattice jibs over the water; where there is room, a works hall with a sawtooth roof (rows of north lights) and a brick chimney trailing a thin plume of smoke; a harbour railway runs along the land side. The riverside street on that bank bends round the district's land side and serves it to the strip's edge; other streets end at it. The basin's water is still (no current streaks).
- *Railway* (every preset; a station in 100 of 100 towns and river towns, 73 of 100 two-river towns): a single line comes in from the side of the strip, runs along the town's edge (12 to 18 px from it) and curves off again; it keeps clear of rivers, the old town and a harbour on its side, curving away at least 125 px before them. At the station, three more tracks fan out over 28 px at each end; an island platform and a side platform lie between them, under a glass train shed on iron ribs (the tracks show through the glass). The station building with a copper clock tower faces the station square, which the station street reaches from the main road; a goods shed with a loading ramp stands on the goods siding, and a round water tower beside the yard. Cross streets end at the station (level crossings elsewhere: the rails run through the road). Ground kind added: railway (game type `rail`); the generator keeps a railway mask (`plan.RM`: ballast, rails, sleepers) under level crossings and the shed. Works yards (harbour, station, gasworks) get flak slot candidates.
- The checks: no rail over water, none under a building other than the train shed, every hard rule in all test towns. Plan time about 40 ms (the new stages run as their own functions as well).

**Village preset and industrial estates.**
- *Village* (`preset: 'village'`, 1200 px): an Angerdorf. The main road splits into two 10 px lanes (a tank route) round a lens-shaped **village green** of 56 to 80 by 124 to 180 px with the church and its churchyard, a pond with reeds and lime trees; nothing else is built on the green. Along the roads stand **courtyard farmsteads** (about 44 per village): the farmhouse gable to the street, a stable along one side and a barn across the back (tile or straw thatch) round a farmyard; detached houses between them. Fields all round with farm tracks, orchards at the village edge, no old town, public buildings, railway or industry; light damage.
- *Industrial quarters* (a new quarter style, in about one town in five, and most quarters of the new **Industrial estate** preset): wide, straight service roads (collector width, tank routes), long blocks. Along them only industrial plots on fenced cinder yards: a factory hall with a sawtooth roof and an office, a flat-roofed warehouse, an oil tank farm (two to four round tanks), works with a brick chimney, or a coal yard with heaps and a shed; between the plots rough waste ground. No public buildings or parks there. The Industrial estate preset adds a **power station** on a large block (in 99 of 100): turbine hall towards the street, boiler house, two tall smoking chimneys, two cooling towers with steam drifting downwind, coal heaps; workers' terraces fill the other quarters, with the station and the gasworks.
- In the lab, choosing a preset sets the length, density ("the preset's own density"), damage and street sliders from it. 400 villages and industrial estates (100 seeds, two damage levels each) pass all hard rules.

**Quality round (owner feedback: churches among the works, the village road not joining the green, a crossroads village).**
- No parish church stands in or at the edge of an industrial quarter (tested on 100 industrial estates).
- The village green is now a lens on the main road itself: the road forks into two lanes that leave it and rejoin it at the green's tips, wherever the road curves (before, the green's oval had a fixed centre and the curving road met its ring off to one side).
- *Crossroads village* (`preset: 'crossroads'`): a second main road (a 10 px tank route) crosses the whole strip at the densest point, gently curving, and the village grows along both roads. Its centre at the crossing: a square in one corner with a big lime tree and a well, the church facing the crossing road in another, the inn on a third corner or a little along the road (in about two villages of three). Courtyard farmsteads along both roads (about 46 per village). 200 crossroads villages pass all rules; all have the square and the church.
- Also from the check: waste ground stays inside industrial quarters (fields beyond their edge, as anywhere); of the round buildings only an oil tank can burn; the lab's route overlay leaves a gap where the main road gives way to the green; the lab offers the crossroads village.

**Railway rebuilt for the game's trains (owner feedback: two connected tracks at the station, a line crossing to the other side, rail bridges, room for the existing trains).** The game's trains (`loco`, `boxcar`, `flatcar`) are 16 px wide, run only straight north and south on rails 5 px apart (drawn at -3 and +2 from the track's x; the campaign's line is at x 18) and are up to about 200 px long (a locomotive and five cars 30 px apart).
- *Main line:* straight along one edge of the strip (x 18 or 205) for the whole length, never curving away, crossing every river on a **rail bridge** (an iron truss each side of a deck with sleepers, its shadow on the water). Rails, sleepers and ballast as the game draws them, and an 8 px **clear corridor** either side of the track (a grassy verge), so a train never overlaps a house or a tree.
- *Station:* two platform tracks 22 px apart (room for two trains side by side, 6 px between them), the second fanning out of the main line over 28 px; an island platform between them and a side platform by the station building, all under the glass train shed; the station building, its clock tower and square, the goods shed with its loading ramp and the water tower as before, moved out for the wider track layout.
- *Second line:* the second platform track leaves the station as a branch that curves across the town (over 280 to 340 px, with level crossings over the streets and the main road, and a rail bridge where it crosses a river, never at the main road's bridge) to the strip's other edge, and runs on straight along it, to a buffer stop before anything in its way. It takes the direction with the longer straight run; roundabouts keep clear of its curve.
- `plan.trainRuns` lists the straight stretches where trains can run (`{ x, y0, y1, line }`: the main line always, the branch's straight part when it is at least 240 px long). Validation counts anything built within 8 px of a run (other than the train shed) and any tree crown over it (`trainBlocked`, part of every pass). The lab draws the runs with the tank routes and shows whether they are clear.
- The railway's edge is chosen before the harbour: the harbour takes the edge the railway does not need, or the railway's edge clear of its corridor (then the line runs along the harbour's outer side), and the old town leaves one edge free for the line. In 200 towns: a full-length main line in every one, a station in 86 of 100 towns and 74 of 100 river towns, a second line in 138 (a straight train run on it in 57), rail bridges in every river town, every run clear; harbours in 63 of 100 river towns (95 before; the railway now has priority at the edges).

**Port city preset (`preset: 'port'`): a city on the sea with a huge harbour.** The sea runs along one side of the strip (a third of its width), its coastline gently curving, straight along the quay where the harbour is; the main road runs inland. A **waterfront street** (a tank route) runs along the shore while in town, behind a sandy **beach** with surf (a sea wall where the town is dense), and cross streets end at it. The **harbour** takes a third of the town's length or more: two **breakwaters** (an L from the shore at the near end, running parallel to the quay, a short arm at the far end) enclose calm water, each with a **lighthouse** on its head and a coastal gun slot; seven or eight **finger piers** reach into it with sheds and cranes, **freighters, tankers and coasters** moored in the basins between them (about 16 ships per port, damaged ones where the town is hit); a **U-boat bunker** astride the quay (a thick concrete roof, four pens open to the water, a submarine at one, a flak slot on its roof); a **shipyard** with ships under construction on the slipways and gantry cranes; on the 30 px quayside warehouses, cranes at the quay's edge and the **harbour railway**: the station's second line curves down to it (in 91 of 100 ports, with a straight train run in most). Ships ride at anchor outside the breakwater. The sea is deeper away from the shore with long swells; the animation adds glints on the open sea and surf running up the beach. The railway's main line takes the land edge; a smaller old town (in about half the ports) fits between it and the waterfront. Ground kinds added: sea and beach (game types `sea`, `sand`). 200 ports (two damage levels) pass every hard rule.

**Horizontal harbour first (owner feedback: a horizontal harbour, possibly combined with a side harbour; the side harbour needs room for ships to pass).** The coast has three forms (`P.coast.mode`):
- *End* (horizontal): the town ends at a straight quay across the strip at 80 percent of its length and the sea lies beyond, so the level ends over water. The main road and the railway's main line end at the **end waterfront street** that runs along the quayside (a tank route; the streets along the main road end on it). Finger piers reach north from the quay with their sheds and cranes, ships moored lengthwise along them (they read best when scrolling), a channel 28 px wide beyond the pier heads with a ship under way, then a breakwater across the strip with an entrance between two lighthouses. The U-boat bunker sits astride the quay at the land-side end with its pens open to the north and a submarine at one; a shipyard with three slipways and gantry cranes at the other end; warehouses, quay-edge cranes and the harbour railway (along the quayside) behind; ships at anchor beyond the breakwater.
- *Corner*: the side coast swings in from the strip's edge in the last stretch before the end quay; its side harbour opens into the end harbour (its breakwater joins the end breakwater) and the station's branch line comes down to its quayside.
- *Side*: the side harbour alone (the **Coastal city** preset).
- In every side harbour the piers are short enough to leave a **channel of at least 28 px** between their heads and the breakwater (room for a 10 px ship to pass, with a coaster under way in it).
- The **Port city** preset now picks end or corner (46 and 54 in 100); 200 ports and 200 coastal cities (two damage levels) pass every hard rule, each with two lighthouses and a U-boat bunker, about 5 piers and 13 ships per port (8 and 18 in a coastal city).

**Room for the game's warships, and the south port (owner feedback).** The game's warships sail straight north (or south) on the water: a destroyer is 28 px wide and 80 long, a submarine 12 by 46, the flagship (the battleship boss) 80 by 232 in the middle of the strip. Every harbour now keeps a straight **fairway** clear from its quay out to the open sea (`plan.shipLanes`: `{ x, w, y0, y1, kind }`):
- in the end harbour 40 px wide, through a 40 px entrance in the breakwater between the lighthouses. In the 'end' form it runs right beside the U-boat bunker with the piers beyond it; in the 'corner' form the entrance lines up with the side channel, so a ship sails straight on.
- in a side harbour the channel between the pier heads and the breakwater is 41 px: a 30 px fairway beside the pier heads (a destroyer passes), a coaster under way along the breakwater, the submarine waiting by the bunker. The far arm only covers the pier heads, so the channel is open at that end. The piers there are shorter (about 22 px, coasters moored along them).
- Beyond the end breakwater a **fleet area** of 96 px (x 64 to 159) by at least 240 px stays open for the flagship (`plan.fleetArea`); ships at anchor lie at the strip's edges.

Validation counts any pixel in a fairway or the fleet area that is not open water or that a moored or passing ship covers (`lanesBlocked`, part of every pass). The lab draws the fairways and the fleet area with the tank and train routes.

The **south port** (`preset: 'portSouth'`) mirrors the port along the strip: the level begins over the sea, and the town starts at a quay at 20 percent of its length. The breakwater, fairway and fleet area lie south of the quay, the main road and the railway's main line begin at the end waterfront street, and the density is highest near the harbour. It comes as an end or a corner harbour, the side coast swinging out again after its side harbour. The tank-route check now starts from the lowest row the tank routes reach, since the strip may begin over water. 600 ports (port, south port, coastal city; two damage levels) pass every rule.

The **beach landing** (`preset: 'beach'`, 1600 px) begins over the sea, the flagship's fleet area open before the beach. A curving natural shoreline (`coast.ycol`, one row per column) runs into a beach 52 to 64 px deep and 28 px of dunes, with a coastal road behind them; two or three exits lead from the road down onto the sand. On the beach:

- hedgehogs in the shallows and on the wet sand, a row of mined stakes above them, barbed wire along the top of the beach that opens at the exits;
- each exit closed by anti-tank walls either side of the road with dragon's teeth in front, and a casemate either side;
- between the exits a bunker line in the dunes: casemates with their embrasures and guns facing the sea, round pillboxes and Tobruk pits, spaced 14 to 21 px with room to their neighbours (about six per beach, at least four), joined by a zigzag trench;
- wrecked landing craft at the waterline, shell craters on the sand;
- behind the road a coastal battery of three or four big casemates with a trench and a radar dish;
- inland, bocage: small fields edged with hedgerows, and a village.

Bunkers become the game's `bunker` slots and the battery its `arty` slots (`plan.beachSlots`, taken before the quota). Concrete takes only shell holes and is drawn with a bare low wall, with no windows.

### 16.x Level 6 in the game (integration, first step)

Enigma Run level 6 now takes its ground from one settlement plan. The game carries a copy of `tools/citygen.js` in `index.html` (`cityGenSrc`, refreshed by `node scripts/embed-citygen.mjs`; `tests/citygen.mjs` fails while it is old), so players still get one file.

- **The plan** (`sortiePlan(S)`): built once per sortie and stage base. It is the `river` preset, `L` = 66 chunks (4224 px) from the start of the farmland to the level's end. The sortie's U and D give the density and damage curves (each segment's value at its middle); the river sits at the middle of the river segment; farmsteads are on (0.4). Two new generator parameters: `road0` (the main road starts at the legacy road's x and blends into its own curve over 200 rows) and `railSide` (the edge the main line prefers). The seed comes from the sortie's random stream. Plan time is about 0.2 s warm and 0.5 s cold in Node, paid when the level starts.
- **Rows:** plan row y is world row `S.planY0 - y`, row 0 being the bottom row of the first farmland chunk. Plan chunks are aligned with game chunks.
- **What the plan drives:**
  - `roadX` returns the plan's main road inside the plan, blending back to the legacy road over 200 px after it.
  - `classify` returns `CityGen.typeAt` (no chunk-edge wobble inside the plan).
  - `sortieInfo` marks plan chunks (`I.plan`, no legacy rails; theme 5 has none before the plan either).
  - `workChunk` paints plan chunks with `CityGen.paint` in bands of at least 16 rows; the result is identical to painting the whole chunk.
  - `drawFeatures` draws nothing legacy on plan chunks.
- **Guns:** the director's city and factory branches take the plan's slots first. Each slot is used once, when it is just above the screen: flak (or artillery when unlocked) for flak and arty slots, AA towers for aatower slots, bunkers for bunker slots. Otherwise they fall back to the old random placement. A bot flight used 11 of 35 slots.
- **Speed (this machine, ms per chunk):**
  - farmland to river: 3 to 4.5 ms;
  - centre, industry and ruins: 10 to 18 ms (p95 37 ms in the industrial stretch, now spread over frames by the bands);
  - level 6 overall: 12.3 ms mean, against 20.8 ms before.
- **Tests:** `tests/enigma.mjs` checks that the plan passes the hard rules and covers the level; that the road is the plan's (entry gap 0); that the ground types are the plan's; that the chunk pixels are the plan's, whole and in bands; that slots get used on a bot flight; and the determinism and hygiene checks as before. `tests/contact.mjs OUT 6 c4,69` puts the screen's bottom at chosen chunks, for looking at seams.

**Level 6, second step (station, works, perimeter, motion):**
- **By segment:**
  - `stationAt` keeps the station in a share of the length; level 6 uses the `station_main` segment, ending 170 px before the plan's end. With a station stretch, the main road swings to the middle there (room either side), and the railway takes the edge with more room.
  - `industryAt` makes every quarter in its share works, and none elsewhere; level 6 uses `industrial_power`, with the power station on.
  - In 60 seeds the station was in its stretch every time, with no works outside theirs.
- **The airfield's perimeter** (`perimeter`: 64 rows). The town is generated 64 rows shorter, its shares of the length scaled to match, then the last chunk is added after it:
  - a perimeter road along the town's end (a tank route joined to the main road);
  - the fence, a grass verge, and the concrete apron (`K.APRON`, game type `apron`, the final airfield's own concrete look);
  - the main road through a gate between two guard houses;
  - every track running on over the perimeter road to a buffer stop before the fence.
  The final airfield then carries straight on from the apron.
- **Moving parts in the game** (`drawPlanFx`, drawn after the chunks, drawing only):
  - river streaks and glints from `CityGen.riverFx`;
  - flames from `CityGen.paintFx`, each fire in its own small canvas, repainted every 3 frames (6 with low effects), staggered across frames;
  - cost over the densest stretch: 27 fires, 1.75 ms mean, 2.7 ms p95.
- **Guns:** in plan chunks, any city or factory ground-gun spawn first fills a gun slot of the plan that is coming up. A bot flight used 16 of 38 slots.
- **Tests:** the whole-level sweep in `tests/citygen.mjs` (30 seeds: rules, station stretch, works, perimeter, buffer stops); in `tests/enigma.mjs`, the moving parts and the perimeter.

**Next for level 6:**
- Trains on the plan's `trainRuns`, boats on the river.
- Route objects for road traffic (deferred, see 13a).
- Phone timing of the plan build; a Worker if it stalls.
- The phase 2b grid-city code (`cellKind`, `villageList`, `roadHalf` for the sortie) is now unused by level 6 and can go once the plan path settles.

**Submarine berth (owner feedback: no painted submarine in the harbour; place one of the game's own submarines).** The generator no longer paints a U-boat beside the U-boat bunker. Instead it finds a berth for the game's submarine (12 x 46 px, upright) and emits it as a `sub` slot (`plan.subSlots`, also in `plan.slots`, kept apart only from other submarines). The berth is on harbour water, with a pixel of water either side; bow and stern may touch. It is chosen in this order:
1. at the pens (at most 8 px from the bunker), clear of the fairways and moored ships;
2. at the pens, reaching into a fairway (the submarine is an enemy, not traffic);
3. at the pens, where a moored ship moves off;
4. the nearest berth further off.

In 100 seeds every port, south port and coastal city has its berth: all coastal cities and 73 of 100 ports at the pens, the rest within 20 px (where only 43 rows of water separate the pens from the breakwater). In the game, `slotGun` puts the game's submarine there (`G('sub')`, submerged at first, as at sea) when a sub slot comes up and fewer than two are about. The lab draws the berth to scale.

### 16.y Level 6B, the harbour city (owner request: a new level 6 with a south and an east harbour)

A second level 6, shown as **6B** in the Enigma Run picker (internally sortie level 7, with `ENIGMA_LABEL` for the display). It flies the Campaign's stage 6: theme, music, the sky fortress boss, and the open-ended final airfield after the level. Level 6 is unchanged.

- **Sequence** (70 chunks): `open_sea` 5, `harbour_south` 14, `city_centre` 8, `city_town` 7, `industrial_power` 6, `ruins` 5, `station_main` 6. `harbour_south` has U 0.85, D 0.35 and plays as `city`.
- **One plan over the whole level**, from its first chunk (`sortiePlanHarbour`): the `portSouth` preset in its corner form with the sea to the east (new coast option `cs: +1`).
  - The end quay lies just past the sea segment.
  - The east side harbour runs along about 55 to 70 percent of the harbour segment and opens into the south harbour.
  - Then come the old town, the works (`industryAt`), the station (`stationAt`) and the airfield's perimeter in the last chunk.
  - The plan's open sea is repainted in the game's own sea colour (`openSeaColor`), so it meets the sea before the level without a seam. The harbour basins keep the plan's calmer water.
- **Submarine:** a berth by the U-boat bunker always gets the game's submarine as it comes up above the screen (`planBerths`, every frame, outside the director's pacing, which keeps the opening of a level free of ground units).
- **Fix found on the way:** the fire overlay's box (`fireBox`) now covers the whole glow and the 64 px smoke column, and craters cull at their rim. Before, painting a chunk in bands could differ slightly from painting it whole, and an on-screen fire's smoke could be cut off.
- **Tests (`tests/enigma.mjs`):**
  - the picker offers 6B (the practice picker does not);
  - the plan passes the hard rules and covers the level, beginning over sea;
  - corner harbour to the east, with piers and a submarine berth;
  - perimeter, with the station before it;
  - types and pixels from the plan;
  - the same ground after a resume;
  - a bot flight in which the submarine takes its berth, the boss comes, and the level returns to the picker on 6B.

**Harbour water (owner feedback: make it match the ocean).** `CityGen.paint` takes `opts.seaPix(x, y, harbour)`, the host's own water colour. The game passes `planSeaColor`: its own sea noise and palette, for the open sea and, calmer (weaker waves, a shade darker), for harbour basins. The plan's surf on the shore and everything drawn over the water (ships, cranes, lighthouses) stay as they are. This replaces the repaint of the open sea after painting, which would also have painted over ships lying in open water. The lab keeps the generator's own water.

**Open east harbour, tunnels (owner feedback on 6B).**
- **No breakwater:** the new coast option `openSide` leaves out the side harbour's breakwater (the long arm, the cross wall at its closed end, and in the side form the far arm and its lighthouses). Its calm harbour water reaches the strip's edge.
- **Warship lane:** the channel and the freed water become a `warships` lane (about 50 px, clear of the end breakwater; checked as a fairway, `lanesBlocked`). The coaster that passed along the breakwater is left out there.
- **Calm water fades out:** `calmWater` gives every open-sea pixel within 28 px of a basin a calmness 0..1 (`plan.calm`, two chamfer passes). `seaPix` gets it, so with no breakwater the calm water fades into the open sea.
- **Tunnels:** a port's harbour railway (the quayside track, or the station's branch in a port) ends at a tunnel portal (`plan.tunnels`): a stone face round a dark arch, and a low grassy mound over the tunnel, drawn only on open ground.
- **Owner question about the tower on the old breakwater:** it was the game's AA tower enemy, placed by the director on the breakwater (which counts as yard ground). With the wall gone that cannot happen there.

**Tunnel, revised (owner: sandy and stony, big enough for our trains).** The portal is a 28 x 7 px face of dressed sandstone (`TUN` palette) with a light arch ring round a 20 px round-topped mouth that darkens inward. The game's trains are 16 px wide. Over the tunnel lies a mound of sandy rock about 36 px across, with stones and a few grass tufts. A building beside the portal stays in front of it.

**Tunnel fit (owner: the opening was not in line with the hill and overlapped the street).** The quay track runs 8 px from the street, so the portal is now 22 px wide (an 18 px mouth, still 1 px clear of a 16 px train each side). It never draws over a carriageway or a building. The mound is symmetric about the track: each row is as wide as the open ground on both sides allows, and it ends where that drops below 4 px. The quay's warehouses stop 16 rows short of the harbour's end, so the last one is shortened and leaves open quay before the portal (at least 11 rows in 20 seeds).

**Bigger tunnel hill (owner).** The quayside track bends 6 px out to sea over its last 16 rows, past the shortened last warehouse. The portal then sits on the open ground at the harbour's end instead of 8 px from the street. The mound grows quickly from the portal to up to 36 px across and up to 24 rows long, rounding off at its far end. It stays symmetric about the track and clear of streets and buildings.

**Wider tunnel opening (owner: 3 px wider on both sides).** The mouth is now 24 px (round-topped) in a 28 x 7 px face. The side walls keep their thickness, and the mound and track are unchanged.

**Tunnel mouth, adjusted (owner: one pixel too wide on each side).** The mouth is now 22 px in the 28 px face, so each side wall is 1 px thicker toward the inside.

**Seam into the final airfield (owner: the transition did not look natural).** Two causes, both fixed:
- `classify` wobbles chunk edges for legacy ground, so the bottom rows of the first secret chunk took their ground from the plan chunk below it. That chunk's biome is `factory` (`station_main`), so they were painted as factory asphalt, a dark jagged band across the hangar. The wobble now never reaches into a plan chunk.
- The plan's apron was a shade lighter than the airfield. `CityGen.paint` takes `opts.apronPix`, and the game passes `secretApron`, the final airfield's own concrete formula (factored out of `secretColor`), so the apron and the airfield are one surface.

**The final airfield begins with a whole hangar (owner).** The final airfield's pattern (`secretType`, `secretColor`, `secretApron`, `finalAirfield`, and the sky fortress's landing pad) is laid on world rows every `SEC_P` (300) px. Where a level's own ground ends therefore decided where the first hangar was cut. In an Enigma Run level with its own ground, the pattern is shifted (`secOff`, `secM`) so that the airfield's first row is 10 px below a complete hangar's warning stripes. The Campaign keeps offset 0.

### 16.z Level 3, The Long Night (owner decisions after the plan and the mockup)

**Decisions.**
- **Night look, option C (hybrid):** the generator paints the night (a moonlit grade, the blackout, baked lights), the plan lists its lights, and the game adds moving light (fires, searchlights) in its own night pass. Over plan chunks the game's flat night layer (60 percent navy) is reduced to about a quarter so the ground is not darkened twice.
- **Sequence:** the marshalling yard moved to the end, right before the boss: `beach_fortified` 3, `industrial_power` 7, `farmland` 7, `city_small` 4, `airbase_searchlight` 6, `forest_deciduous` 5, `industrial_light` 6, `rail_corridor` 6, `station_marshalling` 7 (58 chunks: 3, 8, 8, 5, 7, 6, 7, 7, 7).
- **Marshalling yard:** gentle points (ladders at about 1 in 3.3, not a steep fan), several ladders staggered left and right, a crossover pair in the middle, tracks 19 px apart. The yard gathers into the arena's rails (the main line at x 18, the supergun's pair at x 93 and 131), and two more tracks (x 55 and 169) run on into the boss arena. A siding between the pair ends at a buffer stop short of the supergun (x 112).
- **Live trains:** the game's own trains run in the yard on clear sidings and through lines, and **also on the extra arena tracks during the boss fight** (Enigma Run only; the Campaign's arena is unchanged).
- **Mist:** a weather-plan effect (section 8), drawn under bullets, enemies and the player.
- **Route objects** for road traffic: build them with this level's roads.
- Mockup: the published page "The Long Night Mockup" (day and night per segment, real generator ground where it exists, hand-built panels for the new ground).

**Night paint (`CityGen.paint` with `opts.night`).** Everything painted before the fires is graded per pixel: luminance l, colour pulled 60 percent toward l, then r x 0.42 + 6, g x 0.48 + 9, b x 0.66 + 24. The facade windows the day paint lights are blacked out. Then the plan's lights (`CityGen.nightLights(plan)`, built once per plan) are added: about one house in ten has one lit facade window (blocks, public buildings and stations up to three) with a small warm glow; about 45 percent of sawtooth halls glow through their north lights (a night shift); chimneys glow; cooling-tower steam is lit orange from below; every fire lights a circle of its size plus 16 px. Fires are drawn after the grade at full brightness, and their smoke is graded like the ground (also in `paintFx(..., night)`). Every light comes from plan data, never from pixels, so a chunk painted in bands equals one painted whole (checked). Cost, warm, in Node: about 0.4 to 1.9 ms more per chunk than by day. The city lab has a Night switch; the lab's river streaks are drawn faint at night.

**New ground in the generator (all new options; existing presets unchanged, checked by `tests/citygen.mjs`).**
- *Rail corridor and marshalling yard* (`params.railCorridor: { at }`, `params.yard: { at }`): the pair of lines at offsets 93 and 131 from the rail edge (the supergun's rails) leaves the main line on two curves of about 1 in 3.5 (520 and 370 rows) and runs on straight to the plan's end. In the yard, ladders at 1 in 3.3 fan the pair out to eight tracks 19 px apart (36 to 169): the near-left ladder opens first, the near-right about 60 rows later, a crossover pair in the middle, ladders at the far end gather 36, 74 and 150 back in, and 55 and 169 run on with the pair into the arena. A siding between the pair (x 112) ends at a buffer stop short of the supergun. Cinder ground between the tracks (no grass verges), ending raggedly 24 to 44 rows before the plan's end so grass meets the arena's grass. About 35 painted wagons (box vans, coal wagons, tank wagons, some burnt) stand on the sidings only; signal posts with red and green lamps at the ladders and the exits, hooded yard lamps, a signal gantry over the corridor, a signal box, a wagon shed, a coaling stage and a water tower on the strip beside the road. `plan.trainRuns` gets the pair (from the end of the curves) and the two exit tracks, all clear of wagons; a final pass clears any tree from a run's 8 px corridor (hedgerow trees too).
- *Searchlight airbase* (`params.airbase: { at }`): new ground kinds TURF (mown airfield grass in stripes, game type `grass`), RUNWAY (tarmac, edge lines, centre dashes, threshold bars; `apron`) and BERM (earth banks; `mud`). A 32 px runway along the strip, a parallel taxiway with its links, the apron before two hangars, a control tower and two fuel tanks; on the rail side a dispersal lane with blast pens every 66 rows, a fighter or a bomber in each. Flarepath lamps every 14 rows on both runway edges.
- *Deciduous forest* (`params.forestAt`): new ground kind WOOD (`forest`), the forest floor; ragged ends; about 2,000 broad crowns of 3 to 6 px on a jittered grid (a few lighter birches and autumn-yellow beeches); a forest track from the main road to a clearing with a woodcutter's hut and log piles.
- *The road keeps to the far edge* over the yard, the corridor's junction and the airbase (`edgeW` per row). The station and its branch line stay clear of those stretches.
- *Several industry stretches* (`industryAt` takes a list of ranges), `powerAt` pins the power station to one of them, and `pylons: { to }` runs a power line on lattice pylons from the station across the land (pylons only on open ground, cables over everything, a red lamp on each at night).
- *Searchlight posts* (`params.searchlights`): a `search` slot on open ground at the airbase (four), in the forest clearing, beside the yard, on the beach's dunes (three), on squares and in parks, at least 70 px apart; two `flak` slots 14 px from each and a `gen` slot 26 to 50 px away. Spaced in their own groups (the posts' flak 16 px apart).
- *The level as one preset* (`longNight`, 3712 px): the beach preset with the railway on, its density and damage curves per segment (the town heavily damaged and burning), and all the options above at their segments' shares. 40 seeds pass every hard rule (each with the yard, the airbase, the forest, about 9 pylons, 7 searchlight posts and 14 fires); plan time about 130 ms median in Node. The lab offers it.
- Night lights added for the new ground: signal lamps, yard lamps, the signal box's and control tower's windows, the flarepath, the pylons' red lamps.

**Level 3 in the game.**
- *Sortie:* `gen: 3`, the boss 3 chunks into the arena (`bossAt`, `arcLen`), and `ENIGMA_ARENA[3]`: the ground after the level is the Campaign's `bossland` for theme 3 (the supergun's rails at 93 and 131 and the main line at 18) plus the yard's outer tracks 55 and 169 (`arenaRails`). Levels without an entry end on the final airfield as before. The beach segment's first chunk is `sea`, its second `coastUp`; the airbase plays as `base`, the forest as `forest`, light industry and the yard as `factory`, the corridor as `country`.
- *Plan:* `sortiePlanLevel3` builds the `longNight` preset from the level's first chunk with each segment's share taken from the sortie, the road starting at the legacy road.
- *Night:* plan chunks are painted with `opts.night`; the legacy chunks of a night level (the sea before it, the arena) get the same grade after their features are drawn (`CityGen.nightGrade`); the game's night layer is 0.25 instead of 0.6 over all of it. Animated fires use the night smoke.
- *Local night rule (spec 1.1 item 3), every Enigma Run level:* `nightLit(e)`: a flak gun's extra burst, the reload bonus while the player is caught in a beam and a tighter aim (x 0.6), and the AA tower's reload bonus, only within 70 px of a searchlight that is on (checked every 10 frames). The Campaign returns true at once, so its runs are unchanged (golden replay).
- *Searchlight posts:* `planPosts` mans a post as it comes up above the screen (outside the director's pacing, like the submarine berths): the light, the flak beside it and its generator, at most three lights about.
- *Trains:* on the plan's train runs (the main line, the corridor's pair, the yard's exit tracks) the director's `planTrain` (from level 2's work, 18.6) places them as for every level with its own ground. During the boss fight `planTrains` sends a diesel and two to four cars (some flak cars) down one of the arena's extra tracks, one train at a time, 5 to 9 s apart.
- *Route objects:* level 3 uses the shared ones (17.5, 18.6): the plan's tank streets along the strip are routes (`sortieRoutes`), its cross streets side roads (`sideRoutes`). The route objects this branch had built first (`planRoutes`, `routeConvoy`) were dropped in the merge with main.
- *Weather plan (spec 8), first effect:* `ENIGMA_WEATHER[3]` gives low mist by segment (farmland 0.6, forest 0.45), blended between segment middles (`weatherAt`); `drawMist` draws a drifting noise tile in four bands over the ground and under bullets, enemies and the player.
- *Mist clouds (owner: clouds see-through and in the mist's mood):* the weather plan's `clouds: 'mist'` (level 3) draws the low and high clouds as mist banks (`drawMistClouds`): each cloud shape stretched 1.8 times wide with a trailing second lobe, softened (drawn at a quarter size and scaled up smoothly, which works where canvas blur filters do not), tinted the mist's blue-grey (#8a98b4), low clouds at 34 percent, the faded high clouds at 16 percent, no cloud shadows. Drawing only; the clouds' movement and its random draws are unchanged.
- *Cloud types (owner: different cloud types in the generator):* `CityGen.cloud(kind, seed)` returns a pixel sprite `{ w, h, data, shadow }`, pure and deterministic, for six kinds (`CLOUD_KINDS`): **cumulus** (four to six puffs on a common flat base, the middle ones tallest, bright above, a grey base; 56 to 86 by 28 to 40 px), **scattered** (two or three small puffs), **stratus** (a long sheet broken up by noise, faint banding, 62 percent opaque; 120 to 180 px), **cirrus** (three to six thin streaks tapering at both ends and hooked at the tip, 42 percent), **mist** (a soft blue-grey bank, 36 percent) and **storm** (a dark heap with a tower and a flattened anvil; 96 to 140 by 52 to 72 px). The density field is a union of shapes roughened with value noise; the edge comes in three dithered steps of transparency; light from the top left. Solid kinds (cumulus, scattered, storm) carry a shadow mask. A level's weather plan picks its clouds: `clouds: { low: { kind: weight, ... }, high: kind }`; each low cloud keeps its type while it crosses (picked from its slot and where it entered); four sprites per type, made once (`genCloud`); solid types cast the usual soft shadow. Level 3: low mist 0.6 and stratus 0.4, high cirrus. This replaces the mist-cloud sprites of the previous round. The lab shows the types (Cloud types panel, following the Night switch). Tested in `tests/citygen.mjs`.
- *Power station site:* with `powerAt`, a site of 64 by 150 px is reserved on the roomier side of the main road before the streets (a zone), and the power station is built there. Before, it needed a block 46 px wide between two cross streets, and the works' collector streets left none in about one level in eight (no power station, so no pylon line). The beach battery's casemates stay clear of the main line's corridor when the beach has a railway. 100 seeds of the level: every hard rule, every part. `tests/citygen.mjs` now sweeps the level (30 seeds).
- *Merged with main (levels 1, 1A and 2):* the generator's new ground kinds were renumbered after main's (BERM 38, TURF 39, WOOD 40); the airbase uses main's RUNWAY kind and painter (`plan.airbase` carries `rx`, `rw`, `y0`, `y1`); `sortieInfo` takes main's arena rule (bossland after any level not on theme 5) with level 3's beach chunks and arena rails on top; `planPaintOpts`, `buildSortie`, `sortiePlan` and the director's per-frame hooks combine both sides.
- *Shared code touched (additive):* `buildSortie`'s `gen`/`bossAt`/`arcLen`/`ud` for level 3 and the `ENIGMA_ARENA` spread; `SORTIE_BIOME` entries; `sortieInfo`'s arena biome, beach chunks and arena rails; `sortiePlan`'s level 3 branch; `planPaintOpts` (`night`); `classify` (the Campaign's fixed runway band in `base` chunks skips plan chunks); the director's `base` branch (no fixed hangars on a plan's airbase, `apron` for its spawns); `convoy`, the tank and truck updates (routes); `drawNight`; `workChunk` (night grade of legacy chunks); flak and AA tower (`nightLit`). `tests/enigma.mjs`'s sortie check is table-driven now (`OWN`).
- *Tests:* a level 3 block in `tests/enigma.mjs` (see `tests/README.md`).
- *Speed (this machine, `tests/enigma.mjs --bench`):* level 3 chunks 16.0 ms mean, 30.9 ms p95, 34.7 ms max (its legacy ground was 12.3 / 17.3; level 6 has a p95 of about 37). Plan chunks are painted in bands over several frames. The forest and the burning town are the dearest stretches; trimming the per-chunk scans of trees and lights is the first lever if a phone stalls.

## 17. Level 1, Cross the Channel

Level 1 is built in steps, beginning with its opening. Its ground is still the Campaign's stage 1 (`gen: 0`). That ground opens with about 6.5 chunks of open sea, which covers the `carrier_start` and `open_sea` segments. The island chain, the large island, the forest, the forest airbase and the small harbour come in later steps (proposed plan: one settlement plan over the whole level, as for 6B).

### 17.1 The carrier start (first step)

The carrier is a **scene object drawn over the sea, not ground** (spec 5): `world.carrier`, null in every other run. `carrierStart()` sets it up when the sortie's first segment is `carrier_start`; `carrierTick()` runs it inside the director (the run's own random stream). The constants are in `CV`, in native units (scale 1 pixels, origin at the carrier's centre, bow up).

- **Picture:** 124 × 364 px at scale 1 (on a 408 px screen it reaches from near the top to the bottom edge). It shows a shadow on the water, a grey bow with anchors, and a planked flight deck with hazard stripes at both ends. On the deck: a dashed centre line, two bow catapults, the fore elevator up and the aft one lowered, arrester wires, and the raven clan's mark (a white raven in a red ring). Six gun sponsons line the deck's edges. The island on the starboard side has bridge windows, radar and a funnel that smokes. The picture is painted from pixel-snapped rectangles once per scale step (1/128) and cached, so it stays crisp while it shrinks. Drawn live on top: the parked planes (six behind the Feuervogel, one fewer per catapult launch), 16 crew running about, blinking red alarm lights, and stubs where guns were destroyed. Foam marks the bow wave, the hull sides and the wake behind the stern.
- **Timeline (frames, 60 per second):**
  - 0 to 50: the Feuervogel stands on the deck. The horn sounds.
  - 50 to 160: it rolls down the centre line and lifts off over the bow. On screen it rises from 0.86 H to 0.5 H while the deck runs down under it. The sea scrolls 0.15 px per frame faster than the carrier moves, as if the ship sails forward.
  - 160 to 200: it climbs on, slowing, and its shadow draws away. Then the player steers. `player.fly` counts the 200 frames, so steering, firing and invulnerability work as in the Campaign's fly-in.
  - From 160: the carrier slows to 0.25 px per frame down the screen and shrinks from 1 to 0.5 over 500 frames, about its centre, until its bow passes the bottom edge (about frame 700).
- **Pursuit:** for `CV.PURSUIT` = 1200 frames (20 s, inside the owner's 15 to 25 s) from lift-off. The first launch comes during the take-off.
  - A launch every 70 frames in the first 400, then every 95. Easy is 1.4 times slower; each loop is 10 frames faster.
  - At most 3 chasers at once (2 on Easy, plus the loop).
  - While the bow is on screen, a fighter (`cfighter`, not a target yet) waits at a catapult, rolls down it at the carrier's scale, climbs to full size over 30 frames, and becomes an ordinary `fighter` heading north. It homes on the player for 150 frames (`chase: true`) and does not dive-bomb.
  - Once the carrier is off screen, chasers come up from below the screen.
  - While the scene lasts, the director holds its own waves and ground spawns (and the pods until lift-off), and no boats spawn under the carrier. After it, pacing is the Campaign's.
- **Guns (`cgun`):** six deck guns on the sponsons, using the destroyer's gun turret at the carrier's scale. Each has 8 hp, is worth 400 points and fires flak once airborne. Destroyed, a gun leaves a stub on the deck. The hull is not an entity, so shots pass over it.
- **Campaign:** unchanged (`replay.mjs` matches `golden.json`, the six Campaign pixel hashes are unchanged). The only shared-code changes are a no-op guard on the boat spawn and the player's shadow offset, which is 12, 20 as before when not on a deck.
- **Tests:** a level 1 block in `tests/enigma.mjs` checks that the Campaign has no carrier, the deck start (scale 1, six guns, no steering), lift-off and launches, that a gun can be destroyed, the shrink to 0.5 and the slide-off, at least 8 launches and no ships during the scene, and that the director takes over afterwards. `tests/carrier-shots.mjs OUTDIR [frames]` films the scene for review by eye.
- **Open for the owner:** the timings above, the number of launches, and whether the raven mark and the deck colour suit the clan.

**Bigger carrier (owner: half again as big).** Three mockups were filmed with `tests/carrier-shots.mjs`, whose third argument sets the carrier constants (for example `K=1.5,END=0.5,PLANE=true`):
- **A (the default now):** `K` 1.5 and `END` 0.5. The carrier starts at 1.5 times its old size and shrinks to 0.75. The planes, guns and crew grow with it, and so does the Feuervogel while on the deck (`player.flyK`, back to 1 as it climbs away).
- **B:** `END` 1/3. Same start, but it shrinks to 0.5, the old end size.
- **C:** `PLANE: true`. A bigger ship, with the planes, guns and crew at their ordinary size, so the deck looks roomier.

To keep the bigger ship in view:
- the Feuervogel starts mid-deck (`V0` 40) and lifts off at 0.42 H;
- the ship's run-out after lift-off fades within about 12 frames;
- it drifts at 0.2 px per frame;
- it shrinks about a point 120 px forward of its centre (`PIV`), so the bow stays near its place.

It leaves the screen at about frame 1000 (the pursuit still ends at frame 1360). The aft elevator, the arrester wires and the six parked planes moved aft to make room.

**Owner's choice: mockup C** (`CV.PLANE: true`): the ship at 1.5 times its old size, its planes, guns and crew at their ordinary size.

### 17.2 Level 1's route on the legacy ground (second step)

The sortie has the owner's new sequence (section 10, revised). Until the islands are built, it is flown on the Campaign's stage 1 ground, in that order. A new sortie flag `seq` (level 1 only) makes `predictInfo` take the biome from the sortie (`sortieInfo`) without a settlement plan. `gen` stays level 6's, because the city code reads `S.gen` in many places.
- **Biomes:** the carrier, the open seas, `island_chain` and `island_airbase` are `sea`. The first chunk of `beach_fortified` is `coastUp` (the Campaign's coast with its anti-tank obstacles), the rest of it and the farmland and village are `country`, and the forest is `forest`. `coast_down` is `coastDown`, and after the level the ground stays `sea` (the flagship's arena). The theme is 0 throughout.
- **Rivers:** the farmland keeps the Campaign's rivers, from its third chunk on, with their bridges and river islands.
- **Pacing:** the boss triggers one chunk into the last open sea (`bossAt` = its start + 1 = 53), and `arcLen` is the same, so the director's arc runs over the level.
- **Tests:** `tests/enigma.mjs` checks the biome order and a bot flight in which the flagship comes over the sea and the level returns to the picker.

### 17.3 The islands preset (generator, for review in the city lab)

The owner's brief:
- The large island has the airbase, fields, a farmstead, a village, a pond and a tiny forest.
- The small islands have flak and turrets, sometimes a few houses, and a tiny farm with cows.

`CityGen.generate({ preset: 'islands' })` runs its own function, `islands()`. It returns a plan of the usual shape, so `paint`, `typeAt`, `validate` and the lab work unchanged. The default length is 1792 px: chunks 0 to 27 of level 1, up to the fortified beach.

**The chain** (`P.chain`, shares 0.36 to 0.56) holds 6 to 9 islets. Each is a rounded blob whose outline wanders by up to 23 percent.
- **Placement:** the islets keep open water between them and stay clear of a 44 px lane (`plan.shipLanes`, checked by `validate`) for the game's warships. The lane ends 50 px before the large island's jetty.
- **The largest islet is a farm:** a farmhouse and two barns round a yard, a fenced paddock for cows (`plan.pastures`; the game places its own cows there) and a small field.
- **The next one has houses:** a lane with up to five houses facing it, gardens behind, and a lighthouse on the shore in 60 percent of plans.
- **The third is always a gun islet:** a concrete pad with a `bunker` slot (the game's turret), a flak gun pit and sometimes a casemate.
- **The rest:** smaller islets are rocks (mostly rocky shore, a flak pit if there is room) or more gun islets, and medium ones sometimes houses. The chain always has a flak slot.
- **Shores:** beaches and rocks along every shore (new ground kind `ROCK`, game type `sand`; rockier on the gun islets and rocks). The sea foams on them (`plan.shore`: each sea pixel's distance to land).

**The large island** (`P.big`, 0.565 to 0.935, 186 px wide) is a long rounded body with two wandering shores. From the south:
- **A jetty** where the main road meets the shore, with a barge moored beside it.
- **The village:** the village preset generated on its own (290 px, a road on the island's axis), copied in and clipped to the shore. Anything that would reach the beach is left out whole: a farmstead with all its buildings, a church with all its parts, and a house that would lose the street it fronts. It keeps its green, church and pond in 100 of 100 plans.
- **Between the village and the airbase (72 px):**
  - a small wood on the roomier side of the road (a dark floor under trees 4 px apart);
  - on the other side, a pond with reeds and willows, a farmstead and a fenced cow paddock beside it;
  - hedged fields in what is left.
- **The airbase:**
  - a concrete runway along the strip (new ground kind `RUNWAY`, game type `concrete`), 218 to 255 px long, with edge lines, a dashed centre line, threshold bars and tyre marks;
  - a taxiway joined to it at both ends and in the middle;
  - an apron with two hangars, a control tower and a fuel dump of three tanks;
  - blast pens beside the runway (earth walls, `parked` slots);
  - gun pits (`flak` slots) and an AA tower slot by the apron;
  - the main road runs up to the apron.

**Tests** (`tests/citygen.mjs`, 100 seeds): every hard rule holds, and the same seed gives the same plan. Of 100 plans: a farm islet with a paddock 100, a paddock by the farmstead 100, houses on an islet 98, a turret and a flak slot in the chain 100, the village green 100, the wood 100, the pond 100, the jetty 100, a runway of at least 200 px 100, two hangars 100, blast pens 100. A plan takes about 50 ms.

**Not in the game yet.** The next step, after the owner's review, is level 1's plan from chunk 0 to the beach, as for 6B, plus:
- islet-aware sea spawns (ships only on open water);
- the slots filled by the director (turrets, flak, AA towers, parked planes);
- cows in the paddocks;
- the airbase played as the `base` biome.

**Larger islets (owner).** The chain now runs from 0.33 to 0.56 of the plan with 5 to 7 islets. Radii are set by `P.isleR`: 34 to 42 px for the two largest and 16 to 30 for the rest; the farm islet's radius is typically 37 px, against 25 to 32 before. Islets under 21 px are rocks or gun islets. An islet that will not fit gets smaller with each try, down to half size, so the chain is never empty. The warships' lane may lie anywhere from near the strip's edge to its middle, which leaves room for the big islets. The contents grow with them:
- the farm islet: a 22 x 15 paddock on large islets, and crop fields sized to the islet (never grass);
- the house islet: up to eight houses along the lane.

All 100 test seeds still pass every rule and every count.

## 18. Level 2, Sea of Sand

Level 2 flies the Campaign's stage 2: theme 2, the desert music, and the Sand Colossus (the land fortress) on the Campaign's own boss ground after the level (`bossland` with theme 2, open-ended). The level's own ground, 56 chunks, comes from one settlement plan over the whole level, as in 6B. It is a composite: the desert port and its beach town, then a valley with the oil field and the wadi, the desert village, the railway junction, the oasis, the desert airbase, the fortified pass, and the quiet desert before the boss. The plan's open desert is painted in the game's own desert sand, so the level's start and its boss ground meet without a seam.

**Owner decisions (plan review):**
- The level opens over open water, close to the quay.
- The pass narrows the ground to a gorge about 120 px wide. The railway crosses on a **viaduct** that can be destroyed and is wide enough for the game's trains (16 px).
- In the desert the church is a **domed building, not a mosque** (no minaret).
- Light damage overall, with craters and wrecks around the pass and the airbase.
- Route objects for road traffic: built by the level 1 work. They are on the branch `claude/enigma-level-1`, not yet on main (an earlier note here said they were merged; it was wrong). This branch merged that branch to build on them (18.6).
- Heat shimmer, dust and sandstorms come later, first as animated mockups for review.

**Order of work** (the owner reviews after each step): (1) the desert climate and the desert port, beach town and village presets in the city lab; (2) relief, wadi, dunes, oil field and oasis; (3) the junction, the desert airbase and the pass; (4) the game integration (`sortiePlanLevel2`, the seam into the boss ground, slots, tests, contact sheets).

### 18.1 The desert climate and the first desert presets (step 1, for review in the city lab)

`P.climate: 'desert'` is a generator parameter. `desertize(plan)` runs over the finished plan, so a temperate plan is never touched (checked: every existing preset paints identically, two seeds each). Painting picks the palette per plan (`C_TEMP` or `C_DESERT`; `paint` and `paintFx` select it, and a test paints a temperate town after a desert one to show nothing leaks).
- **Palette:** the game's own desert sand, scrub, soil and dirt (index.html `THEME_TR[2]`). Irrigated crops are green, palms olive. Paving is sandstone, the road packed dusty asphalt. Walls and roofs are plaster in four washes (white, ochre, pink, buff). Domes are white.
- **Buildings:** houses, terraces, blocks and courtyard farmsteads get flat plastered roofs with a parapet, each in its own wash (`b.wash`). Works, warehouses and the station keep their roofs.
- **The domed hall:** the church keeps its footprint and becomes a whitewashed hall: a big dome over the crossing (it overhangs the nave into the churchyard), a small dome on the front tower, a half dome over the apse, and flat roofs on the nave and transepts. There is no minaret. In the desert the civic domed hall's dome is white too.
- **Palms:** every tree is a date palm (6 or 7 fronds from a dark heart, lit from the upper left). Orchards become palm groves on watered earth with irrigation channels.
- **Well:** the village green's pond becomes a well (a stone ring round dark water, a wooden frame across it) on a paved spot (`plan.wells`).
- **Open desert:** fields and open meadow farther than about 20 to 46 px from the nearest house, garden, yard or street become `K.DESERT` (game type `sand`): dunes in long ripples with a few tufts of scrub. A host can pass its own sand as `opts.sandPix`, as it passes `seaPix` and `apronPix`.

**Beach town (coast options, corner form):** `beachRun` is how far the side coast runs on past the side harbour before it swings out (default 170, as before). `beachW` is the beach's width there (24 px), and `prom` a promenade between the waterfront street and the sand (7 px, palms every 13 px). In that stretch the sand never becomes a sea wall, and the waterfront street runs its whole length. Also in the stretch:
- rows of 3 to 5 bathing huts (4 x 5 px, striped canvas roofs) just below the promenade;
- a **pleasure pier** 6 px wide on piles, running about 44 px out over the sea, with a round white pavilion on a deck at its head (`plan.beachTown`).

**Presets:**
- `portDesert` (Desert port and beach town): the south port in its corner form with the sea to the east and an open side harbour, as in 6B, the end quay at 12 percent of the length, then the beach town and the town thinning out into the desert.
- `villageDesert` (Desert village): the village preset in the desert.

**Checks** (`tests/citygen.mjs`): 60 seeds of each pass every hard rule. Every house has a flat roof, every church is a domed hall and every tree is a palm. Each plan has open desert. Each port has its promenade, at least six bathing huts, and a pier reaching at least 30 px over the sea. Each village has its well. The palette does not leak. Plan time is about 36 ms (median).

### 18.2 Owner feedback on step 1, and the mockups

**Owner feedback on step 1:** the villages should look fundamentally different, with no typical farmland. The owner asked for mockups in the simplicity of the original Campaign desert. The city should clearly be in the war, with destroyed villages and fortifications at the beach.

**Mockups:** a page of mockups drawn in the game page with the game's own desert ground, palette and sprites, at game scale (artifact "Sea of Sand Mockups"). There were three rounds:
1. Four village ideas (a walled ksar, a roadside hamlet, a burnt oasis, a strongpoint), the beach town at war (E) and the harbour at war (F).
2. Oasis villages, C and E mixed: a small hamlet (G), a medium village (H) and a large oasis town (I), with damage growing with size.
3. The fortifications reworked: the held oasis village (D2), a strongpoint in the open (D3) and the element kit. The owner then had the communication trenches taken out.

**Owner decisions:**
- Village H is the reference, but the generator may make all three sizes. Smaller villages take less damage.
- The city at war is E.
- D2 and D3 work.
- The port has density variations, with middle density for level 2.
- No communication trenches.

### 18.3 The desert in the generator (step 1b, for review in the city lab)

**The desert's open land** (`desertLand`, its own builder as the islands are; presets `oasisSmall`, `oasis`, `oasisLarge`, `oasisHeld`, `desertPost`).
- **The track:** a dirt track 9 px wide (a tank route, `st.dirt`, drawn as packed dirt with two ruts) along the strip.
- **Features** are placed by share of the length (`P.features`).
- **An oasis village** (G, H, I):
  - a pool (`K.WATER`, -16) in a grove of date palms on watered ground (`K.OASIS`, game type `grass`) on one side of the track;
  - packed blocks of flat-roofed houses on the other side: a guillotine split, every house at least 9 px across, sharing walls (`t: 'cube'`), now and then a courtyard with a palm. A large village has blocks all round the grove.
  - a square with the white domed hall (a flat hall and a round dome, one group) and a well.
- **Damage by size:** houses, the share in ruins, fires and shell holes grow with the size (60 seeds: 5.4, 21 and 43 houses; 6, 15 and 31 percent ruined).
- **The fortification kit** (a held village: D2; a strongpoint in the open: D3):
  - **fire trenches** in fire bays and traverses, 3 px wide, with their spoil on the enemy side (`K.SPOIL`, game type `sand`, shaded by `Br`);
  - **dug-in pits** with a ring of sandbags, each bag drawn (`plan.pits`; gun slots `flak` and `arty`);
  - **concertina wire** belts on iron pickets (`plan.coils`);
  - a **minefield** behind marker posts with warning signs, with a lane for the track (`plan.mines`, `plan.signs`);
  - an **anti-tank ditch** with steep shaded sides and its spoil on the defenders' side (`K.DITCH`, game type `mud`), with a **roadblock** where the track crosses it (concrete blocks, a barrier pole, hedgehogs);
  - sand-coloured **camouflage nets** (`plan.nets`);
  - a **tank dug in** hull-down (slot `tank`, new);
  - **MG nests on flat roofs** (roof slots), and a **bunker** slot on a concrete pad.
  - No communication trenches (owner).
- **The held village** faces an attack from the south. Going north (towards the village):
  1. the ditch and the roadblock;
  2. the minefield;
  3. two wire belts;
  4. the fire trench with its pits, the bunker by the track and the tank on the flank;
  5. a flak pit under a net at the grove.
- **The strongpoint** is a ring of six pits joined by fire trenches round a command bunker, with two flak pits under nets, a tank dug in and ammunition under a net. Wire and mines run all round it, with one gap towards the track.
- **The track** stays free in every plan: no trench, ditch, pit or spoil is on it.

**The desert port at war** (`portDesert`, owner mockup E).
- **Density:** the port's density is a parameter, `portDensity`, from 0 (half the preset's U) through 0.5 (middle, used by level 2) to 1 (the preset's own). The lab has a Port density slider. Damage is 0.6, highest in the beach town.
- **The beach town at war** (`coast.war`):
  - hedgehogs in three staggered rows in the shallows, and stakes at the waterline;
  - a belt of concertina wire along the top of the beach;
  - two casemates on the sand with their embrasures facing the sea (`seaX`), and two bunker slots on concrete pads;
  - the pleasure pier cut through, and about half the promenade's palms shot off;
  - no bathing huts.
- The obstacles go in before the town's obstacle list is reset (`plan.beachTown.obs`).
- The roundabout and the government buildings are left out of the desert town (owner: simpler).

**The desert look, closer to the Campaign.**
- **Houses:** every flat desert roof is drawn like the game's desert house sprites: light top and left edges, a darker bottom and right, and a dark roof hatch. The washes are the sprite's own sand colours and a white, a pink and a buff.
- **Shadows:** there are no facades in the desert, only the sprite's shadow, 3 px right and 3 px down.
- **Ground:** the open desert uses the Campaign's own desert formula and colours.
- **No farmland:** `desertize` turns every field into open sand.
- **Scrub:** scrub dots the open sand.
- **Rubble:** a collapsed desert house shows shards in its own wash, not roof tiles.

**Checks** (`tests/citygen.mjs`):
- 120 desert ports and villages pass every rule. They have no fields, the war beach is complete, the pier is cut through to the sea, the built area grows with `portDensity`, and the palette does not leak.
- 300 desert-land plans (60 of each preset) pass every rule, with every feature and the free track. Houses and ruins grow with size.
- Plan time is under 2 ms for the open land and about 35 ms for the port.
- Temperate presets still paint identically.

### 18.4 The rest of the level (step 2, for review in the city lab)

**Mockups, round 4** (owner: they work):
- V: the valley with the oil field and the wadi;
- P: the fortified pass with the viaduct;
- J: the railway junction;
- A: the desert airbase.

**Owner decisions:**
- The plane flies over the rock walls.
- The viaduct is stone.
- The ravine must look deep.

**In the generator,** these are new `desertLand` features (`kind` with `at0`/`at1`), with presets `desertValley`, `desertPass`, `desertJunction` and `desertAirbase`.
- **Railway** (`P.rail: { x }`): a main line straight down the strip at x 74, inside the pass's gorge. A 16 px corridor either side is kept clear (`Br -50`), it is a straight train run, and it has level crossings where the track crosses it. The track follows each feature's target: x 142 beside the valley and the pass, and x 34 at the airbase, crossing the line to get there.
- **Rock walls** (valley, pass; `K.CLIFF`, game type `rock`):
  - their edges are per row (`plan.wallL`, `plan.wallR`);
  - they are big masses lit from the upper left in a few flat tones, with dark crevices;
  - a cliff face along the edge: a left wall's face looks east, away from the light, a right wall's face is lit, both with strata;
  - a left wall throws its shadow on the floor.
  - The plane flies over them (owner); ground units keep off them, since nothing spawns on `rock`.
- **The valley:**
  - a dry wadi (`K.WADI`, game type `sand`) winds between the railway and the track;
  - an oil field: lattice derricks with long shadows (one burning, with an oil spill and a fire), pumpjacks with oil stains, and a pipeline on low supports along the track;
  - a tank farm of three tanks in a column on a fenced pad, wherever the floor has room beside the wadi, with a flak pit under a net.
- **The pass:**
  - the walls close in to a 120 px gorge (60 seeds: 104 to 136 px at its middle);
  - a **deep ravine** (`K.RAVINE`, 44 px across, game type `ravine`) crosses the whole strip. Its far wall's face is lit at the rim and darkens downward in strata and buttresses; below it are black depths and a near lip in shadow.
  - the railway crosses on a **stone viaduct** (`K.RBRIDGE` with `Br -21`): 20 px across, so the game's 16 px trains fit between its parapets, with sleepers and rails, piers either side, and the deck's shadow down into the ravine. The track crosses on its own bridge (`K.BRIDGE`, a tank route).
  - stone sangars on the ledges of both walls, which are flak slots;
  - at the top, a **fort** astride the track: thick stone walls with battlements and the inner face in shadow (`part: 'fort'`), four corner towers in stone, gates north and south, a flak pit and a building inside, and a roadblock at the south gate.
- **The junction:**
  - a branch leaves the main line from the south and curves to x 24. It is a straight train run of at least 150 px with its own clear corridor, ending at a buffer stop.
  - a siding with four wagons, one burning, runs into an engine shed with smoke vents and a chimney;
  - an island platform between the branch and the siding;
  - a side platform with a canvas canopy along the main line, the station (a long flat roof with a small dome), a water tower in plaster, and a flak pit under a net.
- **The airbase** (`plan.airbase.desert`):
  - a runway 20 px wide of rolled sand with dark edges, white markers and tyre marks, and a taxiway joined at both ends and in the middle;
  - four blast pens: sand banks 5 px thick, the north bank lit and the others shaded with a dark foot, a rolled floor joined to the taxiway, and a parked-plane slot inside;
  - six tents, a canvas hangar on hoops with its door to the taxiway, and the tower in a ring of sandbags;
  - fuel drums under a net, and two flak pits under nets;
  - shell holes on the runway, and a fire where a plane burns.
- **Pits** are now dug only on open ground, and `pitAt` looks for the first open spot, so a pit never cuts into a building.

**Checks:** 240 plans (60 each) pass every hard rule, with the trains clear and tanks reaching every track pixel. Every valley has its wadi, cliffs, derricks, pumpjacks, a burning well and its tanks. Every pass has its gorge, ravine, a 20 px viaduct with the rails over the whole ravine, the road bridge, sangars and the fort with four towers. Every junction has its branch run, platform, station and wagons. Every airbase has its runway, pens, hangar, tower and a flak pit. Plan time is about 1.5 ms.

**Found on the way (older code, not changed; for the owner):** two lines in `tools/citygen.js` have a `//` comment in the middle that turns the rest of the line into a comment. One disables a garden-fence check in the town painter. The other drops the tunnel hill's free-space limit (`let free = 0; while ...`), so the hill over 6B's tunnel is not kept off streets as its comment says. Fixing either changes level 6 and 6B pixels, so I left them for the owner to decide.

### 18.5 Level 2 in the game (step 3)

**Fixed first (owner):** the two lines in `tools/citygen.js` where a mid-line `//` comment hid the rest of the line.
- The fence between neighbouring gardens is drawn again (every town paints a little differently).
- The tunnel hill over 6B's quayside track is limited to the open ground beside it again, so it stays off streets.

**The plan** (`sortiePlanLevel2`; the generator's `sandSea`): one plan over the whole level, 56 chunks (3584 px), from its first chunk.
- **Port:** the harbour and beach-town segments are the desert port (`portDesert`, middle density, at war). The end quay is 1.5 chunks in, so the level opens over the sea close to the quay; the east harbour runs along about 62 percent of the harbour segment; the beach town follows to the end of the beach segment.
- **The rest** is desert land with each segment's feature: the oil valley, the held oasis village (`village`: the medium oasis, held), the junction, the small oasis (the first `desert_open`: the level's landmark), the airbase, the pass, and the quiet desert (the second `desert_open`, nothing built).
- **Joining:** the two plans are joined row on row. Buildings and streets are renumbered, and every position, group and row array moves up by the port's length. The track carries on from the port's main road.
- **Railway:** the line leaves the port along its west edge (x 18), curves to x 74 for the desert (inside the gorge) and back to x 18 over the last 160 px, where the Campaign's boss ground has its line.
- **Track:** where two features meet, their targets blend, so the track swings across smoothly (the airbase's track runs west of the line, the others east of it).
- In 20 seeds every plan passes every hard rule. Plan time is 80 to 320 ms.

**In the game:**
- **`buildSortie`:** level 2 has `gen: 2`, `bossAt` and `arcLen` at its length + 5 (as levels 6 and 6B), and the U and D curves.
- **`SORTIE_BIOME`:** harbour and beach town play as `city`, valley, village and open desert as `country`, the junction as `factory`, the airbase as `base`, the pass as `fortline`. `SORTIE_UD` has their density and damage.
- **Past the level** (shared, `sortieInfo`): a level with its own ground continues on the Campaign's boss ground of its theme: `bossland` with theme 2 for the desert (the land fortress's ground). Levels 6 and 6B keep `secret`.
- **`classify`** (shared): the Campaign's runway shortcut for `base` chunks (x 60 to 104) no longer applies inside a plan, where the plan says what is there.
- **Paint:** `planPaintOpts` passes `sandPix` for level 2 (`planSandColor`). The open desert is drawn in the Campaign's desert ground colours (theme 2 `field`) and dithers over the plan's last 128 rows into the boss ground's look (theme 2 `grass`), so the two meet without a seam.
- **Guns:** in level 2 every plan slot is filled as it comes up, before the biome's own spawns:
  - flak and artillery slots get flak or artillery (pits, sangars, roof nests);
  - bunker slots get bunkers;
  - the new `tank` slot gets a tank dug in, standing still;
  - `parked` slots in the blast pens get parked planes.

  A bot flight filled 12 of 27 slots (level 6: 16 of 38).
- **Viaduct:** `planViaducts` places the stone viaduct as a bridge target (`G('bridge', ..., { via: true })`, 20 px wide, as long as the ravine is deep, 30 hit points) as it comes up. Its look is the plan's own deck. Destroyed, it leaves a broken span (`viaBroken`).
- **Chunk build time:** level 2 averages 10.9 ms (p95 30.9 ms, the dense port painted in bands), against 12.3 ms for the legacy ground.
- **Tests** (`tests/enigma.mjs`):
  - the plan passes the hard rules, covers the level and begins over the sea, with every segment's ground present;
  - its types and pixels match the plan in the game;
  - past it lies the Campaign's desert boss ground;
  - the ground is the same after a resume;
  - a bot flight sees the viaduct come up as a bridge target, meets the boss, and returns to the picker on level 2.

**Not yet:**
- trains on the plan's train runs (the same as level 6);
- road traffic on the plan's tracks with the route objects;
- the weather (heat shimmer, dust, sandstorms): first as animated mockups, as the owner decided.

### 17.4 Level 1A: level 1 with its islands (in the game)

The owner asked for the islets in a level **1A**. Like 6B, it is a separate entry in the picker (internal sortie level 8, `ENIGMA_LABEL` '1A', the button after 1). `ENIGMA_BASE` gives the Campaign stage each level flies (1A flies stage 1: theme, music, the flagship). Level 1 is unchanged: the carrier on the old ground.
- **Sortie:** level 1's sequence, length and `bossAt`. Flags `seq` (legacy biomes from the sortie, as level 1) and `isles` (the islands plan). `gen` stays 0, because many of level 6's city functions read `S.gen`. The checks that took "level 6 or higher" to mean the city levels now name levels 6 and 7.
- **Plan** (`sortiePlanIslands`): the `islands` preset from the level's first chunk to the start of `beach_fortified` (28 chunks, 1792 px).
  - The chain spans the `island_chain` segment.
  - The large island starts with `island_airbase` and is 620 px long, running about 1.5 chunks into the open sea after it.
  - Plan rows are world rows `S.planY0 - y`, as for 6B. `S.planC1` marks the end of a plan; for levels 6 and 6B it is the level's end.
  - The water is the game's own sea (`seaPix`), so the plan meets the open sea and the Campaign's coast after it without a seam.
- **Biomes:** a plan chunk that is at least 45 percent land is `country`, the rest `sea` (`S.planBiome`; 9 and 19 chunks in the test seed). From the beach on, level 1's legacy ground.
- **Guns** (`planGuns`, every frame, outside the director's pacing, as `planBerths`): each slot of the plan gets its gun once, as it comes up above the screen:
  - `bunker` slots get the game's bunker (the islets' turrets);
  - `flak` slots get flak (the islets' and the airbase's gun pits);
  - `aatower` gets the AA tower;
  - `parked` gets a parked plane in its blast pen.
  A bot flight filled all 11 slots.
- **Cows** (`planCows`): each paddock gets its cows (the game's farm cows) as it comes up; they graze inside its fence (`critter.box`). The Campaign's own farms (`farmAt`) are never placed on plan ground.
- **Water and roads:** in 1A, submarines, destroyers, PT boats and the small boats spawn only where the water is open (`seaOK` samples the hull), and convoys, armoured cars and light vehicles only on a road (`roadOK`). Both are always true elsewhere, so the Campaign's random stream is untouched.
- **Tests (`tests/enigma.mjs`):**
  - the picker offers 1A (the practice picker does not);
  - the plan passes the hard rules and runs to the beach;
  - land and sea chunks, with the legacy coast after the plan;
  - it opens on the carrier, and level 1 keeps the old ground;
  - types and pixels come from the plan;
  - the same ground after a resume;
  - a bot flight: the slots filled, cows in the paddocks, no ship ever on land, and the flagship comes and the level returns to the picker on 1A.
  `node tests/carrier-shots.mjs OUTDIR 2000,3000 - play 8` films 1A.
- **Still to do:** road traffic on the island ends at the jetty, because vehicles that drive along a road do not stop where it ends. This is the deferred route objects (13a). Also open: the islets' look in play, the airbase's own director spawns (it plays as `country`), and a better seam between the island's tip and the beach.

**No small fields at the edges (owner).** Clipping the village to the shore, and laying the field grid round the wood, the pond and the farmstead, left slivers along the beach. A last pass now checks every field on the large island. A field joins the field it shares the most border with (smallest first), or becomes meadow if it has no field neighbour, when it is:
- under 400 px;
- thinner than 12 px;
- mostly edge: under 35 percent of its pixels lie 2 px inside its outline.
That is about 37 remnants per plan. The farm islets' fields are placed whole and are left alone. `tests/citygen.mjs` checks that no field under 400 px or thinner than 12 px remains on the large island in 100 seeds.

### 17.5 Route objects (owner decision: build them; keep convoys spaced)

Tier A of section 2, for Enigma Run. The Campaign has no sortie, so its traffic, random stream and golden replay are unchanged.
- **Routes** (`sortieRoutes(S)`, built once per sortie and stage base): route 0 is the legacy road (`roadX`), active wherever the ground under it is a road or a bridge outside a plan. Every tank street of the plan that runs along the strip (`axis: 'v'`) becomes a route.
  - A street is split where it gives way (`pts` width 0, as at a village green) or skips rows.
  - Each route holds x per world row (`xs`, from `wyLo` to `wyHi`); the main road is flagged `main`.
  - At a roundabout the route swings round the ring on the vehicle's right (the west side, heading south) instead of crossing the lawn and the column.
  - The generator records 1A's road extensions as streets: south to the jetty, north to the apron.
- **Vehicles** carry `route` and `lane`. Tanks with `road`, trucks, armoured cars, motorbikes and staff cars move with `routeStep`:
  - **Next step:** the vehicle takes the next row on its route. Past the route's end it takes any route that goes on within 8 px (at a fork, either one at random); if there is none, it stops (`atEnd`).
  - **Keeping distance:** it waits while a road vehicle ahead of it on the same route, or just ahead in line (within 9 px across), is closer than both half-lengths plus `ROUTE_GAP` (10 px).
  - **Terrain:** the old checks still hold. Tanks and trucks never move with sea, surf or river just ahead, so at the island's jetty the lead tank halts where the road meets the water.
  - A tank that drives onto the road from a patrol takes the route under it.
- **Spawns:** convoys and light vehicles pick a route active at the spawn row: the main road, or another route one time in four. If there is none, they don't spawn. A convoy's vehicles start `ROUTE_SPACE` (34 px) apart (the Campaign: 26).
- **Results:**
  - in 1A: 6 routes, all on the road;
  - in level 6: 51 routes, every sampled row on the road;
  - a mixed convoy (two tanks, two trucks) drives the island from the airbase to the jetty (304 px, splitting round the green), and level 6's town from its north end to the south (4136 px, round the roundabouts);
  - it never leaves the road, keeps at least 10 px between vehicles, and stops at the end. This is tested in `tests/enigma.mjs`.
- **Not yet:** traffic in the other direction, turns onto cross streets (streets along x are not routes), and marching troops (still `roadX`).

### 18.6 Trains, and tanks into side roads (owner request)

**Merge:** the route objects (spec 2, Tier A) are on `claude/enigma-level-1`, not yet on main. This branch merged that branch (with level 1A, its islands plan) to build on them.

**Trains** (`planTrain`, levels 2, 6 and 6B):
- **Spawn:** in the director's ground spawns, a train is placed on one of the plan's train runs (`plan.trainRuns`: the main lines, the branches and the junction's branch) as the run comes up above the screen. One train is about at a time, and each 900 px of a run gets at most one.
- **The train:** a locomotive (a diesel in the desert, as in the Campaign) and three to five cars, boxcars or flatcars with a flak gun, scored as the Campaign's trains.
- **Movement:** they roll south along the run as the Campaign's do (`trainMove`). Inside a plan they also roll through a level crossing, where the plan has rails under the road (`planRail`; the Campaign is unchanged). They stop where the rails end.
- **The viaduct:** a destroyed viaduct's span reads as `ravine` (shared `classify`, plan branch), so a train stops at the gap.

**Side roads** (owner: tanks also move into side roads):
- **Side roads** (`sideRoutes`) are the plan's tank streets that run across the strip (`axis 'h'`): the collectors' cross streets and the perimeter road in the towns, and the side tracks in the desert. A junction is wherever a route (a road along the strip) passes one of their points.
- **Turning:** a tank (not a dug-in one) driving along a route turns into a side road at a junction `SIDE.turn` of the time (0.35), either way along it.
- **Following:** it follows the street point by point (`sideStep`). At the next junction it takes that route `SIDE.join` of the time (0.6), otherwise it drives on to the street's end and stops. It keeps its distance from the vehicle ahead (both half-lengths plus `ROUTE_GAP`).
- **Desert side tracks** (generator, `sideTrack`): in level 2's desert, dirt side tracks 7 px wide run off the main track as tank routes, about eight per level:
  - to each derrick and to the tank farm in the valley;
  - into each oasis village along the first gap between its blocks;
  - to the station at the junction;
  - to both ends of the airfield.

  Each ends where the ground is no longer open: at houses, a wall or the railway's corridor.
- **Level 1's convoy test** (shared): it turns side roads off for its convoy (`SIDE.turn = 0`), since it checks route following alone.

**Tests:**
- `tests/enigma.mjs`: a bot flight through levels 2, 6 and 6B each runs trains on the plan's railway (3, 6 and 5 trains). In 6 and 6B tanks turn into side roads and drive along them (10 and 11 side roads used).
- In level 2 a tank placed above a desert junction turns into the side track, drives along it on the road and stops at its end. The desert's tanks drive only about 40 px in their life, and the desert has only about eight junctions, so a single flight is not a reliable check there.
- `tests/citygen.mjs`: 20 whole level-2 plans pass every rule with every feature and at least four side tracks.

### 18.7 Weather (owner: after the weather mockups)

**Owner decisions:**
- Heat shimmer at the airbase and a little inland.
- Dust (mockup B) and sandstorm gusts (mockup D), both at varying strength.
- The gusts build over the approach. Stronger gusts push the plane a little, less than the boss sandstorm.
- The proposed order along the level stands.

**Along the level** (`WX2`, `wx2Chunk`): dust and shimmer per segment, linear between chunk middles, read at the middle of the screen (`wx2At`):

| Segment | Dust | Shimmer | Gusts |
|---|---|---|---|
| Harbour | 0.15 | – | – |
| Beach town | 0.25 | – | – |
| Valley | 0.4 | 0.6 | – |
| Village | 0.35 | – | – |
| Junction | 0.5 | – | – |
| Small oasis (first open desert) | 0.45 | 0.65 | – (a dust devil) |
| Airbase | 0.3 | 1 | – |
| Pass | 0.7 | – | 0.25 (they blow, too weak to push) |
| Approach (last open desert) | 0.5 to 0.8 | 0.3 to 0 | 0.15 to 0.8 |
| Boss arena | 0.8 | – | 0.8 |

**Heat shimmer** (`shimmer2`, drawn in `drawGround` over the painted chunks only, under every unit and the plan's fires, so aiming is not affected):
- Patches of hot air sit on a 72 × 52 px world grid, so they ride with the ground; more of them where the shimmer is stronger. Each drifts a little.
- A patch shows only on open ground (sand, apron, runway, road and the like). Along each row only the open ground moves, so the rails, rock and walls stay still.
- Inside a patch, rows of the ground picture shift sideways by a pixel, two in the middle of a patch where the shimmer is strongest (the airbase). Bright mirage glints flicker on them.

**Dust** (drawing only, free random stream):
- **Flecks:** the Campaign's desert flecks; in level 2 there are more of them and they fly faster as the dust and the gusts grow.
- **Veils:** up to ten large, faint sand veils drift with the wind.
- **Trails:** moving tracked vehicles kick up dust behind them, most where the dust is thickest (the junction's convoys).
- **Dust devil:** in the small oasis's stretch, up to two dust devils (mockup C, part of the proposed order): a dithered, turning funnel (lit on the right, shaded on the left) with a long shadow, riding with the ground as it wanders.

**Gusts** (`updGust2` in the simulation, next to `updStorm`; `drawGust2` where the boss storm is drawn, under the player and the bullets):
- **Timing:** a gust every 7.5 s (`GUST_P`). Its front sweeps in from the left, holds, dies away, and a calm follows. Each gust's peak varies (a pure hash of the sortie seed and the gust's number).
- **Determinism:** the gusts come from `run.frames` and the scroll, never `Math.random`, so runs replay.
- **Look:** ochre light, rolling sand clouds and sharp streaks, built like the boss storm but weaker.
- **Push:** only the part of a gust above 0.4 (`GUST_FELT`) pushes the plane, up to 0.3 px a frame (`GUST_PUSH`) at full strength, against the boss storm's 0.85. At the approach's strongest gusts this is about 0.2 px a frame. Enemy shells are not bent: only the boss storm bends them.
- **Boss storm:** while the boss's storm blows, the gusts drop out.

**Shared changes** (no effect outside level 2):
- `world.gustX` and `world.gustK` are new; both stay 0 outside level 2.
- The player's movement adds `world.gustX` next to `world.windX`.
- In the weather block, the flecks' speed and count read the level 2 weather only when `wx2On()` (level 2's generated ground, not on the title screen).
- `resetTerrainState` also clears the weather's cosmetic lists.

**Tests** (`tests/enigma.mjs`):
- Dust grows along the level.
- Shimmer appears only in the valley, the oasis and the airbase (strongest at the airbase).
- There are no gusts before the pass, and they build over the approach.
- A strong gust pushes the plane, by less than 0.4 of the boss storm's push. The pass's gusts do not push, the port has none, and the boss storm replaces them.
- The shimmer moves ground pixels at the airbase.
- The shimmer, dust, devil and gusts draw without errors.
- None of it happens outside level 2.

## 19. Level 4, The Iron Forest

**What the castle boss needs (checked in code; settles the [verify] in section 10).** The castle boss spawns with its gate 1,120 px above where it appears, 1,200 px above the screen's top (`bossE.wy = -sc - 1200`), so its approach is about 19 chunks of the Campaign's `castle` ground with theme 4: grass, the castle road (`croad`) down the middle at x 112, fields, and the small castle on its farm (`castleInfo` finds the first `castle` chunk). The castle grounds themselves are a sprite (`drawRaven`) drawn over the ground. In the Campaign the castle ground begins about 2.5 chunks before the boss trigger and never ends. So level 4 ends as levels 2 and 3 do: past the level, the open-ended Campaign boss ground of its theme (`castle`, theme 4), and the plan's main road runs into the castle road at x 112.

**Owner decisions (plan review):**
- **Cliff coast:** a ragged cliff with coves and sea stacks, and a **very high coast**: climbing it should feel like going up a mountain.
- **Conifer forest:** single crowns, **in different sizes**.
- **Clearing village:** a crossroads village, but a **new variation of its own**, added to the generator.
- **Hidden airbase:** placed freely by the generator; its hangars and guns come from the plan's slots.
- **Mist:** now, as a **weather effect of its own** (not level 3's mist).
- **Valley:** the river runs along the strip and winds a little. It is **wide, with room for the game's ships**, and has **harbour structures at one side**, near a village.
- **Road traffic:** the route objects already built (17.5, 18.6) carry the level's roads; convoys use them.
- **Order of work:** the generator first, reviewed in the city lab (City Lab Level 4); then the game.

### 19.1 Step 1: the cliff coast and the conifer forest (generator, for review in the city lab)

**Forest land** (`forestLand`, its own builder as the desert's and the islands' are; `builder: 'forest'`, `climate: 'forest'`; presets `cliffCoast` (900 px) and `coniferForest` (1280 px), in the city lab and in the published **City Lab Level 4**). Features by share of the length (`P.features`), as in the desert.

- **Climate** (`C_FOREST`): the Campaign's stage 4 colours (`THEME_TR[4]`) for grass and the forest floor; three conifer ramps (spruce, pine, larch); grey crag; heath (heather, dead bracken); grey shingle.
- **New ground kinds:** `CRAG` (41, game type `rock`: cliff faces, the gorge's walls, sea stacks; the plane flies over, ground units keep off) and `LEDGE` (42, `grass`: ledges between the tiers, the gorge's floor, a stack's top). The forest floor is level 3's `WOOD` (`forest`).

**The cliff coast** (feature `cliffs`, owner: a very high coast, like going up a mountain):
- The level opens over the sea (56 rows by default), with two to four **sea stacks**: a ragged outline extruded upward into a face of 9 to 18 rows, a grassy top, surf round the foot.
- **Coves:** the main one (46 to 60 rows deep) in the middle of the strip with a shingle beach, often a second, smaller one beside it. They bite into every tier, shallower and wider the higher the tier.
- **Three tiers of cliff** with **ledges** between them. The faces are about 46, 36 and 30 rows high (varying along the coast), the ledges 15 and 19. Each face is south-facing rock in strata, buttresses lighter and gullies darker, lit at the rim and dark at the foot; a face that turns west catches more of the light; gullies are notched into the rims; grass grows on small ledges in the faces. Each face shades the ledge (or the sea) at its foot. Scree lies at the foot of each face. In all about 200 rows from the sea to the plateau.
- **The road** begins at a concrete **slipway** on the main cove's shingle, with a landing barge moored off it, and climbs to the plateau through a **gorge** cut through all three tiers (24 px floor of scree and grass, walls of 6 px: the left wall faces east and is in shade, the right wall faces west and is lit), winding a little. Above the gorge it becomes the forest road.
- **The clifftop:** a strip of heath (22 to 32 rows) along the rim with small wind-bent pines; a **battery** of three casemates with their embrasures to the sea (`arty` slots), a **radar**, and a **lighthouse** on the most seaward headland, both clear of the road.
- **On the ledges:** two **pillboxes** facing the sea on the first ledge (`bunker` slots) and two **flak pits** in sandbag rings on the second (`flak` slots).

**The conifer forest** (feature `conifer`; owner: single crowns in different sizes):
- **Crowns** in six sizes (radius 2 to 7 px), each drawn from above with its shadow to the lower right: **spruce** as a dark star of branches with gaps between them, **pine** as a rounder crown of olive tufts round a middle one, **larch** (about 2.5 percent) a lighter star. Slow noise fields make **old stands** of big spruces, **young growth** and **pine stands**. Large crowns are placed first, then medium and small ones fill the gaps (crowns may overlap a little, so the forest is dense but every crown reads). Painted per size class (small, medium, large), each class's shadows before its crowns, so a taller tree's shadow falls on the smaller ones.
- **Plantations:** blocks of young trees (radius 2, 5 px apart) or pole-stage trees (radius 3, 7 px apart) in rows.
- **Firebreaks:** straight rides of heath across the strip, a two-rut track along most of them.
- **Clearings** (a meadow with flowers and a forester's hut) and **clear-cuts** (slash, stumps, log piles) on the roomier side of the road.
- **Forest roads** (`gravel`, 8 px, tank routes, `axis 'v'`): they leave the main road, run along the strip's far side and join it again, or end at a **timber depot** (stacked logs on a clear-cut). They become routes in the game as they are (spec 17.5): vehicles spawn on them and take the main road where they end.
- The main road is asphalt, 9 px, with a gravel verge.

**Checks** (`tests/citygen.mjs`): 60 seeds of each preset pass every hard rule, with every feature; the same seed gives the same plan; painting in bands equals painting whole. Plan time is about 20 to 30 ms (median, Node). Painting costs about 7.3 ms per chunk warm in Node, about the same as the town (6.3) and the islands (8.2); the conifers add about 0.5 ms (each crown is a cached pixel list per kind, size and turn).

**Next** (after the owner's review): the fortified forest, the crossroads village of its own in a clearing, the hidden airbase, the valley with its wide river and harbour, and the approach to the castle; then the whole level as one plan; then mist as a weather effect of its own.

**A fiercer forest (owner: bunkers and flak in the open parts).** Per conifer feature (`F.guns`, gun sites per 1000 px, default 4; 0 turns them off):
- **Flak sites** beside the main road, alternating sides: a patch of trampled earth (`MEADOW`, Br -39) 30 to 38 px across cut into the trees (a plantation may give way), with two or three flak pits in sandbag rings (`flak` slots), ammunition under a net and shell craters round them. The patch is only cut where at least two pits fit.
- **Firebreak crossings:** barbed wire along the firebreak's south edge for about 55 px either side of the road; behind it, on a cleared pad, a **pillbox** (`bunker` slot, its slit to the south) on one side of the road and a **Tobruk pit** on the other.
- **Clearings:** a flak pit and a crater in each, an **AA tower** slot in the largest. **Clear-cuts:** an **artillery pit** under a net (`arty` slot).
- Sandbags are lighter in the forest palette, so the rings read on the dark ground.
- 60 seeds of the conifer forest: about 15 flak, 2 bunker, 1.5 arty and 0.8 AA tower slots per 1280 px; the cliff coast's forest adds about 7 flak. Every plan passes every rule with every feature (`tests/citygen.mjs` checks at least four flak sites, six flak slots, a bunker and an artillery pit in the conifer forest).

### 19.2 The Sower (owner: a new enemy plane over the forest)

The owner asked for a plane that flies ahead of the player and leaves bullets behind, so the player keeps to the sides or higher up, and that drops flying bombs bursting like flak. Built from the owner's picture (a twin-engine bomber seen from above, nose up, grey and khaki splinter camouflage, glazed nose, yellow spinners, elliptic tailplane). Enigma Run level 4 only; the Campaign never spawns it (golden replay unchanged).

- **Sprite** `SPR.sower` (52 x 40, drawn in code), two propeller discs flickering ahead of the engines, narrower when it banks, a shadow like the big bomber's.
- **Spawn** (`sowerTick`, every frame, outside the director's pacing): while the screen's spawn row is `forest` ground, `SOWER.first` (360) frames into a forest stretch, then `SOWER.gap` (1800) frames after the last one has gone; one at a time, never once the boss has come. A red arrowhead blinks at the bottom edge for `SOWER.warn` (70) frames on the side away from the player, then it comes from below the screen on that side (`SOWER.climb` 1.5 px a frame).
- **Ahead of the player** (`SOWER.hold`, 840 frames, 14 s): about 58 px from the top, weaving across the middle (`SOWER.weave` ±50 px round the centre, about 9.5 s a sweep), so the strip's sides stay free.
  - **Aerial mines** (`ebul` kind `amine`): one every 7 frames from its tail. They hang in the air and drift down with the ground (0.62 px a frame) for 250 frames, then fizzle out (they blink for their last 40). The trail is a snaking curtain under the plane: keep to the sides, or get up beside it where the curtain has moved on.
  - **Flying bombs** (kind `fbomb`): one every 95 frames from the bomb bay, falling back (accelerating to 1.25 px a frame) with a smoke trail; they burst into a ring of 8 shots on a fuse of 52 to 80 frames, or once their fuse is under 40 and the player is within 30 px.
- **Then** it climbs away and is gone (no score).
- **Shot down:** 100 hit points on Normal (scaled by difficulty and loop; the four-engine bomber has 42), 4000 points, two medals, a last burst on Hard (`revenge` 4). It breaks up like the other big planes, which clears the bullets about it (its mines too); crew bail out; it may drop a bomb pickup.
- **Tests** (`tests/enigma.mjs`, 3f): in level 4 (made too tough to shoot down) it is announced, comes from below, holds ahead and sows at least 20 mines drifting down, its bombs burst, and it climbs away, without errors; it never comes in level 6.
- All its numbers are in `SOWER` for tuning after the owner has played it.

**Round 2 (owner: no warning, double its size, rework the drawing, it can come as a pair).**
- **No warning:** the marker at the bottom edge is gone. It comes up from below the screen on the side away from the player and passes over the player while climbing in and away (`ghost`, no ram); it can ram only while it holds ahead.
- **Twice the size:** `SPR.sower` is 104 x 80, redrawn: a tapered wing with rounded tips, ailerons and flaps; engine nacelles forward of the wing with cowling rings, exhaust stubs and oil coolers, yellow spinners; a fully glazed nose on a frame; the dorsal gunner's glazing and the radio mast; an elliptic tailplane with its elevators and the fin edge-on; angular splinter camouflage (crossed slanted bands); panel lines; landing lights in the wings. Propeller discs with a blade drawn over the engines. Hit box 88 x 60 (`hw` 44, `hh` 30); it holds 72 px from the top; mines fall from its tail, bombs from its bay, trails from both engines. 140 hit points on Normal.
- **As a pair:** still flying `SOWER.pairAfter` (300) frames after it settled, it calls a second one, which climbs in from behind on the other side. Then each holds one half of the screen (`laneX` 52 px either side of the middle, weaving `laneWeave` 14 px), wingtip to wingtip, each sowing its own mine curtain and dropping bombs; when one leaves, the other leaves with it. If one is shot down, the other weaves across the middle again. A single Sower calls at most one partner.
- Tests (3f): no warning, it comes from behind; mines and bombs; the pair (at least 50 steps as a pair, split into the two halves); they climb away; not in level 6.

### 19.3 Level 4 in the game (first version, owner: add it to Enigma Run)

- **Plan** (`sortiePlanLevel4`; the generator's `ironForest` preset, `ironForestFeatures`): one forest-land plan over the whole level (60 chunks, 3840 px) from its first chunk. `beach_cliff` is the cliff coast (the level opens over the sea); `forest_conifer` the conifer forest (3 gun sites per 1000 px); `forest_fortified` the same with 7 gun sites per 1000 px and more firebreaks; `clearing_village`, `airbase_forest_hidden` and `valley` are forest for now (more clearings, more roads, fewer guns) until their own ground is built; `farmland_approach` (new feature `approach`) opens into meadow with copses, with a defence line across it (wire, a zigzag trench, a pillbox either side of the road, two flak pits). The road ends at x 112 (`roadEnd`), on the castle road.
- **Sortie:** `gen: 4`, the boss 3 chunks past the level (`bossAt`, `arcLen`), as in the Campaign where the castle boss comes about 2.5 chunks into the castle ground. U and D are zero (no town).
- **Past the level** (shared, `sortieInfo`): a level with its own ground on theme 4 continues on the Campaign's `castle` ground (the castle boss's approach, spec 19); other themes as before.
- **Biomes** (`SORTIE_BIOME`): the cliff coast's first chunk `sea`, the rest `fortline`; the conifer forest, the village, the airbase and (in level 4) the valley `forest` (so the Sower comes over them); the fortified forest `fortline`; the approach `country`.
- **Guns:** level 4 fills its plan's gun slots as they come up, as level 2 does (flak, artillery, bunkers, and AA towers, within the director's usual caps).
- **Tests** (`tests/enigma.mjs` 3g): the plan passes the hard rules and covers the level, begins with the cliffs, its road ends at x 112; ground types from the plan; the first chunk is sea and the castle ground lies past the level; flown through by the bot, the castle boss comes and the level returns to the picker.
- **Not yet:** the clearing village (crossroads, its own variant), the hidden airbase, the river valley with its harbour, the fiercer forest's trench lines, the forest mist, and a softer seam from the meadow into the castle ground.

## 20. Level 5, The Winter Line

Level 5 flies the Campaign's stage 5: theme 1, its music and the armoured train (Winter Wolf). Until now it flew the Campaign's own stage 5 ground (`gen: 0`, no `seq`, `bossAt: null`). Its sequence (section 10) at 62 chunks: `open_sea_ice` 3, `harbour_winter` 5, `farmland_winter` 8, `village` 5, `lake_valley` 7, `station_winter` 9, `airbase_snow` 7, `forest_conifer` 7, `pass` 7, `farmland_winter` 4.

**What the train boss needs (checked in code).** The arena is the Campaign's `bossland` with theme 1, painted as `ryard`: eight tracks across the whole strip (`YARD_T`, x 18 + 26 i), platforms between tracks 1 and 2 and between 5 and 6, crossovers every `XO_P` rows, snow patches. Only the main line (x 18, `RAILX`) runs in from outside; the other seven tracks begin at buffer stops at the yard's south edge (`railEnds`, the first `bossland` chunk). The two boss trains run on tracks 3 and 5 (x 96 and 148); supply trains take any free track; the director spawns crates and sheds on the platforms (`spawnGround`). In the Campaign the prototype flies over first and the warning waits until the yard fills the screen (the extra theme 1 term in the trigger). `sortieInfo` already ends a level on `bossland` for theme 1, so the arena needs nothing new.

**Owner decisions (plan review):**
- **Into the yard (1B):** a throat. Over the last stretch of the level the main line fans out on points into all eight yard tracks, as level 3's yard gathers into the supergun's rails; in Enigma Run the yard's buffer stops are dropped so the tracks run on (the Campaign keeps them).
- **The frozen sea and the harbour (2B):** the frozen sea is not connected to the harbour. The level opens over the frozen sea, which ends at a snowy shore; the harbour comes after it, with **open water** and ice only along the quays. **Rivers are frozen.**
- **The pass (3A):** a mountain gorge (crag walls, the road and the main line through it, avalanche sheds over the track, a blockhouse, the viaduct over a ravine). It **limits where the plane can fly: the player has to fly within the gorge** (story: to stay under the radar).
- **Submarines break through the ice:** yes, now (cracks spread, the ice breaks, a new hole is left), besides surfacing in the holes and leads the plan lays.
- **Ice road** across the frozen lake, with convoys on it. Sinking through the ice maybe later.
- **Weather:** snow comes along the level (clear, light snow, snow). A **snowstorm** is built as a weather effect of the generator, but **not used in this level**, to avoid repeating level 2's storm.
- **Mockups** for the weather first, at step 4.

**Order of work** (the owner reviews after each step): (1) the winter look, the frozen sea, the harbour, the farmland and the village in the city lab; (2) the lake, the station, the airbase, the snowy forest, the pass and the throat into the yard; (3) level 5 in the game (the submarines in and through the ice, trains, guns, the train boss, tests, contact sheets); (4) the weather, after the mockups.

### 20.1 Step 1: the winter look, the frozen sea, the harbour, the farmland and the village (generator, for review in the city lab)

**The winter climate** (`P.climate: 'winter'`, palette `C_WINTER`, the pass `winterize`; all of it in its own section of `tools/citygen.js`). The palette is the Campaign's stage 5 colours (`THEME_TR[1]`): snow for the grass, fields under snow (stubble rows, ploughed soil showing in the furrows, crops as faint stripes), dark bare hedges, the cold sea; trodden snow on yards, snow-dusted setts and pavements; blue shadows. paint() switches on `C.snowRoof`, so no other climate changes (checked: every one of the 27 earlier presets plans and paints byte for byte as before, two seeds each).
- **Roofs:** snow on both slopes (the shaded one blue-grey), the eaves' outline in the roof's own tile; tiles show in patches where the snow slid off or a shell broke the roof; flat roofs white behind their parapet; sawtooth roofs keep their dark north lights.
- **Trees:** every deciduous tree is leafless (a dark heart, a few boughs, a haze of twigs, snow on the upper left); conifers carry snow on the lit side of their branches.
- **Roads:** ploughed: a bank of snow along each edge, slush inside it, the asphalt dark and wet, two worn ruts on the main road.
- **Water:** rivers and their basins freeze (blue ice, drifted snow in streaks, cracks, snow along the banks; the bridges still shade it); ponds freeze with reeds round them; boulders have snow on their tops; a tunnel's hill is rock under snow.
- **Sea:** a crust of ice 2 to 7 px wide (ragged) forms along every quay, breakwater and shore (`K.ICE`, B -85). The fairways and the fleet area stay open. Open water in the lee of a floe is darker.

**New ground kind** `K.ICE` (43, game type `ice`).

**The frozen sea** (`freezeSea`, run by `winterize` for a `'shore'` coast): out from the shore, fast ice (10 to 22 rows), then **pack ice** of large plates (a jittered 44 px grid) with refrozen cracks between some of them (dark new ice), a few open, pressure ridges (tumbled blocks) along others, and old seams across the plates (a 19 px grid); then **broken floes** with open water between them, the gaps widening out to sea; then **pancakes** thinning out to open water at the level's start. The pack's edge is ragged. One or two **leads** of open water cross the pack, edged with new ice. Each floe has a lit rim on its upper left and a shaded side on the lower right where it meets the water. B: -80 a floe, -81 pack, -82 a ridge, -83 new ice, -84 fast ice, -85 the crust along a quay. The pack's share of the frozen sea is a coast option (`pack`, default 0.44; 0.6 in level 5, whose frozen sea is only 3 chunks).
- **Ice holes** for the U-boats: two per plan, in the pack, 22 x 60 px of open water (the game's submarine is 10 x 40) with a rim of new ice, each a `sub` slot `on: 'ice'`. The leads keep clear of them.
- **Places to break through** (`plan.iceBreaks`, one to three): spots in the pack (at least 90 percent ice over 17 x 51 px) where the game will let a U-boat break through (owner decision; the cracking is the game's).

**The 'shore' coast** (a new coast form of the town builder): beach geometry (a natural shoreline across the south, `dir -1`), with shingle instead of sand and dunes, the coast road behind it, the main road ending on it, and none of the beach landing's pieces (no exits, Atlantic Wall, obstacles or surf). Optionally a **side harbour in a bay** (also for the 'side' form): `at` places the side harbour (shares of the length) and `bay` makes the side coast swing in from beyond the strip that many px before the harbour and out again after it. The harbour's channel then ends where the coast swings away, and an **access road** joins the main road to the waterfront street's south end (at low density no cross street reached it).

**Presets** (in the city lab):
- `frozenSea` (640 px): the frozen sea, its shore, and snowy farmland with a few farms.
- `portWinter` (1000 px): the side harbour in a bay (U-boat bunker, piers with cranes and ships, the breakwater with its lighthouses), open water with ice along the quays, a small harbour town.
- `villageWinter`: the village under snow (the frozen pond on the green).
- `winterLine` (builder `winterLine`, from the sortie's segments; 21 chunks for now): the frozen sea fills `open_sea_ice`, with its shore at the segment's end; the harbour in its bay follows in `harbour_winter`. The bay's coast swings in only about 180 px past the shore, so **the frozen sea never meets the harbour's water** (owner). Then farmland under snow (density about 0.01, few farmsteads), then the village with its green at the plan's densest point (U 0.42).

**Checks** (`tests/citygen.mjs`): 180 plans (60 frozen seas, 60 harbours, 30 villages, 30 of the level's first part) pass every hard rule; pack, floes and fast ice; an ice hole of open water a U-boat fits in in every plan, two in all 90 and a place to break through in all 90; open water (over 80 percent) in the harbour with ice along its quays and the bunker; the frozen sea never floods into the harbour's water; the village green in the village; every tree bare; 65 percent of roof pixels white; a winter river frozen; no palette leak; the same seed gives the same plan, and painting in bands equals painting whole. Plan time about 110 ms (median, Node); painting about 15 ms per chunk in the lab.

**Not yet** (step 2): the lake valley with its ice road, the station, the airbase, the snowy forest, the mountain gorge, and the throat into the boss yard; the railway along the level.

### 20.2 Owner feedback on step 1: a longer frozen sea, and a mountain village instead of the village green

**Owner:** lengthen the frozen sea to **10 chunks**; take out the village's oval green; give the village a structure of its own, special to the snow level ("you don't need to follow the existing level, be creative with mountains").

**The frozen sea, 10 chunks** (`winterLine`'s `open_sea_ice` is 10 chunks, 640 px; the shore at its end). The pack takes half of it (`pack` 0.5), with two leads; the number of ice holes grows with the pack (`nH`, 2 to 4: four in the level) and the places to break through with them (up to five). In the game the sequence's weight changes with step 3 (the level keeps its 62 chunks, the other segments shrink in proportion, unless the owner wants the level longer).

**The level's first part is now two plans joined** (`stackPlans`, generic, as `sandSea` joins its port and desert): the town plan for the frozen sea, the harbour and the farmland (no old town, no green: `oldTown: null`), and on top the new **winter land** (`winterLand`, builder `'winterLand'`) from the village on. The farmland's top fields run a few rows into the winter land and end raggedly, not on a line.

**The winter land:** a valley between mountains. Each pixel has a height (`plan.hgt`): it rises from the valley's axis outward (the floor is 26 to 38 px either side of it, about 16 px wider round the village), with spurs and gullies running down to the valley (ridged noise stretched across the strip) and smaller crests; the mountains rise over the first `rise` rows. New ground kind **`K.SLOPE`** (44, game type `rock`): snow slopes; steep faces are bare rock (`K.CRAG`, B -70). Painted lit from the upper left: snow in five tones, blue on the shaded faces, a few rocks showing; rock in strata with snow lying along them. **Cast shadows** (`plan.shadeM`): a pixel is in shadow where the ground towards the light rises above a ray climbing 1.05 px per px; shadowed pixels (not roofs) are darker and bluer. Snowy conifers in stands up to the tree line (height 54), a few on the floor.

**The mountain village** (feature `village`):
- **Chalets** along the road, gables to it, front yards to the road, some with a woodshed; **two lanes** climbing onto **terraces** with more chalets (each building stands on levelled ground that eases back into the slope).
- A **chapel** with its bell tower in a small graveyard, flak beside it.
- A **sawmill** with log piles and smoke.
- A **ski jump** down the roomier slope: the tower at the top, the in-run (two wooden rails), the take-off, the landing hill widening with blue distance lines and red markers, the outrun on the floor fenced in red, a judges' tower.
- A **cable car** from a valley station by the road over pylons to a **mountain station** near the crest, with a flak post; two red cabins on the cable.
- **Avalanche fences** along the contours of the steeper slopes above the village.
- A **bunker** at the village's entry.
- No village green.

**Presets:** `mountainVillage` (520 px) in the lab instead of `villageWinter`; `winterLine` (28 chunks: frozen sea 10, harbour 5, farmland 8, mountain village 5).

**Checks** (`tests/citygen.mjs`): 180 plans (60 frozen seas, 60 harbours, 60 mountain villages, 30 of the level's first part) pass every hard rule; the mountains with rock, shadows and conifers; the village's parts in every plan (chapel, sawmill, cable car, at least 10 chalets on the road and one on a terrace, avalanche fences, flak and bunker) and the ski jump in all 90; no village green in the level; every earlier preset plans and paints byte for byte as on main.

### 20.3 Level 5 in the game (step 3, first version)

**Owner:** take the train parts and the tunnel out of the harbour; the level 68 chunks or more; then step 3 (the game). Step 2's ground (the station, the airbase, the real pass) is not built yet; as level 4's first version did, those segments get first versions or placeholders in the winter land so the level can be flown end to end.

**The level:** `ENIGMA_SEQ[4]` is in chunks and **70** long (`ENIGMA_LEN[4]`): `open_sea_ice` 10, `harbour_winter` 5, `farmland_winter` 8, `village` 5, `lake_valley` 7, `station_winter` 9, `airbase_snow` 7, `forest_conifer` 7, `pass` 7, `farmland_winter` 5.

**The harbour** has no quayside track and no tunnel any more (coast option `quayTrack: false`).

**The winter land, the rest of the level** (one valley between mountains from the village to the level's end; features from the segments):
- `lake_valley` (feature `lake`): the floor widens to one side, where a **frozen lake** lies (`K.ICE`, B -86, game type `ice`) with five fishing huts on it; the road skirts it; an **ice road** (a tank route along the strip, `st.ice`, packed snow with two worn tracks) leaves the road at the lake's south end, crosses the ice and joins the road again at its north end.
- `station_winter` and `airbase_snow` (feature `plain`): the valley, until their own ground is built.
- `forest_conifer` (feature `forest`): snowy conifers dense on the floor and higher up the slopes.
- `pass` (feature `pass`): the valley narrows to a gorge (a floor of 13 px either side of its axis), its walls a third higher. The flight limit (owner 3A) is not built yet.
- the last `farmland_winter` (feature `throat`, owner 1B): a **spur** of mountain closes the valley. The road ends in a tunnel in it. Two railway lines come out of **tunnel portals** in the spur (the yard's tracks 3 and 4, x 96 and 122) and fan out on long points (about 1 in 3.3, the outer tracks first) onto the yard's **eight tracks** (x 18 + 26 i). The mountains fall away behind the spur. Over the last 72 rows the yard's ballast spreads between the tracks (B -98; the game paints it in the yard's own colours, with theme 1's winter grade, `planYardColor`), so the throat runs into the yard without a seam.

**Speed:** the winter land's heights take their large noise from a 2 px grid; cast shadows are one pass carrying the horizon along the light's diagonal; tree spacing uses a grid. The whole plan is built in about 1.2 to 1.4 s in Node (the town part about 0.5 s, the winter land about 0.6 s), once when the level starts. That is more than level 6 (0.5 s); trimming the town part is the next lever if a phone stalls.

**In the game:**
- **Sortie:** `gen: 5`. The boss is called as in the Campaign's stage 5, once the yard fills the screen (`bossAt`/`arcLen` = the level's length + `yardWait()`, which is `ceil(H / CH) - 1 - ceil(XH / CH)`, at least 1).
- **Plan:** `sortiePlanLevel5` builds the `winterLine` preset over the whole level from its first chunk, from the sortie's segments.
- **Biomes** (`SORTIE_BIOME`): the frozen sea `sea`, the harbour `city`, the farmland, the lake valley and the placeholder station and airbase `country`, the village `country`, the forest `forest`, the pass `fortline`.
- **Past the level:** the Campaign's `bossland` with theme 1 (`ryard`), as before. In level 5 the yard's buffer stops are left out (`railEndsC`), since the throat's tracks run on into it.
- **Ships on open water only:** `seaOK` holds for level 5 too, so destroyers, PT boats and boats never spawn on the ice.
- **U-boats in the ice holes:** `planBerths` serves the frozen sea's holes as it serves 6B's pens (rising, firing, diving, rising again).
- **U-boats break through the ice** (owner): `planIceBreaks` fires at each of the plan's break places once it is in the top 30 percent of the screen. Cracks spread from the spot for `ICEBRK.crack` (80) frames while the U-boat waits below, unseen and untouchable (sub state `break`); then the ice bursts into chips, a hole of open water opens (the decal `icebreak`, drawn under the units), and the U-boat rises in it and fights as in any hole.
- **Gun slots:** level 5 fills its plan's slots as they come up (flak, artillery, bunkers), like levels 2 and 4.
- **Fixed on the way:** that line has had a `//` comment in the middle since level 4, which hid everything after it, so levels 2 and 4 had only filled their parked-plane and AA tower slots: no flak, artillery, bunkers or dug-in tanks came from their slots. It is a `/* */` comment now, so those slots are filled as section 18.5 intended. Levels 2 and 4 get more ground guns than before. The Campaign does not use this code.
- **Snow:** the Campaign's stage 5 snow falls the whole way for now. The weather plan (clear, light snow, snow) is step 4, after the mockups.

**Tests** (`tests/enigma.mjs` 3h; the sortie table now expects level 5 with `gen 5`, 70 chunks and its `bossAt`):
- The plan passes the hard rules and covers the level.
- It begins over the frozen sea, with U-boat holes and places to break through.
- The mountain village has no green; the lake has its huts and its ice road.
- Ground types come from the plan.
- The throat's eight tracks reach the level's end on the yard's tracks, with the yard (`ryard`, theme 1) after them and no buffer stops.
- Flown by the bot: U-boats in the ice and a break through it; the train boss is called once the yard fills the screen; it comes; and the level returns to the picker.

**Gun positions are few for now:** the plan has 7 gun slots (the harbour's mole and roofs, the village's flak and bunker, the mountain station's flak); a bot flight filled 2. The station, the airbase and the pass (step 2) are where most of the level's guns will stand.

**Not yet:** the station and the airbase (step 2), the real pass with its viaduct, avalanche sheds and the flight limit (3A), trains on the level's own railway (its straight runs are short; the yard's supply trains run in the boss fight), convoys on the ice road (it is a tank route, so vehicles may already take it), and the weather (step 4).

### 20.4 Mockup: a viaduct over a gorge, the boss yard on the frozen lake (owner: options 3 and 2 combined)

The owner asked how to make the last part and the train boss unlike level 3's yard (the fight may change), and for a mockup of option 3 (a viaduct over a gorge before the yard) with option 2 (the yard on the frozen lake; precedent: the railway over the ice of Lake Ladoga, 1941–42). Published as "Winter Line Finale" (generator ground and frames from the real game, the bot flying a scratch copy).

**In the generator** (switchable, not used by level 5 yet): `winterLine`'s `finale: 'iceYard'` with `arena` chunks (preset `winterFinale`, 48 chunks of arena, because the boss fight keeps scrolling). Below the spur the two lines cross a **gorge** (level 2's ravine painter in grey rock, `C_WINTER.rock`) on a **double-track stone viaduct** (`K.RBRIDGE`, B -22, `plan.viaduct2`: parapets with pier refuges, snow on its deck, its shadow in the gorge), fan out on points of about 1 in 2.4 onto the yard's eight tracks, and run onto the **lake ice** (`K.ICE`, B -87), sleepers and rails on the ice (`K.RAIL`, B -99), drift ridges and refrozen shell holes between the tracks. Level 5 and every earlier preset are unchanged (checked).

**To build it in the game:** the plan reaches on past the level's end (`planC1 = len + arena`) and paints the arena while the boss code keeps its `bossland`; crossovers painted on the ice where the trains switch tracks; supply sledges in place of the platforms; and the owner's choice of fight changes (sinking wrecks, bombs breaking the ice and blocking tracks, the ice cracking under the boss, ski troops and flak sledges).

### 20.5 Mockup: two hillside viaducts across a gorge, with avalanches (owner: option 1)

The owner preferred a second finale, called option 1, over the ice yard (20.4): a deep, narrow gorge with a frozen river far below, one double-track hillside viaduct on each wall, and the chasm between them. It was drawn by hand at game scale (not by the generator) and published as "Winter Line Gorge", in three rounds:

- **Wider gorge** (owner): 46 px between the arcades. The tracks sit at x 36 and 68 on the left viaduct and x 156 and 188 on the right, 32 px apart. The boss train is about 26 px wide (its sparks fly 13 px either side), so a supply train passes it with a clear gap. The boss keeps the inner tracks (68, 156) and the supply trains use the outer ones. Crossovers stay within a viaduct.
- **Avalanches** (owner's pick among the set-pieces offered: a bridge across the gorge, cars falling into the gorge, avalanches, tunnel hideouts, a blown span, closing weather): snow cornices stand on the wall tops above the outer tracks. A bomb sets them off; in the mockup, a Nova breaks every cornice on screen. The slide sweeps across the outer track and stops in the middle of the deck. It mainly hurts the supply trains: one under the slide is wrecked, while one under an avalanche gallery or in a tunnel is protected (the snow pours over the roof). The galleries cover only the outer tracks, so the thick boss train fits beside them. The mound stays and blocks that stretch of track.
- **What sets a cornice off** (owner): a Nova, which breaks every cornice on screen, or the blast of an **explosives car** (a new supply car, red with a yellow and black band) shot while it passes under a cornice. Guns alone cannot crack a cornice.
- **The bridge across** (owner: only supply trains use it, and they fall): a steel truss bridge joins the two outer tracks near the middle of the arena and crosses the inner tracks on the level. A supply train takes it only when no boss train is near the crossing; the boss never leaves its side. Supply cars destroyed over the chasm tip off, fall (shrinking and spinning) and go through the river ice (the U-boat ice-break effect); cars still on the deck burn where they stop. The truss stays standing.
- **Build order:** (1) the generator paints the gorge, the viaducts, galleries, tunnel spurs, cornices and the bridge past the level's end as the arena; (2) the boss gets the four-track list for level 5 and the supply trains the explosives car; (3) cornices, slides and the mound blocking a track; (4) the bridge run and the fall. The Campaign's train boss stays as it is.

Nothing of this is in the generator or the game yet. Level 5 is unchanged.

### 20.6 Option 1, step 1: the gorge in the generator (for review in the city lab)

`winterLine` with `finale: 'gorge'` (preset `winterGorge`, 48 chunks of arena past the level's end, as the iceYard mockup) builds the finale in `winterLand`; `stackPlans` carries `plan.gorge`. The game does not use it yet; level 5 still uses `winterLine` and the Campaign's yard.

- **Columns** (`GZ`, fixed in x): the left viaduct's retaining wall (x 20–21), deck (22–81), parapet (82–83) and arcade face (84–88); the chasm (89–134); the right face (135–139), parapet (140–141), deck (142–201) and wall (202–203). The tracks are at x 36 and 68 on the left and 156 and 188 on the right. The boss trains will use the inner two, the supply trains the outer two.
- **Approach:** the spur closes the valley as before. Its four tunnel mouths are at the tracks' places, and the road ends in its own tunnel. The tracks run on ballast up a narrow valley; the frozen river runs between them (K.ICE, B -88). From 110 rows past the spur the chasm opens around the river, and 70 rows later the decks begin with an abutment. The gorge is open from about 118 rows before the level's end.
- **The viaducts** (K.RBRIDGE, B -23, game type 'railbridge'): snow on the deck, ballast, sleepers and rails (plan.RM). The parapet bulges into refuges (`gorge.refuges`); below it are piers and arches, the left face in shade and the right one lit.
- **The chasm** (K.RAVINE, B -71, game type 'ravine'): the frozen river far below, wobbling (`gorge.cx` per row); the west wall dark and shaded by the left arcade; the east wall lit in strata; drifting mist; rock lips where the valley opens; wrecks on the ice (`gorge.wrecks`).
- **Galleries** (K.RBRIDGE, B -24; `gorge.gal`): over the outer tracks only (x 12–49 and 175–212), 60–110 rows long between open stretches of 90–180 rows. They have a snow roof, end walls, and pillars with openings on the track side. The left gallery casts a shadow onto the deck. They stay more than 13 px from the inner tracks, so the boss train fits beside them.
- **Tunnel spurs** (`gorge.spurs`): every 420–640 rows, alternating sides, a rock spur covers one deck for 44–60 rows. The tracks pass through it in mouths 29 px wide, wide enough for the boss train.
- **Cornices** (K.SLOPE, B -72; `gorge.corn`: side `s`, centre row `y`, `half`, `over`): a snow lip on the wall top with a blue edge over the track, in the middle of each open stretch, and over half of the galleries (`over: 1`). These are the avalanche triggers for step 3.
- **The supply trains' bridge** (`gorge.bridges`, one per 1300 rows of arena; two in 48 chunks): an S-curve from one outer track, across both inner tracks and the chasm, to the other outer track over 130 rows. Its steel truss (K.RBRIDGE, B -25) has girders, cross members and snow, and casts a shadow into the chasm. No gallery or spur lies within 30 rows of it.
- **Tests** (`tests/citygen.mjs`, gorge finale, 12 seeds): the hard rules; the arena is 48 chunks; the gorge opens just before the level's end; the four tracks never break; every arena row has the chasm, the decks are complete, and no gallery comes within the boss train's room; galleries, open cornices and spurs on both sides; every cornice is drawn, and an open one never lies over a gallery; each bridge has a truss over the chasm, meets both outer tracks and is clear of galleries and spurs; the ground types; determinism; painting in bands equals painting whole. Every other preset paints exactly as before.

### 20.7 Option 1, step 2: the gorge in the game, the boss on four tracks, the explosives car

- **The plan:** level 5 uses the preset `winterGorge`. The plan reaches on `GORGE_ARENA` (48) chunks past the level's end (`planC1 = len + 48`), so the arena is painted and typed by the plan: chasm 'ravine', viaducts and galleries 'railbridge'. The arena chunks keep their bossland (theme 1), so the boss is called as before (`bossAt = len + yardWait()`), once the gorge fills the screen.
- **Four tracks** (`GORGE_T` = 36, 68, 156, 188; `gorgeArena()` is true in level 5's arena): the boss trains start on the inner tracks (68 left, 156 right). Their crossovers (`gorgeXover`, the yard's 240 px period and 120 px S-bend) only run within a viaduct (`XO_SEQ5`: 68 to 36 and back, 156 to 188 and back). None lies under a gallery, in a spur or within 24 rows of the bridge. A boss train does not step onto an outer track while a supply train is on it. The crossovers are painted onto the plan's chunks on the trains' own curve (`gorgeXoverPaint`). The Campaign's yard keeps its eight tracks and its crossovers (`yardXover(k, true)`).
- **Supply trains** (`yardSupport`) run on the outer tracks only. In the gorge, 45% of them carry an **explosives car** (`ammocar`: a red van with a yellow and black band and a warning diamond on its roof). It has a boxcar's hit points and scores 800. It goes up in a big blast that damages every ground target within 44 px by 40, which wrecks the cars coupled to it. In step 3 the blast will set off the cornice above it.
- **Cover:** what lies under a gallery's roof or in a spur's tunnel (`roofAt`, `gorgeRoofs`) is drawn under it, because the roof's pixels are drawn again from the painted chunks after the boss (`drawRoofs`). It is also out of reach: supply cars there are untargetable, and the boss's parts there are shielded (`BOSS.train.shielded`).
- **No platforms:** no crates or sheds spawn in the gorge. Instead a flak gun stands in each parapet refuge as its chunk comes up (`yardProps`).
- **Tests** (`tests/enigma.mjs` 3h): the plan covers the level and the 48-chunk arena. The four tracks run through the level's end into the arena, whose types are 'ravine' and 'railbridge', with no buffer stops. Flown by the bot: the boss comes once the gorge fills the screen; its trains never cross the chasm and keep mostly to their inner tracks; the supply trains run on the outer tracks only. A new block (3h') checks that a gallery covers its outer track and nothing beside it, and that the explosives car's blast wrecks the car coupled to it.
