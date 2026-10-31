# Encounter Director: plan

Status: Phase 0 done (baseline numbers and the Campaign replay baseline; findings in section 10). Execution step 3 done: the director runs The Anvil end to end, started only by `encStart` from tests, so players see no change (section 10, Phase 2). Based on the design brief "Feuervogel: Encounter Director" and checked against the code as of 2026-10-30. Revised after review: Sower exception, ownership counting, soft budget, atomic verbs, timeout and hold rules, Sower Window test. Second revision: Rookie event filter, ground arrival timing, loops and rank, tuning readout, start cue, two-player and weak-weapon checks.
Line numbers drift; search for the names given here. Points marked **(inspect)** need a look at the source or a test before they are built; the plan does not assume an answer. Points marked **(checked)** were answered in Phase 0.

## 1. Summary

The encounter director is a small scheduler inside the existing `director()`. It:
- plays named, authored compositions of existing enemies (an *encounter*) on a frame clock;
- freezes the normal wave, ground and pod timers it names while it runs;
- tags what it spawns, and counts only the threatening part toward completion;
- lets selected shooters ask an *admission* check before they start a volley, so the encounter has a soft bullet budget. Ungated sources can still push the total above the budget, and the implementation measures how often that happens.

It adds no enemy types, weapons or abilities. One small behaviour option is needed (a Heavy that holds a position, see 7.1); everything else is configuration of what exists.

The brief is sound. The changes below come from how the game is actually built: the main points are that orchestration already exists in a simple form, that every run must stay deterministic and resumable to the exact frame, and that the clock should be in frames.

## 2. What exists today (and what the brief missed)

| Fact in the code | Where | Consequence for the design |
|---|---|---|
| A pacing table already exists: `ARC` splits each level into zones (`mix`, `calm`, `air`, `ground`, `still`, `set1`, `set2`) with a density factor. | `ARC`, `directorInner` | Encounters live inside this arc. They don't replace it. |
| Authored set pieces already exist: `runSetPiece` plays two per level (`squadron`, `bombers`, `convoy`, `tanks`, `flak`) as a few timed wave calls. | `runSetPiece`, `SET_PIECES` | These are the first thing to replace. They are encounters without ownership, budget or completion. |
| The director runs on a seeded per-run random stream (`drand` swapped into `Math.random`). | `director()` | Encounter choice and positions are automatically deterministic if drawn inside the director. Never use the free stream. |
| Runs resume to the exact frame from a snapshot of `world`. Delayed callbacks in `world.later` must be named functions listed in `snapFns`, or `takeSnapshot` throws `SnapDirty` and skips saving. | `takeSnapshot`, `snapFns`, `tests/resume-exact.mjs` | The encounter schedule must be plain data on `world`, not closures in `world.later`. The current set pieces and `waveSweep`/`waveStrafe` use anonymous closures, so no save happens while they are pending. |
| `update()` returns early while paused or during the GET READY countdown, and the battle holds still on the continue screen. | `update()` | The whole simulation freezes, so the encounter clock freezes with it. No state is needed for this. |
| `director()` returns before `directorInner` while `world.quiet` is set (stage end `clearField`, boss flyby, tutorial). Enemies and bullets keep moving. | `director()`, `clearField`, `startFlyby` | Neither the encounter clock nor the normal timers move while `world.quiet` is set, so this case needs no code either. |
| Player death doesn't stop the director. | `die()` | Matches the brief: death never resets an encounter. |
| Once the boss is triggered, `directorInner` returns early and only sends a 3-fighter dive every 360 frames. Boss weapon pods are spawned from the boss's own update. | `directorInner`, `ENT.boss` | Boss fights stay out of scope. Boss spawn cancels any pending encounter events. |
| Level-specific "mini-directors" already run beside the waves: `sowerTick` (level 4), `planTrains`, `planGuns`, `planNests` and others, plus the Shadow Wing at 14/37 of the level (`spawnWing`). `sowerTick` already keeps the Wing and the Sower off the screen together. | `directorInner`, `sowerTick` | Ordinary encounters don't start while the Wing or a Sower is active. The Sower Window (7.4) is the one explicit exception. |
| The Campaign is the Enigma levels 1A, 2, 3, 4, 5, 6B (`CAMP_LEVELS`), with `run.sortie` set. Retro Run is the old campaign, "as it was". | `startEnigma`, `startRetro` | Ship encounters in the Campaign (`run.sortie`) only. Retro Run, Endless and `gen` mode stay unchanged. |
| `golden.json` replays fly the old campaign. There is no Enigma replay baseline. | `tests/replay.js`, `tests/README.md` | Gating on `run.sortie` leaves `golden.json` untouched, which is a useful proof that nothing else changed. The Campaign needs its own regression check (Phase 0). |
| Enemy bullets: `eshot` drops new bullets past 420 on screen and during a Nova; on Rookie it drops every third ordinary bullet (`DIFF.skip`). | `eshot` | A hard technical limit already exists and already truncates patterns. The encounter budget is a design limit well below it and delays volleys instead. Both existing rules stay as they are. |
| `canFire(e, margin)` is the shared "may I shoot now" test, used about 23 times. Several shooters (Heavy, fighters) have their own checks. | `canFire`, `ENT.*.update` | This is the natural place to hang the admission check later. The MVP calls it directly at a few sites. |
| All enemies are made by `E()`. `G()` (ground) and `mkFighter` call it. Item drops (`mkItem`) don't. | `E`, `G`, `mkFighter`, `mkItem` | One line in `E()` tags everything a dispatch creates. The weapon item a pod drops is never tagged. |
| `ENT[type].harmless` marks non-threatening entities (bridges, troops, radar, parked planes, fuel, staff cars and others), read through `harmlessE()`, which also respects an armed bike. The pod and the truck are *not* marked harmless. | `harmlessE`, `ENT` | Completion counts only entities that pass a threat test built on `harmlessE` (5.4). |
| `FORCE_GROUND = 'flak'` does not force flak: `spawnGround` checks it only after its other branches, so the call often returns early with a train, a planned gun slot (parked plane, AA tower, bunker), an armoured car, camouflage, a pop-up gun or a radar. When it does reach the flak branch, it tries two placements and can create 0, 1 or 2 guns. `convoy` can create 0 to 3 vehicles and draws its size and kinds from the random stream. | `spawnGround`, `convoy`, `runSetPiece` | Today's `flak` set piece is unreliable for the same reason. The encounter's flak verb needs its own early branch (section 6). Spawn verbs need an explicit success rule (5.2). |
| `W` is fixed at 224; `H` follows the window. | `ARCHITECTURE.md`, `ROADMAP.md` | Spawn positions are in fractions of `H` or "above the screen", never absolute y. |
| The simulation runs at a fixed 60 steps per second. | `frameLoop` | Schedule in frames. Seconds in this document are frames / 60. |

