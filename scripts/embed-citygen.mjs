// Copies tools/citygen.js (the settlement generator, edited and tested on its own, see tools/citylab.html) into index.html, so the game stays
// one file with no build step for players. Run after every change to tools/citygen.js:  node scripts/embed-citygen.mjs
// tests/citygen.mjs fails when the copy in index.html differs from tools/citygen.js.
import { readFileSync, writeFileSync } from 'node:fs';
const root = new URL('../', import.meta.url), page = new URL('index.html', root);
const src = readFileSync(new URL('tools/citygen.js', root), 'utf8'), html = readFileSync(page, 'utf8');
if (/<\/script|<!--/i.test(src)) throw new Error('tools/citygen.js must not contain "</script" or "<!--" (it is embedded in a script tag)');
const open = '<script type="text/plain" id="cityGenSrc">\n', close = '</script>\n<script type="text/plain" id="gameSrc">';
const a = html.indexOf(open), b = html.indexOf(close);
if (a < 0 || b < a) throw new Error('index.html has no cityGenSrc block before gameSrc');
const out = html.slice(0, a + open.length) + src + html.slice(b);
if (out !== html) { writeFileSync(page, out); console.log('index.html: settlement generator updated'); } else console.log('index.html: settlement generator already current');
