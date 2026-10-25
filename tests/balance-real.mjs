// Balance report for the real Campaign (START: Enigma levels 1A, 2, 3, 4, 5, 6B) on all three difficulties, flown by the "human" bot (tests/harness.js).
// Needs Node and Playwright:  npm install --no-save playwright@1 && npx playwright install chromium
// Serve the folder (python3 -m http.server 8000), then:  node tests/balance-real.mjs [options]
//   --runs 4              runs per difficulty (the numbers are noisy: about +-2 hits and +-1.5 on the window with 4 runs)
//   --diffs 0,1,2         0 Rookie, 1 Veteran, 2 Ace
//   --lag 8 --react 15    frames a movement decision is held / frames until the bot dodges the Black Fortress laser (60 = 1 s)
//   --overrides '{"bs":{"1":1.0}}'   change DIFF entries without editing the page (see SF.overrides), to try a setting before changing the code
//   --eval 'code'         run code in the game's scope before flying (e.g. a changed rankFor)
//   --levels              also print the worst bullet window and the hits per level
//   --attrib              also list which enemies fire the most shots
//   --save file.json      write the averages (tests/balance-baseline.json is the one kept in the repo)
//   --baseline file.json  print the change against a saved run; --strict exits 1 when something drifts outside the bands
//   --conc 6              pages flown at once (each run takes 1 to 2 minutes)
// Numbers: hits = bullets and rams that hit the ship; laser = Black Fortress beam hits; top = the worst 10 s window of bullets on screen before a boss,
// averaged over the stages; pre / bossB = average bullets before / during boss fights; boss = seconds each boss lasted.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const PAGE = process.env.STARFALL_URL || 'http://localhost:8000/';
const RUNS = +arg('runs', 4), DIFFS = String(arg('diffs', '0,1,2')).split(',').map(Number), LAG = +arg('lag', 8), REACT = +arg('react', 15), CONC = +arg('conc', 6);
const OVERRIDES = arg('overrides', null) ? JSON.parse(arg('overrides')) : null, ATTRIB = !!arg('attrib', false), CODE = arg('eval', null), LEVELS = !!arg('levels', false);
const NAMES = ['Rookie', 'Veteran', 'Ace'];
const harness = readFileSync(new URL('./harness.js', import.meta.url), 'utf8');

const browser = await chromium.launch();
async function fly(diff) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });
  try {
    await page.route(/workers\.dev/, r => r.abort());
    await page.goto(PAGE);
    await page.waitForFunction(() => typeof window.__sf === 'function');
    await page.evaluate(src => window.__sf(src), harness);
    return await page.evaluate(([d, o, attrib]) => { if (attrib) SF.attrib(); return SF.flyCampaign(d, o); }, [diff, { lag: LAG, react: REACT, overrides: OVERRIDES, code: CODE }, ATTRIB || LEVELS]);
  } finally { await page.close(); }
}
const jobs = []; for (const d of DIFFS) for (let r = 0; r < RUNS; r++) jobs.push(d);
const results = {}; let next = 0;
await Promise.all(Array.from({ length: Math.min(CONC, jobs.length) }, async () => {
  while (next < jobs.length) { const d = jobs[next++]; (results[d] ||= []).push(await fly(d)); process.stderr.write('.'); }
}));
process.stderr.write('\n'); await browser.close();

