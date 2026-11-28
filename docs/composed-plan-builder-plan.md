# One plan builder for composed sorties (audit C1)

Status: **built**: the plan builder in build 1.2.6.64, the kit's game data in 1.2.6.65 (composer v7, unchanged; no date changes). Draft 1 of this plan (2026-11-28) proposed a probe, a stored reference file and four phases; the owner asked for less, and the lean version below is what was done. Background: `docs/daily-sortie-generator-audit.md`, gap C1. The rules this sets for new kits are also in `ARCHITECTURE.md` ("The Daily Sortie's plan").

## 1. What it replaced

Before, each Campaign level's plan builder in `index.html` (`sortiePlanHarbour`, `sortiePlanIslands`, `sortiePlanLevel2`, `4`, `5`) had a separate branch for a composed sortie. Every branch generated `S.compose.gen` the same way, then set the plan's limits by its own sum:

| Kit | `planC1` (the first chunk after the plan) | Extra |
|---|---|---|
| city, desert, forest | `len - legacyTail + cityArena` | |
| temperate | `planEnd + cityArena`, `planEnd = len - legacyTail` | `planGap` from the arena's start; `planBiome` per chunk |
| winter | five cases: sea ending, airfield, the wolfpack's ice, the supergun's gorge, the train's gorge (`GORGE_ARENA`) | |

That was four copies of one idea in different forms. A new kit or a new ending meant a new case in a Campaign builder.

## 2. What was built

- **`CityGen.planSpan(plan)`** (`tools/citygen.js`, next to `tankPits`). It is pure and reads only the plan. The plan covers rows 0 to `plan.L`, and its arena (`plan.arena`, rows `y0` to `y0 + L`) when it has one. It returns, in sortie chunks:
  - `end`: where the level's own plan ends;
  - `c1`: the first chunk after everything the plan covers;
  - `gap`: the chunks between the plan and an arena that starts past it, or null.

  It throws if a plan or arena does not end on a whole chunk, or if an arena starts inside the plan, instead of rounding a builder's mistake away.
- **`sortiePlanComposed(S)`** (`index.html`, before `sortiePlanHarbour`). `sortiePlanBuild` sends every composed sortie there first. It generates `S.compose.gen` and sets `planC0`, `planC1`, `planEnd`, `planGap`, `planY0` and `planBiome` on every call, so a field from an earlier plan never lingers. `planBiome` is set for islands plans only (`S.isles`, the temperate kit), as before. It never tests the kit or the level.
- **`planBiomeOf(P, n)`**: the islands builder's land-share loop, moved out so that level 1 in the Campaign and the temperate kit share one copy.
- **The Campaign's builders** lost their composed branches. `legacyTail` and `cityArena` only come from a composed sortie, so their Campaign sums are now plain: `planC1 = S.len` (level 5: `S.len + GORGE_ARENA`).
- **A test that the generator and composer agree.** `tests/kit-check.mjs` records `planSpan` for every plan it checks. `tests/compose.mjs` (gate 2, every plan) compares it with the span the composer's own numbers give (`wantSpan`: length, legacy tail, `cityArena`, or the winter's `ICE_ARENA` / `RAIL_ARENA` / `kit.arena`). A new kit whose generator builds a different extent than its composer expects fails there, in Node, before it reaches the game.

## 3. How it was checked

