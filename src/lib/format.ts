/** Presentation helpers shared across the site. */

export function formatScore(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

export function formatCompact(value: number): string {
  if (value < 1000) return String(Math.round(value));
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`;
  if (value < 1_000_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  return `${(value / 1_000_000_000).toFixed(2)}B`;
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatClock(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remainder = Math.floor(safe % 60);
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export function formatPercent(ratio: number, digits = 0): string {
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function formatDate(input: string | Date): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(input: string | Date): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function timeAgo(input: string | Date): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (!Number.isFinite(seconds)) return '—';
  if (seconds < 45) return 'just now';
  if (seconds < 90) return 'a minute ago';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

/** Countdown to a UTC instant, e.g. "07:12:44". */
export function countdownParts(target: string | Date, now = Date.now()): { hours: string; minutes: string; seconds: string; expired: boolean } {
  const targetMs = typeof target === 'string' ? Date.parse(target) : target.getTime();
  const remaining = Math.max(0, targetMs - now);
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  return {
    hours: String(hours).padStart(2, '0'),
    minutes: String(minutes).padStart(2, '0'),
    seconds: String(seconds).padStart(2, '0'),
    expired: remaining <= 0,
  };
}

export function modeLabel(mode: string): string {
  if (mode === 'daily') return 'Daily Sortie';
  if (mode === 'gauntlet') return 'Overdrive Gauntlet';
  return 'Campaign';
}

export function difficultyLabel(difficulty: string): string {
  return difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
}

/** Deterministic gradient for avatar seeds. */
export function avatarGradient(seed: number): string {
  const hue = (seed * 47) % 360;
  const second = (hue + 58) % 360;
  return `linear-gradient(135deg, hsl(${hue} 85% 62%), hsl(${second} 88% 52%))`;
}

export function initials(displayName: string): string {
  const parts = displayName.replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}
