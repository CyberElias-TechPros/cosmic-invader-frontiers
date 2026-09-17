-- ===========================================================================
-- Local development seed data  ·  `npm run db:seed:local`
-- ===========================================================================
-- Local-only. Never run this against a remote database: it inserts fictional
-- pilots and pre-verified runs so a freshly migrated local database has
-- populated leaderboards, profiles and stats to develop against.
--
-- Demo rows are identifiable by:
--   players.id        LIKE 'demo_%'
--   runs.client       =  'demo-seed'
--   runs.replay_key   IS NULL      (no replay object exists in R2)
--
-- Remove them again with:  npm run dev:reset   (drops all local storage)
-- ===========================================================================

DELETE FROM player_achievements WHERE player_id LIKE 'demo_%';
DELETE FROM leaderboard_entries WHERE player_id LIKE 'demo_%';
DELETE FROM daily_results       WHERE player_id LIKE 'demo_%';
DELETE FROM runs                WHERE player_id LIKE 'demo_%';
DELETE FROM player_stats        WHERE player_id LIKE 'demo_%';
DELETE FROM players             WHERE id LIKE 'demo_%';

-- --- pilots ----------------------------------------------------------------
INSERT INTO players (
  id, handle, handle_lower, display_name, is_guest, role, xp, avatar_seed,
  preferences, banned, created_at, updated_at, last_seen_at
) VALUES
  ('demo_pilot_nexus',  'NEXUS-7',   'nexus-7',   'NEXUS-7',   0, 'player', 48210, 1177, '{"theme":"default","sound":true,"music":true,"screenShake":true}', 0, '2026-01-04T09:12:00.000Z', '2026-09-15T18:40:00.000Z', '2026-09-15T18:40:00.000Z'),
  ('demo_pilot_vega',   'VEGA',      'vega',      'VEGA',      0, 'player', 36480, 2203, '{"theme":"default","sound":true,"music":false,"screenShake":true}', 0, '2026-01-06T11:05:00.000Z', '2026-09-14T21:15:00.000Z', '2026-09-14T21:15:00.000Z'),
  ('demo_pilot_orpheus', 'ORPHEUS',  'orpheus',   'ORPHEUS',   0, 'player', 29875, 3301, '{"theme":"default","sound":true,"music":true,"screenShake":false}', 0, '2026-01-11T15:44:00.000Z', '2026-09-13T12:02:00.000Z', '2026-09-13T12:02:00.000Z'),
  ('demo_pilot_lyra',   'LYRA',      'lyra',      'LYRA',      0, 'player', 21040, 4412, '{"theme":"default","sound":true,"music":true,"screenShake":true}', 0, '2026-02-02T08:30:00.000Z', '2026-09-12T19:27:00.000Z', '2026-09-12T19:27:00.000Z'),
  ('demo_pilot_atlas',  'ATLAS',     'atlas',     'ATLAS',     0, 'player', 15420, 5523, '{"theme":"default","sound":true,"music":true,"screenShake":true}', 0, '2026-03-19T17:08:00.000Z', '2026-09-11T22:41:00.000Z', '2026-09-11T22:41:00.000Z'),
  ('demo_pilot_comet',  'COMET',     'comet',     'COMET',     0, 'player',  9130, 6634, '{"theme":"default","sound":false,"music":false,"screenShake":false}', 0, '2026-04-27T10:52:00.000Z', '2026-09-10T14:16:00.000Z', '2026-09-10T14:16:00.000Z');

