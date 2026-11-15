#!/usr/bin/env node
// Daily Sortie vetting (docs/daily-sortie-plan.md, phase 4; section 10). The scheduled workflow .github/workflows/daily-vet.yml runs this;
// run it by hand the same way. It uses the flight gate (tests/daily-gate.mjs) and does not repeat any of its checks.
//   1. gate the next DAYS dates (default 14, from tomorrow UTC), all three difficulties, as the table has them now;
//   2. for each failing date, try sub-seeds 1 to 8 in turn (gate --sub K on that date alone, its own flavour and twist) until one passes on all three difficulties;
//      if none does, a plainer day (plan 11.3): first no ground dials (--dials off), then also the flavour plain (--flavour plain), then also no twist (--twist none),
//      each on sub-seeds 0 to 8; the first that passes is taken;
//   3. write the passing sub-seeds into DAILY_REROLL and the plainer days into DAILY_PLAIN (1: no dials; 2: also flavour plain; 3: also no twist) in tools/sortie-compose.js
//      (nothing else in it), run scripts/embed-citygen.mjs so the copy in index.html is current, and write the pull request text to --body, naming every plainer day.
// A date that passes on none of these is reported in the text and left as it is (nothing is guessed).
// Needs Node, Playwright and the folder served (python3 -m http.server 8000; STARFALL_URL if elsewhere).
//   node scripts/daily-vet.mjs [--from YYYY-MM-DD] [--days 14] [--max-sub 8] [--body FILE] [--no-write] [--keep DIR] [--dead S]
// --dead is passed to the gate (a smaller value forces failures, for testing). --no-write leaves the source files alone.
// Exit 0 whenever it ran. With $GITHUB_OUTPUT set it writes `changed=` (true when it rerolled a date: there is a PR to open) and `unfixed=` (the count of dates it could not fix).
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const here = new URL('.', import.meta.url).pathname, root = join(here, '..') + '/';
const require = createRequire(import.meta.url), SC = require('../tools/sortie-compose.js');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const DAYS = +arg('days', 14), MAXSUB = +arg('max-sub', 8), BODY = arg('body', null), WRITE = !arg('no-write', false), DEAD = arg('dead', null);
const FROM = arg('from', null) || SC.dateKeyUTC(Date.now() + 86400000);
const tmp = arg('keep', null) && arg('keep', null) !== true ? arg('keep', null) : mkdtempSync(join(tmpdir(), 'daily-vet-')); mkdirSync(tmp, { recursive: true });
const CAUSE = { 'dead-air': 'dead air (a stretch with nothing to shoot or dodge longer than the limit)', error: 'a page or game error', gate2: 'the generator plan failed gate 2', 'no-boss': 'no boss',
  'boss-not-killed': 'the boss was not killed in 900 s', 'not-title': 'the flight did not end at the title', encounter: 'a planned encounter did not end `done`', 'no-wing': 'no Shadow Wing',
  determinism: 'two pages gave different results' };

const PLAINER = [[], ['--dials', 'off'], ['--dials', 'off', '--flavour', 'plain'], ['--dials', 'off', '--flavour', 'plain', '--twist', 'none']]; /* the ladder (plan 11.3, ground plan 3): the day as drawn, no dials, also flavour plain, also no twist */
const PLAINER_NAME = ['', 'no dials', 'no dials, flavour plain', 'no dials, flavour plain, no twist'];
function gate(from, days, sub, tag, extra) { /* one run of the flight gate; returns the per-sortie records of its --save file */
  const out = join(tmp, tag + '.json'), a = [join(root, 'tests/daily-gate.mjs'), '--from', from, '--days', String(days), '--save', out];
  if (sub !== undefined) a.push('--sub', String(sub)); if (DEAD) a.push('--dead', String(DEAD)); if (extra) a.push(...extra);
  a.push('--fresh'); const r = spawnSync(process.execPath, a, { encoding: 'utf8', cwd: root, maxBuffer: 1 << 28 });
  if (!existsSync(out)) throw new Error('the gate wrote no result (' + tag + '), exit ' + r.status + ': ' + (r.stderr || '').slice(-400));
  return { sorties: JSON.parse(readFileSync(out, 'utf8')).sorties, status: r.status };
}
const why = w => w.map(c => CAUSE[c] || c).join('; ');

console.log(`vetting ${DAYS} dates from ${FROM} (composer v${SC.VERSION}, ${Object.keys(SC.DAILY_REROLL).length} dates already in DAILY_REROLL, ${Object.keys(SC.DAILY_PLAIN).length} in DAILY_PLAIN)`);
const first = gate(FROM, DAYS, undefined, 'window');
const failing = first.sorties.filter(s => !s.pass), fixed = [], plainer = [], unfixable = [];
console.log(`${first.sorties.length - failing.length} of ${first.sorties.length} dates pass as they are; ${failing.length} fail`);
for (const f of failing) {
  const tried = [], P0 = SC.DAILY_PLAIN[f.sortie] | 0; let ok = null, level = 0;
  for (let k = 1; k <= MAXSUB && !ok; k++) {
    if (k === (SC.DAILY_REROLL[f.sortie] | 0) && f.sub === k) continue; /* the sub-seed that just failed */
    const r = gate(f.sortie, 1, k, f.sortie + '-s' + k).sorties[0];
    tried.push({ sub: k, pass: r.pass, why: r.why });
    console.log(`  ${f.sortie} ${f.kit} sub ${k}: ${r.pass ? 'PASS' : 'FAIL ' + r.why.join(',')}`);
    if (r.pass) ok = r;
  }
  for (level = Math.max(1, P0); level <= 3 && !ok; level++) for (let k = 0; k <= MAXSUB && !ok; k++) { /* a plainer day: sub-seeds 0 to 8 on it, the failing one aside */
    if (level === P0 && k === f.sub) continue;
    const r = gate(f.sortie, 1, k, f.sortie + '-p' + level + 's' + k, PLAINER[level]).sorties[0];
    tried.push({ sub: k, plain: level, pass: r.pass, why: r.why });
    console.log(`  ${f.sortie} ${f.kit} plainer ${level} (${PLAINER_NAME[level]}) sub ${k}: ${r.pass ? 'PASS' : 'FAIL ' + r.why.join(',')}`);
    if (r.pass) { ok = r; ok.level = level; }
  }
  if (ok && ok.level) plainer.push({ date: f.sortie, kit: f.kit, flavour: f.flavour, twist: f.twist, level: ok.level, sub: ok.sub, why: f.why, tried: tried.length });
  else if (ok) fixed.push({ date: f.sortie, kit: f.kit, was: f.sub, why: f.why, sub: ok.sub, tried: tried.length, kitNow: ok.kit });
  else unfixable.push({ date: f.sortie, kit: f.kit, flavour: f.flavour, twist: f.twist, why: f.why, tried });
}

