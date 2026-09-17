import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';

interface SocketMeta {
  board: string;
  handle: string;
  joinedAt: string;
}

interface BroadcastEntry {
  playerId?: string;
  handle?: string;
  displayName?: string;
  score?: number;
  wave?: number;
  rank?: number | null;
}

const PULSE_INTERVAL_MS = 30_000;
const MAX_SOCKETS = 200;

/**
 * Realtime leaderboard fan-out.
 *
 * One instance per board (addressed with `idFromName(board)`). Sockets are
 * accepted through the hibernation API so idle viewers cost nothing, and every
 * connect/disconnect mirrors the viewer count into {@link PresenceHub} so the
 * site can show a live "pilots in orbit" number.
 */
export class LeaderboardHub extends DurableObject<Env> {
  private boardName(): string {
    return this.ctx.id.name ?? 'global';
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    switch (url.pathname) {
      case '/ws':
        return this.handleSocket(request, url);

      case '/broadcast': {
        if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
        const payload = (await request.json().catch(() => null)) as { entry?: BroadcastEntry } | null;
        if (payload?.entry) {
          this.broadcast({
            type: 'score',
            board: this.boardName(),
            entry: payload.entry,
            at: new Date().toISOString(),
          });
        }
        return Response.json({ ok: true, sockets: this.ctx.getWebSockets().length });
      }

      case '/presence':
        return Response.json({ online: this.ctx.getWebSockets().length, board: this.boardName() });

      case '/state': {
        const stored = (await this.ctx.storage.get<Record<string, unknown>>('stats')) ?? {};
        return Response.json({
          board: this.boardName(),
          sockets: this.ctx.getWebSockets().length,
          ...stored,
        });
      }

      case '/shutdown': {
        for (const socket of this.ctx.getWebSockets()) {
          try {
            socket.close(1001, 'server shutting down');
          } catch {
            /* already closed */
          }
        }
        return Response.json({ ok: true });
      }

      default:
        return new Response('Leaderboard hub', { status: 200 });
    }
  }

  private async handleSocket(request: Request, url: URL): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 });
    }

    if (this.ctx.getWebSockets().length >= MAX_SOCKETS) {
      return new Response('Board is at capacity', { status: 503 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    const meta: SocketMeta = {
      board: url.searchParams.get('board') ?? this.boardName(),
      handle: url.searchParams.get('handle') ?? 'anonymous',
      joinedAt: new Date().toISOString(),
    };
    server.serializeAttachment(meta);
    this.ctx.acceptWebSocket(server, [meta.board]);

    server.send(
      JSON.stringify({
        type: 'hello',
        board: meta.board,
        online: this.ctx.getWebSockets().length,
        at: new Date().toISOString(),
      }),
    );

    const alarm = await this.ctx.storage.getAlarm();
    if (alarm === null) await this.ctx.storage.setAlarm(Date.now() + PULSE_INTERVAL_MS);
    await bumpPresence(this.env, 1);

    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') return;
    if (message.includes('"ping"') || message === 'ping') {
      socket.send(JSON.stringify({ type: 'pong', at: Date.now() }));
      return;
    }
    if (message.startsWith('{"type":"subscribe"')) {
      try {
        const payload = JSON.parse(message) as { board?: string };
        const meta = socket.deserializeAttachment() as SocketMeta | null;
        if (payload.board && meta) socket.serializeAttachment({ ...meta, board: payload.board });
        socket.send(JSON.stringify({ type: 'subscribed', board: payload.board ?? meta?.board ?? this.boardName() }));
      } catch {
        socket.send(JSON.stringify({ type: 'error', message: 'Malformed subscribe frame' }));
      }
    }
  }

  override async webSocketClose(socket: WebSocket, code: number, reason: string): Promise<void> {
    try {
      socket.close(code, reason);
    } catch {
      /* already closing */
    }
    await bumpPresence(this.env, -1);
  }

  override async webSocketError(): Promise<void> {
    await bumpPresence(this.env, -1);
  }

  override async alarm(): Promise<void> {
    const sockets = this.ctx.getWebSockets();
    if (sockets.length === 0) return;
    this.broadcast({
      type: 'pulse',
      board: this.boardName(),
      online: sockets.length,
      at: new Date().toISOString(),
    });
    await this.ctx.storage.setAlarm(Date.now() + PULSE_INTERVAL_MS);
  }

  private broadcast(message: Record<string, unknown>): void {
    const payload = JSON.stringify(message);
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(payload);
      } catch {
        /* dead sockets are cleaned up by the close handler */
      }
    }
  }
}

/** Global viewer counter shared by every board instance. */
export class PresenceHub extends DurableObject<Env> {
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/presence') {
      const online = (await this.ctx.storage.get<number>('online')) ?? 0;
      return Response.json({ online });
    }
    if (url.pathname === '/adjust' && request.method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as { delta?: number };
      const delta = Math.max(-25, Math.min(25, Number(body.delta ?? 0)));
      const current = (await this.ctx.storage.get<number>('online')) ?? 0;
      const next = Math.max(0, Math.min(100_000, current + delta));
      await this.ctx.storage.put('online', next);
      return Response.json({ online: next });
    }
    return new Response('Presence hub', { status: 200 });
  }
}

async function bumpPresence(env: Env, delta: number): Promise<void> {
  if (delta === 0) return;
  try {
    const id = env.PRESENCE_HUB.idFromName('global');
    const stub = env.PRESENCE_HUB.get(id);
    await stub.fetch('https://presence/adjust', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ delta }),
    });
  } catch (error) {
    console.warn('[hub] presence update failed', (error as Error).message);
  }
}
