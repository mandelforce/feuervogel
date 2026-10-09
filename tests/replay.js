// Replay check: plays fixed scenarios with the bot and a seeded Math.random, and returns a fingerprint of each run.
// Same code + same seed must give the same fingerprint. Compare against tests/golden.json (see tests/replay.mjs).
// Load after harness.js, on a local build:  __sf(await (await fetch('tests/replay.js')).text()); SF.replayAll()
(() => {
// small, fast, well-known seeded generator (mulberry32)
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// mode 'immortal': hits are counted but the ship survives, so the run reaches deep into the game.
// mode 'real': the bot can die, so lives, continues and bombs take part.
const SCENARIOS = [
  { name: 'normal-stage1-immortal', diff: 1, stage: 1, seed: 1944, mode: 'immortal', frames: 30000 },
  { name: 'hard-stage3-real', diff: 2, stage: 3, seed: 7, mode: 'real', frames: 30000 },
  { name: 'easy-stage5-real', diff: 0, stage: 5, seed: 42, mode: 'real', frames: 30000 },
];

SF.replay = sc => {
  const realRandom = Math.random;
  try {
    Math.random = mulberry32(sc.seed);
    gf = 0; // the frame counter keeps running while the title screen idles; start every scenario from zero
    SF.setMode(sc.mode); SF.start(sc.diff, sc.stage);
    const status = SF.run(sc.frames);
    return { H, status, score, stage, lives, bombs, frames: gf, kills: stats.kills, medals: stats.medals, hits: SF.R.hits.length, enemies: enemies.length, bullets: ebul.length, errors: SF.R.errs.length };
  } finally { Math.random = realRandom; }
};
SF.replayAll = () => Object.fromEntries(SCENARIOS.map(sc => [sc.name, SF.replay(sc)]));
SF.SCENARIOS = SCENARIOS;

// Diagnostics for chasing differences between machines: environment facts plus a short frame-by-frame trace.
SF.diag = (sc = SCENARIOS[0], frames = 1500, every = 25) => {
  const m = Math;
  const env = { ua: navigator.userAgent, dpr: devicePixelRatio, inner: [innerWidth, innerHeight], H, coarse: matchMedia('(pointer:coarse)').matches,
    math: [m.sin(1.1), m.cos(2.3), m.tan(0.7), m.atan2(0.3, -1.7), m.pow(1.0001, 12345.6), m.exp(1.7), m.log(7.3), m.hypot(3.3, 4.4), m.cbrt(9.1), m.asin(0.37), m.sinh(0.8), m.sin(1234.5678), m.cos(98765.4321)] };
  const realRandom = Math.random, trace = [];
  try {
    Math.random = mulberry32(sc.seed); gf = 0;
    SF.setMode(sc.mode); SF.start(sc.diff, sc.stage);
    for (let f = 0; f < frames; f += every) {
      SF.run(every);
      trace.push([gf, score, enemies.length, ebul.length, shots.length, +player.x.toFixed(4), +player.y.toFixed(4), +enemies.reduce((a, e) => a + e.x * 1.1 + e.y, 0).toFixed(3), +scroll.toFixed(3)].join('|'));
    }
  } finally { Math.random = realRandom; }
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
