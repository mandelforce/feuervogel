#!/usr/bin/env node
// Skill bots (docs/skill-bots-brief.md, step 1): rookie, veteran and ace (tests/skill-bot.js) fly the six Campaign levels, each on its own,
// first pass, mortal (real lives, no continue: a flight ends at the continue prompt) and immortal (every hit counted), several bot seeds per cell.
// It measures; it never fails (exit 0). Needs Node and Playwright. Serve the folder (python3 -m http.server 8000), then:
//   node tests/skill-bots.mjs                         own difficulty (rookie Easy, veteran Normal, ace Hard), 8 seeds, and the checks
//   node tests/skill-bots.mjs --cross                 and each bot on the other two difficulties
//   node tests/skill-bots.mjs --daily 2026-11-14      a Daily Sortie instead of the Campaign levels
//   node tests/skill-bots.mjs --seeds 4 --levels 1,6 --bots rookie,ace --conc 2 --no-checks --save out.json
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const PAGE = process.env.STARFALL_URL || 'http://localhost:8000/';
const SEEDS = +arg('seeds', 8), CONC = +arg('conc', 2), CROSS = !!arg('cross', false), DAILY = arg('daily', null), CHECKS = !arg('no-checks', false);
const LEVELS = DAILY ? [0] : String(arg('levels', '1,2,3,4,5,6')).split(',').map(Number), BOTS = String(arg('bots', 'rookie,veteran,ace')).split(',');
const OWN = { rookie: 0, veteran: 1, ace: 2 }, NAMES = ['Easy', 'Normal', 'Hard'], VIEW = { width: 1000, height: 760 };
const harness = readFileSync(new URL('./harness.js', import.meta.url), 'utf8'), skill = readFileSync(new URL('./skill-bot.js', import.meta.url), 'utf8');
const VERSION = (readFileSync(new URL('../index.html', import.meta.url), 'utf8').match(/const VERSION = '([^']+)'/) || [])[1];

/* One flight in the game's scope (a string: no line comments). bot: a profile name, 'neutral', or null for the plain bot under SF.human(0, 15). */
const FLY = `(function (lv, date, diff, bot, seed, mortal) {
  if (app.booting) finishBoot();
  SF.setMode(mortal ? 'real' : 'immortal'); SF.start(diff, 1);
  if (date) startDaily(date); else startEnigma(lv, true, 0);
  if (bot) SF.skill(Object.assign({}, SF.SKILL[bot], { seed: seed })); else SF.human(0, 15);
  const L0 = run.sortie.level, t0 = performance.now(), f0 = gf, trace = [];
  let end = 'cap', bossF = -1, deadF = -1, livesAtBoss = null, novas = 0, f = 0;
  for (let step = 0; step < 60 * 60 * 20 / 10; step++) {
    const r = SF.run(10); if (r !== 'ok') { end = r; break; }
    if (!run.sortie || run.sortie.level !== L0) { end = 'next:' + (run.sortie ? run.sortie.level : 0); break; }
    f = gf - f0;
    if (run.stats) novas = run.stats.novas;
    const boss = world.enemies.find(function (e) { return e.type === 'boss'; });
    if (boss && bossF < 0) { bossF = f; livesAtBoss = run.lives; }
    if (bossF >= 0 && deadF < 0 && boss && boss.dying) deadF = f;
    if (deadF >= 0 && f - deadF > 60 * 40) { end = 'boss-dead'; break; }
    if (step % 6 === 5) trace.push(Math.round(player ? player.x * 10 : 0) + ':' + Math.round(player ? player.y * 10 : 0) + ':' + world.ebul.length + ':' + world.enemies.length + ':' + (run.score | 0) + ':' + SF.R.hits.length + ':' + run.lives + ':' + run.bombs);
    if (step % 36 === 0) world.parts.length = Math.min(world.parts.length, 300);
  }
  const hits = SF.R.hits, pre = hits.filter(function (h) { return !h.boss; }).length, inBoss = hits.length - pre;
  return { level: L0, diff: diff, bot: bot, seed: seed, mortal: mortal, H: H, end: end, frames: f, wallMs: Math.round(performance.now() - t0), errs: SF.R.errs.length,
    bossIn: bossF < 0 ? null : +(bossF / 60).toFixed(1), bossKilled: deadF >= 0, cleared: deadF >= 0 && end !== 'continue-screen' && end !== 'cap',
    deaths: hits.length, livesAtBoss: livesAtBoss, novas: novas, deathList: hits.map(function (h) { return [h.t, h.cause, h.why || '']; }),
    hitsPre: pre, hitsBoss: inBoss, hitsPerMin: bossF > 0 ? +(pre / (bossF / 3600)).toFixed(2) : null, score: run.score, trace: trace };
})`;

