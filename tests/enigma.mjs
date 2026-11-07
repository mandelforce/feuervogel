// Enigma Run test (phase 1: the plumbing around a sortie). Needs Node and Playwright, like tests/replay.mjs; serve the folder first
// (python3 -m http.server 8000).
//   node tests/enigma.mjs            all checks; prints only failures and a count of the checks that passed
//   node tests/enigma.mjs --verbose  also print every check that passes
//   node tests/enigma.mjs --bench    also print how long chunks take to build for each level, and level 6 by template (pixels and features apart)
//   node tests/enigma.mjs --pixels   also compare the finished Campaign chunks (pixels, features included) with tests/enigma-pixels.json
//   node tests/enigma.mjs --pixels --update   write tests/enigma-pixels.json (only when a Campaign look change is meant)
// The pixel check is by hand, not in CI: canvas blending can differ between browser builds. Run it before and after every change to shared
// terrain code (drawFeatures, pixelColor, the city functions): the replay test's terrain fingerprint sees only terrain types, not pixels.
// Checks: every level's sortie is well formed and rebuilt identically; an Enigma Run level never counts (board, best, play data, loops);
// at its end the run flies on into the next level, like the Campaign (after the last, the congratulations and the title); it is saved and resumed; the Settings button and the picker work; and above all that an Enigma Run
// level played first leaves nothing behind: the Campaign scenario played afterwards in the same page must equal tests/golden.json.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const PAGE = process.env.STARFALL_URL || 'http://localhost:8000/';
const golden = JSON.parse(readFileSync(new URL('./golden.json', import.meta.url), 'utf8'));
const harness = readFileSync(new URL('./harness.js', import.meta.url), 'utf8');
const replay = readFileSync(new URL('./replay.js', import.meta.url), 'utf8');
const bench = process.argv.includes('--bench'), pixels = process.argv.includes('--pixels'), update = process.argv.includes('--update'), verbose = process.argv.includes('--verbose');
const pixUrl = new URL('./enigma-pixels.json', import.meta.url);

// Same start as tests/replay.mjs: a seeded Math.random and no frame loop, so only the test moves the game.
const initScript = () => {
  let a = 1944;
  Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  window.requestAnimationFrame = () => 0;
};

let bad = 0, passed = 0;
const ok = (cond, msg) => { if (cond) { passed++; if (verbose) console.log('ok   ' + msg); } else { bad++; console.error('FAIL ' + msg); } };

const browser = await chromium.launch();
async function freshPage(query = '') {
  const page = await browser.newPage({ viewport: golden.viewport });
  await page.route(/workers\.dev/, r => r.abort());
  page.on('pageerror', e => { bad++; console.error('page error:', e.message); });
  await page.addInitScript(initScript);
  await page.goto(PAGE + query);
  await page.waitForFunction(() => typeof window.__sf === 'function', null, { polling: 100, timeout: 60000 });
  await page.evaluate(s => window.__sf(s), harness); await page.evaluate(s => window.__sf(s), replay);
  await page.evaluate(() => window.SF.peek('app.booting && finishBoot(), 0'));
  // SF.chunkHash(p0, p1): build chunks p0..p1 completely (pixels and features) and hash their pixels. SF.segAt(p): the sortie template of chunk p.
  await page.evaluate(() => window.SF.peek(`SF.chunkHash = (p0, p1) => { world.chunks = new Map(); world.chunkInfo = new Map(); world.chunkJobs = []; let h = 2166136261;
    for (let p = p0; p <= p1; p++) { startChunk(p); const j = world.chunkJobs.pop(); let n = 0; while (!workChunk(j, CH) && n++ < 9); const d = j.x.getImageData(0, 0, W, CH).data;
      for (let i = 0; i < d.length; i += 4) { h ^= d[i] | (d[i + 1] << 8) | (d[i + 2] << 16); h = Math.imul(h, 16777619); } }
    return (h >>> 0).toString(16); };
    SF.segAt = p => { const c = p - world.stageBaseP, s = run.sortie; if (!s) return '-'; if (c < 0) return 'before'; if (c >= s.len) return 'secret'; for (const g of s.segs) if (c >= g.start && c < g.start + g.n) return g.t; return '?'; }; 0`));
  return page;
}
const peek = (page, code) => page.evaluate(c => window.SF.peek(c), code);

// 1. The sortie of every level: well formed, and the same every time it is built.
{
  const page = await freshPage();
  const r = await peek(page, `(() => { const out = []; for (let lv = 1; lv <= 6; lv++) { const a = buildSortie(lv, 1944), b = buildSortie(lv, 1944), c = buildSortie(lv, 5);
    let at = 0, contiguous = true; for (const s of a.segs) { if (s.start !== at || s.n < 1) contiguous = false; at += s.n; }
    out.push({ lv, same: JSON.stringify(a) === JSON.stringify(b), contiguous, sum: at === a.len, len: a.len, theme: a.theme, seed: a.seed, rng: a.rng(3) === b.rng(3) && a.rng(3) !== c.rng(3), segs: a.segs.length, bossAt: a.bossAt, gen: a.gen, seaLast: a.segs[a.segs.length - 1].start, yw: yardWait() }); } return out; })()`);
  for (const x of r) ok(x.same && x.contiguous && x.sum && x.rng && x.bossAt === (x.lv === 6 || x.lv === 2 ? x.len + 5 : x.lv === 3 || x.lv === 4 ? x.len + 3 : x.lv === 5 ? x.len + x.yw : x.lv === 1 ? x.seaLast + 1 : null) && x.gen === (x.lv === 6 ? 6 : x.lv === 2 ? 2 : x.lv === 3 ? 3 : x.lv === 4 ? 4 : x.lv === 5 ? 5 : 0) && x.len === [62, 72, 58, 60, 84, 70][x.lv - 1] && x.theme === [0, 2, 3, 4, 1, 5][x.lv - 1], `sortie level ${x.lv}: ${x.segs} segments, ${x.len} chunks, theme ${x.theme}, rebuilt identically`);
  await page.close();
}

// 2. The Campaign (START, ranked) and the Practice picker (title screen), then a level 6 practice run: flags, play, end of level, resume.
{
  const page = await freshPage();
  await page.evaluate(() => { window.SF.peek('settings.diff = 1'); });
  const ui = await peek(page, `(() => { const q = id => document.getElementById(id); const o = {};
    openSettings(); o.noOldRows = !q('sFire') && !q('sPb') && !q('sEnigma') && !q('sEnigmaRun'); o.fixed = settings.fire === 90 && settings.pb === true && settings.enigma === 0; setPanel.classList.remove('open');
    openDiff('camp', 6, true); o.pickerOpen = q('diffAsk').classList.contains('open'); o.title = q('diffTitle').textContent; o.stageRow = !q('dStage').hidden;
    o.shown = [...q('dStage').querySelectorAll('[data-s]')].filter(b => !b.hidden).map(b => b.textContent).join(',');
    o.note = q('dNote').textContent; o.pressed = q('dStage').querySelector('[aria-pressed="true"]').dataset.s;
    q('diffAsk').querySelector('[data-d="1"]').click(); o.level = run.sortie && run.sortie.level; o.theme = world.curTheme; o.stage = run.stage; o.state = app.state; o.start = run.start; o.ranked = run.ranked; return o; })()`);
  ok(ui.noOldRows && ui.fixed, 'gun speed, point-blank and the Enigma slider are gone from Settings and fixed at 90 / on / off');
  ok(ui.pickerOpen && ui.title === 'Practice a level' && ui.stageRow && ui.shown === '1,2,3,4,5,6', `Practice offers the Campaign levels 1 to 6 (${ui.shown})`);
  ok(ui.pressed === '6' && ui.level === 6 && ui.theme === 5 && ui.stage === 6 && ui.state === 'play' && ui.ranked === false, 'choosing level 6 and a difficulty starts it as an unranked practice run');

  const hide = await peek(page, `(() => { openSettings(); const h = !!document.getElementById('sFire'); setPanel.classList.remove('open'); return h; })()`);
  ok(!hide, 'Settings has no gun speed row');

  // flags: the level never counts
  const before = await peek(page, `({ hi, loops: loopsWon, rr: !!app.rr })`);
  await page.evaluate(() => { window.SF.setMode('immortal'); window.SF.run(1500); });
  const flags = await peek(page, `(() => { addScore(123456); return { elig: lbEligible(), hi, loops: loopsWon, rr: !!app.rr, sortie: !!run.sortie, errs: SF.R.errs.length }; })()`);
  ok(flags.elig === false && flags.hi === before.hi && flags.loops === before.loops, 'a practice level is not board-eligible and does not raise the best or the loop count');
  ok(flags.errs === 0, 'no errors while playing level 6');

  // saved and resumed
  const res = await peek(page, `(() => { saveResume(); const r = store.getJSON(KEY.resume); const o = { saved: r && r.sortie }; resumeRun(r); o.after = run.sortie && run.sortie.level; o.state = app.state; return o; })()`);
  ok(res.saved && res.saved.level === 6 && res.after === 6 && res.state === 'play', 'the resume record holds {level, seed} and rebuilds the sortie');
  // a save from before build 1.2.5.16 (no lvn) numbers the levels the old way: 8 is level 1, 7 is level 6; the old levels 1 and 6 are gone
  const mig = await peek(page, `(() => { saveResume(); const r0 = store.getJSON(KEY.resume), o = {}; delete r0.lvn;
    for (const lv of [8, 7, 2, 1, 6]) { const r = JSON.parse(JSON.stringify(r0)); r.sortie.level = lv; store.setJSON(KEY.resume, r); const l = loadResume(); o[lv] = l ? l.sortie.level : null; }
    store.setJSON(KEY.resume, Object.assign(r0, { lvn: 2, sortie: { level: 6, seed: 1944 } })); const n = loadResume(); o.cur = n ? n.sortie.level : null; return o; })()`);
  ok(mig[8] === 1 && mig[7] === 6 && mig[2] === 2 && mig[1] === null && mig[6] === null && mig.cur === 6, `an old save maps level 8 to 1 and 7 to 6, drops the old levels 1 and 6; a new save is kept as it is (${JSON.stringify(mig)})`);

  // the end of the last level (6): the congratulations, then the title; no picker, no loop counted, the sortie cleared
  const end = await peek(page, `(() => { world.bossSpawned = true; app.results = null; app.fade = null; finishResults(); const o = { congrats: !!app.congrats, fade0: !!app.fade }; finishResults(); o.fade = !!app.fade; const f = app.fade && app.fade.fn; app.fade = null; if (f) f();
    const q = id => document.getElementById(id); o.state = app.state; o.sortieAfter = run.sortie; o.picker = q('diffAsk').classList.contains('open'); o.loops = loopsWon; return o; })()`);
  ok(end.congrats && !end.fade0 && end.fade && end.state === 'play' && end.sortieAfter && end.sortieAfter.level === 1 && !end.picker && end.loops === before.loops,
    'finishing the last level in practice: the congratulations, then level 1 again, one loop harder (no picker, no loop counted)');
  // any other level flies on into the next, with the run's score, lives, Novas and weapon carried over
  const nx = await peek(page, `(() => { startEnigma(5); run.score = 123450; run.lives = 4; run.bombs = 1; player.wpn = 'L'; player.lvl = 3; world.bossSpawned = true; app.results = null; app.fade = null; finishResults();
    const o = { congrats: !!app.congrats }; const f = app.fade && app.fade.fn; app.fade = null; if (f) f(); return Object.assign(o, { level: run.sortie && run.sortie.level, score: run.score, lives: run.lives, bombs: run.bombs, wpn: player.wpn, lvl: player.lvl, state: app.state, picker: document.getElementById('diffAsk').classList.contains('open') }); })()`);
  ok(!nx.congrats && nx.level === 6 && nx.score === 123450 && nx.lives === 4 && nx.bombs === 1 && nx.wpn === 'L' && nx.lvl === 3 && nx.state === 'play' && !nx.picker,
    `finishing level 5 flies on into level 6 with the score, lives, Novas and weapon carried over (level ${nx.level}, score ${nx.score}, lives ${nx.lives}, Novas ${nx.bombs}, weapon ${nx.wpn}${nx.lvl})`);
  await page.close();
}

// 2b. The Campaign proper (START) is ranked and chains levels 1 to 6; Retro Run is the old campaign and never touches the board.
{
  const page = await freshPage();
  await page.evaluate(() => { window.SF.peek('settings.diff = 1'); });
  const c = await peek(page, `(() => { const q = id => document.getElementById(id); const o = {};
    startOrOffer(); o.title = q('diffTitle').textContent; o.stageRow = !q('dStage').hidden; q('diffAsk').querySelector('[data-d="1"]').click();
    o.first = run.sortie && run.sortie.level; o.ranked = run.ranked; o.start = run.start; o.retro = run.retro; const hi0 = hi; addScore(5000); o.elig = lbEligible(); o.hiUp = hi > hi0;
    const seq = [run.sortie.level];
    for (let i = 0; i < 6; i++) { world.bossSpawned = true; app.results = null; app.fade = null; app.congrats = null; finishResults(); if (app.congrats) break; const f = app.fade && app.fade.fn; app.fade = null; if (f) f(); if (run.sortie) seq.push(run.sortie.level); }
    o.seq = seq.join(','); o.rankedAfter = run.ranked; o.startAfter = run.start; o.eligAfter = lbEligible(); o.congrats = !!app.congrats;
    app.fade = null; app.congrats = null; endEnigmaLevel(); o.endState = app.state; o.lbOpen = app.lbOpen; o.lbTitle = q('lbTitle').textContent; o.submitShown = q('lbSubmit').style.display !== 'none'; o.mode = app.lbRun && app.lbRun.mode; o.runStart = app.lbRun && app.lbRun.start; o.afterLevel = run.sortie && run.sortie.level; o.loops = run.loops; o.rankedLoop = run.ranked; o.scoreLoop = run.score; return o; })()`);
  ok(c.title === 'Choose difficulty' && !c.stageRow && c.first === 1 && c.ranked && c.start === 1 && !c.retro, 'START opens the difficulty choice and begins the ranked Campaign at level 1');
  ok(c.elig && c.hiUp, 'a Campaign run is board-eligible and raises the best');
  ok(c.seq === '1,2,3,4,5,6' && c.rankedAfter && c.startAfter === 1 && c.eligAfter && c.congrats, `the Campaign flies levels 1 to 6 and stays ranked from start to end (${c.seq})`);
  ok(c.endState === 'play' && !c.lbOpen && c.afterLevel === 1 && c.loops === 1 && c.rankedLoop && c.scoreLoop >= 5000, 'finishing level 6 loops the ranked Campaign back to level 1, one loop harder, with the score kept (the score dialog comes at game over)');

  const r = await peek(page, `(() => { const q = id => document.getElementById(id); const o = {}; closeLB(); toTitle(); settings.diff = 1;
    openDiff('retro', 1); o.title = q('diffTitle').textContent; o.extras = !q('dExtra').hidden; q('diffAsk').querySelector('[data-d="1"]').click();
    o.retro = run.retro; o.sortie = run.sortie; o.ranked = run.ranked; o.stage = run.stage; const hi0 = hi; addScore(9000); o.elig = lbEligible(); o.hiSame = hi === hi0;
    o.report = !!app.rr; return o; })()`);
  ok(r.title === 'Retro Run' && !r.extras && r.retro && r.sortie === null && !r.ranked && r.stage === 1, 'Retro Run starts the old campaign, unranked');
  ok(!r.elig && r.hiSame, 'Retro Run is not board-eligible and does not raise the best');
  const cr = await peek(page, `(() => { toTitle(); const rb = document.getElementById('crRetro'); Credits.open(); const o = { shown: !rb.hidden }; rb.click(); o.diff = document.getElementById('diffAsk').classList.contains('open'); o.kind = app.diffNext && app.diffNext.kind; o.credits = document.getElementById('credits').classList.contains('open'); return o; })()`);
  ok(cr.shown && cr.diff && cr.kind === 'retro' && !cr.credits, 'the credits end with a Retro Run button that opens the Retro Run difficulty choice');
  await page.close();
}

// 3. (State hygiene against tests/golden.json is switched off until the golden values are refreshed; 3b below still checks for leftover state.)

