# The wonder-weapon war: story frame, feathers and seasons

Status: design, agreed with the owner in brainstorming; nothing is in the game yet. Numbers are starting values, to be tuned with real players' data (§17). Names in **bold** are proposals unless marked (owner).

Revision 2. It replaces the first draft's shards, organs, daily cargo and war map with feathers and seasons. What was dropped is listed in §19.

## 0. In one paragraph

It is 1944 and the empire is losing its war. Years earlier something came down from the sky, burning like a meteor: an alien firebird, half ship, half living thing. As it fell it shed its glowing feathers in a long trail across the sea, the desert, the forests, the snow and the cities; the hull landed nearly whole, but bare and weak. The empire's Raven clan collected the feathers and fused them into machines that should never have worked: a flagship, a land fortress, a supergun, a castle full of laboratories, an armoured train, a flying fortress. These are the empire's wonder weapons, and they work because each holds a feather. The hull, the Feuervogel, sat on a carrier waiting for a pilot. You take it. The Campaign (1944 and 1945) is that story. After it, from the surrendered carrier, the **seasons** begin: each season the firebird gathers its plumage again, faces the clan's newest answer, climbs to the edge of the sky, burns out and falls, and is reborn.

## 1. The trope, and the turn this game gives it

The real wonder weapons of 1944/45 (the V-2, the Me 262, the Horten flying wing, the Schwerer Gustav railway gun, the V-3 supergun, the Maus and the Ratte) were the gamble of a regime that had already lost: too complex, too late, too few. Players half-know this, so the game's giant bosses need no explanation.

The turn: **in this world the gamble works, because of the feathers.** That gives the stakes (the allies lost the Burning City to the Black Fortress), the theme (a cornered empire with impossible weapons) and the mechanic (the feather is what holds each machine together, and the place to hit it).

Three images carry the frame, all already in the game's names:
- **The ravens** feed on the dead. The clan scavenges what fell.
- **The firebird** is reborn. In the Russian tale a single feather of the firebird lights a whole room; in Stravinsky's *Firebird* the bird gives Ivan a feather to call her when he needs her. The feather is the classic magic object of this myth.
- **The fall explains the levels.** The six levels follow the trail of the fall: sea, desert, night country, forest, winter, city.

## 2. What the game already has that fits

| Already in the game | Where | What it becomes |
|---|---|---|
| The Feuervogel is a stranded alien ship, stolen from the carrier | README, level 1's `carrier_start` | Unchanged: the bare hull |
| Pods, the Nova and its icon in the alien palette (`RP.alien`, `RP.crys`) | sprites | Pods are **down**: small loose feathers the empire's units carry. This explains why enemies drop power-ups |
| Every boss has a `core` part (`BOSS[...].parts`, `k: 'core'`) | `BOSS` | The core holds the boss's **feather** |
| The Black Fortress's core: "a purple alien orb like the weapon pods, which swells while the laser charges" | boss draw code | The largest bundle of feathers; already visibly alien |
| The super weapon's aura: a flame off each wing tip | `superAura` | The ship for a moment at full plumage |
| The Raven Prototype, "the Ravens' secret project, a half-size Black Fortress prototype" at Ravenhold; it returns before the level 5 boss and duels before the final boss | `protoDuel` | The clan's first try at a firebird of its own. Season 1's finale grows out of it (§11) |
| The Moth: the 1945 prototype, whose dust overheats the laser | `mothDust` | A desperate copy; season 4's line (§13) |
| Player 2 flies "a captured Raven prototype" | sprites | Two thieves: the second pilot flies the clan's copy |
| Shadow Wing, six variants | `docs/shadow-wing-design.md` | The clan's hunter; the pattern for season remixes (§13) |
| Secrets: an artifact (a gem) under circling crows, one per level | `run.stats.artifact` | A feather the clan hid, guarded by its birds |
| Ships: Swan, Robin, Phoenix, Raptor, Rooster, Swallow, Falke, Nachtvogel, unlocked by achievements | `ACH` | **Forms** of the living ship (§4) |
| Level 6: the allies lost a battle; their planes lie shot down | spec §10 | The Black Fortress did this |
| The ending: the carrier surrenders and becomes your base; the Daily Sorties fly from it | `docs/campaign-ending.md` | The seasons start from here |
| Enigma Run | | The clan's codes; the weekly key (§8) and Endless Enigma (§16) |

