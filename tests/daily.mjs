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
//   8. the twists (plan 11.1, 11.8): the draw in Node (rotation, no repeat, DAILY_PLAIN, the segment list unchanged); then in the game each of the seven on its own day and
//      off on a day without it: the record, the banner, hit points, the ground's speed, the weapon, Novas and enemy shots, the dark, the fog, a Campaign level afterwards
//      without it; a fast and a nova day saved and resumed exactly.
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
/* the game's flags for a kit's ground: variant, autumn, winter, haze, moon (the loop's ground only with the flavours variant and loop) */
const GROUND = { desert: g => (g ? 1 : 0) + ',false,false,false,false', forest: g => '0,' + !!g + ',false,false,false', winter: g => '0,false,' + !!g + ',false,false' };
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
  ok(r.level === K.level && r.ranked === false && !r.eligible && r.msg === 'DAILY SORTIE' && r.variant === GROUND[kit](C.ground), `${kit}: level ${r.level}'s boss and theme, not ranked, the flavour's rules (${C.flavour}: ${r.variant})`);
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



// ---------- 7. the flavours (plan 11.2) ----------
{ const FL = `(() => { const q = id => document.getElementById(id); SF.start(1, 1); startDaily(DATE, KIT, undefined, FLAV); const S = run.sortie; const o = { daily: S.daily, variant: [S.variant, S.autumn, S.winter].join(), loop: run.loop, loops: run.loops, stage: run.stage, ranked: run.ranked, plan: sortiePlan(S) && JSON.stringify(sortiePlan(S).P ? { v: sortiePlan(S).P.variant | 0, a: !!sortiePlan(S).P.autumn, l: !!sortiePlan(S).P.lakes } : null), msg: document.getElementById('app') && 0, rank: rankFor(S.level + 6), first: rankFor(S.level) }; return JSON.stringify(o); })()`;
  for (const kit of SC.KIT_ORDER) for (const flavour of SC.FLAVOURS) {
    const date = DAYS[kit], page = await freshPage(11), r = JSON.parse(await peek(page, FL.replace('DATE', `'${date}'`).replace('KIT', `'${kit}'`).replace('FLAV', `'${flavour}'`))), C = SC.composeDaily(date, kit, 0, flavour), P = SC.LOOP_PARAMS[kit];
    const ground = flavour === 'variant' || flavour === 'loop', rank = flavour === 'rank' || flavour === 'loop';
    ok(r.daily.flavour === flavour && r.daily.v === SC.VERSION && r.variant === GROUND[kit](ground).split(',').slice(0, 3).join(','), `${kit} ${flavour}: recorded, and the game's ground flags are ${r.variant}`);
    ok(r.loops === 0 && r.stage === SC.KITS[kit].level && r.ranked === false, `${kit} ${flavour}: not a loop (loops ${r.loops}, ranked ${r.ranked})`);
    ok(rank ? r.loop === r.rank && r.loop > r.first : r.loop === r.first, `${kit} ${flavour}: the rank is ${r.loop} (${rank ? 'the first loop\'s, ' + r.rank + ', above the first pass\'s ' + r.first : 'the first pass\'s ' + r.first})`);
    ok(ground === !!(C.gen.params.variant || C.gen.params.autumn) && JSON.stringify(C.segs) === JSON.stringify(SC.composeDaily(date, kit, 0, 'plain').segs), `${kit} ${flavour}: the loop ground is in the generator's parameters only when asked, the segment list is the plain one`);
    await page.close(); }
  /* one flight of each flavoured kind to the end, the bot, no errors, boss killed (the flight gate flies the real dates; this is the plumbing) */
  for (const flavour of ['rank', 'variant', 'loop']) { const page = await freshPage(11), r = JSON.parse(await peek(page, `(() => { SF.setMode('immortal'); SF.start(1, 1); startDaily('${DAYS.forest}', 'forest', undefined, '${flavour}'); SF.human(8, 15); let end = 'cap'; for (let i = 0; i < 14000; i++) { const st = SF.run(10); if (st !== 'ok') { end = st; break; } } const st = Object.values(SF.R.stages)[0] || {}; return JSON.stringify({ end, bossDead: st.bossDead, errs: SF.R.errs.slice(0, 2) }); })()`));
    ok(r.end === 'state:title' && r.bossDead !== undefined && r.bossDead !== null && !r.errs.length, `forest ${flavour}: flown to the end, boss dead, no errors (${r.end}${r.errs.length ? ', ' + r.errs[0] : ''})`); await page.close(); }
}

