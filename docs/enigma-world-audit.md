# Enigma Run: audit of the existing world code

Status: draft 1, written from a read of `index.html` (the terrain section, `drawFeatures`, the director's ground spawning, the weather and sprite tables). Nothing was run or rendered. Every verdict below says how sure it is: **read** means I read the code, **grep** means I only searched for it.

Purpose: before a new terrain generator is specified, find out what the campaign code can be reused as it is, what must be parameterised or refactored, what is tied to the campaign, and what does not exist. The campaign stays untouched.

Line numbers drift; search for the function name.

## 1. How the world is built today (read)

| Fact | Detail |
|---|---|
| Size | `W = 224` pixels wide, a chunk is `CH = 64` pixels tall. The world scrolls upward; chunk `p` covers world y from `-p*CH` to `-p*CH + CH`. |
| Terrain is a pure function of position | `classify(wx, wy)` gives a terrain type (`tt`), `pixelColor` turns it into a colour. Both depend only on `(wx, wy)`, the seed (`world.SEED`, through `hash` and `vnoise`) and the chunk's `info(p)`. |
| Chunk pipeline | `startChunk` -> `workChunk` (pixel slices, time-budgeted per frame) -> `drawFeatures` (stamps trees, houses, farms, tents, stations, scars on top). At most 14 chunks are kept. |
| Chunk metadata | `info(p)` / `predictInfo(p)` returns `{b, th, q, river, rw, island, lake, rail, rails}`. `b` is the biome and comes from `biomeForQ(q, th)`, a hard-coded if-chain per theme. `q` is the chunk's index in the stage (one step is `STAGE_LEN` = 1.3 chunks). |
| Theme `th` | A number 0 to 5 that also selects the palette (`THEME_RGB`), tree and house sprite sets, weather, music (`STAGE_SONGS`), set pieces (`SET_PIECES`) and the boss (`BOSS_KINDS`). |
| Feature placement | Stateless: every feature is a hash of a world-space grid cell (trees 9 px, houses 34 px, tents 100x90, farms 150 px rows, scars 46 px). A cell can ask `terrainType`, `railDist`, `waterIn` and its neighbours. This is why the same chunk looks the same every time. |
| Randomness | Terrain and features use `hash`/`vnoise` (seeded by `world.SEED`). The campaign seed is fixed at 1944; Endless and generative mode (`settings.mode === 'gen'`) use a random seed per run. Enemy spawning uses the per-run seeded `Math.random` stream. |
| Tests that pin behaviour | `tests/replay.mjs` and `tests/golden.json` (simulation checksums), `tests/perf.mjs` (chunk generation speed). |

## 2. Hard-wired assumptions that block a new generator (read, counts by grep)

1. **One road per stage.** `roadX(wy)` is a single global road curve (five shapes, blended across 640 px segments). It is called about 39 times and is also used as "the road" by houses, trees, farms, tents, tanks, convoys, bridges and lighthouses. Several roads, junctions or a road that ends are not possible without changing every caller.
2. **Theme number does everything.** About 80 comparisons such as `th === 3` or `curTheme === 1` are spread through terrain, features, director, weather and bosses. Climate (look), stage (order, boss, music) and weather are not separate settings.
3. **Biome is a function of chunk index and theme.** `biomeForQ` is an if-chain. There is no table, so a new sequence of segments means editing code, not data.
4. **Coast is one horizontal band.** `coastLine(wx, p)` gives a wavy east-west line inside one chunk, `coastUp` or `coastDown`. Islands, bays, harbour basins, vertical coasts and open water with land on both sides do not exist.
5. **Rails are fixed vertical lines** at `RAILX = 18` and the boss rails. No curves, junctions or sidings. Stations exist only where a rail meets a coast (`railEnds`).
6. **Features cannot see each other except through a few helpers** (`inFarm`, `inTent`, `inStation`, `waterIn`, `propFree`). A new feature has to be added to each of these checks or it can be placed on top of the others.
7. **Large structures are told to the terrain through special-purpose caches.** `castleInfo()` is the pattern: one function that finds the castle's rectangle and that `classify` consults. This is a useful precedent for a general "composition" lookup.
8. **Many caches are keyed to the campaign** (`farmCache`, `tentCache`, `houseCache`, `fieldOkCache`, `roadCache`, `castleCache`, `railEndCache`) and cleared in `newGame`. A second generator would need the same clearing.

## 3. Component audit

Verdict key: **Reuse** (as it is), **Parametrise** (reuse with the theme/climate decoupled), **Refactor** (the idea is right, the structure is not), **Campaign-only** (do not touch, copy ideas), **Missing**.

| Component | Where | Verdict | Notes |
|---|---|---|---|
| Hash / noise / dither | `hash`, `vnoise`, `bay`, `pickI` | Reuse | Pure apart from `world.SEED`. The dither stays as it is (Enigma prompt). |
| Chunk pipeline | `startChunk`, `workChunk`, `ensureChunks` | Reuse | Time-sliced, works for any `pixelColor` and `drawFeatures`. The winter tint is baked into `workChunk` and keyed on theme 1. |
| Biome sequencing | `biomeForQ`, `predictInfo` | Refactor | Replace the if-chains with a table of segments (the composition template). Keep the `info(p)` shape. |
| Terrain classifier | `classify` | Refactor | One long branch per biome. The terrain-type vocabulary (`sea surf sand grass field forest road rail river bridge railbridge ice mud concrete runway taxi yard street roof park croad ryard`) is good and used by about 50 callers of `terrainType`, so keep it. |
| Palettes | `TR`, `THEME_TR`, `C2`, `CITYC` | Parametrise | Six themes act as climates (temperate, winter, desert, night, dark forest, city). Split "climate palette" from "stage". Night is a tint, not a palette. |
| Sea | `classify` `sea`, `surf` | Reuse | Plain open sea with surf. No depth bands, shoals, reefs or ice. |
| Coast | `coastLine`, `coastUp/Down` | Refactor | Horizontal only. Beaches exist as `sand` plus `hedgehog` obstacles. No cliffs, mudflat, harbour or bay. |
| Islands | `riverD` (islands inside rivers only) | Missing at sea | River islands exist for bridges only. |
| Rivers | `riverY`, `riverD`, bridges | Parametrise | One east-west band per chunk with a sine shape. Estuary, canal, diagonal course missing. Lakes are ellipses in the winter theme only. |
| Roads | `roadX` | Refactor | See assumption 1. Also: no bridges other than river bridges, no junctions. |
| Rails and stations | `railHit`, `railEnds`, `drawStations`, `G('station')` | Refactor | Fixed vertical lines. One station type, at the coast. Rail bridges exist. |
| Fields | `parcel`, `fieldColor` (theme 0), `fieldCell`, `fieldColorE` (others) | Reuse | Two code paths. Theme 0's parcel system is the better one; Enigma already adjusts both. |
| Trees | `treeOk0`, `treeList`, `SPR.treeSets` | Parametrise | One tree system; sprite sets per theme: round deciduous (0, 3, 5), snow (1), palm and scrub (2), dark round (4). **There is no conifer sprite** (grep for conifer, pine, spruce, fir found nothing). |
| Forest | `tt === 'forest'` plus trees | Reuse | Density is one setting per terrain type. No clearings, edges or forest roads beyond the main road. |
| Houses | `houseCand`, `houseAt`, `SPR.houseSets` | Parametrise | Single houses scattered on fields, themed sets per climate. No clusters, so **no villages**. Needs meadow and farm checks (theme 0). |
| Farms | `farmAt`, `inFarm`, `SPR.barn/farmhouse/silo` | Reuse | Two columns, 150 px rows, only in themes 0 and 4 (castle fields). Good basis for a "farmstead" feature. |
| Tents and camps | `tentAt`, `inTent` | Reuse | Field hospital and mess tent with a fire (`chunkFires`). |
| Lighthouse | `lighthouseAt` | Reuse | Coast only. |
| City | `cityCell`, `cityBuilding`, `cityType`, `cityColor`, `cityBldAt` | Refactor | A fixed 56x48 block grid, five block kinds (perimeter, rows, rubble, park/square, church). One street grid, one density. Facades and roof palettes are reusable. This is the main redesign target. |
| City props | `props` (spire, block, chimney), spawned by the director | Reuse | Raised drawn objects with their own placement check (`propFree`). Chimneys emit smoke (`smokePuff`, corrects my earlier remark that smoke was missing). |
| Factory | `factCell`, `factoryType`, `factoryColor` | Parametrise | 64x56 cells: hall, warehouse, gas tank, oil tank, yard. Only in the city stage. Types of industry beyond these are missing. |
| Air base | `base` biome, `runway`, `taxi`, `G('hangar')`, `G('parked')` | Parametrise | Fixed runway at x 60 to 104, the same layout every time, only in themes 0 to 3. No context variants. |
| Fortline and castle | `fortColor`, `castleInfo`, `farmAt` castle branch | Campaign-only | One castle per stage 4, boss arena. `castleInfo` is the pattern to copy, not the code. |
| Boss arenas | `bossland`, `ryard`, `BOSS`, `BOSS_KINDS` | Campaign-only | The boss is chosen by `BOSS_KINDS[curTheme]`. Mini-bosses as a generic concept are missing. |
| Naval enemies | `G('pt')`, `G('destroyer')`, `G('sub')`, `boatNear`, `worldLife` boats | Reuse | Small ships and a sub exist as targets. Carrier, convoy formation and a respawning ship are missing. |
| Ground enemies | about 30 types via `G()` (flak, tank, bunker, radar, search, gen, aatower, casemate, sandbag, arty, popup, camo, loco, station, hangar, parked, fuel, ...) | Reuse | Placed with `tryLand`, `placeOK` and `terrainType`, not with a feature "slot". |
| Director | `director`, `directorInner`, `spawnGround`, `spawnWave`, `ARC`, `SET_PIECES` | Parametrise | Spawns by biome name and theme. Generative mode (`settings.mode === 'gen'`) already picks set pieces from a random pool, so a hook exists. |
| Battle damage, static | `drawFeatures` "old battle scars" (scorch, wrecks) | Parametrise | About 15 percent of 46 px cells on field, grass, mud, forest: the same density in every stage. Not a damage level. |
| Battle damage, live | `worldDamage`, `burntTrees`, `damagedHouses`, `decals`, `bridgeDown` | Reuse | Explosions scorch trees and houses and break bridges. Persistent for the run. |
| Weather | `rainT`, `snowF`, `dustF`, `nightF`, lightning, `windX`, `stormK`, `drawWeather`, `flakes` | Refactor | Selected by theme (rain in 0 and 4, snow in 1, dust in 2, night in 3). `windX` and the sandstorm already push the plane and the bullets, so wind as gameplay has precedent. Fog, heat shimmer and snowstorm do not exist. |
| Clouds | `clouds`, `hiClouds`, Enigma cloud sprites | Reuse | `ENIGMA_T` already controls opacity. Density levels as a setting do not exist. |
| Critters and dressing | `worldLife`, `critters`, `treads`, `birds` | Reuse | Sheep, horses, deer, ducks, gulls, civilians, cars. |
| Resume and replay | `saveResume`, `resumeRun`, `tests/replay.mjs` | Must not break | The new mode must save its own settings with the run and must not change the golden checksums. |

## 4. Findings that change the plan

1. **The world is stateless, which is an advantage.** A generator that is also a pure function of position and one extra "sortie" descriptor (like `castleInfo`) fits the existing design and keeps runs reproducible and resumable.
2. **Decouple `th` before anything else.** A new mode needs climate (palette, tree set, house set), weather and stage (boss, music, set pieces) as separate fields. The cheapest way is a descriptor object for Enigma Run that provides these fields and a thin adapter that turns the old `th` checks into `desc.climate` checks only where the new code needs it. The campaign code can stay as it is.
3. **Single road is the largest structural limit** for "several roads with tanks" and for believable city and village layouts. Options to decide in the spec: a list of road polylines in the descriptor (with `roadX` kept as "the main road"), or a road field function.
4. **Villages, conifers, islands, harbours, a carrier and multi-road forests are all genuinely new.** Everything else on your list has a seed in the code (stations, farms, camps, factories, bases, castles, city blocks, damage, weather).
5. **Gen mode is the natural consumer.** It already randomises the seed and the set-piece pool; it does not randomise the terrain.
6. **Performance is a real budget.** The chunk build already runs a pure-JS per-pixel function under a few ms per frame (`ensureChunks`, `tEnd = 1.6 to 2.6 ms`) on phones. New terrain types must not add per-pixel cost that scales with the number of features (use the same cell-hash lookups).

## 5. Not yet checked (to do before the spec is final)

- How tied the tutorial and title screen are to chunk generation (the Enigma slider notes they use the original look).
- Whether `drawFeatures` needs `world.featTheme` in a way a descriptor cannot supply.
- How `worldLife` and the director depend on `info(p).b` strings (about 18 direct checks) when a new segment type is introduced.
- Exactly which of the ~80 theme checks affect only visuals and which affect the simulation (replay).
- A measured baseline of chunk-generation time per theme, using `tests/perf.mjs`.
- A visual baseline of each stage (screenshots), which the Enigma prompt already describes how to take.
