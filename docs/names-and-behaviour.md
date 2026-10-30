# Names and behaviour for the picked vehicles

Proposal for decision. Nothing here is wired into the game yet. The picks come from the lineup tool's database (collection `picks`).

## Short names

One short name per unit, for the lineup tool, the docs and any on-screen label. Where a real model is the picked design, the name is its nickname or a short form of it.

| Id | Picked design | Name | Why |
|---|---|---|---|
| `tank` + `buechse` | Swept-wing rangefinder, long gun (replaces the long-gun `ltank`) | **Büchse** | the German hunting rifle: one barrel, one aimed shot; the Drilling's partner (was "Lancer") |
| `htank` + `drill` | Small Sand Colossus, three barrels | **Drilling** | the German three-barrelled gun, a new type |
| `tank` | Clean + raster | **Panzer** | the standard tank |
| `htank` | Clean + raster | **Tiger** | the heavy |
| `truck` | Canvas truck, new front | **Blitz** | the Opel Blitz |
| `acar` | Eight wheels | **Puma** | the 8-wheel Sd.Kfz. 234 |
| `moto` | Passenger with an MG | **Gespann** | German for a sidecar outfit |
| `staff` | Kübelwagen v2 | **Kübel** | the usual short form |
| `ftruck` | Silver tank, flame sign | **Tanker** | |
| `loco` | Clean + raster | **Loco** | |
| `locoD` | Clean + raster | **Diesel** | |
| `boxcar` | Clean + raster | **Boxcar** | |
| `flatcar` | Clean + raster | **Flak car** | it carries the flak |
| `ammocar` | Clean + raster | **Ammo car** | |
| `pt` | S-boat | **S-boat** | |
| `destroyer` | Z-class, dazzle camouflage | **Z-class** | |
| `sub` | Original, symmetric | **U-boat** | |
| `fighter` | Fw 190 | **Würger** | the Fw 190's nickname (shrike) |
| `heavy` | Bf 110 Zerstörer | **Hammer** | the twin-engine heavy; "Zerstörer" would clash with the ship |
| `pfeil` (new) | Do 335 | **Pfeil** | arrow, its own name |
| `bomber` | He 111, twin fins, four engines | **Heinkel** | |
| `sower` | Bf 110 cockpit | **Sower** | already short |

The name "Hammer" is also the name of the Night Hammer boss; if that clashes, use "Twin".

## Gameplay for new or changed units

Principle: classic Campaign stays exactly as it is, so scores stay comparable. Everything below is for the Enigma version only.

Changes that are only a new look (no behaviour change proposed): Panzer, Tiger, Puma (apart from its hit box), the trains, the three ships, Würger, Sower.

### New or changed behaviour

| Unit | Proposal | Numbers |
|---|---|---|
| **Pfeil** (new plane) | The hornet. Hunts the nearer ship from a band above it, beside its guns, nose always on the ship. Exposure (time in the column above the ship, hits) sends it off the side of the screen; it comes back from a flank and ambushes: the nose locks and flares, then a short burst. Breaks hard across and past a Seeker aimed at it (on a cooldown). Fears the Arc: holds beside the cone and bolts when locked, so the Arc wins by chasing it; the Lance too. Goes in for the kill on a ship charging its laser (no waiting, a spot just beyond the beam, one shot more): a beam swept at it as it flares catches it about 2 times in 3. Leaves after three ambushes or 20 s. Hit while hunting, it sometimes snaps out of the guns at once. Appears from level 3 in pairs, one from each side of the screen (never down through the guns), replacing some fighters. From level 4 sometimes as a **Wingman Formation** of two or three (three from level 5) that take turns: one ambushes, the next visibly lines up, the rest hold their lanes; shooting down all of them pays a bonus (`WING`, `waveWing`, `wingTick`). (Was: a push-pull fighter flying straight south, shooting from the front and then the rear.) | HP 10, score 1500, cruise 2.2 (2.0 against the Arc), all numbers in `PFEIL` |
| **Hammer** (changed heavy) | Today it pauses and fires one three-shot spread at the player. Keep that, but fire the spread from its two engines (it already leaves two trails), and from loop 1 add a second spread 14 frames after the first. Bigger sprite, so a bigger hit box. | HP 12, score 1200 (unchanged), hit box 36 x 30 |
| **Heinkel** (changed bomber) | Today it drifts south firing aimed shots (three from loop 1) and breaks up when shot down. Make the four engines four damage points: its HP is split in four, each engine lost slows it a little and adds a smoke trail, and the break-up comes with the last engine. Its engine trails already sit at four x positions, so they would line up with the new art. | existing HP split in four, score 2500, hit box 50 x 32 |
| **Büchse** (new tank; was the Lancer) | A marksman that holds a firing line. In convoys from level 2 on (instead of a Panzer, 1 in 4), and dug in, lying across the screen, in side emplacements at the screen's left or right edge (sandbags round it, open towards the middle; two in levels 2 to 6B, one in 6, whose edges are built up, none in 1 and 1A; `BUECHSE_NESTS`, `CityGen.edgeNests`, `planNests`). Track: the turret follows the ship. Aim, 1 s: a pale dotted sight line from the muzzle to the screen's edge, aimed ahead of the ship (lead: the ship's smoothed velocity times the shell's flight time, times 0.5 / 0.8 / 1 on Rookie / Veteran / Ace) with a pale bracket on that point. Lock, 0.35 s: the line freezes and turns red, a red bracket marks the locked point, the tank halts and its muzzle glows. One shell down the frozen line (it never steers), then 1.5 s of rest. It aims only once it is well on the screen. Its turret has its own health like the Drilling's. Olive by day, a lighter olive at dusk and night; the rangefinder's arms are dark and its lenses glass, so the gun is the one bright spoke and its muzzle the one light. | Hull HP 14, turret 42 (fixed), score 1500, hit box 7 x 15 (15 x 7 lying across), turret 0.03 rad a tick, shell 2 x bspeed; `BUECHSE`, `buechseTick` |
| **Drilling** (new tank) | Area denial from a fixed spot: dug in, in the plans' tank pits (three in level 2, two in 1A, 3, 4, 5, 6 and 6B; `DRILL_PITS`, `CityGen.tankPits`, `planDrills`), and on patrol along side streets in the cities (levels 6, 6B). Tracks the ship, then halts and locks for 0.7 s (the three muzzles glow), fires 2 to 4 salvos of three shells while the turret sweeps across where the ship was, and rests 2 s. Its turret has its own health: many hits, outlives an untouched Nova, a full laser pops it. Gunmetal by day, silver at dusk and night. | Hull HP 18, turret 42 (fixed), score 2000, hit box 10 x 13, one on screen (one more each loop); `DRILL` |
| **Gespann** (changed motorbike) | Armed: the passenger fires a short aimed burst at the player when in range, while the bike keeps moving. The harmless solo bike is dropped in Enigma. | HP 3, score 400, speed 0.85, burst of two |
| **Blitz** (changed truck) | Two or three soldiers jump out when it is destroyed (uses the existing `troop`), and run for a few steps. Bigger sprite, so a bigger hit box. | HP 4, hit box 6 x 11, score 200 |
| **Tanker** (changed fuel truck) | The flame sign says "explodes", and now it does more: a larger blast that sets neighbours off in a chain, and a short fire on the road. | blast 26 to 32, fire for 3 s |
| **Kübel** (changed staff car) | Harmless, but it speeds up when shot at nearby, and an officer's medal drops when it is destroyed (the staff car already has a medal chance). | speed 0.65 to 0.9 when alarmed, medals 0.6 |