// 3b. Starting any run clears every terrain cache and shared value (resetTerrainState). Pollute them all, start a run, look for what is left.
// (Test 3 alone cannot show this: a leak that does not change the golden scenario would pass it.)
{
  const page = await freshPage();
  const left = await peek(page, `(() => {
    const maps = { roadCache, farmCache, tentCache, houseCache, fieldOkCache, railEndCache, parcelRowCache, parcelBlkCache, flowCache, canopyCache, chunkHouses, chunkFires };
    const sets = { towerRows, towerCells, setPieceDone, bridgeDown, bridgeSpawned, burntTrees, damagedHouses };
    for (const k in maps) maps[k].set('zz', [1]); for (const k in sets) sets[k].add('zz');
    castleCache = { base: 'zz', v: 1 }; finalCache = { k: 'zz', y: 1 }; critters.push({ kind: 'zz' }); props.push({ kind: 'zz' }); rxW = 5; world.featTheme = 3; TRGB = THEME_RGB[2];
    SF.start(1, 1);
    const out = []; for (const k in maps) if (maps[k].has('zz')) out.push(k); for (const k in sets) if (sets[k].has('zz')) out.push(k);
    if (castleCache.base === 'zz') out.push('castleCache'); if (finalCache.k === 'zz') out.push('finalCache'); if (critters.some(c => c.kind === 'zz')) out.push('critters'); if (props.some(c => c.kind === 'zz')) out.push('props');
    if (rxW === 5) out.push('rxW'); if (world.featTheme === 3) out.push('featTheme'); if (TRGB === THEME_RGB[2]) out.push('TRGB'); return out; })()`);
  ok(left.length === 0, 'starting a run clears all terrain caches and shared values' + (left.length ? ' (left behind: ' + left.join(', ') + ')' : ''));
  await page.close();
}

// 3c. Level 2, Sea of Sand (spec 18): one plan from the level's first chunk (the desert port beginning over the sea, the beach town at war,
// the oil valley, the held oasis village, the junction, the small oasis, the airbase, the pass with its viaduct, the quiet desert); the ground
// types and pixels are the plan's, the open desert in the Campaign's own desert colours; past the level the Campaign's boss ground (bossland,
// theme 2); the same after a resume; flown through by the bot, the viaduct comes up as a bridge target, the boss (the land fortress) comes
// and the run flies on into level 3 without errors
{
  const page = await freshPage();
  const r = await peek(page, `(() => { settings.diff = 1; startEnigma(2); const S = run.sortie, P = sortiePlan(S), v = CityGen.validate(P); let types = 0, n = 0;
    for (let y = 0; y < P.L; y += 37) { const wy = S.planY0 - y; for (let x = 5; x < W; x += 29) { n++; if (terrainType(x, wy) !== CityGen.typeAt(P, x, y)) types++; } }
    const pix = [12, 30, 44].map(c => { const p = world.stageBaseP + c; startChunk(p); const jb = world.chunkJobs[world.chunkJobs.length - 1]; while (jb.ly < CH) workChunk(jb, 2); world.chunkJobs.pop();
      const img = { data: new Uint8ClampedArray(W * CH * 4) }; CityGen.paint(P, img, S.planY0 - (-p * CH + CH - 1), CH, planPaintOpts(S)); let d = 0; for (let i = 0; i < img.data.length; i++) if (img.data[i] !== jb.img.data[i]) d++; return d; }).reduce((a, b) => a + b, 0);
    const seaFirst = terrainType(112, S.planY0 - 20) === 'sea' && info(world.stageBaseP).plan === true, after = info(world.stageBaseP + S.len + 2), feats = { oasis: P.oasis.map(o => o.size + (o.held ? '+held' : '')).join(','), viaduct: P.viaducts.length, airbase: !!P.airbase, junction: P.trainRuns.some(q => q.line === 'branch'), valley: P.derricks.length, war: !!(P.beachTown && P.beachTown.war) };
    const onRail = P.slots.filter(q => q.kind !== 'parked' && [-q.r, 0, q.r].some(d => railDist(q.x, S.planY0 - q.y + d) < q.r + 8)).length;
    return { pass: v.pass, onRail, L: P.L, len: S.len * CH, types, n, pix, seaFirst, afterB: after.b, afterTh: after.th, afterPlan: !!after.plan, feats, gen: S.gen }; })()`);
  ok(r.pass && r.L === r.len && r.seaFirst && r.gen === 2, `level 2 plan passes the generator's hard rules and covers the whole level, beginning over the sea (${r.L} px)`);
  ok(r.onRail === 0, `level 2: no gun slot (flak, artillery, bunker, tank) stands on or beside the railway (${r.onRail})`);
  const F = r.feats; ok(F.war && F.valley >= 2 && F.oasis === 'medium+held,small,roadside' && F.junction && F.airbase && F.viaduct === 1, `level 2 has every segment's ground: the beach town at war, the oil valley, the held oasis village, the small oasis and the roadside hamlet, the junction, the airbase, the pass with its viaduct`);
  ok(r.types === 0 && r.pix === 0, `level 2 ground types and pixels come from its plan, its sand in the Campaign's desert colours (${r.types} of ${r.n} types and ${r.pix} bytes differ)`);
  ok(r.afterB === 'bossland' && r.afterTh === 2 && !r.afterPlan, `past level 2 the ground is the Campaign's desert boss ground (${r.afterB}, theme ${r.afterTh})`);
  const hashL = 'SF.chunkHash(world.stageBaseP - 2, world.stageBaseP + run.sortie.len + 6)';
  const fresh = await peek(page, `(() => { startEnigma(2); return ${hashL}; })()`), resumed = await peek(page, `(() => { saveResume(); resumeRun(store.getJSON(KEY.resume)); return run.sortie.level + ':' + ${hashL}; })()`);
  ok('2:' + fresh === resumed, `level 2 is the same ground after a resume (${fresh})`);
  await page.close();
  const page2 = await freshPage();
  const f = await page2.evaluate(() => { const SF = window.SF; SF.setMode('immortal'); SF.peek('settings.diff = 1; startEnigma(2)'); const o = { status: 'ok', via: false };
    for (let i = 0; i < 20000 && o.status === 'ok'; i++) { o.status = SF.run(100); if (!o.via) o.via = SF.peek('world.enemies.some(e => e.type === "bridge" && e.via)'); if (o.boss === undefined && SF.peek('world.bossSpawned')) o.boss = SF.peek('(-Math.floor((H - 1 - Math.floor(world.scroll)) / CH)) - world.stageBaseP'); }
    Object.assign(o, SF.peek(`({ state: app.state, picker: document.getElementById('diffAsk').classList.contains('open'), n: app.diffNext && app.diffNext.n, errs: SF.R.errs.slice(0, 2) })`)); return o; });
  ok(f.via, 'on the way the viaduct came up as a bridge target');
  ok(f.boss !== undefined && f.status === 'next:3' && f.errs.length === 0, `level 2 flown through: the boss comes (screen bottom at chunk ${f.boss}) and the run flies on into level 3 (${f.status}${f.errs.length ? ', errors: ' + f.errs.join(' | ') : ''})`);
  await page2.close();
}
// 3d. Trains and side roads (owner): flown through by the bot, levels 2 and 6 each get trains on their plan's train runs (they move along
// the line) and tanks that turn off the main road into a side road and drive along it
for (const lv of [2, 6]) {
  const page2 = await freshPage();
  const f = await page2.evaluate(lv => { const SF = window.SF; SF.setMode('immortal'); SF.peek(`settings.diff = 1; startEnigma(${lv})`); let st = 'ok'; const o = { trains: new Set(), moved: 0, side: new Set(), sideMoved: 0 }, last = {};
    for (let i = 0; i < 20000 && st === 'ok'; i++) { st = SF.run(50); const v = JSON.parse(SF.peek(`JSON.stringify({ locos: world.enemies.filter(e => e.type === 'loco' && !e.dead).map(e => [e.train, Math.round(e.wy)]), side: world.enemies.filter(e => (e.type === 'tank' || e.type === 'htank') && e.side && !e.dead).map(e => [e.side.s + ':' + Math.round(e.wx * 0) , Math.round(e.side.k), e.wx | 0]), boss: world.bossSpawned })`));
      for (const [t, y] of v.locos) { if (last['t' + t] !== undefined && last['t' + t] !== y) o.moved++; last['t' + t] = y; o.trains.add(t); }
      for (const [s2, k, x] of v.side) { o.side.add(s2); if (last['s' + s2] !== undefined && last['s' + s2] !== k) o.sideMoved++; last['s' + s2] = k; }
      if (v.boss) break; }
    return { st, trains: o.trains.size, moved: o.moved, side: o.side.size, sideMoved: o.sideMoved, errs: SF.R.errs.slice(0, 2) }; }, lv);
  const name = lv;
  ok(f.trains >= 1 && f.moved > 5 && f.errs.length === 0, `level ${name}: trains run on the plan's railway (${f.trains} trains)`);
  if (lv !== 2) ok(f.side >= 1 && f.sideMoved > 5, `level ${name}: tanks turn into side roads and drive along them (${f.side} side roads used)`);
  else { const d = await page2.evaluate(() => window.SF.peek(`(() => { startEnigma(2); SIDE.turn = 1; const S = run.sortie, sides = sideRoutes(S), sd = sides.find(q => q.path.length >= 30 && q.path[0][1] < S.planY0 - 700), j = sd.junc[0], rt = sortieRoutes(S)[j.rt], y0 = sd.path[j.k][1] - 6; /* a desert side track */
      world.enemies = []; world.scroll = -y0 + 200; ensureChunks(); for (let i = 0; i < 400 && world.chunkJobs.length; i++) ensureChunks();
      const t = G('tank', routeX(rt, y0), y0, tankStats({ road: true, dir: 1, lane: 0, v: 0.2, hd: PI / 2, route: rt.id })); world.enemies.push(t); let side = false, off = 0;
      for (let f = 0; f < 600; f++) { ENT.tank.update(t); if (t.side) side = true; const tt = terrainType(Math.floor(t.wx), Math.floor(t.wy)); if (tt !== 'road' && tt !== 'bridge') off++; }
      SIDE.turn = 0.35; return JSON.stringify({ n: sides.length, side, drove: Math.round(Math.abs(t.wx - routeX(rt, y0))), off, end: !!t.atEnd }); })()`));
    const q = JSON.parse(d); ok(q.n >= 4 && q.side && q.drove >= 20 && q.off === 0 && q.end, `level ${name}: ${q.n} side tracks; a tank turns off the desert track into one, drives ${q.drove} px along it on the road, and stops at its end`); }
  await page2.close();
}
// 3e. Level 2 weather (spec 18.7): light dust by the sea, heat shimmer over the valley, the oasis and (strongest) the airbase, more dust in
// the pass, and gusts only from the pass on, building over the last stretch. A strong gust pushes the plane, less than the boss storm; the
// boss storm replaces the gusts; the Campaign gets none of it. Drawn at the airbase, the shimmer moves ground pixels, and drawing the
// shimmer, dust, devil and gusts throws nothing.
{
  const page2 = await freshPage();
  const q = JSON.parse(await page2.evaluate(() => window.SF.peek(`(() => { settings.diff = 1; startEnigma(2); const S = run.sortie, o = { d: 0, s: 0, g: 0 }, by = {};
    for (let c = 0; c < S.len; c++) { const g = sortieSeg(S, c), k = g === S.segs[S.segs.length - 1] ? 'approach' : g.t; wx2Chunk(S, c, o); const b = by[k] || (by[k] = { d: [], s: [], g: [] }); b.d.push(o.d); b.s.push(o.s); b.g.push(o.g); }
    const mx = a => Math.max(...a), last = S.segs[S.segs.length - 1], at = c => { world.scroll = (c + world.stageBaseP + 0.5) * CH + H / 2; };
    const gustAt = (c, stormK) => { at(c); app.state = 'play'; let x = 0, k = 0; const sk = world.stormK; world.stormK = stormK; for (let f = 0; f < GUST_P; f++) { run.frames = f + 3 * GUST_P; updGust2(); x = Math.max(x, world.gustX); k = Math.max(k, world.gustK); } world.stormK = sk; return [x, k]; };
    const late = gustAt(S.len - 1, 0), pass = gustAt(S.segs.find(g => g.t === 'pass').start + 2, 0), port = gustAt(1, 0), storm = gustAt(S.len - 1, 1);
    const ab = S.segs.find(g => g.t === 'airbase_desert'); at(ab.start + 3); ensureChunks(); for (let i = 0; i < 400 && world.chunkJobs.length; i++) ensureChunks();
    const grab = () => { drawGround(); return ctx.getImageData(0, 0, W, H).data; }; let diff = 0, err = '';
    for (let f = 0; f < 120 && !diff; f += 7) { run.frames = f; lowFX = true; const a = grab(); lowFX = false; const b = grab(); for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1]) diff++; }
    try { const oz = S.segs.find(g => g.t === 'desert_open'); at(oz.start + 2); for (let f = 0; f < 900; f++) { run.frames = f; if (f === 10) { wx2.devil = { wx: 100, wy: -world.scroll - 40, a: 0, trail: [] }; } wx2Tick(); world.gustK = 0.7; drawGround(); drawWx2Low(); drawGust2(); } } catch (e) { err = String(e); }
    world.gustK = 0; world.gustX = 0;
    run.sortie = null; updGust2(); const camp = [world.gustX, world.gustK, wx2On()];
    return JSON.stringify({ by: Object.fromEntries(Object.entries(by).map(([k, b]) => [k, { d: mx(b.d), s: mx(b.s), g: mx(b.g), g0: b.g[0], g1: b.g[b.g.length - 1] }])), late, pass, port, storm, diff, err, camp, push: STORM_PUSH }); })()`)));
  const b = q.by;
  ok(b.harbour_commercial.d < b.pass.d && b.beach_town.d < b.pass.d && b.approach.d >= b.pass.d, `level 2 weather: dust grows along the level (port ${b.harbour_commercial.d}, pass ${b.pass.d}, approach ${b.approach.d.toFixed(2)})`);
  ok(b.harbour_commercial.s === 0 && b.beach_town.s === 0 && b.valley.s > 0 && b.desert_open.s > 0 && b.airbase_desert.s === 1 && b.pass.s === 0, 'level 2 weather: heat shimmer over the valley, the oasis and (strongest) the airbase, not by the sea or in the pass');
  ok(['harbour_commercial', 'beach_town', 'valley', 'village', 'station_junction', 'desert_open', 'airbase_desert'].every(k => b[k].g === 0) && b.approach.g1 > b.approach.g0 + 0.4, `level 2 weather: no gusts before the pass, building over the approach (${b.approach.g0.toFixed(2)} to ${b.approach.g1.toFixed(2)})`);
  ok(q.late[0] > 0 && q.late[0] < q.push * 0.4 && q.pass[0] === 0 && q.pass[1] > 0 && q.port[1] === 0 && q.storm[1] === 0, `level 2 weather: a strong gust pushes the plane ${q.late[0].toFixed(2)} px a frame (the boss storm ${q.push}); the pass's gusts only blow, the port has none, and the boss storm replaces them`);
  ok(q.diff > 50 && !q.err, `level 2 weather: the shimmer moves ${q.diff} ground pixels at the airbase; shimmer, dust, the dust devil and gusts draw without errors ${q.err}`);
  ok(q.camp[0] === 0 && q.camp[1] === 0 && q.camp[2] === null, 'level 2 weather: none of it outside level 2 (the Campaign)');
  await page2.close();
}
// 3b''. Level 6, the harbour city: one plan from the level's first chunk (sea, the south harbour with the east harbour
// opening into it, the town, works, station, the airfield's perimeter); the picker offers it, the ground types and pixels are the plan's,
// it is the same after a resume, and flown through by the bot it reaches the boss and, the last level, ends at the title without errors.
{
  const page = await freshPage();
  const r = await peek(page, `(() => { openDiff('camp', 2, true); const btn = document.querySelector('#dStage [data-s="6"]'), shown = !btn.hidden && btn.textContent === '6'; const six = document.querySelectorAll('#dStage [data-s]').length === 6; closeDiff();
    settings.diff = 1; startEnigma(6); const S = run.sortie, P = sortiePlan(S), v = CityGen.validate(P); let types = 0, n = 0;
    for (let y = 0; y < P.L; y += 41) { const wy = S.planY0 - y; for (let x = 5; x < W; x += 31) { n++; if (terrainType(x, wy) !== CityGen.typeAt(P, x, y)) types++; } }
    const p = world.stageBaseP + 30; startChunk(p); const jb = world.chunkJobs[world.chunkJobs.length - 1]; while (jb.ly < CH) workChunk(jb, 2); world.chunkJobs.pop();
    const img = { data: new Uint8ClampedArray(W * CH * 4) }; CityGen.paint(P, img, S.planY0 - (-p * CH + CH - 1), CH, planPaintOpts(S)); let pix = 0; for (let i = 0; i < img.data.length; i++) if (img.data[i] !== jb.img.data[i]) pix++;
    const seaFirst = terrainType(112, S.planY0 - 20) === 'sea' && info(world.stageBaseP).b === 'sea' && info(world.stageBaseP).plan === true;
    return { shown, six, pass: v.pass, L: P.L, len: S.len * CH, types, n, pix, seaFirst, mode: P.coast.mode, cs: P.coast.cs, side: !!P.port.side, piers: P.port.piers, sub: P.slots.some(q => q.kind === 'sub'), war: (P.shipLanes.find(l => l.kind === 'warships') || {}).w || 0, tunnel: P.tunnels.length, wall: (() => { const l = P.shipLanes.find(q => q.kind === 'warships'); if (!l) return -1; let n = 0; for (let y = l.y0; y <= l.y1; y++) for (let x = Math.round(l.x - l.w / 2); x < l.x + l.w / 2; x++) if (P.K[y * P.W + x] === CityGen.K.QUAY) n++; return n; })(), per: P.perimeter && P.perimeter.y0, st: P.station && P.station.y1, msg: app.msg && app.msg.a }; })()`);
  ok(r.shown && r.six, 'the Practice picker offers level 6 (six level buttons)');
  ok(r.pass && r.L === r.len && r.seaFirst, `level 6 plan passes the generator's hard rules and covers the whole level, beginning over the sea (${r.L} px)`);
  ok(r.mode === 'corner' && r.cs === 1 && r.side && r.piers >= 3 && r.sub, `level 6 has the south harbour (${r.piers} piers, a submarine berth) with the east harbour opening into it`);
  ok(r.war >= 30 && r.wall === 0 && r.tunnel >= 1, `level 6's east harbour is open water, no breakwater, a ${r.war} px lane for the warships; the quayside track runs into a tunnel`);
  ok(r.per === r.L - 64 && r.st !== null && r.st < r.per, `level 6 ends at the airfield's perimeter, its station before it (station to ${r.st}, perimeter from ${r.per})`);
  ok(r.types === 0 && r.pix === 0, `level 6 ground types and pixels come from its plan, its water in the game's own sea texture (${r.types} of ${r.n} types and ${r.pix} bytes differ)`);
  const hashL = 'SF.chunkHash(world.stageBaseP - 2, world.stageBaseP + run.sortie.len + 6)';
  const fresh = await peek(page, `(() => { startEnigma(6); return ${hashL}; })()`), resumed = await peek(page, `(() => { saveResume(); resumeRun(store.getJSON(KEY.resume)); return run.sortie.level + ':' + ${hashL}; })()`);
  ok('6:' + fresh === resumed, `level 6 is the same ground after a resume (${fresh})`);
  await page.close();
  const page2 = await freshPage();
  const f = await page2.evaluate(() => { const SF = window.SF; SF.setMode('immortal'); SF.peek('settings.diff = 1; startEnigma(6)'); const o = { status: 'ok' };
    o.sub = false; for (let i = 0; i < 20000 && o.status === 'ok'; i++) { o.status = SF.run(100); if (!o.sub) o.sub = SF.peek(`(() => { if (!run.sortie || !run.sortie.plan) return false; const P = run.sortie.plan, i = P.slots.findIndex(q => q.kind === 'sub'); return i >= 0 && !!(run.sortie.slotUsed && run.sortie.slotUsed.has(i)); })()`); if (o.boss === undefined && SF.peek('world.bossSpawned')) o.boss = SF.peek('(-Math.floor((H - 1 - Math.floor(world.scroll)) / CH)) - world.stageBaseP'); }
    Object.assign(o, SF.peek(`({ state: app.state, picker: document.getElementById('diffAsk').classList.contains('open'), n: app.diffNext && app.diffNext.n, errs: SF.R.errs.slice(0, 2) })`)); return o; });
  ok(f.sub, `on the way the game's submarine took its berth by the U-boat bunker`);
  ok(f.boss !== undefined && f.state === 'play' && !f.picker && f.errs.length === 0, `level 6 flown through: the boss comes (screen bottom at chunk ${f.boss}) and, the last level, the run loops to level 1 (no picker) (${f.status}${f.errs.length ? ', errors: ' + f.errs.join(' | ') : ''})`);
  await page2.close();
}

