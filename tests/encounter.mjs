// The encounter director (docs/encounter-director-plan.md), step 3: The Anvil, started by hand (encStart) in level 2.
// Needs Node and Playwright; serve the folder first (python3 -m http.server 8000).
//   node tests/encounter.mjs
// Checks: every event is dispatched once, in order, on its frame; what it makes is tagged and the pod never counts; the encounter ends 'done'
// and rests; the held timers (air waves, pods) keep their value and resume from it, the ground timer runs on; Rookie skips the second
// formation; pause, world.quiet, the carrier opening (level 1A) and the Shadow Wing freeze its clock, a death doesn't; the boss ends it ('boss') and a new level clears it;
// it can't start outside the Campaign or twice; a snapshot can be taken mid-encounter; the readout draws; ?enc=anvil (local builds) starts
// it by itself, once per level.
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
async function freshPage(query = '') {
  const page = await browser.newPage({ viewport: golden.viewport });
  await page.route(/workers\.dev/, r => r.abort());
  page.on('pageerror', e => { bad++; console.error('page error:', e.message); });
  await page.addInitScript(initScript);
  await page.goto(PAGE + query);
  await page.waitForFunction(() => typeof window.__sf === 'function', null, { polling: 100, timeout: 60000 });
  await page.evaluate(s => window.__sf(s), harness);
  await page.evaluate(() => window.SF.peek('app.booting && finishBoot(), 0'));
  return page;
}
const peek = (page, code) => page.evaluate(c => window.SF.peek(c), code);
// level 2, flown by the immortal bot to frame 300: the 'mix' stretch, well before its first set piece (about frame 3510). Not level 1A,
// whose carrier opening holds an encounter for its first 1000 frames or more (checked on its own below).
const level2 = (diff, seed) => `window.__forceSeed = ${seed}; gf = 0; SF.setMode('immortal'); SF.start(${diff}, 1); startEnigma(2, true); delete window.__forceSeed; SF.run(300);`;
// The Anvil played out: the dispatches (event index @ encounter frame), every entity it tagged, the timers, and how it ended
const playOut = `
  const cd0 = { wave: world.waveCd, pod: world.podCd, ground: world.groundCd }, started = encStart('anvil'), D = ENC.anvil;
  const disp = [], tagged = new Set(); let lastI = 0, heldMoved = 0, groundMoved = false, podCounted = false, rest = 0, f = 0;
  for (; f < 4000 && world.enc; f++) {
    SF.run(1); const E0 = world.enc; if (!E0) break;
    while (lastI < E0.i) disp.push(lastI++ + '@' + E0.t);
    for (const e of world.enemies) if (e.enc === 'anvil') { tagged.add(e); if (e.type === 'pod' && encOwned('anvil') > world.enemies.filter(o => o.enc === 'anvil' && o.type !== 'pod' && !o.dead && !o.dying && !o.crash && !harmlessE(o)).length) podCounted = true; }
    if (world.waveCd !== cd0.wave || world.podCd !== cd0.pod) heldMoved++;
    if (world.groundCd !== cd0.ground) groundMoved = true;
    if (E0.st === 'rest') rest++;
  }
  const types = {}; for (const e of tagged) types[e.type + (e.encOwn === false ? '(not counted)' : '')] = (types[e.type + (e.encOwn === false ? '(not counted)' : '')] || 0) + 1;
  return JSON.stringify({ started, disp, want: D.ev.map((ev, i) => i + '@' + Math.max(1, ev.t)), types, last: world.encLast, heldMoved, groundMoved, podCounted, rest, frames: f,
    gone: !world.enc, waveAfter: world.waveCd, podAfter: world.podCd, cd0, leader: avail('leader') });`;

