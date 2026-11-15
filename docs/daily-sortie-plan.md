# Daily Sortie: composer plan

Status: plan, draft 1. Phases 0, 0b, 1 and 2 are done (sections 6, 6.6, 7 and 8): the Daily Sortie flies in the game behind the test link `?daily=`. There is no flight gate, no title entry and no board yet. Written for the agent that will build it; the owner decides the points marked **[owner]**.

## 0. Goal and ground rules

A **Daily Sortie** is one level-length challenge (about 5 minutes including the boss) that is the same for every player on a given day. It is put together by a **composer** from the segments the generator already knows, and every day's sortie is flown by the test bot before players see it.

Read first: `CLAUDE.md`, `ARCHITECTURE.md`, `tests/README.md`, and in `docs/enigma-world-spec.md` sections 3, 4, 9, 10, 12 and 21 (grep the headings). Follow the repo rules:
- `tools/citygen.js` is the source; `node scripts/embed-citygen.mjs` after every change to it.
- `VERSION` in `index.html` and `sw.js` match; bump both and add a `CHANGELOG.md` line per build.
- No `//` comments inside code passed to `page.evaluate` / `addInitScript`.
- The Campaign must not change: `node tests/replay.mjs`, `node tests/enigma.mjs` and `node tests/fixed-seed.mjs` stay green with no `--update`, in every phase.
- Everything the composer decides is drawn from `sortieHash` streams, never `Math.random`.
- Don't put model names in commits, code or docs.

Each phase below ends at a **stop point**: commit, push, and report the numbers to the owner before the next phase.

## 1. What exists (checked in the code, build 1.2.6.37)

| Fact | Where | What it means for the composer |
|---|---|---|
| A sortie is `{level, seed, segs:[{t,start,n}], len, encPlan, bossAt, arcLen, climate, timeOfDay, gen, ud, rng, …}`. | `buildSortie` (`index.html`) | The composer's output is this object. Most consumers already read it generically. |
| Each level's segment list is hand-written (`ENIGMA_SEQ`) and the loops vary it with one ad-hoc block per level (`loopSeq`: swap two named neighbours, ±1 chunk). | `ENIGMA_SEQ`, `loopSeq` | There is no general composer. `loopSeq` is the closest thing and is what the composer replaces for daily use (the Campaign keeps `loopSeq`). |
| Ground comes from one plan builder per level, picked in `sortiePlanBuild`. | `sortiePlanIslands`, `sortiePlanLevel2..5`, `sortiePlanHarbour` | Template names are only meaningful to the builder that reads them. |
| **Three presets take the segment list itself** (`params.segs`, `[{t, n}]`) and turn each segment into features: `sandSea` (level 2, `desertLand` features), `ironForest` (level 4, `ironForestFeatures`), `winterGorge` / `winterLine` (level 5, split at the first `farmland_winter` and joined with `stackPlans`). | `tools/citygen.js` | These are the composer's first **kits**. Within one kit, the composer can vary the order, lengths and repeats of segments **if the preset tolerates it** (unverified, see phase 0). |
| Level 3 (`longNight`) and level 6 (`portSouth`) take fixed fractions found by name (`fr('rail_corridor')`): each template must appear exactly once. Level 1's islands need `island_chain`, `island_airbase` and `beach_fortified`. | `sortiePlanLevel3`, `sortiePlanHarbour`, `sortiePlanIslands` | Not composable without generator work. Later kits (phase 5). |
| Some presets assume fixed openings and endings: `sandSea` builds the port from the leading `harbour_commercial`/`beach_town`; `ironForest` expects `beach_cliff` first and `farmland_approach` last (the castle road at x 112); `winterGorge` adds the gorge arena (`GORGE_ARENA`) after the level for the train boss. | the presets | Each kit has a fixed **opener** and **approach** around a composable middle. |
| Urbanisation and damage per chunk come from `SORTIE_UD[template]`, interpolated between segment middles. | `SORTIE_UD`, `sortieUD` | Works for any segment order. |
| The boss trigger is `bossAt` (chunks from the start), and pacing uses `arcLen` with the `ARC` table in fractions of the level. | `buildSortie`, `ARC`, `directorInner` | Both scale with a composed length. |
| Encounters are placed per segment by name in the loop sorties (`encPlan`: `oasisambush`, `burningfield`, `fuelconvoy`, `cliffbattery`, `valleyconvoy`, `iceraid`, `iceroad`, `basebreak`, …) and the Campaign plays on a timetable (`TT_ENC`). | `buildSortie`, `ENC_PLAN`, `docs/encounter-director-plan.md` 7c | The composer can attach encounters to segments from a table instead of by hand. |
| Bot: `tests/harness.js` (`SF.start`, `SF.run`, `SF.human(lag, react)`, immortal mode counting hits, `SF.attrib`, `SF.bossTime`, `flyCampaign` metrics: hits, top bullet window, bullets before and during the boss, boss seconds). `SF.run` returns `next:<level>` at a level change. | `tests/harness.js` | The playability gate reuses these measures. |
| Determinism tooling: `fixed-seed.mjs` (two pages, different `Math.random`, same spawns), `resume-exact.mjs`, `contact.mjs` (screenshots along a level), `enigma.mjs --bench` (chunk build times). | `tests/` | Reuse their patterns for the daily sortie. |
| There is no Daily Sortie and no `daily` leaderboard mode (`MODES` in `worker.js`). Generative mode is forced off (`settings.mode = 'camp'` at load). | `index.html`, `worker.js` | The daily sortie is a new, separate start path. It does not revive `settings.mode === 'gen'`. |

## 2. Design

### 2.1 Kits

A **kit** is everything that belongs to one climate's ground: its preset, its segment vocabulary and grammar, its boss, its time of day and weather, and its encounter table. The first kits are the three segment-native presets:

| Kit | Preset | Opener (fixed) | Middle vocabulary | Approach and boss |
|---|---|---|---|---|
| `desert` | `sandSea` | `harbour_commercial`, `beach_town` | `valley`, `village`, `station_junction`, `desert_open`, `airbase_desert`, `pass` | last `desert_open`, then the level 2 boss (`bossAt = len + 5`) |
| `forest` | `ironForest` | `beach_cliff` | `forest_conifer`, `forest_fortified`, `clearing_village`, `airbase_forest_hidden`, `valley` | `farmland_approach`, castle boss (`bossAt = len + 3`) |
| `winter` | `winterGorge` | `open_sea_ice`, `harbour_winter`, `farmland_winter` | `village`, `lake_valley`, `station_winter`, `airbase_snow`, `forest_conifer` | `pass`, `farmland_winter`, gorge arena, train boss (`yardWait()`) |

The table is a starting point taken from `ENIGMA_SEQ`. Phase 0 confirms or corrects it from what the presets actually tolerate.

Kit data shape (one object per kit, in the composer module):

```
{ id, preset, level,            // level: whose boss, theme, palette and bossAt rule it borrows
  opener: [[t, n], ...],        // fixed, in order
  approach: [[t, n], ...],      // fixed, in order, last
  middle: { t: { len: [min, max], max: k, family, density: [lo, hi], enc: [encounter ids] } },
  follows: { t: [t, ...] },     // allowed next template (adjacency), derived in phase 0
  len: [minChunks, maxChunks],  // total, from phase 0 baselines
  rules: [...]                  // extra hard rules, e.g. "at most one airbase", "a station needs the rail the junction brings"
}
```

### 2.2 The composer

`composeSortie(kitId, seed)` is pure and deterministic. It returns the segment list plus everything `buildSortie` derives from it:

1. **Length**: draw a total from `kit.len`.
2. **Middle**: a seeded walk over `kit.follows`. At each step pick among the allowed templates, weighted down by repetition (no template twice in a row, respect `max`) and by rhythm (after two segments with density above 0.3, prefer a quiet one). Draw each segment's length from its `len` range. Fit the sum to the target by trimming or extending the longest or shortest flexible segments, as `loopSeq` level 5 already does.
3. **Validate** against the kit's hard rules and spec 4.4 (section 3, gate 1). On failure, re-draw with the next sub-seed (`sortieHash(seed, attempt)`). Cap the attempts at 64. If all fail, the kit's grammar is wrong: throw, and let the tests catch it.
4. **Derive**:
   - `segs` with `start`.
   - `encPlan`: for each segment with an `enc` list, at most one encounter. Keep at least `MIN_GAP` chunks between encounters and follow the `ARC` rest rules. Positions use the existing `{id, c, until, live}` form.
   - `bossAt` and `arcLen` from the kit's level rule.
   - `ud` from `sortieUD`.
   - `rng`, `climate`, `timeOfDay` and the weather plan from the kit.

The composer lives in a new pure module, `tools/sortie-compose.js`, written in the same style as `citygen.js`: no DOM, no game globals, and `module.exports` for Node. It gets into `index.html` the way citygen does. Extend `scripts/embed-citygen.mjs` (or add a sibling script) to embed it as a second `type="text/plain"` block run by the same loader, and make `tests/compose.mjs` fail while the copy is stale. The module also exports the kit tables, so the tests and the game read one source.

### 2.3 The daily seed

- `dailySeed(dateKey)`, with `dateKey = 'YYYY-MM-DD'` in **UTC**. **[owner]** UTC is recommended, so every player has the same day. It computes `sortieHash(DAILY_SALT, yyyymmdd)` and picks the kit by rotation (`desert`, `forest`, `winter`, …). Rotation is recommended over random so consecutive days differ.
- **Reroll table**: `DAILY_REROLL = { 'YYYY-MM-DD': k }` in the composer module. A date listed there uses sub-seed `k`. The bot gate (phase 4) adds entries for dates whose sortie fails.
- **Version pinning**: a generator or composer change can change what a date produces. The sortie therefore carries `composeVersion`, and anything keyed by date (a board, saved results) uses `date + composeVersion`. **[owner]** decides what happens when a new build lands mid-day. Recommended: the sortie of the version a player started with stays valid for that day.

