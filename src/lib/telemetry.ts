import { api } from './api';

/**
 * Product analytics with a hard privacy boundary:
 * only product events, no free text, no identifiers beyond the anonymous
 * player id the API already knows about. Events are batched, capped and
 * dropped (never queued forever) when the network is unavailable.
 */

type Props = Record<string, string | number | boolean | null>;

const queue: Array<{ name: string; props?: Props; at: string }> = [];
const MAX_QUEUE = 60;
let sessionId: string | null = null;
let flushTimer: number | null = null;
let enabled = true;

export function telemetrySession(): string {
  if (sessionId) return sessionId;
  try {
    const existing = window.sessionStorage.getItem('cif.telemetrySession');
    if (existing) {
      sessionId = existing;
      return existing;
    }
    sessionId = crypto.randomUUID();
    window.sessionStorage.setItem('cif.telemetrySession', sessionId);
  } catch {
    sessionId = 'ephemeral';
  }
  return sessionId;
}

export function disableTelemetry() {
  enabled = false;
  queue.length = 0;
}

export function track(name: string, props?: Props): void {
  if (!enabled) return;
  queue.push({ name: name.slice(0, 60), props, at: new Date().toISOString() });
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
  scheduleFlush();
}

function scheduleFlush() {
  if (flushTimer !== null) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flush();
  }, 8000);
}

export async function flush(): Promise<void> {
  if (!enabled || queue.length === 0) return;
  const batch = queue.splice(0, 25);
  try {
    await api.telemetry(batch, telemetrySession());
  } catch {
    // Network unavailable: drop rather than grow unbounded. Product analytics
    // must never degrade the game experience.
  }
}

export function installTelemetryLifecycle(): () => void {
  const onHidden = () => {
    if (document.visibilityState === 'hidden') void flush();
  };
  document.addEventListener('visibilitychange', onHidden);
  window.addEventListener('pagehide', () => void flush());
  return () => document.removeEventListener('visibilitychange', onHidden);
}