// ---------- 8. the twists (plan 11.1, 11.8): the draw, and each switch on its own day and off on every other ----------
{ const dk = n => SC.dateKeyUTC(Date.UTC(2026, 0, 1) + n * 86400000), N = 1100, D = []; for (let n = 0; n < N; n++) D.push(SC.dailySeed(dk(n)));
  ok(SC.VERSION === 4 && SC.TWISTS.join() === 'night,swarm,fixed,fog,elite,fast,nova', `composeVersion is ${SC.VERSION}; the first set is ${SC.TWISTS.join(', ')}`);
  ok(D.every(d => SC.TWISTS.includes(d.twist)) && D.every((d, i) => !i || d.twist !== D[i - 1].twist), `${N} dates draw a twist each, never the same twist two days running`);
  const byKit = {}; D.forEach(d => (byKit[d.kit] = byKit[d.kit] || []).push(d.twist));
  ok(SC.KIT_ORDER.every(k => byKit[k].every((t, i) => i < 6 || new Set(byKit[k].slice(i - 6, i + 1)).size === 7)), `a kit never meets one twist twice within its seven turns (21 days), and meets all seven in them`);
  ok(new Set(D.slice(0, 21).map(d => d.kit + ':' + d.twist)).size === 21, `any 21 days cover every kit x twist once (the flight gate's real-date window)`);
  ok(SC.composeSortie('forest', 5, 0).twist === 'none' && SC.composeSortie('forest', 5, 0, 'plain', 'bogus').twist === 'none' && SC.composeSortie('forest', 5, 0, 'plain', 'night').twist === 'night', `a sortie without a twist says none; an unknown twist is none; a named one is kept`);
  let same = true; for (const date of ['2026-12-01', '2026-12-02', '2026-12-03']) for (const kit of SC.KIT_ORDER) { const base = JSON.stringify(SC.composeDaily(date, kit, 0, 'plain', 'none').segs); for (const t of SC.TWISTS) if (JSON.stringify(SC.composeDaily(date, kit, 0, 'plain', t).segs) !== base) same = false; }
  ok(same, `a twist never changes the segment list (3 dates x 3 kits x 7 twists)`);
  const dd = '2026-12-03', d0 = SC.dailySeed(dd); SC.DAILY_PLAIN[dd] = 1; const p1 = SC.dailySeed(dd); SC.DAILY_PLAIN[dd] = 2; const p2 = SC.dailySeed(dd); SC.DAILY_PLAIN[dd] = 3; const p3 = SC.dailySeed(dd); delete SC.DAILY_PLAIN[dd];
  ok(p1.tod === 'day' && p2.tod === 'day' && p3.tod === 'day' && d0.dials === 'on' && p1.dials === 'off' && p1.flavour === d0.flavour && p1.twist === d0.twist && p2.dials === 'off' && p2.flavour === 'plain' && p2.twist === d0.twist && p3.flavour === 'plain' && p3.twist === 'none' && p3.dials === 'off' && SC.dailySeed(dd).twist === d0.twist, `DAILY_PLAIN: 1 drops the ground dials, 2 also makes the flavour plain (keeps the twist ${p2.twist}), 3 drops the twist too (${p3.twist})`);
  ok(new Set(Array.from({ length: 200 }, (_, i) => SC.fixedWeapon(i * 7919))).size === 4, `the Fixed weapon day's gun is Scatter, Lance, Seeker or Arc, by the seed (200 seeds give all four)`);
}
const TWQ = `(() => { SF.setMode('immortal'); SF.start(1, 1); startDaily('${DAYS.desert}', 'desert', undefined, 'plain', 'TWIST'); const S = run.sortie, o = { daily: S.daily, tw: twistOf(), scroll: SCROLL, sv: world.scrollV, wpn: player.wpn, bombs: run.bombs, hp: hpm(), banner: app.msg && app.msg.c ? app.msg.c[0] : null, msgA: app.msg && app.msg.a };
  const ws = {}; for (let i = 0; i < 80; i++) ws[mkItem('W', 0, 0).w] = 1; o.ws = Object.keys(ws).sort().join('');
  world.ebul.length = 0; for (let i = 0; i < 300; i++) eshot(100 + i % 50, 100 + (i * 7) % 90, 1.5, 1, 's'); o.nb = world.ebul.length; o.sp = o.nb ? Math.hypot(world.ebul[0].vx, world.ebul[0].vy) : 0; o.r = o.nb ? world.ebul[0].r : 0; o.big = world.ebul.filter(b => b.big).length; world.ebul.length = 0;
  SF.run(240); world.items.length = 0; world.items.push({ kind: 'B', x: player.x, y: player.y, t: 0, w: 'S' }); const b0 = run.bombs, s0 = run.score; SF.run(3); o.pick = [run.bombs - b0, run.score - s0];
  let dMax = 0, sc = world.scroll; for (let c = 0; c < S.len * 2; c++) { world.scroll = sc + c * CH / 2; dMax = Math.max(dMax, fogDensity(S)); } o.fogMax = +dMax.toFixed(2); world.scroll = sc;
  o.nightA = world.nightF; SF.run(400); o.night = +world.nightF.toFixed(2); let err = null; try { world.scroll = sc + Math.floor(S.len * 0.4) * CH; resetCtx(); render(); } catch (e) { err = String(e && e.message || e); } o.drawErr = err; o.errs = SF.R.errs.slice(0, 2);
  startEnigma(2, true); o.after = { tw: twistOf(), scroll: SCROLL, hp: hpm(), ws: (() => { const w = {}; for (let i = 0; i < 80; i++) w[mkItem('W', 0, 0).w] = 1; return Object.keys(w).length; })() }; return JSON.stringify(o); })()`;
{ const R = {}; for (const t of ['none', ...SC.TWISTS]) { const page = await freshPage(11); R[t] = JSON.parse(await peek(page, TWQ.replace('TWIST', t))); await page.close(); }
  const B = R.none, C = SC.composeDaily(DAYS.desert, 'desert', 0, 'plain', 'fixed'), NAME = { night: 'NIGHT RUN', fog: 'FOG', swarm: 'SWARM DAY', elite: 'ELITE DAY', fast: 'FAST SCROLL', nova: 'NOVA STORM', fixed: 'FIXED' };
  ok(B.tw === '' && B.daily.twist === 'none' && B.banner === null && B.msgA === 'DAILY SORTIE', `a day with no twist: twistOf is empty, no twist line in the banner`);
  for (const t of SC.TWISTS) { const r = R[t], o = x => x !== undefined;
    ok(r.tw === t && r.daily.twist === t && r.daily.v === SC.VERSION && r.banner && r.banner.startsWith(NAME[t]) && r.msgA === 'DAILY SORTIE', `${t}: recorded in run.sortie.daily, and the banner names it (${r.banner})`);
    ok(r.errs.length === 0 && r.drawErr === null, `${t}: ${400} frames and a drawn frame without errors${r.drawErr ? ': ' + r.drawErr : ''}`);
    ok(Math.abs(r.hp / B.hp - ({ swarm: 0.7, elite: 1.5 }[t] || 1)) < 1e-9, `${t}: enemy hit points x${(r.hp / B.hp).toFixed(2)} (only swarm 0.7 and elite 1.5 change them)`);
    ok(r.scroll === (t === 'fast' ? B.scroll * 1.2 : B.scroll) && r.sv === r.scroll, `${t}: the ground runs at ${r.scroll}${t === 'fast' ? ' (1.2 x ' + B.scroll + ')' : ' (the normal speed)'}`);
    ok(t === 'fixed' ? r.wpn === SC.fixedWeapon(C.seed) && r.ws === r.wpn : r.wpn === 'S' && r.ws.length > 1, `${t}: ${t === 'fixed' ? 'the ship starts on ' + r.wpn + ' and every weapon pickup is ' + r.ws : 'starts on Scatter, pickups still vary (' + r.ws + ')'}`);
    ok(t === 'nova' ? r.bombs === 6 && r.pick[0] === 0 && r.pick[1] >= 2000 : r.bombs === B.bombs && r.pick[0] === 1, `${t}: ${r.bombs} Novas at the start, a Nova pickup gives ${r.pick[0]} (${r.pick[1]} points)`);
    ok(t === 'nova' ? r.nb >= 170 && r.nb <= 230 && Math.abs(r.sp / B.sp - 0.8) < 1e-9 && r.r === 3 && r.big === r.nb : r.nb === 300 && r.sp === B.sp && r.r === 2 && r.big === 0, `${t}: of 300 enemy shots ${r.nb} fly, at ${(r.sp / B.sp).toFixed(2)} of the speed, hit radius ${r.r}`);
    ok(t === 'night' ? r.night > 0.95 : r.night < 0.05 && r.nightA === 0, `${t}: the dark ${t === 'night' ? 'comes (' + r.night + ')' : 'stays off (' + r.night + ')'}`);
    ok(t === 'fog' ? r.fogMax > 0.8 : true, `${t}: ${t === 'fog' ? 'the fog thickens to ' + r.fogMax + ' somewhere along the level' : 'the fog check is only for fog'}`);
    ok(r.after.tw === '' && r.after.scroll === B.scroll && r.after.ws > 1 && Math.abs(r.after.hp / R.none.after.hp - 1) < 1e-9, `${t}: a Campaign level afterwards has no twist (twist '${r.after.tw}', speed ${r.after.scroll}, hit points as ever)`); }
}
/* resume: fast (the speed is not in the snapshot) and nova (Novas, shots) saved mid-flight and loaded in a fresh page go on exactly, with the twist and the speed back */
for (const tw of ['fast', 'nova']) { const date = DAYS.forest, A = await freshPage(21);
  const R = JSON.parse(await peek(A, `(() => { SF.setMode('immortal'); SF.start(1, 1); startDaily('${date}', 'forest', undefined, 'plain', '${tw}'); SF.human(8, 15); SF.run(3900); let rec = null; for (let k = 0; k < 12 && !(rec && JSON.parse(rec).snap); k++) { SF.run(300); snapNow(); saveResume(); rec = localStorage.getItem('starfall-resume'); }
    const samples = [${DUMP}]; for (let f = 0; f < 900; f += 60) { const st = SF.run(60); samples.push(${DUMP}); if (st !== 'ok') break; } return JSON.stringify({ rec, samples }); })()`)); await A.close();
  const B = await freshPage(77);
  const G = JSON.parse(await peek(B, `(() => { SF.setMode('immortal'); SF.human(8, 15); store.set(KEY.resume, ${JSON.stringify(R.rec)}); resumeRun(loadResume()); for (let i = 0; i < 180; i++) update(); const o = { tw: twistOf(), scroll: SCROLL, bombs: run.bombs };
    const samples = [${DUMP}]; for (let f = 0; f < 900; f += 60) { const st = SF.run(60); samples.push(${DUMP}); if (st !== 'ok') break; } o.samples = samples; return JSON.stringify(o); })()`)); await B.close();
  let first = -1; for (let i = 0; i < Math.min(R.samples.length, G.samples.length); i++) if (R.samples[i] !== G.samples[i]) { first = i; break; }
  ok(G.tw === tw && G.scroll === (tw === 'fast' ? 0.48 : 0.4) && first < 0 && R.samples.length === G.samples.length, `forest ${tw}: saved from frame 4200 on at the first frame the game can snapshot, and loaded in a fresh page: the twist (${G.tw}) and the speed (${G.scroll}) are back, ${G.samples.length} samples over 900 frames identical${first >= 0 ? ' (first difference at sample ' + first + ': ' + (() => { const x = JSON.parse(R.samples[first]), y = JSON.parse(G.samples[first]); return Object.keys(x).filter(k => JSON.stringify(x[k]) !== JSON.stringify(y[k])).join(', ') + ' gf ' + x.gf + '/' + y.gf + ' snap ' + !!JSON.parse(R.rec).snap; })() + ')' : ''}`); }

