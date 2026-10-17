// Enigma Run test (phase 1: the plumbing around a sortie). Needs Node and Playwright, like tests/replay.mjs; serve the folder first
// (python3 -m http.server 8000).
//   node tests/enigma.mjs            all checks
//   node tests/enigma.mjs --bench    also print how long chunks take to build for each level, and level 6 by template (pixels and features apart)
//   node tests/enigma.mjs --pixels   also compare the finished Campaign chunks (pixels, features included) with tests/enigma-pixels.json
//   node tests/enigma.mjs --pixels --update   write tests/enigma-pixels.json (only when a Campaign look change is meant)
// The pixel check is by hand, not in CI: canvas blending can differ between browser builds. Run it before and after every change to shared
// terrain code (drawFeatures, pixelColor, the city functions): the replay test's terrain fingerprint sees only terrain types, not pixels.
// Checks: every level's sortie is well formed and rebuilt identically; an Enigma Run level never counts (board, best, play data, loops);
// its end returns to the level picker; it is saved and resumed; the Settings button and the picker work; and above all that an Enigma Run
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
    out.push({ lv, same: JSON.stringify(a) === JSON.stringify(b), contiguous, sum: at === a.len, len: a.len, theme: a.theme, seed: a.seed, rng: a.rng(3) === b.rng(3) && a.rng(3) !== c.rng(3), segs: a.segs.length, bossAt: a.bossAt, gen: a.gen, seaLast: a.segs[a.segs.length - 1].start }); } return out; })()`);
  for (const x of r) ok(x.same && x.contiguous && x.sum && x.rng && x.bossAt === (x.lv === 6 || x.lv === 7 ? x.len + 5 : x.lv === 1 || x.lv === 8 ? x.seaLast + 1 : null) && x.gen === (x.lv === 6 || x.lv === 7 ? 6 : 0) && x.len === [56, 56, 58, 60, 62, 70, 70, 56][x.lv - 1] && x.theme === [0, 2, 3, 4, 1, 5, 5, 0][x.lv - 1], `sortie level ${['1', '2', '3', '4', '5', '6', '6B', '1A'][x.lv - 1]}: ${x.segs} segments, ${x.len} chunks, theme ${x.theme}, rebuilt identically`);
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

  // the end: results, then the picker; no next stage, no loop, no congratulations
  const end = await peek(page, `(() => { world.bossSpawned = true; app.results = null; app.fade = null; finishResults(); const o = { congrats: app.congrats, fade: !!app.fade }; const f = app.fade && app.fade.fn; app.fade = null; if (f) f();
    const q = id => document.getElementById(id); o.state = app.state; o.sortieAfter = run.sortie; o.picker = q('diffAsk').classList.contains('open'); o.kind = app.diffNext && app.diffNext.kind; o.n = app.diffNext && app.diffNext.n; o.loops = loopsWon; return o; })()`);
  ok(end.congrats === null && end.fade && end.state === 'title' && end.sortieAfter === null && end.picker && end.kind === 'enigma' && end.n === 6 && end.loops === before.loops,
    'finishing the level returns to the picker (no congratulations, no loop counted, sortie cleared)');
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

// 3b''. Level 6B (internal level 7), the harbour city: one plan from the level's first chunk (sea, the south harbour with the east harbour
// opening into it, the town, works, station, the airfield's perimeter); the picker offers it, the ground types and pixels are the plan's,
// it is the same after a resume, and flown through by the bot it reaches the boss and returns to the picker without errors.
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
  ok(f.boss !== undefined && f.state === 'title' && f.picker && f.n === 7 && f.errs.length === 0, `level 6B flown through: the boss comes (screen bottom at chunk ${f.boss}) and the level returns to the picker on 6B (${f.status}${f.errs.length ? ', errors: ' + f.errs.join(' | ') : ''})`);
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
// Flown through by the bot, the flagship comes over the last open sea and the level returns to the picker.
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
  ok(f.boss && f.boss.b === 'sea' && f.state === 'title' && f.picker && f.n === 1 && f.errs.length === 0, `level 1 flown through: the flagship comes over the open sea (screen bottom at chunk ${f.boss && f.boss.c}) and the level returns to the picker (${f.status}${f.errs.length ? ', errors: ' + f.errs.join(' | ') : ''})`);
  await page2.close();
}

// 3b'''''. Level 1A (internal level 8): level 1 with its islands. One islands plan from the first chunk to the fortified beach (the islets in
// island_chain, the large island from island_airbase on), the legacy ground after it; the picker offers it; types and pixels are the plan's;
// the same ground after a resume. Flown through by the bot: it opens on the carrier, the islets' turrets and the airbase's guns and planes take
// their slots, cows graze in the paddocks, no ship ever stands on land, the flagship comes and the level returns to the picker on 1A.
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
  ok(f.boss !== undefined && f.state === 'title' && f.picker && f.n === 8 && f.errs.length === 0, `level 1A flown through: the flagship comes (screen bottom at chunk ${f.boss}) and the level returns to the picker on 1A (${f.status}${f.errs.length ? ', errors: ' + f.errs.join(' | ') : ''})`);
  await page2.close();
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
  ok(r.state === 'title' && r.picker && r.kind === 'enigma' && r.errs.length === 0, `level 6 flown to the end returns to the picker (${r.status}, state ${r.state}${r.errs.length ? ', errors: ' + r.errs.join(' | ') : ''})`);
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
