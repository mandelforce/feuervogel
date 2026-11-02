// Two-player (PC) test: player 2's Talon drones, weapons carried into the next level, Nova refill on respawn, and Settings > Sensitivity.
// Serve the folder first (python3 -m http.server 8000). Prints only failures and a count.  node tests/twoplayer.mjs [--shot=path.png]
import { chromium } from 'playwright';
const PAGE = process.env.STARFALL_URL || 'http://localhost:8000/';
const shot = (process.argv.find(a => a.startsWith('--shot=')) || '').slice(7);
let bad = 0, passed = 0;
const ok = (c, m) => { if (c) passed++; else { bad++; console.error('FAIL ' + m); } };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
await page.route(/workers\.dev/, r => r.abort());
page.on('pageerror', e => { bad++; console.error('page error:', e.message); });
await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
await page.goto(PAGE);
await page.waitForFunction(() => typeof window.__sf === 'function', null, { polling: 100, timeout: 60000 });
const sf = c => page.evaluate(x => window.__sf(x), c);
await sf('app.booting && finishBoot(), 0');
const steps = n => sf(`(() => { for (let i = 0; i < ${n}; i++) update(); })()`);

await sf(`settings.p2 = 'mouse'; settings.diff = 1; startEnigma(2, false); 0`);
await steps(260);
ok(await sf('!!p2 && player.fly === 0 && p2.drones === 0'), 'two-player run starts, player 2 has no Talons');

// Talon pickups for player 2: two dock, a third is worth 2000
let r = await sf(`(() => { const s0 = run.score2; const o = {}; p2.x = 100; p2.y = 150; p2.inv = 9999;
  for (let k = 0; k < 3; k++) { world.items.push(mkItem('T', p2.x, p2.y)); update(); o['d' + k] = p2.drones; }
  o.p1 = player.drones; o.gain = run.score2 - s0; return o; })()`);
ok(r.d0 === 1 && r.d1 === 2 && r.d2 === 2 && r.p1 === 0 && r.gain >= 2000, `player 2 collects Talons (${JSON.stringify(r)})`);

// The drones fire with player 2's weapon, and the shots count for player 2
r = await sf(`(() => { world.shots.length = 0; p2.dcd = 0; let n = 0, o2 = 0; for (let i = 0; i < 30; i++) { update(); } for (const s of world.shots) if (s.drone) { n++; if (s.o === 2) o2++; } return { n, o2 }; })()`);
ok(r.n > 0 && r.n === r.o2, `player 2's Talons shoot, shots belong to player 2 (${JSON.stringify(r)})`);

// Dying loses the Talons; the respawn refills Nova bombs like player 1's
r = await sf(`(() => { run.bombs2 = 0; p2.inv = 0; hurtP2(); const o = { drones: p2.drones, bombsDead: run.bombs2 }; for (let i = 0; i < 160; i++) update(); o.bombs = run.bombs2; o.want = Math.max(3, DIFF.bombs[settings.diff]); return o; })()`);
ok(r.drones === 0 && r.bombsDead === 0 && r.bombs >= r.want, `player 2's respawn refills Novas and loses Talons (${JSON.stringify(r)})`);

// Weapons, levels and Talons carry into the next level for both ships
r = await sf(`(() => { player.wpn = 'L'; player.lvl = 3; player.drones = 1; p2.wpn = 'A'; p2.lvl = 4; p2.drones = 2; const lv = run.sortie.level;
  endEnigmaLevel(); return { lv, now: run.sortie.level, p1: [player.wpn, player.lvl, player.drones], p2: [p2.wpn, p2.lvl, p2.drones] }; })()`);
ok(r.now === r.lv + 1 && r.p1.join() === 'L,3,1' && r.p2.join() === 'A,4,2', `both ships keep weapon, level and Talons into the next level (${JSON.stringify(r)})`);
await steps(200);
ok(await sf('p2.drones === 2 && player.drones === 1'), 'Talons are still there after the fly-in');

// Sensitivity: the settings entry exists, 100% is the middle, and the factors scale movement
r = await sf(`(() => { openSettings(); const q = id => document.getElementById(id), o = {};
  o.row = !!q('sSensRow'); o.mid = ['sSensMouse', 'sSensKey', 'sSensPad'].every(id => +q(id).value === 100 && (+q(id).min + +q(id).max) / 2 === 100);
  o.label = q('sSensKeyV').textContent; q('sSensKey').value = 150; q('sSensKey').dispatchEvent(new Event('input')); o.set = settings.sensKey; o.label2 = q('sSensKeyV').textContent;
  setPanel.classList.remove('open'); app.paused = false; app.panelPaused = false; return o; })()`);
ok(r.row && r.mid && r.label === '100%' && r.set === 150 && r.label2 === '150%', `Settings > Sensitivity (${JSON.stringify(r)})`);
r = await sf(`(() => { const o = {}; app.resumeT = 0; app.results = null; const move = k => { player.x = 112; player.y = 150; player.lx = 112; settings.sensKey = k; keys.arrowright = true; for (let i = 0; i < 4; i++) player.x = player.x, update(); keys.arrowright = false; return player.x - 112; };
  o.lo = move(50); o.mid = move(100); o.hi = move(150); return o; })()`);
ok(r.lo > 0 && r.lo < r.mid && r.mid < r.hi, `keyboard sensitivity scales movement (${JSON.stringify(r)})`);
// The Campaign loops after level 6 with two players too, and a two-player run may enter the board (with the combined score)
r = await sf(`(() => { startEnigma(6, true); run.start = 1; run.score = 12345; run.score2 = 2345; p2.wpn = 'A'; p2.lvl = 3; const o = { elig: lbEligible(), twoP: run.twoP }; endEnigmaLevel();
  o.level = run.sortie && run.sortie.level; o.loops = run.loops; o.stage = run.stage; o.hasP2 = !!p2; o.score = run.score; o.score2 = run.score2; o.p2 = p2 && [p2.wpn, p2.lvl]; return o; })()`);
ok(r.elig && r.twoP && r.level === 1 && r.loops === 1 && r.stage === 7 && r.hasP2 && r.score === 12345 && r.score2 === 2345 && r.p2.join() === 'A,3', `two players loop to level 1 again after level 6 (${JSON.stringify(r)})`);
if (shot) { await sf('settings.sensKey = 100; 0'); await steps(30); await sf('render(), 0'); await page.screenshot({ path: shot }); }
await browser.close();
console.log(bad ? `${bad} failed, ${passed} passed` : `all ${passed} checks passed`);
process.exit(bad ? 1 : 0);
