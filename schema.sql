CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player TEXT NOT NULL,
  name TEXT NOT NULL,
  mode TEXT NOT NULL,
  plat TEXT NOT NULL DEFAULT 'mobile',
  diff INTEGER NOT NULL,
  score INTEGER NOT NULL,
  stage INTEGER NOT NULL,
  version TEXT,
  created INTEGER NOT NULL,
  week TEXT NOT NULL,
  conts INTEGER NOT NULL DEFAULT 0,
  start INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_all ON scores (mode, plat, diff, score DESC);
CREATE INDEX IF NOT EXISTS idx_week ON scores (mode, plat, diff, week, score DESC);
CREATE INDEX IF NOT EXISTS idx_player ON scores (player, created);

-- Run reports: anonymous play data, one row per run (separate from scores; never used for the boards)
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player TEXT NOT NULL,
  version TEXT,
  mode TEXT NOT NULL,
  plat TEXT NOT NULL,
  diff INTEGER NOT NULL,
  start INTEGER NOT NULL,
  two_p INTEGER NOT NULL DEFAULT 0,
  stage INTEGER NOT NULL,
  score INTEGER NOT NULL,
  conts INTEGER NOT NULL,
  dur INTEGER NOT NULL,
  end_kind TEXT NOT NULL,
  created INTEGER NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_runs_player ON runs (player, created);
CREATE INDEX IF NOT EXISTS idx_runs_mode ON runs (mode, diff, created);

-- Daily Sortie ratings (1 to 5 stars): one row per player, date and composer version; a later rating replaces the earlier one.
-- Run once on the live database (wrangler d1 execute <db> --file schema.sql is safe: every statement is IF NOT EXISTS).
CREATE TABLE IF NOT EXISTS daily_ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player TEXT NOT NULL,
  date TEXT NOT NULL,
  cv INTEGER NOT NULL,
  kit TEXT NOT NULL,
  sub INTEGER NOT NULL DEFAULT 0,
  diff INTEGER NOT NULL,
  plat TEXT NOT NULL,
  stars INTEGER NOT NULL,
  score INTEGER NOT NULL,
  dur INTEGER NOT NULL,
  version TEXT,
  created INTEGER NOT NULL,
  twist TEXT,
  flavour TEXT,
  UNIQUE (player, date, cv)
);
-- A live database made before composer v3 (twists, plan section 11) has no twist and flavour columns: run these two lines ONCE (SQLite has no IF NOT EXISTS for a column, so they are not part of the safe re-run).
-- The Worker keeps working before that (it stores the rating without them); a rating can be read against what was different that day once they exist.
-- ALTER TABLE daily_ratings ADD COLUMN twist TEXT;
-- ALTER TABLE daily_ratings ADD COLUMN flavour TEXT;
CREATE INDEX IF NOT EXISTS idx_ratings_date ON daily_ratings (date, kit);
