// The Night Hammer's rocket launcher (Enigma level 3, the first loop only: seed 1945, run.sortie.moon). The long carriage with the launcher behind the gun (SPR.rgBaseL1,
// the same coordinates for the carriage and its parts, a hull 20 px longer), twelve rockets on their cradles, and two salvos of six: when the core is at half its health and again at a tenth.
// A salvo makes its six red areas one after another, each at the player's place; an area follows the ship, locks, then its rocket leaves its cradle and bursts there, hitting a ship inside it.
// The first pass (seed 1944) and the second loop (1946) have none of it. Needs Node and Playwright; serve the folder first (python3 -m http.server 8000).
//   node tests/nighthammer.mjs            (--verbose also prints the checks that pass)
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const PAGE = process.env.STARFALL_URL || 'http://localhost:8000/';
const harness = readFileSync(new URL('./harness.js', import.meta.url), 'utf8');
let bad = 0, passed = 0;
const verbose = process.argv.includes('--verbose');
const ok = (cond, msg) => { if (cond) { passed++; if (verbose) console.log('ok   ' + msg); } else { bad++; console.error('FAIL ' + msg); } };
const browser = await chromium.launch();
async function page_(loops) {
  const page = await browser.newPage({ viewport: { width: 400, height: 700 } });
  await page.route(/workers\.dev/, r => r.abort());
  page.on('pageerror', e => { bad++; console.error('page error:', e.message); });
  await page.addInitScript(() => { let a = 1944; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; window.requestAnimationFrame = () => 0; });
  await page.goto(PAGE); await page.waitForFunction(() => typeof window.__sf === 'function', null, { polling: 100, timeout: 60000 });
  await page.evaluate(s => window.__sf(s), harness); await page.evaluate(() => window.SF.peek('app.booting && finishBoot(), 0'));
  const peek = c => page.evaluate(c2 => window.SF.peek(c2), c);
  /* level 3 flown by the immortal bot to its boss, once the boss is in place (its fight code has begun: the tick runs) */
  const r = await peek(`(() => { SF.setMode('immortal'); SF.start(1, 1); startEnigma(3, false, ${loops}); let n = 0; for (; n < 40000; n += 30) { SF.run(30); ensureChunks(); const b = world.enemies.find(e => e.type === 'boss' && e.kind === 'railgun'); if (b && b.y > 130 && !b.intro) break; } SF.run(60); const b = world.enemies.find(e => e.type === 'boss'); return JSON.stringify({ n, kind: b && b.kind, moon: !!run.sortie.moon }); })()`);
  return { page, peek, info: JSON.parse(r) };
}
const core = `(() => { const b = world.enemies.find(e => e.type === 'boss'); return b.parts.find(p => p.k === 'core'); })()`;
{
  /* first pass: nothing of it */
  const { page, peek, info } = await page_(0);
  ok(info.kind === 'railgun' && !info.moon, 'level 3, the first pass: the Night Hammer, no moonrise');
  const r = JSON.parse(await peek(`(() => { const c = ${core}, b = world.enemies.find(e => e.type === 'boss'); c.hp = Math.floor(c.maxhp * 0.05); SF.run(300); return JSON.stringify({ nr: b.nr === undefined, hull: hullRect(b), l1: !!SPR.rgBaseL1 && false }); })()`));
  ok(r.nr && r.hull.join() === '0,-32,44,107', `the first pass: no rocket state (${r.nr}) and the girder frame's hull (${r.hull})`);
  await page.close();
}
{
  /* the first loop */
  const { page, peek, info } = await page_(1);
  ok(info.kind === 'railgun' && info.moon, 'level 3, the first loop: the Night Hammer, the moonrise');
  const q = JSON.parse(await peek(`(() => { const b = world.enemies.find(e => e.type === 'boss'), P = BOSS.railgun.parts; return JSON.stringify({ hull: hullRect(b), art: !!SPR.rgBaseL1, h: SPR.rgBaseL1 && SPR.rgBaseL1.h, parts: b.parts.map(p => p.ox + ',' + p.oy).join(' '), base: P.map(p => p.ox + ',' + p.oy).join(' '), nr: b.nr })}) ()`.replace(') ()', ')()')));
  ok(q.art && q.h === 236 && q.hull.join() === '0,-42,44,117', `the launcher carriage (${q.h} px tall, hull ${q.hull}) is in the art set`);
  ok(q.parts === q.base, 'the parts of the gun carriage sit where they always did');
  /* the first salvo: the core at 49 % */
  const s1 = JSON.parse(await peek(`(() => { const c = ${core}, b = world.enemies.find(e => e.type === 'boss'), log = [], born = [], R0 = SF.R.hits.length; c.hp = Math.floor(c.maxhp * 0.49); let maxZ = 0, peekSalvo = null, mism = 0, still = true, last = null, locked = [];
    for (let f = 0; f < 600; f++) { SF.run(1); const S = b.nr; if (!S) continue; maxZ = Math.max(maxZ, S.zones.length);
      for (const z of S.zones) { if (z.t === 0 && z.ph === 0) born.push({ f, slot: z.slot, dx: Math.abs(z.x - clamp(player.x, NR.R, W - NR.R)), dy: Math.abs(z.y - clamp(player.y, 30, H - 30)) });
        if (z.ph === 0 && z.t > NR.FOLLOW + 2) { const k = z.slot; if (locked[k] && (locked[k][0] !== z.x || locked[k][1] !== z.y)) still = false; locked[k] = [z.x, z.y]; } }
      if (S.salvo === 1 && S.pend.length === 0 && S.zones.length === 0 && peekSalvo === null) peekSalvo = f; }
    const S = b.nr; return JSON.stringify({ salvo: S.salvo, fired: S.fired.filter(Boolean).length, firedSlots: S.fired.map((v, i) => v ? i : -1).filter(i => i >= 0).join(), born, maxZ, still, done: peekSalvo, rockets: SF.R.hits.slice(R0).filter(h => h.why === 'rocket').length }); })()`));
  ok(s1.salvo === 1 && s1.fired === 6 && s1.firedSlots === '0,2,5,7,8,10', `the first salvo at half the core's health: six rockets left their cradles (${s1.firedSlots})`);
  ok(s1.born.length === 6 && s1.born.every((z, i) => i === 0 || z.f - s1.born[i - 1].f >= 19 && z.f - s1.born[i - 1].f <= 21), `the six areas are made one after another, ${s1.born.map(z => z.f).join(' ')}`);
  ok(s1.born.every(z => z.dx < 1 && z.dy < 1), 'each area is made at the ship\'s place');
  ok(s1.maxZ >= 3 && s1.maxZ <= 6, `several areas are up at once as the salvo goes (up to ${s1.maxZ})`);
  ok(s1.still && s1.done !== null, 'a locked area stays where it is, and the salvo ends with every area burst');
  /* a second salvo only at a tenth */
  const s2 = JSON.parse(await peek(`(() => { const c = ${core}, b = world.enemies.find(e => e.type === 'boss'); c.hp = Math.floor(c.maxhp * 0.3); SF.run(200); const mid = b.nr.salvo; c.hp = Math.floor(c.maxhp * 0.09); for (let f = 0; f < 400; f++) { SF.run(1); if (c.hp < c.maxhp * 0.08) c.hp = Math.floor(c.maxhp * 0.09); /* (the bot would shoot the core down in the time the salvo takes) */ } const S = b.nr, o = { mid, salvo: S.salvo, fired: S.fired.filter(Boolean).length, left: S.zones.length + S.pend.length }; c.hp = Math.floor(c.maxhp * 0.5); return JSON.stringify(o); })()`));
  ok(s2.mid === 1 && s2.salvo === 2 && s2.fired === 12 && !s2.left, `the second salvo only at a tenth: ${s2.mid} salvo before, then ${s2.salvo}, ${s2.fired} rockets in all, nothing left over`);
  /* a burst hits a ship inside the area, not one outside it */
  const h = JSON.parse(await peek(`(() => { const b = world.enemies.find(e => e.type === 'boss'), S = b.nr, n0 = () => SF.R.hits.filter(h => h.why === 'rocket').length, o = {}; player.inv = 0;
    S.zones.push({ ph: 1, t: NR.FLY - 1, x: player.x + NR.R + 12, y: player.y, sx: player.x, sy: 20, slot: 0, who: null }); const a = n0(); SF.run(1); o.outside = n0() - a; player.inv = 0;
    S.zones.push({ ph: 1, t: NR.FLY - 1, x: player.x, y: player.y, sx: player.x, sy: 20, slot: 0, who: null }); const c = n0(); SF.run(1); o.inside = n0() - c; return JSON.stringify(o); })()`));
  ok(h.outside === 0 && h.inside >= 1, `a rocket bursting just outside the area misses (${h.outside} hits), one on the ship hits (${h.inside})`);
  /* the boss dying clears the areas */
  const d = JSON.parse(await peek(`(() => { const b = world.enemies.find(e => e.type === 'boss'); b.nr.zones.push({ ph: 0, t: 0, x: 100, y: 200, slot: 1, who: null }); const c = ${core}; c.hp = 1; for (const p of b.parts) { p.hp = 0; } damagePart(b, c, 5); SF.run(20); return JSON.stringify({ dying: !!b.dying, zones: b.nr.zones.length }); })()`));
  ok(d.dying && d.zones === 0, `the boss dying clears the areas (${d.zones} left)`);
  const errs = await peek('SF.R.errs.length'); ok(errs === 0, `no script errors (${errs})`);
  await page.close();
}
await browser.close();
if (bad) { console.error(`\n${bad} problem(s) found, ${passed} passed.`); process.exit(1); }
console.log(`Night Hammer test passed (${passed}).`);
