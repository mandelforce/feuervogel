// Rookie in the Campaign (RK in index.html): the ship starts at weapon level 4 with three of the four super steps; once it is off the
// carrier's deck a Scatter orb that never changes drops in front of it and starts the frenzy; the carrier's deck guns and the planes it
// launches never fire; the fighters of a formation leave at most one shooter; the ground guns are thinned; never more than RK.cap bullets.
// Veteran is unchanged. Serve the folder (python3 -m http.server 8000), then:  node tests/rookie.mjs [--verbose]
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const PAGE = process.env.STARFALL_URL || 'http://localhost:8000/';
const harness = readFileSync(new URL('./harness.js', import.meta.url), 'utf8');
const verbose = process.argv.includes('--verbose');
let bad = 0, passed = 0;
const ok = (c, m) => { if (c) { passed++; if (verbose) console.log('ok   ' + m); } else { bad++; console.error('FAIL ' + m); } };
const browser = await chromium.launch();
async function freshPage() {
  const page = await browser.newPage({ viewport: { width: 400, height: 700 } });
  await page.route(/workers\.dev/, r => r.abort());
  page.on('pageerror', e => { bad++; console.error('page error:', e.message); });
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await page.goto(PAGE);
  await page.waitForFunction(() => typeof window.__sf === 'function', null, { polling: 100, timeout: 60000 });
  await page.evaluate(h => window.__sf(h), harness);
  await page.evaluate(() => window.SF.peek('app.booting && finishBoot(), 0'));
  return page;
}
const peek = (page, code) => page.evaluate(c => window.SF.peek(c), code);

/* 1. level 1 from the deck: the start, the orb, the frenzy and a silent carrier */
for (const diff of [0, 1]) {
  const page = await freshPage();
  const r = await peek(page, `(() => { SF.setMode('immortal'); settings.diff = ${diff}; startEnigma(1, true);
    const s0 = { lvl: player.lvl, sup: player.sup || 0, wpn: player.wpn };
    let orbAt = -1, orb = null, gunShots = 0, chaseShots = 0, sup = -1;
    for (let f = 0; f < 1500; f++) {
      const n0 = world.ebul.length; update();
      for (let k = n0; k < world.ebul.length; k++) { const b = world.ebul[k]; if (world.carrier && !world.carrier.gone && b.kind === 'shell') gunShots++; }
      if (orbAt < 0) { const it = world.items.find(i => i.kind === 'W'); if (it) { orbAt = f; orb = { w: it.w, fixed: !!it.fixed, dy: player.y - it.y, deck: !!player.deck, fly: player.fly }; player.x = it.x; player.y = it.y + 4; } }
      if (sup < 0 && typeof isSup === 'function' && isSup(player)) sup = f;
    }
    return { s0, orbAt, orb, gunShots, sup };
  })()`);
  if (diff === 0) {
    ok(r.s0.lvl === 4 && r.s0.sup === 3 && r.s0.wpn === 'S', `Rookie starts at weapon level 4 with 3 super steps (${JSON.stringify(r.s0)})`);
    ok(r.orbAt > 0 && r.orb && r.orb.w === 'S' && r.orb.fixed && !r.orb.deck && r.orb.fly === 0 && r.orb.dy > 0, `the first orb is a fixed Scatter in front of the ship, once it is off the deck (frame ${r.orbAt}, ${JSON.stringify(r.orb)})`);
    ok(r.orbAt > 0 && r.orbAt < 260, `it comes right after the take-off (frame ${r.orbAt})`);
    ok(r.sup > r.orbAt, `taking it starts the frenzy (frame ${r.sup})`);
    ok(r.gunShots === 0, `the carrier's deck guns never fire (${r.gunShots} shells)`);
  } else {
    ok(r.s0.lvl === 1 && r.s0.sup === 0, `Veteran still starts at level 1 (${JSON.stringify(r.s0)})`);
    ok(r.gunShots > 0, `Veteran: the deck guns still fire (${r.gunShots} shells)`);
  }
  await page.close();
}

/* 2. levels 3 to 6, and level 4 of the second loop: bullets at once, ground guns and fighter shooters, Rookie against Veteran */
for (const [lv, lp] of [[3, 0], [4, 0], [5, 0], [6, 0], [4, 1]]) {
  const res = {};
  for (const diff of [0, 1]) {
    const page = await freshPage();
    res[diff] = await peek(page, `(() => { SF.setMode('immortal'); settings.diff = ${diff}; startEnigma(${lv}, true, ${lp}); player.lvl = 1; player.sup = 0;
      let top = 0, sum = 0, mines = 0, guns = new Set(), hidden = new Set(), fs = new Set(), shooters = new Set(), shots = 0;
      for (let f = 0; f < 3600; f++) {
        const n0 = world.ebul.length; update(); shots += Math.max(0, world.ebul.length - n0);
        const nb = encBullets(); top = Math.max(top, nb); sum += nb; mines = Math.max(mines, world.ebul.length - nb);
        for (const e of world.enemies) { if (['flak', 'bunker', 'aatower', 'arty', 'sam', 'fortgun', 'nebel'].includes(e.type)) guns.add(e); if (e.type === 'camo' || e.type === 'popup') hidden.add(e);
          if (e.type === 'fighter') { fs.add(e); if (e.fireAt >= 0 || (e.strafe && !e.fired)) shooters.add(e); } }
      }
      return { top, mines, avg: +(sum / 3600).toFixed(1), shots, guns: guns.size, hidden: hidden.size, fighters: fs.size, shooters: shooters.size };
    })()`);
    await page.close();
  }
  const R = res[0], V = res[1], tag = `level ${lv}${lp ? ' (loop 2)' : ''}`;
  if (verbose) console.log(`     ${tag}: Rookie ${JSON.stringify(R)} / Veteran ${JSON.stringify(V)}`);
  ok(R.top <= 26 + 4, `${tag}: Rookie never has many more than 26 bullets at once, the Sower's mines apart (${R.top}; Veteran ${V.top})`);
  ok(R.mines <= Math.max(4, V.mines * 0.7), `${tag}: fewer of the Sower's mines hang in the air on Rookie (${R.mines} / ${V.mines})`);
  ok(R.shots < V.shots * 0.6, `${tag}: Rookie fires well under 60 % of Veteran's bullets (${R.shots} / ${V.shots})`);
  ok(R.guns + R.hidden <= V.guns + V.hidden && R.hidden <= Math.ceil(V.hidden / 2), `${tag}: no more ground guns on Rookie, and at most half the hidden ones (${R.guns} + ${R.hidden} hidden / ${V.guns} + ${V.hidden})`);
  ok(R.shooters <= Math.ceil(R.fighters / 3), `${tag}: at most about one fighter in three may fire on Rookie (${R.shooters} of ${R.fighters})`);
}
await browser.close();
console.log(bad ? `${bad} failed, ${passed} passed` : `Rookie checks pass (${passed}).`);
process.exit(bad ? 1 : 0);