// 3b'''. Level 3, The Long Night: one night plan over the whole level (the beach, the power works with their pylon line, farmland, the
// burning town, the searchlight airbase, the forest, light industry, the rail corridor and the marshalling yard), then the supergun's arena
// with the yard's outer tracks running on through it. Ground types and pixels are the plan's (painted at night), the local night rule
// holds, the plan's routes and the mist are there, it is the same after a resume, and flown through by the bot it reaches the boss with
// trains and searchlight posts on the way and flies on into level 4 without errors.
{
  const page = await freshPage();
  const r = await peek(page, `(() => { settings.diff = 1; startEnigma(3); const S = run.sortie, P = sortiePlan(S), v = CityGen.validate(P); let types = 0, n = 0;
    for (let y = 0; y < P.L; y += 41) { const wy = S.planY0 - y; for (let x = 5; x < W; x += 31) { n++; if (terrainType(x, wy) !== CityGen.typeAt(P, x, y)) types++; } }
    const p = world.stageBaseP + 21; startChunk(p); const jb = world.chunkJobs[world.chunkJobs.length - 1]; while (jb.ly < CH) workChunk(jb, 2); world.chunkJobs.pop();
    const img = { data: new Uint8ClampedArray(W * CH * 4) }; CityGen.paint(P, img, S.planY0 - (-p * CH + CH - 1), CH, planPaintOpts(S)); let pix = 0; for (let i = 0; i < img.data.length; i++) if (img.data[i] !== jb.img.data[i]) pix++;
    const A = info(world.stageBaseP + S.len + 2), wyA = -(world.stageBaseP + S.len + 2) * CH + 30, runEnd = x => P.trainRuns.some(q => q.x === x && q.y1 === P.L - 1);
    const fl = { x: 130, y: 100 }, far = { x: 200, y: 100 }; world.enemies = [{ type: 'search', x: 100, y: 100 }]; const lit = nightLit(fl), unlit = nightLit(far); const S0 = run.sortie; run.sortie = null; const camp = nightLit({ x: 200, y: 100 }); run.sortie = S0; world.enemies = [];
    const R = sortieRoutes(S).filter(q => !q.legacy), SR = sideRoutes(S), seg = t => S.segs.find(g => g.t === t), mid = t => -(world.stageBaseP + seg(t).start + seg(t).n / 2) * CH;
    return { pass: v.pass, L: P.L, len: S.len * CH, types, n, pix, night: planPaintOpts(S).night, seaFirst: info(world.stageBaseP).b === 'sea' && terrainType(112, S.planY0 - 10) === 'sea',
      wagons: P.yard ? P.yard.wagons.length : 0, ab: !!P.airbase && P.airbase.planes.length, fo: !!P.forest && P.trees.length, pyl: (P.pylons || []).filter(q => q.ok).length, posts: (P.searchPosts || []).length, gens: P.slots.filter(q => q.kind === 'gen').length,
      runs: runEnd(93) && runEnd(131) && runEnd(55) && runEnd(169), arena: A.b, arenaRails: [18, 55, 93, 131, 169].every(x => A.rails.includes(x)), railAt: terrainType(55, wyA) === 'rail' && terrainType(169, wyA) === 'rail',
      lit, unlit, camp, routes: R.length, sides: SR.length, mistF: weatherAt(S, 'mist', mid('farmland')), mistY: weatherAt(S, 'mist', mid('station_marshalling')) }; })()`);
  ok(r.pass && r.L === r.len && r.seaFirst && r.night, `level 3 plan passes the generator's hard rules, covers the whole level (${r.L} px), begins over the sea and is painted at night`);
  ok(r.wagons >= 20 && r.ab >= 4 && r.fo > 500 && r.pyl >= 4, `level 3 has the marshalling yard (${r.wagons} wagons), the airbase (${r.ab} parked planes), the forest (${r.fo} trees) and the pylon line (${r.pyl} pylons)`);
  ok(r.posts >= 4 && r.gens >= 3, `level 3 has searchlight posts with flak and generators (${r.posts} posts, ${r.gens} generators)`);
  ok(r.runs && r.arena === 'bossland' && r.arenaRails && r.railAt, `level 3's yard tracks (x 55, 93, 131, 169) run to the plan's end and on through the supergun's arena (${r.arena})`);
  ok(r.types === 0 && r.pix === 0, `level 3 ground types and pixels come from its night plan (${r.types} of ${r.n} types and ${r.pix} bytes differ)`);
  ok(r.lit && !r.unlit && r.camp, 'night rule: in Enigma Run only a gun within 70 px of a lit searchlight gets the night bonuses; in the Campaign every gun keeps them');
  ok(r.routes >= 1 && r.sides >= 3, `level 3's tank streets are route objects (${r.routes} along the strip, ${r.sides} side roads)`);
  ok(r.mistF > 0.5 && r.mistY === 0, `level 3's weather plan: mist over the farmland (${r.mistF.toFixed(2)}), none over the yard`);
  const hashL = 'SF.chunkHash(world.stageBaseP - 2, world.stageBaseP + run.sortie.len + 6)';
  const fresh = await peek(page, `(() => { startEnigma(3); return ${hashL}; })()`), resumed = await peek(page, `(() => { saveResume(); resumeRun(store.getJSON(KEY.resume)); return run.sortie.level + ':' + ${hashL}; })()`);
  ok('3:' + fresh === resumed, `level 3 is the same ground after a resume (${fresh})`);
  await page.close();
  const page2 = await freshPage();
  const f = await page2.evaluate(() => { const SF = window.SF; SF.setMode('immortal'); SF.peek('settings.diff = 1; startEnigma(3)'); const o = { status: 'ok', train: false, posts: 0, route: false };
    for (let i = 0; i < 20000 && o.status === 'ok'; i++) { o.status = SF.run(100); const q = SF.peek(`(() => { const S = run.sortie; if (!S || !S.plan) return null; const P = S.plan; return { train: world.enemies.some(e => e.type === 'loco' && !e.dead && info(-Math.floor(e.wy / CH)).plan), posts: P.slots.filter((s, i) => s.kind === 'search' && S.slotUsed && S.slotUsed.has(i)).length, route: world.enemies.some(e => e.route) }; })()`);
      if (q) { o.train = o.train || q.train; o.posts = Math.max(o.posts, q.posts); o.route = o.route || q.route; }
      if (o.boss === undefined && SF.peek('world.bossSpawned')) o.boss = SF.peek('(-Math.floor((H - 1 - Math.floor(world.scroll)) / CH)) - world.stageBaseP'); }
    Object.assign(o, SF.peek(`({ state: app.state, picker: document.getElementById('diffAsk').classList.contains('open'), n: app.diffNext && app.diffNext.n, errs: SF.R.errs.slice(0, 2) })`)); return o; });
  ok(f.train && f.posts >= 3, `on the way trains ran on the plan's tracks and ${f.posts} searchlight posts were manned${f.route ? ', and a convoy drove along a route' : ''}`);
  ok(f.boss !== undefined && f.status === 'next:4' && f.errs.length === 0, `level 3 flown through: the boss comes (screen bottom at chunk ${f.boss}) and the run flies on into level 4 (${f.status}${f.errs.length ? ', errors: ' + f.errs.join(' | ') : ''})`);
  await page2.close();
}


// 3b'''. Level 1's carrier start: the Feuervogel stands on the deck of a carrier that nearly fills the screen and cannot steer until it has
// lifted off; the carrier carries six deck guns that can be destroyed (and no hull target); fighters launch from its catapults and chase the
// player; it shrinks to half size and slides off the bottom; the pursuit ends and the director takes over. A Campaign run has no carrier.
{
  const page = await freshPage();
  const r = await page.evaluate(() => { const SF = window.SF; SF.setMode('immortal');
    const o = SF.peek(`(() => { settings.diff = 1; startAt(1); const camp = world.carrier === null; settings.diff = 1; startEnigma(1); const C = world.carrier;
      return { camp, on: !!C, s: C && C.s, K: CV.K, sEnd: Math.round(CV.K * CV.END * 128) / 128, deck: player.deck, steer: canSteer(), guns: world.enemies.filter(e => e.type === 'cgun').length, len: C && Math.round(-CV.BOW * 2 * C.s), H, top: C && Math.round(C.y + CV.BOW * C.s) }; })()`);
    SF.run(30); o.steer30 = SF.peek('canSteer()'); o.shotsBefore = SF.peek('world.shots.length');
    SF.run(SF.peek('CV.FLY') - 30 + 2); Object.assign(o, SF.peek(`({ deckAfter: player.deck, alt: player.alt, steerAfter: canSteer(), cf: world.enemies.filter(e => e.type === 'cfighter').length + world.enemies.filter(e => e.chase).length })`));
    o.gunKill = SF.peek(`(() => { const g = world.enemies.find(e => e.type === 'cgun' && !e.dead); if (!g) return false; damage(g, 999); return g.dead && world.carrier.gunDead[g.gi] === true; })()`);
    o.ships = 0; o.minS = 9; o.chase = 0;
    for (let i = 0; i < 250; i++) { SF.run(10); const v = SF.peek(`({ over: world.carrier.over, gone: world.carrier.gone, s: world.carrier.s, ships: world.enemies.filter(e => ['destroyer', 'sub'].includes(e.type)).length, chase: world.enemies.filter(e => e.chase && !e.dead).length })`);
      if (!v.over) o.ships += v.ships; o.minS = Math.min(o.minS, v.s); o.chase = Math.max(o.chase, v.chase); o.gone = v.gone; o.over = v.over; }
    o.launched = SF.peek('world.carrier.launched'); o.t = SF.peek('world.carrier.t'); SF.run(1500); o.later = SF.peek(`world.enemies.filter(e => !e.chase && !e.dead && ['fighter', 'bomber', 'heavy', 'sub', 'destroyer', 'pt', 'flak'].includes(e.type)).length + run.stats.seen`); o.errs = SF.R.errs.slice(0, 2); return o; });
  ok(r.camp, 'a Campaign run has no carrier');
  ok(r.on && r.s === r.K && r.len >= r.H * 0.7 && r.deck && !r.steer && !r.steer30 && r.guns === 6, `level 1 opens on the carrier's deck: scale ${r.K}, ${r.len} px long on a ${r.H} px screen, six deck guns, no steering while on the deck`);
  ok(!r.deckAfter && r.alt === 1 && r.steerAfter && r.cf >= 1, `the Feuervogel lifts off over the bow and can steer; fighters are launching after it (${r.cf})`);
  ok(r.gunKill, 'a deck gun can be destroyed and leaves its stub on the deck');
  ok(r.minS === r.sEnd && r.gone && r.over, `the carrier shrinks to ${r.sEnd} and slides off the bottom, and the pursuit ends (scene over at frame ${r.t})`);
  ok(r.launched === 2 && r.chase >= 1 && r.ships === 0, `${r.launched} fighters launched on Veteran in the pursuit (up to ${r.chase} chasing at once); no destroyer or submarine spawned during the scene (only its two PT boats)`);
  ok(r.later > 0 && r.errs.length === 0, `after the scene the director takes over (${r.later} enemies seen)${r.errs.length ? ', errors: ' + r.errs.join(' | ') : ''}`);
  await page.close();
}