Optional, not picked: a rocket bike (Panzerschreck, Raketenwerfer) that fires a slow unguided rocket. It exists in the lineup tool as variants of the Motorbike; it would be a new unit.

### Hit boxes

Bigger sprites need bigger hit boxes, otherwise a shot passes through the paint. Proposal: keep the hit box about 80 percent of the sprite, as the game does today (truck sprite 10 x 20, hit box 10 x 18).

| Unit | Old sprite | New sprite | New hit box |
|---|---|---|---|
| Blitz | 10 x 20 | 12 x 24 | 10 x 22 |
| Puma | 12 x 20 | 13 x 22 | 11 x 20 |
| Gespann | 10 x 15 | 14 x 18 | 9 x 13 |
| Kübel | 8 x 13 | 12 x 20 | 10 x 17 |
| Tanker | 10 x 22 | 12 x 24 | 10 x 20 |
| Hammer | 26 x 20 (sprite 30 x 24) | 42 x 36 | 36 x 30 |
| Heinkel | 42 x 26 (sprite 46 x 34) | 55 x 42 | 50 x 32 |

## Wiring: what "only the Enigma version" means

Two readings; I will take the first unless told otherwise.

1. The new art shows only when the Enigma look is on (the Enigma slider above 0, `ENIGMA_T > 0`), in any run, and the new behaviours only apply to those runs. The Campaign at slider 0 is untouched.
2. The new art shows only in the six Enigma Run levels.

The Sower and the Enigma Run levels already exist as Enigma-only content (the Sower is the level 4 mini-boss), so new Enigma-only units fit the Enigma Run director.

Plan for either: each new sprite set sits next to the old one (for example `SPR.truck` and `SPR.truckE`), `spr` and the vehicle `LOOKS` pick the Enigma set when the look is on, and the new unit types (Pfeil, Büchse) are only spawned by the Enigma Run director.

## Decision and wiring (done)

Decided: names as proposed, all eight behaviour changes, Enigma Run levels only (the look slider is ignored), no rocket bike.
Wired in `index.html`: the baked sprites (`<script id="enigmaArt">`, `ENIG_ART`, `setEnigmaArt`, swapped into `SPR` while `run.sortie` is set), hit boxes (`ENIG_BOX`), and the behaviours (`wavePfeil`, `ENT.pfeil` with `PFEIL` and `pfeilTick`, heavy and bomber updates, `bomberEngines`, the Lancer in `convoy` (now the Büchse), the armed Gespann in `lightVehicle`, the Blitz's soldiers, the Tanker's wider blast, the Kübel's alarm). Differences from the proposal: the Enigma Run has no loop, so the Hammer's second spread starts at level 3 and the Lancer joins convoys from level 2. The fighter leader (`SPR.fighterL`) is still the classic sprite.

Leader: the "red spinner and cowl, white tips" version of the Fw 190 (`ld_nose` in `docs/leader-art-v20.js`) is the Enigma Run's formation leader sprite (`SPR.fighterL` in the Enigma art set).
