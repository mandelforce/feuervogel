#!/usr/bin/env node
// The Daily Sortie's flight gate (docs/daily-sortie-plan.md, section 3 gate 3, phase 3; results in section 9).
// For each date (or seed) and difficulty: compose the sortie, run gate 2 (tests/kit-check.mjs, as tests/compose.mjs does), fly it with the
// human bot (SF.human(8, 15), immortal) and print one line with every measure and PASS or FAIL.
// Needs Node and Playwright. Serve the folder (python3 -m http.server 8000), then:
//   node tests/daily-gate.mjs --from 2026-12-01 --days 14 [--diff 0,1,2] [--kit desert] [--out DIR] [--bots]
//   node tests/daily-gate.mjs --sweep 200 [--kit desert] [--all 40] [--det 10] [--bot-sorties 20] [--no-bots] [--save FILE]
// Dates: the date's own kit (rotation), or --kit to force one. Determinism is checked on every date (on the first difficulty flown).
// Sweep: seeds instead of dates (SortieCompose.composeSortie(kit, seed, 0)); every seed on Veteran, the first --all also on Rookie and Ace,
// determinism on every --det-th, the skill bots on the first --bot-sorties.
// FAIL (decided): a page or game error; gate 2 not clean; no boss, or the boss not killed within 900 s; the flight does not end at the
// title; a planned encounter not ending `done`, or no Shadow Wing; two pages with different Math.random differing in spawns, score or end;
// dead air: a stretch before the boss with no enemy on screen, no enemy bullet and no encounter longer than --dead (10 s).
// Reported only (decision 8, open): hits per minute, worst 10 s bullet window, bullets before the boss, kills per minute, each marked
// low / in / high against the kit level's baseline range for that difficulty (tests/daily-baseline.json), and the skill bots
// (--bots: rookie, veteran, ace on their own difficulty, mortal, 4 bot seeds each: cleared share, deaths per minute, lives when the boss comes).
// Two pages at once (--conc); a page flies many sorties in turn (tests/daily.mjs shows a sortie leaves nothing behind).
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { KITS as PROBE, check as checkPlan } from './kit-check.mjs';
const require = createRequire(import.meta.url);
const SC = require('../tools/sortie-compose.js');

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const PAGE = process.env.STARFALL_URL || 'http://localhost:8000/';
const SWEEP = +arg('sweep', 0), FROM = arg('from', null), DAYS = +arg('days', 14), KIT = arg('kit', null), OUT = arg('out', null), SAVE = arg('save', null);
const DIFFS = String(arg('diff', SWEEP ? '1' : '0,1,2')).split(',').map(Number), CONC = +arg('conc', 2), DEAD = +arg('dead', 10);
const ALL = +arg('all', 40), DET = +arg('det', 10), BOT_SORTIES = arg('no-bots', false) ? 0 : +arg('bot-sorties', SWEEP ? 20 : (arg('bots', false) ? 1e9 : 0)), BOT_SEEDS = +arg('bot-seeds', 4);
const NAMES = ['Rookie', 'Veteran', 'Ace'], BOTS = ['rookie', 'veteran', 'ace'], OWN = { rookie: 0, veteran: 1, ace: 2 }, VIEW = { width: 1000, height: 760 };
const harness = readFileSync(new URL('./harness.js', import.meta.url), 'utf8'), skill = readFileSync(new URL('./skill-bot.js', import.meta.url), 'utf8');
const BASE = JSON.parse(readFileSync(new URL('./daily-baseline.json', import.meta.url), 'utf8'));
const VERSION = (readFileSync(new URL('../index.html', import.meta.url), 'utf8').match(/const VERSION = '([^']+)'/) || [])[1];
if (!SWEEP && !FROM) { console.error('usage: node tests/daily-gate.mjs --from YYYY-MM-DD [--days N] [--diff 0,1,2] [--kit K] [--out DIR] [--bots]  |  --sweep N [--kit K]'); process.exit(2); }
if (KIT && !SC.KITS[KIT]) { console.error('no kit ' + KIT); process.exit(2); }