// 3b'''''. Level 1, the islands. One islands plan from the first chunk to the fortified beach (the islets in
// island_chain, the large island from island_airbase on), the legacy ground after it; the picker offers it; types and pixels are the plan's;
// the same ground after a resume. Flown through by the bot: it opens on the carrier, the islets' turrets and the airbase's guns and planes take
// their slots, cows graze in the paddocks, no ship ever stands on land, the flagship comes and the run flies on into level 2.
{
  const page = await freshPage();
  const r = await peek(page, `(() => { openDiff('camp', 2, true); const btn = document.querySelector('#dStage [data-s="1"]'), shown = !btn.hidden && btn.textContent === '1'; closeDiff();
    settings.diff = 1; startEnigma(1); const S = run.sortie, P = sortiePlan(S), v = CityGen.validate(P), beach = S.segs.find(g => g.t === 'beach_fortified').start; let types = 0, n = 0;
    for (let y = 0; y < P.L; y += 37) { const wy = S.planY0 - y; for (let x = 5; x < W; x += 29) { n++; if (terrainType(x, wy) !== CityGen.typeAt(P, x, y)) types++; } }
    const p = world.stageBaseP + 20; startChunk(p); const jb = world.chunkJobs[world.chunkJobs.length - 1]; while (jb.ly < CH) workChunk(jb, 2); world.chunkJobs.pop();
    const img = { data: new Uint8ClampedArray(W * CH * 4) }; CityGen.paint(P, img, S.planY0 - (-p * CH + CH - 1), CH, planPaintOpts(S)); let pix = 0; for (let i = 0; i < img.data.length; i++) if (img.data[i] !== jb.img.data[i]) pix++;
    const bio = S.planBiome.join(''), after = info(world.stageBaseP + beach);
    return { shown, pass: v.pass, L: P.L, want: beach * CH, types, n, pix, isles: P.isles.length, airbase: !!P.airbase, land: S.planBiome.filter(b => b === 'country').length, sea: S.planBiome.filter(b => b === 'sea').length, after: after.b, afterPlan: !!after.plan, carrier: !!world.carrier }; })()`);
  ok(r.shown, 'the Practice picker offers level 1');
  ok(r.pass && r.L === r.want && r.isles >= 5 && r.airbase, `level 1 plan passes the generator's hard rules and runs from the first chunk to the fortified beach (${r.L} px, ${r.isles} islets, the airbase)`);
  ok(r.land >= 8 && r.sea >= 14 && r.after === 'coastUp' && !r.afterPlan && r.carrier, `level 1 plays the large island as land (${r.land} chunks) and the rest as sea (${r.sea}), the legacy coast after it, opens on the carrier; level 1 keeps the old ground`);
  ok(r.types === 0 && r.pix === 0, `level 1 ground types and pixels come from its plan, its water in the game's own sea texture (${r.types} of ${r.n} types and ${r.pix} bytes differ)`);
  const hashL = 'SF.chunkHash(world.stageBaseP - 2, world.stageBaseP + run.sortie.len + 6)';
  const fresh = await peek(page, `(() => { startEnigma(1); return ${hashL}; })()`), resumed = await peek(page, `(() => { saveResume(); resumeRun(store.getJSON(KEY.resume)); return run.sortie.level + ':' + ${hashL}; })()`);
  ok('1:' + fresh === resumed, `level 1 is the same ground after a resume (${fresh})`);
  await page.close();
  const page2 = await freshPage();
  const f = await page2.evaluate(() => { const SF = window.SF; SF.setMode('immortal'); SF.peek('settings.diff = 1; startEnigma(1)'); const o = { status: 'ok', wet: 0, ships: 0, cows: 0 };
    for (let i = 0; i < 20000 && o.status === 'ok'; i++) { o.status = SF.run(100);
      const v = SF.peek(`(() => { const sc = Math.floor(world.scroll); let wet = 0, n = 0; for (const e of world.enemies) if (!e.dead && (e.type === 'destroyer' || e.type === 'sub' || e.type === 'pt') && e.y > 0 && e.y < H) { n++; if (terrainType(Math.floor(e.wx), Math.floor(e.wy)) !== 'sea') wet++; } return { wet, n, cows: critters.filter(c => c.box).length }; })()`);
      o.wet += v.wet; o.ships += v.n; o.cows = Math.max(o.cows, v.cows);
      if (o.boss === undefined && SF.peek('world.bossSpawned')) o.boss = SF.peek(`({ c: (-Math.floor((H - 1 - Math.floor(world.scroll)) / CH)) - world.stageBaseP, b: biomeOf(-Math.floor((H / 2 - Math.floor(world.scroll)) / CH)) })`);
      if (o.used === undefined && SF.peek('!!(run.sortie && run.sortie.slotUsed && run.sortie.slotUsed.size)') && SF.peek('(-Math.floor((H - 1 - Math.floor(world.scroll)) / CH)) - world.stageBaseP') > 30) o.used = SF.peek(`(() => { const P = run.sortie.plan, k = {}; for (const i of run.sortie.slotUsed) k[P.slots[i].kind] = (k[P.slots[i].kind] || 0) + 1; return { k, of: P.slots.length }; })()`); }
    Object.assign(o, SF.peek(`({ state: app.state, picker: document.getElementById('diffAsk').classList.contains('open'), n: app.diffNext && app.diffNext.n, errs: SF.R.errs.slice(0, 2) })`)); return o; });
  ok(f.used && f.used.k.bunker >= 1 && f.used.k.flak >= 2 && f.used.k.parked >= 1, `on the way the islands' guns took their slots (${f.used ? Object.entries(f.used.k).map(([k, v]) => v + ' ' + k).join(', ') + ' of ' + f.used.of : 'none'})`);
  ok(f.cows >= 3, `cows grazed in the paddocks (${f.cows} at once)`);
  ok(f.wet === 0, `no ship stood on land (${f.ships} ship sightings)`);
  ok(f.boss && f.boss.b === 'sea' && f.status === 'next:2' && f.errs.length === 0, `level 1 flown through: the flagship comes over the open sea (screen bottom at chunk ${f.boss && f.boss.c}) and the run flies on into level 2 (${f.status}${f.errs.length ? ', errors: ' + f.errs.join(' | ') : ''})`);
  await page2.close();
}

// 3b''''''. Route objects (spec 2, Tier A): a mixed convoy put on a route drives along it, switching routes where one route ends and another
// goes on (the lanes round a village green, the plan's edge), never leaves the road, keeps its distance (at least both half-lengths and
// 3b'. Level 1 at sunset: its loops (the level's seed past 1944) are flown in the evening, the first pass is unchanged. The loop's plan has the burning
// church (three blazes), its sea and land chunks are graded (no blue water left), its clouds are in the sunset ramp, and a resumed run is still at sunset.
{
  const page = await freshPage();
  const r = await peek(page, `(() => { settings.diff = 1; startEnigma(1, false, 0); const d0 = run.sortie.timeOfDay, f0 = sortiePlan(run.sortie).fires.length, same = sunSpr(SPR.clouds[0]) === SPR.clouds[0];
    const blue = S => { const P = sortiePlan(S), c = S.planBiome.indexOf('sea') + 1, p = world.stageBaseP + c; startChunk(p); const jb = world.chunkJobs[world.chunkJobs.length - 1]; let fin = false; while (!fin) fin = workChunk(jb, 8); world.chunkJobs.pop();
      let n = 0, b = 0; const a = jb.x.getImageData(0, 0, W, CH).data; for (let i = 0; i < a.length; i += 4) { n++; if (a[i + 2] - a[i] >= 40 && a[i + 2] >= a[i + 1]) b++; } return b / n; };
    const b0 = blue(run.sortie);
    startEnigma(1, false, 1); const S = run.sortie, P = sortiePlan(S), v = CityGen.validate(P), b1 = blue(S), sc = sunCloud(SPR.clouds[0]), ramp = new Set(SUN_CLOUD.map(c => c.join())), px = sc.c.getContext('2d').getImageData(0, 0, sc.c.width, sc.c.height).data; let opaque = 0, off = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i + 3]) { opaque++; if (!ramp.has([px[i], px[i + 1], px[i + 2]].join())) off++; }
    const fires = P.fires.length, burning = !!P.burning, d1 = S.timeOfDay, on = sunsetOn(), save = (saveResume(), resumeRun(store.getJSON(KEY.resume)), run.sortie.timeOfDay + ':' + run.sortie.seed);
    startEnigma(2, false, 1); const l2 = run.sortie.timeOfDay, mg = new Uint8ClampedArray([140, 140, 140, 255, 30, 110, 130, 255]); CityGen.morningGrade(mg, 2);
    return { d0, f0, same, b0, b1, v: v.pass, fires, burning, d1, on, opaque, off, save, l2, mWarm: mg[0] > mg[2] + 20, mGrey: [mg[0], mg[1], mg[2]].join(','), mSea: mg[6] > mg[4], mSeaPx: [mg[4], mg[5], mg[6]].join(','), mChunk: typeof CityGen.morningGrade === 'function' }; })()`);
  ok(r.d0 === 'day' && r.f0 === 0 && r.same && r.b0 > 0.3, `level 1's first pass stays a day level (no fire on its church, day clouds, ${(r.b0 * 100).toFixed(0)}% of a sea chunk blue)`);
  ok(r.d1 === 'sunset' && r.on && r.v && r.burning && r.fires === 3, `level 1's first loop is flown at sunset: the plan passes the hard rules and its church burns (${r.fires} blazes)`);
  ok(r.b1 < 0.02, `the loop's sea is graded to dusk water (${(r.b1 * 100).toFixed(1)}% of a sea chunk blue, against ${(r.b0 * 100).toFixed(0)}% by day)`);
  ok(r.opaque > 0 && r.off === 0, `the loop's clouds use the sunset ramp only (${r.opaque} pixels, ${r.off} outside it)`);
  ok(/^sunset:1945$/.test(r.save) && r.l2 === 'morning', `a resumed loop is still at sunset (${r.save}), and level 2's loop is flown in the morning, not at sunset`);
  ok(r.mWarm && r.mSea && r.mChunk, `the morning grade (level 2's loop): a grey pixel turns warm (${r.mGrey}), a sea pixel stays blue (${r.mSeaPx}), the whole level's ground is graded`);
  await page.close();
}
// 3b''. Level 3's first loop (seed 1945 only) is flown in the moonrise: the night's ground lifted into silver-blue moonlight (CityGen.moonGrade over every baked chunk, trees carry it), a pale glow from the moon's side;
// the first pass (1944) and the second loop (1946) keep the plain night. Its plan passes the hard rules, its stretches differ from the first pass's, and the first pass's are unchanged.
{
  const page = await freshPage();
  const r = await peek(page, `(() => { const o = {}; for (const lp of [0, 1, 2]) { settings.diff = 1; startEnigma(3, false, lp); const S = run.sortie; o['l' + lp] = { moon: !!S.moon, tod: S.timeOfDay, variant: S.variant, segs: S.segs.map(g => g.n).join(), valid: CityGen.validate(sortiePlan(S)).pass }; }
    startEnigma(3, false, 1); const S = run.sortie, P = sortiePlan(S), c = 40; startChunk(world.stageBaseP + c); const jb = world.chunkJobs[world.chunkJobs.length - 1]; let fin = false; while (!fin) fin = workChunk(jb, 8); world.chunkJobs.pop();
    const mg = new Uint8ClampedArray([40, 40, 40, 255, 60, 40, 30, 255]); CityGen.moonGrade(mg, 2); const g1 = jb.c.grade;
    startEnigma(3, false, 0); startChunk(world.stageBaseP + c); const j0 = world.chunkJobs[world.chunkJobs.length - 1]; fin = false; while (!fin) fin = workChunk(j0, 8); world.chunkJobs.pop(); const g0 = j0.c.grade || null;
    return JSON.stringify({ o, mgLift: mg[2] > 40 * 1.5 && mg[2] > mg[0] + 20, mgPx: [mg[0], mg[1], mg[2]].join(','), g1, g0 }); })()`);
  const q = JSON.parse(r);
  ok(q.o.l0.tod === 'night' && !q.o.l0.moon && !q.o.l2.moon && q.o.l1.moon && q.o.l1.tod === 'night' && q.o.l1.variant === 1 && !q.o.l2.variant && q.o.l0.valid && q.o.l1.valid, `level 3: the moonrise in seed 1945 only (first pass ${q.o.l0.moon}, first loop ${q.o.l1.moon}, second loop ${q.o.l2.moon}); both plans pass the hard rules`);
  ok(q.o.l1.segs !== q.o.l0.segs && q.o.l1.segs.split(',').reduce((a, b) => a + +b, 0) === q.o.l0.segs.split(',').reduce((a, b) => a + +b, 0), `the first loop's stretches (${q.o.l1.segs}) differ from the first pass's (${q.o.l0.segs}) and add up to the same length`);
  ok(q.mgLift && /^(moon|moonp)$/.test(q.g1) && !q.g0, `the moon grade lifts a dark grey pixel into blue-silver (${q.mgPx}); a loop chunk is graded (${q.g1}), a first-pass chunk is not (${q.g0})`);
  await page.close();
}

// ROUTE_GAP minus a pixel), and stops at a dead end: in level 1 from the airbase down the island's road to the jetty, switching routes on the way; in level 6 through the harbour city (one
// route there: no switch needed). Only the convoy moves (its own update, no frame loop), so the test sees the route logic alone.
{
  const page = await freshPage();
  for (const [lv, name, frames] of [[1, '1', 4000], [6, '6', 26000]]) {
    const r = await peek(page, `(() => { settings.diff = 1; startEnigma(${lv}); SIDE.turn = 0; /* this test follows the routes alone (side roads have their own check) */ const S = run.sortie, R = sortieRoutes(S), plan = R.filter(q => !q.legacy);
      let bad = 0, n = 0; for (const q of plan) for (let wy = q.wyLo; wy <= q.wyHi; wy += 3) { n++; const t = terrainType(Math.floor(routeX(q, wy)), wy); if (t !== 'road' && t !== 'bridge') bad++; }
      const start = plan.filter(q => q.main && q.wyHi - q.wyLo > 3 * ROUTE_SPACE + 16).sort((a, b) => a.wyLo - b.wyLo)[0], wy0 = start.wyLo + 3 * ROUTE_SPACE + 8; /* the northernmost main road with room for the convoy */
      world.enemies = []; world.scroll = -wy0 + 200; ensureChunks(); for (let i = 0; i < 400 && world.chunkJobs.length; i++) ensureChunks();
      const mk = (type, k) => { const o = type === 'truck' ? G('truck', routeX(start, wy0 - k * ROUTE_SPACE), wy0 - k * ROUTE_SPACE, { road: true, dir: 1, lane: 0, v: 0.32, hd: PI / 2, route: start.id }) : G('tank', routeX(start, wy0 - k * ROUTE_SPACE), wy0 - k * ROUTE_SPACE, tankStats({ road: true, dir: 1, lane: 0, v: 0.2, hd: PI / 2, route: start.id })); world.enemies.push(o); return o; };
      const cv = [mk('tank', 0), mk('truck', 1), mk('tank', 2), mk('truck', 3)];
      let seen = {}, minGap = 1e9, offRoad = 0, switches = 0, last = cv.map(o => o.route);
      let late = 0; for (let f = 0; f < ${frames}; f++) { for (const o of cv) ENT[o.type].update(o); if (f === ${frames} - 400) late = cv[0].wy;
        if (f % 10 === 0) { const srt = cv.slice().sort((a, b) => b.wy - a.wy); for (let i = 1; i < srt.length; i++) if (Math.abs(srt[i].wx - srt[i - 1].wx) < 9) minGap = Math.min(minGap, srt[i - 1].wy - srt[i].wy - srt[i - 1].hh - srt[i].hh);
          for (const o of cv) { const t = terrainType(Math.floor(o.wx), Math.floor(o.wy)); if (t !== 'road' && t !== 'bridge') { offRoad++; const P = S.plan, py = Math.round(S.planY0 - o.wy), pi = py * P.W + Math.round(o.wx), key = t + ':' + (py >= 0 && py < P.L ? CityGen.KIND_NAMES[P.K[pi]] + P.B[pi] : 'out') + (o.atEnd ? '@end' : ''); seen[key] = (seen[key] || 0) + 1; } } cv.forEach((o, i) => { if (o.route !== last[i]) { switches++; last[i] = o.route; } }); } }
      SIDE.turn = 0.35; return { seen: JSON.stringify(seen), routes: plan.length, bad, n, minGap: Math.round(minGap), offRoad, switches, end: cv.every(o => o.atEnd || !o.moving), front: Math.round(cv[0].wy - wy0), stopped: cv[0].atEnd || cv[0].wy === late }; })()`); // at a dead end, or held where the road meets the water
    ok(r.routes >= 3 && r.bad <= r.n * 0.02, `level ${name}: ${r.routes} routes from the plan's tank streets, on the road (${r.bad} of ${r.n} samples off it)`);
    ok(r.offRoad === 0 && r.minGap >= 9 && (r.switches >= 1 || lv === 6) && r.stopped && r.front > 300, `level ${name}: a convoy drove ${r.front} px along its routes (${r.switches} route changes), never off the road, at least ${r.minGap} px between vehicles, and stopped at the end (off the road ${r.offRoad} ${r.seen}, stopped ${r.stopped})`);
  }
  await page.close();
}