## 3. The six wonder weapons

In the Enigma Run's level order. The designation is a second line under the WARNING text, after the real "V" (Vergeltung) weapons: **R** for **Rabenwerk**, the clan's weapons office.

| Lvl | Boss (bar name) | Warning today | Designation | Real-world echo | What its feather does | When the feather is torn out |
|---|---|---|---|---|---|---|
| 1 | IRON LEVIATHAN | ENEMY FLAGSHIP APPROACHING | **R-1 LEVIATHAN** | big-gun battleship, radar fire | sees through weather and night | its guns fire blind; the hull lists and burns |
| 2 | SAND COLOSSUS | LAND FORTRESS INBOUND | **R-2 KOLOSS** | Ratte, Maus | moves a mass no engine could; it dug the hull out of the sand | it sinks under its own weight |
| 3 | NIGHT HAMMER | SUPERGUN DETECTED | **R-3 NACHTHAMMER** | V-3, Schwerer Gustav | the coils' song: a barrel that survives its shot | the barrel bursts on the next charge |
| 4 | RAVENHOLD | THE CASTLE GUNS AWAKEN | **RABENHORST** (no number: the clan's home) | the secret research site | the laboratories; the prototype is built here | the prototype loses its link and flees |
| 5 | WINTER WOLF | ARMOURED TRAIN ON THE LINE | **R-5 WINTERWOLF** | railway guns, the trains east | feathers shipped east to a safer factory | the train runs on with dead engines until it derails |
| 6 | BLACK FORTRESS | FLYING FORTRESS ON RADAR | **R-6 HIMMELSFESTUNG** | Amerika Bomber, Horten wings | keeps the impossible thing in the air | it falls |

- The banner keeps its line; the designation is a smaller second line (`renderMain`, `app.msg.a === 'WARNING'`; the boss calls `showMsg('WARNING', BOSS[bk].warn, 220)`).
- **One shared beat at every boss kill:** the core flashes purple and a streak of light flies into the ship (before `BOSS_LOOKS.breakup`). It tells the story without a word.

## 4. The ship and its forms

- **The ship is alive and can reshape its plumage.** Every ship in the picker is a **form** it has learned. The white feathers of the six secrets let it become the Swan; the Phoenix is its reborn form; and so on.
- This needs no new code: every ship is unlocked by an achievement already. Their descriptions get one line each in this voice.
- Forms are looks, not stats. Each season adds one new form (§12).

## 5. The visual rule: purple is a feather

**Anything glowing in the alien purple (`RP.alien`) is the firebird's. It is where a machine is weakest, and it is yours.**

- Pods, the Nova and the Black Fortress core already follow it.
- Each boss's `core` gets a thin purple seam, brighter as it loses health.
- Nothing purple ever hurts the player; enemy bullets keep their colours.

## 6. Story in the Campaign, cheaply

| Place | Today | Proposal |
|---|---|---|
| Level start (`showMsg`) | level name | a third line: "THE KOLOSS DUG IT OUT OF THIS SAND" |
| WARNING banner | warning | the designation (§3) |
| Boss kill | breakup | the purple streak (§3) |
| Results | SECRET FOUND/MISSED with a gem | "FEATHER" with the gem |
| Congrats, 1944 → 1945 | THE ENEMY GROWS STRONGER | keep; or "1945. THE CLAN HAS A NEW PROTOTYPE" |
| Title, loading | logo | clan posters: "THE WEAPON THAT ENDS THE WAR", "RABENWERK: WE BUILD TOMORROW" |
| Achievements | "Find all six secrets" | "Find the six feathers the clan hid" |

Escalation through the levels: ordinary 1944 hardware in level 1, more purple seams each level, level 6 more alien than diesel. 1945 repeats it with the clan's answers (the Moth, Ravenhold a ruin because you wrecked it, the Winter Wolf's mortars).

**The Campaign is unchanged in play.** It tells the founding story and keeps its board. It feeds no season.

## 7. Seasons (owner)

