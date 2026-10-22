# Tank art style: the clean look

The house style for tanks (and a good starting point for other vehicles), set by `docs/tank-art-v3.js`. The reference is late-80s arcade shooters such as Toaplan's Fire Shark, with lines kept clean so a turning tank looks the same at every heading.

## Rules

1. **Draw shapes, never rotate a finished bitmap.** Each of the 16 headings is rendered from the shapes at 6x, then reduced by averaging. Rotating a 1 px detail sprite turns muddy at 22.5 and 45 degrees.
2. **One light, top left, in screen space.** Shading is flat tone bands (shadow, base, light, top light) laid over each shape in screen orientation, so the light does not turn with the tank. No gradients, no dither.
3. **Small palette.** Every pixel snaps to the nearest colour of the body ramp, the metal ramp, the track ramp and the lamp ramp. No in-between colours.
4. **Bold detail only.** Keep what survives at 16 px: tread links with a half-link shift between the two frames, a wheel ring at each end, bevelled plates, driver hatch, headlamps, a cupola and loader hatch at the back of the turret, one amber lamp, a vented muzzle. Drop rivets, louvre dither, antennas and stowage.
5. **Keep the middle of the turret quiet.** Hatches sit at the rear half. Two dark dots in the middle make the turret read as a face.
6. **Same footprint as the game.** Hull 16 x 22 and turret 12 x 30 (tank), 20 x 28 and 16 x 40 (heavy tank), 16 x 24 and 12 x 52 (long-gun tank). The game's own 1 px outline and white hit flash are kept. The turret stays a separate sprite so the pop-off still works.
7. **One function, one colour parameter.** `makeTankV3(ramp, big, long)` returns the two hull frames, the turret and a charred wreck, each at 16 headings.

## Clean + raster (v4)

`makeTankV4(ramp, big, long)` in `docs/tank-art-v3.js` keeps rules 1, 2, 4 and 5 and brings back the original's raster shading. Surfaces use smooth shading, then each interior pixel is placed on its ramp and ordered-dithered with the game's 4 x 4 pattern on SCREEN pixels, after rotation, so the pattern does not turn or smear with the tank. A little noise dips some body pixels one tone for the camouflage look. Edges, hatches, lamps and the barrel stay solid. Tracks are black with lighter link bars, and the 6-step steel grey is shifted up one step to match the original's brightness.

## Plain tracks

`makeTankV3(ramp, big, long, plain)` and `makeTankV4(..., plain)` take a `plain` flag. Plain tracks are solid black with thin lit ticks on the outer edge, like the original's, with no hub rings at the ends, no lit link blocks and no skirt plates. The full version (the default in code) has lit link blocks, hub rings and, on the heavy tank, thin skirt plates. The tool shows plain tracks by default, with a switch for the full version.

## Planes (refined, staying close to the originals)

`docs/plane-art-v5.js` (`makePlanesV5()`) refines the fighter, heavy fighter, bomber and Sower with the game's own sprite toolkit, so the original's ordered dither and crisp pixels are kept exactly. Changes: pure black separation lines round every overlapping part (fuselage, nacelles, canopy, spinner), brighter body tones, brighter yellow spinners and lamps, glass in a black frame with a white glint. Base parts (wings, tailplane) get no extra edge, because the game's own 1 px outline already draws the silhouette and a second ring would thicken it. Sizes, orientation and drawing positions match the originals. The fighter's leader variant (the tinted copy) is not redone.

## Tank types

| Type | Hull | Turret | Gun |
|---|---|---|---|
| Tank | 16 x 22 | 12 x 30 | short barrel, bulge, small vented brake |
| Heavy tank | 20 x 28, skirt plates | 16 x 40, smoke dischargers | thick barrel |
| Long-gun tank (concept) | 16 x 24, longer sloped front, tool rails | 12 x 52, small turret, wide gun shield | 26 px barrel, two lit bands, two-slot vented brake |

## Cost

About 0.13 s to build one tank set on the development machine, against 0.02 s for the detailed version. Build once and ship as image data if start-up time matters on phones.

## The other vehicles (tried, not adopted)

The clean versions of the other vehicles were reviewed and not adopted: the original rasterised sprites suit the level backgrounds better. The code is kept for reference only.

**Trains, second attempt.** The train vehicles were redone in both styles: `makeTrainsV3(false)` is clean (flat tone bands) and `makeTrainsV3(true)` is clean + raster (the original's ordered dither, laid on screen pixels). It covers the steam and diesel locomotives, the boxcar, the explosives car, the flatcar and the flak gun on the flatcar. The tool shows them next to the originals, on the lineup and on the real rails.

`docs/vehicle-art-v3.js` applies the same rules to every other vehicle (load `tank-art-v3.js` first). `makeVehiclesV3()` builds twenty sets in about 0.2 s: truck, armoured car, motorbike, staff car, fuel truck, the two locomotives, boxcar, ammunition car, flatcar, patrol boat, destroyer, submarine, fighter, heavy fighter, bomber and the Sower, plus the flak, patrol boat and destroyer gun mounts. Vehicles the game rotates come as 16 headings. Fixed ones (rail, sea, the large aircraft) come as one sprite with the original's orientation and size.

Additions for non-tank vehicles: hazard marks use the explosives car's yellow band (fuel truck); crosses are a white plus with a dark border, since the thin dark inner cross turns grey at this size; wheels are dark blocks with one lit edge; glass is a flat blue strip with one lit corner.
