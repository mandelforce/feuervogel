// Mountain stretches (tools/citygen.js mountainStretches; a 'mountain' middle template in every land kit, 'main_mountain' on the temperate mainland). Node only.
//   node tests/mountains.mjs            8 mountain days per kit, each built as a cliff and as an incline (the segment's mtn), and the composer's share
//   node tests/mountains.mjs --days 20  more days per kit;  --verbose lists every check
// What it holds the generator to (the rules in the comment above mountainStretches):
// - every mountain day of the composer builds its stretch, with no problem reported by the stretch itself (its own grade, flak and route checks);
// - the rail: a rail pixel in every row of the stretch where the host has a rail, its line graded at MT_RAIL_G at most (with the rounding's slack);
// - the main road: one point per row on its street through the stretch, at most 2.5 px aside per row (convoys follow it), road pixels under it, joining the
//   host's road at both ends, graded at MT_ROAD_G at most, never on rock;
// - flak: slots of kind 'flak' inside the stretch, on level ground (the site's plane), off rock, 20 px apart at least;
// - the seams: the relief is the plain at both ends, and no rock in the seam rows;
// - nothing of the host's left standing in it: no building pixel of the host's in the stretch's inner rows;
// - the same input gives the same plan and the same colours;
// - the composer: about MOUNTAIN_SHARE of the days take one (never two), always as a middle stretch.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const CG = require('../tools/citygen.js'), SC = require('../tools/sortie-compose.js');
const VERBOSE = process.argv.includes('--verbose'), DAYS = process.argv.includes('--days') ? +process.argv[process.argv.indexOf('--days') + 1] : 8;
let passed = 0, failed = 0; const ok = (c, m) => { if (c) { passed++; if (VERBOSE) console.log('  ok   ' + m); } else { failed++; console.log('  FAIL ' + m); } };
const MT = CG.MT, K = CG.K;
const sig = (p, M) => { let h = 2166136261 >>> 0; const mix = v => { h = Math.imul(h ^ (v | 0), 16777619) >>> 0; }; for (let i = 0; i < p.K.length; i += 5) mix(p.K[i]); for (let i = 0; i < M.rgb.length; i += 7) mix(M.rgb[i]); for (const s of p.slots) mix(s.x * 977 + s.y); return h; };

// 1. the composer
for (const kit of SC.KIT_ORDER) { let n = 0, two = 0, notMid = 0; const N = 400, K0 = SC.KITS[kit], mids = new Set(Object.keys(K0.middle).concat(K0.main ? Object.keys(K0.main.middle) : []));
  for (let s = 0; s < N; s++) { const C = SC.composeSortie(kit, s, 0), m = C.segs.filter(g => g.t === 'mountain' || g.t === 'main_mountain'); if (m.length) n++; if (m.length > 1) two++; if (m.some(g => !mids.has(g.t))) notMid++; }
  ok(n / N > 0.15 && n / N < 0.4, `${kit}: ${n} of ${N} days have a mountain stretch (about a third of the days that are not archipelago days)`); ok(!two, `${kit}: never two mountain stretches in a day`); ok(!notMid, `${kit}: a mountain stretch is always a middle stretch`); }

