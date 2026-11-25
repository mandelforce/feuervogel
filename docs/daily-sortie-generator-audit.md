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

**What is built (second version, owner: "the generated versions must look like the existing boss area and allow combinations on top of it").** `CityGen` `addArenaField` (called from `withPerimeter` when `params.cityArena` is set) adds 48 chunks of the final airfield behind the city's perimeter fence. It is built from the Campaign arena's own pieces (`plan.arenaField.pieces`, plain data):
- **Hangar roofs** with their warning stripes along the near edge;
- **steel pads** with flak or fuel along both edges, every 70 to 80 rows, alternating as the Campaign's do;
- the **helipad** ring with its cross;
- the **dashed centre line** below each hangar;
- **parked planes**, **crates and drums**, and a **tank patrolling** across.

The pieces come in seeded combinations that the Campaign's repeating 300 px pattern never makes. A unit is an open stretch followed by a roof:
- the open stretch has one or two of: a helipad (centred or to one side), parked planes, crates, extra inner pads;
- the roof is a full hangar, a short one, two side by side, or none.

The first unit is the Campaign's own start: the centre line and a full hangar at once. The game paints the pieces with the final airfield's own colour code (`arenaColor`, a copy of `secretColor`'s formulas for each piece at its own place and size), through a new paint hook (`opts.arenaPix`). The roofs and pads are a new ground kind, `AROOF`, typed as `roof` like the Campaign's. So the arena looks like the Campaign's; contact sheets compared side by side show it, and at the arena's end the Campaign's pattern follows on without a seam. The first version (a runway, blast pens, a fuel farm and flak parks in the city's generic airfield look, on grass verges) was replaced.

Every target is a plan slot marked `arena`, with the Campaign arena's own kinds and stats. The game fills these slots as each chunk is built (`planArena`, in place of the Campaign pattern's `finalAirfield` spawns, and never read by the director's own slot code). If a fight scrolls past the 48 chunks, it goes on over the Campaign's pattern; `secOff` now starts that pattern where the plan ends, on a full hangar. The composer (`cityArena`, checked in gate 1) asks for the arena only on days whose boss fights on a plain airfield: the sky fortress, the land fortress, the rival, the Moth, the Raven and the Shadow Wing, with no sea tail and no tracks into the arena. That is **32 % of city days** (964 of 3,000 seeds). Why 48 chunks: city flights reach 12–30 chunks into the arena before the boss appears and up to 101 during the fight (sky fortress); 48 covers the run-up and most fights.

**First version, measured on 18 city sorties with the arena** (`gen-share.mjs --only …`, Veteran, all 18 bosses killed, no errors):

| | Before (all city days, 3a) | Arena days |
|---|---|---|
| Play time on generator ground | 55 % | **89 %** (the rest: 9 % fights that run past 48 chunks, 1 % start screen) |
| Ground enemies on a plan slot | 14 % | **41 %** |

**First version, flight gate** on the three arena dates of the next two months (2026-12-31 sky fortress, night; 2027-01-10 heavy fortress, fog; 2027-01-25 heavy fortress, elite), all three difficulties: **9 of 9 pass**, and each sortie's determinism twin flew the same. Against the previous build on the same dates, the arena makes the run-up a little harder:
- average bullets before the boss: 5 to 19 % more;
- worst 10-second window: up to 32 % more on Rookie (37.1 against 28.1);
- kills per minute: about the same;
- boss fights: mixed, some longer, some shorter.

One rival fight (sweep seed 14) took 9 s against 29 s before. **[read]** The rival positions itself opposite the player (x = 224 − player x). Over the new ground the bot stays near the middle and keeps it in its fire, so this comes from how the bot moves, not from a fault in the arena.

**Other checks:** `tests/compose.mjs` (city gate 2 clean; plan p95 435 ms, was 284 ms); `tests/citysegs.mjs`; `tests/citygen.mjs` goldens; `tests/daily.mjs` 341 (the composer-version check moved to 6). `tests/kit-check.mjs` now measures the works stretch against the level's own length, because the plan runs on past it.

