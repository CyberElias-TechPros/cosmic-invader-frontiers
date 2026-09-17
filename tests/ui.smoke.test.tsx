// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '../src/App';
import { AuthProvider } from '../src/lib/auth';
import { installCanvasStub } from './setup.dom';

/**
 * Frontend smoke tests.
 *
 * These do not test pixels — they test that the real application module graph
 * boots, talks to the API contract, renders every page, and degrades honestly
 * when the API is unavailable. Combined with the worker e2e suite they cover
 * both halves of every happy path.
 */

const GUEST_PLAYER = {
  id: 'ply_test',
  handle: 'testpilot',
  displayName: 'Test Pilot',
  avatarSeed: 42,
  isGuest: true,
  role: 'player',
  xp: 0,
  level: 1,
  rank: 'Cadet',
  insignia: '◦',
  country: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  lastSeenAt: '2026-01-01T00:00:00.000Z',
  email: null,
  emailVerified: false,
  preferences: {},
  progression: {
    xp: 0,
    level: 1,
    rank: 'Cadet',
    insignia: '◦',
    nextRank: 'Ensign',
    levelStartXp: 0,
    levelEndXp: 100,
    levelProgress: 0,
    xpToNextLevel: 100,
  },
  stats: {
    gamesPlayed: 3,
    runsSubmitted: 2,
    bestScore: 12500,
    totalScore: 18000,
    totalKills: 260,
    totalBossKills: 1,
    totalUfosDestroyed: 2,
    bestWave: 6,
    bestCombo: 22,
    bestAccuracy: 0.44,
    totalPlayMs: 240000,
    powerupsCollected: 9,
    dailiesCompleted: 1,
    dailyStreak: 1,
    bossRushClears: 0,
    aceRuns: 0,
    legendRuns: 0,
  },
  achievementsUnlocked: 3,
};

const LEADERBOARD = {
  board: 'campaign:all:alltime',
  period: 'alltime',
  label: 'Campaign · All time',
  entries: [
    {
      rank: 1,
      playerId: 'ply_top',
      handle: 'nova',
      displayName: 'Nova Vex',
      avatarSeed: 12,
      isGuest: false,
      level: 12,
      score: 90210,
      wave: 21,
      accuracy: 0.52,
      durationMs: 620000,
      runId: 'run_top',
      mode: 'campaign',
      difficulty: 'ace',
      achievedAt: '2026-09-15T10:00:00.000Z',
    },
  ],
  me: null,
};

const DAILY = {
  challenge: {
    key: '2026-09-16',
    seed: 4242,
    difficulty: 'pilot',
    difficultyLabel: 'Pilot',
    modifier: { id: 'swarm', label: 'Swarm Protocol', blurb: 'Faster formation.', speedMult: 1.4, fireMult: 1, hpBonus: 0, bonusPoints: 250 },
    parScore: 14000,
    bonusXp: 600,
    startsAt: '2026-09-16T00:00:00.000Z',
    endsAt: '2026-09-17T00:00:00.000Z',
    title: 'Sortie 200',
  },
  participants: 12,
  topScore: 33000,
  isToday: true,
  todayKey: '2026-09-16',
  leaderboard: [],
  myResult: null,
  myRank: null,
  history: [],
};

const RESPONSES: Record<string, unknown> = {
  '/api/v1/health': { status: 'healthy', checks: { database: { ok: true }, cache: { ok: true }, storage: { ok: true } } },
  '/api/v1/config': {
    engineVersion: '1.1.0',
    replayFormat: 1,
    arena: { width: 480, height: 720 },
    maxRunTicks: 118800,
    apiVersion: '1',
    environment: 'test',
    ingestEnabled: true,
    difficulty: [],
    modes: [],
    daily: DAILY.challenge,
    season: { id: 1, name: 'Season 1 · First Contact', theme: 'nebula', startsAt: '2026-01-01T00:00:00.000Z', endsAt: '2026-12-31T00:00:00.000Z', status: 'active' },
    achievements: { total: 30 },
    links: { site: 'http://localhost:8080', api: null },
  },
  '/api/v1/stats': {
    players: 120,
    runsSubmitted: 340,
    totalScore: 9_000_000,
    bestScore: 90210,
    totalKills: 12000,
    totalBossKills: 22,
    totalPlayMs: 5_000_000,
    runsToday: 12,
    pilotsToday: 8,
    dailiesCompleted: 40,
    verifiedRuns: 330,
    rejectedSubmissions: 10,
    pilotsOnline: 3,
  },
  '/api/v1/spotlight': { top: LEADERBOARD.entries, feed: [] },
  '/api/v1/boards': [
    { board: 'campaign:all:alltime', period: 'alltime', label: 'Campaign · All time', mode: 'campaign', difficulty: 'all', entrants: 34 },
  ],
  '/api/v1/leaderboard': LEADERBOARD,
  '/api/v1/leaderboard/daily': DAILY,
  '/api/v1/achievements': [
    { id: 'first-blood', name: 'First Blood', description: 'Destroy your first invader.', category: 'combat', tier: 'bronze', points: 5, hidden: false },
  ],
  '/api/v1/runs/recent': [],
  '/api/v1/me': GUEST_PLAYER,
  '/api/v1/me/runs': [],
  '/api/v1/me/placement': { placements: [] },
  '/api/v1/me/save': { payload: null, version: 0, updatedAt: null },
  '/api/v1/me/achievements': { achievements: [], unlockedCount: 0, totalCount: 30, points: 0, pointsMax: 1200 },
  '/api/v1/auth/guest': {
    player: GUEST_PLAYER,
    tokens: {
      accessToken: 'access-test',
      refreshToken: 'refresh-test',
      sessionId: 'sess-test',
      expiresAt: '2026-09-16T22:00:00.000Z',
      refreshExpiresIn: 2592000,
    },
  },
  '/api/v1/leaderboard/me': { board: 'campaign:all:alltime', period: 'alltime', label: 'Campaign · All time', placement: null },
};

