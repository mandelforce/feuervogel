// The encounter director (docs/encounter-director-plan.md), step 3: The Anvil, started by hand (encStart) in level 2.
// Needs Node and Playwright; serve the folder first (python3 -m http.server 8000).
//   node tests/encounter.mjs
// Checks: every event is dispatched once, in order, on its frame; what it makes is tagged and the pod never counts; the encounter ends 'done'
// and rests; the held timers (air waves, pods) keep their value and resume from it, the ground timer runs on; Rookie skips the second
// formation; its Heavy stops and holds; pause, world.quiet, the carrier opening (level 1A) and the Shadow Wing freeze its clock, a death doesn't;
// the Shadow Wing waits for a running encounter; the soft budget: with the screen full a gated shooter (the Heavy) waits, the Sower's mines
// don't count, and once there is room the whole spread fires; a delayed volley reserves its bullets until it has fired; the boss ends it ('boss') and a new level clears it;
// it can't start outside the Campaign or twice; a snapshot can be taken mid-encounter; the readout draws; ?enc=anvil (local builds) starts
// it by itself, once per level. Flak lane: only flak is placed (a plan's slot first), the formation waits until the guns are on screen, the
// strafing run follows from the other side (not on Rookie), it never starts over the sea, and a flak verb that can place nothing makes nothing.
// Bomber screen: a Bomber, three dives and a strafing run on their frames (two dives and no run on Rookie), all spawn timers held, and a
// Bomber left alone leaves the screen and the encounter. Sower Window (level 4): ordinary encounters wait while a Sower is up; the level's
// first Sower doesn't open it; it opens the frame after the second Sower settles, once (not for its partner); it makes no Sower or Wing; air
// waves stay held; the Sowers lay their mines, drop their bombs and call their partner exactly as without it; it ends and air waves resume.
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
  const disp = [], tagged = new Set(); let lastI = 0, heldMoved = 0, groundMoved = false, podCounted = false, rest = 0, f = 0, still = 0, stillAt = null, hy = null;
  for (; f < 4000 && world.enc; f++) {
    SF.run(1); const E0 = world.enc; if (!E0) break;
    while (lastI < E0.i) disp.push(lastI++ + '@' + E0.t);
    for (const e of world.enemies) if (e.enc === 'anvil') { tagged.add(e); if (e.type === 'pod' && encOwned('anvil') > world.enemies.filter(o => o.enc === 'anvil' && o.type !== 'pod' && !o.dead && !o.dying && !o.crash && !harmlessE(o)).length) podCounted = true; }
    if (world.waveCd !== cd0.wave || world.podCd !== cd0.pod) heldMoved++;
    if (world.groundCd !== cd0.ground) groundMoved = true;
    const hv = world.enemies.find(e => e.enc === 'anvil' && e.type === 'heavy' && !e.dead); if (hv) { if (hv.y === hy) { still++; stillAt = hv.y; } hy = hv.y; }
    if (E0.st === 'rest') rest++;
  }
  const types = {}; for (const e of tagged) types[e.type + (e.encOwn === false ? '(not counted)' : '')] = (types[e.type + (e.encOwn === false ? '(not counted)' : '')] || 0) + 1;
  return JSON.stringify({ started, disp, want: D.ev.map((ev, i) => i + '@' + Math.max(1, ev.t)), types, last: world.encLast, heldMoved, groundMoved, podCounted, rest, frames: f,
    gone: !world.enc, waveAfter: world.waveCd, podAfter: world.podCd, cd0, leader: avail('leader'), still, stillAt: stillAt === null ? null : stillAt / H, holdT: D.ev[0].holdT });`;

{
  // 1. Veteran: the whole encounter
  const page = await freshPage();
  const r = JSON.parse(await peek(page, `(() => { ${level2(1, 7)} ${playOut} })()`));
  ok(r.started, 'encStart starts The Anvil in level 2');
  ok(r.disp.join() === r.want.join(), `every event dispatched once, in order, on its frame (${r.disp.join(' ')})`);
  const fighters = 12; // two five-plane formations (a leader and four wingmen from stage 4, a five-plane dive before) and a chase pair
  ok(r.types.heavy === 1 && r.types.fighter === fighters && r.types['pod(not counted)'] === 1 && Object.keys(r.types).length === 3, `tagged: ${JSON.stringify(r.types)}`);
  ok(!r.podCounted, 'the pod is never counted toward completion');
  ok(r.still >= r.holdT - 2 && Math.abs(r.stillAt - 0.28) < 0.01, `the Heavy stops at 28% of the screen and holds (${r.still} frames still, at ${(r.stillAt * 100).toFixed(1)}%)`);
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
    startEnigma(2, true); SF.run(4300); encStart('anvil'); let wingAt = -1, encEnd = -1;
    for (let f = 0; f < 4000 && wingAt < 0; f++) { SF.run(1); if (!world.enc && encEnd < 0) encEnd = f; if (world.enemies.some(e => e.type === 'wing')) wingAt = f; }
    out.wing = wingAt > 0 && encEnd >= 0 && wingAt > encEnd; out.wingAt = wingAt; out.encEnd = encEnd;
    return JSON.stringify(out); })()`));
  ok(r.boss, "the boss's arrival ends it ('boss')");
  ok(r.level && r.noTags, 'a new level starts with no encounter and nothing tagged');
  ok(r.carrier, "level 1A's carrier opening holds it: the clock doesn't start while the carrier scene runs");
  ok(r.retro, 'it cannot start outside the Campaign (the old campaign, Retro Run)');
  ok(r.wing, `the Shadow Wing waits until the encounter and its rest are over (encounter gone ${r.encEnd} frames in, Wing ${r.wingAt})`);
  await page.close();
}
{
  // 5. The soft budget, with the Heavy as the gated shooter (made tough so the bot can't kill it). Dummy bullets keep the screen at the
  // budget: the Heavy must not start a volley. Mines instead of them must not block it. With room again its whole spread (3 in level 2) fires.
  const page = await freshPage();
  const r = JSON.parse(await peek(page, `(() => { ${level2(1, 17)} const out = {};
    encStart('anvil'); let hv = null;
    for (let f = 0; f < 800; f++) { SF.run(1); hv = world.enemies.find(e => e.enc === 'anvil' && e.type === 'heavy' && !e.dead); if (hv) hv.hp = 9999; if (hv && hv.holdT < 400 && hv.pause === 0 && hv.cd > 3) break; }
    if (!hv) return JSON.stringify({ error: 'no Heavy' });
    const B = encBudget(); out.budget = B;
    const dummy = kind => ({ x: 8 + (world.ebul.length * 9) % 208, y: 3, vx: 0, vy: 0, r: 2, kind, a: 0, life: 9999, max: 9999, dummy: true });
    let paused = 0, maxB = 0;
    for (let f = 0; f < 300; f++) { while (encBullets() < B) world.ebul.push(dummy('s')); SF.run(1); if (hv.pause > 0) paused++; }
    out.waited = paused === 0 && hv.cd <= 0;
    world.ebul = world.ebul.filter(b => !b.dummy); let minePause = -1;
    for (let f = 0; f < 300 && minePause < 0; f++) { while (world.ebul.filter(b => b.kind === 'amine').length < B + 10) world.ebul.push(dummy('amine')); SF.run(1); if (hv.pause > 0) minePause = f; }
    out.mines = minePause >= 0;
    world.ebul = world.ebul.filter(b => !b.dummy); for (let f = 0; f < 60 && hv.pause > 0; f++) SF.run(1); // let that pause finish
    const e0 = eshot; let spread = 0; eshot = function (x, y, a, sp, kind) { if (Math.abs(x - hv.x) < 16 && Math.abs(y - hv.y) < 20) spread++; return e0(x, y, a, sp, kind); };
    let started = -1; for (let f = 0; f < 400; f++) { SF.run(1); if (started < 0 && hv.pause > 0) started = f; if (started >= 0 && hv.pause === 0) break; }
    eshot = e0; out.spread = spread; out.started = started >= 0;
    out.last = world.encLast || world.enc;
    return JSON.stringify(out); })()`));
  ok(!r.error, r.error || 'the Heavy is held for the budget checks');
  ok(r.waited, `with the screen at the budget (${r.budget}) the Heavy starts no volley; it waits with its cooldown run out`);
  ok(r.mines, "the Sower's mines don't count toward the budget: with more mines than the budget the Heavy still fires");
  ok(r.started && r.spread === 3, `with room again it fires its whole spread (${r.spread} of 3 bullets)`);
  await page.close();
}
{
  // 5b. Reservations: an admitted delayed volley holds its bullets until it has fired, so a second one can't land on top of it
  const page = await freshPage();
  const r = JSON.parse(await peek(page, `(() => { ${level2(1, 19)} const out = {};
    encStart('anvil'); SF.run(1); const B = encBudget();
    const fill = k => { world.ebul = []; for (let i = 0; i < k; i++) world.ebul.push({ x: 8 + i * 9 % 208, y: 3, vx: 0, vy: 0, r: 2, kind: 's', a: 0 }); };
    fill(B - 6); out.first = volleyOK(3, 30); out.overReserved = volleyOK(4); out.fits = volleyOK(3); world.enc.res = world.enc.res.slice(0, 1);
    for (let f = 0; f < 30; f++) { SF.run(1); } out.stillHeld = world.enc.res.length === 1; // (through the frame of its last bullet, 30 frames on)
    SF.run(1); fill(B - 6); out.released = world.enc.res.length === 0 && volleyOK(6);
    return JSON.stringify(out); })()`));
  ok(r.first && !r.overReserved && r.fits, 'a delayed volley reserves its bullets: with it admitted, only what still fits is admitted next');
  ok(r.stillHeld && r.released, 'the reservation lasts until the frame of its last bullet, then the room is free again');
  await page.close();
}
{
  // 6. Flak lane
  const page = await freshPage();
  const play = (lv, diff, seed, at) => `(() => { window.__forceSeed = ${seed}; gf = 0; SF.setMode('immortal'); SF.start(${diff}, 1); startEnigma(${lv}, true); delete window.__forceSeed; SF.run(${at});
    const started = encStart('flaklane'), D = ENC.flaklane, disp = {}, tagged = new Set(); let lastI = 0, f = 0, seenAt = -1;
    while (world.enc && world.enc.st !== 'rest' && f < 3000) { SF.run(1); f++; const E0 = world.enc; if (!E0) break;
      while (lastI < E0.i) disp[lastI++] = E0.t;
      for (const e of world.enemies) if (e.enc === 'flaklane') tagged.add(e);
      const guns = [...tagged].filter(e => e.type === 'flak' && !e.dead); if (seenAt < 0 && guns.length && guns.every(e => e.y >= 0.15 * H)) seenAt = E0.t; }
    const types = {}; for (const e of tagged) types[e.type] = (types[e.type] || 0) + 1;
    return JSON.stringify({ started, disp, seenAt, types, last: world.encLast }); })()`;
  const v = JSON.parse(await peek(page, play(2, 1, 31, 300)));
  ok(v.started && v.types.flak >= 1 && v.types.flak <= 2 && Object.keys(v.types).every(k => ['flak', 'troop', 'fighter'].includes(k)), `Flak lane places one or two guns (with crews) and nothing else: ${JSON.stringify(v.types)}`);
  ok(v.seenAt > 0 && v.disp[1] === v.seenAt + 1, `the formation goes as soon as the guns are 15% down the screen (they get there as the enemies move in frame ${v.seenAt}; the next frame's tick sends it: ${v.disp[1]})`);
  ok(v.disp[2] === v.disp[1] + 120 && v.disp[3] === v.disp[2] + 16 && v.disp[5] === v.disp[4] + 16 && v.types.fighter === 9, `then a strafing run of four, 120 frames after the formation, 16 apart (${[2, 3, 4, 5].map(i => v.disp[i]).join(', ')})`);
  ok(v.last && v.last.why === 'done' && v.last.dropped === 0, `Flak lane ends 'done' after ${v.last && v.last.t} frames, nothing dropped`);
  const r = JSON.parse(await peek(page, play(2, 0, 31, 300)));
  ok(r.types.fighter === 5 && r.last && r.last.why === 'done', `Rookie: no strafing run (${JSON.stringify(r.types)})`);
  const p4 = JSON.parse(await peek(page, play(4, 1, 31, 2200)));
  ok(p4.types.flak >= 1 && p4.last && p4.last.dropped === 0, `level 4 (a level with a plan): its gun is placed (${JSON.stringify(p4.types)})`);
  const sea = JSON.parse(await peek(page, `(() => { window.__forceSeed = 31; gf = 0; SF.setMode('immortal'); SF.start(1, 1); startEnigma(8, true); delete window.__forceSeed; SF.run(1500);
    const biome = biomeAtSpawn(), n0 = world.enemies.length, made = ENC_VERB.flak({}), n1 = world.enemies.length; return JSON.stringify({ biome, start: encStart('flaklane'), made, same: n0 === n1 }); })()`));
  ok(sea.biome === 'sea' && sea.start === false, `it does not start over the sea (${sea.biome})`);
  ok(sea.made === false && sea.same, 'over the sea the flak verb places nothing and says so, so a retry is safe');
  await page.close();
}
{
  // 7. Bomber screen
  const page = await freshPage();
  const play = (diff, seed, tough) => `(() => { window.__forceSeed = ${seed}; gf = 0; SF.setMode('immortal'); SF.start(${diff}, 1); startEnigma(2, true); delete window.__forceSeed; SF.run(300);
    const cd0 = { wave: world.waveCd, pod: world.podCd, ground: world.groundCd }, started = encStart('bomberscreen'), disp = [], tagged = new Set(); let lastI = 0, f = 0, moved = 0;
    while (world.enc && world.enc.st !== 'rest' && f < 3000) { SF.run(1); f++; const E0 = world.enc; if (!E0) break;
      while (lastI < E0.i) disp.push(lastI++ + '@' + E0.t);
      for (const e of world.enemies) if (e.enc === 'bomberscreen') { tagged.add(e); if (${tough} && e.type === 'bomber') e.hp = e.maxhp = 99999; }
      if (world.waveCd !== cd0.wave || world.podCd !== cd0.pod || world.groundCd !== cd0.ground) moved++; }
    const types = {}; for (const e of tagged) types[e.type] = (types[e.type] || 0) + 1;
    return JSON.stringify({ started, disp, types, moved, last: world.encLast }); })()`;
  const v = JSON.parse(await peek(page, play(1, 41, false)));
  ok(v.started && v.disp.join(' ') === '0@1 1@60 2@180 3@300 4@420 5@436 6@452 7@468', `Bomber screen: the Bomber, dives at 1, 3 and 5 s, a strafing run at 7 s, 16 frames apart (${v.disp.join(' ')})`);
  ok(v.types.bomber === 1 && v.types.fighter === 13 && Object.keys(v.types).length === 2, `tagged: ${JSON.stringify(v.types)}`);
  ok(v.moved === 0, 'air waves, pods and ground spawns all wait while it runs (an air fight)');
  ok(v.last && v.last.why === 'done', `it ends 'done' after ${v.last && v.last.t} frames (bullets peaked at ${v.last && v.last.peak}, budget ${18})`);
  const r = JSON.parse(await peek(page, play(0, 41, false)));
  ok(r.types.fighter === 6 && r.last && r.last.why === 'done', `Rookie: two dives and no strafing run (${JSON.stringify(r.types)})`);
  const t = JSON.parse(await peek(page, play(1, 42, true)));
  ok(t.last && t.last.why === 'done' && t.last.t < 1000, `a Bomber nobody can kill leaves the screen and the encounter still ends 'done' (${t.last && t.last.t} frames)`);
  await page.close();
}
{
  // 9. Sower Window: the same level 4 run (seed 104, Veteran, the plain immortal bot, Sowers made unkillable so both runs keep them as long),
  // once with ?enc=sowerwindow and once without
  const fly = `(() => { window.__forceSeed = 104; gf = 0; SF.setMode('immortal'); SF.start(1, 1); startEnigma(4, true); delete window.__forceSeed;
    const out = { early: false, anvilRefused: null, startF: -1, holdF: -1, again: false, mines: 0, bombs: 0, partner: false, sowers: new Set(), tagged: {}, waveMoved: 0, end: null, resumed: null };
    const seen = new WeakSet(); let wave0 = null, endF = -1;
    for (let f = 0; f < 9000; f++) { SF.run(1);
      for (const e of world.enemies) if (e.type === 'sower') { out.sowers.add(e); e.hp = 99999; }
      const first = world.enemies.find(e => e.type === 'sower' && !e.dead && world.ARC_U < 0.5);
      if (first && out.anvilRefused === null && !world.enc) out.anvilRefused = encStart('anvil') === false && !world.enc;
      if (world.enc && world.ARC_U < 0.7) out.early = true;
      if (out.holdF < 0 && world.ARC_U >= 0.7 && world.enemies.some(e => e.type === 'sower' && e.st === 'hold' && !e.second)) out.holdF = f;
      if (out.startF < 0 && world.enc) { out.startF = f; wave0 = world.waveCd; }
      if (world.enc && wave0 !== null && world.waveCd !== wave0) out.waveMoved++;
      if (f >= 7000 && f < 8400) for (const b of world.ebul) if (!seen.has(b) && (b.kind === 'amine' || b.kind === 'fbomb')) { seen.add(b); if (b.kind === 'amine') out.mines++; else out.bombs++; }
      if (world.enemies.some(e => e.type === 'sower' && e.second)) out.partner = true;
      for (const e of world.enemies) if (e.enc) out.tagged[e.type] = 1;
      if (out.startF >= 0 && !world.enc && endF < 0) { endF = f; out.end = world.encLast; out.resumed = world.waveCd === wave0 - 1 || wave0 <= 1; }
      if (endF >= 0 && world.enc) out.again = true; }
    out.sowers = out.sowers.size; return JSON.stringify(out); })()`;
  const page = await freshPage('?enc=sowerwindow');
  const w = JSON.parse(await peek(page, fly));
  await page.close();
  const page2 = await freshPage();
  const n = JSON.parse(await peek(page2, fly));
  await page2.close();
  ok(w.anvilRefused === true, 'while a Sower is up, an ordinary encounter does not start');
  ok(!w.early, "the level's first Sower (before the set2 stretch) does not open the Sower Window");
  ok(w.holdF > 0 && w.startF === w.holdF + 1, `it opens the frame after the second Sower settles (settled ${w.holdF}, opened ${w.startF})`);
  ok(!w.again, 'it opens once: not again for the partner the Sower calls');
  ok(!w.tagged.sower && !w.tagged.wing && w.sowers === n.sowers, `it makes no Sower or Wing (Sowers in the level: ${w.sowers}, the same as without it: ${n.sowers}; tagged: ${Object.keys(w.tagged).join(', ')})`);
  ok(w.waveMoved === 0, 'air waves stay held for the whole encounter');
  ok(w.mines === n.mines && w.bombs === n.bombs && w.partner && n.partner, `the Sowers lay their mines (${w.mines}, ${n.mines} without), drop their bombs (${w.bombs}, ${n.bombs}) and call the partner as without it`);
  ok(w.end && w.end.why === 'done' && w.resumed, `it ends 'done' after ${w.end && w.end.t} frames and air waves resume from where they were`);
}
{
  // 8. ?enc=anvil: started by itself as soon as it may, once per level; held while the carrier opening runs; nothing without the switch
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
{
  // ?enc=all: one encounter per level, the Campaign's tour (1A The Anvil, 2 Flak lane, 3 Bomber screen, 4 Sower Window, 5 The Anvil, 6B
  // Flak lane), started as each level's practice run; and the playtest banner draws
  const page = await freshPage('?enc=all');
  const r = JSON.parse(await peek(page, `(() => { const out = {};
    for (const lv of [8, 2, 3, 5, 7]) { window.__forceSeed = 5; gf = 0; SF.setMode('immortal'); SF.start(1, 1); startEnigma(lv, false); delete window.__forceSeed;
      for (let f = 0; f < 1500 && !world.enc; f++) SF.run(1); out[lv] = world.enc ? world.enc.id : null; // (6B opens over the sea: Flak lane waits for land, about frame 870)
      if (lv === 2) { let drew = true; try { SF.draw(); } catch (e) { drew = String(e); } out.drew = drew; } }
    out.tour = ENC_TOUR.join(); return JSON.stringify(out); })()`));
  ok(r[8] === 'anvil' && r[2] === 'flaklane' && r[3] === 'bomberscreen' && r[5] === 'anvil' && r[7] === 'flaklane', `?enc=all plays the tour: 1A ${r[8]}, 2 ${r[2]}, 3 ${r[3]}, 5 ${r[5]}, 6B ${r[7]} (level 4's Sower Window waits for its second Sower: checked above)`);
  ok(r.drew === true, `the playtest banner (ENCOUNTER: <name>) draws${r.drew === true ? '' : ': ' + r.drew}`);
  await page.close();
}
await browser.close();
if (bad) { console.error(`\n${bad} problem(s) found.`); process.exit(1); }
console.log('\nEncounter test passed.');
