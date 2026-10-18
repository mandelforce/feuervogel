// Screenshot of the city lab (tools/citylab.html) and its raw town map, for reviewing generator changes by eye. Serve the folder first.
//   node tests/citylab-shot.mjs OUTDIR [seed] [preset]     writes OUTDIR/lab.png and OUTDIR/map.png (the town at 1x, north up)
import { chromium } from 'playwright';
const out = process.argv[2], seed = process.argv[3] || '5', preset = process.argv[4];
const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('http://localhost:8000/tools/citylab.html'); await page.waitForTimeout(1500);
if (preset) { await page.evaluate(p => { const el = document.getElementById('preset'); el.value = p; el.dispatchEvent(new Event('change')); }, preset); await page.waitForTimeout(800); }
await page.evaluate(s => { document.getElementById('seed').value = s; document.getElementById('seed').dispatchEvent(new Event('change')); }, seed);
await page.waitForTimeout(800);
await page.screenshot({ path: out + '/lab.png' });
// the raw map at 1x, cropped bands
const data = await page.evaluate(() => document.getElementById('map').toDataURL());
const fs = await import('node:fs'); fs.writeFileSync(out + '/map.png', Buffer.from(data.split(',')[1], 'base64'));
console.log('errors:', errs.length ? errs : 'none');
await b.close();
