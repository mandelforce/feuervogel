// Balance report: times every boss with every weapon and plays a full campaign per difficulty, using tests/harness.js.
// Needs Node and Playwright:  npm install --no-save playwright@1 && npx playwright install chromium
// Then serve the folder (python3 -m http.server 8000) and run:  node tests/balance.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const PAGE = process.env.STARFALL_URL || 'http://localhost:8000/';
const WEAPONS = { S: 'Scatter', L: 'Lance', H: 'Seekers', A: 'Arc' };
const DIFFS = (process.env.DIFFS || '0,1,2').split(',').map(Number);
const harness = readFileSync(new URL('./harness.js', import.meta.url), 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });
page.on('pageerror', e => console.error('page error:', e.message));
await page.route(/workers\.dev/, r => r.abort());
await page.goto(PAGE);
await page.waitForFunction(() => typeof window.__sf === 'function');
await page.evaluate(src => window.__sf(src), harness);

console.log('Boss kill time in seconds, Normal, weapon level 4 (bot, ignores pickups during bosses)\n');
console.log('Stage  ' + Object.values(WEAPONS).map(w => w.padStart(8)).join(''));
for (let st = 1; st <= 6; st++) {
  const row = [];
  for (const w of Object.keys(WEAPONS)) row.push(await page.evaluate(([st, w]) => SF.bossTime(1, st, w), [st, w]));
  console.log(String(st).padEnd(7) + row.map(v => String(v).padStart(8)).join(''));
}

for (const diff of DIFFS) {
  console.log(`\nCampaign, ${['Easy', 'Normal', 'Hard'][diff]}`);
  const rows = await page.evaluate(d => SF.campaign(d), diff);
  console.table(rows);
}
const errs = await page.evaluate(() => SF.R.errs);
if (errs.length) { console.error('\nGame errors:', errs); process.exitCode = 1; }
await browser.close();