/* ---------- the sorties ---------- */
const sorties = []; /* { id, kit, date?, seed, sub, C, diffs, det, bots } */
if (SWEEP) {
  for (const kit of SC.KIT_ORDER.filter(k => !KIT || k === KIT)) for (let s = 0; s < SWEEP; s++) {
    const seed = (SC.hash(s, 9090) * 4294967296) | 0, C = SC.composeSortie(kit, seed, 0);
    sorties.push({ id: kit + '#' + s, kit, n: s, seed, sub: 0, C, diffs: s < ALL ? [0, 1, 2] : [1], det: s % DET === 0 ? 1 : -1, bots: s < BOT_SORTIES });
  }
} else {
  for (let i = 0; i < DAYS; i++) { const date = SC.dateKeyUTC(Date.parse(FROM + 'T00:00:00Z') + i * 86400000), C = SC.composeDaily(date, KIT || undefined);
    sorties.push({ id: date, kit: C.kit, date, seed: C.seed, sub: C.sub, C, diffs: DIFFS, det: DIFFS[0], bots: BOT_SORTIES > 0 }); }
}

/* ---------- gate 2 in Node (the plan; it does not depend on the difficulty) ---------- */
const tG = Date.now();
for (const S of sorties) { const r = checkPlan(PROBE[S.kit], S.C.segs, S.C.gen.seed, S.C.gen), K = SC.KITS[S.kit], over = [];
  for (const b of r.built || []) { const lim = (K.middle[b.t] || {}).built || K.fixedBuilt[b.t]; if (lim !== undefined && b.v > lim) over.push(b.t + ' ' + (100 * b.v).toFixed(0) + ' %'); }
  S.gate2 = { clean: !r.flags.length && !over.length, flags: r.flags.concat(over.length ? ['structures'] : []), notes: r.notes.concat(over.length ? ['structures over the limit: ' + over.join(', ')] : []), ms: Math.round(r.ms) }; }
const gate2S = (Date.now() - tG) / 1000;

/* ---------- the flight, in the game's scope (a string: block comments only) ----------
   spec: { date } or { kit, seed, sub }. bot: null for the human bot (immortal), or a skill profile (mortal). */
