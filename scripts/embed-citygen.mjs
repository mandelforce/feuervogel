// Copies the two pure modules the game carries into index.html, so the game stays one file with no build step for players:
//   tools/citygen.js         the settlement generator (edited and tested on its own, see tools/citylab.html)   -> cityGenSrc
//   tools/sortie-compose.js  the Daily Sortie's composer (docs/daily-sortie-plan.md)                            -> sortieComposeSrc
// Run after every change to either:  node scripts/embed-citygen.mjs
// tests/citygen.mjs fails when the generator's copy differs from its source, tests/compose.mjs when the composer's does.
import { readFileSync, writeFileSync } from 'node:fs';
const root = new URL('../', import.meta.url), page = new URL('index.html', root), tag = id => '<script type="text/plain" id="' + id + '">';
const BLOCKS = [['cityGenSrc', 'tools/citygen.js', 'settlement generator'], ['sortieComposeSrc', 'tools/sortie-compose.js', 'sortie composer']];
let html = readFileSync(page, 'utf8'); const was = html;
/* a block the page does not have yet goes in, empty, right before the next one (last first, so each finds its neighbour) */
for (let k = BLOCKS.length - 1; k >= 0; k--) { const id = BLOCKS[k][0], next = k + 1 < BLOCKS.length ? BLOCKS[k + 1][0] : 'gameSrc'; if (html.includes(tag(id))) continue;
  const at = html.indexOf(tag(next)); if (at < 0) throw new Error('index.html has no ' + next + ' block to put ' + id + ' before'); html = html.slice(0, at) + tag(id) + '\n</script>\n' + html.slice(at); }
BLOCKS.forEach(([id, file, name], k) => {
  const src = readFileSync(new URL(file, root), 'utf8'), next = k + 1 < BLOCKS.length ? BLOCKS[k + 1][0] : 'gameSrc';
  if (/<\/script|<!--/i.test(src)) throw new Error(file + ' must not contain "</script" or "<!--" (it is embedded in a script tag)');
  const open = tag(id) + '\n', a = html.indexOf(open); if (a < 0) throw new Error('index.html has no ' + id + ' block');
  const b = html.indexOf('</script>\n' + tag(next), a); if (b < 0) throw new Error('index.html: the ' + id + ' block does not end right before ' + next);
  const out = html.slice(0, a + open.length) + src + html.slice(b);
  console.log('index.html: ' + name + (out !== html ? ' updated' : ' already current')); html = out;
});
if (html !== was) writeFileSync(page, html);
