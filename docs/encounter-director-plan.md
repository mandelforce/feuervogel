# Encounter Director: plan

Status: proposal, nothing built yet. Based on the design brief "Feuervogel: Encounter Director" and checked against the code as of 2026-10-30. Revised after review: Sower exception, ownership counting, soft budget, atomic verbs, timeout and hold rules, Sower Window test.
Line numbers drift; search for the names given here. Points marked **(inspect)** need a look at the source or a test before they are built; the plan does not assume an answer.

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
| `spawnGround` with `FORCE_GROUND = 'flak'` tries two placements and can create 0, 1 or 2 guns. `convoy` can create 0 to 3 vehicles and draws its size and kinds from the random stream. | `spawnGround`, `convoy` | Spawn verbs need an explicit success rule (5.2, section 6). |
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
      { t: 210, do: 'leader', x: 0.75 },
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
- `budget`: the soft budget in enemy bullets on screen, per difficulty (Rookie, Veteran, Ace).
- `holds`: which normal timers are frozen while it runs, holds and rests.
- `biomes` / `levels`: where it may run (`biomeAtSpawn()` values, Campaign level numbers).
- `start`: how the encounter is started (5.5). `'slot'` (the default) means it fills a `set1`/`set2` slot. `'sower'` means it waits for a Sower to settle into its hold.
- `ev`: the events, sorted by `t`.
- An event's `do` names a *spawn verb* (section 6). The other fields are that verb's options. An event may have `when` instead of `t` (a trigger, see 5.3). `own: false` marks an event whose entities are tagged for diagnostics but never counted toward completion (rewards and scenery).

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
- **(inspect)** Whether the zone clamps and the freeze interact in `calm`/`still`, where both apply. Order them so the freeze wins while an encounter exists.

**Dispatch contract (all verbs):**
- **`true`:** the event was dispatched. It may have created fewer entities than the verb could make, for example one flak gun of two. Partial success counts as success and is never retried.
- **`false`:** the verb created nothing and changed no world state, so retrying is safe.
- **Never:** a verb never creates something and then returns `false`. `dispatch` enforces this by comparing `world.enemies.length` before and after the call. If entities were created, the event counts as dispatched, whatever the verb returned.

Retries draw from the seeded stream again (`convoy` draws its size), which stays deterministic but means a retried event can differ from what the first try would have made. That's acceptable. Events are dispatched in index order and never skipped except after 60 failed tries; ties on `t` dispatch in the same frame, in order.

### 5.3 Triggers

Most events are timed (`t`). One trigger is enough for the MVP:
- `when: 'clear'`: the counted enemies spawned so far are all resolved. Use this for "next beat after you dealt with this one".

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

The truck is not marked harmless and doesn't shoot. **(inspect)** Check whether an unarmed truck should count. The default is that the `convoy` verb with `trucks: true` sets `own: false`.

Enemies already mark themselves dead when they leave the screen, so "resolved" means killed or escaped, with no special case. **(inspect)** For each verb, check that its units do leave: ground units with `keep`, and static units that scroll off slowly. If one can outlive the encounter by a lot, its verb sets `own: false`, and `max` is the backstop.

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
| No Sower active (any `sower` not dead). | yes | n/a: this is its start condition |
| A Sower has entered `st === 'hold'` and isn't marked `encSeen`. | n/a | yes. The Sower is marked `encSeen` so it starts one encounter only, and its called partner doesn't start a second. |

A pending slot whose rules still fail when `ARC_U` reaches 0.9 is dropped, and `world.encLast` records `why: 'skipped'`.

