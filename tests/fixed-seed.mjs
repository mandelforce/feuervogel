// The Campaign is the same for every player: each level's simulation starts from seed 1944 and the level's number. Needs Node and
// Playwright; serve the folder first (python3 -m http.server 8000).
//   node tests/fixed-seed.mjs
//   node tests/fixed-seed.mjs --verbose   also print every check that passes (by default only failures and a count)
// Checks, for every level: flown by the same bot in two fresh pages whose own Math.random differs (the device's randomness), the run is the
// same: the same enemies spawned at the same frames and places, the same score and the same state at the end; a practice start of the level
// starts the same stream as the Campaign's start, and a level reached by finishing the one before starts the same stream as well.
// Endless still gets a new seed every run. And the timetable (step 3): flown to the boss by a bot that shoots everything and by one that never
// fires, every level gets the same spawns from its director, at the same frames and places, and the boss comes at the same frame. And the
// per-enemy streams (step 4): shooting some planes leaves every other enemy flying and firing exactly the same, and a pod drops the same
// item whenever it is shot.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const PAGE = process.env.STARFALL_URL || 'http://localhost:8000/';
const harness = readFileSync(new URL('./harness.js', import.meta.url), 'utf8');
const verbose = process.argv.includes('--verbose');
let bad = 0, passed = 0;
const ok = (cond, msg) => { if (cond) { passed++; if (verbose) console.log('ok   ' + msg); } else { bad++; console.error('FAIL ' + msg); } };
const FRAMES = 3000;
const browser = await chromium.launch();

/* the page's own Math.random seeded with pageSeed: it stands in for the device, which the Campaign must not depend on */
async function freshPage(pageSeed) {
  const page = await browser.newPage({ viewport: { width: 400, height: 700 } });
  await page.route(/workers\.dev/, r => r.abort());
  page.on('pageerror', e => { bad++; console.error('page error:', e.message); });
  await page.addInitScript(s => {
    let a = s;
    Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    window.requestAnimationFrame = () => 0;
  }, pageSeed);
  await page.goto(PAGE);
  await page.waitForFunction(() => typeof window.__sf === 'function', null, { polling: 100, timeout: 60000 });
  await page.evaluate(h => window.__sf(h), harness);
  await page.evaluate(() => window.SF.peek('app.booting && finishBoot(), 0'));
  return page;
}
const peek = (page, code) => page.evaluate(c => window.SF.peek(c), code);

/* fly level lv for FRAMES frames with the bot (immortal), as a Campaign start or a practice start; returns the spawns, score and an end state */
const fly = (lv, ranked) => `(() => { SF.setMode('immortal'); SF.start(1, 1); startEnigma(${lv}, ${ranked}); SF.human(8, 15);
  const s0 = simS, seed = run.seed, g0 = gf, seen = new WeakSet(), spawns = [];
  for (let f = 0; f < ${FRAMES}; f += 10) { const st = SF.run(10);
    for (const e of world.enemies) { if (seen.has(e)) continue; seen.add(e); spawns.push(e.type + '@' + gf + ':' + Math.round(e.x) + ',' + Math.round(e.y)); }
    if (st !== 'ok') break; }
  return JSON.stringify({ s0, seed, g0, spawns, score: run.score, end: [gf, simS, Math.round(player.x), Math.round(player.y), world.enemies.length, world.ebul.length, world.secret && world.secret.q].join(' ') }); })()`;

