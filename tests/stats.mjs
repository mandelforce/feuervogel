// Score table check: every enemy and object type in ENT has an explicit score in its stats entry (0 is fine, but it must be written down),
// so a type can never fall back to E()'s default of 100 points by accident. Prints the full table (--table).
// Needs Node and Playwright; serve the folder first (python3 -m http.server 8000).
import { chromium } from 'playwright';

const URL = process.env.STARFALL_URL || 'http://localhost:8000/';
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(URL);
await page.waitForFunction(() => typeof window.__sf === 'function', null, { timeout: 15000 });
const rows = await page.evaluate(() => window.__sf(`Object.keys(ENT).map(k => { const T = ENT[k], s = T.stats || {}; return { type: k, score: s.score, hp: s.hp !== undefined ? s.hp : s.fixedHp, counted: !T.uncounted, medals: T.medals || 0 }; })`));
await browser.close();

const missing = rows.filter(r => typeof r.score !== 'number');
if (process.argv.includes('--table')) {
  console.log('type'.padEnd(12) + 'score'.padStart(7) + 'hp'.padStart(8) + '  counted  medals');
  for (const r of rows.slice().sort((a, b) => (b.score || 0) - (a.score || 0))) console.log(r.type.padEnd(12) + String(r.score).padStart(7) + String(r.hp > 1e6 ? 'inf' : r.hp ?? '-').padStart(8) + '  ' + (r.counted ? 'yes' : 'no ').padEnd(7) + '  ' + r.medals);
}
for (const e of errors) console.error('page error: ' + e);
for (const r of missing) console.error(`FAIL ${r.type}: no explicit score in its stats entry`);
if (missing.length || errors.length) process.exit(1);
console.log(`ok   ${rows.length} enemy and object types all have an explicit score`);
