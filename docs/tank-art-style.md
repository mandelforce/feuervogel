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

`docs/plane-art-v5.js` (`makePlanesV5()`) refines the fighter, heavy fighter, bomber and Sower with the game's own sprite toolkit, so the original's ordered dither and crisp pixels are kept exactly. Changes: pure black separation lines round every overlapping part (fuselage, nacelles, canopy, spinner), brighter body tones, brighter yellow spinners and lamps, glass in a black frame with a white glint. Base parts (wings, tailplane) get no extra edge, because the game's own 1 px outline already draws the silhouette and a second ring would thicken it. Sizes, orientation and drawing positions match the originals. The refined fighter itself was rejected and replaced by the four redesigns below. The leader fighter (the tinted copy) is not redone.

## Fighters: four German WW2 redesigns

`docs/fighter-art-v6.js` (`makeFightersV6()`, needs the two renderer files loaded first) replaces the fighter with four complete designs, each at 16 headings in the clean + raster renderer: Bf 109 (slim, tapered wings, yellow cowl and wing tips), Fw 190 (round radial cowling with a yellow band, broad rounded wings), Me 262 (swept wings, two jet pods with dark intakes, no propeller) and Bf 110 (twin engine nacelles with yellow spinners, twin tail fins). Luftwaffe colours: dark green and grey-green uppersurfaces with a mottle, white crosses with black edges. Sizes are 24 to 26 px wide, a little larger than the original's 22 x 18, so hitboxes would need a look.

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

## Heavy fighter (four larger WW2 designs)

The original heavy fighter (30 × 24) was liked for its contrast but read as a bat shape. `docs/heavy-art-v7.js` (`makeHeaviesV7`) draws four larger, top-down WW2 twin-engine suggestions, 36 to 42 px wide, nose to the south like the original, in the clean + raster style (dither, black separation lines, bright yellow spinners): Bf 110 Zerstörer, Ju 88 C, He 219 Uhu (night finish, antler radar) and Do 335 Pfeil (push-pull). Not wired into the game: hitbox (26 × 20) and the propeller flicker at x ± 7 would need adjusting.

Decision: the Bf 110 Zerstörer replaces the heavy fighter, and the Do 335 Pfeil is added as a separate new plane type (needs its own entry in the game: stats, hitbox, spawn). The Ju 88 and He 219 are not used. The Fw 190 is the preferred fighter design; the original Sower stays.

## Bomber (four German WW2 suggestions)

The refined bomber with black outlines was rejected; the original is better because the engines hide under the wings. `docs/bomber-art-v8.js` (`makeBombersV8`) draws four German bombers with the game's own toolkit (dither, only the game's 1 px edge, no black part lines): He 111, Ju 88 A, Do 17 and Ju 87 Stuka, 42 to 54 px wide against 46, nose to the south, only the nacelle tips showing as in the original. Not wired into the game.

## Sower (four cockpit variants)

The original Sower reads well, so only the nose and cockpit change (`docs/sower-art-v9.js`, `makeSowersV9`, body copied from the game's `SPR.sower`): Bf 110 (solid gun nose, long greenhouse canopy), He 111 H (stepped glazed nose with an offset pilot canopy), He 177 Greif (pointed nose, angular framed greenhouse) and Fw 200 Condor (rounded solid nose, split flush canopy). Not wired into the game.

Bomber, second round: the owner wants the original's olive colour, four engines and an improved He 111, in four variations. `docs/bomber-art-v10.js` (`makeBombersV10`) draws them (rounded wing; stepped nose; twin fins with big inboard engines; swept wing with a greenhouse nose). They replace the four mixed bombers on the card; the v8 file stays as reference.

Decision: the Sower takes the Bf 110 cockpit (`SOWER_NOSES.bf110` in `docs/sower-art-v9.js`).

Decision: the bomber is the He 111 variant c (twin fins, big inboard engines), now 55 px wide (`makeHe111V10C` in `docs/bomber-art-v10.js`) so the middle is a pixel column and the cockpit bars and parts sit exactly on the centre line. The game would draw an odd-width sprite at a half-pixel unless its draw position is rounded.

Fighter: a mix of the Bf 109 and the Fw 190 (`mixV6` in `docs/fighter-art-v6.js`: the 109's slim body, tapered wing, yellow tips and long canopy with the 190's round radial cowling and yellow band), and a one-pixel black cross on a flat round white disc on the wings of the 109, 190 and mix (`stampCrossV6`, stamped per heading after rendering). The card shows the original, Bf 109, Fw 190 and the mix; the Me 262 and Bf 110 stay in the code.

Decision: the fighter is the Fw 190 (`fw190V6`), the most readable of the three; the Bf 109 and the mix stay as alternatives.

Picks in the tool: clicking the caption under a design marks it as the owner's pick (★), saved in the artifact's shared database (collection `picks`, one doc per vehicle with field `key`, the caption text). Seeded with the picks above.