const FLY = `(function (spec, diff, bot, bseed, mortal, deadMin) {
  if (app.booting) finishBoot();
  if (app.cont > 0) app.cont = 0;
  SF.setMode(mortal ? 'real' : 'immortal'); SF.start(diff, 1);
  if (spec.date) startDaily(spec.date, spec.kit || undefined); else startComposed(SortieCompose.composeSortie(spec.kit, spec.seed, spec.sub | 0));
  if (bot) SF.skill(Object.assign({}, SF.SKILL[bot], { seed: bseed })); else SF.human(8, 15);
  const S = run.sortie, L0 = S.level, f0 = gf, sc0 = world.scroll, t0 = performance.now(), seen = new WeakSet(), sec = [], quiet = [], encs = [];
  let end = 'cap', bossF = -1, deadF = -1, kills = 0, q0 = -1, qc = 0, longest = [0, 0, 0], sh = 2166136261 | 0, spawns = 0, last = null, wing = false, livesAtBoss = null, f = 0;
  const segAt = function (c) { const g = S.segs.find(function (q) { return c >= q.start && c < q.start + q.n; }); return g ? g.t : (c >= S.len ? 'boss ground' : '?'); };
  const close = function (to) { if (q0 < 0) return; const len = to - q0; if (len > longest[1] * 60) longest = [Math.round(q0 / 6) / 10, Math.round(len / 6) / 10, qc]; if (len >= deadMin * 60) quiet.push([Math.round(q0 / 6) / 10, Math.round(len / 6) / 10, qc, segAt(qc)]); q0 = -1; };
  for (let step = 0; step < 60 * 60 * 25 / 10; step++) {
    const r = SF.run(10); if (r !== 'ok') { end = r; break; }
    if (!run.sortie || run.sortie.level !== L0) { end = 'next:' + (run.sortie ? run.sortie.level : 0); break; }
    f = gf - f0;
    for (const e of world.enemies) { if (seen.has(e)) continue; seen.add(e); spawns++; const s = e.type + '@' + gf + ':' + Math.round(e.x) + ',' + Math.round(e.y); for (let i = 0; i < s.length; i++) sh = Math.imul(sh ^ s.charCodeAt(i), 16777619); }
    const L = world.encLast; if (L && (!last || L.at !== last.at)) { last = L; if (L.id === 'wing') wing = true; else encs.push([L.id, L.why, L.dropped | 0]); }
    const boss = world.enemies.find(function (e) { return e.type === 'boss'; });
    if (boss && bossF < 0) { bossF = f; livesAtBoss = run.lives; close(f); }
    if (bossF >= 0 && deadF < 0 && boss && boss.dying) deadF = f;
    if (bossF >= 0 && deadF < 0 && f - bossF > 900 * 60) { end = 'boss-timeout'; break; }
    if (deadF >= 0 && f - deadF > 120 * 60) { end = 'no-title'; break; }
    if (bossF < 0) { kills = run.stats.kills; let on = 0;
      for (const e of world.enemies) { if (e.dead || e.dying || e.y < 0 || e.y > H || e.x < 0 || e.x > W) continue; on++; }
      if (on === 0 && world.ebul.length === 0 && !world.enc) { if (q0 < 0) { q0 = f; qc = Math.floor((world.scroll - sc0 + H / 2) / CH); } } else close(f); }
    if (step % 6 === 5) sec.push({ b: world.ebul.length, boss: bossF >= 0 });
    if (step % 36 === 0) world.parts.length = Math.min(world.parts.length, 300);
  }
  if (bossF < 0) close(f);
  const avg = function (a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : 0; }, pre = sec.filter(function (x) { return !x.boss; }).map(function (x) { return x.b; }), bins = [];
  for (let i = 0; i < pre.length; i += 10) bins.push(avg(pre.slice(i, i + 10)));
  const hits = SF.R.hits, preHits = hits.filter(function (h) { return !h.boss && h.why !== 'flame'; }).length;
  return { kit: S.daily && S.daily.kit, len: S.len, sc0: sc0, H: H, end: end, frames: f, wallMs: Math.round(performance.now() - t0), errs: SF.R.errs.slice(0, 2), errCount: SF.R.errs.length,
    bossIn: bossF < 0 ? null : +(bossF / 60).toFixed(1), bossSec: bossF >= 0 && deadF >= 0 ? +((deadF - bossF) / 60).toFixed(1) : null, bossKilled: deadF >= 0,
    hitsPre: preHits, hitsAll: hits.length, hitsPerMin: bossF > 0 ? +(preHits / (bossF / 3600)).toFixed(2) : null,
    window10: +Math.max.apply(null, bins.concat([0])).toFixed(1), preAvg: +avg(pre).toFixed(1), killsPerMin: bossF > 0 ? +(kills / (bossF / 3600)).toFixed(1) : null,
    longest: longest, quiet: quiet, planned: S.encPlan.map(function (e) { return e.id; }), encs: encs, wing: wing, spawns: spawns, spawnHash: (sh >>> 0).toString(16), score: run.score, state: app.state,
    livesAtBoss: livesAtBoss, cleared: deadF >= 0 && end !== 'continue-screen' && end !== 'cap', perMin: +(hits.length / (Math.max(60, deadF >= 0 ? deadF : f) / 3600)).toFixed(2) };
})`;

const browser = await chromium.launch();
async function newPage(rseed, withSkill) {
  const page = await browser.newPage({ viewport: VIEW }); page.errs = [];
  page.on('pageerror', e => page.errs.push(String(e && e.message || e).slice(0, 200)));
  await page.route(/workers\.dev/, r => r.abort());
  await page.addInitScript(s => { let a = s; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; window.requestAnimationFrame = () => 0; }, rseed);
  await page.goto(PAGE);
  await page.waitForFunction(() => typeof window.__sf === 'function', null, { polling: 100, timeout: 60000 });
  await page.evaluate(src => window.__sf(src), harness);
  if (withSkill) await page.evaluate(src => window.__sf(src), skill);
  return page;
}
async function fly(page, job) {
  const S = job.S, spec = S.date ? { date: S.date, kit: KIT || null } : { kit: S.kit, seed: S.seed, sub: S.sub }, n0 = page.errs.length;
  const a = [JSON.stringify(spec), job.diff, JSON.stringify(job.bot || null), job.bseed || 0, !!job.bot, DEAD];
  let r; try { r = await page.evaluate(([code, a]) => window.SF.peek(code + '(' + a.join(',') + ')'), [FLY, a]); } catch (e) { r = { end: 'evaluate-threw', errs: [String(e.message).slice(0, 200)], errCount: 1, encs: [], planned: [], quiet: [], longest: [0, 0, 0] }; }
  r.pageErrs = page.errs.slice(n0); return r;
}
/* a pool over pages: each worker owns one page; queueFor(i) gives worker i its jobs (a shared queue, or its own) */
async function pool(pages, take, done) {
  await Promise.all(pages.map(async (page, i) => { for (let job; (job = take(i));) { job.r = await fly(page, job); job.page = i; done(job); } }));
}
const tick = () => process.stderr.write('.');

