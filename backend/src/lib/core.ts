/**
 * Small, dependency-light primitives shared by every route: ids, time, JSON,
 * password hashing, token signing and constant-time comparison.
 */

/* ------------------------------- ids + time ------------------------------- */

export function newId(prefix = ''): string {
  return `${prefix}${crypto.randomUUID()}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function isoAfter(seconds: number, from: Date = new Date()): string {
  return new Date(from.getTime() + seconds * 1000).toISOString();
}

export function secondsBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 1000);
}

export function utcDayKey(date: Date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function startOfUtcWeek(date: Date = new Date()): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diff = (day + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}

/* --------------------------------- bytes ---------------------------------- */

export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function randomToken(length = 32): string {
  return bytesToBase64Url(randomBytes(length));
}

/* --------------------------------- hashing -------------------------------- */

export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const data = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(digest));
}

export async function hmacSha256(key: string, message: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  return new Uint8Array(signature);
}

export async function hmacSha256Base64Url(key: string, message: string): Promise<string> {
  return bytesToBase64Url(await hmacSha256(key, message));
}

/** Constant-time string comparison (length differences short-circuit safely). */
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const left = enc.encode(a);
  const right = enc.encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

/* -------------------------------- passwords -------------------------------- */

export const PASSWORD_ALGO = 'pbkdf2-sha256';
export const PASSWORD_ITERATIONS = 210_000;

export async function hashPassword(
  password: string,
  saltHex?: string,
): Promise<{ hash: string; salt: string; algo: string; iterations: number }> {
  const salt = saltHex ? hexToBytes(saltHex) : randomBytes(16);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PASSWORD_ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  );
  return {
    hash: bytesToHex(new Uint8Array(bits)),
    salt: bytesToHex(salt),
    algo: PASSWORD_ALGO,
    iterations: PASSWORD_ITERATIONS,
  };
}

export async function verifyPassword(
  password: string,
  stored: { hash: string | null; salt: string | null; algo: string | null; iterations: number | null },
): Promise<boolean> {
  if (!stored.hash || !stored.salt) return false;
  const iterations = stored.iterations ?? PASSWORD_ITERATIONS;
  const salt = hexToBytes(stored.salt);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    256,
  );
  return timingSafeEqual(bytesToHex(new Uint8Array(bits)), stored.hash);
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.length % 2 === 0 ? hex : `0${hex}`;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16) || 0;
  return out;
}

/* ---------------------------------- misc ---------------------------------- */

/** Strip control characters and collapse whitespace from user supplied text. */
export function sanitizeText(input: string, maxLength = 120): string {
  return input
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/** Escape a value for safe inclusion in XML/SVG output. */
export function escapeXml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function parseIntOr(value: string | undefined | null, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function formatScore(score: number): string {
  return score.toLocaleString('en-US');
}

/** Deterministic adjective+noun callsign generator for guest pilots. */
const CALLSIGN_ADJECTIVES = [
  'Nova',
  'Vega',
  'Orion',
  'Quasar',
  'Pulsar',
  'Zenith',
  'Corona',
  'Astra',
  'Comet',
  'Nebula',
  'Photon',
  'Helix',
  'Titan',
  'Lyra',
  'Andromeda',
  'Rigel',
];
const CALLSIGN_NOUNS = [
  'Pilot',
  'Runner',
  'Warden',
  'Sentinel',
  'Vanguard',
  'Falcon',
  'Lancer',
  'Ranger',
  'Ace',
  'Nomad',
  'Voyager',
  'Striker',
];

export function randomCallsign(): string {
  const bytes = randomBytes(3);
  const adjective = CALLSIGN_ADJECTIVES[bytes[0] % CALLSIGN_ADJECTIVES.length];
  const noun = CALLSIGN_NOUNS[bytes[1] % CALLSIGN_NOUNS.length];
  const number = ((bytes[2] << 4) | bytes[0]) % 9000 + 1000;
  return `${adjective}${noun}${number}`;
}

export function normalizeHandle(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 20);
}
