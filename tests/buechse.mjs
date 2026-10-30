// Enigma Run, the Buechse (the long-range marksman tank). Needs Node and Playwright; serve the folder first (python3 -m http.server 8000).
//   node tests/buechse.mjs
// Checks: its attack cycle (track, aim, lock, one shot, rest) in that order and on time; it halts in its lock; one straight shell down the frozen line,
// from the muzzle, at 2x the enemy shell speed; it aims at the ship on Veteran (a ship that holds still is hit, one that moves off at the lock is missed)
// and a little ahead of a moving ship on Ace;
// its turret takes many hits, outlives a Nova untouched and is popped by a full laser; a popped turret ends the cycle at once;
// the muzzle spot matches the drawn bore at all 16 headings; its side emplacements (at the screen's edges, apart from each other and the tank pits);
// and flown through by the bot, a Buechse comes up dug in at an edge on level 3, aims across the screen and fires.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const PAGE = process.env.STARFALL_URL || 'http://localhost:8000/';
const golden = JSON.parse(readFileSync(new URL('./golden.json', import.meta.url), 'utf8'));
const harness = readFileSync(new URL('./harness.js', import.meta.url), 'utf8');
const initScript = () => {
  let a = 1944;
  Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  window.requestAnimationFrame = () => 0;
};
let bad = 0;
const ok = (cond, msg) => { if (cond) console.log('ok   ' + msg); else { bad++; console.error('FAIL ' + msg); } };
const browser = await chromium.launch();
async function freshPage() {
  const page = await browser.newPage({ viewport: golden.viewport });
  await page.route(/workers\.dev/, r => r.abort());
  page.on('pageerror', e => { bad++; console.error('page error:', e.message); });
  await page.addInitScript(initScript);
  await page.goto(PAGE);
  await page.waitForFunction(() => typeof window.__sf === 'function', null, { polling: 100, timeout: 60000 });
  await page.evaluate(s => window.__sf(s), harness);
  await page.evaluate(() => window.SF.peek('app.booting && finishBoot(), 0'));
  return page;
}
const peek = (page, code) => page.evaluate(c => window.SF.peek(c), code);
// a Buechse alone on the screen, 70 px from the top, the ship below it (diff: 0 Rookie, 1 Veteran, 2 Ace)
// (level 2 opens over the sea: the screen is flown on to the land first, so a tank can drive)
const alone = (diff = 1, o = '{ road: false, hd: PI / 2, v: 0 }') => `settings.diff = ${diff}; startEnigma(2); for (let i = 0; i < 1500; i++) { player.inv = 99; world.enemies = []; world.ebul = []; update(); }
  world.enemies = []; world.ebul = []; world.later = []; player.x = W / 2; player.y = H - 60; player.inv = 0;
  const e = makeBuechse(W / 2, 70 - Math.floor(world.scroll), ${o}); world.enemies.push(e); const tick = () => { groundPos(e); ENT.tank.update(e); };`;

