# One plan builder for composed sorties (audit C1)

Status: plan, draft 1, 2026-11-28, on build 1.2.6.63 (composer v7). Nothing built. Written for the agent that will build it; the owner decides the points marked **[owner]**. Background: `docs/daily-sortie-generator-audit.md`, gap C1 and section 3, step 2.

## 0. Goal and ground rules

**Goal.** A Daily Sortie's plan is built by one function, `sortiePlanComposed(S)`, for every kit. The six per-level builders (`sortiePlanHarbour`, `sortiePlanIslands`, `sortiePlanLevel2` to `5`) go back to building only the Campaign's plans. A new kit needs no new plan builder in the game.

**Rules.**
- **The plan does not change.** For every composed sortie, `S.plan` and the fields the game reads from it (`planC0`, `planC1`, `planY0`, `planEnd`, `planGap`, `planBiome`) stay exactly as they are today. This is a refactor: no date's sortie changes, so `SortieCompose.VERSION` stays at 7.
- **The Campaign does not change.** The Campaign's branches of the six builders are not touched beyond deleting their `if (S.compose)` code. `fixed-seed.mjs`, `enigma.mjs` and `citysegs.mjs` stay green with no `--update`. `replay.mjs` is no gate (ARCHITECTURE.md), but its output must be the same before and after.
- If `tools/sortie-compose.js` changes, run `node scripts/embed-citygen.mjs` (`tests/compose.mjs` fails while the copy is stale).
- No `Math.random`. No new state outside the snapshot: the plan is rebuilt from `S`, as today.

## 1. What exists (read in `index.html`, build 1.2.6.63)

`sortiePlan(S)` (section `sortiePlan`, about line 12862) caches by `world.stageBaseP`, calls `sortiePlanBuild(S)`, then runs three post-steps on every plan: `drillPits`, `buechseNests` and `roadTip`. `sortiePlanBuild` dispatches by `S.isles` and `S.level`.

The composed branch of each builder:

| Builder (kit) | Generates | `planC1` | Extra |
|---|---|---|---|
| `sortiePlanHarbour` (city) | `CityGen.generate(S.compose.gen)` | `len - legacyTail + cityArena` | early return before the Campaign's code |
| `sortiePlanIslands` (temperate) | same | `planEnd + cityArena`, with `planEnd = len - legacyTail` | `planGap` from `plan.arena.y0` (the gap between the old land and the sea ending); `planBiome` per chunk: `country` if more than 45 % of the chunk is not `K.SEA`, else `sea` |
| `sortiePlanLevel2` (desert) | `S.compose ? S.compose.gen : …` | `len - legacyTail + cityArena` | none |
| `sortiePlanLevel3` (no kit) | never composed | | the `night` kit was never built |
| `sortiePlanLevel4` (forest) | `S.compose ? S.compose.gen : …` | `len - legacyTail + cityArena` | none |
| `sortiePlanLevel5` (winter) | `S.compose ? S.compose.gen : …` | five cases: with `legacyTail`, `len - legacyTail + cityArena`; with `cityArena`, `len + cityArena`; with `bossVar.ice`, `len + ICE_ARENA`; with `bossVar.rail`, `len + RAIL_ARENA`; otherwise `len + GORGE_ARENA` | none |

`planC0` is 0 and `planY0` is `-world.stageBaseP * CH + CH - 1` everywhere. The arithmetic is the same except in the temperate and winter kits. It is copied into four places and has already drifted in form (the temperate's separate `planEnd`, the winter's chain of cases).

**What reads the plan's limits** (92 matches for `planC1|planEnd|planGap|planBiome|planY0`): `sortieInfo` (which chunks are plan, `planGap` excluded), the painters, the arena code (`arenaJoin`, `forestArena`, `planRows`), the gorge, the slots and the director's placement. None of them need to change: they read `S`, not the builder.

