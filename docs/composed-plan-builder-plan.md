# One plan builder for composed sorties (audit C1)

Status: **built** in build 1.2.6.64 (composer v7, unchanged). Draft 1 of this plan (2026-11-28) proposed a probe, a stored reference file and four phases; the owner asked for less, and the lean version below is what was done. Background: `docs/daily-sortie-generator-audit.md`, gap C1. The rules this sets for new kits are also in `ARCHITECTURE.md` ("The Daily Sortie's plan").

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
2. **The composer** (`tools/sortie-compose.js`): the `KITS` entry (preset, grammar, lengths, arena, boss pool). Raise `VERSION` if any date's output changes, and run the embed script.
3. **The tests:** a probe for the kit in `tests/kit-check.mjs` (`KITS`) and a plan-time base in `tests/compose.mjs` (`BASE`). If the kit's arena is not one of `cityArena`, the winter's finales or a legacy tail, extend `wantSpan` there, and nowhere in the game.
4. **The game:** nothing for the plan itself. The per-kit code in section 5 is still needed wherever it applies.

## 5. Per-kit code that is still in the game (not part of this step)

These still branch on the level (the Campaign level a kit borrows its boss, theme and art from). Each one is a place a new kit, or a kit on a new level, has to be added. Each can change a date's sortie if moved wrongly, so each needs its own before-and-after check, as section 3 did.

- `buildSortie`: `gen` (a level number), `bossAt` and `arcLen` per level, and the `straight` flag for the temperate kit.
- `DRILL_PITS` and `BUECHSE_NESTS` (the post-steps in `sortiePlan`), keyed by level and the Campaign's template names.
- `SORTIE_BIOME`, the legacy biome of each template for the director and `placeOK` (audit A6).
- Painters and arena code that test `run.sortie.level === N` together with `run.sortie.compose` (for example the forest's arena in the chunk painter).

**[owner]** Move these into kit data when the next kit is planned, or now? Moving them first would make the next kit pure data in the composer and generator.
