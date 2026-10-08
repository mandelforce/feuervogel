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
  for (const b of ebul) { const d = (b.x - p.x) ** 2 + (b.y - p.y) ** 2; if (d < near) { near = d; cause = 'bullet:' + b.kind; } }
  for (const e of enemies) if (!e.ground && !e.surface && Math.abs(e.x - p.x) < e.hw && Math.abs(e.y - p.y) < e.hh) { cause = 'body:' + e.type; break; }
  R.hits.push({ stage, t: Math.round((gf - stageStart) / 60), cause, boss: enemies.some(e => e.type === 'boss' && !e.dying), bullets: ebul.length });
  if (cur) cur.hits++;
  if (mode === 'immortal') { p.inv = 90; ebul.length = 0; return; }
  realDie(why);
};
openResults = function () {
  if (cur) Object.assign(cur, { kills: stats.kills, seen: stats.seen, medals: stats.medals, secret: !!stats.artifact, clearT: Math.round((gf - stageStart) / 60) });
  realOpen();
};
function newStage() { stageStart = gf; cur = R.stages[stage] = { stage, theme: curTheme, hits: 0, maxB: 0, sumB: 0, n: 0, bossIn: null, bossDead: null, wpn: '', updMax: 0 }; }

// The bot looks ahead up to 16 frames for each of the 9 stick directions and picks the safest one,
// drifting toward the enemy (or boss part) it wants to shoot and toward pickups.
function bot() {
  for (const k of ['arrowleft', 'arrowright', 'arrowup', 'arrowdown']) keys[k] = false;
  const p = player; if (!p || p.dead || p.fly > 0 || p.exitT > 0 || results || congrats) return;
  let tgt = W / 2, ty = H * 0.72, bestY = -1e9;
  for (const e of enemies) if (!e.dying && !e.dead && e.y > 10 && e.y < p.y - 20 && (e.type === 'boss' || e.y > bestY)) {
    bestY = e.type === 'boss' ? 1e9 : e.y; tgt = e.x;
    if (e.type === 'boss' && e.parts) { let bd = 1e9; for (const q of e.parts) if (!q.dead && !q.off) { const qx = e.x + (q.ox || 0), d = Math.abs(qx - p.x) + (q.k === 'core' ? 30 : 0); if (d < bd) { bd = d; tgt = qx; } } }
  }
  // chase pickups, except during a boss fight, where a player keeps under the boss
  if (!enemies.some(e => e.type === 'boss')) for (const it of items) if (it.y > 30 && it.y < H - 10) { tgt = it.x; ty = clamp(it.y + 10, H * 0.45, H - 20); break; }
  let best = [0, 0], bs = 1e18;
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const m = dx && dy ? 0.7071 : 1, vx = dx * m * 2.6, vy = dy * m * 2.6; let d = 0;
    for (const t of [1, 3, 5, 8, 12, 16]) {
      const px = clamp(p.x + vx * Math.min(t, 8), 8, W - 8), py = clamp(p.y + vy * Math.min(t, 8), 18, H - 14);
      for (const b of ebul) {
        let bx, by, r;
        if (b.kind === 'mortar') { if (b.life > 20) continue; bx = b.tx; by = b.ty; r = 10; }
        else { bx = b.x + b.vx * t; by = b.y + b.vy * t; r = (b.kind === 'mega' ? 5 : b.r) + 1.6; }
        const d2 = (bx - px) ** 2 + (by - py) ** 2, rr = (r + 5) ** 2;
        if (d2 < rr) d += (d2 < (r + 1) ** 2 ? 1e6 : 2e4) / t; else if (d2 < rr * 4) d += 300 / t;
      }
      for (const e of enemies) {
        if (e.ground || e.surface || e.dead || e.dying || e.crash) continue;
        const ex = e.x + (e.vx || 0) * t, ey = e.y + (e.vy || 0) * t;
        if (Math.abs(ex - px) < e.hw * 0.75 + 6 && Math.abs(ey - py) < e.hh * 0.75 + 6) d += 5e5 / t;
      }
    }
    const px = p.x + vx * 4, py = p.y + vy * 4;
    d += Math.abs(px - tgt) * 3 + Math.abs(py - ty) * 2 + (px < 16 || px > W - 16 ? 400 : 0);
    if (d < bs) { bs = d; best = [dx, dy]; }
  }
  if (bs > 4e5 && bombs > 0 && mode === 'real') bomb();
  if (best[0] < 0) keys.arrowleft = true; if (best[0] > 0) keys.arrowright = true;
  if (best[1] < 0) keys.arrowup = true; if (best[1] > 0) keys.arrowdown = true;
}

const bossUp = () => enemies.some(e => e.type === 'boss');
window.SF = {
  R,
  setMode(m) { mode = m; },
  // Start a run at a stage on a difficulty (0 Easy, 1 Normal, 2 Hard). Pauses the game's own loop.
  start(diff, n = 1) { acc = -1e15; settings.diff = diff; R.stages = {}; R.hits = []; R.errs = []; lastStage = -1; startAt(n); },
  run(frames) {
    for (let i = 0; i < frames; i++) {
      if (state !== 'play') return 'state:' + state;
      if (stage !== lastStage) { lastStage = stage; newStage(); }
      if (cont > 0) return 'continue-screen';
      if ((results || congrats) && gf % 30 === 0) skipResults();
      bot();
      const a = performance.now();
      try { update(); } catch (e) { R.errs.push(String(e && e.stack || e).slice(0, 300)); }
      cur.updMax = Math.max(cur.updMax, performance.now() - a);
      cur.maxB = Math.max(cur.maxB, ebul.length); cur.sumB += ebul.length; cur.n++;
      const boss = enemies.find(e => e.type === 'boss');
      if (boss && cur.bossIn === null) cur.bossIn = Math.round((gf - stageStart) / 60);
      if (boss && boss.dying && cur.bossDead === null) cur.bossDead = Math.round((gf - stageStart) / 60);
      if (player) cur.wpn = player.wpn + player.lvl;
      cur.lives = lives; cur.score = score;
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
    parts.length = 0; decals.length = 0;
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
        const b = enemies.find(e => e.type === 'boss'); if (!b || b.dying) break;
        const t = b.parts.filter(p => !p.dead && !p.off).sort((a, c) => (c.k === 'core') - (a.k === 'core'))[0]; if (!t) break;
        player.x = clamp(b.x + t.ox, 8, W - 8); player.y = clamp(b.y + t.oy + 70, 18, H - 14); player.lx = player.x;
        if (laser && player.charge >= 100 && !beam && overheatT === 0 && laserHeat + 45 < 100) { player.charge = 0; fireBeam(1); }
        SF.run(1);
      }
    } finally { damagePart = dp; }
    parts.length = 0; decals.length = 0;
    return Math.round(dealt / secs * 10) / 10;
  },
  // Play stages 1-6 on one difficulty and return one summary row per stage.
  campaign(diff) {
    SF.setMode('immortal'); SF.start(diff, 1);
    for (let n = 0; n < 200; n++) { if (SF.run(2000) !== 'ok' || stage > 6) break; if (n % 5 === 0) { parts.length = Math.min(parts.length, 300); } }
    return Object.values(R.stages).filter(s => s.stage <= 6).map(s => ({ stage: s.stage, clear: s.clearT, boss: s.bossDead !== null && s.bossIn !== null ? s.bossDead - s.bossIn : null, hits: s.hits, avgBullets: +(s.sumB / Math.max(1, s.n)).toFixed(1), maxBullets: s.maxB, weapon: s.wpn, lives: s.lives, score: s.score }));
  },
};
})();
