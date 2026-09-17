-- ===========================================================================
-- Cosmic Invader Frontiers — initial schema
-- Cloudflare D1 (SQLite)
-- ===========================================================================

-- --------------------------------------------------------------------------
-- Players. A row is created the moment a visitor starts playing (guest) and is
-- upgraded in place when they register, so progress is never lost.
-- --------------------------------------------------------------------------
CREATE TABLE players (
  id              TEXT PRIMARY KEY,
  handle          TEXT NOT NULL,
  handle_lower    TEXT NOT NULL UNIQUE,
  display_name    TEXT NOT NULL,
  email           TEXT,
  email_verified  INTEGER NOT NULL DEFAULT 0,
  password_hash   TEXT,
  password_salt   TEXT,
  password_algo   TEXT,
  password_iter   INTEGER,
  is_guest        INTEGER NOT NULL DEFAULT 1,
  role            TEXT NOT NULL DEFAULT 'player',      -- player | moderator | admin
  xp              INTEGER NOT NULL DEFAULT 0,
  avatar_seed     INTEGER NOT NULL DEFAULT 0,
  country         TEXT,
  preferences     TEXT NOT NULL DEFAULT '{}',
  banned          INTEGER NOT NULL DEFAULT 0,
  ban_reason      TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  last_seen_at    TEXT NOT NULL
);
CREATE UNIQUE INDEX players_email_unique ON players(email) WHERE email IS NOT NULL;
CREATE INDEX players_xp_idx ON players(xp DESC);
CREATE INDEX players_last_seen_idx ON players(last_seen_at DESC);
CREATE INDEX players_guest_idx ON players(is_guest, created_at);

-- --------------------------------------------------------------------------
-- Sessions: opaque rotating refresh tokens (only the SHA-256 hash is stored).
-- --------------------------------------------------------------------------
CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,
  player_id     TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,
  rotated_from  TEXT,
  device        TEXT,
  ip_hash       TEXT,
  created_at    TEXT NOT NULL,
  last_used_at  TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  revoked_at    TEXT,
  revoked_reason TEXT
);
CREATE INDEX sessions_player_idx ON sessions(player_id);
CREATE INDEX sessions_expires_idx ON sessions(expires_at);

-- --------------------------------------------------------------------------
-- Verified runs. Everything here comes from server-side replay simulation,
-- never from the client.
-- --------------------------------------------------------------------------
CREATE TABLE runs (
  id                TEXT PRIMARY KEY,
  player_id         TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  mode              TEXT NOT NULL,                      -- campaign | daily | gauntlet
  difficulty        TEXT NOT NULL,                      -- cadet | pilot | ace | legend
  assist            INTEGER NOT NULL DEFAULT 0,
  ranked            INTEGER NOT NULL DEFAULT 1,
  score             INTEGER NOT NULL,
  wave              INTEGER NOT NULL,
  ticks             INTEGER NOT NULL,
  duration_ms       INTEGER NOT NULL,
  kills             INTEGER NOT NULL DEFAULT 0,
  boss_kills        INTEGER NOT NULL DEFAULT 0,
  ufos_destroyed    INTEGER NOT NULL DEFAULT 0,
  max_combo         INTEGER NOT NULL DEFAULT 0,
  lives_lost        INTEGER NOT NULL DEFAULT 0,
  damage_taken      INTEGER NOT NULL DEFAULT 0,
  accuracy          REAL NOT NULL DEFAULT 0,
  seed              INTEGER NOT NULL,
  engine            TEXT NOT NULL,
  checksum          TEXT NOT NULL,
  replay_key        TEXT,
  replay_bytes      INTEGER NOT NULL DEFAULT 0,
  xp_awarded        INTEGER NOT NULL DEFAULT 0,
  daily_key         TEXT,
  season_id         INTEGER,
  client            TEXT,
  ip_hash           TEXT,
  created_at        TEXT NOT NULL
);
CREATE INDEX runs_player_idx ON runs(player_id, created_at DESC);
CREATE INDEX runs_board_idx ON runs(mode, difficulty, ranked, score DESC);
CREATE INDEX runs_daily_idx ON runs(daily_key, score DESC);
CREATE INDEX runs_created_idx ON runs(created_at DESC);
CREATE UNIQUE INDEX runs_checksum_idx ON runs(player_id, checksum);

-- Rejected submissions are kept (without a replay) so we can spot abuse and
-- so a buggy client build can be diagnosed without guessing.
CREATE TABLE rejected_runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id     TEXT,
  reason        TEXT NOT NULL,
  detail        TEXT,
  claimed_score INTEGER,
  mode          TEXT,
  difficulty    TEXT,
  seed          INTEGER,
  ticks         INTEGER,
  client        TEXT,
  ip_hash       TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX rejected_runs_created_idx ON rejected_runs(created_at DESC);

-- --------------------------------------------------------------------------
-- Materialised leaderboards: one best row per player per board/period.
-- Boards look like: campaign:all:alltime, campaign:ace:weekly, daily:2026-09-16
-- --------------------------------------------------------------------------
CREATE TABLE leaderboard_entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  board       TEXT NOT NULL,
  period      TEXT NOT NULL,                            -- alltime | weekly | monthly | daily
  player_id   TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  run_id      TEXT NOT NULL,
  score       INTEGER NOT NULL,
  wave        INTEGER NOT NULL,
  accuracy    REAL NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  mode        TEXT NOT NULL,
  difficulty  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  UNIQUE (board, period, player_id)
);
CREATE INDEX leaderboard_rank_idx ON leaderboard_entries(board, period, score DESC, updated_at ASC);
CREATE INDEX leaderboard_player_idx ON leaderboard_entries(player_id, period);

