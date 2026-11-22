# Can the level generator build every part of a Daily Sortie?

Status: audit, 2026-11-22, on the branch's build (1.2.6.54 in the changelog, composer v5). Research only: no code changed.

**Short answer: no, not yet.** The generator pipeline (`tools/sortie-compose.js` + `tools/citygen.js`) decides the **whole structure** of a daily sortie and builds the **ground of its plan stretch**. Six things still come from hand-written game code or legacy ground, and the composer only picks among them:

1. the ground **outside the plan**: the sea tail, most boss arenas, the temperate kit's built-up old land, the castle floor, the land endings' backdrops;
2. the **encounters**: hand-scripted timelines in `index.html`; the composer only chooses which one goes in which stretch;
3. the **bosses and endings**: hand-coded behaviour and art; the composer draws from a pool;
4. the **air waves between encounters**: the game's timetable director, borrowed from the kit's Campaign level;
5. the **look and sound**: palette, sprites and music, borrowed from the kit's Campaign level (`kit.level`);
6. the **glue per kit**: one hand-written plan builder per preset in the game, plus a legacy biome mapping (`SORTIE_BIOME`) that the old director and placement code read.

Item 1 is ground the generator could own; items 2 to 5 are content it selects but cannot make; item 6 is what each new kit costs.

