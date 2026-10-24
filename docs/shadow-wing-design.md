# Shadow Wing: six variants (design, step 1)

Status: proposal for approval. Nothing is wired into the game. Mock-up: `docs/shadow-wing-looks.png`, made by `docs/shadow-wing-art-v1.js` (`makeWingsV1()`, built with the game's own sprite helpers, same 100 x 40 size and shading as `SPR.wing`).

![The six looks](shadow-wing-looks.png)

## 0. What I measured and found

- **Today's fight, measured in the game** (Enigma Run level 1, Normal, loop 0, the wing alone on screen, bot flying, 1600 frames): **peak 41 enemy bullets, average 18.5**, the peak at about frame 810, when the 16-shot ring overlaps a fan. Hard is the same (Normal and Hard share the bullet speed 1.34); Easy fires about a third fewer and a 0.65 ring. The measurement script is a throw-away; step 2 adds a proper check. The immortal bot clears bullets on a hit, so the real peak is a little higher.
- **Budget: 41 x 1.4 = about 57 bullets at loop 0.** The game's own cap is 420, so this is about readability, not the engine.
- **The level order is not the order I listed in the prompt.** The Enigma Run flies `STAGE_ORDER = [0, 2, 3, 4, 1, 5]`: Channel, Sea of Sand, Long Night, Iron Forest, Winter Line, Burning City. Levels 7 ("6B", the harbour city) and 8 ("1A", level 1 with islands) reuse the themes of levels 6 and 1 (`ENIGMA_BASE`). I fixed the prompt.
- **The Sower is not a single mini-boss.** It is a recurring forest enemy (`sowerTick`: first at 360 frames into a forest stretch, then every 1800 frames, HP 140, mines and bombs). The wing still appears in level 4 on its own timer.
- Today's patterns, for reference: **A** aimed 2-round burst every 48 frames, sides alternating; **B** 7-way fan of `'B'` shots every 180 frames; **C** ring of `16 + 2 * loop` every 300 frames. All three stay as the base of every variant.

## 1. The six variants

| Lvl | Tag in the boss bar | Livery (see mock-up) | One silhouette change | New or changed pattern |
|---|---|---|---|---|
| 1 Channel | SHADOW WING | Sea grey, today's camo | none | **none.** The reference: A, B, C as today, plus the tells below. Also used for level 8 (1A) |
| 2 Sea of Sand | SHADOW WING: DUST | Sand and khaki, tan splotches | Wider pods with dust filters over the intakes | **Curtain**: a row of 10 slow shots across the whole width with a 2-slot gap; the gap moves one to three slots from the last curtain |
| 3 Long Night | SHADOW WING: NIGHT | Near black, dim markings, red and green wingtip lights, amber exhaust glow | none (the lights are the change) | **Spiral**: two arms, 16 shots over 64 frames, slowly turning. The ring C drops from 16 to 12 in this variant |
| 4 Iron Forest | SHADOW WING: IRON | Splinter green over olive | A third pod on the centre line | **Triple shell**: the centre pod charges, then 3 big `'B'` shells, aimed, 14 frames apart. No mines or bombs (the Sower owns those) |
| 5 Winter Line | SHADOW WING: FROST | White wash over grey, red recognition bands on the tips | none (the bands are the change) | **Crossing lanes**: from each tip a line of 5 shots angled inward, so the two lines cross in an X in front of it |
| 6 Burning City | SHADOW WING: EMBER | Soot black, scorch marks, fires in the left wing, orange exhausts | none (the fires are the change) | **Twin ring**: C fires as two 12-shot rings, 24 frames apart, the second turned half a step (a checkerboard). Also used for level 7 (6B) |

Why each fits: the Channel wing is the lesson, so it stays a plain, honest version of today's fight. Dust, night and frost change what the player sees; iron and ember change what the player has to read. Night is the one level where bullets are easy to see on a dark ground, so it gets the prettier, slower spiral. The forest gets the fewest bullets because the Sower may be on screen. Level 6 is the finale of the run, so it gets the only pattern that doubles an existing one.

Per-variant movement stays today's sway (`x = W/2 + sin(mt * 0.011) * 50`). Dust may sway wider (amplitude 70) so its curtain gaps shift; that is the only movement change proposed.

## 2. Pattern budget

Each variant has the base A, B, C plus **at most one** new or changed pattern, so at most four. Estimates (loop 0, Normal) of the bullets a pattern adds at its worst overlap with the base, from speed times screen length divided by the period; step 2 replaces them with measurements:

| Pattern | Shots per use | Period (frames) | Speed (x bspeed) | Alive at once | Net change on the base peak |
|---|---|---|---|---|---|
| Curtain | 8 (10 less the gap) | 420 | 0.7 | about 8 | +8 |
| Spiral (ring C 16 to 12) | 16 | 480 | 0.6 | about 16 | +12 |
| Triple shell | 3 | 360 | 1.15 | about 3 | +3 |
| Crossing lanes | 10 | 360 | 1.0 | about 10 | +10 |
| Twin ring (replaces C) | 24 (2 x 12) | 300 | 0.75 | about 24 | +8 |

All stay under 41 + 12 = about 53, inside the 57 budget. Easy and Hard scale through the existing `DIFF.ring` and `DIFF.skip`, so the patterns go through `eshot` and `ring` and inherit them.

**Tells** (every new pattern, and the base ones too, cheaply): 30 to 45 frames before it fires, something on the wing shows it. A flash of the exhausts for the ring and spiral, the centre pod glowing for the triple shell, the tips flashing for the curtain and lanes. The audio cue is the existing `sfx('cannon')` moved to the start of the tell.
**Gaps:** every pattern leaves a lane the ship can reach at normal speed (the curtain's 2-slot gap is about 45 px wide; step 2 checks that against the ship's speed and hit size). Spiral arms are far enough apart that they cannot close a lane.

## 3. Escalation

Level 1 plays like today. The bullet count, the new pattern's size and the sway change in small steps up to level 6 (above: +0, +8, +12, +3, +10, +8, where the forest is low on purpose). HP stays `260 * (1 + 0.35 * loop)` in every variant, and the ring size, the speed and the fire rates keep their `loop` and `DIFF` scaling, so the Enigma Run's rank (`rankFor`) is the only thing that makes a later level harder. [verify in step 2 how `run.loop` is set in the Enigma Run, so the later variants do not stack on top of a rank that is already high.]

## 4. Candidate patterns

Considered and **picked**: curtain, spiral, triple shell, crossing lanes, twin ring.
Considered and **dropped**: a charge down the screen and back (it changes the wing's role and the bot's tests), drones from the pods (a second enemy type to balance, and the Sower already uses the air for support units), mines (the Sower's), a delayed-burst shell (needs a bullet that changes while it flies; `eshot` has no such kind). Any of them is a later recipe, not a new system.

## 5. The recipe format

The wing becomes data. A variant is one object; the look is built from it and the fight is run from it.

```js
WING_RECIPES.sd = {
  tag: 'SHADOW WING: DUST',
  look: { ramp: 'sand', camo: [0.56, 0.74, 0.13, 23], pods: [[40, 12], [60, 12]], podRx: 4.2, filters: true, exhaust: null, marks: 'cross' },
  move: { amp: 70, rate: 0.011 },
  weapons: [                                  // `at` is the frame within the cycle; `tell` frames come before it
    { p: 'aimedBurst', every: 48,  at: 0,   tell: 0,  side: 'alt', n: 2 },
    { p: 'fan',        every: 180, at: 90,  tell: 20, n: 7, spread: 0.16, speed: 0.9 },
    { p: 'ring',       every: 300, at: 210, tell: 30, n: 16, speed: 0.75 },
    { p: 'curtain',    every: 420, at: 330, tell: 40, slots: 10, gap: 2, shift: [1, 3], speed: 0.7 }
  ]
};
```

- **Look** (`docs/shadow-wing-art-v1.js` already builds all six this way): a palette ramp from `RP`, camo numbers, pod positions and size, and flags for the details (filters, lights, bands, scorch, fires, exhaust colour). One builder, no per-level drawing code. Sprites are baked once at load, like `SPR.sower`.
- **Weapons:** a small library of pure functions that only call `eshot` and `ring`: `aimedBurst`, `fan`, `ring`, `curtain`, `spiral`, `tripleShell`, `lanes`, `twinRing`. The wing's `update` runs the list: `if ((e.mt - w.at) % w.every === 0) LIB[w.p](e, w, ctx)`, and shows the tell from `w.tell` frames earlier. No per-level `if` in the update.
- **Pick:** the variant comes from the level's theme (`ENIGMA_BASE`, so 6B uses Ember and 1A uses Channel). For the Campaign wing nothing changes.

### Ready for the Generative mode

The same recipe can be drawn from parts and a seed (`sortieHash`-style, so it stays repeatable):

- **Look parameters:** ramp (any `RP` ramp or a dark or frost one), camo threshold and scale, 2 or 3 pods, pod size, one of the details (filters, lights, bands, scorch, fires), exhaust colour, markings.
- **Fight parameters:** the base three with a tuned size, plus **zero or one** pattern from the library with its own numbers (count, speed, gap, period).
- **Fairness rules a generator must satisfy** (checked by one function, `wingBudget(recipe, loop, diff)`, which step 2 also uses in its test):
  1. Peak bullets, estimated as the sum over weapons of `count * lifetime / period`, at most 1.4 times today's peak (57 at loop 0), scaled by the same `loop` and `DIFF` factors as today.
  2. At most one new or changed pattern.
  3. Every pattern has a tell of at least 30 frames.
  4. Every pattern leaves a lane at least 2.5 times the ship's hit width, reachable at ship speed.
  5. No two patterns fire in the same frame; offsets differ by at least 20 frames.
  6. Shot speed within 0.6 to 1.15 of `bspeed()`; HP never above today's formula.

## 6. Open choices

1. **Scope.** Recommendation: the Enigma Run only, with the old Campaign wing left as it is (it is the legacy mode and its replay baseline is gone anyway). Say if the Campaign should get the variants as well.
2. **Level 4.** Recommendation: keep the wing, and hold a new Sower while the wing is alive, so the two never share the screen. Alternative: let them overlap and rely on the forest variant's low count.
3. **Drops and pilot bail-out:** unchanged (`W`, `B`, `T`, 50 percent bail-out).
4. **Boss-bar names:** the tag column above (all start with SHADOW WING), or one name for every level.
5. **Silhouette:** only the Dust pods and the Iron third pod change the shape; the others are livery only. Say if you want more change, for example swept tips for Night.

## 7. Bolder shapes (answer to open choice 5)

Mock-up: `docs/shadow-wing-looks-v2.png`, from `docs/shadow-wing-art-v2.js` (`makeWingsV2()`). Each recipe now carries its own hull polygon. The nose, the cockpit and the 100 x 40 canvas stay, so the wing still reads as one aircraft and the hit box (hw 44, hh 12) stays valid.

![Bolder shapes](shadow-wing-looks-v2.png)

| Lvl | Shape change | Gameplay reading |
|---|---|---|
| 1 Channel | none | the reference |
| 2 Sea of Sand | A crescent: the tips curve forward into two horns, a concave leading edge | Heavy and scythe-like, which fits a curtain that sweeps across the screen. The horns are where the tips flash for the tell |
| 3 Long Night | Needle tips raked far back, a deeper notch in the trailing edge, wingtip lights | A sharp, fast-looking dart: fits the spiral; the tip lights give the dark level its landmarks |
| 4 Iron Forest | A tail boom with a tailplane on the centre line, a third pod | The boom points up the screen, away from the player; the pod is the triple shell's gun |
| 5 Winter Line | A sawtooth leading edge, four teeth a side, red bands on the tips | Reads as ice and frost. Each tooth is a natural origin for one shot of the crossing lanes, so the lanes can come from the teeth |
| 6 Burning City | Two heavy gun nacelles hung forward of the leading edge, barrels pointing at the player, fires, soot | A gunship: the barrels are where the twin ring and the aimed burst visibly come from. Symmetric, so nothing needs a side rule |

Notes:
- A shape that is only drawn bigger than its hit box lies to the player. The crescent's horns and the Ember gun nacelles reach 4 to 10 pixels below the hit box (hw 44, hh 12), and the sawtooth teeth about 4. Step 2 either gives those three variants their own `hw` and `hh` (recipe fields) or keeps the hit box and says so in the report. My recommendation: Sand `hw` 48, Ember `hh` 16 (the nacelles are armour), Winter unchanged.
- The Ember wing's barrels point straight down, so its aimed burst can fire from them (the nacelle x positions replace the old `e.x +- 18` side offsets): one recipe field, `muzzles: [-40, 40]`.
- Night's sharp tips are about 2 pixels thin at the end; on a phone at the smallest size they may vanish. If so, the tip lights carry the silhouette.
- The first v2 ideas for 2, 5 and 6 (blunt tips with drop tanks, ski-like winglets, a broken left tip) were replaced after review.
- The shape is the cheapest generative knob: a hull is a short polygon, so a generator could sweep, blunt or drop the tips by a few numbers. The fairness rules stay as in section 5, plus: the hull stays inside the 100 x 40 canvas and its widest point within 4 pixels of the hit box.

Stop here for your answer before step 2.
