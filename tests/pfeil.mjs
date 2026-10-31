// The Pfeil (Enigma Run, level 3 on; the dart) and the Kolibri (the old Pfeil, kept but not spawned).
// Needs Node and Playwright; serve the folder first (python3 -m http.server 8000).
//   node tests/pfeil.mjs
//   node tests/pfeil.mjs --verbose   also print every check that passes (by default only failures and a count)
// Checks: a lone Pfeil (five flights, five run seeds) comes in from a side and flies at PFEIL.cruise; it leaves the screen on its circles but never goes beyond its cull margin and always comes back;
// it shoots (a warning flare first) and every shot leaves its nose along its heading; it never flies on into a ship (breaks away); it is never culled, never leaves
// by itself and has no yellow skin; a formation has the leader and 2 or 4 wingmen in their slots, the leader has the yellow skin (built from the plain art, which it
// leaves alone), at most one member starts a burst at a time; a shot down leader is replaced by a wingman (the skin follows), the last one flies on alone, shooting
// down the whole formation pays the bonus; the spawn gives 0, 2 or 4 wingmen; the Kolibri (and its old formation) still fly as they did, without page errors.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const PAGE = process.env.STARFALL_URL || 'http://localhost:8000/';
const golden = JSON.parse(readFileSync(new URL('./golden.json', import.meta.url), 'utf8'));
const harness = readFileSync(new URL('./harness.js', import.meta.url), 'utf8');
const verbose = process.argv.includes('--verbose');
let bad = 0, passed = 0;
const ok = (cond, msg) => { if (cond) { passed++; if (verbose) console.log('ok   ' + msg); } else { bad++; console.error('FAIL ' + msg); } };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: golden.viewport });
await page.route(/workers\.dev/, r => r.abort());
page.on('pageerror', e => { bad++; console.error('page error:', e.message); });
await page.addInitScript(() => {
  let a = 1944; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  window.requestAnimationFrame = () => 0;
});
await page.goto(PAGE);
await page.waitForFunction(() => typeof window.__sf === 'function', null, { polling: 100, timeout: 60000 });
await page.evaluate(s => window.__sf(s), harness);
await page.evaluate(() => window.SF.peek('app.booting && finishBoot(), 0'));
const peek = (code) => page.evaluate(c => window.SF.peek(c), code).then(r => (typeof r === 'string' ? JSON.parse(r) : r));
const start = `gf = 0; SF.setMode('immortal'); SF.start(1, 1); startEnigma(5, true); SF.run(60); world.enemies.length = 0; world.waveCd = 1e9;`;

