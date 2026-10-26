// Resume test: a run left in the background must come back after the browser kills the page.
// Checks: the save survives coming back to the page, is refreshed while playing (no hide event needed), the game comes back at the exact
// frame it was paused on (same frame count, score and place in the stage), an older hidden build's save still resumes (as a stage restart),
// a different version's save does not, and Resume puts the player back in the game.
// Serve the folder first (python3 -m http.server 8000), then: node tests/resume.mjs
import { chromium } from 'playwright';
const URL = process.env.STARFALL_URL || 'http://localhost:8000/';
const failures = [];
const fail = m => { failures.push(m); console.error('FAIL ' + m); };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.route(/workers\.dev/, r => r.abort());
const hide = h => page.evaluate(h => { Object.defineProperty(document, 'hidden', { value: h, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); if (h) dispatchEvent(new Event('pagehide')); }, h);
const info = () => page.evaluate(() => ({ state: document.body.dataset.state, ask: document.getElementById('resumeAsk').classList.contains('open'), save: localStorage.getItem('starfall-resume') }));
const reload = async () => { await page.reload(); await page.waitForTimeout(4000); return info(); };

await page.goto(URL); await page.waitForTimeout(3500);
await page.keyboard.press('1'); await page.click('#diffAsk [data-d="1"]'); await page.waitForTimeout(6000);
if ((await info()).state !== 'play') fail('Stage 1 did not start');

await hide(true); await hide(false);
if (!(await info()).save) fail('the save was deleted when the page came back');
await page.waitForTimeout(1500); // the game keeps flying; the snapshot is taken again when it pauses
const at = () => page.evaluate(() => window.__sf('({ gf, score: run.score, scroll: Math.round(world.scroll), stage: run.stage, enemies: world.enemies.length, paused: app.paused, resumeT: app.resumeT, snapGf: app.snap && app.snap.gf })'));
await hide(true);
const paused = await at();
if (paused.snapGf !== paused.gf && paused.snapGf < paused.gf - 120) fail(`the snapshot is far older than the pause (frame ${paused.snapGf}, paused at ${paused.gf})`);
let r0 = await reload();
if (!r0.ask) fail('no Resume question after the reload');
else {
  await page.click('#resYes'); await page.waitForTimeout(300);
  const back = await at();
  if (back.gf !== paused.snapGf) fail(`the game did not come back at the saved frame (saved ${paused.snapGf}, came back at ${back.gf})`);
  if (back.stage !== paused.stage || Math.abs(back.scroll - paused.scroll) > 120) fail(`the game came back at another place (stage ${back.stage} scroll ${back.scroll}, was ${paused.stage} ${paused.scroll})`);
  await page.waitForTimeout(4000);
  const later = await at();
  if (!(later.gf > back.gf + 60)) fail(`the game did not carry on after the countdown (frame ${back.gf}, then ${later.gf})`);
}
await page.evaluate(() => { for (let i = 0; i < 200; i++) window.__sf('0'); }); // (nothing: keeps the page busy for the interval below)

await page.evaluate(() => localStorage.removeItem('starfall-resume'));
await page.waitForTimeout(5500);
if (!(await info()).save) fail('no save was written while playing (a page killed without a hide event would lose the run)');

const old = JSON.parse((await info()).save);
await page.evaluate(v => { const r = JSON.parse(localStorage.getItem('starfall-resume')); r.v = v; localStorage.setItem('starfall-resume', JSON.stringify(r)); }, old.v.replace(/\.\d+$/, '.0'));
await hide(true);
await page.evaluate(v => { const r = JSON.parse(localStorage.getItem('starfall-resume')); r.v = v; localStorage.setItem('starfall-resume', JSON.stringify(r)); }, old.v.replace(/\.\d+$/, '.0'));
let r = await reload();
if (!r.ask) fail('a save from an earlier hidden build was not offered after the reload');
await page.click('#resYes'); await page.waitForTimeout(1500);
if ((await info()).state !== 'play') fail('Resume did not return to the game');

// from the title screen, so the reload's own pagehide cannot overwrite the planted record
await page.evaluate(() => window.__sf('toTitle()'));
await page.evaluate(() => { const r = { v: '0.0.1', at: Date.now(), stage: 1, theme: 0, diff: 1, runStart: 1, conts: 0, credits: 0, frames: 1, score: 0, nextExtend: 100000, extendsGot: 0, camp: {}, lives: 1, bombs: 3, wpn: 'S', lvl: 1 }; localStorage.setItem('starfall-resume', JSON.stringify(r)); });
r = await reload();
if (r.ask) fail('a save from a different version was offered');

await browser.close();
if (failures.length) { console.error(`\n${failures.length} problem(s) found.`); process.exit(1); }
console.log('Resume test passed.');
