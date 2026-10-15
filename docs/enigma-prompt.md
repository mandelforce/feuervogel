# Enigma: prompt for building the calmer Campaign look

This is the build prompt for the "Enigma" background look. Paste it into a fresh session to implement it. The look was designed and approved as mockups at a strength of 50 percent.

---

Add an alternative background look for the Campaign, called "Enigma", controlled by a slider in Settings. At 0 the game must be exactly as it is today. This is a visual-only change: stage order, stage length, enemies, bosses, scoring and difficulty must not change at all.

Read ARCHITECTURE.md and tests/README.md first. Follow the repo rules in ARCHITECTURE.md ("Things to know before changing code"): visuals use the free random stream and never touch the run's seeded stream, state is global so search for a name before changing how it is set, bump VERSION in both index.html and sw.js, and add a CHANGELOG.md line.

The look has been designed and approved as mockups at a strength of 50 percent. Build it for real using the formulas below, and show me that it matches. I will fine-tune the numbers afterwards, so keep every number in one tunable place.

## 1. The slider

- Add `enigma: 0` to the `settings` object (an integer 0 to 100, saved by `saveSettings`; the default 0 keeps today's look for everyone). Add an "Enigma" row to the Settings panel next to "Show FPS": a range slider from 0 to 100 in steps of 5 with a small value readout ("Off" at 0, otherwise "35%" and so on), and a one-line note ("Calmer backgrounds. Off is the classic look."). Copy the markup, styling, `rangeFill` call and event handling from the Music and Effects sliders (`sMusic`, `sSfx`) and set the value in `syncSettingsUI()`.
- Define `ENIGMA_T` as `run.enigma / 100`, where the strength is copied into the run when a run starts (`createRun()` / `newGame`, as `run.enigma`). All look changes read the run's value, never `settings.enigma`, so moving the slider in the pause menu cannot change a run in progress, and the new value applies from the next run. Save it with the resumable run (see the resume code) so a resumed run keeps its look.
- At `T === 0` take the original code paths and skip all Enigma wrappers, so the result is bit-identical to today.
- When a run starts with a different strength, rebuild what depends on it: clear `world.chunks`, `world.chunkInfo`, `world.chunkJobs` and the field and parcel caches, and rebuild the cloud sprites (cache them per strength).
- Leaderboard and play data work as normal for Enigma runs. Do not change `lbEligible()`, the score submission, the play-data telemetry, or `worker.js`, and do not add any fields to what is sent (the deployed Worker may reject unknown fields). Artifacts and unlocks work as normal. The tutorial and title screen always use the original look.

## 2. What must not change

- `STAGE_ORDER`, `STAGE_LEN`, `biomeForQ`, boss triggers, songs, and everything in `classify()` / `terrainType()` / `predictInfo()`. Enemy and ground-target placement depends on them. Only colours and decoration may change. Adding a stable parcel key to what `parcel()` returns is fine, as long as its existing results are unchanged.
- The dither (`bay` / `pickI`) stays exactly as it is, same pattern and contrast. I like it and do not want it reduced or replaced.
- Forests: forest ground colour (`case 'forest'`), forest tree sprites and forest tree density stay as they are, including no desaturation of forest ground. If the other changes cause a visible seam at forest edges, tell me before fixing it.
- Tree sprites in every theme, winter included, stay exactly as they are (no snow caps or recolouring).
- Out of scope for now (cities and special areas need separate attention): the `city`, `factory`, `secret`, `fortline` and `castle` biomes and their colour functions, `croad`, houses and farm buildings, set pieces, and weather overlays (rain, snow, storm, night tint). Leave them as they are.

## 3. The look, as interpolations on T

Every change below is an interpolation between the original (T = 0) and a full version (T = 1). Put the per-aspect numbers in one small object next to `ENIGMA_T`.

**Saturation.** Pull ground colours toward their grey (luma) by `0.14 * T`. For warm tones (wheat, soil, sand: `r > b + 40 && r >= g`) use only 35 percent of that. Do it once per pixel when a chunk is written (in `workChunk`, next to the existing winter tint) or in a pre-computed palette, not with extra sampling. Skip forest ground and the out-of-scope biomes. Check the wheat fields specifically; an earlier mockup washed them out.

**Fields** (both code paths: the parcel path for theme 0 in `fieldColor`, and the `fieldCell` path for the other themes).

Give each parcel a stable key (theme 0: `bj * 4096 + (bi + 64) * 4 + id`, as `fieldFits` already builds; other themes: `ri * 4096 + ci`). About a quarter of the fields, `hash(key, 29) < 0.25`, are "prominent", except in the winter theme (see below). Use a per-field strength `Tf`: `Tf = T` for normal fields and `Tf = 0.3 * T` for prominent fields (so they stay close to today's look). With `kS = 1 - Tf`:
- Stripes on wheat, crop and grass fields: multiply today's stripe offsets by `kS` (wheat `-0.3`, the crop stripe `+0.15 / -0.2`, the grass stripe `-0.2`).
- Furrow lines on ploughed soil: keep them, with the offset `0.35 - 0.21 * Tf` instead of `0.35`.
- Hedge borders (`P.edge`, and the `fx < 2.5 || fy < 2` band): return `mix(hedge, softTone, w)` where `softTone = mix(fieldColour, grass(0.4 or 0.5), 0.5)` and `mix(a, b, t)` is linear. The hedge weight is `w = 0.8 * T` for normal fields (so at T = 0.5 the hedge is still 60 percent visible) and `w = 0.15 * T` for prominent fields (the hedge stays almost fully visible). So at T = 0.5 most fields have a softened hedge and about a quarter of them have a clear one.
- Flowers in meadows: raise the threshold `fl > 0.992` to `0.992 + 0.0065 * T`, and the yellow/white split from `0.996` to `0.996 + 0.0032 * T`.
- Farm fences and posts in `drawFeatures`: lower their contrast by blending toward the ground colour by `0.35 * T`, and skip every second post when `T >= 0.5`.

**Winter fields** (theme 1, the `fieldCell` path). There are no prominent fields in the winter theme: every field uses `Tf = T` and `w = 0.8 * T`. Instead, snow covers most of the hedges. For every hedge pixel in theme 1 compute a snow amount
  `amt = clamp((vnoise(wx * 0.045 + ci * 3.1, wy * 0.045 + ri * 1.7) - 0.28) * 9, 0, 1)`
which covers about two thirds of the border length in patches with fairly hard edges. Blend the hedge colour toward snow white `(236, 240, 248)` by `0.92 * amt * s`. Add a spill: for field pixels in the 2 to 3 px next to the hedge band (`fx < 4.5 || fy < 3.8`), blend the field colour toward the same snow white by `0.45 * amt * s`. Here `s = min(1, T / 0.5)`, so the slider controls it and it equals the approved look at T = 0.5. Do this before the existing winter tint in `workChunk`, so the snow takes on the same blue-grey cast as the rest of the stage. Keep it out of the out-of-scope biomes.

**Trees** (not in forests, which stay as they are). In `treeOk`:
- Meadow trees (theme 0, `h < 0.2`) and grass trees (`h < 0.06`): pass `h * (1 + 0.5 * T)` to the existing test, which makes about 20 percent fewer at T = 0.5.
- Keep trees off fields: for fields in themes other than 0, reject a tree when `hash(tx * 3, ty * 5) < T`. For theme 0, when `hash(tx * 3, ty * 5) < T`, also reject any meadow tree whose centre has a non-meadow `parcel()` within 6 px (check the four points left, right, above and below).

**Clouds.**
- Low clouds: replace the three cloud sprites with soft ones built at startup for the current strength. Make 2 puff sprites and 2 wisp sprites. Puffs are the existing `cloudSprite` shapes (34x18 and 26x14) scaled by `1 + 0.6 * (1 - T)`, baked at opacity `0.8 + 0.2 * (1 - T)`. Wisps are long thin shapes (80x9 and 56x8) baked at 0.75 and 0.7. About 4 clouds on screen, a mix of puffs and wisps.
- Soft edges: build each sprite with a stepped-alpha rim instead of a hard silhouette. For each opaque pixel, count how many pixels in the surrounding 5x5 window are opaque (coverage 0 to 1). Puffs map coverage to the alpha steps `[0.3, 0.6, 0.85, 1]` (coverage below 0.30, 0.55 and 0.80 picks the first three), wisps to `[0.35, 0.65, 1]`.
- Low cloud shadows (`s.k`): build them from the same silhouette on a canvas padded by 4 px, softened over a 9x9 window with steps `[0.18, 0.4, 0.65, 0.85, 1]`, drawn with the existing low alpha.
- The big see-through "high cloud" overlay drawn over the action (`drawHiClouds`): fade it to `0.24 * (1 - T)` opacity.
- Off-screen cloud shadows: the two `hiClouds` ground shadows (the `drawImage(s.k, ...)` call at 2x scale with alpha 0.07) use soft shadow canvases built from the two big cloud shapes (60x30 and 80x36) and an alpha of `0.07 + 0.05 * T`. They suggest clouds above the screen: no cloud sprite, just a large soft darker patch drifting over the ground, at most two on screen. Skip them in `lowFX`.
- Clouds are drawn below enemies, bullets, pickups and the player. Check the draw order and make sure nothing cloud-related is drawn on top of the action except the faded high-cloud overlay.
- Keep the existing `hide` rules per biome and the `nightF` dimming. Cloud setup and drawing use the free random stream only.

## 4. Verification

- Build before/after screenshots with Playwright (Chromium is installed; see tests/smoke.mjs for loading the page and `tests/harness.js` / `window.__sf` for the test hook). Serve the folder with `python3 scripts/devserver.py` or `python3 -m http.server`. Wait for `document.body.dataset.state === 'title'` before using the hook. To frame a scene: `SF.start(1, stage)`, clear `world.enemies`, `world.ebul` and `world.parts`, set `world.scroll`, reset `world.chunks`, `world.chunkInfo`, `world.chunkJobs` and `world.genP` like `gfxBack()` does, run `ensureChunks()` and `workChunk()` until all chunks are built, set `app.fade = null`, call `SF.draw()`, and read the canvas with `toDataURL`. Add a ring of static enemy bullets (`eshot(x, y, angle, 0, 's')`) to judge readability.
- Take shots at strengths 0, 50 and 100 for Stage 1 fields (scroll 1400) and forest edge (1900), Stage 2 (1400), Stage 3 (1400), Stage 4 forest (1000), and Stage 5 at three scroll positions (1400, 1780 and 2200). Put the PNGs in your scratchpad and show them to me side by side before finalising. Check specifically: wheat stays golden, forests and all tree sprites look identical to today's, about one field in four has a clearly visible hedge on the non-winter stages, winter hedges are mostly under hard-edged snow patches, bullets stay readable over every field, and strength 0 is pixel-identical to the current game.
- Run `node tests/replay.mjs` and the smoke and perf tests. With the slider at 0, every replay checksum must be identical to `tests/golden.json`. Add a replay scenario that plays the same run at strength 50 and checks it gives identical simulation checksums (the look must never affect the simulation).
- With the slider above 0, chunk generation must not be slower by more than a few percent (use tests/perf.mjs), and nothing in Enigma may run per frame beyond the cloud drawing.

## 5. Finish

Bump `VERSION` in `index.html` and `sw.js`, add one CHANGELOG.md line describing the Enigma slider and what it changes, and add a short note to ARCHITECTURE.md about `run.enigma` and `ENIGMA_T`. Commit on the branch you are given. Do not open a pull request unless I ask.