Small corrections to the brief:
- "Talons, Lance, Nova bombs": the Lance is one of the four weapons, the Talon is the drone pickup and the Nova is the bomb.
- Daily Sortie doesn't exist yet, so it stays under future work.
- The six-level Campaign is correct (1A, 2, 3, 4, 5, 6B).

## 3. Scope

In:
- The Campaign and practice runs of its levels (`run.sortie` set), outside boss fights.
- 3–4 authored encounters, replacing the two `set1`/`set2` set pieces in Campaign levels. Encounters are never added on top of them.
- An admission check for volleys, used by the shooters that the MVP encounters spawn, plus ground flak and tanks.

Out:
- Retro Run, Endless, `gen` mode and the tutorial. They keep their current director, which is required for `golden.json` to stay unchanged.
- Boss fights and the Shadow Wing fight.
- Changing `eshot`'s hard limit or Rookie's `DIFF.skip`.

## 4. Data model

Definitions are constant data, kept apart from the runtime state. A sketch in the style of `ARC` and `SOWER`:

```js
// One encounter: a timed list of spawns, what it holds back, and its soft bullet budget. Times in frames (60 = 1 s).
const ENC = {
  anvil: { name: 'The Anvil', len: 600, max: 1500, rest: 180, budget: [16, 22, 28], biomes: null, levels: null,
    holds: { air: true, pod: true, ground: false },
    ev: [
      { t: 0,   do: 'heavy',  x: 0.5, hold: 0.28, holdT: 420 },
      { t: 90,  do: 'leader', x: 0.25 },
      { t: 210, do: 'leader', x: 0.75, diff: [1, 2] },   // not on Rookie
      { t: 330, do: 'chase' },
      { t: 540, do: 'pod', own: false }      // the reward after the pressure; never keeps the encounter alive
    ] },
  // ...
};
```

Fields:
- `len`: the intended length, for scheduling and diagnostics.
- `max`: a safety cap. When it is reached the encounter ends with `why: 'timeout'` (5.6). It is not the normal end.
- `rest`: frames of recovery after the encounter ends, while the held timers stay frozen. This is the recovery the brief asks for, made explicit.
- `budget`: the soft budget in enemy bullets on screen, per difficulty (Rookie, Veteran, Ace). It is the same on a repeat loop of the Campaign; see section 8 for why and how that is checked.
- `holds`: which normal timers are frozen while it runs, holds and rests.
- `biomes` / `levels`: where it may run (`biomeAtSpawn()` values, Campaign level numbers).
- `start`: how the encounter is started (5.5). `'slot'` (the default) means it fills a `set1`/`set2` slot. `'sower'` means it waits for a Sower to settle into its hold.
- `ev`: the events, sorted by `t`.
- An event's `do` names a *spawn verb* (section 6). The other fields are that verb's options. An event may have `when` instead of `t` (a trigger, see 5.3). `own: false` marks an event whose entities are tagged for diagnostics but never counted toward completion (rewards and scenery). `diff` lists the difficulties the event runs on (default: all), so an encounter can be lighter on Rookie than a budget alone would make it.

Why `diff` matters: today the director thins waves on Rookie (to 70% in stage 1, 85% elsewhere) through the `dens` factor, which only scales the normal timers and never touches an encounter. The first slot (`set1`, about 28% into level 1A) is one of the first things a new player meets, so each encounter is checked on Rookie and drops events with `diff` until it reads as clearly as today's set piece there.

Runtime state is plain data on `world`, so the snapshot saves it with no extra code:

```js
world.enc = { id: 'anvil', st: 'run', t: 0, i: 0, owned: 0, tries: 0, rest: 0, over: 0, peak: 0 }; // or null when idle
world.encLast = { id: 'anvil', why: 'done', t: 812, over: 0, peak: 19, dropped: 0 };    // the last encounter's end, or null
world.encPend = null;                                                                   // a slot waiting to start (5.5), or null
```

- `st`: `run`, `hold` or `rest`.
- `t`: the encounter clock in frames.
- `i`: the index of the next event. Events before `i` are dispatched or dropped; there's no per-event status array.
- `owned`: how many counted enemies are still alive (5.4).
- `tries`: frames the current event has failed to dispatch (5.2).
- `over` / `peak`: frames spent over the soft budget, and the most enemy bullets on screen (section 8).

When the encounter ends, its id, end reason, clock and budget figures are copied into `world.encLast`, and `world.enc` becomes `null` after the rest. `world.encLast` is overwritten by the next end, so it holds one small object, enough for tests and the debug readout without a tracking system.

All three are cleared wherever `world.waveCd` is reset today (`newGame`, the stage start in `doFinishResults`, `startEnigma`), so a pending event can never leak into the next level.

## 5. Lifecycle

### 5.1 States

The brief's five states fold into three live states plus "no encounter":

| State | Meaning | Clock | Held timers |
|---|---|---|---|
| none (`world.enc === null`) | IDLE. The normal director runs. | none | run normally |
| `run` | Dispatching due events. | advances | frozen |
| `hold` | The director is held while the simulation continues (see below): the Shadow Wing is on screen, the carrier opening is running, or (ordinary encounters only) a Sower is active. Nothing is dispatched. Enemies already on screen keep moving and firing. | frozen | frozen |
| `rest` | The encounter has ended (`done` or `timeout`). Recovery before normal spawning resumes. | counts `rest` down | frozen |

COMPLETED and CANCELLED become the end reason (`why`: `done`, `timeout`, `boss`, `level`). A finished encounter can't resume because its state object is gone, and each start makes a new one.

There are two kinds of stop:
- **Full simulation pause:** pause, the GET READY countdown and the continue screen. `update()` doesn't run, so everything freezes and no state is needed.
- **Director hold, with the simulation running:** `world.quiet` is already handled by `director()` returning early, which also stops the normal timers. The Wing, the carrier and the Sower need the `hold` state, because `directorInner` keeps running in those cases.

### 5.2 One frame (inside `directorInner`, before the boss early-return and before the normal timers)

```
encTick(sc, b):
  E = world.enc
  if (!E) return maybeStart(b)                             // selection, 5.5
  if (world.bossSpawned) → end('boss')                     // pending events dropped; owned enemies live on; no rest
  if (E.st == 'rest') { if (--E.rest <= 0) world.enc = null; return }
  if (heldBySomethingElse(E)) { E.st = 'hold'; recount; return }   // Wing, carrier, or a Sower for an ordinary encounter
  E.st = 'run'; E.t++
  while (E.i < ev.length && due(ev[E.i])):
    if (!forThisDiff(ev[E.i])) { E.i++; continue }           // a `diff`-filtered event is skipped, not dropped
    if (dispatch(ev[E.i])) { E.i++; E.tries = 0 }
    else if (++E.tries > 60) { E.i++; E.tries = 0; dropped++ }   // give up on this event, go on with the next
    else break                                             // retry next frame; later events wait behind it
  recount owned; track over/peak (section 8)
  if (E.i == ev.length && E.owned == 0) → end('done')      // into rest
  else if (E.t >= max) → end('timeout')                    // into rest, 5.6
```

