// The Daily Sortie in the game (docs/daily-sortie-plan.md, phase 2): a composed level behind the test link ?daily=YYYY-MM-DD.
// Needs Node and Playwright; serve the folder first (python3 -m http.server 8000).
//   node tests/daily.mjs             prints only failures and the number of checks that passed
//   node tests/daily.mjs --verbose   also every check that passes, with what it measured
// Checks:
//   1. the link: with ?daily, START flies that day's sortie (the composer's segments, the kit's level, not ranked); &kit and &sub force a kit
//      and a sub-seed; without the link START is the Campaign. The plan is the one Node makes from the composer's output, and the ground
//      types are the plan's.
//   2. one sortie per kit flown to its end by the bot in two pages whose own Math.random differs: the same spawns, score and end; the boss
//      dies; every planned encounter runs to its end and the Shadow Wing comes; back at the title; no errors. And it never counts: not
//      eligible for the board, the best score and the loop count untouched, no play-data report.
//   3. a run saved mid-flight and loaded in a fresh page goes on exactly (every 60 frames, as tests/resume-exact.mjs compares); a record of
//      another composer version is not resumed.
//   4. nothing is left behind: a Campaign level flown afterwards in the same page plays as in a fresh page.
//   6. the rating: after a Daily Sortie's results and the title, a 1 to 5 star question, once per date and version; a star is kept and (on a local build) held in
//      app.rateLast instead of being sent; Skip and Escape ask nothing more and store nothing; a date already rated is not asked again.
//   5. the entry (phase 4): without any link, the Daily Sortie row in Settings (at the title only; it names the day's kit) opens the difficulty picker, and
//      the pick starts that UTC day's sortie (also at 23:59 UTC); the title is as before (START, SCORES, trophy); the Daily Sortie's results screen shows the run's totals.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const SC = require('../tools/sortie-compose.js'), CG = require('../tools/citygen.js');

const PAGE = process.env.STARFALL_URL || 'http://localhost:8000/';
const harness = readFileSync(new URL('./harness.js', import.meta.url), 'utf8');
const verbose = process.argv.includes('--verbose');
let bad = 0, passed = 0;
const ok = (cond, msg) => { if (cond) { passed++; if (verbose) console.log('ok   ' + msg); } else { bad++; console.error('FAIL ' + msg); } return cond; };
const DAYS = { desert: '2026-11-15', forest: '2026-11-16', winter: '2026-11-14' }; // one date per kit (the rotation)
const fnv = a => { let h = 2166136261; for (let i = 0; i < a.length; i++) { h = Math.imul(h ^ (a[i] & 0xffff), 16777619); h = Math.imul(h ^ (a[i] >>> 16), 16777619); } return (h >>> 0).toString(16); };
const FNV = `function (a) { let h = 2166136261; for (let i = 0; i < a.length; i++) { h = Math.imul(h ^ (a[i] & 0xffff), 16777619); h = Math.imul(h ^ (a[i] >>> 16), 16777619); } return (h >>> 0).toString(16); }`;
const browser = await chromium.launch();

/* the page's own Math.random seeded with pageSeed: it stands in for the device, which a Daily Sortie must not depend on */
async function freshPage(pageSeed, query = '') {
  const page = await browser.newPage({ viewport: { width: 400, height: 700 } });
  await page.route(/workers\.dev/, r => r.abort());
  page.on('pageerror', e => { bad++; console.error('page error:', e.message); });
  await page.addInitScript(s => {
    let a = s;
    Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    window.requestAnimationFrame = () => 0;
  }, pageSeed);
  await page.goto(PAGE + query);
  await page.waitForFunction(() => typeof window.__sf === 'function', null, { polling: 100, timeout: 60000 });
  await page.evaluate(h => window.__sf(h), harness);
  await page.evaluate(() => window.SF.peek('app.booting && finishBoot(), 0'));
  return page;
}
const peek = (page, code) => page.evaluate(c => window.SF.peek(c), code);

