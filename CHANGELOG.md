# Changelog

## Unreleased
- Stage 4: the castle approach is tighter: the scroll moves faster through the outer yard (1.5x) and the inner ward (2x), then eases into the keep yard. About 33 seconds of travel instead of about 47, plus the gate breach.
- Stage 4 boss (Ravenhold): its corner guns and tower guns are much tougher (about 1.8x health), so they last through the keep fight.
- Stage 4 castle grounds: thicker curtain walls with a wall walk and battlements, round corner towers with slate roofs, gun emplacements along both walls (a crossfire over the courtyards), and a gate breach: the advance stops at the closed inner gate until you blast it open while its guns and the flanking bunkers fire.
- Stage 4 boss (Ravenhold): "The Raven's Wheel", twice per fight. The bell tolls and crows circle the tower, then two arms of shells stream out of the tower top and the wheel turns once, so you fly round the tower ahead of an arm. Clockwise the first time, the other way the second time. The castle's other guns, hatches and fighters hold off while it turns.
- Stage 1 boss (Iron Leviathan): its final phase fires far fewer bullets (a 2-way spiral and a smaller, rarer ring), better suited to a first boss.
- Stage 1 boss (Iron Leviathan): "Hard to port" at 70% and 35% core health. The horn sounds and the battleship slowly swings about 60 degrees (about 4 seconds) so one long side faces you, smoke and flashes run along that side, then two broadsides fire out of it towards you before it swings back. Its big turrets and anti-aircraft guns are tougher (about 50% more health). It turns like a big ship: around a pivot near the bow with the stern swinging wide, creeping forward through the arc, slow to start with a small overshoot, leaving a curved wake, with funnel smoke trailing astern.
- Stage 2 boss (Sand Colossus) fights a retreat: it faces you and reverses up the screen with the scrolling ground, shifting lanes by angling its hull (it moves like a tank, never sideways). It digs in and the ground stops during its sandstorms. Last stand: once only its turret is left (or its core is below 30%), a track is shot off; it drifts towards you grinding in circles while its turret sprays a spiral, and the ground stops when it gets close.
- Big boss tracks look like real tank track prints (edge lines with grip bars) in a darker shade of the ground, and are less heavy than before.
- Stage 2 boss (Sand Colossus): "Sandstorm" at 85% and 45% core health. It digs in and its rear fans blast sand sideways; for about 6 seconds the wind pushes your plane and bends its shells, under a light sand haze. It also has about 50% more health.

## 1.1.1 update (7 October 2026)
- Leaderboard: names are left-aligned next to a narrower rank column, leaving room for bigger scores; rank movement (▲/▼/NEW) sits under the rank.
- Tutorial: the Easy / Normal / Hard choice at the end is now three stacked boxes, styled like the Start button.
- Title screen: removed the "Endless best" line, added more space between the buttons, and moved the tutorial "?" next to Start.
- Title screen: once the golden skin is unlocked, tap the ship to switch skins.
- Golden skin redesigned as a Golden Rooster: red comb, orange beak, hackle-orange wing edges and a green sickle tail.
- Local/test builds (localhost, file://, .test and home-network addresses) never submit scores to the live leaderboard.
- Fixed: home-screen icons were missing on the live site (the files weren't in the icons/ folder), which also stopped offline play from installing.
- Link previews: sharing the game link now shows a title, description and preview image.
- Project: new README, removed the outdated zip copy of the game, one VERSION constant in index.html, and an automatic smoke test on every pull request.
- Balance: the Stage 5 boss (Winter Wolf) calls in supply trains less often and keeps them off the tracks next to its own trains, so they no longer soak up most shots aimed at the boss. Fewer supply trains also means slightly fewer bonus points in that fight.
- Balance: the Arc weapon deals 1.25x instead of 0.45x damage to boss parts, and zaps soldiers, crates, drums and buildings only when nothing more important is in reach. Arc boss fights are now about as fast as with the other weapons.
- Testing: balance bot (tests/harness.js, tests/balance.mjs) for timing bosses and playing whole campaigns on local builds.
- Balance: the super laser is a little weaker: it takes about 0.95 s to charge (was 0.75 s), deals about 12% less damage, and each shot builds more heat, so it can be fired about 22% less often without overheating. It still clears bullets the same way.
- Extra lives are rarer: you can hold at most 6, the stage-clear bonus gives at most 1 extra plane (was 2), and after the first two score extends each gap is 1.5x the one before. The medal chain window is a little shorter (2.8 s, was 3.3 s).
- Continue screen: the battle now freezes while the countdown runs.
- Game over: the name entry sits at the bottom, so the GAME OVER screen and your score stay visible.
- Settings: the skin choice is now "Ship: Raptor / Rooster"; on phones the mouse and controller-rumble options are hidden (rumble appears once a controller is used).
- Resume: if the browser reloads the game mid-run (common on Android when switching apps), the title screen offers to resume. You restart the stage you were in with the score it began with and the lives, bombs, weapon and continues you had; the run still counts for the leaderboard. Leaving at the continue prompt spends a continue.
- Start flow: START, Endless and the practice stages now open a "Choose difficulty" panel (Easy / Normal / Hard, your last choice highlighted); START also offers the tutorial there. The "?" next to START opens How to play. Difficulty is no longer in Settings, and the old "New here?" prompt is gone.
- Phones held sideways show a "Turn your phone upright" screen and pause the run. In short desktop windows the game now shrinks to fit and hides the hint line instead of running off the top.
- Balance: bosses on Hard have 25% more health on top of Hard's existing bonus, so Hard boss fights last roughly 40-90% longer than on Normal.
- Boss fights: a weapon pod flies in 25 seconds into a boss fight and then every 35 seconds (up to 3 per fight), always carrying a weapon pickup, so you can switch weapons mid-fight.
- Balance: the final phase of the Stage 4 boss (Ravenhold) fires about half as many bullets (a slower spiral, smaller and less frequent rings). It used to be as intense as the Stage 6 boss.
- Readability: enemy bullets look the same in every stage: a steady deep orange with a hot core (no more orange/pink blinking), darker than the gold medals, with a darker shadow underneath.
- Stage 3 boss (Night Hammer): its searchlights now reach the whole screen. When one catches you, the beam flashes dark red and a red lock-on marker follows you, freezes, and the railgun fires a fast burst at that spot; shoot out both lights to stop it.
- Stage 1 boss (Iron Leviathan): "Full ahead" at 70% and 35% core health (or once its four big turrets are gone). The horn sounds, a dark red lane marks its path, then it surges forward firing a barrage of shells straight down that lane.
