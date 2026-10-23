# The aged desert

The old Enigma Run desert houses (flat plastered cubes, one even tone, straight lines) read as too clean. They are replaced by houses shaded like the Campaign's level 2 house (dithered tones, a stepped roof, lit edges), some of them old, patched and lived in, drawn by CityGen's own pixel painter. It is the default for every desert plan; see "Shipping it".

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

- **The railway ran through the rock, then ran too close to it.** The line leaves the port at x 18 and eases to x 74 over 160 rows, while the valley wall rises across the same rows. The line keeps its smooth curve and the rock now gives way to it: a wall never comes nearer than 26 px to the line's centre, so the rails have at least 20 px of clear ground beside them, past the cliff's own shadow (a first fix kept only 12 px, which left the rails inside the shadow). The cut is blurred over about 25 rows so the mountain recedes smoothly. It applies to the whole line, so the valley and the pass wall are trimmed a few px too. Trains still run on the straight part at x 74.
- **The dry riverbed stopped in a straight cut**: its width was fixed and its centre jumped where the track and the rail came close. It now narrows to a tip over 70 rows at both ends and pinches out smoothly where there is no room. A side track crossing it is still a ford.

`tests/citygen.mjs` checks both on 12 seeds in both looks (no rail cell in or within 19 px of a wall, no sideways jump in the riverbed, no blunt end). The valley preset changes too, for the same reason.

## Shipping it: done in the generator

The new look is now the default for every desert plan (`wear` 0.55 on the desert presets, so level 2 itself, the oasis and valley presets, the pass and the port). The game picks it up with no change to `index.html` beyond the embedded generator copy, because level 2 asks for the `sandSea` preset. The old look stays available for comparison: `sandSeaClassic`, or `params: { wear: 0 }` on any desert preset (pixel for pixel the old plans).

Every house now has the Campaign house's shading, not only the worn ones. `age` is a number on every house (0 for one kept up, up to 1): the outer block and inner step, tones that dither into each other, a bright lit lip on the top and left, a dark one on the bottom and right, the roof square. Wear adds the blotches, patches, cracks, stains and clutter on top.

To go back: set `wear: 0` in `PRESETS.oasis`, `PRESETS.portDesert` and `PRESETS.villageDesert` (the others inherit it) and run `node scripts/embed-citygen.mjs`.

Still to check by hand in the running game: the Enigma pixel hashes (`node tests/enigma.mjs --pixels`), the play feel around the lean-tos and gardens near the track, and chunk build time on a phone.

## Risks and open points

- Lean-tos add 10 to 25 percent more buildings to a village (one in ten at wear 0.55, one in four in the roadside hamlet), and the roadside hamlet adds about 30 houses to the level, so destruction (`worldDamage`, fires) has more targets. Burning houses still use the plan's fire budget.
- The wear is tuned by eye at 3x zoom. At game size (1x) fine cracks are single pixels; the blotches, patches and clutter carry the look.
- The roadside hamlet is long and thin by design (it follows the track). If it reads as too regular, the next step is a few side lanes and a second row set back from the road.
- Other climates (winter, forest) are not aged. `wear` is ignored there.