- **Old and new side by side in the page,** before the old branches were deleted. For 375 sorties (60 per kit, plus 15 forced archipelago days per kit; 20 to 27 different bosses per kit, the temperate kit's land days included), both builders built the plan of the same `run.sortie`. Every field and the plan (size, a hash of `K`, the slot count, the arena) were identical in all 375, with no page errors. The script was a one-off and is not kept.
- **In Node, first:** over 250 composed lists, the plan's own rows gave the old sums' `planC1` in every case, and every plan ended on a whole chunk. That is what showed the sums could be read from the plan instead of repeated.
- **Tests, all passing:** `compose.mjs` (all kits), `daily.mjs` (341), `fixed-seed.mjs` (41), `enigma.mjs` (213), `citysegs.mjs`, `citygen.mjs` (four shards), `arena-joins.mjs` (36), `smoke.mjs`, `worker.test.mjs`.
- **Not flown in the flight gate:** the plans and their limits are identical, so the flights over them are too.

## 4. Adding a kit now

What a new kit needs, and where:

1. **The generator** (`tools/citygen.js`): a preset that takes `params.segs`, and an arena or finale if the kit has its own. Its plan and arena end on chunk lines. Run `node scripts/embed-citygen.mjs`.
2. **The composer** (`tools/sortie-compose.js`):
   - the `KITS` entry: preset, grammar, lengths, arena, boss pool, and the boss rule (`boss`: `{ add: n }`, `{ into: n }` or `{ yard: true }`);
   - its line in `KIT_GAME`: the tank pits, the Buechse nests, the loop flag, `legacyGrid`.

   Raise `VERSION` if any date's output changes, and run the embed script.
3. **The tests:** a probe for the kit in `tests/kit-check.mjs` (`KITS`) and a plan-time base in `tests/compose.mjs` (`BASE`). If the kit's arena is not one of `cityArena`, the winter's finales or a legacy tail, extend `wantSpan` there, and nowhere in the game.
4. **The game:** nothing for the plan, the boss trigger, the pacing length, the pits, the nests or the loop flags. What a kit still takes from the game is its level (section 5).

## 5. The kit's game data (build 1.2.6.65)

**Moved into the composer.** What the game used to work out from the level or the kit's name now comes from the composed sortie:

| What | Before (`index.html`) | Now |
|---|---|---|
| Boss trigger and pacing length (`bossAt`, `arcLen`) | a formula per level in `buildSortie` | the kit's rule `C.boss`, read by `composedBossAt`. The temperate kit's rule was written `{ add: 1 }` ("one chunk past the level's end"), but the game put the boss one chunk into the last segment, which is what the flight gate flew. It is now written as that: `{ into: 1 }` |
| The Drilling's tank pits | `DRILL_PITS[level]` | `C.game.pits` |
| The Buechse's side nests | `BUECHSE_NESTS[level]` | `C.game.nests` |
| The loop ground's flags on a flavoured day (`variant`, `autumn`, `winter`) | `C.ground && level === 2` (4, 5) | `C.game.loopFlag` |
| The old land's straight roads, gate and rail colours | `C.kit === 'temperate'`, `level === 1 && compose` | `C.game.legacyGrid` |
| The forest arena's seam | `compose && level === 4 && arena.forestA` | `compose && arena.forestA` (only the forest's preset builds that arena) |

`C.game` is copied from `KIT_GAME` (`tools/sortie-compose.js`), always from the kit itself, so an archipelago or land day keeps its kit's values, as before. `tests/compose.mjs` (3b) checks every kit's boss rule and game block, and that every tank pit's template occurs in the kit's lists.

**Checked.** The last commit and the working copy, each served, built the same 300 sorties: 60 per kit, every fourth flavour (plain, variant, loop, rank), every fifth an archipelago day. Identical in all 300: boss trigger, pacing length, Wing share, loop flags, straight roads, and every slot of the plan with its place (the tank pits and nests included). The loop flags were on in 30 sorties of each of their kits.

**Still taken from the level, on purpose.** A kit borrows a Campaign level, and with it the level's boss code, theme, palette, art, music and timetable (`kit.level`). The game reads those from `S.level`, as it does in the Campaign. That is the audit's B4 (a kit's own look and music), not glue. These also follow the level:
- `gen`, `isles`, `ud` in `buildSortie`: which legacy painters and placement rules the level's ground uses;
- `SORTIE_BIOME`: the legacy biome of each **template** (not each kit), for the director and `placeOK` (audit A6). A kit that brings new templates adds them there;
- the level rules in `sortieInfo` (level 4's cliff-beach and valley biomes, level 3's beach): they apply to a template in that level's ground, in the Campaign too.

A new kit on an existing level therefore needs no game code. A kit on a new level (`night`, level 3) needs the level's lines in these places.

## 6. Found: the Shadow Wing's place on city and temperate days [owner]

The composer places the Shadow Wing at a chunk (`C.wingC`) and checks it against the encounters (gate 1). The game turns it into a share of the pacing length (`wingU`, which the director multiplies by `arcLen`). It divides by the kit's pacing length only for the desert and the forest. Every other kit divides by `at + yardWait()`, which is the winter's length.

Measured over 30 sorties per kit (the Wing's chunk in the game against the composer's):

| Kit | Offset | Share |
|---|---|---|
| desert, forest, winter | 0 | exact |
| city | +0.3 to +0.5 chunks (late) | about 3 % |
| temperate | −2.1 to −3.4 chunks (early) | about 14 % |

The temperate kit's pacing length is one chunk into its last segment, several chunks short of the level's end. `yardWait()` depends on the screen's height but was 4 on both a phone-sized (H 500) and a desktop-sized (H 320) playfield, so the offset is in practice the same on every screen.

The bug is kept, word for word, in `composedWingU` (`index.html`), so this step changes no date. **The fix** is one line: `C.wingC / composedBossAt(C, segs, at)` for every kit. It puts the Wing at the composer's chunk on city and temperate days. It changes how those days play, so it needs the flight gate on the two kits (`daily-gate.mjs --kit city`, `--kit temperate`) and the owner's go-ahead.