// ---------- 6. the rating ----------
{ const page = await freshPage(11), q = code => peek(page, code).then(v => JSON.parse(v));
  const END = date => `(() => { SF.setMode('immortal'); SF.start(1, 1); startDaily('${date}'); SF.human(8, 15); SF.run(60); run.score = 12345; endEnigmaLevel(); const o = document.getElementById('rateAsk').classList.contains('open'); return JSON.stringify({ state: app.state, open: o, info: document.getElementById('rateInfo').textContent, rate: app.rate && app.rate.date }); })()`;
  const ST = `JSON.stringify({ open: document.getElementById('rateAsk').classList.contains('open'), last: app.rateLast || null, kept: store.getJSON(KEY.rated, {}), state: app.state })`;
  const a = await q(END('2026-11-15'));
  ok(a.state === 'title' && a.open && a.rate === '2026-11-15' && a.info.includes('DESERT'), `the sortie ends at the title with the rating question (${a.state}, ${a.info})`);
  await page.click('#rateStars [data-n="4"]'); const b = await q(ST);
  ok(!b.open && b.last && b.last.stars === 4 && b.last.date === '2026-11-15' && b.last.kit === 'desert' && b.last.cv === SC.VERSION && b.last.diff === 1 && b.last.score === 12345 && b.last.twist === SC.dailySeed('2026-11-15').twist && b.last.flavour === SC.dailySeed('2026-11-15').flavour && b.last.tod === SC.dailySeed('2026-11-15').tod && b.last.dials === SC.composeDaily('2026-11-15').dialNames.join('+') && b.kept['2026-11-15:' + SC.VERSION] === 4, `a star is kept and held back on a local build (${JSON.stringify(b.last && [b.last.stars, b.last.date, b.last.kit])})`);
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

// ---------- 9. the light of the day (docs/ground-variety-plan.md, phase 4): drawn from the date, graded on the plan's chunks, rebuilt on resume, never with Night run ----------
{ const LQ = `(() => { SF.setMode('immortal'); SF.start(1, 1); startDaily('KITDATE', 'KIT', undefined, 'plain', 'TWIST', 'off', 'TOD'); const S = run.sortie, o = { tod: S.timeOfDay, daily: S.daily, sun: sunsetOn(), mor: morningOn() };
    SF.human(8, 15); SF.run(300); const g = {}; for (const c of world.chunks.values()) { const k = c.grade || 'none'; g[k] = (g[k] || 0) + 1; } o.grades = g; const R = dailyCompose(S.daily); o.rebuilt = R && R.tod;
    let err = null; try { world.scroll += CH; resetCtx(); render(); } catch (e) { err = String(e && e.message || e); } o.drawErr = err; o.errs = SF.R.errs.slice(0, 2); return JSON.stringify(o); })()`;
  const run1 = async (kit, tod, tw = 'none') => { const page = await freshPage(11), r = JSON.parse(await peek(page, LQ.replace('KITDATE', DAYS[kit]).replace('KIT', kit).replace('TWIST', tw).replace('TOD', tod))); await page.close(); return r; };
  for (const kit of ['desert', 'forest', 'winter']) for (const tod of SC.TODS) { const r = await run1(kit, tod), n = Object.values(r.grades).reduce((a, b) => a + b, 0), graded = r.grades[tod] || 0;
    ok(r.tod === tod && r.daily.tod === tod && r.rebuilt === tod && r.sun === (tod === 'sunset') && r.mor === (tod === 'morning'), `${kit} at ${tod}: the level's light is ${r.tod}, recorded in run.sortie.daily and rebuilt by resume`);
    ok(tod === 'day' ? !r.grades.sunset && !r.grades.morning : graded > 0 && graded >= n * 0.5, `${kit} at ${tod}: ${tod === 'day' ? 'no chunk is graded' : graded + ' of ' + n + ' chunks carry the ' + tod + ' grade'} (${JSON.stringify(r.grades)})`);
    ok(r.errs.length === 0 && r.drawErr === null, `${kit} at ${tod}: 300 frames and a drawn frame without errors${r.drawErr ? ': ' + r.drawErr : ''}`); }
  const nt = await run1('forest', 'sunset', 'night'); ok(nt.tod === 'day' && nt.daily.tod === 'day' && !nt.grades.sunset, `a Night run day asked for a sunset is flown at noon (the level's light is ${nt.tod})`); }

// ---------- 10. the test picker in the Daily Sortie dialog (local builds): a date, a kit, a light, a twist, a flavour, dials; a finder; START flies the pick ----------
{ const page = await freshPage(11), Q = c => peek(page, c), J = async c => JSON.parse(await Q(`JSON.stringify(${c})`)), vis = id => `!document.getElementById('${id}').hidden`;
  const today = await Q(`SortieCompose.dateKeyUTC(Date.now())`), ds = d => SC.dailySeed(d), say = (d, o = {}) => { const S = SC.composeDaily(d, o.kit, undefined, o.flav, o.twist, o.dials, o.tod); return [S.kit, S.flavour, 'twist ' + S.twist, S.tod, 'dials ' + (S.dialNames.join('+') || 'none'), S.gen.params.lakes ? 'lakes' : '', S.segs.some(g => g.t === 'oasis_town') ? 'oasis town' : ''].filter(Boolean).join(' \u00b7 '); };
  await Q(`openSettings(), 0`); await page.click('#sDaily');
  const a = await J(`({ shown: ${vis('dPick')}, date: document.getElementById('dpDate').textContent, info: document.getElementById('dpInfo').textContent, kit: document.getElementById('dpKit').textContent, find: document.getElementById('dpFind').textContent })`);
  ok(a.shown && a.date === today + ' (today)' && a.info === say(today) && a.kit === "Kit: day's own", `the picker shows on a local build, at today (${today}), with the day's own draw: ${a.info}`);
  await page.click('#dpNext'); await page.click('#dpNext'); await page.click('#dpPrev'); const nx = new Date(Date.parse(today + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
  const b = await J(`({ date: document.getElementById('dpDate').textContent, info: document.getElementById('dpInfo').textContent })`);
  ok(b.date === nx && b.info === say(nx), `the arrows step the date (${b.date}) and the info follows (${b.info})`);
  await page.click('#dpToday'); ok((await J(`document.getElementById('dpDate').textContent`)) === today + ' (today)', `Today returns to today`);
  /* the finder: the next date whose own level has lakes, from today */
  const dk = n => SC.dateKeyUTC(Date.parse(today + 'T00:00:00Z') + n * 86400000), firstWith = fn => { for (let i = 1; i <= 400; i++) if (fn(SC.composeDaily(dk(i)))) return dk(i); return null; };
  await page.click('#dpGo'); const lk = await J(`document.getElementById('dpDate').textContent`); ok(lk === firstWith(S => !!S.gen.params.lakes), `Find: lakes, Next day with it: ${lk}`);
  await page.click('#dpFind'); await page.click('#dpGo'); const tn = await J(`document.getElementById('dpDate').textContent`), tw = firstWith(S => S.segs.some(g => g.t === 'oasis_town'));
  ok(tn === tw || (tw && tn === dk(Math.round((Date.parse(tw) - Date.parse(today + 'T00:00:00Z')) / 86400000))), `Find: oasis town, from ${lk}: ${tn} (the first from today is ${tw})`);
  /* a forced pick: forest, sunset, no twist, plain, dials off, started from the date */
  await page.click('#dpToday');
  const cycle = async (id, n) => { for (let i = 0; i < n; i++) await page.click('#' + id); };
  await cycle('dpKit', 2); await cycle('dpTod', 3); await cycle('dpTwist', 1); await cycle('dpFlav', 1); await cycle('dpDials', 2);
  const c = await J(`({ kit: document.getElementById('dpKit').textContent, tod: document.getElementById('dpTod').textContent, tw: document.getElementById('dpTwist').textContent, fl: document.getElementById('dpFlav').textContent, di: document.getElementById('dpDials').textContent, info: document.getElementById('dpInfo').textContent })`);
  ok(c.kit === 'Kit: forest' && c.tod === 'Light: sunset' && c.tw === 'Twist: none' && c.fl === 'Flavour: plain' && c.di === 'Dials: off' && c.info === say(today, { kit: 'forest', tod: 'sunset', twist: 'none', flav: 'plain', dials: 'off' }), `the cyclers force a kit, a light, a twist, a flavour and the dials (${c.info})`);
  await page.evaluate(() => document.querySelector('#diffAsk [data-d="1"]').click());
  const r = await J(`({ state: app.state, daily: run.sortie && run.sortie.daily, tod: run.sortie && run.sortie.timeOfDay, dn: run.sortie && run.sortie.compose && run.sortie.compose.dialNames.length })`);
  ok(r.state === 'play' && r.daily.date === today && r.daily.kit === 'forest' && r.daily.tod === 'sunset' && r.daily.twist === 'none' && r.daily.flavour === 'plain' && r.daily.dials === 'off' && r.tod === 'sunset' && r.dn === 0, `START flies the pick: ${JSON.stringify(r.daily)}`);
  /* the Campaign's dialog has no picker, and the Daily dialog, opened again, starts from the day's own */
  await Q(`toTitle(), openDiff('camp', 1), 0`); ok(!(await J(vis('dPick'))), `the Campaign's difficulty dialog has no picker`);
  await Q(`closeDiff(), openDaily(), 0`); const d2 = await J(`({ date: document.getElementById('dpDate').textContent, kit: document.getElementById('dpKit').textContent })`); ok(d2.date === today + ' (today)' && d2.kit === "Kit: day's own", `opened again, the picker starts from today's own level`);
  await page.close(); }

await browser.close();
if (bad) { console.error(`\n${bad} check(s) failed, ${passed} passed`); process.exit(1); }
console.log(`Daily Sortie checks pass (${passed}).`);
