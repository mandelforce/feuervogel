// Contact sheet for Enigma Run: one screenshot of each level at several points along it, for looking at the ground by eye.
// Needs Node and Playwright; serve the folder first (python3 -m http.server 8000).
//   node tests/contact.mjs OUTDIR                 all six levels, 8 points each
//   node tests/contact.mjs OUTDIR 6               only level 6
//   node tests/contact.mjs OUTDIR 6 12            level 6, 12 points
//   node tests/contact.mjs OUTDIR 6 c2,66         level 6 with the screen's bottom at chunks 2 and 66 (for looking at seams)
//   node tests/contact.mjs OUTDIR daily:2026-11-15 16        that day's Daily Sortie, 16 points (daily:DATE:KIT:SUB:TWIST:DIALS:TOD:SEA forces a kit, a sub-seed, a twist, the ground dials (on or off), the light (day, morning or sunset) and an archipelago day (on or off); empty fields keep the date's; the night's dark is drawn full)
// Writes OUTDIR/level<N>-<k>.png (the playfield, 224 px wide, drawn 3x) and OUTDIR/sheet-level<N>.html (all of a level on one page);
// for a Daily Sortie daily-<date>-<kit>-<k>.png, sheet-daily-<date>-<kit>.html and daily-<date>-<kit>.json (the segment under each frame).
// The frame is built as in docs/enigma-prompt.md: no enemies, chunks built to the end, the frame drawn once. A point is a share of the level's length.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const [out, only, pointsArg] = process.argv.slice(2);
if (!out) { console.error('usage: node tests/contact.mjs OUTDIR [level] [points]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const levels = only ? [/^daily:/.test(only) ? only : +only] : [1, 2, 3, 4, 5, 6], at = pointsArg && pointsArg[0] === 'c' ? pointsArg.slice(1).split(',').map(Number) : null, points = at ? at.length : +pointsArg || 8;
const PAGE = process.env.STARFALL_URL || 'http://localhost:8000/';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 400, height: 700 } });
await page.route(/workers\.dev/, r => r.abort());
await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
await page.goto(PAGE);
await page.waitForFunction(() => typeof window.__sf === 'function', null, { polling: 100, timeout: 60000 });
await page.evaluate(s => window.__sf(s), 'window.SF = { peek: c => eval(c) }');
await page.evaluate(() => window.SF.peek('app.booting && finishBoot(), 0'));

for (const lv of levels) {
  const files = [], caps = [], daily = typeof lv === 'string' ? lv.split(':') : null; let tag = 'level' + lv;
  const start = daily ? `startDaily('${daily[1]}', ${daily[2] ? "'" + daily[2] + "'" : 'undefined'}, ${daily[3] !== undefined && daily[3] !== '' ? +daily[3] : 'undefined'}, undefined, ${daily[4] ? "'" + daily[4] + "'" : 'undefined'}, ${daily[5] ? "'" + daily[5] + "'" : 'undefined'}, ${daily[6] ? "'" + daily[6] + "'" : 'undefined'}, ${daily[7] ? "'" + daily[7] + "'" : 'undefined'})` : `startEnigma(${lv})`;
  for (let k = 0; k < points; k++) {
    const frac = at ? -at[k] - 1e-9 : points === 1 ? 0.5 : k / (points - 1) * 0.97, 
    r = await page.evaluate(([start, frac]) => window.SF.peek(`(() => {
      settings.diff = 1; ${start};
      world.enemies = []; world.ebul = []; world.parts = []; world.decals = []; world.shots = []; world.items = []; critters.length = 0; props.length = 0; world.carrier = null; /* the ground only: no carrier scene */
      const sc = Math.round((${frac}) < 0 ? -(${frac}) * CH : (${frac}) * run.sortie.len * CH); /* a negative share is a chunk number */ world.scroll = sc; world.scrollV = world.scrollTarget = 0;
      world.chunks = new Map(); world.chunkInfo = new Map(); world.chunkJobs = []; world.genP = -Math.floor((-sc + H) / CH) - 2;
      for (let i = 0; i < 4000; i++) { ensureChunks(); if (!world.chunkJobs.length && world.genP >= Math.ceil((sc + 420) / CH)) break; }
      if (twistOf() === 'night') world.nightF = 1; app.fade = null; app.msg = null; app.state = 'play'; if (player) { player.fly = 0; player.inv = 0; player.x = -60; }
      SF.draw = SF.draw || (() => { resetCtx(); render(); }); SF.draw();
      const S = run.sortie, c = (sc + H / 2) / CH, g = S.segs.find(q => c >= q.start && c < q.start + q.n);
      return { url: cv.toDataURL('image/png'), seg: g ? g.t : c >= S.len ? 'boss ground' : '', chunk: Math.round(c), kit: S.daily ? S.daily.kit : '', len: S.len }; })()`), [start, frac]);
    if (daily) tag = `daily-${daily[1]}-${r.kit}`; const name = `${tag}-${k + 1}.png`;
    writeFileSync(`${out}/${name}`, Buffer.from(r.url.split(',')[1], 'base64')); files.push(name); caps.push({ file: name, chunk: r.chunk, seg: r.seg, len: r.len });
  }
  if (daily) writeFileSync(`${out}/${tag}.json`, JSON.stringify(caps, null, 1));
  writeFileSync(`${out}/sheet-${tag}.html`, `<!doctype html><meta charset=utf-8><title>${tag}</title><body style="margin:0;background:#222;color:#ddd;font:12px monospace"><div style="display:flex;flex-wrap:wrap;gap:6px;padding:6px">${files.map((f, i) => `<figure style="margin:0"><img src="${f}" style="width:224px;image-rendering:pixelated"><figcaption>${daily ? 'chunk ' + caps[i].chunk + ': ' + caps[i].seg : f}</figcaption></figure>`).join('')}</div>`);
  console.log(`${tag}: ${files.length} frames in ${out}`);
}
await browser.close();
