# The wonder-weapon war: story frame and how it fits the game

Status: proposal for the owner. Nothing here is in the game yet. It turns three earlier ideas (the shards, Reclaim, the daily shard rewards) into one story frame and maps it onto what the game already has. Names in **bold** are proposals and can be changed freely.

## 0. In one paragraph

It is 1944 and the empire is losing its war. Years earlier its Raven clan found a wreck: an alien ship, broken, half alive. The clan did not try to understand it. It cut the ship apart and bolted the pieces into machines that should never have worked: a flagship, a land fortress, a supergun, a castle full of laboratories, an armoured train, a flying fortress. They are the empire's wonder weapons, and they work, because each one carries a shard of the ship. What was left of the hull, the Feuervogel, sat on a carrier waiting for a pilot the clan trusted. You take it. Across two years (the two loops, 1944 and 1945) you hunt the machines down, tear their shards out, and the ship grows whole. The empire does not fall. Only its carrier surrenders, which is the ending the game already has.

## 1. The trope, and the turn this game gives it

The real wonder weapons of 1944/45 (the V-2, the Me 262, the Horten flying wing, the Schwerer Gustav railway gun, the V-3 supergun, the Maus and the Ratte) were the gamble of a regime that had already lost: too complex, too late, too few. Players half-know this, so the game's giant bosses need no explanation.

The game's turn: **in this world the gamble works, because of the shards.** That gives the stakes (the allies lost the Burning City to the Black Fortress), the theme (a cornered empire with impossible weapons) and the mechanic (the shard is what holds each machine together, and the place to hit it).

Two images carry the frame, and both are already in the game's names:
- **The ravens** feed on the dead. The clan is scavenging a corpse.
- **The firebird** is reborn. The player is bringing it back to life.

## 2. What the game already has that fits

Most of the frame is already in the game; it has not been said out loud yet.

| Already in the game | Where | What it becomes in the frame |
|---|---|---|
| The Feuervogel is a stranded alien ship, stolen from the carrier | README, level 1's `carrier_start`, the opening scene | Unchanged: the hull the clan could not use without a trusted pilot |
| Weapon pods, Nova and Nova icons are drawn in the alien palette (`RP.alien`, `RP.crys`) | sprites | Pods are **splinters** of the ship, carried by the empire's units. This explains why enemies drop power-ups |
| Every boss has a `core` part (`BOSS[...].parts`, `k: 'core'`) | director, `BOSS` | The core **is** the shard. Destroying it is pulling the shard out |
| The Black Fortress's core is "a purple alien orb like the weapon pods, which swells while the laser charges" | boss draw code | The ship's **heart**. The one boss whose shard is already visibly alien |
| The Raven Prototype: "the Ravens' secret project, a half-size Black Fortress prototype", on the apron behind Ravenhold's keep; it returns before the level 5 boss and for a duel before the final boss | `protoDuel`, level 4 | The clan's **attempt at a second Feuervogel**, built from shards. The proof of what is at stake |
| The Moth: the looped (1945) prototype, whose dust overheats the ship's laser | `mothDust` | The 1945 prototype: a desperate copy whose shards interfere with yours |
| Player 2 flies "a captured Raven prototype" | sprite comment at `SPR` (2nd player) | The second pilot flies the clan's copy, stolen like the Feuervogel was. Two thieves |
| The Shadow Wing, six variants, one per level | `docs/shadow-wing-design.md` | The clan's interceptor, built to hunt the Feuervogel. Each variant carries one splinter |
| Secrets: an **artifact** (a gem, 20,000 points) under circling crows, one per level | `run.stats.artifact`, the crows | The artifact is a **shard** the clan hid. The crows are the clan's guards (ravens) |
| Achievements: Swan (all six secrets), Robin (six in one loop), Swallow at Ravenhold's tower, Falke for reclaiming the carrier | `ACH` table | The ships stay; their descriptions can name the shards |
| Level 6: allies fought a big battle and lost; shot-down allied planes on the ground | spec §10 | The Black Fortress did this. The reason it must fall |
| The 1945 loop: "THE ENEMY GROWS STRONGER"; Ravenhold is a ruin held by tanks; the Winter Wolf gets avalanche mortars | congrats text, changelog | 1945 is the empire's desperate year: you wrecked Ravenhold in 1944, so the clan throws prototypes at you |
| The ending: the carrier surrenders and becomes your base; the empire goes on; the Daily Sorties fly from it | `docs/campaign-ending.md` | Unchanged. You did not win the war; you made sure the empire can never copy the ship |
| The mode is called Enigma Run | | The empire's codes. The clan's shard locations are what is encrypted |

Nothing in this table needs a change in play to be true. Sections 4 and 6 are text and looks first.

## 3. The six wonder weapons

