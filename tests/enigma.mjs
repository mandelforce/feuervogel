// Enigma Run test (phase 1: the plumbing around a sortie). Needs Node and Playwright, like tests/replay.mjs; serve the folder first
// (python3 -m http.server 8000).
//   node tests/enigma.mjs            all checks
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
const bench = process.argv.includes('--bench'), pixels = process.argv.includes('--pixels'), update = process.argv.includes('--update');
const pixUrl = new URL('./enigma-pixels.json', import.meta.url);

// Same start as tests/replay.mjs: a seeded Math.random and no frame loop, so only the test moves the game.
const initScript = () => {
  let a = 1944;
  Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  window.requestAnimationFrame = () => 0;
};

let bad = 0;
const ok = (cond, msg) => { if (cond) console.log('ok   ' + msg); else { bad++; console.error('FAIL ' + msg); } };

const browser = await chromium.launch();
async function freshPage() {
  const page = await browser.newPage({ viewport: golden.viewport });
  await page.route(/workers\.dev/, r => r.abort());
  page.on('pageerror', e => { bad++; console.error('page error:', e.message); });
  await page.addInitScript(initScript);
  await page.goto(PAGE);
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
  const r = await peek(page, `(() => { const out = []; for (let lv = 1; lv <= 8; lv++) { const a = buildSortie(lv, 1944), b = buildSortie(lv, 1944), c = buildSortie(lv, 5);
    let at = 0, contiguous = true; for (const s of a.segs) { if (s.start !== at || s.n < 1) contiguous = false; at += s.n; }
    out.push({ lv, same: JSON.stringify(a) === JSON.stringify(b), contiguous, sum: at === a.len, len: a.len, theme: a.theme, seed: a.seed, rng: a.rng(3) === b.rng(3) && a.rng(3) !== c.rng(3), segs: a.segs.length, bossAt: a.bossAt, gen: a.gen, seaLast: a.segs[a.segs.length - 1].start, yw: yardWait() }); } return out; })()`);
  for (const x of r) ok(x.same && x.contiguous && x.sum && x.rng && x.bossAt === (x.lv === 6 || x.lv === 7 || x.lv === 2 ? x.len + 5 : x.lv === 3 || x.lv === 4 ? x.len + 3 : x.lv === 5 ? x.len + x.yw : x.lv === 1 || x.lv === 8 ? x.seaLast + 1 : null) && x.gen === (x.lv === 6 || x.lv === 7 ? 6 : x.lv === 2 ? 2 : x.lv === 3 ? 3 : x.lv === 4 ? 4 : x.lv === 5 ? 5 : 0) && x.len === [56, 56, 58, 60, 84, 70, 70, 56][x.lv - 1] && x.theme === [0, 2, 3, 4, 1, 5, 5, 0][x.lv - 1], `sortie level ${['1', '2', '3', '4', '5', '6', '6B', '1A'][x.lv - 1]}: ${x.segs} segments, ${x.len} chunks, theme ${x.theme}, rebuilt identically`);
  await page.close();
}

