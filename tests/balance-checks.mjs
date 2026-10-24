// Two balance checks that should hold whatever the exact tuning is (run by hand or nightly; the numbers are noisy, so the bands are wide).
//   1. The Black Fortress laser is fair: a ship that reacts 0.25 s (and 0.4 s) after the beam's aim can be seen dodges at least 80 % of the beams.
//      (The aim locks at charge frame 60 and a warning line is drawn; before that fix the beam hit about 90 % of them.)
//   2. The difficulties form a ladder on the real Campaign: Rookie < Ace in hits (by at least 1.2x; 4 runs usually give about 1.9x), Veteran between them, the worst bullet window
//      does not go down from Rookie to Veteran to Ace, every boss dies, and the laser hardly ever hits.
// Needs Node and Playwright, like tests/replay.mjs; serve the folder first (python3 -m http.server 8000):  node tests/balance-checks.mjs [--runs 2]
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const PAGE = process.env.STARFALL_URL || 'http://localhost:8000/', RUNS = +arg('runs', 2), CONC = +arg('conc', 6);
const harness = readFileSync(new URL('./harness.js', import.meta.url), 'utf8');
const browser = await chromium.launch();
const withPage = async fn => {
  const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });
  try { await page.route(/workers\.dev/, r => r.abort()); await page.goto(PAGE); await page.waitForFunction(() => typeof window.__sf === 'function'); await page.evaluate(src => window.__sf(src), harness); return await fn(page); }
  finally { await page.close(); }
};
const pool = async jobs => { const out = []; let i = 0; await Promise.all(Array.from({ length: Math.min(CONC, jobs.length) }, async () => { while (i < jobs.length) { const j = i++; out[j] = await jobs[j](); } })); return out; };
let failed = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) failed++; };
const avg = a => a.reduce((x, y) => x + y, 0) / a.length;

// 1. the laser
const NAMES = ['Rookie', 'Veteran', 'Ace'], laserJobs = [];
for (const react of [15, 24]) for (const d of [0, 1, 2]) for (let r = 0; r < RUNS; r++) laserJobs.push({ react, d, run: () => withPage(p => p.evaluate(([d, react]) => SF.laserTest(d, react), [d, react])) });
const laserRes = await pool(laserJobs.map(j => j.run));
for (const react of [15, 24]) for (const d of [0, 1, 2]) {
  const r = laserRes.filter((_, i) => laserJobs[i].react === react && laserJobs[i].d === d), l = r.reduce((a, x) => a + x.lasers, 0), h = r.reduce((a, x) => a + x.hit, 0);
  ok(l >= 5 && h <= 0.2 * l, `laser, ${NAMES[d]}, reaction ${(react / 60).toFixed(2)} s: ${h} of ${l} beams hit (at most 20 %), boss fight ${r.map(x => x.fight + ' s').join(', ')}`);
}

// 2. the ladder
const campJobs = []; for (const d of [0, 1, 2]) for (let r = 0; r < RUNS; r++) campJobs.push({ d, run: () => withPage(p => p.evaluate(d => SF.flyCampaign(d, { lag: 8, react: 15 }), d)) });
const campRes = await pool(campJobs.map(j => j.run));
await browser.close();
const by = d => campRes.filter((_, i) => campJobs[i].d === d), m = (d, k) => avg(by(d).map(x => x[k]));
for (const d of [0, 1, 2]) ok(by(d).every(x => x.killed === 6 && x.errs === 0), `${NAMES[d]}: all six bosses die, no game errors (hits ${m(d, 'hits').toFixed(1)}, laser ${m(d, 'laser').toFixed(1)}, window ${m(d, 'top').toFixed(1)}, boss seconds ${[0, 1, 2, 3, 4, 5].map(i => Math.round(avg(by(d).map(x => x.boss[i])))).join('/')})`);
const [hr, hv, ha] = [0, 1, 2].map(d => m(d, 'hits')), [tr, tv, ta] = [0, 1, 2].map(d => m(d, 'top'));
ok(ha >= 1.2 * hr, `ladder: Ace has at least 1.2x the hits of Rookie (${ha.toFixed(1)} vs ${hr.toFixed(1)})`);
ok(hv >= 0.85 * hr && hv <= 1.15 * ha, `ladder: Veteran's hits (${hv.toFixed(1)}) lie between Rookie's and Ace's`);
ok(tr <= 1.1 * tv && tv <= 1.1 * ta, `ladder: the worst bullet window does not fall from Rookie to Veteran to Ace (${tr.toFixed(1)} / ${tv.toFixed(1)} / ${ta.toFixed(1)})`);
ok([0, 1, 2].every(d => m(d, 'laser') <= 1.5), 'the laser hits at most 1.5 times per run on every difficulty');
console.log(failed ? `\n${failed} balance check(s) failed.` : '\nBalance checks pass.');
process.exitCode = failed ? 1 : 0;
