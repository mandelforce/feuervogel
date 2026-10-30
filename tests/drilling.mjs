// Enigma Run, the Drilling (a small Sand Colossus with three barrels). Needs Node and Playwright; serve the folder first (python3 -m http.server 8000).
//   node tests/drilling.mjs
// Checks: its attack cycle (aim, prep, fire, rest) in that order, with a halt, a warning and a pause; salvos of three while the turret sweeps;
// its turret takes several hits, outlives a Nova untouched and is popped by a full laser; a popped turret stops the cycle at once;
// its tank pits (three in level 2, two in the other levels with a plan but level 1, more than a screen apart);
// and flown through by the bot, it stands in the dug-in slots of level 2 and patrols side streets (turning at their ends) in level 6.
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
// a Drilling alone on the screen, 70 px from the top, the ship below it
const alone = `settings.diff = 1; startEnigma(2); world.enemies = []; world.ebul = []; player.x = W / 2; player.y = H - 60; player.inv = 0;
  const e = makeDrill(W / 2, 70 - Math.floor(world.scroll), {}); world.enemies.push(e); const tick = () => { groundPos(e); ENT[e.type].update(e); };`;

{
  const page = await freshPage();
  // 1. the cycle
  const c = JSON.parse(await peek(page, `(() => { ${alone}
    const seq = [], vol = []; let last = '', n0 = 0, prepT = 0, restT = 0, moved = 0, ta = [];
    for (let f = 0; f < 900; f++) { const n = world.ebul.length; tick(); if (e.dst !== last) { seq.push(e.dst); last = e.dst; }
      if (e.dst === 'prep') prepT++; if (e.dst === 'rest') restT++; if (e.dst === 'fire') ta.push(e.ta); if (world.ebul.length > n) vol.push(world.ebul.length - n); }
    return JSON.stringify({ seq: seq.slice(0, 5), vol, prepT, restT, sweep: ta.length ? Math.max(...ta) - Math.min(...ta) : 0, kinds: [...new Set(world.ebul.map(b => b.kind))] }); })()`));
  ok(c.seq.join() === 'aim,prep,fire,rest,aim', `cycle: ${c.seq.join(' > ')}`);
  ok(c.prepT >= 40 * 2 && c.restT >= 120, `a warning before each attack (${c.prepT} frames of prep in two cycles) and a pause after (${c.restT} frames of rest)`);
  ok(c.vol.length >= 4 && c.vol.every(v => v === 3) && c.kinds.join() === 'shell', `salvos of three shells (${c.vol.join(',')})`);
  ok(c.sweep > 0.3, `the turret sweeps while it fires (${c.sweep.toFixed(2)} rad)`);
  // 2. the turret: several hits, a Nova, the laser, and a popped turret ends the cycle
  const t = JSON.parse(await peek(page, `(() => { ${alone}
    let hits = 0; while (!e.turDead && hits < 200) { damage(e, 0.55 + 0.55 * 1); hits++; } // the laser gun's level 1 shot
    const e2 = makeDrill(W / 2 - 40, 70 - Math.floor(world.scroll), {}); world.enemies.push(e2); groundPos(e2); run.bombs = 3; feel.bombFx = 0; player.fly = 0; app.resumeT = 0; bomb(); const nova = !e2.turDead && !e2.dead;
    const left = e2.turHp; damage(e2, 1.1); damage(e2, 1.1); const after = e2.turDead;
    const e3 = makeDrill(W / 2 + 40, 70 - Math.floor(world.scroll), {}); world.enemies.push(e3); groundPos(e3); player.x = e3.x;
    const weak = updBeamOf({ t: 18, max: 18, w: 8, dmg: 0.9, pw: 0, hit: false }, player, 1), weakPop = e3.turDead;
    updBeamOf({ t: 18, max: 18, w: 24, dmg: 2.9, pw: 1, hit: false }, player, 1); const laser = e3.turDead;
    const e4 = makeDrill(W / 2, 90 - Math.floor(world.scroll), {}); world.enemies = [e4]; world.ebul = []; feel.bombFx = 0; let shots = 0;
    for (let f = 0; f < 600 && e4.dst !== 'prep'; f++) { groundPos(e4); ENT.htank.update(e4); } damage(e4, 99); const pop = e4.turDead;
    for (let f = 0; f < 600; f++) { groundPos(e4); ENT.htank.update(e4); } shots = world.ebul.length;
    return JSON.stringify({ hits, nova, left, after, weakPop, laser, pop, shots, hull: !e4.dead }); })()`));
  ok(t.hits >= 20, `ordinary fire: ${t.hits} hits of the level 1 laser gun to pop the turret`);
  ok(t.nova && t.after, `an untouched turret outlives a Nova (${t.left} of 42 left), and two more hits pop it`);
  ok(!t.weakPop && t.laser, 'a weak laser frame leaves the turret; a full charged laser pops it at once');
  ok(t.pop && t.shots === 0 && t.hull, 'a turret popped during the warning ends the cycle: no shot after it, the hull stays');
  // 3. it halts while it fires: a Drilling on a side street of level 6 stands still in prep and fire, and turns back at the street's end
  const h = JSON.parse(await peek(page, `(() => { settings.diff = 1; startEnigma(6); const S = run.sortie, sides = sideRoutes(S).filter(q => q.path.length >= 60);
    if (!sides.length) return JSON.stringify({ n: 0 }); const sd = sides[0], y0 = sd.path[sd.path.length >> 1][1];
    world.enemies = []; world.scroll = -y0 + 120; ensureChunks(); for (let i = 0; i < 400 && world.chunkJobs.length; i++) ensureChunks(); player.x = W / 2; player.y = H - 40;
    const e = makeDrill(sd.path[8][0], sd.path[8][1], { road: true, dir: 1, lane: 0, v: 0.18, hd: 0, side: { s: sd.id, k: 8, d: -1, from: -1, passed: true } }); world.enemies.push(e);
    let still = 0, halt = 0, turned = 0, d0 = e.side.d;
    for (let f = 0; f < 1500; f++) { const x = e.wx, y = e.wy, st = e.dst; groundPos(e); ENT.htank.update(e); if (st === 'prep' || st === 'fire') { halt++; if (e.wx === x && e.wy === y) still++; } if (e.side && e.side.d !== d0) { turned++; d0 = e.side.d; } }
    return JSON.stringify({ n: sides.length, halt, still, turned, side: !!e.side }); })()`));
  ok(h.n >= 1 && h.halt > 0 && h.still === h.halt, `level 6: on a side street it halts to fire (${h.still}/${h.halt} frames still)`);
  ok(h.turned >= 1 && h.side, `level 6: it turns back at its street's end and keeps to its street (${h.turned} turns)`);
  await page.close();
}
// 3b. its tank pits: three in level 2, two in every other level with a plan (1A, 3, 4, 5, 6, 6B), none in level 1; more than a screen apart
{
  const page = await freshPage();
  const want = { 1: 0, 2: 3, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 2 }, name = { 7: '6B', 8: '1A' };
  for (const lv of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const ys = JSON.parse(await peek(page, `(() => { settings.diff = 1; startEnigma(${lv}); const S = run.sortie, P = sortiePlan(S); return JSON.stringify(P ? P.slots.filter(s => s.kind === 'tank').map(s => s.y).sort((a, b) => a - b) : []); })()`));
    const gap = ys.slice(1).reduce((m, y, k) => Math.min(m, y - ys[k]), Infinity);
    ok(ys.length === want[lv] && (ys.length < 2 || gap >= 500), `level ${name[lv] || lv}: ${ys.length} tank pits${ys.length > 1 ? ', at least ' + gap + ' px apart' : ''}`);
  }
  await page.close();
}
// 4. flown through by the bot: dug in on level 2, patrolling side streets on level 6
for (const lv of [2, 6]) {
  const page = await freshPage();
  const f = await page.evaluate(lv => { const SF = window.SF; SF.setMode('immortal'); SF.peek(`settings.diff = 1; startEnigma(${lv})`); let st = 'ok'; const seen = new Map(), o = { dug: 0, side: 0, moved: 0, fired: 0 };
    for (let i = 0; i < 2000 && st === 'ok'; i++) { st = SF.run(50);
      const v = JSON.parse(SF.peek(`JSON.stringify({ d: world.enemies.filter(e => e.drill && !e.dead).map(e => [e.dug ? 1 : 0, e.side ? 1 : 0, Math.round(e.wx), e.dst]), boss: world.bossSpawned })`));
      v.d.forEach(([dug, side, x, dst], k) => { o.dug = Math.max(o.dug, dug); o.side = Math.max(o.side, side); const key = dug + ':' + side + ':' + k; if (seen.has(key) && seen.get(key) !== x) o.moved++; seen.set(key, x); if (dst === 'fire' || dst === 'rest') o.fired++; });
      if (v.boss) break; }
    return Object.assign(o, { st, errs: SF.R.errs.slice(0, 2) }); }, lv);
  if (lv === 2) ok(f.dug && f.fired > 0 && !f.errs.length, `level 2: a Drilling stands in a dug-in slot and fires${f.errs.length ? ' (errors: ' + f.errs.join(' | ') + ')' : ''}`);
  else ok(f.side && f.moved > 3 && !f.errs.length, `level 6: a Drilling patrols a side street (${f.moved} moves seen)${f.errs.length ? ' (errors: ' + f.errs.join(' | ') + ')' : ''}`);
  await page.close();
}
await browser.close();
console.log(bad ? `${bad} FAILED` : 'all ok');
process.exit(bad ? 1 : 0);