// ---------- 1. the test link, the plan and the ground ----------
const START = `(() => { const q = id => document.getElementById(id); startOrOffer(); q('diffAsk').querySelector('[data-d="1"]').click(); const S = run.sortie, P = S && sortiePlan(S), hs = ${FNV};
  const o = { state: app.state, ranked: run.ranked, level: S && S.level, daily: S && S.daily, segs: S && JSON.stringify(S.segs.map(g => [g.t, g.start, g.n])), enc: S && JSON.stringify(S.encPlan), len: S && S.len, bossAt: S && S.bossAt, stage: run.stage, theme: world.curTheme, msg: app.msg && app.msg.a,
    seed: run.seed, salt: world.ttSalt, worldSeed: world.SEED, eligible: lbEligible(), variant: S && [S.variant, S.autumn, S.winter, S.haze, S.moon].join() };
  if (P && S.daily) { o.L = P.L; o.mx = hs(Array.from(P.mx, v => Math.round(v * 16))); o.U = hs(Array.from(P.U, v => Math.round(v * 1000))); o.items = hs(P.items.map(it => Math.round(it.x0) * 9973 + Math.round(it.y0))) + ':' + P.items.length; let n = 0, types = 0; for (let y = 0; y < P.L; y += 37) { const wy = S.planY0 - y; for (let x = 5; x < W; x += 29) { n++; if (terrainType(x, wy) !== CityGen.typeAt(P, x, y)) types++; } } o.n = n; o.types = types; o.c1 = S.planC1; }
  return o; })()`;
for (const kit of SC.KIT_ORDER) { const date = DAYS[kit], page = await freshPage(11, '?daily=' + date), r = await peek(page, START), C = SC.composeDaily(date), K = SC.KITS[kit];
  ok(SC.dailySeed(date).kit === kit, `${date} is a ${kit} day`);
  ok(r.state === 'play' && r.daily && r.daily.date === date && r.daily.kit === kit && r.daily.seed === C.seed && r.daily.sub === 0 && r.daily.v === SC.VERSION, `?daily=${date}: START flies that day's sortie (${r.daily && r.daily.kit}, ${r.state})`);
  ok(r.level === K.level && r.ranked === false && !r.eligible && r.msg === 'DAILY SORTIE' && r.variant === '0,false,false,false,false', `${kit}: level ${r.level}'s boss and theme, not ranked, the first pass's rules (${r.variant})`);
  ok(r.segs === JSON.stringify(C.segs.map(g => [g.t, g.start, g.n])) && r.len === C.len && r.enc === JSON.stringify(C.encPlan), `${kit}: the composer's ${C.segs.length} segments (${C.len} chunks) and ${C.encPlan.length} encounters, as Node composes them`);
  ok(r.bossAt > r.len && r.bossAt <= r.len + 8, `${kit}: the boss trigger ${r.bossAt - r.len} chunks past the level's end`);
  ok(r.seed === (C.base >>> 0) && r.salt === (C.base | 0) && r.worldSeed === 1944, `${kit}: its own stream and timetable seed (${r.seed}), the Campaign's ground seed beyond the plan (${r.worldSeed})`);
  const P = CG.generate(C.gen);
  /* (the game digs its tank pits and gun nests into the plan afterwards, so the rasters differ there; the road, the density and every building are compared) */
  ok(r.L === P.L && r.mx === fnv(Array.from(P.mx, v => Math.round(v * 16))) && r.U === fnv(Array.from(P.U, v => Math.round(v * 1000))) && r.items === fnv(P.items.map(it => Math.round(it.x0) * 9973 + Math.round(it.y0))) + ':' + P.items.length && r.L === (C.len + C.arena) * 64 && r.c1 === C.len + C.arena, `${kit}: the plan is the one Node makes from the composer's output (${r.L} rows, ${P.items.length} buildings, the same road)`);
  ok(r.n > 500 && r.types === 0, `${kit}: the ground types are the plan's (${r.types} of ${r.n} sampled points differ)`);
  await page.close(); }
{ const page = await freshPage(11, '?daily=2026-11-15&kit=forest&sub=3'), r = await peek(page, START), C = SC.composeDaily('2026-11-15', 'forest', 3);
  ok(r.daily && r.daily.kit === 'forest' && r.daily.sub === 3 && r.level === 4 && r.segs === JSON.stringify(C.segs.map(g => [g.t, g.start, g.n])), `&kit=forest&sub=3 forces the kit and the sub-seed (${r.daily && r.daily.kit}, sub ${r.daily && r.daily.sub})`); await page.close();
  const page2 = await freshPage(11), r2 = await peek(page2, START);
  ok(r2.level === 1 && r2.ranked === true && r2.daily === null && r2.salt === 0 && r2.seed === 1944, `without the link START is the Campaign (level ${r2.level}, ranked ${r2.ranked}, seed ${r2.seed})`); await page2.close(); }

