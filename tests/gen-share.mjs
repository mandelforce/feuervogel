#!/usr/bin/env node
// How much of a Daily Sortie the level generator makes (docs/daily-sortie-generator-audit.md, step 1). Measures only; changes nothing.
// Part 1 (Node): over --seeds composed sorties per kit, the level's chunks by who builds them (the generator's plan, the legacy sea tail,
// the temperate kit's legacy old land). The boss arena is not in a sortie's length, so part 2 measures it.
// Part 2 (browser): the human bot (SF.human(8, 15), immortal, Veteran) flies --per sorties per kit. Every 10 steps the chunk at the middle of
// the screen is put in a class (generator plan, generator arena, legacy tail, legacy old land, legacy arena, other); every ground enemy is put
// in a class when it first appears: on a generator slot (its place came from plan.slots), on generator ground but not on a slot (the game chose
// the place), or on legacy ground; with whether an encounter or the boss fight was running.
// Serve the folder (python3 -m http.server 8000), then: node tests/gen-share.mjs [--per 10 | --only 2,3,9] [--seeds 1000] [--kit desert] [--conc 4] [--diff 1] [--save FILE]
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const SC = require('../tools/sortie-compose.js');

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const PAGE = process.env.STARFALL_URL || 'http://localhost:8000/';
const PER = +arg('per', 10), SEEDS = +arg('seeds', 1000), KIT = arg('kit', null), CONC = +arg('conc', 4), DIFF = +arg('diff', 1), SAVE = arg('save', null);
const KITS = SC.KIT_ORDER.filter(k => !KIT || k === KIT);
const TAIL = new Set(['coast_down', 'open_sea']);
const pct = (a, b) => b ? (100 * a / b).toFixed(1) + ' %' : '-';
const seedOf = s => (SC.hash(s, 9090) * 4294967296) | 0; /* (the flight gate's sweep seeds) */

/* ---------- part 1: the composed lists ---------- */
const stat = {};
for (const kit of KITS) {
  const t = stat[kit] = { n: 0, len: 0, plan: 0, tail: 0, old: 0, seaDays: 0, oldDays: 0, bosses: {} };
  for (let s = 0; s < SEEDS; s++) {
    const C = SC.composeSortie(kit, seedOf(s), 0); t.n++; t.len += C.len; let tl = 0, ol = 0;
    for (const g of C.segs) { if (!g.legacy) t.plan += g.n; else if (TAIL.has(g.t)) { t.tail += g.n; tl += g.n; } else { t.old += g.n; ol += g.n; } }
    if (tl) t.seaDays++; if (ol) t.oldDays++;
    const b = C.bossVar ? C.bossVar.kind : 'none'; t.bosses[b] = (t.bosses[b] || 0) + 1;
  }
}
console.log('Part 1: the composed level before the boss (' + SEEDS + ' seeds per kit; chunks)');
console.log('kit        mean len  generator plan  legacy sea tail  legacy old land  days with tail  days with old land');
for (const kit of KITS) { const t = stat[kit]; console.log(kit.padEnd(10), (t.len / t.n).toFixed(1).padStart(8), pct(t.plan, t.len).padStart(15), pct(t.tail, t.len).padStart(16), pct(t.old, t.len).padStart(16), pct(t.seaDays, t.n).padStart(15), pct(t.oldDays, t.n).padStart(19)); }

/* ---------- part 2: flights (in the game's scope, a string: block comments only) ---------- */
const FLY = `(function (spec, diff) {
  if (app.booting) finishBoot();
  if (app.cont > 0) app.cont = 0;
  SF.setMode('immortal'); SF.start(diff, 1);
  const C = SortieCompose.composeSortie(spec.kit, spec.seed, 0); startComposed(C); /* (the composer's own list: the game's copy of the segments has no legacy flag) */
  SF.human(8, 15);
  const S = run.sortie, L0 = S.level, P0 = world.stageBaseP, seen = new WeakSet();
  const fr = {}, fb = {}, en = {}, types = {};
  let end = 'cap', bossF = -1, deadF = -1, f = 0, f0 = gf, slotsUsed = 0;
  const cls = function (c) {
    const P = S.plan || ((S.gen || S.isles) && sortiePlan(S)); const planned = !!P && c >= S.planC0 && c < S.planC1;
    if (c < 0) return 'before';
    if (c >= S.len) return planned ? 'gen arena' : 'legacy arena';
    const g = C.segs.find(function (q) { return c >= q.start && c < q.start + q.n; });
    if (g && g.legacy) return planned ? 'gen arena' : g.t === 'coast_down' || g.t === 'open_sea' ? 'legacy tail' : 'legacy old land'; /* (a sea ending's generated arena covers the level's sea tail) */
    return planned ? 'gen plan' : 'legacy other';
  };
  const chunkOfWy = function (wy) { return Math.ceil(-wy / CH) - P0; };
  const add = function (o, k, n) { o[k] = (o[k] || 0) + (n || 1); };
  for (let step = 0; step < 60 * 60 * 25 / 10; step++) {
    const r = SF.run(10); if (r !== 'ok') { end = r; break; }
    if (!run.sortie || run.sortie.level !== L0) { end = 'next'; break; }
    f = gf - f0;
    const boss = world.enemies.find(function (e) { return e.type === 'boss'; });
    if (boss && bossF < 0) bossF = f;
    if (bossF >= 0 && deadF < 0 && boss && boss.dying) deadF = f;
    if (deadF >= 0) { end = 'boss dead'; break; }
    if (bossF >= 0 && f - bossF > 600 * 60) { end = 'boss-timeout'; break; }
    const k = cls(chunkOfWy(H / 2 - world.scroll)); add(bossF >= 0 ? fb : fr, k, 10);
    const P = S.plan;
    for (const e of world.enemies) { if (seen.has(e)) continue; seen.add(e); if (!e.ground || e.type === 'boss') continue;
      let on = 'other'; /* (other: before chunk 0, the carrier's start) */
      const ck = cls(chunkOfWy(e.wy));
      if (P && P.slots && ck.indexOf('gen') === 0) { on = 'gen ground, game place'; for (const sl of P.slots) { if (Math.abs(sl.x - e.wx) <= 14 && Math.abs(S.planY0 - sl.y - e.wy) <= 14) { on = 'gen slot'; break; } } if (P.arena && on !== 'gen slot') for (const sl of P.arena.slots) { if (Math.abs(sl.x - e.wx) <= 14 && Math.abs(S.planY0 - (sl.y + P.arena.y0) - e.wy) <= 14) { on = 'gen slot'; break; } } } /* (the arena's slots are in its own rows) */
      else if (ck.indexOf('legacy') === 0) on = 'legacy ground';
      const when = bossF >= 0 ? 'boss' : world.enc ? 'encounter' : 'director';
      add(en, on + ' | ' + when); add(types, on + ' | ' + e.type); }
  }
  if (S.slotUsed) slotsUsed = S.slotUsed.size;
  return { kit: spec.kit, seed: spec.seed, boss: S.bossVar ? S.bossVar.kind + ':' + S.bossVar.variant : 'none', len: S.len, end: end, frames: f, bossIn: bossF, bossSec: bossF >= 0 && deadF >= 0 ? (deadF - bossF) / 60 : null,
    pre: fr, fight: fb, en: en, types: types, slots: S.plan && S.plan.slots ? S.plan.slots.length : 0, slotsUsed: slotsUsed, errs: SF.R.errs.slice(0, 2) };
})`;

