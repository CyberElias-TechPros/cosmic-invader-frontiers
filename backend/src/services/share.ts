import type { Env } from '../env';
import { escapeXml } from '../lib/core';
import { Rng } from '../../../shared/game/rng';
import { modeLabel } from '../../../shared/game/daily';

export interface ShareCardInput {
  runId: string;
  handle: string;
  displayName: string;
  score: number;
  wave: number;
  accuracy: number;
  durationMs: number;
  mode: string;
  difficulty: string;
  seed: number;
  rank: number | null;
  total: number | null;
  createdAt: string;
}

const WIDTH = 1200;
const HEIGHT = 630;

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}

/**
 * Deterministic SVG share card. Generated from the run's seed so the same run
 * always renders the same starfield, and cached in R2 by the queue consumer.
 */
export function renderShareCard(input: ShareCardInput): string {
  const rng = new Rng(input.seed || 1);
  const stars: string[] = [];
  for (let i = 0; i < 160; i++) {
    const x = rng.range(0, WIDTH);
    const y = rng.range(0, HEIGHT);
    const radius = rng.range(0.4, 1.9);
    const opacity = rng.range(0.25, 0.95).toFixed(2);
    const hue = rng.next() < 0.2 ? '#a78bfa' : rng.next() < 0.5 ? '#67e8f9' : '#ffffff';
    stars.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${radius.toFixed(2)}" fill="${hue}" opacity="${opacity}"/>`);
  }

  const rankLine =
    input.rank && input.total
      ? `RANK #${input.rank} OF ${formatNumber(input.total)}`
      : 'UNRANKED SORTIE';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="Verified run card for ${escapeXml(input.handle)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#05030f"/>
      <stop offset="55%" stop-color="#0b0722"/>
      <stop offset="100%" stop-color="#17082e"/>
    </linearGradient>
    <radialGradient id="glowA" cx="18%" cy="12%" r="60%">
      <stop offset="0%" stop-color="#6d28d9" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#6d28d9" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowB" cx="85%" cy="85%" r="55%">
      <stop offset="0%" stop-color="#0ea5e9" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#0ea5e9" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="rule" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#22d3ee" stop-opacity="0"/>
      <stop offset="50%" stop-color="#a855f7" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#f472b6" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glowA)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glowB)"/>
  <g>${stars.join('')}</g>

  <rect x="40" y="40" width="${WIDTH - 80}" height="${HEIGHT - 80}" rx="26" fill="none" stroke="#8b5cf6" stroke-opacity="0.35" stroke-width="2"/>
  <rect x="40" y="40" width="${WIDTH - 80}" height="6" fill="url(#rule)"/>

  <text x="80" y="128" fill="#c4b5fd" font-family="ui-monospace, 'SFMono-Regular', Menlo, monospace" font-size="24" letter-spacing="6">VERIFIED SORTIE</text>
  <text x="80" y="206" fill="#ffffff" font-family="'Segoe UI', Inter, system-ui, sans-serif" font-size="64" font-weight="700">${escapeXml(input.displayName)}</text>
  <text x="80" y="248" fill="#94a3b8" font-family="ui-monospace, Menlo, monospace" font-size="24">@${escapeXml(input.handle)} · ${escapeXml(modeLabel(input.mode as never))} · ${escapeXml(input.difficulty.toUpperCase())}</text>

  <text x="80" y="392" fill="#f8fafc" font-family="'Segoe UI', Inter, system-ui, sans-serif" font-size="132" font-weight="800">${formatNumber(input.score)}</text>
  <text x="80" y="440" fill="#7dd3fc" font-family="ui-monospace, Menlo, monospace" font-size="26" letter-spacing="4">SCORE</text>

  <g font-family="ui-monospace, Menlo, monospace" font-size="28" fill="#e2e8f0">
    <text x="620" y="330">WAVE</text>
    <text x="620" y="372" fill="#fbbf24" font-size="40">${input.wave}</text>
    <text x="820" y="330">ACCURACY</text>
    <text x="820" y="372" fill="#4ade80" font-size="40">${(input.accuracy * 100).toFixed(1)}%</text>
    <text x="620" y="452">DURATION</text>
    <text x="620" y="494" fill="#f0abfc" font-size="40">${formatDuration(input.durationMs)}</text>
  </g>

  <text x="80" y="540" fill="#a855f7" font-family="ui-monospace, Menlo, monospace" font-size="28" letter-spacing="3">${escapeXml(rankLine)}</text>
  <text x="${WIDTH - 80}" y="540" text-anchor="end" fill="#64748b" font-family="ui-monospace, Menlo, monospace" font-size="22">${escapeXml(input.createdAt.slice(0, 10))}</text>
  <text x="80" y="586" fill="#64748b" font-family="'Segoe UI', Inter, system-ui, sans-serif" font-size="22">COSMIC INVADER FRONTIERS · replay-verified on the edge</text>
</svg>`;
}

export function shareCardKey(runId: string): string {
  return `shares/${runId}.svg`;
}

export async function putShareCard(env: Env, runId: string, svg: string): Promise<string> {
  const key = shareCardKey(runId);
  await env.REPLAYS.put(key, svg, {
    httpMetadata: {
      contentType: 'image/svg+xml; charset=utf-8',
      cacheControl: 'public, max-age=86400, immutable',
    },
    customMetadata: { runId },
  });
  return key;
}

export async function getShareCard(env: Env, runId: string): Promise<string | null> {
  const object = await env.REPLAYS.get(shareCardKey(runId));
  if (!object) return null;
  return object.text();
}
