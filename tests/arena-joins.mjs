#!/usr/bin/env node
// Where a Daily Sortie's level meets its generated boss arena, nothing may show (owner: "avoid this track situation at all costs"): no line across the ground, and a
// railway that reaches the level's end goes on in the same track, never a differently painted one. For each sortie it builds the ground on both sides of the join and
// compares pixels (no enemies, day light, no twist):
// - the seam: the mean colour change between the level's last row and the arena's first row, over the columns that are open ground on both sides, against the mean change
//   between two neighbouring rows inside the level (the ground's own noise). FAIL when the join's change is more than 1.6 times that plus 8.
// - the track: wherever the level's last row has rails (mask 2, 6 px apart), the 13 px profile of the track there (its rails, sleepers and ballast) on the arena's first rows
//   against the same profile 5 rows earlier in the level (the sleepers' period), row for row over 5 rows. FAIL when it differs by more than twice the level's own
//   row-to-row change plus 12 (a track painted by another painter differs by far more).
// Covers the desert's own arena, and both airfield designs on desert and forest days (the forest's own arena has a soft seam by design and is checked for the seam only).
// Serve the folder (python3 -m http.server 8000), then: node tests/arena-joins.mjs [--per 6] [--verbose]
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const SC = require('../tools/sortie-compose.js'), CG = require('../tools/citygen.js');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const PER = +arg('per', 6), VERBOSE = !!arg('verbose', false), PAGE = process.env.STARFALL_URL || 'http://localhost:8000/';
const seedOf = s => (SC.hash(s, 9090) * 4294967296) | 0;

/* the sorties: PER sweep seeds of each kind of join */
const want = { 'desert desert': [], 'desert air-new': [], 'desert air-campaign': [], 'forest air-new': [], 'forest air-campaign': [], 'forest forest': [] };
for (let s = 0; s < 3000 && Object.values(want).some(a => a.length < PER); s++) for (const kit of ['desert', 'forest']) {
  const C = SC.composeSortie(kit, seedOf(s), 0, 'plain', 'none', 'on', 'day'), p = C.gen.params; if (!C.cityArena || p.cityArenaSea || p.cityArenaYard) continue;
  let k = kit + ' ' + p.cityArenaStyle; if (p.cityArenaStyle === 'airfield') { const A = CG.generate(C.gen).arena; k = kit + ' air-' + (A.airW ? 'new' : 'campaign'); }
  if (want[k] && want[k].length < PER) want[k].push(s); }

const browser = await chromium.launch(), page = await browser.newPage({ viewport: { width: 400, height: 700 } });
await page.route(/workers\.dev/, r => r.abort()); await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
await page.goto(PAGE); await page.waitForFunction(() => typeof window.__sf === 'function', null, { polling: 100, timeout: 60000 });
await page.evaluate(s => window.__sf(s), 'window.SF = { peek: c => eval(c) }'); await page.evaluate(() => window.SF.peek('app.booting && finishBoot(), 0'));

let fails = 0, n = 0;
for (const [kind, seeds] of Object.entries(want)) for (const s of seeds) {
  const kit = kind.split(' ')[0], r = await page.evaluate(([kit, seed]) => window.SF.peek(`(() => { settings.diff = 1;
    startComposed(SortieCompose.composeSortie('${kit}', ${seed}, 0, 'plain', 'none', 'on', 'day')); const S = run.sortie, P = sortiePlan(S), A = P.arena, len = P.L / CH;
    const sc = (len - 3) * CH; world.scroll = sc; world.chunks = new Map(); world.chunkInfo = new Map(); world.chunkJobs = []; world.genP = -Math.floor((-sc + H) / CH) - 2;
    for (let i = 0; i < 4000; i++) { ensureChunks(); if (!world.chunkJobs.length && world.genP >= len + 2) break; }
    const lv = world.chunks.get(world.stageBaseP + len - 1), ar = world.chunks.get(world.stageBaseP + len); if (!lv || !ar) return { err: 'chunks not built' };
    const dl = lv.getContext('2d').getImageData(0, 0, W, CH).data, da = ar.getContext('2d').getImageData(0, 0, W, CH).data;
    const px = (d, ly, x) => { const o = (ly * W + x) * 4; return [d[o], d[o + 1], d[o + 2]]; }; /* (level chunk: ly is rows back from the level's end; arena chunk: ly CH - 1 - r is its row r) */
    const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
    const K = CityGen.K, kL = x => P.K[(P.L - 1) * W + x], kA = x => A.K[x], open = x => ![K.ROAD, K.RAIL, K.TRACK, K.STREET, K.WALK, K.BLDG, K.APRON, K.AROOF].includes(kL(x)) && ![K.ROAD, K.RAIL, K.TRACK, K.STREET, K.WALK, K.BLDG, K.APRON, K.AROOF].includes(kA(x));
    let sj = 0, sb = 0, nc = 0; for (let x = 0; x < W; x++) { if (!open(x)) continue; nc++; sj += dist(px(dl, 0, x), px(da, CH - 1, x)); sb += (dist(px(dl, 0, x), px(dl, 1, x)) + dist(px(dl, 1, x), px(dl, 2, x))) / 2; }
    const seam = nc ? { join: sj / nc, base: sb / nc, cols: nc } : null;
    const tracks = []; for (let x = 0; P.RM && x + 6 < W; x++) if (P.RM[(P.L - 1) * W + x] === 2 && P.RM[(P.L - 1) * W + x + 6] === 2) { const c = x + 3; let dj = 0, db = 0, m = 0;
      for (let r = 0; r < 5; r++) for (let dx = -6; dx <= 6; dx++) { const xx = c + dx; if (xx < 0 || xx >= W) continue; m++; dj += dist(px(da, CH - 1 - r, xx), px(dl, 4 - r, xx)); db += dist(px(dl, 4 - r, xx), px(dl, 9 - r, xx)); } /* (arena row r against the level's row 5 earlier in the same sleeper phase; the level's own: the same against 5 more back) */
      tracks.push({ x: c, join: dj / m, base: db / m }); }
    return { seam, tracks, style: S.compose.gen.params.cityArenaStyle, len }; })()`), [kit, seedOf(s)]);
  n++; if (r.err) { fails++; console.log('FAIL', kind, 'seed', s, r.err); continue; }
  const bad = [];
  if (r.seam && kind !== 'forest forest' ? r.seam.join > 1.6 * r.seam.base + 8 : r.seam && r.seam.join > 4 * r.seam.base + 20) bad.push(`a line across the ground at the join (change ${r.seam.join.toFixed(1)}, the level's own ${r.seam.base.toFixed(1)})`);
  for (const t of r.tracks) if (t.join > 2 * t.base + 12) bad.push(`the track at x ${t.x} changes at the join (${t.join.toFixed(1)}, the level's own ${t.base.toFixed(1)})`);
  if (bad.length) { fails++; console.log('FAIL', kind, 'seed', s, bad.join('; ')); }
  else if (VERBOSE) console.log('ok  ', kind, 'seed', s, 'seam', r.seam ? r.seam.join.toFixed(1) + ' / ' + r.seam.base.toFixed(1) : '-', 'tracks', r.tracks.map(t => t.x + ': ' + t.join.toFixed(1) + ' / ' + t.base.toFixed(1)).join(', ') || '-');
}
await browser.close();
console.log(fails ? `\n${fails} of ${n} joins failed` : `\nArena joins pass (${n}: ${Object.entries(want).map(([k, a]) => k + ' ' + a.length).join(', ')}).`);
process.exit(fails ? 1 : 0);
