// Exact-resume test: a run saved mid-stage and loaded in a fresh page must play on exactly like the run that was never interrupted.
// For each scenario the bot flies to a frame, the game saves its resume record (with the snapshot), and the same run goes on to the end of
// the scenario, writing down the simulation every SAMPLE frames. A second, fresh page loads the record the way a reloaded browser does
// (resumeRun) and plays the same frames. Every sample must match; a mismatch names the first thing that differs.
// Serve the folder first (python3 -m http.server 8000), then: node tests/resume-exact.mjs [--quick]
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const PAGE = process.env.STARFALL_URL || 'http://localhost:8000/';
const harness = readFileSync(new URL('./harness.js', import.meta.url), 'utf8');
const quick = process.argv.includes('--quick'), AFTER = +((process.argv.find(a => a.startsWith('--after=')) || '--after=0').slice(8));
const SAMPLE = +((process.argv.find(a => a.startsWith('--sample=')) || '--sample=60').slice(9));

// each scenario: where to start, how long to fly before the save, and for how many frames after it
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7);
const SCENARIOS = [
  // the Campaign's own levels (Enigma sorties 1A, 2, 3, 4, 5, 6B)
  { name: 'level1A-normal', diff: 1, sortie: 8, seed: 1944, mode: 'immortal', saveAt: [1500, 5000], after: 1800 },
  { name: 'level2-hard-real', diff: 2, sortie: 2, seed: 7, mode: 'real', saveAt: [3000, 8000], after: 1800 },
  { name: 'level3-normal', diff: 1, sortie: 3, seed: 3, mode: 'immortal', saveAt: [4000, 9000], after: 1800 },
  { name: 'level4-normal', diff: 1, sortie: 4, seed: 4, mode: 'immortal', saveAt: [4000, 10000], after: 1800 },
  { name: 'level5-normal', diff: 1, sortie: 5, seed: 5, mode: 'immortal', saveAt: [4000, 12000], after: 1800 },
  { name: 'level6B-easy-real', diff: 0, sortie: 7, seed: 42, mode: 'real', saveAt: [4000, 12000], after: 1800 },
  // an encounter (docs/encounter-director-plan.md) started at frame encAt and saved while it runs: its clock, events and tagged enemies
  { name: 'level2-anvil', diff: 1, sortie: 2, seed: 2, mode: 'immortal', enc: 'anvil', encAt: 300, saveAt: [450, 700], after: 1200 },
  { name: 'level2-bomberscreen', diff: 1, sortie: 2, seed: 41, mode: 'immortal', enc: 'bomberscreen', encAt: 300, saveAt: [550], after: 1200 }, // (saved between its dives)
  { name: 'level4-sowerwindow', diff: 1, sortie: 4, seed: 104, mode: 'immortal', enc: 'sowerwindow', encAt: 7322, saveAt: [7500], after: 1200 }, // (opened the frame after the second Sower settles; saved with the Sower, its mines and the convoy up)
  { name: 'level2-shadowwing', diff: 1, sortie: 2, seed: 41, mode: 'immortal', enc: 'wing', encAt: 300, saveAt: [700], after: 1200 }, // (the Shadow Wing's encounter, saved with the Wing in its sequence)
  { name: 'level6B-firstcontact', diff: 1, sortie: 7, seed: 47, mode: 'immortal', enc: 'firstcontact', encAt: 60, saveAt: [400], after: 1200 }, // (over the open sea at 6B's start: its sweeps, destroyer and boats)
  { name: 'level2-flaklane', diff: 1, sortie: 2, seed: 31, mode: 'immortal', enc: 'flaklane', encAt: 300, saveAt: [450, 700], after: 1200 }, // (saved before and after its formation, which waits for the guns)
  { name: 'stage1-normal', diff: 1, stage: 1, seed: 1944, mode: 'immortal', saveAt: [1500, 4000], after: 1800 },
  { name: 'stage3-hard-real', diff: 2, stage: 3, seed: 7, mode: 'real', saveAt: [3000, 7000], after: 1800 },
  { name: 'stage4-castle', diff: 1, stage: 4, seed: 4, mode: 'immortal', saveAt: [6000, 9500], after: 2400 },
  { name: 'stage6-final', diff: 1, stage: 6, seed: 6, mode: 'immortal', saveAt: [5000, 12500], after: 2400 },
  { name: 'endless-hard', diff: 2, endless: 2, seed: 11, mode: 'real', saveAt: [2500], after: 1800 },
  { name: 'stage2-2p', diff: 1, stage: 2, p2: 'mouse', seed: 22, mode: 'immortal', saveAt: [3000], after: 1800 },
].filter(s => (!quick || s.saveAt.length) && (!ONLY || s.name.includes(ONLY)));