// 3c. Level 6 is the same ground every time: a fresh page, after a Campaign run in the same page, and after a resume give the same chunk pixels.
{
  const page = await freshPage();
  const hashL6 = 'SF.chunkHash(world.stageBaseP - 2, world.stageBaseP + run.sortie.len + 6)';
  const fresh = await peek(page, `(() => { settings.diff = 1; startEnigma(6); return ${hashL6}; })()`);
  await page.evaluate(() => { window.SF.setMode('immortal'); window.SF.start(1, 1); window.SF.run(3000); });
  const after = await peek(page, `(() => { startEnigma(6); return ${hashL6}; })()`);
  const resumed = await peek(page, `(() => { saveResume(); resumeRun(store.getJSON(KEY.resume)); return ${hashL6}; })()`);
  ok(fresh === after && fresh === resumed, `level 6 ground is identical fresh, after a Campaign run and after a resume (${fresh}${fresh === after && fresh === resumed ? '' : ' / ' + after + ' / ' + resumed})`);
  await page.close();
}

// 3e. Level 6 flown through by the bot: the boss comes when the bottom of the screen reaches the secret ground (the final airfield the sky fortress
// duel needs), the final airfield is found, and the level ends at the picker. Immortal bot, so it always gets there.
{
  const page = await freshPage();
  const r = await page.evaluate(() => {
    const SF = window.SF; SF.setMode('immortal'); SF.peek('settings.diff = 1; startEnigma(6)');
    const o = { status: 'ok' };
    for (let i = 0; i < 20000 && o.status === 'ok'; i++) {
      o.status = SF.run(o.bottomC === undefined ? 5 : 100); // fine steps until the boss comes, so the measured position is exact to 2 px
      if (o.bottomC === undefined && SF.peek('world.bossSpawned')) Object.assign(o, SF.peek(`(() => { const sc = Math.floor(world.scroll), p = -Math.floor((H - 1 - sc) / CH);
        return { bottomC: p - world.stageBaseP, bottomB: info(p).b, len: run.sortie.len, final: finalStartY() !== null, arc: arcScale(), slots: (run.sortie.slotUsed || new Set()).size, nSlots: run.sortie.plan.slots.length }; })()`));
    }
    Object.assign(o, SF.peek(`({ state: app.state, picker: document.getElementById('diffAsk').classList.contains('open'), kind: app.diffNext && app.diffNext.kind, errs: SF.R.errs.slice(0, 2) })`));
    return o;
  });
  ok(r.bottomC !== undefined && r.bottomB === 'secret' && r.bottomC === r.len + 1 && r.final, `level 6 boss comes where the Campaign's does: screen bottom one chunk into the secret ground (bottom chunk ${r.bottomC}, secret from ${r.len}; Campaign stage 6: 44 and 43)`);
  ok(r.slots >= 8, `ground guns stood in the plan's slots on the way (${r.slots} of ${r.nSlots} slots used)`);
  ok(r.state === 'play' && !r.picker && r.errs.length === 0, `level 6, the last, flown to the end: the congratulations, then level 1 again (no picker) (${r.status}, state ${r.state}${r.errs.length ? ', errors: ' + r.errs.join(' | ') : ''})`);
  await page.close();
}

