// Builds the contact sheet for the player ship mockups in docs/player-art-v29.js (a design aid, not part of the game).
// Serve the folder first (python3 -m http.server 8000), then:
//   node scripts/player-art-sheet.mjs [out.html]
// It loads the game, draws every mockup with the game's own sprite toolkit, cuts three pieces of real Campaign ground (sand, night, ice)
// and writes one self-contained page: each ship's current sprite and its variations, enlarged and at game size, with the banking frames
// and an in-game view with engine flames. Needs Playwright, like the tests.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = new URL('..', import.meta.url);
const art = readFileSync(new URL('docs/player-art-v29.js', root), 'utf8');
const tpl = readFileSync(new URL('scripts/player-art-sheet.html', root), 'utf8');
const out = process.argv[2] || 'player-art-sheet.html';
const PAGE = process.env.STARFALL_URL || 'http://localhost:8000/';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 448, height: 800 } });
await page.route(/workers\.dev/, r => r.abort());
page.on('pageerror', e => console.error('page error:', e.message));
await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
await page.goto(PAGE);
await page.waitForFunction(() => typeof window.__sf === 'function', null, { polling: 100, timeout: 60000 });
const peek = c => page.evaluate(c => window.__sf(c), c);
await peek('app.booting && finishBoot(), 0');

/* three pieces of ground, 56 x 72 each: level, frames flown, where to cut */
const GROUND = [['sand', 2, 900, 24, 44], ['night', 3, 700, 20, 120], ['ice', 5, 900, 150, 230]];
for (const [name, lv, n, gx, gy] of GROUND) {
  await peek(`startEnigma(${lv}); for (let i = 0; i < ${n}; i++) { player.inv = 90; world.ebul.length = 0; update(); }
    world.enemies.length = 0; world.ebul.length = 0; world.items.length = 0; world.parts.length = 0; if (world.pbul) world.pbul.length = 0; player.x = -90; if (typeof p2 !== 'undefined' && p2) p2.x = -90; render();
    (globalThis.__G = globalThis.__G || {}).${name} = (() => { const [c, x] = mk(56, 72); x.drawImage(ctx.canvas, ${gx}, ${gy}, 56, 72, 0, 0, 56, 72); return c; })(); 0`);
}

const data = JSON.parse(await peek(art + `; (() => {
  const L = makePlayersV29(), G = globalThis.__G, url = c => c.toDataURL();
  const strip = fr => { const w = Math.max(...fr.map(f => f.w)) + 4, h = Math.max(...fr.map(f => f.h)), [c, x] = mk(w * 3, h); fr.forEach((f, k) => x.drawImage(f.c, k * w + Math.round((w - f.w) / 2), Math.round((h - f.h) / 2))); return url(c); };
  /* the ship over the three grounds, with the engine flames the way drawPlayer draws them (long frame on the first two, short on the last) */
  const game = (fr, flames, fc) => { const [c, x] = mk(56 * 3 + 4, 72); ['sand', 'night', 'ice'].forEach((g, n) => { const ox = n * 58, px = ox + 28, py = 32, f = fr[n === 2 ? 2 : 1], fl = n === 1 ? 4 : 6;
      x.drawImage(G[g], ox, 0);
      for (const [fx, top] of flames) { const bot = Math.max(16, top + 9) + fl;
        x.fillStyle = fc[0]; x.fillRect(px + fx - 1, py + top, 3, bot - top); x.fillStyle = fc[1]; x.fillRect(px + fx - 1, py + top, 3, 2); x.fillStyle = fc[2]; x.fillRect(px + fx, py + top, 1, bot - top - 2); }
      x.drawImage(f.c, Math.round(px - f.w / 2), Math.round(py - f.h / 2)); });
    return url(c); };
  const card = (id, ship, v, name, idea, fr, flames, fc, extra) => Object.assign({ id, ship, v, name, idea, w: fr[1].w, h: fr[1].h, big: url(fr[1].c), banks: strip(fr), game: game(fr, flames, fc) }, extra);
  const FC = { fire: ['#ff7a3a', '#ffb03a', '#fff0a0'], ember: ['#ff4a1a', '#ffb838', '#fff6c0'], teal: ['#18c4b0', '#5ff0dc', '#e0fff8'], violet: ['#8466dc', '#bba4ff', '#e8dcff'] };
  const std = [[-3, 12], [3, 13]], tl = [[-4, 12], [3, 13]];
  const cur = [['Feuervogel', SPR.playerSet, std, FC.fire], ['Rooster', goldSet(), std, FC.fire], ['Phoenix', phoenixSet(), tl, FC.ember], ['Raptor', raptorSet(), [[-4, 15], [3, 16]], FC.teal],
    ['Schneevogel', SPR.schnee, std, FC.fire], ['Rotkehlchen', robinSet(), tl, FC.fire], ['Nachtvogel', nachtSet(), std, FC.violet]].map(([ship, fr, fl, fc]) => card(ship + ' now', ship, 'now', 'In the game now', '', fr, fl, fc, {}));
  const m = SPR.protoMoth, [bc, bx] = mk(m.w, m.h); bx.translate(m.w, m.h); bx.rotate(PI); bx.drawImage(m.c, 0, 0);
  const boss = { id: 'The Moth boss', ship: 'The Moth', v: 'now', name: 'The boss hull', idea: '', w: m.w, h: m.h, big: url(bc) };
  return JSON.stringify({ cur, boss, list: L.map(p => card(p.id, p.ship, p.v, p.name, p.idea, p.frames, p.flames, p.fc, { size: p.size, hit: p.hit })) });
})()`));
await browser.close();
writeFileSync(out, tpl.replace('/*DATA*/null', () => JSON.stringify(data)));
console.log(out, data.list.length, 'mockups,', Math.round(readFileSync(out).length / 1024), 'KB');
