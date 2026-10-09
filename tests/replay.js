// Replay check: plays fixed scenarios with the bot and a fixed run seed, and returns a fingerprint of each run.
// Same code + same seed must give the same fingerprint. Compare against tests/golden.json (see tests/replay.mjs).
// Load after harness.js, on a local build:  __sf(await (await fetch('tests/replay.js')).text()); SF.replayAll()
(() => {
// mode 'immortal': hits are counted but the ship survives, so the run reaches deep into the game.
// mode 'real': the bot can die, so lives, continues and bombs take part.
// Optional: endless (start an Endless run in this stage slot, 0-5, which startEndless() picks at random), p2 ('mouse': a two-player run), resumeAt (save the run for a page reload after
// that many frames, then resume it the way the game does and play on).
const SCENARIOS = [
  { name: 'normal-stage1-immortal', diff: 1, stage: 1, seed: 1944, mode: 'immortal', frames: 30000 },
  { name: 'hard-stage3-real', diff: 2, stage: 3, seed: 7, mode: 'real', frames: 30000 },
  { name: 'easy-stage5-real', diff: 0, stage: 5, seed: 42, mode: 'real', frames: 30000 },
  { name: 'normal-stage4-immortal', diff: 1, stage: 4, seed: 4, mode: 'immortal', frames: 16800 }, // Ravenhold, the castle boss, and its prototype
  { name: 'normal-stage6-immortal', diff: 1, stage: 6, seed: 6, mode: 'immortal', frames: 24000 }, // the prototype duel and the Black Fortress
  { name: 'hard-endless-real', diff: 2, endless: 2, seed: 11, mode: 'real', frames: 30000 },
  { name: 'normal-2p-stage2-immortal', diff: 1, stage: 2, p2: 'mouse', seed: 22, mode: 'immortal', frames: 20000 },
  { name: 'normal-resume-stage2-immortal', diff: 1, stage: 2, resumeAt: 6000, seed: 33, mode: 'immortal', frames: 20000 },
];

// Checksum of the simulation state: the run's numbers, the seeded random stream, the ships, every enemy (and boss part) and bullet.
// Taken every TRACE frames, so a difference shows when a run first went another way, not only that its end result changed.
// Reads only simulation state (no particles or other effects), so it holds while the code is restructured.
const TRACE = 500;
const checksum = () => {
  let h = 2166136261;
  const add = (...v) => { const s = v.join(',') + ';'; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } };
  const r = v => typeof v === 'number' ? Math.round(v * 1000) : v;
  add(gf, score, lives, bombs, stage, loop, simS, r(scroll), shots.length, items.length);
  for (const p of [player, p2]) if (p) add(r(p.x), r(p.y), p.wpn, p.lvl, p.inv, p.dead);
  for (const e of enemies) { add(e.type, r(e.x), r(e.y), r(e.hp), e.dead ? 1 : 0); if (e.parts) for (const q of e.parts) add(r(q.hp), q.dead ? 1 : 0); }
  for (const b of ebul) add(r(b.x), r(b.y));
  return (h >>> 0).toString(16).padStart(8, '0');
};

// With window.__drawEvery set, the replay also draws a frame that often (the CLI test's 'drawing on' check: drawing must never
// change a run, and must not throw). Comparing the pictures themselves doesn't work: terrain painting runs on a time budget.
SF.replay = sc => {
  const p2Was = settings.p2, drawEvery = window.__drawEvery || 0, drawErrs = [];
  try {
    if (booting) finishBoot(); // the boot splash would otherwise eat the first 300 frames of the run
    window.__forceSeed = sc.seed; // the game's own seeded stream (see 'random streams' in index.html); page-level Math.random no longer matters
    gf = 0; // the frame counter keeps running while the title screen idles; start every scenario from zero
    if (sc.p2) settings.p2 = sc.p2;
    SF.setMode(sc.mode); SF.start(sc.diff, sc.stage, sc.endless);
    const trace = [];
    let status = 'ok';
    // play in steps (the same frames as one long run); the step is small enough for the drawing check
    const step = drawEvery || TRACE;
    for (let f = 0; f < sc.frames && status === 'ok'; ) {
      const n = Math.min(step, sc.frames - f, sc.resumeAt > f ? sc.resumeAt - f : Infinity);
      status = SF.run(n); f += n;
      if (f === sc.resumeAt && status === 'ok') { saveResume(); resumeRun(store.getJSON(KEY.resume)); }
      if (drawEvery) { try { SF.draw(); } catch (e) { drawErrs.push(String(e && e.stack || e).slice(0, 300)); } }
      if (f % TRACE === 0 || status !== 'ok') trace.push(checksum());
    }
    const out = { H, status, score, stage, lives, bombs, frames: gf, kills: stats.kills, medals: stats.medals, hits: SF.R.hits.length, enemies: enemies.length, bullets: ebul.length, errors: SF.R.errs.length, trace: trace.join(' ') };
    if (drawEvery) out.drawErrors = drawErrs;
    return out;
  } finally { delete window.__forceSeed; settings.p2 = p2Was; clearResume(); }
};
SF.replayAll = () => Object.fromEntries(SCENARIOS.map(sc => [sc.name, SF.replay(sc)]));
SF.SCENARIOS = SCENARIOS;

// Diagnostics for chasing differences between machines: environment facts plus a short frame-by-frame trace.
SF.diag = (sc = SCENARIOS[0], frames = 1500, every = 25) => {
  const m = Math;
  const env = { ua: navigator.userAgent, dpr: devicePixelRatio, inner: [innerWidth, innerHeight], H, coarse: matchMedia('(pointer:coarse)').matches,
    math: [m.sin(1.1), m.cos(2.3), m.tan(0.7), m.atan2(0.3, -1.7), m.pow(1.0001, 12345.6), m.exp(1.7), m.log(7.3), m.hypot(3.3, 4.4), m.cbrt(9.1), m.asin(0.37), m.sinh(0.8), m.sin(1234.5678), m.cos(98765.4321)] };
  const trace = [];
  try {
    if (booting) finishBoot();
    window.__forceSeed = sc.seed; gf = 0;
    SF.setMode(sc.mode); SF.start(sc.diff, sc.stage);
    for (let f = 0; f < frames; f += every) {
      SF.run(every);
      trace.push([gf, score, enemies.length, ebul.length, shots.length, +player.x.toFixed(4), +player.y.toFixed(4), +enemies.reduce((a, e) => a + e.x * 1.1 + e.y, 0).toFixed(3), +scroll.toFixed(3)].join('|'));
    }
  } finally { delete window.__forceSeed; }
  return { env, trace };
};

// Terrain fingerprint: what is under every spot of every campaign stage (water, road, sand, ...), hashed.
// The campaign world comes from fixed-seed hash noise, so this must never change by accident. Not by timing, not by a refactor.
SF.terrainPrints = () => {
  const out = {};
  for (let n = 1; n <= 6; n++) {
    SF.start(1, n);
    let h = 2166136261, cells = 0;
    for (let p = stageBaseP - 2; p <= stageBaseP + 70; p++) for (let ly = 0; ly < CH; ly += 8) for (let wx = 0; wx < W; wx += 8) {
      const t = terrainType(wx, -p * CH + ly);
      for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
      cells++;
    }
    out['stage' + n] = { hash: (h >>> 0).toString(16), cells };
  }
  return out;
};
})();
