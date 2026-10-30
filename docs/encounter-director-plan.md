# Encounter Director: plan

Status: proposal, nothing built yet. Based on the design brief "Feuervogel: Encounter Director" and checked against the code as of 2026-10-30.
Line numbers drift; search for the names given here.

## 1. Summary

The encounter director is a small scheduler inside the existing `director()`. It plays named, authored compositions of existing enemies (an *encounter*) on a frame clock, holds back the normal wave, ground and pod timers while it runs, tags the enemies it spawns, and lets shooters ask an *admission* check before they start a volley so the encounter stays inside a bullet budget.

It adds no enemy types, weapons or abilities. One small behaviour option is needed (a Heavy that holds a position, see 7.1); everything else is configuration of what exists.

The brief is sound. The changes below come from how the game is actually built: the main points are that orchestration already exists in a simple form, that every run must stay deterministic and resumable to the exact frame, and that the clock should be in frames.

## 2. What exists today (and what the brief missed)

| Fact in the code | Where | Consequence for the design |
|---|---|---|
| A pacing table already exists: `ARC` splits each level into zones (`mix`, `calm`, `air`, `ground`, `still`, `set1`, `set2`) with a density factor. | `ARC`, `directorInner` | Encounters live inside this arc. They don't replace it. |
| Authored set pieces already exist: `runSetPiece` plays two per level (`squadron`, `bombers`, `convoy`, `tanks`, `flak`) as a few timed wave calls. | `runSetPiece`, `SET_PIECES` | These are the first thing to replace. They are encounters without ownership, budget or completion. |
| The director runs on a seeded per-run random stream (`drand` swapped into `Math.random`). | `director()` | Encounter choice and positions are automatically deterministic if drawn inside the director. Never use the free stream. |
| Runs resume to the exact frame from a snapshot of `world`. Delayed callbacks in `world.later` must be named functions listed in `snapFns`, or `takeSnapshot` throws `SnapDirty` and skips saving. | `takeSnapshot`, `snapFns`, `tests/resume-exact.mjs` | The encounter schedule must be plain data on `world`, not closures in `world.later`. The current set pieces and `waveSweep`/`waveStrafe` use anonymous closures, so no save happens while they are pending. |
| `update()` returns early while paused or during the GET READY countdown, and the battle holds still on the continue screen. | `update()` | A frame clock advanced inside the director freezes by itself. No SUSPENDED state is needed for pause. |
| Player death doesn't stop the director. | `die()` | Matches the brief: death never resets an encounter. |
| `world.quiet` stops all spawning (stage end `clearField`, boss flyby, tutorial). | `director()`, `clearField`, `startFlyby` | This is the real "something else has taken control" signal. |
| Once the boss is triggered, `directorInner` returns early and only sends a 3-fighter dive every 360 frames. Boss weapon pods are spawned from the boss's own update. | `directorInner`, `ENT.boss` | Boss fights stay out of scope. Boss spawn cancels any pending encounter events. |
| Level-specific "mini-directors" already run beside the waves: `sowerTick` (level 4), `planTrains`, `planGuns`, `planNests` and others, plus the Shadow Wing at 14/37 of the level (`spawnWing`). | `directorInner` | An encounter must not start while the Wing or a Sower is on screen, unless it is built for that (see 7.4). |
| The Campaign is the Enigma levels 1A, 2, 3, 4, 5, 6B (`CAMP_LEVELS`), with `run.sortie` set. Retro Run is the old campaign, "as it was". | `startEnigma`, `startRetro` | Ship encounters in the Campaign (`run.sortie`) only. Retro Run, Endless and `gen` mode stay unchanged. |
| `golden.json` replays fly the old campaign. There is no Enigma replay baseline. | `tests/replay.js`, `tests/README.md` | Gating on `run.sortie` leaves `golden.json` untouched, which is a useful proof that nothing else changed. The Campaign needs its own regression check (Phase 0). |
| Enemy bullets: `eshot` drops new bullets past 420 on screen and during a Nova; on Rookie it drops every third ordinary bullet (`DIFF.skip`). | `eshot` | A hard technical limit already exists and already truncates patterns. The encounter budget is a design limit that sits well below it and delays volleys instead. |
| `canFire(e, margin)` is the shared "may I shoot now" test, used about 23 times. Several shooters (Heavy, fighters) have their own checks. | `canFire`, `ENT.*.update` | This is the natural place to hang the admission check, plus a few direct calls. |
| `W` is fixed at 224; `H` follows the window. | `ARCHITECTURE.md`, `ROADMAP.md` | Spawn positions are in fractions of `H` or "above the screen", never absolute y. |
| The simulation runs at a fixed 60 steps per second. | `frameLoop` | Schedule in frames. Seconds in this document are frames / 60. |
| Enemies have no ids. Children are pushed in the same call (flak crews in `makeFlak`) or later (missiles, revenge shots). | `E()`, `G()`, `makeFlak` | Ownership is a tag (`e.enc`) set while a dispatch runs, not an id list. |

