// StarFall balance bot. Runs the game at high speed with a dodging bot and measures stages and bosses.
// Works only on local/test builds, where index.html exposes window.__sf (see tests/README.md).
// Load it in the browser console:  __sf(await (await fetch('tests/harness.js')).text())
(() => {
const R = { stages: {}, hits: [], errs: [] };
let mode = 'immortal', cur = null, stageStart = 0, lastStage = -1;
const realDie = die, realOpen = openResults;

// Record every hit. In 'immortal' mode the hit is counted but the ship survives, so a run always reaches the end.
die = function (why) {
  const p = player; let cause = 'collision', near = 1e9;
  for (const b of world.ebul) { const d = (b.x - p.x) ** 2 + (b.y - p.y) ** 2; if (d < near) { near = d; cause = 'bullet:' + b.kind; } }
  for (const e of world.enemies) if (!e.ground && !e.surface && Math.abs(e.x - p.x) < e.hw && Math.abs(e.y - p.y) < e.hh) { cause = 'body:' + e.type; break; }
  R.hits.push({ stage: run.stage, t: Math.round((gf - stageStart) / 60), cause, why, boss: world.enemies.some(e => e.type === 'boss' && !e.dying), bullets: world.ebul.length }); // (why: what the game says killed the ship, e.g. 'flame' for the Black Fortress laser; cause is only the nearest bullet)
  if (cur) cur.hits++;
  if (mode === 'immortal') { p.inv = 90; world.ebul.length = 0; return; }
  realDie(why);
};
openResults = function () {
  if (cur) Object.assign(cur, { kills: run.stats.kills, seen: run.stats.seen, medals: run.stats.medals, secret: !!run.stats.artifact, clearT: Math.round((gf - stageStart) / 60) });
  realOpen();
};
function newStage() { stageStart = gf; cur = R.stages[run.stage] = { stage: run.stage, theme: world.curTheme, hits: 0, maxB: 0, sumB: 0, n: 0, bossIn: null, bossDead: null, wpn: '', updMax: 0 }; }

// The bot looks ahead up to 16 frames for each of the 9 stick directions and picks the safest one,
// drifting toward the enemy (or boss part) it wants to shoot and toward pickups.
function bot() {
  for (const k of ['arrowleft', 'arrowright', 'arrowup', 'arrowdown']) keys[k] = false;
  const p = player; if (!p || p.dead || p.fly > 0 || p.exitT > 0 || app.results || app.congrats) return;
  let tgt = W / 2, ty = H * 0.72, bestY = -1e9;
  for (const e of world.enemies) if (!e.dying && !e.dead && e.y > 10 && e.y < p.y - 20 && (e.type === 'boss' || e.y > bestY)) {
    bestY = e.type === 'boss' ? 1e9 : e.y; tgt = e.x;
    if (e.type === 'boss' && e.parts) { let bd = 1e9; for (const q of e.parts) if (!q.dead && !q.off) { const qx = e.x + (q.ox || 0), d = Math.abs(qx - p.x) + (q.k === 'core' ? 30 : 0); if (d < bd) { bd = d; tgt = qx; } } }
  }
  // chase pickups, except during a boss fight, where a player keeps under the boss
  if (!world.enemies.some(e => e.type === 'boss')) for (const it of world.items) if (it.y > 30 && it.y < H - 10) { tgt = it.x; ty = clamp(it.y + 10, H * 0.45, H - 20); break; }
  let best = [0, 0], bs = 1e18;
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const m = dx && dy ? 0.7071 : 1, vx = dx * m * 2.6, vy = dy * m * 2.6; let d = 0;
    for (const t of [1, 3, 5, 8, 12, 16]) {
      const px = clamp(p.x + vx * Math.min(t, 8), 8, W - 8), py = clamp(p.y + vy * Math.min(t, 8), 18, H - 14);
      for (const b of world.ebul) {
        let bx, by, r;
        if (b.kind === 'mortar') { if (b.life > 20) continue; bx = b.tx; by = b.ty; r = 10; }
        else { bx = b.x + b.vx * t; by = b.y + b.vy * t; r = (b.kind === 'mega' ? 5 : b.r) + 1.6; }
        const d2 = (bx - px) ** 2 + (by - py) ** 2, rr = (r + 5) ** 2;
        if (d2 < rr) d += (d2 < (r + 1) ** 2 ? 1e6 : 2e4) / t; else if (d2 < rr * 4) d += 300 / t;
      }
      for (const e of world.enemies) {
        if (e.ground || e.surface || e.dead || e.dying || e.crash) continue;
        const ex = e.x + (e.vx || 0) * t, ey = e.y + (e.vy || 0) * t;
        if (Math.abs(ex - px) < e.hw * 0.75 + 6 && Math.abs(ey - py) < e.hh * 0.75 + 6) d += 5e5 / t;
      }
    }
    const px = p.x + vx * 4, py = p.y + vy * 4;
    d += Math.abs(px - tgt) * 3 + Math.abs(py - ty) * 2 + (px < 16 || px > W - 16 ? 400 : 0);
    if (d < bs) { bs = d; best = [dx, dy]; }
  }
  if (bs > 4e5 && run.bombs > 0 && mode === 'real') bomb();
  if (best[0] < 0) keys.arrowleft = true; if (best[0] > 0) keys.arrowright = true;
  if (best[1] < 0) keys.arrowup = true; if (best[1] > 0) keys.arrowdown = true;
}

const hum = { on: false, lag: 0, react: 15, force: null };
const bossUp = () => world.enemies.some(e => e.type === 'boss');
window.SF = {
  R,
  bot, // one step of the dodging bot (sets the arrow keys); used by tests/perf.js to play on the game's own frame loop
  setMode(m) { mode = m; },
  // Start a run at a stage on a difficulty (0 Easy, 1 Normal, 2 Hard). Pauses the game's own loop.
  // With endlessSlot (0-5): an Endless run starting in that stage slot, as startEndless() does (which picks the slot at random).
  start(diff, n = 1, endlessSlot) {
    acc = -1e15; settings.diff = diff; R.stages = {}; R.hits = []; R.errs = []; lastStage = -1;
    if (endlessSlot === undefined) { startAt(n); return; }
    run.endless = true; startAt(endlessSlot + 1, true);
    if (endlessSlot > 0) { run.stage = 1; run.loop = rankFor(1); }
  },
  run(frames) {
    const lv0 = run.sortie ? run.sortie.level : 0; // Enigma Run flies on into the next level: a run stops there, returning 'next:<level>'
    for (let i = 0; i < frames; i++) {
      if (app.state !== 'play') return 'state:' + app.state;
      if (lv0 && run.sortie && run.sortie.level !== lv0) return 'next:' + run.sortie.level;
      if (run.stage !== lastStage) { lastStage = run.stage; newStage(); }
      if (app.cont > 0) return 'continue-screen';
      if ((app.results || app.congrats) && gf % 30 === 0) skipResults();
      bot();
      const a = performance.now();
      try { update(); } catch (e) { R.errs.push(String(e && e.stack || e).slice(0, 300)); }
      cur.updMax = Math.max(cur.updMax, performance.now() - a);
      cur.maxB = Math.max(cur.maxB, world.ebul.length); cur.sumB += world.ebul.length; cur.n++;
      const boss = world.enemies.find(e => e.type === 'boss');
      if (boss && cur.bossIn === null) cur.bossIn = Math.round((gf - stageStart) / 60);
      if (boss && boss.dying && cur.bossDead === null) cur.bossDead = Math.round((gf - stageStart) / 60);
      if (player) cur.wpn = player.wpn + player.lvl;
      cur.lives = run.lives; cur.score = run.score;
    }
    return 'ok';
  },
  draw() { resetCtx(); render(); },
  peek: c => eval(c),

  // Seconds to kill a stage's boss with one weapon at level 4 (S Scatter, L Lance, H Seekers, A Arc). Capped at maxSec.
  bossTime(diff, st, w, maxSec = 900) {
    const force = () => { player.wpn = w; player.lvl = 4; player.drones = 0; };
    SF.setMode('immortal'); SF.start(diff, st);
    for (let n = 0; n < 400 && !bossUp(); n++) { force(); SF.run(300); }
    const t0 = gf;
    for (let n = 0; n < maxSec / 5; n++) { force(); if (SF.run(300) !== 'ok' || cur.bossDead !== null) break; }
    world.parts.length = 0; world.decals.length = 0;
    return Math.round((gf - t0) / 60);
  },
  // Boss damage per second with the ship held 70px below the boss core: a fair weapon-vs-weapon comparison.
  // laser: true also fires the charged super laser whenever it is ready and would not overheat (a careful player).
  bossDps(diff, st, w, secs = 20, laser = false) {
    const force = () => { player.wpn = w; player.lvl = 4; player.drones = 0; };
    SF.setMode('immortal'); SF.start(diff, st);
    for (let n = 0; n < 400 && !bossUp(); n++) { force(); SF.run(300); }
    SF.run(300);
    const dp = damagePart; let dealt = 0;
    damagePart = function (e, p, d) { if (!p.dead && !e.dying) dealt += d; return dp(e, p, d); };
    try {
      for (let i = 0; i < secs * 60; i++) {
        force(); player.inv = 9;
        const b = world.enemies.find(e => e.type === 'boss'); if (!b || b.dying) break;
        const t = b.parts.filter(p => !p.dead && !p.off).sort((a, c) => (c.k === 'core') - (a.k === 'core'))[0]; if (!t) break;
        player.x = clamp(b.x + t.ox, 8, W - 8); player.y = clamp(b.y + t.oy + 70, 18, H - 14); player.lx = player.x;
        if (laser && player.charge >= 100 && !beam && overheatT === 0 && laserHeat + DIFF.heat[settings.diff] < 100) { player.charge = 0; fireBeam(1); }
        SF.run(1);
      }
    } finally { damagePart = dp; }
    world.parts.length = 0; world.decals.length = 0;
    return Math.round(dealt / secs * 10) / 10;
  },
  // ---- the "human" bot, the real Campaign and tuning without code edits (tests/balance-real.mjs, tests/balance-checks.mjs) ----
  // The plain bot dodges better than people, so hit counts mean little (Rookie: zero). human() makes it fallible: movement decisions are held for
  // `lag` frames (about 0.13 s at 8), and the Black Fortress laser is dodged only `react` frames after its angle could be seen (the game draws a
  // warning line once the aim is locked; before the fire laser's aim was locked, that was the first frame of the beam). Hit counts are then an
  // index to compare versions with, not a prediction of how many hits a person takes. force: 'S4' keeps one weapon and level.
  human(lag = 8, react = 15, force = null) {
    hum.lag = lag; hum.react = react; hum.force = force; R.lasers = 0;
    if (hum.on) return; hum.on = true;
    const u0 = update, seen = new Set();
    let held = { l: false, r: false, u: false, d: false };
    update = function () {
      if (hum.force && player) { player.wpn = hum.force[0]; player.lvl = +hum.force[1]; player.drones = 0; }
      if (hum.lag > 1) {
        if (gf % hum.lag === 0) held = { l: !!keys.arrowleft, r: !!keys.arrowright, u: !!keys.arrowup, d: !!keys.arrowdown };
        else { keys.arrowleft = held.l; keys.arrowright = held.r; keys.arrowup = held.u; keys.arrowdown = held.d; }
      }
      const b = world.enemies.find(e => e.type === 'boss' && !e.dying && e.kind === 'skyfort');
      if (b && b.fl && player && !player.dead) {
        const F = b.fl, core = b.parts.find(p => p.k === 'core'), cx = b.x + core.ox, cy = b.y + core.oy;
        if (F.ph === 'fire' && !seen.has(F)) { seen.add(F); R.lasers++; }
        const visible = F.ph === 'fire' || (F.ph === 'charge' && F.a !== undefined && F.t >= 60); // (the warning line is drawn from charge frame 60)
        if (visible && F.seenAt === undefined) F.seenAt = gf;
        if (visible && gf - F.seenAt >= hum.react) {
          const c = Math.cos(F.a), s = Math.sin(F.a), dx = player.x - cx, dy = player.y - cy, along = dx * c + dy * s, lat = -dx * s + dy * c;
          if (along > -10 && Math.abs(lat) < 26) { // in the beam's path: step sideways, away from its axis, towards the side with more room
            let dir = lat === 0 ? (player.x < W / 2 ? 1 : -1) : -Math.sign(lat) * Math.sign(s);
            if ((dir < 0 && player.x < 14) || (dir > 0 && player.x > W - 14)) dir = -dir;
            keys.arrowleft = dir < 0; keys.arrowright = dir > 0;
          }
        }
      }
      return u0();
    };
  },
  // Change DIFF without editing the page: { bs: [0.88, 1, 1.12] } replaces a whole row, { fs: { 0: 1.5 } } sets single entries.
  overrides(o) { for (const [k, v] of Object.entries(o || {})) { if (Array.isArray(v)) DIFF[k] = v; else for (const [i, x] of Object.entries(v)) DIFF[k][+i] = x; } },
  // Count enemy shots by the nearest enemy (bosses together) per stage; the result is in SF.R.attr as { 'stage:type': shots }. Call before flying.
  attrib() {
    R.attr = {}; const e0 = eshot;
    eshot = function (x, y, a, sp, kind) {
      let best = null, bd = 2500;
      for (const e of world.enemies) { if (e.dead) continue; const d = (e.x - x) ** 2 + (e.y - y) ** 2; if (d < bd) { bd = d; best = e; } }
      const k = run.stage + ':' + (world.enemies.some(e => e.type === 'boss') ? 'boss fight' : best ? best.type : '?');
      R.attr[k] = (R.attr[k] || 0) + 1;
      return e0(x, y, a, sp, kind);
    };
  },
  // Fly the real Campaign (what START plays: Enigma levels 1A, 2, 3, 4, 5, 6B) and return the numbers that matter:
  //   hits (bullets, rams), laser (Black Fortress beam hits), top (the worst 10 s window of enemy bullets on screen before each boss, averaged over the
  //   stages), pre (average bullets before the bosses), bossB (average during boss fights), boss (seconds each boss lasted), per-stage hits.
  flyCampaign(diff, o = {}) {
    const { lag = 8, react = 15, force = null, overrides = null, code = null } = o;
    SF.setMode('immortal'); SF.start(diff, 1); if (overrides) SF.overrides(overrides); if (code) SF.peek(code); // (code: anything to run in the game's scope first, e.g. a changed rankFor)
    startEnigma(8, true); SF.human(lag, react, force);
    const rows = [];
    for (let n = 0; n < 6000; n++) {
      const r = SF.run(60);
      if (r !== 'ok' && !String(r).startsWith('next:')) break;
      if (run.stage > 6) break;
      if (n % 6 === 0) world.parts.length = Math.min(world.parts.length, 300);
      rows.push({ s: run.stage, b: world.ebul.length, boss: world.enemies.some(e => e.type === 'boss') });
    }
    const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0, top = [], pre = [], bossB = [], boss = [], hitsBy = [0, 0, 0, 0, 0, 0, 0], topBy = [], preBy = [], shotsBy = [];
    for (let s = 1; s <= 6; s++) {
      const rs = rows.filter(x => x.s === s && !x.boss), bins = {};
      rs.forEach((x, i) => (bins[Math.floor(i / 10)] ||= []).push(x.b));
      if (rs.length) top.push(Math.max(...Object.values(bins).map(avg)));
      topBy.push(rs.length ? +Math.max(...Object.values(bins).map(avg)).toFixed(1) : 0); preBy.push(+avg(rs.map(x => x.b)).toFixed(1));
      if (R.attr) { let n = 0; for (const [k, v] of Object.entries(R.attr)) if (k.startsWith(s + ':') && k !== s + ':boss fight') n += v; shotsBy.push(+(n / Math.max(1, rs.length)).toFixed(2)); } // (enemy shots per second before the boss, when SF.attrib() was called)
      pre.push(...rs.map(x => x.b)); bossB.push(...rows.filter(x => x.s === s && x.boss).map(x => x.b));
      const st = R.stages[s]; boss.push(st && st.bossIn !== null && st.bossDead !== null ? st.bossDead - st.bossIn : null);
    }
    for (const h of R.hits) if (h.why !== 'flame') hitsBy[h.stage]++;
    const flame = R.hits.filter(h => h.why === 'flame').length;
    return { hits: hitsBy.reduce((a, b) => a + b, 0), laser: flame, lasers: R.lasers, top: +avg(top).toFixed(1), pre: +avg(pre).toFixed(1), bossB: +avg(bossB).toFixed(1), boss, hitsBy: hitsBy.slice(1), topBy, preBy, shotsBy, killed: boss.filter(v => v !== null).length, attr: R.attr || null, errs: R.errs.length };
  },
  // The Black Fortress alone (Campaign level 6, 6B): how many of its laser beams hit a ship that reacts after `react` frames (60 = 1 s).
  laserTest(diff, react = 15, force = 'S4') {
    SF.setMode('immortal'); SF.start(diff, 1); startEnigma(7, true); SF.human(0, react, force);
    let t0 = null, fight = null;
    for (let n = 0; n < 600; n++) {
      if (SF.run(60) !== 'ok') break;
      if (n % 6 === 0) world.parts.length = Math.min(world.parts.length, 300);
      const b = world.enemies.find(e => e.type === 'boss' && !e.dying && e.kind === 'skyfort');
      if (b && b.phase === 'fight' && t0 === null) t0 = gf;
      if (t0 !== null && !world.enemies.some(e => e.type === 'boss')) { fight = Math.round((gf - t0) / 60); break; }
    }
    return { lasers: R.lasers, hit: R.hits.filter(h => h.why === 'flame').length, fight };
  },
  // Play stages 1-6 on one difficulty and return one summary row per stage.
  campaign(diff) {
    SF.setMode('immortal'); SF.start(diff, 1);
    for (let n = 0; n < 200; n++) { if (SF.run(2000) !== 'ok' || run.stage > 6) break; if (n % 5 === 0) { world.parts.length = Math.min(world.parts.length, 300); } }
    return Object.values(R.stages).filter(s => s.stage <= 6).map(s => ({ stage: s.stage, clear: s.clearT, boss: s.bossDead !== null && s.bossIn !== null ? s.bossDead - s.bossIn : null, hits: s.hits, avgBullets: +(s.sumB / Math.max(1, s.n)).toFixed(1), maxBullets: s.maxB, weapon: s.wpn, lives: s.lives, score: s.score }));
  },
};
})();
