# Vehicles overview

An inventory of every vehicle in FEUERVOGEL 89 and a list of what could be refined. All of it comes from reading `index.html` (line numbers drift; search for the names). Nothing was run or play-tested for this, so the "feel" notes are judgements from the code and are marked as such.

**Scope.** Enemy ground, rail, sea and air vehicles are covered. I read the ground vehicles (road and rail) closely. Naval units and aircraft are covered at stat and movement level only. Bosses are listed but not analysed. The player's ship, drones and P2 are not covered.

## 1. The vehicles

Stats are the `stats:` defaults in `ENT` or the spawn call. HP is multiplied by `hpm()` (loop and difficulty) where the spawn code does so.

### Road vehicles

| Type | Role | HP | Size (hw×hh) | Score | Weapon | Movement | Sprite and animation |
|---|---|---|---|---|---|---|---|
| `tank` | Main ground threat | 10 | 7×9 | 500 | Turret, one shell, aims at the player (turns 0.04 rad/frame) | Route, patrol or free (3 modes in one function), v 0.2 | 16 rotations, 2-frame tracks (only while moving), separate rotating turret |
| `htank` | Heavy tank (loop ≥ 1, or 18% as convoy lead) | 26 | 9×12 | 1500 | 3-shell spread | Same code as `tank` | Same, grey, larger |
| `truck` | Convoy filler | 4 | 5×9 | 200 | None | Route or road, v 0.32 | 16 rotations, **single frame** |
| `acar` | Armoured car (also from the level 5 gate) | 4 | 5×9 | 700 | Stops, fires a 3-round burst; or patrols and bursts | Wraps `truck`'s movement | 16 rotations, single frame |
| `moto` | Motorbike, harmless | 1.5 | 3×5 | 300 | None | `truck` movement, v 0.85 | 16 rotations, single frame |
| `staff` | Staff car, harmless | 2.5 | 4×6 | 500 | None | `truck` movement, v 0.65 | 16 rotations, single frame |
| `ftruck` | Fuel truck, explodes (blast 26) | 5 | 5×9 | 600 | None | Patrol between two points, v 0.25, no road following | 16 rotations, single frame |
| `parked` | Parked planes and cars, harmless, uncounted | 3 | 8×7 | 300 | None | Static (taxis only if `taxi` is set) | One sprite |
| `cart` | Cosmetic critter on the road | — | — | — | None | **Disabled**: the spawn is behind `if (false)` | — |

### Rail

| Type | Role | HP | Score | Notes |
|---|---|---|---|---|
| `loco` | Train head, steam or diesel | 16–26 | 1500 | Smoke by type; killing it makes the cars slow down and shower sparks |
| `boxcar` | Cargo | 8 | 500 | No weapon |
| `flatcar` | Flak wagon | 10 | 700 | Aims and fires flak |
| `ammocar` | Explosive wagon (level 5 gorge) | — | — | Blast 40, damages everything within 44 px, triggers the gorge blast |

Trains move in a straight line along the rail (`trainMove`). Cars coupled to one that falls into the chasm fall with it.

### Sea

| Type | HP | Size | Score | Weapon |
|---|---|---|---|---|
| `pt` (PT boat) | 8 | 5×14 | 400 | One turret |
| `destroyer` | spawn-set | 12×36 | 3000 | Two turrets, 2-round bursts |
| `sub` | 34 | 5×20 | 2000 | Surfaces, then fires |

All three move in a straight line south and stop at the shore. They have foam trails; the destroyer also smokes.

### Air

`fighter` (formations, crash animation, boom-and-zoom return), `heavy` (HP 12, 1200), `bomber` (2500), `sower` (4000, 104×80 sprite), `wing` (10000, mini-boss), `flare` (HP 2), `rdrone` (HP 3), `pod` (HP 5), `missile` (HP 2, uncounted).

### Bosses that are vehicles

`ship` (Iron Leviathan), `train` (Winter Wolf), `fortress` (Sand Colossus), `railgun` (Night Hammer), plus `protoDuel` (Raven Prototype). The castle and sky fortress are structures, not vehicles.

## 2. Where they come from

- **Campaign.** `convoy(wy, trucks)` spawns 1 to 3 tanks or trucks in a row on the main road. `lightVehicle` spawns a moto or staff car, and `march` spawns troops, both on the country, forest, fortline and city bands. Tanks are capped at `3 + loop` on screen. `acar`: max 2, 6% roll. `ftruck`: max 2. `loco`: one train per run on bands with rail.
- **Enigma Run.** The same functions pick a *route* (`routePick`) and follow it with `routeStep`: the main road, village lanes, side roads. They keep `ROUTE_GAP` (10 px) from the vehicle ahead and stop at route ends. Convoy spacing is 34 px (Campaign: 26). Trains come from the plan's `trainRuns`.
- **Design constraint.** Many Enigma-only branches (`capStep`, `routeStep`, `ROUTE_SPACE`) exist so the **Campaign plays exactly as before and scores stay comparable**. Anything that changes Campaign vehicle movement, HP or spawn rolls is a balance change and shifts the random stream.

