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

1. **Measure first (S).** Over 200 sorties per kit, count the chunks that are plan, legacy tail, old-land legacy and arena, and the ground targets from slots versus `placeOK`. This gives the real share of "not generated" ground, which this audit only infers.
2. **C1, one composed plan builder.** This removes per-kit glue before more kits come.
3. **A1, sea tail in the generator,** then **A3, the temperate extras.** After both, everything before the boss is generator ground.
4. **A2, arena finales,** one kit at a time (desert, then city, then forest). Then **A5** on them, and **A4** last (the Campaign's Ravenhold must not move).
5. **B3, composer-made count endings** on the new arenas.
6. **B1 and B2, the encounter and wave grammar.** This is the largest change and the one with the most balance risk; it should get its own plan document and owner decisions.
7. **A6 and A7** only if step 1 shows the legacy placement path still matters.

Rules that apply to every step: the Campaign stays unchanged (`replay.mjs` is not a gate, `ARCHITECTURE.md`; `fixed-seed.mjs`, `enigma.mjs` and `citysegs.mjs` goldens are). No `Math.random` in the composer or generator. New state goes into the snapshot. New terrain caches go into `resetTerrainState`. After a generator change, run `node scripts/embed-citygen.mjs`. Raise `SortieCompose.VERSION` when a date's output changes.

## 4. Decisions for the owner

1. **Is "every part generated" the goal,** or is "every part *ground* generated" enough? A, C and B3 make the ground and endings the generator's. B1 and B2 change how the game plays.
2. **Arenas:** should each kit get its own generated arena (A2), as the winter has, or is the borrowed Campaign arena ground acceptable for the daily?
3. **Castle floor (A4):** move it into the generator, even though Ravenhold in the Campaign would then come from it too, or keep it as the game's own second generator?
4. **Encounter grammar (B1):** would you accept daily encounters that are generated, and so different from every hand-made one, if the flight gate passes them? Or should encounters stay a curated list?

## 5. Not checked

- How many ground targets in a composed sortie come from `placeOK` rather than slots (step 1).
- Whether the weather and twist code reads anything level-specific beyond the kit's climate.
- Whether the music and palette code would take a climate other than its level's own (also open in plan 12.3).
- Nothing in this audit was run; it is read from `tools/sortie-compose.js`, `index.html` (`sortieInfo`, `SORTIE_BIOME`, the `sortiePlan*` builders, the director's slot use) and `docs/daily-sortie-plan.md` sections 1, 2, 12.5–12.22.
