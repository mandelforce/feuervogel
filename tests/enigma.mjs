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
  const r = await peek(page, `(() => { const out = []; for (let lv = 1; lv <= 6; lv++) { const a = buildSortie(lv, 1944), b = buildSortie(lv, 1944), c = buildSortie(lv, 5);
    let at = 0, contiguous = true; for (const s of a.segs) { if (s.start !== at || s.n < 1) contiguous = false; at += s.n; }
    out.push({ lv, same: JSON.stringify(a) === JSON.stringify(b), contiguous, sum: at === a.len, len: a.len, theme: a.theme, seed: a.seed, rng: a.rng(3) === b.rng(3) && a.rng(3) !== c.rng(3), segs: a.segs.length, bossAt: a.bossAt, gen: a.gen }); } return out; })()`);
  for (const x of r) ok(x.same && x.contiguous && x.sum && x.rng && x.bossAt === (x.lv === 6 ? x.len + 5 : null) && x.gen === (x.lv === 6 ? 6 : 0) && x.len === [56, 56, 58, 60, 62, 70][x.lv - 1] && x.theme === [0, 2, 3, 4, 1, 5][x.lv - 1], `sortie level ${x.lv}: ${x.segs} segments, ${x.len} chunks, theme ${x.theme}, rebuilt identically`);
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
  ok(ui.pressed === '6' && ui.level === 6 && ui.theme === 5 && ui.stage === 6 && ui.state === 'play', 'choosing level 6 and a difficulty starts it (Campaign stage 6 ground for now)');

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
        return { bottomC: p - world.stageBaseP, bottomB: info(p).b, len: run.sortie.len, final: finalStartY() !== null, arc: arcScale() }; })()`));
    }
    Object.assign(o, SF.peek(`({ state: app.state, picker: document.getElementById('diffAsk').classList.contains('open'), kind: app.diffNext && app.diffNext.kind, errs: SF.R.errs.slice(0, 2) })`));
    return o;
  });
  ok(r.bottomC !== undefined && r.bottomB === 'secret' && r.bottomC === r.len + 1 && r.final, `level 6 boss comes where the Campaign's does: screen bottom one chunk into the secret ground (bottom chunk ${r.bottomC}, secret from ${r.len}; Campaign stage 6: 44 and 43)`);
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