const pageA = await freshPage(11), pageB = await freshPage(9999);
for (const lv of [1, 2, 3, 4, 5, 6]) {
  const a = JSON.parse(await peek(pageA, fly(lv, true))), b = JSON.parse(await peek(pageB, fly(lv, true)));
  const firstDiff = a.spawns.findIndex((s, i) => s !== b.spawns[i]);
  ok(a.seed === 1944 && b.seed === 1944 && a.g0 === 0 && b.g0 === 0, `level ${lv}: the run's seed is 1944 and its frame count starts at 0 (${a.seed}, ${b.seed}; frame ${a.g0}, ${b.g0})`);
  ok(a.spawns.length > 10 && firstDiff < 0 && a.spawns.length === b.spawns.length, `level ${lv}: two devices get the same ${a.spawns.length} spawns in ${FRAMES} frames${firstDiff >= 0 ? ' (first difference: ' + a.spawns[firstDiff] + ' / ' + b.spawns[firstDiff] + ')' : ''}`);
  ok(a.score === b.score && a.end === b.end, `level ${lv}: the same score (${a.score}) and end state (${a.end}${a.end === b.end ? '' : ' / ' + b.end})`);
  const p = JSON.parse(await peek(pageB, fly(lv, false)));
  ok(p.s0 === a.s0 && p.end === a.end, `level ${lv}: a practice start plays the same as the Campaign's (${p.end === a.end ? 'same end state' : p.end + ' / ' + a.end})`);
}
/* the timetable: very different play, the same spawns. The director's spawns are logged through ttGhost (every enemy it makes) */
const toBoss = pac => `(() => { const log = []; const og = ttGhost; ttGhost = e => { log.push(e.type + '@' + gf + ':' + Math.round(e.x) + ',' + Math.round(e.ground ? e.wy : e.y)); og(e); };
  SF.setMode('immortal'); SF.start(1, 1); startEnigma(LV, true); SF.human(8, 15);
  for (let f = 0; f < 30000 && !world.bossSpawned; f++) { if (${pac}) { world.shots.length = 0; run.bombs = 0; } if (SF.run(1) !== 'ok') break; }
  ttGhost = og; return JSON.stringify({ log, boss: gf, score: run.score }); })()`;
for (const lv of [1, 2, 3, 4, 5, 6]) {
  const a = JSON.parse(await peek(pageA, toBoss(false).replace('LV', lv))), p = JSON.parse(await peek(pageB, toBoss(true).replace('LV', lv)));
  const i = a.log.findIndex((x, k) => x !== p.log[k]);
  ok(a.log.length > 100 && i < 0 && a.log.length === p.log.length && a.boss === p.boss && a.score > p.score,
    `level ${lv}: shooting everything (${a.score} points) or never firing (${p.score}), the director makes the same ${a.log.length} spawns and the boss comes at frame ${a.boss}${i >= 0 ? ' (first difference #' + i + ': ' + a.log[i] + ' / ' + p.log[i] + ')' : a.boss !== p.boss ? ' / ' + p.boss : ''}`);
}
/* per-enemy streams (step 4): the ship holds still, never fires, picks nothing up and can't be hit. One flight kills nothing; the other kills the first
   lone planes (no formation, no leader, not big) as they come on screen. Every enemy left alive must do exactly the same in both: the same
   path and the same timers, every 10 frames. Designed reactions are left out: troops (they run from explosions; a bail-out lands as a new
   troop) and planes whose leader was shot (they scatter). The train number is a count kept across levels, so it is not compared. */
const still = kills => `(() => { SF.setMode('immortal'); SF.start(1, 1); startEnigma(LV, true);
  const key = new WeakMap(), tr = new Map(), dead = new Set(), rx = new Set(); let n = 0, k = 0;
  const lone = e => !e.dead && !e.dying && !e.big && !e.ground && (e.type === 'fighter' || e.type === 'heavy') && !e.grp && !e.leader && !e.lead && !world.enemies.some(o => o.lead === e) && e.t > 30 && e.y > 12 && e.y < H * 0.6;
  for (let f = 0; f < ${FRAMES} && app.state === 'play'; f++) {
    for (const q in keys) keys[q] = false; player.inv = 999; player.cd = 99; player.drones = 0; world.shots.length = 0; world.items.length = 0; run.bombs = 0;
    if (${kills} && k < 12) for (const e of world.enemies) if (k < 12 && lone(e)) { k++; dead.add(key.get(e)); onStream(true, kill)(e); }
    update(); world.shots.length = 0;
    for (const e of world.enemies) { if (!key.has(e)) { key.set(e, e.type + '@' + gf + ':' + Math.round(e.x) + ',' + Math.round(e.y) + '#' + (n++)); } }
    if (gf % 10 === 0) for (const e of world.enemies) { if (e.dead || e.type === 'troop') continue; if (e.scatter || (e.lead && dead.has(key.get(e.lead)))) rx.add(key.get(e).replace(/#\\d+$/, '')); const s = [Math.round(e.x * 10), Math.round(e.y * 10)]; for (const [q, v] of Object.entries(e)) if (typeof v === 'number' && q !== 'hit' && q !== 'train') s.push(q + v.toFixed(3));
      const kk = key.get(e).replace(/#\\d+$/, ''); tr.set(kk, (tr.get(kk) || '') + gf + ':' + s.join(',') + ';'); } }
  return JSON.stringify({ tr: [...tr], dead: [...dead, ...rx].map(s => s.replace(/#\\d+$/, '')), k }); })()`;