The normal timers stay frozen while `world.enc` is not null, whatever the state (`run`, `hold` or `rest`):
- **Freezing:** each timer named in `holds` skips its decrement. The three lines in `directorInner` become, for example, `if (!encHeld('air') && --world.waveCd <= 0)`.
- **Resuming:** when `world.enc` becomes `null`, each timer resumes from the value it had. Nothing is reset or shortened, so a normal wave can't fire early or late because of the encounter.
- **Not the zone clamp:** this differs from the zones' `Math.max(cd, 30)` clamp, which lets a timer fire 30 frames after the zone ends. The zone clamps keep working as before.
- **(checked) Zone clamps:** the zones' clamps only ever raise a timer to 30, never lower it. If a clamp hits a frozen timer below 30 (an encounter running into `calm`, for example), that timer resumes 30 frames later than it would have. No wave can come early, so no ordering code is needed. For scale, the `set` zones themselves are short: in level 1A, `set1` lasts 300 frames (frame 2130–2430) and `set2` 330 frames (5790–6120), so an encounter of 10–25 s always runs on into the next zone. That's fine, because the freeze, not the zone, holds the timers.

**Dispatch contract (all verbs):**
- **`true`:** the event was dispatched. It may have created fewer entities than the verb could make, for example one flak gun of two. Partial success counts as success and is never retried.
- **`false`:** the verb created nothing and changed no world state, so retrying is safe.
- **Never:** a verb never creates something and then returns `false`. `dispatch` enforces this by comparing `world.enemies.length` before and after the call. If entities were created, the event counts as dispatched, whatever the verb returned.

**Start cue:** when an encounter starts, it plays the same warning haptic that `runSetPiece` plays today (`haptic('warn')`). This gives every authored moment the same small signal, and adds no banner or new visual. The haptic is cosmetic and doesn't touch the simulation.

Retries draw from the seeded stream again (`convoy` draws its size), which stays deterministic but means a retried event can differ from what the first try would have made. That's acceptable. Events are dispatched in index order and never skipped except after 60 failed tries; ties on `t` dispatch in the same frame, in order.

### 5.3 Triggers

Most events are timed (`t`). Two triggers are enough for the MVP:
- `when: 'clear'`: the counted enemies spawned so far are all resolved. Use this for "next beat after you dealt with this one".
- **(built)** `after: n`: due `n` frames after the event before it was dispatched (`world.enc.lastT`). Used for staggered runs like Flak lane's strafers, so they keep their spacing whenever the event before them fires.
- **(built)** `when: 'seen'`: every ground unit placed by an earlier event (named by its index, `of: 0`) is on screen, `y` at least a set share of `H` (`at: 0.15`). Use this for "the pressure comes only after the restriction is visible". It's needed because ground units are placed above the screen and scroll in at the constant `SCROLL` of 0.4 px per frame: about 85 frames (1.4 s) before a unit is visible at all, and several more seconds before it reaches mid-screen. A frame-timed event can't express "after the flak is visible" reliably. **(checked)** Both ground spawners place on the row 34 px above the top edge (`wy = -34 - scroll`). `tryLand` picks only the x position, and `convoy` puts each further vehicle higher up the road. So the first unit is visible after about 85 frames, and reaches 15% of `H` after roughly 240 frames at `H = 408`.

A trigger event also has a `by` frame after which it fires anyway, so pacing never hangs on a dodging enemy.

Starting the Sower Window is not an event trigger. It is a start rule (5.5).

### 5.4 Ownership and completion

While `dispatch` runs, a module-level `encTag` holds the encounter id and the event's `own` flag. `E()` copies them onto every entity it creates (`e.enc = id`, `e.encOwn = own`). So everything created in the same call is tagged, including flak crews (troops) and convoy trucks. Missiles, revenge shots and the item a pod drops are created later or outside `E()`, so they aren't tagged. That's right, because they aren't composition.

An entity counts toward completion when all of these hold:
- `e.enc === E.id`;
- `e.encOwn !== false`: the event wasn't `own: false`;
- `!harmlessE(e)`: this excludes troops, bridges, radar, parked planes and the other `harmless` types;
- `e.type !== 'pod'`: a pod is a reward even when a verb other than `pod` creates it;
- it is not `dead`.

The truck is not marked harmless. **(checked)** It doesn't shoot, so the `convoy` verb with `trucks: true` sets `own: false`. Trucks are targets, not threats.

Enemies already mark themselves dead when they leave the screen, so "resolved" means killed or escaped, with no special case. **(inspect, in the Phase 2 tests)** For each verb, check that its units do leave: ground units with `keep`, and static units that scroll off slowly. If one can outlive the encounter by a lot, its verb sets `own: false`, and `max` is the backstop.

No closures: verbs that stagger spawns today (`waveSweep`, `waveStrafe`) are written as several events in the encounter instead, so the schedule stays plain data and the snapshot keeps working.

### 5.5 Selection: when an encounter starts

Slots:
- Each Campaign level has two encounter slots, at the `set1` and `set2` zones, where `runSetPiece` runs today. The slot list per level replaces `SET_PIECES` for Campaign levels. The count of authored moments per level stays the same.
- When a slot zone is entered, `setPieceDone` marks it as before, and the slot's encounter is stored in `world.encPend`.
- If no encounter in the slot's list fits the level and biome, the old set piece runs instead, so nothing is lost.

`world.encPend` starts when every rule below holds, checked each frame:

| Rule | Ordinary encounter | Sower Window |
|---|---|---|
| No encounter in `run`, `hold` or `rest`. | yes | yes |
| No counted enemy of an earlier encounter alive (also after a timeout, 5.6). | yes | yes |
| Boss not spawned, and `ARC_U` below 0.9 (not in `still`). | yes | yes |
| No Shadow Wing on screen. | yes | yes (`sowerTick` already keeps them apart) |

The other direction matters as well: **the Shadow Wing waits for a running encounter** and its rest (`spawnWing` is not called while `world.enc` exists). Without this, the first slot would run into the Wing: in level 1A, `set1` starts at frame 2130 and the Wing is due at about frame 2930, while The Anvil with its rest takes 900–1300 frames. A playtest also reported the Wing arriving together with The Anvil. The Wing comes the frame after the rest ends, so the rest is the only gap between the two. If that feels too tight, the Wing can wait a little longer after the encounter.
| No Sower active (any `sower` not dead). | yes | n/a: this is its start condition |
| The `set2` zone has been reached, a Sower has entered `st === 'hold'` since then, and that Sower isn't marked `encSeen`. | n/a | yes. The Sower is marked `encSeen` so it starts one encounter only, and its called partner doesn't start a second. |

A pending slot whose rules still fail when `ARC_U` reaches 0.9 is dropped, and `world.encLast` records `why: 'skipped'`.