// ---------- 2. flown to the end in two pages; it never counts ----------
const FLY = (kit, date) => `(() => { SF.setMode('immortal'); SF.start(1, 1); let posts = 0; const rp = rrPost; rrPost = function () { posts++; }; const hi0 = hi, loops0 = loopsWon, best0 = store.get(KEY.hi), lstore0 = store.get(KEY.loops);
  startDaily('${date}'); SF.human(8, 15); const S = run.sortie, seen = new WeakSet(), spawns = [], encs = []; let end = 'cap', last = null, wing = false, elig = false, rec = null, bossF = -1, f = 0, score = 0;
  for (let i = 0; i < 14000; i++) { const st = SF.run(10); f += 10; if (st !== 'ok') { end = st; break; } score = run.score;
    for (const e of world.enemies) { if (seen.has(e)) continue; seen.add(e); spawns.push(e.type + '@' + gf + ':' + Math.round(e.x) + ',' + Math.round(e.y)); }
    const L = world.encLast; if (L && (!last || L.at !== last.at)) { last = L; if (L.id === 'wing') wing = true; else encs.push(L.id + ':' + L.why + ':' + L.dropped); }
    if (lbEligible()) elig = true; if (bossF < 0 && world.bossSpawned) bossF = f; if (i === 300) { snapNow(); saveResume(); rec = JSON.parse(localStorage.getItem('starfall-resume') || 'null'); }
    if (i % 36 === 0) world.parts.length = Math.min(world.parts.length, 300); }
  rrPost = rp; const st = Object.values(SF.R.stages)[0] || {};
  return JSON.stringify({ end, f, bossF, bossDead: st.bossDead, kills: st.kills, score, spawns, encs, wing, planned: S.encPlan.map(e => e.id), errs: SF.R.errs.slice(0, 2), hits: SF.R.hits.length, elig, posts, hi: hi === hi0, loops: loopsWon === loops0, stored: store.get(KEY.hi) === best0 && store.get(KEY.loops) === lstore0,
    state: app.state, sortie: run.sortie === null, rec: rec && rec.sortie, recRanked: rec && rec.ranked, resumeLeft: localStorage.getItem('starfall-resume') }); })()`;
