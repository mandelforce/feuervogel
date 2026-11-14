# Daily Sortie: composer plan

Status: plan, draft 1. Nothing here is built yet. Written for the agent that will build it; the owner decides the points marked **[owner]**.

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

(To be filled in by phase 0: the probe table, each kit's grammar, preset limitations and the baselines.)
