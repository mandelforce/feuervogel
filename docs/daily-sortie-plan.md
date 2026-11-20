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

FAIL on any of these: a page or game error (`SF.R.errs`); gate 2 not clean (`kit-check.mjs` plus the structures limit, as `compose.mjs`); no boss, or the boss not killed within 900 s; the flight not ending at the title; a planned encounter not ending `done`, or no Shadow Wing; the twin flight in the other page (another `Math.random`) differing in spawns (count and hash), score, end or frames; dead air longer than 12 s (raised from the brief's 10 s by the owner's decision; the 9.2 to 9.7 runs used 10 s, and at 12 s the sweep has no failures). Dead air is a stretch before the boss with no enemy on screen, no enemy bullet and no encounter, measured as in `daily-baseline.mjs`.

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

## 10. Phase 4 results: vetting and the title entry (build 1.2.6.41, composer v1)

**Vetting.** `.github/workflows/daily-vet.yml` runs daily (04:17 UTC) and by hand. It checks out `main`, sets up Playwright and Chromium as `smoke.yml` does, serves the folder and runs `scripts/daily-vet.mjs`:

1. `tests/daily-gate.mjs --from <tomorrow UTC> --days 14 --save` (all three difficulties, no bots; the 12 s dead-air limit).
2. For each failing date, `--sub 1` to `--sub 8` on that date alone until a sub-seed passes on all three difficulties. A date with none is reported, never guessed.
3. The passing sub-seeds go into `DAILY_REROLL` (`'YYYY-MM-DD': k`, sorted, existing entries kept); `embed-citygen.mjs` brings the copy in `index.html` up to date. Nothing else changes.
4. The workflow force-pushes branch `daily-vet` from `main` and opens a pull request, or updates the open one (its body is the report: each rerolled date with its cause, every unfixable date). Nothing fixed, no pull request. Unfixable dates fail the job (red run, report in the run summary).

The gate was reused: it gained `--sub K` (force a sub-seed on every date) and a `sorties` list in `--save` (date, kit, sub, pass, causes). It does not parse text.

*Tested locally, nothing pushed to Actions.* `--dead 6` over 2026-12-01 to 12-14: 12 of 14 dates pass, 2 fail on dead air; 12-03 (desert) passes on sub 1, 12-12 (desert) fails sub 1 and passes sub 2; 2 min 7 s. `--dead 3` over 4 dates, `--max-sub 2`: 2 fail, neither rerolls (reported as not fixed). A write run (`--from 2026-12-03 --days 1 --dead 6`) changed one line in `tools/sortie-compose.js` (`DAILY_REROLL = {'2026-12-03': 1}`) and one in `index.html`, and `tests/compose.mjs --shard 1/4` passed on it; reverted. The workflow's own steps (branch, PR) have not run: the YAML parses, nothing more.

**Version.** `composeVersion` stays 1: a table entry changes only dates 14 days ahead, which nobody has played, and the board key (phase 6) is `date + composeVersion`. A `VERSION` bump is **not needed for it to work** (`index.html` is fetched network-first by `sw.js`, and the saved run records its own `daily.v`), but the entry changes `index.html`, so I recommend the owner merge it into the next release that bumps `VERSION` anyway. A rerolled date already played on its day would change under the player: the window starts tomorrow, so this does not happen unless a PR sits unmerged past its dates.

**Entry (changed in 1.2.6.42, owner).** The title has no DAILY button (it was first built beside SCORES). Settings, opened at the title, has a row "Daily Sortie (KIT)" with a Play button; it closes Settings and opens the difficulty picker headed "Daily Sortie" (note: date, kit, does not count); the pick starts `startDaily(today UTC)` (decision 3). The row is hidden in a flight. The test link `?daily` still works. The results screen is headed DAILY CLEAR with the date and kit and shows the sortie score and lives under the bonus. Also in 1.2.6.42: the Retro Run's scanlines setting is removed and the scanlines are always on in a Retro Run.

**Checked.** `tests/daily.mjs` (78 checks; new: the button's date and kit at three clock times including 23:59:50 UTC, the click, the pick on Ace, START and SCORES unchanged, the controller, the results screen). `menunav.mjs`, `smoke.mjs`, `layout.mjs`, `retro.mjs`. **Not run:** `enigma.mjs`, `encounter.mjs`, `buechse.mjs`, `drilling.mjs`, `replay.mjs`, `resume-exact.mjs`, the sweep, the unit tests, the other CI jobs.

**For the owner.** (1) Pull requests opened with `GITHUB_TOKEN` do not start the smoke workflow; run it by hand on `daily-vet` or use a token of your own. (2) Decision 8 and dead-air options 1 and 2 are still open. (3) The Daily Sortie entry is live for everyone once this ships, and no person has played a Daily Sortie yet.

## 11. Proposal: make the days differ (twists and loop flavours). Draft, nothing built

**Why.** The owner expects the Daily Sortie to feel too similar to the Campaign (2026-11-15). It is: same boss, theme, art and timetable as level 2, 4 or 5, first-pass rules, and in forest and winter most middle templates share their ground (6.3, rows 7 and 11). Reordering segments alone will not fix that. This section adds two things the composer can pick from the date, without new ground: a **twist** (a rule or look of the day) and a **loop flavour** (content the Campaign only shows in its loops). Options 3 to 5 of the discussion (own ground for forest and winter, other bosses, more kits) stay out of scope; they are phase 5 and later work.

### 11.1 The twist

A twist is one named modifier per day, chosen by the date (`twistFor(date, kit)`, a second seeded draw next to the kit rotation; rotation, not random, so two days in a row never repeat one). It rides on the sortie object next to `variant`, and `run.daily` records it (`{date, kit, seed, sub, twist, flavour, v}`), so resume rebuilds the same day. A twist never changes the composer's segment list, so gates 1 and 2 are untouched; gate 3 (the flight gate) flies every twist on every kit and difficulty.

Rules: one twist a day; it must be readable in the first ten seconds (a banner names it, as `DAILY SORTIE` is named now); it must not make a sortie unwinnable for the bot or hide threats unfairly; and it counts nowhere, like the rest.

Candidate twists. "Exists" means the game already has the mechanism in the Campaign, so the twist is mostly a switch plus gate time; "new" means game code that does not exist yet. Nothing below has been checked for the three kits' grounds; the first task is to check each.

| Group | Twist | What the player feels | Basis |
|---|---|---|---|
| Look and sight | **Night run**: the level in the dark (`nightF`, the moon variant) | Fewer readable shapes, lights and tracers stand out | Exists: night factor and moon in the render; tied to level 3's theme, so it needs a check on other grounds |
| | **Fog / squall**: the winter squall and forest overcast on other kits | Visibility drops in stretches | Exists for winter and forest (`squallAt`, the overcast); desert needs a sand-haze equivalent (new) |
| | **Sandstorm** (desert) or **blizzard** (winter): drifting particles plus short blind stretches | Same, harder to read | New |
| | **Dawn / dusk** palette grade | Mood only, no change in play | Exists in part (the grade under the night overlay) |
| Enemy flow | **Swarm day**: more but weaker enemies (count x1.5, hit points x0.7) | Constant shooting, little tension | New: a timetable multiplier; must keep `TT_ENC` order |
| | **Elite day**: fewer, tougher enemies (x0.6, hit points x1.5) | Every target matters | New, same switch |
| | **Heavy bullets**: fewer, slower, bigger enemy bullets | Dodging by reading, not reflex | New (bullet speed exists per difficulty, `DIFF`; size is new) |
| | **Rush hour**: the encounters of the kit all come early, back to back | A front-loaded sortie, then a long run-in | New: encounter placement is per segment; a timetable offset |
| Your ship | **Fixed weapon**: the whole sortie on Scatter, Lance, Seeker or Arc, no pickups change it | You learn one gun properly | Exists: weapons and tiers; new: lock the pickups |
| | **Glass cannon**: one life, double score | Risk and reward | Exists: lives, score; new: the multiplier on a no-count run |
| | **Nova day**: start with 6 Novas, no pickups give more | A panic button to spend | Exists: Nova count |
| | **Slow ship** or **fast ship** | A different feel at the same dodge | Exists: the ship's speed is a constant; new: a per-run factor |
| World | **Fast scroll** (the level flies 20 % faster) or **slow scroll** | Shorter or longer sorties, different pacing | Exists: `world.scrollV` / `scrollTarget`; changes the timetable's meaning, so the gate must fly it |
| | **Fog of war**: the ground details fade out except roads and targets | Only what matters is lit | New |
| | **Mirror**: the sortie flipped left to right | The same level, new muscle memory | New: a render and spawn flip; the plans and the timetable are in game x, so every x in the sortie must flip |
| Rules of the day | **Medal hunt**: score only from medals, enemies give no score | Chase the chain, not the kills | New |
| | **No pickups** except the boss's | A fixed loadout, a hard run | Exists: item spawns; new: the switch |
| | **Boss rush at the end**: the boss's fight twice (the second at half hit points) | A longer finish | New: the boss exists once per sortie |

Recommended first set, cheapest and most visible: **Night run**, **Fog / squall**, **Fixed weapon**, **Swarm day**, **Elite day**, **Fast scroll**, **Mirror**. They cover sight, enemies, ship and world, and four of the seven use mechanisms that exist. The rest wait for the first results.

### 11.2 The loop flavour

The Campaign's loops change ground and difficulty (the Campaign's loop variants: the desert's basin, the forest's autumn with lakes, the winter's `variant` 1; a rank step per loop, `LOOP_STEP`). The composer currently fixes all of them off (`variant` 0, first-pass rules). A **flavour** turns some of that on for a day:

- `plain`: today's rules (most days).
- `variant`: the kit's loop ground (desert basin; forest autumn plus lakes; winter variant 1). Different look and different templates' behaviour on the ground. The generator accepts these for the hand-made lists; composed lists were not probed with them (plan 6.6 lists this as not probed). **First task: run `tests/compose-probe.mjs` for each kit with the variant on and report which templates survive.**
- `rank`: the first loop's rank (the Campaign's loop-1 values) on the first-pass ground. Harder, nothing else.
- `loop`: both.

A flavour changes what a date produces, so it is part of the seed's output: `composeVersion` goes to 2 when it ships, and every board key, saved run and the vetting table is keyed by it (2.3). The flavour is drawn after the twist, and a date draws neither twist nor flavour when the table says so (`DAILY_PLAIN`, for days the owner wants to leave untouched).

### 11.3 How a day is drawn

`dailyDay(date)` returns `{kit, seed, sub, twist, flavour}`: the kit by rotation as now; the twist by its own rotation over the owner's enabled list (so the same twist cannot come two days in a row, and a kit does not draw the same twist twice in a week); the flavour by weight (for example plain 60 %, rank 15 %, variant 15 %, loop 10 %, set by the owner). `DAILY_REROLL` keeps working per date, and the vetting script gets a second reroll order: first a new sub-seed, then, if none of 8 passes, a plainer day (flavour `plain`, then no twist), reported in the PR text. Nothing else changes in `scripts/daily-vet.mjs`; the gate takes `--twist` and `--flavour` as it takes `--sub` now.

### 11.4 Phases

1. **Probe (no game change).** For each kit: which flavours the composer's lists survive (plan checks, gate 2); for each candidate twist in the first set: does the mechanism exist as the table says, and what does it need. Report in a section 11.5, as phase 0 did in 6.
2. **Flavours.** Composer, `run.daily`, resume, `composeVersion` 2, tests (`compose.mjs`, `daily.mjs`), the flight gate with `--flavour`. Sweep as in 9.
3. **Twists, the first set.** One at a time: the switch, the banner, a unit check that it is off on every other day, the gate on all kits and difficulties.
4. **Draw and vetting.** `dailyDay`, the rotation rules, the vetting script's plainer-day fallback.

**Stop point after each of 1 and 2**, as the other phases do: the owner reads the report before the next.

### 11.5 Decisions (owner, 2026-11-15)

1. **Twists:** the first set of 11.1 as recommended: Night run, Fog / squall, Fixed weapon, Swarm day, Elite day, Fast scroll, Mirror. One twist every day. (One-life and the other candidates wait.)
2. **Variety:** as much as possible from the start. Flavour weights: plain 10 %, rank 30 %, variant 30 %, loop 30 %. A plain-flavour day still has a twist.
3. **Combining:** a twist and a flavour combine on the same day.
4. **Visibility:** the Daily Sortie entry in Settings stays visible while this is built (no hiding until phase 2 is done).

