# The aged desert

Proposal and first build. The old Enigma Run desert houses (flat plastered cubes, one even tone, straight lines) read as too clean. This replaces that look with houses that are old, patched and lived in, drawn by CityGen's own pixel painter. The game itself is not changed yet: the generator, the City Lab and the tests carry it, and the switch for level 2 is one line (see "Shipping it").

## What it is

One setting, `P.wear` (0 to 1). At 0 every plan is pixel for pixel what it was (checked on 38 plans against the previous generator). Above 0, desert plans get:

- **Roofs** (`agedRoof` in `tools/citygen.js`): plaster in blotches and faded; patches where it fell off and the mud brick shows in courses; two cracks per roof; rain stains under the parapet; a lit edge that is broken up instead of one straight line; chipped parapet pixels that make the outline crooked; a tarp, rusty barrel, plank pile or washing line on some roofs.
- **Lean-tos** (`agedLean`): corrugated rusty sheds built onto the old houses.
- **Ground**: packed earth round every old house (`plan.worn`, dithered into the sand), kitchen gardens in rows (`plan.plots`), weeds and dry grass along the walls and the track edges (`plan.tufts`), scrub bushes (`plan.trees`), dead palm stumps in the old village.

Each house gets its own age (0 to 1) from the plan's wear, its village style and a hash of its seed, so a street mixes fresh and ruined houses and the same seed always looks the same.

## Three village characters

| Preset | Style | What differs |
|---|---|---|
| `oasisAged` (wear 0.55) | `oasis` | The lived-in oasis village: pool, grove, packed blocks, domed hall on its square. Wear 70 percent of the plan's. |
| `roadsideHamlet` (0.6) | `roadside` | New layout. Houses of mixed sizes strung along the track on both sides, a small square with a well and a domed shrine, gardens behind, no grove. Full wear. |
| `oldVillage` (0.9) | `old` | The half-abandoned village: 50 percent ruins, thin dying grove with palm stumps, most weeds, wear 130 percent (capped at 1). |

Villages built with `P.wear` and `F.style` in `desertLand`; the City Lab has a Wear slider and the three presets.

## The road rule

No house, hall, lean-to or square of a desert village may stand on a carriageway. `validate()` now reports `onRoad` (overlapping pixels) and `roadClear` (tightest gap in px) for desert plans, and `onRoad` is a hard rule in `pass`. Houses and plots keep at least 2 px from the track, a square 3 px. Village lanes (the side tracks that run between blocks) may touch a wall but never cross one. 100 seeds of every desert village preset and 8 whole-level plans: no overlaps. The old check was geometry only; a house beside the end of a lane was first reported as overlapping because the lane's cap was measured as a disc, so the check now uses the lane's real cells.

## Level 2 in the aged look

`sandSeaAged` is level 2 with wear 0.55. Only one village is old through and through; the rest are mixed:

- **Held village** (segment `village`): style `old`, every house aged. The one old village of the level.
- **Port and beach town** (`desertize`): about one house in five is aged (`mixPort` 0.2).
- **Small oasis** (first `desert_open`) and **roadside hamlet** (last `desert_open`, before the boss): about one house in four is aged (`mixVillage` 0.25); the rest keep clean plaster, with weeds and gardens.
- Valley, junction, airbase, pass: no houses to age.

Damage follows the war. The port, the held village, the junction, the airbase and the pass are war areas. A mixed village's damage is 6 percent plus up to 50 percent that falls off with its distance from the nearest war area (`exp(-d / 220)`). On seed 1944 that is about 30 percent for the small oasis, which lies between the junction and the airbase, and about 20 percent for the hamlet near the end.

## Two drawing faults fixed on the way (seed 1944)

Both are in the clean look too, so level 2 changes even without wear:

- **The railway ran through the rock** at the valley's mouth: the line leaves the port at x 18 and eases to x 74 over 160 rows, while the valley wall rises from the left across the same rows. The line now keeps 12 px clear of any wall (`rxA` in `desertLand`): the push is blurred over 29 rows so it bends away early, never in a jump, and the corridor, trees and pits use the same line. Only the first 160 rows change; trains still run on the straight part.
- **The dry riverbed stopped in a straight cut**: its width was fixed and its centre jumped where the track and the rail came close. It now narrows to a tip over 70 rows at both ends and pinches out smoothly where there is no room. A side track crossing it is still a ford.

`tests/citygen.mjs` checks both on 12 seeds in both looks (no rail cell in or within 4 px of a wall, no sideways jump in the riverbed, no blunt end). The valley preset changes too, for the same reason.

## Shipping it

1. `index.html`, the level 2 build (`CityGen.generate({ preset: 'sandSea', params: { segs } })`, about line 7906): use `preset: 'sandSeaAged'`, or pass `wear: 0.55` in `params`. The generator copy in `index.html` is already current (`node scripts/embed-citygen.mjs`).
2. Run `node tests/enigma.mjs` and `node tests/enigma.mjs --pixels`. Level 2's pixel hash will change on purpose (the new look and the two fixes); the Campaign must not. Refresh the level 2 entry only.
3. Check the cost. Painting a 64-row chunk of the whole level averaged 9.9 ms aged against 9.8 ms clean in my run (plan time 147 ms against 216 ms, which is noise). Plan memory: `plan.worn` is 224 x 3584 bytes. The level has about 54 house items against 26, so the director's gun slots and fire budget see more roofs.
4. The play test: lean-tos and plots are new obstacles beside the track. Both keep 2 px and 3 px clear of it, so routes are untouched, but a tank turning at a village may meet one.

## Risks and open points

- Lean-tos add 10 to 25 percent more buildings to a village (one in ten at wear 0.55, one in four in the roadside hamlet), and the roadside hamlet adds about 30 houses to the level, so destruction (`worldDamage`, fires) has more targets. Burning houses still use the plan's fire budget.
- The wear is tuned by eye at 3x zoom. At game size (1x) fine cracks are single pixels; the blotches, patches and clutter carry the look.
- The roadside hamlet is long and thin by design (it follows the track). If it reads as too regular, the next step is a few side lanes and a second row set back from the road.
- Other climates (winter, forest) are not aged. `wear` is ignored there.
