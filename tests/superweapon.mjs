// Super weapon test: four pickups at level 4 fill the super steps, the fourth makes "level 8" for SUP_TIME frames, a hit or another weapon drops it, each gun gets its super form that one-shots small enemies.
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

/* the frenzy: extra planes while a ship has the super weapon, none otherwise */
let fr = await sf(`(() => { player.inv = 99999; player.dead = 0; player.wpn = 'S'; player.lvl = 4; player.sup = 0; player.supT = 0; world.enemies.length = 0; world.later.length = 0; world.frenzyCd = 0; const o = {};
  frenzyTick(); o.off = world.enemies.length + world.later.length;
  player.sup = 4; player.supT = SUP_TIME; world.frenzyCd = 2; frenzyTick(); o.wait = world.enemies.length + world.later.length;
  const s0 = drandS; world.frenzyCd = 0; frenzyTick(); o.on = world.enemies.length + world.later.length; o.stream = drandS === s0;
  let n = 0; for (let i = 0; i < 300; i++) { world.enemies.length = 0; player.supT = SUP_TIME; update(); } o.cd = world.frenzyCd > 0;
  player.sup = 0; player.supT = 0; world.enemies.length = 0; world.later.length = 0; for (let i = 0; i < 3; i++) frenzyTick(); o.after = world.enemies.length + world.later.length; return o; })()`);
ok(fr.off === 0 && fr.wait === 0 && fr.on >= 2 && fr.stream && fr.after === 0, `the frenzy sends planes only while the super weapon is on, and leaves the random stream alone (${JSON.stringify(fr)})`);

/* a snapshot keeps the super steps */
let r = await sf(`(() => { player.inv = 99999; player.dead = 0; player.wpn = 'A'; player.lvl = 4; player.sup = 4; player.supT = 321; let t = null; for (let k = 0; k < 600 && !t; k++) { t = takeSnapshot(); if (!t) update(); } return t ? snapDecode(t).player.supT : -1; })()`);
ok(r > 0 && r <= 321, `a snapshot keeps the super time (${r})`);

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

/* a fresh run (the deaths above used up the lives) */
await sf(`settings.diff = 1; startEnigma(2, false); 0`);
await sf(`(() => { for (let i = 0; i < 260; i++) update(); })()`);

/* the guns: the super form fires more / differently than level 4 */
const fire = (w, sup) => sf(`(() => { player.inv = 99999; player.dead = 0; player.wpn = '${w}'; player.lvl = 4; player.sup = ${sup}; player.supT = SUP_TIME; player.cd = 0; player.mcd = 0; world.shots.length = 0; arcs.length = 0;
  const en = { type: 'drone', x: player.x, y: player.y - 90, hp: 9999, mhp: 9999, hw: 8, hh: 8, vx: 0, vy: 0 }; 
  firing(player, false); const sh = world.shots.map(s => ({ k: s.k, lv: s.lv, hl: s.hl, sl: s.sl, flank: s.flank, w: s.w, dmg: s.dmg })); return { n: sh.length, sh, lvl: wl(player) }; })()`);
let a = await fire('S', 4), b = await fire('S', 4);
a = await fire('S', 0); b = await fire('S', 4);
ok(a.lvl === 4 && b.lvl === 5 && a.n === 7 && b.n === 13, `Scatter: 7 darts at level 4, 13 at super (${a.n} -> ${b.n})`);
a = await fire('L', 0); b = await fire('L', 4);
ok(a.n === 1 && b.n === 5 && b.sh.filter(s => s.flank).length === 4 && b.sh[0].dmg > a.sh[0].dmg && b.sh[0].w > a.sh[0].w, `Lance: one bolt at level 4; super has a stronger, wider main bolt and four flank bolts (${a.n} -> ${b.n})`);
a = await fire('H', 0); b = await fire('H', 4);
ok(a.sh.filter(s => s.k === 'h').length === 4 && b.sh.filter(s => s.k === 'h').length === 10 && b.sh.some(s => s.hl === 5), `Seekers: 4 missiles at level 4, 10 and a super laser at super (${a.sh.filter(s => s.k === 'h').length} -> ${b.sh.filter(s => s.k === 'h').length})`);
ok(await sf(`ARC_LV[5].reach > ARC_LV[4].reach && ARC_LV[5].dmg > ARC_LV[4].dmg && ARC_LV[5].jumps > ARC_LV[4].jumps && ARC_LV[5].bd < ARC_LV[5].dmg`), 'Arc: the super table reaches further and jumps more, and hits big targets for less');

/* the Arc below the super level: a rope to the front that aims at nothing, trails behind the ship, and forks at level 4 */
r = await sf(`(() => { const o = { n: [] }; player.inv = 99999; player.dead = 0; player.wpn = 'A'; player.sup = 0; player.supT = 0; player.x = W / 2; player.y = H - 60;
  const lay = lv => { gf++; player.lvl = lv; player.cd = 0; arcs.length = 0; firing(player, false); return arcs.filter(a => !a.link).length; };
  const foe = dx => { const e = E('pod', { x: player.x + dx, y: player.y - 120 }); e.hp = e.maxhp = 50; world.enemies.push(e); return e; };
  world.enemies.length = 0; for (const lv of [1, 2, 3, 4]) o.n.push(lay(lv));
  o.len = +((player.y - 12 - arcs[0].pts[arcs[0].pts.length - 1][1]) / H).toFixed(2);
  const side = foe(50); lay(1); o.side = 50 - side.hp;
  world.enemies.length = 0; const front = foe(0); lay(1); o.front = 50 - front.hp;
  world.enemies.length = 0; const a3 = foe(0), b3 = foe(30); for (let k = 0; k < 10; k++) lay(3); o.l3 = [a3.hp < 50, b3.hp < 50];
  world.enemies.length = 0; const a4 = foe(0), b4 = foe(30); for (let k = 0; k < 10; k++) lay(4); o.l4 = [a4.hp < 50, b4.hp < 50]; o.links = arcs.filter(a => a.link).length;
  world.enemies.length = 0; for (let k = 0; k < 30; k++) { player.x += 2; lay(1); } const tip = arcs[0].pts[arcs[0].pts.length - 1]; o.trail = Math.round(player.x - tip[0]);
  player.x = W / 2; world.enemies.length = 0; const far = foe(50); player.lvl = 4; player.sup = 4; player.supT = SUP_TIME; lay(4); o.sup = 50 - far.hp; o.supN = arcs.filter(a => !a.link).length;
  player.sup = 0; player.supT = 0; world.enemies.length = 0; arcs.length = 0; return o; })()`);