const pageA = await freshPage(11), pageB = await freshPage(9999);
for (const kit of SC.KIT_ORDER) { const date = DAYS[kit], a = JSON.parse(await peek(pageA, FLY(kit, date))), b = JSON.parse(await peek(pageB, FLY(kit, date)));
  const firstDiff = a.spawns.findIndex((s, i) => s !== b.spawns[i]);
  ok(a.spawns.length > 100 && firstDiff < 0 && a.spawns.length === b.spawns.length, `${kit}: two devices get the same ${a.spawns.length} spawns over the whole sortie${firstDiff >= 0 ? ' (first difference: ' + a.spawns[firstDiff] + ' / ' + b.spawns[firstDiff] + ')' : ''}`);
  ok(a.score === b.score && a.f === b.f && a.hits === b.hits, `${kit}: the same score (${a.score}), length (${a.f} frames) and hits (${a.hits})${a.score === b.score ? '' : ' / ' + b.score}`);
  ok(a.bossF > 0 && a.bossDead !== null && a.bossDead !== undefined && a.end === 'state:title' && a.state === 'title' && a.sortie, `${kit}: the boss comes after ${(a.bossF / 60).toFixed(0)} s and dies; then the title, not another level (${a.end})`);
  ok(a.errs.length === 0, `${kit}: no errors in ${a.f} frames` + (a.errs.length ? ': ' + a.errs[0] : ''));
  ok(a.wing && a.encs.length === a.planned.length && a.encs.every((e, i) => e.startsWith(a.planned[i] + ':done:')), `${kit}: the Shadow Wing comes and every planned encounter runs to its end (${a.encs.join(', ') || 'none planned'})`);
  ok(!a.elig && a.posts === 0 && a.hi && a.loops && a.stored, `${kit}: it never counts (board ${a.elig}, reports ${a.posts}, best kept ${a.hi}, loops kept ${a.loops}, stored values kept ${a.stored})`);
  ok(a.rec && a.rec.daily && a.rec.daily.date === date && a.rec.daily.kit === kit && a.rec.daily.v === SC.VERSION && a.recRanked === false && a.resumeLeft === null, `${kit}: saved as a Daily Sortie ({daily: date, kit, seed, sub, v}); nothing to resume after its end`); }

// ---------- 3. resume ----------
const DUMP = `(() => {
  const COSMETIC = ['birdCd', 'rainT', 'rainF', 'rainCd', 'lightCd', 'flashL'];
  const r = v => typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v;
  const flat = (o, skip = []) => { const out = {}; for (const k of Object.keys(o)) { const v = o[k]; if (skip.includes(k) || typeof v === 'function' || (v && typeof v === 'object')) continue; out[k] = r(v); } return out; };
  const ent = e => Object.assign(flat(e), e.parts ? { parts: e.parts.map(q => flat(q)) } : {});
  return JSON.stringify({ gf, simS, drandS, scroll: r(world.scroll), director: flat(world, COSMETIC), enc: world.enc ? flat(world.enc) : null, run: flat(run), stats: flat(run.stats), player: flat(player),
    enemies: world.enemies.map(ent), ebul: world.ebul.map(b => flat(b)), shots: world.shots.map(b => flat(b)), items: world.items.map(b => flat(b)), segs: JSON.stringify(run.sortie.segs), daily: JSON.stringify(run.sortie.daily) });
  })()`;
for (const kit of SC.KIT_ORDER) { const date = DAYS[kit], A = await freshPage(21);
  const R = JSON.parse(await peek(A, `(() => { SF.setMode('immortal'); SF.start(1, 1); startDaily('${date}'); SF.human(8, 15); SF.run(4200); snapNow(); saveResume(); const rec = localStorage.getItem('starfall-resume');
    const samples = [${DUMP}]; for (let f = 0; f < 1500; f += 60) { const st = SF.run(60); samples.push(${DUMP}); if (st !== 'ok') break; } return JSON.stringify({ rec, samples }); })()`)); await A.close();
  const rec = JSON.parse(R.rec || 'null'); if (!ok(rec && rec.snap && rec.sortie && rec.sortie.daily, `${kit}: the resume record has a snapshot and the sortie's {daily}`)) continue;
  const B = await freshPage(77);
  const G = JSON.parse(await peek(B, `(() => { SF.setMode('immortal'); SF.human(8, 15); store.set(KEY.resume, ${JSON.stringify(R.rec)}); resumeRun(loadResume()); const exact = app.resumeT === 180 && !app.paused; for (let i = 0; i < 180; i++) update();
    const samples = [${DUMP}]; for (let f = 0; f < 1500; f += 60) { const st = SF.run(60); samples.push(${DUMP}); if (st !== 'ok') break; } return JSON.stringify({ exact, samples, ranked: run.ranked, salt: world.ttSalt }); })()`));
  let first = -1; for (let i = 0; i < Math.min(R.samples.length, G.samples.length); i++) if (R.samples[i] !== G.samples[i]) { first = i; break; }
  let why = ''; if (first >= 0) { const x = JSON.parse(R.samples[first]), y = JSON.parse(G.samples[first]); why = Object.keys(x).filter(k => JSON.stringify(x[k]) !== JSON.stringify(y[k])).join(', '); }
  ok(G.exact && first < 0 && R.samples.length === G.samples.length && G.ranked === false, `${kit}: saved at frame 4200 and loaded in a fresh page, ${G.samples.length} samples over 1500 frames identical${first >= 0 ? ' (first difference at sample ' + first + ': ' + why + ')' : ''}`);
  if (kit === 'desert') { const old = JSON.parse(JSON.stringify(rec)); old.sortie.daily.v = SC.VERSION + 1;
    const r = await peek(B, `(() => { toTitle(); store.set(KEY.resume, ${JSON.stringify(JSON.stringify(old))}); const rr = loadResume(); if (rr) resumeRun(rr); return { state: app.state, sortie: !!run.sortie }; })()`);
    ok(r.state === 'title', `a record of another composer version is not resumed (${r.state})`); }
  await B.close(); }