const calls: string[] = [];

/**
 * The real API always answers with the `{ ok, data, meta }` envelope, and the
 * client parses the body itself — so the stub must return the envelope from
 * both `json()` and `text()`.
 */
function jsonResponse(body: unknown, status = 200): Response {
  const envelope = { ok: status < 400, data: body, meta: { requestId: 'test' } };
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => envelope,
    text: async () => JSON.stringify(envelope),
  } as unknown as Response;
}

beforeEach(() => {
  calls.length = 0;
  installCanvasStub(document.createElement('canvas'));
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url, 'http://localhost:8080');
    const key = url.pathname;
    calls.push(`${init?.method ?? 'GET'} ${key}`);
    if (key in RESPONSES) return jsonResponse(RESPONSES[key]);
    return jsonResponse({ message: 'not found' }, 404);
  });
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderApp(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>,
  );
}

describe('application shell', () => {
  it('boots a guest session and paints the landing page', async () => {
    renderApp('/');

    expect(await screen.findByRole('heading', { level: 1 })).toBeTruthy();
    await waitFor(() => expect(calls.some((call) => call.includes('/auth/guest'))).toBe(true));
  });

  it('renders the hero headline and the primary call to action', async () => {
    renderApp('/');
    expect(await screen.findByText(/Every score on this/i)).toBeTruthy();
    expect((await screen.findAllByRole('link', { name: /launch a sortie/i })).length).toBeGreaterThan(0);
  });

  it('shows verified figures from the API on the landing page', async () => {
    renderApp('/');
    // The headline tiles animate, so assert on the API-derived captions.
    await waitFor(() => expect(screen.getAllByText(/8 flew today/).length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.getAllByText(/330 runs re-simulated/).length).toBeGreaterThan(0));
  });

  it('renders the daily sortie card with the shared challenge', async () => {
    renderApp('/');
    expect(await screen.findByText(new RegExp(DAILY.challenge.title, 'i'))).toBeTruthy();
  });

  it('renders the leaderboard page with verified entries', async () => {
    renderApp('/leaderboards');
    expect(await screen.findByText(/Verified leaderboards/i)).toBeTruthy();
    expect(await screen.findByText('Nova Vex')).toBeTruthy();
    expect(await screen.findByText('90,210')).toBeTruthy();
  });

  it('renders the achievements catalogue for a signed-out-of-boards visitor', async () => {
    renderApp('/achievements');
    expect(await screen.findByRole('heading', { level: 1, name: 'Achievements' })).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText('First Blood').length).toBeGreaterThan(0));
  });

  it('renders the profile page for the bootstrapped guest', async () => {
    renderApp('/profile');
    expect(await screen.findByText('Test Pilot')).toBeTruthy();
    await waitFor(() => expect(calls.some((call) => call.includes('/me/runs'))).toBe(true));
  });

  it('renders the how-it-works documentation', async () => {
    renderApp('/about');
    expect(await screen.findByText(/A leaderboard you can/i)).toBeTruthy();
    expect(await screen.findByRole('heading', { name: /Questions pilots actually ask/i })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: /What actually runs, and where/i })).toBeTruthy();
  });

  it('renders the settings cockpit', async () => {
    renderApp('/settings');
    expect(await screen.findByRole('heading', { name: 'Settings', level: 1 })).toBeTruthy();
    expect(await screen.findByLabelText('Reduced motion')).toBeTruthy();
  });

  it('renders a recoverable 404 for unknown routes', async () => {
    renderApp('/this/does/not/exist');
    expect(await screen.findByText(/This coordinate is empty space/i)).toBeTruthy();
    expect(await screen.findByRole('link', { name: /Bridge/i })).toBeTruthy();
  });

  it('keeps the app alive when the API is unreachable', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    renderApp('/');
    // The landing page still paints: only the live numbers are missing.
    expect(await screen.findByText(/Every score on this/i)).toBeTruthy();
  });

  it('never disables pinch-zoom in the document shell', () => {
    const viewport = document.querySelector('meta[name="viewport"]');
    expect(viewport?.getAttribute('content') ?? '').not.toContain('user-scalable=no');
  });
});
