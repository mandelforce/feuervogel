// The Retro Run's 1987 look (RETRO, setRetroArt in index.html): looks and sound only, and only in a Retro Run.
// Checks: the retro art comes on in a Retro Run and every swapped sprite keeps its size; the title, the Campaign and a resumed Retro Run get the
// right art; a seeded Retro Run plays the same frames with the retro art and without it; the phone HUD's HIGH SCORE clears the menu button;
// the scanline setting shows only in a Retro Run; the chip sound and music run without errors.
// Needs Node and Playwright; serve the folder first (python3 -m http.server 8000).
//   node tests/retro.mjs            (--verbose also prints the checks that pass)
import { chromium, devices } from 'playwright';
import { readFileSync } from 'node:fs';

const PAGE = process.env.STARFALL_URL || 'http://localhost:8000/';
const harness = readFileSync(new URL('./harness.js', import.meta.url), 'utf8');
let bad = 0, passed = 0;
const verbose = process.argv.includes('--verbose');
const ok = (cond, msg) => { if (cond) { passed++; if (verbose) console.log('ok   ' + msg); } else { bad++; console.error('FAIL ' + msg); } };
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
async function open(ctxOpts = { viewport: { width: 400, height: 700 } }) {
  const ctx = await browser.newContext(ctxOpts), page = await ctx.newPage();
  await page.route(/workers\.dev/, r => r.abort());
  page.on('pageerror', e => { bad++; console.error('page error:', e.message); });
  await page.goto(PAGE); await page.waitForFunction(() => typeof window.__sf === 'function', null, { polling: 100, timeout: 60000 });
  await page.evaluate(s => window.__sf(s), harness); await page.evaluate(() => window.SF.peek('app.booting && finishBoot(), 0'));
  return { ctx, page, peek: c => page.evaluate(c2 => window.SF.peek(c2), c) };
}

{ // 1. the art comes on and off with the run
  const { ctx, peek } = await open();
  const r = JSON.parse(await peek(`(() => { const classic = SPR.player, out = {}; SF.setMode('immortal'); startRetro(); SF.run(30); render();
    out.on = RETRO.on; out.swapped = SPR.player !== classic && SPR.player === RETRO.S.player;
    const dims = v => !v || typeof v !== 'object' ? '' : v.getContext ? v.width + 'x' + v.height : v.c && v.c.getContext ? v.c.width + 'x' + v.c.height : Array.isArray(v) ? '[' + v.map(dims).join(',') + ']' : Object.getPrototypeOf(v) === Object.prototype ? '{' + Object.keys(v).map(k => k + dims(v[k])).join(',') + '}' : '';
    out.diff = Object.keys(RETRO.S).filter(k => dims(RETRO.S[k]) !== dims(RETRO.classic[k]));
    out.gold = goldSet() === RETRO.gold;
    toTitle(); render(); out.title = !RETRO.on && SPR.player === classic;
    SF.start(1, 1); SF.run(30); render(); out.camp = !RETRO.on && !run.retro && SPR.player === classic;
    return JSON.stringify(out); })()`));
  ok(r.on && r.swapped, 'a Retro Run swaps the retro art in');
  ok(r.diff.length === 0, 'every retro sprite has the size of the classic one' + (r.diff.length ? ' (differs: ' + r.diff.join(', ') + ')' : ''));
  ok(r.gold, "player 2's Rooster is the retro one in a Retro Run");
  ok(r.title, 'the title gets the classic art back');
  ok(r.camp, 'a Campaign after a Retro Run has the classic art');
  await ctx.close();
}

{ // 2. the same game with and without the retro art (seeded, rendering every frame)
  const runIt = async art => { const { ctx, peek } = await open();
    const h = await peek(`(() => { ${art ? '' : 'retroSync = () => setRetroArt(false);'} window.__forceSeed = 31; gf = 0; SF.setMode('immortal'); SF.start(1, 1); delete window.__forceSeed; run.retro = true; ${art ? 'setRetroArt(true);' : ''}
      const h = []; for (let i = 0; i < 3000; i++) { if (SF.run(1) !== 'ok') { h.push('stop ' + i); break; } render(); if (i % 300 === 0) h.push([gf, run.score, run.lives, world.enemies.length, world.ebul.length, world.items.length, player.x.toFixed(3), player.y.toFixed(3)].join(',')); }
      return h.join(' | ') + ' art ' + RETRO.on; })()`);
    await ctx.close(); return h; };
  const a = await runIt(true), c = await runIt(false);
  ok(a.endsWith('art true') && c.endsWith('art false'), 'the two runs fly with and without the retro art');
  ok(a.replace(/ art \w+$/, '') === c.replace(/ art \w+$/, ''), 'a seeded Retro Run plays the same with the retro art (score, lives, enemies, bullets, items, ship)');
}

