// StarFall leaderboard: a Cloudflare Worker with a D1 database bound as DB.
// Edit ALLOWED_ORIGINS if the game moves to another address.
const ALLOWED_ORIGINS = ['https://mandelforce.github.io'];
const MODES = ['camp', 'endless'], PLATS = ['mobile', 'pc'];
const BAD = ['fuck', 'shit', 'cunt', 'nigg', 'fag', 'hitler', 'nazi', 'kkk', 'rape', 'whore', 'slut', 'bitch', 'dick', 'cock', 'pussy'];

function isoWeek(ms) {
  const d = new Date(ms); d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const y = d.getUTCFullYear(), start = Date.UTC(y, 0, 1);
  return y + '-W' + String(Math.ceil(((d - start) / 86400000 + 1) / 7)).padStart(2, '0');
}
function cors(origin) {
  const ok = ALLOWED_ORIGINS.includes(origin);
  return { 'Access-Control-Allow-Origin': ok ? origin : ALLOWED_ORIGINS[0], 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin' };
}
function json(data, status, origin) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors(origin) } }); }

export default {
  async fetch(req, env) {
    const url = new URL(req.url), origin = req.headers.get('Origin') || '';
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    try {
      if (req.method === 'GET' && url.pathname === '/top') {
        const mode = url.searchParams.get('mode'), plat = url.searchParams.get('plat') || 'mobile', diff = parseInt(url.searchParams.get('diff'), 10), period = ['week', 'last'].includes(url.searchParams.get('period')) ? url.searchParams.get('period') : 'all', player = url.searchParams.get('player') || '';
        if (!MODES.includes(mode) || !PLATS.includes(plat) || !(diff >= 0 && diff <= 2)) return json({ error: 'bad request' }, 400, origin);
        const wk = isoWeek(Date.now()), lastWk = isoWeek(Date.now() - 7 * 86400000), useWk = period === 'week' ? wk : period === 'last' ? lastWk : null;
        const wh = ' AND plat = ?3' + (useWk ? ' AND week = ?4' : '');
        const args = useWk ? [mode, diff, plat, useWk] : [mode, diff, plat];
        const best = `SELECT player, name, MAX(score) AS score, stage, conts, created FROM scores WHERE mode = ?1 AND diff = ?2${wh} GROUP BY player`;
        const top = await env.DB.prepare(`${best} ORDER BY score DESC, created ASC LIMIT 10`).bind(...args).all();
        let me = null;
        if (/^[A-Za-z0-9-]{16,40}$/.test(player)) {
          const mine = await env.DB.prepare(`SELECT name, MAX(score) AS score, stage, conts FROM scores WHERE mode = ?1 AND diff = ?2${wh} AND player = ?${args.length + 1}`).bind(...args, player).first();
          if (mine && mine.score !== null) {
            const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM (${best}) WHERE score > ?${args.length + 1}`).bind(...args, mine.score).first();
            me = { rank: (r ? r.n : 0) + 1, name: mine.name, score: mine.score, stage: mine.stage, star: mine.conts === 0 };
          }
        }
        const tag = p => p.slice(-4).toUpperCase();
        return json({ period, plat, week: useWk || wk, top: top.results.map(r => ({ name: r.name, tag: tag(r.player), score: r.score, stage: r.stage, star: r.conts === 0, me: r.player === player })), me }, 200, origin);
      }
      // The red dot on the title screen's SCORES button. For every board the player has a score on (mode, platform, difficulty) it returns
      // the player's all-time rank, worked out exactly like /top's "me.rank": the game compares the two and shows the dot when the rank got worse.
      if (req.method === 'GET' && url.pathname === '/status') {
        const player = url.searchParams.get('player') || '';
        if (!/^[A-Za-z0-9-]{16,40}$/.test(player)) return json({ boards: [] }, 200, origin);
        const mine = await env.DB.prepare('SELECT mode, plat, diff, MAX(score) AS score FROM scores WHERE player = ?1 GROUP BY mode, plat, diff').bind(player).all();
        const rows = mine.results || [];
        const ranks = rows.length ? await env.DB.batch(rows.map(r => env.DB.prepare('SELECT COUNT(*) AS n FROM (SELECT player, MAX(score) AS s FROM scores WHERE mode = ?1 AND diff = ?2 AND plat = ?3 GROUP BY player) WHERE s > ?4').bind(r.mode, r.diff, r.plat, r.score))) : [];
        return json({ boards: rows.map((r, i) => ({ mode: r.mode, plat: r.plat, diff: r.diff, rank: (((ranks[i] && ranks[i].results && ranks[i].results[0]) || {}).n || 0) + 1 })) }, 200, origin);
      }
      if (req.method === 'POST' && url.pathname === '/submit') {
        if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: 'origin not allowed' }, 403, origin);
        const b = await req.json();
        const player = String(b.player || ''), name = String(b.name || '').trim().replace(/\s+/g, ' '), mode = String(b.mode || ''), plat = String(b.plat || '');
        const diff = b.diff | 0, score = Math.floor(Number(b.score)), stage = b.stage | 0, dur = Number(b.dur) || 0, version = String(b.version || '').slice(0, 12), conts = b.conts | 0, start = b.start === undefined ? 1 : b.start | 0;
        if (!/^[A-Za-z0-9-]{16,40}$/.test(player)) return json({ error: 'bad player' }, 400, origin);
        if (!/^[A-Za-z0-9 _.\-]{1,12}$/.test(name)) return json({ error: 'Names can use letters, numbers, spaces, dots, dashes and underscores, up to 12 characters.' }, 400, origin);
        const low = name.toLowerCase().replace(/[^a-z]/g, '');
        if (BAD.some(w => low.includes(w))) return json({ error: 'Please choose another name.' }, 400, origin);
        if (!MODES.includes(mode) || !PLATS.includes(plat) || !(diff >= 0 && diff <= 2)) return json({ error: 'bad mode' }, 400, origin);
        if (!(stage >= 1 && stage <= 300) || !(score >= 0 && score <= 99999999)) return json({ error: 'bad score' }, 400, origin);
        if (!(conts >= 0 && conts <= 2)) return json({ error: 'bad continues' }, 400, origin);
        if (mode === 'camp' && start !== 1) return json({ error: 'Practice runs from a later stage are not ranked.' }, 400, origin);
        if (score > stage * 1500000) return json({ error: 'score not plausible' }, 400, origin);
        if (score > 0 && dur < stage * 45) return json({ error: 'run too short' }, 400, origin);
        const now = Date.now();
        const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM scores WHERE player = ?1 AND created > ?2').bind(player, now - 30000).first();
        if (recent && recent.n > 0) return json({ error: 'Please wait a moment before submitting again.' }, 429, origin);
        const today = await env.DB.prepare('SELECT COUNT(*) AS n FROM scores WHERE player = ?1 AND created > ?2').bind(player, now - 86400000).first();
        if (today && today.n >= 40) return json({ error: 'Daily limit reached.' }, 429, origin);
        await env.DB.prepare('INSERT INTO scores (player, name, mode, plat, diff, score, stage, version, created, week, conts, start) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)').bind(player, name, mode, plat, diff, score, stage, version, now, isoWeek(now), conts, start).run();
        return json({ ok: true }, 200, origin);
      }
      if (req.method === 'POST' && url.pathname === '/report') { // anonymous run report (play data), kept apart from scores
        if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: 'origin not allowed' }, 403, origin);
        const txt = await req.text();
        if (txt.length > 24000) return json({ error: 'too big' }, 413, origin);
        const b = JSON.parse(txt);
        const player = String(b.player || ''), mode = String(b.mode || ''), plat = String(b.plat || ''), end = String(b.end || '');
        if (!/^[A-Za-z0-9-]{16,40}$/.test(player) || !MODES.includes(mode) || !PLATS.includes(plat) || !['over', 'quit', 'left'].includes(end)) return json({ error: 'bad report' }, 400, origin);
        const int = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number(v)) || 0));
        const now = Date.now();
        const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM runs WHERE player = ?1 AND created > ?2').bind(player, now - 86400000).first();
        if (recent && recent.n >= 300) return json({ error: 'Daily limit reached.' }, 429, origin);
        const data = JSON.stringify({ n: b.n, gap: b.gap, tut: b.tut, inp: b.inp, pk: b.pk, st: b.st, dt: b.dt });
        await env.DB.prepare('INSERT INTO runs (player, version, mode, plat, diff, start, two_p, stage, score, conts, dur, end_kind, created, data) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)')
          .bind(player, String(b.v || '').slice(0, 12), mode, plat, int(b.diff, 0, 2), int(b.start, 1, 300), b.twoP ? 1 : 0, int(b.stage, 1, 300), int(b.score, 0, 99999999), int(b.conts, 0, 9), int(b.dur, 0, 86400), end, now, data).run();
        return json({ ok: true }, 200, origin);
      }
      return json({ error: 'not found' }, 404, origin);
    } catch (e) {
      return json({ error: 'server error' }, 500, origin);
    }
  }
};