- **A season is 6 weeks**, the same for everyone, on fixed dates. Then one **ash week**, then the next season.
- **24 feathers** make the full plumage: **18** from the weekday dailies, **6 great feathers** from the weekend raids.
- Feathers belong to the season. At its end the ship climbs, burns out and falls; the feathers scatter again. **The rebirth is the reset.**
- What lasts: forms, a mark for each completed season, memories (§14), decrypted messages, the purse, the machine and rotors, archive unlocks.

| Week | Weekdays (Mon to Fri) | Weekend (Sat and Sun) |
|---|---|---|
| 1 | daily: a feather or a key letter | raid: R-1 Leviathan |
| 2 | " | R-2 Koloss |
| 3 | " | R-3 Nachthammer |
| 4 | " | Rabenhorst |
| 5 | " | R-5 Winterwolf |
| 6 | " | R-6 Himmelsfestung, then **the season finale** (§11) |
| ash | Endless Enigma double medals; no feathers | the rebirth scene; the next season's first message |

## 8. The weekday daily

- **A fresh run every day:** 3 lives, a fresh weapon. The board stays fair and a missed day never hurts a run.
- **The week has a thread:** the clan moves this week's great feather to a hideout; weekdays you hit its route, the weekend you raid the place. One line a day on the title tells it ("TUESDAY: THE CONVOY LEFT THE DESERT").
- **After a clear, one choice: a feather (power) or a key letter (knowledge).**

### The key letters (intel)

A key letter is a piece of the clan's weekly key. It:
1. **decrypts a message**: an order, a lab note, a transport list. Feathers give the season from outside; letters say what the clan plans. The slow story.
2. **shows the raid**: where the great feather lies, which part of the boss is weak (marked in the fight), which way the raid flies.
3. **opens the raid's secret** with the whole week's key (**3 letters**, proposal): a hidden hangar, a prisoner train, a second vault. It pays a form or a cosmetic, never a feather, so the plumage stays at 24.

**The courier** carries a key letter: an enemy hidden in each daily (a Kübel off a side road, a boxcar in the third train), the same for everyone, so players share where it is.

### Difficulty

| | Rookie | Veteran | Ace |
|---|---|---|---|
| Clear pays | a feather **or** a letter | a feather **or** a letter, medals x1.5 | a feather **and** a letter, medals x2 |

The 18-feather cap holds on every difficulty. A player who flies 3 days a week takes feathers every time and still completes; a player who flies every day has 12 days for letters.

## 9. The weekend raid

- One of the six wonder weapons in its **heavy form**, with the season's pattern variant (§13). Open Saturday and Sunday.
- Pays the week's **great feather**.
- The week's letters show its weak point and open its secret.
- The season's perks apply (§10).
- Board: score, with letters and perks shown next to the name.

## 10. Perks (owner)

- After each raid, choose **1 of 2 perks**. Six raids, six perks; they reset with the season.
- **Every perk turns a knob that exists:** start at weapon level 2; +1 Nova; a Talon drone at the start; faster laser charge; medals drawn in; one hit per leg costs no life; a longer chain window.
- **They apply to the raids, the finale and Endless Enigma** (owner), never to the weekday dailies.
- One choice a week, two cards, one line each.

## 11. The season finale

Week 6's weekend: the Himmelsfestung raid and the finale as **two legs**, one life back at the seam (capped at 3). The one sortie of a season that earns about 12 minutes.

**Every feather you did not collect is still with the clan.** It fuses them into its answer: in season 1, **the Raven**, a dark copy of the firebird, grown out of the Raven Prototype.

- **Its strength is the feathers you miss.** At 24 it is at its weakest.
- **Frenzy with gaps (owner):** at 24 feathers frenzy runs long with short gaps (about 2 s); with fewer, shorter frenzy and longer gaps. When hit, the Raven **sheds feathers**; catching one refills the frenzy. The Raven fires its heaviest attacks into the gaps.
- **All four super weapons:** shed feathers come in the weapon colours; catching one switches to that weapon's super form.
- **A boss rush in one body:** a phase for each wonder weapon's signature attack (the Leviathan's broadsides, the Koloss's mortars, the Nachthammer's beam, ...).
- **The arena climbs** above the clouds until the sky is black: the firebird tries to leave, the Raven tries to stop it.
- **The ending:** the Raven falls; the firebird climbs, burns out and falls. The ash week begins.
- **Board:** score, by feather count.