// 3f2. The Sower in level 4's first loop (seed 1945): it flies a zigzag (a triangle wave, not the first pass's sine), so its mines lay a zigzag line; the mines last 400
// frames, not 250; one Sower first, then the pair in step (both turn at the same moment, a constant gap between them). The first pass keeps its sweep (3f).
{
  const page = await freshPage();
  const r = await page.evaluate(() => {
    const SF = window.SF; SF.setMode('immortal'); SF.peek('settings.diff = 1; startEnigma(4, true, 1); SOWER.hp = 99999; SOWER_L.hp = 99999');
    const o = { solo: [], pairGap: [], turns: 0, mineMax: 0, left: false, held: 0 }; let lastDir = 0, lastX = null;
    for (let i = 0; i < 1500 && !o.left; i++) { SF.run(3);
      const q = SF.peek(`(() => { const L = world.enemies.filter(e => e.type === 'sower' && !e.dead && e.st === 'hold'), m = world.ebul.filter(b => b.kind === 'amine');
        return { n: L.length, xs: L.map(e => e.x), mine: m.length ? m[0].max : 0, all: world.enemies.filter(e => e.type === 'sower' && !e.dead).length }; })()`);
      o.mineMax = Math.max(o.mineMax, q.mine); if (q.n) o.held++;
      if (q.n === 1 && q.all === 1) { o.solo.push(q.xs[0]); const dir = lastX === null ? 0 : Math.sign(q.xs[0] - lastX); if (dir && lastDir && dir !== lastDir) o.turns++; if (dir) lastDir = dir; lastX = q.xs[0]; }
      if (q.n === 2) o.pairGap.push(Math.abs(q.xs[0] - q.xs[1]));
      if (o.held && q.all === 0) o.left = true; }
    o.errs = SF.R.errs.slice(0, 2); return o; });
  const span = Math.max(...r.solo) - Math.min(...r.solo), pg = r.pairGap.slice(Math.floor(r.pairGap.length * 0.4)), gapSpread = pg.length ? Math.max(...pg) - Math.min(...pg) : 999; /* (once the second one has settled into its lane) */
  ok(r.solo.length > 60 && span > 80 && r.turns >= 2, `level 4 first loop: the lone Sower flies a zigzag (${span.toFixed(0)} px wide, ${r.turns} turns)`);
  ok(r.mineMax === 400, `its mines last 400 frames (${r.mineMax})`);
  ok(r.pairGap.length > 30 && gapSpread < 30 && Math.min(...pg) > 60, `then the pair flies in step: ${r.pairGap.length} steps, the gap between them stays within ${gapSpread.toFixed(0)} px once settled`);
  ok(r.left && r.errs.length === 0, `then they climb away, with no errors${r.errs.length ? ': ' + r.errs.join(' | ') : ''}`);
  await page.close();
}
// 3h. Level 4's first loop (seed 1945): the valley convoy. The encounter is placed at the valley (run.sortie.encPlan); the valley has a river along the strip; five
// river craft (a tug, two gun barges, a fuel barge, the parts barge) sail north up it, each on water, and armoured cars and tankers drive north along the road; the armed ones fire
// back; it comes once; the first pass has no such encounter and no river. No errors.
{
  const page = await freshPage();
  const a = await peek(page, `(() => { startEnigma(4, true, 0); const f = { plan: run.sortie.encPlan, river: !!(run.sortie.plan.rivers2 || []).length }; startEnigma(4, true, 1); const S = run.sortie, v = S.segs.find(g => g.t === 'valley');
    return { first: f, plan: S.encPlan && S.encPlan.map(q => q.id + ':' + q.c), valley: v.start, river: (S.plan.rivers2 || []).length }; })()`);
  ok(a.first.plan === null && !a.first.river, 'level 4, seed 1944: no valley convoy, no river');
  ok(a.river === 1 && a.plan && a.plan.length === 2 && a.plan[1] === `valleyconvoy:${a.valley - 1}`, `level 4, seed 1945: the valley has a river and the convoy is placed at it (${a.plan})`);
  const f = await page.evaluate(() => { const SF = window.SF; SF.setMode('immortal'); SF.peek('settings.diff = 1; startEnigma(4, true, 1)'); const o = { started: 0, starts: 0, wet: 0, dry: 0, boats: 0, road: 0, north: 0, shots: 0, ended: null };
    for (let i = 0; i < 600 && o.ended === null; i++) { SF.run(30);
      const q = SF.peek(`(() => { const S = run.sortie, B = world.enemies.filter(e => ['tug', 'bargeF', 'bargeC', 'bargeG'].includes(e.type) && !e.dead), Rd = world.enemies.filter(e => e.cv && !e.dead);
        return { enc: world.enc && world.enc.id, t: world.enc ? world.enc.t : 0, kinds: B.map(e => e.type).sort().join(), road: Rd.length, wet: B.filter(e => e.wx >= W - 1 || CityGen.typeAt(S.plan, Math.round(e.wx), Math.round(S.planY0 - e.wy)) === 'river').length, /* (past the strip's edge the river runs on, off the plan) */ nB: B.length, wys: B.map(e => e.wy), ebul: world.ebul.length }; })()`);
      if (q.enc === 'valleyconvoy') { if (!o.started) { o.started = 1; o.starts++; o.kinds = q.kinds; o.wy0 = q.wys.slice(); o.road0 = q.road; } o.wet += q.wet; o.dry += q.nB - q.wet; o.road = Math.max(o.road, q.road); o.boats = Math.max(o.boats, q.nB); o.shots = Math.max(o.shots, q.ebul);
        if (q.t > 500 && !o.wy1) o.wy1 = q.wys.slice(); }
      else if (o.started) o.ended = q.enc || 'none'; }
    o.errs = SF.R.errs.slice(0, 2); return o; });
  ok(f.started === 1 && f.kinds === 'bargeC,bargeF,bargeG,bargeG,tug' && f.road >= 5, `the convoy comes: ${f.kinds}; ${f.road} road vehicles`);
  ok(f.dry === 0 && f.wet > 10, `every river craft sails on water (${f.wet} samples on the river, ${f.dry} off it)`);
  ok(f.wy1 && f.wy0.length === f.boats && f.wy1.every((w, k) => w <= f.wy0[k] + 1) && f.wy1.some((w, k) => w < f.wy0[k] - 20), 'the river craft sail north (their world y falls)');
  ok(f.shots > 0 && f.ended !== null && f.errs.length === 0, `the armed ones fire back, the encounter ends and rests, no errors${f.errs.length ? ': ' + f.errs.join(' | ') : ''}`);
  await page.close();
}
// 3i. Level 4's first loop (seed 1945): the Cliff Battery at the start. It is placed at the cliff coast (encPlan, c 1); gentle at first (nothing for 300 frames, the radar then stands
// on the plateau); the rim guns (the artillery) fire only in its four broadsides, on a beat, growing (3, 4, 5, 5 shells a gun); with the radar shot away the middle gun's aimed fan is
// left out. The first pass has no such encounter. No errors.
{
  const page = await freshPage();
  const f = await page.evaluate(() => { const SF = window.SF; SF.setMode('immortal'); SF.peek('settings.diff = 1; startEnigma(4, true, 1)'); const o = { early: 0, radarAt: -1, beats: [], ended: null, started: false, peaks: [], dead: false };
    for (let i = 0; i < 90 && o.ended === null; i++) { SF.run(20);
      const q = SF.peek(`(() => { const E0 = world.enc; return { enc: E0 && E0.id, t: E0 ? E0.t : 0, i: E0 ? E0.i : 0, radar: world.enemies.filter(e => e.type === 'radar' && !e.dead).length, arty: world.enemies.filter(e => e.type === 'arty' && !e.dead && e.y > 0).length, markers: markers.length, eb: world.ebul.filter(b => b.kind === 's' || b.kind === undefined).length }; })()`);
      if (q.enc === 'cliffbattery') { o.started = true; if (q.t < 420 && q.markers > 0) o.early++; if (q.radar && o.radarAt < 0) o.radarAt = q.t; o.peaks.push([q.i, q.eb]); }
      else if (o.started) o.ended = q.enc || 'none'; }
    o.errs = SF.R.errs.slice(0, 2); return o; });
  const mx = k => Math.max(0, ...f.peaks.filter(p => p[0] === k + 2).map(p => p[1]));
  ok(f.started && f.radarAt > 250 && f.early === 0, `level 4 first loop: the Cliff Battery starts gently (radar up at t ${f.radarAt}, no artillery fire before the first salvo)`);
  ok(f.peaks.some(p => p[0] >= 5) && f.ended !== null, `all four broadsides fire and the encounter ends and rests (${f.ended})`);
  ok(f.errs.length === 0, `no errors${f.errs.length ? ': ' + f.errs.join(' | ') : ''}`);
  await page.close();
}
// 3j. Level 4's first loop (seed 1945): the light changes along the level (drawAutumnLight): cool and overcast at the cliffs (blue above red on a grey field), golden by the
// valley (red well above blue); the first pass never draws it. No errors.
{
  const page = await freshPage();
  const r = await peek(page, `(() => { startEnigma(4, true, 1); const S = run.sortie, px = p => { world.scroll = p * S.len * CH + world.stageBaseP * CH + H / 2; ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, W, H); drawAutumnLight(); const d = ctx.getImageData(W / 2, H / 2, 1, 1).data; return [d[0], d[2]]; };
    const a = px(0.05), b = px(0.85); startEnigma(4, true, 0); return { a, b, first: !!run.sortie.autumn }; })()`);
  ok(r.a[1] > r.a[0] + 4 && r.b[0] > r.b[1] + 40 && !r.first, `level 4 first loop: overcast at the start (R ${r.a[0]}, B ${r.a[1]}), golden by the valley (R ${r.b[0]}, B ${r.b[1]}); the first pass has no autumn light`);
  await page.close();
}
// 3l2. Level 6's first loop (seed 1945, run.sortie.haze): dawn haze. The flag is on in seed 1945 only; hazeGrade takes colour out and tints warm (red above blue on a mid-grey, a saturated blue loses saturation);
// the chunks of the loop carry grade 'haze' and the first pass's do not; drawHazeLight tints a grey frame warm and is thicker at the top than at the bottom. No errors.
{
  const page = await freshPage();
  const r = await peek(page, `(() => { const o = {}; const flags = lv => { startEnigma(6, true, lv); return [run.sortie.seed, !!run.sortie.haze]; }; o.f0 = flags(0); o.f1 = flags(1); o.f2 = flags(2);
    const d = new Uint8ClampedArray([128, 128, 128, 255, 40, 80, 200, 255]); CityGen.hazeGrade(d, 2); o.grey = [d[0], d[1], d[2]]; o.blue = [d[4], d[5], d[6]];
    startEnigma(6, true, 1); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, W, H); drawHazeLight(); const a = ctx.getImageData(W - 4, 2, 1, 1).data, b = ctx.getImageData(W - 4, H - 3, 1, 1).data; o.top = [a[0], a[2]]; o.bot = [b[0], b[2]];
    o.errs = SF.R.errs.slice(0, 2); return o; })()`);
  ok(r.f0[0] === 1944 && !r.f0[1] && r.f1[0] === 1945 && r.f1[1] && r.f2[0] === 1946 && !r.f2[1], 'level 6: the haze flag is on in seed 1945 only');
  ok(r.grey[0] > r.grey[2] + 6 && r.blue[2] - r.blue[0] < 160, `hazeGrade tints warm (grey -> ${r.grey}) and takes colour out (blue -> ${r.blue})`);
  ok(r.top[0] - r.top[1 - 1] !== undefined && (r.top[0] - r.top[1]) > (r.bot[0] - r.bot[1]), `the haze is thicker at the top (R-B ${r.top[0] - r.top[1]}) than at the bottom (${r.bot[0] - r.bot[1]})`);
  ok(r.errs.length === 0, 'level 6 haze: no errors');
  await page.close();
}
// 3l3. Level 6's first loop (seed 1945): the stretches are moved (loopSeq). The sea in stays first, the south harbour second and the station last; only the city centre and the town, and the power
// works and the ruins, may trade places (each only with its neighbour); no stretch is under 3 chunks; the level keeps its length; the same seed always makes the same order; over 30 hashed seeds
// both swaps and different lengths occur. The first pass (1944) and 1946 keep the authored order and lengths. The loop's harbour is moved (HARBOUR6: the shore, the side channel). No errors.
{
  const page = await freshPage();
  const r = await peek(page, `(() => { const o = {}, names = S => S.segs.map(g => g.t).join(','), base = names(buildSortie(6, CAMP_SEED)); o.base = base; o.p1946 = names(buildSortie(6, CAMP_SEED + 2)) === base; o.lens0 = buildSortie(6, CAMP_SEED).segs.map(g => g.n).join(',');
    o.lens2 = buildSortie(6, CAMP_SEED + 2).segs.map(g => g.n).join(','); const a = buildSortie(6, CAMP_SEED + 1), b = buildSortie(6, CAMP_SEED + 1); o.same = JSON.stringify(a.segs) === JSON.stringify(b.segs); o.len = a.len; o.haze = [a.haze, buildSortie(6, CAMP_SEED).haze, buildSortie(6, CAMP_SEED + 2).haze];
    let bad = 0, swaps = 0, diff = 0, minN = 99, lens = new Set(); for (let k = 0; k < 30; k++) { const q = loopSeq(ENIGMA_SEQ[5], 5000 + k * 37, 6), n = q.map(x => x[0]);
      if (n[0] !== 'open_sea' || n[1] !== 'harbour_south' || n[n.length - 1] !== 'station_main' || n.slice().sort().join() !== ENIGMA_SEQ[5].map(x => x[0]).sort().join()) bad++;
      const nb = ENIGMA_SEQ[5].map(x => x[0]); for (let j = 0; j < n.length; j++) if (n[j] !== nb[j]) { const ok = (n[j] === 'city_town' && nb[j] === 'city_centre') || (n[j] === 'city_centre' && nb[j] === 'city_town') || (n[j] === 'ruins' && nb[j] === 'industrial_power') || (n[j] === 'industrial_power' && nb[j] === 'ruins'); if (!ok) bad++; }
      if (n.join() !== nb.join()) swaps++; q.forEach((x, j) => { minN = Math.min(minN, x[1]); lens.add(x[1] + n[j]); }); if (q.map(x => x[1]).join() !== ENIGMA_SEQ[5].map(x => x[1]).join()) diff++; }
    o.bad = bad; o.swaps = swaps; o.diff = diff; o.minN = minN; o.h6 = HARBOUR6; o.errs = SF.R.errs.slice(0, 2); return o; })()`);
  ok(r.p1946 && r.lens0 === r.lens2 && r.haze[0] === true && !r.haze[1] && !r.haze[2], 'level 6: 1944 and 1946 keep the authored stretches and have no haze flag');
  ok(r.same && r.len === 70, `level 6 first loop: the same seed makes the same stretches, the level keeps ${r.len} chunks`);
  ok(r.bad === 0 && r.minN >= 3 && r.swaps > 3 && r.swaps < 27 && r.diff > 20, `loopSeq level 6 over 30 seeds: the sea, the harbour and the station stay, only the legal neighbours swap (${r.swaps}/30 swapped, ${r.diff} with other lengths, shortest ${r.minN}, ${r.bad} bad)`);
  ok(r.h6 && r.h6.land < 0.67 && r.errs.length === 0, 'level 6 first loop: the harbour is moved (the shore sits further west); no errors');
  await page.close();
}
// 3k. Level 5's first loop (seed 1945, run.sortie.winter): the blizzard. The overcast (drawWinterLight) takes the colour out of a mid-grey and tints it cool (blue above red); the snow
// squalls come by stretch (squallAt: hard over the pass, light over the open stretches, none in the first pass); the streaks change pixels where it snows hard and nowhere with the flag
// off; the first pass (1944) and 1946 have no winter flag. No errors.
{
  const page = await freshPage();
  const r = await peek(page, `(() => { const o = {}; const flags = lv => { startEnigma(5, true, lv); const S = run.sortie; return [S.seed, !!S.winter]; }; o.f0 = flags(0); o.f1 = flags(1); o.f2 = flags(2);
    startEnigma(5, true, 1); const S = run.sortie, g = S.segs.find(q => q.t === 'pass'), at = c => -(c + world.stageBaseP) * CH; o.pass = squallAt(at(g.start + g.n / 2)); o.sea = squallAt(at(2)); 
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, W, H); drawWinterLight(); const d = ctx.getImageData(W / 2, H / 2, 1, 1).data; o.px = [d[0], d[1], d[2]];
    const shot = () => { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.fillStyle = '#202020'; ctx.fillRect(0, 0, W, H); drawSquall(); return Array.from(ctx.getImageData(0, 0, W, H).data); };
    world.scroll = at(g.start + g.n / 2) + H / 2; o.sq = squallAt(H / 2 - world.scroll); gf = 100; const a = shot(); gf = 130; const b = shot(); let dd = 0, lit = 0; for (let k = 0; k < a.length; k += 4) { if (a[k] !== b[k]) dd++; if (a[k] > 60) lit++; } o.moved = dd; o.lit = lit / (W * H);
    S.winter = false; o.off = squallAt(H / 2 - world.scroll); o.errs = SF.R.errs.slice(0, 2); return o; })()`);
  ok(r.f0[0] === 1944 && !r.f0[1] && r.f1[0] === 1945 && r.f1[1] && r.f2[0] === 1946 && !r.f2[1], 'level 5: the winter flag is on in seed 1945 only');
  ok(r.pass > 0.9 && r.sea < 0.3 && r.off === 0, `squalls by stretch: pass ${r.pass.toFixed(2)}, frozen sea ${r.sea.toFixed(2)}, none with the flag off`);
  ok(r.px[2] > r.px[0] + 20 && Math.abs(r.px[0] - 128) < 50, `overcast: a mid-grey comes out cool (R ${r.px[0]}, B ${r.px[2]})`);
  ok(r.moved > 50 && r.moved < 3000 && r.lit < 0.08, `the flakes float (${r.moved} pixels change in 30 frames) and cover under 8 percent of the screen (${(r.lit * 100).toFixed(1)}), so bullets stay readable`);
  ok(r.errs.length === 0, `no errors${r.errs.length ? ': ' + r.errs.join(' | ') : ''}`);
  await page.close();
}
// 3l. Level 5's first loop (seed 1945): the shape. The pass is 10 chunks (7 in the first pass and in 1946), the level keeps its 84 chunks, the frozen sea, the harbour and the first farmland stay first and the
// pass and the depot's farmland stay last (loopSeq, over 30 seeds), the stretches are at least 4 chunks, the plan holds the basin with its base (hangars, nine tanks, factory, flak) in the pass, and the first pass
// and 1946 have none of it. No errors.
{
  const page = await freshPage();
  const r = await peek(page, `(() => { const o = {}; const shape = lv => { startEnigma(5, true, lv); const S = run.sortie, g = S.segs.find(q => q.t === 'pass'); return { len: S.len, pass: g.n, order: S.segs.map(q => q.t).join(','), basin: !!sortiePlan(S).basin }; };
    o.f0 = shape(0); o.f1 = shape(1); o.f2 = shape(2); o.f1b = shape(1); const bad = []; for (let sd = 1; sd <= 30; sd++) { const q = loopSeq(ENIGMA_SEQ[4], sd, 5), sum = q.reduce((n, x) => n + x[1], 0), t = q.map(x => x[0]);
      if (sum !== 84 || t.slice(0, 3).join() !== 'open_sea_ice,harbour_winter,farmland_winter' || t.slice(-2).join() !== 'pass,farmland_winter' || q.some(x => x[1] < 4) || q[q.length - 2][1] !== 10 || q[q.length - 1][1] !== 11 || [...t].sort().join() !== ENIGMA_SEQ[4].map(x => x[0]).sort().join()) bad.push(sd); }
    o.bad = bad; startEnigma(5, true, 1); const S = run.sortie, P = sortiePlan(S); o.parts = P.basin ? P.basin.parts : null; o.airbase = !!(P.airbase && P.airbase.basin); o.errs = SF.R.errs.slice(0, 2); return o; })()`);
  ok(r.f0.pass === 7 && r.f2.pass === 7 && !r.f0.basin && !r.f2.basin && r.f0.len === 84 && r.f2.len === 84, 'the first pass and seed 1946: the pass is 7 chunks, no basin');
  ok(r.f1.pass === 10 && r.f1.len === 84 && r.f1.basin && r.f1.order === r.f1b.order && r.f1.order.startsWith('open_sea_ice,harbour_winter,farmland_winter'), `level 5, seed 1945: the pass is 10 chunks of the same 84, the basin is in the plan, the stretches (${r.f1.order}) come out the same each time`);
  ok(r.bad.length === 0, `loopSeq keeps the length, the first and last stretches and 4 chunks or more over 30 seeds${r.bad.length ? ': bad ' + r.bad.join(',') : ''}`);
  ok(r.parts && r.parts.hangar >= 4 && r.parts.tank >= 9 && r.parts.factory === 2 && r.parts.flak >= 5 && r.airbase, `the base: ${JSON.stringify(r.parts)}`);
  ok(r.errs.length === 0, `no errors${r.errs.length ? ': ' + r.errs.join(' | ') : ''}`);
  await page.close();
}
// 3m. Level 5's first loop (seed 1945): flying through the base. The screen goes to the pass, the ship cannot die, and over 1500 frames the base's guns, bunkers and parked aircraft come up (flak, a bunker, parked planes, an
// artillery piece among them), nothing throws an error, and the frame draws.
{
  const page = await freshPage();
  await page.evaluate(() => { window.SF.peek('settings.diff = 1'); window.SF.peek('startEnigma(5, false, 1)'); window.SF.setMode('immortal'); });
  await peek(page, `(() => { const S = run.sortie, g = S.segs.find(q => q.t === 'pass'), sc = Math.round((world.stageBaseP + g.start) * CH); world.scroll = sc; world.chunks = new Map(); world.chunkInfo = new Map(); world.chunkJobs = []; world.genP = -Math.floor((-sc + H) / CH) - 2; for (let i = 0; i < 4000; i++) { ensureChunks(); if (!world.chunkJobs.length && world.genP >= Math.ceil((sc + 420) / CH)) break; } world.midDone = true; return 1; })()`);
  const seen = {}; for (let k = 0; k < 15; k++) { await page.evaluate(() => window.SF.run(100)); const t = await peek(page, `world.enemies.map(e => e.type)`); for (const q of t) seen[q] = (seen[q] || 0) + 1; }
  const fin = await peek(page, `({ errs: SF.R.errs.slice(0, 2), y: Math.round((world.scroll - world.stageBaseP * CH) / CH), pass: run.sortie.segs.find(q => q.t === 'pass').start, state: app.state })`);
  ok(fin.errs.length === 0 && fin.state === 'play', `flying through the base: no errors${fin.errs.length ? ': ' + fin.errs.join(' | ') : ''}`);
  ok((seen.flak || 0) + (seen.aaflak || 0) > 0 && (seen.parked || 0) > 0 && (seen.bunker || 0) > 0, `the base's guns, bunkers and parked aircraft came up (${JSON.stringify(seen)})`);
  await page.close();
}
// 3n. Level 5's first loop (seed 1945): the Winter Wolf's avalanche mortars. Each train's rear flak position is a mortar (the first pass has none); at 85, 55 and 25 percent of a train's core it lobs a salvo
// of four shells (kind 'mortar', av) that land on red rings and burst into rings of shards, the train's guns holding fire meanwhile; the mortar's own flak is silent; one train acts at a time and Wolf Pack waits;
// destroying the mortar stops the salvos; the first pass (seed 1944) has none of it. No errors.
{
  const run3 = async lp => { const page = await freshPage('?boss'); await page.evaluate(() => window.SF.setMode('immortal')); await peek(page, `settings.diff = 1; startEnigma(5, false, ${lp}); 0`);
    for (let k = 0; k < 60; k++) { await page.evaluate(() => window.SF.run(120)); if (await peek(page, `world.enemies.some(e => e.type === 'boss' && e.trains && e.trains[0].ready)`)) break; } return page; };
  const p0 = await run3(0);
  const f = await peek(p0, `(() => { const b = world.enemies.find(e => e.type === 'boss'); return { boss: !!b, mortars: b ? b.parts.filter(q => q.mortar).length : -1 }; })()`);
  ok(f.boss && f.mortars === 0, `the first pass: the Winter Wolf has no mortar (${f.mortars})`); await p0.close();
  const page = await run3(1);
  const g = await peek(page, `(() => { const b = world.enemies.find(e => e.type === 'boss'); return { boss: !!b, mortars: b ? b.parts.filter(q => q.mortar).map(q => q.tr + ':' + q.oy.toFixed(0)).join() : '', aa: b ? b.parts.filter(q => q.k === 'aa' && !q.mortar).length : 0 }; })()`);
  ok(g.boss && g.mortars.split(',').length === 2 && g.aa === 2, `level 5, first loop: one mortar on each train (${g.mortars}), the other flak guns stay (${g.aa})`);
  const salvo = async frac => { await peek(page, `(() => { const b = world.enemies.find(e => e.type === 'boss'), c = b.parts.find(q => q.tr === 0 && q.k === 'core'); b.trains[0].packN = 2; return 1; })()`); /* (Wolf Pack is spent, so it does not interleave; the core is held at the fraction and the mortar cannot be shot down while a stage is measured) */
    let seen = 0, landed = 0, maxActive = 0, hold = false, errs = 0; const ids = new Set();
    for (let k = 0; k < 24; k++) { await peek(page, `(() => { const b = world.enemies.find(e => e.type === 'boss'), c = b.parts.find(q => q.tr === 0 && q.k === 'core'); c.hp = c.maxhp * ${frac}; for (const q of b.parts) if (q.mortar) q.hp = q.maxhp = 1e6; return 1; })()`); await page.evaluate(() => window.SF.run(20)); const r = JSON.parse(await peek(page, `(() => { const b = world.enemies.find(e => e.type === 'boss'), av = world.ebul.filter(x => x.av); return JSON.stringify({ n: av.length, tg: av.map(x => Math.round(x.tx) + ',' + Math.round(x.ty)), avN: b.trains[0].avN || 0, act: b.trains.filter(t => t.av).length, hold: BOSS.train.holdFire(b, 200) }); })()`));
      for (const t of r.tg) ids.add(t); seen = Math.max(seen, r.n); maxActive = Math.max(maxActive, r.act); hold = hold || r.hold > 0; }
    const e2 = JSON.parse(await peek(page, `JSON.stringify({ avN: world.enemies.find(e => e.type === 'boss').trains[0].avN, errs: SF.R.errs.length })`)); return { shells: ids.size, avN: e2.avN, maxActive, hold, errs: e2.errs }; };
  const a1 = await salvo(0.8), a2 = await salvo(0.5), a3 = await salvo(0.2);
  ok(a1.avN === 1 && a2.avN === 2 && a3.avN === 3 && a1.shells >= 3 && a2.shells >= 3 && a3.shells >= 3 && a1.maxActive === 1 && a1.hold, `three salvos at 85, 55 and 25 percent, about four shells each (${a1.shells}, ${a2.shells}, ${a3.shells}), one train at a time, the guns hold fire`);
  const a4 = await salvo(0.1); ok(a4.avN === 3 && a4.shells === 0, `no fourth salvo (${a4.shells} shells)`);
  await peek(page, `(() => { const b = world.enemies.find(e => e.type === 'boss'), c = b.parts.find(q => q.tr === 0 && q.k === 'core'), m = b.parts.find(q => q.tr === 0 && q.mortar); b.trains[0].avN = 0; c.hp = c.maxhp * 0.3; m.dead = true; return 1; })()`);
  let after = 0; for (let k = 0; k < 20; k++) { await page.evaluate(() => window.SF.run(20)); after += await peek(page, `world.ebul.filter(x => x.av).length`); }
  ok(after === 0, 'a destroyed mortar fires no more salvos');
  const fin = await peek(page, `SF.R.errs.slice(0, 2)`); ok(fin.length === 0, `no errors${fin.length ? ': ' + fin.join(' | ') : ''}`);
  await page.close();
}
// 3k. Level 4's first loop (seed 1945): Ravenhold as a ruin held by tanks (the boss test link starts just before it). No ground turrets (bunkers, AA towers, hatches, artillery, the
// gate's guns); tanks instead. Crossing the inner gate brings the prototype into the air; the keep tower waits (its parts untouched) while it fights; it cannot be killed: at a
// tenth of its health it flees, carrying what it lost into level 6; then the tower falls (its core opens) and the stage clears into level 5. The first pass (seed 1944) keeps its
// guns, has no aerial fight and no ruin. No errors.
{
  const a = await freshPage('?boss=1'), b = await freshPage('?boss=1');
  const first = await b.evaluate(() => { const SF = window.SF; SF.setMode('immortal'); SF.peek('settings.diff = 1; startEnigma(4, false, 0)'); const o = { guns: 0, ruin: null };
    for (let i = 0; i < 90 && !o.guns; i++) { SF.run(60); o.guns = SF.peek("world.enemies.filter(e => ['bunker', 'aatower', 'popup', 'arty'].includes(e.type) && !e.dead).length"); }
    o.ruin = SF.peek('!!(run.sortie && run.sortie.autumn)'); o.aer = SF.peek("world.enemies.some(e => e.type === 'protoDuel')"); o.errs = SF.R.errs.slice(0, 2); return o; });
  ok(first.guns > 0 && !first.ruin && !first.aer, `level 4 first pass: the castle keeps its guns (${first.guns}), no ruin, no aerial fight`);
  const f = await a.evaluate(() => { const SF = window.SF; SF.setMode('immortal'); SF.peek('settings.diff = 1; startEnigma(4, false, 1)');
    const o = { turMax: 0, tanksMax: 0, castle: false, aerial: 0, keepHit: 0, protoMin: 1, flee: false, fled: false, dmg: 0, open: false, lvl5: false, ruinPx: false, windmill: 0 };
    for (let i = 0; i < 260 && !o.lvl5; i++) { SF.run(60);
      const q = SF.peek(`(() => { const c = world.enemies.find(e => e.type === 'boss' && e.kind === 'castle'), p = world.enemies.find(e => e.type === 'protoDuel' && e.castle && !e.dead);
        return { c: !!c, tur: world.enemies.filter(e => ['bunker', 'aatower', 'popup', 'arty'].includes(e.type) && !e.dead).length, tanks: world.enemies.filter(e => (e.type === 'tank' || e.type === 'htank') && !e.dead).length,
          ae: !!(c && c.aerial), tw: c ? c.parts.filter(q => q.tw && q.hp < q.maxhp).length : 0, op: !!(c && c.open), ph: p ? p.hp / p.maxhp : null, pf: !!(p && p.flee), fl: !!(c && c.proFled), dmg: run.proto.dmg, lv: run.sortie && run.sortie.level, oth: c ? c.parts.filter(q => q.k !== 'core' && q.k !== 'light' && !q.dead).length : -1, spin: c ? c.wmT || 0 : 0 }; })()`);
      if (q.c) { o.castle = true; o.turMax = Math.max(o.turMax, q.tur); o.tanksMax = Math.max(o.tanksMax, q.tanks); if (q.ae) { o.aerial++; o.keepHit += q.tw; } if (q.ph !== null) o.protoMin = Math.min(o.protoMin, q.ph); if (q.pf) o.flee = true; if (q.fl) o.fled = true; o.dmg = q.dmg; if (q.op) o.open = true; o.windmill = Math.max(o.windmill, q.spin); }
      if (q.lv === 5) o.lvl5 = true; }
    o.ruinPx = SF.peek('(() => { const c = SPR.ravenFloorRuin, d = SPR.ravenFloor; return !!c && c !== d && c.width === d.width; })()'); o.errs = SF.R.errs.slice(0, 2); return o; });
  ok(f.castle && f.turMax === 0 && f.tanksMax >= 8, `level 4 first loop: Ravenhold has no ground turrets (${f.turMax}) and ${f.tanksMax} tanks`);
  ok(f.aerial > 3 && f.keepHit === 0 && f.protoMin >= 0.1 - 1e-6 && f.protoMin < 0.12 && f.flee && f.fled && f.dmg > 0, `the prototype fights in the air while the keep waits (${f.aerial} steps, keep parts hit ${f.keepHit} times), cannot be killed (lowest ${f.protoMin.toFixed(2)} of its health), flees, and what it lost carries over (${Math.round(f.dmg)})`);
  ok(f.open && f.windmill > 20 && f.lvl5 && f.ruinPx && f.errs.length === 0, `then the tower falls under its windmills (${f.windmill} steps), the stage clears into level 5, the ruin floor is its own picture, no errors${f.errs.length ? ': ' + f.errs.join(' | ') : ''}`);
  await a.close(); await b.close();
}
// 3g2. Level 4's first loop (seed 1945): the late-autumn forest with its lakes (the plan's params.autumn and params.lakes, run.sortie.autumn) and the mist
// over them. The first pass (seed 1944) has neither. With a lake on the screen the mist changes pixels (and only with run.sortie.autumn), draws without errors,
// and a snapshot can still be taken.
{
  const page = await freshPage();
  const a = await peek(page, `(() => { startEnigma(4, true, 0); const S0 = run.sortie, P0 = sortiePlan(S0), first = { autumn: !!S0.autumn, lakes: (P0.lakes || []).length, pa: !!P0.P.autumn }; startEnigma(4, true, 1); const S = run.sortie, P = sortiePlan(S);
    return { first, loop: { seed: S.seed, autumn: !!S.autumn, variant: S.variant, lakes: (P.lakes || []).length, pa: !!P.P.autumn } }; })()`);
  ok(!a.first.autumn && a.first.lakes === 0 && !a.first.pa, 'level 4, seed 1944: no autumn, no lakes');
  ok(a.loop.seed === 1945 && a.loop.autumn && a.loop.pa && a.loop.lakes >= 2, `level 4, seed 1945: autumn, ${a.loop.lakes} lakes`);
  const f = await page.evaluate(() => { const SF = window.SF; SF.setMode('immortal'); SF.peek("startEnigma(4, true, 1)"); const o = { found: false };
    for (let i = 0; i < 400 && !o.found; i++) { SF.run(60); o.found = SF.peek("run.sortie.plan.lakes.some(l => { const y = run.sortie.planY0 - l.cy + Math.floor(world.scroll); return y > 110 && y < 210; })"); }
    if (o.found) { const cv = document.getElementById('game'), px = () => cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      SF.draw(); const A = px().slice(); SF.peek('run.sortie.autumn = false'); SF.draw(); const B = px(); SF.peek('run.sortie.autumn = true'); let d = 0; for (let i = 0; i < A.length; i += 4) if (A[i] !== B[i] || A[i + 1] !== B[i + 1] || A[i + 2] !== B[i + 2]) d++;
      o.diff = d; o.snap = !!SF.peek('takeSnapshot()'); o.errs = SF.R.errs.slice(0, 2); }
    return o; });
  ok(f.found && f.diff > 800 && f.snap && !(f.errs && f.errs.length), `level 4 seed 1945: mist over a lake on the screen changes ${f.diff} pixels, draws without errors, snapshot ok`);
  await page.close();
}
// 3g. Level 4, The Iron Forest (spec 19): one forest plan over the whole level from its first chunk (ironForest), passing the hard rules,
// opening over the sea onto the cliffs, its road ending at x 112 on the castle road; types and pixels from the plan; past it the Campaign's
// castle ground (theme 4). Flown through by the bot: guns take the plan's slots, the castle boss comes, and the run flies on into level 5.
{
  const page = await freshPage();
  const r = await peek(page, `(() => { settings.diff = 1; startEnigma(4); const S = run.sortie, P = sortiePlan(S), v = CityGen.validate(P);
    let types = 0, n = 0; for (let k = 0; k < 400; k++) { const x = (k * 37) % W, y = (k * 97) % P.L, wy = S.planY0 - y; n++; if (classify(x, wy).tt === CityGen.typeAt(P, x, y)) types++; }
    const c0 = info(world.stageBaseP).b, past = info(world.stageBaseP + S.len + 1), cliffs = !!P.cliffs;
    return { pass: v.pass, L: P.L, want: S.len * CH, end: Math.round(P.mx[P.L - 1]), types, n, c0, pastB: past.b, pastTh: past.th, cliffs, slots: P.slots.length }; })()`);
  ok(r.pass && r.L === r.want && r.cliffs && r.end === 112, `level 4: the forest plan passes the hard rules, covers the level (${r.L} px), begins with the cliff coast, and its road ends at x ${r.end} for the castle road`);
  ok(r.types === r.n && r.c0 === 'sea' && r.pastB === 'castle' && r.pastTh === 4, `level 4: ground types from the plan (${r.types}/${r.n}), the first chunk sea, the castle ground past the level`);
  const f = await page.evaluate(() => { const SF = window.SF; SF.setMode('immortal'); SF.peek('settings.diff = 1; startEnigma(4)'); const o = { status: 'ok' };
    for (let i = 0; i < 20000 && o.status === 'ok'; i++) { o.status = SF.run(100); if (!o.boss && SF.peek('world.bossSpawned')) o.boss = SF.peek("world.enemies.some(e => e.type === 'boss' && e.kind === 'castle')"); }
    Object.assign(o, SF.peek(`({ state: app.state, picker: document.getElementById('diffAsk').classList.contains('open'), kind: app.diffNext && app.diffNext.kind, slots: (run.sortie && run.sortie.slotUsed || new Set()).size, errs: SF.R.errs.slice(0, 2) })`)); return o; });
  ok(f.boss === true, 'level 4: the castle boss comes');
  ok(f.status === 'next:5' && f.errs.length === 0, `level 4 flown to the end: the run flies on into level 5 (${f.status}, state ${f.state}${f.errs.length ? ', errors: ' + f.errs.join(' | ') : ''})`);
  await page.close();
}

