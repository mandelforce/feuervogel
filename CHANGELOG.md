# Changelog

## Unreleased
- Leaderboard: names are left-aligned next to a narrower rank column, leaving room for bigger scores; rank movement (▲/▼/NEW) sits under the rank.
- Tutorial: the Easy / Normal / Hard choice at the end is now three stacked boxes, styled like the Start button.
- Title screen: removed the "Endless best" line, added more space between the buttons, and moved the tutorial "?" next to Start.
- Title screen: once the golden skin is unlocked, tap the ship to switch skins.
- Golden skin redesigned as a Golden Rooster: red comb, orange beak, hackle-orange wing edges and a green sickle tail.
- Local/test builds (localhost, file://, .test) no longer submit scores to the live leaderboard.
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
- Stage 3 boss (Night Hammer): its searchlights now reach the whole screen. When one catches you, a red lock-on marker follows you, freezes, and the railgun fires a fast burst at that spot; shoot out both lights to stop it.