/* the tables: only DAILY_REROLL and DAILY_PLAIN change */
const file = join(root, 'tools/sortie-compose.js'), src = readFileSync(file, 'utf8');
const re = /(DAILY_SALT = 0x0F0E89, DAILY_REROLL = )(\{[^}]*\})(, DAILY_PLAIN = )(\{[^}]*\})(;)/, m = re.exec(src); if (!m) throw new Error('tools/sortie-compose.js: the DAILY_REROLL / DAILY_PLAIN line not found');
const table = Object.assign({}, SC.DAILY_REROLL), ptable = Object.assign({}, SC.DAILY_PLAIN); for (const f of fixed) table[f.date] = f.sub; for (const f of plainer) { ptable[f.date] = f.level; if (f.sub) table[f.date] = f.sub; else delete table[f.date]; }
const litOf = t => '{' + Object.keys(t).sort().map(d => `'${d}': ${t[d]}`).join(', ') + '}', lit = litOf(table), plit = litOf(ptable);
if (WRITE && (fixed.length || plainer.length)) {
  writeFileSync(file, src.replace(re, `$1${lit}$3${plit}$5`));
  const e = spawnSync(process.execPath, [join(root, 'scripts/embed-citygen.mjs')], { encoding: 'utf8', cwd: root }); if (e.status) throw new Error('embed failed: ' + e.stderr);
}

/* the pull request text */
const L = [];
L.push(`Daily Sortie vetting: ${DAYS} dates from ${FROM} to ${SC.dateKeyUTC(Date.parse(FROM + 'T00:00:00Z') + (DAYS - 1) * 86400000)} (composer v${SC.VERSION}).`, '');
L.push(`The flight gate (\`tests/daily-gate.mjs\`, all three difficulties) failed ${failing.length} of ${first.sorties.length} dates. ` + (fixed.length || plainer.length ? `${fixed.length} are rerolled and ${plainer.length} made plainer below` : 'None could be rerolled or made plainer') +
  (unfixable.length ? `; ${unfixable.length} could not be fixed and need a decision.` : '.'), '');
if (fixed.length) {
  L.push('### Rerolled (`DAILY_REROLL`)', '', '| Date | Kit | Was | Now | Cause of the failure | Sub-seeds tried |', '|---|---|---|---|---|---|');
  for (const f of fixed) L.push(`| ${f.date} | ${f.kit} | sub ${f.was} | **sub ${f.sub}** | ${why(f.why)} | ${f.tried} |`);
  L.push('', 'The change is the `DAILY_REROLL` entries in `tools/sortie-compose.js` and the copy of that file in `index.html` (`node scripts/embed-citygen.mjs`). Nothing else.', '');
}
if (plainer.length) {
  L.push('### Made plainer (`DAILY_PLAIN`): no sub-seed passed with the day as drawn', '', '| Date | Kit | Drawn | Now | Cause of the failure | Tried |', '|---|---|---|---|---|---|');
  for (const f of plainer) L.push(`| ${f.date} | ${f.kit} | ${f.flavour} + ${f.twist} | **${PLAINER_NAME[f.level]}**${f.sub ? ' (sub ' + f.sub + ')' : ''} | ${why(f.why)} | ${f.tried} |`);
  L.push('', 'A plainer day is a decision the owner may want to read: the date loses its flavour (and in the last case its twist) so that the sortie passes the gate.', '');
}
if (unfixable.length) {
  L.push(`### Not fixed: nothing passes (sub-seeds 1 to ${MAXSUB}, then the plainer days)`, '');
  for (const u of unfixable) L.push(`- **${u.date}** (${u.kit}): ${why(u.why)}. Sub-seeds tried: ` + u.tried.map(t => `${t.plain ? 'plainer ' + t.plain + ' ' : ''}${t.sub} (${t.why.join(', ')})`).join(', ') + '.');
  L.push('', 'These dates are left as they are. They need a change to the kit grammar or the gate, or the owner may accept them.', '');
}
if (fixed.length || plainer.length) L.push('The sortie of a rerolled or plainer date differs from the one the current build gives, so merge this before the date is within a release of going live. `composeVersion` stays as it is (no date in the window has been played).');
const text = L.join('\n') + '\n';
if (BODY && BODY !== true) writeFileSync(BODY, text);
console.log('\n----- pull request text -----\n' + text);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${fixed.length + plainer.length > 0}\nunfixed=${unfixable.length}\n`);
console.log(`result: ${fixed.length} rerolled, ${plainer.length} made plainer, ${unfixable.length} not fixed, tables ${lit} ${plit}`);