// Runs before the game's own script: a seeded Math.random, and no frame loop, so only the test moves the game.
const initScript = () => {
  let a = 1944;
  Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  window.requestAnimationFrame = () => 0;
};

const open = async (browser, pageSeed) => {
  const page = await browser.newPage({ viewport: { width: 400, height: 700 } });
  await page.route(/workers\.dev/, r => r.abort());
  page.on('pageerror', e => console.error('page error:', e.message));
  await page.addInitScript(initScript);
  await page.goto(PAGE);
  await page.waitForFunction(() => typeof window.__sf === 'function', null, { polling: 100, timeout: 60000 });
  await page.evaluate(s => window.__sf(s), harness);
  return page;
};

// what the page writes down at each sample: everything that decides how the run goes on
const DUMP = `(() => {
  const COSMETIC = ['birdCd', 'rainT', 'rainF', 'rainCd', 'lightCd', 'flashL']; /* weather and birds draw from the free random stream: they differ between any two pages */
  const r = v => typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v;
  const flat = (o, skip = []) => { const out = {}; for (const k of Object.keys(o)) { const v = o[k]; if (skip.includes(k) || typeof v === 'function' || (v && typeof v === 'object')) continue; out[k] = r(v); } return out; };
  const ent = e => Object.assign(flat(e), e.parts ? { parts: e.parts.map(q => flat(q)) } : {});
  return JSON.stringify({
    gf, simS, drandS, scroll: r(world.scroll), scrollV: r(world.scrollV), theme: world.curTheme,
    director: flat(world, COSMETIC), enc: world.enc ? flat(world.enc) : null, encLast: world.encLast ? flat(world.encLast) : null, run: flat(run), stats: flat(run.stats), camp: flat(run.camp),
    player: flat(player), p2: p2 ? flat(p2) : null, feel: flat(feel), laserHeat: r(laserHeat), overheatT, guardCount,
    enemies: world.enemies.map(ent), ebul: world.ebul.map(b => flat(b)), shots: world.shots.map(b => flat(b)), items: world.items.map(b => flat(b)),
    decals: world.decals.map(d => flat(d, ['s'])).length, parts: world.parts.filter(q => q.kind === 'thrown' || q.kind === 'turfly').map(q => flat(q)), chutes: chutes.map(c => flat(c)), markers: markers.map(c => flat(c)),
    bridgeDown: [...bridgeDown].sort().join(), burnt: burntTrees.size, damaged: damagedHouses.size, towers: towerRows.size,
  });
})()`;

const diffs = (a, b, path = '', out = []) => {
  if (a === b || out.length >= 12) return out;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) { out.push(`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`); return out; }
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diffs(a[k], b[k], path + '.' + k, out);
  return out;
};
const diff = (a, b) => { const d = diffs(a, b); return d.length ? d.join(' | ') : null; };

