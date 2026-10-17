// Film of Enigma Run level 1's carrier start: the playfield at chosen frames after the level begins, with the bot flying (immortal).
// Needs Node and Playwright; serve the folder first (python3 -m http.server 8000).
//   node tests/carrier-shots.mjs OUTDIR                    frames 0, 40, 100, 140, 170, 230, 330, 480, 700, 1000
//   node tests/carrier-shots.mjs OUTDIR 0,60,120           chosen frames
// Writes OUTDIR/carrier-<frame>.png (224 px wide) and OUTDIR/sheet-carrier.html (all of them on one page).
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const [out, framesArg] = process.argv.slice(2);
if (!out) { console.error('usage: node tests/carrier-shots.mjs OUTDIR [f1,f2,...]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const frames = (framesArg || '0,40,100,140,170,230,330,480,700,1000').split(',').map(Number).sort((a, b) => a - b);
const PAGE = process.env.STARFALL_URL || 'http://localhost:8000/';
const harness = readFileSync(new URL('./harness.js', import.meta.url), 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 400, height: 700 } });
await page.route(/workers\.dev/, r => r.abort());
await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
page.on('pageerror', e => console.error('page error:', e.message));
await page.goto(PAGE);
await page.waitForFunction(() => typeof window.__sf === 'function', null, { polling: 100, timeout: 60000 });
await page.evaluate(s => window.__sf(s), harness);
await page.evaluate(() => { window.SF.peek('app.booting && finishBoot(), 0'); window.SF.setMode('immortal'); window.SF.peek('settings.diff = 1; startEnigma(1)'); });
const files = []; let at = 0;
for (const f of frames) {
  const url = await page.evaluate(n => { window.SF.run(n); for (let i = 0; i < 40; i++) window.SF.peek('ensureChunks()'); window.SF.draw(); return window.SF.peek('cv.toDataURL("image/png")'); }, f - at);
  at = f; const name = `carrier-${f}.png`; writeFileSync(`${out}/${name}`, Buffer.from(url.split(',')[1], 'base64')); files.push(name);
}
writeFileSync(`${out}/sheet-carrier.html`, `<!doctype html><meta charset=utf-8><title>Carrier start</title><body style="margin:0;background:#222;color:#ddd;font:12px monospace"><div style="display:flex;flex-wrap:wrap;gap:6px;padding:6px">${files.map(f => `<figure style="margin:0"><img src="${f}" style="width:336px;image-rendering:pixelated"><figcaption>${f}</figcaption></figure>`).join('')}</div>`);
console.log(`${files.length} frames in ${out}`);
await browser.close();