Level 4 has one ordinary slot (`set1`). Its `set2` slot is given to the Sower Window, so level 4 still has two authored moments. The Sower Window waits for the first Sower hold *at or after the start of the `set2` zone*, not for any Sower. **(checked)** The Sower comes twice in level 4: at about 5–17% of the level, before `set1`, and again at about 70–75%, which is exactly the `set2` zone (frames 7170–7500 in the probe, with a fixed ground seed, so this repeats on every run). The first Sower stays on its own, as the player's introduction to it, and the second becomes the Sower Window. If no Sower settles between the `set2` zone and the 0.9 limit, nothing runs in that slot. Today's `set2` set piece in level 4 already runs on top of that second Sower, which may explain part of level 4's high bullet window (section 10); this is not yet verified.

Later, once encounters are proven, `mix` zones may start one with a small chance per level. That's a tuning step, not part of the MVP.

### 5.6 Timeout

Reaching `max` ends the encounter with `why: 'timeout'`. Then:
- counted enemies still alive keep existing and acting; nothing is removed;
- the encounter goes into `rest` as after `done`, and the held timers resume after the rest;
- the next encounter waits until no counted enemy of this one is alive (5.5), and is dropped if that is never true before the 0.9 limit.

A timeout is a safety termination, not a failure of the player or of the run. It is kept separate from `done` in `world.encLast` and in the tests: a test that forces an encounter and plays it out expects `done`, and any `timeout` in the bot runs is reported as a tuning problem with that composition.

## 6. Spawn verbs

Each verb wraps an existing spawner. The director owns when, where and which options; the enemy code stays the same.

| Verb | Wraps | Options | Can fail? | Notes |
|---|---|---|---|---|
| `dive` | `waveDive(n)` | `n`, `x` (0–1 of `W`) | no, atomic | **(built)** With an optional centre; Bomber screen's three-plane dives. |
| `formation` | `waveLeader()` or `waveDive(5)` | `x` | no, atomic | **(built)** A leader with four wingmen where `avail('leader')` allows (from stage 4 in the `FEAT` table), a five-plane dive before that, so one encounter works in every level. The Anvil uses this. |
| `leader` | `waveLeader()` | `x` | no, atomic | Needs an optional `cx`. Gated by `avail('leader')`: check at selection that the level has it, so dispatch never meets it. |
| `fighter` | `mkFighter` | `side`, `y` (0–1 of `H`), `heading`, `strafe`, `homeT`, `fireAt` | no, atomic | One fighter. Sweeps and strafes are written as 4–5 of these, 11–16 frames apart. |
| `chase` | `waveChase()` | none | no, atomic | |
| `heavy` | `waveHeavy()` | `x`, `hold`, `holdT` | no, atomic | `hold` needs the small Heavy option in 7.1. |
| `bomber` | `waveBomber()` | `x` | no, atomic | **(built)** With an optional centre. |
| `pfeil` | `wavePfeil()` | none | no, atomic | Campaign level 3 and on, checked at selection. |
| `flak` | `spawnGround` with a new value, `FORCE_GROUND = 'encFlak'` | none | yes | **(built)** It tries the level plan's free flak slot first (`slotAt(['flak'])`), then open ground. **(checked)** The existing `'flak'` value is checked only after `spawnGround`'s other branches, so it often places something else (section 2). The new value gets its own branch right after `tryLand` is defined, before the train, gun-slot and camouflage branches, and does only the two flak tries. The existing `'flak'` value and Retro Run's set piece stay exactly as they are. Placement is still the ground code's (`tryLand`), because it knows roads, water and houses. A call that places nothing only draws from the seeded stream and changes no world state, so the length check in 5.2 is enough. 0 placed: `false`, retry next frame. 1 or 2 placed: `true`, done. Not in the `bossland` biome, whose branch comes before `tryLand` (checked at selection). Guns appear 34 px above the screen: time later events with `when: 'seen'` (5.3). |
| `convoy` | `convoy(wy, trucks)` | `trucks` | yes | Returns early off its route in the Campaign. 0 vehicles: `false`. 1–3: `true`. Not over sea or coast biomes (checked at selection). Placed above the screen like flak, so the same arrival delay applies. |
| `strafer` | `mkFighter` | `i` (place in the run) | no, atomic | **(built)** One plane of a strafing run, as `waveStrafe` makes it. The side is chosen at `i: 0`, away from the ship, and kept in `world.enc.side`. |
| `pod` | `E('pod', …)` | `x` | no, atomic | Always `own: false`. A pod is a reward: place it after the pressure, not during it. |

Not a verb: the Sower and the Shadow Wing. They are level set pieces with their own directors (`sowerTick`, `spawnWing`). An encounter never spawns either. The Sower Window reacts to a Sower that `sowerTick` already made.

## 7. MVP encounters

Four compositions, one per idea from the earlier discussion. Each has one anchor, one pressure and one restriction, and announces the restriction before the pressure arrives.

### 7.1 The Anvil: Heavy holding while fighters close in

- **Anchor:** the Heavy, built in two steps (decided: timing first).
  - **Step 1, no behaviour change:** the Heavy as it is. It sinks at 0.7 px per frame, and between 20 px from the top and 55% of `H` it pauses for 42 frames and fires its spread every 100–140 frames (longer on Veteran). The formations are timed to arrive while it is in that band. That's about 6 s, and the Heavy keeps closing in.
  - **Step 2, only if playtesting shows step 1 doesn't read as an anchor:** a Heavy that stops at about 28% of `H` and holds for 7 s, firing on its normal cycle (the behaviour change below).
  - **Result (2026-10-31): step 2 is built.** In the owner's playtest the passing Heavy gave no clear hold. The Anvil's Heavy now stops at 28% of `H` (reached at about frame 200) for 420 frames. The formations come at frames 180 and 330, the chase pair at 480 and the pod at 660, so the pressure arrives while it holds. With the immortal bot the encounter ends after about 1150 frames, because the Heavy is left to sink off on its own.
- **Pressure:** two leader formations from the sides, 1.5 s and 3.5 s in, then a chase pair. In step 1 these times are set so both formations meet the Heavy inside its firing band.
- **Reward:** a pod at 9 s, `own: false`, so it never keeps the encounter alive.
- **Readability:** the Heavy is visible before the first formation arrives (and in step 2, stopped).
- **Player choice:** burn the Heavy down (Lance, Arc ramp) and take the formations on the way, or kill the leaders so their wingmen scatter, then go back to the Heavy.
- **Rookie:** one formation, not two (`diff: [1, 2]` on the second).
- **Behaviour change:** `ENT.heavy` gets two optional fields, `holdY` and `holdT`. While holding, it doesn't drift down, and when `holdT` runs out it resumes its old motion. Without these fields it behaves exactly as now. This is the only change to enemy code in the MVP (built: step 1 wasn't enough). A Heavy without these fields is unchanged, as both replay baselines confirm.