Level 4 has one ordinary slot (`set1`). Its `set2` slot is given to the Sower Window, which waits for a Sower hold instead of the zone, so level 4 still has two authored moments. If no Sower settles before the 0.9 limit, nothing runs in that slot.

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
| `dive` | `waveDive(n)` | `n`, `x` (0–1 of `W`) | no, atomic | Needs an optional `cx` argument. |
| `leader` | `waveLeader()` | `x` | no, atomic | Needs an optional `cx`. Gated by `avail('leader')`: check at selection that the level has it, so dispatch never meets it. |
| `fighter` | `mkFighter` | `side`, `y` (0–1 of `H`), `heading`, `strafe`, `homeT`, `fireAt` | no, atomic | One fighter. Sweeps and strafes are written as 4–5 of these, 11–16 frames apart. |
| `chase` | `waveChase()` | none | no, atomic | |
| `heavy` | `waveHeavy()` | `x`, `hold`, `holdT` | no, atomic | `hold` needs the small Heavy option in 7.1. |
| `bomber` | `waveBomber()` | `x` | no, atomic | |
| `pfeil` | `wavePfeil()` | none | no, atomic | Campaign level 3 and on, checked at selection. |
| `flak` | `spawnGround` with `FORCE_GROUND = 'flak'` | none | yes | Placement is the ground code's, because it knows roads, water and houses. It tries two spots. 0 placed: `false`, retry next frame. 1 or 2 placed: `true`, done. **(inspect)** Check whether `spawnGround` changes any other world state on a 0-placement call; the length check in 5.2 only sees enemies. |
| `convoy` | `convoy(wy, trucks)` | `trucks` | yes | Returns early off its route in the Campaign. 0 vehicles: `false`. 1–3: `true`. Not over sea or coast biomes (checked at selection). |
| `pod` | `E('pod', …)` | `x` | no, atomic | Always `own: false`. A pod is a reward: place it after the pressure, not during it. |

Not a verb: the Sower and the Shadow Wing. They are level set pieces with their own directors (`sowerTick`, `spawnWing`). An encounter never spawns either. The Sower Window reacts to a Sower that `sowerTick` already made.

## 7. MVP encounters

Four compositions, one per idea from the earlier discussion. Each has one anchor, one pressure and one restriction, and announces the restriction before the pressure arrives.

### 7.1 The Anvil: Heavy holding while fighters close in

- **Anchor:** a Heavy that stops at about 28% of `H` and holds for 7 s, firing its 3-way spread on its normal cycle.
- **Pressure:** two leader formations from the sides, 1.5 s and 3.5 s in, then a chase pair.
- **Reward:** a pod at 9 s, `own: false`, so it never keeps the encounter alive.
- **Readability:** the Heavy is visible and stopped before the first formation arrives.
- **Player choice:** burn the Heavy down (Lance, Arc ramp) and take the formations on the way, or kill the leaders so their wingmen scatter, then go back to the Heavy.
- **Behaviour change:** `ENT.heavy` gets two optional fields, `holdY` and `holdT`. While holding, it doesn't drift down, and when `holdT` runs out it resumes its old motion. Without these fields it behaves exactly as now. This is the only change to enemy code in the MVP, and it stays only if testing shows that timing the formations around the Heavy's existing pause isn't enough.

### 7.2 Flak lane: a formation breaking up over flak

- **Restriction:** two flak guns placed as early as possible (they scroll in from the top, giving about 2 s of warning).
- **Pressure:** a leader formation 2.5 s later, then strafing fighters from one side.
- **Readability:** the flak is on screen before the formation. When the leader dies, the wingmen scatter into air the flak already covers.
- **Terrain:** land biomes only (`spawnGround` refuses water).
- **Placement:** if only one gun is placed, the encounter goes on with one (6, `flak`).
- **Player choice:** kill the flak first (ground priority, Seekers), or hold a lane between the flak's fire and take the leader early.

### 7.3 Bomber screen: prioritisation

- **Anchor:** a Bomber, which has high hit points and fires steadily.
- **Pressure:** three-fighter dives at 1 s, 3 s and 5 s, then one strafe.
- **Budget:** the lowest of the four, so the Bomber's shots stay readable. When the soft budget is reached, the gated fighters' shots wait, and so does the Bomber's next volley.
- **Player choice:** focus the Bomber, or clear the dives. Scatter and Arc chains both have a clear job.

### 7.4 Sower Window (level 4 only)

- **Start:** `start: 'sower'`. It starts only when `sowerTick`'s Sower settles into its hold, through the explicit rule in 5.5, and never spawns a Sower or a Wing itself.
- **Restriction:** the Sower's mines, which persist and drift with the ground.
- **Pressure:** a tank convoy on the road below and one flak gun. Air waves (`holds.air`) are frozen for the whole encounter.
- **Player choice:** stay at the sides and work the ground targets, or move up beside the Sower and kill it.
- **Ownership:** the Sower itself isn't owned (`sowerTick` made it), so completion depends on the convoy and the flak only. If the Sower outlasts them, normal spawning resumes after `rest` while the Sower is still on screen, as it does today.
- **Budget:** the mines are not gated but count toward the total, so the convoy's and the flak's volleys are admitted only while there's room. This encounter is the one most likely to exceed its soft budget, and its `over` figure is the one to watch.
- **Setup:** `sowerTick` and the Sower's behaviour are unchanged.

