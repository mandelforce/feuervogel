# Campaign ending: two loops, then the landing

Status: design note, nothing built yet. Branch `claude/loop-3-design-pk8esv`.

## Decision

The Campaign (START) ends after two loops (1944 and 1945). There is no third loop. The end of level 6 in the 1945 loop plays an ending scene instead of flying on to level 1 of loop 2. Loops are not played beyond that point, so the Campaign score has a ceiling. Endless stays the unbounded mode, on its own board.

Why: about 53 minutes for both loops; few players would reach a third pass; a third authored loop costs far more than its audience; and a score that cannot grow with survival time is a fairer board.

## The ending in one line

Level 6 of loop 1 is cleared, the score freezes, the player's plane lands on the carrier while the crew celebrates, a squadron flies a salute, the credits run, and the Retro Run button appears at the end.

## What happens today (for reference)

- `finishResults` shows the congratulations (`app.congrats`, a `jingle`, `campaignWon()`), then `endEnigmaLevel` runs. For a Campaign sortie after level 6 it calls `startEnigma(1, true, lp + 1)` with `carrierFlyNext = true`, so level 1 of the next loop opens on the carrier deck (`carrierStart`).
- The old non-sortie path (the Retro Run's campaign) ends with `openLB('submit')` and then the title. The ending needs that same hand-off (score dialog, then the title), see Flow.
- Credits exist as a dialog (`Credits.open()`, the `#credits` canvas) and already contain the `#crRetro` Retro Run button.
- Music is `buildSong(bpm, bass, melody, kit, transpose, layer)` entries in `SG`, played by `playSong(name)`. `jingle(notes)` plays a short note list.

## Flow

Applies only when all of these hold: Campaign START (`run.ranked`, `run.start === 1`, `lbEligible()`), a sortie, `run.loops === 1`, and level 6 was just cleared. Practice, Endless, Retro Run and single Enigma sorties keep their current behaviour (practice from level 6 goes back to the title as it does now).

1. Level 6 boss dies, the results screen runs as now. The existing congratulations screen for the 1945 loop is folded into the ending (no double fanfare).
2. **Freeze the score.** Bank the results bonus, set `run.scoreFinal = run.score` (and `score2` for two players) and stop all scoring. The scene cannot change it. `campaignWon()` and `loopsWon` are counted here, once.
3. Fade to the carrier scene (state `app.ending`, see below). The player's ship is flown by the scene, not by input.
4. Landing, then celebration, then the credits roll over the deck.
5. Credits end on the Retro Run button. Clicking it starts Retro Run (`startRetro()`). It is never started automatically. A second control returns to the title.
6. Score entry follows the credits: `rrSend('over')`, `clearResume()`, `saveHi()`, `openLB('submit')`, as the Campaign-won path does. If the player starts Retro Run, the score entry is offered first (the run is already finished and frozen).

A death at any earlier point is unchanged: game over, no ending. The ending never replaces the game over scene.

## Scene timeline (draft, about 60 s)

No skip button in the first version (add one later if wanted). A frame counter `app.ending.t` drives everything, at 60 steps per second.

| t (s) | What |
|---|---|
| 0 to 3 | Fade in. Carrier seen from above, sea scrolling, deck lights on. Crew on deck. |
| 3 to 18 | The ship flies the approach from the top of the screen and touches down on the deck. Auto-flown, a smooth curve, arrester wire catch, short slide to a stop. |
| 12 to 30 | Crew waves white flags, fireworks burst over the sea (palette bursts as particles). |
| 20 to 35 | Squadron flypast: two or three V formations cross the screen, a final pass peels off in a "missing man" or a break. |
| 30 to 60 | Credits scroll over the scene, the picture keeps moving behind them. |
| 60 | Credits end, the Retro Run button fades in under the last line. |

Reuse: `carrierStart()` and its deck art (parked planes, crew, lights; the planes along the deck as in the carrier flyover rework, build 1.2.5.55). New: the landing path, the white-flag crew sprites (a few frames of waving), fireworks, the formation flypast.

## Music

One new song, `victory`, played for the whole scene: about 60 s, landing through credits, ending on a held chord that fits the button appearing. It is a play on level 1's tune, the `stage` song (the level is "CROSS THE CHANNEL"; the name "Crossing the Canal" does not appear in the code, so this is an identification to confirm).

The source: `SONGS.stage`, 16 bars at 150 bpm (about 26 s a pass), D minor, bass D / B-flat / C / A, lead opening on a rising D-minor arpeggio (A, D, F, A, then G, F, E), rock kit, pulse lead. Its melody is a 16-bar note list, so the variation can be written directly from it with `buildSong`.

Plan for the variation, two passes of the tune plus a coda:
1. **Landing (pass 1, slower, about 120 bpm):** the same melody in the major (D major: the F becomes F-sharp, B-flat chords become B-natural or G), softer lead, march kit, so the familiar tune comes back as a homecoming.
2. **Celebration and flypast (pass 2, 150 bpm):** the full theme with the brass lead layer (`'brass'`) and the dense kit, a rising key change into the last four bars for the fireworks and squadron pass.
3. **Credits (coda):** a quiet restatement of the opening arpeggio on the pulse lead, then a held major chord as the Retro Run button appears.

Technical: add `victory: buildSong(...)` to `SG` and a one-section entry in the section table beside `stage`/`winter`; `playSong('victory')` at scene start; stop with the scene. Check mute and the audio-unlock path the same way the stage songs do.

## Pause and resume

Pausing during the scene is trivial: the scene is driven by `app.ending.t`, so the pause freezes it and unpausing continues from the same frame. That costs nothing extra.

Resuming exactly after the page is closed or reloaded is the harder case. How hard depends on how the scene is built:

- **Easy (recommended build):** the scene is a pure function of `app.ending.t` and a fixed seed. Crew, fireworks, flypast and credits position are all computed from `t`, with no stored particle lists or delayed closures. Then the snapshot only needs `app.ending` added to `SNAP_APP` and the ending state handled in `snapshotReady` (which today refuses a snapshot while `app.results`, `app.congrats` or a fade is up). It is a few lines plus a case in `tests/resume-exact.mjs`.
- **Hard:** particles in `world.later` or other closures. The snapshot code (`snapEncode`) cannot store those, so a moment with one pending is unsaveable. Avoid this.
- **Fallback if exact resume is not worth it:** because the score is frozen and banked before the scene, a reload during the ending can simply restart the ending from the top (about a minute) or jump to the credits. Nothing is lost.

Decision for the first version: build the scene as a pure function of `t` and a seed, so exact resume is cheap, and add the snapshot support only if the test shows it is easy. Otherwise use the restart fallback.

## Code touchpoints

- `index.html`, `endEnigmaLevel` (the `if (run.sortie)` branch after level 6): if the ending conditions hold, start the ending instead of `startEnigma(1, true, lp + 1)`.
- `finishResults`: fold the loop-1 congratulations into the ending; skip it at `run.loops === 1`.
- New: `startEnding()`, `updateEnding()`, `drawEnding()`, state `app.ending`, an ending song, and a hook in `update()`/`render()`.
- Credits: an entry to open the credits at the end of the scene and to show the Retro Run button; today the dialog is opened from the pause menu.
- Leaderboard: `lbEligible()` and `openLB('submit')` called after the credits, with the frozen score.
- The title screen and difficulty picker: loops beyond 1 are no longer reachable. `setDiffSeed` already offers only seeds 1 and 2, so no change needed.
- Cleanup: the `loop >= 2` branches, the `+1.0` rank per loop in `rankFor` and the per-loop count growth ("+ 2 a loop") become unreachable for the Campaign. Keep them for Endless, remove only what Endless does not use.
- `sw.js` and `index.html` `VERSION` must be bumped together.

## Tests

- `tests/enigma.mjs`: the loop 1 to loop 2 handover now goes to the ending; completing level 6 in loop 1 sets `app.ending`, not stage 13. Practice and Endless paths unchanged.
- A new check: score is identical before and after the ending.
- A check that the Retro Run button is present at the end and nothing starts without a click.
- `tests/resume-exact.mjs`: only if exact resume is built.
- Follow the repository rules: no `//` comments in in-page code, print only failures (use `--verbose` when tuning timings).

## Open questions

1. Confirm the tune is level 1's `stage` song ("CROSS THE CHANNEL"). If you meant a different one, name it or give me the notes.
2. Two players: the scene lands both ships side by side; the frozen score is the combined score as the board takes it. Confirmed.
3. Should a finished loop 0 (1944) still show the congratulations and fly on to 1945? Confirmed: yes, unchanged.
4. Skip button: later, as agreed.