### 7.2 Flak lane: a formation breaking up over flak

- **Restriction:** two flak guns, placed at the encounter's start. They spend about 1.4 s above the screen before they're visible.
- **Pressure:** a leader formation with `when: 'seen'` on the flak event (the guns at least 15% down the screen, with a `by` fallback), then strafing fighters from one side about 2 s later.
- **Readability:** the flak is visibly on screen before the formation. The pressure is tied to the guns' arrival, not to a fixed frame. When the leader dies, the wingmen scatter into air the flak already covers.
- **Terrain:** land biomes only (`spawnGround` refuses water).
- **Placement:** if only one gun is placed, the encounter goes on with one (6, `flak`).
- **Player choice:** kill the flak first (ground priority, Seekers), or hold a lane between the flak's fire and take the leader early.
- **Rookie:** no strafe follow-up.
- **Status: built (step 5, first encounter).**
  - Definition: `flaklane` (two guns at frame 0; the formation with `when: 'seen'`, 15% down, `by` 420; four strafers at `after` 120, 16, 16, 16, from the side the ship is not on).
  - It starts only over `ENC_LAND` biomes, so not over sea, coast or a boss's land. A level's plan slot is used for the guns first (level 4 has its gun sites in its plan; without that, its forest found no free spot in 60 frames).
  - Measured ("human" bot): level 2 Veteran, one gun, formation at frame 244, done after 487–593 frames; level 3 Ace, two guns, done after 1207; level 4 Veteran, a plan slot's gun. Peaks of 6–23 bullets and 0 frames over budget in every run.

### 7.3 Bomber screen: prioritisation

- **Anchor:** a Bomber, which has high hit points and fires steadily.
- **Pressure:** three-fighter dives at 1 s, 3 s and 5 s, then one strafe.
- **Budget:** the lowest of the four, so the Bomber's shots stay readable. When the soft budget is reached, the gated fighters' shots wait, and so does the Bomber's next volley.
- **Player choice:** focus the Bomber, or clear the dives. Scatter and Arc chains both have a clear job.
- **Rookie:** two dives, not three, and no strafe.
- **Status: built (step 5, second encounter).**
  - Definition: `bomberscreen` (Bomber at frame 0; three-plane dives at 60, 180 and 300; a strafing run of four from 420). Budget 14 / 18 / 24, the lowest of the encounters.
  - **All three spawn timers are held, the ground timer included.** The first measurement in level 3 on Veteran showed 154–170 frames over budget. The cause was new ground guns' fire that isn't gated (AA towers), which filled the low budget and made the gated Bomber wait. Bomber screen is an air fight, so new ground units now wait too: 0–40 frames over budget, and the Bomber fires 7–12 times per encounter.
  - A Bomber that isn't shot down is removed 40 px below the screen (about frame 810), so the encounter ends `done` either way.
  - Measured ("human" bot): level 2 on all difficulties, peaks of 10–20, over budget only once (19 frames on Veteran), done after 431–949 frames. Level 3 on Veteran and Ace with the ground held: peaks of 18–24, 0–40 frames over.

### 7.4 Sower Window (level 4 only)

- **Start:** `start: 'sower'`. It starts only when `sowerTick`'s Sower settles into its hold, through the explicit rule in 5.5, and never spawns a Sower or a Wing itself.
- **Restriction:** the Sower's mines, which persist and drift with the ground.
- **Pressure (as built):** three tank convoys on the road below, the second not on Rookie. The original plan had one convoy and a flak gun. Air waves (`holds.air`) are frozen for the whole encounter. Because ground units arrive late (5.3), the convoy and the flak are dispatched at the encounter's start, the moment the Sower settles.
- **Player choice:** stay at the sides and work the ground targets, or move up beside the Sower and kill it.
- **Ownership:** the Sower itself isn't owned (`sowerTick` made it), so completion depends on the convoy and the flak only. If the Sower outlasts them, normal spawning resumes after `rest` while the Sower is still on screen, as it does today.
- **Budget (decided: the mines are meant to be many):** the Sower's aerial mines don't count toward the budget at all. They are the intended restriction, so they never hold back the convoy's or the flak's volleys, and they never show as overruns. Its falling bombs are aimed fire and do count. The budget therefore only keeps the tank and flak fire on top of the mine field readable.
- **Setup:** `sowerTick` and the Sower's behaviour are unchanged.
- **Status: built (step 5, third encounter).**
  - Definition: `sowerwindow`, `start: 'sower'`: three tank convoys at frames 0, 180 (not on Rookie) and 360. Budget 26 / 34 / 40, the highest of the encounters. All spawn timers are held.
  - Start rule (`encStart`): only for a Sower in `hold` from `ENC_SOWER_FROM` (0.7, the set2 stretch) on, not a called partner (`second`), and each Sower once (`encSeen`). Ordinary encounters don't start while a Sower or the Shadow Wing is up, and a running Sower Window isn't held by the Sower.
  - Measured (level 4, seed 104): it opens at frame 7322, the frame after the second Sower settles, on every difficulty. The Sowers lay exactly the same mines (152) and bombs (10), and call their partner, as in the same run without it.
  - **Decided after the first measurement (owner):**
    - **A higher budget.** Each falling bomb bursts into a ring of 8 bullets that counts, and with the first budget (16 / 22 / 28) about 15–26 of the Sower's own bullets filled it: 274–391 frames over, and the convoy's gated tanks mostly waited.
    - **Tank convoys instead of a flak gun.** The flak was dropped on Veteran and Ace, because that stretch of forest had no free gun site and no open spot.
  - **Now** ("human" bot, seeds 104 and 7): 0–45 frames over budget, peaks of 25–44, nothing dropped, 3–7 tanks per encounter, and the tanks fire 7–30 shots.

## 8. Soft bullet budget

The first implementation is a **soft** budget. Selected shooters ask before a volley and wait when the screen is full, while other sources fire as before. The total can go above the budget, and the implementation measures how often and why.

