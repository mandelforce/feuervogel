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
