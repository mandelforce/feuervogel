// Super weapon test: four pickups at level 4 fill the super steps, the fourth makes "level 8", a hit or another weapon drops it, each gun gets its super form.
// Serve the folder first (python3 -m http.server 8000). Prints only failures and a count.  node tests/superweapon.mjs [--shot=dir]
import { chromium } from 'playwright';
const PAGE = process.env.STARFALL_URL || 'http://localhost:8000/';
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
await sf(`settings.diff = 1; startEnigma(2, false); 0`);
await sf(`(() => { for (let i = 0; i < 260; i++) update(); })()`);

/* a snapshot keeps the super steps */
let r = await sf(`(() => { player.inv = 99999; player.dead = 0; player.wpn = 'A'; player.lvl = 4; player.sup = 3; let t = null; for (let k = 0; k < 600 && !t; k++) { t = takeSnapshot(); if (!t) update(); } return t ? snapDecode(t).player.sup : -1; })()`);
ok(r === 3, `a snapshot keeps the super steps (${r})`);

/* pickups: levels 1 to 4 as before, then four super steps worth 250 each, then 1000 as before */
r = await sf(`(() => { player.inv = 99999; player.wpn = 'S'; player.lvl = 3; player.sup = 0; const o = { gain: [] };
  for (let k = 0; k < 6; k++) { const s0 = run.score; world.items.push(Object.assign(mkItem('W', player.x, player.y), { w: 'S' })); update(); o.gain.push(run.score - s0); o['l' + k] = player.lvl + ':' + player.sup; }
  o.sup = isSup(player); return o; })()`);
ok(r.l0 === '4:0' && r.l1 === '4:1' && r.l2 === '4:2' && r.l3 === '4:3' && r.l4 === '4:4' && r.l5 === '4:4', `pickups walk level 3, 4, then four super steps and stop there (${r.l0} ${r.l1} ${r.l2} ${r.l3} ${r.l4} ${r.l5})`);
ok(r.gain[1] >= 250 && r.gain[1] < 1000 && r.gain[4] >= 250 && r.gain[4] < 1000 && r.gain[5] >= 1000 && r.sup, `a super step pays 250, the pickup at level 8 pays 1000 (${r.gain})`);
r = await sf(`(() => { world.items.push(Object.assign(mkItem('W', player.x, player.y), { w: 'L' })); update(); return { w: player.wpn, lvl: player.lvl, sup: player.sup }; })()`);
ok(r.w === 'L' && r.lvl === 4 && r.sup === 0, `another weapon keeps level 4 but loses the super steps (${JSON.stringify(r)})`);

/* a hit: level 4 and above fall to level 3 with no super steps */
for (const sup of [0, 2, 4]) {
  r = await sf(`(() => { player.wpn = 'S'; player.lvl = 4; player.sup = ${sup}; player.inv = 0; player.dead = 0; die('test'); return { lvl: player.lvl, sup: player.sup }; })()`);
  ok(r.lvl === 3 && r.sup === 0, `a hit at level 4 with ${sup} super steps leaves level 3 (${JSON.stringify(r)})`);
  await sf(`(() => { player.dead = 0; for (let i = 0; i < 400; i++) update(); })()`);
}

/* the guns: the super form fires more / differently than level 4 */
const fire = (w, sup) => sf(`(() => { player.inv = 99999; player.dead = 0; player.wpn = '${w}'; player.lvl = 4; player.sup = ${sup}; player.cd = 0; player.mcd = 0; world.shots.length = 0; arcs.length = 0;
  const en = { type: 'drone', x: player.x, y: player.y - 90, hp: 9999, mhp: 9999, hw: 8, hh: 8, vx: 0, vy: 0 }; 
  firing(player, false); const sh = world.shots.map(s => ({ k: s.k, lv: s.lv, hl: s.hl, sl: s.sl, flank: s.flank, w: s.w, dmg: s.dmg })); return { n: sh.length, sh, lvl: wl(player) }; })()`);
let a = await fire('S', 4), b = await fire('S', 4);
a = await fire('S', 0); b = await fire('S', 4);
ok(a.lvl === 4 && b.lvl === 5 && a.n === 7 && b.n === 9, `Scatter: 7 darts at level 4, 9 at super (${a.n} -> ${b.n})`);
a = await fire('L', 0); b = await fire('L', 4);
ok(a.n === 1 && b.n === 3 && b.sh.filter(s => s.flank).length === 2 && b.sh[0].dmg > a.sh[0].dmg && b.sh[0].w > a.sh[0].w, `Lance: one bolt at level 4; super has a stronger, wider main bolt and two flank bolts (${a.n} -> ${b.n})`);
a = await fire('H', 0); b = await fire('H', 4);
ok(a.sh.filter(s => s.k === 'h').length === 4 && b.sh.filter(s => s.k === 'h').length === 6 && b.sh.some(s => s.hl === 5), `Seekers: 4 missiles at level 4, 6 and a super laser at super (${a.sh.filter(s => s.k === 'h').length} -> ${b.sh.filter(s => s.k === 'h').length})`);
ok(await sf(`ARC_LV[5].reach > ARC_LV[4].reach && ARC_LV[5].dmg > ARC_LV[4].dmg && ARC_LV[5].jumps > ARC_LV[4].jumps`), 'Arc: the super table is stronger than level 4');

/* the HUD, the aura and the glow draw without errors, and carry into the next level */
r = await sf(`(() => { const o = {}; for (const w of ['S', 'L', 'H', 'A']) for (const sup of [0, 2, 4]) { player.wpn = w; player.lvl = 4; player.sup = sup; player.dead = 0; update(); render(); }
  player.wpn = 'H'; player.lvl = 4; player.sup = 4; const lv = run.sortie.level; endEnigmaLevel(); return { lv, now: run.sortie.level, w: player.wpn, lvl: player.lvl, sup: player.sup, errs: 0 }; })()`);
ok(r.now === r.lv + 1 && r.w === 'H' && r.lvl === 4 && r.sup === 4, `the super weapon carries into the next level (${JSON.stringify(r)})`);

await browser.close();
console.log(bad ? `${bad} failed, ${passed} passed` : `all ${passed} checks passed`);
process.exit(bad ? 1 : 0);
