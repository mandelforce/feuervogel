// Layout test: loads the game at many phone, tablet and desktop sizes and checks the playfield
// fills the screen, is centred, stays clear of the notch and home bar, and never scrolls.
// Safe-area insets are simulated through the --sat / --sab CSS variables (headless browsers report 0).
// Serve the folder first (python3 -m http.server 8000), then:
//   node tests/layout.mjs                 check every device
//   node tests/layout.mjs --shots out/    also save a screenshot per device into out/
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.STARFALL_URL || 'http://localhost:8000/';
const shotsAt = process.argv.indexOf('--shots'), shots = shotsAt > 0 ? process.argv[shotsAt + 1] : '';
if (shots) mkdirSync(shots, { recursive: true });

// [label, width, height, top inset, bottom inset, touch]. Insets are what iOS reports in Home Screen (standalone) mode.
const DEVICES = [
  ['iPhone SE', 375, 667, 20, 0, true],
  ['iPhone 13 mini', 375, 812, 50, 34, true],
  ['iPhone 15', 393, 852, 59, 34, true],
  ['iPhone 15 Pro Max', 430, 932, 59, 34, true],
  ['iPhone 15 Safari tab', 393, 659, 0, 0, true],
  ['Pixel 7', 412, 915, 24, 0, true],
  ['Galaxy S (small)', 360, 800, 24, 0, true],
  ['short Android', 360, 640, 0, 0, true],
  ['iPad portrait', 820, 1180, 24, 20, true],
  ['desktop', 1440, 900, 0, 0, false],
  ['small desktop', 800, 600, 0, 0, false],
];
const FRAME = 6; // the canvas frame drawn by box-shadow
const TOL = 2;

const failures = [];
const browser = await chromium.launch();
for (const [label, w, h, sat, sab, touch] of DEVICES) {
  const fail = msg => { failures.push(`${label}: ${msg}`); console.error(`FAIL ${label}: ${msg}`); };
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: touch, hasTouch: touch, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(/workers\.dev/, r => r.abort());
  await page.addInitScript(([t, b]) => {
    const set = () => { document.documentElement.style.setProperty('--sat', t + 'px'); document.documentElement.style.setProperty('--sab', b + 'px'); };
    // must land before the game script sizes the playfield, so set it the moment <html> exists
    if (document.documentElement) set();
    else new MutationObserver((_, o) => { if (document.documentElement) { set(); o.disconnect(); } }).observe(document, { childList: true });
  }, [sat, sab]);
  await page.goto(URL);
  await page.waitForTimeout(3500);

  const m = await page.evaluate(() => {
    const r = document.getElementById('game').getBoundingClientRect(), d = document.documentElement, hint = document.getElementById('hint');
    // on desktop the keyboard hint sits under the canvas and is centred together with it
    const hb = hint && getComputedStyle(hint).display !== 'none' ? hint.getBoundingClientRect().bottom : 0;
    return { x: r.x, y: r.y, w: r.width, h: r.height, hb, vw: innerWidth, vh: innerHeight, sw: d.scrollWidth, sh: d.scrollHeight };
  });
  // the area the playfield may use: below the status bar, above part of the home bar, inside the side margin
  const top = sat + 4, bottom = h - (sab * 0.4 + 6), left = 8, right = w - 8;
  if (m.sw > m.vw || m.sh > m.vh) fail(`page scrolls (${m.sw}x${m.sh} in ${m.vw}x${m.vh})`);
  if (m.x - FRAME < left - TOL || m.x + m.w + FRAME > right + TOL) fail(`canvas outside the side margins (x ${m.x}, width ${m.w})`);
  if (m.y - FRAME < top - TOL) fail(`canvas reaches under the status bar (top ${m.y}, inset ${sat})`);
  if (m.y + m.h + FRAME > bottom + TOL) fail(`canvas reaches into the home bar (bottom ${m.y + m.h}, inset ${sab})`);
  if (Math.abs(m.x + m.w / 2 - w / 2) > TOL) fail(`not centred horizontally (centre ${m.x + m.w / 2} of ${w})`);
  // with the hint shown, flexbox centres canvas + hint without the frame, so the frame sits 6px into the top gap
  const gapT = m.y - (m.hb ? 0 : FRAME) - top, gapB = bottom - Math.max(m.y + m.h + FRAME, m.hb), gapL = m.x - FRAME - left;
  if (Math.abs(gapT - gapB) > TOL) fail(`not centred vertically (gap above ${gapT.toFixed(1)}, below ${gapB.toFixed(1)})`);
  // a portrait phone should be filled edge to edge in one direction (the playfield shape is capped, so not always both)
  if (touch && w < 600 && Math.min(gapL, gapT) > 4) fail(`does not fill the screen (gaps: side ${gapL.toFixed(1)}, top ${gapT.toFixed(1)})`);

  if (touch) {
    // Stage 1 on Normal, then the touch controls must sit on screen and clear of the home bar
    await page.keyboard.press('1');
    await page.click('#diffAsk [data-d="1"]');
    await page.waitForTimeout(4000);
    const state = await page.evaluate(() => document.body.dataset.state);
    if (state !== 'play') fail(`Stage 1 did not start (state "${state}")`);
    for (const id of ['bombBtn', 'menuBtn', 'pauseBtn']) {
      const b = await page.evaluate(id => { const e = document.getElementById(id); if (!e || getComputedStyle(e).display === 'none') return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, id);
      if (!b) continue;
      if (b.x < 0 || b.y < sat || b.x + b.w > w || b.y + b.h > h - sab) fail(`#${id} is off screen or under the notch/home bar (${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}x${Math.round(b.h)})`);
    }
  }
  if (shots) await page.screenshot({ path: `${shots}/${label.replace(/\W+/g, '-')}.png` });

  // turning the device and back must leave the playfield on screen
  await page.setViewportSize({ width: h, height: w });
  await page.waitForTimeout(300);
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => { const r = document.getElementById('game').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  if (Math.abs(after.w - m.w) > TOL || Math.abs(after.h - m.h) > TOL) fail(`size changed after rotating and back (${m.w}x${m.h} -> ${after.w}x${after.h})`);

  for (const e of errors) fail(`page error: ${e}`);
  console.log(`${label.padEnd(22)} ${w}x${h}  canvas ${Math.round(m.w)}x${Math.round(m.h)} at ${Math.round(m.x)},${Math.round(m.y)}  gaps side ${gapL.toFixed(0)} top ${gapT.toFixed(0)} bottom ${gapB.toFixed(0)}`);
  await ctx.close();
}
await browser.close();

if (failures.length) { console.error(`\n${failures.length} problem(s) found.`); process.exit(1); }
console.log('\nLayout test passed.');