for (const lv of [1, 2, 3, 4, 5, 6]) {
  const a = JSON.parse(await peek(pageA, still(false).replace('LV', lv))), b = JSON.parse(await peek(pageB, still(true).replace('LV', lv)));
  const A = new Map(a.tr), B = new Map(b.tr), dead = new Set(b.dead); let same = 0, diff = null, lost = null, extra = null;
  for (const [kk, t] of A) { if (dead.has(kk)) continue; if (!B.has(kk)) { lost = lost || kk; continue; } const tb = B.get(kk); if (tb === t) same++; else if (!diff) { const i = [...t].findIndex((c, j) => c !== tb[j]); diff = kk + ' at ' + t.slice(Math.max(0, t.lastIndexOf(';', i) + 1), i + 40) + ' / ' + tb.slice(Math.max(0, tb.lastIndexOf(';', i) + 1), i + 40); } }
  for (const kk of B.keys()) if (!A.has(kk) && !kk.startsWith('troop@')) extra = extra || kk;
  ok(b.k >= 5 && same > 20 && !diff && !lost && !extra, `level ${lv}: ${b.k} lone planes shot down or left alone, the other ${same} enemies fly and fire the same${diff ? ' (first difference: ' + diff + ')' : ''}${lost ? ' (missing: ' + lost + ')' : ''}${extra ? ' (new: ' + extra + ')' : ''}`);
}
/* a drop is the enemy's own: a pod gives the same item whether it is shot as soon as it shows or a second later */
const pods = late => `(() => { SF.setMode('immortal'); SF.start(1, 1); startEnigma(LV, true); const got = [], seen = new Map();
  for (let f = 0; f < 6000 && app.state === 'play' && got.length < 4; f++) { for (const q in keys) keys[q] = false; player.inv = 999; player.cd = 99; player.x = 12; player.y = H - 20; world.shots.length = 0; run.bombs = 0;
    for (const e of world.enemies) if (e.type === 'pod' && !e.dead && e.y > 20) { const s = seen.get(e) ?? gf; seen.set(e, s); if (gf - s >= ${late ? 60 : 0}) { const n0 = world.items.length; onStream(true, kill)(e); got.push(world.items.slice(n0).map(it => it.kind + (it.w || '')).join('+')); } }
    update(); world.shots.length = 0; world.items.length = 0; }
  return got.join(' '); })()`;
for (const lv of [1, 3, 5]) {
  const a = await peek(pageA, pods(false).replace('LV', lv)), b = await peek(pageB, pods(true).replace('LV', lv));
  ok(a.split(' ').length >= 2 && a === b, `level ${lv}: pods shot at once or a second later drop the same (${a}${a === b ? '' : ' / ' + b})`);
}
/* a level reached in a run starts the stream a practice start of it does */
{
  const r = JSON.parse(await peek(pageA, `(() => { SF.setMode('immortal'); SF.start(1, 1); startEnigma(2, false); const want = [simS, world.secret.q, world.secret.x];
    startEnigma(1, true); world.bossSpawned = true; app.results = null; app.fade = null; finishResults(); const f = app.fade && app.fade.fn; app.fade = null; if (f) f();
    return JSON.stringify({ level: run.sortie && run.sortie.level, got: [simS, world.secret.q, world.secret.x], want }); })()`));
  ok(r.level === 2 && r.got.join() === r.want.join(), `level 2 reached from level 1 starts as a practice start of it does (${r.got.join(', ')})`);
}
/* Endless keeps its variety */
{
  const s = await peek(pageA, `(() => { const a = []; for (let i = 0; i < 2; i++) { SF.start(1, 1, 0); a.push(run.seed); } return a.join(); })()`);
  const [x, y] = s.split(',');
  ok(x !== y, `Endless still gets a new seed every run (${s})`);
}
await browser.close();
if (bad) { console.error(`\n${bad} check(s) failed, ${passed} passed`); process.exit(1); }
console.log(`Fixed seed checks pass (${passed}).`);