**Kit-specific glue that stays outside this step** (listed so the inventory in 3.1 starts from it):
- `buildSortie`: `gen` (a level number), `bossAt` and `arcLen` per level, the `straight` flag for the temperate kit.
- `DRILL_PITS` and `BUECHSE_NESTS`, keyed by level and the Campaign's template names.
- Checks of `run.sortie.level === N` together with `run.sortie.compose` in the painters (for example the forest's arena at about line 10890).

## 2. Design

```js
function sortiePlanBuild(S) {
  if (S.compose) return sortiePlanComposed(S);   /* every kit, before the level's own builder */
  if (S.isles) return sortiePlanIslands(S);
  …                                              /* the Campaign, unchanged */
}
function sortiePlanComposed(S) {
  const P = S.plan = CityGen.generate(S.compose.gen);
  const sp = SortieCompose.planSpan(S.compose, P);   /* { c1, end, gap } in sortie chunks */
  S.planC0 = 0; S.planC1 = sp.c1; S.planY0 = -world.stageBaseP * CH + CH - 1;
  if (sp.end !== sp.c1) S.planEnd = sp.end;
  S.planGap = sp.gap;
  if (S.isles) S.planBiome = planBiomeOf(P, sp.end);   /* the temperate kit (buildSortie sets S.isles for level 1); later every kit with sea in its plan */
  return P;
}
```

- **`planSpan` goes in `tools/sortie-compose.js`,** pure, from the composed sortie and the plan. It can then be tested in Node with `CityGen`, the same way `tests/compose.mjs` checks gate 2. It takes `legacyTail`, `cityArena` and the winter's arena from what the composer already decided (`C.legacyTail`, `C.cityArena`, `C.bossVar`), not from `S.level`. `ICE_ARENA` and `RAIL_ARENA` (11 each) are already in the composer and exported. `GORGE_ARENA` (48) is only in the game (`const GORGE_ARENA = 48`, about line 6718), so it moves into the composer too. The game also keeps a second copy of `ICE_ARENA` and `RAIL_ARENA` on that line, and `tests/daily.mjs` checks that they agree. With that done, the winter's five cases become a value per ending.
- **Optional, decided in phase 1:** derive `c1` from the plan itself (`P.L`, `P.arena.y0 + P.arena.L`) instead of the composer's numbers. That removes the duplicated arithmetic altogether, but only if the probe shows it gives the same chunk for every sortie. If it does not, keep the composer's numbers.
- **`planBiomeOf(P, n)`** is the islands builder's loop, moved out unchanged. The Campaign's level 1 calls it too, so the two cannot drift apart.
- **The post-steps** (`drillPits`, `buechseNests`, `roadTip`) stay in `sortiePlan`, after the build. They already run on composed plans. Moving their tables to kit data is phase 3, not this step.

## 3. Phases

### Phase 0: the span golden (no game change)

A probe, `tests/plan-span.mjs` (serve the folder first): for N composed sorties per kit, it builds the sortie in the game page and records `planC0`, `planC1`, `planY0`, `planEnd`, `planGap`, a hash of `planBiome` and a hash of the plan (`P.K`, `P.L`, the slot list). It covers each kit's endings, because the winter has five cases and the temperate has the gap:
- the sweep seeds 0 to 49 per kit;
- per kit, one seed forced onto each boss of its pool (`--boss`, as `daily-gate.mjs` does);
- archipelago days (`sea: 'on'`), land days, airfield days, mountain days, each flavour.

It writes `tests/plan-span.golden.json` on the current build. **Stop point:** the golden is committed before any game change.

### Phase 1: `planSpan` and the shared builder

1. `SortieCompose.planSpan` and its unit checks in `tests/compose.mjs`: for 200 lists per kit, the span from `planSpan` equals what the old builders' arithmetic gives (written once in the test, from section 1's table).
2. In `index.html`: `sortiePlanComposed`, `planBiomeOf`, the `if (S.compose)` line in `sortiePlanBuild`. Delete the composed branches of the five builders; `sortiePlanLevel2`, `4` and `5` lose their `S.compose ? … :` ternary.
3. `node scripts/embed-citygen.mjs`.
4. Checks: `tests/plan-span.mjs` against the golden (identical); `node --test tests/`; `tests/compose.mjs`, `tests/daily.mjs`, `tests/citysegs.mjs`, `tests/arena-joins.mjs`, `tests/fixed-seed.mjs`, `tests/enigma.mjs`; `replay.mjs` output the same before and after; the flight gate, `daily-gate.mjs --sweep 8 --all 2 --det 4 --no-bots`, once for each kit.

**Stop point:** the owner reads the report (the diff size, the checks, anything the golden caught).

### Phase 2: decide the derived span

If the phase 0 data shows that `c1` derived from the plan matches every recorded sortie, replace the composer's numbers with it. The game's `GORGE_ARENA`, `ICE_ARENA` and `RAIL_ARENA` stay: the gorge and ice code use them, and they are not only span arithmetic. Same checks as phase 1. If it does not match, write down where and why, and stop.

### Phase 3 (optional, [owner]): the rest of the per-kit glue

The inventory from section 1, each item moved from `S.level` to a field the composer or the plan carries:
- `bossAt` and `arcLen` from the composer (`C.bossAt`), not the level's formula in `buildSortie`;
- `DRILL_PITS` and `BUECHSE_NESTS` as kit data (`kit.pits`, `kit.nests`) for composed sorties; the Campaign keeps its tables;
- the `level === N && compose` checks in the painters, as flags on the plan (`P.arena.style`, which mostly exists already).

Each of these can change a date's sortie if it is done wrong, so each gets the golden of phase 0, extended to `bossAt` and the slots. Only after this is a new kit really free of game glue.

## 4. Risks

| Risk | Where | Guard |
|---|---|---|
| A sortie's span shifts by a chunk (the plan ends early or late, a legacy chunk shows, the arena is cut) | the winter's five cases; the temperate's gap | the phase 0 golden, with forced bosses per kit |
| `planBiome` differs (the director places for `country` on sea) | the temperate kit, the archipelago days | its hash in the golden |
| A cached value on `S` from the old builder is missed (`planEnd` and `planGap` are only set by some builders; a stale one lingers on a second sortie in the same page) | `sortiePlanComposed` | set `planGap` always (null when there is none); `tests/daily.mjs` flies a second sortie in the same page |
| The Campaign's builder loses code it needed | the islands and harbour builders return early today; deleting that line must leave their Campaign path whole | `fixed-seed.mjs`, `enigma.mjs`, `citysegs.mjs`, `replay.mjs` output |
| The embedded composer is stale | `index.html` | `tests/compose.mjs` fails; run the embed script |

## 5. Cost

Phases 0 to 1: about two days (the probe is most of it). Phase 2: half a day. Phase 3: a few days, one item at a time. This is in line with the audit's M.

## 6. Decisions for the owner

1. **[owner]** Do phase 3 now, or only when a new kit is planned? Phases 0 to 2 alone remove the duplicated plan code but leave `bossAt`, the pit tables and the painters' level checks.
2. **[owner]** The `night` kit (level 3): is it dropped? If it comes, it would be the first kit built on the shared builder, and a good test that the builder needs no glue. `longNight` would first have to take `segs` (plan section 4, phase 5).
3. **[owner]** Should `tests/plan-span.mjs` stay as a permanent gate (run in CI with the other Daily Sortie tests), or be used for this refactor only?