- **Technical limit (unchanged):** `eshot` refuses bullets past 420 and during the Nova flash. Rookie's `DIFF.skip` is also unchanged.
- **Budget:** `encBudget()` returns the active encounter's `budget[settings.diff]` while `world.enc` is in `run` or `hold`, and `Infinity` otherwise. It is counted in enemy bullets on screen **except the Sower's aerial mines** (`encBullets()`: every `world.ebul` entry whose kind isn't `amine`). The mines are meant to fill the air (owner's decision), while its falling bombs and everything else count. Apart from the mines, it's the same measure `balance-real.mjs` reports as the worst 10 s window.
- **Admission:** `volleyOK(n, later)` is true when `encBullets()` plus the reserved bullets plus `n` is at most `encBudget()`.
  - **Reservations (built in step 4):** a volley whose bullets come over the next frames passes `later`, the frames until its last bullet. It then reserves `n` bullets until that frame (`world.enc.res`, counted down by `encTick`, plain data).
  - **Why:** without reservations, the first measurement showed the budget failing in level 3. Shooters that decide early and fire late (the Heavy 30 frames on, a pop-up turret up to 74, the Drilling up to 90) all saw room at the same moment and landed together, giving 120–414 frames over budget per encounter.
  - It is called once, before a complete volley, never per bullet.
  - `n` is the actual number of bullets that volley will try to create, worked out the way the shooter does it: 1 or 3 for a fighter strafe or a Bomber shot depending on `run.loop`, 3 for a Heavy spread, a `ring` after `DIFF.ring` scaling.
  - `n` is counted before `DIFF.skip`, so Rookie is judged a little conservatively.
  - A pattern spread over several frames that the shooter decides at once counts as one volley with its total `n`. For example, the Enigma Heavy fires two spreads in one pause from level 3, so it asks once at the pause's start with `n = 6`.
  - **(checked)** `n` at the MVP call sites, from the source:

    | Shooter | Volley | `n` |
    |---|---|---|
    | fighter, `fireAt` | one aimed shot | 1 |
    | fighter, strafe | aimed shot, plus two side shots from loop 1 | 1 or 3 |
    | Heavy, pause start | 3-way spread; the Campaign's Heavy from level 3 fires two spreads in one pause (pause frames 26 and 12) | 3 or 6 |
    | Bomber, `gcd` | aimed shot, plus two side shots from loop 1 | 1 or 3 |
    | flak, cooldown | one shell per barrel; the 4-barrel gun fires 2 now and 2 nine frames later; at night a lit gun adds 3 tracer shells over 21 frames | 1, 2 or 4 (+3 when lit at night) |
    | tank, cooldown | one shell; a heavy tank fires 3 | 1 or 3 |
    | pop-up turret, as it rises (added in step 4) | three pairs over its 'up' phase, the last 74 frames after it rises; a rocket pop-up launches a missile instead and isn't gated | 6 |
    | the Drilling, from aim to prep (added in step 4) | 2 or 3 salvos of three shells (one more from loop 1), the last `prep + (ns - 1) * gap` frames later | 6, 9 or 12 |

    The Heavy (30), the 4-barrel flak (9), a lit flak gun at night (21), the pop-up (74) and the Drilling reserve their bullets until their last one.

    The 4-barrel and night shots are already delayed with `world.later` closures in `ENT.flak`. They are counted in the gun's `n` and left unchanged.
- **When refused:** the shooter delays the volley, nothing is deleted, and nothing in flight is cut.
  - The shooter keeps its cooldown at 1 frame and asks again next frame.
  - Where the shooter has a natural "start attack" state (the Heavy's `pause`, the Bomber's `gcd`), it doesn't enter that state.
- **Gated (built):** fighter `fireAt` and strafe shots, Heavy pause start, Bomber `gcd`, flak and tank cooldowns, plus pop-up turrets and the Drilling, which the first measurement showed to be the main sources of overruns. That's 9 call sites in 8 places; the fighter's aimed shot appears twice, for the lead plane and the wingmen. They are gated whoever owns them, because the player sees all bullets, including those of the normal director's ground units.
- **Not gated:** boss parts (no encounters during bosses), revenge shots (immediate feedback to a kill), the Shadow Wing, the Sower's falling bombs, artillery, AA towers, flak cars on trains, the Büchse, and any shooter not in the list above. The Sower's mines aren't counted at all. They still count toward the total, so they can push it over the budget, and the gated shooters then wait until it falls.
- **Measuring:** while an encounter runs, each frame with `world.ebul.length` above the budget adds to `over`, and `peak` keeps the maximum. Both go into `world.encLast`. The cause of an overrun comes from the existing shooter attribution (`SF.attrib()`, `balance-real.mjs --attrib`). **(checked)** It can't be limited to a frame range, and it is approximate: it credits each bullet to the nearest enemy within 50 px, so flak and revenge fire next to a gun crew shows up as "troop" (troops don't shoot). In Phase 3 the harness wrapper gets an encounter key (`<stage>:enc:<id>:<type>` while `world.enc` is set). That change goes in `tests/harness.js` only, not the game, and the attribution stays approximate.
- **Repeat loops and rank:** after level 6B the Campaign can loop (stage 7–12 and on). `rankFor` raises `run.loop` by 1 per loop, and on Ace also per stage. That makes bullets faster (`bspeed`) and makes more fighters shoot. The budget is not scaled for this:
  - it counts bullets on screen, and faster bullets leave the screen sooner, so the same budget already admits more fire per second on a loop;
  - a fixed number keeps the "how busy the screen looks" ceiling the same, which is what the budget is for.
  Phase 4 checks one looped level per difficulty. If the loop reads as too easy under the budget, add a per-loop factor then, not before.
- **Priority:** the first version has none (first come, first served). If a slow anchor gets starved by fast fighters, give each `volleyOK` call a class, and let anchors use the full budget while light shooters stop at 80% of it.
- **Determinism:** admission depends only on simulation state, so runs stay reproducible and resumable.

## 9. Determinism, saving and tests

Rules:
- All randomness in the director goes through the seeded stream, which is automatic inside `director()`.
- No closures in `world.later` for encounter work. If a delayed callback is truly needed, it is a named function added to `snapFns`.
- `world.enc`, `world.encLast` and `world.encPend` are plain data, and the `e.enc`/`e.encOwn` tags are plain fields. `encTag` is set and cleared inside one `dispatch` call, so it never needs saving.

Tests:
- `golden.json` must stay identical. That proves Retro Run, Endless and the tutorial are untouched, and it's checked by CI.
- New `tests/encounter.mjs` (Playwright, in the style of `drilling.mjs`). A local-build hook forces an encounter in a chosen level, then checks:
  - every event is dispatched exactly once and in order, and a verb that fails creates nothing (the enemy count is unchanged after a `false`);
  - on Rookie, events with `diff: [1, 2]` are skipped, not dropped, and the encounter still ends with `done`;
  - a `when: 'seen'` event fires only once its ground units are on screen at the set height, and fires at `by` if they never get there;
  - the start plays the warning haptic once;
  - a flak event with one placement goes on with one gun and is not retried;
  - the counted total rises and falls as expected, the pod and troops are never counted, and the end reason is `done`;
  - a forced long-lived enemy ends the encounter with `timeout`, not `done`. The enemy stays alive, the next slot waits for it, and the held timers resume after `rest`;
  - the held timers keep their value through `run`, `hold` and `rest` and resume from it: no early or reset wave;
  - pause, the continue screen and `world.quiet` freeze the clock;
  - a player death doesn't reset the clock or the event index;
  - the end of the level and the boss spawn end it (`level`, `boss`), and nothing from it spawns in the next level;
  - gated shooters don't start a volley while `world.ebul.length + n` is over the budget, and every admitted Heavy volley has all its bullets;
  - the test reports `over` and `peak` per encounter as numbers, not as a pass/fail ceiling.
