# Ground variety: lab and composer plan

Draft, nothing built. Written 2026-11-15 after the owner's remark that the Daily Sortie feels too similar to the Campaign (`daily-sortie-plan.md` section 11). Section 11 varies the *rules* (twists) and the *ground set* (flavours). This plan varies the *ground itself*: how the same template looks and lays out on different days.

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