Consequence of 2 and 3: every kit meets every twist and every flavour, so the flight gate (and the vetting workflow, which flies the three difficulties) has a matrix to cover: 3 kits x 4 flavours x 7 twists = 84 combinations x 3 difficulties. The sweep of section 9 cannot fly all of it for every seed. Proposal for phase 2 to 3: fly every combination on a few seeds each, then the real dates in the nightly vetting as now (the date decides its combination, so the vetting flies exactly the day's one).

### 11.6 Phase 1 results: the probe (build 1.2.6.42; nothing in the game changed)

**Flavours on composed sorties** (`tests/flavour-probe.mjs`, Node only; 60 composed sorties per kit, `hash(s, 9090)` seeds; each plan generated plain and with the kit's loop parameters, then judged by the same plan checks as `compose.mjs` and the gate):

| Kit | Loop parameters | Plain | With the loop ground |
|---|---|---|---|
| desert | `variant: 1` | 0 of 60 flagged, 234 ms median | 60 of 60 flagged `outside` ("derrick in desert_open"), 252 ms |
| forest | `autumn: 1, lakes: 1` | 0 of 60, 125 ms | 0 of 60, 529 ms |
| winter | `variant: 1` | 0 of 60, 793 ms | 0 of 60, 765 ms |

- Forest and winter survive the loop ground in all 60 plans. Forest's plan takes four times as long with lakes (529 ms in Node); the page is slower still, so the plan build time should be measured in the game before this ships (the baseline in 6.4 had 552 to 568 ms in the page for the hand-made first loop).
- Desert's flags are not breakage. The loop adds guarded oil fields to `desert_open` stretches (generator line "the loop's additions") and the check does not expect an oil field there. Phase 2 teaches the check: with `variant` on, an oil field in `desert_open` is expected. It still has to be flown: the flag says only that the plans are valid and differ.
- Not probed: the game's own side of `variant` (density and damage curves for level 3 only; for levels 2, 4, 5 the hand-made loop sets `S.variant`, `S.autumn`, `S.winter`, which change the sky, the overcast and the weather plans, `ovcOn`, `squallAt`). A composed sortie has to set the same fields; phase 2 does that and checks the rendering by contact sheet.
- Rank: the first loop's rank is `rankFor` with `run.loop` 1 (`LOOP_STEP`, `LOOP_SLOPE`, `bspeed`). A Daily Sortie starts at `run.loop` 0 today. The `rank` flavour sets the rank for the run without making it a loop (so nothing counts as a loop); phase 2 checks that `rankFor`, `hpm()` and `bspeed` read it from one place.

**Twists: does the mechanism exist** (read from the code, nothing run):

| Twist | Finding | Cost |
|---|---|---|
| Night run | `world.nightF` follows the stage's theme (3 = level 3) and drives the darkening, the searchlight aim and the lightning (`nightF` in the director, the render and the AI). No switch to force it on other themes. | small: a per-sortie override of the value `thS === 3` gives; check the render's grade on desert, forest and winter ground, and that the searchlights (`nightLit`) work without level 3's lights |
| Fog / squall | `squallAt` is winter only (`S.winter`), the overcast is forest and winter (`ovcOn`). Desert has neither. | forest and winter: a switch. Desert: a new sand haze, as the plan says |
| Fixed weapon | `mkItem` picks the pickup's weapon at random from the stage's list; the weapon is on the player (`player.weapon` / tier). | small: lock the starting weapon, make the pickups the same weapon (tier up only) |
| Swarm day / Elite day | Enemy hit points are `hpm()` (`1 + 0.25 * run.loop`, times `DIFF.hp`) and per-type factors; counts come from the timetable (`TT_ENC` and the director). Hit points are one function; counts are not. | hit points: small (one factor in `hpm()`). Counts x1.5 or x0.6: medium, in the timetable's wave sizes; must keep `TT_ENC` order |
| Fast scroll | `SCROLL = 0.4`, set into `world.scrollV` and `scrollTarget` at the start and after events (about six places). The encounters run on frames (`TT_ENC` are frame counts), the ground on scroll, so a faster scroll moves the ground under the same frame schedule. | medium: one factor everywhere `SCROLL` is set; the gate must fly it, since dead air and encounter spacing change |
| Mirror | Nothing flips. Every x in the game (spawns, plans, rails, bosses, the HUD stays) would have to flip. | large; the least certain item. If it cannot be done as a render and input flip only, move it out of the first set |

**Proposal for the next step (phase 2, flavours; the owner reads this report first):** the composer takes a flavour, `run.daily` records it, `composeVersion` becomes 2, the three kits set `variant` / `autumn` / `winter` as the hand-made loops do, the plan check learns the desert oil field, and `tests/daily.mjs`, `compose.mjs` and the flight gate (`--flavour`) cover it. Then phase 3, the twists, easiest first (Night run, Fixed weapon, Elite and Swarm by hit points, Fog / squall on forest and winter), with Mirror last and only if it can be a flip at the edges.

**Stop point of phase 1.** Questions: (a) is hit points only acceptable for the first version of Swarm and Elite (no change in counts), which is much cheaper? (b) should Mirror stay in the first set given its cost, or be swapped for another twist from 11.1 (Nova day or Heavy bullets)?

### 11.7 The rating (owner request, 2026-11-15; built in 1.2.6.43)

At the end of a Daily Sortie the player gets the usual level overview (the results screen, DAILY CLEAR with the bonus lines, sortie score and lives) and then, back at the title, a 1 to 5 star question about the level. It is the one thing a Daily Sortie sends: the board, best score, loops and the run report still do not see it.
- **Once per date and version** on a device; Skip or Escape stores nothing and the date is asked again after the next sortie. A Practice or Campaign level never asks.
- **Sent** to `POST /rate` with `{player, v, plat, date, kit, sub, cv, diff, score, dur, stars}` (the anonymous player id the run reports use) only with Share play data on; the Worker keeps one row per player, date and composer version (`daily_ratings`, a later answer replaces the earlier one), rejects dates more than two days from now, and allows 40 a day per player. Nothing is sent from a local build.
- **When 11 is built** the twist and flavour of the day join the row (`twist`, `flavour` columns), so a rating can be read against what was different that day. Until then the kit and the sub-seed are what a rating can be read against. A rating means little per player; read it per date and kit, and per difficulty.
- **Owner action:** apply `schema.sql` to the live database and deploy `worker.js`. The game side is safe before that (the request fails quietly).
- **Tests:** `tests/daily.mjs` section 6 (88 checks in all) and four rating tests in `tests/worker.test.mjs`.

### 11.8 Decisions on the twist list (owner, 2026-11-15, after the probe)

- **Swarm day and Elite day: hit points only** in the first version (no change in enemy counts): Swarm x0.7, Elite x1.5, through `hpm()`. Counts stay with the timetable.
- **Mirror is out.** In its place one twist, **Nova storm**: Nova day (start with 6 Novas, no pickup gives more) combined with Heavy bullets (fewer, slower, bigger enemy bullets). Read as one twist because the owner wrote "nova day combined with heavy bullets"; if two separate twists were meant, they split cleanly.
- The first set is now: Night run, Fog / squall, Fixed weapon, Swarm day, Elite day, Fast scroll, Nova storm.

### 11.9 Phase 2 results: the flavours (build 1.2.6.44, composer v2)

**Built.** `composeSortie(kit, seed, sub, flavour)` takes `plain`, `rank`, `variant` or `loop`; `dailySeed` draws the flavour from the date by the owner's weights (plain 10 %, rank 30 %, variant 30 %, loop 30 %; over 4,000 dates 9.4 / 30.5 / 29.4 / 30.8 %). `composeVersion` is **2**. The segment list does not depend on the flavour (same list for the same date in all four). `variant` and `loop` add the kit's loop parameters to the generator (`LOOP_PARAMS`: desert `variant`, forest `autumn` + `lakes`, winter `variant`); `rank` and `loop` give the first loop's rank. In the game: `buildSortie` sets `variant` (desert), `autumn` (forest) and `winter` (winter) for a composed sortie with the loop ground, as the hand-made first loops do; `startComposed` sets `run.loop = rankFor(level + 6)` for the rank flavours (`run.loops` and `run.stage` stay: it is not a loop and counts as none); `run.daily` records the flavour and resume rebuilds it (a record of composer v1 is not resumed). The banner adds HARD, LOOP GROUND or LOOP. Test link: `&flavour=loop`. The gate takes `--flavour`, shows it per line and lists it in `--save`.

**Two plan checks had to learn the loop ground.** The desert's loop adds guarded oil fields to `desert_open` (`kit-check.mjs`: `loopOutside`, derricks there are expected with the ground flavours). The winter loop's pass opens into a basin with a base: 33 % built in every plan against the kit's 14 % limit (`groundBuilt: { pass: 0.36 }` in the kit, used by the gate and the probe for the ground flavours). `tests/flavour-probe.mjs` now counts the structures limit too: 0 of 100 flagged in all six cases.

**Flown.** Every kit x flavour (12) on 3 dates x 3 difficulties: all pass except the winter `loop`, which failed determinism on 2 of 3 dates. The 14 real dates from 2026-12-01 flew with their own flavours (the winter ground failed gate 2 on 3 dates before `groundBuilt`).

**Finding: a page that flew before can fly the next sortie differently.** The winter `loop` flight differed between a fresh page and a page that had flown another sortie first (689 spawns against 684; the first difference at frame 15050, a train car's type). Two fresh pages with different `Math.random` fly it identically, so it is not randomness. The game state at frame 14,400 is identical in both except cosmetics; the shared random stream (`simS`) diverges at frame 14,455 where the used page makes extra draws in the player's shot code (a hit spark). Not found: what state carries over. Not seen in the plain, rank or variant flavours. Not fixed. Consequences: (1) a player who flies two Daily Sorties in one page session might get a second sortie that differs slightly from the first in the winter loop's boss fight; (2) the flight gate and the vetting script now fly every human flight in a fresh page (`--fresh`, about 50 % longer: 3 winter loop dates take 55 s against 36 s), which is what a player has. **Decided by the owner (2026-11-15): accepted.** The fresh-page workaround stays and the leak is not hunted down. Reopen it only if a second Daily Sortie in one session is reported to differ.

**Checked.** `tests/daily.mjs` (139 checks; new: section 7, every kit x flavour: the recorded flavour, the game's ground flags, the rank, not a loop, the generator parameters, and one flight to the end per flavour), `compose.mjs` (shard 1), `smoke.mjs`, the vetting script on two dates. **Not run:** the other `compose.mjs` shards, the 200-seed sweep with flavours, the skill bots on flavoured sorties (the rank flavours are harder: the bots' numbers would show how much), phone viewport, the rendering of the loop grounds by contact sheet (the plumbing only: the three kits' loop looks are the Campaign's, but on composed lists they have not been looked at).


### 11.10 Phase 3 results: the twists, the first set (build 1.2.6.45, composer v3)

**Built.** `composeVersion` 3. `composeSortie(kit, seed, sub, flavour, twist)` records `twist` (`none` or one of `TWISTS`); a twist never changes the segment list (checked: 3 dates x 3 kits x 7 twists). `dailySeed` draws the twist by rotation over seven days (`TWIST_ORDER`: night, swarm, fixed, fog, elite, fast, nova): one twist never comes two days in a row, and since 7 mod 3 = 1 a kit meets a given twist once in 21 days (both checked over 1,100 dates); any 21 days cover every kit x twist once. `DAILY_PLAIN` (date to 1: flavour plain, 2: flavour plain and no twist) is the vetting's fallback. `run.sortie.daily` is `{date, kit, seed, sub, v, flavour, twist}` and resume rebuilds it. The banner has a third line with the twist's name and a hint; the test link takes `&twist=`.

| Twist | The switch | Notes |
|---|---|---|
| Fixed weapon | start weapon and every weapon pickup = the day's gun (Scatter, Lance, Seeker or Arc, from the seed, `fixedWeapon`); pickups still raise the tier | the pickup's random draw is still made |
| Swarm day / Elite day | `hpm()` x0.7 / x1.5 | hit points only (11.8) |
| Night run | `nightF` target 1 on any ground | the dark of level 3 (0.6 overlay, bullet halos light); no searchlights, so no night bonuses for guns |
| Fog | new `drawFogTwist`: banks of fog over the ground, a function of scroll and frame only, tinted per kit (sand haze on desert), gone at the boss | one implementation for all three kits, not the forest overcast or the winter squall: those are tables keyed by level 4 / `S.winter` stretches and would need a table for every composed segment type. Drawn under everything that flies and under the bullets; ground targets go soft |
| Fast scroll | `SCROLL` is now a variable (0.4, or 0.48), set at every start and resume (`scrollFor`) | encounters run on frames, so the ground passes them 20 % faster |
| Nova storm | 6 Novas at the start; a Nova pickup is 2000 points; enemy shots: a third not fired (stateless, from `gf` and the position), 0.8 x speed, 1.5 x hit radius, an orange glow | "bigger" is the hit circle and the glow, not the sprite. Rookie's own skip rule stays on top |

**Rating.** `/rate` takes `twist` and `flavour` (words only, else null); `schema.sql` has the two columns for a new database, and the two `ALTER TABLE` lines for the live one are in it, commented (SQLite cannot add a column "if not exists"). The Worker falls back to the old insert when the columns are missing, so a rating is kept before the owner applies the change. Two new worker tests (22 pass).

**Flight gate.** Every twist x 3 kits x 4 seeds (`--sweep 4 --all 4 --det 2 --twist T --fresh`, flavour plain), all three difficulties, human bot, determinism on every second seed: **84 of 84 sorties pass** (252 flights). Longest dead air by twist: fixed 8.7 s, swarm 9.0, elite 10.7, night 9.2, fog 9.2 (night and fog fly identically: they are looks), fast 7.5, nova 11.8 (the limit is 12: Ace on one seed). The 21 real dates from 2026-12-01 (every kit x twist once, each with its own flavour) **all pass**, all three difficulties. The skill bots were not flown on twists.

**Vetting.** `scripts/daily-vet.mjs` flies each date's own flavour and twist; if sub-seeds 1 to 8 all fail it tries the plainer day (flavour plain, then no twist as well) on sub-seeds 0 to 8, writes `DAILY_PLAIN` and names the date in the PR text. Forced with `--dead 6 --max-sub 1 --no-write` on 2026-12-01..14: 4 dates failed, 3 passed on sub 1, 2026-12-06 (desert, variant) failed sub 1 and passed as a plain-flavour day. Nothing was written; the real window needed no change.

**Looked at.** Contact sheets (`tests/contact.mjs`, 5 frames of 14 per case) of Night run and Fog on all three kits. Night: readable on all three; the desert is lighter than the forest and winter (dusk rather than night). Fog: clear as a sand haze on the desert, visible on the forest (which already has level 4's overcast clouds) and subtle on winter's white ground. **Not looked at:** any twist in motion, the banner, Nova storm's glow, Fast scroll, a phone viewport, Night's lightning and thunder (the level 3 storm effect also fires on a night day).

**Checked.** `tests/daily.mjs` 220 checks (new: section 8, the draw in Node; each twist on and off in the game; a Campaign level afterwards without the twist; fast and nova resumed exactly), `compose.mjs` (38), `worker.test.mjs` (22), `smoke.mjs`. A resume check saved too early differed because the bot's own state is not in the snapshot; the check saves from frame 4200, as section 3 does. **Not run:** `replay.mjs`, `resume-exact.mjs` (told not to), the other test files.

**Questions for the owner.** (1) Is Night run too dark or too light on the desert; should the dark be per kit? (2) Fog: one shared haze (as built) or the Campaign's overcast and squall on forest and winter? (3) Lightning with Night run: keep? (4) Nova storm's dead air is close to the 12 s limit: accept? (5) Skill bots on twists (the harder ones: Elite, Nova): fly them before release? (6) A kit meets Fast scroll once in 21 days; the rotation is fixed, so the order is learnable: acceptable? (7) Apply the two `ALTER TABLE` lines when deploying the worker.

## 12. Phase 5: the temperate (level 1) and city (level 6) kits. Evidence and proposal (2026-11-16; nothing built, the Campaign untouched)

**Owner's brief (2026-11-16).** Bring the level 1 and level 6 structures into the Daily Sortie with as much diversity as possible: two new kits **plus shared pieces** (their structures also appear in the desert, forest and winter kits); the **boss varies** (some maps the typical boss, others a variation of it or another, never always the same ending on a ground type: "the daily runs are all about surprises"); all four levers (varied sequences, ground dials, **new generator structures**, **generator-made ground for the old chunks**); encounters are reused **plus new variants**. The Campaign stays exactly as it is.

### 12.1 What the code does today (read, not run)

| | Level 6 (`city`) | Level 1 (`one`, `isles`, `seq`) |
|---|---|---|
| Segments (`ENIGMA_SEQ`) | `open_sea` 5, `harbour_south` 14, `city_centre` 8, `city_town` 7, `industrial_power` 6, `ruins` 5, `station_main` 6 (51 chunks) | `carrier_start` 4, `open_sea` 6, `island_chain` 6, `island_airbase` 9, `open_sea` 3, `beach_fortified` 3, `farmland` 8, `village` 4, `forest_deciduous` 4, `farmland` 10, `coast_down` 1, `open_sea` 4 (62) |
| Ground | the whole level is one `portSouth` plan | one `islands` plan from chunk 0 to the start of `beach_fortified` (28 chunks); from there the **older chunk ground** (`S.seq`), with its own rivers in the farmland |
| How segments reach the generator | not at all: the game's `sortiePlanHarbour` turns the segment *fractions* into plan parameters (density and damage curves from `SORTIE_UD[template]`, `stationAt`, `industryAt`, a `coast` that ends after the sea segment and runs along the harbour segment) | the game's `sortiePlanIslands` turns fractions into `{ L, chain, big }` for the preset |
| Boss | the sky fortress (`BOSS_KINDS[5]`), trigger `bossAt = len + 5` | the ship (`BOSS_KINDS[0]`), trigger one chunk into the last segment (the final sea) |
| Level-specific hooks in the game | `SORTIE_UD`, Drilling pits (`DRILL_PITS[6]`), the loop's `haze` look, harbour raid and sky lance (loop only) | the carrier start, one submarine at a fixed place, dug-in heavy tanks on the islands (`planDrills`), `seaOK`/`roadOK` for island placement, `DRILL_PITS[1]` |

- **Neither builder is segment-native** the way `sandSea`, `ironForest` and `winterGorge` are: the composer cannot hand them a segment list. The generator needs the same step those three took (read `P.segs`, derive the fractions itself), with the Campaign's own lists giving byte-identical plans.
- **The boss is picked by the theme**: `kind = BOSS_KINDS[world.curTheme]`, and the theme is the level's (palette, sky, boss, arena in one). Varying the boss means a `bossKind` override, and each boss has ground it needs: the ship needs open sea at the end, the sand fortress the desert's boss ground, the castle its castle ground, the train and the railgun a yard, the sky fortress the airfield. So "any boss anywhere" is a matrix of arenas, not a switch. The Campaign's loops already vary two bosses (level 3's rocket launcher, level 6's twin lance and sky lance, both behind `run.sortie.moon` / `.haze`); nothing varies the others.
- **Old chunk ground in these two levels** (the farmland with rivers, the deciduous forest, the village, `coast_down`, the fortified beach, the city tail) has no generator equivalent for the farmland and the deciduous forest (the generator's forest builder is conifer, with an `autumn` broadleaf option); the fortified beach has `PRESETS.beach`; the city's districts are `town`, `industrial` and `portSouth` features; the village has `PRESETS.village` with farms.
- Shared pieces need a climate: the desert's harbour is `portDesert`, the winter's `portWinter`, and the sea, the sky and the palette are per climate, so a shared island chain or harbour is the same structure re-tinted, not a copy.

### 12.2 Proposal: build order, each ending at a stop point (owner reads the report)

1. **5.1 Generator: segment-native `portSouth` (city), then `islands`.** `P.segs` on both, the fractions derived inside, per-template defaults kept, the Campaign's lists giving identical plans (hash against the previous generator, as for the dials; `tests/citygen.mjs` goldens; `replay.mjs`, `enigma.mjs`, `fixed-seed.mjs` green with no `--update`). City first: it is already one whole plan.
2. **5.2 The `city` kit in the composer**, with the game wiring (`S.compose.gen` for level 6, the tables for the new template names, `SORTIE_BIOME`, Drilling pits), gate 1 and 2, the flight gate. Rotation becomes five kits when both are in (composer v5: every date's kit changes).
3. **5.3 Generator-made ground for the old chunks** (farmland with rivers and field patterns, a deciduous wood, the village, the fortified beach, `coast_down`), then **5.4 the `temperate` kit**.
4. **5.5 Shared pieces:** harbours, island chains and city districts as stretches in the other kits, re-tinted per climate; the kits' `follows` tables and the plan checks learn them.
5. **5.6 Boss variation:** a `bossKind` override, a per-boss arena rule, variants of the existing bosses (the loops' two as the precedent), a draw per date; the flight gate flies every boss on every ground it may meet.
6. **5.7 Encounter variants:** the loops' scripted encounters reused where they work on composed ground, new variants for the new kits.
7. **5.8 New generator structures** where the first kits show the gaps (candidates in the questions below).

### 12.3 Not checked yet (to be settled in 5.1)

Which of level 1's and level 6's scripted encounters work off their own ground; how many of the 92 mentions of the carrier are the take-off scene (an opener) and how many the carrier boss scene; whether the sea, the sky and the palette code takes a climate other than the level's own for the island and harbour parts; the plan time of an `islands` plan on a longer list (the Campaign's is 28 chunks); how a sky-fortress or ship boss is told "no arena here" without crashing.

### 12.4 Decisions (owner, 2026-11-16)

1. **Kits:** two new kits plus shared pieces. **Order:** city first, then temperate. **Levers:** varied sequences, ground dials, new generator structures, generator-made ground for the old chunks. **Encounters:** reuse plus new variants. **Campaign:** untouched.
2. **Shared pieces:** both: harbours and island chains as openers or middle stretches in the other kits (re-tinted per climate), and city districts (town centre, works, station) as middles.
3. **First new generator structures (all four):** a river city with bridges, a dockyard and shipyard, an archipelago with fortress islands, an old town with a rail city.
4. **Boss variation: bosses follow the ground they can fight on, not the level.** In the owner's words, as a compatibility table to build the `bossKind` override and arena rule around:

| Boss (today's level) | Where it may come | Variations named |
|---|---|---|
| Ship (level 1) | any level with water: the ocean part of any kit, with or without a harbour | at the end of any kit that has sea |
| Sand fortress (level 2) | any level with non-city, non-water, non-mountain ground | any open ground |
| Castle (level 4) | any kit, as a desert castle, a winter castle or a level 1 castle | per-climate castle versions |
| Train (level 5) | any ground with train tracks (the tracks must fit) | one train instead of the two, slightly bigger, still on one track |
| Railgun, the Night Hammer (level 3) | not named by the owner: stays on its yard ground | |
| The Moth (the looped Raven Prototype, `hull: 'moth'`, which ends the first loop of level 4 and fights in level 6) | the end of different levels | more hit points and a different, stronger blinding attack than today's |
| Raven Prototype (the classic hull) | even mid-level, in place of a Shadow Wing | |
| Shadow Wing | one or two of them as a level-end boss | |
| Sky fortress (level 6) | any level, since it flies | a smaller version |

   The owner's estimate: "not a lot of extra work if done smart". The design consequence is a **boss table keyed by the ground the boss needs** (open water, open land, tracks, castle ground, air) rather than by theme, so a kit's end ground decides which bosses the date may draw, and the plan checks and the flight gate fly every boss on every ground it may meet.
5. **Confirmed (owner, 2026-11-16):** "the moss" is **the Moth**, the looped Raven Prototype (`mothOn()`, `isMoth`, `SPR.protoMoth`), not the Night Hammer. **Encounters for Raven and the Shadow Wing as mid-level and end fights: new encounters built on the existing patterns** (the Wing's pattern, the prototype's duel and fly-by), not the existing ones reused as they are.

### 12.5 Step 5.1, first half: the city from a segment list (build 1.2.6.48 + this step; the Campaign untouched)

**Built.** `tools/citygen.js` `cityFromSegs`: preset `portSouth` with `params.segs` `[{ t, n }]` works out the plan's parameters from the stretches, the way the game's `sortiePlanHarbour` does for the Campaign's level 6 (the density and damage curves from each template's urbanisation and damage, `CITY_UD`; the works and the station as shares of the length; the coast ending after the sea and running along the harbour; `harbour6: true` for the first loop's harbour). Without `params.segs` nothing is touched, so every Campaign plan and every other preset is exactly as before. `CITY_UD` has the city's 12 templates (`harbour_south`, `open_sea`, `coast_plain`, `farmland`, `village`, `city_suburb`, `city_town`, `city_river`, `city_centre`, `industrial_power`, `ruins`, `station_main`). A list without the works, the station or the sea builds too (the composer's grammar may leave them out).

**Proof the Campaign did not move.** `tests/citysegs.mjs` (new, 8 checks, about 8 s, wired into the city generator shards in CI): the generator's table equals the game's `SORTIE_UD`; golden hashes of the Campaign's level 6 plans (seeds 1944 and 1945, plain and the first loop's harbour), made by the generator on `main` before this step, are unchanged; the plan from a segment list equals the plan from the game's own parameters (worked out line for line from `sortiePlanHarbour`) in 32 of 32 cases (the Campaign's list, reordered and longer lists, four seeds, plain and loop harbour). Also: `tests/citygen.mjs` (56 checks, its goldens), `tests/enigma.mjs` (213), `tests/fixed-seed.mjs` (41), `tests/replay.mjs --terrain` (matches), `tests/compose.mjs` (55), and the composed plans of all three existing kits hash identical to `main`'s generator (12 of 12), all with no `--update`.

**Not yet:** the islands (level 1) builder is still the game's `sortiePlanIslands`; no composer kit, no game wiring and no new template yet (steps 5.1 second half, 5.2). The city's districts today differ only by their urbanisation and damage curves, one works stretch and one station; step 5.8's new structures (river city, dockyard, old town and rail city, fortress islands) are what make two city sorties really different.

### 12.6 Step 5.2: the `city` kit (build 1.2.6.49, composer v5)

**Built.** `KITS.city` in `tools/sortie-compose.js` (preset `portSouth`, level 6, `boss: { add: 5 }`): opener `open_sea` 5 and `harbour_south` 14, middle `city_suburb`, `city_town`, `ruins` (at most 2 each), `city_centre` (once, **required**), `industrial_power` (once, 7 to 9 chunks), approach `station_main` 6; 44 to 60 chunks; the centre may not come directly before the station (`beforeApproach`). Two new kit rules in the grammar: `require` (templates every list must hold) and `beforeApproach` (what may come directly before the approach). The loop flavours set `harbour6` (the first loop's harbour). No ground dials yet. `KIT_ORDER` is desert, forest, winter, city; **composer v5** (every date's kit changes). In the game one early return in `sortiePlanHarbour`: a composed sortie builds its plan from the composer's generator input; the Campaign's level 6 goes on below it as before. The picker, the lab and the flight gate know the city; the plan checks (`tests/kit-check.mjs`) check the harbour's cranes, the industrial quarters, the station and the market square.

**Two generator gaps the plan checks found, closed for segment lists only (each a second chance, so a plan that already has the feature is not touched; the Campaign's golden hashes and `replay.mjs` confirm it):** a works stretch always gets an industrial quarter (if none had its centre in it, the nearest quarter outside the old town's ring becomes industrial); a station that finds no room gets a second pass with a wider urbanisation window (the first pass wants 0.5 to 0.97, and the station inherits the urbanisation of the stretch before it: after the city centre, 1.0, it never found one). `plan.works` is the town's gasworks (a civic building placed by chance), not the works stretch; the check reads the industrial quarters.

**What the first probes found.** 24 of 200 lists lost their station: 22 of them had the city centre directly before it (the old town ring takes the room): `beforeApproach` fixes it. 7 lost the industrial quarter (a 5-chunk works stretch is too short for a 200 to 400 px quarter to have its centre in it): 7 chunks minimum and the generator guarantee. One list in 600 had the old town on the left edge and the harbour reserving the right, so the railway and the station could not be built; it had no city centre, so the old town sat in the harbour stretch: `require: ['city_centre']` fixes it. The structures limits of a city are high (54 % harbour, 65 % suburb, up to 85 % the rest) and are set just above what was measured, not by the other kits' rule.

**Checked.** Gate 2 on 600 city lists: clean (plan time 149 ms median, 241 ms at p95); `tests/compose.mjs` 65 (the tests learned four kits: the rotation, days per kit, the share of days with dials counted over the kits that have them); `tests/daily.mjs` 299 (the city flown in the game in every section: the link, determinism in two pages, resume, every flavour, the twists, the light); flight gate on 12 city sorties on all three difficulties (18 flights): all pass, longest quiet stretch 1.7 s; vetting of the next 14 dates with the four-kit rotation: 14 of 14; Campaign guards: `tests/citysegs.mjs` (8), `tests/citygen.mjs` (56, goldens), `tests/enigma.mjs` (213), `tests/fixed-seed.mjs` (41), `tests/replay.mjs` (matches), `tests/smoke.mjs`, all with no `--update`; the composed plans of the three older kits hash identical to `main`'s generator (12 of 12).

**What the gate reports (not failures).** Composed city sorties are lighter on targets than the Campaign's hand-made level 6: kills per minute 104 to 117 against 134 to 136, and more bullets before the boss (13.8 to 18 against 11.7 on Veteran). The baseline is one flight per difficulty (the Campaign's first pass; its first loop is the last stage of the Campaign and ends without a boss kill), so every low and high mark is against a single point. The city has no scripted encounter of its own, only the Wing and the regular timetable: plan 5.7 (new encounter variants) is where it gets set pieces.

**Not done.** The city's ground dials, its new structures (plan 5.8), the varied bosses (5.6), the shared pieces (5.5), generator-made ground for level 1's old chunks and the temperate kit (5.3 and 5.4). Looked at: a contact sheet of 2026-11-18 (8 frames): the sea, the harbour with piers and warehouses, a suburb, the centre with its ring and roundabouts, the town with fires and rubble; it reads as level 6's city. Not looked at in motion; a human has not played it.

### 12.7 The city's structures and dials (step 5.8, first part; build 1.2.6.49, composer v5)

**Done (owner, "continue with the city tasks"):** the river city, the rail city and the city's ground dials. **Not done: the dockyard** (see below).

**River city.** A `city_river` stretch (5 to 7 chunks, at most 2): `CityGen`'s `cityFromSegs` puts a river across the city at the stretch's middle, with its bridges; the first river has an island, a second none. The generator already had rivers with islands and bridges (`PRESETS.river`, `rivers`); this only connects a template to them. Dials per river stretch: its width (20 to 36 px), its wobble, an island or not, a harbour district on its bank (`riverPort`: basins, warehouses, cranes). With a rail yard ending the river has no island: an island river lost a bridge in 8 of 60 yard lists, and an island needs two (`CityGen.validate`).

**Rail city.** The city kit now ends in one of two ways, picked from the seed: the main station (65 %) or a **marshalling yard** (35 %, `rail_yard`, 7 chunks), as level 3's. The yard's two outer tracks run on through the boss arena (`S.arenaTracks`, painted only: level 3's `arenaRails` also run trains with `Math.random`, which a composed sortie must not use). Composer: `approaches`, `approachShare`, `arenaTracks`, `gapBefore` (a yard needs at least 14 chunks between the city centre and itself: the yard narrows the strip for 640 px before it, and with the centre within about 800 px the market square was lost in 8 of 40 lists). The yard is also **the ground the train and railgun bosses need** (plan 12.4, row 4): the boss work can use `S.arenaTracks`.

**Ground dials (the city).** Whole level: the harbour's side channel (41 to 62: narrower blocks the ship lanes), the shore's waviness, the old town's size (1 to 1.25), parks, trees, vacant lots. Per stretch: its urbanisation (an offset, limited per stretch so that only the city centre can be the densest point and keep the old town and the market square) and its damage (a factor 0.4 to 1.6); strong dials: damage, urban, old town, side channel, river width. **Two dials I removed after probing:** the pier length (capped by the sea's width, no effect) and the shore's position (`coast.land`: every one of 8 invalid drawn days contained it, even in a narrow range, blocking the ship lanes).

**Checked.** Gate 2 on 150 city lists with rivers, dials and both endings: clean (plan 160 ms median, 325 ms worst); `tests/dials-probe.mjs --kit city`: every dial reaches the plan, 0 flagged at the extremes, 250 drawn days 0 flagged, 0 over the structures limits; `tests/compose.mjs` 65; `tests/daily.mjs` 299; flight gate on 16 city sorties on all difficulties (5 with the yard ending): all pass; Campaign guards: `tests/citysegs.mjs`, `tests/citygen.mjs`, `tests/enigma.mjs` 213, `tests/fixed-seed.mjs` 41, `tests/replay.mjs`, `tests/smoke.mjs`, the three older kits' composed plans identical to `main`'s generator. Looked at: contact sheets of a river day (water with an island and bridges) and of a yard ending (the yard with trains and switch lanes, the tracks running on into the boss airfield's apron).

**The dockyard (built, second part of 12.7).** Found after the first part: the generator's side harbour already has a shipyard (slipways with `hull` ships, an unfinished hull drawn as keel ribs, under gantry rails) but skips it in the corner form the city uses. So the dockyard was composition, not new art. `CityGen` `cityFromSegs`: a `harbour_dock` stretch (or the `dockyard` param) sets `coast.yard`, which turns the shipyard on in the corner form and keeps the piers to the first half of the side, so there is room: all of 24 plans have three hulls on slipways and two gantries (before the pier change 4 of 6 had any). `harbour_dock` takes the harbour's place: the kit opens with the plain harbour or, in 35 % of the days, the dockyard (`openers`, `openerShare`, its own hash stream, as the two endings). Looked at: the plain harbour and the dockyard from one seed side by side: the dockyard has three hull frames on slipways in place of part of the warehouse quay; it is distinct but small, and a person should judge whether it reads as a shipyard. Not new art: if a stronger look is wanted (a dry dock with a ship in it, bigger hulls), that is the pixel-art job after all.

**Checked after the dockyard.** `tests/compose.mjs` 65 (gate 2 on 150 city lists, plan 180 ms median alone, 299 ms at p95; under load 256 ms, over the 225 ms limit, which is contention); `tests/dials-probe.mjs --kit city`: 250 drawn days, 0 flagged, 0 over the limits; `tests/daily.mjs` 299; flight gate on 16 city sorties on all difficulties (7 with the dockyard, 5 with the yard): all pass; vetting 14 of 14; Campaign guards unchanged (`tests/citysegs.mjs`, `tests/citygen.mjs` 56, `tests/enigma.mjs`, `tests/fixed-seed.mjs`, `tests/replay.mjs`, `tests/smoke.mjs`; the older kits' composed plans identical to `main`'s generator).

### 12.8 The city's encounters (step 5.7, the city's part; build 1.2.6.49, composer v5)

**Done (owner: "create new encounters based on the existing patterns").** The city kit now schedules a set piece in each stretch that can hold one (`KITS.city.enc`): the Campaign's level 6 loop's three, reused where the ground is the same (`harbourraid` in the harbour, `cityflak` in the city centre, `stationrun` at the main station), and **four new ones on their patterns, from the existing verbs only**, one for each structure the kit added (`index.html`, after `ENC.stationrun`; nothing in the Campaign refers to them):

| Encounter | In | Pattern | What differs |
|---|---|---|---|
| `dockraid` DOCKYARD RAID | `harbour_dock` | `harbourraid` | patrol boats first, a dive wave, a bomber, then the destroyer on the harbour water (the raid opens with the destroyer), dives from the sides |
| `bridgestrike` BRIDGE STRIKE | `city_river` | `cityflak` | a formation each side in turn, the bomber before the tankers, a late dive |
| `worksstrike` WORKS STRIKE | `industrial_power` | `cityflak` | guns among the sheds, one formation, tankers, then the bomber |
| `yardbreakout` YARD BREAKOUT | `rail_yard` | `stationrun` | three tanker chains and two convoys beside the tracks, dives and a bomber |

The composer places about 2.8 encounters per city sortie (each takes about 7 chunks and 2 of rest, and the Shadow Wing takes its own; an encounter with no room in its stretch is left out, which is why the bridge strike, in a 5 to 7 chunk stretch, is the rarest: 43 of 400 lists).

**Checked.** Flight gate on 24 city sorties on all three difficulties: all pass; every one of the seven encounters ran and ended `done` in the flights (harbour raid 18, dockyard raid 12, city flak 17, bridge strike 3, works strike 10, station breakout 16, yard breakout 14 flights); `tests/daily.mjs` 299; vetting of the 14 dates 14 of 14; Campaign guards unchanged.

**Not done.** The new encounters are timelines of existing verbs, so they play like their patterns with other numbers and order; nothing is new in what a verb does. Nobody has played them. The bridge strike is rare; a longer river stretch would give it room.

### 12.9 Boss variation, first step: the framework and the city's four forms (build 1.2.6.49, composer v5)

**What is built.** The game's boss is no longer only the theme's. `run.sortie.bossVar = { kind, variant, lance, hpK }` (from the composer; absent for the Campaign and for kits without it) is read in two places: `spawnBoss` (the kind, and `hpK` as a factor on the hit points) and `bossLance()`, which the three boss sites that used to test the loop's `haze` flag now ask (the sky lance's AI, the folded pods under the wing tips, their drawing); `haze` itself still means the loop's look and harbour as before. In the composer a kit may have `bosses` (a list of forms with weights); `bossFor(kit, base)` draws one on its own hash stream (6600) and gate 1 checks it is one of the kit's (`S.bossVar`; `S.boss` stays the trigger rule `{ add }` or `{ yard }`). The Campaign's level 6 boss is untouched (checked: same fortress, no pods, the same hit points as the plain form).

**The city's four forms** (all the sky fortress, which flies over any ground):

| Form | Weight | What it is | Bot's fight (Rookie / Veteran / Ace, median seconds) |
|---|---|---|---|
| plain | 3 | as in the first pass | 94 / 144 / 130 |
| lance | 3 | the first loop's twin lance pods and sky lance (existing code, behind the loop's last act) | 150 / 147 / 209 |
| heavy | 2 | the lance form with 15 % more hit points | 156 / 155 / 173 |
| light | 2 | 35 % fewer hit points, no pods | 57 / 62 / 87 |

The first heavy was 40 % more and took up to 5.5 minutes on Ace for a bot that never dies; with the pods already adding a minute it is now 15 %. The two lance forms are close in length: heavy is, so far, a lance fight with a little more to shoot.

**Checked.** `tests/daily.mjs` 306 (new section 11, 7 checks: each form is recorded and spawns a sky fortress without errors, pods 0 / 2 / 2 / 0, hit points x1 / x1.15 / x0.65 against the plain form, the Campaign's level 6 boss unchanged); flight gate on 24 city sorties on all three difficulties (72 flights; 9 plain, 6 lance, 5 light, 4 heavy): all pass; `tests/compose.mjs` 65; Campaign guards unchanged (`tests/citysegs.mjs`, `tests/enigma.mjs`, `tests/fixed-seed.mjs`, `tests/replay.mjs`, `tests/smoke.mjs`).

**What this is not.** These are one boss in four tunings, two of them (lance, heavy) a fight that already existed in the Campaign's loop; none is a new behaviour, and the owner's list (12.4) goes much further: the ship boss on any water, the sand fortress on any open ground, the castle in per-climate versions, the train on any track (now possible on the yard ending, whose tracks reach the arena), the Moth with a stronger blinding attack, the Raven mid-level, the Shadow Wing as a boss. Each of those needs its own arena rule and ground check; the framework above (a `bossVar` per kit, a draw on its own stream, a spawn that reads it, the flight gate flying every form) is what they plug into. Not done for the city: the other bosses on its grounds (the ship on the harbour water, the train on the yard's tracks).

### 12.10 Boss variation across kits (build 1.2.6.49, composer v5)

**The probe (`tests/daily-gate.mjs --boss KIND`, new).** The flight gate forces a boss kind after the level starts, so the bot flies to it and fights it. All six bosses (ship, train, sand fortress, supergun, castle, sky fortress) on all four kits' arenas, two sorties each: **24 of 24 pass** (the boss fights, dies, the level ends, no errors). So the game's boss machinery does not depend on the ground; what differs is whether a boss *belongs* on it. Every kit's end ground is its level's own legacy boss arena (the city's airfield apron, the desert's sand, the forest's grass with its central rail, the winter's snowy rail yard), seen in a screenshot of all 24: the sky fortress and the land fortress fit all four; the train and the supergun run on the central rail at x 112, which the forest and winter arenas have and the desert and the city arenas do not; the ship needs water and no arena has any; the castle needs its own ground (it spawns 1,100 px up the map, in world coordinates, on the castle ground only).

**Built: a boss pool per kit** (`bossPool`, `KITS[kit].bosses`; one draw per date on its own hash stream; gate 1 checks the draw is one of the kit's): the kit's own boss and forms of it (about half the days), then the others whose arena fits.

| Kit | Own boss and forms | Others (arena fits) |
|---|---|---|
| desert | sand fortress: plain, heavy (x1.2), light (x0.7) | sky fortress: plain, lance, light |
| forest | castle: plain, heavy, light | land fortress, sky fortress (plain, lance), train, supergun |
| winter | train: plain, heavy, light | supergun, land fortress, sky fortress (plain, lance) |
| city | sky fortress: plain, lance, light (x0.65) | land fortress: plain, heavy |

The forms: heavy and light are a factor on the hit points; **lance** is the first loop's twin lance pods and sky lance on the sky fortress (existing code, now behind `bossLance()`, not the loop's `haze` flag). Not in any pool yet: the ship (no water), the castle outside the forest (no other climate's castle), the train and the supergun on the desert and the city. In the game: `run.sortie.bossVar` ({ kind, variant, lance, hpK }) is read by `spawnBoss`, `prewarmBoss` (the sprites) and `bossWarn` (the banner) and nothing else; the Campaign has none and its bosses are untouched.

**Checked.** `tests/compose.mjs` 67 (new: every kit draws only its pool and every entry of it in 3,000 draws); `tests/daily.mjs` 301 (section 11: all 29 pool entries, each on its kit's arena, spawn the right boss with the right pods and hit points, alive after 4 s, no errors; the Campaign's level 6 boss unchanged); flight gate on 18 sorties per kit on all three difficulties (216 flights, drawn bosses): **0 fail**; vetting of the 14 dates; Campaign guards unchanged. Boss fights, the bot's median seconds: sky fortress plain 90 to 124, lance 117 to 151, light 61 to 88; land fortress 53 to 99; castle 100; train 46 to 54; supergun 43 to 45. A lance form with 15 % more hit points took up to 5.8 minutes on Ace for a bot that never dies and was dropped.

**What this is not, and what is next.** This is the bosses that need no new arena. The owner's table (12.4) also wants: the ship on any water (needs a kit to end at sea: an `open_sea` ending the generators do not have, except level 1's), the castle in desert, winter and level 1 versions (new art), the train as one bigger train on one track, the Moth with a stronger blinding attack, the Raven prototype mid-level in place of a Wing, the Shadow Wing as an end boss, and a smaller sky fortress that is the Raven's hull. The train and the supergun on the city need a central rail in its arena (the yard ending paints two outer tracks at x 55 and 169). Not looked at in motion beyond the bot: a person should fly the cross-kit pairs (a supergun on the forest's rail, a sky fortress over the desert).

### 12.11 The ship boss and the sea ending (build 1.2.6.49, composer v5)

**Done (owner: "the ship").** The ship needs water, and none of the four kits' end grounds has any. The Campaign's level 1 ends over open sea with legacy ground: a `coast_down` stretch, then `open_sea`, and the arena goes on as sea (`S.seq`). So a composed sortie that draws the ship gets a **sea ending**: after the plan's own stretches the composer appends two *legacy* stretches, `coast_down` (1 chunk) and `open_sea` (6), which the game paints as it paints level 1's, and the arena past the end is sea (`S.arenaSea`). The plan (the generator's input) covers only the land part: `S.planC1 = S.len - S.legacyTail`, in every composed plan builder (a Campaign level has no tail, so nothing changes for it).

**Composer.** `kit.seaTail` (desert, forest, city; not the winter, whose arena is its own gorge in its plan); the boss is drawn first (its stream, 6600) and a ship adds the tail to the list; the ship's pool entry excludes the city's rail-yard ending (the yard's tracks run on into the arena and would end in the water); `bossFor(kit, base, ap)`. Stretches carry `legacy: true`; `S.legacyTail`, `S.arenaSea`; gate 1 checks the tail is the kit's, contiguous, and that the length adds up; the plan checks (`tests/kit-check.mjs`) leave the legacy stretches out (the plan has no rows for them). The ship is in the pools of the desert (about 9 % of days), the forest (9 %) and the city (11 %).

**Looked at:** contact sheets of a ship day on each: the desert's sand and railway meet a coastline and open sea; the forest's wood meets a rocky shore; the city's town and its airfield perimeter give way to the sea. The coast is the Campaign's own legacy coast, a clean line.

**Checked.** `tests/compose.mjs` 67 (gate 1 on 10,000 seeds per kit with the tail, gate 2 on the plan without it); `tests/daily.mjs` 301 (section 11: every pool entry on its kit's arena, now including the ship); flight gate on 30 sorties each for the desert, forest and city on all three difficulties (270 flights, 11 of the 30 sorties per kit-draw with a ship): **0 fail**; the ship fights took the bot, median seconds on Rookie / Veteran / Ace, 59 / 47 / 90 on the desert's sea, 64 / 60 / 59 on the forest's, 77 / 53 / 119 on the city's (worst 143); vetting of the 14 dates 14 of 14; Campaign guards unchanged (`tests/citysegs.mjs`, `tests/enigma.mjs`, `tests/fixed-seed.mjs`, `tests/replay.mjs`, `tests/smoke.mjs`; the older kits' plans identical to `main`'s generator).

**Not done.** The winter has no sea ending (its arena is its own gorge, and its ice sea is an opener); a ship ending for the first loop's grounds; the ship's own arena features (the Campaign's level 1 has the carrier and the island chain before it: a composed sea ending is a coast and six chunks of open sea). Not flown by a person: the ship after a desert or a city.

### 12.12 Ending scenes that can be exchanged (owner idea 2026-11-18; a list, nothing built)

Owner: the winter can also have a harbour with open water and the ship boss instead of the gorge, or a scene with six submarines coming out of the ice as at the start of level 5. This is the list of everything that could be a Daily Sortie's ending. Cost: **R** = reuse, only a pool entry and an arena rule; **V** = a variant of existing code; **N** = new behaviour or art. "Ending kind" = what ends the level: a boss's death (what the game does today), or a new rule (a pack is dead, targets are down, a timer runs out, the player reaches a line).

**A. Existing bosses on new ground**
1. Ship on the winter's frozen harbour (a `harbour_winter` stretch: the city's dockyard grammar on snow, then an `ice_sea` tail from level 5's pack): R/V.
2. Ship on a river mouth, a lake (forest) or a fjord with shore batteries on both banks: V.
3. Train on any rail ground; the sand fortress on any open ground; the castle per climate (desert, winter, level 1 versions): R, castle N (art).
4. Supergun on the city's central rail, or on a cliff rail in the mountains: V.
5. Sky fortress over a cloud layer, over the sea at dusk, over the burning city: R (the ground is the look).

**B. Existing bosses with a twist**
6. Two small trains in convoy, or one train that splits in two halves: V.
7. Flagship with a destroyer escort; flagship that launches planes (a carrier); flagship at night with searchlights: V.
8. Icebreaker flagship (the ship, white, with a ram that cracks the ice into holes the player must not fly over: the hole decals exist): V.
9. A fortress that rebuilds one part; a sky fortress with a shield part that has to be shot first: V.
10. A boss that appears in two stages: the train, then the supergun behind it on the same rail: V.

**C. Mid-level foes promoted to the end**
11. The Shadow Wing as the end boss (several, in a V formation): V.
12. The Raven prototype as a duel, a smaller sky fortress: V (the hull exists in `RAVEN`).
13. The Moth with more hit points and a stronger blinding attack (decided, 12.4): V.
14. The Sower as the end: a mine-laying boss over the forest whose mines make the arena a field: V.
15. A bomber stream with fighter escort (`BOMBER_E`, the bomber screen) that has to be stopped before it reaches a line: V.

**D. Pack and wave endings, no single boss (a new ending kind)**
16. Six U-boats break through the ice, one after another (the level-5 opening, `plan.iceBreaks`), the last one a larger boss submarine: V, new ending kind "N dead".
17. A destroyer squadron in line abreast over open sea; a minefield sea with minelayers: V.
18. A tank column on a long road with a command tank at the end; an armoured river convoy: V.
19. A flak lane finale: a long gauntlet of guns with a command post at its end: V (`flaklane`).
20. Airbase last stand: the bombers on the apron take off in waves; shoot them while they roll: V.

**E. Set pieces with a target, not a fight**
21. Dam: break the dam, the flood runs over the ground ahead and the level ends at the wave's crest: N.
22. Bridge defence: the last bridge has to stay up while the player fights a column: V.
23. Refinery or power plant meltdown: chain explosions on a timer, fly out through the gap: V (`refineryraid`).
24. Dockyard: a ship still on the slip launches half built and has to be sunk before it floats clear (ties to the city's dockyard): N.
25. Rocket silo: shoot the covers and the rocket before it climbs: N.

**F. Escapes and chases (the level ends at a line, not a kill)**
26. Collapsing ice shelf: cracks run behind the player, the open sea ahead: N.
27. Avalanche or sandstorm wall chasing from below the screen; the exit is a pass: N.
28. Canyon or tunnel run to the finish with a boss at the mouth: N.

**G. Odd ones for a "surprise" day**
29. Ghost ship in fog (only lit by its own guns and the player's tracers): N.
30. Rival ace in a plane like the player's, mirroring its moves: N.
31. Giant crawler (a desert land ship on treads) or an ice leviathan under the pack that surfaces in rings: N.
32. Dusk and night versions of any of the above (the light of day already exists; the ending would reuse it).

**What each needs in the composer.** The kit's end ground (an `ice_sea` for the winter), a pool entry with an arena rule (what ground it needs), the `bossVar` (kind, variant) or, for D to F, a new `ending` field the game reads in place of "the boss died". Items 1, 3 to 5, 11 to 13 and 16 are the cheapest; the winter harbour (1 and 16 together) would give the winter a sea ending like 12.11's, with the ship or the six U-boats drawn as its two new pool entries.

### 12.13 Endings built from the 12.12 list (build 1.2.6.49, composer v5; flown by the test bot, **not by a person**)

**Winter sea ending (items 1, 2, 16 together), reworked as a freight harbour.** The winter's plan normally ends in the gorge (the generator's `finale`). A sea ending replaces it with the finale `depot` (`KITS.winter.seaParams`, `seaApproach`, `seaTail`): the approach runs three chunks longer (`[pass 7, farmland_winter 14]`), the plan ends in a harbour and the legacy tail is open sea only (`[open_sea 7]`, no legacy coast: the plan's own basin meets it). The first version only switched the gorge off and left the generator's throat, so a fan of eight tracks ran into the sea (the owner: "looks very bad and makes no sense"). Now two lines come out of the tunnel portals and a loading siding leaves the second (three tracks, no fan); they pass a yard (platform with a goods office, freight sheds, a warehouse, a block of containers, flak lots, coal heaps) and run on over the quay's apron onto a rail pier with buffer stops. The quay: a concrete apron with a crane track along its edge and cranes, two wooden finger piers (planks, a rail each side) with a pier shed, cranes and a ship each, two slipways with a hull on each, two ships and two gantries at the rail pier, boats in the basin, quayside warehouses and a harbour master's office, and a breakwater of rubble across the south with a gap for the fairway and a lighthouse at each end. **With and without ice** (`params.harbourIce`, half of the harbours, `KITS.winter.iceShare`): frozen, fast ice along the quay and piers, pack and floes in the basin thinning towards the breakwater, a lead of open water through the gap, the ships frozen in; open, calm water. The last rows are open sea in both, so the arena (the ship, the wolfpack) is open water. The generator code is in `winterLand`'s `finale === 'depot'` branch; `tests/kit-check.mjs` checks 2 tunnel mouths, 3 tracks and no gorge. Flown on 4 sea-ending seeds (open and frozen) on all three difficulties: all pass. Not done: an ice harbour that is also the arena (the wolfpack surfacing through the ice: the arena is the legacy sea past the basin).

**New end bosses, all drawn from the pools** (`bossPool`, one draw per date on its own stream; `S.bossVar.kind`):

| Kind | What it is | Ending rule |
|---|---|---|
| `wolfpack` | six U-boats (the game's `sub`) under the sea of a sea ending, surfacing 85 frames apart at fixed places; the sixth a mother boat with three times the hit points | the last boat sunk |
| `shadowwing` | the Campaign's Shadow Wing in its level's own sequence, which does not flee, with 2.2 times the hit points | the wing's death |
| `raven` | the level 6 duel's Raven prototype in its three phases, which does not escape, 1.3 times the hit points | its death |
| `moth` | the same aircraft with the looped hull (The Moth), its dust cones, 1.8 times the hit points | its death |

All four are a real `boss` entity, so the game's boss code (the warning, the music, the pods, the health bar, the stage clear) and the test tools find them as before: a **hidden core** (1 px, no drawing) that follows what is being fought. Its hit points are the followed enemies' together (the health bar), it sits on the boat that is up and lowest (so the bot's aim and the player's eye go there, and the wreck is where the last one died), and when the last one is gone the core dies and the level ends. The wolfpack and the wing are new `BOSS` entries with `setup` (`spawnBoss` calls it), `BOSSMOVE`, `BOSS_INTROS`, `BOSS_LOOKS` and `BOSS_FIGHT` hooks that do nothing but follow. The wing and the duel aircraft have a `stay` field (no flight after a time).

Pools: the wolfpack is in all four kits' (the winter 2, the others 1; it needs a sea ending), the wing, the Raven and the Moth in all four (1 each). Flown: 18 sorties (winter, desert, city, forest; the ship, the wolfpack, wing, Raven and Moth) on Rookie, Veteran and Ace: all pass (`tests/daily-gate.mjs --kit K --sub N`).

**Not done from the list:** two trains and the other train variants, the destroyer squadron, tank column, flak lane finale, airbase last stand (they need a target-count ending on land ground), the dam, bridge, refinery, slipway, silo and escape scenes, the odd ones (ghost ship, rival ace, crawler, leviathan). The hidden-core boss is the way to build the count-ending ones (a list of enemies, a core that follows them).

### 12.14 The harbour's station, the quay's colour and the wolfpack on ice (build 1.2.6.49, composer v5; flown by the test bot, **not by a person**)

**The station** now uses the generator's own station parts instead of plain sheds: a station hall with a clock tower and a forecourt, a platform with a canopy, a signal box, a goods shed, a coaling stage, a water tower, an engine shed at the end of the siding (with its smoke stack), two wagons parked on the siding (no train runs on it any more), sign posts, a portal crane (a gantry) across the lines and jib cranes by the container block, besides the freight sheds, warehouses and containers of the first version. All are the items the city's and the desert's stations use (`part: 'hall'`, `'tower'`, `'eshed'`, `'watertower'`, `plan.canopies`, `plan.wagons`, `plan.signs`, `plan.gantries`, `plan.cranes`).

**The quay's colour.** The winter's concrete is almost the colour of snow, so the apron vanished. New ground code `K.QUAY` with B -16 (`tools/citygen.js`, the quay's pixel code): dark wet concrete in slabs with joints, a lit stone coping with bollards at the water's edge and a yellow safety line three pixels behind it, whether the water is open or ice. The platform is the station's own (`K.PLAZA`, -5).

**The wolfpack through the ice** (the winter's wolfpack day only; the other kits' wolfpack stays on open sea). The composer draws `bossVar.ice` for it, forces the frozen harbour and asks the generator for `depotArena: 11` chunks (`ICE_ARENA`, in the composer and in the game, `tests/daily.mjs` checks they agree): past the breakwater the sea is one sheet of pack ice (plates, refrozen seams, a few ridges) as the boss's arena, as the gorge was (`S.planC1 = S.len + ICE_ARENA`). The boss is the same hidden-core boss (12.13): the six boats now break up through the ice, one after another. At each place cracks spread over the pack (the Campaign's level 5 break: `ICEBRK`, the `icebreak` decal), the ice bursts into a hole and the boat rises in it; the sixth, **in the middle, is the mother boat**: twice the size (drawn at 2x, a hole 1.9 times the size, a 20 x 80 px hit box), three times the hit points, a fan of seven shells with every volley and two missiles with every second one. The warning reads WOLFPACK BENEATH THE ICE. The first screenshots showed the arena at six chunks too short (the level's end is only where the boss's warning starts: the screen then holds the next eight chunks), hence 11.

**Checked.** Flight gate: the winter's four wolfpack-on-ice seeds and two ship seeds (open and frozen harbours), all three difficulties: all pass; `tests/compose.mjs --kit winter` (36), `tests/citysegs.mjs`, `tests/citygen.mjs`; contact sheets and screenshots of the fight looked at. **Not done:** the ice arena for a ship day (open sea there), a rail-served ice breaker.

**12.14 addendum: the tunnels, the river and its outlet** (owner: the glacier should end as a river and the tunnels be on the side). In the sea ending (finale `depot`) the two lines now come out of tunnels at the *west* foot of the mountain (x 44 and 70) and bend in to the yard (x 96 and 122); the siding leaves the second line once it has settled. The glacier's stream no longer ends between the portals: it runs on as a river out of the mountain foot, bends east across the plain and runs down the east side to the quay, in a bed of gravel and boulders with snow in patches (new ice code B -90; the channel is the stream's own -88). The stream's banks inside the mountain are gentler (26 px of slope instead of 9, so the steep dark rock face that made the stream look black is mostly snow slope) and the water takes the mountain's cast shadow darker than the ground does (a river's -88 pixels under `plan.shadeM`: x 0.58 / 0.66 / 0.82). At the quay the river runs on through the apron in a stone-walled channel (9 px, coping and bollards as the rest of the quay) and empties into the basin, which replaces the east slipway; the crane track along the apron's edge stops at the channel. Looked at in contact sheets (open water harbour); flown on 4 seeds, all difficulties, with the earlier version of this change.

### 12.15 The remaining endings of the 12.12 list that fit the hidden-core boss (build 1.2.6.49, composer v5; flown by the test bot, **not by a person**)

A registry in the game (`FOLLOW`, next to `BOSS_FIGHT`) now makes an end boss from a list of enemies: `spawn(e, sc)` returns the enemies to fight on the arena, and the hidden core (12.13) follows them, takes their hit points as its health bar and dies with the last. Added, each with weight 1 in the pools named:

| Kind | List 12.12 | What it is | Pools |
|---|---|---|---|
| `squadron` | 17 | three destroyers (the middle one with twice the hit points) and four patrol boats on open sea | all four kits (a sea ending, as the ship) |
| `gunline` | 19 | a fortified line: three casemates (the middle one 2.5 times the hit points), two fort guns, two AA towers, two SAM sites | desert, forest, city |
| `tankcol` | 18 | an armoured column: a heavy tank (2.5 times the hit points) and six tanks, dug in | desert, forest, city |
| `tankfarm` | 23 (the part without the timer) | a fuel depot: eight fuel tanks, two AA towers, a bunker; end when the tanks are down | desert, forest, city |
| `airbase` | 20 (without take-off) | parked aircraft on the apron (eight, three times the hit points), two AA towers, a bunker | desert, forest, city |
| `rival` | 30 | a new enemy, an aircraft like the player's flying upside down that mirrors the player's side to side, fires aimed bursts and a fan and dives at the player every eight seconds | all four kits |

The winter's pool takes only the sea (`squadron`) and air (`rival`) ones: its land arena is the gorge. Checked: `tests/daily.mjs` (302: every pool entry spawns, alive after 4 s); flight gate on desert, forest, city and winter, one sortie of each ending and then 40 random sorties per kit on Veteran with the first 8 on all three: 0 failures; screenshots of five of the six fights looked at (desert). **Still not built from the list:** two trains and the train variants (6), the dam, bridge defence, slipway ship and silo (21, 22, 24, 25), the three escapes (26 to 28), the ghost ship, the crawler and the leviathan (29, 31). They need either scroll or terrain events (escapes, dam) or new art; the follower boss does not cover them.

### 12.16 The rival ace and the moving ground units (build 1.2.6.49, composer v5; flown by the test bot, **not by a person**)

**The rival ace** (`ENT.rival`): it now fires with the player's own weapon (`player.wpn`): Scatter a wide spread, Lance fast straight shots in fours, Seekers two homing missiles, Arc a ring; it leads its aimed bursts by the player's smoothed side-to-side speed (it aims where the player is going, not where it is), and it calls two wingmen (`waveDive`) at half of its health and two more from the other side at a quarter. It smokes harder under 30 %. Still mirrors the player's side to side and dives every eight seconds.

**Moving and reacting ground units** (`FOLLOW[kind].tick`, run every frame by the hidden core's tick): the **armoured column** advances on the player and falls back in a slow cycle (30 px, the heavy tank 45; the treads turn); a **fuel tank** that goes up sets its neighbours within 48 px off (55 % of their hit points and an explosion), so a depot can be cleared by a chain; every five seconds one **parked aircraft of the airbase** taxis and takes off and becomes a fighter that turns back on the player (the boss list takes the fighter's place, so the level does not end while it lives).

**Checked.** Flight gate: the column, depot, airbase and rival on the desert, the rival and airbase on the forest and the city, the rival on the winter (10 seeds, all three difficulties): all pass; screenshots of the rival fight (shots, wingmen) and the airbase looked at; `tests/daily.mjs` run after. **Not done:** the gun line's guns still do not move; the airbase fight is short against the bot (it destroys the parked aircraft before many have taken off) and needs a person's judgement.

**12.16 addendum: the rival's aircraft** (owner: any player skin, never the player's own). The rival is drawn as one of the game's eight player skins (`rivalSet`: the Feuervogel, Schneevogel, Swallow, Phoenix, Robin, Raptor, golden Rooster, Falke), whether the player owns it or not, upside down; `rivalSkin()` takes the day's seed to choose among the seven others (the one the player flies is left out, and the Rooster too when a second player has it), so two players on the same skin meet the same rival. Looked at: all eight skins drawn as the rival; 40 seeds never drew the flown skin.

### 12.17 The supergun in the winter gorge, and the new endings' length (build 1.2.6.49, composer v5; flown by the test bot, **not by a person**)

**The supergun cannot stand in the middle of the winter's gorge** (owner, from a screenshot): the supergun's rail is the central one (x 112), and in the gorge the middle is the chasm with the river, with no track. `gorgeRailX` (`spawnBoss`) now puts it on one of the four viaduct tracks (x 36, 68, 156, 188): the one with the fewest rows of gallery roof over the screen, the inner two first, so it can be shot; `BOSS_FIGHT.railgun.shielded` makes its parts unhittable under a gallery, as the train's are. The first screenshot after the change: the Night Hammer rides the left viaduct's inner track beside the chasm. Flown on the winter's supergun day on all three difficulties: pass.

**The new endings were far too short against the bot**: the squadron, gun line, column, depot, airbase and Raven took 3 to 9 seconds and the wolfpack 14, against 40 to 106 for the old bosses. Their hit points are now higher (`FOLLOW[kind].hpK`: squadron x8, gun line x6, column x10, depot x5, airbase x5; the wolfpack's boats x3.5, the Raven 7 instead of 1.3, the Moth 4 instead of 1.8, the Shadow Wing 4 instead of 2.2). Bot's seconds on Rookie / Veteran / Ace after: fortress 35 / 40 / 46, sky fortress 125 / 106 / 152, castle 87 / 83 / 106, train 73 / 66 / 62, supergun 66 / 76 / 90, ship 45 / 50 / 47, wolfpack 41 / 58 / 108, squadron 38 / 37 / 42, Shadow Wing 66 / 67 / 91, Raven 58 / 49 / 76, Moth 45 / 60 / 40, rival 24 / 47 / 25, gun line 38 / 37 / 78. The rest are in the next measurement.

**12.17 addendum (second measurement).** The depot, airbase, column and the rival were still short (24 to 37 s; the column 25 on Veteran), so: depot x8, airbase x8, column x14, rival 1.8 times the hit points. Bot's seconds on Rookie / Veteran / Ace: rival 57 / 64 / 71, column 105 / 37 / 48, depot 39 / 55 / 61, airbase 39 / 33 / 39. All sixteen endings are now between 33 and 152 seconds for the bot (the old bosses 35 to 152). The bot is a better player than most, so a person's fights will be longer; the next measure is a person's.

### 12.18 The supergun's own icy gorge (build 1.2.6.49, composer v5; flown by the test bot, **not by a person**)

Owner, on the viaduct version of 12.17: "this doesn't work: we need a different gorge with two tracks in the middle for the Night Hammer, similar to the night hammer stage but in an icy environment." The supergun is the level 3 boss and its rails are two lines in the middle (x 93 and 131), which the winter's gorge (viaducts at x 36 to 188, chasm and river in the middle) does not have. So the viaduct placement (`gorgeRailX`, `shielded`) of 12.17 is **removed**, and the winter's supergun day gets its own arena: the generator finale `railgorge` (`winterLand`; `params.finale`, `params.railArena`, the composer's `bossVar.rail`, `RAIL_ARENA` = 11 chunks in the composer and in the game): the two lines come out of tunnel portals at x 93 and 131 and run straight on through the arena, a narrow gorge with a snow floor about 100 px across between rock walls (heights up to 78 px that the generator turns into snow slopes and bare rock, with cast shadows), as the level 3 stage but on snow. The world stops when the supergun comes (as for the wolfpack's frozen arena: the arena is 11 chunks of plan, not the Campaign's endless ground). The winter's other bosses still end in the Campaign's gorge (the train and the others) or at sea. Checked in contact sheets and screenshots of the fight (the Night Hammer on the two tracks in the gorge); flown and `tests/compose.mjs` / `tests/daily.mjs` run after. **Not done:** the flak trains on the arena's extra tracks that level 3's fight has; a river or ice patches on the floor.

### 12.19 New art endings, the land endings' own ground, and a look at the winter harbour (build 1.2.6.49, composer v5; flown by the test bot, **not by a person**)

**Three endings with new art** (drawn in code, as the game's other sprites; each a boss on the hidden core, 12.13):
- **The ghost ship** (`ghost`; all four kits, a sea ending): the flagship's own sprite tinted ghost-green with holes in the hull (`SPR.ghostShip`), in drifting fog (twelve blobs of fog in front of it), lanterns on the hull. Seven seconds solid (aimed salvos from four guns, a fan), then it fades and cannot be hurt while it sweeps sideways and sends rings of slow spectral shells and two missiles, then comes back.
- **The sand crawler** (`crawler`; desert, a land ending): a tracked war machine, four tracks, plated hull, ram, rear ramp, AA mounts, a turret that aims (`SPR.crawler`); rolls slowly across the screen in a cloud of dust, fires triple shells, drops a ring from the hull, faster at half its life, and its rear ramp drops two tanks every twelve seconds.
- **The ice leviathan** (`leviathan`; winter, on the frozen arena of the wolfpack): a whale-like monster with dorsal plates, flippers, a tail fluke and a maw (`SPR.leviathan`). It moves under the pack (chips, a dark bulge), the ice cracks and bursts in a large hole (the wolfpack's break, 2.3 times the size), it rises, fights for seven seconds (a fan of ice shards, a slam that sends a ring) and dives to come up elsewhere.
Hit points set so that the bot's fights last 50 to 180 s (ghost 1,400, leviathan 1,500, crawler 2,300 times the hit-point factor).

**The land endings' own ground** (owner: they sat on the plain boss ground): `arenaScene(kind)` paints a backdrop onto a canvas and lays it as a decal under the enemies. The gun line: a zigzag front trench with firing steps, a second trench, communication trenches to the casemates, pits for the fort guns, SAM pads, sandbags and three rows of barbed wire. The airbase: an apron of concrete slabs with hardstands and yellow taxi lines, two hangar roofs and a runway across the bottom (edge lines, centre dashes, threshold bars). The column: scraped pads with berms and track marks, a line of spoil. The depot: a concrete pad with a ring berm round each tank, pipes and a manifold, a loading rack and a fence.

**The winter harbour looked at as a player sees it** (the contact frames at 3x): the quay's dark apron, the yellow safety line and the river's outlet read well on open water and on ice. Fixed on that look: the station forecourt was the checkered square paving (now the platform's paving), and the bare rock beside the stream was black. In the harbour and gorge finales (`plan.softRock`) the darkest rock is a dull grey, and the stream's banks rise at 1.45 px per px (snow slopes, not a rock face). The river bed's dark speckles were cut to a seventh. **Not done:** a person's look on a real phone and in motion.

### 12.20 The temperate kit, shared pieces, castles and trains (build 1.2.6.49, composer v5; flown by the test bot, **not by a person**)

**Task 1: the temperate (level 1) kit.** `KITS.temperate` (preset `islands`, level 1). **Adding a kit changes every date's kit** (the rotation is now desert, forest, winter, city, temperate; 2026-11-17 is the first temperate day), as 12.6 recorded for the city; `VERSION` stays 5 while the build is unreleased.
- **Generator:** the `islands` preset reads a segment list (`params.segs`, tools/citygen.js). Stretches `island_chain` (the Campaign's mix: a farm islet, one with houses, gun islets, rocks), `island_fortress` (new: four or five rocky islets with a bunker, two flak pits and up to three casemates each, type `fort`) and `island_archipelago` (new: eight to ten small islets, homes, lanes, lighthouses, rocks) become bands of islets, each with its own warships' lane; `island_airbase` is the large island (village, farm, wood, pond, airbase, jetty; 620 px from the start of its stretch). The plan's length is the sum of the stretches. Without `params.segs` nothing changed: the Campaign's islands plans hash identical (3 seeds, tiles and slots) to the previous generator. Per-band dials `count` (-2 to 2 islets) and `size` (0.8 to 1.25), `ISLES_DIALS`; whole-level dials `bigW` (165 to 210: at 150 the airbase found no room in 9 of 60 plans) and `lane`. Two flaws the plan checks found: the fallback flak pit (a 12 px pit in a 9 px search) overwrote a farm's barn, and fortress pits were placed without a free-rectangle check; both fixed for segment lists only.
- **Composer:** opener `carrier_start 4`, `open_sea 6`; middle chain (at most 2), fortress, archipelago (once each), the large island (required, once, followed by open sea), open sea (at most 3); approach `open_sea 3` (plan 30 to 42 chunks). **The old land after the plan** is level 1's legacy ground (`kit.legacy`, `legacyWalk`, its own hash stream 6800): `beach_fortified 3`, then a walk over farmland (6 to 10, at most 2), village (3 to 5), deciduous wood (3 to 5), then `coast_down 1`, `open_sea 4` (20 to 30 chunks). Every temperate sortie therefore ends over open sea (`S.arenaSea`), and gate 1 checks the old land's grammar (`checkLegacy`). Boss pool: ship (4), sky fortress (plain 2, lance 2, light 1), squadron, wolfpack (2 each), ghost ship, Shadow Wing, Raven, Moth, rival; no land ending, because the arena is sea.
- **Game:** `sortiePlanIslands` takes the composer's generator input; the level 1 start banner is the Daily banner for a daily (it used to be "LEVEL 1 ... ENIGMA RUN", and its early return skipped the daily one); the submarine's place (`subChunk`) is the first band of islets. Everything level 1 does on its own (the carrier take-off, the dug-in heavy tanks, the Buechse at the road's tip, `seaOK`) works on the composed plan unchanged.
- **Encounters:** `firstcontact` (in 45 % of the days: it lasts 2,760 frames, the take-off holds it, not the 1,364 the composer first assumed, which made the next encounter be skipped), `anvil` and `formations` in the old land's farmland, and two new ones on the pattern of FIRST CONTACT (existing verbs only): `fortstrike` FORTRESS STRIKE (a destroyer and a patrol boat, dives from both sides, a bomber) in the fortress band, `reefpatrol` REEF PATROL (two patrol boats, sweeps from both sides, a formation, the strafers) in the archipelago.
- **Checked.** `tests/compose.mjs` 77 (gate 1 on 10,000 seeds, gate 2 on 300 lists: 299 of 300 clean before the `bigW` floor, all clean after; plan 50 ms median, 94 ms p95); `tests/dials-probe.mjs --kit temperate`: every dial reaches the plan, 60 drawn days 0 flagged; flight gate on 40 sorties on all three difficulties (120 flights): 0 fail, both new encounters ran to `done` (fortress strike 27, reef patrol 48 flights); `tests/daily.mjs` 341 (the rotation dates, the banner, the boss-pool probe now clears the carrier scene first: it deletes the ships and boats it sails over); `tests/citysegs.mjs`, `tests/citygen.mjs`, `tests/enigma.mjs` 213, `tests/fixed-seed.mjs` 41, `tests/smoke.mjs` green. `tests/replay.mjs` reports 13 changed checks on `main`'s previous commit as well (the golden does not describe the current game, `ARCHITECTURE.md`), so it is not a gate here. A baseline of the Campaign's level 1 for the gate's low/in/high marks was flown (`tests/daily-baseline.mjs --levels 1`). Looked at: a contact sheet of a temperate day (carrier sea, the large island, fortress islets, the archipelago, the old land's coast and farmland).
- **Not done:** the lagoon harbour (a harbour island with a basin and quay; the generator has the parts, but a ring island with a basin inside is a new shape: left for the owner's call); level 1's loop ground beyond the burning church (`LOOP_PARAMS.temperate = { burn: true }`); not flown by a person.

**Task 2: shared pieces (decision 12.4, point 2).** Three pieces, each used outside the kit it was made for, each with its own plan check:
- **The dockyard in the desert port.** `harbour_dock` is a second opener of the desert kit (30 % of the days, `openers`, `openerShare`), the city's side harbour with its shipyard (three hulls on slipways under two gantries) along the desert port's end quay (`sandSea`, `coast.yard`); the city's `dockraid` encounter runs in it. Gate 2 checks the hulls (`needs: harbour_dock: 'hull'`). Looked at in a contact sheet: the slipways stand on the east edge of the port, small but distinct. **Tried and dropped: the dockyard in the winter's harbour.** The winter harbour's frozen basin (`freezeHarbour`) deletes every ship in the side harbour, shipyard hulls included, and the corner form would need its own ice code.
- **Level 3's town and works ground in level 1's old land.** `city_small` (a town) and `industrial_light` (a light industrial estate with tanks and sheds) as optional stretches of the temperate kit's old land: legacy chunk ground, no generator change. Looked at in a contact sheet (a hard straight seam between the estate and the farmland, as in level 3).
- **Level 3's searchlight airbase** (`airbase_searchlight`: a concrete airfield with a runway) in the same old land. `station_marshalling` was tried and left out: in the legacy ground it looks like the industrial estate (the same biome).
- Not done: islands as an opener of the other kits (the desert's port is joined row on row from two plans; an islets plan would need the same join), the river city's bridges in the forest.

**Task 3: castles per climate.** The forest's castle is Ravenhold: a 224 x 1440 fortress floor, a keep sprite and a live 3D tower (`drawRaven`, `drawKeepTower`), the boss spawning 1,120 px up the map. A climate's castle is the same fortress recoloured pixel by pixel (`CASTLE_SKINS`, `skinCanvas`: stone by brightness along a ramp, the moat's water, moss and warm woods each to the climate's own colours), so the shape, collision and fight are Ravenhold's, and the forest's castle is exactly as it was (`bossVar.castle` absent). `bossVar.castle` = `sand` (a sandstone citadel with a dry moat, desert pool weight 2), `ice` (blue-white stone, frozen moat, snow on the courts; winter pool, 2) or `fort` (whitewashed grey stone, the moat the sea; the temperate kit, 2). The boss bar names them SANDSTONE CITADEL, FROST KEEP, SEA BASTION. They stand on their kit's own arena ground (sand; the winter's gorge; open sea). Looked at in screenshots of the approach and the fight on each. Flown: 12 sorties (4 per kit) on all three difficulties, all pass, the bot's fights 75 to 128 s (the old bosses 35 to 150). **Not done:** an own floor plan per climate (the layout of walls, gates and courts is Ravenhold's); an ice castle on a frozen arena; the first loop's ruin look for the skins.

**Task 4: the long train.** `FOLLOW.longtrain` (the hidden-core registry of 12.15): a locomotive and seven cars (four flatcars with a gun, two ammunition cars, a boxcar) on one rail, the game's own train enemies, so no new art: it drives in at 0.5 px a frame, halts with the locomotive at screen y 215 (the locomotive cannot be hurt before: with it gone the cars stall off the top of the screen, which made the first version unwinnable), then shuttles 25 px up and down; the flatcars fire aimed flak, the locomotive a ring every six seconds; with the locomotive gone the cars stall and the flatcars fire on. Forest (a single rail painted down the middle of the castle road: `bossVar.track`, `arenaTracks`, and the arena ground is 'bossland' instead of 'castle' while there are tracks), winter (its rail gorge, the left of the two lines, x 93), desert and city (rail painted at x 112). Flown 8 forest and winter sorties on all difficulties: all pass, 51 to 127 s. The Campaign's two-train yard boss is not in the desert and city pools: its crossover paths need a yard ground.

**Task 5: a rail on the city's and the desert's arena.** `bossPool` entries may carry `track` (an x or a list of x): the composer sets `S.arenaTracks`, and the existing rail painting of `sortieInfo` does the rest (the desert's arena is the sand ground and takes it as it is; the city's arena is the airfield apron, 'secret' biome, whose painter ignored rails: a composed arena with tracks now types a rail where the track is, `secretType`/`secretColor` step aside). The supergun (`railgun`) takes the pair at x 93 and 131 and joins the desert's and city's pools, the long train the single rail at x 112; neither in the city's rail-yard ending (its own tracks). The rails begin at the arena's first chunk, at the airfield's fence and gate road.

**12.20 addendum: the old land's main road and the airfield's edge (owner, from a contact sheet).** In the temperate kit's built-up old land (`industrial_light`, `city_small`, `airbase_searchlight`) the legacy ground's main road was a wandering ribbon painted over the estate's sheds and the airfield's border a wobbling cut (the chunk-edge wobble, `wob`). Now (only for a sortie with `straight`, which a composed temperate sortie has; the Campaign's level 1 and 3 are untouched): the road is a straight line (`straightMix`, eased in and out over 192 px), in the estate exactly on one of the block grid's 8 px streets (x 128 to 135) and as wide as that street (4 px half width instead of 8), in the town on a street of its 56 px grid (x 112 to 119; the town's road was 28 px wide before), and on the airfield it carries on in the line of the road before it as the taxiway. The edge between two built-up grounds is straight (no wobble); the airfield has a perimeter fence along the edge it shares with the estate or the town (the last five rows of its first chunk), with a gate where the road enters and the rail passing through. The town and the estate no longer follow each other (their grids are 56 and 64 px wide, so their straight roads lie 16 px apart). Looked at in contact sheets at 3x for both the estate and the town.

**12.20 addendum 2: the railway on a street.** The railway (x 14 to 21) ran over the estate's sheds as well. In the temperate old land the estate's and the town's block grids are now shifted 14 px (`GRID_OX`, only for a sortie with `straight`) so that a street column lies exactly on the railway, which is 8 px wide there (`railHit`), the width of the street; the straight road lies on the next street column (x 142 to 149 in the estate, 126 to 133 in the town). Looked at at 7x: the rail in its street, a margin of yard on each side, no shed touched.

**12.20 addendum 3: the two gaps of addendum 2 closed.** (1) The railway had been 8 px wide on the estate's street and 9 px everywhere else (a one pixel step at each border). In a `straight` sortie the whole railway is now 8 px wide (x 14 to 21, rails at 15 and 20, `railHit` and the rail's pixel code), farmland to airfield alike. (2) The legacy ground laid a railway only in the estate and stopped it dead at the town. In a `straight` sortie the town has the railway too (`sortieInfo`, `classify`, `pixelColor`), on its street column, so the line runs unbroken from the coast through the estate or the town to the airfield. Looked at at 6x across the farmland-to-town border and beside the town's blocks: the same width on both sides of the border, the blocks end exactly at the rail's edges.

### 12.21 Generator-made ground for level 1's old land (task 5.3 only; build 1.2.6.49, composer v5; flown by the test bot, **not by a person**)

**Built.** The temperate kit's old land is no longer the legacy beach, farmland, village and wood. The `islands` builder (`tools/citygen.js`) takes four more stretches in a segment list: `main_shore` (a wavy shore, a beach, 2 to 4 bunkers, up to 4 flak pits, casemates behind the surf), `main_farm` (fields of random size either side of the winding main road, farmsteads with paddocks, a pond, poplars), `main_village` (the village preset generated alone and copied in whole, its items, streets, parcels and churches renumbered as `stackPlans` does) and `main_wood` (broadleaf wood in clumps with clearings, flak sites in the clearings). One road (`mxM`) runs through all of them; the village's road is blended to it. Nothing changes without `main_` stretches, so the Campaign's islands plans are as before. Composer: `kit.main` (shore 3, then farm at most 2, village, wood; 16 to 22 chunks, own hash stream 6850, `mainWalk`, `checkMain`); `kit.len` is 28 to 40 for the plan before it; `kit.legacy` is now optional (`pick`: none 30 %, one 45 %, two 25 % of level 3's town, estate or airbase, then `coast_down`, `open_sea 4`). The anvil and formations encounters moved to `main_farm`. **Decision:** an encounter that would still run when the boss comes (one chunk into the last stretch) is left out of the plan, not cut short (`encPlanFor`, temperate only). Gate 2 (`tests/kit-check.mjs`) checks a bunker, fields, a farmstead, wood and a village per stretch; `validate` floods tank routes from the mainland's own shore as well.

**Checked.** Gate 1 on 3,000 seeds, 0 failures; `tests/compose.mjs --kit temperate` passes; gate 2 on 300 lists: 299 clean, the one flag a 2 px house overlap in the large island's village that also occurs with the mainland removed from that list (pre-existing). Flight gate: 4 sorties on all three difficulties and a 30-sortie sweep with 0 failures, fights 35 to 129 s for the bot. `tests/daily.mjs` 341, `citysegs`, `enigma`, `fixed-seed`, `smoke`, `citygen` green with no `--update`. Looked at in contact sheets at 3x (the wood was too dense and was thinned; the village and farmland read well).

**Task 2, first part: the storm Moth (12.4 table).** A second form of the end boss `moth` (`moth:storm`, `bossVar.storm`, `MOTH_FORMS`; every kit's pool, weight 1 against the plain Moth's 1): 1.25 times the hit points (`protoBoss` now reads `bossVar.hpK`; 1.5 made the city's Ace fight 220 s), a third dust attack `curtain` (both rings fan 34 degrees either side of 16 degrees, 170 puffs each, a curtain over most of the screen below it, drawn in the warning too), a dust hit keeps the laser out and the view clouded 420 frames instead of 300, and the wait between sprays is 25 % shorter. Flown: desert, forest, city, temperate, winter, one sortie each on all three difficulties, 0 failures; the longest fight is the city's Ace at 168 s, the plain Moth on the same ground takes 145 s (both over the 35 to 150 s mark: the Moth is long on Ace to begin with). `tests/daily.mjs` 341 (it spawns every pool entry). Not looked at by eye in the fight.

**Task 2, second part: the Raven prototype mid-level (owner decision 12.4 point 5).** New encounter `ravenmid` (RAVEN PROTOTYPE) in place of the Shadow Wing's `wing` on 30 % of the days (`S.ravenMid`, own hash stream 6950, `RAVEN_MID_SHARE`; the Wing's chunk and length are the encounter's, 2,300 frames on the sortie timetable `TT_ENC`, max 3,600). On the Wing's pattern (one big enemy; nothing else starts while it is up, the Sower holds off) and the prototype's own scenes, existing verbs only: `ravenfly` (the old hull's fly-by up the screen, the Campaign's first pass) at t 0, `ravenduel` at t 260 (`spawnProtoDuel` with a `mid` option: 0.75 of the boss's hit points, a stay of 1,500 frames, never the looped pair, no `duelWatch` of the Campaign's story). First version had no `TT_ENC` entry and ended by timeout at 3,600 frames; the gate now reports how the Raven's encounter ended and how many duels spawned (`raven:done/1`). Flown on all three difficulties on desert, forest, winter, city and temperate (sub 11 of 2026-11-18): the encounter ends `done` everywhere, 0 failures; `tests/daily.mjs` 341. Not looked at by eye.

**Task 3, first part: encounter variants for the desert, forest and winter (5.7).** One new encounter each, air verbs only (so they run on any ground and need no placement), on the patterns of REEF PATROL, ICE BREAKERS and OASIS AMBUSH: `dunesweep` DUNE SWEEP (desert, in a `valley`: sweeps from both sides, a leader with wingmen, a bomber, the strafers), `ridgesweep` RIDGE SWEEP (forest, in `forest_conifer`: a dive from each side, sweeps, a bomber, the strafers), `whiteoutraid` WHITEOUT RAID (winter, in `forest_conifer`: two bombers, sweeps from both sides, a dive, the strafers). Flown: 4 seeds each on all three difficulties (36 flights), every one ends `done`, 0 failures; 30-sortie sweeps on the three kits 0 failures; `tests/daily.mjs` 341. Not looked at by eye. The city has seven and the temperate kit five encounters; the three kits above have two or three each. Ground-verb variants (flak lanes, convoys) need placement on the plan and were not tried.

**Task 2, third part: the small sky fortress (12.4 table).** `skyfort:small` (`FORT_FORMS.small`, `bossVar.small`, in every kit's skyfort pool, weight 1): the fortress at 0.75 of its size and 0.8 of its hit points. `skySmall()` scales the drawing (`e.scale`), the parts' places in the fight (`p.ox` and `p.oy`), their hit boxes and the lance pods. Flown: 2 sorties per kit on all three difficulties (30 flights), 0 failures, fights 52 to 164 s (the city's two are over 150 s on Veteran and Ace); `tests/daily.mjs` 341. Looked at in the fight next to the plain fortress: the guns sit on their turrets, the core where it was; the orb's glow is not scaled (a little large).

**The temperate mainland's shore, after the owner's review of contact sheets (12.21 first part, revised).** The bunker pads were bare squares. The shore now takes the Atlantic Wall kit that level 3's beach landing already had (the owner's mockup E), ported into `main_shore`: casemates (`dd` items: bevelled concrete roof, camouflage, a periscope cupola, an embrasure on the sea side, dug into a 2 px mound of earth on the other sides, a gun barrel 3 px thick with a dark muzzle: `plan.barrels` with `thick`), pillboxes and Tobruk pits in turn, Czech hedgehogs in the shallows, mined stakes and wire on the sand, a zigzag fire trench, anti-tank walls and dragon's teeth where the road comes up with a casemate either side, wrecked landing craft, craters, a coastal battery (four big casemates, a trench, a radar dish). The Campaign's beach and every other plan are untouched: the new look is behind the item flag `dd` and the barrel flag `thick`. **Decisions (owner):** a sandy shore (dunes, K.BEACH with Br -13, sand under marram grass, 40 to 50 px inland), flak in designated emplacements (a gun pit in a sandbag ring every 40 to 52 px along the dunes, two more behind the battery), no casemate in another's field of fire (each keeps its mound, its barrel and a margin clear: a keep-clear rectangle, `placed`). Fields now fill every free space big enough (`gapFill`, 18 x 14 at least), also at the wood's thinning ends. Two flaws the plan checks found: an islet's lighthouse could stand on a house (fixed for segment lists only), and `validate`'s tank-reach check had one start (the island's road; now also the mainland's own shore). **Plan time:** the temperate plan is about half again as long, so its baseline in `tests/compose.mjs` is 180 ms (limit 270; was 100) and the median is 114 to 127 ms in Node. Gate 2: 300 of 300 clean.

**Task 4, first part: the lagoon harbour (12.20's "not done", owner's pick on 2026-11-20).** `island_lagoon` (8 chunks, once at most, 25 % of the temperate days, `built` 0.3): a band of the `islands` builder with its own warships' lane at one edge and the ring island in the room that is left (`lside`; radius at most 58 x 78). The island is an ellipse with the usual wobble, from which a basin (0.6 x 0.58 of its radii) and a mouth to the south (0.34 of its width, from the basin's middle down) are cut, so the basin is the game's own sea and the fairway can reach it; a narrow beach (1.5 px). On it (`plan.lagoons`): warehouses (`works` buildings, 22 to 28 x 9 to 11 across the north, upright 11 x 22 to 26 on the sides where the ring is narrow, placed before the paving), a quay (K.QUAY, Br -12, up to 6 px from the water all round the basin, also beside the mouth), concrete (K.APRON) behind it to 15 px, 6 or 7 cranes on the quay with their jibs towards the basin's middle (`plan.cranes`), 3 to 5 ships moored along it (`plan.ships`: freighter, tanker, coaster; the far side across, the sides upright; only on wet cells and clear of each other), a flak pit and a bunker either side of the mouth, a lighthouse on the east mole; two small islets (rock or guns) in the band. Gate 2: the stretch needs cranes (`needs`, `markers`, the lane count includes it). Two slips the first run found: `near()` got a half-pixel y from a shed of odd height (NaN index: no shed or gun placed in 6 of 8 plans), and the paving overwrote the flak pits' lots. Checked: gate 1 on 392 lists, gate 2 300 of 300, five lagoon seeds on all three difficulties (15 flights), a 30-sortie sweep, the five Campaign guards, `tests/daily.mjs` 341: 0 failures. Looked at at 3x (a horseshoe island, quay, cranes, ships and warehouses read as a harbour). **Not done:** a lagoon encounter (no new encounter was written for it), a second quay or a slipway, bigger ships, a look at 5x to 7x; the ring is lopsided (one arm thinner: the wobble), the plan time median in Node is 223 ms against the temperate limit of 270.

**Not done (the rest of phase 5).** Looked at at 3x to 6x, not 7x, for seams (the sand-to-field edge, the village's road at the wood's border). The shore's fire trench still reads as a flat tan zigzag line, there are no sandbags or camouflage nets, the casemate line is thin after the keep-clear rule (a second, staggered row would add density); no stream or river in the generator farmland; no hedged lanes. Task 2 (what is left: own castle floor plans per climate, the ruin look), task 3 (further encounter variants with ground verbs), task 4 (islands as an opener elsewhere, a winter dockyard, the two-train yard boss), task 5 (the dam, bridge defence, slipway ship and silo endings, the three escapes) were not started. Nobody has played any of this.
