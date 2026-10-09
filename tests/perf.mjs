// Performance test: how the game runs on slower phones, and whether a change made it worse.
// It slows the CPU down (Chrome's CPU throttling) to stand in for older phones, then measures
//   - the cost of every frame (update + draw), stepped, so nothing else competes,
//   - the game's own frame loop with the bot playing: frame rate, hitches, whether lite mode switches on,
//   - start-up time until the title screen is usable,
//   - heap growth over a long run (leaks matter on phones, where Safari drops tabs that use too much memory),
//   - page weight (what an old phone has to download and parse).
// Slow-down is an approximation: it scales main-thread work only, not graphics hardware or memory speed, and CI machines vary.
// Use it to spot regressions and trends; confirm anything important on a real phone with "Show FPS" (see tests/README.md).
//
// Needs Node and Playwright (see tests/balance.mjs). Serve the folder first (python3 -m http.server 8000).
//   node tests/perf.mjs                  measure and compare with tests/perf-baseline.json
//   node tests/perf.mjs --warn           same, but only print warnings (CI uses this)
//   node tests/perf.mjs --update         print a new baseline (tests/perf-baseline.json) from this machine
// Environment: STARFALL_URL, RATES (default 1,4,6), LOOP_SECONDS (default 15), FRAMES (default 3000).
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, appendFileSync, existsSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const PAGE = process.env.STARFALL_URL || 'http://localhost:8000/';
const RATES = (process.env.RATES || '1,4,6').split(',').map(Number);
const SECONDS = +(process.env.LOOP_SECONDS || 15);
const FRAMES = +(process.env.FRAMES || 3000);
const LABEL = { 1: 'this machine', 4: 'mid-range phone (4x slower)', 6: 'older phone (6x slower)' };
const warnOnly = process.argv.includes('--warn'), update = process.argv.includes('--update');
const baselineUrl = new URL('./perf-baseline.json', import.meta.url);
const baseline = existsSync(baselineUrl) ? JSON.parse(readFileSync(baselineUrl, 'utf8')) : null;
const harness = readFileSync(new URL('./harness.js', import.meta.url), 'utf8');
const perf = readFileSync(new URL('./perf.js', import.meta.url), 'utf8');

const browser = await chromium.launch({ args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'] });
const results = { rates: {}, memory: null };

for (const rate of RATES) {
  // a phone-sized, touch-enabled window, like a real player's
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(/workers\.dev/, r => r.abort()); // never touch the live leaderboard from CI
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });

  const t0 = Date.now();
  await page.goto(PAGE);
  await page.waitForFunction(() => typeof window.__sf === 'function', null, { timeout: 120000 });
  await page.waitForFunction(() => window.__sf('!booting'), null, { timeout: 120000, polling: 100 });
  const bootMs = Date.now() - t0; // page load + sprite generation + boot splash, until the title is usable
  await page.evaluate(s => window.__sf(s), harness);
  await page.evaluate(s => window.__sf(s), perf);

  const steps = await page.evaluate(n => window.SF.perfSteps({ frames: n }), FRAMES);
  const loop = await page.evaluate(s => window.SF.perfLoop({ seconds: s }), SECONDS);
  if (rate === Math.min(...RATES)) results.memory = await page.evaluate(() => window.SF.perfMemory({ frames: 24000, every: 3000 }));
  results.rates[rate] = { bootMs, steps, loop, errors: errors.length };
  if (errors.length) console.error(`rate ${rate}: page errors: ${errors.slice(0, 3).join(' | ')}`);
  await ctx.close();
}
await browser.close();

const html = readFileSync(new URL('../index.html', import.meta.url));
results.weight = { indexBytes: statSync(new URL('../index.html', import.meta.url)).size, indexGzipBytes: gzipSync(html, { level: 9 }).length };

// ---- report ----
const f = (v, d = 1) => (v === null || v === undefined ? '-' : Number(v).toFixed(d));
const lines = ['## Performance', '', 'Slowed-down CPU stands in for older phones; CI machines vary, so compare trends, not single numbers.', '',
  '| Device | Frame cost avg / p95 / p99 / max (ms) | Frames over 16.7 ms | Real loop: fps min / avg | Slow frames | Worst frame (ms) | Lite mode after | Start-up (s) |', '|---|---|---|---|---|---|---|---|'];