const harness = readFileSync(new URL('./harness.js', import.meta.url), 'utf8');
const browser = await chromium.launch();
async function newPage(rseed) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 760 } }); page.errs = [];
  page.on('pageerror', e => page.errs.push(String(e && e.message || e).slice(0, 200)));
  await page.route(/workers\.dev/, r => r.abort());
  await page.addInitScript(s => { let a = s; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; window.requestAnimationFrame = () => 0; }, rseed);
  await page.goto(PAGE);
  await page.waitForFunction(() => typeof window.__sf === 'function', null, { polling: 100, timeout: 60000 });
  await page.evaluate(src => window.__sf(src), harness);
  return page;
}
const ONLY = arg('only', null) ? String(arg('only')).split(',').map(Number) : null; /* --only 2,3,9: these sweep seeds instead of the first --per */
const jobs = []; for (const kit of KITS) for (const s of ONLY || Array.from({ length: PER }, (_, i) => i)) jobs.push({ kit, seed: seedOf(s) });
const out = [], pages = await Promise.all(Array.from({ length: CONC }, (_, i) => newPage(11 + i)));
let next = 0;
await Promise.all(pages.map(async page => { for (let j; (j = jobs[next++]);) {
  const n0 = page.errs.length; let r;
  try { r = await page.evaluate(([code, a]) => window.SF.peek(code + '(' + a.join(',') + ')'), [FLY, [JSON.stringify(j), DIFF]]); } catch (e) { r = { kit: j.kit, seed: j.seed, end: 'threw', errs: [String(e.message).slice(0, 200)] }; }
  r.pageErrs = page.errs.slice(n0); out.push(r); process.stderr.write('.'); } }));
process.stderr.write('\n'); await browser.close();
if (SAVE) writeFileSync(SAVE, JSON.stringify(out, null, 1));

/* ---------- report ---------- */
const sum = (rs, f) => { const o = {}; for (const r of rs) for (const [k, v] of Object.entries(r[f] || {})) o[k] = (o[k] || 0) + v; return o; };
const show = (title, o) => { const tot = Object.values(o).reduce((a, b) => a + b, 0); console.log('  ' + title + ' (' + tot + ')'); for (const [k, v] of Object.entries(o).sort((a, b) => b[1] - a[1])) console.log('    ' + k.padEnd(44) + String(v).padStart(7) + pct(v, tot).padStart(10)); };
console.log('\nPart 2: flights (' + (ONLY ? ONLY.length : PER) + ' per kit, difficulty ' + DIFF + ', the human bot, immortal)');
for (const kit of KITS) {
  const rs = out.filter(r => r.kit === kit); console.log('\n' + kit + ': ' + rs.map(r => r.end + (r.boss ? ' ' + r.boss : '') + (r.errs && r.errs.length || r.pageErrs && r.pageErrs.length ? ' ERR' : '')).join(', '));
  show('screen time before the boss, by ground (frames)', sum(rs, 'pre'));
  show('screen time in the boss fight, by ground (frames)', sum(rs, 'fight'));
  show('ground enemies, by where they stand | when', sum(rs, 'en'));
  const ty = sum(rs, 'types'), top = Object.fromEntries(Object.entries(ty).filter(([k]) => !k.startsWith('gen slot')).sort((a, b) => b[1] - a[1]).slice(0, 12));
  show('ground enemies not on a slot, by type (top 12)', top);
  const sl = rs.reduce((a, r) => a + (r.slots || 0), 0), su = rs.reduce((a, r) => a + (r.slotsUsed || 0), 0); console.log('  plan slots ' + sl + ', taken by the director ' + su + ' (' + pct(su, sl) + ')');
}
const all = out; console.log('\nAll kits');
show('screen time before the boss', sum(all, 'pre')); show('screen time in the boss fight', sum(all, 'fight')); show('ground enemies', sum(all, 'en'));
