# Ground variety: lab and composer plan

Phases 1 to 3 built (build 1.2.6.47, composer v4); phases 4 and 5 not started. Written 2026-11-15 after the owner's remark that the Daily Sortie feels too similar to the Campaign (`daily-sortie-plan.md` section 11). Section 11 varies the *rules* (twists) and the *ground set* (flavours). This plan varies the *ground itself*: how the same template looks and lays out on different days.

## 0. Goal and ground rules

- **Goal.** The same segment template (say desert `village`) should not look and lay out the same on two days. Vary density, damage, wear, water, ports, gun slots and the like, drawn from the date.
- **No new art, no new enemies, no new mechanisms.** Only parameters the generator already has, then (later) templates it already has but the kits don't use.
- **Deterministic.** Same date and composer version give the same sortie. New draws use their own hash stream, so the segment list, the encounter plan and the Shadow Wing's place do not move (the invariant flavours already keep: the walk does not read the flavour).
- **Gates first.** Every new parameter range is tested by gate 1 (`check`), gate 2 (structure limits, `built`) and gate 3 (the flight gate) before a date can draw it. A day that fails falls back to a plainer one, as `DAILY_PLAIN` does now.
- **Lab first.** The city lab is outside the game and changes nothing a player has saved. Its tools come before any composer change.
- Rules from `CLAUDE.md` apply: after changing `tools/citygen.js` or `tools/sortie-compose.js`, run `node scripts/embed-citygen.mjs`; `VERSION` in `sw.js` and `index.html` must match.

## 1. What exists (read from the code, nothing run)

- **Composer.** `composeSortie(kit, seed, sub, flavour, twist)` builds `params = Object.assign({}, kit.params, loopParams, { segs })` and `gen = { preset, seed, params }`. The game calls `CityGen.generate(S.compose.gen)`. So anything the generator accepts in `params` can be set per day with no game change.
- **Generator.** `generate()` merges `PRESETS[o.preset]` with `o.params`. Every shaping number lives in the preset table (`density`, `damage`, `damageCurve`, `wear`, `mixVillage`, `portDensity`, `river`, `coast`, `slots`, `industry`, `farms`, `trees`, `lotChance`, `features`, ...).
- **Lab.** `tools/citylab.html` has about a dozen sliders (length, density curve, damage, block length, collector distance, grid share and tilt, vacant lots, trees, church spacing, wear, port density). It has no segment editor and no toggles for `variant`, `autumn`, `lakes` or `joinRoad`.
- **Not known yet.** Which parameters the three whole-level builders (`sandSea`, `ironForest`, `winterGorge`) honour per segment. `wear` is honoured by `sandSea` (`wearGround` in the builder); the generic town path reads `damage` and `damageCurve`; the forest and winter builders are unchecked. Phase 1 settles this.

## 2. Design

### 2.1 Ground dials (the main idea)

A **dial** is one generator parameter with a range per kit. `dialsFor(kit, base)` draws each dial from its own hash stream (`hash(base, 5000 + i)`) and returns an object merged into `params` after the kit's and flavour's. The draw is a pure function of the seed, so resume rebuilds it from `run.daily` (`v` and the seed), and `S.dials` records the values for the report and the rating row.

Candidate dials (each to be confirmed by phase 1; ranges are placeholders):

| Kit | Dial | Placeholder range | Why it should read as different |
|---|---|---|---|
| desert | `wear` | 0 to 0.7 | clean plaster against weathered mud brick |
| desert | `portDensity` | 0.3 to 0.7 | sparse or crowded harbour |
| desert | `damage` | 0.1 to 0.6 | intact against ruined towns |
| forest | `trees`, `lotChance` | to be probed | thick or open woodland |
| forest | `slots` density | to be probed | fewer or more guns on the same ground |
| winter | `damage`, `farms` | to be probed | quiet farmland against a fought-over line |
| all | `density` curve (pick one of 3 to 4 named curves) | named curves | where the heaviest built-up part lies |