-- --------------------------------------------------------------------------
-- Achievements (catalogue lives in code; unlocks live here).
-- --------------------------------------------------------------------------
CREATE TABLE player_achievements (
  player_id       TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  achievement_id  TEXT NOT NULL,
  unlocked_at     TEXT NOT NULL,
  run_id          TEXT,
  PRIMARY KEY (player_id, achievement_id)
);
CREATE INDEX player_achievements_time_idx ON player_achievements(unlocked_at DESC);

-- --------------------------------------------------------------------------
-- Lifetime aggregates — kept in a single row per player so dashboards are one
-- indexed read instead of an aggregate scan over `runs`.
-- --------------------------------------------------------------------------
CREATE TABLE player_stats (
  player_id          TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  games_played       INTEGER NOT NULL DEFAULT 0,
  runs_submitted     INTEGER NOT NULL DEFAULT 0,
  best_score         INTEGER NOT NULL DEFAULT 0,
  total_score        INTEGER NOT NULL DEFAULT 0,
  total_kills        INTEGER NOT NULL DEFAULT 0,
  total_boss_kills   INTEGER NOT NULL DEFAULT 0,
  total_ufos         INTEGER NOT NULL DEFAULT 0,
  best_wave          INTEGER NOT NULL DEFAULT 0,
  best_combo         INTEGER NOT NULL DEFAULT 0,
  best_accuracy      REAL NOT NULL DEFAULT 0,
  total_play_ms      INTEGER NOT NULL DEFAULT 0,
  powerups_collected INTEGER NOT NULL DEFAULT 0,
  dailies_completed  INTEGER NOT NULL DEFAULT 0,
  daily_streak       INTEGER NOT NULL DEFAULT 0,
  last_daily_key     TEXT,
  gauntlet_bosses    INTEGER NOT NULL DEFAULT 0,
  ace_runs           INTEGER NOT NULL DEFAULT 0,
  legend_runs        INTEGER NOT NULL DEFAULT 0,
  updated_at         TEXT NOT NULL
);

-- --------------------------------------------------------------------------
-- Daily Sortie: materialised challenge definition + a per-player result row.
-- --------------------------------------------------------------------------
CREATE TABLE daily_challenges (
  daily_key   TEXT PRIMARY KEY,
  seed        INTEGER NOT NULL,
  difficulty  TEXT NOT NULL,
  modifier    TEXT NOT NULL,
  par_score   INTEGER NOT NULL,
  bonus_xp    INTEGER NOT NULL,
  starts_at   TEXT NOT NULL,
  ends_at     TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE daily_results (
  daily_key    TEXT NOT NULL,
  player_id    TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  run_id       TEXT NOT NULL,
  score        INTEGER NOT NULL,
  wave         INTEGER NOT NULL,
  bonus_xp     INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT NOT NULL,
  PRIMARY KEY (daily_key, player_id)
);
CREATE INDEX daily_results_rank_idx ON daily_results(daily_key, score DESC);

-- --------------------------------------------------------------------------
-- Cloud save (cross-device progression sync) with revision history.
-- --------------------------------------------------------------------------
CREATE TABLE saves (
  player_id   TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  payload     TEXT NOT NULL,
  version     INTEGER NOT NULL DEFAULT 1,
  checksum    TEXT,
  device      TEXT,
  updated_at  TEXT NOT NULL
);

CREATE TABLE save_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id  TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  version    INTEGER NOT NULL,
  payload    TEXT NOT NULL,
  device     TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX save_history_player_idx ON save_history(player_id, version DESC);

-- --------------------------------------------------------------------------
-- Telemetry + audit trail
-- --------------------------------------------------------------------------
CREATE TABLE telemetry_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id  TEXT,
  name       TEXT NOT NULL,
  props      TEXT NOT NULL DEFAULT '{}',
  session_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX telemetry_name_idx ON telemetry_events(name, created_at DESC);

CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id    TEXT,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  meta        TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL
);
CREATE INDEX audit_log_time_idx ON audit_log(created_at DESC);

-- --------------------------------------------------------------------------
-- Moderation + abuse control
-- --------------------------------------------------------------------------
CREATE TABLE reports (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id       TEXT NOT NULL,
  reporter_id  TEXT,
  reason       TEXT NOT NULL,
  detail       TEXT,
  status       TEXT NOT NULL DEFAULT 'open',            -- open | dismissed | actioned
  resolved_by  TEXT,
  resolved_at  TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX reports_status_idx ON reports(status, created_at DESC);

CREATE TABLE auth_attempts (
  scope        TEXT NOT NULL,                            -- login | register | guest | reset
  key          TEXT NOT NULL,                            -- ip hash or identity hash
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, key, window_start)
);
CREATE INDEX auth_attempts_window_idx ON auth_attempts(window_start);

-- --------------------------------------------------------------------------
-- Seasons drive the seasonal leaderboard + reward framing.
-- --------------------------------------------------------------------------
CREATE TABLE seasons (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  theme      TEXT,
  starts_at  TEXT NOT NULL,
  ends_at    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'upcoming',           -- upcoming | active | archived
  created_at TEXT NOT NULL
);
CREATE INDEX seasons_status_idx ON seasons(status, ends_at);

-- --------------------------------------------------------------------------
-- Materialised leaderboard snapshots (used for "season recap" + fast archives)
-- --------------------------------------------------------------------------
CREATE TABLE leaderboard_snapshots (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  board       TEXT NOT NULL,
  period      TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  payload     TEXT NOT NULL
);
CREATE INDEX snapshots_board_idx ON leaderboard_snapshots(board, period, captured_at DESC);
