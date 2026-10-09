// Performance measurements for tests/perf.mjs (also usable by hand). Local builds only (needs window.__sf).
//   __sf(await (await fetch('tests/harness.js')).text()); __sf(await (await fetch('tests/perf.js')).text());
//   SF.perfSteps({ frames: 3000 })   cost of each frame: update + draw, stepped without the browser's frame loop
//   await SF.perfLoop({ seconds: 15 })   the game's own frame loop with the bot playing: frame rate, hitches, lite mode
//   SF.perfMemory({ frames: 24000 }) heap growth over a long run, to find leaks
// Times are milliseconds on the machine they run on. The test runner slows the CPU down to stand in for older phones.
(() => {
const BUDGET = 1000 / 60;
const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
const stats = a => { const s = Float64Array.from(a).sort(); let sum = 0; for (const v of s) sum += v; return { avg: +(sum / s.length).toFixed(3), p50: +pct(s, 0.5).toFixed(3), p95: +pct(s, 0.95).toFixed(3), p99: +pct(s, 0.99).toFixed(3), max: +s[s.length - 1].toFixed(2) }; };
const begin = (diff, st) => {
  window.__forceSeed = 1944;
  SF.setMode('immortal'); SF.start(diff, st);
  if (typeof booting !== 'undefined' && booting) finishBoot();
};

// Cost of each frame (update + draw). The game's own loop is stopped, so nothing else competes.
SF.perfSteps = ({ diff = 1, stage: st = 1, frames = 3000, warmup = 300 } = {}) => {
  begin(diff, st);
  const upd = [], drw = [], tot = [];
  for (let i = 0; i < frames + warmup; i++) {
    const a = performance.now(); SF.run(1); const b = performance.now(); SF.draw(); const c = performance.now();
    if (i >= warmup) { upd.push(b - a); drw.push(c - b); tot.push(c - a); }
  }
  delete window.__forceSeed;
  const over = th => +(100 * tot.filter(t => t > th).length / tot.length).toFixed(2);
  return { stage: st, frames, update: stats(upd), draw: stats(drw), total: stats(tot), overBudgetPct: over(BUDGET), over2xBudgetPct: over(BUDGET * 2) };
};

// The game's real frame loop with the bot playing, like a person would play. Reports what the in-game counters saw.
SF.perfLoop = async ({ diff = 1, stage: st = 1, seconds = 15 } = {}) => {
  settings.diff = diff;
  SF.setMode('immortal');
  startAt(st); if (typeof booting !== 'undefined' && booting) finishBoot();
  acc = 0; last = performance.now(); // SF.start would stop the game's own loop; here it runs
  const realUpdate = update; update = function () { SF.bot(); realUpdate(); };
  PERF.frames = 0; PERF.slow = 0; PERF.worst = 0; PERF.ring.length = 0; lowFX = false; slowFrames = 0; frameN = 0;
  const fps = []; let liteAt = null; const t0 = performance.now();
  for (let s = 0; s < seconds; s++) {
    await new Promise(r => setTimeout(r, 1000));
    fps.push(fpsShown); if (lowFX && liteAt === null) liteAt = s + 1;
  }
  update = realUpdate;
  const st2 = perfStats();
  return { stage: st, seconds, fpsMin: Math.min(...fps), fpsAvg: +(fps.reduce((a, b) => a + b, 0) / fps.length).toFixed(1), frames: st2.frames, slowFrames: st2.slowFrames, slowPct: +(100 * st2.slowFrames / Math.max(1, st2.frames)).toFixed(2), worstMs: st2.worstMs, liteModeAfterSec: liteAt };
};

// Heap growth over a long stepped run. Needs Chrome started with --js-flags=--expose-gc --enable-precise-memory-info (perf.mjs does).
SF.perfMemory = ({ diff = 1, stage: st = 1, frames = 24000, every = 3000 } = {}) => {
  begin(diff, st);
  const heap = () => { if (typeof gc === 'function') gc(); return performance.memory ? performance.memory.usedJSHeapSize : 0; };
  const rows = [];
  for (let i = 0; i <= frames; i += every) {
    if (i) SF.run(every);
    rows.push({ frame: i, heapKB: Math.round(heap() / 1024), parts: parts.length, decals: decals.length, enemies: enemies.length, bullets: ebul.length, chunks: chunks.size });
  }
  delete window.__forceSeed;
  const a = rows[2] || rows[0], b = rows[rows.length - 1]; // skip the first samples: caches fill up early
  return { gc: typeof gc === 'function', hasMemoryApi: !!performance.memory, rows, growthKBper1000frames: +((b.heapKB - a.heapKB) / ((b.frame - a.frame) / 1000)).toFixed(1) };
};
})();