The level order is the Enigma Run's (Channel, Sand, Night, Forest, Winter, City). Each boss carries one organ of the ship (the six organs of the shard design). The designation is a proposal for the second line of the WARNING banner: the empire's own name for the machine, in the spirit of the real "V" (Vergeltung, retaliation) weapons. **R** for **Rabenwerk**, the clan's weapons office.

| Lvl | Boss (bar name today) | Warning today | Proposed designation | Real-world echo | Organ in it | What the shard does for the machine | When the shard is torn out |
|---|---|---|---|---|---|---|---|
| 1 | IRON LEVIATHAN | ENEMY FLAGSHIP APPROACHING | **R-1 LEVIATHAN** | the big-gun battleship, radar-directed fire | **Eye** | sees through weather and night; its guns never miss a ship at rest | its guns fire blind; the hull lists and burns |
| 2 | SAND COLOSSUS | LAND FORTRESS INBOUND | **R-2 KOLOSS** | Landkreuzer Ratte, Maus | **Lungs** | breathes for an engine that could never move that mass; it dug the wreck out of the desert | it sinks into the sand under its own weight |
| 3 | NIGHT HAMMER | SUPERGUN DETECTED | **R-3 NACHTHAMMER** | V-3 Hochdruckpumpe, Schwerer Gustav | **Voice** | the coils' song: a barrel that survives its own shot | the barrel bursts on the next charge |
| 4 | RAVENHOLD | THE CASTLE GUNS AWAKEN | **RABENHORST** (no number: it is the clan's home, not a weapon) | the secret research site | **Mind** | the laboratories where the ship is studied; the prototype is built here | the prototype loses its pilot's link and has to flee |
| 5 | WINTER WOLF | ARMOURED TRAIN ON THE LINE | **R-5 WINTERWOLF** | the railway guns, the trains east | **Blood** | the reactor, shipped east to a safer factory | the train runs on with dead engines until it derails |
| 6 | BLACK FORTRESS | FLYING FORTRESS ON RADAR | **R-6 HIMMELSFESTUNG** | the Amerika Bomber, the Horten flying wings | **Heart** | keeps the impossible thing in the air; the purple orb that already swells when its laser charges | it falls. The ship is whole for the first time |

Notes:
- The banner text stays as it is. The designation is a second, smaller line, so the warning keeps reading as a warning (the banner is drawn in `renderMain` where `app.msg.a === 'WARNING'`; the boss calls `showMsg('WARNING', BOSS[bk].warn, 220)`).
- The "torn out" column is for the boss's breakup (`BOSS_LOOKS.breakup`). Most bosses already break up; the proposal is one shared beat before it: the core flashes purple and a streak of light flies from the core into the player's ship. That one beat tells the whole story without a word, in every fight.
- The Shadow Wing variants (DUST, NIGHT, IRON, FROST, EMBER) each carry a **splinter**, not an organ.

## 4. The visual rule: purple means alien, and alien means weak

One rule the player can learn in level 1 and use until the end:

**Anything glowing in the alien purple (`RP.alien`) is a piece of the ship. It is where the machine is weakest, and it is yours.**

- Pods, the Nova and the Black Fortress core already follow it.
- Each boss's `core` gets a thin purple seam (a weld line) in its art, brighter as the core loses health.
- Elite enemies that carry a splinter (the Reclaim targets, if Reclaim is built) get the same seam.
- Nothing purple ever hurts the player. Enemy bullets stay in their colours. The palette check for bullet readability (`docs/shadow-wing-design.md` §0 budget) is unaffected.

## 5. Escalation through the run

The six levels tell the story by how much alien machinery is on screen. Ordinary 1944 hardware early, more seams level by level, until level 6 is more alien than diesel.

| Lvl | Ordinary hardware | Alien share | What the player learns |
|---|---|---|---|
| 1 Cross the Channel | almost all: Würger, S-boats, the Z-class, Panzer | the pods, the Leviathan's core | purple is yours; the empire is chasing its stolen ship |
| 2 Sea of Sand | Blitz, Puma, Büchse, Drilling | the dig at the crash site: the Koloss, which dug the wreck out | where the ship came from |
| 3 The Long Night | searchlights, flak, trains | the supergun's song (a sound cue, `sfx`) | the clan is aiming at the allies' cities |
| 4 The Iron Forest | Sower, Pfeil, the forest bases | Ravenhold's labs, the prototype on the apron | there is a second ship |
| 5 The Winter Line | trains, U-boats under the ice | the reactor train; the prototype flies past | the clan is moving the work east, out of reach |
| 6 The Burning City | the wrecks of the allied air force | the Black Fortress, the prototype's duel | what happens if you fail |

1945 (the second loop) repeats the climb with the clan's answers: the Moth instead of the old prototype, Ravenhold already a ruin (because you wrecked it), the Winter Wolf's avalanche mortars. Nothing here changes; it only gets a reason.

## 6. Where the story is told, cheaply

No cutscenes. The frame lives in places the game already draws text.

| Place | Today | Proposal | Cost |
|---|---|---|---|
| Level start (`showMsg('LEVEL n', STAGE_NAMES[...])`) | level name | a third line, one sentence, the day's objective: "THE KOLOSS DUG IT UP HERE" | text |
| WARNING banner | warning line | the designation as a second line (§3) | text |
| Boss breakup | explosion | the purple streak into the ship (§3) | a small shared effect |
| Results screen | stats, SECRET FOUND/MISSED with a gem | "SHARD RECLAIMED" next to the boss; the secret row becomes "SHARD" with the gem | text |
| Congrats footer | "THE ENEMY GROWS STRONGER" / "THE CARRIER IS WAITING" | keep; for 1944 → 1945: "1945. THE CLAN HAS A NEW PROTOTYPE" | text |
| Loading / title | logo | in-world posters in the clan's voice, one per visit: "THE WEAPON THAT ENDS THE WAR", "RABENWERK: WE BUILD TOMORROW" | small pixel panels |
| **Memories** (the shard reward) | none | 24 short texts in the ship's voice, 4 per organ, unlocked by shards; text first, an artist's image later | text, a small screen |
| Achievement descriptions | "Find all six secrets" | "Find the six shards the clan hid" | text |

### Sample memories (tone check)

One per organ, the first of each four. Short enough for a phone screen.

- **Eye.** "I saw your world from very far away. It was blue and quiet. I came closer than I should have."
- **Lungs.** "The sand was warm. I slept in it for a long time. Then they came with shovels, and with chains."
- **Voice.** "They found out that I sing when I hurt. They built a gun around the song."
- **Mind.** "The men in the castle wrote everything down. They never asked me anything."
- **Blood.** "They put me in a train and sent me east, where no one would come looking."
- **Heart.** "You came looking."

## 7. The Raven clan

The README says "the evil empire"; the spec says "the raven clan and its hideouts". Proposal to join them:

- **The empire** is the state at war: its army, its navy, its air force. The ordinary hardware.
- **The Raven clan** is the order inside it that found the wreck and runs the Rabenwerk. Its hideouts are the six levels' bosses and secrets. Its emblem is a raven; its home is Ravenhold.
- The player fights the empire's units on the way, but hunts the clan.

That is also why the ending works: the carrier (the navy) surrenders, the empire goes on, and the clan has lost what it had.

## 8. Guardrails

- **Fictional empire.** No real symbols, names, units or politics. The Raven Prototype's art has "a clean insignia cross": it is legal, but a fictional raven emblem would carry the clan better and avoid the question. Symbols under § 86a StGB would need the USK's approval even in a game; the plan is never to need it.
- **Steer clear of the "Nazi UFO" myth** (Haunebu, Vril, Die Glocke). It comes from postwar far-right esoteric writing. This frame is its opposite: the ship is a victim, not a gift; the clan is a scavenger, not a master; the machines are welded from a corpse.
- **No glory for the machines.** The fun is in breaking them. A memory or a poster can hint at the cost (who built the fortress, who never came back) without showing it.

## 9. What changes in play, and what does not

- **Text and looks only (sections 3 to 6):** the Campaign plays exactly as before. `tests/replay.mjs`, `tests/enigma.mjs` and `tests/fixed-seed.mjs` stay green with no `--update`. Board scores stay comparable.
- **The shard meta (the daily rewards, memories, the ship's percentage):** saved data and screens; no change to a run.
- **Reclaim, the full-power opening, splinters feeding the super weapon:** changes in play. Enigma Run and the Daily Sortie first, like the other Enigma changes (`docs/names-and-behaviour.md`), with the balance bot and the flight gate.

## 10. Suggested order

1. **Words** (one build): the designations under the warning, the level-start sentence, "SHARD" on the results screen, the achievement texts. Reviewable in an afternoon, no balance risk.
2. **The purple seam and the streak** (one build per boss, or one shared effect): the visual rule and the breakup beat.
3. **The shard counter and memories** (the meta): percentage on the title, the memory screen, the daily payouts.
4. **The posters**: small pixel panels for the title and loading.
5. **Play changes**: the full-power opening, then Reclaim.

## 11. Decisions for the owner

1. Is the Raven clan the order inside the empire (§7), or the empire itself?
2. Designations: **R-n / Rabenwerk**, another letter, or none?
3. The organ per boss (§3): keep, or swap (for example the Heart in the train, so level 5's "shipped east" carries more weight)?
4. Does the ship speak (the memories in its voice), or are the memories the clan's own notes found with each shard (a colder, documentary tone)?
5. The prototype: does player 2's captured prototype get a line of its own, or stays unexplained?
6. The insignia on the clan's machines: keep the cross, or a raven emblem?
