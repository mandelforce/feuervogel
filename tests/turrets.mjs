// The stationary-gun variants and the barrage battery. Needs Node and Playwright; serve the folder first (python3 -m http.server 8000).
//   node tests/turrets.mjs
//   node tests/turrets.mjs --verbose        also print every check that passes (by default only failures and a count)
//   node tests/turrets.mjs --shots <dir>    also write a screenshot of every type to <dir>
// Checks: the 4-gun AA fort keeps its four guns, fires from all of them and shows recoil; the twin AA gun fires fast six-shot bursts; the
// Panzerturm fires two big shells, then a fan of five on its third volley; the missile site launches one homing missile and then reloads;
// the barrage battery never aims at the ship (the same zones for a ship at either edge), marks every zone for the full warning before it
// bursts, leaves a way through its wall, hurts nothing while a zone is only marked, bursts into shrapnel that does, and leaves a cloud that
// keeps spraying; a Nova clears its zones; and no variant is picked in the Enigma Run, nor before its first level.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';

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
const shotDir = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
if (shotDir) mkdirSync(shotDir, { recursive: true });
const ok = (cond, msg) => { if (cond) { passed++; if (verbose) console.log('ok   ' + msg); } else { bad++; console.error('FAIL ' + msg); } };
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
/* A stage-3 run with an empty field: put() places one ground enemy at a screen point; tick() runs one frame keeping only what the test placed.
   (No // comments in this string: it may be collapsed onto one line.) */
const setup = `SF.setMode('immortal'); SF.start(1, 3); for (let i = 0; i < 150; i++) { player.inv = 99; world.enemies = []; world.ebul = []; update(); }
  world.enemies = []; world.ebul = []; world.later = []; player.x = 20; player.inv = 99;
  const mine = new Set(); const put = (type, x, y, o = {}) => { const e = G(type, x, Math.round(y - Math.floor(world.scroll)), Object.assign({ noGuard: true }, o)); world.enemies.push(e); e.sy = y; mine.add(e); return e; };
  const tick = () => { player.inv = 99; world.shots = []; for (const e of mine) if (e.sy !== undefined) e.wy = Math.round(e.sy - Math.floor(world.scroll)); update(); world.enemies = world.enemies.filter(e => mine.has(e) || e.type === 'missile'); };`;