{
  // 1. Veteran: the whole encounter
  const page = await freshPage();
  const r = JSON.parse(await peek(page, `(() => { ${level2(1, 7)} ${playOut} })()`));
  ok(r.started, 'encStart starts The Anvil in level 2');
  ok(r.disp.join() === r.want.join(), `every event dispatched once, in order, on its frame (${r.disp.join(' ')})`);
  const fighters = 12; // two five-plane formations (a leader and four wingmen from stage 4, a five-plane dive before) and a chase pair
  ok(r.types.heavy === 1 && r.types.fighter === fighters && r.types['pod(not counted)'] === 1 && Object.keys(r.types).length === 3, `tagged: ${JSON.stringify(r.types)}`);
  ok(!r.podCounted, 'the pod is never counted toward completion');
  ok(r.last && r.last.why === 'done' && r.last.dropped === 0, `it ends 'done' after ${r.last && r.last.t} frames (nothing dropped; bullets peaked at ${r.last && r.last.peak}, over the budget for ${r.last && r.last.over} frames)`);
  ok(r.rest === 180 && r.gone, `then it rests ${r.rest} frames and clears`);
  ok(r.heldMoved === 0, 'air waves and pods keep their countdown while it runs and rests');
  ok(r.groundMoved, 'the ground timer runs on (not held)');
  ok((r.waveAfter === r.cd0.wave - 1 || r.cd0.wave <= 1) && (r.podAfter === r.cd0.pod - 1 || r.cd0.pod <= 1), `the held timers resume from the value they had (wave ${r.cd0.wave} > ${r.waveAfter}, pod ${r.cd0.pod} > ${r.podAfter})`);
  await page.close();
}
{
  // 2. Rookie: the second formation is skipped, not dropped
  const page = await freshPage();
  const r = JSON.parse(await peek(page, `(() => { ${level2(0, 7)} ${playOut} })()`));
  ok(r.types.fighter === 7 && r.types.heavy === 1, `Rookie: one formation and the chase pair (${JSON.stringify(r.types)})`);
  ok(r.last && r.last.why === 'done' && r.last.dropped === 0, `Rookie: it still ends 'done' with nothing dropped`);
  await page.close();
}
{
  // 3. What freezes the clock and what doesn't
  const page = await freshPage();
  const r = JSON.parse(await peek(page, `(() => { ${level2(1, 11)}
    encStart('anvil'); SF.run(100); const E0 = () => world.enc, out = {};
    let t = E0().t; app.paused = true; SF.run(60); app.paused = false; out.pause = E0().t === t;
    t = E0().t; world.quiet = true; SF.run(60); world.quiet = false; out.quiet = E0().t === t;
    t = E0().t; const w = E('wing', { x: W / 2, y: -40, hp: 9999, maxhp: 9999 }); world.enemies.push(w); const wave = world.waveCd;
    SF.run(60); out.wing = E0().t === t && E0().st === 'hold' && world.waveCd === wave; w.dead = true; SF.run(2); out.wingOff = E0().st === 'run' && E0().t > t;
    t = E0().t; const i = E0().i; die('test'); SF.run(120); out.death = !!world.enc && E0().t >= t + 100 && E0().i >= i;
    let snap = null; for (let k = 0; k < 300 && !snap && world.enc; k++) { snap = takeSnapshot(); if (!snap) SF.run(1); } out.snap = !!snap && snapDecode(snap).world.enc.id === 'anvil';
    settings.fps = true; let drew = true; try { SF.draw(); } catch (e) { drew = String(e); } settings.fps = false; out.drew = drew;
    out.twice = encStart('anvil') === false;
    return JSON.stringify(out); })()`));
  ok(r.pause, 'pause freezes the encounter clock');
  ok(r.quiet, 'world.quiet (stage end, flyby) freezes the encounter clock');
  ok(r.wing && r.wingOff, 'the Shadow Wing on screen holds it (clock and air timer frozen) and it runs on once the Wing is gone');
  ok(r.death, 'a death does not reset or stop it');
  ok(r.snap, 'a snapshot can be taken mid-encounter and carries world.enc');
  ok(r.drew === true, `the readout draws (Show FPS, local build)${r.drew === true ? '' : ': ' + r.drew}`);
  ok(r.twice, 'a second encounter cannot start while one exists');
  await page.close();
}
{
  // 4. The boss, a new level, and outside the Campaign
  const page = await freshPage();
  const r = JSON.parse(await peek(page, `(() => { ${level2(1, 13)} const out = {};
    encStart('anvil'); SF.run(100); world.bossSpawned = true; SF.run(1); out.boss = !world.enc && world.encLast && world.encLast.why === 'boss';
    startEnigma(2, true); SF.run(300); encStart('anvil'); SF.run(100); startEnigma(3, true); out.level = !world.enc && !world.encLast;
    startEnigma(8, true); SF.run(10); encStart('anvil'); SF.run(60); out.carrier = !!world.carrier && !world.carrier.over && world.enc.st === 'hold' && world.enc.t === 0;
    SF.run(600); out.noTags = !world.enemies.some(e => e.enc);
    SF.start(1, 1); out.retro = encStart('anvil') === false && !world.enc;
    return JSON.stringify(out); })()`));
  ok(r.boss, "the boss's arrival ends it ('boss')");
  ok(r.level && r.noTags, 'a new level starts with no encounter and nothing tagged');
  ok(r.carrier, "level 1A's carrier opening holds it: the clock doesn't start while the carrier scene runs");
  ok(r.retro, 'it cannot start outside the Campaign (the old campaign, Retro Run)');
  await page.close();
}
{
  // 5. ?enc=anvil: started by itself as soon as it may, once per level; held while the carrier opening runs; nothing without the switch
  const page = await freshPage('?enc=anvil');
  const r = JSON.parse(await peek(page, `(() => { const out = {};
    window.__forceSeed = 5; gf = 0; SF.setMode('immortal'); SF.start(1, 1); startEnigma(2, true); delete window.__forceSeed;
    SF.run(5); out.auto = !!world.enc && world.enc.id === 'anvil';
    let f = 0; while (world.enc && f < 4000) { SF.run(1); f++; } out.done = !world.enc && world.encLast && world.encLast.why === 'done';
    SF.run(600); out.once = !world.enc;
    startEnigma(3, true); SF.run(5); out.nextLevel = !!world.enc;
    startEnigma(8, true); SF.run(60); out.carrier = !!world.enc && world.enc.st === 'hold';
    SF.start(1, 1); SF.run(60); out.retro = !world.enc;
    return JSON.stringify(out); })()`));
  ok(r.auto && r.done && r.once, '?enc=anvil starts it by itself in a level, it plays out, and it does not start again in that level');
  ok(r.nextLevel, '?enc=anvil starts it again in the next level');
  ok(r.carrier, "?enc=anvil in level 1A: it waits in 'hold' while the carrier opening runs");
  ok(r.retro, '?enc=anvil does nothing outside the Campaign');
  await page.close();
}
await browser.close();
if (bad) { console.error(`\n${bad} problem(s) found.`); process.exit(1); }
console.log('\nEncounter test passed.');