### 2.4 In the game

- A new start path, `startDaily(dateKey)`, modelled on `startEnigma`. It builds the sortie from the composer instead of `ENIGMA_SEQ`, borrows the kit level's boss, theme and art (`setEnigmaArt`), and ends at the results screen. It never flies on into another level (`ENIGMA_NEXT` does not apply).
- Mark it `run.daily = {date, kit, seed, v}`. Resume saves `{daily}` and rebuilds the sortie from it. `resetTerrainState()` runs on start, as for any run.
- **Nothing counts by default**: no Campaign board, best score, loop or play data, the same as an Enigma practice run. A daily board is phase 6 and **[owner]**.
- Test link: `?daily=2026-11-14` (local builds) starts that day's sortie. `?daily=2026-11-14&kit=forest&sub=3` forces a kit and sub-seed for debugging.
- The title screen entry comes in phase 4, after the gate works. Until then the daily sortie is reachable only by the test link.

## 3. Validation: three gates

Each composed sortie passes three gates, from cheap to expensive.

**Gate 1, composer (Node, microseconds).** Runs inside `composeSortie`:
- opener and approach present and in place;
- every adjacency in `follows`;
- per-template `max` and `len`;
- the total length in range;
- the spec 4.4 hard rules that apply to the kit;
- encounter spacing.

**Gate 2, plan (Node, ~0.2–0.5 s per sortie).** `CityGen.generate` with the kit preset and the composed `segs`, then:
- `CityGen.validate(plan)` without errors;
- density per segment inside its template's `[lo, hi]`, using spec 3.2's definition (peak ≤ +10 points);
- plan length equal to `len × 64` (plus the gorge arena for `winter`);
- generation time below the kit's baseline p95 × 1.5.

**Gate 3, flight (browser, ~1–3 min per sortie, measure in phase 0).** The bot flies the sortie with `SF.human(8, 15)` in immortal mode on all three difficulties and records:

| Measure | From | Fails when |
|---|---|---|
| page errors | `pageerror`, `SF.R.errs` | any |
| reaches the boss | `R.stages[...].bossIn` | not within the kit level's baseline time × 1.3 |
| boss killed | `bossDead` | not within `SF.bossTime`'s limit for that boss |
| hits (bullets and rams) per minute before the boss | `R.hits` | above the kit level's baseline max × 1.25 (too hard) |
| worst 10 s bullet window, average bullets | the `flyCampaign` measures | above the kit level's baseline max × 1.2 |
| dead air | enemies on screen per second | any stretch of 20 s or more with no threat on screen and no encounter (rules in phase 3) |
| too easy | hits per minute, kills | below the kit level's baseline min × 0.5 (a warning, not a failure, until the owner sets a floor) |
| chunk build time | as `enigma.mjs --bench` | p95 above the kit level's baseline × 1.5 |
| determinism | two pages with different `Math.random` (the `fixed-seed.mjs` pattern) | different spawns, score or end state |

Every threshold is relative to a **baseline measured on the hand-made level of the same kit** (level 2, 4 or 5, its first pass and its first loop). None of them are invented numbers. Phase 0 measures the baselines and stores them in `tests/daily-baseline.json`.

## 4. Phases

### Phase 0: evidence (no game change)

1. **Kit robustness probe** (`tests/compose-probe.mjs`, Node only). For each of `sandSea`, `ironForest` and `winterGorge`, generate plans from mutated segment lists: the original; middle segments reordered; one repeated; one dropped; lengths ±50 %; total length −20 % / +20 %. Use 20 seeds each and run `CityGen.validate`. Record which mutations throw, fail validation, or produce features outside their segment (for example an oasis placed in the wrong stretch).
2. From the results, write `follows`, `max` and `len` per kit, plus every preset limitation found, into section 6 of this file. For each limitation, note whether it is fixable in the generator and roughly how much work it is.
3. **Baselines**: fly levels 2, 4 and 5 (first pass and first loop) with the bot on all three difficulties, three seeds each where a loop seed applies. Store the gate 3 measures and the plan timings in `tests/daily-baseline.json`. Also record how long a flight takes, which sets the gate 3 budget.

**Stop point:** report the probe table, the derived grammar and the baselines.

### Phase 0b: generator fixes (decision 7)

- Fix rows 1, 2, 3, 8 and 9 of section 6.3 in `tools/citygen.js`, one commit each, then `node scripts/embed-citygen.mjs`.
- Before the first fix, store a hash of `K` and `B` for 20 seeds of each kit's original list (and the loops' variants: `variant` 1 to 3, `autumn` + `lakes`, winter `variant` 1). After each fix every hash must be unchanged.
- Re-run the probe rows each fix targets; `node tests/citygen.mjs`, `enigma.mjs` and `fixed-seed.mjs` stay green; `replay.mjs` gives the same output as before (section 6.5, item 11).
- Update the grammar in 6.2 with what the fixes free up.

**Stop point:** the probe rows before and after, and the unchanged hashes.

### Phase 1: composer module

- `tools/sortie-compose.js` with `KITS`, `composeSortie`, `dailySeed`, `DAILY_REROLL` and `composeVersion`. Embed it as in 2.2.
- `tests/compose.mjs` (Node, runs in CI with the unit tests):
  - determinism (same seed, same output; different sub-seeds differ);
  - gate 1 on 10,000 seeds per kit;
  - gate 2 on 300 seeds per kit (sharded like `citygen.mjs` if slow);
  - variety: across 1,000 seeds, report how many distinct segment orders appear and how often each template appears, and fail if a middle template never appears;
  - the embedded copy is current.

**Stop point:** report the pass rates, the variety numbers, and some example sequences per kit.

### Phase 2: in the game, behind the test link

- `startDaily`, `run.daily`, resume, the test link and the art and boss borrowed from the kit level (2.4).
- `buildSortie` takes an optional composed sequence instead of `ENIGMA_SEQ` / `loopSeq`. The Campaign path must stay byte-for-byte identical in what it produces.
- `encPlan` from the composer. Encounters whose code looks up a segment by name must find it or must not be scheduled. Grep each encounter id from the kit tables for `segs.find` and similar.
- Extend `tests/enigma.mjs`, or add `tests/daily.mjs`, with:
  - the daily sortie starts from the link and builds its plan;
  - the ground types come from the plan;
  - it is identical after a resume and identical in two pages;
  - it never counts toward boards or bests;
  - a Campaign scenario played afterwards in the same page still equals `golden.json`.
- `node tests/replay.mjs`, `node tests/enigma.mjs` and `node tests/fixed-seed.mjs` stay green without `--update`.

**Stop point:** contact sheets (`tests/contact.mjs` extended to take `?daily`) of one sortie per kit, so the owner can look at them.

### Phase 3: the flight gate

- `tests/daily-gate.mjs`: `node tests/daily-gate.mjs --from 2026-12-01 --days 14 [--diff 0,1,2] [--kit desert]`. It composes each date's sortie, runs gates 2 and 3, and prints one line per date and difficulty with every measure and PASS or FAIL against `tests/daily-baseline.json`. A failing date gets its contact sheet written to the output folder, along with the cause.
- Define "dead air" precisely, and only from data. In the phase 0 baselines, find the longest no-threat stretch of the hand-made levels and set the limit just above it.
- Sweep 200 seeds per kit and report the failure rate per measure. If more than 10 % fail, fix the kit grammar or the encounter table, not the thresholds. Change a threshold only with the owner's agreement.

**Stop point:** the sweep report, plus the failure causes grouped.

### Phase 4: daily vetting and the title entry

- A scheduled GitHub workflow (daily) runs `daily-gate.mjs` on the next 14 days and opens a pull request that adds `DAILY_REROLL` entries for any failing date, rerolling up to 8 sub-seeds. The owner merges it, so no unvetted sortie ships. A build carries the reroll table, so a date needs its vetting merged at least one release before it goes live. The workflow therefore looks 14 days ahead.
- A title screen entry, DAILY, shows the day's kit name and starts `startDaily(today UTC)`. Show the results screen with the run's totals. It doesn't count anywhere until phase 6.

**Stop point:** the owner plays a week of sorties.

### Phase 5: more kits (generator work)

These need the generator to accept `segs` the way `sandSea` does. Each is its own task with its own city lab review, following the spec's habit:
- `night`: `longNight` reads `fr()` fractions, so it has to become segment-driven. This is the smallest step, because its features already map one-to-one to templates.
- `city`: `portSouth`, the level 6 harbour city.
- `temperate`: the islands preset plus the legacy farmland ground.

### Phase 6: the board [owner]

Only after the owner decides: a `daily` mode in `worker.js` (`MODES`) keyed by `date + composeVersion`, with one board per day and difficulty, plausibility limits from the gate 3 baselines, and tests in `worker.test.mjs`. Until then, scores stay local.

## 5. Decisions for the owner

**Decided by the owner (2026-11-14):**
1. The day is **UTC**.
2. The kit is picked by **rotation**.
3. Difficulty is the **player's choice**, so every date is gated on all three difficulties.
4. When a new build changes a date's sortie mid-day, **the version the player started with holds** for that day (2.3).
6. The daily sortie plays on the **Campaign's fixed timetable** (`TT_ENC`, ARCHITECTURE.md "The Campaign's timetable"), so every player meets the same challenge. It does not use the reactive director.