{ // 3. resume: a saved Retro Run comes back with the retro art
  const { ctx, page, peek } = await open();
  await peek(`(() => { SF.setMode('immortal'); startRetro(); SF.run(600); saveResume(); return 0; })()`);
  await page.reload(); await page.waitForFunction(() => typeof window.__sf === 'function', null, { polling: 100, timeout: 60000 });
  await page.evaluate(s => window.__sf(s), harness); await page.evaluate(() => window.SF.peek('app.booting && finishBoot(), 0'));
  const r = JSON.parse(await peek(`(() => { const s = loadResume(); if (!s) return '{}'; resumeRun(s); render(); return JSON.stringify({ retro: run.retro, on: RETRO.on }); })()`));
  ok(r.retro && r.on, 'a resumed Retro Run has the retro art');
  await ctx.close();
}

for (const dev of ['iPhone SE', 'iPhone 13']) { // 4. the phone HUD and the scanlines
  const { ctx, page, peek } = await open({ ...devices[dev] });
  await peek(`(() => { SF.setMode('immortal'); settings.crt = true; startRetro(); SF.run(60); render(); return 0; })()`);
  await page.waitForTimeout(100);
  const r = JSON.parse(await peek(`(() => { const m = document.getElementById('menuBtn').getBoundingClientRect(), c = cv.getBoundingClientRect(), k = c.width / W, hx = TOUCH_HUD ? 150 : 166, e = RETRO.crtEl;
    const out = { touch: TOUCH_HUD, gap: Math.round(m.left - (c.left + (hx + rTextW('HIGH SCORE') / 2) * k)), crt: !!e && !e.hidden && Math.abs(e.getBoundingClientRect().width - c.width) < 1 };
    toTitle(); render(); out.crtOff = !e || e.hidden; settings.crt = false; return JSON.stringify(out); })()`));
  ok(r.touch && r.gap >= 4, `${dev}: HIGH SCORE clears the menu button (${r.gap} px)`);
  ok(r.crt, `${dev}: the scanlines cover the game screen in a Retro Run`);
  ok(r.crtOff, `${dev}: no scanlines at the title`);
  await ctx.close();
}

{ // 5. chip sound and music
  const { ctx, peek } = await open();
  const r = await peek(`(() => { muted = false; audio(); if (!actx) return 'no audio'; SF.setMode('immortal'); startRetro(); render(); const errs = [];
    for (const n of ['boom', 'gboom', 'bigboom', 'hit', 'hitm', 'nova', 'charge', 'rebirth', 'shot', 'die', 'zap', 'tick', 'rocket']) { sfxLast[n] = -999; try { sfx(n); } catch (e) { errs.push(n + ': ' + e.message); } }
    for (const st of [1, 7, 13]) for (const nm of ['stage', 'boss', 'winter', 'desert', 'night', 'forest', 'city', 'final']) { try { run.stage = st; playSong(nm); for (let i = 0; i < 30; i++) { Music.next = actx.currentTime; scheduleMusic(); } } catch (e) { errs.push(nm + st + ': ' + e.message); } }
    try { jingle([[72, 2], [76, 2], [79, 4]]); } catch (e) { errs.push('jingle: ' + e.message); }
    return errs.join('; '); })()`);
  ok(r === '' || r === 'no audio', 'chip sound effects, every song in every loop and the jingles play without errors' + (r ? ' (' + r + ')' : ''));
  await ctx.close();
}

await browser.close();
if (bad) { console.error(`${bad} check(s) failed, ${passed} passed.`); process.exit(1); }
console.log(`Retro Run checks pass (${passed}).`);