- **Sower Window test** (in `tests/encounter.mjs`, level 4, the bot flying immortal):
  - while a Sower is active, a pending ordinary slot doesn't start;
  - the first Sower of the level (before `set1`) does not start it;
  - the Sower Window starts on the frame after the second Sower enters `hold`, once, and not again for its called partner;
  - no `sower` or `wing` entity is created by the encounter (count them by tag and by type);
  - `world.waveCd` keeps its value for the whole encounter (`holds.air`);
  - the Sower still lays mines and drops bombs at its usual intervals, and still calls its partner (compare with the same seed without the encounter);
  - the encounter ends with `done`, and air waves resume after `rest` from the held value.
- `tests/resume-exact.mjs` gets two scenarios saved in the middle of an encounter, one ordinary and one Sower Window, which must replay identically.
- `tests/jitter.mjs` and `tests/no-pop-in.mjs` must still pass, because encounter ground units go through the same placement.

Tuning readout:
- **What it shows:** one more line under the Show FPS readout. Settings > Show FPS already draws the FPS line and, under it, the point-blank fire-rate line (`PB.shown`). The new line holds the encounter id, state, clock, counted enemies and `bullets/budget`, for example `ENC anvil RUN 312 OWN 4 B 19/22`. After the end it shows `world.encLast` for a few seconds.
- **Where it shows:** it is drawn only on local builds, the same builds that expose the `window.__sf` test hook, so players never see it.
- **Cost:** it is drawing only, and reads state without changing it, so replays and snapshots are unaffected (the replay test's draw-isolation check guards this).

## 10. Phases

Each phase ends with its check passing.

**Phase 0: baseline (no gameplay change)**
- Record the Campaign's current numbers with `node tests/balance-real.mjs --levels --attrib --diffs 0,1,2`: worst bullet window, bullets before the boss, hits per level, and which shooters fill the windows.
- Add a small Enigma-level replay baseline (two or three levels including level 4, fixed seed) so later phases can show exactly what changed. Unlike `golden.json`, it is updated on purpose in each phase.
- **Done when:** the numbers are saved, and the baseline reproduces on two runs.
- **Status: done.**
  - The balance numbers are in `tests/balance-encounter-phase0.json` (for `balance-real.mjs --baseline`), and the per-level figures are below.
  - The Campaign replay baseline is `tests/golden-enigma.json`, run with `node tests/replay.mjs --enigma`. It covers level 1A on Rookie with the bot able to die, level 3 on Ace, and level 4 on Veteran with both Sowers. It reproduced on two runs, and `golden.json` still matches. It is run by hand, not in CI, and is not a blocking check (decided).

Phase 0 numbers (human bot, 4 runs per difficulty; the window is the worst 10 s of enemy bullets on screen before the boss):

| | Level | 1A | 2 | 3 | 4 | 5 | 6B |
|---|---|---|---|---|---|---|---|
| Rookie | window | 11 | 10 | 12 | **40** | 10 | 18 |
| | shots/s | 1.75 | 1.48 | 1.76 | 1.44 | 1.14 | 2.52 |
| | hits | 1.3 | 0.5 | 1.5 | 1.0 | 3.5 | 4.5 |
| Veteran | window | 16 | 18 | 17 | **34** | 16 | 32 |
| | shots/s | 2.45 | 1.96 | 2.30 | 1.55 | 1.48 | 3.55 |
| | hits | 1.3 | 1.5 | 1.3 | 2.3 | 2.8 | 4.3 |
| Ace | window | 18 | 19 | 20 | **69** | 20 | 27 |
| | shots/s | 2.69 | 2.43 | 3.16 | 3.24 | 3.32 | 6.19 |
| | hits | 0.8 | 0.5 | 3.5 | 4.5 | 4.8 | 5.8 |

Totals: hits per run were 12.3 on Rookie, 13.3 on Veteran and 19.8 on Ace (ladder 1 : 1.08 : 1.61). Before the bosses, fighters fire about 9–13% of all shots, the Shadow Wing 7–10%, and the Heavy, flak and tanks 3–4% each.

What this means for the plan:
- **Level 4 is the outlier, by design.** Its window is 2–3 times that of any other level, and on Rookie it's higher than on Veteran. That's the Sower's mines, which are meant to be many (owner). The budget doesn't count them (section 8), so level 4 needs no separate budget. Compare its tank and flak fire against a window measured without mines.
- **The other levels' windows of 10–20 are the useful reference.** The MVP budgets (16 / 22 / 28) sit just above today's windows, so on their own they would mostly limit peaks, not normal play. Tune them in Phase 3 against these figures.
- **Rookie is already sparse** (about 1.5 shots/s, windows of 10–12 outside level 4), so lighter Rookie versions of the encounters (`diff`) matter more than a lower Rookie budget.

**Phase 1: definitions and verbs**
- Add the `ENC` table, the verbs with their dispatch contract, the optional `cx` arguments, and the `'encFlak'` branch in `spawnGround`.
- No Heavy hold yet: The Anvil starts with the timing-only version (7.1, step 1).
- Nothing calls them yet.
- **Done when:** `golden.json` and the Enigma baseline are unchanged.

**Phase 2: execution**
- Add `encTick`, ownership tagging and counting, the frozen timers, `rest`, the end reasons, `world.encLast`/`world.encPend`, the start rules including the Sower exception, and the resets.
- Add the `diff` filter, the `seen` trigger and the start cue.
- Add a hook so tests can force an encounter, and the tuning readout.
- Add `tests/encounter.mjs` with the Sower Window test, and the mid-encounter resume scenarios.
- **Done when:** the new tests pass, and `golden.json` is unchanged.
- **Status: The Anvil slice is done** (execution step 3: one encounter end to end, not reachable by players).
  - **Built:**
    - `ENC` with The Anvil, and the verbs `heavy`, `formation`, `chase` and `pod`, with optional centres for `waveHeavy`, `waveLeader` and `waveDive`;
    - tagging in `E()`, the counted total, `encTick` with `run`/`hold`/`rest`, and the end reasons `done`, `timeout` and `boss`;
    - the frozen timers, the `diff` filter, the start cue, the resets, `world.encLast`, `over`/`peak` (measured only), and the readout under Show FPS on local builds;
    - `encStart(id)` as the test hook, through `SF.peek` or the console;
    - for hand playtests, also on a phone: `?enc=<id>` starts that encounter once per level, as early as it may. `?enc=all` plays a fixed tour, one encounter per Campaign level (`ENC_TOUR`). With the switch set, a banner names the encounter as it starts, while it waits and when it ends (drawing only). On the live site only in practice runs, which never go to the leaderboard (`run.ranked` is false); on local builds also in the Campaign. The readout shows with Show FPS whenever the switch is set. Shipped as hidden build 1.2.5.5 (leaderboard: version only, section 12).
  - **Deferred to the later steps:** the `encFlak` branch, the `seen` and `clear` triggers, `world.encPend` and the start rules with the Sower exception (step 6), and the Sower Window and its test (step 5).
  - **Tests:** `tests/encounter.mjs` passes 26 checks, including the `?enc` switch. A new `resume-exact.mjs` scenario, `level2-anvil`, saves at encounter frames 150 and 400 and resumes identically. `golden.json` and `golden-enigma.json` are unchanged.
  - **Learned:**
    - **The carrier holds encounters.** Level 1A opens with the carrier scene, which holds an encounter for its first 1000+ frames, as designed. The tests run in level 2 instead. Level 1A's first slot (frame 2130) comes after the carrier, so the real slots are not affected.
    - **First numbers.** The Anvil on Veteran in level 2 (immortal bot): bullets peaked at 19, against a budget of 22, with 0 frames over. The bot cleared every counted enemy by frame 540, so the encounter ended on its last event. The bot is stronger than people, so the hand playtest decides whether the Heavy reads as an anchor (7.1).

**Phase 3: soft budget**
- Add `volleyOK` at the six call sites with their real `n`.
- Add the `over`/`peak` figures.
- **Status: built (execution step 4).**
  - **Built:** `encBullets()` (all enemy bullets except the Sower's mines), `encBudget()`, `volleyOK(n, later)` with reservations, the six planned call sites, plus pop-up turrets and the Drilling.
  - **Tests:** `tests/encounter.mjs` (35 checks) adds:
    - with the screen at the budget, a gated shooter (the Heavy) waits;
    - mines don't block it;
    - with room again, the whole spread fires;
    - a delayed volley's reservation holds until the frame of its last bullet.
  - **Harness:** shots during an encounter get the key `stage:enc:<id>:type` (`tests/harness.js` only).
  - **Measured** (The Anvil started at frame 300, "human" bot, 3 seeds each):

    | Level, difficulty | Peak (budget) | Frames over budget |
    |---|---|---|
    | 2, Rookie | 7–9 (16) | 0 |
    | 2, Veteran | 11–15 (22) | 0 |
    | 2, Ace | 12–18 (28) | 0 |
    | 3, Veteran: six gates only | 31–39 (22) | 151–414 |
    | 3, Veteran: with reservations, pop-ups and Drilling | 22–23 (22) | 0–11 |
    | 3, Ace: with reservations, pop-ups and Drilling | 29–34 (28) | 8–40 |

    The remaining overruns come from shooters that aren't gated: artillery, AA towers, flak cars and revenge shots. That's what a soft budget allows.
- **Done when:**
  - the budget tests pass;
  - `balance-checks.mjs` passes;
  - each encounter's `over` figure and its main causes are recorded per difficulty, as a reference for tuning, not as a pass/fail threshold.

**Phase 4: replace the set pieces**
- In the Campaign, `set1`/`set2` slots start encounters (5.5); level 4's `set2` slot is the Sower Window.
- Compare with the Phase 0 numbers per level and difficulty.
- Also fly these, which the per-difficulty runs don't cover:
  - level 1A on Rookie, where new players meet the first encounter;
  - one looped level per difficulty (section 8);
  - one two-player run: enemies split their aim between two ships, so the budget and readability can feel different;
  - one run pinned to a weak weapon (`SF.human(…, 'S1')`): gun speed is fixed for everyone, so weapon power is what makes clearing slow, and slow clearing is what makes a `timeout` likely.
- Playtest by hand: the bot dodges better than people do, so its numbers are for comparison only.
- Refresh the Enigma baseline and note the change in `CHANGELOG.md`.
- Bump `VERSION` in `index.html` and `sw.js` to a new visible version (the first three parts, e.g. `1.2.6`). That is the whole leaderboard step: scores carry the version, and the board is not reset (section 12).
- **Done when:** the playtest questions in section 11 have acceptable answers for all four encounters on all three difficulties, and no encounter ends in `timeout` in the bot runs.

## 11. Playtesting

These are the brief's questions, plus numbers to look at alongside them:

| Question | Number to watch (bot or manual) |
|---|---|
| Is it readable? | Hits taken per encounter, against the same stretch before the change. A big rise with a flat bullet count means it's unreadable, not dense. |
| What's the cognitive load? | The worst 10 s bullet window inside the encounter, its `over` and `peak`, and which shooters fill it (`--attrib`). |
| Is there tactical variety? | Time to clear per weapon (`SF.human(…, 'S4')` etc.). If one weapon is far ahead in every encounter, the compositions aren't asking different things. |
| Is there pacing and recovery? | Bullets on screen over time, which should show a peak, then the `rest` gap visibly lower. |
| Is it fair? | Ace has more hits than Veteran, and Veteran more than Rookie (`balance-checks.mjs` already asserts this per run). On Rookie in level 1A, hits in the first encounter are no higher than in today's first set piece. |
| Do Novas and Lance matter? | Novas fired inside encounters, and the share of counted enemies killed versus escaped. |

## 12. Risks and open questions

1. **Leaderboard (decided: version number only, no reset for now).** The Campaign is ranked, and changing its spawns changes what scores are possible. Every submitted score already carries the game's `VERSION` (stored by the Worker in `scores.version`), so encounter-era scores can always be told apart. The release bumps a visible part of the version (not only the hidden fourth part), and nothing on the board is reset.
2. **Heavy hold (decided: timing first).** The Anvil is built without changing the Heavy (7.1, step 1). The hold is added only if playtesting shows the Heavy doesn't read as an anchor.
3. **Ground placement can fail** (water, towns, plans with fixed guns). The retry window and the dispatch contract in 5.2 keep this safe, but an encounter whose restriction never appears, or appears at half strength, is a different encounter. The test reports how often each verb fails or places only part of its units, per level.
4. **The soft budget can be exceeded** by ungated sources: revenge shots, artillery, AA towers, flak cars on trains, the Shadow Wing, shooters outside the gated call sites. Whether that matters is a measurement question (`over`, `--attrib`). In step 4 the answer was to gate two more call sites, pop-ups and the Drilling, and to add reservations, never to delete bullets. The remaining overruns are a few frames (section 10, Phase 3).
5. **Loops under a fixed budget.** On a repeat loop, faster bullets clear the screen sooner, so the same budget admits more fire. If looped encounters feel easier rather than harder, the budget needs a per-loop factor (section 8).
6. **Starving anchors under the budget.** If fast shooters always take the free room, the anchor goes quiet. Watch for this in Phase 3, and add the priority classes from section 8 if it happens.
7. **Retro Run later?** Keeping it out is deliberate: it is the reference version, and its replays guard the refactor. Revisit only if the owner wants it.

## 13. Later

These follow the brief:
- A larger encounter library, reused across levels by `biomes`.
- Variants (timing jitter from the seeded stream, mirrored sides).
- Encounters started in `mix` zones.
- Validated encounters as the building blocks of a future Daily Sortie and of procedural levels, which stay reproducible because they are plain data driven by the run's seed.