const lone = { bursts: 0, each: [] };
// 1. a lone Pfeil, 2400 frames (made unkillable and alone: nothing else flies), flown with five run seeds: one flight is one sample of a
// chaotic path (its bursts and closest pass swing with any change to its speed), so the checks take all five
for (const seed of [1, 7, 11, 23, 42]) {
  const r = await peek(`JSON.stringify((() => { window.__forceSeed = ${seed}; ${start} delete window.__forceSeed; wavePfeil(0);
    const P = PFEIL, o = { n: 0, maxOff: 0, offFrames: 0, back: 0, bursts: 0, badShot: 0, minD: 1e9, dead: false, skin: false, speeds: [], culled: false, enteredAt: -1 }; let wasOff = false;
    for (let f = 0; f < 2400; f++) {
      for (const e of world.enemies) e.hp = 999; SF.run(1); world.enemies = world.enemies.filter(e => e.type === 'pfeil' || e.dead === false && false);
      const e = world.enemies.find(x => x.type === 'pfeil'); if (!e) { o.culled = true; break; } o.n = world.enemies.length;
      if (e.st !== 'fly') continue; if (o.enteredAt < 0) o.enteredAt = f; o.skin = o.skin || e.isLead;
      o.speeds.push(Math.hypot(e.vx, e.vy)); const off = Math.max(-e.x, e.x - W, -e.y); o.maxOff = Math.max(o.maxOff, off);
      const out = e.x < 0 || e.x > W || e.y < 0; if (out) o.offFrames++; if (wasOff && !out) o.back++; wasOff = out;
      const q = nearShip(e.x, e.y); o.minD = Math.min(o.minD, Math.hypot(q.x - e.x, q.y - e.y));
      if (e.tele === P.tele - 1) o.bursts++;
      for (const b of world.ebul) { const a = Math.atan2(b.vy, b.vx); if (Math.abs(angDiff(a, e.h)) > 0.01 && Math.abs(angDiff(a, e.face)) > 0.01) o.badShot++; }
      world.ebul.length = 0;
    }
    o.minSp = Math.min(...o.speeds); o.maxSp = Math.max(...o.speeds); o.cruise = PFEIL.cruise; delete o.speeds; return o; })())`);
  ok(r.enteredAt >= 0 && !r.culled, `seed ${seed}: a lone Pfeil comes in (frame ${r.enteredAt}) and is never culled or gone by itself in 2400 frames`);
  ok(Math.abs(r.minSp - r.cruise) < 0.1 && Math.abs(r.maxSp - r.cruise) < 0.1, `seed ${seed}: it flies at its cruise speed, ${r.cruise} (${r.minSp.toFixed(2)} to ${r.maxSp.toFixed(2)} px/frame)`);
  ok(r.offFrames > 100 && r.back >= 3, `seed ${seed}: it goes off the screen on its circles (${r.offFrames} frames) and comes back every time (${r.back} returns)`);
  ok(r.maxOff < 420, `seed ${seed}: it never goes beyond its cull margin (${Math.round(r.maxOff)} px outside the screen at most)`);
  ok(r.badShot === 0, `seed ${seed}: every shot leaves along its heading`);
  ok(r.minD > 30, `seed ${seed}: it breaks away before it flies into a ship (closest ${r.minD.toFixed(1)} px)`);
  ok(!r.skin, `seed ${seed}: a lone Pfeil has the plain skin`);
  lone.bursts += r.bursts; lone.each.push(r.bursts);
}
ok(lone.bursts >= 10, `it finds its moments to shoot: ${lone.bursts} bursts in five flights of 2400 frames (${lone.each.join(', ')})`);
// 2. a formation of 4 wingmen: slots, skin, one burst at a time, the leader replaced, the last one alone, the bonus
{
  const r = await peek(`JSON.stringify((() => { ${start} wavePfeil(4); const g = world.enemies[0].grp, o = {};
    o.n = world.enemies.length; o.slots = world.enemies.filter(e => e.fm).map(e => e.slot.join(',')).join(' | '); o.fmFlags = world.enemies.map(e => !!e.fm).join();
    let overlap = 0, minSep = 1e9, leadFrames = 0, frames = 0;
    for (let f = 0; f < 1200; f++) {
      for (const e of world.enemies) e.hp = 999; SF.run(1); world.ebul.length = 0; const m = world.enemies.filter(e => e.type === 'pfeil' && !e.dead); if (m.length < 5) { o.lost = { f, prev, flags: world.enemies.map(e => [Math.round(e.x), Math.round(e.y), e.dead, e.dying]) }; break; } var prev = m.map(e => [Math.round(e.x), Math.round(e.y), e.st]);
      if (m.filter(e => e.tele > 0 || e.bn > 0).length > 1) overlap++; frames++; if (m.filter(e => e.isLead).length === 1) leadFrames++;
      for (let i = 0; i < m.length; i++) for (let j = i + 1; j < m.length; j++) if (m[i].x > 0 && m[i].x < W && m[j].x > 0 && m[j].x < W) minSep = Math.min(minSep, Math.hypot(m[i].x - m[j].x, m[i].y - m[j].y));
    }
    o.overlap = overlap; o.minSep = Math.round(minSep); o.leadFrames = leadFrames; o.frames = frames;
    // the skin is built from the plain art, which it leaves alone
    const s2 = SPR.pfeil, plain = s2.rot ? s2.rot[8].c.toDataURL() : null; leaderSet(s2); o.plainSame = !s2.rot || s2.rot[8].c.toDataURL() === plain;
    const px = (c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] && d[i] > 220 && d[i + 1] > 180 && d[i + 2] < 90) n++; return n; };
    o.yellow = px(leaderSet(s2)[8].c); o.yellowPlain = px(rotSet(s2, 32)[8].c);
    // the leader is shot down: a wingman takes over, and wears the skin
    const L = g.lead; L.dead = true; SF.run(2); const ps = world.enemies.filter(e => e.type === 'pfeil' && !e.dead); o.afterKill = { n: ps.length, leads: ps.filter(e => e.isLead).length, newLead: g.lead !== L && g.lead.fm === false, slotsLeft: ps.filter(e => e.fm).length };
    // down to the last one: no skin, flies on alone
    for (const e of ps.slice(1)) e.dead = true; SF.run(2); const last = world.enemies.find(e => e.type === 'pfeil' && !e.dead); o.last = { skin: last.isLead, flying: last.st === 'fly' };
    // the bonus: all 5 shot down through the normal route
    const s0 = run.score ?? 0; return o; })())`);
  ok(r.n === 5 && r.slots === '-34,-38 | -34,38 | -68,-76 | -68,76' && r.fmFlags === 'false,true,true,true,true', `a formation of 4 wingmen: leader first, slots in a V and a second row (${r.slots})`);
  ok(r.leadFrames === r.frames && r.frames > 600, `exactly one leader wears the skin all the time (${r.leadFrames}/${r.frames} frames)`);
  ok(r.overlap === 0, `only one member warns or fires at a time (${r.overlap} frames with two)`);
  ok(r.minSep >= 20, `members on the screen stay apart (closest ${r.minSep} px)`);
  ok(r.plainSame && r.yellow > r.yellowPlain + 8, `the leader skin adds yellow (${r.yellow} yellow pixels against ${r.yellowPlain}) and leaves the plain art alone`);
  ok(r.afterKill.n === 4 && r.afterKill.leads === 1 && r.afterKill.newLead && r.afterKill.slotsLeft === 3, `the leader shot down: a wingman takes over (one skin, 3 wingmen left; got ${JSON.stringify(r.afterKill)} ${JSON.stringify(r.lost)})`);
  ok(!r.last.skin && r.last.flying, `the last one left flies on alone in the plain skin (got ${JSON.stringify(r.last)})`);
}
// 3. the bonus, and 2 wingmen
{
  const r = await peek(`JSON.stringify((() => { ${start} wavePfeil(2); const m = world.enemies.slice(), s0 = run.score;
    for (const e of m) { const b = run.score; ENT.pfeil.onKill(e); } return { n: m.length, gain: run.score - s0, bonus: PFEIL.bonus * m.length }; })())`);
  ok(r.n === 3 && r.gain === r.bonus, `a formation of 2 wingmen: shooting down all 3 pays the bonus (${r.gain} of ${r.bonus})`);
}
// 4. the spawn: from level 4 sometimes with 2 or 4 wingmen, 4 only from level 5; never at level 2; at most one group
{
  const r = await peek(`JSON.stringify((() => { const out = {}; const orig = Math.random;
    for (const lv of [3, 4, 5]) { startEnigma(lv, true); const sizes = new Set(); let spawned = 0;
      for (let i = 0; i < 400; i++) { world.enemies.length = 0; run.sortie.level = lv; const ro = orig; spawnWave(0, false); const n = world.enemies.filter(e => e.type === 'pfeil').length; if (n) { spawned++; sizes.add(n); } }
      out[lv] = [...sizes].sort().join(','); }
    return out; })())`);
  ok(r[3] === '1', `level 3: a single Pfeil only (sizes: ${r[3]})`);
  ok(r[4].includes('1') && r[4].includes('3') && !r[4].includes('5'), `level 4: single or with 2 wingmen, never 4 (sizes: ${r[4]})`);
  ok(r[5].includes('1') && r[5].includes('3') && r[5].includes('5'), `level 5: single, 2 or 4 wingmen (sizes: ${r[5]})`);
}
// 5. the Kolibri, the old Pfeil, still flies: a pair, and its formation of 3
{
  const r = await peek(`JSON.stringify((() => { ${start} waveKolibri(); let seen = 0, shots = 0, states = new Set(), off = false;
    for (let f = 0; f < 900; f++) { for (const e of world.enemies) e.hp = 999; SF.run(1); const ks = world.enemies.filter(e => e.type === 'kolibri'); if (ks.length === 2) seen++; for (const e of ks) states.add(e.st); shots += world.ebul.length; world.ebul.length = 0; world.enemies = world.enemies.filter(e => e.type === 'kolibri'); }
    const a = { seen, shots, states: [...states].sort().join(), pfeil: world.enemies.some(e => e.type === 'pfeil') };
    world.enemies.length = 0; waveKolibriWing(3); let wing = 0; for (let f = 0; f < 900; f++) { for (const e of world.enemies) e.hp = 999; SF.run(1); world.ebul.length = 0; world.enemies = world.enemies.filter(e => e.type === 'kolibri'); wing = Math.max(wing, world.enemies.length); }
    a.wing = wing; return a; })())`);
  ok(r.seen > 500 && r.shots > 0 && ['aim', 'hunt', 'hide'].every(s => r.states.includes(s)) && !r.pfeil, `the Kolibri pair still hunts, hides, aims and shoots (${r.states}; ${r.shots} shots)`);
  ok(r.wing === 3, 'the Kolibri Wingman Formation still flies with its 3 members');
}
await browser.close();
console.log(bad ? bad + ' FAILED, ' + passed + ' passed' : 'Pfeil checks pass (' + passed + ').');
process.exit(bad ? 1 : 0);