const browser = await chromium.launch();
let bad = 0;
const AT = +((process.argv.find(a => a.startsWith('--at=')) || '--at=0').slice(5));
for (const sc of SCENARIOS) for (const saveAt of sc.saveAt.filter(a => !AT || a === AT)) {
  const label = `${sc.name} saved at frame ${saveAt}`;
  // --- the run that is never interrupted, with the save taken on the way
  const A = await open(browser);
  const ref = await A.evaluate(async ({ sc, saveAt, SAMPLE, DUMP, AFTER }) => window.__sf(`(async () => {
    window.__forceSeed = ${sc.seed}; if (app.booting) finishBoot(); gf = 0; settings.fire = 100; settings.pb = false;
    ${sc.p2 ? `settings.p2 = '${sc.p2}';` : ''}
    SF.setMode('${sc.mode}'); ${sc.sortie ? `acc = -1e15; settings.diff = ${sc.diff}; startEnigma(${sc.sortie}, true);` : `SF.start(${sc.diff}, ${sc.stage || 1}${sc.endless !== undefined ? ', ' + sc.endless : ''});`}
    ${sc.enc ? `SF.run(${sc.encAt}); encStart('${sc.enc}'); SF.run(${saveAt - sc.encAt});` : `SF.run(${saveAt});`}
    let tries = 0; while (!takeSnapshot() && tries++ < 1500) SF.run(1); /* the save happens at the next moment the game can be written down */
    if (tries >= 1500) return JSON.stringify({ error: 'no moment to save within 1500 frames' });
    snapNow(); saveResume();
    const rec = localStorage.getItem('starfall-resume');
    const samples = []; samples.push(${DUMP});
    for (let f = 0; f < ${AFTER || sc.after}; f += ${SAMPLE}) { const st = SF.run(${SAMPLE}); samples.push(${DUMP}); if (st !== 'ok') break; }
    return JSON.stringify({ rec, samples, size: rec ? rec.length : 0 });
  })()`), { sc, saveAt, SAMPLE, DUMP, AFTER });
  await A.close();
  const R = JSON.parse(ref);
  if (R.error) { console.error(`FAIL ${label}: ${R.error}`); bad++; continue; }
  if (!R.rec || !JSON.parse(R.rec).snap) { console.error(`FAIL ${label}: the resume record has no snapshot`); bad++; continue; }
  // --- a fresh page loads the record and plays the same frames
  const B = await open(browser);
  const got = await B.evaluate(async ({ sc, rec, saveAt, SAMPLE, DUMP, AFTER }) => window.__sf(`(async () => {
    window.__forceSeed = ${sc.seed}; if (app.booting) finishBoot(); gf = 0; settings.fire = 100; settings.pb = false;
    ${sc.p2 ? `settings.p2 = '${sc.p2}';` : ''}
    SF.setMode('${sc.mode}');
    store.set(KEY.resume, ${JSON.stringify(rec)});
    resumeRun(loadResume());
    const exact = app.resumeT === 180 && !app.paused;
    for (let i = 0; i < 180; i++) update(); /* the three-second countdown: nothing moves */
    const samples = []; samples.push(${DUMP});
    for (let f = 0; f < ${AFTER || sc.after}; f += ${SAMPLE}) { const st = SF.run(${SAMPLE}); samples.push(${DUMP}); if (st !== 'ok') break; }
    return JSON.stringify({ exact, samples });
  })()`), { sc, rec: R.rec, saveAt, SAMPLE, DUMP, AFTER });
  await B.close();
  const G = JSON.parse(got);
  if (!G.exact) { console.error(`FAIL ${label}: the snapshot was not applied (fell back to a stage restart)`); bad++; continue; }
  let first = -1, why = '';
  for (let i = 0; i < Math.min(R.samples.length, G.samples.length); i++) { const d = diff(JSON.parse(R.samples[i]), JSON.parse(G.samples[i])); if (d) { first = i; why = d; break; } }
  if (first < 0 && R.samples.length !== G.samples.length) { first = Math.min(R.samples.length, G.samples.length); why = 'run ended at another time'; }
  if (first >= 0) { console.error(`FAIL ${label}: first differs ${first * SAMPLE} frames after the save: ${why.slice(0, 900)}`); bad++; }
  else console.log(`ok   ${label}: ${R.samples.length} samples identical (record ${Math.round(R.size / 1024)} KB)`);
}
await browser.close();
if (bad) { console.error(`\n${bad} problem(s) found.`); process.exit(1); }
console.log('\nExact resume test passed.');