## 12. What a season adds (the recipe)

Familiar parts, three new things:
1. **A new finale boss** (the one big job).
2. **One new element:** a twist, an enemy or a kit.
3. **One remix:** a familiar boss with a new pattern (as the Shadow Wing variants).
4. **A story arc:** the season's messages and one new form.

## 13. The season arc (owner: yes)

| Season | Finale | New element | Story turn |
|---|---|---|---|
| 1 | **The Raven**: the clan's copy of the firebird | the season itself: feathers, key, raids, perks | the clan wants a firebird of its own |
| 2 | **The Nest**: a flying carrier that launches ravens | carrier waves in every level | it learns to build in numbers |
| 3 | **The Magpie** | the black market closes for a week | betrayal: the dealer was collecting feathers for itself |
| 4 | **The Moth Queen** | dust that blinds the laser | the clan's 1945 desperation |
| 5 | **The Flock** | a signal in the sky, other lights | the firebird was not alone |
| 6 | the origin | | where it came from |

**Ash week (owner: yes):** a breather for players and a buffer for building the next season. A season can be rerun while the next is built.

## 14. Memories

- **24 memories in the ship's voice**, one for each feather slot the first time it is filled. A lifetime collection: once read, kept.
- The clan's voice is the key letters' messages (§8) and Endless Enigma's decrypted traffic (§16). The two voices tell the story from both sides.
- Text first; an artist's image for each later.

Samples (tone check):
- "I saw your world from very far away. It was blue and quiet. I came closer than I should have."
- "I burned all the way down. Every feather I lost, I felt."
- "The sand was warm. Then they came with shovels, and with chains."
- "They found out that I sing when I hurt. They built a gun around the song."
- "They put me in a train and sent me east, where no one would come looking."
- "You came looking."

## 15. Medals, the Magpie, lives and continues

### The purse
- Every medal picked up in a **Daily Sortie, raid, finale or Endless Enigma** also goes into a purse that survives the run. **Campaign medals do not count** (owner).
- **When:** a clear banks all of the run's medals; a game over banks half (**the Magpie's cut**: it salvages the wreck and keeps half); the finale's seam banks the first leg's in full. Replays of the same day bank the day's best run in full, later runs a quarter.
- **Starter purse:** P/2 (one first continue), given when a player's progress is first created.

### The Magpie (Elster)
A smuggler who deals in anything that shines; one more bird among the forms. It sells:

| Item | Price | Limit |
|---|---|---|
| **A missed feather** | P | 1 a week |
| A rumour: where today's courier hides | small | 1 a day |
| Looks: trails, Nova colours, posters | medium | none |
| **The cipher machine** (Endless Enigma) | medals, one time | |
| Rotors IV to VI | medals, one time each | |
| Archive days and months | A a day, a month at 10 % off | |

In season 3 it is the villain (§13); the market is closed that week.

### Lives and continues (owner)
- **3 ships, no free continues.** Score extends stay (`DIFF.ext`). One life is a twist, not the rule.
- **A continue costs medals:** P/2 the first, P the second, at most 2. Paid from this run's medals first, then the purse.
- **A continued clear pays in full**; the price balances it. The score carries on; no ★ on the board, as today.
- The Campaign keeps its two free continues.

## 16. The archive and Endless Enigma

### The archive (owner)
- Every Daily Sortie is kept (the composer rebuilds it from its seed). **The last 7 days are free**; older days are unlocked with medals per day or per month (10 % off).
- Archive days pay **medals only**, at the replay rate. Each keeps its board.

### Endless Enigma (owner; replaces the old Endless, which is retired)
- An endless chain of **pre-vetted** sorties (a pool per kit, built by the bot overnight; a run never repeats one).
- After each leg, choose the next of three: **Supply line** (easy, one life back), **Depot** (ordinary), **Hideout** (hard, heat +1, more medals).
- 3 lives, no continues. **The season's perks apply.**
- **The weekly key:** everyone gets the same tree of choices for a week, so the depth board is fair. Weekly board and all-time best.
- **Depth as rotor letters:** AAA at the start, AAK after 10 legs, ABA after 26 (the middle rotor turns: "SECOND ROTOR: A DEEPER LAYER"), ACA after 52. Going deeper is going deeper into the code. Each turnover and each tenth leg decrypts a clan message.
- **Payouts:**
  - **depth 10 once a week: one feather**, counting towards the season's 18;
  - first time at depth 10, 26 and 52: a form or a plumage mark, and medals;
  - the run always ends at game over, so it banks half its medals.
