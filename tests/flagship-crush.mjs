// Level 1 flagship: ships never sail under its hull, and its "Hard to port" turn (the stern swinging round) crushes any ship it overlaps.
// A crushed ship gives no points and no loot, and the player is not affected. Flown on a Retro Run start and a Campaign start; in the
// Campaign the flagship moves the same with ships to crush or none (a crushed ship's dice are its own: per-enemy streams).
// Needs Node and Playwright; serve the folder first (python3 -m http.server 8000).
//   node tests/flagship-crush.mjs
//   node tests/flagship-crush.mjs --verbose   also print every check that passes
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
let bad = 0, passed = 0;
const verbose = process.argv.includes('--verbose');
const ok = (cond, msg) => { if (cond) { passed++; if (verbose) console.log('ok   ' + msg); } else { bad++; console.error('FAIL ' + msg); } };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: golden.viewport });
await page.route(/workers\.dev/, r => r.abort());
page.on('pageerror', e => { bad++; console.error('page error:', e.message); });
await page.addInitScript(initScript);
await page.goto(PAGE);
await page.waitForFunction(() => typeof window.__sf === 'function', null, { polling: 100, timeout: 60000 });
await page.evaluate(s => window.__sf(s), harness);
await page.evaluate(() => window.SF.peek('app.booting && finishBoot(), 0'));
const peek = code => page.evaluate(c => window.SF.peek(c), code);

/* (no // comments in the in-page code) */
const scene = (camp, ships) => `
  SF.setMode('immortal'); SF.start(1, 1); if (${camp}) startEnigma(1, true);
  world.curTheme = 0; world.enemies.length = 0; onStream(true, spawnBoss)();
  const boss = world.enemies.find(e => e.type === 'boss' && e.kind === 'ship');
  boss.y = 118 + BY; boss.x = W / 2; boss.mt = 1; world.scrollTarget = 0; world.scroll = Math.floor(world.scroll);
  const out = { boss: !!boss };
  const sc = () => Math.floor(world.scroll);
  const wy0 = boss.y - sc();
  out.placeUnder = placeOK(boss.x, wy0, 20);
  out.placeAway = placeOK(W - 12, wy0 - 400, 10);
  const hp = hpm();
  const dUnder = G('destroyer', boss.x - 20, wy0 + 100, { hp: 50 * hp, maxhp: 50 * hp, ta: PI / 2, tb: PI / 2, cdA: 9999, cdB: 9999, v: 0.35 });
  const dAway = G('destroyer', 30, wy0 - 150, { hp: 50 * hp, maxhp: 50 * hp, ta: PI / 2, tb: PI / 2, cdA: 9999, cdB: 9999, v: 0.35 });
  const pt = G('pt', boss.x + 12, wy0 + 40, { ta: PI / 2, cd: 9999, v: 0.7, dx: 0 });
  if (${ships}) world.enemies.push(dUnder, dAway, pt);
  out.drivesIn = hullOver(boss, boss.x, boss.y - 100, 12) && !hullOver(boss, boss.x, boss.y - 140, 12);
  const score0 = run.score, items0 = world.items.length, lives0 = run.lives, pAlive0 = !player.dead;
  boss.ram = null; boss.ramN = 0; for (const q of boss.parts) { q.hp = q.maxhp = 1e6; }
  boss.ramCd = 0; boss.reactRam = true;
  const keep = new Set([boss, dUnder, dAway, pt]), tr = []; let ce = null; for (let f = 0; f < 300; f++) { SF.run(1); tr.push('rs' + boss.rs); if (f % 10 === 0) tr.push(Object.entries(boss).filter(([k, v]) => typeof v === 'number' && k !== 'rs' && k !== 'hit').map(([k, v]) => k + v.toFixed(3)).join(',')); world.enemies = world.enemies.filter(q => keep.has(q) || q.dead); if (ce === null && (dUnder.dead || pt.dead)) ce = [f, boss.ram && boss.ram.t, dUnder.hp, pt.hp, boss.hd, dUnder.x, dUnder.y, boss.x, boss.y]; } out.ce = ce;
  out.dUnderDead = dUnder.dead; out.ptDead = pt.dead; out.dAwayDead = dAway.crushed === true;
  out.crushed = dUnder.crushed === true && pt.crushed === true; out.dbg = [dUnder.crushed, pt.crushed, dUnder.dead, pt.dead, run.stats.kills];
  out.score = run.score - score0; out.items = world.items.length - items0;
  out.lives = run.lives - lives0; out.playerAlive = !player.dead && pAlive0;
  for (let f = 300; f < 1200; f++) { SF.run(1); world.enemies = world.enemies.filter(q => keep.has(q) || q.dead); tr.push('rs' + boss.rs); if (f % 10 === 0) tr.push(Object.entries(boss).filter(([k, v]) => typeof v === 'number' && k !== 'rs' && k !== 'hit').map(([k, v]) => k + v.toFixed(3)).join(',')); } /* on past the end of its turn (RAM_END), into the fight */
  out.flag = tr.join(';'); out.flagN = tr.length;
  out;
`;
for (const camp of [false, true]) {
const r = await peek(scene(camp, true)), m = camp ? 'Campaign: ' : 'Retro Run: ';
ok(r.boss, m + 'the level 1 flagship spawns');
ok(r.drivesIn === true, m + 'the hull test sees a point on the hull as under it and one past the stern as clear');
ok(r.placeUnder === false, m + 'no ship is placed under the flagship');
ok(r.placeAway === true, m + 'ships are still placed away from the flagship');
ok(r.dUnderDead && r.ptDead, m + 'the destroyer and the patrol boat under the hull are crushed in its turn');
ok(r.crushed, m + 'they are marked crushed');
ok(!r.dAwayDead, m + 'a ship clear of the hull is left alone');
ok(r.score === 0, m + 'crushed ships give no points (score change ' + r.score + ')');
ok(r.items === 0, m + 'crushed ships drop no loot or medals (items ' + r.items + ')');
ok(r.lives === 0 && r.playerAlive, m + 'the player is not affected');
if (camp) { const q = await peek(scene(true, false)); ok(r.flag === q.flag && r.boss, 'Campaign: the flagship draws, turns, moves and fires the same with ships to crush or none (its stream every frame, its numbers every 10; ' + r.flagN + ' samples' + (r.flag === q.flag ? '' : ', first difference at sample ' + r.flag.split(';').findIndex((x, i) => x !== q.flag.split(';')[i])) + ')'); }
}

await browser.close();
console.log(bad ? bad + ' check(s) FAILED, ' + passed + ' passed' : 'all ' + passed + ' checks passed');
process.exit(bad ? 1 : 0);