const browser = await chromium.launch();
async function fly(job) {
  const page = await browser.newPage({ viewport: VIEW }), pageErrs = [];
  page.on('pageerror', e => pageErrs.push(String(e && e.message || e).slice(0, 200)));
  try {
    await page.route(/workers\.dev/, r => r.abort());
    await page.goto(PAGE);
    await page.waitForFunction(() => typeof window.__sf === 'function');
    await page.evaluate(src => window.__sf(src), harness);
    if (job.bot) await page.evaluate(src => window.__sf(src), skill);
    const a = [job.level, JSON.stringify(job.date || ''), job.diff, JSON.stringify(job.bot), job.seed, job.mortal];
    const r = await page.evaluate(([code, a]) => window.SF.peek(code + '(' + a.join(',') + ')'), [FLY, a]);
    r.pageErrs = pageErrs; return r;
  } finally { await page.close(); }
}
async function pool(jobs) {
  const out = new Array(jobs.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(CONC, jobs.length) }, async () => { while (next < jobs.length) { const i = next++; out[i] = await fly(jobs[i]); process.stderr.write('.'); } }));
  return out;
}

const cells = [];
for (const level of LEVELS) for (const bot of BOTS) for (const diff of (CROSS ? [0, 1, 2] : [OWN[bot]])) cells.push({ level, bot, diff, own: diff === OWN[bot] });
const jobs = [];
cells.forEach((c, ci) => { for (let s = 1; s <= SEEDS; s++) for (const mortal of [true, false]) jobs.push({ ci, level: c.level, date: DAILY, diff: c.diff, bot: c.bot, seed: s, mortal }); });
const tAll = Date.now(), flights = await pool(jobs);