Each claim below is marked **[read]** (seen in the code or in the plan's results) or **[inferred]** (follows from what was read, not checked by running anything).

---

## 1. What a daily sortie is made of, and who builds each part

| # | Part | Built by | Notes |
|---|---|---|---|
| 1 | Date → kit, seed, sub-seed, flavour, twist | composer (`dailyCompose`, `KIT_ORDER`, `DAILY_REROLL`) | **[read]** Five kits in rotation: desert, forest, winter, city, temperate. |
| 2 | Segment list (opener, middle walk, approach), lengths | composer (`composeSortie`, kit grammar, gate 1) | **[read]** |
| 3 | Ground dials (density, damage, river width, …) | composer (`dialsFor`, `DIALS`) → generator params | **[read]** `docs/ground-variety-plan.md`. |
| 4 | Time of day, light | composer (`todFor`, `TODS`) → game draws | **[read]** |
| 5 | **Ground of the plan stretch** (chunks `planC0`..`planC1`) | **generator** (`CityGen.generate` with the kit preset; painted from `plan.*`) | **[read]** `index.html` `sortiePlan*` builders (around line 11512–11573), `sortieInfo` sets `I.plan`. |
| 6 | Structures in the plan: harbours, dockyard, river city, rail yard, islands, lagoon, villages, oasis, airbases, gorge, freight depot, castle approach road, mainland shore/farm/village/wood, the gate to the old land | **generator** | **[read]** Plan 12.6–12.22. |
| 7 | Ground-target **places** in the plan | **generator** (`plan.slots`: flak, sub pens, searchlights, tanks, nests, parked aircraft, AA towers) | **[read]** The director reads `P.slots` (director section, about +590 to +1060 lines). |
| 8 | Ground targets **outside slots** | game (`placeOK`, `tryLand` on legacy terrain types) | **[read]** The fallback path still exists. **[inferred]** Its share in a composed sortie has not been measured. |
| 9 | Ground type the old code sees (`classify`, biome names) | game: `SORTIE_BIOME` maps each template to a legacy biome; plan chunks take `S.planBiome` where set | **[read]** `index.html` `SORTIE_BIOME` / `sortieInfo` (around line 8463). |
| 10 | **Sea tail** after the plan (`coast_down`, `open_sea`) for ship and sea endings | **legacy chunk painter** (`legacy: true` stretches, `S.legacyTail`) | **[read]** Composer line ~373, `planC1 = len - legacyTail`. |
| 11 | **Temperate old land extras** (`city_small`, `industrial_light`, `airbase_searchlight`) | **legacy chunk painter** with `straight` fixes and the generator's `main_gate` join | **[read]** Plan 12.20–12.22. In 30 % of days none is picked. |
| 12 | **Boss arena** beyond `len` | **legacy**: `bossland` (theme ground), `secret` (theme 5 airfield), `castle`, `ryard` (yard), `sea`. **Generator only for the winter**: `finale` gorge, `railgorge`, `depot` harbour | **[read]** `sortieInfo` (around line 8470); composer `ICE_ARENA`, `RAIL_ARENA`. |
| 13 | Castle floor (Ravenhold and the three climate castles, ruin forms) | game (`ravenU`, `buildRavenFloor(lay)`, `CASTLE_SKINS`, `ruinFloor`) | **[read]** A second, separate generator living inside `index.html`. |
| 14 | Land endings' backdrops (gun line, airbase, column, depot) | game (`arenaScene(kind)` decal) | **[read]** Plan 12.19. |
| 15 | Escape and dam scenes (sandstorm, canyon, …) | game (`stormwall` overlay, `FOLLOW` kinds) | **[read]** Plan 12.21. Scroll speed and walls are game code. |
| 16 | **Encounters**: which one and where | composer (`kit.enc`, `encPlanFor`, spacing, `TT_ENC` lengths) | **[read]** |
| 17 | **Encounters**: what happens in them | game: hand-written timelines of existing verbs (`ENC.*`, many `Object.assign` clones) | **[read]** Plan 12.8, 12.20, 12.21. |
| 18 | Mid-level mini boss (Shadow Wing, or the Raven on 30 % of days) | composer picks (`wingC`, `S.ravenMid`); game behaviour (`WING_V`, `ravenmid`) | **[read]** The Wing's ship is the kit level's. |
| 19 | **End boss**: which one | composer (`bossFor`, `bossPool`, its own hash stream) | **[read]** |
| 20 | **End boss**: what it is | game (`BOSSDEF`, `BOSSMOVE`, `FOLLOW` hidden-core registry, sprites) | **[read]** Sixteen-plus kinds, each hand-made. |
| 21 | Air waves between encounters | game timetable director (`ttDir`, `TT_*`, the `ARC` pacing over `arcLen`), using the kit level's tables | **[read]** `ARCHITECTURE.md`. **[inferred]** The composer has no say in wave mix or density. |
| 22 | Palette, theme, sprites, music, start banner | game, borrowed from `kit.level` (`curTheme`, `setEnigmaArt`) | **[read]** `docs/daily-sortie-plan.md` 2.4, 12.20 (banner). |
| 23 | Weather plan | composer per kit → game | **[read]** The composer sets it from the kit; the twists vary it. |
| 24 | Validation | gate 1 (composer), gate 2 (`tests/kit-check.mjs`, `compose.mjs`), gate 3 (`daily-gate.mjs` flight) | **[read]** |

---

## 2. The gaps, and what closing each would take

Cost: **S** about a day, **M** a few days, **L** a week or more. These are rough estimates **[inferred]**.

### A. Ground the generator does not own (could own)

| Gap | Today | What the generator needs | Constraints | Cost | Tests |
|---|---|---|---|---|---|
| A1 Sea tail | legacy `coast_down` + `open_sea` after the plan | a coast-down and open-sea finale in each preset (the islands builder already makes sea; the winter's `depot` already ends in a harbour basin) | the plan must stay one piece up to the arena; `legacyTail` and `arenaSea` checks in gate 1 change | M | `compose.mjs`, `kit-check.mjs`, `daily.mjs` |
| A2 Boss arenas for desert, forest, city | legacy `bossland` / `secret` / `castle` / `ryard` theme ground | an arena finale per preset, as the winter has (`finale`: gorge, railgorge, depot), with a central rail where the train and supergun may come, water where the ship may come | the arena is open-ended (the sky-fortress duel scrolls on): the plan must be able to extend, or hand back to a plain repeating ground. Bosses read the ground (`railHit`, the central rail at x 112) | L (one per kit) | `daily-gate.mjs --boss` (every boss on every arena), `daily.mjs` section 11 |
| A3 Temperate old land extras | legacy `city_small`, `industrial_light`, `airbase_searchlight` with `straight` patches | `main_town`, `main_estate`, `main_airbase` stretches in the `islands` builder, as `main_village` copies the village preset in | a second built-up stretch still has an unphased grid (12.22 "not done"); after this the `gatePix` bridge would no longer be needed | M | `kit-check.mjs`, `citysegs.mjs`, contact sheets |
| A4 Castle floor | game `ravenU` / `buildRavenFloor`, its own region function | move it into `citygen.js` as a `castle` finale (moat, walls, keep yard, ruin layer) | the castle boss spawns 1,120 px up the map in world coordinates; trees must stay off breaches (`ravenCovers`). Campaign level 4's Ravenhold must stay pixel-identical | M | `enigma.mjs`, `fixed-seed.mjs`, golden of the floor image |
| A5 Land-ending backdrops | `arenaScene` decal over plain ground | the same as A2: the gun line's trenches, the airbase's apron, the depot's berms as real ground in an arena finale | the enemies' places (`FOLLOW.spawn`) must match the ground's | S–M each, after A2 | `daily-gate.mjs --boss` |
| A6 Legacy biome layer | `SORTIE_BIOME` maps templates to old biome names for the director and `placeOK` | a ground type per plan cell that the director reads directly (much of it exists: `planBiome`, `planRail`, `plan.K`) | many director rules branch on biome names; changing what they read can change the Campaign's spawns (fixed-seed guard) | L | `fixed-seed.mjs`, `daily.mjs`, gate 3 sweeps |
| A7 Slots for everything | some ground targets still go through `placeOK` on legacy types | a slot kind for every ground enemy the kits use (convoys, trains, boats on lanes already exist as `trainRuns` / `shipLanes`) | the director must stop falling back to placement for composed sorties; measure the share first | M | `guns-on-lines.mjs`, `turrets.mjs`, gate 3 |

### B. Content the generator selects but cannot make

| Gap | Today | What "generated" would mean | Cost |
|---|---|---|---|
| B1 Encounter content | one hand-written timeline per encounter (about 30, many clones of a few patterns) | an encounter grammar in the composer: verbs (dive, sweep, formation, bomber, strafers, convoy, flak lane, destroyer, tankers) with timing rules, placement from slots, and a budget from the `ARC` pacing. Timelines become data, made per day | L. It is the biggest step towards "every part generated". The data form must be plain, for the snapshot. |
| B2 Air waves between encounters | the kit level's timetable tables | a per-kit wave grammar (types, density, sides) the composer writes into the sortie | M–L. The timetable rules (`ttSeed`, ghosts, never reading the player) stay. |
| B3 Bosses and endings | hand-coded kinds; the composer picks one plus a form (`hpK`, lance, small, storm, ruin) | the `FOLLOW` hidden-core registry is already a composable boss (a list of enemies, health as their sum). A generated ending is a composer-made `FOLLOW` list on a generated arena (A2) | M for count endings; the unique bosses (fortress, train, Moth, …) stay hand-made |
| B4 Look and music | borrowed from `kit.level` | a kit-owned palette and song choice; climate already exists per kit | S–M; mostly data, but sprites with baked colours limit it |

### C. The cost of a new kit (glue)

| Gap | Today | What would remove it | Cost |
|---|---|---|---|
| C1 One game-side plan builder per preset | `sortiePlanIslands`, `sortiePlanHarbour`, `sortiePlanLevel2..5`: each has an early return for a composed sortie, plus level-specific fixes (castle road at x 112, `subChunk`, harbour basins) | one generic `sortiePlanComposed(S)`: `CityGen.generate(S.compose.gen)`, `planC0/C1/Y0`, `planBiome` from the plan. Kit-specific hooks move to plan fields | M |
| C2 Kit grammars tuned by hand | `follows`, `len`, `max`, `beforeApproach`, `gapBefore`: found by probing which lists the generator breaks on | the generator reporting its own needs (a stretch's required neighbours and minimum length) so the grammar can be derived | M; gate 2 already finds the breaks |

---

## 3. Proposed order (each step leaves the game playable)

1. **Measure first (S). Done, see 3a.** Over 200 sorties per kit, count the chunks that are plan, legacy tail, old-land legacy and arena, and the ground targets from slots versus `placeOK`. This gives the real share of "not generated" ground, which this audit only infers.
2. **C1, one composed plan builder.** This removes per-kit glue before more kits come.
3. **A1, sea tail in the generator,** then **A3, the temperate extras.** After both, everything before the boss is generator ground.
4. **A2, arena finales,** one kit at a time (desert, then city, then forest). Then **A5** on them, and **A4** last (the Campaign's Ravenhold must not move).
5. **B3, composer-made count endings** on the new arenas.
6. **B1 and B2, the encounter and wave grammar.** This is the largest change and the one with the most balance risk; it should get its own plan document and owner decisions.
7. **A6 and A7** only if step 1 shows the legacy placement path still matters.

Rules that apply to every step: the Campaign stays unchanged (`replay.mjs` is not a gate, `ARCHITECTURE.md`; `fixed-seed.mjs`, `enigma.mjs` and `citysegs.mjs` goldens are). No `Math.random` in the composer or generator. New state goes into the snapshot. New terrain caches go into `resetTerrainState`. After a generator change, run `node scripts/embed-citygen.mjs`. Raise `SortieCompose.VERSION` when a date's output changes.

## 3a. Step 1 results: the measured share (2026-11-22, `tests/gen-share.mjs`)

**How it was measured.** Part 1: 1,000 composed sorties per kit, chunks counted by who builds them (Node). Part 2: 10 sorties per kit (the flight gate's sweep seeds 0–9), Veteran, the human bot (`SF.human(8, 15)`, immortal), flown to the boss's death. That is 50 flights, all 50 bosses killed, no errors, 261 s of play per flight on average. Every 10 frames the chunk under the middle of the screen was put in a class. Every ground enemy was put in a class when it first appeared: on a plan slot (within 14 px of one), on generator ground at a place the game chose, or on legacy ground. Commands: `node tests/gen-share.mjs --per 10 --seeds 1000` (serve the folder first).

### Ground under the screen, as a share of play time

| Kit | Generator (plan + arena) | Legacy arena before the boss appears | Legacy arena in the fight | Legacy stretches (sea tail, old land) | Start screen |
|---|---|---|---|---|---|
| desert | **69 %** | 5 % | 24 % | 0.6 % | 1.4 % |
| forest | **64 %** | 3 % | 31 % | 0.8 % | 1.6 % |
| winter | **96 %** (its gorge, rail gorge, ice and depot arenas are generator ground) | 0.5 % | 1 % | 0.6 % | 1.3 % |
| city | **55 %** | 16 % | 27 % | 0 % | 1.4 % |
| temperate | **63 %** | 0 % | 25 % | 11 % | 0.9 % |
| all | **70 %** | 5 % | 21 % | 2 % | 1.3 % |

- The legacy chunk count is small: about 1–2 % of a level's chunks in four kits, and 14.5 % in the temperate kit (part 1). **The legacy share comes almost all from the boss arena**: 26 % of all play time, from the scroll reaching the arena before the boss appears plus the fight itself.
- **The city spends 45 s per flight on arena ground before its boss appears** (16 % of its time). This is the longest run-up of any kit. **[inferred]** It comes from `boss: { add: 5 }` plus the warning and intro. It is worth a look on its own, as dead ground to fly over.
- "Start screen" is the chunk before chunk 0 (sortie chunk −1), which is legacy ground.
- The first full run counted the legacy stretches as "legacy other": the game's copy of the segments has no `legacy` flag (**[read]**: the flag is only in the composer). The probe now reads the composer's list. One temperate flight re-run with the fix shows them as "legacy tail". The table above takes "legacy other" from the first run as the legacy stretches.

### Ground enemies: who chose the place

| Kit | On a plan slot | Generator ground, place chosen by the game | Legacy ground | Slots used (of the plan's) |
|---|---|---|---|---|
| desert | 13 % | 82 % | 5 % | 45 % |
| forest | 29 % | 64 % | 7 % | 45 % |
| winter | 12 % | 88 % | 0 % | 71 % |
| city | 14 % | 66 % | 20 % | 49 % |
| temperate | 21 % | 60 % | 17 % | 100 % |
| all | **17 %** | **73 %** | **10 %** | |

All ground enemies before the boss are counted, 13,194 in all.

- **[read]** The game chooses the place for nearly three quarters of the ground enemies, mostly on the generator's own ground. Without troops and supply crates (which are dropped by other units), the shares are 15 % on a slot, 61 % chosen by the game and 23 % on legacy ground.
- The largest single types at game-chosen places are troops (about half), then tanks, trucks, fuel trucks and train wagons. **[inferred]** Many of those move on the plan's roads and rails, so the generator made their route but not their starting point. The probe does not separate "on a plan road or rail" from "free placement". That split is the next thing to measure before planning A7.
- The city's 20 % on legacy ground is mostly fuel tanks and flak (314 and 306) that the director places on the arena during the long run-up.
- "Slots used" counts the slots the director marked as taken. A slot that fails `placeOK` is marked but gets no enemy, so 100 % for the temperate kit means that `planGuns` visits every slot, not that every slot was filled.

### What this changes in the order (section 3)

1. **A2, generated boss arenas, moves to the front.** It is about 26 % of play time in four kits, and the winter shows that it works (96 % generator ground). Start with the city: it has the largest share and the long run-up.
2. **A1 and A3 (sea tail, temperate old land) shrink.** They are 2 % of play time overall, though 11 % in the temperate kit. Do A3 for the temperate kit; A1 can wait.
3. **A7 grows.** The generator places only about a sixth of the ground enemies. Before any work, split the 73 % into "on a plan road or rail" and "free placement" (a small change to the probe).
4. **A6 is unchanged.** The legacy biome mapping matters wherever the game places enemies, which is most of them.

Not measured: Rookie and Ace; a mortal player (who does not reach every place); more than 10 sorties per kit; daily twists and flavours (the sweep flies none).

## 3b. A2 for the city: the generated airfield arena (build 1.2.6.55, composer v6; flown by the test bot, **not by a person**)

**What is built.** `CityGen` `addArenaField` (called from `withPerimeter` when `params.cityArena` is set) adds 48 chunks of airfield behind the city's perimeter fence:
- a concrete apron, painted with the final airfield's own apron colour (`opts.apronPix`);
- grass verges along both edges, with a gun or fuel pad every 80 rows;
- a runway down one side of the strip;
- on the other side, modules in a seeded order: hangar rows (a control tower with the first), a fuel farm in its berm, blast pens open towards the runway, and flak parks of sandbag rings;
- tank patrol lanes across the apron.

Every target is a plan slot marked `arena`. The game fills these slots as each chunk is built (`planArena`, in place of the Campaign pattern's `finalAirfield` spawns, and never read by the director's own slot code). If a fight scrolls past the 48 chunks, it goes on over the Campaign's pattern; `secOff` now starts that pattern where the plan ends, on a full hangar. The composer (`cityArena`, checked in gate 1) asks for the arena only on days whose boss fights on a plain airfield: the sky fortress, the land fortress, the rival, the Moth, the Raven and the Shadow Wing, with no sea tail and no tracks into the arena. That is **32 % of city days** (964 of 3,000 seeds). Why 48 chunks: city flights reach 12–30 chunks into the arena before the boss appears and up to 101 during the fight (sky fortress); 48 covers the run-up and most fights.

**Measured on 18 city sorties with the arena** (`gen-share.mjs --only …`, Veteran, all 18 bosses killed, no errors):

| | Before (all city days, 3a) | Arena days |
|---|---|---|
| Play time on generator ground | 55 % | **89 %** (the rest: 9 % fights that run past 48 chunks, 1 % start screen) |
| Ground enemies on a plan slot | 14 % | **41 %** |

**Flight gate** on the three arena dates of the next two months (2026-12-31 sky fortress, night; 2027-01-10 heavy fortress, fog; 2027-01-25 heavy fortress, elite), all three difficulties: **9 of 9 pass**, and each sortie's determinism twin flew the same. Against the previous build on the same dates, the arena makes the run-up a little harder:
- average bullets before the boss: 5 to 19 % more;
- worst 10-second window: up to 32 % more on Rookie (37.1 against 28.1);
- kills per minute: about the same;
- boss fights: mixed, some longer, some shorter.

One rival fight (sweep seed 14) took 9 s against 29 s before. **[read]** The rival positions itself opposite the player (x = 224 − player x). Over the new ground the bot stays near the middle and keeps it in its fire, so this comes from how the bot moves, not from a fault in the arena.

**Other checks:** `tests/compose.mjs` (city gate 2 clean; plan p95 435 ms, was 284 ms); `tests/citysegs.mjs`; `tests/citygen.mjs` goldens; `tests/daily.mjs` 341 (the composer-version check moved to 6). `tests/kit-check.mjs` now measures the works stretch against the level's own length, because the plan runs on past it.

**The rail yard ending (same build).** After the rail yard ending, the yard's two outer tracks (x 55 and 169) run on from where the perimeter stopped them. They cross the perimeter road (a level crossing) and pass through gaps in the fence, with a post either side; the yard's other tracks still end at their buffer stops. The tracks then run down all 48 chunks, and past the arena's end the game paints them on over the Campaign pattern at the same x (`S.arenaTracks`). Between the tracks the field has no runway, since 93 px leaves no room for one: the modules stand in that space. This takes the arena from **32 % to 59 % of city days**. Measured on 12 yard-arena sorties (Veteran, all bosses killed, no errors): **94 % of play time on generator ground**, and **43 % of ground enemies on slots**. Flight gate on the three yard-arena dates of December (12-06, 12-16, 12-21), all difficulties: **9 of 9 pass**, and each determinism twin flew the same.

**Not done:**
- The arena for the remaining 41 % of city days: bosses on a track (the long train and the supergun on a painted rail, the two-train yard), sea endings (a coast finale, A1), and the land endings with their own scene (gun line, column, depot, airbase, dam, bridge, silo, slipway). For the land endings, the arena scenes could become arena modules.
- The strips between the yard's tracks and the verges are bare concrete.
- Density: the run-up's guns could be thinned if the owner finds it harder than intended.
- Taxi lines and markings on the apron, which is plainer than the Campaign pattern's.
- Nobody has played it.

## 4. Decisions for the owner

1. **Is "every part generated" the goal,** or is "every part *ground* generated" enough? A, C and B3 make the ground and endings the generator's. B1 and B2 change how the game plays.
2. **Arenas:** should each kit get its own generated arena (A2), as the winter has, or is the borrowed Campaign arena ground acceptable for the daily?
3. **Castle floor (A4):** move it into the generator, even though Ravenhold in the Campaign would then come from it too, or keep it as the game's own second generator?
4. **Encounter grammar (B1):** would you accept daily encounters that are generated, and so different from every hand-made one, if the flight gate passes them? Or should encounters stay a curated list?

## 5. Not checked

- Measured in 3a: how many ground enemies stand on slots. Still open: how many of the rest move on plan roads and rails.
- Whether the weather and twist code reads anything level-specific beyond the kit's climate.
- Whether the music and palette code would take a climate other than its level's own (also open in plan 12.3).
- Nothing in this audit was run; it is read from `tools/sortie-compose.js`, `index.html` (`sortieInfo`, `SORTIE_BIOME`, the `sortiePlan*` builders, the director's slot use) and `docs/daily-sortie-plan.md` sections 1, 2, 12.5–12.22.