{
  const page = await freshPage();
  // 1. the cycle, the halt, the shot
  const c = JSON.parse(await peek(page, `(() => { ${alone(1, '{ road: false, hd: PI / 2, v: 0.2 }')}
    const seq = [], shots = [], lens = []; let run0 = 0, last = '', aimT = 0, lockT = 0, restT = 0, lockMoved = 0, otherMoved = 0, frozen = true, la = 0;
    for (let f = 0; f < 1200; f++) { const n = world.ebul.length, x = e.wx, y = e.wy, st = e.bst, bore = e.bst === 'lock' ? buechseBore(e) : null; tick();
      if (e.bst !== last) { seq.push(e.bst); if (run0) lens.push([last, run0]); last = e.bst; run0 = 0; } run0++; if (e.bst === 'aim') aimT++; if (e.bst === 'lock') { lockT++; if (e.ta !== e.lta) frozen = false; } if (e.bst === 'rest') restT++;
      if (st === 'lock') { if (e.wx !== x || e.wy !== y) lockMoved++; } else if (e.wx !== x || e.wy !== y) otherMoved++;
      if (world.ebul.length > n) { const b = world.ebul[world.ebul.length - 1]; shots.push({ n: world.ebul.length - n, kind: b.kind, sp: Math.hypot(b.vx, b.vy), a: Math.atan2(b.vy, b.vx), la: e.la, at: bore ? Math.hypot(b.x - bore[0], b.y - bore[1]) : -1 }); } }
    return JSON.stringify({ seq: seq.slice(0, 5), lens, aimT, lockT, restT, lockMoved, otherMoved, frozen, shots, want: bspeed() * 2 }); })()`));
  ok(c.seq.join() === 'track,aim,lock,rest,track', `cycle: ${c.seq.join(' > ')}`);
  const cycles = c.shots.length;
  const len = st => [...new Set(c.lens.filter(q => q[0] === st).map(q => q[1]))].join('/');
  ok(cycles >= 3 && len('aim') === '36' && len('lock') === '18' && c.lens.filter(q => q[0] === 'rest').every(q => q[1] >= 72), `on time: ${cycles} shots; aim ${len('aim')} ticks, lock ${len('lock')}, rest ${len('rest')}`);
  ok(c.lockMoved === 0 && c.otherMoved > 100 && c.frozen, `it halts in its lock and its aim is frozen there (${c.otherMoved} moving ticks outside the lock)`);
  ok(c.shots.every(s => s.n === 1 && s.kind === 'shell' && Math.abs(s.sp - c.want) < 1e-6 && Math.abs(s.a - s.la) < 1e-9 && s.at >= 0 && s.at < 1e-6),
    `one shell a cycle, from the muzzle, down the locked line, at 2x bspeed (${c.shots.map(s => s.sp.toFixed(2)).join(', ')})`);
  // 2. where it aims: at the ship on Veteran (the locked line runs through where the ship was at the lock), a little ahead of a moving ship on Ace;
  // a ship that holds still is hit, one that moves off at the lock is missed. (vx: the ship's speed until the lock, after: from the lock on)
  const fly = async (diff, vx, after) => JSON.parse(await peek(page, `(() => { ${alone(diff)} player.x = 60;
    let b = null, vx = ${vx}, off = 0, lx = 0, near = 1e9;
    for (let f = 0; f < 900 && !b; f++) { const n = world.ebul.length, was = e.bst; tick(); if (e.bst === 'lock' && was !== 'lock') { const [bx, by] = buechseBore(e), c = Math.cos(e.la), s = Math.sin(e.la);
        off = (player.x - bx) * s - (player.y - by) * c; lx = player.x; vx = ${after}; } // (off: how far the ship is to the side of the locked line, at the lock)
      player.x = clamp(player.x + vx, 8, W - 8); if (world.ebul.length > n) b = world.ebul[world.ebul.length - 1]; }
    for (let f = 0; f < 400 && b; f++) { b.x += b.vx; b.y += b.vy; player.x = clamp(player.x + vx, 8, W - 8); near = Math.min(near, Math.hypot(b.x - player.x, b.y - player.y)); }
    return JSON.stringify({ shot: !!b, off: +Math.abs(off).toFixed(1), near: +near.toFixed(1), x: Math.round(lx) }); })()`));
  const W0 = 224, still = await fly(1, 0, 0), moving = await fly(1, 0.6, 0.6), dodge = await fly(1, 0, 1.5), ace = await fly(2, 0.6, 0.6); // (0.6 px a tick: still flying, not yet at the screen's edge, at the lock)
  ok(still.shot && still.near < 3, `Veteran, a ship that holds still: the shell passes ${still.near} px from it (hit)`);
  ok(moving.shot && moving.off < 3 && moving.x > 8 && moving.x < W0 - 8, `Veteran, a moving ship: the locked line runs ${moving.off} px from where the ship was at the lock (aimed at the ship)`);
  ok(dodge.shot && dodge.near > 12, `Veteran, a ship that moves off at the lock: the shell passes ${dodge.near} px from it (missed)`);
  ok(ace.shot && ace.off > 15 && ace.x > 8 && ace.x < W0 - 8, `Ace, a moving ship: the locked line runs ${ace.off} px ahead of it (lead)`);
  // 3. the turret: many hits, a Nova, the laser, and a popped turret ends the cycle (no shot after it, the tank drives on)
  const t = JSON.parse(await peek(page, `(() => { ${alone()}
    let hits = 0; while (!e.turDead && hits < 200) { damage(e, 0.55 + 0.55 * 1); hits++; } // the laser gun's level 1 shot
    const e2 = makeBuechse(W / 2 - 50, 70 - Math.floor(world.scroll), { road: false, hd: PI / 2, v: 0 }); world.enemies.push(e2); groundPos(e2); run.bombs = 3; feel.bombFx = 0; player.fly = 0; app.resumeT = 0; bomb(); const nova = !e2.turDead && !e2.dead;
    const left = e2.turHp; damage(e2, 1.1); damage(e2, 1.1); const after = e2.turDead;
    const e3 = makeBuechse(W / 2 + 50, 70 - Math.floor(world.scroll), { road: false, hd: PI / 2, v: 0 }); world.enemies.push(e3); groundPos(e3); player.x = e3.x;
    updBeamOf({ t: 18, max: 18, w: 8, dmg: 0.9, pw: 0, hit: false }, player, 1); const weakPop = e3.turDead;
    updBeamOf({ t: 18, max: 18, w: 24, dmg: 2.9, pw: 1, hit: false }, player, 1); const laser = e3.turDead;
    const e4 = makeBuechse(W / 2, 90 - Math.floor(world.scroll), { road: false, hd: PI / 2, v: 0.2 }); world.enemies = [e4]; world.ebul = []; feel.bombFx = 0; player.x = W / 2;
    for (let f = 0; f < 900 && e4.bst !== 'lock'; f++) { groundPos(e4); ENT.tank.update(e4); } const inLock = e4.bst === 'lock'; damage(e4, 99); const pop = e4.turDead, y0 = e4.wy;
    for (let f = 0; f < 600; f++) { groundPos(e4); ENT.tank.update(e4); }
    return JSON.stringify({ hits, nova, left, after, weakPop, laser, inLock, pop, shots: world.ebul.length, rolled: e4.wy - y0, hull: !e4.dead }); })()`));
  ok(t.hits >= 20, `ordinary fire: ${t.hits} hits of the level 1 laser gun to pop the turret`);
  ok(t.nova && t.after, `an untouched turret outlives a Nova (${t.left} of 42 left), and two more hits pop it`);
  ok(!t.weakPop && t.laser, 'a weak laser frame leaves the turret; a full charged laser pops it at once');
  ok(t.inLock && t.pop && t.shots === 0 && t.hull && t.rolled > 50, `a turret popped in the lock ends the cycle: no shot after it, the hull stays and drives on (${t.rolled.toFixed(0)} px)`);
  // 4. the muzzle spot is the drawn bore at all 16 headings (a copy of the turret with the bore in a marker colour, drawn as the game draws it)
  const m = JSON.parse(await peek(page, `(() => { ${alone()} const set = rotSet(buechseTur(['#1c2014', '#2c3420', '#3e482c', '#56623c', '#748050', '#96a06c'], true)); let worst = 0, found = 0;
    for (let i = 0; i < 16; i++) { e.x = 112.37; e.y = 200.71; e.ta = i * TAU / 16 + 0.04; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); spr(set[dirIdx(e.ta)], e.x, e.y);
      const d = ctx.getImageData(0, 0, W, H).data; let sx = 0, sy = 0, n = 0; for (let j = 0; j < H; j++) for (let q = 0; q < W; q++) { const p = (j * W + q) * 4; if (d[p] === 255 && d[p + 1] === 0 && d[p + 2] === 255) { sx += q + 0.5; sy += j + 0.5; n++; } }
      if (n) found++; const [bx, by] = buechseBore(e); worst = Math.max(worst, Math.hypot(sx / n - bx, sy / n - by)); }
    return JSON.stringify({ worst, found }); })()`));
  ok(m.found === 16 && m.worst < 0.01, `the muzzle spot sits on the drawn bore at all 16 headings (worst ${m.worst.toFixed(3)} px)`);
  await page.close();
}
// 5. its side emplacements: two in levels 2 to 7 (one in 6, whose edges are built up), none in 1 and 1A; at the screen's edges,
// 520 rows apart and 420 from the tank pits; the same plan gives the same emplacements
{
  const page = await freshPage();
  const want = { 1: [0, 0], 2: [2, 2], 3: [2, 2], 4: [2, 2], 5: [2, 2], 6: [1, 2], 7: [2, 2], 8: [0, 0] }, name = { 7: '6B', 8: '1A' };
  for (const lv of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const r = JSON.parse(await peek(page, `(() => { settings.diff = 1; startEnigma(${lv}); const S = run.sortie, P = sortiePlan(S); if (!P) return JSON.stringify({ n: [], pits: [] });
      const n = P.slots.filter(s => s.kind === 'nest').map(s => [s.x, s.y, s.side]), pits = P.slots.filter(s => s.kind === 'tank').map(s => s.y);
      S.planFor = null; const P2 = sortiePlan(S), again = JSON.stringify(P2.slots.filter(s => s.kind === 'nest').map(s => [s.x, s.y, s.side])) === JSON.stringify(n);
      return JSON.stringify({ n, pits, again, W }); })()`));
    const ys = r.n.map(q => q[1]).sort((a, b) => a - b), gap = ys.slice(1).reduce((g, y, k) => Math.min(g, y - ys[k]), Infinity), pit = Math.min(Infinity, ...r.n.flatMap(q => r.pits.map(p => Math.abs(p - q[1]))));
    const edge = r.n.every(([x, , side]) => side < 0 ? x <= 44 : x >= r.W - 44);
    ok(r.n.length >= want[lv][0] && r.n.length <= want[lv][1] && edge && gap >= 520 && pit >= 420 && (r.again !== false),
      `level ${name[lv] || lv}: ${r.n.length} side emplacements${r.n.length ? ' at x ' + r.n.map(q => q[0]).join(', ') + (r.n.length > 1 ? ', ' + gap + ' rows apart' : '') + ', ' + pit + ' rows from the nearest tank pit' : ''}`);
  }
  await page.close();
}
// 6. flown through by the bot on level 3: a Buechse comes up dug in at an edge, lying across the screen, aims and fires; convoy Buechsen are counted too
{
  const page = await freshPage();
  const f = await page.evaluate(() => { const SF = window.SF; SF.setMode('immortal'); SF.peek('settings.diff = 1; startEnigma(3)'); let st = 'ok'; const o = { nest: 0, across: 0, edge: 0, aimed: 0, fired: 0, convoy: 0 };
    for (let i = 0; i < 2000 && st === 'ok'; i++) { st = SF.run(50);
      const v = JSON.parse(SF.peek(`JSON.stringify({ b: world.enemies.filter(e => e.buechse && !e.dead).map(e => [e.nest || 0, Math.round(e.x), e.hd, e.bst]), boss: world.bossSpawned })`));
      for (const [nest, x, hd, bst] of v.b) { if (!nest) { o.convoy = 1; continue; } o.nest = 1; if (Math.abs(Math.cos(hd)) > 0.99) o.across = 1; if (x <= 44 || x >= 180) o.edge = 1; if (bst === 'aim' || bst === 'lock') o.aimed = 1; if (bst === 'rest') o.fired = 1; }
      if (v.boss) break; }
    return Object.assign(o, { st, errs: SF.R.errs.slice(0, 2) }); });
  ok(f.nest && f.across && f.edge && f.aimed && f.fired && !f.errs.length, `level 3: a Buechse dug in at the screen's edge, lying across, aims and fires${f.convoy ? '; a convoy Buechse seen too' : ''}${f.errs.length ? ' (errors: ' + f.errs.join(' | ') + ')' : ''}`);
  await page.close();
}
await browser.close();
console.log(bad ? `${bad} FAILED` : 'all ok');
process.exit(bad ? 1 : 0);
