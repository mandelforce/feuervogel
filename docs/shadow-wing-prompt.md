# Shadow Wing: prompt for a varied mini-boss

Paste everything below the line into a fresh session. It is a two-step job: first a design for approval, then the build.

---

The Shadow Wing is the mid-level mini-boss, and it appears in every level. It feels repetitive because it is the same fight each time. Make it **look slightly different and fire a slightly longer pattern in each level, without becoming too much**. Work in two steps and stop after step 1 for my approval.

Read ARCHITECTURE.md and tests/README.md first. Follow the repo rules in ARCHITECTURE.md ("Things to know before changing code").

## What exists today (verified in `index.html`)

- Spawn: `spawnWing()` at chunk `14 * STAGE_LEN * arcScale()` (the `world.midDone` check, near line 8997). One sprite, `SPR.wing` (100 x 40, grey camo, two glass domes, two crosses). Name tag "SHADOW WING" in the boss bar (near line 13601).
- Stats: HP `260 * (1 + 0.35 * loop)`, hit box 44 x 12, score 10000, drops `W` plus `B`/`T` and `B`. Its `ENT.wing.onKill` bails out one or two pilots half the time.
- Movement: slides in to y = 70, then sways (`x = W/2 + sin(mt * 0.011) * 50`, `y = 70 + sin(mt * 0.02) * 8`). Leaves after 1600 frames. Two smoke puffs from the engines.
- Fire, all in one `update(e)`: an aimed 2-round burst every 48 frames, alternating sides; a 7-way aimed fan of `'B'` shots every 180 frames (offset 90); one `ring(...)` of `16 + 2 * loop` shots every 300 frames (offset 210). That is all, in every level.
- Related: the Sower is the level 4 mini-boss in the Enigma Run only, so the wing there needs thought. The boss table (`BOSS`, `BOSS_LOOKS`, `BOSS_FIGHT`) already shows the repo's way of keeping a boss's data in one entry.

## Step 1: design (no code yet)

Deliver one short design note (`docs/shadow-wing-design.md`) with:

1. **A variant per level, six rows.** Levels in order: Channel, Sea of Sand, Long Night, Iron Forest, Winter Line, Burning City (`STAGE_ORDER`, `STAGE_NAMES`; levels 7 and 8 reuse the themes of 6 and 1). For each: a name suffix or tag (it stays "Shadow Wing" at its core), paint scheme and markings in that level's palette (for example snow white, sand, night with glowing engines, forest green, soot and fire), one silhouette change at most (wing tips, a third engine pod, a tail boom, a different canopy), and one new weapon behaviour. Say why each fits its level.
2. **Pattern budget.** Keep today's three weapons as the base. Each variant adds **one** new pattern or modifies one, so a variant has at most four. Keep the bullet count on screen at or under about 1.4 times today's peak (measure today's peak first, then state the number). Every pattern needs a readable tell: a short wind-up (a flash or a smoke burst) before it fires, and a clear gap the player can slip through.
3. **Escalation, not noise.** Variants should get harder in a gentle curve (level 1 close to today's wing), and the HP, speed and fire rates must stay inside today's `loop` and `DIFF` scaling. Say what the loop rank changes.
4. **Candidate new patterns to choose from**, for example: a rotating two-arm spiral, a sweeping line of shots (a curtain with one gap), a pair of slow aimed shells with fast fillers, a short charge down the screen and back, small drones released from the pods, a mine drop that hangs and then bursts. Pick the six that suit the levels best and drop the rest.
5. **A recipe format.** Describe the wing as data, not code: `{ palette, parts[], weapons: [{ pattern, params, every, offset, tell }], move }`. The sprite is built from the parts and the palette (`sprite(...)` helpers exist), and the weapons come from a small library of pattern functions (`aimedBurst`, `fan`, `ring`, `spiral`, `curtain`, ...). Level variants are then just six recipes. This is the preparation for the Generative mode in ROADMAP.md (mini-bosses from entity recipes): a later run could draw a recipe from the same parts and a seed. List the parameters a generator could vary, and the rules that keep any combination fair (a bullet budget, a minimum gap width, a mandatory tell).
6. **A mock-up of the six looks**, as a small standalone page or a PNG in `docs/` (like `docs/sower-art-v9.js`), so I can judge the sprites before they are wired in.
7. **Open choices, with your recommendation:**
   - Scope: the Enigma Run is the new standard campaign (see ARCHITECTURE.md), so the variants are built for it. Say whether the old Campaign wing stays as it is. Default: yes.
   - Level 4: does the Sower replace the wing or does the wing still appear?
   - Does the variant also change the drops or the pilot bail-out? (Default: no.)

Stop here and wait for my answer.

## Revision after review of the step 1 model

- The wing runs a **sequence of states, one at a time** (not concurrent timers): aim (barrels glow), fire, clear. The sequence differs per level and evolves from ship to ship (`docs/shadow-wing-design.md`, section 10).
- **Every shot starts at a visible gun** with a muzzle flash. The sprites carry the barrels (`docs/shadow-wing-art-v5.js`).
- Replace the old bullet-budget rule with: no two states on screen together, a tell of at least 24 frames, and a visible gun for every muzzle.

## Step 2: build (after approval)

- Implement the recipe table and the pattern library next to `ENT.wing` / `spawnWing()`. Keep all numbers in the recipe table, in one tunable place, and keep the pattern functions pure apart from the `eshot`/`ring` calls. The wing's update loop reads the recipe; it contains no per-level branches.
- Randomness: patterns use the run's seeded stream like today; sprite and smoke effects use the free stream. Nothing may draw extra random numbers in runs where the old wing stays in use.
- Sprites: bake each variant once at load (cache them), as `SPR.sower` is. The hit box may not change more than a few pixels, and `drawn size == hit size` as for the other units.
- Keep the name tag, boss bar and the dying animation working for every variant.
- Tests: there is no golden baseline for the Enigma Run at the moment (see ARCHITECTURE.md), so `tests/replay.mjs` is not a gate and must not be re-baselined here. Add a check that spawns each variant, runs it with the bot for its full 1600 frames without errors, and reports the peak bullets on screen against the budget. Say in the report that no golden comparison was possible.
- Update CHANGELOG.md, bump VERSION where the repo rules ask, and describe the recipe format in ARCHITECTURE.md.
- Show me a screenshot of each variant in play (Playwright is installed).

Out of scope: new bosses, other mini-bosses, score or drop changes, new music.
