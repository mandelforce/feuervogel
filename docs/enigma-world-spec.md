# Enigma Run: world generator specification (draft 1)

Status: first draft, Sonnet-written, **not yet reviewed**. It builds on `docs/enigma-world-audit.md` (read that first). Numbers in this file are starting values to tune, not decisions. Items marked **[you]** are for the owner to add or decide.

## 0. Scope

- **Enigma Run** is a separate mode: a Settings button opens a level picker (levels 1 to 6, one at a time), modelled on the existing practice picker (`#diffAsk` with the stage row `#dStage`). The Campaign, its stages, scoring, leaderboard and the golden replay checksums stay untouched.
- The new levels are produced by a **world generator** that is also meant to feed generative mode later.
- Visual and structural redesign comes first. Enemies, bosses and set pieces are reused from the campaign and are only attached to the new places through "slots" (section 5). New enemy types are out of scope for now except those listed in section 11.
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

### 1.1 Decoupling theme (from audit finding 2)

The sortie carries the fields that the campaign hides in `th`:

| Field | Meaning | Replaces |
|---|---|---|
| `climate` | `temperate`, `desert`, `winter`, `forest` (dark conifer) | palette, tree set, house set, field style |
| `weather` | a weather plan (section 8) | `snowF`, `dustF`, rain by theme |
| `timeOfDay` | `day`, `dusk`, `night`, `dawn` | night tint |
| `bossKind` | key into `BOSS` | `BOSS_KINDS[curTheme]` |
| `song` | key into `STAGE_SONGS` | `STAGE_SONGS[curTheme]` |

For the six Enigma levels these start with the campaign's values so music and bosses are unchanged. New-mode code reads the sortie; old code keeps reading `curTheme`, which Enigma Run sets to the matching legacy theme **only for the code paths that still need it** (boss, set pieces, weather overlays). The list of those paths is part of the work in phase 1.

## 2. Roads and rails as lists of lines (decision made)

The campaign has one road, `roadX(wy)`. Enigma Run has `sortie.roads`, a list. `roadX` keeps working as "the main road" (`roads[0]` at that `wy`), so every old helper that calls it stays valid for the first road. New code uses the list.

```
road   = { id, kind, w, pts:[[x,y],...], from, to, bridgeIds }
rail   = { id, w, pts:[[x,y],...], from, to, stations:[siteId] }
kind   ∈ track | country | highway | street | runway | taxi
```

Rules:

1. **Vertical roads are functions x(y).** Points are ordered by decreasing y (up the screen) and must be monotone in y. A road can drift, curve and fork, but not loop back. Smooth interpolation is a Catmull-Rom spline sampled into a 4 px lookup table per road at build time, so `roadsAt(wy)` is a table read.
2. **Cross streets are short horizontal roads, `axis:'h'`**, functions y(x) over an x range. They exist inside towns, cities, camps and air bases.
3. **Junctions are explicit.** A road's `from` or `to` can name another road and a position along it. Junctions are drawn as a small circular patch; no free-form crossings.
4. **Rails** follow the same rule, but with a gentler minimum curve radius and no cross streets. Sidings are short rails with `from`/`to` on the main rail. Level crossings are a site connector between a road and a rail.
5. **Bridges are connectors, not terrain.** A road or rail that meets water gets a `bridge` span in its `bridgeIds`, drawn by the existing `bridge` and `railbridge` terrain types and attacked by the existing `G('bridge')`.
6. **Queries** (used by `classify`, placement and the director):
   - `roadDist(wx, wy)` = smallest distance to any road (so `Math.abs(wx - roadX(wy))` becomes `roadDist` in new code).
   - `roadNear(wx, wy, r)` = the road, or none.
   - `onRoad(wx, wy)` is `roadDist < w/2`. Cost: a table read per road active in that chunk. Each chunk keeps a short list of its active roads, built when the chunk is made.
7. **Budget:** at most 4 roads and 3 rails active in one chunk. This limit is what keeps per-pixel cost close to today's.

Open point [you]: should enemies that drive on roads (convoy, tanks) get "route" objects (a road id plus a lane), or keep using `roadX`-based lanes on the main road only? Proposal: route objects, with `road: true` enemies reading `route.x(wy)`.

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

Density is a **maximum**: the validator in section 9 rejects segments that go over it.

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
| Farmland, farmstead | S | A (irrigated, terraced) | S | F | |
| Village | S | A (flat roofs) | S | A | |
| Harbour | S | A | A (ice, icebreaker) | A | needs navigable water on one side |
| Airbase | S | S | A | A (camouflaged) | runway needs 30 px clear margin |
| Station | S | A | S | A | needs rail |
| Industry | S | A (oil field) | A | F | needs road |
| City | S | A | A | F | |
| Castle | S | A | S | S | |
| Forest deciduous | S | F | A | F | |
| Forest conifer | A | F | S | S | needs a new conifer sprite |
| Island fort, carrier | S | S | A (ice floes) | A | needs open sea |
| Beach defences | S | S | A | A | |

Hard rules (the builder rejects the sortie if one fails):

1. A harbour needs navigable water on one side and a road or rail on the other.
2. A station needs a rail; a level crossing needs a road and a rail.
3. A bridge is only generated where a road or rail crosses water.
4. The carrier and ships only appear on open sea at least 80 px wide in x.
5. No two sites overlap; every site keeps its `clear` rectangles free of any other site, road, rail or scatter object.
6. Palm trees only in desert, snow trees only in winter. Conifers not in desert.
7. No spawner within 40 px of the screen edge at the moment it comes on screen (checked as a scrolling sequence, section 9).

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
- **Relief is visual only.** A relief value in `[0,1]` per pixel from noise and authored ridges shifts the ground colour one palette step (light from the upper left). It never changes `terrainType`. `pass` and `valley` templates use the same value to place cliff walls as a drawn edge, not as a gameplay barrier. This keeps the simulation and the replay checksums independent of relief.
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

