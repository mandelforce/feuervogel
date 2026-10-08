// Unit tests for the leaderboard Worker's rules (worker.js). No browser or network needed.
// Run:  node --test tests/
// The database is a small fake that records what the Worker would write.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';

const ORIGIN = 'https://mandelforce.github.io';
const PLAYER = 'p-0123456789abcdef0123';

// A run that passes every check; each test changes one field.
const goodRun = () => ({ player: PLAYER, name: 'ACE', mode: 'camp', plat: 'pc', diff: 1, score: 50000, stage: 3, conts: 0, dur: 600, version: '1.2.0' });

function fakeDb({ recent = 0, today = 0 } = {}) {
  const inserts = [];
  const prep = sql => ({
    bind: (...args) => ({
      first: async () => {
        if (/COUNT/.test(sql) && args.length === 2 && /created > \?2/.test(sql)) return { n: args[1] > Date.now() - 60000 ? recent : today };
        return null;
      },
      all: async () => ({ results: [] }),
      run: async () => { inserts.push(args); },
    }),
  });
  return { db: { prepare: prep }, inserts };
}

async function submit(body, { origin = ORIGIN, ...dbOpts } = {}) {
  const { db, inserts } = fakeDb(dbOpts);
  const req = new Request('https://worker.test/submit', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const res = await worker.fetch(req, { DB: db });
  return { status: res.status, body: await res.json(), inserts };
}

test('a valid run is stored', async () => {
  const r = await submit(goodRun());
  assert.equal(r.status, 200);
  assert.equal(r.inserts.length, 1);
  const [player, name, mode, plat, diff, score, stage] = r.inserts[0];
  assert.deepEqual([player, name, mode, plat, diff, score, stage], [PLAYER, 'ACE', 'camp', 'pc', 1, 50000, 3]);
});

test('names: 12 characters max, limited character set, no bad words', async () => {
  assert.equal((await submit({ ...goodRun(), name: 'ABCDEFGHIJKL' })).status, 200);
  assert.equal((await submit({ ...goodRun(), name: 'ABCDEFGHIJKLM' })).status, 400);
  assert.equal((await submit({ ...goodRun(), name: '' })).status, 400);
  assert.equal((await submit({ ...goodRun(), name: 'a<b>' })).status, 400);
  assert.equal((await submit({ ...goodRun(), name: 'x-NaZi-x' })).status, 400);
  assert.equal((await submit({ ...goodRun(), name: '  ACE   ONE ' })).inserts[0][1], 'ACE ONE'); // trimmed, spaces collapsed
});

test('fairness: only Campaign runs from Stage 1 are ranked', async () => {
  assert.equal((await submit({ ...goodRun(), start: 3 })).status, 400);
  assert.equal((await submit({ ...goodRun(), start: 1 })).status, 200);
  assert.equal((await submit({ ...goodRun() })).status, 200); // start missing counts as Stage 1
  assert.equal((await submit({ ...goodRun(), mode: 'endless', start: 3 })).status, 200); // Endless has no such rule
});

test('fairness: at most 2 continues', async () => {
  assert.equal((await submit({ ...goodRun(), conts: 2 })).status, 200);
  assert.equal((await submit({ ...goodRun(), conts: 3 })).status, 400);
  assert.equal((await submit({ ...goodRun(), conts: -1 })).status, 400);
});

test('only known modes, platforms and difficulties', async () => {
  assert.equal((await submit({ ...goodRun(), mode: 'generative' })).status, 400);
  assert.equal((await submit({ ...goodRun(), plat: 'console' })).status, 400);
  assert.equal((await submit({ ...goodRun(), diff: 3 })).status, 400);
  assert.equal((await submit({ ...goodRun(), diff: 0 })).status, 200);
  assert.equal((await submit({ ...goodRun(), diff: 2 })).status, 200);
});

test('score plausibility', async () => {
  assert.equal((await submit({ ...goodRun(), score: 3 * 1500000 })).status, 200);
  assert.equal((await submit({ ...goodRun(), score: 3 * 1500000 + 1 })).status, 400);
  assert.equal((await submit({ ...goodRun(), score: -5 })).status, 400);
  assert.equal((await submit({ ...goodRun(), score: 'lots' })).status, 400);
  assert.equal((await submit({ ...goodRun(), stage: 0 })).status, 400);
  assert.equal((await submit({ ...goodRun(), dur: 3 * 45 - 1 })).status, 400); // too fast for 3 stages
  assert.equal((await submit({ ...goodRun(), dur: 3 * 45 })).status, 200);
});

test('player ids must look like the ones the game makes', async () => {
  assert.equal((await submit({ ...goodRun(), player: 'short' })).status, 400);
  assert.equal((await submit({ ...goodRun(), player: 'x'.repeat(41) })).status, 400);
});

test('rate limits', async () => {
  assert.equal((await submit(goodRun(), { recent: 1 })).status, 429);
  assert.equal((await submit(goodRun(), { today: 40 })).status, 429);
  assert.equal((await submit(goodRun(), { today: 39 })).status, 200);
});

test('submissions from other sites are refused; the board can still be read', async () => {
  assert.equal((await submit(goodRun(), { origin: 'https://evil.example' })).status, 403);
  const { db } = fakeDb();
  const res = await worker.fetch(new Request('https://worker.test/top?mode=camp&plat=pc&diff=1', { headers: { Origin: 'https://evil.example' } }), { DB: db });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN); // never echoes a foreign origin
});

test('/top rejects bad parameters', async () => {
  const { db } = fakeDb();
  for (const q of ['mode=x&diff=1', 'mode=camp&diff=7', 'mode=camp&diff=1&plat=toaster']) {
    const res = await worker.fetch(new Request('https://worker.test/top?' + q), { DB: db });
    assert.equal(res.status, 400, q);
  }
  assert.equal((await worker.fetch(new Request('https://worker.test/nope'), { DB: db })).status, 404);
});

// The week label decides which weekly board a score lands on. Checked at the ISO year boundaries.
test('weekly boards use ISO weeks', async () => {
  const realNow = Date.now;
  try {
    for (const [iso, week] of [['2026-01-01T12:00:00Z', '2026-W01'], ['2024-12-30T12:00:00Z', '2025-W01'], ['2021-01-03T12:00:00Z', '2020-W53'], ['2026-10-07T12:00:00Z', '2026-W41']]) {
      Date.now = () => Date.parse(iso);
      const r = await submit(goodRun());
      assert.equal(r.inserts[0][9], week, iso);
    }
  } finally { Date.now = realNow; }
});