-- --- runs ------------------------------------------------------------------
-- Scores/waves/ticks are internally consistent (ticks = duration at 60 Hz) so
-- the detail pages, stat tiles and share cards all render sensible numbers.
-- The share card renders from these columns, so it never re-simulates.
INSERT INTO runs (
  id, player_id, mode, difficulty, assist, ranked, score, wave, ticks, duration_ms,
  kills, boss_kills, ufos_destroyed, max_combo, lives_lost, damage_taken, accuracy,
  seed, engine, checksum, replay_key, replay_bytes, xp_awarded, daily_key, season_id,
  client, ip_hash, created_at
) VALUES
  ('run_demo_nexus_1',  'demo_pilot_nexus',  'campaign', 'ace',    0, 1, 184920, 21, 68240, 1137333, 412, 4, 7, 34, 2, 5, 0.612, 20831, '1.1.0', 'demo0000000001', NULL, 0, 9820, NULL, 1, 'demo-seed', NULL, '2026-09-15T18:40:00.000Z'),
  ('run_demo_nexus_2',  'demo_pilot_nexus',  'gauntlet','ace',   0, 1, 141700, 12, 51980, 866333, 318, 11, 3, 27, 3, 4, 0.574, 91422, '1.1.0', 'demo0000000002', NULL, 0, 7740, NULL, 1, 'demo-seed', NULL, '2026-09-14T18:05:00.000Z'),
  ('run_demo_vega_1',   'demo_pilot_vega',   'campaign', 'ace',    0, 1, 158340, 19, 61010, 1016833, 361, 3, 5, 29, 2, 6, 0.588, 4471,  '1.1.0', 'demo0000000003', NULL, 0, 8610, NULL, 1, 'demo-seed', NULL, '2026-09-14T21:15:00.000Z'),
  ('run_demo_vega_2',   'demo_pilot_vega',   'daily',    'pilot',  0, 1, 92410,  14, 40220, 670333, 233, 2, 4, 21, 1, 3, 0.641, 77310, '1.1.0', 'demo0000000004', NULL, 0, 5120, '2026-09-13', 1, 'demo-seed', NULL, '2026-09-13T07:22:00.000Z'),
  ('run_demo_orpheus_1','demo_pilot_orpheus','campaign', 'pilot',  0, 1, 121680, 17, 55240, 920667, 302, 3, 6, 25, 1, 2, 0.559, 55291, '1.1.0', 'demo0000000005', NULL, 0, 6480, NULL, 1, 'demo-seed', NULL, '2026-09-13T12:02:00.000Z'),
  ('run_demo_lyra_1',   'demo_pilot_lyra',   'campaign', 'pilot',  0, 1, 98730,  15, 47110, 785167, 254, 2, 5, 19, 2, 4, 0.601, 30119, '1.1.0', 'demo0000000006', NULL, 0, 5400, NULL, 1, 'demo-seed', NULL, '2026-09-12T19:27:00.000Z'),
  ('run_demo_lyra_2',   'demo_pilot_lyra',   'daily',    'ace',    0, 1, 76450,  11, 35640, 594000, 188, 1, 3, 16, 2, 5, 0.567, 88123, '1.1.0', 'demo0000000007', NULL, 0, 4180, '2026-09-12', 1, 'demo-seed', NULL, '2026-09-12T08:41:00.000Z'),
  ('run_demo_atlas_1',  'demo_pilot_atlas',  'campaign', 'pilot',  0, 1, 74220,  13, 39880, 664667, 196, 2, 2, 15, 3, 7, 0.538, 61209, '1.1.0', 'demo0000000008', NULL, 0, 4040, NULL, 1, 'demo-seed', NULL, '2026-09-11T22:41:00.000Z'),
  ('run_demo_comet_1',  'demo_pilot_comet',  'campaign', 'cadet',  1, 0, 41180,  9,  26410, 440167, 118, 1, 1, 11, 4, 9, 0.442, 12094, '1.1.0', 'demo0000000009', NULL, 0, 1980, NULL, 1, 'demo-seed', NULL, '2026-09-10T14:16:00.000Z');

-- --- aggregate stats -------------------------------------------------------
INSERT INTO player_stats (
  player_id, games_played, runs_submitted, best_score, total_score, total_kills,
  total_boss_kills, total_ufos, best_wave, best_combo, best_accuracy, total_play_ms,
  powerups_collected, dailies_completed, daily_streak, last_daily_key,
  gauntlet_bosses, ace_runs, legend_runs, updated_at
) VALUES
  ('demo_pilot_nexus',  84, 84, 184920, 2143180, 6821, 71, 96, 21, 34, 0.612, 5211000, 214, 31, 12, '2026-09-15', 44, 62, 9, '2026-09-15T18:40:00.000Z'),
  ('demo_pilot_vega',   63, 63, 158340, 1690470, 5104, 52, 71, 19, 29, 0.641, 4122000, 168, 24, 6,  '2026-09-13', 31, 41, 4, '2026-09-14T21:15:00.000Z'),
  ('demo_pilot_orpheus',51, 51, 121680, 1215040, 3902, 38, 55, 17, 25, 0.559, 3306000, 121, 19, 3,  '2026-09-13', 22, 27, 2, '2026-09-13T12:02:00.000Z'),
  ('demo_pilot_lyra',   38, 38, 98730,  884010,  2744, 24, 40, 15, 19, 0.601, 2412000, 88,  14, 2,  '2026-09-12', 13, 16, 1, '2026-09-12T19:27:00.000Z'),
  ('demo_pilot_atlas',  27, 27, 74220,  601140,  1806, 14, 27, 13, 15, 0.538, 1644000, 54,  9,  1,  '2026-09-11', 8,  9,  0, '2026-09-11T22:41:00.000Z'),
  ('demo_pilot_comet',  14, 14, 41180,  288260,   826,  6,  12, 9,  11, 0.442, 812000,  21,  4,  0,  '2026-09-10', 2,  1,  0, '2026-09-10T14:16:00.000Z');

