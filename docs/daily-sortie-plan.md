# Daily Sortie: composer plan

Status: plan, draft 1. Phase 0 (evidence) is done: see section 6. Nothing of the composer is built yet. Written for the agent that will build it; the owner decides the points marked **[owner]**.

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

**Still open:**
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