## 8. Soft bullet budget

The first implementation is a **soft** budget. Selected shooters ask before a volley and wait when the screen is full, while other sources fire as before. The total can go above the budget, and the implementation measures how often and why.

- **Technical limit (unchanged):** `eshot` refuses bullets past 420 and during the Nova flash. Rookie's `DIFF.skip` is also unchanged.
- **Budget:** `encBudget()` returns the active encounter's `budget[settings.diff]` while `world.enc` is in `run` or `hold`, and `Infinity` otherwise. It is counted in enemy bullets on screen (`world.ebul.length`). That's the same measure `balance-real.mjs` reports as the worst 10 s window, so tuning and testing use one number.
- **Admission:** `volleyOK(n)` is true when `world.ebul.length + n <= encBudget()`.
  - It is called once, before a complete volley, never per bullet.
  - `n` is the actual number of bullets that volley will try to create, worked out the way the shooter does it: 1 or 3 for a fighter strafe or a Bomber shot depending on `run.loop`, 3 for a Heavy spread, a `ring` after `DIFF.ring` scaling.
  - `n` is counted before `DIFF.skip`, so Rookie is judged a little conservatively.
  - A pattern spread over several frames that the shooter decides at once counts as one volley with its total `n`. For example, the Enigma Heavy fires two spreads in one pause from level 3, so it asks once at the pause's start with `n = 6`.
  - **(inspect)** Work out the exact `n` at each call site from the source in Phase 3; this plan doesn't assume it.
- **When refused:** the shooter delays the volley, nothing is deleted, and nothing in flight is cut.
  - The shooter keeps its cooldown at 1 frame and asks again next frame.
  - Where the shooter has a natural "start attack" state (the Heavy's `pause`, the Bomber's `gcd`), it doesn't enter that state.
- **Gated in the MVP:** fighter `fireAt` and strafe shots, Heavy pause start, Bomber `gcd`, flak and tank cooldowns, about six call sites. They are gated whoever owns them, because the player sees all bullets, including those of the normal director's ground units.
- **Not gated:** boss parts (no encounters during bosses), revenge shots (immediate feedback to a kill), the Shadow Wing, the Sower's mines and bombs, and any shooter not in the list above. They still count toward the total, so they can push it over the budget, and the gated shooters then wait until it falls.
- **Measuring:** while an encounter runs, each frame with `world.ebul.length` above the budget adds to `over`, and `peak` keeps the maximum. Both go into `world.encLast`. The cause of an overrun comes from the existing shooter attribution (`SF.attrib()`, `balance-real.mjs --attrib`), run on the encounter's frames. **(inspect)** Check that `SF.attrib()` can be limited to a frame range, or add that to the harness, not the game.
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
  - the Sower Window starts on the frame after the Sower enters `hold`, once per Sower, and not again for its called partner;
  - no `sower` or `wing` entity is created by the encounter (count them by tag and by type);
  - `world.waveCd` keeps its value for the whole encounter (`holds.air`);
  - the Sower still lays mines and drops bombs at its usual intervals, and still calls its partner (compare with the same seed without the encounter);
  - the encounter ends with `done`, and air waves resume after `rest` from the held value.
- `tests/resume-exact.mjs` gets two scenarios saved in the middle of an encounter, one ordinary and one Sower Window, which must replay identically.
- `tests/jitter.mjs` and `tests/no-pop-in.mjs` must still pass, because encounter ground units go through the same placement.

## 10. Phases

Each phase ends with its check passing.

**Phase 0: baseline (no gameplay change)**
- Record the Campaign's current numbers with `node tests/balance-real.mjs --levels --attrib --diffs 0,1,2`: worst bullet window, bullets before the boss, hits per level, and which shooters fill the windows.
- Add a small Enigma-level replay baseline (two or three levels including level 4, fixed seed) so later phases can show exactly what changed. Unlike `golden.json`, it is updated on purpose in each phase.
- **Done when:** the numbers are saved, and the baseline reproduces on two runs.

