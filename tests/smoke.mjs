// Smoke test: loads the game in a headless browser on desktop and phone sizes,
// checks the title screen draws, starts Stage 1 and plays a few seconds without errors.
// Also checks that every file the manifest and service worker point to exists.
import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'node:fs';

const URL = process.env.STARFALL_URL || 'http://localhost:8000/';
const failures = [];
const fail = msg => { failures.push(msg); console.error('FAIL ' + msg); };

// Files referenced by the manifest and the service worker must exist (a missing one breaks offline play).
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
for (const icon of manifest.icons) if (!existsSync(icon.src)) fail(`manifest icon missing: ${icon.src}`);
const sw = readFileSync('sw.js', 'utf8');
const app = (sw.match(/const APP = \[([^\]]*)\]/) || [])[1] || '';
for (const f of app.match(/'[^']+'/g) || []) { const p = f.slice(1, -1); if (p !== './' && !existsSync(p)) fail(`service worker file missing: ${p}`); }

const browser = await chromium.launch();
for (const [label, opts] of [
  ['desktop', { viewport: { width: 1000, height: 760 } }],
  ['phone', { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
]) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // Never touch the live leaderboard from CI.
  await page.route(/workers\.dev/, r => r.abort());

  await page.goto(URL);
  await page.waitForTimeout(2000);
  const state = await page.evaluate(() => document.body.dataset.state);
  if (state !== 'title') fail(`${label}: expected title screen, got "${state}"`);
  const colours = await page.evaluate(() => {
    const c = document.getElementById('game'), x = c.getContext('2d'), d = x.getImageData(0, 0, c.width, c.height).data, seen = new Set();
    for (let i = 0; i < d.length; i += 4 * 97) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    return seen.size;
  });
  if (colours < 20) fail(`${label}: title screen looks blank (${colours} colours)`);

  await page.keyboard.press('1');
  await page.waitForTimeout(5000);
  const playing = await page.evaluate(() => document.body.dataset.state);
  if (playing !== 'play') fail(`${label}: Stage 1 did not start (state "${playing}")`);
  const lastErr = await page.evaluate(() => localStorage.getItem('starfall-lasterror'));
  if (lastErr) fail(`${label}: game recorded an error: ${lastErr}`);
  for (const e of errors) fail(`${label}: page error: ${e}`);
  console.log(`${label}: title ok, ${colours} colours, stage 1 state "${playing}"`);
  await ctx.close();
}
await browser.close();

if (failures.length) { console.error(`\n${failures.length} problem(s) found.`); process.exit(1); }
console.log('\nSmoke test passed.');
