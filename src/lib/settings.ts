import { useSyncExternalStore } from 'react';
import type { Difficulty } from '../../shared/game/config';

/**
 * Player settings. Stored locally (instant, works offline) and mirrored into
 * the cloud save so a pilot's cockpit feels identical on another device.
 */

export interface GameSettings {
  sound: boolean;
  music: boolean;
  sfxVolume: number;
  musicVolume: number;
  screenShake: boolean;
  reducedMotion: boolean;
  particles: 'full' | 'reduced' | 'off';
  showBenchmarks: boolean;
  assistMode: boolean;
  /** Hold-free firing: standard for mobile, a quality-of-life option on desktop. */
  autoFire: boolean;
  difficulty: Difficulty;
  virtualControls: 'auto' | 'always' | 'never';
}

export const DEFAULT_SETTINGS: GameSettings = {
  sound: true,
  music: true,
  sfxVolume: 0.6,
  musicVolume: 0.35,
  screenShake: true,
  reducedMotion: false,
  particles: 'full',
  showBenchmarks: true,
  assistMode: false,
  autoFire: true,
  difficulty: 'pilot',
  virtualControls: 'auto',
};

const STORAGE_KEY = 'cif.settings.v1';

function readStored(): GameSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

let settings: GameSettings = readStored();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export const settingsStore = {
  get(): GameSettings {
    return settings;
  },
  set(patch: Partial<GameSettings>) {
    settings = { ...settings, ...patch };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* ignore quota / private mode */
    }
    emit();
  },
  reset() {
    settings = { ...DEFAULT_SETTINGS };
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    emit();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  /** Honour the OS-level reduced motion preference on first visit. */
  applySystemDefaults() {
    if (typeof window === 'undefined') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (query.matches && !settings.reducedMotion) {
      settingsStore.set({ reducedMotion: true, screenShake: false, particles: 'reduced' });
    }
  },
};

export function useSettings(): GameSettings {
  return useSyncExternalStore(settingsStore.subscribe, settingsStore.get, settingsStore.get);
}

export function updateSettings(patch: Partial<GameSettings>) {
  settingsStore.set(patch);
}

/** Serializable settings payload for the cloud save. */
export function settingsSnapshot(): Record<string, unknown> {
  return { ...settings };
}

export function mergeCloudSettings(payload: Record<string, unknown> | null | undefined) {
  if (!payload || typeof payload !== 'object') return;
  const cloud = (payload.settings ?? payload) as Partial<GameSettings>;
  const merged: Partial<GameSettings> = {};
  for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof GameSettings>) {
    if (cloud[key] !== undefined && typeof cloud[key] === typeof DEFAULT_SETTINGS[key]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (merged as any)[key] = cloud[key];
    }
  }
  if (Object.keys(merged).length > 0) settingsStore.set(merged);
}
