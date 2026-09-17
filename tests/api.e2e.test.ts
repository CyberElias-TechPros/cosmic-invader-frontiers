import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ARENA,
  COMBAT,
  buildReplayPayload,
  createSim,
  packInput,
  stepSim,
  type InputState,
  type ReplayFrame,
  type SimState,
} from '../shared/game';
import { currentDailyKey, dailyChallenge } from '../shared/game/daily';

/**
 * Full-stack end-to-end suite: real Worker (workerd), real D1, KV, R2, Queues
 * and Durable Objects, driven over HTTP exactly like the browser client.
 */

const PORT = Number(process.env.E2E_API_PORT ?? 8788);
const BASE = process.env.E2E_API_BASE ?? `http://127.0.0.1:${PORT}`;
const API = `${BASE}/api/v1`;

/**
 * The bootstrap token lives in the git-ignored `backend/.dev.vars`. The global
 * setup generates that file when it is missing (clean checkout, CI) and
 * publishes the resolved value here, so these tests never pin a local secret.
 */
const BOOTSTRAP_TOKEN = process.env.E2E_BOOTSTRAP_TOKEN ?? 'dev-bootstrap-token';

interface Tokens {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}

interface Envelope<T> {
  ok: boolean;
  data: T;
  meta: Record<string, unknown>;
  error?: { code: string; message: string; details?: unknown };
}

async function call<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string; headers?: Record<string, string> } = {},
): Promise<{ status: number; envelope: Envelope<T> }> {
  const response = await fetch(`${API}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers ?? {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const envelope = (await response.json()) as Envelope<T>;
  return { status: response.status, envelope };
}

/* -------------------------------------------------------------------------- */
/*  A deterministic "bot pilot" so replays are reproducible                    */
/* -------------------------------------------------------------------------- */

function botInput(state: SimState): InputState {
  const player = state.player;
  const px = player.x + player.w / 2;
  let targetX = ARENA.width / 2;
  let bestY = -Infinity;
  for (const enemy of state.enemies) {
    if (enemy.y > bestY) {
      bestY = enemy.y;
      targetX = enemy.x + enemy.w / 2;
    }
  }
  if (state.boss) targetX = state.boss.x + state.boss.w / 2;
  if (state.ufo) targetX = state.ufo.x + state.ufo.w / 2;

  let threatX: number | null = null;
  for (const bullet of state.bullets) {
    if (bullet.from !== 'enemy') continue;
    if (bullet.y > player.y - 150 && Math.abs(bullet.x + bullet.w / 2 - px) < 26) threatX = bullet.x;
  }
  const desired = threatX !== null ? (threatX < px ? px + 90 : px - 90) : targetX;
  const dx = desired - px;
  return {
    left: dx < -8,
    right: dx > 8,
    fire: true,
    special: state.player.overdriveCharge >= COMBAT.overdriveCost,
  };
}

function recordRun(
  seed: number,
  difficulty: 'cadet' | 'pilot' | 'ace' | 'legend',
  mode: 'campaign' | 'daily' | 'gauntlet',
  maxTicks = 20_000,
  assistMode = false,
) {
  const state = createSim({ seed, mode, difficulty, assistMode });
  const frames: ReplayFrame[] = [];
  let lastBits = -1;
  for (let tick = 0; tick < maxTicks; tick++) {
    if (state.status === 'gameOver') break;
    const input = botInput(state);
    const bits = packInput(input);
    if (bits !== lastBits) {
      frames.push({ t: tick, bits });
      lastBits = bits;
    }
    stepSim(state, input);
  }
  return {
    state,
    frames,
    payload: buildReplayPayload({
      mode,
      difficulty,
      assist: assistMode,
      seed,
      ticks: state.tick,
      frames,
      claims: {
        score: state.score,
        wave: state.wave,
        ticks: state.tick,
        kills: state.stats.kills,
        bossKills: state.stats.bossKills,
        ufosDestroyed: state.stats.ufosDestroyed,
        maxCombo: state.stats.maxCombo,
        livesLost: state.stats.livesLost,
        accuracy: state.stats.shotsFired === 0 ? 0 : state.stats.shotsHit / state.stats.shotsFired,
      },
      client: 'vitest-e2e',
    }),
  };
}

/* -------------------------------------------------------------------------- */

let guest: Tokens;
let guestHandle = '';

beforeAll(async () => {
  const health = await call<{ status: string }>('/health');
  if (health.status !== 200) {
    throw new Error(`API is not healthy at ${BASE}. Start it with \`npm run dev:api\` or run \`npm run test:e2e\`.`);
  }
  const guestResponse = await call<{ player: { id: string; handle: string }; tokens: Tokens }>('/auth/guest', {
    method: 'POST',
    body: { device: 'vitest' },
  });
  expect(guestResponse.status).toBe(201);
  guest = guestResponse.envelope.data.tokens;
  guestHandle = guestResponse.envelope.data.player.handle;
});