/* ---------- human-bot flights, then the determinism twins on the other page ---------- */
const tAll = Date.now();
const human = []; for (const S of sorties) for (const diff of S.diffs) human.push({ S, diff });
const hp = await Promise.all(Array.from({ length: CONC }, (_, i) => newPage([11, 9999, 4242, 77][i % 4], false)));
{ let next = 0; await pool(hp, () => human[next++], tick); }
const twins = human.filter(j => j.diff === j.S.det).map(j => ({ S: j.S, diff: j.diff, of: j }));
{ const q = hp.map(() => []); for (const t of twins) q[(t.of.page + 1) % hp.length].push(t); await pool(hp, i => q[i].shift(), tick); }
for (const p of hp) await p.close();
const tHuman = Date.now() - tAll;

/* ---------- skill bots (own pages: SF.skill hooks the page for good) ---------- */
const bots = []; for (const S of sorties) if (S.bots) for (const bot of BOTS) for (let s = 1; s <= BOT_SEEDS; s++) bots.push({ S, diff: OWN[bot], bot, bseed: s });
const tB = Date.now();
if (bots.length) { const bp = await Promise.all(Array.from({ length: CONC }, (_, i) => newPage(11 + i, true))); let next = 0; await pool(bp, () => bots[next++], tick); for (const p of bp) await p.close(); }
const tBots = Date.now() - tB;
process.stderr.write('\n'); await browser.close();

/* ---------- judge ---------- */
const range = (kit, diff, key) => ((BASE.kits[kit] || {}).byDiff || {})[NAMES[diff]] ? BASE.kits[kit].byDiff[NAMES[diff]][key] : null;
const mark = (v, rg) => v === null || v === undefined || !rg ? '-' : v < rg[0] ? 'low' : v > rg[1] ? 'high' : 'in';
const twinOf = new Map(twins.map(t => [t.of, t]));
for (const j of human) { const r = j.r, S = j.S, why = [];
  if (r.errCount || r.pageErrs.length) why.push('error');
  if (!S.gate2.clean) why.push('gate2');
  if (r.bossIn === null) why.push('no-boss'); else if (!r.bossKilled) why.push('boss-not-killed');
  if (r.end !== 'state:title') why.push('not-title');
  const encBad = r.planned.some((id, i) => !r.encs[i] || r.encs[i][0] !== id || r.encs[i][1] !== 'done') || r.encs.length !== r.planned.length; if (encBad) why.push('encounter');
  if (!r.wing) why.push('no-wing');
  if (r.quiet.some(q => q[1] > DEAD)) why.push('dead-air');
  const t = twinOf.get(j); if (t) { const b = t.r; j.det = { same: r.spawns === b.spawns && r.spawnHash === b.spawnHash && r.score === b.score && r.end === b.end && r.frames === b.frames, b: [b.spawns, b.score, b.end, b.frames] }; if (!j.det.same) why.push('determinism'); }
  j.why = why; j.pass = !why.length;
  j.marks = { hitsPerMin: mark(r.hitsPerMin, range(S.kit, j.diff, 'hitsPerMin')), window10: mark(r.window10, range(S.kit, j.diff, 'window10')), preAvg: mark(r.preAvg, range(S.kit, j.diff, 'preAvg')), killsPerMin: mark(r.killsPerMin, range(S.kit, j.diff, 'killsPerMin')) }; }