## 3. What could be refined

Ordered by what I think pays off most. "Verified" means I read the code that shows it. "Judgement" means it is a design opinion that needs play-testing.

### A. Feel and presentation

1. **Wheeled vehicles are lifeless** (verified). Only tanks animate (2-frame tracks). Truck, acar, moto, staff and ftruck have one frame each, so they slide. Even a 2-frame wheel or exhaust flicker would help.
2. **Dust and tracks are tank-only** (verified). `ENT.tank.update` emits dust every 12 frames while moving. Trucks, cars and bikes emit none in that code. The spec says moving vehicles kick up dust, and `index.html` has a second dust block at "Cosmetic step". I did not check whether it covers wheeled vehicles, so look there first.
3. **No vehicle engine or track sound** (verified by searching `sfx`/engine names; not exhaustive). Cannon, gun and explosions exist. The only per-vehicle audio I found is the boss warning (horn, whistle, tank roll, rail roll).
4. **Wreck treatment is inconsistent** (verified). `acar`, `moto`, `loco` leave a crater plus a wreck sprite. `tank`, `htank` and `truck` leave only the wreck decal (check `wreckDefault` for what it adds). A burnt truck or tank with no scorch is the odd one out.
5. **Tank wrecks lose the turret** (judgement). `DEATHS.tank.wreck` draws the hull only (`SPR.tank[0]`). A blown-off turret decal is a classic and cheap.

### B. Behaviour and AI

7. **Tanks aim at the player's current position with no lead** (verified: `aim(e.x, e.y)`). Their slow turret (0.04) is the only difficulty lever. Judgement: that suits the slow-shell design, but it means a tank is never really a threat while the player is moving.
8. **Naval units cannot steer** (verified). `pt`, `destroyer` and `sub` only do `wy += v` and stop when the next tile is not sea. A heading and a bit of drift would stop them looking like they are on rails, and would use the 16-direction sprite code the road vehicles already have. Their sprites are not rotated, so this would need `rotSet`.
9. **Trains only go straight** (verified). Fine for the Campaign's straight rail. In Enigma levels, curved track would need `ang`, which exists only for the level 5 bridge.
10. **`ftruck` ignores roads** (verified). It patrols between two points in a straight line, unlike every other road vehicle. It is harmless, but it is the one vehicle that can cross a lawn.
11. **The harmless set is large** (`moto`, `staff`, `ftruck`, `parked`, `station`) (verified). Judgement: they are scenery that happens to score. A small reaction (a staff car that speeds up when shot at nearby, or a fuel truck that flees) would make them feel alive without adding threat.
12. **Unused cart** (verified). `critters.push({ kind: 'cart', ... })` is behind `if (false)`. Either finish it or delete the dead line.

### C. Code health

13. **Train spawn is copy-pasted five times** (verified): `loco` is created with its own HP and diesel logic at roughly `4123`, `8839`, `8945`, `9239` and `9913`, with HP of 16, 20 or 26 in different places. One `spawnTrain()` would make balance changes safe.
14. **`ENT.tank.update` mixes three movement modes and the weapon** (verified), while `truck`, `acar`, `moto` and `staff` share another movement function. A single `driveStep(e)` for route, road and free movement would shorten both and make the jitter and route tests easier to extend.
15. **Stats are scattered** (verified). Some are in `ENT.*.stats`, some in `tankStats`, some in spawn calls (`lightVehicle`, `convoy`, `ftruck`). A single vehicle table would give you the numbers in section 1 in one place.
16. **Tests cover motion but not combat** (verified from `tests/`). `jitter.mjs` watches every ground vehicle for swings and jumps in every stage and level. `enigma.mjs` checks convoys stay on route and keep spacing. I found no test for vehicle HP or score, train behaviour or naval movement.

## 4. Suggested first steps

| Step | Why | Risk |
|---|---|---|
| Dust and 2-frame wheels for wheeled vehicles (A1, A2) | Biggest visible improvement per line | None to balance |
| Crater and turret wreck for tanks, trucks (A4, A5) | Consistent look | None to balance |
| One `spawnTrain()` (C13) | Makes later train work safe | Must keep Campaign RNG order identical |
| Heading for sea units (B8) | Removes the "on rails" look | Needs rotated sprites; Campaign behaviour changes slightly |
| Vehicle table (C15) | Shows all numbers in one place | Pure refactor |

## 5. Open questions for you

- Should refinements change **Campaign** behaviour, or only Enigma Run? Today's design keeps the Campaign unchanged for score comparability.
- By "vehicles", do you also mean the player's ship and drones? I left them out.
- Is sound in scope? Engine and track sounds would be new audio code.