-- --- leaderboard entries ---------------------------------------------------
-- One row per (board, period, player) — the same shape the ingest path writes,
-- so "your best" markers and around-me lookups behave exactly as in production.
INSERT INTO leaderboard_entries (
  board, period, player_id, run_id, score, wave, accuracy, duration_ms,
  mode, difficulty, created_at, updated_at
) VALUES
  ('campaign:all:alltime', 'alltime', 'demo_pilot_nexus',  'run_demo_nexus_1',  184920, 21, 0.612, 1137333, 'campaign', 'ace',   '2026-09-15T18:40:00.000Z', '2026-09-15T18:40:00.000Z'),
  ('campaign:all:alltime', 'alltime', 'demo_pilot_vega',   'run_demo_vega_1',   158340, 19, 0.588, 1016833, 'campaign', 'ace',   '2026-09-14T21:15:00.000Z', '2026-09-14T21:15:00.000Z'),
  ('campaign:all:alltime', 'alltime', 'demo_pilot_orpheus','run_demo_orpheus_1',121680, 17, 0.559, 920667,  'campaign', 'pilot', '2026-09-13T12:02:00.000Z', '2026-09-13T12:02:00.000Z'),
  ('campaign:all:alltime', 'alltime', 'demo_pilot_lyra',   'run_demo_lyra_1',    98730, 15, 0.601, 785167,  'campaign', 'pilot', '2026-09-12T19:27:00.000Z', '2026-09-12T19:27:00.000Z'),
  ('campaign:all:alltime', 'alltime', 'demo_pilot_atlas',  'run_demo_atlas_1',   74220, 13, 0.538, 664667,  'campaign', 'pilot', '2026-09-11T22:41:00.000Z', '2026-09-11T22:41:00.000Z'),
  ('campaign:all:alltime', 'alltime', 'demo_pilot_comet',  'run_demo_comet_1',   41180,  9, 0.442, 440167,  'campaign', 'cadet', '2026-09-10T14:16:00.000Z', '2026-09-10T14:16:00.000Z'),

  ('campaign:ace:alltime', 'alltime', 'demo_pilot_nexus',  'run_demo_nexus_1',  184920, 21, 0.612, 1137333, 'campaign', 'ace',   '2026-09-15T18:40:00.000Z', '2026-09-15T18:40:00.000Z'),
  ('campaign:ace:alltime', 'alltime', 'demo_pilot_vega',   'run_demo_vega_1',   158340, 19, 0.588, 1016833, 'campaign', 'ace',   '2026-09-14T21:15:00.000Z', '2026-09-14T21:15:00.000Z'),
  ('campaign:ace:alltime', 'alltime', 'demo_pilot_orpheus','run_demo_orpheus_1',121680, 17, 0.559, 920667,  'campaign', 'pilot', '2026-09-13T12:02:00.000Z', '2026-09-13T12:02:00.000Z'),
  ('campaign:ace:alltime', 'alltime', 'demo_pilot_lyra',   'run_demo_lyra_1',    98730, 15, 0.601, 785167,  'campaign', 'pilot', '2026-09-12T19:27:00.000Z', '2026-09-12T19:27:00.000Z'),
  ('campaign:ace:alltime', 'alltime', 'demo_pilot_atlas',  'run_demo_atlas_1',   74220, 13, 0.538, 664667,  'campaign', 'pilot', '2026-09-11T22:41:00.000Z', '2026-09-11T22:41:00.000Z'),
  ('campaign:ace:alltime', 'alltime', 'demo_pilot_comet',  'run_demo_comet_1',   41180,  9, 0.442, 440167,  'campaign', 'cadet', '2026-09-10T14:16:00.000Z', '2026-09-10T14:16:00.000Z'),

  ('gauntlet:all:alltime', 'alltime', 'demo_pilot_nexus',  'run_demo_nexus_2',  141700, 12, 0.574, 866333,  'gauntlet', 'ace',   '2026-09-14T18:05:00.000Z', '2026-09-14T18:05:00.000Z'),

  ('campaign:all:weekly', 'weekly', 'demo_pilot_nexus',  'run_demo_nexus_1',  184920, 21, 0.612, 1137333, 'campaign', 'ace',   '2026-09-15T18:40:00.000Z', '2026-09-15T18:40:00.000Z'),
  ('campaign:all:weekly', 'weekly', 'demo_pilot_vega',   'run_demo_vega_1',   158340, 19, 0.588, 1016833, 'campaign', 'ace',   '2026-09-14T21:15:00.000Z', '2026-09-14T21:15:00.000Z'),
  ('campaign:all:weekly', 'weekly', 'demo_pilot_orpheus','run_demo_orpheus_1',121680, 17, 0.559, 920667,  'campaign', 'pilot', '2026-09-13T12:02:00.000Z', '2026-09-13T12:02:00.000Z'),
  ('campaign:all:weekly', 'weekly', 'demo_pilot_lyra',   'run_demo_lyra_1',    98730, 15, 0.601, 785167,  'campaign', 'pilot', '2026-09-12T19:27:00.000Z', '2026-09-12T19:27:00.000Z'),
  ('campaign:all:weekly', 'weekly', 'demo_pilot_atlas',  'run_demo_atlas_1',   74220, 13, 0.538, 664667,  'campaign', 'pilot', '2026-09-11T22:41:00.000Z', '2026-09-11T22:41:00.000Z'),
  ('campaign:all:weekly', 'weekly', 'demo_pilot_comet',  'run_demo_comet_1',   41180,  9, 0.442, 440167,  'campaign', 'cadet', '2026-09-10T14:16:00.000Z', '2026-09-10T14:16:00.000Z');