// ---------- 4. nothing left behind: a Campaign level afterwards plays as in a fresh page ----------
const CAMP = lv => `(() => { SF.setMode('immortal'); SF.start(1, 1); startEnigma(${lv}, true); SF.human(8, 15); const seen = new WeakSet(), spawns = []; const S = run.sortie, o = { daily: S.daily, compose: S.compose, salt: world.ttSalt, seed: run.seed };
  for (let f = 0; f < 3000; f += 10) { const st = SF.run(10); for (const e of world.enemies) { if (seen.has(e)) continue; seen.add(e); spawns.push(e.type + '@' + gf + ':' + Math.round(e.x) + ',' + Math.round(e.y)); } if (st !== 'ok') break; }
  o.spawns = spawns; o.end = [gf, simS, run.score, Math.round(player.x), Math.round(player.y), world.enemies.length, world.ebul.length].join(' '); return JSON.stringify(o); })()`;
{ const fresh = await freshPage(11);
  for (const lv of [2, 4, 5]) { const a = JSON.parse(await peek(pageA, CAMP(lv))), b = JSON.parse(await peek(fresh, CAMP(lv))), d = a.spawns.findIndex((s, i) => s !== b.spawns[i]);
    ok(a.daily === null && a.compose === null && a.salt === 0 && a.seed === 1944, `level ${lv} after the daily sorties: a Campaign sortie again (seed ${a.seed}, no daily, timetable salt ${a.salt})`);
    ok(d < 0 && a.spawns.length === b.spawns.length && a.end === b.end, `level ${lv} after the daily sorties plays as in a fresh page (${a.spawns.length} spawns, end ${a.end}${a.end === b.end ? '' : ' / ' + b.end})`); }
  await fresh.close(); }