afterAll(async () => {
  if (guest?.accessToken) {
    await call('/auth/logout', { method: 'POST', token: guest.accessToken }).catch(() => undefined);
  }
});

describe('platform health + config', () => {
  it('reports healthy bindings', async () => {
    const { status, envelope } = await call<{ status: string; checks: Record<string, { ok: boolean }> }>('/health');
    expect(status).toBe(200);
    expect(envelope.data.status).toBe('healthy');
    expect(envelope.data.checks.database.ok).toBe(true);
    expect(envelope.data.checks.cache.ok).toBe(true);
    expect(envelope.data.checks.storage.ok).toBe(true);
  });

  it('exposes the client contract', async () => {
    const { envelope } = await call<{ engineVersion: string; ingestEnabled: boolean; daily: { seed: number } }>('/config');
    expect(envelope.data.ingestEnabled).toBe(true);
    expect(envelope.data.engineVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(envelope.data.daily.seed).toBeGreaterThan(0);
  });

  it('serves the public stats and spotlight feeds', async () => {
    const stats = await call<{ players: number }>('/stats');
    expect(stats.status).toBe(200);
    expect(stats.envelope.data.players).toBeGreaterThan(0);
    const spotlight = await call<{ top: unknown[] }>('/spotlight');
    expect(spotlight.status).toBe(200);
    expect(Array.isArray(spotlight.envelope.data.top)).toBe(true);
  });

  it('rejects unknown routes with the standard error envelope', async () => {
    const { status, envelope } = await call('/nope');
    expect(status).toBe(404);
    expect(envelope.ok).toBe(false);
    expect(envelope.error?.code).toBe('not_found');
  });
});

describe('identity + sessions', () => {
  it('creates a guest pilot with a session', async () => {
    const { status, envelope } = await call<{ player: { id: string; isGuest: boolean }; tokens: Tokens }>('/auth/guest', {
      method: 'POST',
      body: {},
    });
    expect(status).toBe(201);
    expect(envelope.data.player.isGuest).toBe(true);
    expect(envelope.data.tokens.accessToken.length).toBeGreaterThan(20);
    expect(envelope.data.tokens.refreshToken.length).toBeGreaterThan(20);
  });

  it('returns the authenticated profile', async () => {
    const { status, envelope } = await call<{ handle: string; progression: { level: number } }>('/me', { token: guest.accessToken });
    expect(status).toBe(200);
    expect(envelope.data.handle).toBe(guestHandle);
    expect(envelope.data.progression.level).toBe(1);
  });

  it('refuses protected routes without a token', async () => {
    const { status, envelope } = await call('/me');
    expect(status).toBe(401);
    expect(envelope.error?.code).toBe('unauthorized');
  });

  it('rotates refresh tokens and detects reuse (revoking the family)', async () => {
    // A disposable identity: reuse detection intentionally nukes every session
    // in the family, so this must not disturb the shared test pilot.
    const disposable = await call<{ tokens: Tokens }>('/auth/guest', { method: 'POST', body: {} });
    const original = disposable.envelope.data.tokens;

    const first = await call<{ tokens: Tokens }>('/auth/refresh', {
      method: 'POST',
      body: { refreshToken: original.refreshToken },
    });
    expect(first.status).toBe(200);
    const rotated = first.envelope.data.tokens;
    expect(rotated.refreshToken).not.toBe(original.refreshToken);

    // Access tokens issued for the rotated session still work.
    const stillValid = await call('/me', { token: rotated.accessToken });
    expect(stillValid.status).toBe(200);

    const replayAttempt = await call('/auth/refresh', { method: 'POST', body: { refreshToken: original.refreshToken } });
    expect(replayAttempt.status).toBe(401);

    // Reuse detected → whole family revoked, including the rotated token.
    const afterReuse = await call('/auth/refresh', { method: 'POST', body: { refreshToken: rotated.refreshToken } });
    expect(afterReuse.status).toBe(401);
    const revoked = await call('/me', { token: rotated.accessToken });
    expect(revoked.status).toBe(401);
  });

  it('registers, logs in and upgrades a guest without losing progress', async () => {
    const email = `pilot-${Date.now()}@example.com`;
    const registered = await call<{ player: { id: string }; tokens: Tokens }>('/auth/register', {
      method: 'POST',
      body: { email, password: 'frontier-2026', acceptTerms: true, displayName: 'Test Pilot' },
    });
    expect(registered.status).toBe(201);

    const duplicate = await call('/auth/register', {
      method: 'POST',
      body: { email, password: 'frontier-2026', acceptTerms: true },
    });
    expect(duplicate.status).toBe(409);

    const login = await call<{ tokens: Tokens }>('/auth/login', { method: 'POST', body: { email, password: 'frontier-2026' } });
    expect(login.status).toBe(200);

    const wrongPassword = await call('/auth/login', { method: 'POST', body: { email, password: 'wrong-password-1' } });
    expect(wrongPassword.status).toBe(401);

    const weak = await call('/auth/register', {
      method: 'POST',
      body: { email: `weak-${Date.now()}@example.com`, password: 'short', acceptTerms: true },
    });
    expect(weak.status).toBe(422);

    const terms = await call('/auth/register', {
      method: 'POST',
      body: { email: `terms-${Date.now()}@example.com`, password: 'frontier-2026' },
    });
    expect(terms.status).toBe(422);

    // Guest upgrade path keeps the same player id (disposable identity again:
    // upgrading rotates every token for security).
    const guestToUpgrade = await call<{ player: { id: string }; tokens: Tokens }>('/auth/guest', { method: 'POST', body: {} });
    const beforeId = guestToUpgrade.envelope.data.player.id;
    const upgrade = await call<{ player: { id: string; isGuest: boolean; email: string }; tokens: Tokens }>('/auth/upgrade', {
      method: 'POST',
      token: guestToUpgrade.envelope.data.tokens.accessToken,
      body: { email: `upgraded-${Date.now()}@example.com`, password: 'frontier-2026', acceptTerms: true },
    });
    expect(upgrade.status).toBe(200);
    expect(upgrade.envelope.data.player.id).toBe(beforeId);
    expect(upgrade.envelope.data.player.isGuest).toBe(false);

    // The old guest token is dead, the freshly issued one works.
    const stale = await call('/me', { token: guestToUpgrade.envelope.data.tokens.accessToken });
    expect(stale.status).toBe(401);
    const fresh = await call<{ isGuest: boolean }>('/me', { token: upgrade.envelope.data.tokens.accessToken });
    expect(fresh.status).toBe(200);
    expect(fresh.envelope.data.isGuest).toBe(false);
  });
});

describe('run submission + verification', () => {
  it('verifies an honest run and ranks it', async () => {
    const run = recordRun(4242, 'pilot', 'campaign');
    const { status, envelope } = await call<{
      run: { id: string; score: number; ranked: boolean };
      ranking: { rank: number | null; total: number | null };
      xp: { awarded: number; level: number };
      verification: { ticks: number };
    }>('/runs', { method: 'POST', token: guest.accessToken, body: { replay: run.payload } });

    expect(status).toBe(201);
    expect(envelope.data.run.score).toBe(run.state.score);
    expect(envelope.data.run.ranked).toBe(true);
    expect(envelope.data.ranking.rank).toBeGreaterThanOrEqual(1);
    expect(envelope.data.ranking.total).toBeGreaterThanOrEqual(envelope.data.ranking.rank!);
    expect(envelope.data.xp.awarded).toBeGreaterThan(0);
    expect(envelope.data.verification.ticks).toBeGreaterThan(100);
  });

  it('rejects a doctored score with replay_rejected', async () => {
    const run = recordRun(777, 'pilot', 'campaign');
    const tampered = { ...run.payload, claims: { ...run.payload.claims, score: run.payload.claims.score + 500_000 } };
    const { status, envelope } = await call<{ reason: string }>('/runs', {
      method: 'POST',
      token: guest.accessToken,
      body: { replay: tampered },
    });
    expect(status).toBe(422);
    expect(envelope.error?.code).toBe('replay_rejected');
    expect(envelope.error?.details).toMatchObject({ reason: 'score-mismatch' });
  });

  it('is idempotent for a re-submitted replay', async () => {
    const run = recordRun(31337, 'cadet', 'campaign');
    const first = await call<{ run: { id: string } }>('/runs', { method: 'POST', token: guest.accessToken, body: { replay: run.payload } });
    expect(first.status).toBe(201);
    const second = await call<{ flags: string[]; xp: { awarded: number } }>('/runs', {
      method: 'POST',
      token: guest.accessToken,
      body: { replay: run.payload },
    });
    expect(second.status).toBe(201);
    expect(second.envelope.data.flags).toContain('duplicate');
    expect(second.envelope.data.xp.awarded).toBe(0);
  });

  it('enforces gauntlet difficulty lock', async () => {
    const run = recordRun(99, 'pilot', 'gauntlet');
    const { status, envelope } = await call('/runs', { method: 'POST', token: guest.accessToken, body: { replay: run.payload } });
    expect(status).toBe(422);
    expect(envelope.error?.code).toBe('validation_failed');
  });

  it('exposes the run, its replay and a share card', async () => {
    const run = recordRun(5150, 'ace', 'campaign');
    const submitted = await call<{ run: { id: string } }>('/runs', {
      method: 'POST',
      token: guest.accessToken,
      body: { replay: run.payload },
    });
    const runId = submitted.envelope.data.run.id;

    const detail = await call<{ run: { id: string }; replayAvailable: boolean }>(`/runs/${runId}`, { token: guest.accessToken });
    expect(detail.status).toBe(200);
    expect(detail.envelope.data.run.id).toBe(runId);

    const recent = await call<unknown[]>('/runs/recent');
    expect(recent.status).toBe(200);
    expect(recent.envelope.data.length).toBeGreaterThan(0);

    const card = await fetch(`${API}/share/${runId}.svg`);
    expect(card.status).toBe(200);
    expect(card.headers.get('content-type')).toContain('image/svg+xml');
    const svg = await card.text();
    expect(svg).toContain('<svg');
    expect(svg).toContain('VERIFIED SORTIE');
  });

  it('records unranked assisted submissions without ranking them', async () => {
    const assisted = recordRun(2468, 'cadet', 'campaign', 20_000, true);
    const { status, envelope } = await call<{ run: { ranked: boolean }; flags: string[] }>('/runs', {
      method: 'POST',
      token: guest.accessToken,
      body: { replay: assisted.payload },
    });
    expect(status).toBe(201);
    expect(envelope.data.run.ranked).toBe(false);
    expect(envelope.data.flags).toContain('assisted');
  });

  it('rejects malformed submissions before simulation', async () => {
    const { status, envelope } = await call('/runs', {
      method: 'POST',
      token: guest.accessToken,
      body: { replay: { v: 1 } },
    });
    expect(status).toBe(422);
    expect(envelope.error?.code).toBe('validation_failed');
  });
});

describe('daily sortie', () => {
  it('returns the shared challenge and accepts a matching run', async () => {
    const daily = await call<{ challenge: { key: string; seed: number; difficulty: 'cadet' | 'pilot' | 'ace' | 'legend' } }>(
      '/leaderboard/daily',
    );
    expect(daily.status).toBe(200);
    const challenge = daily.envelope.data.challenge;
    expect(challenge.key).toBe(currentDailyKey());

    const run = recordRun(challenge.seed, challenge.difficulty, 'daily', 12_000);
    const submitted = await call<{ daily: { key: string; bonusAwarded: number } }>('/runs', {
      method: 'POST',
      token: guest.accessToken,
      body: { replay: run.payload, dailyKey: challenge.key },
    });
    expect(submitted.status).toBe(201);
    expect(submitted.envelope.data.daily?.key).toBe(challenge.key);
  });

  it('rejects a daily run with the wrong seed', async () => {
    const challenge = dailyChallenge(currentDailyKey());
    const run = recordRun(challenge.seed + 1, challenge.difficulty, 'daily', 2_000);
    const { status, envelope } = await call('/runs', {
      method: 'POST',
      token: guest.accessToken,
      body: { replay: run.payload, dailyKey: challenge.key },
    });
    expect(status).toBe(422);
    expect(envelope.error?.code).toBe('validation_failed');
  });
});

describe('leaderboards', () => {
  it('lists boards and serves a ranked page', async () => {
    const boards = await call<Array<{ board: string; entrants: number }>>('/boards');
    expect(boards.status).toBe(200);
    expect(boards.envelope.data.length).toBeGreaterThan(5);

    const page = await call<{ entries: Array<{ rank: number; handle: string; score: number }>; me: { rank: number } | null }>(
      '/leaderboard?mode=campaign&difficulty=all&period=alltime',
      { token: guest.accessToken },
    );
    expect(page.status).toBe(200);
    expect(page.envelope.data.entries.length).toBeGreaterThan(0);
    expect(page.envelope.data.entries[0].rank).toBe(1);
    expect(page.envelope.data.entries[0].score).toBeGreaterThanOrEqual(page.envelope.data.entries.at(-1)!.score);
    expect(page.envelope.data.me?.rank).toBeGreaterThan(0);
  });

  it('serves per-difficulty and weekly boards', async () => {
    const ace = await call<{ entries: unknown[] }>('/leaderboard?mode=campaign&difficulty=ace&period=alltime');
    expect(ace.status).toBe(200);
    const weekly = await call<{ entries: unknown[] }>('/leaderboard?mode=campaign&difficulty=all&period=weekly');
    expect(weekly.status).toBe(200);
  });

  it('returns placement for the signed-in pilot', async () => {
    const { status, envelope } = await call<{ placement: { rank: number; percentile: number; neighbours: unknown[] } | null }>(
      '/leaderboard/me?mode=campaign&difficulty=all',
      { token: guest.accessToken },
    );
    expect(status).toBe(200);
    expect(envelope.data.placement?.rank).toBeGreaterThan(0);
    expect(envelope.data.placement?.neighbours.length).toBeGreaterThan(0);
  });

  it('serves public pilot profiles', async () => {
    const { status, envelope } = await call<{ player: { handle: string }; totals: { runsSubmitted: number } }>(
      `/leaderboard/players/${guestHandle}`,
    );
    expect(status).toBe(200);
    expect(envelope.data.player.handle).toBe(guestHandle);
    expect(envelope.data.totals.runsSubmitted).toBeGreaterThan(0);
  });
});

describe('progression, achievements and cloud save', () => {
  it('tracks XP, level and achievement unlocks', async () => {
    const me = await call<{ xp: number; progression: { level: number; rank: string }; achievementsUnlocked: number }>('/me', {
      token: guest.accessToken,
    });
    expect(me.status).toBe(200);
    expect(me.envelope.data.xp).toBeGreaterThan(0);
    expect(me.envelope.data.achievementsUnlocked).toBeGreaterThan(0);

    const achievements = await call<{ achievements: Array<{ id: string; unlocked: boolean }>; totalCount: number }>('/me/achievements', {
      token: guest.accessToken,
    });
    expect(achievements.status).toBe(200);
    expect(achievements.envelope.data.totalCount).toBeGreaterThanOrEqual(20);
    expect(achievements.envelope.data.achievements.some((entry) => entry.unlocked)).toBe(true);
  });

  it('syncs cloud saves with optimistic concurrency', async () => {
    const payload = JSON.stringify({ settings: { difficulty: 'ace' }, progress: { credits: 1200 } });
    const first = await call<{ status: string; version: number }>('/me/save', {
      method: 'PUT',
      token: guest.accessToken,
      body: { payload, device: 'vitest' },
    });
    expect(first.status).toBe(200);
    expect(first.envelope.data.status).toBe('stored');

    const readBack = await call<{ version: number; payload: { settings?: { difficulty?: string } } }>('/me/save', {
      token: guest.accessToken,
    });
    expect(readBack.envelope.data.payload.settings?.difficulty).toBe('ace');

    const stale = await call<{ status: string }>('/me/save', {
      method: 'PUT',
      token: guest.accessToken,
      body: { payload: JSON.stringify({ settings: { difficulty: 'cadet' } }), version: 0 },
    });
    expect(stale.status).toBe(409);
    expect(stale.envelope.data.status).toBe('conflict');

    const identical = await call<{ status: string }>('/me/save', {
      method: 'PUT',
      token: guest.accessToken,
      body: { payload },
    });
    expect(identical.envelope.data.status).toBe('identical');
  });

  it('accepts telemetry batches', async () => {
    const { status } = await call('/telemetry', {
      method: 'POST',
      token: guest.accessToken,
      body: { events: [{ name: 'run.started', props: { mode: 'campaign' } }], sessionId: 'vitest' },
    });
    expect(status).toBe(202);
  });

  it('returns recent run history for the pilot', async () => {
    const { status, envelope } = await call<Array<{ id: string; score: number }>>('/me/runs?pageSize=5', { token: guest.accessToken });
    expect(status).toBe(200);
    expect(envelope.data.length).toBeGreaterThan(0);
  });
});

describe('moderation + realtime', () => {
  it('requires the websocket upgrade for realtime', async () => {
    const { status } = await call('/realtime/leaderboard?board=campaign:all:alltime', { token: guest.accessToken });
    expect(status).toBe(400);
  });

  it('gates the admin console behind a role', async () => {
    const denied = await call('/admin/overview', { token: guest.accessToken });
    expect(denied.status).toBe(403);
  });

  it('supports reporting a run and reviewing it once promoted', async () => {
    const run = recordRun(8080, 'pilot', 'campaign');
    const submitted = await call<{ run: { id: string } }>('/runs', {
      method: 'POST',
      token: guest.accessToken,
      body: { replay: run.payload },
    });
    const runId = submitted.envelope.data.run.id;
    const other = await call<{ tokens: Tokens }>('/auth/guest', { method: 'POST', body: {} });
    const reporterToken = other.envelope.data.tokens.accessToken;

    const report = await call<{ reported: boolean }>(`/runs/${runId}/report`, {
      method: 'POST',
      token: reporterToken,
      body: { reason: 'suspicious-score', detail: 'vitest report' },
    });
    expect(report.status).toBe(201);
    expect(report.envelope.data.reported).toBe(true);

    const selfReport = await call(`/runs/${runId}/report`, {
      method: 'POST',
      token: guest.accessToken,
      body: { reason: 'other' },
    });
    expect(selfReport.status).toBe(400);

    // Promote the reporter via the bootstrap endpoint (enabled in dev vars).
    const bootstrap = await call<{ promoted: boolean }>('/admin/bootstrap', {
      method: 'POST',
      token: reporterToken,
      headers: { 'X-Bootstrap-Token': BOOTSTRAP_TOKEN },
    });
    expect(bootstrap.status).toBe(200);
    expect(bootstrap.envelope.data.promoted).toBe(true);

    const overview = await call<{ counts: { players: number; reports: number } }>('/admin/overview', { token: reporterToken });
    expect(overview.status).toBe(200);
    expect(overview.envelope.data.counts.players).toBeGreaterThan(1);

    const reports = await call<Array<{ id: number; run_id: string }>>('/admin/reports', { token: reporterToken });
    expect(reports.envelope.data.some((entry) => entry.run_id === runId)).toBe(true);

    const dismissed = await call<{ ok: boolean }>('/admin/actions', {
      method: 'POST',
      token: reporterToken,
      body: { action: 'dismiss', runId, reportId: reports.envelope.data[0].id, reason: 'checked, legitimate' },
    });
    expect(dismissed.status).toBe(200);

    const maintenance = await call<{ task: string; result: { warmed: number } }>('/admin/maintenance', {
      method: 'POST',
      token: reporterToken,
      body: { task: 'warm-boards' },
    });
    expect(maintenance.status).toBe(200);
    expect(maintenance.envelope.data.task).toBe('warm-boards');

    const audit = await call<Array<{ action: string }>>('/admin/audit', { token: reporterToken });
    expect(audit.envelope.data.some((entry) => entry.action === 'maintenance.run')).toBe(true);
  });

  it('survives a CORS preflight and reports allowed origins', async () => {
    const response = await fetch(`${API}/config`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:8080', 'Access-Control-Request-Method': 'GET' },
    });
    expect([204, 200]).toContain(response.status);
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:8080');
  });
});
