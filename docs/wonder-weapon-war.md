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

## 12. Daily Sortie shards: what the boss carries (owner idea)

Not every Daily Sortie ends with a shard. Every day's boss carries a **cargo**, and the cargo is the day's reward. The difficulty tier multiplies shards (Rookie 1, Veteran 2, Ace 3; not stacking, so an Ace clear pays the Ace amount only).

| Cargo | When | Rookie | Veteran | Ace | Seen on the boss |
|---|---|---|---|---|---|
| **Gold** (the clan's payroll) | about 1 day in 3 | 0 shards, medals x2 | same | same | plain hardware; it bursts into a shower of medals |
| **One shard** | most days | 1 | 2 | 3 | the purple seam on its core (§4) |
| **Two shards** | **hard days only** (below) | 2 | 4 | 6 | the seam, and a shard transport in its wake (or a second core) |

**Two shards are earned, not drawn (owner).** A day carries two shards when it is hard:
- a hard twist: Glass cannon, Elite day, No pickups, Heavy bullets (the list is the owner's);
- a tough boss form: the heavy forms of the bosses (`docs/daily-sortie-plan.md`, the boss forms table: sand fortress heavy x1.2, castle heavy, sky fortress lance);
- the `rank` or `loop` flavour (the 1945 rules).

The composer already decides all three per date, so the cargo follows from them; the only drawn part is gold or one shard on the other days.

**Rules:**
- **Same for everyone, from the date.** The cargo is part of `dailyDay(date)` (beside kit, seed, twist and flavour). The gold day is drawn from its own `sortieHash` stream. The cargo does not change the level's ground, so no `composeVersion` bump; the gold burst and the second core are looks and drops only.
- **Shown in advance, one day ahead.** The title shows today's cargo and **tomorrow's** ("TOMORROW: TWO SHARDS, ELITE DAY"). A hard day announced with its reward is a challenge people plan for.
- **No long dry spells.** Per week (shuffled, not day by day): at least 4 shard days, never 2 gold days in a row. If a week has no hard day, the composer makes one.
- **No day is empty.** Gold days pay double medals for the black market (§13); the courier, the board, the kit stamp and the week bonus are there every day.
- **Catch-up pays at most 1 shard.** Flying a past day (the last 7) pays at most 1, whatever its cargo was; gold days pay their medals as normal.

## 13. The black market: medals for shards (owner idea)

Medals already drop from enemies and feed the chain and the score. From now on every medal picked up is also **banked** in a purse that survives the run. The purse buys shards and small things at the black market. Spending never touches a score, a board or a run.

**Who runs it: the Magpie (Elster).** A smuggler who deals in anything that shines: the clan's gold, its stolen parts, its secrets. Magpies steal shiny things; it is one more bird in a game of birds (Falke, Swan, Robin, Swallow). The Magpie has robbed clan depots and sells what it found. It stands on the carrier's deck (the Daily Sorties' base; before the Campaign is finished, a hidden corner of the hangar). One small screen, reached from the title next to the ships.

**Where medals come from:** every medal picked up in the Campaign, Enigma Run, Practice, Endless and the Daily Sortie, banked when the run ends, **game over included**. This matters as much as the shards: a player who dies in level 2 still leaves with something, and that is the newcomer the game keeps losing.

**What it sells:**

| Item | Price | Limit | Why |
|---|---|---|---|
| **Shard** | P medals, then 2P for the second | **2 a week** (resets with the weekly board) | a path to the shards that rewards effort, not skill |
| **A rumour**: where today's courier hides (a hint, not the place: "the third train", "stay left after the bridge") | small | 1 a day | ties the purse to the hunt; the community sees who bought it |
| Looks: a trail, a Nova colour, a poster for the title | medium | none | the sink for full purses, and after the ship is whole |
| A memory you missed (a fragment, not a full one) | large | 1 a week | for the players chasing the story |

**Setting P.** Measure the average medals banked per Daily Sortie on each difficulty with the bot (the balance bot already counts `run.stats.medals`). Set P so a shard costs about three average sorties' medals. Then a gold day (double medals) is about two thirds of a shard, and a week of play buys the two market shards with some to spare.

**Why the market cannot replace the dailies:** at most 2 shards a week, against about 3 to 7 a week from the dailies for a Rookie and 15 to 20 for an Ace. For a weaker player those 2 are a large share, for a strong one a small one. That is the right way round.

**Farming.** Endless is the mode where medals pile up fastest. The weekly limit already stops a shard farm; if Endless still outpaces everything, bank Endless medals at half.

**Saved data.** The purse sits beside the shards in `store` and needs the same save code (shard design, "practical points"). Since spending is local and cosmetic, editing the purse only cheats yourself; the community counter only counts shards from runs the server saw.

**Decisions for the owner:** the cargo of hard days (which twists and boss forms count); the gold days' share; the Magpie, or another dealer; P and the weekly limit; whether Endless and Practice bank medals in full.

## 14. The war map: choosing the daily (owner idea)

Players choose which daily to fly. This turns sections 12 and 13 into a small roguelike meta game: risk and reward each day, and choices that carry through a week.

### 14.1 Each day: three targets

The title's Daily button opens a map of the front with **three targets for today**. They are the same for every player, all composed and flown by the bot before release, like today's single sortie.

| Target | Cargo (§12) | What it is |
|---|---|---|
| **Supply line** (safe) | gold: double medals | an easy sortie, no twist |
| **Depot** (standard) | one shard | today's ordinary sortie, a normal twist |
| **Hideout** (risky) | two shards | a hard twist or a tough boss form |

- **The choice is binding.** The first launch commits the day to that target. Retries of it are free (the same as now); the other two can still be flown for score, but pay medals only.
- **Each target has its own board for the day.** Three sorties are not comparable, so their scores do not share a board. The title shows how many players took each target.
- **First day: one button.** Until a player has cleared one Daily Sortie, the map is hidden and the Daily button flies the Depot. The choice comes on the second visit, when the player knows what a sortie is. A game that loses people early must not open with a map.

### 14.2 Each week: the front and the raid

The week is a short map, read like a front line: **five steps over seven days**, each step a choice of three targets (14.1), ending on the weekend in a **raid** on a clan hideout: one of the six wonder weapons (§3) in its heavy form, or the Raven Prototype.

What the week's choices do:

- **Intel.** Each Hideout cleared this week weakens the raid boss (one part fewer, or a pattern dropped). The risky road makes the end easier.
- **Supplies.** Each Supply line cleared gives the raid a start bonus: a Nova, or the weapon one level up. The safe road makes the ship stronger.
- **Heat.** Each Hideout raises the clan's **alert** by one. The raid is flown at that alert: more enemies and faster bullets, more shards (one more shard per two alert, capped).

So a strong player takes Hideouts (high heat, weak boss, big pay), a careful player takes Supply lines (low heat, strong ship, small pay), and most players mix. The roguelike decisions are of the kind *Slay the Spire* and *Hades* use: pick a path node, carry its effect forward, raise the stakes for a bigger reward.

**Two slack days.** Five steps in seven days: a player who misses two days still reaches the raid. A step not taken by the raid counts as a Depot.

### 14.3 The raid's board

Supplies, intel and heat make raids unequal. The raid board is split by **heat** (0 to 5), and within a heat tier ranks by score. Supplies and intel are shown next to the name. The high-heat tiers are the prestige board.

### 14.4 Lore

The front is the clan's network of hideouts across the four kits' lands (desert, forest, winter, city). Supply lines carry its payroll, depots its parts, hideouts its shards. The Magpie (§13) sells the rumour that names this week's raid target before Sunday.

### 14.5 Cost

- **Three sorties a day to compose and vet** instead of one. The flight gate's time triples (today one sortie takes a few minutes of bot flight per difficulty). The three can share the day's kit or take three kits.
- **The raid**: a weekly sortie built from the existing bosses' heavy forms, with heat as a rank factor (the Daily plan's `rank` flavour is the base).
- **Saved week state**: the steps taken, heat, supplies, intel, beside the shards and the purse in `store`, under the same save code.
- **The map screen**: one screen, three cards a day, five rows a week.

### 14.6 Suggested order

1. Three targets a day, no week map (14.1). Already gives the daily choice.
2. Heat and the raid (14.2, 14.3), once three-target days are stable.

**Decisions for the owner:** three targets or two; binding choice or free; the week's length (five steps over seven days); what intel and supplies give; the raid's boss rotation.