// 2. the stretches
const ms = [];
for (const kit of SC.KIT_ORDER) { let days = 0; const kinds = {};
  for (let s = 0; days < DAYS && s < 4000; s++) { const C = SC.composeSortie(kit, s, 0), gi = C.gen.params.segs.findIndex(g => g.t === 'mountain' || g.t === 'main_mountain'); if (gi < 0) continue; days++;
    for (const kind of ['cliff', 'incline']) { const gen = JSON.parse(JSON.stringify(C.gen)); gen.params.segs[gi].mtn = kind; const tag = `${kit} seed ${s} ${kind}`;
      const t = Date.now(); let p; try { p = CG.generate(gen); } catch (e) { ok(false, `${tag}: builds (${e.message})`); continue; } ms.push(Date.now() - t);
      const M = (p.mtn || [])[0]; if (!ok(!!M && M.kind === kind, `${tag}: the stretch is built, as asked`) && !M) continue; kinds[kind] = (kinds[kind] || 0) + 1;
      ok(!M.issues.length, `${tag}: the stretch reports no problem` + (M.issues.length ? ' (' + M.issues.join('; ') + ')' : ''));
      const { W } = p, H = M.H, py = ys => M.y1 - 1 - ys, hg = (x, ys) => M.hf[Math.min(H - 1, Math.max(0, Math.round(ys))) * W + Math.min(W - 1, Math.max(0, Math.round(x)))];
      // the rail
      if (M.rail) { let gap = 0, worst = 0; for (let ys = 0; ys < H; ys++) { let n = 0; for (let x = 0; x < W; x++) { const k = p.K[py(ys) * W + x]; if (k === K.RAIL || k === K.RBRIDGE || (p.RM && p.RM[py(ys) * W + x] === 2)) n++; } if (!n) gap++; if (ys >= 8) worst = Math.max(worst, Math.abs(hg(M.rail[ys], ys) - hg(M.rail[ys - 8], ys - 8)) / 8); }
        ok(!gap, `${tag}: the rail runs through every row (${gap} without)`); ok(worst <= MT.RAIL_G * 1.2, `${tag}: the rail climbs ${worst.toFixed(2)}, at most ${MT.RAIL_G}`); }
      // the main road
      if (M.road) { const st = p.streets.filter(q => q.cls === 'arterial' && q.pts.some(r => r[1] >= M.y0 && r[1] < M.y1)), pts = st.flatMap(q => q.pts.filter(r => r[1] >= M.y0 && r[1] < M.y1)).sort((a, b) => a[1] - b[1]);
        ok(st.length === 1 && pts.length === H && pts.every((r, k) => r[1] === M.y0 + k), `${tag}: one main-road point per row on one street (${pts.length} of ${H})`);
        let jump = 0, offRoad = 0, rock = 0, worst = 0; for (let k = 1; k < pts.length; k++) jump = Math.max(jump, Math.abs(pts[k][0] - pts[k - 1][0]));
        for (let ys = 0; ys < H; ys++) { const x = Math.round(M.road[ys]), i = py(ys) * W + x; if (p.K[i] !== K.ROAD) offRoad++; if (M.rock[ys * W + x]) rock++; if (ys >= 8) worst = Math.max(worst, Math.abs(hg(M.road[ys], ys) - hg(M.road[ys - 8], ys - 8)) / Math.hypot(8, M.road[ys] - M.road[ys - 8])); }
        ok(jump <= 2.5, `${tag}: the road steps at most 2.5 px aside a row (${jump.toFixed(2)})`); ok(!offRoad, `${tag}: road pixels under the whole line (${offRoad} rows without)`); ok(!rock, `${tag}: the road is never on rock (${rock} rows)`);
        ok(worst <= MT.ROAD_G * 1.2, `${tag}: the road climbs ${worst.toFixed(2)}, at most ${MT.ROAD_G}`);
        const below = p.streets.flatMap(q => q.cls === 'arterial' ? q.pts.filter(r => r[1] === M.y0 - 1) : []), above = p.streets.flatMap(q => q.cls === 'arterial' ? q.pts.filter(r => r[1] === M.y1) : []);
        ok((!below.length || below.some(r => Math.abs(r[0] - pts[0][0]) <= 2.5)) && (!above.length || above.some(r => Math.abs(r[0] - pts[pts.length - 1][0]) <= 2.5)), `${tag}: the road joins the host's road at both ends`); }
      // flak
      const fl = p.slots.filter(q => q.kind === 'flak' && q.y >= M.y0 && q.y < M.y1); ok(fl.length >= 1 && fl.every(q => q.on === 'mountain'), `${tag}: flak slots in the stretch (${fl.length})`);
      let badSite = 0, close = 0; for (const q of fl) { const ys = M.y1 - 1 - q.y, tilt = Math.hypot((hg(q.x + 5, ys) - hg(q.x - 5, ys)) / 10, (hg(q.x, ys + 5) - hg(q.x, ys - 5)) / 10); if (tilt > 0.85 || M.rock[ys * W + q.x]) badSite++; for (const o of fl) if (o !== q && Math.hypot(o.x - q.x, o.y - q.y) < 20) close++; }
      ok(!badSite, `${tag}: every gun on level ground, off rock (${badSite} not)`); ok(!close, `${tag}: guns 20 px apart at least`);
      // the seams
      let edge = 0, seamRock = 0; for (let x = 0; x < W; x++) { for (const ys of [0, 1, 2, H - 3, H - 2, H - 1]) edge = Math.max(edge, Math.abs(M.hf[ys * W + x])); for (let ys = 0; ys < MT.SEAM; ys++) for (const r of [ys, H - 1 - ys]) if (M.rock[r * W + x]) seamRock++; } /* (the stretch's own rock: the seam rows keep the host's ground, a valley's walls included) */
      ok(edge <= 2, `${tag}: the relief is the plain at both ends (${edge.toFixed(1)})`); ok(!seamRock, `${tag}: no rock in the seam rows (${seamRock} px)`);
      // nothing of the host's left standing
      let bld = 0; for (let ys = MT.SEAM; ys < H - MT.SEAM; ys++) for (let x = 0; x < W; x++) { const i = py(ys) * W + x; if (p.K[i] === K.BLDG) bld++; } ok(!bld, `${tag}: no building of the host's in the stretch (${bld} px)`);
      // the same input, the same plan
      if (s % 3 === 0) { const q = CG.generate(JSON.parse(JSON.stringify(gen))); ok(sig(p, M) === sig(q, q.mtn[0]), `${tag}: the same input gives the same plan and colours`); }
    } }
  ok(days === DAYS, `${kit}: ${days} mountain days built as both kinds`); }
ms.sort((a, b) => a - b); console.log(`     plan time with a mountain stretch: median ${ms[ms.length >> 1]} ms, p95 ${ms[Math.floor(ms.length * 0.95)]} ms (${ms.length} plans)`);
console.log(`\n${failed ? failed + ' check(s) failed, ' : ''}${passed} passed`); if (failed) process.exit(1);
