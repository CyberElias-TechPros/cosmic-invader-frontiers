import { ARENA, ARCHETYPES, POWERUPS, type EnemyKind, type PowerupKind } from '../../shared/game/config';
import type { SimEvent, SimState } from '../../shared/game/types';

/**
 * Canvas renderer.
 *
 * Everything expensive (glow, gradients, glyphs, scanlines) is baked into
 * offscreen canvases once, so the per-frame cost is drawImage calls plus a
 * pooled particle pass. The renderer only reads simulation state — it never
 * mutates it, which keeps replays deterministic.
 */

export interface RenderPreferences {
  reducedMotion: boolean;
  screenShake: boolean;
  particles: 'full' | 'reduced' | 'off';
}

interface Particle {
  active: boolean;
  kind: 'spark' | 'debris' | 'ring' | 'smoke' | 'glint';
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: string;
  spin: number;
  angle: number;
}

interface FloatText {
  x: number;
  y: number;
  text: string;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  vy: number;
}

const MAX_PARTICLES = 720;
const MAX_FLOATS = 24;

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(width));
  canvas.height = Math.max(1, Math.floor(height));
  return canvas;
}

/** Silhouettes drawn as paths so every ship is crisp at any scale. */
function drawEnemySilhouette(ctx: CanvasRenderingContext2D, kind: EnemyKind, w: number, h: number): void {
  ctx.beginPath();
  switch (kind) {
    case 'grunt':
      ctx.moveTo(w * 0.1, h * 0.15);
      ctx.lineTo(w * 0.35, h * 0.15);
      ctx.lineTo(w * 0.35, h * 0.35);
      ctx.lineTo(w * 0.65, h * 0.35);
      ctx.lineTo(w * 0.65, h * 0.15);
      ctx.lineTo(w * 0.9, h * 0.15);
      ctx.lineTo(w, h * 0.45);
      ctx.lineTo(w * 0.75, h * 0.6);
      ctx.lineTo(w * 0.85, h);
      ctx.lineTo(w * 0.55, h * 0.75);
      ctx.lineTo(w * 0.45, h * 0.75);
      ctx.lineTo(w * 0.15, h);
      ctx.lineTo(w * 0.25, h * 0.6);
      ctx.lineTo(0, h * 0.45);
      break;
    case 'shooter':
      ctx.moveTo(w * 0.5, 0);
      ctx.lineTo(w, h * 0.35);
      ctx.lineTo(w * 0.75, h);
      ctx.lineTo(w * 0.25, h);
      ctx.lineTo(0, h * 0.35);
      break;
    case 'tank':
      ctx.moveTo(w * 0.2, 0);
      ctx.lineTo(w * 0.8, 0);
      ctx.lineTo(w, h * 0.3);
      ctx.lineTo(w * 0.85, h * 0.8);
      ctx.lineTo(w * 0.5, h);
      ctx.lineTo(w * 0.15, h * 0.8);
      ctx.lineTo(0, h * 0.3);
      break;
    case 'weaver':
      ctx.moveTo(w * 0.5, 0);
      ctx.lineTo(w * 0.7, h * 0.4);
      ctx.lineTo(w, h * 0.55);
      ctx.lineTo(w * 0.72, h * 0.7);
      ctx.lineTo(w * 0.6, h);
      ctx.lineTo(w * 0.4, h);
      ctx.lineTo(w * 0.28, h * 0.7);
      ctx.lineTo(0, h * 0.55);
      ctx.lineTo(w * 0.3, h * 0.4);
      break;
    case 'diver':
      ctx.moveTo(w * 0.5, 0);
      ctx.lineTo(w, h * 0.75);
      ctx.lineTo(w * 0.5, h * 0.52);
      ctx.lineTo(0, h * 0.75);
      break;
  }
  ctx.closePath();
}