// ---------- 5. the title entry ----------
/* the title's buttons are drawn on the canvas: click where the game puts them (game coordinates, the same constants the game hit-tests with) */
const AT = (name) => `(() => { const r = cv.getBoundingClientRect(), b = ${name}; return JSON.stringify({ x: r.left + b[0] / W * r.width, y: r.top + (b[1] + TY) / H * r.height, state: app.state, diff: document.getElementById('diffAsk').classList.contains('open') }); })()`;
const BTN = { scores: '[W / 2, SCORES_Y + SCORES_BTN.h / 2]', start: '[W / 2, START_BTN.y + START_BTN.h / 2]' };
async function clickTitle(page, which) { const c = JSON.parse(await peek(page, AT(BTN[which]))); await page.mouse.click(c.x, c.y); await page.waitForTimeout(50); }
const STATE = `JSON.stringify({ state: app.state, diff: document.getElementById('diffAsk').classList.contains('open'), kind: app.diffNext && app.diffNext.kind, title: document.getElementById('diffTitle').textContent, note: document.getElementById('dNote').textContent, lb: !!app.lbOpen, daily: run.sortie && run.sortie.daily, ranked: run.ranked, seed: run.sortie && run.sortie.seed, today: dailyToday() })`;
for (const [at, kit] of [['2026-11-15T12:00:00Z', 'desert'], ['2026-11-16T23:59:50Z', 'forest'], ['2026-11-14T00:00:05Z', 'winter']]) {
  const page = await freshPage(11); await peek(page, `Date.now = () => ${Date.parse(at)}, 0`);
  const date = at.slice(0, 10), t0 = JSON.parse(await peek(page, STATE));
  ok(t0.today.date === date && t0.today.kit === kit && SC.dailySeed(date).kit === kit, `${at}: the title offers ${date}, a ${kit} day (${t0.today.kit})`);
  await peek(page, `openSettings(), 0`); const row = JSON.parse(await peek(page, `JSON.stringify({ hidden: document.getElementById('sDailyRow').hidden, kit: document.getElementById('sDailyKit').textContent })`));
  ok(!row.hidden && row.kit === '(' + kit.toUpperCase() + ')', `${at}: Settings at the title has the Daily Sortie row with the kit (${row.kit})`);
  await page.click('#sDaily'); const t1 = JSON.parse(await peek(page, STATE));
  ok(t1.state === 'title' && t1.diff && t1.kind === 'daily' && t1.title === 'Daily Sortie' && t1.note.includes(date) && t1.note.includes(kit.toUpperCase()), `${at}: DAILY opens the difficulty picker (${t1.title}; ${t1.note.slice(0, 40)})`);
  await page.evaluate(() => document.querySelector('#diffAsk [data-d="2"]').click()); const t2 = JSON.parse(await peek(page, STATE + ' + ""'));
  const C = SC.composeDaily(date);
  ok(t2.state === 'play' && t2.daily && t2.daily.date === date && t2.daily.kit === kit && t2.daily.seed === C.seed && t2.ranked === false && t2.daily.v === SC.VERSION, `${at}: the pick starts startDaily(${date}) on Ace (${t2.state}, ${t2.daily && t2.daily.kit}, ranked ${t2.ranked})`);
  const d2 = await peek(page, 'settings.diff'); ok(d2 === 2, `${at}: the difficulty is the player's pick (${d2})`);
  await page.close(); }
{ const page = await freshPage(11); await peek(page, `Date.now = () => ${Date.parse('2026-11-15T12:00:00Z')}, 0`);
  await clickTitle(page, 'start'); const a = JSON.parse(await peek(page, STATE));
  ok(a.diff && a.kind === 'camp' && a.title === 'Choose difficulty', `START still asks for the Campaign's difficulty (${a.kind})`);
  await page.evaluate(() => document.querySelector('#diffAsk [data-d="1"]').click()); const b = JSON.parse(await peek(page, STATE));
  ok(b.state === 'play' && b.daily === null && b.ranked === true && b.seed === 1944, `the Campaign starts as before (seed ${b.seed}, ranked ${b.ranked}, no daily)`); await page.close(); }
{ const page = await freshPage(11); await clickTitle(page, 'scores'); const a = JSON.parse(await peek(page, STATE));
  ok(a.state === 'title' && !a.diff && a.lb, `SCORES still opens the board (board open ${a.lb}, picker ${a.diff})`); await page.close(); }
{ const page = await freshPage(11), r = JSON.parse(await peek(page, `(() => { startComposed(SortieCompose.composeDaily('2026-11-15')); openSettings(); return JSON.stringify({ hidden: document.getElementById('sDailyRow').hidden, crt: !!document.getElementById('sCrt') }); })()`));
  ok(r.hidden && !r.crt, `in a flight the Daily Sortie row is hidden, and Settings has no scanlines option (hidden ${r.hidden}, sCrt ${r.crt})`); await page.close(); }