**Second version (the airfield's own pieces), measured.** 12 arena sorties (plain and yard days; Veteran; all bosses killed, no errors): **87 % of play time on generator ground**, and **36 % of ground enemies on slots**. Flight gate on four arena dates (2026-12-31, 2027-01-10, and the yard days 2026-12-06 and 2026-12-16), all difficulties: **12 of 12 pass**, and each determinism twin flew the same. The run-up is now as hard as on the Campaign's pattern. For example, on 2026-12-31 the average bullets before the boss are 11.4 / 21.5 / 19.0 (Rookie / Veteran / Ace) against 11.4 / 21.5 / 18.7 on the Campaign's arena, where the first version had up to 32 % more in the worst 10 s window.

**The rail yard ending (same build).** After the rail yard ending, the yard's two outer tracks (x 55 and 169) run on from where the perimeter stopped them. They cross the perimeter road (a level crossing) and pass through gaps in the fence, with a post either side; the yard's other tracks still end at their buffer stops. The tracks then run down all 48 chunks, and past the arena's end the game paints them on over the Campaign pattern at the same x (`S.arenaTracks`). The roofs stay between the tracks (x 67 to 157); the planes and crates stand inside them, and the helipad sits in the middle. This takes the arena from **32 % to 59 % of city days**. With the first version's layout, measured on 12 yard-arena sorties (Veteran, all bosses killed, no errors): **94 % of play time on generator ground**, and **43 % of ground enemies on slots**. Flight gate on the three yard-arena dates of December (12-06, 12-16, 12-21), all difficulties: **9 of 9 pass**, and each determinism twin flew the same.

**The land endings (same build).** The land endings' scenes (`arenaScene`: the gun line, the column, the depot, the airbase, the silo, the bridge and the dam) are now laid on the generated arena, which makes it a combination: the airfield's pieces as the base, the scene on top. On a land ending's day the generator leaves scene zones of bare apron (272 rows, no pads; one about every seven chunks from the sixth). The fight cannot sit at one fixed place: on the city the boss comes after the Raven duel, whose length depends on the player, 12 to 30 chunks into the arena. So the game puts the scene and its enemies in the first zone still ahead (`sceneZoneAt`), lets the ground run on at 1.6 times the scroll until that zone fills the screen, and starts the fight's clock then. The enemies placed above the screen are marked `keep`, as the Campaign arena's own targets are; without it the game dropped them more than 140 px above the screen, and 7 of 14 first flights timed out with the boss's core unkillable. Days without a land ending produce byte-identical plans, because the pads' seeded draws keep their order. This takes the generated arena from **59 % to 81 % of city days**.
Measured on 14 land-ending sorties (two of each ending, plain and yard days; Veteran; all bosses killed, no errors): **98.5 % of play time on generator ground**, every fight on the generated arena. Flight gate on four land-ending dates (2026-12-11 bridge, yard, swarm; 2027-04-10 gun line, yard, fixed weapon; 2027-06-09 silo, nova; 2027-12-06 airbase, yard, elite), all difficulties: **12 of 12 pass**, each determinism twin flew the same, and the longest quiet stretch was 5.5 s (the run to the zone; the gate's limit is 12 s).

**The arena as its own small plan (same build; owner, after asking what the longer start buys).** Merged into the town's plan, the arena made the city's plan 20 to 50 ms slower to generate (40 arena days, this machine: median 176 to 206 ms against 145 to 159 without), because every plan array was enlarged and copied, and the sea's calm-water passes ran over the longer plan. Now `addArenaField` builds its own plan (`plan.arena`, 48 chunks, its rows numbered from 0 at the town's end, `y0` the town's length), and the town's plan is touched only where the yard's tracks cross the perimeter. The game's `planRows` gives the town or the arena for a row: ground types, rails, `inPlan`, the road's x and its blend after the last plan. The chunk painter paints arena chunks from the arena plan, with their own paint options (a chunk is all town or all arena). Slots, pieces and zones are in the arena's own rows. Result: **median 156 to 159 ms with the arena**, within the noise of the plan without it. It is the same arena: on all 172 arena days among 200 seeds, ground, rails, pieces, targets and zones equal the merged version's, and the town plans are unchanged. The flight gate's numbers on 2026-12-31 and 2026-12-06 are identical to the merged version's.
Checked: 13 sorties (plain, yard, land endings), all bosses killed, no errors; flight gate on four dates, 12 of 12; `compose.mjs` 77, `citysegs`, `citygen`, `daily.mjs` 341 (its plan-length check now expects the town's own length), `enigma` 213, `fixed-seed` 41, `smoke`.

**The bosses on a rail (same build).** The long train (one rail, x 112) and the supergun (its pair, x 93 and 131) rode rails the game painted on the Campaign's arena. Their rails are now laid in the arena's own plan (`params.cityArenaBossTracks`): the town's track look, from a buffer stop 16 rows behind the fence (`bufferStops` finds the end) to the arena's end, where the game's painted rails go on at the same x. The layout gives way to them: a roof in each strip of the hangar span that is 30 px or wider and 14 px clear of the rails, planes and crates in those strips, no centre line on a rail, and no helipad unless a strip takes its 76 px ring (none does, with these rails). Every other arena day is unchanged: all 252 earlier arena days among 300 seeds produce the same arena. This takes the generated arena from **81 % to 85.5 % of city days**. Measured on 8 sorties (four of each boss; Veteran; all bosses killed, no errors): 97 % of the fights' time on generator ground. Flight gate on 2027-04-30 (long train) and 2027-09-27 (supergun), all difficulties: **6 of 6 pass**, and each determinism twin flew the same. Screenshots mid-fight: the Night Hammer stands across its two generated rails between the hangars, and the long train runs on the centre rail. Checked: `compose.mjs` 77, `citysegs` 8, `citygen` goldens, `daily.mjs` 341, `enigma` 213, `fixed-seed` 41, `smoke`.

**The sea endings (same build; owner: "the city sea endings and the train yard etc for other bosses", and keep the desert's original area for its tank boss).** The ship, the wolfpack, the squadron, the ghost ship and the slipway ended over the Campaign's legacy coast_down chunk and open sea (`legacyTail`, `arenaSea`). Now `addSeaArena` builds that ending as the arena's own small plan, covering the level's sea tail and 48 chunks beyond it. So the level's length and the boss's trigger are unchanged (the composer keeps the tail's stretches; `cityArena` = tail + 48). The coast is the Campaign's: four kinds (grass, sand, surf, sea; `K.SURF` is new, typed `surf`) that the game paints with its own ground colours (`seaArenaColor`, pixelColor's grass, sand and surf cases, and the sea lit within 40 rows of the coastline as the legacy sea is). The game's detail pass (`drawFeatures`), which skips plan chunks, now runs on the sea arena's, so the tank traps stand on its sand as on the Campaign's. Each day varies the coastline's mean row, swell and ripple (value noise, as `coastLine`, kept 8 rows clear of the sand so grass always fronts the fence; rows 18 to 54 over 65 plans) and the sand's width, and adds two to four bunkers on the sand and up to three flak guns behind it (slots). The open sea runs to the plan's end, where the Campaign's open sea, painted by the same formula, goes on without a seam. This takes the generated arena from **85.5 % to 96.1 % of city days**; only the two-train yard is left.
Measured on 10 sorties (two of each sea ending; Veteran; all bosses killed, no errors): 98 % of the fights' time on generator ground. Flight gate: 2026-12-26 (ship) **3 of 3 pass**. 2026-12-01 (squadron, fast-scroll twist) fails on all three difficulties with "encounter": its planned CITY FLAK (chunk 40, in the city centre) never starts. **This is not the arena's doing: the build before any arena work (1e4fc36) fails that date the same way.** **Fixed since:** the composer planned the Shadow Wing's and the encounters' chunks at the normal scroll. On a Fast scroll day the ground runs 20 % faster (`scrollFor`), so the Wing, which runs fixed frames, was still flying when CITY FLAK's two-chunk window (chunks 40 and 41) had passed. `encPlanFor` and gate 1 now scale both by `FAST_K` (1.2) on a Fast scroll day. 2026-12-01 now plans the harbour raid and the station breakout, and passes the flight gate on all three difficulties; a sweep of 6 Fast scroll sorties per kit (30 flights) has 0 failures; `compose.mjs` 77 and `daily.mjs` 341 pass. Checked: `compose.mjs` 77, `citysegs` 8, `citygen` goldens, `daily.mjs` 341, `enigma` 213, `fixed-seed` 41, `smoke`. Plan time: the arenas add nothing measurable (40 city days as composed: median 214 to 222 ms, without any arena 230 to 231; 30 sea days 209 to 224 with the sea arena, 207 to 214 without; this machine was slower on this day than in the earlier measurements).

**The two-train yard (same build).** The yard boss fought on the Campaign's rail yard: eight tracks 26 px apart, platforms with yellow edges in gaps 1 and 5, a signal gantry every 200 rows, and crossovers between neighbouring tracks. The two trains follow the crossovers, which the trains and the painter both take from `yardXover`. So the generator does not draw the yard itself: it chooses the day's layout (`addYardArena`: `arena.yardLayout`), and the game reads that one layout in three places. These are the yard painter (`ryardColor`, taken out of `pixelColor` with the Campaign's layout `YARD_DEF` as its default), the crossovers (`yardXover`) and the yard ground beyond the 48 chunks, so the trains, the picture and what lies past the arena all agree. A layout has platforms in two or three of the gaps the trains never use (0, 1, 5, 6; the crossovers take 2 to 4), a gantry every 160, 200 or 240 rows, and the six crossover moves (3 to 2 and back, 3 to 4 and back, 5 to 4 and back) in a seeded order. The arena's ground kind is `RYARD`, typed `ryard` as the Campaign's, and its chunks keep the eight tracks for the placement code. The canopy rule (`wy % 96`) never fires on the negative world rows of an arena, so the Campaign's yard shows none, and neither does the generated one. With this, **every city day ends on a generated arena (3,000 of 3,000 seeds)**.
Measured on 6 sorties (Veteran, all bosses killed, no errors): 86 % of the fights' time on the generated arena, the rest on the yard beyond it, in the same layout. Flight gate on 2027-09-22 and 2027-10-07, all difficulties: **6 of 6 pass**, and each determinism twin flew the same. Checked: `compose.mjs` 77, `citysegs`, `citygen`, `daily.mjs` 341, `enigma` 213, `fixed-seed` 41, `smoke`.
**The Campaign's pixels are unchanged by all of this work.** `node tests/enigma.mjs --pixels` gives the same six stage hashes on this build as on the build before any arena work (1e4fc36). It fails on both, because `tests/enigma-pixels.json` was already out of date before this work began. It is left as it is: its rule is to rewrite it only when a Campaign look change is meant, which is the owner's call.

**Not done:**
- The desert's, forest's, winter's and temperate kit's arenas (the owner keeps the desert's original area for its tank boss).
- The scenes are still drawn as one picture (`arenaScene`) on top of the plan; making their parts plan pieces (trenches, berms, hardstands) would let them vary too.
- Past the 48 chunks on a yard day, the Campaign pattern draws its hangar under the tracks (as it always has); the generated part keeps the roofs between them.
- Nobody has played it.

## 3c. The desert's generated arena (build 1.2.6.55, composer v6; flown by the test bot, **not by a person**)

Owner: keep the desert's original area for the tank boss (the sand crawler); no city graphics in the sand climate, but variations of the desert's boss area; then "hangars and the city final boss area could be nice to have as one option".

**The old arena.** The desert's Campaign boss ground (`bossland`, theme 2): olive scrub, a winding dirt track, the railway down the left edge at x 18, bushes and palms from the detail pass, and bunkers and flak the director drops at random. It is procedural (it never repeats), but it meets the level's yellow sand at a hard, dithered change of colour.

**Built.** `addDesertArena` builds 48 chunks after the level as its own small plan, in four kinds: scrub (`MEADOW`, typed `grass`), sand (`DESERT`), the dirt track (`ROAD`) and rails (`RAIL`). The game paints them with the old ground's own colours (`desertArenaColor`: pixelColor's scrub and dirt-track formulas with the arena's own track centre, the rails in `planRailColor`, the sand in the level's own `planSandColor`). The game's detail pass runs on its chunks, so the bushes, palms and scars are the old ground's; the tank traps it stamps on sand are left off, since they belong to a coast.

What varies per day:
- the level's sand easing into the scrub over 100 to 260 rows (dithered noise), with one to three sand fields further on;
- the dirt track, going on from the level's road: one track, a fork that parts and meets again, or none, kept in the widest strip clear of any rails after easing in over 160 rows (it may cross a boss's rail there: a level crossing);
- the railway going on at x 18 when the level's reaches its end there;
- two to four gun positions (a bunker by the track, flak beside it; slots).

Land endings get scene zones, as on the city. The long train and the supergun get their rails (beside the level's railway).

Other days:
- a quarter of the arena days get the city's generated final airfield instead (`cityArenaStyle: 'airfield'`, its own hash stream);
- the sea endings get the generated coast and sea, which take the desert's colours from the theme.

The sand crawler, the castle, the two-train yard, the canyon run and the sandstorm keep the Campaign's arena. **79 % of desert days are generated** (desert style 62 %, airfield 16 %, sea 13 %, over 3,000 seeds).

**Fixed on the way:**
- On an arena day the level's sand no longer fades into the scrub over its last 128 rows (`planSandColor`'s `L` now runs to the arena's end); the arena's own sand eases in instead, so there is no sand, scrub, sand.
- `sandSea` passes its parameters on to the sub-plans it builds (the port town through `withPerimeter`), so `cityArena` built an unused arena there. The dispatcher now strips the arena's parameters before the desert builder runs. The level's own plan is byte-identical with and without the arena, and the arena adds about 17 ms (fastest of six runs, 12 days), in line with the city's.
- The sand noise is computed only where sand can be (the lead rows and the fields' boxes), from precomputed lattice tables.

**Checked:** 34 sorties, one of each ending and style (Veteran): every boss killed, no errors, 96 % of the fights' time on the generated arena. Flight gate on 2026-12-03 (gun line), 2026-12-13 (fuel depot) and 2026-12-18 (sand fortress), all difficulties: **9 of 9 pass**, and each determinism twin flew the same. Plan checks over 301 desert-style arenas: no track on a rail after its ease, no jump at the join to the level's road.

**Not done:** on an airfield day the concrete starts directly after the sand (no fence or verge); the forest's, winter's and temperate kit's arenas; nobody has played it.

## 3d. The winter's and the temperate kit's sea endings (build 1.2.6.55, composer v6; flown by the test bot, **not by a person**)

Owner: each climate keeps its own look, as variations of its own Campaign boss area; more kinds of endings, only where the ground makes sense.

### Winter: the open sea after the freight harbour

**Before.** 88 % of winter days already ended on the generator's own finales (the gorge, the rail gorge, the frozen depot). The ship, the squadron, the ghost ship and the slipway (12 %) ended at the `depot` freight harbour, then on the legacy open sea (`seaTail [['open_sea', 7]]`). That sea was painted by `pixelColor` and then given the winter grade, so it met the harbour's water (the plan's, `planSeaColor`, ungraded) at a visible seam.

**Built.** `addIceSeaArena` (`tools/citygen.js`) builds the ending as its own small plan, as the city's sea arena is: the level's sea tail and 48 chunks (`cityArena` = 55; the level's length and the boss's trigger are unchanged). The ground is the winter level's own frozen sea:
- open water (`K.SEA`), painted by the plan painter through the host's own water (`opts.seaPix`, `planSeaColor`), as the harbour's is, so there is no seam; past the arena the game paints the legacy sea the same way, ungraded (`workChunk`'s `preSea` now also covers it);
- floes (`K.ICE`, B −80, with −83 new ice on their rims), painted by the plan painter's own ice (`icePixK`, `seaIceShade`), from a jittered grid of the day's floe size.

What varies per day (`arena.drift`):
- the drift ice along both edges, or only the left or only the right (a fifth of days each);
- the bands' widths (22 to 56 px), breathing along the arena and broken into fields by slow noise (35 to 75 % of the rows);
- after a frozen harbour, broken floes drifting out from its mouth over 160 to 360 rows, thinning to open water; otherwise, on half the days, a field of pancakes at the mouth.

The channel x 64 to 160 stays open water past the mouth for the ships. There are no targets: the legacy open sea has none, and the game brings its boats as there. The winter line's own plan is byte-identical with and without the arena (17 of 17 arena days among 120 seeds). The arena takes 10 to 38 ms (median about 17).

**Checked:** 8 sorties (two of each ending, both edge kinds, iced and open harbours; Veteran): all bosses killed, no errors, 98.6 % of play time on generator ground, 100 % of the fights. Flight gate on 2027-01-09 (squadron) and 2027-01-19 (ghost ship), all difficulties: **6 of 6 pass**, and each determinism twin flew the same. **Every winter day now ends on generator ground.**

### Temperate: the coast after the old land, then the sea

**Before.** No temperate day ended on generated ground. The plan ends at the mainland's gate (with the old land's built-up stretches, `city_small`, `industrial_light`, `airbase_searchlight`, after it as legacy chunks) or at its own cove. Then came the legacy `coast_down` chunk and `open_sea`. Every ending is over that sea.

**Built.** `KITS.temperate.cityArena.legacySea` lists the endings whose arena is the sea: the ship, the slipway, the squadron, the wolfpack, the ghost ship, and the air bosses that fight over it (the sky fortress, the Shadow Wing, the Raven, the Moth, the rival). The sea-fort castle keeps the Campaign's sea, because its ruin floor is drawn over it. That makes **92 % of temperate days** (1,848 of 2,000 seeds):
- **Days with built-up stretches** (66 % of days): the Campaign's coast (`addSeaArena`, as the city's: grass, sand with its tank traps, surf, sea; the day's own shoreline, bunkers and flak) comes after them. The arena's plan starts `cityArenaGap` chunks after the level's plan (`A.y0 = plan.L + gap`), and the legacy stretches stay between them. On the arena's grass, the old land's dirt track and railway run on to the sand, as on the Campaign's coast chunk; the railway ends at a buffer stop 8 rows short of the sand (`arenaJoin`, painted with the game's own road and rail formulas).
- **Cove days** (27 %): open sea from the mainland's own cove (`cityArenaOpen`: no coast), the same water as the plan's, so no seam.
- **Both:** none to three islets near the edges (`seaIsles`, out past the coast, never in the channel x 64 to 160), in the coast's kinds and colours, the water lit near them as near a coast (`A.isleD`). A larger one has a bunker on its sand or a flak gun (slots marked arena) on 70 % of days.

**In the game.** `sortiePlanIslands` keeps the plan's own end (`S.planEnd`) and the gap (`S.planGap`, rebuilt from the plan, so no new snapshot state). `sortieInfo` treats the gap's chunks as legacy, and the arena's chunks keep their stretches' biomes. The old land's gate join keys on `S.planEnd`. `roadXc` and `roadT` measure from the plan's end in the gap and from the arena's end after it; without a gap the old behaviour is unchanged. Gate 1 checks the gap, the coast and the islets against the old land; `kit-check.mjs` checks the arena's rows. The level's plan is byte-identical with and without the arena (52 of 52 days).

**Checked:** 20 sorties, one of each ending on an old-land day and on a cove day (Veteran): all bosses killed, no errors, 98.7 % of play time on generator ground, 100 % of the fights. Flight gate on 2026-11-27 (Moth), 12-02 (wolfpack) and 12-27 (sky fortress, old land), all difficulties: **9 of 9 pass**, and each determinism twin flew the same. 2026-12-02's "low" bullet counts are the same on the build before this work. On 12-27 the sky fortress died sooner (Rookie 187 s against 209 s, Veteran 124 s against 167 s; Ace the same).

**Test battery (both kits' changes together):** `compose.mjs` 77, `citysegs` 8, `citygen` goldens, `daily.mjs` 341, `enigma` 213, `fixed-seed` 41, `smoke`. `node tests/enigma.mjs --pixels` gives the same six stage hashes as the build before this work (e326f0c: c0f2b20c, 969d4eec, d2a2fb45, cc006206, 639c2e8a, 7427862d); it fails against the stored reference on both, as before.

**Not done:**
- the sea-fort castle's ending;
- an airfield option and land endings for these kits (the temperate level ends at the sea; how it should end on land is the owner's decision);
- the old land's built-up stretches as generator ground (A3);
- the probe's "other" class: ground enemies before chunk 0 (the carrier's start, about 2 % of the temperate kit's);
- nobody has played it.

## 3e. Temperate land days (build 1.2.6.55, composer v6; flown by the test bot, **not by a person**)

Owner, asked how the temperate level should end on land: "options for more land; there should also be temperate levels that are focused on land in general".

**The level.** In 40 % of temperate days (`KITS.temperate.landShare`, its own stream, `hash(base, 6980)`), the day is composed from the kit's land variant (`KITS.temperate.landKit`; `S.land`). It is a short crossing, then a long mainland that runs to the level's end:
- **the crossing:** the carrier, four chunks of open sea, perhaps a band of islets and a little more sea, then the large island with its airbase (a stretch of 9 to 12 chunks: the island is 620 rows, and a longer stretch has open sea after it), then two chunks of open sea;
- **the mainland:** the fortified shore, then 24 to 32 chunks of farmland, streams, a village and woods (up to three farms, two streams and three woods), with no cove, no gate and no old land.

Levels are 46 to 63 chunks long, of which about two thirds is mainland. Encounters: the kit's own, plus the village's flak lane and a fuel convoy on the road through a wood. On land days an encounter that would still run when the boss comes is left out (`encPlanFor`, as for the old land): the first flights failed the gate twice, with the farmland's formations cut off by the boss. 4.6 % of land days have no encounter; the gate's dead-air rule passes them.

**The arena.** `addLandArena` builds 48 chunks of the same mainland as the arena's own small plan:
- it uses the islands builder in a mainland-only mode (`P.mainOnly`: land from the first row; no shore, so the distance transforms and the beach pass are skipped);
- the level's main road goes on without a step (`P.phM`, `P.yOff` and an ease from the level's last road x, `P.road0`);
- the game paints it with the level's own paint options;
- each day walks its own farmland, woods and streams;
- on a land ending's day there is open pasture (`main_open`: the road and grass, nothing built) every few stretches from the sixth chunk, as scene zones (`arena.zones`, 272 rows each). The scene and its enemies go in the first zone still ahead (`sceneZoneAt`), as on the city and the desert;
- the mainland's gun pits and bunkers are the arena's targets (`planArena`);
- past the arena the legacy ground is the Campaign's country (`S.arenaLand`), not the sea.

Land days have their own boss pool: the gun line, the tank column, the fuel depot, the airbase, the silo, the bridge and the dam (scenes), the land fortress, the sky fortress, the Moth, the Raven, the rival and the Shadow Wing. The level's plan is byte-identical with and without the arena.

**Checked:**
- **Flights:** 13 sorties, one of each land ending (Veteran): every boss killed, no errors, 98.4 % of the play before the boss on generator ground. In the fights: 84 % on the arena, 12 % on the level's last chunks (the boss comes one chunk after the level), 3.6 % past the arena.
- **Flight gate** on the next five land dates (2026-11-27 rival, 12-02 sky fortress, 12-17 Moth, 12-22 sky fortress on a Fast scroll day, 12-27 dam), all difficulties: **15 of 15 pass**, and each determinism twin flew the same.
- **Composer:** gate 1 is clean on 15,000 composed days (all kits). Land days need at most 20 tries of 64 (mean 2.7). `compose.mjs` now checks land days against their own grammar and pool.
- **Test battery:** `compose.mjs` 77, `citysegs` 8, `citygen`, `daily.mjs` 341, `enigma` 213, `fixed-seed` 41, `smoke`. `enigma --pixels` gives the same six stage hashes as before this work.
- **Not checked:** scene fights on screen by eye (the contact sheets show the zones, not the fight); nobody has played it.

**Meadows (owner: "the open pasture could look more like meadows with sheep and cows").** The open stretches (`main_open`) are now meadows:
- one to three fenced paddocks with the game's cows (`plan.pastures`, as the farms' paddocks);
- one or two flocks of sheep grazing free (`plan.flocks`; the game spawns them in `planCows`);
- one or two hedgerows across the meadow (a gap at the road and a gateway), sometimes a hedge down one side;
- sometimes a pond with a willow and a copse, and four to eight lone trees.

Days without a scene have meadows in their arena walk too. When a scene is laid in a meadow, the animals there are removed, and none spawn under it later. `planCows` was not called once the boss had come, so the arena's animals now also come during the fight, on land days only (its own stream, `ttSeed(43)`). Checked by eye in a flight's screenshots (the sky fortress over a meadow: cows in their paddocks, sheep, the hedges and a pond). The arena now takes 117 to 156 ms.
Re-checked with the meadows: 13 land endings, all bosses killed. In the fights: 81 % on the arena, 11 % on the level's last chunks, 8 % past it. Flight gate on the five land dates: 15 of 15, twins the same. The test battery is green, and the Campaign pixel hashes are unchanged.

**Cost.** The arena takes 80 to 200 ms (median about 150) in Node, against the desert's 17. The islands builder's farmland and woods cost about 3 ms a chunk. Two speed-ups of the builder have the same output (50 of 50 temperate and Campaign level 1 plans byte-identical): the mainland fill no longer evaluates the cove's curve on every row, and the small-field merge uses typed arrays. They did not shorten the arena measurably. A shorter arena (32 chunks) would take about a third off; that is the owner's call (start time against arena length).

## 3f. The winter airfield (build 1.2.6.55, composer v6; flown by the test bot, **not by a person**)

Owner: "Winter airport - give it destructible hangars etc" (the city's final airfield is the one look allowed outside its own climate).

**Which days.** The winter's bosses that fight on a plain airfield are the land fortress, the sky fortress, the Moth, the Raven, the rival and the Shadow Wing. On 40 % of their days (`KITS.winter.cityArena.air`, its own stream, `hash(base, 6995)`), the boss fights on the airfield instead of in the gorge. That is 142 of 1,000 sweep seeds, and 13 of the next 500 calendar days, today (2026-11-25) among them. `cityArenaFor` takes the day's base to decide. Gate 1 checks `S.arenaAir`, the finale and the approach.

**The level's end.** The approach is the sea ending's (the pass, then 14 chunks of farmland), and the line ends at a railhead (`winterLand`, `finale: 'airhead'`; no gorge, `plan.airhead`). Below the massif the floor opens out flat, with low snow banks and conifers at the edges. On it:
- the two lines come out of the portals (x 96 and 122) and end at buffer stops, with a platform and canopy between them;
- a siding (x 148) holds three wagons;
- a fuel depot of six round tanks stands in a gravel bund with a pump house;
- goods and freight sheds, a goods office and a signal box;
- flak on five gravel lots and two trucks;
- then a band of cleared concrete with a wire fence, a gate and a guard house each side.

**The arena.** It is `addArenaField` with `o.winter` (48 chunks, the arena's own small plan, `A.snowA`). The layout is the city's: units of an open stretch, the centre line and a roof, with pads on both edges. The winter's differences:
- hangars are 60 % as long, and every roof is split into bays 3 px apart (about 46 px each). Each bay is a slot `hangar`, which the game fills with an `ahangar` target (hp 24 + 0.55 × width, times the difficulty; harmless, low priority for the Arc). Destroyed, it goes up in a chain of blasts and smokes, and `hangarRuin` paints a burnt-out shell over its roof in every ground chunk it touches;
- on open stretches without a side helipad: a control tower with its radar dish (the game's `tower` and `radar`), or a fuel farm of three tanks;
- the paint (`arenaColor`, `snowApron`): the airfield's slabs and joints in the winter's concrete, drifts of snow on them and ploughed banks along both edges; the hangar roofs in the winter's snowy roof colours, with the ribs showing through in places. The door stripes, pads, helipads and centre line are the city's.

**Checked:**
- **Flights** (`gen-share.mjs --kit winter`, 8 sweep seeds: every one of the six bosses, the rival and the Shadow Wing twice; Veteran, immortal): every boss killed. Before the boss, 92.7 % of play is on generator ground (the plan), 5.7 % on the arena and 1.6 % before the level. In the fights, 96.3 % is on the arena and 3.7 % past its end (one long fight).
- **Hangars:** on 2026-11-25 (Moth, Veteran, immortal) the bot destroyed 29 of the 36 bays that came up, and 4 of the 8 towers and radar dishes.
- **Flight gate** on the next three airfield dates (2026-11-25 Moth, 2027-01-04 Moth, 2027-02-08 sky fortress), all difficulties: **9 of 9 pass**, and each determinism twin flew the same.
- **Cost:** an airfield day builds in 1.1 to 1.4 s in Node, against 1.8 to 2.1 s for the same day with the gorge (measured while other tests ran).
- **Test battery:** `compose.mjs` 77, `citysegs` 8, `citygen`, `daily.mjs` 341, `fixed-seed` 41, `smoke` all pass; `enigma` 213 pass. `enigma --pixels` gives the same six stage hashes as the base (c0f2b20c, 969d4eec, d2a2fb45, cc006206, 639c2e8a, 7427862d). Its six pixel checks fail against the stored reference file exactly as they do on the base; the reference file was left alone.
- **Not checked:** nobody has played it. The hangar ruins were looked at in screenshots of one flight only.

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