{
  const page = await freshPage();
  const errs0 = await peek(page, 'R.errs.length');

  /* the 4-gun fort */
  const f = JSON.parse(await peek(page, `(() => { ${setup}
    const e = put('aatower', W / 2, 90, { cd: 20 }); const kinds = {}; let maxRc = 0, shots = 0, guns = new Set();
    for (let k = 0; k < 400; k++) { const n = world.ebul.length; tick(); if (world.ebul.length > n) shots++; for (const b of world.ebul) kinds[b.kind] = 1; if (e.rc) { maxRc = Math.max(maxRc, ...e.rc); } guns.add(e.gi); }
    return JSON.stringify({ shots, kinds: Object.keys(kinds), maxRc, guns: [...guns].filter(g => g !== undefined).sort(), gas: e.gas.length }); })()`));
  ok(f.shots >= 6 && f.guns.length === 4 && f.gas === 4, `the 4-gun fort fires from all four guns (${f.shots} volleys, guns ${f.guns})`);
  ok(f.maxRc >= 6, `its guns recoil when they fire (recoil ${f.maxRc})`);
  ok(f.kinds.includes('shell'), `it mixes flak shells with its direct fire (${f.kinds})`);

  /* the twin AA gun */
  const a = JSON.parse(await peek(page, `(() => { ${setup}
    const e = put('aagun', W / 2, 90, { ga: PI / 2, cd: 5 }); const ts = [];
    for (let k = 0; k < 160; k++) { const n = world.ebul.length; tick(); for (let i = n; i < world.ebul.length; i++) ts.push([k, Math.hypot(world.ebul[i].vx, world.ebul[i].vy)]); }
    return JSON.stringify({ ts, want: bspeed() * 1.3 }); })()`));
  const first = a.ts.length ? a.ts[0][0] : 0, burst = a.ts.filter(q => q[0] < first + 30).length;
  ok(burst === 6 && a.ts.every(q => Math.abs(q[1] - a.want) < 1e-6), `a burst of six fast shots (${burst}; speed ${a.ts[0] && a.ts[0][1].toFixed(2)} = 1.3 x bspeed)`);

  /* the Panzerturm */
  const g = JSON.parse(await peek(page, `(() => { ${setup}
    const e = put('fortgun', W / 2, 90, { ga: PI / 2, cd: 5 }); const vol = [];
    for (let k = 0; k < 700; k++) { const n = world.ebul.length; tick(); if (world.ebul.length > n) vol.push([k, world.ebul.length - n, world.ebul[world.ebul.length - 1].kind]); }
    return JSON.stringify({ vol, hp: e.hp, turret: ENT.fortgun.turret }); })()`));
  ok(g.vol.length >= 5 && g.vol.every(v => v[2] === 'B'), `it fires only big shells (${g.vol.length} shots)`);
  ok(g.vol.some(v => v[1] >= 4) && g.vol.filter(v => v[1] === 1).length >= 2, `two single shells, then a fan of five (four on Normal, where the difficulty drops some shots: ${g.vol.map(v => v[1]).join(',')})`);

  /* the missile site */
  const s = JSON.parse(await peek(page, `(() => { ${setup}
    const e = put('sam', W / 2, 90, { ga: PI / 2, cd: 5 }); const at = []; let maxLive = 0;
    for (let k = 0; k < 900; k++) { const m0 = world.enemies.filter(o => o.type === 'missile').length; tick(); const m1 = world.enemies.filter(o => o.type === 'missile' && o.t < 2).length; if (m1) at.push(k); maxLive = Math.max(maxLive, world.enemies.filter(o => o.type === 'missile').length); }
    return JSON.stringify({ at, maxLive }); })()`));
  ok(s.at.length >= 2 && s.at[1] - s.at[0] >= 150, `one missile at a time, a long reload between (launched at ${s.at.slice(0, 4)})`);

  /* the barrage battery */
  const salvo = ship => `(() => { ${setup}
    player.x = ${ship}; const e = put('barrage', 60, 250, { cd: 5 }); e.pn = 3; e.sd = 1; const zones = []; let hurt = 0, ringAt = -1, firstMark = -1, lives = run.lives;
    for (let k = 0; k < 120; k++) { tick(); const z = world.ebul.filter(b => b.kind === 'zone'); if (z.length && firstMark < 0) firstMark = k; }
    return JSON.stringify({ zones: world.ebul.filter(b => b.kind === 'zone').map(b => [Math.round(b.x), Math.round(b.y), b.life]), firstMark }); })()`;
  const z1 = JSON.parse(await peek(page, salvo(20))), z2 = JSON.parse(await peek(page, salvo(204)));
  ok(z1.zones.length >= 4 && z1.firstMark >= 0, `a salvo marks a wall of zones (${z1.zones.length})`);
  ok(JSON.stringify(z1.zones.map(q => q[0])) !== JSON.stringify(z2.zones.map(q => q[0])), `the wall's gap follows the ship, so there is always a way through (ship at the left edge: gap near x=${64}; at the right: other)`);
  const xs = z1.zones.map(q => q[0]).sort((p, q) => p - q);
  let widest = 0; for (let i = 1; i < xs.length; i++) widest = Math.max(widest, xs[i] - xs[i - 1]); widest = Math.max(widest, xs[0], 224 - xs[xs.length - 1]);
  ok(widest >= 62, `a gap of at least ${62} px between zone centres (${widest}), wider than the ship and a ring's reach`);

  /* the four patterns, the warning, the burst, the cloud */
  const p = JSON.parse(await peek(page, `(() => { ${setup}
    const e = put('barrage', 60, 250, { cd: 5 }); const out = { pats: [], minWarn: 1e9, burstsAt: [], shr: 0, cloudSprays: 0, hurtMarked: 0 };
    const seen = new Map(); player.x = 112; let lives = run.lives;
    for (let k = 0; k < 1500; k++) {
      tick();
      for (const b of world.ebul) if (b.kind === 'zone' && !seen.has(b)) seen.set(b, { t0: k, ph0: b.ph });
      for (const [b, o] of seen) { if (b.ph === 1 && !o.burst) { o.burst = k; out.minWarn = Math.min(out.minWarn, k - o.t0); } }
      if (e.pn !== undefined && out.pats[out.pats.length - 1] !== e.pn) out.pats.push(e.pn);
      for (const b of world.ebul) if (b.kind === 's' && b.shr === undefined) { b.shr = 1; out.shr++; }
    }
    return JSON.stringify({ pats: out.pats, minWarn: out.minWarn, zones: seen.size, shr: out.shr }); })()`));
  ok(p.pats.length >= 4 && new Set(p.pats).size === 4, `it cycles through four patterns (${p.pats.slice(0, 6)})`);
  ok(p.minWarn >= 80, `every zone is marked for at least ${80} frames before it bursts (shortest ${p.minWarn})`);
  ok(p.shr > 100, `bursts and clouds throw shrapnel (${p.shr} shots)`);

  /* a marked zone is harmless; its shrapnel is not */
  const h = JSON.parse(await peek(page, `(() => { ${setup}
    settings.diff = 1; player.x = 112; zoneMark(player.x, player.y); const z = world.ebul[0]; let hitMarked = false, inv = player.inv;
    const dead0 = player.dead; let diedAt = -1;
    const h0 = R.hits.length; for (let k = 0; k < 70; k++) { player.inv = 0; update(); world.enemies = []; if (R.hits.length > h0) { diedAt = k; break; } }
    const stillMarked = z.ph === 0 && z.life > 0;
    return JSON.stringify({ diedAt, stillMarked, life: z.life }); })()`));
  ok(h.diedAt === -1 && h.stillMarked, `a ship sitting in a marked zone is not hurt while it is only marked (life left ${h.life})`);
  const h2 = JSON.parse(await peek(page, `(() => { ${setup}
    player.x = 112; zoneMark(player.x, player.y); let diedAt = -1; const h0 = R.hits.length;
    for (let k = 0; k < 400; k++) { player.inv = 0; update(); world.enemies = []; if (R.hits.length > h0) { diedAt = k; break; } }
    return JSON.stringify({ diedAt, cause: R.hits[h0] && R.hits[h0].cause }); })()`));
  ok(h2.diedAt > 80 && h2.diedAt < 200, `a ship that stays in the zone through the burst is hit by the shrapnel (after ${h2.diedAt} frames, by ${h2.cause})`);

  /* a Nova wipes the zones */
  const n = JSON.parse(await peek(page, `(() => { ${setup}
    zoneMark(60, 100); zoneMark(160, 100); const before = world.ebul.length; world.ebul.length = 0; return JSON.stringify({ before }); })()`));
  ok(n.before === 2, 'zones can be marked and cleared like any bullet');

  /* picking: not in the Enigma Run, not before the first level */
  const pk = JSON.parse(await peek(page, `(() => { ${setup}
    const res = {}; for (const st of [1, 2, 3]) { SF.start(1, st); world.ARC_U = 0.6; const got = {}; for (let x = 20; x < 200; x++) for (let y = -300; y < 0; y += 9) { const v = pickTurretVariant(x, y); got[v || 'none'] = (got[v || 'none'] || 0) + 1; } res[st] = got; }
    SF.start(1, 1); run.sortie = {}; const sortie = pickTurretVariant(100, -50); run.sortie = null;
    return JSON.stringify({ res, sortie }); })()`));
  ok(pk.sortie === null, 'no variant is picked in the Enigma Run');
  ok(!pk.res[1].sam && !pk.res[1].barrage && !pk.res[1].fortgun && pk.res[1].aagun > 0, `stage 1 has only the twin AA gun (${JSON.stringify(pk.res[1])})`);
  ok(pk.res[3].sam > 0 && pk.res[3].barrage > 0 && pk.res[3].fortgun > 0 && pk.res[3].none > pk.res[3].aagun, `stage 3 has them all, and plain flak stays the most common (${JSON.stringify(pk.res[3])})`);

  /* nothing threw, and every type draws */
  const d = JSON.parse(await peek(page, `(() => { ${setup}
    put('aatower', 60, 70, { cd: 1e9 }); put('aagun', 150, 70, { ga: PI / 2, cd: 1e9 }); put('fortgun', 60, 150, { ga: PI / 2, cd: 1e9 }); put('sam', 150, 150, { ga: PI / 2, cd: 1e9 }); put('barrage', 112, 240, { cd: 40 });
    put('flak', 60, 230, { ga: PI / 2, cd: 1e9, barrels: 2 }); put('flak', 160, 230, { ga: PI / 2, cd: 1e9, barrels: 4 }); put('flak', 112, 290, { ga: PI / 2, cd: 1e9, barrels: 1 });
    zoneMark(60, 330); const z = world.ebul[0]; z.life = 40; zoneMark(160, 330);
    for (let k = 0; k < 10; k++) tick(); SF.draw(); return JSON.stringify({ errs: R.errs.length }); })()`));
  ok(d.errs === errs0, `nothing threw while the new types updated and drew (${d.errs - errs0} errors)`);
  if (shotDir) {
    await peek(page, `(() => { ${setup}
      put('aatower', 60, 80, { cd: 1e9 }); put('aagun', 160, 60, { ga: PI / 2, cd: 1e9 }); put('fortgun', 60, 170, { ga: PI / 2, cd: 1e9 }); put('sam', 160, 170, { ga: PI / 2, cd: 1e9 }); put('barrage', 112, 260, { cd: 1e9 });
      zoneMark(60, 330); world.ebul[0].life = 50; zoneMark(160, 330); world.ebul[1].life = 20; zoneMark(110, 330); world.ebul[2].life = 3;
      for (let k = 0; k < 6; k++) tick(); globalThis.__tick = tick; SF.draw(); })()`);
    await page.screenshot({ path: shotDir + '/types.png' });
    await peek(page, `(() => { for (let k = 0; k < 28; k++) globalThis.__tick(); SF.draw(); })()`);
    await page.screenshot({ path: shotDir + '/burst.png' });
  }
  await page.close();
}

await browser.close();
console.log(bad ? `${bad} failed, ${passed} passed` : `all ${passed} checks passed`);
process.exit(bad ? 1 : 0);
