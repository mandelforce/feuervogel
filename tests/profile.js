// Frame-time profiler (development tool). Shows which functions use the time in update and render, and what causes slow frames.
// Local builds only (needs window.__sf). Load after harness.js:
//   __sf(await (await fetch('tests/harness.js')).text()); __sf(await (await fetch('tests/profile.js')).text());
//   await SF.profile({ diff: 1, stage: 1, frames: 5000 })
// Results are in milliseconds on the machine you run it on. Run it on a phone for numbers that matter.
(() => {
const SKIP = new Set(['frameLoop', 'logError', 'resetCtx', 'warmStep']);

SF.profile = async ({ diff = 1, stage: st = 1, frames = 5000, spikeMs = 5, calls = 40 } = {}) => {
  const src = await (await fetch(location.pathname + '?' + Date.now())).text();
  const names = [...new Set([...src.matchAll(/^function (\w+)\(/gm)].map(m => m[1]))].filter(n => !SKIP.has(n));
  const orig = {};
  for (const n of names) { try { orig[n] = eval(n); } catch (e) {} }
  const restore = () => { for (const n in orig) eval(n + ' = orig[n]'); };

  // Pass 1: count calls, so very hot helpers (called many times per frame) are not timed one by one: the timing would distort them.
  const C = {};
  for (const n in orig) { const o = orig[n]; C[n] = 0; const w = function (...a) { C[n]++; return o.apply(this, a); }; eval(n + ' = w'); }
  SF.setMode('immortal'); SF.start(diff, st);
  if (typeof booting !== 'undefined' && booting) finishBoot();
  for (let i = 0; i < 1500; i++) { SF.run(1); SF.draw(); } // draw too, or the render functions would never be counted
  restore();
  const timed = Object.keys(orig).filter(n => C[n] / 1500 < calls && C[n] > 0);

  // Pass 2: time the rest. Self time = time in the function minus time in the timed functions it calls.
  const S = {}, N = {}; let F = {}; const stack = [];
  for (const n of timed) {
    const o = orig[n]; S[n] = 0; N[n] = 0;
    const w = function (...a) {
      const e = { c: 0 }; stack.push(e); const t0 = performance.now();
      try { return o.apply(this, a); } finally {
        const dt = performance.now() - t0; stack.pop(); const self = dt - e.c;
        S[n] += self; N[n]++; F[n] = (F[n] || 0) + self; if (stack.length) stack[stack.length - 1].c += dt;
      }
    };
    eval(n + ' = w');
  }
  SF.setMode('immortal'); SF.start(diff, st);
  if (typeof booting !== 'undefined' && booting) finishBoot();
  const spikes = []; let tu = 0, tr = 0, maxU = 0, maxR = 0;
  for (let i = 0; i < frames; i++) {
    F = {};
    const a = performance.now(); SF.run(1); const b = performance.now(); SF.draw(); const c = performance.now();
    tu += b - a; tr += c - b; maxU = Math.max(maxU, b - a); maxR = Math.max(maxR, c - b);
    if (c - a > spikeMs) spikes.push({ frame: i, update: +(b - a).toFixed(1), render: +(c - b).toFixed(1), top: Object.entries(F).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, v]) => k + ' ' + v.toFixed(1)) });
  }
  restore();
  const top = Object.keys(S).map(n => ({ fn: n, msPerFrame: +(S[n] / frames).toFixed(4), callsPerFrame: +(N[n] / frames).toFixed(1) })).sort((x, y) => y.msPerFrame - x.msPerFrame).slice(0, 25);
  return { stage: st, frames, update: { avg: +(tu / frames).toFixed(3), max: +maxU.toFixed(1) }, render: { avg: +(tr / frames).toFixed(3), max: +maxR.toFixed(1) }, spikeCount: spikes.length, spikes: spikes.slice(0, 25), top, hotNotTimed: Object.keys(C).filter(n => C[n] / 1500 >= calls).map(n => n + ' ' + Math.round(C[n] / 1500) + '/frame') };
};
})();
