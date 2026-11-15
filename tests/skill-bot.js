// Skill bots: the harness's dodging bot with human limits as plain numbers (docs/skill-bots-brief.md, step 1).
// Load after tests/harness.js, the same way:  __sf(harnessSrc); __sf(skillSrc); then SF.skill(SF.SKILL.veteran).
// SF.skill(profile) replaces the harness bot's keys each frame with its own decision (the harness bot still runs first; its keys are
// overwritten and its Nova calls are swallowed), and uses SF.human(hold, 15) underneath for the held decisions and the Black Fortress laser dodge.
// Every knob at its neutral value (SF.SKILL.neutral) gives exactly the plain bot under SF.human(0, 15): tests/skill-bots.mjs checks that.
(() => {
if (!window.SF) throw new Error('skill-bot.js: load tests/harness.js first');
const SF = window.SF, TS = [1, 3, 5, 8, 12, 16];

// Profiles. Units: frames (60 per second), bullets, pixels. Honest first guesses, not fitted to anyone (fitting needs real play data).
SF.SKILL = {
  // the plain harness bot: no delay, no hold, full lookahead, sees every bullet, no error, Nova as the harness uses it, any pickup
  neutral: { see: 0, hold: 0, ahead: 16, track: Infinity, err: 0, nova: 'panic', greed: Infinity, seed: 1 },
  // someone new: about 0.23 s to react, coarse corrections, only the nearest few bullets in mind, keeps the Novas, chases every pickup
  rookie: { see: 14, hold: 10, ahead: 8, track: 4, err: 1, nova: 'never', greed: 400, seed: 1 },
  // a regular: about 0.17 s, steadier hands, reads more of the screen, bombs only when cornered
  veteran: { see: 10, hold: 8, ahead: 12, track: 8, err: 0.5, nova: 'panic', greed: 160, seed: 1 },
  // a strong player: about 0.1 s, fine corrections, sees nearly everything and as far ahead as the plain bot, bombs before it is too late
  ace: { see: 6, hold: 5, ahead: 16, track: 16, err: 0.2, nova: 'well', greed: 100, seed: 1 },
};

const sk = { on: false, p: null, ring: [], rnd: null, aimOff: 0, novas: 0 };
let mode = 'immortal';
const setMode0 = SF.setMode, start0 = SF.start;
SF.setMode = function (m) { mode = m; return setMode0(m); };
SF.start = function () { reset(); return start0.apply(this, arguments); };

// the bot's own random stream (mulberry32), never Math.random nor the game's streams
function mulberry(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gauss() { const u = Math.max(1e-9, sk.rnd()), v = sk.rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function reset() { sk.ring.length = 0; sk.rnd = mulberry(((sk.p && sk.p.seed) || 1) * 2654435761); sk.aimOff = 0; sk.novas = 0; }

// what the bot sees this frame: the world `see` frames ago (positions copied each frame into a ring), moved on by what it knew then, then only the nearest `track` bullets
function snap() {
  return {
    ebul: world.ebul.map(b => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, kind: b.kind, r: b.r, life: b.life, tx: b.tx, ty: b.ty })),
    enemies: world.enemies.map(e => ({ x: e.x, y: e.y, vx: e.vx, vy: e.vy, hw: e.hw, hh: e.hh, ground: e.ground, surface: e.surface, dead: e.dead, dying: e.dying, crash: e.crash, type: e.type,
      parts: e.parts ? e.parts.map(q => ({ ox: q.ox, dead: q.dead, off: q.off, k: q.k })) : e.parts })),
  };
}
function view() {
  const P = sk.p, p = player;
  let v;
  if (P.see > 0) {
    sk.ring.push(snap()); while (sk.ring.length > P.see + 1) sk.ring.shift();
    /* what it saw `age` frames ago, carried forward along the velocities it saw then: straight shots are where it expects them, but a shot fired
       within the last `see` frames is not there at all, and a turn, a new aim or a burst is noticed `see` frames late */
    const o = sk.ring[0], age = sk.ring.length - 1;
    v = { ebul: o.ebul.map(b => b.kind === 'mortar' ? Object.assign({}, b, { life: b.life - age }) : Object.assign({}, b, { x: b.x + (b.vx || 0) * age, y: b.y + (b.vy || 0) * age })),
      enemies: o.enemies.map(e => Object.assign({}, e, { x: e.x + (e.vx || 0) * age, y: e.y + (e.vy || 0) * age })) };
  }
  else v = { ebul: world.ebul, enemies: world.enemies };
  if (v.ebul.length > P.track) {
    const d = b => { const x = b.kind === 'mortar' ? b.tx : b.x, y = b.kind === 'mortar' ? b.ty : b.y; return (x - p.x) ** 2 + (y - p.y) ** 2; };
    v = { ebul: v.ebul.slice().sort((a, b) => d(a) - d(b)).slice(0, P.track), enemies: v.enemies };
  }
  return v;
}

// one decision: the harness bot's search with the knobs applied (kept line for line with harness.js so the neutral profile matches it exactly)
function decide() {
  for (const k of ['arrowleft', 'arrowright', 'arrowup', 'arrowdown']) keys[k] = false;
  const P = sk.p, p = player;
  if (!p || p.dead || p.fly > 0 || p.exitT > 0 || app.results || app.congrats) { if (P.see > 0) { sk.ring.push(snap()); while (sk.ring.length > P.see + 1) sk.ring.shift(); } return; }
  const V = view(), ebul = V.ebul, enemies = V.enemies;
  let tgt = W / 2, ty = H * 0.72, bestY = -1e9;
  for (const e of enemies) if (!e.dying && !e.dead && e.y > 10 && e.y < p.y - 20 && (e.type === 'boss' || e.y > bestY)) {
    bestY = e.type === 'boss' ? 1e9 : e.y; tgt = e.x;
    if (e.type === 'boss' && e.parts) { let bd = 1e9; for (const q of e.parts) if (!q.dead && !q.off) { const qx = e.x + (q.ox || 0), d = Math.abs(qx - p.x) + (q.k === 'core' ? 30 : 0); if (d < bd) { bd = d; tgt = qx; } } }
  }
  if (!enemies.some(e => e.type === 'boss')) for (const it of world.items) if (it.y > 30 && it.y < H - 10 && (P.greed === Infinity || Math.hypot(it.x - p.x, it.y - p.y) <= P.greed)) { tgt = it.x; ty = clamp(it.y + 10, H * 0.45, H - 20); break; }
  // err: aim off by a drifting amount and now and then a wrong stick direction, both growing with the bullets in view
  let slip = 0;
  if (P.err > 0) {
    const e = P.err * (1 + ebul.length / 10);
    if (gf % 30 === 0) sk.aimOff = gauss() * 24 * e;
    tgt += sk.aimOff;
    if (sk.rnd() < Math.min(0.5, 0.06 * e)) slip = 1 + Math.floor(sk.rnd() * 9);
  }
  const ts = P.ahead >= 16 ? TS : TS.filter(t => t <= P.ahead); if (!ts.length) ts.push(1);
  let best = [0, 0], bs = 1e18;
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const m = dx && dy ? 0.7071 : 1, vx = dx * m * 2.6, vy = dy * m * 2.6; let d = 0;
    for (const t of ts) {
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
  if (slip) best = [(slip - 1) % 3 - 1, Math.floor((slip - 1) / 3) - 1];
  // nova: 'panic' is the harness rule (the best move still meets a bullet within about 2 frames or a body at once), 'well' fires at a likely hit within about 10 frames
  if (mode === 'real' && run.bombs > 0 && ((P.nova === 'panic' && bs > 4e5) || (P.nova === 'well' && bs > 1e5))) { const n0 = run.bombs; bomb0(); if (run.bombs < n0) sk.novas++; }
  if (best[0] < 0) keys.arrowleft = true; if (best[0] > 0) keys.arrowright = true;
  if (best[1] < 0) keys.arrowup = true; if (best[1] > 0) keys.arrowdown = true;
}

let bomb0 = null;
SF.skill = function (profile) {
  sk.p = Object.assign({}, SF.SKILL.neutral, profile || {});
  SF.human(sk.p.hold, 15);
  reset();
  if (sk.on) return sk.p;
  sk.on = true;
  bomb0 = bomb;
  bomb = function (q) { if (!q) return; return bomb0(q); }; /* (player 1's Novas come only from decide(): the harness bot's own bomb() call is swallowed; nothing else calls it during a test flight) */
  const u1 = update;
  update = function () { decide(); return u1(); };
  return sk.p;
};
SF.skillNovas = () => sk.novas;
})();