Small corrections to the brief:
- "Talons, Lance, Nova bombs": the Lance is one of the four weapons, the Talon is the drone pickup and the Nova is the bomb.
- Daily Sortie doesn't exist yet, so it stays under future work.
- The six-level Campaign is correct (1A, 2, 3, 4, 5, 6B).

## 3. Scope

In:
- The Campaign and practice runs of its levels (`run.sortie` set), outside boss fights.
- 3–4 authored encounters, replacing the two `set1`/`set2` set pieces in Campaign levels first.
- An admission check for volleys, used by the shooters that the MVP encounters spawn, plus ground flak and tanks.

Out (as in the brief, plus):
- Retro Run, Endless, `gen` mode and the tutorial. They keep their current director, which is required for `golden.json` to stay unchanged.
- Boss fights and the Shadow Wing fight.
- Changing `eshot`'s hard limit or Rookie's `DIFF.skip`.

## 4. Data model

Definitions are constant data, kept apart from the runtime state. A sketch in the style of `ARC` and `SOWER`:

```js
// One encounter: a timed list of spawns, what it holds back, and its bullet budget. Times in frames (60 = 1 s).
const ENC = {
  anvil: { name: 'The Anvil', len: 600, max: 1500, rest: 180, budget: [16, 22, 28], biomes: null, levels: null,
    holds: { air: true, pod: true, ground: false },
    ev: [
      { t: 0,   do: 'heavy',  x: 0.5, hold: 0.28, holdT: 420 },
      { t: 90,  do: 'leader', x: 0.25 },
      { t: 210, do: 'leader', x: 0.75 },
      { t: 330, do: 'chase' },
      { t: 540, do: 'pod' }                 // the reward after the pressure
    ] },
  // ...
};
```

Fields:
- `len`: the intended length, for scheduling and diagnostics.
- `max`: a hard cap after which the encounter ends anyway (reason `timeout`). This is a safety net, not the normal end.
- `rest`: frames of quiet after it ends, before the normal timers resume. This is the recovery the brief asks for, made explicit.
- `budget`: enemy bullets on screen per difficulty (Rookie, Veteran, Ace).
- `holds`: which normal timers are held while it runs.
- `biomes` / `levels`: where it may run (`biomeAtSpawn()` values, Campaign level numbers).
- `ev`: the events, sorted by `t`.
- An event's `do` names a *spawn verb* (section 6). The other fields are that verb's options. An event may have `when` instead of `t` (a trigger, see 5.3).

Runtime state is one plain object on `world`, so the snapshot saves it with no extra code:

```js
world.enc = { id: 'anvil', st: 'run', t: 0, i: 0, owned: 0, why: null, rest: 0 }; // or null when idle
```

