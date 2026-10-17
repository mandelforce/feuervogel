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

**Level 2: Sea of Sand** (desert, heat shimmer, dust, sandstorm gusts at the boss). Boss: Sand Colossus. Total 48.
`harbour_commercial 4` (desert) -> `beach_town 3` -> `valley 7` (oil field, wadi) -> `village 4` (desert) -> `station_junction 6` (convoy on the road) -> `desert_open 4` (oasis, irrigated fields) -> `airbase_desert 6` -> `pass 7` (fortified) -> `desert_open 7` (quiet approach) -> boss arena.
*Landmark:* a small oasis (`oasis`) with a pool of water, palm trees, a few houses and a well. It is placed in the `desert_open 4` segment.

**Level 3: The Long Night** (night, lightning, then low mist). Boss: the supergun. Total 50.
`beach_fortified 3` (searchlights) -> `industrial_power 7` (pylons, smoke) -> `station_marshalling 7` -> `farmland 7` (night, mist) -> `city_small 4` (lit windows, searchlights, burning houses) -> `airbase_searchlight 6` -> `forest_deciduous 5` -> `industrial_light 6` -> `rail_corridor 6` (two rails) -> boss arena.
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

- **Route objects** for enemies that drive on roads (section 2): deferred. I will bring this up again at the start of phase 3 (routes, rails and streets), and at the end of phase 1.
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