const sorted = a => a.slice().sort((x, y) => x - y), med = a => { const s = sorted(a); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const stat = a => { a = a.filter(v => v !== null && v !== undefined); return a.length ? { med: med(a), min: Math.min(...a), max: Math.max(...a) } : null; };
cells.forEach((c, ci) => {
  const fs = flights.filter((r, i) => jobs[i].ci === ci), M = fs.filter(r => r.mortal), I = fs.filter(r => !r.mortal);
  const causes = {}; for (const r of M) for (const d of r.deathList) { const k = d[2] && d[2] !== d[1] && !String(d[1]).includes(d[2]) ? d[2] : d[1]; causes[k] = (causes[k] || 0) + 1; }
  Object.assign(c, { flights: fs.length,
    mortal: { cleared: +(M.filter(r => r.cleared).length / Math.max(1, M.length)).toFixed(2), deaths: stat(M.map(r => r.deaths)), livesAtBoss: stat(M.map(r => r.livesAtBoss)), reachedBoss: M.filter(r => r.bossIn !== null).length, novas: stat(M.map(r => r.novas)),
      deathAt: stat(M.flatMap(r => r.deathList.map(d => d[0]))), causes, deaths_each: M.map(r => ({ seed: r.seed, end: r.end, deaths: r.deathList })) },
    immortal: { hitsPerMin: stat(I.map(r => r.hitsPerMin)), hitsBoss: stat(I.map(r => r.hitsBoss)), bossIn: stat(I.map(r => r.bossIn)), bossKilled: I.filter(r => r.bossKilled).length },
    flightS: stat(fs.map(r => +(r.wallMs / 1000).toFixed(1))), errs: fs.reduce((a, r) => a + r.errs + r.pageErrs.length, 0) });
});

const f = (s, n = 0) => !s ? '-' : (n ? s.med.toFixed(n) : String(s.med)) + ' [' + (n ? s.min.toFixed(n) : s.min) + '-' + (n ? s.max.toFixed(n) : s.max) + ']';
console.log(`\nSkill bots, build ${VERSION}, viewport ${VIEW.width}x${VIEW.height}, H ${flights[0] && flights[0].H}, ${SEEDS} seeds per cell, ${CONC} pages at once${DAILY ? ', Daily Sortie ' + DAILY : ', Campaign levels first pass'}`);
console.log('median [min-max] over the seeds. mortal: cleared share, deaths, lives when the boss comes, Novas, top death causes; immortal: hits/min before the boss, hits in the boss fight');
console.log('level bot      diff     clear  deaths      lives@boss  novas       hits/min           boss hits    flight s       causes');
for (const c of cells) console.log(`${String(c.level || "daily").padStart(5)} ${c.bot.padEnd(8)} ${NAMES[c.diff].padEnd(7)}${c.own ? ' ' : '*'} ${c.mortal.cleared.toFixed(2).padStart(5)}  ${f(c.mortal.deaths).padEnd(11)} ${f(c.mortal.livesAtBoss).padEnd(11)} ${f(c.mortal.novas).padEnd(11)} ${f(c.immortal.hitsPerMin, 2).padEnd(18)} ${f(c.immortal.hitsBoss).padEnd(12)} ${f(c.flightS, 1).padEnd(14)} ${Object.entries(c.mortal.causes).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => k + ' ' + v).join(', ')}${c.errs ? '  ERRORS ' + c.errs : ''}`);
if (CROSS) console.log('* = not the bot\'s own difficulty');
const walls = flights.map(r => r.wallMs / 1000);
const timing = { flights: flights.length, conc: CONC, flightS: stat(walls.map(v => +v.toFixed(1))), gameSpeed: +(flights.reduce((a, r) => a + r.frames / 60, 0) / walls.reduce((a, b) => a + b, 0)).toFixed(1), allS: Math.round((Date.now() - tAll) / 1000) };
console.log(`\none flight: ${timing.flightS.min} to ${timing.flightS.max} s (median ${timing.flightS.med} s), ${timing.gameSpeed}x game speed; ${timing.flights} flights in ${timing.allS} s with ${CONC} pages at once`);

// the checks: three kinds of bot, repeatable, and the neutral profile is the plain bot
const checks = [];
const ok = (pass, what) => { checks.push({ pass, what }); console.log((pass ? 'PASS ' : 'FAIL ') + what); };
console.log('');
const D = (lv, bot, diff) => { const c = cells.find(x => x.level === lv && x.bot === bot && x.diff === diff); return c && c.mortal.deaths ? c.mortal.deaths.med : null; };
if (BOTS.join() === 'rookie,veteran,ace') {
  for (const lv of LEVELS) { const r = D(lv, 'rookie', 0), v = D(lv, 'veteran', 1), a = D(lv, 'ace', 2); ok(r >= v && v >= a, `level ${lv || DAILY}, own difficulty: median deaths rookie ${r} >= veteran ${v} >= ace ${a}`); }
  if (CROSS) for (const diff of [0, 1, 2]) for (const lv of LEVELS) { const r = D(lv, 'rookie', diff), v = D(lv, 'veteran', diff), a = D(lv, 'ace', diff); ok(r >= v && v >= a, `level ${lv || DAILY}, all on ${NAMES[diff]}: median deaths rookie ${r} >= veteran ${v} >= ace ${a}`); }
}
let repeat = null, neutral = null;
if (CHECKS) {
  const L = LEVELS.includes(6) ? 6 : LEVELS[LEVELS.length - 1], L2 = LEVELS.includes(2) ? 2 : LEVELS[0];
  const same = (a, b) => { const k = ['end', 'frames', 'deaths', 'novas', 'score', 'hitsPre', 'hitsBoss', 'livesAtBoss']; const d = k.filter(x => JSON.stringify(a[x]) !== JSON.stringify(b[x])); let at = 0; while (at < a.trace.length && a.trace[at] === b.trace[at]) at++; return { same: !d.length && a.trace.length === b.trace.length && at === a.trace.length, differ: d, sameUntilS: at === a.trace.length && a.trace.length === b.trace.length ? null : at, frames: [a.frames, b.frames], deaths: [a.deaths, b.deaths] }; };
  const rj = [{ level: L2, date: DAILY, diff: 0, bot: 'rookie', seed: 3, mortal: true }, { level: L, date: DAILY, diff: 2, bot: 'ace', seed: 5, mortal: true }, { level: L, date: DAILY, diff: 1, bot: 'veteran', seed: 2, mortal: false }];
  const r1 = await pool(rj), r2 = await pool(rj);
  repeat = rj.map((j, i) => Object.assign({ job: j }, same(r1[i], r2[i])));
  for (const x of repeat) ok(x.same, `same profile and seed twice in fresh pages: level ${x.job.level || DAILY} ${x.job.bot} seed ${x.job.seed} ${NAMES[x.job.diff]} ${x.job.mortal ? 'mortal' : 'immortal'} (${x.frames[0]} frames, ${x.deaths[0]} deaths)${x.same ? '' : ': differs ' + x.differ.join(',') + ' from ' + x.sameUntilS + ' s'}`);
  const nj = [{ level: L, date: DAILY, diff: 2, mortal: true }, { level: L2, date: DAILY, diff: 0, mortal: true }, { level: L, date: DAILY, diff: 1, mortal: false }];
  const nA = await pool(nj.map(j => Object.assign({ bot: 'neutral', seed: 1 }, j))), nB = await pool(nj.map(j => Object.assign({ bot: null, seed: 0 }, j)));
  neutral = nj.map((j, i) => Object.assign({ job: j }, same(nA[i], nB[i])));
  for (const x of neutral) ok(x.same, `neutral profile = plain bot under SF.human(0, 15): level ${x.job.level || DAILY} ${NAMES[x.job.diff]} ${x.job.mortal ? 'mortal' : 'immortal'} (${x.frames[0]} frames, ${x.deaths[0]} deaths, ${nA[nj.indexOf(x.job)].novas} Novas)${x.same ? '' : ': differs ' + x.differ.join(',') + ' from ' + x.sameUntilS + ' s'}`);
}
process.stderr.write('\n'); await browser.close();

const save = arg('save', null);
if (save && save !== true) {
  const prof = await import('node:vm').then(vm => { const ctx = { window: { SF: { setMode() {}, start() {} } } }; vm.runInNewContext(skill, ctx); return ctx.window.SF.SKILL; });
  for (const r of flights) delete r.trace;
  writeFileSync(save, JSON.stringify({ about: 'Skill bots (docs/skill-bots-brief.md, step 1). Written by tests/skill-bots.mjs --save.', version: VERSION, viewport: VIEW, H: flights[0] && flights[0].H, seeds: SEEDS, daily: DAILY, cross: CROSS,
    profiles: JSON.parse(JSON.stringify(prof, (k, v) => v === Infinity ? 'Infinity' : v)),
    units: { deathAt: 's from the level start', hitsPerMin: 'hits per minute before the boss (immortal)', flightS: 'wall s for one flight at full speed, this machine' },
    timing, checks, repeat, neutral, cells, flights }, null, 1) + '\n');
  console.log('saved ' + save);
}