**Phase 1: definitions and verbs**
- Add the `ENC` table, the verbs with their dispatch contract, and the optional `cx` arguments.
- Add the Heavy's `holdY`/`holdT` option.
- Nothing calls them yet.
- **Done when:** `golden.json` and the Enigma baseline are unchanged.

**Phase 2: execution**
- Add `encTick`, ownership tagging and counting, the frozen timers, `rest`, the end reasons, `world.encLast`/`world.encPend`, the start rules including the Sower exception, and the resets.
- Add a hook so tests can force an encounter.
- Add `tests/encounter.mjs` with the Sower Window test, and the mid-encounter resume scenarios.
- **Done when:** the new tests pass, and `golden.json` is unchanged.

**Phase 3: soft budget**
- Add `volleyOK` at the six call sites with their real `n`.
- Add the `over`/`peak` figures.
- **Done when:**
  - the budget tests pass;
  - `balance-checks.mjs` passes;
  - each encounter's `over` figure and its main causes are recorded per difficulty, as a reference for tuning, not as a pass/fail threshold.

**Phase 4: replace the set pieces**
- In the Campaign, `set1`/`set2` slots start encounters (5.5); level 4's `set2` slot is the Sower Window.
- Compare with the Phase 0 numbers per level and difficulty.
- Playtest by hand: the bot dodges better than people do, so its numbers are for comparison only.
- Refresh the Enigma baseline and note the change in `CHANGELOG.md`.
- **Done when:** the playtest questions in section 11 have acceptable answers for all four encounters on all three difficulties, and no encounter ends in `timeout` in the bot runs.

## 11. Playtesting

These are the brief's questions, plus numbers to look at alongside them:

| Question | Number to watch (bot or manual) |
|---|---|
| Is it readable? | Hits taken per encounter, against the same stretch before the change. A big rise with a flat bullet count means it's unreadable, not dense. |
| What's the cognitive load? | The worst 10 s bullet window inside the encounter, its `over` and `peak`, and which shooters fill it (`--attrib`). |
| Is there tactical variety? | Time to clear per weapon (`SF.human(…, 'S4')` etc.). If one weapon is far ahead in every encounter, the compositions aren't asking different things. |
| Is there pacing and recovery? | Bullets on screen over time, which should show a peak, then the `rest` gap visibly lower. |
| Is it fair? | Ace has more hits than Veteran, and Veteran more than Rookie (`balance-checks.mjs` already asserts this per run). |
| Do Novas and Lance matter? | Novas fired inside encounters, and the share of counted enemies killed versus escaped. |

## 12. Risks and open questions

1. **Leaderboard comparability.** The Campaign is ranked. Changing its spawns changes what scores are possible. Decide whether this ships with a version note only, or needs a board reset or season mark.
2. **Heavy hold.** This is the one behaviour change. Is the owner fine with it, or should 7.1 time the formations around the Heavy's natural pause instead? That works but reads weaker.
3. **Ground placement can fail** (water, towns, plans with fixed guns). The retry window and the dispatch contract in 5.2 keep this safe, but an encounter whose restriction never appears, or appears at half strength, is a different encounter. The test reports how often each verb fails or places only part of its units, per level.
4. **The soft budget can be exceeded** by ungated sources: revenge shots, the Sower's mines, shooters outside the six call sites. Whether that matters is a measurement question (`over`, `--attrib`). The answer may be to gate one more call site, never to delete bullets.
5. **Starving anchors under the budget.** If fast shooters always take the free room, the anchor goes quiet. Watch for this in Phase 3, and add the priority classes from section 8 if it happens.
6. **Retro Run later?** Keeping it out is deliberate: it is the reference version, and its replays guard the refactor. Revisit only if the owner wants it.

## 13. Later

These follow the brief:
- A larger encounter library, reused across levels by `biomes`.
- Variants (timing jitter from the seeded stream, mirrored sides).
- Encounters started in `mix` zones.
- Validated encounters as the building blocks of a future Daily Sortie and of procedural levels, which stay reproducible because they are plain data driven by the run's seed.