/* ---------- print ---------- */
const f1 = (v, n = 1) => v === null || v === undefined || !Number.isFinite(+v) ? '-' : (+v).toFixed(n);
console.log(`Daily Sortie flight gate, build ${VERSION}, composer v${SC.VERSION}, human bot (8, 15) immortal, viewport ${VIEW.width}x${VIEW.height}, dead air > ${DEAD} s, ${CONC} pages`);
console.log('sortie            kit     diff     len gate2  boss in  boss s  hits/min      window        bullets       kills/min      quiet s (at s, chunk)    encounters                         det   verdict');
for (const j of human) { const r = j.r, S = j.S, q = r.longest, m = j.marks;
  const enc = r.encs.map(e => e[0] + ':' + e[1] + (e[2] ? '/' + e[2] : '')).join(',') + (r.wing ? ' +wing' : ' NO WING');
  console.log(`${(S.date || S.id).padEnd(17)} ${S.kit.padEnd(7)} ${NAMES[j.diff].padEnd(8)} ${String(S.C.len).padStart(3)} ${(S.gate2.clean ? 'ok' : 'BAD').padEnd(5)} ${f1(r.bossIn).padStart(7)} ${f1(r.bossSec).padStart(7)}  ${(f1(r.hitsPerMin, 2) + ' ' + m.hitsPerMin).padEnd(12)}  ${(f1(r.window10) + ' ' + m.window10).padEnd(12)}  ${(f1(r.preAvg) + ' ' + m.preAvg).padEnd(12)}  ${(f1(r.killsPerMin) + ' ' + m.killsPerMin).padEnd(13)}  ${(q[1] + ' (' + q[0] + ', c' + q[2] + ')').padEnd(23)}  ${enc.padEnd(34)} ${j.det ? (j.det.same ? 'same' : 'DIFF') : '  - '}  ${j.pass ? 'PASS' : 'FAIL ' + j.why.join(',')}`);
  if (!j.pass) { if (!S.gate2.clean) console.log('      gate 2: ' + S.gate2.notes.join('; ')); if (r.errCount || r.pageErrs.length) console.log('      errors: ' + r.errs.concat(r.pageErrs).slice(0, 2).join(' | '));
    if (j.why.includes('dead-air')) console.log('      dead air: ' + r.quiet.filter(x => x[1] > DEAD).map(x => `${x[1]} s from ${x[0]} s at chunk ${x[2]} (${x[3]})`).join('; '));
    if (j.why.includes('encounter')) console.log('      planned ' + r.planned.join(',') + '; ran ' + r.encs.map(e => e.join(':')).join(','));
    if (j.det && !j.det.same) console.log(`      determinism: spawns ${r.spawns}/${j.det.b[0]}, score ${r.score}/${j.det.b[1]}, end ${r.end}/${j.det.b[2]}, frames ${r.frames}/${j.det.b[3]}`); } }

/* the skill bots: per sortie and bot */
const botCells = [];
if (bots.length) { console.log('\nskill bots, mortal, own difficulty, ' + BOT_SEEDS + ' bot seeds each: cleared share, deaths per minute flown (median), lives when the boss comes (median, n reached)');
  for (const S of sorties) { if (!S.bots) continue; const parts = [];
    for (const bot of BOTS) { const fs = bots.filter(b => b.S === S && b.bot === bot).map(b => b.r), lab = fs.filter(r => r.livesAtBoss !== null && r.livesAtBoss !== undefined).map(r => r.livesAtBoss);
      const c = { S, bot, cleared: fs.filter(r => r.cleared).length / fs.length, perMin: med(fs.map(r => r.perMin)), lives: lab.length ? med(lab) : null, reached: lab.length, errs: fs.reduce((a, r) => a + (r.errCount || 0) + r.pageErrs.length, 0), flights: fs };
      botCells.push(c); parts.push(`${bot} ${c.cleared.toFixed(2)} ${f1(c.perMin, 2)}/min lives ${c.lives === null ? '-' : c.lives} n${c.reached}${c.errs ? ' ERRORS ' + c.errs : ''}`); }
    console.log(`${(S.date || S.id).padEnd(17)} ${S.kit.padEnd(7)} ` + parts.join('  |  ')); } }
