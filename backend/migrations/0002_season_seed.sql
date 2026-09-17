-- ===========================================================================
-- Season 1 + the daily challenge seed for launch day.
-- Data-only migration: safe to run on a populated database.
-- ===========================================================================

INSERT INTO seasons (name, theme, starts_at, ends_at, status, created_at)
VALUES (
  'Season 1 · Edge of the Frontier',
  'frost',
  '2026-01-01T00:00:00.000Z',
  '2026-12-31T23:59:59.000Z',
  'active',
  '2026-01-01T00:00:00.000Z'
);