for (const rate of RATES) {
  const r = results.rates[rate], t = r.steps.total;
  lines.push(`| ${LABEL[rate] || rate + 'x slower'} | ${f(t.avg, 2)} / ${f(t.p95, 2)} / ${f(t.p99, 1)} / ${f(t.max, 1)} | ${f(r.steps.overBudgetPct, 2)}% | ${r.loop.fpsMin} / ${r.loop.fpsAvg} | ${f(r.loop.slowPct, 2)}% | ${r.loop.worstMs} | ${r.loop.liteModeAfterSec === null ? 'never' : r.loop.liteModeAfterSec + ' s'} | ${f(r.bootMs / 1000, 1)} |`);
}
lines.push('', `Heap growth over a long run: ${results.memory ? results.memory.growthKBper1000frames + ' KB per 1000 frames' + (results.memory.gc ? '' : ' (no forced GC, unreliable)') : 'not measured'}. Page: ${(results.weight.indexBytes / 1024).toFixed(0)} KB, ${(results.weight.indexGzipBytes / 1024).toFixed(0)} KB gzipped.`);
const md = lines.join('\n');
console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');

if (update) {
  const b = { note: 'Baseline for tests/perf.mjs, from a CI run. Regenerate with the manual workflow run when a change is meant to alter performance.', rates: {}, memoryGrowthKBper1000frames: results.memory && results.memory.growthKBper1000frames, indexBytes: results.weight.indexBytes };
  for (const rate of RATES) { const r = results.rates[rate]; b.rates[rate] = { totalP95: r.steps.total.p95, totalP99: r.steps.total.p99, slowPct: r.loop.slowPct, bootMs: r.bootMs }; }
  console.log('PERF-BASELINE-BEGIN\n' + JSON.stringify(b, null, 2) + '\nPERF-BASELINE-END');
  process.exit(0);
}

// ---- compare with the baseline; warnings only unless run by hand without --warn ----
const warnings = [];
for (const rate of RATES) {
  const r = results.rates[rate], who = LABEL[rate] || rate + 'x';
  if (r.errors) warnings.push(`${who}: the game reported ${r.errors} page error(s)`);
  if (r.loop.liteModeAfterSec !== null) warnings.push(`${who}: lite mode switched on after ${r.loop.liteModeAfterSec} s (frames were too slow)`);
  const b = baseline && baseline.rates[rate];
  if (!b) continue;
  if (r.steps.total.p95 > b.totalP95 * 1.5 + 0.5) warnings.push(`${who}: typical frame (p95) cost ${f(r.steps.total.p95, 2)} ms vs ${f(b.totalP95, 2)} ms before`);
  if (r.steps.total.p99 > b.totalP99 * 1.5 + 2) warnings.push(`${who}: slow frame (p99) cost ${f(r.steps.total.p99, 1)} ms vs ${f(b.totalP99, 1)} ms before`);
  if (r.loop.slowPct > b.slowPct + 3) warnings.push(`${who}: ${f(r.loop.slowPct, 1)}% of frames were slow vs ${f(b.slowPct, 1)}% before`);
  if (r.bootMs > b.bootMs * 1.5 + 1000) warnings.push(`${who}: start-up ${f(r.bootMs / 1000, 1)} s vs ${f(b.bootMs / 1000, 1)} s before`);
}
if (results.memory && results.memory.gc && results.memory.growthKBper1000frames > 150) warnings.push(`memory grows ${results.memory.growthKBper1000frames} KB per 1000 frames over a long run (possible leak)`);
if (baseline && results.weight.indexBytes > baseline.indexBytes * 1.1) warnings.push(`index.html is ${(results.weight.indexBytes / 1024).toFixed(0)} KB, ${Math.round((results.weight.indexBytes / baseline.indexBytes - 1) * 100)}% bigger than the baseline`);
if (!baseline) console.log('\n(no tests/perf-baseline.json yet: nothing to compare with)');
for (const w of warnings) console.log(warnOnly ? `::warning title=Performance::${w}` : `WARNING ${w}`);
if (!warnings.length && baseline) console.log('\nPerformance is in line with the baseline.');
if (warnings.length && !warnOnly) process.exit(1);