// 3h. Level 5, The Winter Line (spec 20): one plan over the whole level (winterLine, 84 chunks) passing the hard rules: in over the frozen sea
// (pack ice with U-boat holes and places to break through), the harbour in its bay, the farmland, then the winter land with the mountain village,
// the lake and its ice road, the pass, and the spur whose tunnels let the four tracks out into the gorge: the plan reaches on 48 chunks past
// the level's end as the train boss's arena (two hillside viaducts, the chasm between them; the boss code's bossland, theme 1), without buffer
// stops. Types from the plan. Flown through by the bot: U-boats come up in the ice holes and break through the ice, the train boss comes once
// the gorge fills the screen, its trains keep to the inner tracks of their own viaduct (stepping out to the outer track and back, never across
// the chasm), the supply trains run on the outer tracks only, and the run flies on into level 6.
{
  const page = await freshPage();
  const r = await peek(page, `(() => { settings.diff = 1; startEnigma(5); const S = run.sortie, P = sortiePlan(S), v = CityGen.validate(P), K = CityGen.K;
    let types = 0, n = 0; for (let k = 0; k < 400; k++) { const x = (k * 37) % W, y = (k * 97) % P.L, wy = S.planY0 - y; n++; if (classify(x, wy).tt === CityGen.typeAt(P, x, y)) types++; }
    const c0 = info(world.stageBaseP).b, pE = world.stageBaseP + S.len, past = info(pE + 1), ice = P.K.slice(0, P.W * P.coast.yC).filter(k => k === K.ICE).length;
    const tracks = GORGE_T.every(x => [S.len * CH - 1, P.L - 1].every(y => P.RM[y * P.W + x - 3] === 2 && P.RM[y * P.W + x + 3] === 2)), ay = S.planY0 - (P.gorge.yb + 300), yardTT = classify(112, ay).tt + ',' + classify(68, ay).tt;
    return { pass: v.pass, L: P.L, want: (S.len + GORGE_ARENA) * CH, len: S.len, gen: S.gen, types, n, c0, pastB: past.b, pastTh: past.th, ice, holes: P.slots.filter(q => q.kind === 'sub' && q.on === 'ice').length, breaks: P.iceBreaks.length,
      village: !!(P.alpine && P.alpine.chapel), lake: !!(P.lake && P.lake.huts), iceRoad: P.streets.some(st => st.ice), tracks, yardTT, stops: railEnds(pE).length, green: !!P.oldTown }; })()`);
  ok(r.gen === 5 && r.len === 84 && r.pass && r.L === r.want, `level 5: its own ground (gen ${r.gen}), 84 chunks, the plan passes the hard rules and covers the level and the arena after it (${r.L} px)`);
  ok(r.c0 === 'sea' && r.ice > 60000 && r.holes >= 2 && r.breaks >= 1, `level 5: in over the frozen sea (${r.ice} px of ice before the shore, ${r.holes} U-boat holes, ${r.breaks} places to break through)`);
  ok(r.village && !r.green && r.lake && r.iceRoad, 'level 5: the mountain village (no village green), the frozen lake with its huts and ice road');
  ok(r.types === r.n, `level 5: ground types from the plan (${r.types}/${r.n})`);
  ok(r.tracks && r.pastB === 'bossland' && r.pastTh === 1 && r.yardTT === 'ravine,railbridge' && r.stops === 0, `level 5: the four tracks run through the level's end to the arena's, the gorge after it (chasm and viaduct: ${r.yardTT}; bossland, theme 1), without buffer stops (${r.stops})`);
  const f = await page.evaluate(() => { const SF = window.SF; SF.setMode('immortal'); SF.peek('settings.diff = 1; startEnigma(5)'); const o = { status: 'ok', iceSubs: 0, breaks: 0 };
    for (let i = 0; i < 20000 && o.status === 'ok'; i++) { o.status = SF.run(o.bottomC === undefined ? 10 : 100);
      if (o.bottomC === undefined) { const q = SF.peek(`({ subs: world.enemies.filter(e => e.type === 'sub' && run.sortie.planY0 - e.wy < run.sortie.plan.coast.yC).length, br: world.decals.filter(d => d.kind === 'icebreak').length })`); o.iceSubs = Math.max(o.iceSubs, q.subs); o.breaks = Math.max(o.breaks, q.br); }
      if (o.bottomC === undefined && SF.peek('world.bossSpawned')) Object.assign(o, SF.peek(`(() => { const sc = Math.floor(world.scroll), p = -Math.floor((H - 1 - sc) / CH); return { bottomC: p - world.stageBaseP, len: run.sortie.len, guns: [...(run.sortie.slotUsed || [])].filter(i => run.sortie.plan.slots[i].kind !== 'sub').length }; })()`));
      if (!o.boss && SF.peek('world.bossSpawned')) o.boss = SF.peek("world.enemies.some(e => e.type === 'boss' && e.kind === 'train')");
      if (o.boss) { const q = SF.peek(`(() => { const e = world.enemies.find(e => e.type === 'boss' && e.kind === 'train'); return { bx: e && e.trains ? e.trains.filter(t => t.on && !t.dead).map(t => [t.x, t.path ? t.path.xTop : t.x, t.path ? t.path.xBot : t.x]) : [], sx: world.enemies.filter(o => TRAIN_CARS.has(o.type) && !o.dead && !(o.br && o.wx !== 36 && o.wx !== 188)).map(o => Math.round(o.wx)), ammo: world.enemies.some(o => o.type === 'ammocar') }; })()`);
        o.bossN = (o.bossN || 0) + q.bx.length; o.cross = (o.cross || 0) + q.bx.filter(b => !(b.every(x => x < 112) || b.every(x => x > 112))).length; o.inner = (o.inner || 0) + q.bx.filter(b => b[0] === 68 || b[0] === 156).length;
        o.supN = (o.supN || 0) + q.sx.length; o.supBad = (o.supBad || 0) + q.sx.filter(x => x !== 36 && x !== 188).length; o.ammo = o.ammo || q.ammo;
        const w = SF.peek(`({ sent: run.sortie.brRun ? [...run.sortie.brRun.values()].filter(v => v === 'sent').length : 0, mid: world.enemies.some(o => o.br && !o.dead && o.wx > 60 && o.wx < 164) })`); o.brSent = Math.max(o.brSent || 0, w.sent); o.brMid = o.brMid || w.mid; } }
    Object.assign(o, SF.peek(`({ state: app.state, picker: document.getElementById('diffAsk').classList.contains('open'), kind: app.diffNext && app.diffNext.kind, slots: (run.sortie && run.sortie.slotUsed || new Set()).size, errs: SF.R.errs.slice(0, 2) })`)); return o; });
  ok(f.iceSubs >= 1 && f.breaks >= 1, `level 5: U-boats in the ice (${f.iceSubs} at once at most) and a break through the ice (${f.breaks})`);
  ok(f.bottomC !== undefined && f.bottomC >= f.len - 1 && f.bottomC <= f.len + 2, `level 5: the train boss is called once the gorge fills the screen (screen bottom at chunk ${f.bottomC}, the arena from ${f.len})`);
  ok(f.boss === true, 'level 5: the train boss comes');
  ok(f.bossN > 0 && f.cross === 0 && f.inner >= f.bossN * 0.5, `level 5: the boss trains keep to their own viaduct (${f.bossN} samples, ${f.inner} on an inner track, ${f.cross} across the chasm)`);
  ok(f.supN > 0 && f.supBad === 0, `level 5: the supply trains run on the outer tracks only, but for those crossing a bridge (${f.supN} car samples, ${f.supBad} elsewhere; an explosives car seen: ${!!f.ammo})`);
  ok(f.brSent >= 1 && f.brMid, `level 5: a supply train is sent to a bridge as it comes into view, and crosses it (${f.brSent} sent, one seen on the bridge: ${!!f.brMid})`);
  ok(f.guns >= 2, `level 5: guns stood in the plan's gun slots on the way (${f.guns})`);
  ok(f.status === 'next:6' && f.errs.length === 0, `level 5 flown to the end: the run flies on into level 6 (${f.status}, state ${f.state}${f.errs.length ? ', errors: ' + f.errs.join(' | ') : ''})`);
  await page.close();
}
// 3h'. Level 5's gorge: what lies under a gallery's roof or in a spur's tunnel is out of reach of shots (and drawn under the roof); the
// explosives car goes up in a blast that wrecks the car coupled to it.
{
  const page = await freshPage();
  const g = await peek(page, `(() => { settings.diff = 1; startEnigma(5); const S = run.sortie, P = sortiePlan(S); const q = P.gorge.gal[0], r = gorgeRoofs()[0];
    const x = (r.x0 + r.x1) >> 1, under = roofAt(x, S.planY0 - ((q.y0 + q.y1) >> 1)), open = roofAt(68, S.planY0 - ((q.y0 + q.y1) >> 1)) || roofAt(x, S.planY0 - (q.y0 - 20));
    const sc = Math.floor(world.scroll), wy = 120 - sc, am = G('ammocar', 36, wy, { hp: 8, hw: 6, hh: 13, score: 800, rad: 10, v: 0, cd: 999 }), bx = G('boxcar', 36, wy + 30, { hp: 8, hw: 6, hh: 13, score: 500, rad: 10, v: 0, cd: 999 });
    world.enemies.push(am, bx); kill(am); for (const L of world.later.splice(0)) L.fn(); return { under, open, am: am.dead, bx: bx.dead || bx.dying > 0 }; })()`);
  ok(g.under && !g.open, `level 5: a gallery covers its outer track and nothing beside it (under ${g.under}, beside ${g.open})`);
  ok(g.am && g.bx, `level 5: the explosives car's blast wrecks the car coupled to it (${g.bx})`);
  // avalanches (spec 20.8): an open cornice's slide buries the supply car on its outer track and leaves a mound that stops the next train;
  // a cornice over a gallery pours its snow over the roof and the car under it is safe; an explosives car going up under a cornice breaks
  // it; a boss train is never stopped: it smashes a supply car standing on its track
  const v = await peek(page, `(() => { const S = run.sortie, Z = S.plan.gorge, sc = Math.floor(world.scroll), C = { hp: 8, hw: 6, hh: 13, score: 500, rad: 10, v: 0, cd: 999, keep: true };
    const io = Z.corn.findIndex(q => !q.over), ig = Z.corn.findIndex(q => q.over), qo = Z.corn[io], qg = Z.corn[ig], tx = q => q.s < 0 ? 36 : 188, wo = S.planY0 - qo.y, wg = S.planY0 - qg.y;
    const open = G('boxcar', tx(qo), wo, C), cov = G('boxcar', tx(qg), wg, C); world.enemies.push(open, cov);
    cornTrigger(io); cornTrigger(ig); for (let k = 0; k < SLIDE_T + 2; k++) gorgeSnowTick();
    const mound = moundAt(tx(qo), wo), noMound = !moundAt(tx(qg), wg), half = qo.half + 10;
    const lo = G('loco', tx(qo), wo + half + 40, Object.assign({}, C, { hp: 16, hh: 20, v: -1.2, up: true })); world.enemies.push(lo); for (let k = 0; k < 120; k++) ENT.loco.update(lo);
    const ib = Z.corn.findIndex((q, i) => !q.over && i !== io && i !== ig), qb = Z.corn[ib]; gorgeBlast(tx(qb), S.planY0 - qb.y); for (const L of world.later.splice(0)) L.fn();
    const sx = tx(qo), car = G('boxcar', sx, 100 - sc, C); world.enemies.push(car); gorgeBossPlough({ trains: [{ on: true, dead: false, x: sx, y: 150, path: null }] });
    return { buried: open.dead || open.dying > 0, safe: !cov.dead && !(cov.dying > 0), mound, noMound, stopped: lo.wy > wo + 10, lw: Math.round(lo.wy - wo), blast: S.snow.gone.has(ib), smashed: car.dead || car.dying > 0 }; })()`);
  ok(v.buried && v.mound, `level 5: an open cornice's slide buries the supply car on its track and leaves a mound (${v.buried}, ${v.mound})`);
  ok(v.safe && v.noMound, `level 5: under a gallery the car is safe and the snow lies on the roof (${v.safe}, ${v.noMound})`);
  ok(v.stopped, `level 5: the next supply train stops at the mound (${v.lw} px short of its middle)`);
  ok(v.blast, 'level 5: an explosives car going up under a cornice breaks it');
  ok(v.smashed, 'level 5: a boss train smashes a supply car standing on its track');
  // the bridge (spec 20.9): a supply train sent onto it follows its curve to the other outer track; a car destroyed over the chasm falls
  // (no wreck left on the deck) and the car coupled to it over the chasm goes down too
  const w = await peek(page, `(() => { const S = run.sortie, b = S.plan.gorge.bridges[0], C = { hp: 8, hw: 6, hh: 13, score: 500, rad: 10, cd: 999, keep: true }, lo = b.lr > 0 ? 36 : 188, hi = b.lr > 0 ? 188 : 36;
    world.enemies = world.enemies.filter(o => !TRAIN_CARS.has(o.type)); const l = G('loco', lo, S.planY0 - b.ya + 30, Object.assign({}, C, { hp: 999, hh: 20, v: -1.2, up: true, br: b, train: 991 })); world.enemies.push(l);
    let mid = false; for (let k = 0; k < 400; k++) { ENT.loco.update(l); if (l.wx > 70 && l.wx < 154) mid = true; }
    const row = Math.round((b.ya + b.yb) / 2), wy = S.planY0 - row, a = G('boxcar', brX(b, wy), wy, Object.assign({}, C, { br: b, train: 992 })), c = G('boxcar', brX(b, wy + 12), wy + 12, Object.assign({}, C, { br: b, train: 992 })); world.enemies.push(a, c);
    const d0 = world.decals.length, f0 = S.falls ? S.falls.length : 0; kill(a); for (const L of world.later.splice(0)) L.fn();
    return { crossed: l.wx === hi, mid, over: overChasm(a), fell: (S.falls ? S.falls.length : 0) - f0, wreck: world.decals.slice(d0).some(d => d.kind === 'wreck'), coupled: c.dead || c.dying > 0 }; })()`);
  ok(w.crossed && w.mid, `level 5: a supply train on the bridge follows its curve to the other outer track (${w.mid}, ${w.crossed})`);
  ok(w.over && w.fell >= 2 && !w.wreck && w.coupled, `level 5: a car destroyed over the chasm falls, with the car coupled to it (${w.fell} falling, a wreck left on the deck: ${w.wreck})`);
  await page.close();
}