function createEnemySprite(kind: EnemyKind, dpr: number): HTMLCanvasElement {
  const archetype = ARCHETYPES[kind];
  const scale = 2.2;
  const w = 30 * scale;
  const h = 24 * scale;
  const pad = 14 * scale * 0.5;
  const canvas = createCanvas((w + pad * 2) * dpr, (h + pad * 2) * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.translate(pad, pad);
  ctx.shadowColor = archetype.glow;
  ctx.shadowBlur = 14;
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.25, archetype.color);
  gradient.addColorStop(1, archetype.glow);
  ctx.fillStyle = gradient;
  drawEnemySilhouette(ctx, kind, w, h);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  // cockpit core
  ctx.beginPath();
  ctx.fillStyle = 'rgba(3, 7, 18, 0.75)';
  ctx.ellipse(w / 2, h * 0.42, w * 0.14, h * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = archetype.glow;
  ctx.beginPath();
  ctx.arc(w / 2, h * 0.42, w * 0.06, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

function createPlayerSprite(dpr: number): HTMLCanvasElement {
  const w = 34 * 3;
  const h = 26 * 3;
  const pad = 20;
  const canvas = createCanvas((w + pad * 2) * dpr, (h + pad * 2) * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.translate(pad, pad);

  ctx.shadowColor = '#67e8f9';
  ctx.shadowBlur = 18;
  const body = ctx.createLinearGradient(0, 0, 0, h);
  body.addColorStop(0, '#e0f2fe');
  body.addColorStop(0.4, '#38bdf8');
  body.addColorStop(1, '#1d4ed8');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(w / 2, 0);
  ctx.lineTo(w * 0.82, h * 0.62);
  ctx.lineTo(w, h);
  ctx.lineTo(w * 0.62, h * 0.82);
  ctx.lineTo(w * 0.38, h * 0.82);
  ctx.lineTo(0, h);
  ctx.lineTo(w * 0.18, h * 0.62);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(224,242,254,0.85)';
  ctx.lineWidth = 1.6;
  ctx.stroke();

  ctx.fillStyle = '#f472b6';
  ctx.beginPath();
  ctx.arc(w / 2, h * 0.4, w * 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(14,165,233,0.9)';
  ctx.fillRect(w * 0.3, h * 0.84, w * 0.4, h * 0.1);
  return canvas;
}

function createUfoSprite(dpr: number): HTMLCanvasElement {
  const w = 46 * 3;
  const h = 20 * 3;
  const pad = 18;
  const canvas = createCanvas((w + pad * 2) * dpr, (h + pad * 2) * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.translate(pad, pad);
  ctx.shadowColor = '#f472b6';
  ctx.shadowBlur = 16;
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, '#fbcfe8');
  gradient.addColorStop(0.5, '#ec4899');
  gradient.addColorStop(1, '#7c3aed');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(w / 2, h * 0.62, w / 2, h * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(w / 2, h * 0.4, w * 0.26, h * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(w * (0.24 + i * 0.17), h * 0.75, w * 0.022, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas;
}

function createBossSprite(dpr: number): HTMLCanvasElement {
  const w = 148 * 1.6;
  const h = 92 * 1.6;
  const pad = 24;
  const canvas = createCanvas((w + pad * 2) * dpr, (h + pad * 2) * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.translate(pad, pad);
  ctx.shadowColor = '#f87171';
  ctx.shadowBlur = 26;
  const body = ctx.createLinearGradient(0, 0, 0, h);
  body.addColorStop(0, '#fee2e2');
  body.addColorStop(0.3, '#f87171');
  body.addColorStop(1, '#7f1d1d');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(w * 0.1, 0);
  ctx.lineTo(w * 0.9, 0);
  ctx.lineTo(w, h * 0.28);
  ctx.lineTo(w * 0.86, h * 0.72);
  ctx.lineTo(w * 0.66, h);
  ctx.lineTo(w * 0.34, h);
  ctx.lineTo(w * 0.14, h * 0.72);
  ctx.lineTo(0, h * 0.28);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(254,226,226,0.7)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // armour plating
  ctx.fillStyle = 'rgba(15,23,42,0.7)';
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(w * (0.16 + i * 0.26), h * 0.18, w * 0.1, h * 0.26);
  }
  // cannons
  ctx.fillStyle = '#450a0a';
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(w * (0.18 + i * 0.28), h * 0.8, w * 0.1, h * 0.22);
  }
  // core
  const core = ctx.createRadialGradient(w / 2, h * 0.55, 2, w / 2, h * 0.55, w * 0.16);
  core.addColorStop(0, '#fff7ed');
  core.addColorStop(0.4, '#fb923c');
  core.addColorStop(1, 'rgba(127,29,29,0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(w / 2, h * 0.55, w * 0.16, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

const BULLET_COLORS: Record<string, [string, string]> = {
  bolt: ['#e0f2fe', '#38bdf8'],
  lance: ['#f5d0fe', '#d946ef'],
  orb: ['#fecdd3', '#f43f5e'],
  plasma: ['#fde68a', '#f59e0b'],
};

function createBulletSprite(kind: string, from: 'player' | 'enemy', dpr: number): HTMLCanvasElement {
  const w = kind === 'lance' ? 6 : 10;
  const h = from === 'player' ? 22 : 14;
  const pad = 10;
  const canvas = createCanvas((w + pad * 2) * dpr, (h + pad * 2) * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.translate(pad, pad);
  const [inner, outer] = BULLET_COLORS[kind] ?? BULLET_COLORS.bolt;
  ctx.shadowColor = outer;
  ctx.shadowBlur = 12;
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(1, outer);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  if (from === 'player') {
    ctx.roundRect(0, 0, w, h, w / 2);
  } else {
    ctx.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
  }
  ctx.fill();
  return canvas;
}

const POWERUP_GLYPH: Record<PowerupKind, string> = {
  rapid: '»',
  spread: '⋏',
  shield: '◈',
  life: '♥',
  double: '×2',
  charge: '⚡',
};

function createPowerupSprite(kind: PowerupKind, dpr: number): HTMLCanvasElement {
  const size = 22;
  const pad = 12;
  const canvas = createCanvas((size + pad * 2) * dpr, (size + pad * 2) * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.translate(pad, pad);
  const color = POWERUPS[kind].color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 16;
  ctx.fillStyle = 'rgba(4,6,18,0.92)';
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, 7);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#f8fafc';
  ctx.font = `700 ${kind === 'double' ? 11 : 13}px "JetBrains Mono", ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(POWERUP_GLYPH[kind], size / 2, size / 2 + 0.5);
  return canvas;
}

export class GameRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;
  private cssWidth = 0;
  private cssHeight = 0;

  private sprites = new Map<string, HTMLCanvasElement>();
  private nebula: HTMLCanvasElement | null = null;
  private overlay: HTMLCanvasElement | null = null;
  private stars: Array<{ x: number; y: number; layer: number; size: number; alpha: number }> = [];

  private particles: Particle[] = [];
  private floats: FloatText[] = [];
  private shake = 0;
  private flash = { color: '255,255,255', alpha: 0 };
  private pulse = 0;
  private slowmo = 0;
  private time = 0;

  private preferences: RenderPreferences = { reducedMotion: false, screenShake: true, particles: 'full' };

  private alpha = 1;
  private prev: {
    player: { x: number; y: number } | null;
    enemies: Map<number, { x: number; y: number }>;
    bullets: Map<number, { x: number; y: number }>;
    powerups: Map<number, { x: number; y: number }>;
    ufo: { x: number; y: number } | null;
    boss: { x: number; y: number } | null;
  } = { player: null, enemies: new Map(), bullets: new Map(), powerups: new Map(), ufo: null, boss: null };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas 2D is not available in this browser');
    this.ctx = context;
    this.particles = Array.from({ length: MAX_PARTICLES }, () => ({
      active: false,
      kind: 'spark' as const,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 1,
      size: 1,
      hue: '#fff',
      spin: 0,
      angle: 0,
    }));
    this.buildSprites();
  }

  setPreferences(preferences: Partial<RenderPreferences>): void {
    this.preferences = { ...this.preferences, ...preferences };
  }

  private buildSprites(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const kind of Object.keys(ARCHETYPES) as EnemyKind[]) {
      this.sprites.set(`enemy:${kind}`, createEnemySprite(kind, dpr));
    }
    this.sprites.set('player', createPlayerSprite(dpr));
    this.sprites.set('ufo', createUfoSprite(dpr));
    this.sprites.set('boss', createBossSprite(dpr));
    for (const kind of ['bolt', 'lance', 'orb', 'plasma']) {
      this.sprites.set(`bullet:player:${kind}`, createBulletSprite(kind, 'player', dpr));
      this.sprites.set(`bullet:enemy:${kind}`, createBulletSprite(kind, 'enemy', dpr));
    }
    for (const kind of Object.keys(POWERUPS) as PowerupKind[]) {
      this.sprites.set(`powerup:${kind}`, createPowerupSprite(kind, dpr));
    }
  }

  resize(cssWidth: number, cssHeight: number): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.floor(cssWidth * dpr));
    this.canvas.height = Math.max(1, Math.floor(cssHeight * dpr));
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;

    // Letterbox the fixed logical arena into whatever space we have.
    this.scale = Math.min(cssWidth / ARENA.width, cssHeight / ARENA.height);
    this.offsetX = (cssWidth - ARENA.width * this.scale) / 2;
    this.offsetY = (cssHeight - ARENA.height * this.scale) / 2;

    this.buildBackdrop();
  }

  private buildBackdrop(): void {
    const width = Math.max(1, Math.floor(this.cssWidth * this.dpr));
    const height = Math.max(1, Math.floor(this.cssHeight * this.dpr));
    this.nebula = createCanvas(width, height);
    const ctx = this.nebula.getContext('2d')!;
    ctx.fillStyle = '#04030c';
    ctx.fillRect(0, 0, width, height);

    const blobs = [
      { x: 0.18, y: 0.16, r: 0.55, color: 'rgba(109,40,217,0.42)' },
      { x: 0.86, y: 0.28, r: 0.5, color: 'rgba(14,116,144,0.34)' },
      { x: 0.5, y: 0.86, r: 0.62, color: 'rgba(190,24,93,0.28)' },
      { x: 0.1, y: 0.72, r: 0.36, color: 'rgba(56,189,248,0.2)' },
    ];
    for (const blob of blobs) {
      const gradient = ctx.createRadialGradient(
        width * blob.x,
        height * blob.y,
        0,
        width * blob.x,
        height * blob.y,
        Math.max(width, height) * blob.r,
      );
      gradient.addColorStop(0, blob.color);
      gradient.addColorStop(1, 'rgba(3,4,14,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    }

    // Starfield
    const count = Math.round((this.cssWidth * this.cssHeight) / 4200);
    this.stars = Array.from({ length: Math.min(260, Math.max(90, count)) }, () => ({
      x: Math.random() * this.cssWidth,
      y: Math.random() * this.cssHeight,
      layer: Math.random() < 0.34 ? 0 : Math.random() < 0.7 ? 1 : 2,
      size: 0.6 + Math.random() * 1.8,
      alpha: 0.25 + Math.random() * 0.7,
    }));

    // Vignette + scanlines + subtle glass grid
    this.overlay = createCanvas(width, height);
    const octx = this.overlay.getContext('2d')!;
    const vignette = octx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.32, width / 2, height / 2, Math.max(width, height) * 0.72);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(0.72, 'rgba(0,0,0,0.28)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.72)');
    octx.fillStyle = vignette;
    octx.fillRect(0, 0, width, height);

    octx.fillStyle = 'rgba(148,163,184,0.045)';
    const lineGap = Math.max(3, Math.floor(3 * this.dpr));
    for (let y = 0; y < height; y += lineGap) {
      octx.fillRect(0, y, width, 1);
    }
  }

  /* ------------------------------- effects -------------------------------- */

  addShake(amount: number): void {
    if (!this.preferences.screenShake || this.preferences.reducedMotion) return;
    this.shake = Math.min(26, this.shake + amount);
  }

  addFlash(color: string, alpha: number): void {
    if (this.preferences.reducedMotion) return;
    this.flash = { color, alpha: Math.min(0.7, this.flash.alpha + alpha) };
  }

  /** Translate simulation events into visual effects. */
  consumeEvents(events: SimEvent[]): void {
    if (this.preferences.particles === 'off') return;
    const density = this.preferences.particles === 'reduced' ? 0.45 : 1;

    for (const event of events) {
      const x = event.x ?? ARENA.width / 2;
      const y = event.y ?? ARENA.height / 2;
      switch (event.type) {
        case 'explosion': {
          const color = event.kind ? ARCHETYPES[event.kind as EnemyKind]?.glow ?? '#fca5a5' : '#fca5a5';
          this.burst(x, y, Math.round(16 * density), color, 150);
          this.ring(x, y, color, 34);
          this.addShake(event.kind === 'tank' ? 5 : 3);
          if (event.value) this.addFloat(x, y, `+${event.value}`, '#e0f2fe', 15);
          break;
        }
        case 'bossExplosion':
          this.burst(x, y, Math.round(90 * density), '#fb923c', 320);
          this.burst(x, y, Math.round(50 * density), '#fef3c7', 180);
          this.ring(x, y, '#fb923c', 150);
          this.ring(x, y, '#fde68a', 110);
          this.addShake(22);
          this.addFlash('251,146,60', 0.5);
          if (event.value) this.addFloat(x, y - 30, `+${event.value}`, '#fdba74', 26);
          break;
        case 'bossPhase':
          this.addFlash('248,113,113', 0.3);
          this.addShake(10);
          this.addFloat(x, y - 40, event.text ?? 'PHASE', '#fecaca', 22, 90);
          break;
        case 'enemyHit':
          this.burst(x, y, Math.round(5 * density), '#fef08a', 90);
          break;
        case 'bunkerHit':
          this.burst(x, y, Math.round(6 * density), '#4ade80', 80);
          break;
        case 'bunkerDestroyed':
          this.burst(x, y, Math.round(24 * density), '#22c55e', 130);
          this.ring(x, y, '#4ade80', 44);
          break;
        case 'playerHit':
          this.burst(x, y, Math.round(34 * density), '#f87171', 200);
          this.ring(x, y, '#fca5a5', 70);
          this.addShake(14);
          this.addFlash('248,113,113', 0.34);
          if (event.text) this.addFloat(x, y - 26, event.text, '#fecaca', 18);
          break;
        case 'playerDeath':
          this.addShake(18);
          break;
        case 'powerupSpawn':
          this.burst(x, y, Math.round(8 * density), '#a5b4fc', 70);
          break;
        case 'powerupPickup': {
          const color = event.kind ? POWERUPS[event.kind as PowerupKind]?.color ?? '#a5b4fc' : '#a5b4fc';
          this.burst(x, y, Math.round(20 * density), color, 140);
          this.ring(x, y, color, 40);
          if (event.kind) this.addFloat(x, y - 24, POWERUPS[event.kind as PowerupKind].label.toUpperCase(), color, 16);
          break;
        }
        case 'ufoDestroyed':
          this.burst(x, y, Math.round(40 * density), '#f9a8d4', 220);
          this.ring(x, y, '#f472b6', 90);
          this.addShake(8);
          if (event.value) this.addFloat(x, y - 20, `+${event.value}`, '#f9a8d4', 20);
          break;
        case 'ufoAppear':
          this.burst(x, y, Math.round(12 * density), '#f0abfc', 70);
          break;
        case 'waveClear':
          this.addFlash('125,211,252', 0.2);
          this.addFloat(ARENA.width / 2, ARENA.height * 0.42, event.text ?? 'WAVE CLEAR', '#7dd3fc', 26, 110);
          break;
        case 'waveStart':
          this.addFloat(ARENA.width / 2, ARENA.height * 0.34, event.text ?? '', '#e9d5ff', 22, 100);
          break;
        case 'overdriveStart':
          this.addFlash('74,222,128', 0.24);
          this.addFloat(x, y - 30, 'OVERDRIVE', '#86efac', 22, 70);
          break;
        case 'extraLife':
          this.addFloat(x, y - 20, '+1 SHIP', '#f9a8d4', 20, 80);
          break;
        case 'invasion':
          this.addFlash('239,68,68', 0.42);
          this.addShake(20);
          break;
        case 'gameOver':
          this.addFlash('15,23,42', 0.5);
          break;
        case 'dive':
          this.burst(x, y, Math.round(6 * density), '#fb923c', 60);
          break;
        default:
          break;
      }
    }
  }

  private spawn(particle: Particle): Particle | null {
    for (const candidate of this.particles) {
      if (!candidate.active) return candidate;
    }
    return null;
  }

  private burst(x: number, y: number, count: number, color: string, speed: number): void {
    for (let i = 0; i < count; i++) {
      const particle = this.spawn(this.particles[0]);
      if (!particle) return;
      const angle = Math.random() * Math.PI * 2;
      const magnitude = speed * (0.35 + Math.random() * 0.85);
      particle.active = true;
      particle.kind = Math.random() < 0.72 ? 'spark' : 'debris';
      particle.x = x;
      particle.y = y;
      particle.vx = Math.cos(angle) * magnitude;
      particle.vy = Math.sin(angle) * magnitude;
      particle.maxLife = 0.35 + Math.random() * 0.6;
      particle.life = particle.maxLife;
      particle.size = particle.kind === 'spark' ? 1.4 + Math.random() * 1.8 : 2 + Math.random() * 3;
      particle.hue = color;
      particle.spin = (Math.random() - 0.5) * 12;
      particle.angle = Math.random() * Math.PI;
    }
  }

  private ring(x: number, y: number, color: string, size: number): void {
    const particle = this.spawn(this.particles[0]);
    if (!particle) return;
    particle.active = true;
    particle.kind = 'ring';
    particle.x = x;
    particle.y = y;
    particle.vx = 0;
    particle.vy = 0;
    particle.maxLife = 0.5;
    particle.life = particle.maxLife;
    particle.size = size;
    particle.hue = color;
    particle.spin = 0;
    particle.angle = 0;
  }

  private addFloat(x: number, y: number, text: string, color: string, size: number, life = 60): void {
    if (this.floats.length >= MAX_FLOATS) this.floats.shift();
    this.floats.push({
      x,
      y,
      text,
      maxLife: life,
      life,
      color,
      size,
      vy: -22,
    });
  }

  /** Visual slow-motion used on wave transitions (purely cosmetic). */
  setSlowMotion(amount: number): void {
    this.slowmo = Math.max(0, Math.min(1, amount));
  }

  /* -------------------------------- render -------------------------------- */

  /**
   * Snapshot entity positions immediately before a simulation tick. Combined
   * with the render alpha this decouples the 60 Hz simulation from the display
   * refresh rate, so motion stays fluid on 120 Hz panels and after a GC pause.
   */
  capturePrevious(state: SimState): void {
    const prev = this.prev;
    prev.player = state.player ? { x: state.player.x, y: state.player.y } : null;
    prev.enemies.clear();
    for (const enemy of state.enemies) prev.enemies.set(enemy.id, { x: enemy.x, y: enemy.y });
    prev.bullets.clear();
    for (const bullet of state.bullets) prev.bullets.set(bullet.id, { x: bullet.x, y: bullet.y });
    prev.powerups.clear();
    for (const powerup of state.powerups) prev.powerups.set(powerup.id, { x: powerup.x, y: powerup.y });
    prev.ufo = state.ufo ? { x: state.ufo.x, y: state.ufo.y } : null;
    prev.boss = state.boss ? { x: state.boss.x, y: state.boss.y } : null;
  }

  private lerpPoint(
    previous: { x: number; y: number } | null | undefined,
    x: number,
    y: number,
  ): { x: number; y: number } {
    if (!previous || this.alpha >= 1 || this.preferences.reducedMotion) return { x, y };
    return { x: previous.x + (x - previous.x) * this.alpha, y: previous.y + (y - previous.y) * this.alpha };
  }

  render(state: SimState, frameDelta: number, alpha = 1): void {
    const ctx = this.ctx;
    this.alpha = alpha;
    const timeScale = 1 - this.slowmo * 0.6;
    this.time += frameDelta * timeScale;
    this.pulse = Math.max(0, this.pulse - frameDelta * 2.4);
    this.shake *= Math.pow(0.0016, frameDelta);
    this.flash.alpha *= Math.pow(0.0009, frameDelta);

    const shakeX = (Math.random() - 0.5) * this.shake;
    const shakeY = (Math.random() - 0.5) * this.shake;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#04030c';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Backdrop (nebula + stars) rendered in device space.
    if (this.nebula) ctx.drawImage(this.nebula, 0, 0);
    this.drawStars(ctx, frameDelta * timeScale);

    // World transform: logical arena units → device pixels.
    ctx.setTransform(
      this.dpr * this.scale,
      0,
      0,
      this.dpr * this.scale,
      (this.offsetX + shakeX) * this.dpr,
      (this.offsetY + shakeY) * this.dpr,
    );

    this.drawArenaFrame(ctx);
    this.drawBunkers(ctx, state);
    this.drawPowerups(ctx, state);
    this.drawEnemies(ctx, state);
    this.drawBoss(ctx, state);
    this.drawUfo(ctx, state);
    this.drawBullets(ctx, state);
    this.drawPlayer(ctx, state);
    this.drawParticles(ctx, frameDelta * timeScale);
    this.drawFloats(ctx, frameDelta);

    // Screen-space overlays
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.overlay) ctx.drawImage(this.overlay, 0, 0);
    if (this.flash.alpha > 0.01) {
      ctx.fillStyle = `rgba(${this.flash.color},${this.flash.alpha.toFixed(3)})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    if (this.slowmo > 0.01) {
      ctx.fillStyle = `rgba(56,189,248,${(this.slowmo * 0.08).toFixed(3)})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    if (state.player.overdriveTicks > 0) {
      const intensity = 0.05 + 0.04 * Math.sin(this.time * 8);
      ctx.fillStyle = `rgba(74,222,128,${intensity.toFixed(3)})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  private drawStars(ctx: CanvasRenderingContext2D, delta: number): void {
    const drift = this.preferences.reducedMotion ? 0 : 1;
    for (const star of this.stars) {
      star.y += (8 + star.layer * 26) * delta * drift;
      if (star.y > this.cssHeight) {
        star.y = -2;
        star.x = Math.random() * this.cssWidth;
      }
      const alpha = star.alpha * (star.layer === 2 ? 1 : 0.7);
      ctx.fillStyle = star.layer === 2 ? `rgba(226,232,240,${alpha})` : `rgba(148,180,220,${alpha})`;
      const size = star.size * this.dpr;
      ctx.fillRect(star.x * this.dpr, star.y * this.dpr, size, size);
    }
  }

  private drawArenaFrame(ctx: CanvasRenderingContext2D): void {
    // Faint containment field around the play space.
    ctx.save();
    ctx.strokeStyle = 'rgba(129,140,248,0.16)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([10, 14]);
    ctx.strokeRect(0.5, 0.5, ARENA.width - 1, ARENA.height - 1);
    ctx.restore();

    const gradient = ctx.createLinearGradient(0, ARENA.height - 26, 0, ARENA.height);
    gradient.addColorStop(0, 'rgba(56,189,248,0)');
    gradient.addColorStop(1, 'rgba(56,189,248,0.18)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, ARENA.height - 26, ARENA.width, 26);
  }

  private drawBunkers(ctx: CanvasRenderingContext2D, state: SimState): void {
    for (const bunker of state.bunkers) {
      const ratio = bunker.hp / bunker.maxHp;
      ctx.save();
      ctx.globalAlpha = 0.35 + ratio * 0.55;
      const gradient = ctx.createLinearGradient(bunker.x, bunker.y, bunker.x, bunker.y + bunker.h);
      gradient.addColorStop(0, ratio > 0.6 ? '#86efac' : ratio > 0.3 ? '#fde047' : '#fb923c');
      gradient.addColorStop(1, 'rgba(21,128,61,0.55)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(bunker.x, bunker.y, bunker.w, bunker.h, 5);
      ctx.fill();
      ctx.strokeStyle = 'rgba(134,239,172,0.7)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      // Damage cracks
      if (ratio < 0.7) {
        ctx.strokeStyle = 'rgba(15,23,42,0.6)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(bunker.x + bunker.w * 0.22, bunker.y);
        ctx.lineTo(bunker.x + bunker.w * 0.38, bunker.y + bunker.h * 0.6);
        ctx.lineTo(bunker.x + bunker.w * 0.18, bunker.y + bunker.h);
        if (ratio < 0.4) {
          ctx.moveTo(bunker.x + bunker.w * 0.78, bunker.y);
          ctx.lineTo(bunker.x + bunker.w * 0.62, bunker.y + bunker.h * 0.7);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private drawPowerups(ctx: CanvasRenderingContext2D, state: SimState): void {
    for (const powerup of state.powerups) {
      const sprite = this.sprites.get(`powerup:${powerup.kind}`);
      if (!sprite) continue;
      const bob = Math.sin(powerup.phase * 0.12) * 3;
      const size = powerup.w + 24;
      const pos = this.lerpPoint(this.prev.powerups.get(powerup.id), powerup.x, powerup.y);
      ctx.save();
      ctx.globalAlpha = 0.95;
      ctx.drawImage(sprite, pos.x - 12, pos.y - 12 + bob, size, size);
      ctx.restore();
    }
  }

  private drawEnemies(ctx: CanvasRenderingContext2D, state: SimState): void {
    const padX = 15;
    for (const enemy of state.enemies) {
      const sprite = this.sprites.get(`enemy:${enemy.kind}`);
      if (!sprite) continue;
      const pos = this.lerpPoint(this.prev.enemies.get(enemy.id), enemy.x, enemy.y);
      const scale = (enemy.w + padX * 2) / enemy.w;
      const drawW = enemy.w * scale;
      const drawH = enemy.h * (drawW / (enemy.w + padX * 2)) * ((enemy.w + padX * 2) / (enemy.h + 15));
      ctx.drawImage(sprite, pos.x - padX, pos.y - padX * 0.5, drawW, Math.max(enemy.h + 8, drawH));
      if (enemy.flash > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(0.7, enemy.flash / 5);
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.roundRect(pos.x, pos.y, enemy.w, enemy.h, 4);
        ctx.fill();
        ctx.restore();
      }
      // Armour pips for multi-hit enemies
      if (enemy.maxHp > 1 && enemy.hp < enemy.maxHp) {
        ctx.fillStyle = 'rgba(248,113,113,0.85)';
        for (let i = 0; i < enemy.hp; i++) {
          ctx.fillRect(pos.x + 2 + i * 6, pos.y - 5, 4, 2);
        }
      }
    }
  }

  private drawBoss(ctx: CanvasRenderingContext2D, state: SimState): void {
    const boss = state.boss;
    if (!boss) return;
    const pos = this.lerpPoint(this.prev.boss, boss.x, boss.y);
    const sprite = this.sprites.get('boss');
    if (sprite) {
      ctx.drawImage(sprite, pos.x - 24, pos.y - 24, boss.w + 48, boss.h + 48);
    }
    if (boss.hitFlash > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.6, boss.hitFlash / 6);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.roundRect(pos.x, pos.y, boss.w, boss.h, 10);
      ctx.fill();
      ctx.restore();
    }
    // Health bar above the Dreadnought
    const ratio = Math.max(0, boss.hp / boss.maxHp);
    const barWidth = boss.w;
    ctx.save();
    ctx.fillStyle = 'rgba(2,6,23,0.8)';
    ctx.beginPath();
    ctx.roundRect(pos.x, pos.y - 16, barWidth, 7, 4);
    ctx.fill();
    const gradient = ctx.createLinearGradient(pos.x, 0, pos.x + barWidth, 0);
    gradient.addColorStop(0, boss.enraged ? '#f97316' : '#f43f5e');
    gradient.addColorStop(1, boss.enraged ? '#fde047' : '#fb7185');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(pos.x + 1, pos.y - 15, Math.max(0, (barWidth - 2) * ratio), 5, 3);
    ctx.fill();
    ctx.font = '700 10px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillStyle = 'rgba(254,226,226,0.9)';
    ctx.textAlign = 'center';
    ctx.fillText(
      boss.enraged ? 'DREADNOUGHT · ENRAGED' : `DREADNOUGHT · PHASE ${boss.phase}`,
      pos.x + boss.w / 2,
      pos.y - 22,
    );
    ctx.restore();
  }

  private drawUfo(ctx: CanvasRenderingContext2D, state: SimState): void {
    const ufo = state.ufo;
    if (!ufo) return;
    const pos = this.lerpPoint(this.prev.ufo, ufo.x, ufo.y);
    const sprite = this.sprites.get('ufo');
    if (sprite) ctx.drawImage(sprite, pos.x - 18, pos.y - 18, ufo.w + 36, ufo.h + 30);
    const glow = 0.35 + 0.25 * Math.sin(this.time * 6);
    ctx.save();
    ctx.globalAlpha = glow;
    ctx.fillStyle = '#f472b6';
    ctx.beginPath();
    ctx.ellipse(pos.x + ufo.w / 2, pos.y + ufo.h + 6, ufo.w * 0.5, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawBullets(ctx: CanvasRenderingContext2D, state: SimState): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const bullet of state.bullets) {
      const sprite = this.sprites.get(`bullet:${bullet.from}:${bullet.kind}`);
      const pos = this.lerpPoint(this.prev.bullets.get(bullet.id), bullet.x, bullet.y);
      // Motion trail
      const trailLength = bullet.from === 'player' ? 20 : 12;
      const color = bullet.from === 'player' ? '56,189,248' : '244,63,94';
      const gradient = ctx.createLinearGradient(
        pos.x + bullet.w / 2,
        pos.y,
        pos.x + bullet.w / 2,
        pos.y + trailLength * (bullet.from === 'player' ? 1 : -1),
      );
      gradient.addColorStop(0, `rgba(${color},0.5)`);
      gradient.addColorStop(1, `rgba(${color},0)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(pos.x, bullet.from === 'player' ? pos.y + bullet.h : pos.y - trailLength, bullet.w, trailLength);
      if (sprite) {
        const pad = 10;
        ctx.drawImage(sprite, pos.x - pad, pos.y - pad, bullet.w + pad * 2, bullet.h + pad * 2);
      }
    }
    ctx.restore();
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, state: SimState): void {
    const player = state.player;
    if (state.status === 'gameOver' && state.endReason === 'destroyed') return;
    const pos = this.lerpPoint(this.prev.player, player.x, player.y);

    ctx.save();
    // Mercy invulnerability blink
    if (player.invuln > 0 && Math.floor(this.time * 12) % 2 === 0) ctx.globalAlpha = 0.45;

    // Engine flame
    const thrust = 0.5 + player.thrust * 0.5 + (player.overdriveTicks > 0 ? 0.4 : 0);
    const flameHeight = 12 * thrust + Math.random() * 4;
    const flame = ctx.createLinearGradient(0, pos.y + player.h, 0, pos.y + player.h + flameHeight);
    flame.addColorStop(0, player.overdriveTicks > 0 ? 'rgba(134,239,172,0.95)' : 'rgba(125,211,252,0.95)');
    flame.addColorStop(1, 'rgba(56,189,248,0)');
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.moveTo(pos.x + player.w * 0.28, pos.y + player.h * 0.85);
    ctx.lineTo(pos.x + player.w * 0.72, pos.y + player.h * 0.85);
    ctx.lineTo(pos.x + player.w / 2, pos.y + player.h + flameHeight);
    ctx.closePath();
    ctx.fill();

    const sprite = this.sprites.get('player');
    if (sprite) ctx.drawImage(sprite, pos.x - 20, pos.y - 20, player.w + 40, player.h + 36);

    // Aegis shield
    if (player.shieldCharges > 0) {
      const cx = pos.x + player.w / 2;
      const cy = pos.y + player.h / 2;
      ctx.strokeStyle = 'rgba(34,211,238,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, player.w * 0.95, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(165,243,252,0.35)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(cx, cy, player.w * (0.95 + 0.06 * Math.sin(this.time * 5)), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawParticles(ctx: CanvasRenderingContext2D, delta: number): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const particle of this.particles) {
      if (!particle.active) continue;
      const ratio = Math.max(0, particle.life / particle.maxLife);
      if (particle.kind === 'ring') {
        const radius = particle.size * (1.6 - ratio);
        ctx.globalAlpha = ratio * 0.75;
        ctx.strokeStyle = particle.hue;
        ctx.lineWidth = 2 + ratio * 2;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      } else if (particle.kind === 'debris') {
        ctx.globalAlpha = ratio;
        ctx.fillStyle = particle.hue;
        ctx.save();
        ctx.translate(particle.x, particle.y);
        ctx.rotate(particle.angle);
        ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size * 0.6);
        ctx.restore();
      } else {
        ctx.globalAlpha = Math.min(1, ratio * 1.4);
        ctx.strokeStyle = particle.hue;
        ctx.lineWidth = particle.size * 0.7;
        ctx.beginPath();
        ctx.moveTo(particle.x, particle.y);
        ctx.lineTo(particle.x - particle.vx * 0.03, particle.y - particle.vy * 0.03);
        ctx.stroke();
      }

      particle.life -= delta * 60;
      if (particle.life <= 0) {
        particle.active = false;
        continue;
      }
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.vx *= Math.pow(0.18, delta);
      particle.vy *= Math.pow(0.18, delta);
      particle.angle += particle.spin * delta;
    }
    ctx.restore();
  }

  private drawFloats(ctx: CanvasRenderingContext2D, delta: number): void {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const float = this.floats[i];
      const ratio = float.life / float.maxLife;
      float.life -= delta * 60;
      float.y += float.vy * delta;
      if (float.life <= 0) {
        this.floats.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = Math.min(1, ratio * 1.6);
      ctx.font = `700 ${float.size}px "JetBrains Mono", ui-monospace, monospace`;
      ctx.fillStyle = 'rgba(2,6,23,0.65)';
      ctx.fillText(float.text, float.x + 1.5, float.y + 1.5);
      ctx.fillStyle = float.color;
      ctx.fillText(float.text, float.x, float.y);
    }
    ctx.restore();
  }

  /** Draw a still frame for posters / share images (no random effects). */
  snapshot(state: SimState): HTMLCanvasElement {
    this.render(state, 1 / 60);
    return this.canvas;
  }
}