Run at build time (in a test harness, over many seeds) and optionally in a debug overlay.

1. **Hard constraints** (section 4.4): fail the seed.
2. **Density:** per template max (section 3.2), measured as the area share of non-open ground in each chunk; plus a minimum **negative space** (starting value: in every 224 x 120 px window, an open lane at least 40 px wide).
3. **Scroll sequence:** a simulated view scrolls the whole level; check that no landmark pops in within 1 second of the screen's top edge without a clear approach, that dense stretches (above 50 percent) are at most 3 chunks long without a quieter one after, and that rhythm alternates (dense, sparse, landmark, sparse).
4. **Readability:** each climate palette is tested against the enemy bullet colours: minimum luminance difference and hue difference of the darkest and brightest ground steps. Effects (smoke, mist, rain, snowstorm, heat) are tested stacked at their maximum on each climate and must keep the bullet colours distinguishable.
5. **Connectivity:** every road and rail has both ends on a seam or the level edge; every site's connectors meet a road, rail or water.
6. **Performance:** chunk generation time per template vs. the campaign baseline (`tests/perf.mjs`, a few percent allowed); per-chunk active roads, rails, sites within the budgets.
7. **Determinism:** same seed gives the same sortie and same chunk pixels; `node tests/replay.mjs` is unchanged for the campaign.
8. **Visual review:** a contact sheet of N seeds for each level and each template (Playwright, as described in `docs/enigma-prompt.md`).

## 10. The six levels as segment sequences (draft, for you to change) [you]

Lengths in chunks (a campaign stage is about 48 chunks). "Density" is the planned peak. Order is the Campaign order. Bosses and music are the campaign's.

**Level 1: Cross the Channel** (temperate, day, scattered cloud, rain showers in the second half). Boss: the flagship.
`open_sea 3` -> `island_chain 6` (carrier mini-boss as `fleet 4`) -> `beach_fortified 3` -> `farmland 6` (river with bridge) -> `village 3` -> `forest_deciduous 4` -> `airbase_forest 5` -> `farmland 3` -> `harbour_small 3` -> `boss_arena_sea 4`.

**Level 2: Sea of Sand** (desert, heat shimmer, dust, sandstorm gusts at the boss). Boss: Sand Colossus.
`harbour_commercial 4` (desert) -> `beach_town 3` -> `valley 5` (oil field, wadi) -> `village 3` (desert) -> `station_junction 5` (desert; convoy on the road) -> `airbase_desert 6` -> `pass 5` (fortified) -> `boss_arena_saltpan 4`.

**Level 3: The Long Night** (night, lightning, then low mist). Boss: the supergun.
`beach_fortified 3` (searchlights) -> `industrial_power 6` (pylons, smoke) -> `station_marshalling 6` -> `farmland 6` (night, mist) -> `airbase_searchlight 5` -> `forest_deciduous 4` -> `rail_corridor 5` (two rails) -> `boss_arena_rail 4`.

**Level 4: The Iron Forest** (dark conifer, rain, mist). Boss: Ravenhold castle.
`beach_cliff 3` -> `forest_conifer 7` (roads, convoys) -> `forest_fortified 6` -> `clearing_village 4` (logging camp) -> `airbase_forest_hidden 5` (camouflaged) -> `forest_fortified 6` -> `farmland_approach 5` -> `castle_forest 4` (boss).

**Level 5: The Winter Line** (winter, light snow rising to a snowstorm). Boss: the armoured train.
`open_sea_ice 3` -> `harbour_winter 4` -> `farmland_winter 6` (villages) -> `lake_valley 5` -> `station_winter 7` (train convoy) -> `airbase_snow 5` -> `forest_conifer 4` (snowstorm) -> `boss_arena_yard 5`.

**Level 6: The Burning City** (temperate, dusk, smoke; damage grows from light to ruined). Boss: the skyfortress duel.
`harbour_commercial 4` (wrecks) -> `industrial_harbour 5` -> `city_suburb 5` (light damage) -> `city_centre 9` (river with bridges, squares, churches, grid broken by a ring road; heavy damage) -> `industrial_power 5` (smoke) -> `ruins 5` (ruined) -> `station_main 4` -> `boss_arena_air 5`.

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

## 12. Implementation phases

1. **Foundations** (no visible change): the `SORTIE` object and `buildSortie`, road and rail lists with `roadsAt`/`roadDist`, `info(p)` fed by the sortie, a way to start a level in Enigma Run from the Settings button and level picker, a debug page that renders a contact sheet.
2. **Ground**: sea, islands, coast, rivers, relief, climate palettes, conifers.
3. **Settlements**: farmland, village, forest templates, then the city and industry.
4. **Sites with slots**: harbour, air base, station, castle; wiring to the director.
5. **Atmosphere and damage**: weather plan, fog, damage levels.
6. **Validator and tuning**: all of section 9 in the test suite.
7. **Gen mode hook**: lazily extended sortie for endless/generative play.

Each phase ends with a contact sheet of the six levels and a test run.

## 13. Open questions [you]

1. Is the carrier a mini-boss that must be destroyed to continue, or a threat the player may ignore (its spawns stop only when it is destroyed)?
2. Should each Enigma level keep the campaign's boss unchanged, or is the new boss arena allowed to change the fight?
3. Are the proposed density ceilings (section 3.2) the right order of magnitude, or should levels feel much emptier?
4. Do scores in Enigma Run count anywhere (a local best per level), or are they like Practice?
5. Level order: Campaign order as above, or the theme order of the README?