Rules: dials never change `segs`; a day draws a subset of the dials (not all at once, so a day stays readable); a share of days draws none (owner's number, see 5); dials never push a segment past `built` (gate 2).

### 2.2 Per-segment dials

Today `params` is one object for the whole level. If the builders can take a per-segment override (`segs: [{ t, n, p }]`), two villages in one sortie can differ from each other, which is the real cure for "the same template again". It needs a generator change, so it comes after 2.1 has proved the parameters work.

### 2.3 Time of day as ground

`timeOfDay` is `day` in every kit. Draw `day`, `dusk` or `night` as a ground setting (not a twist), reusing the grade that Night run already uses. The Night twist then overrides it. Check first how the dusk grade and the bullet halos look on each kit (the Night contact sheets showed the desert reads as dusk, not night).

### 2.4 New templates and kits (later)

The generator has features no kit uses: `oasis` sizes, `desertPost`, `roadside`, `mountainVillage`, `islands` and `longNight` (levels 3 and 6), `portDesert`, `portWinter`. Each is a candidate middle template or a whole kit, with a `follows` row, `heat`, `built`, an encounter list and a flight. That is the largest gain and the largest cost; it stays out of this plan until 2.1 to 2.3 are measured.

### 2.5 Lab tools (no game risk)

1. **Randomise within ranges.** One button draws every dial of the chosen kit from the same function the composer uses (`dialsFor`), so the lab shows exactly what a date would get.
2. **Save and load a parameter set.** Named presets in `localStorage`, with export and import as JSON, so a tuned look can become a preset or a kit's dial range.
3. **Toggles for the loop grounds** (`variant`, `autumn`, `lakes`, `joinRoad`) and a **segment list editor** (add, remove, reorder, length), so composed lists can be looked at in the lab.
4. **Seed sweep sheet.** N seeds for a preset or kit as thumbnails, each marked by the plan checks (`kit-check.mjs` logic: structures share, guns found, encounters placed). The sheet is what the owner reads to set ranges.

## 3. Validation

- **Gate 1** (`check`): add that the dial values are inside their kit's ranges and that `segs` is unchanged by them.
- **Gate 2** (plan checks): fix the `built` and guns-found limits per kit with dials on (the loop grounds needed `groundBuilt`; dials may need the same).
- **Gate 3** (flight gate): `--dials` flag next to `--flavour` and `--twist`. Every kit on a few seeds at the dial extremes, all three difficulties, determinism on every second seed, fresh page.
- **Unit tests:** `tests/compose.mjs` (dials are a pure function of the seed; segments, encounters and Wing do not move with dials; resume reproduces them), `tests/citygen.mjs` (each dial changes the plan and keeps its checks), a new `tests/dials-probe.mjs` (Node only, like `flavour-probe.mjs`: N composed sorties per kit, plain and at extremes, flagged count and plan time).
- **Plan build time.** Forest with lakes already takes 4 times as long in Node; measure the page for every dial that adds work.

## 4. Phases (each ends with a stop point; the owner reads the report)

1. **Probe (no game change).** For each kit: which parameters the builders honour; the range over which the plan checks stay clean; plan build time at the extremes. Report in a section 4.1 of this file, as `daily-sortie-plan.md` 11.6 did. Lab: the sweep sheet (2.5.4) is built here, because the probe needs it.
2. **Lab tools.** 2.5.1 to 2.5.3. Contact sheets of the extremes per kit (`tests/contact.mjs`, `tests/citylab-shot.mjs`). No composer change.
3. **Dials in the composer.** `dialsFor`, `composeVersion` 4 (every board key, saved run and vetting entry is keyed by it; a record of v3 is not resumed, as v1 was not), `run.daily` and `S.dials`, banner needs no change, test link `&dials=` (`off` for none). Tests as in 3. Flight gate with `--dials`. Vetting script flies the date's own dials; its fallback order becomes: new sub-seed, then no dials, then plain flavour, then no twist.
4. **Per-segment dials** (2.2) and **time of day** (2.3), one at a time, each with its own probe and gate run.
5. **New templates or kits** (2.4), one per release, after the owner reads the results of 3 and 4.

### 4.1 Phase 1 results: the probe (`tests/dials-probe.mjs`; nothing in the game changed)

**Method.** For each kit, 3 composed sorties (`hash(s, 9191)` seeds). The same segment list and seed are generated with no dial, then with each candidate dial at a low and a high value. A dial "reaches the plan" when any plan field differs (every raster sampled, every list by length and a sample of its contents; `P` and `stage` are left out, because `P` holds the dial itself and `stage` is not reproducible between two identical runs). The plan checks (gate 2) are run at both values. (An earlier version of the probe hashed too little and then too much; the numbers below are from the third, which gives 0/3 for a dial that is known to be unused.)

| Kit | Top-level parameters that reach the plan | Do nothing |
|---|---|---|
| desert (`sandSea`) | `wear`, `portDensity`, `mixVillage` | `damage`, `trees`, `lotChance`, `farms`, `industry`, `density` |
| forest (`ironForest`) | none | all ten candidates |
| winter (`winterGorge`) | `trees`, `lotChance`, `slots` | `damage`, `farms`, `industry`, `density` |

- **The plan's premise was wrong for most dials.** Section 1 said "anything the generator accepts in `params` can be set per day". True for the preset table of a *town*; the three whole-level builders build each segment from their own tables and read only a few top-level parameters (desert: `wear`, `mixVillage`, `portDensity`, `variant`, `river`; forest: `holes`, `coast`, `autumn`, `lakes`, `roadEnd`, `features`; winter: `rise`, `features`, `variant`, `joinRoad`). The forest's real knobs are per feature (`roads`, `rides`, `plantations`, `clearings`, `cuts`, `guns`), set in the builder's own segment table, not in `params`.
- **Gate 2 at the extremes:** 0 of 3 plans flagged and no stretch over its `built` limit for any dial that reaches the plan, low or high. Three seeds is too few to call a range safe; phase 3 must run it at 100 seeds.
- **Plan time:** winter is about 0.8 to 1.4 s a plan in Node and no tested dial changes it much; desert and forest are about 0.1 s.
- **Consequence for phase 3.** Without generator changes the dials are: desert 3, winter 3, forest 0. To give the forest (and the desert's `damage` and `trees`, the winter's `damage`) a dial, the builders must read it, per segment, from `segs[i].p`. That is the plan's 2.2, and it moves up from phase 4 to phase 3. Every generator change needs `node scripts/embed-citygen.mjs` and keeps `tests/citygen.mjs` and the golden plans (`tests/golden.json`) unchanged when no dial is given.
- **Not probed:** the desert port's hard-coded `damage` and `density` (set in the `sandSea` builder), plan time in the page and on a phone, and how different the plans *look* (needs the contact sheets of phase 2).

### 4.2 Phases 2 and 3 results: the lab and the dials (build 1.2.6.47, composer v4)

**Decision taken after the probe (owner, 2026-11-15):** change the builders, so every kit gets real dials. Per-segment dials (the plan's 2.2) moved from phase 4 into phase 3.

**Generator (`tools/citygen.js`).** A segment may carry `p = { dial: value }`; `groundDials(p, table)` keeps only the dials a builder knows, clamped to the table's range, so a plan without `p` is exactly the plan it was (12 composed plans of both flavours hashed against the previous generator: identical; `tests/citygen.mjs` and its golden plans pass).

| Kit | Dials (per segment unless marked) | Where read |
|---|---|---|
| desert | `damage`, `mix` (the held village's and the open desert's oases); whole level: `wear`, `portDensity`, `portDamage` (new), `mixVillage` | the `sandSea` builder's feature list; the port's sub-plan |
| forest | `roads`, `rides`, `plantations`, `clearings`, `cuts`, `guns` | `ironForestFeatures`, over `FOREST_BASE` (the table that was inline, now exported) |
| winter | `treeK` (a factor on the chance of a tree), `floorW` (px added to the valley floor, eased in and out over 80 px); whole level: `trees`, `lotChance` (the harbour town) | `winterLand` (`tk(y)`, `dial('floorW', y)`) |

**Composer (`tools/sortie-compose.js`, `composeVersion` 4).** `DIALS` per kit (ranges below), `dialsFor(kit, base, segs)`, `composeSortie(kit, seed, sub, flavour, twist, dials)` with `dials` `'on'` (default) or `'off'`; the sortie carries `dials` and `dialNames`. About 80 % of days draw dials (`DIAL_NONE` 0.2; 18.5 % over 400 seeds), two or three of the kit's. Every segment that can take a drawn dial gets its own value, so two villages differ. Forest ranges are the template's own count minus 2 to plus 2 (guns: minus 1 to plus 1, at least 1); desert and winter ranges are in `DIALS`. Gate 1 checks every dial against its range and that a day with dials off has none. `DAILY_PLAIN` has a new first step: 1 no dials, 2 also flavour plain, 3 also no twist; `dailySeed` returns `dials`. In the game: `run.daily` records `dials` and `dailyCompose` passes it back, so resume rebuilds the same ground; the test link takes `&dials=off`. The segment list, the encounters and the Shadow Wing do not read the dials (3 kits x 150 seeds, dials on against off: identical).

**Probe (`tests/dials-probe.mjs`, 8 sorties per kit, 40 draws per kit).** Every dial changes the plan at its extremes (desert `damage` 7 of 8: one sortie has no stretch that takes it). At the lowest and the highest value on every eligible segment: 0 plans flagged and 0 stretches over their structures limit, for all 12 dials. 40 drawn days per kit: 0 flagged, 0 over the limit. Plan time is not changed by the dials (desert 0.1 to 0.3 s, forest about 0.1 s, winter 0.8 to 1.4 s in Node).

**Lab (`tools/citylab.html`).** A Daily Sortie ground panel: kit, flavour (so the loop grounds are a toggle), sub-seed, dials on or off, force one dial to its lowest or highest value, the segment list as editable JSON, "New day", a six-seed contact sheet, and a seed sweep of composed days that reports the plan rules and the structures limit per stretch. A saved-sets panel (browser storage, JSON export and import). The new "plan checks" in the lab are `CityGen.validate` and the structures limit; the other gate-2 checks (each template's own feature in its own segment, the kit's `extra`) live in `tests/kit-check.mjs` and were not ported. Driven in headless Chromium: all three kits, a forced dial, an edited list, a saved set, the contact sheet and a 20-day sweep, no page errors. Found on the way: the committed lab threw on every whole-level preset (a stage timing that is not a number), which stopped `build()` before it refreshed the metrics and the overlay; fixed.

**Flown and checked.**
- Flight gate (`tests/daily-gate.mjs --sweep 6 --all 2 --det 3 --no-bots --fresh`): 18 sorties (15 with dials), all pass; no dead air over 7.5 s.
- Vetting (`scripts/daily-vet.mjs --no-write`): the 14 dates from 2026-11-16, all three difficulties: 14 of 14 pass, none rerolled or made plainer.
- `tests/compose.mjs` (49 checks without gate 2; new section 6b on the dials) and gate 2 on 40 composed plans per kit (clean; desert plan time 120 ms median alone, over its limit only while the machine was loaded by other runs), `tests/citygen.mjs`, `tests/daily.mjs` (220), `tests/smoke.mjs`, `tests/worker.test.mjs` (22).
- **Not run:** the 300-plans-per-kit gate 2 and its shards, the 200-seed sweep, the skill bots on dial days, a phone viewport, `replay.mjs`, `resume-exact.mjs`, the other test files.
- **Not looked at:** the dials in the game itself. Only the lab's contact sheet was seen; whether a day *reads* as different (the plan's last risk) needs the game's contact sheets (`tests/contact.mjs`) on a forest and a winter day with the strongest dials.
- **Not done:** the ratings row does not carry the dials (decision 3 below is open); time of day as ground and new templates or kits (phases 4 and 5).

## 5. Decisions for the owner

1. Share of days with no dials (suggestion: 20 %), and how many dials one day draws (suggestion: 2 to 3).
2. Are the placeholder ranges in 2.1 the right order of size, or should a dial stay close to the Campaign's look? (The lab sheet in phase 1 is what to judge by.)
3. Should a rating row (`/rate`) carry the dials, as it will carry twist and flavour? It adds columns to `schema.sql` and an `ALTER TABLE` for the live database.
4. Time of day as ground (2.3): wanted, or does it overlap Night run too much?
5. Order after phase 3: per-segment dials first (more variety, needs a generator change) or new kits first (larger, needs a flight per template)?

## 6. Risks

- **Interaction with the timetable.** Gun density and damage change where guns and targets sit, and the encounters run on frames. A dial that moves a gun site can leave an encounter without a place (gate 1 catches the plan, the flight gate catches the rest).
- **Vetting load.** Dials add a combination axis to the flavour and twist matrix (3 kits x 4 flavours x 7 twists). The gate cannot fly all of it for every seed; the plan from 11.5 holds (every combination on a few seeds, the real dates in vetting).
- **Hidden shared state.** The winter `loop` flight can differ between a fresh and a used page (section 11.9). Fly dials in fresh pages (`--fresh`), as the gate does now.
- **Plan time on phones.** Not measured for any dial; phase 1 must include a phone viewport run for the heaviest.
- **Looking the same anyway.** If the forest and winter ground differs by one number only, the day may read as the same. The contact sheets decide this, not the parameter list.