ok(r.n.join() === '1,2,3,3' && r.len > 0.5 && r.len <= 0.7, `Arc: 1, 2, 3 and 3 strands at levels 1 to 4, as long as the other guns' shots fly, 0.6 to 0.7 of the screen height less the hooked end (${JSON.stringify(r.n)}, ${r.len})`);
ok(r.side === 0 && r.front > 0, `Arc: level 1 hits what is straight ahead and leaves a target 50 px to the side alone (${r.front}, ${r.side})`);
ok(r.l3.join() === 'true,false' && r.l4.join() === 'true,true' && r.links >= 1, `Arc: a neighbour 30 px beside the target is hit by level 4's forked tips, not at level 3 (${JSON.stringify(r.l3)} ${JSON.stringify(r.l4)})`);
ok(r.trail > 20, `Arc: the far end trails behind a ship flying sideways (${r.trail} px)`);
ok(r.sup > 0 && r.supN === 5, `Arc: the super form has five strands and bends to a target 50 px to the side (${r.sup}, ${r.supN})`);

/* the damage rule: small enemies fall to one hit, big ones, boss parts and tough ones take the weaker bd */
r = await sf(`(() => { const sh = { dmg: 8, bd: 0.6 }; return { small: supHit(sh, { hp: 3, big: false }, false), pod: supHit(sh, { hp: 5, big: false }, false), tough: supHit(sh, { hp: 40, big: false }, false), big: supHit(sh, { hp: 3, big: true }, false), boss: supHit(sh, { hp: 3 }, true), plain: supHit({ dmg: 1 }, { hp: 99, big: true }, true) }; })()`);
ok(r.small >= 3 && r.pod >= 5 && r.tough < 1 && r.big < 1 && r.boss < 1 && r.plain === 1, `super hits: ${JSON.stringify(r)}`);
for (const w of ['S', 'A', 'L', 'H']) {
  r = await sf(`(() => { player.inv = 99999; player.dead = 0; player.wpn = '${w}'; player.lvl = 4; player.sup = 4; player.supT = SUP_TIME; player.cd = 0; player.mcd = 0; player.x = W / 2; world.shots.length = 0; world.enemies.length = 0; arcs.length = 0;
    const e = mkFighter(player.x, player.y - 70, PI / 2, 0, { fireAt: -1 }); e.hp = e.maxhp = 3; world.enemies.push(e); let n = 0;
    for (let i = 0; i < 40 && !(e.dead || e.dying || e.crash); i++) { world.ebul.length = 0; update(); n++; } return { gone: !!(e.dead || e.dying || e.crash), n }; })()`);
  ok(r.gone && r.n < 40, `${w}: a super volley shoots down a basic fighter (it crashes, as any hit makes it) (${JSON.stringify(r)})`);
}

/* the time: SUP_TIME frames, a pickup refills it, then the gun cools down to level 4 */
r = await sf(`(() => { player.inv = 99999; player.dead = 0; player.wpn = 'S'; player.lvl = 4; player.sup = 3; player.supT = 0; world.enemies.length = 0; const o = {};
  world.items.push(Object.assign(mkItem('W', player.x, player.y), { w: 'S' })); update(); o.start = player.supT;
  for (let i = 0; i < 300; i++) { world.ebul.length = 0; update(); } o.half = player.supT;
  const s0 = run.score; world.items.push(Object.assign(mkItem('W', player.x, player.y), { w: 'S' })); update(); o.refill = player.supT; o.pay = run.score - s0;
  for (let i = 0; i < SUP_TIME + 5; i++) { world.ebul.length = 0; update(); } o.end = [player.lvl, player.sup, isSup(player)]; return o; })()`);
ok(r.start >= 650 && r.start <= 660 && r.half < r.start - 250 && r.refill >= 650 && r.pay >= 1000 && r.end.join() === '4,0,false', `super lasts 660 frames, a pickup refills it, then it cools down to level 4 (${JSON.stringify(r)})`);


/* the HUD, the aura and the glow draw without errors, and carry into the next level */
r = await sf(`(() => { const o = {}; for (const w of ['S', 'L', 'H', 'A']) for (const sup of [0, 2, 4]) { player.wpn = w; player.lvl = 4; player.sup = sup; player.dead = 0; update(); render(); }
  player.wpn = 'H'; player.lvl = 4; player.sup = 4; const lv = run.sortie.level; endEnigmaLevel(); return { lv, now: run.sortie.level, w: player.wpn, lvl: player.lvl, sup: player.sup, errs: 0 }; })()`);
ok(r.now === r.lv + 1 && r.w === 'H' && r.lvl === 4 && r.sup === 4, `the super weapon carries into the next level (${JSON.stringify(r)})`);

await browser.close();
console.log(bad ? `${bad} failed, ${passed} passed` : `all ${passed} checks passed`);
process.exit(bad ? 1 : 0);
