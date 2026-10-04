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
