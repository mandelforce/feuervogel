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