// 2. The Settings button and the picker (title screen), then a level 6 run: flags, play, end of level, resume.
{
  const page = await freshPage();
  await page.evaluate(() => { window.SF.peek('settings.diff = 1'); });
  const ui = await peek(page, `(() => { const q = id => document.getElementById(id); const o = {};
    openSettings(); o.rowShown = !q('sEnigmaRunRow').hidden; q('sEnigmaRun').click();
    o.pickerOpen = q('diffAsk').classList.contains('open'); o.title = q('diffTitle').textContent; o.stageRow = !q('dStage').hidden; o.settingsClosed = !q('settings').classList.contains('open');
    o.note = q('dNote').textContent; q('dStage').querySelector('[data-s="6"]').click(); o.pressed = q('dStage').querySelector('[aria-pressed="true"]').dataset.s;
    q('diffAsk').querySelector('[data-d="1"]').click(); o.level = run.sortie && run.sortie.level; o.theme = world.curTheme; o.stage = run.stage; o.state = app.state; o.start = run.start; return o; })()`);
  ok(ui.rowShown && ui.pickerOpen && ui.title === 'Enigma Run' && ui.stageRow && ui.settingsClosed, 'Settings > Enigma Run opens the level picker');
  ok(ui.pressed === '6' && ui.level === 6 && ui.theme === 5 && ui.stage === 6 && ui.state === 'play', 'choosing level 6 and a difficulty starts it');

  const hide = await peek(page, `(() => { openSettings(); const h = document.getElementById('sEnigmaRunRow').hidden; setPanel.classList.remove('open'); return h; })()`);
  ok(hide, 'the Settings button is hidden while a run is on');

  // flags: the level never counts
  const before = await peek(page, `({ hi, loops: loopsWon, rr: !!app.rr })`);
  await page.evaluate(() => { window.SF.setMode('immortal'); window.SF.run(1500); });
  const flags = await peek(page, `(() => { addScore(123456); return { elig: lbEligible(), hi, loops: loopsWon, rr: !!app.rr, sortie: !!run.sortie, errs: SF.R.errs.length }; })()`);
  ok(flags.elig === false && flags.hi === before.hi && flags.loops === before.loops, 'an Enigma Run level is not board-eligible and does not raise the best or the loop count');
  ok(flags.errs === 0, 'no errors while playing level 6');

  // saved and resumed
  const res = await peek(page, `(() => { saveResume(); const r = store.getJSON(KEY.resume); const o = { saved: r && r.sortie }; resumeRun(r); o.after = run.sortie && run.sortie.level; o.state = app.state; return o; })()`);
  ok(res.saved && res.saved.level === 6 && res.after === 6 && res.state === 'play', 'the resume record holds {level, seed} and rebuilds the sortie');

  // the end of the last level (6): the congratulations, then the title; no picker, no loop counted, the sortie cleared
  const end = await peek(page, `(() => { world.bossSpawned = true; app.results = null; app.fade = null; finishResults(); const o = { congrats: !!app.congrats, fade0: !!app.fade }; finishResults(); o.fade = !!app.fade; const f = app.fade && app.fade.fn; app.fade = null; if (f) f();
    const q = id => document.getElementById(id); o.state = app.state; o.sortieAfter = run.sortie; o.picker = q('diffAsk').classList.contains('open'); o.loops = loopsWon; return o; })()`);
  ok(end.congrats && !end.fade0 && end.fade && end.state === 'title' && end.sortieAfter === null && !end.picker && end.loops === before.loops,
    'finishing the last level: the congratulations, then the title (no picker, no loop counted, sortie cleared)');
  // any other level flies on into the next, like the Campaign, with the run's score, lives, Novas and weapon carried over
  const nx = await peek(page, `(() => { startEnigma(5); run.score = 123450; run.lives = 4; run.bombs = 1; player.wpn = 'L'; player.lvl = 3; world.bossSpawned = true; app.results = null; app.fade = null; finishResults();
    const o = { congrats: !!app.congrats }; const f = app.fade && app.fade.fn; app.fade = null; if (f) f(); return Object.assign(o, { level: run.sortie && run.sortie.level, score: run.score, lives: run.lives, bombs: run.bombs, wpn: player.wpn, lvl: player.lvl, state: app.state, picker: document.getElementById('diffAsk').classList.contains('open') }); })()`);
  ok(!nx.congrats && nx.level === 6 && nx.score === 123450 && nx.lives === 4 && nx.bombs === 1 && nx.wpn === 'L' && nx.lvl === 3 && nx.state === 'play' && !nx.picker,
    `finishing level 5 flies on into level 6 with the score, lives, Novas and weapon carried over (level ${nx.level}, score ${nx.score}, lives ${nx.lives}, Novas ${nx.bombs}, weapon ${nx.wpn}${nx.lvl})`);
  await page.close();
}

// 3. State hygiene: Enigma level 6 played first, then the Campaign scenario in the same page. It must equal tests/golden.json.
{
  const page = await freshPage();
  await page.evaluate(() => { window.SF.setMode('immortal'); window.SF.peek('settings.diff = 1; startEnigma(6)'); window.SF.run(4000); });
  const got = await page.evaluate(() => window.SF.replay(window.SF.SCENARIOS.find(s => s.name === 'normal-stage1-immortal')));
  const want = golden.scenarios['normal-stage1-immortal'];
  const diffs = Object.keys({ ...want, ...got }).filter(k => JSON.stringify(want?.[k]) !== JSON.stringify(got[k]));
  ok(diffs.length === 0, 'a Campaign run after an Enigma Run level in the same page equals the golden result' + (diffs.length ? ' (differs: ' + diffs.join(', ') + ')' : ''));
  await page.close();
}

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

