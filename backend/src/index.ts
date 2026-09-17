import { Hono } from 'hono';
import type { Env, Variables } from './env';
import { ApiError, corsHeaders, errorResponse, isOriginAllowed, ok, SECURITY_HEADERS } from './lib/http';
import { requestContext, type AppContext } from './lib/middleware';
import { authRoutes } from './routes/auth';
import { meRoutes } from './routes/me';
import { runRoutes } from './routes/runs';
import { leaderboardRoutes } from './routes/leaderboards';
import { publicRoutes } from './routes/public';
import { adminRoutes } from './routes/admin';
import { handleQueue } from './queue/consumer';
import { runScheduled } from './cron/tasks';
import { LeaderboardHub, PresenceHub } from './durable/leaderboard-hub';
import { ENGINE_VERSION } from '../../shared/game/config';

export { LeaderboardHub, PresenceHub };

const app = new Hono<AppContext>();

/* ------------------------------ middleware -------------------------------- */

app.use('*', requestContext);

app.use('/api/*', async (c, next) => {
  const origin = c.req.header('Origin') ?? null;
  if (c.req.method === 'OPTIONS') {
    if (origin && !isOriginAllowed(c.env, origin)) {
      return new Response(null, { status: 403, headers: corsHeaders(c.env, origin) });
    }
    for (const [key, value] of Object.entries(corsHeaders(c.env, origin))) c.header(key, value);
    return new Response(null, { status: 204 });
  }
  if (origin && !isOriginAllowed(c.env, origin) && c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    throw ApiError.forbidden('Origin is not allowed to call this API');
  }
  await next();
  const headers = corsHeaders(c.env, origin);
  for (const [key, value] of Object.entries(headers)) c.header(key, value);
});

/* --------------------------------- routes --------------------------------- */

const api = new Hono<AppContext>();

api.route('/auth', authRoutes);
api.route('/me', meRoutes);
api.route('/runs', runRoutes);
api.route('/', leaderboardRoutes);
api.route('/admin', adminRoutes);
api.route('/', publicRoutes);

api.notFound(() => {
  throw ApiError.notFound('No such API route');
});

app.route('/api/v1', api);

/** Friendly API root so a stray request explains itself. */
app.get('/', (c) =>
  ok(c, {
    name: 'Cosmic Invader Frontiers API',
    version: c.env.API_VERSION,
    engine: ENGINE_VERSION,
    documentation: `${c.env.PUBLIC_SITE_URL}/docs/api`,
    endpoints: [
      'GET  /api/v1/health',
      'GET  /api/v1/config',
      'POST /api/v1/auth/guest',
      'POST /api/v1/auth/register',
      'POST /api/v1/auth/login',
      'POST /api/v1/auth/refresh',
      'POST /api/v1/auth/logout',
      'POST /api/v1/auth/upgrade',
      'GET  /api/v1/me',
      'POST /api/v1/runs',
      'GET  /api/v1/leaderboard',
      'GET  /api/v1/daily',
      'GET  /api/v1/stats',
      'GET  /api/v1/realtime/leaderboard (websocket)',
    ],
  }),
);

app.notFound((c) => {
  if (c.req.path.startsWith('/api/')) throw ApiError.notFound('No such API route');
  return c.json(
    { ok: false, data: null, meta: { requestId: c.get('requestId') }, error: { code: 'not_found', message: 'Not found' } },
    404,
  );
});

/* ------------------------------ error handler ----------------------------- */

app.onError((error, c) => {
  const requestId = c.get('requestId') ?? 'unknown';
  // Validation helpers throw plain Errors flagged with `zod: true`.
  if ((error as { zod?: boolean }).zod) {
    return errorResponse(c, ApiError.validation(error.message));
  }
  if (error instanceof ApiError) {
    return errorResponse(c, error);
  }
  console.error(
    JSON.stringify({
      level: 'error',
      event: 'unhandled-error',
      requestId,
      path: new URL(c.req.url).pathname,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack?.split('\n').slice(0, 4).join(' | ') : undefined,
    }),
  );
  const message =
    c.env.ENVIRONMENT === 'production' ? 'Something went wrong on our side. Please try again.' : error.message;
  return errorResponse(c, new ApiError('internal_error', message));
});

/* ------------------------------ worker entry ------------------------------ */

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const started = Date.now();
    let response: Response;
    try {
      response = await app.fetch(request, env, ctx);
    } catch (error) {
      // Last resort: Hono should already have produced a response.
      console.error('[worker] fatal', (error as Error).message);
      response = Response.json(
        { ok: false, data: null, meta: { requestId: 'fatal' }, error: { code: 'internal_error', message: 'Fatal error' } },
        { status: 500 },
      );
    }

    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      if (!headers.has(key)) headers.set(key, value);
    }
    const origin = request.headers.get('Origin');
    if (origin) {
      for (const [key, value] of Object.entries(corsHeaders(env, origin))) {
        if (!headers.has(key)) headers.set(key, value);
      }
    }
    const requestId = headers.get('X-Request-Id') ?? 'unknown';
    if (!headers.has('X-Request-Id')) headers.set('X-Request-Id', requestId);

    const url = new URL(request.url);
    if (url.pathname !== '/api/v1/health') {
      const line = JSON.stringify({
        level: response.status >= 500 ? 'error' : response.status >= 400 ? 'warn' : 'info',
        event: 'request',
        requestId,
        method: request.method,
        path: url.pathname,
        status: response.status,
        durationMs: Date.now() - started,
        environment: env.ENVIRONMENT,
      });
      if (response.status >= 400) console.warn(line);
      else if (request.method !== 'OPTIONS') console.log(line);
    }

    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },

  async queue(batch: MessageBatch<RunQueueMessageLike>, env: Env): Promise<void> {
    await handleQueue(batch as never, env);
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runScheduled(controller, env).then((summary) => {
        console.log(JSON.stringify({ level: 'info', event: 'cron.complete', ...summary }));
      }),
    );
  },
};

type RunQueueMessageLike = import('./env').RunQueueMessage | import('./env').EventQueueMessage;

export type { Variables };