7. (2026-11-14, after phase 0) The small generator fixes of section 6.3 go in **before phase 1**: rows 1, 2 and 3 (desert: `pass → airbase_desert`, `desert_open → village`, the village's length), 8 (winter: `lake_valley` first) and 9 (winter: more than one village or lake). Row 4 (`plan.airbase` and `plan.fort` as lists) touches the game and waits for phase 2. Each fix must leave the plans of the hand-made lists exactly as they are (same seed, same `K` and `B`), so the Campaign does not change; `tests/compose-probe.mjs` shows the before and after. The large rows (7 and 11, own ground for the forest and winter templates) stay with phase 5.

**Still open:**
8. The "too easy" and "too hard" measures of gate 3 (section 6.5, items 3 and 4). Not needed before phase 3: until then the gate records every measure and judges only errors, the boss, dead air and determinism.
5. Should there be a daily board, and does it get its own plausibility rules? (Phase 6. Don't build it until the owner decides.)

## 6. Phase 0 findings

Measured on build 1.2.6.37, 2026-11-14. No game code changed. Reproduce with:

```
node tests/compose-probe.mjs                      # 6.1 to 6.3 (about 20 minutes; --kit, --group, --seeds narrow it)
node tests/compose-probe.mjs --kit desert --group adjacent --seeds 80    # every desert neighbour pair with 20 seeds
python3 -m http.server 8000 &
node tests/daily-baseline.mjs --twice --save tests/daily-baseline.json   # 6.4 (about 5 minutes)
```

### 6.1 Probe table

Plans that came out clean, of plans made (20 seeds per mutation; `adjacent` and `sweep` 5 seeds per row, `repeat` and `endlen` 10). Clean means: no throw, `CityGen.validate` passes, the plan is as long as its segments (plus the arena), every template's own feature lies in a segment of that template (40 px of tolerance), and no segment lacks its feature.

| Mutation | desert (`sandSea`) | forest (`ironForest`) | winter (`winterGorge`) |
|---|---|---|---|
| original list | 20/20 | 20/20 | 20/20 |
| middle shuffled | 12/20 | 20/20 | 18/20 |
| each ordered pair made neighbours | 138/150 | 100/100 | 80/100 |
| one template twice (side by side, apart) | 117/120 | 100/100 | 70/100 |
| one middle segment dropped | 120/120 | 140/140 | 80/100 |
| one length -50 % / +50 % | 233/240 | 200/200 | 200/200 |
| one length at 1, 2, 3, 4, 14, 20 chunks | 146/180 | 150/150 | 147/150 |
| total -20 % / +20 % | 72/80 | 74/80 | 40/80 |
| opener or approach dropped, moved, halved | 120/160 | 76/120 | 20/160 |
| each fixed segment at 1 to 4 chunks, x1.5, x2 | 180/180 | 98/110 | 220/300 |
| plans in all | 1270 | 1040 | 1230 |

What failed, by cause (each confirmed with a 20-seed run of its own unless a count says otherwise):

| Kit | Mutation | Result | Cause |
|---|---|---|---|
| desert | `pass` directly before `airbase_desert` | 0/40 valid | The fort at the pass's upper end is overlapped (54 px and more): the track swings across to the airbase's side through it. |
| desert | `desert_open` directly before `village` | 12/20 and 13/20 valid | A block of the held village overlaps (24 px). |
| desert | `village` longer than 6 chunks | 7: 19/20, 8: 14/20, 9: 14/20, 10: 15/20, 12: 14/20 | A village block lands on the railway (overlap, trains blocked). 4, 5 and 6 chunks: 20/20 each. 3: 19/20. 1 and 2: 3/10. |
| desert | `village` twice, side by side | 7/10 | The same village fault. Twice but apart: 10/10. |
| desert | `station_junction` at 1 or 2 chunks | 0/10 clean | Valid, but its sidings and wagons lie in the neighbouring segment. |
| desert | `airbase_desert` at 1 chunk | 0/5 clean | Valid, but no runway. 2 chunks and more: clean. |
| desert | `pass` at 1 or 2 chunks | 0/10 valid | Overlap (62 to 195 px). 3 chunks and more: clean. |
| desert | opener dropped (no harbour, no beach town) | 20/20 throw | `sandSea` needs the port. One of the two alone is clean. |
| desert | opener behind the first middle segment | 0/20 clean | The port is found by name but the land starts by position: a segment before the port gets no feature. |
| forest | `beach_cliff` under 3 chunks | 2 chunks: 22/30 valid, 1 chunk: 0/10 | Casemates overlap on the short cliff. This is also what fails "total -20 %" (3 becomes 2). |
| forest | `beach_cliff` not first | 0/20 valid, and the level no longer opens over the sea | The road loses its connection (tank reach 0.04 to 0.05). |
| winter | `lake_valley` first after the first `farmland_winter` | 0/52 valid | Tank reach 0.36 to 0.39: the road does not join across the seam of the two plans where it skirts the lake. This is also what fails "village dropped" and four of the neighbour rows (the lake became first). Any other template first: 10/10 each. |
| winter | `village` or `lake_valley` twice | second one missing, 30/30 | `winterLand` builds the first village and the first lake only. Side-by-side villages read as clean but are one village and plain valley. |
| winter | `village` at 1 chunk | 2/5 valid | Tank reach. 2 chunks and more: clean. |
| winter | every segment -20 % / +20 % | 0/40 | Only the last `farmland_winter` matters: the spur, the massif and the gorge mouth have a fixed size, so the gorge opens 118 px before the level's end at 11 chunks (54 px at 10, 182 px at 12: 6/6 clean each) and outside the window the generator's own test allows (0 to 220 px) at 9 or 13 (0/6 each). The middle alone -20 % / +20 %: 40/40. |
| winter | last `farmland_winter` at 1 to 4, 17 or 22 chunks | 0/60 | The same. |
| winter | the sea or the first farmland dropped, the whole opener dropped or moved | 0/80 | The plan splits at the first `farmland_winter`: without it the plan is too short (20/20), a middle segment before it gets no feature, and without the sea the ice holes land in the next segment. |
| winter | approach dropped, or not last | 0/40 | No gorge, no tunnel mouths; or the gorge opens 566 px before the end. |
| winter | `pass` at 1 chunk, `open_sea_ice` at 1 chunk | 0/10 each | The gate lands in the forest; no ice hole. 2 chunks and more: clean. |

Never seen in any kit: a feature placed in a segment of another template after a shuffle, a new neighbour, a repeat or a drop (0 of 1090 plans). Features follow their segments. The approach is a preset limit in winter only: in the desert and the forest, dropping or moving it leaves a valid plan (20/20 each), so there it is fixed for the boss, not for the generator.

### 6.2 Grammar per kit

Lengths in chunks. "Today" is the hand-made level. `len` is the range that stayed clean; where it reaches 20 that end was tried with 5 seeds only.

**desert** (`sandSea`, level 2, 72 chunks today)

| | Segment | `len` clean | Today | `max` | Notes |
|---|---|---|---|---|---|
| opener | `harbour_commercial` | 1 to 12 | 6 | 1 | fixed, first |
| opener | `beach_town` | 1 to 10 | 5 | 1 | fixed, second |
| middle | `valley` | 1 to 20 | 11 | 2 | each one gets its oil field |
| middle | `village` | **4 to 6** | 6 | **1** | the held oasis village |
| middle | `station_junction` | 3 to 20 | 9 | 1 (2 is plan-clean) | |
| middle | `desert_open` | 1 to 20 | 6 | 2 | the first in the level gets the landmark oasis, each later one a brickworks and a hamlet |
| middle | `airbase_desert` | 2 to 20 | 9 | 1 | two build two runways, but `plan.airbase` holds one |
| middle | `pass` | 3 to 20 | 11 | 1 | two build two forts, but `plan.fort` holds one |
| approach | `desert_open` | 1 to 18 | 9 | 1 | fixed, last |

- `follows`: every template may follow every other, and any may come first or last in the middle (each tried with 20 seeds), **except** `pass → airbase_desert` and `desert_open → village`.
- Total: the middle at -20 % (42 chunks, total 62): 20/20. At +20 % (62 chunks, total 82): 16/20, and the four failures are the village at 7 chunks. So 62 to 82 with `village` held at 4 to 6.

**forest** (`ironForest`, level 4, 60 chunks today)

| | Segment | `len` clean | Today | `max` | Notes |
|---|---|---|---|---|---|
| opener | `beach_cliff` | **3** to 6 | 3 | 1 | fixed, first |
| middle | `forest_conifer` | 1 to 20 | 9, 6 | 3 | |
| middle | `forest_fortified` | 1 to 20 | 8, 8 | 3 | |
| middle | `clearing_village` | 1 to 20 | 5 | 2 | |
| middle | `airbase_forest_hidden` | 1 to 20 | 7 | 2 | |
| middle | `valley` | 1 to 20 | 7 | 2 | the first loop makes it a river valley (`autumn`), not probed |
| approach | `farmland_approach` | 1 to 14 | 7 | 1 | fixed, last (the road ends at x 112 in every plan) |

- `follows`: no restriction found (every pair 5/5, 20 shuffles 20/20, every repeat and drop clean). `max` is a variety choice, not a preset limit.
- Total: 50 to 70 chunks clean (the middle -20 % / +20 %, 40/40) with `beach_cliff` at 3.
- The five middle templates are all conifer forest. They differ in counts only. Flak sites per chunk: `forest_fortified` 1.13, `clearing_village` 0.81, `airbase_forest_hidden` 0.65, `forest_conifer` 0.47, `valley` 0.44.

**winter** (`winterGorge`, level 5, 84 chunks today, plus 48 of arena)

| | Segment | `len` clean | Today | `max` | Notes |
|---|---|---|---|---|---|
| opener | `open_sea_ice` | 2 to 36 | 18 | 1 | fixed, first |
| opener | `harbour_winter` | 1 to 10 | 5 | 1 | fixed, second |
| opener | `farmland_winter` | 1 to 16 | 8 | 1 | fixed, third: the plan splits here |
| middle | `village` | 2 to 20 | 5 | **1** | |
| middle | `lake_valley` | 1 to 20 | 7 | **1** | **not first in the middle** |
| middle | `station_winter` | 1 to 20 | 9 | 2 | plain valley |
| middle | `airbase_snow` | 1 to 20 | 7 | 2 | plain valley |
| middle | `forest_conifer` | 1 to 20 | 7 | 2 | valley with conifers |
| approach | `pass` | 2 to 14 | 7 | 1 | fixed (the first loop's basin, `variant`, needs 10: not probed) |
| approach | `farmland_winter` | **10 to 12** | 11 | 1 | fixed, last; keep 11 |

- `follows`: every template may follow every other; the village may be anywhere or absent. One rule: the first middle segment is not `lake_valley`.
- Total: change the middle only (29 to 41 chunks, total 78 to 90: 40/40).

### 6.3 Preset limitations and what a fix costs

| # | Kit | Limitation | Fixable in the generator? | Rough size |
|---|---|---|---|---|
| 1 | desert | `pass → airbase_desert` always invalid (the fort) | Yes: keep the track on the pass's side until past the fort, or place the fort by the track | small, half a day with a city lab check |
| 2 | desert | `desert_open → village` invalid in about 40 % | Yes: the village's blocks must mind what the track does below it | small |
| 3 | desert | `village` only valid at 4 to 6 chunks | Yes: keep its blocks off the railway corridor whatever the segment's length | small |
| 4 | desert | `plan.airbase` and `plan.fort` hold one object | Yes: lists, plus the game's readers (one read of `plan.airbase` in `index.html`) | small, but it touches the game |
| 5 | desert | The port must be first; a segment before it is ignored | Not needed (the opener is fixed) | none |
| 6 | forest | `beach_cliff` needs 3 chunks and must be first | Not needed (fixed opener, fixed length) | none |
| 7 | forest | `clearing_village`, `airbase_forest_hidden` and `valley` have no ground of their own | Yes: their own features (spec 19 has them as later work) | large, one task per template |
| 8 | winter | `lake_valley` cannot be the first mountain segment | Yes: join the road across the seam before it skirts the lake | small to medium |
| 9 | winter | One village and one lake per plan | Yes: loop over the features instead of taking the first | medium |
| 10 | winter | The last `farmland_winter` must be 10 to 12 chunks | Not needed (keep 11) | none |
| 11 | winter | `station_winter`, `airbase_snow` and `forest_conifer` have no ground of their own (4 % structures each, the same as plain valley) | Yes: their own ground (the preset's comment says "until their own ground is built") | large, one task per template |
| 12 | winter | A plan takes 1.0 to 1.3 s in Node (132 chunks with the arena), 1.3 to 1.5 s in the page | Partly: most of it is `winterLand` | not looked at |

Consequence for variety: in the forest and winter kits a reorder changes little that a player can see until 7 and 11 are done. Winter has two distinct middle templates (village, lake), one of which cannot be first. Desert has six distinct ones and two forbidden pairs. **The desert kit is the only one where the composer has much to compose today.**

Not probed (Node cannot see it): what the game does with a composed list. `buildSortie` finds segments by name for the loops' encounters, `sortieInfo` maps templates to biomes by level, and the weather plans follow stretches. That is phase 2, and each lookup there must cope with a missing or repeated template.

### 6.4 Baselines

`tests/daily-baseline.json`, written by `tests/daily-baseline.mjs`. The human bot (`SF.human(8, 15)`), immortal, viewport 1000x760 (playfield height 320), levels started on their own with `startEnigma(level, true, loops)`. 24 flights; all 24 killed the boss, flew on into the next level and had no errors. Every flight was flown a second time in a fresh page and gave identical numbers (a trace every 10 s included), so one flight per level, loop and difficulty is the whole baseline: there is nothing to average.

Per kit and difficulty, lowest to highest over the first pass (seed 1944) and the first loop (seed 1945):

| Kit (level, chunks) | Difficulty | Boss arrives (s) | Boss lasts (s) | Hits per min before the boss | Worst 10 s window | Bullets before the boss | Kills per min | Longest quiet stretch (s) |
|---|---|---|---|---|---|---|---|---|
| desert (2, 72) | Rookie | 209.5 | 57.7 to 86.0 | 0.57 | 21.6 to 26.6 | 6.7 to 6.8 | 88 to 122 | 7 |
| | Veteran | 209.5 | 46.3 to 104.0 | 0.86 to 2.00 | 31.2 to 60.2 | 10.9 to 15.4 | 101 to 129 | 0 |
| | Ace | 209.5 | 45.7 to 92.2 | 0.57 to 3.44 | 25.9 to 50.2 | 11.0 to 15.5 | 123 to 126 | 6 |
| forest (4, 60) | Rookie | 172.0 | 92.0 to 127.7 | 0.35 to 1.74 | 60.3 to 108.7 | 14.0 to 14.7 | 92 to 115 | 0 |
| | Veteran | 172.0 | 148.5 to 185.3 | 2.79 to 3.14 | 77.2 to 118.2 | 18.5 to 21.7 | 102 to 110 | 0 |
| | Ace | 172.0 | 104.8 to 256.2 | 1.40 to 3.84 | 73.9 to 81.6 | 18.1 to 22.8 | 129 to 140 | 0 |
| winter (5, 84) | Rookie | 242.0 | 56.3 to 58.0 | 0.25 to 1.74 | 13.6 to 16.0 | 4.8 to 5.2 | 100 to 118 | 5 |
| | Veteran | 242.0 | 46.0 to 56.3 | 0.74 | 22.0 to 38.7 | 7.6 to 11.7 | 120 to 121 | 5 |
| | Ace | 242.0 | 52.0 to 134.5 | 1.49 to 2.73 | 30.8 to 36.1 | 12.0 to 13.5 | 144 to 171 | 0 |

- The boss arrives 2.9 s per chunk after the start, whatever is shot. A level lasts 4.2 to 7.1 minutes with its boss.
- Hits before the boss are 1 to 12 per flight (level 2's loops 2 and 3, a rank harder each, reach 30; they are in the file but not in the table).
- "Quiet" is a stretch of 5 s or more before the boss with no enemy on screen, no enemy bullet and no encounter. The longest anywhere is 7 s (8 s when only enemies in the air count), and nearly all of them lie in the last seconds before the boss.
- Encounters: the first pass of levels 2, 4 and 5 has none but the Shadow Wing (3050 frames). The loops have three (level 2: `oasisambush`, `burningfield`, `fuelconvoy`), two (level 4: `cliffbattery`, `valleyconvoy`) and three (level 5: `iceraid`, `iceroad`, `basebreak`).
- Chunk build time in the page, p95 per level: 7.8 to 18.3 ms (two pages at once on a 4-core machine; noisy, 8.6 to 26.6 ms across three runs).
- Plan time in the page: desert 153 to 180 ms, forest 82 to 121 ms (first loop with lakes: 552 to 568 ms), winter 1278 to 1516 ms. In Node alone, original lists, median / p95: desert 145 / 246 ms, forest 102 / 163 ms, winter 1044 / 1265 ms.

**How long a flight takes:** 4.5 to 8.1 s, median 6.1 s (53 times game speed, two pages at once); 9.7 s with the plan and chunk timings. All 24 flights, each twice: 4 min 52 s. One date on three difficulties is about 20 to 30 s. Gate 3 is some 20 times cheaper than section 3 assumed (1 to 3 minutes).

### 6.5 What the plan had wrong, or has to decide

1. **Gate 2, density from spec 3.2.** The hand-made levels are far below the spec's ranges: `valley` 5 % (spec 15 to 30), `airbase_desert` 18 % (30 to 45), `village` 8 to 25 % desert and 10 to 13 % winter (30 to 40), the forest templates 4 to 8 % (20 to 40). (My count of "structures" is an approximation: buildings, rubble, works, runways, aprons, quays, squares, yards, roads, bridges.) The gate would reject the Campaign's own levels. Use the measured share per template with a margin instead (the probe prints it), or drop the check.
2. **Gate 2, time.** "0.2 to 0.5 s per sortie" holds for desert and forest, not for winter (1.0 to 1.3 s). 300 winter seeds in `tests/compose.mjs` are about 6 minutes.
3. **Gate 3, "too easy" from hits.** The baseline minimum is 0.25 to 0.57 hits a minute, which is 1 or 2 hits in a flight. Half of that is no floor at all. Kills per minute (88 to 171) or bullets on screen before the boss would work as a floor. **[owner]**
4. **Gate 3, "too hard" from hits.** With 1 to 12 hits per flight, baseline maximum x 1.25 is one extra hit on some rows (desert Rookie: 2 hits is the maximum, 3 would fail). Composed sorties will fail on chance. Either give hits an absolute margin (the balance tests use "35 % or 3") or lean on the bullet measures. **[owner]**
5. **Dead air.** 20 s is far from what the levels do: the longest stretch is 7 s. Phase 3's rule ("just above the longest in the baselines") gives about 8 to 10 s.
6. **"Three seeds each where a loop seed applies."** Only level 2 has more than one loop seed, and each is a rank harder, so they are not three samples of one thing. Levels 4 and 5 have their loop content on seed 1945 only. And the flights are exactly repeatable, so seeds are not needed for noise.
7. **Kit table 2.1.** Confirmed as the openers and approaches, with these corrections: winter's `village` is optional and free, the rule is on `lake_valley`; winter's last `farmland_winter` has a fixed length; the forest and winter middles are mostly one ground (6.3). Section 1 calls the levels "about 5 minutes": level 2 is 72 chunks, level 4 60, level 5 84.
8. **Encounters (decision 6).** The first pass, which is what a player's first Campaign flight of these levels is, has no encounters. A composed sortie with encounters from the kit table compares with the first loop's flight, not the first pass. The table in 6.4 spans both.
9. **Two faults in the test harness, found on the way** (not changed here): `SF.run` only notices a level change that happens inside one call, so a change on a call's last frame flies on into the next level unnoticed (`daily-baseline.mjs` checks the level itself); and `tests/balance-real.mjs` starts its flights without `finishBoot()`, so the boot splash swallows a different number of frames each time and its flights do not repeat. Both are small fixes.
10. **`node --test tests/`** (CLAUDE.md) fails on Node 22, which treats the folder as a file. `node --test tests/worker.test.mjs` passes (16 tests).
11. **Rule 0, "`node tests/replay.mjs` stays green".** It is red on the untouched build 1.2.6.37 in the test container: all eight scenarios differ from `golden.json` by frame 500, and so do the three of `node tests/replay.mjs --enigma` against `golden-enigma.json` (its terrain fingerprints pass). `node tests/enigma.mjs` (213 checks) and `node tests/fixed-seed.mjs` (41 checks) pass. ARCHITECTURE.md already says the replay test is no gate for the Campaign's levels, and CI runs only its terrain part. I could not tell here whether the golden files are stale or this machine's browser plays differently. For the later phases the working guard is therefore: `enigma.mjs` and `fixed-seed.mjs` green, plus `replay.mjs` giving the same output before and after a change (not "green"), until the owner refreshes the golden files on purpose.

Not run in phase 0: nothing was flown with a composed sortie (there is no composer yet), no phone-sized viewport (the playfield height changes how the game plays; the baselines hold for H 320 only), and the first loops' generator variants (`variant`, `autumn`, `lakes`) were flown but not probed with mutated lists.

### 6.6 Phase 0b: after the generator fixes (build 1.2.6.38)

Four commits in `tools/citygen.js`. Sections 6.1 to 6.3 above describe the state before them; this section replaces what they say about rows 1, 2, 3, 8 and 9.

| Row of 6.3 | Fix | Before | After |
|---|---|---|---|
| 1 | `desertLand`, `lateIn`: a feature right after a pass takes the track over only past the pass's end, so the track runs straight through the fort's gates. | `pass → airbase_desert` 0/40 valid | 40/40 |
| 2 and 3 | `roadblock`: a block that would stand within 10 px of the railway's centre is left out. One cause for both rows: the held village's roadblock stands 181 px south of the village's middle, and there the track can run beside the line. | `desert_open → village` 25/40 valid; `village` at 8 to 12 chunks 57/80 | 40/40; 7 to 12 chunks 120/120 |
| 8 | `winterLand`, `params.joinRoad` (passed on by `winterLine`): the road swings out round the lake only from the plan's first row on. **A switch, off by default** (see below). | `lake_valley` first: 0/52 valid | with the switch: every neighbour row and shuffle clean |
| 9 | `winterLand`: the village and the lake builders run once per segment; a second one draws its own random numbers (`rndK`). `plan.alpines` and `plan.iceLakes` list all, `plan.alpine` and `plan.lake` stay the first. | second village or lake missing, 30/30 | 100/100 (checked with one marker per village and lake at its own middle) |

The whole probe again, clean of made:

| Mutation | desert | forest | winter (`joinRoad` on) |
|---|---|---|---|
| original list | 20/20 | 20/20 | 20/20 |
| middle shuffled | 20/20 (was 12) | 20/20 | 20/20 (was 18) |
| each ordered pair made neighbours | 150/150 (was 138) | 100/100 | 100/100 (was 80) |
| one template twice | 120/120 (was 117) | 100/100 | 100/100 (was 70) |
| one middle segment dropped | 120/120 | 140/140 | 100/100 (was 80) |
| one length -50 % / +50 % | 239/240 (was 233) | 200/200 | 200/200 |
| one length at 1 to 20 chunks | 148/180 (was 146) | 150/150 | 150/150 (was 147) |
| total -20 % / +20 % | 80/80 (was 72) | 74/80 | 40/80 |
| opener or approach dropped, moved, halved | 120/160 | 76/120 | 20/160 |
| each fixed segment at other lengths | 180/180 | 98/110 | 220/300 |

What is still not clean is the fixed ends (the openers, winter's approach and its last segment's length, the forest's 3-chunk cliff) and the shortest lengths in the desert.

**The grammar now** (changes against 6.2):
- desert: `follows` has no forbidden pair. `village` 4 to 20 chunks (3: 19/20, and the one failure is a house reaching into the next segment; 1 and 2: 3/10). `station_junction` from 3, `pass` from 3, `airbase_desert` from 2, as before. `max` unchanged (`plan.airbase` and `plan.fort` still hold one object: row 4, phase 2). Total 62 to 82 without the village condition.
- forest: unchanged.
- winter, with `joinRoad: 1`: no rule on `lake_valley`; `village` from 1 chunk (5/5), `max` 2 for `village` and `lake_valley` (two side by side or apart both build). The opener, the approach and the last segment's 10 to 12 chunks stay fixed. **The composer must pass `joinRoad: 1`.**

**The Campaign did not change.** Checked after every commit:
- 324 generator plans hash the same as before the first fix: 20 seeds each of `sandSea` (variants 0 to 3), `sandSeaClassic`, `ironForest` (plain and `autumn` + `lakes`) and the single-feature desert presets; 8 seeds each of `winterGorge` (plain and `variant` 1) and `winterLine`; 20 of `mountainVillage`. Every raster and every list, the stage timings apart.
- The 24 plans the game itself builds (levels 1 to 6, loops 0 to 3) hash the same, in the page.
- `node tests/citygen.mjs`, `node tests/enigma.mjs` (213) and `node tests/fixed-seed.mjs` (41) pass. `node tests/replay.mjs` prints exactly what it printed before the fixes (red against its golden file, as in 6.5 item 11).
- One baseline flight re-flown (level 5, first loop, Veteran): every number as in `tests/daily-baseline.json`.

**Found on the way, for the owner:** the Campaign's level 5 in its first loop (seed 1945) has the lake valley first (`loopSeq` swapped it with the village), so the plan the game flies there today fails the generator's own rules: the road steps 25 px sideways at the seam between the farmland and the lake valley (tank reach 0.37; plan row 1984, x 106 below and 131 above). That is why fix 8 is a switch: passing `joinRoad: 1` in `sortiePlanLevel5` mends the road and changes that level's ground from the seam to about 160 px above it. One line, **[owner]**.

## 7. Phase 1 results: the composer module (build 1.2.6.39)

`tools/sortie-compose.js` (`KITS`, `composeSortie`, `check`, `encPlanFor`, `dailySeed`, `composeDaily`, `dateKeyUTC`, `DAILY_REROLL`, `composeVersion` 1), embedded in `index.html` as `sortieComposeSrc` by `node scripts/embed-citygen.mjs` and run by the loader between the generator and the game. The game does not call it yet: `window.SortieCompose` exists and gives the same output in the page as in Node, and that is all. `tests/compose.mjs` runs in CI in four shards; `tests/kit-check.mjs` holds the plan checks it shares with the probe.

### 7.1 Pass rates

| Check | desert | forest | winter |
|---|---|---|---|
| Gate 1, 10,000 seeds (the rules, checked by the test apart from the module's own check) | 10,000 | 10,000 | 10,000 |
| First try succeeds | 60 % | 95 % | 92 % |
| Most tries any seed needed (of 64) | 13 | 4 | 5 |
| Gate 2, 300 composed lists (no throw, `CityGen.validate`, length, every feature in its own segment, structures share under the limit) | 300 | 300 | 300 |
| Gate 2, 1,000 composed lists | 1,000 | 1,000 | not run (300 take 5 minutes) |
| Plan time, median / p95 | 146 / 269 ms | 130 / 230 ms | 882 / 1524 ms |

Also checked: the composer's hash equals the game's `sortieHash` (2,000 pairs); the same seed gives the same sortie; another seed or sub-seed gives another list; every day of 2027 composes, 122 days per kit; a date that is none is refused; the day changes at midnight UTC; a reroll entry changes that date and nothing else; the embedded copy is current.

The desert's first try fails more often because its walk can end on an open desert (the approach is one) or cannot fill the target with what its limits leave; the next sub-seed is drawn, as the plan says.

### 7.2 Variety, over 1,000 seeds

| | desert | forest | winter |
|---|---|---|---|
| Different orders of the middle | 857 | 498 | 404 |
| Total length, chunks (mean) | 62 to 82 (72.3) | 50 to 66 (58.0) | 78 to 90 (83.9) |
| Middle segments | 4 to 8 | 5 to 7 | 4 to 6 |
| Each template appears in | 82 to 97 % | 99 to 100 % | 92 to 96 % |
| Each template comes first in | 14 to 19 % | 19 to 22 % | 18 to 23 % |
| Encounters per sortie | 2.52 | 1.70 | 2.78 |
| Three hot stretches in a row | 2.7 % | 0.6 % | 0 % |

No middle template is ever missing from the 1,000. At 2.9 s per chunk the boss arrives after 3.0 to 4.0 minutes (desert), 2.4 to 3.2 (forest) and 3.8 to 4.4 (winter).

### 7.3 Example sequences (the middles; opener and approach as in 2.1)

| Date | Kit | Chunks | Middle | Encounters (chunk) |
|---|---|---|---|---|
| 2026-11-14 | winter | 89 | village 6, forest_conifer 6, airbase_snow 6, station_winter 9, lake_valley 7, forest_conifer 6 | iceraid 4, iceroad 59, basebreak 73 |
| 2026-11-15 | desert | 79 | pass 8, desert_open 5, station_junction 10, airbase_desert 10, valley 10, village 7, valley 9 | burningfield 19, oasisambush 54, fuelconvoy 71 |
| 2026-11-16 | forest | 59 | forest_conifer 7, valley 6, forest_fortified 9, clearing_village 6, airbase_forest_hidden 6, forest_conifer 6, forest_fortified 9 | cliffbattery 1, valleyconvoy 11 |
| 2026-11-17 | winter | 87 | airbase_snow 7, station_winter 8, forest_conifer 5, lake_valley 8, forest_conifer 5, village 5 | iceraid 4, iceroad 52, basebreak 71 |
| 2026-11-18 | desert | 76 | village 8, valley 10, airbase_desert 7, station_junction 8, desert_open 5, valley 9, pass 9 | oasisambush 11, burningfield 44, fuelconvoy 68 |
| 2026-11-19 | forest | 63 | airbase_forest_hidden 8, forest_fortified 9, forest_conifer 8, valley 7, forest_fortified 8, clearing_village 5, forest_conifer 8 | cliffbattery 1, valleyconvoy 29 |

### 7.4 What gate 2 changed in the grammar

The probe changes one thing at a time; composed lists change several. The first gate 2 run failed 6 of 20 desert lists, all at the held village:

- **`village` is 7 to 8 chunks** (6.6 said 4 to 20). Its defences (trench, wire, minefield, ditch, roadblock) reach 190 px south of its middle, so a village of 4 to 6 chunks spills into the segment before it. That is harmless behind a valley, a junction or an airbase and wrong behind the port (the roadblock lands in the other plan), a pass (rock) or an open desert: 42 of 216 composed lists with a village of 4 to 6 chunks failed, 0 of 63 at 7. The Campaign's own village is 6 chunks behind a valley, so this is a composer rule, not a generator fix (moving the village would change the Campaign).
- **`desert_open → village` is forbidden again**, for a new reason: an open desert that is not the level's first gets a roadside hamlet that reaches up to 70 px past its segment's end (3 of 300 lists).

After both: 1,000 of 1,000.

### 7.5 Choices made in the module, for the owner to change

- **Lengths per template** (in `KITS`) are narrower than what is valid, so no stretch is too short to play or long enough to drag: for example `valley` 7 to 12, `pass` 8 to 12, `forest_fortified` 6 to 9, `lake_valley` 6 to 8.
- **`heat`** per template (0 quiet to 1 hot) drives the rhythm rule: after two stretches of 0.6 and more a quiet one is three times as likely. The values are my estimate from gun sites and features (`pass` 0.9, `village` 0.8, `forest_fortified` 0.9, `desert_open` 0.1, …). The flight gate will show whether they match what the bot meets.
- **At least four middle segments**, and no template twice in a row.
- **Encounters** come from the loops' hand-made plans (`buildSortie`), one per segment at most, each at most once, with 2 chunks of rest after each one's measured length. Whether each one works on the first pass's ground is phase 2's check (the plan says so): `burningfield` and `basebreak` were built for the loops' ground (`variant`), `valleyconvoy` for the autumn river.
- **The structures limit** per template in gate 2 is twice the hand-made level's highest share plus 5 points (6.5 item 1). Nothing came near it.
- **The generator's variants are off** (`variant: 0`, no `autumn`): the daily sortie flies the first pass's ground.

### 7.6 Notes

- The CI workflow confirms 6.5 item 11: its comment says the replay test "is switched off until the golden values are refreshed for v1.2.5". The golden files are stale; this machine is fine.
- `node tests/citygen.mjs`, `tests/enigma.mjs` (213), `tests/fixed-seed.mjs` (41) and `tests/smoke.mjs` pass with the composer embedded; the 24 Campaign plans hash as before.

## 8. Phase 2 results: in the game, behind the test link (build 1.2.6.40)

Try it on a local build: `http://localhost:8000/?daily=2026-11-15`, then START and a difficulty. `&kit=forest&sub=3` forces a kit and a sub-seed; `?daily=` alone is today (UTC). The link does nothing on the live site (`LB_TEST`). Contact sheets of one sortie per kit: https://claude.ai/artifact/We93xGA2zAyMk9TGpf95Rd (made with `node tests/contact.mjs OUTDIR daily:2026-11-15 14`).

### 8.1 What was built

- `buildSortie(level, seed, C)`: with a composed sortie `C` the segments, the encounters and the seed are the composer's, and the loop flags (`variant`, `autumn`, `winter`, …) are off. Without `C` nothing differs. The sortie carries `daily` ({date, kit, seed, sub, v}) and `compose` (the composer's output).
- `sortiePlanLevel2/4/5` hand the composer's `gen` to `CityGen.generate`, so the game makes the plan Node makes.
- `startDaily(date, kit, sub)` and `startComposed(C)`; the title's START takes the link (`dailyTry`). `restartStage` restarts the same sortie.
- Seeds: the sortie's own stream (`run.seed`, `campSeed`'s third argument) and its own timetable (`world.ttSalt`, added to the three timetable and per-enemy seeds; 0 in the Campaign, so its sums are as before). The ground beyond the plan stays the Campaign's (`world.SEED` 1944): the boss ground is the kit level's.
- The end: results, then the title (`endEnigmaLevel`). It is not ranked, so the board, the best score, the loop count and the play-data report leave it alone by the rules that already keep practice runs out.
- Save and resume: `sortieRef` / `sortieOf`. A Campaign level is still saved as `{level, seed}`; a Daily Sortie adds `{daily}` and is rebuilt from the composer's kit, seed and sub-seed, not from the date, so the version a player started with holds (decision 4). A record of another composer version is not resumed.
- The Shadow Wing has its place in the composer's plan (`wingC`): from 37.5 % of the level on, after an encounter that is running then, 55 % at the latest. An encounter the Wing would cover is left out.

### 8.2 Checks

`node tests/daily.mjs` (60 checks, added to CI):

| Check | Result |
|---|---|
| `?daily=DATE`: START flies that day's kit, the composer's segments and encounters, not ranked; `&kit`, `&sub` force; without the link START is the Campaign | pass, 3 kits |
| The plan is Node's (same road, density and buildings; the game then digs its tank pits and gun nests in) and the ground types are the plan's | 0 of 824 to 1896 sampled points differ |
| Flown to the end in two pages with different `Math.random`: the same spawns, score, length and hits | desert 676 spawns, forest 833, winter 756 |
| The boss comes and dies; then the title; no errors | boss after 230 s, 171 s, 254 s |
| The Shadow Wing comes and every planned encounter runs to its end with no event dropped | pass |
| It never counts: board, best, loops, stored values, play-data report | pass |
| Saved at frame 4200, loaded in a fresh page: 26 samples over 1500 frames identical; another composer version is not resumed | pass, 3 kits |
| Levels 2, 4 and 5 flown afterwards in the same page play as in a fresh page | pass |

The Campaign, against the build before (1.2.6.39):
- `buildSortie` gives the same sortie for levels 1 to 6 on seeds 1944 to 1947, 1950, 7 and 123456 (42 sorties, every field and five draws of `rng`), and three 1500-frame flights end in the same state.
- The 24 plans the game builds hash as before.
- `tests/enigma.mjs` (213), `tests/fixed-seed.mjs` (41), `tests/smoke.mjs`, `tests/jitter.mjs`, `tests/citygen.mjs` and `tests/compose.mjs` pass; `tests/replay.mjs` prints what it printed before phase 0b.
- `tests/resume-exact.mjs` reports 5 problems, **the same 5 in the build before** (four Campaign levels differ in their decal count at the save, the old stage 6 in its random stream after 180 frames). They are not from this work; the Daily Sortie's own resume is exact.

### 8.3 Encounters on the first pass's ground

Flown on 14 composed sorties per kit (Veteran), after the Wing's place was planned:

| Encounter | Planned | Ran | Ended | Events that found no place |
|---|---|---|---|---|
| desert `burningfield` | 10 | 10 | done | 0 |
| desert `fuelconvoy` | 14 | 14 | done | 0 |
| desert `oasisambush` | 8 | 8 | done | 0 |
| forest `cliffbattery` | 14 | 14 | done | 0.3 a run (no radar, or no gun left for a broadside) |
| winter `iceraid` | 14 | 14 | done | 0 |
| winter `iceroad` | 12 | 12 | done | 0 |

Taken out of the kit tables, as the plan asks ("must find it or must not be scheduled"):
- winter `basebreak`: without the first loop's basin its two flak guns find no place and it is called off after about 430 frames (5 of 5).
- forest `valleyconvoy`: without the first loop's river three of its eight events make nothing, and it holds the air waves for 2100 frames.

Both come back if the daily sortie may use the loops' ground variants (the basin, the autumn valley's river). **[owner]** That would also bring the autumn forest's look and lakes on some days.

Before the Wing was planned, 2 of 7 `burningfield` and 2 of 8 `oasisambush` were planned and then given up by the game because the Wing was up. Over 1,000 seeds a desert sortie now has 2.28 encounters, a forest one 1.00, a winter one 1.62, plus the Wing.

### 8.4 Not done, not checked

- No person has played one; the bot is immortal and the contact sheets show the ground without enemies.
- Two players, the continue prompt and a game over in a Daily Sortie were not tried (they run the Campaign's code).
- No phone viewport.
- The message at the start says DAILY SORTIE with the date and the kit; the results screen and the pause menu are the level's own.
- Row 4 of 6.3 (`plan.airbase` and `plan.fort` as lists) was not needed: the kits allow one airbase and one pass.

## 9. Phase 3 results: the flight gate (build 1.2.6.40, composer v1)

`tests/daily-gate.mjs` (entry in `tests/README.md`). No game code, composer or threshold was changed. Human bot `SF.human(8, 15)`, immortal, viewport 1000x760 (H 320), two pages at once on a 4-core container. Each page flies many sorties in turn. That is checked: the same 4 human and 24 skill-bot flights give identical numbers with one page or two.

### 9.1 What fails a sortie, and the runs

FAIL on any of these: a page or game error (`SF.R.errs`); gate 2 not clean (`kit-check.mjs` plus the structures limit, as `compose.mjs`); no boss, or the boss not killed within 900 s; the flight not ending at the title; a planned encounter not ending `done`, or no Shadow Wing; the twin flight in the other page (another `Math.random`) differing in spawns (count and hash), score, end or frames; dead air longer than 10 s. Dead air is a stretch before the boss with no enemy on screen, no enemy bullet and no encounter, measured as in `daily-baseline.mjs`.

- **Sweep** (`--sweep 200`): seeds `hash(s, 9090)`, s = 0..199 per kit, sub 0. Every seed on Veteran, seeds 0..39 also on Rookie and Ace, determinism on every 10th seed (Veteran), skill bots on seeds 0..19. That is 840 human flights, 60 twins and 720 skill-bot flights in 28 min 54 s: gate 2 189 s, human flights 967 s, bots 578 s.
- **Dates** (`--from 2026-12-01 --days 14 --out DIR`): 42 flights (all three difficulties), 14 twins, 87 s. **All PASS.** The `--out` path (cause JSON plus a 12-frame contact sheet) was checked by forcing a failure with `--dead 5` on 2026-12-03.

### 9.2 Failures per kit and cause (sweep, out of 200 sorties per kit)

| Kit | Failed | Cause | Examples |
|---|---|---|---|
| desert | 2 (1 %) | dead air | `desert#108` (10.8 s), `desert#123` (11.2 s), both Veteran |
| forest | 0 | | |
| winter | 0 | | |

Every other cause was 0 in all 900 flights: no errors, gate 2 clean on all 600 plans, every boss came and died (boss fight at most 168 s), every flight ended at the title, every planned encounter ended `done`, the Wing came every time, and all 60 determinism twins were identical. Encounter events that found no place (not a failure; `dropped` > 0 while still `done`): forest `cliffbattery` 96 over 280 runs (0.34 a run, as in 8.3), desert `oasisambush` 6 over 186.

### 9.3 Dead air

Longest quiet stretch per flight, in seconds (the hand-made levels: 7 at most):

| Kit | Difficulty | p50 | p95 | max | flights over 5 / 7 / 10 / 15 s |
|---|---|---|---|---|---|
| desert | Rookie (40) | 4.7 | 8.3 | 9.5 | 16 / 4 / 0 / 0 |
| | Veteran (200) | 4.8 | 8.7 | 11.2 | 90 / 31 / 2 / 0 |
| | Ace (40) | 4.1 | 7.3 | 9.2 | 14 / 3 / 0 / 0 |
| forest | Rookie | 1.4 | 5.3 | 7.0 | 4 / 0 / 0 / 0 |
| | Veteran | 0.8 | 4.3 | 7.5 | 7 / 1 / 0 / 0 |
| | Ace | 0 | 1.5 | 3.2 | 0 / 0 / 0 / 0 |
| winter | Rookie | 4.7 | 5.8 | 7.0 | 17 / 0 / 0 / 0 |
| | Veteran | 4.5 | 5.8 | 8.7 | 71 / 3 / 0 / 0 |
| | Ace | 3.8 | 5.3 | 5.8 | 14 / 0 / 0 / 0 |

Where they lie: of the longest stretches of 5 s or more, those ending within 1 s of the boss's arrival (the boss ground after the level's last chunk) are desert 131 of 132, forest 8 of 11 and winter 76 of 110. The rest of winter's are 14 earlier on the boss ground and 20 inside the level (chunks 63 to 92, 5.2 to 7 s). Both failures are on the boss ground and end as the boss comes. In the desert the stretch grows with the sortie's length (Veteran): under 72 chunks, median 4.5 s and max 9.0 s; 72 to 77 chunks, median 4.7 s and max 9.8 s; 78 to 82 chunks, median 5.8 s and max 11.2 s. Flights over 8 s: 4 of 92, 5 of 62 and 9 of 46. Both failing sorties are 81 and 82 chunks long, with three encounters.

### 9.4 Reported measures: composed sorties (p5 / p50 / p95) against the kit level's range

Before the boss. "low" or "high": how many flights lie outside the level's range.

| Kit | Diff | Hits/min | level | Worst 10 s window | level | Bullets on screen | level | Kills/min | level |
|---|---|---|---|---|---|---|---|---|---|
| desert | Rookie | 0 / 0.52 / 1.17 | 0.57 | 13.8 / 18.0 / 24.0 | 21.6–26.6 (34 low) | 3.8 / 5.7 / 7.1 | 6.7–6.8 | 87 / 99 / 107 | 88–122 |
| | Veteran | 0 / 0.63 / 1.62 | 0.86–2.00 (132 low) | 18.6 / 25.8 / 33.3 | 31.2–60.2 (177 low) | 5.7 / 8.8 / 11.0 | 10.9–15.4 (185 low) | 99 / 113 / 125 | 101–129 |
| | Ace | 0 / 0.61 / 1.22 | 0.57–3.44 | 22.8 / 26.3 / 30.7 | 25.9–50.2 | 7.4 / 9.0 / 10.7 | 11.0–15.5 (38 low) | 98 / 112 / 123 | 123–126 (37 low) |
| forest | Rookie | 0 / 0.67 / 1.28 | 0.35–1.74 | 45.0 / 63.5 / 75.3 | 60.3–108.7 | 11.3 / 12.9 / 16.6 | 14.0–14.7 (30 low) | 99 / 109 / 119 | 92–115 |
| | Veteran | 0 / 1.03 / 2.09 | 2.79–3.14 (199 low) | 35.1 / 58.9 / 77.5 | 77.2–118.2 (189 low) | 11.8 / 15.4 / 20.2 | 18.5–21.7 (179 low) | 112 / 124 / 136 | 102–110 (195 high) |
| | Ace | 0.78 / 2.15 / 3.54 | 1.40–3.84 | 48.5 / 65.6 / 76.8 | 73.9–81.6 (35 low) | 18.1 / 21.2 / 23.8 | 18.1–22.8 | 115 / 124 / 150 | 129–140 (24 low) |
| winter | Rookie | 0 / 0.73 / 1.60 | 0.25–1.74 | 11.4 / 17.2 / 22.8 | 13.6–16.0 (29 high) | 3.7 / 5.1 / 6.7 | 4.8–5.2 | 93 / 102 / 113 | 100–118 |
| | Veteran | 0.24 / 0.80 / 1.84 | 0.74 (77 low, 117 high) | 19.9 / 25.7 / 30.9 | 22.0–38.7 | 5.7 / 8.0 / 9.4 | 7.6–11.7 (76 low) | 107 / 116 / 127 | 119.5–121 (133 low, 53 high) |
| | Ace | 0.69 / 1.50 / 2.56 | 1.49–2.73 | 25.6 / 33.2 / 38.4 | 30.8–36.1 | 10.4 / 11.7 / 13.5 | 12.0–13.5 | 119 / 131 / 143 | 144–171 (39 low) |

Boss arrival: desert 182.7 to 236.2 s, forest 145.3 to 188.0 s, winter 226.0 to 258.0 s.

The composed sorties are **calmer than their hand-made level on Veteran in the desert and the forest**: fewer bullets and fewer hits, in 89 to 100 % of the flights. A level range from two flights (first pass and first loop) is narrow; on some rows it is one value. So "outside" says little for Rookie and Ace, but the Veteran shift is consistent across 200 sorties.

### 9.5 Skill bots (own difficulty, mortal, 4 bot seeds on 20 sorties per kit: 80 flights per bot and kit)

Not fitted to players yet (see `tests/README.md`), so these are data, not verdicts.

| Kit | Bot | Cleared | Cleared per sortie p5 / p50 / p95 | Deaths/min p5 / p50 / p95 | Lives when the boss comes p5 / p50 / p95 (n reached) |
|---|---|---|---|---|---|
| desert | rookie | 0.01 | 0 / 0 / 0.01 | 0.98 / 2.62 / 7.81 | 1 / 1 / 2 (7) |
| | veteran | 0.15 | 0 / 0 / 0.75 | 0.63 / 1.46 / 2.92 | 0 / 1 / 3 (32) |
| | ace | 0.88 | 0.74 / 1 / 1 | 0 / 0.24 / 1.57 | 0 / 2 / 4 (74) |
| forest | rookie | 0 | 0 / 0 / 0 | 1.70 / 3.96 / 6.26 | 0.1 / 1 / 1 (3) |
| | veteran | 0.05 | 0 / 0 / 0.25 | 0.97 / 1.61 / 3.89 | 0 / 1 / 2 (29) |
| | ace | 0.36 | 0 / 0.25 / 0.75 | 0.39 / 1.12 / 2.17 | 0 / 1 / 3 (62) |
| winter | rookie | 0 | 0 / 0 / 0 | 1.45 / 3.26 / 5.14 | 0 / 0 / 0 (1) |
| | veteran | 0 | 0 / 0 / 0 | 0.99 / 1.77 / 4.17 | 0 / 1 / 2.65 (8) |
| | ace | 0.03 | 0 / 0 / 0.25 | 0.86 / 1.34 / 4.20 | 0 / 1 / 3 (30) |

Winter is the hardest kit for the bots (veteran 0 of 80, ace 2 of 80) although the human bot measures it near its level. The desert is the easiest.

### 9.6 Proposals (for the owner; nothing changed)

The failure rate is already under 10 %: 2 of 600 sorties (0.3 %), all desert dead air. Nothing *has* to change to meet the plan's bar. Options for the dead air, smallest first:
1. **Desert length:** cap `KITS.desert.len` at 80 instead of 82, or cap the middle so the boss ground is reached sooner. The failures and most stretches over 8 s are in 78 to 82 chunk sorties.
2. **The boss ground:** the quiet comes after the level's last chunk, before the boss trigger (`bossAt`, 1 to 8 chunks past `len`). A shorter run-in for composed sorties, or one late air wave there, would remove it for every kit. This is a game change (phase 4 or later), not a composer change.
3. **The limit:** 10 s is from the brief; the hand-made levels' 7 s comes from 24 flights. With 12 s the sweep has no failures. **[owner]**

For decision 8 (not failures): the composed desert and forest sorties on Veteran are calmer than the hand-made levels (9.4). If the owner wants them to match, raise the `heat` of the desert and forest middles, or draw `fuelconvoy` / `cliffbattery` more often in the kit tables, and fly the sweep again. Section 3's draft rules, applied to the sweep, show why decision 8 matters (6.5, items 3 and 4):
- "Too hard", hits above the level's max × 1.25: winter Veteran 99 of 200 (its level range is the single value 0.74), desert Rookie 9 of 40, desert Veteran 3.
- "Too hard", worst window above the level's max × 1.2: winter Rookie 6 of 40.
- "Too easy", hits below the level's min × 0.5: forest Veteran 149 of 200, desert Veteran 58.
- "Too easy", kills per minute below the level's min × 0.5: none.
Hits ranges from two flights per row are too narrow to judge by; kills per minute or the bullet measures would hold up better.

Not run: phone viewport; dates beyond the 14 above; sub-seeds other than 0; `--bots` on dates (only on sweep seeds and in a 3-date smoke run); `tests/replay.mjs` and `tests/resume-exact.mjs` (as the brief says). No contact sheets for the two failing seeds, because `contact.mjs` takes dates, not seeds.

### 9.7 Re-run on the merged build

Build 1.2.6.40 on `main` after PR #239. Against the build of 9.1 to 9.6 (commit 5132630), it adds the shorter Arc (`ARC_LV` reach 0.92 to 0.65, super Arc 1.3 to 0.9) and the gentler loop ramp (`LOOP_STEP`, `LOOP_SLOPE`, `bspeed`). No game code, composer, threshold or version was changed for this run. It is the same sweep (`--sweep 200`, seeds `hash(s, 9090)`, sub 0, same machine setup, 31 min 18 s) plus the 14 dates. To compare single flights, the 840 human flights were flown again on 5132630 (`--no-bots`). That run reproduces 9.2 to 9.4 exactly.

- **Failures:** the same. desert 2 of 200 (`desert#108` 10.8 s, `desert#123` 11.2 s, dead air, Veteran), forest 0, winter 0. No errors, every boss killed, every encounter `done`, Wing every time, 60 of 60 twins identical. **14 dates: 42 of 42 PASS**, 14 twins identical.
- **Which flights changed** (frames, score or spawn hash, flight for flight): **desert 0 of 280.** In forest 189 of 200 Veteran flights changed, 39 of 40 on Rookie and 38 of 40 on Ace; in winter 197 of 200, 40 of 40 and 39 of 40. That is 390 of 600 sorties: desert 0, forest 192, winter 198. The boss arrives at the same moment in all 560 forest and winter flights. What differs is the boss fight and the score: frames p5 / p50 / p95 −1710 / 0 / +1980, score −12 % / 0 / +11 %, and forest's longest boss fight is 229 s (was 168 s; winter 122 s, was 114 s).
- **Cause:** the Arc. The new rank function gives the first pass the same values as the old one (slope 0.08, no loop step, Ace's term the same up to stage 6), and `bspeed` adds nothing while `run.loop` is 0. So the loop ramp cannot touch a Daily Sortie. Desert being unchanged flight for flight fits this. That the human bot holds the Arc only in forest and winter flights is inferred, not checked: no flight logs its weapon.

| Measure | Kit / diff | 9.2 to 9.5 | merged build |
|---|---|---|---|
| Dead air p50 / p95 / max (over 5 / 7 s) | desert, all diffs | as 9.3 | identical |
| | forest Rookie | 1.4 / 5.3 / 7.0 (4 / 0) | 1.5 / 5.2 / 7.0 (3 / 0) |
| | forest Veteran | 0.8 / 4.3 / 7.5 (7 / 1) | 0.7 / 4.3 / 7.5 (2 / 1) |
| | forest Ace | 0 / 1.5 / 3.2 (0 / 0) | 0 / 4.0 / 5.2 (1 / 0) |
| | winter Rookie | 4.7 / 5.8 / 7.0 (17 / 0) | 4.3 / 5.3 / 8.3 (12 / 1) |
| | winter Veteran | 4.5 / 5.8 / 8.7 (71 / 3) | 4.5 / 5.8 / 8.8 (71 / 2) |
| | winter Ace | 3.8 / 5.3 / 5.8 (14 / 0) | 3.3 / 5.3 / 7.2 (10 / 1) |
| Hits/min p5 / p50 / p95 | forest Rookie / Veteran / Ace | 0/0.67/1.28 · 0/1.03/2.09 · 0.78/2.15/3.54 | 0/0.69/2.03 · 0.30/1.07/2.16 · 0.96/1.99/3.36 |
| | winter Rookie / Veteran / Ace | 0/0.73/1.60 · 0.24/0.80/1.84 · 0.69/1.50/2.56 | 0.24/0.53/1.24 · 0.25/0.95/1.79 · 0.48/1.68/2.61 |
| Worst 10 s window | forest R / V / A | 45.0/63.5/75.3 · 35.1/58.9/77.5 · 48.5/65.6/76.8 | 39.9/62.5/73.2 · 36.6/59.9/79.0 · 48.5/64.5/76.8 |
| | winter R / V / A | 11.4/17.2/22.8 · 19.9/25.7/30.9 · 25.6/33.2/38.4 | 14.6/18.2/25.0 · 20.5/25.6/31.4 · 25.1/32.8/39.2 |
| Bullets on screen | forest R / V / A | 11.3/12.9/16.6 · 11.8/15.4/20.2 · 18.1/21.2/23.8 | 10.2/13.1/16.1 · 12.2/16.0/19.5 · 19.0/21.3/23.2 |
| | winter R / V / A | 3.7/5.1/6.7 · 5.7/8.0/9.4 · 10.4/11.7/13.5 | 4.0/5.5/6.7 · 6.0/8.2/9.6 · 10.5/11.9/13.6 |
| Kills/min | forest R / V / A | 99/109/119 · 112/124/136 · 115/124/150 | 98/109/120 · 112/123/135 · 112/126/148 |
| | winter R / V / A | 93/102/113 · 107/116/127 · 119/131/143 | 92/102/109 · 107/116/127 · 119/130/142 |
| Reported measures | desert, all diffs | as 9.4 | identical |
| Bots: cleared, deaths/min p5/p50/p95 | desert rookie / veteran / ace | as 9.5 | identical |
| | forest rookie | 0, 1.70/3.96/6.26 | 0, 2.02/4.04/6.68 |
| | forest veteran | 0.05, 0.97/1.61/3.89 | 0.04, 0.99/1.95/3.88 |
| | forest ace | 0.36, 0.39/1.12/2.17 | 0.34, 0.41/1.17/2.24 |
| | winter rookie | 0, 1.45/3.26/5.14 | 0, 1.57/3.34/5.33 |
| | winter veteran | 0, 0.99/1.77/4.17 | 0, 0.90/1.83/4.17 |
| | winter ace | 0.03, 0.86/1.34/4.20 | 0.01, 0.91/1.52/3.25 |

What changed: nothing in the desert. Forest and winter numbers moved by flight-to-flight noise around the same centres. Medians of hits, window, bullets and kills moved by less than 0.25 hits/min, 1 bullet in the window and 2 kills/min. The exceptions are wider tails: forest Rookie hits p95 1.28 to 2.03, winter Rookie window p50 17.2 to 18.2, and the longest quiet stretches on forest Ace (max 3.2 to 5.2 s) and winter Ace and Rookie (5.8 to 7.2 s, 7.0 to 8.3 s), all far under 10 s. The verdicts of 9.4 hold: desert and forest Veteran are still calmer than their levels, low in 185 and 177 to 198 flights, and forest Veteran kills/min is still high in 196. The bots die a little more often in forest and winter, and winter ace cleared 1 of 80 (was 2). Lives when the boss comes, n reached: forest rookie 0 (was 3), veteran 20 (was 29), ace 62 (62); winter veteran 14 (8), ace 22 (30). What did not change: the failures, the boss arrival times, determinism, the 14 dates, and every desert number.

Not run: the skill bots on the old build (their "before" column is 9.5's run); phone viewport; other dates or sub-seeds; `replay.mjs`, `resume-exact.mjs`; the unit tests.
