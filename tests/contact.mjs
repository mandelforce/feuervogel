// Contact sheet for Enigma Run: one screenshot of each level at several points along it, for looking at the ground by eye.
// Needs Node and Playwright; serve the folder first (python3 -m http.server 8000).
//   node tests/contact.mjs OUTDIR                 all six levels, 8 points each
//   node tests/contact.mjs OUTDIR 6               only level 6
//   node tests/contact.mjs OUTDIR 6 12            level 6, 12 points
// Writes OUTDIR/level<N>-<k>.png (the playfield, 224 px wide, drawn 3x) and OUTDIR/sheet-level<N>.html (all of a level on one page).
// The frame is built as in docs/enigma-prompt.md: no enemies, chunks built to the end, the frame drawn once. A point is a share of the level's length.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const [out, only, pointsArg] = process.argv.slice(2);
if (!out) { console.error('usage: node tests/contact.mjs OUTDIR [level] [points]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const levels = only ? [+only] : [1, 2, 3, 4, 5, 6], points = +pointsArg || 8;
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
  const files = [];
  for (let k = 0; k < points; k++) {
    const frac = points === 1 ? 0.5 : k / (points - 1) * 0.97, name = `level${lv}-${k + 1}.png`;
    const url = await page.evaluate(([lv, frac]) => window.SF.peek(`(() => {
      settings.diff = 1; startEnigma(${lv});
      world.enemies = []; world.ebul = []; world.parts = []; world.decals = []; world.shots = []; world.items = []; critters.length = 0; props.length = 0;
      const sc = Math.round(${frac} * run.sortie.len * CH); world.scroll = sc; world.scrollV = world.scrollTarget = 0;
      world.chunks = new Map(); world.chunkInfo = new Map(); world.chunkJobs = []; world.genP = -Math.floor((-sc + H) / CH) - 2;
      for (let i = 0; i < 4000; i++) { ensureChunks(); if (!world.chunkJobs.length && world.genP >= Math.ceil((sc + 420) / CH)) break; }
      app.fade = null; app.msg = null; app.state = 'play'; if (player) { player.fly = 0; player.inv = 0; player.x = -60; }
      SF.draw = SF.draw || (() => { resetCtx(); render(); }); SF.draw();
      return cv.toDataURL('image/png'); })()`), [lv, frac]);
    writeFileSync(`${out}/${name}`, Buffer.from(url.split(',')[1], 'base64')); files.push(name);
  }
  writeFileSync(`${out}/sheet-level${lv}.html`, `<!doctype html><meta charset=utf-8><title>Level ${lv}</title><body style="margin:0;background:#222;color:#ddd;font:12px monospace"><div style="display:flex;flex-wrap:wrap;gap:6px;padding:6px">${files.map(f => `<figure style="margin:0"><img src="${f}" style="width:224px;image-rendering:pixelated"><figcaption>${f}</figcaption></figure>`).join('')}</div>`);
  console.log(`level ${lv}: ${files.length} frames in ${out}`);
}
await browser.close();