/* the results screen of a Daily Sortie shows the run's totals; it still counts nowhere (section 2 checks that over a whole flight) */
{ const page = await freshPage(11), r = JSON.parse(await peek(page, `(() => { SF.setMode('immortal'); SF.start(1, 1); startDaily('${DAYS.desert}'); SF.human(8, 15); let f = 0, res = null;
    for (let i = 0; i < 20000 && !res; i++) { SF.run(10); if (app.results && app.results.done) res = { title: 'daily', score: run.score, lives: run.lives, daily: !!(run.sortie && run.sortie.daily) }; }
    if (res) { for (let i = 0; i < 6; i++) SF.run(10); res.still = !!app.results; } return JSON.stringify({ res, errs: SF.R.errs.slice(0, 2) }); })()`));
  ok(r.res && r.res.daily && r.res.score > 0 && r.res.still && !r.errs.length, `the Daily Sortie's results screen draws with the run's totals (score ${r.res && r.res.score}, lives ${r.res && r.res.lives}${r.errs.length ? ', ' + r.errs[0] : ''})`);
  await page.close(); }


// ---------- 6. the rating ----------
{ const page = await freshPage(11), q = code => peek(page, code).then(v => JSON.parse(v));
  const END = date => `(() => { SF.setMode('immortal'); SF.start(1, 1); startDaily('${date}'); SF.human(8, 15); SF.run(60); run.score = 12345; endEnigmaLevel(); const o = document.getElementById('rateAsk').classList.contains('open'); return JSON.stringify({ state: app.state, open: o, info: document.getElementById('rateInfo').textContent, rate: app.rate && app.rate.date }); })()`;
  const ST = `JSON.stringify({ open: document.getElementById('rateAsk').classList.contains('open'), last: app.rateLast || null, kept: store.getJSON(KEY.rated, {}), state: app.state })`;
  const a = await q(END('2026-11-15'));
  ok(a.state === 'title' && a.open && a.rate === '2026-11-15' && a.info.includes('DESERT'), `the sortie ends at the title with the rating question (${a.state}, ${a.info})`);
  await page.click('#rateStars [data-n="4"]'); const b = await q(ST);
  ok(!b.open && b.last && b.last.stars === 4 && b.last.date === '2026-11-15' && b.last.kit === 'desert' && b.last.cv === SC.VERSION && b.last.diff === 1 && b.last.score === 12345 && b.kept['2026-11-15:' + SC.VERSION] === 4, `a star is kept and held back on a local build (${JSON.stringify(b.last && [b.last.stars, b.last.date, b.last.kit])})`);
  const c = await q(END('2026-11-15')); ok(c.state === 'title' && !c.open, `the same date is not asked twice (${c.open})`);
  await peek(page, `app.rateLast = null, 0`);
  const d2 = await q(END('2026-11-16')); await page.click('#rateSkip'); const e = await q(ST);
  ok(d2.open && !e.open && e.last === null && !('2026-11-16:' + SC.VERSION in e.kept), `Skip asks nothing more and stores nothing (${e.open}, ${JSON.stringify(e.kept)})`);
  const f = await q(END('2026-11-16')); ok(f.open, `a skipped date is asked again next time (${f.open})`);
  await page.keyboard.press('Escape'); const g = await q(ST); ok(!g.open && g.last === null, `Escape skips (${g.open})`);
  const h = await q(END('2026-11-14')); await page.keyboard.press('5'); const i = await q(ST); ok(h.open && !i.open && i.last && i.last.stars === 5 && i.last.kit === 'winter', `the key 5 gives five stars (${i.last && i.last.stars})`);
  const j = await q(`(() => { SF.setMode('immortal'); SF.start(1, 1); startEnigma(2, false); SF.run(30); const n = !!(run.sortie && run.sortie.daily); endEnigmaLevel(); return JSON.stringify({ daily: n, open: document.getElementById('rateAsk').classList.contains('open') }); })()`);
  ok(!j.daily && !j.open, `a Practice level never asks (${j.open})`);
  await page.close(); }

await browser.close();
if (bad) { console.error(`\n${bad} check(s) failed, ${passed} passed`); process.exit(1); }
console.log(`Daily Sortie checks pass (${passed}).`);