- `st`: `run`, `hold` or `rest`.
- `t`: the encounter clock in frames.
- `i`: the index of the next event (events before `i` are dispatched; there's no per-event status array).
- `owned`: how many tagged enemies are still alive (recounted each frame, see 5.4).
- `why`: the end reason, kept for diagnostics until the next start.

`world.enc` is cleared wherever `world.waveCd` is reset today (`newGame`, the stage start in `doFinishResults`, `startEnigma`), so a pending event can never leak into the next level.

## 5. Lifecycle

### 5.1 States

The brief's five states fold into three live states plus "no encounter":

| State | Meaning | Clock |
|---|---|---|
| none (`world.enc === null`) | IDLE. The normal director runs. | none |
| `run` | Dispatching due events, holding the timers named in `holds`. | advances |
| `hold` | Something else has the screen (`world.quiet`, the Shadow Wing, the carrier opening). Nothing is dispatched. | frozen |
| `rest` | All events dispatched and every owned enemy resolved (or `max` reached). Normal timers stay held for `rest` frames, then `world.enc = null`. | counts `rest` down |

COMPLETED and CANCELLED become the end reason (`why`: `done`, `timeout`, `boss`, `level`) and a return to idle. A finished encounter can't resume because its state object is gone, and each start makes a new one.

Pause, the GET READY countdown and the continue screen need no state, because `update()` doesn't call the director then.

### 5.2 One frame (inside `directorInner`, before the normal timers)

```
encTick(sc, b):
  E = world.enc; if (!E) return maybeStart(b)          // selection, 5.5
  if (world.bossSpawned) → end('boss')                  // pending events dropped; owned enemies live on
  if (world.quiet || wingOnScreen() || carrierRunning()) → st = 'hold'; return
  if (st == 'hold') st = 'run'
  if (st == 'rest') { hold timers; if (--rest <= 0) world.enc = null; return }
  t++
  while (i < ev.length && due(ev[i])) dispatch(ev[i++])   // in order, several per frame if due
  recount owned
  if (i == ev.length && owned == 0) → rest('done')
  if (t >= max) → rest('timeout')
  hold the timers in holds (same idiom as the zones: world.waveCd = Math.max(world.waveCd, 30))
```

- Events are dispatched in index order and never skipped. A late frame doesn't exist here, because the step loop is fixed, so "several due at once" only happens with `t` ties.
- `i` advances only after `dispatch` returns. A verb that can't place its spawn (no flak spot on screen, for example) returns false, and the event retries next frame for up to 60 frames, then is dropped and logged in `why`. This stops a missing ground spot from stalling the whole encounter.

### 5.3 Triggers

Most events are timed (`t`). Two triggers are enough for the MVP:
- `when: 'clear'`: the owned enemies spawned so far are all resolved. Use this for "next beat after you dealt with this one".
- `when: 'sower'`: a Sower is in its `hold` state (for 7.4).

A trigger event also has a `by` frame after which it fires anyway, so pacing never hangs on a dodging enemy.

### 5.4 Ownership and completion

While `dispatch` runs, a module-level `encTag` holds the encounter id. `E()` and `G()` copy it to `e.enc` when set, so anything created in the same call is tagged, including flak crews and convoy trucks. Missiles and revenge shots spawned later aren't tagged, which is right, because they aren't composition.

Owned enemies are those with `e.enc === E.id` that are not `dead`. Enemies already mark themselves dead when they leave the screen, so "resolved" means killed or escaped, with no special case. Two exceptions need checking per verb: ground units with `keep`, and parked or static units that scroll off slowly. If a unit can outlive the encounter by a lot, the verb doesn't tag it, and `max` is the backstop.

No closures: verbs that stagger spawns today (`waveSweep`, `waveStrafe`) are written as several events in the encounter instead, so the schedule stays plain data and the snapshot keeps working. A later cleanup can give the old set pieces the same treatment.

### 5.5 Selection: when an encounter starts

MVP rule, deterministic and simple:
- In a Campaign level, the `set1` and `set2` zones start an encounter instead of `runSetPiece`. The choice comes from a per-level list (as `SET_PIECES` does now), filtered by `biomes`/`levels`. If none fits, the old set piece runs.
- No start when the boss is within reach (`ARC_U` above 0.9), in `still`, while the Wing or a Sower is on screen, or within `rest` of the last encounter.

Later, once encounters are proven, `mix` zones can start one with a small chance per level. That's a tuning step, not part of the MVP.

## 6. Spawn verbs

Each verb wraps an existing spawner. The director owns when, where and which options; the enemy code stays the same.

| Verb | Wraps | Options | Notes |
|---|---|---|---|
| `dive` | `waveDive(n)` | `n`, `x` (0–1 of `W`) | Needs an optional `cx` argument. |
| `leader` | `waveLeader()` | `x` | Needs an optional `cx`. Gated by `avail('leader')`: in the Campaign, check that the level has it. |
| `fighter` | `mkFighter` | `side`, `y` (0–1 of `H`), `heading`, `strafe`, `homeT`, `fireAt` | One fighter. Sweeps and strafes are written as 4–5 of these, 11–16 frames apart. |
| `chase` | `waveChase()` | none | |
| `heavy` | `waveHeavy()` | `x`, `hold`, `holdT` | `hold` needs the small Heavy option in 7.1. |
| `bomber` | `waveBomber()` | `x` | |
| `pfeil` | `wavePfeil()` | none | Campaign level 3 and on. |
| `flak` | `spawnGround` with `FORCE_GROUND = 'flak'` | none | Placement is the ground code's, because it knows roads, water and houses. The verb returns false when nothing was placed. |
| `convoy` | `convoy(wy, trucks)` | `trucks` | Not over sea or coast biomes. |
| `pod` | `E('pod', …)` | `x` | A pod is a reward. Place it after the pressure, not during it. |

Not a verb: the Sower and the Shadow Wing. They are level set pieces with their own directors (`sowerTick`, `spawnWing`). Encounters can react to them (7.4) but never spawn them.

## 7. MVP encounters

Four compositions, one per idea from the earlier discussion. Each has one anchor, one pressure and one restriction, and announces the restriction before the pressure arrives.

### 7.1 The Anvil: Heavy holding while fighters close in

- **Anchor:** a Heavy that stops at about 28% of `H` and holds for 7 s, firing its 3-way spread on its normal cycle.
- **Pressure:** two leader formations from the sides, 1.5 s and 3.5 s in, then a chase pair.
- **Readability:** the Heavy is visible and stopped before the first formation arrives.
- **Player choice:** burn the Heavy down (Lance, Arc ramp) and take the formations on the way, or kill the leaders so their wingmen scatter, then go back to the Heavy.
- **Behaviour change:** `ENT.heavy` gets two optional fields, `holdY` and `holdT`. While holding, it doesn't drift down, and when `holdT` runs out it resumes its old motion. Without these fields it behaves exactly as now. This is the only change to enemy code in the MVP.

### 7.2 Flak lane: a formation breaking up over flak

- **Restriction:** two flak guns placed as early as possible (they scroll in from the top, giving about 2 s of warning).
- **Pressure:** a leader formation 2.5 s later, then strafing fighters from one side.
- **Readability:** the flak is on screen before the formation. When the leader dies, the wingmen scatter into air the flak already covers.
- **Terrain:** land biomes only (`spawnGround` refuses water).
- **Player choice:** kill the flak first (ground priority, Seekers), or hold a lane between the flak's fire and take the leader early.

### 7.3 Bomber screen: prioritisation

- **Anchor:** a Bomber, which has high hit points and fires steadily.
- **Pressure:** three-fighter dives at 1 s, 3 s and 5 s, then one strafe.
- **Budget:** the lowest of the four, so the Bomber's shots stay readable. When the budget is full, the fighters' single shots wait, not the Bomber's.
- **Player choice:** focus the Bomber, or clear the dives. Scatter and Arc chains both have a clear job.

### 7.4 Sower window (level 4 only)

- **Trigger:** `when: 'sower'`. It starts only when the Sower settles into its hold, and doesn't spawn the Sower itself.
- **Restriction:** the Sower's mines, which persist and drift with the ground.
- **Pressure:** a tank convoy on the road below and one flak gun. Air waves are held.
- **Player choice:** stay at the sides and work the ground targets, or move up beside the Sower and kill it.
- **Budget:** the mines count as bullets, so the convoy's fire is admitted only while there's room. This is the encounter that most needs the budget.
- **Setup:** `sowerTick` keeps its current behaviour. The encounter only holds the air timer and adds ground units under the hold.

## 8. Bullet budget

- **Technical limit (unchanged):** `eshot` refuses bullets past 420 and during the Nova flash.
- **Design budget (new):** `encBudget()` returns the active encounter's `budget[settings.diff]`, or `Infinity` when there's no encounter. The budget is counted in enemy bullets on screen (`world.ebul.length`). That's the same measure `balance-real.mjs` reports as the worst 10 s window, so tuning and testing use one number.
- **Admission:** `volleyOK(n)` is true when `world.ebul.length + n <= encBudget()`. A shooter calls it once before a volley with the volley's size, never per bullet, so admitted patterns are always whole.
- **When refused,** the shooter keeps its cooldown at 1 frame and asks again next frame, which delays the volley. Where the shooter has a natural "start attack" state (the Heavy's `pause`, the Bomber's `gcd`), it doesn't enter that state. Nothing is deleted and nothing in flight is cut.
- **Where it's called in the MVP:** fighter `fireAt` and strafe shots, Heavy pause start, Bomber `gcd`, flak and tank cooldowns. That's about six call sites. Adding it to `canFire` (with `n = 1`) is a later step, after measuring.
- **Who it applies to:** every shooter on screen while an encounter runs, not only owned ones. The load on the player is all bullets, and the ground units of the normal director are part of the same screen.
- **Not gated:** boss parts (no encounters during bosses), revenge shots (they're immediate feedback to a kill, and delaying them would make them read as random fire), the Shadow Wing and the Sower's mines (set pieces with their own tuning). They still count toward the total.
- **Priority:** the first version has none (first come, first served). If a slow anchor gets starved by fast fighters, give each `volleyOK` call a class, and let anchors use the full budget while light shooters stop at 80% of it.
- **Determinism:** admission depends only on simulation state, so runs stay reproducible and resumable.

## 9. Determinism, saving and tests

Rules:
- All randomness in the director goes through the seeded stream, which is automatic inside `director()`.
- No closures in `world.later` for encounter work. If a delayed callback is truly needed, it is a named function added to `snapFns`.
- `world.enc` is plain data. `encTag` is set and cleared inside one `dispatch` call, so it never needs saving.

Tests:
- `golden.json` must stay identical. That proves Retro Run, Endless and the tutorial are untouched, and it's checked by CI.
- New `tests/encounter.mjs` (Playwright, in the style of `drilling.mjs`). A local-build hook forces an encounter in a chosen level, then checks:
  - every event is dispatched exactly once and in order;
  - the owned count rises and falls as expected, and the end reason is `done`;
  - the held timers don't fire while it runs, and resume after `rest`;
  - pause and the continue screen freeze the clock;
  - a player death doesn't reset the clock or the event index;
  - the end of the level and the boss spawn end it (`level`, `boss`), and nothing from it spawns in the next level;
  - during an encounter, enemy bullets on screen stay within `budget` plus one volley, and every admitted Heavy volley has all its bullets.
- `tests/resume-exact.mjs` gets a scenario saved in the middle of an encounter, which must replay identically.
- `tests/jitter.mjs` and `tests/no-pop-in.mjs` must still pass, because encounter ground units go through the same placement.

## 10. Phases

Each phase ends with its check passing.

**Phase 0: baseline (no gameplay change)**
- Record the Campaign's current numbers with `node tests/balance-real.mjs --levels --attrib --diffs 0,1,2`: worst bullet window, bullets before the boss, hits per level, and which shooters fill the windows.
- Add a small Enigma-level replay baseline (two or three levels, fixed seed) so later phases can show exactly what changed. Unlike `golden.json`, it is updated on purpose in each phase.
- **Done when:** the numbers are saved, and the baseline reproduces on two runs.

**Phase 1: definitions and verbs**
- Add the `ENC` table, the verbs and the optional `cx` arguments.
- Add the Heavy's `holdY`/`holdT` option.
- Nothing calls them yet.
- **Done when:** `golden.json` and the Enigma baseline are unchanged.

**Phase 2: execution**
- Add `encTick`, ownership tagging, the timer holds, `rest`, the end reasons and the resets.
- Add a hook so tests can force an encounter.
- Add `tests/encounter.mjs` and the mid-encounter resume scenario.
- **Done when:** the new tests pass, and `golden.json` is unchanged.

**Phase 3: budget**
- Add `volleyOK` at the six call sites.
- **Done when:**
  - the budget tests pass;
  - `balance-checks.mjs` passes;
  - the worst 10 s window inside encounters is at or below the budget.

**Phase 4: replace the set pieces**
- In the Campaign, `set1`/`set2` start encounters (5.5).
- Compare with the Phase 0 numbers per level and difficulty.
- Playtest by hand: the bot dodges better than people do, so its numbers are for comparison only.
- Refresh the Enigma baseline and note the change in `CHANGELOG.md`.
- **Done when:** the playtest questions in section 11 have acceptable answers for all four encounters on all three difficulties.

## 11. Playtesting

These are the brief's questions, plus numbers to look at alongside them:

| Question | Number to watch (bot or manual) |
|---|---|
| Is it readable? | Hits taken per encounter, against the same stretch before the change. A big rise with a flat bullet count means it's unreadable, not dense. |
| What's the cognitive load? | The worst 10 s bullet window inside the encounter, and which shooters fill it (`--attrib`). |
| Is there tactical variety? | Time to clear per weapon (`SF.human(…, 'S4')` etc.). If one weapon is far ahead in every encounter, the compositions aren't asking different things. |
| Is there pacing and recovery? | Bullets on screen over time, which should show a peak, then the `rest` gap visibly lower. |
| Is it fair? | Ace has more hits than Veteran, and Veteran more than Rookie (`balance-checks.mjs` already asserts this per run). |
| Do Novas and Lance matter? | Novas fired inside encounters, and the share of owned enemies killed versus escaped. |

## 12. Risks and open questions

1. **Leaderboard comparability.** The Campaign is ranked. Changing its spawns changes what scores are possible. Decide whether this ships with a version note only, or needs a board reset or season mark.
2. **Heavy hold.** This is the one behaviour change. Is the owner fine with it, or should 7.1 time the formations around the Heavy's natural pause instead? That works but reads weaker.
3. **Replace or add?** The plan replaces the two set pieces per level, which keeps the level length and density the same overall. Adding encounters on top would make every level denser.
4. **Ground placement can fail** (water, towns, plans with fixed guns). The retry window in 5.2 handles it, but an encounter whose restriction never appears is a different encounter. The test should report how often each verb fails per level.
5. **Starving anchors under the budget.** If fast shooters always take the free room, the anchor goes quiet. Watch for this in Phase 3, and add the priority classes from section 8 if it happens.
6. **Retro Run later?** Keeping it out is deliberate: it is the reference version, and its replays guard the refactor. Revisit only if the owner wants it.

## 13. Out of scope

As in the brief: new enemy types, weapons or abilities, an editor, procedural generation, adaptive difficulty, telemetry, a Campaign redesign, and progression systems. Also: boss fights, the Shadow Wing, Retro Run and Endless.

## 14. Later

These follow the brief:
- A larger encounter library, reused across levels by `biomes`.
- Variants (timing jitter from the seeded stream, mirrored sides).
- Encounters started in `mix` zones.
- Validated encounters as the building blocks of a future Daily Sortie and of procedural levels, which stay reproducible because they are plain data driven by the run's seed.