function med(a) { a = a.filter(v => v !== null && v !== undefined).sort((x, y) => x - y); return a.length ? (a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : null; }
const pct = (a, p) => { a = a.filter(v => v !== null && v !== undefined).sort((x, y) => x - y); if (!a.length) return null; const i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return +(a[lo] + (a[hi] - a[lo]) * (i - lo)).toFixed(2); };

/* ---------- summary ---------- */
const kitsRun = [...new Set(sorties.map(S => S.kit))];
console.log('\nsummary');
const fails = human.filter(j => !j.pass);
console.log(`flights ${human.length} (+ ${twins.length} determinism twins, ${bots.length} skill-bot flights); ${fails.length} FAIL; gate 2 ${gate2S.toFixed(0)} s, human flights ${(tHuman / 1000).toFixed(0)} s, bots ${(tBots / 1000).toFixed(0)} s, all ${((Date.now() - tAll) / 1000 + gate2S).toFixed(0)} s`);
const summary = { kits: {} };
for (const kit of kitsRun) { const K = summary.kits[kit] = { byDiff: {} };
  const sortiesK = sorties.filter(S => S.kit === kit);
  /* failures per sortie: a sortie fails when any of its flights does (dates: on any difficulty; sweep: counted on Veteran, the other difficulties apart) */
  const failedS = sortiesK.filter(S => human.some(j => j.S === S && !j.pass)), causes = {};
  for (const S of sortiesK) { const w = new Set(human.filter(j => j.S === S).flatMap(j => j.why)); for (const c of w) (causes[c] = causes[c] || []).push(S.date || S.id); }
  K.sorties = sortiesK.length; K.failed = failedS.length; K.causes = Object.fromEntries(Object.entries(causes).map(([c, l]) => [c, { n: l.length, examples: l.slice(0, 2) }]));
  console.log(`${kit}: ${failedS.length} of ${sortiesK.length} sorties fail (any difficulty)` + (Object.keys(causes).length ? ': ' + Object.entries(causes).sort((a, b) => b[1].length - a[1].length).map(([c, l]) => `${c} ${l.length} (${l.slice(0, 2).join(', ')})`).join('; ') : ''));
  for (const diff of [0, 1, 2]) { const js = human.filter(j => j.S.kit === kit && j.diff === diff); if (!js.length) continue; const rs = js.map(j => j.r), B = (BASE.kits[kit] || {}).byDiff[NAMES[diff]] || {};
    const fd = js.filter(j => !j.pass), cd = {}; for (const j of fd) for (const c of j.why) cd[c] = (cd[c] || 0) + 1;
    const lg = rs.map(r => r.longest[1]), D = K.byDiff[NAMES[diff]] = { flights: js.length, failed: fd.length, causes: cd };
    for (const key of ['hitsPerMin', 'window10', 'preAvg', 'killsPerMin', 'bossIn', 'bossSec']) D[key] = { p5: pct(rs.map(r => r[key]), 0.05), p50: pct(rs.map(r => r[key]), 0.5), p95: pct(rs.map(r => r[key]), 0.95), base: B[key] || null,
      low: js.filter(j => j.marks[key] === 'low').length, high: js.filter(j => j.marks[key] === 'high').length };
    D.longestQuiet = { p50: pct(lg, 0.5), p95: pct(lg, 0.95), max: Math.max(...lg), over: { 5: lg.filter(x => x > 5).length, 7: lg.filter(x => x > 7).length, 10: lg.filter(x => x > 10).length, 15: lg.filter(x => x > 15).length, 20: lg.filter(x => x > 20).length } };
    const where = {}; for (const r of rs) for (const q of r.quiet) { const k = q[3]; where[k] = (where[k] || 0) + 1; } D.quietWhere = where;
    const fromBoss = rs.flatMap(r => r.quiet.filter(q => q[1] > DEAD).map(q => +(r.bossIn - q[0] - q[1]).toFixed(1))); D.deadEndsBeforeBoss = fromBoss.length ? { p50: pct(fromBoss, 0.5), min: Math.min(...fromBoss), max: Math.max(...fromBoss) } : null;
    console.log(`  ${NAMES[diff].padEnd(7)} ${js.length} flights, ${fd.length} FAIL${fd.length ? ' (' + Object.entries(cd).map(([c, n]) => c + ' ' + n).join(', ') + ')' : ''}`);
    for (const key of ['hitsPerMin', 'window10', 'preAvg', 'killsPerMin']) { const x = D[key]; console.log(`    ${key.padEnd(12)} p5 ${f1(x.p5, 2)}  p50 ${f1(x.p50, 2)}  p95 ${f1(x.p95, 2)}   level ${x.base ? x.base.join(' to ') : '-'}   low ${x.low}, high ${x.high}`); }
    console.log(`    longest quiet stretch (s): p50 ${D.longestQuiet.p50}, p95 ${D.longestQuiet.p95}, max ${D.longestQuiet.max}; over 5/7/10/15/20 s: ${Object.values(D.longestQuiet.over).join('/')}; stretches >= ${DEAD} s by segment: ${JSON.stringify(where)}${D.deadEndsBeforeBoss ? `; dead air ends ${D.deadEndsBeforeBoss.min} to ${D.deadEndsBeforeBoss.max} s (median ${D.deadEndsBeforeBoss.p50}) before the boss` : ''}`); }
  const bc = botCells.filter(c => c.S.kit === kit); if (bc.length) { K.bots = {};
    for (const bot of BOTS) { const cs = bc.filter(c => c.bot === bot), fl = cs.flatMap(c => c.flights), lab = fl.map(r => r.livesAtBoss).filter(v => v !== null && v !== undefined);
      const x = K.bots[bot] = { sorties: cs.length, flights: fl.length, cleared: +(fl.filter(r => r.cleared).length / fl.length).toFixed(2), clearedPerSortie: { p5: pct(cs.map(c => c.cleared), 0.05), p50: pct(cs.map(c => c.cleared), 0.5), p95: pct(cs.map(c => c.cleared), 0.95) },
        perMin: { p5: pct(fl.map(r => r.perMin), 0.05), p50: pct(fl.map(r => r.perMin), 0.5), p95: pct(fl.map(r => r.perMin), 0.95) }, livesAtBoss: { p5: pct(lab, 0.05), p50: pct(lab, 0.5), p95: pct(lab, 0.95), reached: lab.length }, errs: cs.reduce((a, c) => a + c.errs, 0) };
      console.log(`  bot ${bot.padEnd(8)} ${NAMES[OWN[bot]].padEnd(7)} cleared ${x.cleared} of ${x.flights} flights (per sortie p5/p50/p95 ${x.clearedPerSortie.p5}/${x.clearedPerSortie.p50}/${x.clearedPerSortie.p95}); deaths/min p5/p50/p95 ${x.perMin.p5}/${x.perMin.p50}/${x.perMin.p95}; lives at boss p5/p50/p95 ${x.livesAtBoss.p5}/${x.livesAtBoss.p50}/${x.livesAtBoss.p95} (n ${x.livesAtBoss.reached})${x.errs ? '; ERRORS ' + x.errs : ''}`); } } }

/* ---------- failing dates: cause, and with --out the contact sheet ---------- */
if (OUT && OUT !== true && fails.length) { mkdirSync(OUT, { recursive: true });
  for (const S of sorties) { const js = human.filter(j => j.S === S && !j.pass); if (!js.length) continue; const name = (S.date || S.id.replace('#', '-'));
    writeFileSync(`${OUT}/fail-${name}.json`, JSON.stringify({ sortie: S.date || S.id, kit: S.kit, seed: S.seed, sub: S.sub, segs: S.C.segs, encPlan: S.C.encPlan, gate2: S.gate2, flights: js.map(j => ({ diff: NAMES[j.diff], why: j.why, det: j.det, r: j.r })) }, null, 1));
    if (S.date) { const c = spawnSync(process.execPath, [new URL('./contact.mjs', import.meta.url).pathname, OUT, `daily:${S.date}:${S.kit}:${S.sub}`, '12'], { encoding: 'utf8' }); if (c.status) console.log(`contact sheet for ${S.date} failed: ${(c.stderr || '').slice(0, 200)}`); } }
  console.log(`causes${sorties.some(S => S.date) ? ' and contact sheets' : ''} written to ${OUT}`); }
if (SAVE && SAVE !== true) {
  writeFileSync(SAVE, JSON.stringify({ about: 'Daily Sortie flight gate (tests/daily-gate.mjs --save)', version: VERSION, composer: SC.VERSION, dead: DEAD, sweep: SWEEP, timing: { gate2S, humanS: tHuman / 1000, botsS: tBots / 1000 }, summary,
    flights: human.map(j => ({ sortie: j.S.date || j.S.id, kit: j.S.kit, seed: j.S.seed, diff: j.diff, pass: j.pass, why: j.why, marks: j.marks, det: j.det, gate2: j.S.gate2.clean ? true : j.S.gate2.notes, r: Object.assign({}, j.r, { errs: j.r.errs }) })),
    bots: bots.map(b => ({ sortie: b.S.date || b.S.id, kit: b.S.kit, bot: b.bot, bseed: b.bseed, cleared: b.r.cleared, perMin: b.r.perMin, livesAtBoss: b.r.livesAtBoss, end: b.r.end, errs: b.r.errCount + b.r.pageErrs.length })) }, null, 1) + '\n');
  console.log('saved ' + SAVE); }
process.exit(fails.length ? 1 : 0);
