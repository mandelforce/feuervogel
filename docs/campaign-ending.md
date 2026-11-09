# Campaign ending: two loops, then the landing

Status: built (build 1.2.5.126). This note started as the design and now describes what the code does; the open questions and what was left out are at the end.

## Decision

The Campaign (START) ends after two loops (1944 and 1945). There is no third loop. The end of level 6 in the 1945 loop plays an ending scene instead of flying on to level 1 of a third loop, so the Campaign score has a ceiling. Endless stays the unbounded mode.

Why: about 53 minutes for both loops; few players would reach a third pass; a third authored loop costs far more than its audience; and a score that cannot grow with survival time is a fairer board.

## What the player sees

Level 6 of loop 1 is cleared, the results screen runs, then the congratulations screen (its footer reads "LAST STAGE CLEARED" and "THE CARRIER IS WAITING"). On the tap the screen fades to the carrier, seen from above:

1. The Feuervogel comes in over the stern, drops to the deck, touches down with a puff of smoke and rolls to a stop. In a two-player run player 2 follows `EN.GAP` (150 frames) later down the same centre line and stops about 40 deck units behind player 1: side by side would clip the parked planes in the outer lanes.
2. The deck crew raises white flags, a group runs to the ship, rockets climb and fireworks burst over the sea, and "GRAF ZEPPELIN SURRENDERS" with the final score shows at the top (the carrier is the Graf Zeppelin, the empire's, and the Feuervogel was stolen from it: the white flags are its surrender, not a welcome).
3. A squadron flies past: a V of five from the stern, two groups of three crossing, a delta that breaks into a fan, all with trails.
4. At 25 seconds the credits roll over the scene (the existing credits, faster, over a dark veil), up to the Retro Run button.
5. Under the button a Continue button appears. Continue opens the score dialog ("Campaign complete") and then the title. The Retro Run button opens the same score dialog first and then, at the title, the Retro Run difficulty choice. Nothing starts by itself.

There is no skip button (a skip button can be added later). The victory song plays throughout.

## Flow (as built)

The trigger is `endEnigmaLevel`: a sortie with `run.loops >= 1` that has just cleared level 6.

- **Ranked Campaign** (`run.ranked`): `startEnding()`.
- **Practice** (not ranked) in the second loop: `stopMusic(); toTitle()`. It used to loop on; every sortie is capped at two loops now.
- **Loop 0:** unchanged. It still shows the congratulations and flies on into loop 1.
- **Endless and Retro Run:** unchanged.

`startEnding()` makes the run final at once: `rrSend('over')`, `clearResume()`, `saveHi()`, no fade, `app.ending = { t: 0, cr: false, score }`, the carrier's picture is painted, and `playSong('victory')` starts. The score dialog is opened at the end by `finishEnding(retro)`, with the same calls the Campaign-won path used (`app.state = 'over'`, `app.lbWin = true`, `openLB('submit')`); if the run is not board-eligible it goes straight to the title. `app.retroNext` makes `toTitle` open the Retro Run difficulty choice afterwards.

A death at any earlier point is unchanged: game over, no ending. The ending never replaces the game over scene.

## Score freeze and the frozen world

`update()` returns right after the pause check while `app.ending` is set (`updEnding` runs instead), so the director, enemies, bullets, scoring and the scroll do not run. `canSteer()` is false, so the Nova and the laser do nothing, and taps do not reach the game (`pointerdown` returns). `renderMain` draws only `drawEnding()`. `saveResume` and `snapshotReady` refuse while the ending is up.

## Scene (as built)

A frame counter `app.ending.t` (60 steps a second) drives everything. The scene is a pure function of that counter and fixed numbers (the `EN` table, a small integer hash `eh`): there are no particle lists, no delayed closures and no state to save.

| Frames | What |
|---|---|
| 0 to 60 | Fade in from black. |
| 110 to 240 | The ship comes in from below, from high (large, with a far shadow) to the deck (`pk`), a decaying S-curve; touchdown at 240. |
| 240 to 320 | Roll-out to a stop (`enShip`: the roll starts at the speed the approach ends with). |
| 250 on | White flags go up; from 320 eight of the crew run to the ship. |
| 330 on | A rocket every 78 frames, then the burst (a ring of 26 sparks with a short tail, falling a little). |
| 400 to 1750 | "GRAF ZEPPELIN SURRENDERS" and the final score, on a dark band. |
| 520, 760, 1020 | Squadron passes A, B and C (`enPlane`); trails are the plane's earlier positions. |
| 1500 | `Credits.open(true)`. The scene keeps playing under them. |

Nothing is drawn along the hull; the wake behind the stern is the propellers' wash and two spreading V's of foam in the sunset's golds. The sea is the game's sunset sea (`enSea`: the sea theme's pixels as `planSeaColor` picks them, through `CityGen.sunsetGrade`, painted once as a long strip that drifts down the screen). The carrier is the game's own picture (`carrierPic(q)`, drawn at a scale that fits below a 100 px strip for the banner: `enGeo`), the planes are the Enigma art's (`startEnding` calls `setEnigmaArt(true)`; the formation leaders are `SPR.fighterL`), with the flyover's 28 parked planes minus the middle lane, which stays clear for the landing.

## Credits over the scene

`Credits.open(true)` puts the dialog in `ending` mode: a translucent veil instead of black (`#credits.ending`, `z-index: 3`, below the pause menu so the pause menu still works), no roll: the credits come in as blocks, one at a time and each all at once, centred over the scene (the logo for its 7-second intro, then the staff, the graphics and sound, the skies, the chip, the additional code at 4.5 seconds each, and last the thanks with the Retro Run button, where they stay; `pageLoop`, `buildPages`, `showPage`). The Retro Run button is shown on the last page, and no Back button. The Continue button (`#crClose`, at the bottom centre in this mode, clear of the home bar) appears with the last page. Pausing stops the page clock (and the logo's timer, which returns while the game is paused).

## Music

`victory` is level 1's `stage` tune (16 bars, 150 bpm, D minor) turned to the major: the minor home chords (D, G) become major and the F over the D chord becomes F-sharp, so the B-flat and C chords stay as borrowed chords (the old rock/march lift). `VICTORY` is three sections, about 68 seconds in all:

1. The tune at 116 bpm with the march kit (about 33 s): the landing and the cheering.
2. The tune at 150 bpm, a tone up, with the brass layer, the dense kit, a crash and the pad (about 26 s): the flypast and the first of the credits.
3. A coda (`VICT_CODA`, 4 bars at 92 bpm, bell lead, sparse kit): D, G, A, D with a rising arpeggio and a held D.

`VICTORY.once` makes the scheduler stop at the end of the last section instead of looping. `arrangementFor('victory')` returns it before the loop-based arrangements. Pausing pauses the music (the scheduler already does).

## Pause and resume

- **Pausing** freezes the scene, the music and the credits' roll, and unpausing goes on from the same frame (`tests/enigma.mjs` 2c).
- **Reloading** during the ending lands on the title: the resume record is cleared when the scene starts and no snapshot is taken during it. The best score is saved (`saveHi`) and the run was reported to the run record (`rrSend('over')`), but the online score dialog is not offered after a reload. This is the trade-off: because the scene is a pure function of `t`, exact resume would only need `app.ending` in `SNAP_APP`, the credits reopened at the right place and the song restarted at the right bar; the song restart is what makes it more than a few lines, and the scene is about a minute long. If it ever matters, that is the way to do it.
- **Quitting** (pause menu) and **Restart stage** clear the scene and the credits (`abortEnding` in `toTitle` and `newGame`).

## Code touchpoints

`index.html`: the "ending" section before `drawResults` (`EN`, `eh`, `endingLast`, `startEnding`, `enGeo`, `updEnding`, `enShip`, `enPlane`, `drawEnding`, `finishEnding`, `abortEnding`); `endEnigmaLevel` (the cap); `update` and `renderMain` (the hooks); `toTitle`, `newGame` (clean-up, `app.retroNext`); `canSteer`, `snapshotReady`, `saveResume`, `syncBody`, `pointerdown` (guards); `drawCongratsBody` (footer); `Credits` (the `ending` mode, its buttons); music (`VICT`, `VICT_CODA`, `VICTORY`, `arrangementFor`, `scheduleMusic`); CSS for `#credits.ending`. `sw.js` and `VERSION` at 1.2.5.121.

## Tests

`tests/enigma.mjs` 2c: the second loop's level 6 starts the ending, with the score, no resume record and the victory song; the song runs about as long as the scene; the ship cannot be steered and no snapshot is taken; the score and the world stand still for 2,280 steps with the scene drawing without errors and the credits open; pausing freezes the scene; the credits have the Retro Run button and no Back at first; Retro Run goes to the score dialog and then the picker; Continue goes to the score dialog and then the title; quitting leaves nothing behind; two players land one after the other (player 2 stops at least 20 px behind player 1) with the combined score unchanged; practice in the second loop ends at the title; the first loop still flies on.

## Testing the scene

For now the pause menu's Credits button plays the whole scene (`startEnding(true)`, the demo form: it leaves the run, its record, the score and the best alone, and Continue returns to the pause menu). To get the plain credits back, point the `#pmCredits` click handler at `openCredits` again.

## Left out, for later

- A skip button.
- Exact resume of the ending (see above).
- The pieces of the old loop code that only a third loop reached (the `loop >= 2` branches, rank growth past loop 1) are still there: Endless uses them, so they were not removed.
- The scene was checked in a headless browser at one phone size (1P and 2P screenshots) and by the tests; look at it once on a real phone, especially the credits over the scene and the music.