// 3f. The Sower (level 4, owner): over the forest, with no warning, a big twin-engine bomber overtakes the player from behind, holds ahead
// of the player near the top, sows a trail of aerial mines that drift down with the ground and fizzle out, drops flying bombs that burst into
// rings of shots, and when still flying 5 s later calls a second one: they hold one half of the screen each, then climb away together. Made too
// tough to shoot down here, so the whole pass is seen. It never comes in another level (level 6 flown as far), and nothing goes wrong.
{
  const page = await freshPage();
  const r = await page.evaluate(() => {
    const SF = window.SF; SF.setMode('immortal'); SF.peek('settings.diff = 1; startEnigma(4); SOWER.hp = 99999');
    const o = { entered: null, held: 0, maxMines: 0, below: 0, bombs: 0, bursts: 0, pair: 0, split: 0, left: false };
    let lastBombs = 0;
    for (let i = 0; i < 1500 && !o.left; i++) { SF.run(3);
      const q = SF.peek(`(() => { const L = world.enemies.filter(e => e.type === 'sower' && !e.dead), m = world.ebul.filter(b => b.kind === 'amine');
        return { n: L.length, st: L.map(e => e.st), y: L.length ? L[0].y : null, xs: L.filter(e => e.st === 'hold').map(e => e.x), mines: m.length, down: m.length ? Math.min(...m.map(b => b.vy)) : 0, bombs: world.ebul.filter(b => b.kind === 'fbomb').length }; })()`);
      if (q.st[0] === 'in' && o.entered === null) o.entered = q.y; if (q.st.includes('hold')) o.held++; o.maxMines = Math.max(o.maxMines, q.mines); if (q.mines && q.down > 0) o.below++;
      if (q.n === 2) o.pair++; if (q.xs.length === 2 && Math.min(...q.xs) < 112 && Math.max(...q.xs) > 112 && Math.max(...q.xs) - Math.min(...q.xs) > 70) o.split++;
      if (q.bombs > 0) o.bombs++; if (q.bombs < lastBombs) o.bursts++; lastBombs = q.bombs; if (o.held && q.n === 0) o.left = true; }
    o.warn = SF.peek("typeof drawSowerWarn"); o.errs = SF.R.errs.slice(0, 2); return o;
  });
  ok(r.entered !== null && r.entered > 300 && r.warn === 'undefined', `level 4: the Sower comes from behind the player, with no warning (entered at y ${r.entered && r.entered.toFixed(0)})`);
  ok(r.held > 200 && r.maxMines >= 20 && r.below > 50, `it holds ahead and sows a trail of mines drifting down with the ground (held ${r.held} steps, up to ${r.maxMines} mines)`);
  ok(r.bombs > 0 && r.bursts >= 3, `its flying bombs fall and burst (${r.bursts} bursts)`);
  ok(r.pair > 50 && r.split > 30, `still flying, it calls a second; they hold one half of the screen each (${r.pair} steps as a pair, ${r.split} split)`);
  ok(r.left && r.errs.length === 0, `then they climb away, with no errors${r.errs.length ? ': ' + r.errs.join(' | ') : ''}`);
  const o6 = await page.evaluate(() => { const SF = window.SF; SF.peek('settings.diff = 1; startEnigma(6)'); let n = 0; for (let i = 0; i < 120; i++) { SF.run(25); if (SF.peek("world.enemies.some(e => e.type === 'sower') || !!run.sortie.sowerZ")) n++; } return n; });
  ok(o6 === 0, 'the Sower never comes outside level 4');
  await page.close();
}

// 3d. By hand (--pixels): the finished Campaign chunks of all six stages, pixels and features, against tests/enigma-pixels.json.
if (pixels) {
  const page = await freshPage();
  const got = await peek(page, `(() => { const o = {}; for (let n = 1; n <= 6; n++) { SF.start(1, n); o['stage' + n] = SF.chunkHash(world.stageBaseP - 2, world.stageBaseP + 60); } return o; })()`);
  await page.close();
  if (update) { writeFileSync(pixUrl, JSON.stringify(got, null, 1) + '\n'); console.log('wrote tests/enigma-pixels.json'); }
  else if (!existsSync(pixUrl)) ok(false, 'tests/enigma-pixels.json is missing (make it with --pixels --update on the unchanged code)');
  else { const want = JSON.parse(readFileSync(pixUrl, 'utf8')); for (const k of Object.keys(want)) ok(want[k] === got[k], `Campaign ${k} chunk pixels unchanged` + (want[k] === got[k] ? '' : ` (was ${want[k]}, now ${got[k]})`)); }
}

// 4. Optional: how long chunks take to build for each level's ground (the Campaign code for now). A baseline for phases 2 to 5.
if (bench) {
  const page = await freshPage();
  const res = await page.evaluate(() => {
    const out = {};
    for (let lv = 1; lv <= 6; lv++) {
      window.SF.setMode('immortal'); window.SF.peek('settings.diff = 1; startEnigma(' + lv + ')');
      const ms = window.SF.peek(`(() => { world.chunks = new Map(); world.chunkInfo = new Map(); world.chunkJobs = []; const t = []; for (let p = 0; p < 48; p++) { startChunk(p); const j = world.chunkJobs.pop(); const a = performance.now(); let n = 0; while (!workChunk(j, CH) && n++ < 9); t.push(performance.now() - a); } return t; })()`);
      ms.sort((a, b) => a - b);
      out['level ' + lv] = { meanMs: +(ms.reduce((s, x) => s + x, 0) / ms.length).toFixed(2), p95Ms: +ms[Math.floor(ms.length * 0.95)].toFixed(2), maxMs: +ms[ms.length - 1].toFixed(2) };
    }
    return out;
  });
  console.log('chunk build time per level (ms per 224x64 chunk, this machine):\n' + JSON.stringify(res, null, 1));
  // level 6 over its whole length, by template, with the pixel pass and drawFeatures timed apart
  const l6 = await page.evaluate(() => window.SF.peek(`(() => { settings.diff = 1; startEnigma(6); const df = drawFeatures; let ft = 0; drawFeatures = function () { const a = performance.now(); df.apply(this, arguments); ft += performance.now() - a; };
    const by = {}; try { world.chunks = new Map(); world.chunkInfo = new Map(); world.chunkJobs = [];
      for (let p = world.stageBaseP - 2; p <= world.stageBaseP + run.sortie.len + 6; p++) { startChunk(p); const j = world.chunkJobs.pop(); ft = 0; const a = performance.now(); let n = 0; while (!workChunk(j, CH) && n++ < 9);
        const all = performance.now() - a, t = SF.segAt(p); (by[t] = by[t] || []).push([all - ft, ft]); } } finally { drawFeatures = df; }
    const out = {}; for (const t in by) { const px = by[t].map(v => v[0]).sort((a, b) => a - b), fe = by[t].map(v => v[1]); out[t] = { chunks: px.length, pixMean: +(px.reduce((s, x) => s + x, 0) / px.length).toFixed(1), pixP95: +px[Math.min(px.length - 1, Math.floor(px.length * 0.95))].toFixed(1), featMean: +(fe.reduce((s, x) => s + x, 0) / fe.length).toFixed(2) }; } return out; })()`));
  console.log('level 6 by template (ms per chunk: pixel pass mean and p95, drawFeatures mean):');
  for (const [t, v] of Object.entries(l6)) console.log(`  ${t.padEnd(20)} ${String(v.chunks).padStart(3)} chunks  pixels ${String(v.pixMean).padStart(5)} / p95 ${String(v.pixP95).padStart(5)}  features ${v.featMean}`);
  await page.close();
}

await browser.close();
if (bad) { console.error(`\n${bad} check(s) failed, ${passed} passed`); process.exit(1); }
console.log(`Enigma Run checks pass (${passed}).`);