-- --- daily results ---------------------------------------------------------
INSERT INTO daily_results (daily_key, player_id, run_id, score, wave, bonus_xp, completed_at) VALUES
  ('2026-09-13', 'demo_pilot_vega', 'run_demo_vega_2', 92410, 14, 250, '2026-09-13T07:22:00.000Z'),
  ('2026-09-12', 'demo_pilot_lyra', 'run_demo_lyra_2', 76450, 11, 250, '2026-09-12T08:41:00.000Z');

-- --- achievements ----------------------------------------------------------
INSERT INTO player_achievements (player_id, achievement_id, unlocked_at, run_id) VALUES
  ('demo_pilot_nexus',  'first-blood',        '2026-01-04T09:20:00.000Z', 'run_demo_nexus_1'),
  ('demo_pilot_nexus',  'centurion',          '2026-02-11T20:14:00.000Z', NULL),
  ('demo_pilot_nexus',  'exterminator',       '2026-03-02T17:02:00.000Z', NULL),
  ('demo_pilot_nexus',  'armada-breaker',     '2026-05-19T21:48:00.000Z', NULL),
  ('demo_pilot_nexus',  'dreadnought-slayer', '2026-07-08T19:33:00.000Z', NULL),
  ('demo_pilot_nexus',  'boss-hunter',        '2026-04-01T12:12:00.000Z', NULL),
  ('demo_pilot_nexus',  'saucer-down',        '2026-01-22T10:41:00.000Z', NULL),
  ('demo_pilot_nexus',  'ufo-hunter',         '2026-06-14T15:09:00.000Z', NULL),
  ('demo_pilot_vega',   'first-blood',        '2026-01-06T11:20:00.000Z', 'run_demo_vega_1'),
  ('demo_pilot_vega',   'centurion',          '2026-03-08T09:47:00.000Z', NULL),
  ('demo_pilot_vega',   'exterminator',       '2026-05-02T18:26:00.000Z', NULL),
  ('demo_pilot_vega',   'boss-hunter',        '2026-02-17T13:55:00.000Z', NULL),
  ('demo_pilot_orpheus','first-blood',        '2026-01-11T16:02:00.000Z', 'run_demo_orpheus_1'),
  ('demo_pilot_orpheus','centurion',          '2026-04-21T11:39:00.000Z', NULL),
  ('demo_pilot_lyra',   'first-blood',        '2026-02-02T09:01:00.000Z', 'run_demo_lyra_1'),
  ('demo_pilot_lyra',   'saucer-down',        '2026-03-27T20:18:00.000Z', NULL),
  ('demo_pilot_atlas',  'first-blood',        '2026-03-19T17:52:00.000Z', 'run_demo_atlas_1'),
  ('demo_pilot_comet',  'first-blood',        '2026-04-27T11:07:00.000Z', 'run_demo_comet_1');