const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
const rows = {};
for (const d of DIFFS) {
  const r = results[d];
  rows[NAMES[d]] = { runs: r.length, hits: avg(r.map(x => x.hits)), laser: avg(r.map(x => x.laser)), top: avg(r.map(x => x.top)), pre: avg(r.map(x => x.pre)), bossB: avg(r.map(x => x.bossB)),
    boss: [0, 1, 2, 3, 4, 5].map(i => avg(r.map(x => x.boss[i]).filter(v => v !== null))), killed: avg(r.map(x => x.killed)), errs: r.reduce((a, x) => a + x.errs, 0) };
}
const f = (v, n = 1) => Number.isFinite(v) ? v.toFixed(n) : '-';
console.log(`Real Campaign, human bot (lag ${LAG}, reaction ${REACT}), ${RUNS} runs per difficulty${OVERRIDES ? ', overrides ' + JSON.stringify(OVERRIDES) : ''}`);
console.log('difficulty  hits  laser   top   pre  bossB  boss seconds, levels 1-6     killed');
for (const [n, v] of Object.entries(rows)) console.log(n.padEnd(10), f(v.hits).padStart(5), f(v.laser).padStart(6), f(v.top).padStart(6), f(v.pre).padStart(5), f(v.bossB).padStart(6), ' ', v.boss.map(x => f(x, 0).padStart(3)).join(' '), '        ', f(v.killed));
if (LEVELS) for (const d of DIFFS) {
  const r = results[d], by = k => [0, 1, 2, 3, 4, 5].map(i => f(avg(r.map(x => x[k][i])), k === 'hitsBy' ? 1 : 0).padStart(4)).join(' ');
  if (results[d][0].shotsBy.length) console.log(`${NAMES[d].padEnd(8)} enemy shots per second before the boss, levels 1-6: ${[0, 1, 2, 3, 4, 5].map(i => f(avg(r.map(x => x.shotsBy[i])), 2).padStart(5)).join(' ')}`);
  console.log(`${NAMES[d].padEnd(8)} per level 1-6: window ${by('topBy')} | pre-boss avg ${[0, 1, 2, 3, 4, 5].map(i => f(avg(r.map(x => x.preBy[i]))).padStart(4)).join(' ')} | hits ${by('hitsBy')}`);
}
if (rows.Rookie && rows.Veteran && rows.Ace) console.log(`ladder (hits): Rookie 1 : Veteran ${f(rows.Veteran.hits / rows.Rookie.hits, 2)} : Ace ${f(rows.Ace.hits / rows.Rookie.hits, 2)}`);
if (ATTRIB) for (const d of DIFFS) {
  const t = {}; for (const x of results[d]) for (const [k, v] of Object.entries(x.attr || {})) { const ty = k.split(':')[1]; t[ty] = (t[ty] || 0) + v; }
  const tot = Object.values(t).reduce((a, b) => a + b, 0);
  console.log(`${NAMES[d]} shots by shooter:`, Object.entries(t).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${Math.round(100 * v / tot)}%`).join(', '));
}
const bad = Object.values(rows).reduce((a, v) => a + v.errs, 0);
if (bad) console.error(`\n${bad} game error(s) during the runs`), process.exitCode = 1;

const save = arg('save', null);
if (save) { writeFileSync(save, JSON.stringify({ lag: LAG, react: REACT, runs: RUNS, overrides: OVERRIDES, rows }, null, 1) + '\n'); console.log('\nsaved ' + save); }
const base = arg('baseline', null);
if (base && existsSync(base)) {
  const b = JSON.parse(readFileSync(base)).rows; let drift = 0;
  console.log('\nchange against ' + base + ' (bands: hits +-35 % or 3, window +-15 %, boss seconds +-30 % or 15):');
  for (const [n, v] of Object.entries(rows)) {
    if (!b[n]) continue;
    const out = (now, was, rel, abs) => Math.abs(now - was) > Math.max(abs, was * rel);
    const flags = [];
    if (out(v.hits, b[n].hits, 0.35, 3)) flags.push('hits'); if (out(v.top, b[n].top, 0.15, 2)) flags.push('window'); if (out(v.pre, b[n].pre, 0.15, 1)) flags.push('pre-boss');
    v.boss.forEach((s, i) => { if (Number.isFinite(s) && Number.isFinite(b[n].boss[i]) && out(s, b[n].boss[i], 0.3, 15)) flags.push('boss ' + (i + 1)); });
    if (v.laser > b[n].laser + 1.5) flags.push('laser');
    drift += flags.length;
    console.log(n.padEnd(10), `hits ${f(b[n].hits)} -> ${f(v.hits)}  window ${f(b[n].top)} -> ${f(v.top)}  laser ${f(b[n].laser)} -> ${f(v.laser)}`, flags.length ? '  DRIFT: ' + flags.join(', ') : '  ok');
  }
  if (drift && arg('strict', false)) process.exitCode = 1;
}