- **The machine** unlocks the mode: bought once from the Magpie for **medals** (permanent), after one cleared Daily Sortie.
- **Rotors:** three slots, each a rule for the run with a medal multiplier. Rotors change medals, never feathers. The board shows them.

| Rotor | Rule | Medals | Unlock |
|---|---|---|---|
| I | none | x1 | with the machine |
| II | Swarm | x1.2 | with the machine |
| III | Elite | x1.3 | with the machine |
| IV | Heavy bullets | x1.3 | medals |
| V | Night | x1.4 | medals |
| VI | Glass: one life, no Supply-line lives | x2 | medals |
| R (the Raven rotor) | heat starts at 2 | x1.5 | **found** at depth 52, never sold (owner) |

## 17. Numbers to tune later (owner)

P (a feather's price), A (an archive day), the continue prices, the medal multipliers, the game-over share, the replay rate, the rotor list, the finale's frenzy and gaps, the letters per key. Tune with: medals per sortie and clear rates per difficulty from real runs (the run record, `rrSend`).

## 18. Still to design before building

1. **A hub:** the carrier deck, holding the plumage, purse, Magpie, memories, messages, archive, Endless Enigma, forms. The title is 224 px wide; the Daily Sortie is still in Settings.
2. **An unlock order:** day 1 shows Campaign and Daily only; the Magpie and the week's thread after the first clear; the archive and Endless Enigma later.
3. **No real money, ever.** Said in the game: feathers and medals cannot be bought.
4. **Save code** (or sync with the board name) for feathers, purse, forms, memories; one device's storage is not enough.
5. **Two players:** who gets feathers, letters and medals; whether a continue costs both.
6. **Fewer boards:** one per difficulty for a day, with icons for letters and perks; archive boards only once they have entries.
7. **The clock:** days and weeks in UTC (`dateKeyUTC`); one clear change time shown in the player's local time.
8. **Measuring:** day-2 and day-7 return, clears per difficulty, without personal data.
9. **The first minute:** the full-power opening and Reclaim (§19) still answer the original problem, players who leave before they see the game.
10. **The artist's list:** the Magpie, the machine, posters, memory images, the Raven, the forms' season marks.

## 19. Play changes kept for later, and what was dropped

**Kept for later:**
- **The full-power opening:** the first 30 to 40 s of level 1 in frenzy, escaping the carrier; then the carrier's failsafe shakes the down loose and the launching fighters catch it. The player sees the peak in the first minute.
- **Reclaim:** fly close to an enemy that carries down (a purple seam) and the ship pulls it out; the machine turns on its own side for a few seconds.

Both change play, so they go to Enigma Run and the dailies first, with the balance bot and the flight gate; the Campaign's board stays comparable.

**Dropped from draft 1:** shards and organs (now feathers and forms); 120 shards (now 24 a season); daily cargo of 1/2/3 shards by difficulty, gold and double days; three targets a day and heat in the dailies (three targets and heat live on in Endless Enigma); the war map's supplies and intel as boss weakening (letters now do more); two legs except for the finale; shard milestones in Endless Enigma.

## 20. Order of work

1. **Words and looks** (§3, §5, §6): designations, seams, the streak, texts. The Campaign plays exactly as before (`tests/replay.mjs`, `tests/enigma.mjs`, `tests/fixed-seed.mjs` green without `--update`).
2. **Measure** where players leave and how many clear a daily (§18.8).
3. **Save code, purse, feathers, the hub** (§15, §18).
4. **The weekday daily with feather or letter, the raid, perks** (§8 to §10): a first season without a new finale boss, to test the rhythm.
5. **The Raven** (§11), and season 1 for real.
6. **The archive, Endless Enigma** (§16).
7. **The full-power opening and Reclaim** (§19).
