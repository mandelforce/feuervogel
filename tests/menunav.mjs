// Menu navigation test: keyboard and controller in the difficulty picker (title and tutorial), the title's buttons, and no leak of the opening press.
// Serve the folder first (python3 -m http.server 8000).  node tests/menunav.mjs
import { chromium } from 'playwright';
const PAGE = process.env.STARFALL_URL || 'http://localhost:8000/';
let bad = 0, passed = 0;
const ok = (c, m) => { if (c) passed++; else { bad++; console.error('FAIL ' + m); } };
const browser = await chromium.launch();
async function fresh() {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await page.route(/workers\.dev/, r => r.abort());
  page.on('pageerror', e => { bad++; console.error('page error:', e.message); });
  await page.addInitScript(() => {
    window.requestAnimationFrame = () => 0;
    window.__pad = { id: 'fake', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    navigator.getGamepads = () => [window.__pad];
  });
  await page.goto(PAGE);
  await page.waitForFunction(() => typeof window.__sf === 'function', null, { timeout: 120000, polling: 100 });
  await page.evaluate(() => window.__sf('app.booting && finishBoot(), 0'));
  return page;
}
const sf = (page, c) => page.evaluate(x => window.__sf(x), c);
const steps = (page, n = 3) => sf(page, `(() => { for (let i = 0; i < ${n}; i++) update(); })()`);
const focusDiff = page => sf(page, `(() => { const a = document.activeElement; return a && a.dataset ? (a.dataset.d !== undefined ? 'd' + a.dataset.d : a.id) : null; })()`);
const padPress = async (page, i) => { await page.evaluate(i => { window.__pad.buttons[i].pressed = true; }, i); await steps(page, 2); await page.evaluate(i => { window.__pad.buttons[i].pressed = false; }, i); await steps(page, 2); };

// 1. Keyboard: title -> picker -> arrows -> Enter
{
  const page = await fresh();
  await sf(page, 'settings.diff = 1; 0');
  await page.keyboard.press('Enter'); await steps(page);
  ok(await sf(page, '!!app.diffNext && document.getElementById("diffAsk").classList.contains("open")'), 'Enter on the title opens the difficulty picker');
  ok(await focusDiff(page) === 'd1', `the picker starts on the saved difficulty (${await focusDiff(page)})`);
  await page.keyboard.press('ArrowDown'); ok(await focusDiff(page) === 'd2', 'Down moves to Ace');
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp'); ok(await focusDiff(page) === 'd0', 'Up moves to Rookie');
  await page.keyboard.press('Enter'); await steps(page);
  const r = await sf(page, 'JSON.stringify({ state: app.state, diff: settings.diff, lv: run.sortie && run.sortie.level, ranked: run.ranked })');
  ok(r === '{"state":"play","diff":0,"lv":1,"ranked":true}', `Enter starts the Campaign on the highlighted difficulty (${r})`);
  await page.close();
}
// 2. Space opens the picker but does not start the game; Escape closes it
{
  const page = await fresh();
  await page.keyboard.press(' '); await steps(page);
  ok(await sf(page, 'app.state === "title" && !!app.diffNext'), 'Space opens the picker and its release does not start the game');
  await page.keyboard.press('Escape'); await steps(page);
  ok(await sf(page, '!app.diffNext && app.state === "title"'), 'Escape closes the picker');
  await page.close();
}
// 3. Keyboard on the title: Down moves to Scores, Enter opens it
{
  const page = await fresh();
  await page.keyboard.press('ArrowDown'); await steps(page);
  const f = await sf(page, 'app.titleFocus');
  await page.keyboard.press('Enter'); await steps(page);
  ok(f !== 0 && await sf(page, 'app.lbOpen === true || document.getElementById("lbPanel").classList.contains("open")'), `the title's buttons work by keyboard (focus ${f})`);
  await page.close();
}
// 4. Controller: A opens the picker, D-pad moves, A starts
{
  const page = await fresh();
  await sf(page, 'settings.diff = 1; 0'); await steps(page);
  await padPress(page, 0);
  ok(await sf(page, '!!app.diffNext'), 'A on the title opens the picker');
  ok(await focusDiff(page) === 'd1', `the picker starts on the saved difficulty (${await focusDiff(page)})`);
  await padPress(page, 13); ok(await focusDiff(page) === 'd2', 'D-pad down moves to Ace');
  await padPress(page, 12); await padPress(page, 12); ok(await focusDiff(page) === 'd0', 'D-pad up moves to Rookie');
  await padPress(page, 0);
  const r = await sf(page, 'JSON.stringify({ state: app.state, diff: settings.diff, lv: run.sortie && run.sortie.level })');
  ok(r === '{"state":"play","diff":0,"lv":1}', `A starts the game on the highlighted difficulty (${r})`);
  await page.close();
}
// 5. The tutorial's difficulty choice (after step 10): keyboard and controller
for (const dev of ['key', 'pad']) {
  const page = await fresh();
  await sf(page, 'settings.diff = 1; startTutorial(); app.tut.step = 10; 0'); await steps(page, 80);
  await sf(page, 'drawTutorial(), 0'); await steps(page);
  ok(await sf(page, 'document.getElementById("tutBtns").classList.contains("on")'), `${dev}: the tutorial shows its difficulty buttons`);
  ok(await focusDiff(page) === 'd1', `${dev}: they start on the saved difficulty (${await focusDiff(page)})`);
  if (dev === 'key') { await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); } else { await padPress(page, 13); await padPress(page, 0); }
  await steps(page);
  const r = await sf(page, 'JSON.stringify({ tut: !!app.tut, diff: settings.diff, lv: run.sortie && run.sortie.level, ranked: run.ranked })');
  ok(r === '{"tut":false,"diff":2,"lv":1,"ranked":true}', `${dev}: the choice starts the Campaign on Ace (${r})`);
  await page.close();
}
await browser.close();
console.log(bad ? `${bad} failed, ${passed} passed` : `all ${passed} checks passed`);
process.exit(bad ? 1 : 0);