// 3b'. Level 6 takes its ground from the settlement plan (tools/citygen.js, embedded as CityGen): the plan passes the generator's hard rules,
// the game's road is the plan's main road (meeting the legacy road where the plan begins), the ground types are the plan's, a plan chunk's
// pixels are the plan's own painting.
{
  const page = await freshPage();
  const r = await peek(page, `(() => { settings.diff = 1; startEnigma(6); const S = run.sortie, P = sortiePlan(S), v = CityGen.validate(P); let road = 0, types = 0, n = 0;
    for (let y = 0; y < P.L; y += 37) { const wy = S.planY0 - y; if (Math.abs(roadX(wy) - P.mx[y]) > 0.01) road++; for (let x = 3; x < W; x += 29) { n++; if (terrainType(x, wy) !== CityGen.typeAt(P, x, y)) types++; } }
    const p = world.stageBaseP + S.planC0 + 20; startChunk(p); const job = world.chunkJobs[world.chunkJobs.length - 1]; workChunk(job, CH); world.chunkJobs.pop();
    const img = { data: new Uint8ClampedArray(W * CH * 4) }; CityGen.paint(P, img, S.planY0 - (-p * CH + CH - 1), CH, planPaintOpts(S)); let pix = 0; for (let i = 0; i < img.data.length; i++) if (img.data[i] !== job.img.data[i]) pix++;
    startChunk(p); const jb = world.chunkJobs[world.chunkJobs.length - 1]; while (jb.ly < CH) workChunk(jb, 2); world.chunkJobs.pop(); for (let i = 0; i < img.data.length; i++) if (img.data[i] !== jb.img.data[i]) pix++; /* painted in bands as a frame budget does */
    const R = P.rivers[0], sc0 = world.scroll; let flow = 0, fires = 0; // the moving parts: river streaks where the river is on screen, flames where fires are
    if (R) { world.scroll = Math.round(R.yMin + 60 - S.planY0); flow = CityGen.riverFx(P, 1.5, Math.max(0, S.planY0 + world.scroll - H), S.planY0 + world.scroll + 1).length; drawPlanFx(world.scroll); }
    const f0 = P.fires[Math.floor(P.fires.length / 2)]; if (f0) { world.scroll = Math.round(f0.y0 + 120 - S.planY0); drawPlanFx(world.scroll); fires = S.fireFx ? S.fireFx.size : 0; } world.scroll = sc0;
    const entry = Math.abs(P.mx[0] - roadXl(S.planY0));
    return { pass: v.pass, L: P.L, len: (S.len - S.planC0) * CH, road, types, n, pix, entry, slots: P.slots.length, plan: info(p).plan === true, flow, fires, per: P.perimeter ? P.perimeter.y0 : null, st: P.station ? P.station.y1 : null }; })()`);
  ok(r.pass && r.L === r.len && r.plan, `level 6 plan passes the generator's hard rules and covers the farmland to the level's end (${r.L} px, ${r.slots} gun slots)`);
  ok(r.flow > 0 && r.fires > 0, `the river and the fires move (${r.flow} streaks on screen over the river, ${r.fires} fires animated)`);
  ok(r.per === r.L - 64 && r.st !== null && r.st < r.per, `the town ends at the airfield's perimeter in the last chunk, the station before it (perimeter from row ${r.per}, station to ${r.st})`);
  ok(r.road === 0 && r.entry < 0.5, `the game's road is the plan's main road, starting where the legacy road enters (${r.road} rows off, entry gap ${r.entry.toFixed(2)} px)`);
  ok(r.types === 0, `ground types come from the plan (${r.types} of ${r.n} samples differ)`);
  ok(r.pix === 0, `a plan chunk's pixels are the plan's painting, whole or in bands (${r.pix} bytes differ)`);
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
    return { pass: v.pass, L: P.L, len: S.len * CH, types, n, pix, seaFirst, afterB: after.b, afterTh: after.th, afterPlan: !!after.plan, feats, gen: S.gen }; })()`);
  ok(r.pass && r.L === r.len && r.seaFirst && r.gen === 2, `level 2 plan passes the generator's hard rules and covers the whole level, beginning over the sea (${r.L} px)`);
  const F = r.feats; ok(F.war && F.valley >= 2 && F.oasis === 'medium+held,small' && F.junction && F.airbase && F.viaduct === 1, `level 2 has every segment's ground: the beach town at war, the oil valley, the held oasis village and the small oasis, the junction, the airbase, the pass with its viaduct`);
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
// 3d. Trains and side roads (owner): flown through by the bot, levels 2, 6 and 6B each get trains on their plan's train runs (they move along
// the line) and tanks that turn off the main road into a side road and drive along it
for (const lv of [2, 6, 7]) {
  const page2 = await freshPage();
  const f = await page2.evaluate(lv => { const SF = window.SF; SF.setMode('immortal'); SF.peek(`settings.diff = 1; startEnigma(${lv})`); let st = 'ok'; const o = { trains: new Set(), moved: 0, side: new Set(), sideMoved: 0 }, last = {};
    for (let i = 0; i < 20000 && st === 'ok'; i++) { st = SF.run(50); const v = JSON.parse(SF.peek(`JSON.stringify({ locos: world.enemies.filter(e => e.type === 'loco' && !e.dead).map(e => [e.train, Math.round(e.wy)]), side: world.enemies.filter(e => (e.type === 'tank' || e.type === 'htank') && e.side && !e.dead).map(e => [e.side.s + ':' + Math.round(e.wx * 0) , Math.round(e.side.k), e.wx | 0]), boss: world.bossSpawned })`));
      for (const [t, y] of v.locos) { if (last['t' + t] !== undefined && last['t' + t] !== y) o.moved++; last['t' + t] = y; o.trains.add(t); }
      for (const [s2, k, x] of v.side) { o.side.add(s2); if (last['s' + s2] !== undefined && last['s' + s2] !== k) o.sideMoved++; last['s' + s2] = k; }
      if (v.boss) break; }
    return { st, trains: o.trains.size, moved: o.moved, side: o.side.size, sideMoved: o.sideMoved, errs: SF.R.errs.slice(0, 2) }; }, lv);
  const name = { 2: '2', 6: '6', 7: '6B' }[lv];
  ok(f.trains >= 1 && f.moved > 5 && f.errs.length === 0, `level ${name}: trains run on the plan's railway (${f.trains} trains)`);
  if (lv !== 2) ok(f.side >= 1 && f.sideMoved > 5, `level ${name}: tanks turn into side roads and drive along them (${f.side} side roads used)`);
  else { const d = await page2.evaluate(() => window.SF.peek(`(() => { startEnigma(2); SIDE.turn = 1; const S = run.sortie, sides = sideRoutes(S), sd = sides.find(q => q.path.length >= 30 && q.path[0][1] < S.planY0 - 700), j = sd.junc[0], rt = sortieRoutes(S)[j.rt], y0 = sd.path[j.k][1] - 6; /* a desert side track */
      world.enemies = []; world.scroll = -y0 + 200; ensureChunks(); for (let i = 0; i < 400 && world.chunkJobs.length; i++) ensureChunks();
      const t = G('tank', routeX(rt, y0), y0, tankStats(false, { road: true, dir: 1, lane: 0, v: 0.2, hd: PI / 2, route: rt.id })); world.enemies.push(t); let side = false, off = 0;
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
// 3b''. Level 6B (internal level 7), the harbour city: one plan from the level's first chunk (sea, the south harbour with the east harbour
// opening into it, the town, works, station, the airfield's perimeter); the picker offers it, the ground types and pixels are the plan's,
// it is the same after a resume, and flown through by the bot it reaches the boss and, the last level, ends at the title without errors.
{
  const page = await freshPage();
  const r = await peek(page, `(() => { openDiff('enigma', 1); const btn = document.querySelector('#dStage [data-s="7"]'), shown = !btn.hidden && btn.textContent === '6B'; closeDiff(); openDiff('camp', 2); setDiffView(true); const hiddenCamp = btn.hidden; closeDiff();
    settings.diff = 1; startEnigma(7); const S = run.sortie, P = sortiePlan(S), v = CityGen.validate(P); let types = 0, n = 0;
    for (let y = 0; y < P.L; y += 41) { const wy = S.planY0 - y; for (let x = 5; x < W; x += 31) { n++; if (terrainType(x, wy) !== CityGen.typeAt(P, x, y)) types++; } }
    const p = world.stageBaseP + 30; startChunk(p); const jb = world.chunkJobs[world.chunkJobs.length - 1]; while (jb.ly < CH) workChunk(jb, 2); world.chunkJobs.pop();
    const img = { data: new Uint8ClampedArray(W * CH * 4) }; CityGen.paint(P, img, S.planY0 - (-p * CH + CH - 1), CH, planPaintOpts(S)); let pix = 0; for (let i = 0; i < img.data.length; i++) if (img.data[i] !== jb.img.data[i]) pix++;
    const seaFirst = terrainType(112, S.planY0 - 20) === 'sea' && info(world.stageBaseP).b === 'sea' && info(world.stageBaseP).plan === true;
    return { shown, hiddenCamp, pass: v.pass, L: P.L, len: S.len * CH, types, n, pix, seaFirst, mode: P.coast.mode, cs: P.coast.cs, side: !!P.port.side, piers: P.port.piers, sub: P.slots.some(q => q.kind === 'sub'), war: (P.shipLanes.find(l => l.kind === 'warships') || {}).w || 0, tunnel: P.tunnels.length, wall: (() => { const l = P.shipLanes.find(q => q.kind === 'warships'); if (!l) return -1; let n = 0; for (let y = l.y0; y <= l.y1; y++) for (let x = Math.round(l.x - l.w / 2); x < l.x + l.w / 2; x++) if (P.K[y * P.W + x] === CityGen.K.QUAY) n++; return n; })(), per: P.perimeter && P.perimeter.y0, st: P.station && P.station.y1, msg: app.msg && app.msg.a }; })()`);
  ok(r.shown && r.hiddenCamp, 'the Enigma Run picker offers level 6B (the practice picker does not)');
  ok(r.pass && r.L === r.len && r.seaFirst, `level 6B plan passes the generator's hard rules and covers the whole level, beginning over the sea (${r.L} px)`);
  ok(r.mode === 'corner' && r.cs === 1 && r.side && r.piers >= 3 && r.sub, `level 6B has the south harbour (${r.piers} piers, a submarine berth) with the east harbour opening into it`);
  ok(r.war >= 30 && r.wall === 0 && r.tunnel >= 1, `level 6B's east harbour is open water, no breakwater, a ${r.war} px lane for the warships; the quayside track runs into a tunnel`);
  ok(r.per === r.L - 64 && r.st !== null && r.st < r.per, `level 6B ends at the airfield's perimeter, its station before it (station to ${r.st}, perimeter from ${r.per})`);
  ok(r.types === 0 && r.pix === 0, `level 6B ground types and pixels come from its plan, its water in the game's own sea texture (${r.types} of ${r.n} types and ${r.pix} bytes differ)`);
  const hashL = 'SF.chunkHash(world.stageBaseP - 2, world.stageBaseP + run.sortie.len + 6)';
  const fresh = await peek(page, `(() => { startEnigma(7); return ${hashL}; })()`), resumed = await peek(page, `(() => { saveResume(); resumeRun(store.getJSON(KEY.resume)); return run.sortie.level + ':' + ${hashL}; })()`);
  ok('7:' + fresh === resumed, `level 6B is the same ground after a resume (${fresh})`);
  await page.close();
  const page2 = await freshPage();
  const f = await page2.evaluate(() => { const SF = window.SF; SF.setMode('immortal'); SF.peek('settings.diff = 1; startEnigma(7)'); const o = { status: 'ok' };
    o.sub = false; for (let i = 0; i < 20000 && o.status === 'ok'; i++) { o.status = SF.run(100); if (!o.sub) o.sub = SF.peek(`(() => { if (!run.sortie || !run.sortie.plan) return false; const P = run.sortie.plan, i = P.slots.findIndex(q => q.kind === 'sub'); return i >= 0 && !!(run.sortie.slotUsed && run.sortie.slotUsed.has(i)); })()`); if (o.boss === undefined && SF.peek('world.bossSpawned')) o.boss = SF.peek('(-Math.floor((H - 1 - Math.floor(world.scroll)) / CH)) - world.stageBaseP'); }
    Object.assign(o, SF.peek(`({ state: app.state, picker: document.getElementById('diffAsk').classList.contains('open'), n: app.diffNext && app.diffNext.n, errs: SF.R.errs.slice(0, 2) })`)); return o; });
  ok(f.sub, `on the way the game's submarine took its berth by the U-boat bunker`);
  ok(f.boss !== undefined && f.state === 'title' && !f.picker && f.errs.length === 0, `level 6B flown through: the boss comes (screen bottom at chunk ${f.boss}) and, the last level, it ends at the title (no picker) (${f.status}${f.errs.length ? ', errors: ' + f.errs.join(' | ') : ''})`);
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
    for (let i = 0; i < 50; i++) { SF.run(50); const v = SF.peek(`({ over: world.carrier.over, gone: world.carrier.gone, s: world.carrier.s, ships: world.enemies.filter(e => ['destroyer', 'sub', 'pt'].includes(e.type)).length, chase: world.enemies.filter(e => e.chase && !e.dead).length })`);
      if (!v.over) o.ships += v.ships; o.minS = Math.min(o.minS, v.s); o.chase = Math.max(o.chase, v.chase); o.gone = v.gone; o.over = v.over; }
    o.launched = SF.peek('world.carrier.launched'); o.t = SF.peek('world.carrier.t'); SF.run(1500); o.later = SF.peek(`world.enemies.filter(e => !e.chase && !e.dead && ['fighter', 'bomber', 'heavy', 'sub', 'destroyer', 'pt', 'flak'].includes(e.type)).length + run.stats.seen`); o.errs = SF.R.errs.slice(0, 2); return o; });
  ok(r.camp, 'a Campaign run has no carrier');
  ok(r.on && r.s === r.K && r.len >= r.H * 0.7 && r.deck && !r.steer && !r.steer30 && r.guns === 6, `level 1 opens on the carrier's deck: scale ${r.K}, ${r.len} px long on a ${r.H} px screen, six deck guns, no steering while on the deck`);
  ok(!r.deckAfter && r.alt === 1 && r.steerAfter && r.cf >= 1, `the Feuervogel lifts off over the bow and can steer; fighters are launching after it (${r.cf})`);
  ok(r.gunKill, 'a deck gun can be destroyed and leaves its stub on the deck');
  ok(r.minS === r.sEnd && r.gone && r.over, `the carrier shrinks to ${r.sEnd} and slides off the bottom, and the pursuit ends (scene over at frame ${r.t})`);
  ok(r.launched >= 8 && r.chase >= 2 && r.ships === 0, `${r.launched} fighters launched in the pursuit (up to ${r.chase} chasing at once); no ships spawned during the scene`);
  ok(r.later > 0 && r.errs.length === 0, `after the scene the director takes over (${r.later} enemies seen)${r.errs.length ? ', errors: ' + r.errs.join(' | ') : ''}`);
  await page.close();
}

// 3b''''. Level 1's sequence (owner): the carrier, open sea, the small islands, the large island with the airbase, open sea (all sea for
// now), the fortified beach and the old land (coast, farmland with the Campaign's rivers, village, forest, farmland), the coast down, open sea.
// Flown through by the bot, the flagship comes over the last open sea and the run flies on into level 2.
{
  const page = await freshPage();
  const r = await peek(page, `(() => { settings.diff = 1; startEnigma(1); const S = run.sortie, want = { carrier_start: 'sea', open_sea: 'sea', island_chain: 'sea', island_airbase: 'sea', beach_fortified: 'country', farmland: 'country', village: 'country', forest_deciduous: 'forest', coast_down: 'coastDown' };
    let bad = 0, rivers = 0; for (let c = 0; c < S.len + 8; c++) { const I = info(world.stageBaseP + c), g = sortieSeg(S, c), w = !g ? 'sea' : g.t === 'beach_fortified' && c === g.start ? 'coastUp' : want[g.t]; if (I.b !== w || I.th !== 0) bad++; if (I.river) rivers++; }
    return { bad, rivers, seq: S.seq, gen: S.gen, segs: S.segs.map(g => g.t + ' ' + g.n).join(', ') }; })()`);
  ok(r.bad === 0 && r.seq && !r.gen && r.rivers >= 1, `level 1 follows its own sequence on the Campaign's stage 1 ground (${r.segs}; ${r.rivers} rivers in the farmland)`);
  await page.close();
  const page2 = await freshPage();
  const f = await page2.evaluate(() => { const SF = window.SF; SF.setMode('immortal'); SF.peek('settings.diff = 1; startEnigma(1)'); const o = { status: 'ok' };
    for (let i = 0; i < 20000 && o.status === 'ok'; i++) { o.status = SF.run(100); if (o.boss === undefined && SF.peek('world.bossSpawned')) o.boss = SF.peek(`({ c: (-Math.floor((H - 1 - Math.floor(world.scroll)) / CH)) - world.stageBaseP, b: biomeOf(-Math.floor((H / 2 - Math.floor(world.scroll)) / CH)) })`); }
    Object.assign(o, SF.peek(`({ state: app.state, picker: document.getElementById('diffAsk').classList.contains('open'), n: app.diffNext && app.diffNext.n, errs: SF.R.errs.slice(0, 2) })`)); return o; });
  ok(f.boss && f.boss.b === 'sea' && f.status === 'next:2' && f.errs.length === 0, `level 1 flown through: the flagship comes over the open sea (screen bottom at chunk ${f.boss && f.boss.c}) and the run flies on into level 2 (${f.status}${f.errs.length ? ', errors: ' + f.errs.join(' | ') : ''})`);
  await page2.close();
}

// 3b'''''. Level 1A (internal level 8): level 1 with its islands. One islands plan from the first chunk to the fortified beach (the islets in
// island_chain, the large island from island_airbase on), the legacy ground after it; the picker offers it; types and pixels are the plan's;
// the same ground after a resume. Flown through by the bot: it opens on the carrier, the islets' turrets and the airbase's guns and planes take
// their slots, cows graze in the paddocks, no ship ever stands on land, the flagship comes and the run flies on into level 2.
{
  const page = await freshPage();
  const r = await peek(page, `(() => { openDiff('enigma', 1); const btn = document.querySelector('#dStage [data-s="8"]'), shown = !btn.hidden && btn.textContent === '1A'; closeDiff(); openDiff('camp', 2); setDiffView(true); const hiddenCamp = btn.hidden; closeDiff();
    settings.diff = 1; startEnigma(8); const S = run.sortie, P = sortiePlan(S), v = CityGen.validate(P), beach = S.segs.find(g => g.t === 'beach_fortified').start; let types = 0, n = 0;
    for (let y = 0; y < P.L; y += 37) { const wy = S.planY0 - y; for (let x = 5; x < W; x += 29) { n++; if (terrainType(x, wy) !== CityGen.typeAt(P, x, y)) types++; } }
    const p = world.stageBaseP + 20; startChunk(p); const jb = world.chunkJobs[world.chunkJobs.length - 1]; while (jb.ly < CH) workChunk(jb, 2); world.chunkJobs.pop();
    const img = { data: new Uint8ClampedArray(W * CH * 4) }; CityGen.paint(P, img, S.planY0 - (-p * CH + CH - 1), CH, planPaintOpts(S)); let pix = 0; for (let i = 0; i < img.data.length; i++) if (img.data[i] !== jb.img.data[i]) pix++;
    const bio = S.planBiome.join(''), after = info(world.stageBaseP + beach);
    return { shown, hiddenCamp, pass: v.pass, L: P.L, want: beach * CH, types, n, pix, isles: P.isles.length, airbase: !!P.airbase, land: S.planBiome.filter(b => b === 'country').length, sea: S.planBiome.filter(b => b === 'sea').length, after: after.b, afterPlan: !!after.plan, carrier: !!world.carrier, lvl1: (() => { startEnigma(1); return !!run.sortie.isles || !!sortiePlan(run.sortie); })() }; })()`);
  ok(r.shown && r.hiddenCamp, 'the Enigma Run picker offers level 1A (the practice picker does not)');
  ok(r.pass && r.L === r.want && r.isles >= 5 && r.airbase, `level 1A plan passes the generator's hard rules and runs from the first chunk to the fortified beach (${r.L} px, ${r.isles} islets, the airbase)`);
  ok(r.land >= 8 && r.sea >= 14 && r.after === 'coastUp' && !r.afterPlan && r.carrier && !r.lvl1, `level 1A plays the large island as land (${r.land} chunks) and the rest as sea (${r.sea}), the legacy coast after it, opens on the carrier; level 1 keeps the old ground`);
  ok(r.types === 0 && r.pix === 0, `level 1A ground types and pixels come from its plan, its water in the game's own sea texture (${r.types} of ${r.n} types and ${r.pix} bytes differ)`);
  const hashL = 'SF.chunkHash(world.stageBaseP - 2, world.stageBaseP + run.sortie.len + 6)';
  const fresh = await peek(page, `(() => { startEnigma(8); return ${hashL}; })()`), resumed = await peek(page, `(() => { saveResume(); resumeRun(store.getJSON(KEY.resume)); return run.sortie.level + ':' + ${hashL}; })()`);
  ok('8:' + fresh === resumed, `level 1A is the same ground after a resume (${fresh})`);
  await page.close();
  const page2 = await freshPage();
  const f = await page2.evaluate(() => { const SF = window.SF; SF.setMode('immortal'); SF.peek('settings.diff = 1; startEnigma(8)'); const o = { status: 'ok', wet: 0, ships: 0, cows: 0 };
    for (let i = 0; i < 20000 && o.status === 'ok'; i++) { o.status = SF.run(100);
      const v = SF.peek(`(() => { const sc = Math.floor(world.scroll); let wet = 0, n = 0; for (const e of world.enemies) if (!e.dead && (e.type === 'destroyer' || e.type === 'sub' || e.type === 'pt') && e.y > 0 && e.y < H) { n++; if (terrainType(Math.floor(e.wx), Math.floor(e.wy)) !== 'sea') wet++; } return { wet, n, cows: critters.filter(c => c.box).length }; })()`);
      o.wet += v.wet; o.ships += v.n; o.cows = Math.max(o.cows, v.cows);
      if (o.boss === undefined && SF.peek('world.bossSpawned')) o.boss = SF.peek('(-Math.floor((H - 1 - Math.floor(world.scroll)) / CH)) - world.stageBaseP');
      if (o.used === undefined && SF.peek('!!(run.sortie && run.sortie.slotUsed && run.sortie.slotUsed.size)') && SF.peek('(-Math.floor((H - 1 - Math.floor(world.scroll)) / CH)) - world.stageBaseP') > 30) o.used = SF.peek(`(() => { const P = run.sortie.plan, k = {}; for (const i of run.sortie.slotUsed) k[P.slots[i].kind] = (k[P.slots[i].kind] || 0) + 1; return { k, of: P.slots.length }; })()`); }
    Object.assign(o, SF.peek(`({ state: app.state, picker: document.getElementById('diffAsk').classList.contains('open'), n: app.diffNext && app.diffNext.n, errs: SF.R.errs.slice(0, 2) })`)); return o; });
  ok(f.used && f.used.k.bunker >= 1 && f.used.k.flak >= 2 && f.used.k.parked >= 1, `on the way the islands' guns took their slots (${f.used ? Object.entries(f.used.k).map(([k, v]) => v + ' ' + k).join(', ') + ' of ' + f.used.of : 'none'})`);
  ok(f.cows >= 3, `cows grazed in the paddocks (${f.cows} at once)`);
  ok(f.wet === 0, `no ship stood on land (${f.ships} ship sightings)`);
  ok(f.boss !== undefined && f.status === 'next:2' && f.errs.length === 0, `level 1A flown through: the flagship comes (screen bottom at chunk ${f.boss}) and the run flies on into level 2 (${f.status}${f.errs.length ? ', errors: ' + f.errs.join(' | ') : ''})`);
  await page2.close();
}

// 3b''''''. Route objects (spec 2, Tier A): a mixed convoy put on a route drives along it, switching routes where one route ends and another
// goes on (the lanes round a village green, the plan's edge), never leaves the road, keeps its distance (at least both half-lengths and
// ROUTE_GAP minus a pixel), and stops at a dead end: in 1A from the airbase down the island's road to the jetty; in level 6 from the town's
// north end south through the city. Only the convoy moves (its own update, no frame loop), so the test sees the route logic alone.
{
  const page = await freshPage();
  for (const [lv, name, frames] of [[8, '1A', 4000], [6, '6', 26000]]) {
    const r = await peek(page, `(() => { settings.diff = 1; startEnigma(${lv}); SIDE.turn = 0; /* this test follows the routes alone (side roads have their own check) */ const S = run.sortie, R = sortieRoutes(S), plan = R.filter(q => !q.legacy);
      let bad = 0, n = 0; for (const q of plan) for (let wy = q.wyLo; wy <= q.wyHi; wy += 3) { n++; const t = terrainType(Math.floor(routeX(q, wy)), wy); if (t !== 'road' && t !== 'bridge') bad++; }
      const start = plan.filter(q => q.main && q.wyHi - q.wyLo > 3 * ROUTE_SPACE + 16).sort((a, b) => a.wyLo - b.wyLo)[0], wy0 = start.wyLo + 3 * ROUTE_SPACE + 8; /* the northernmost main road with room for the convoy */
      world.enemies = []; world.scroll = -wy0 + 200; ensureChunks(); for (let i = 0; i < 400 && world.chunkJobs.length; i++) ensureChunks();
      const mk = (type, k) => { const o = type === 'truck' ? G('truck', routeX(start, wy0 - k * ROUTE_SPACE), wy0 - k * ROUTE_SPACE, { road: true, dir: 1, lane: 0, v: 0.32, hd: PI / 2, route: start.id }) : G('tank', routeX(start, wy0 - k * ROUTE_SPACE), wy0 - k * ROUTE_SPACE, tankStats(false, { road: true, dir: 1, lane: 0, v: 0.2, hd: PI / 2, route: start.id })); world.enemies.push(o); return o; };
      const cv = [mk('tank', 0), mk('truck', 1), mk('tank', 2), mk('truck', 3)];
      let seen = {}, minGap = 1e9, offRoad = 0, switches = 0, last = cv.map(o => o.route);
      let late = 0; for (let f = 0; f < ${frames}; f++) { for (const o of cv) ENT[o.type].update(o); if (f === ${frames} - 400) late = cv[0].wy;
        if (f % 10 === 0) { const srt = cv.slice().sort((a, b) => b.wy - a.wy); for (let i = 1; i < srt.length; i++) if (Math.abs(srt[i].wx - srt[i - 1].wx) < 9) minGap = Math.min(minGap, srt[i - 1].wy - srt[i].wy - srt[i - 1].hh - srt[i].hh);
          for (const o of cv) { const t = terrainType(Math.floor(o.wx), Math.floor(o.wy)); if (t !== 'road' && t !== 'bridge') { offRoad++; const P = S.plan, py = Math.round(S.planY0 - o.wy), pi = py * P.W + Math.round(o.wx), key = t + ':' + (py >= 0 && py < P.L ? CityGen.KIND_NAMES[P.K[pi]] + P.B[pi] : 'out') + (o.atEnd ? '@end' : ''); seen[key] = (seen[key] || 0) + 1; } } cv.forEach((o, i) => { if (o.route !== last[i]) { switches++; last[i] = o.route; } }); } }
      SIDE.turn = 0.35; return { seen: JSON.stringify(seen), routes: plan.length, bad, n, minGap: Math.round(minGap), offRoad, switches, end: cv.every(o => o.atEnd || !o.moving), front: Math.round(cv[0].wy - wy0), stopped: cv[0].atEnd || cv[0].wy === late }; })()`); // at a dead end, or held where the road meets the water
    ok(r.routes >= 3 && r.bad <= r.n * 0.02, `level ${name}: ${r.routes} routes from the plan's tank streets, on the road (${r.bad} of ${r.n} samples off it)`);
    ok(r.offRoad === 0 && r.minGap >= 9 && r.switches >= 1 && r.stopped && r.front > 300, `level ${name}: a convoy drove ${r.front} px along its routes (${r.switches} route changes), never off the road, at least ${r.minGap} px between vehicles, and stopped at the end (off the road ${r.offRoad} ${r.seen}, stopped ${r.stopped})`);
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
  ok(r.state === 'title' && !r.picker && r.errs.length === 0, `level 6, the last, flown to the end: the congratulations, then the title (no picker) (${r.status}, state ${r.state}${r.errs.length ? ', errors: ' + r.errs.join(' | ') : ''})`);
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
if (bad) { console.error(`\n${bad} check(s) failed`); process.exit(1); }
console.log('\nEnigma Run checks pass.');
