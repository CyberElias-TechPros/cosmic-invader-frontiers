import { ARENA } from '../../shared/game/config';
import type { InputState } from '../../shared/game/types';
import { EMPTY_INPUT } from '../../shared/game/types';

/**
 * Input layer: keyboard, pointer/touch drag-to-fly and gamepads, unified into
 * a single logical input state. Nothing here mutates the simulation — it only
 * reports intent, which keeps replays faithful (the recorder stores exactly
 * what this produced).
 */

export interface PointerState {
  active: boolean;
  targetX: number | null;
  targetY: number | null;
  fire: boolean;
}

export interface InputBindings {
  onPause?: () => void;
  onToggleMute?: () => void;
}

const KEY_LEFT = new Set(['ArrowLeft', 'KeyA']);
const KEY_RIGHT = new Set(['ArrowRight', 'KeyD']);
const KEY_FIRE = new Set(['Space', 'KeyJ', 'KeyK']);
const KEY_SPECIAL = new Set(['ShiftLeft', 'ShiftRight', 'KeyL', 'Enter']);

export class InputController {
  private element: HTMLElement | null = null;
  private bindings: InputBindings = {};
  private keys = new Set<string>();
  private pointer: PointerState = { active: false, targetX: null, targetY: null, fire: false };
  private pointerId: number | null = null;
  private gamepadIndex: number | null = null;
  private controller = new AbortController();
  private touchEnabled = true;
  private lastSign = 0;
  private specialPulse = 0;

  /** True while the player is using touch/pointer — drives on-screen hints. */
  pointerControls = false;

  attach(element: HTMLElement, bindings: InputBindings = {}): void {
    this.element = element;
    this.bindings = bindings;
    this.detach();
    this.controller = new AbortController();
    const signal = this.controller.signal;

    window.addEventListener(
      'keydown',
      (event) => {
        if (event.repeat && !KEY_FIRE.has(event.code)) return;
        if (KEY_LEFT.has(event.code) || KEY_RIGHT.has(event.code) || KEY_FIRE.has(event.code) || KEY_SPECIAL.has(event.code)) {
          event.preventDefault();
        }
        if (event.code === 'Escape' || event.code === 'KeyP') {
          this.bindings.onPause?.();
          return;
        }
        if (event.code === 'KeyM') {
          this.bindings.onToggleMute?.();
          return;
        }
        this.keys.add(event.code);
      },
      { signal },
    );

    window.addEventListener(
      'keyup',
      (event) => {
        this.keys.delete(event.code);
      },
      { signal },
    );

    // Losing focus must not leave the ship drifting forever.
    window.addEventListener('blur', () => this.keys.clear(), { signal });

    element.addEventListener(
      'pointerdown',
      (event) => {
        if (!this.touchEnabled) return;
        this.pointerId = event.pointerId;
        this.pointer.active = true;
        this.pointer.fire = true;
        this.pointerControls = true;
        this.updatePointer(event);
        element.setPointerCapture?.(event.pointerId);
        event.preventDefault();
      },
      { signal, passive: false },
    );

    element.addEventListener(
      'pointermove',
      (event) => {
        if (this.pointerId !== event.pointerId) return;
        this.updatePointer(event);
      },
      { signal },
    );

    const release = (event: PointerEvent) => {
      if (this.pointerId !== null && event.pointerId !== this.pointerId) return;
      this.pointerId = null;
      this.pointer.active = false;
      this.pointer.fire = false;
    };
    element.addEventListener('pointerup', release, { signal });
    element.addEventListener('pointercancel', release, { signal });

    window.addEventListener(
      'gamepadconnected',
      (event) => {
        this.gamepadIndex = (event as GamepadEvent).gamepad.index;
      },
      { signal },
    );
    window.addEventListener(
      'gamepaddisconnected',
      () => {
        this.gamepadIndex = null;
      },
      { signal },
    );
  }

  detach(): void {
    this.controller.abort();
    this.keys.clear();
    this.pointer = { active: false, targetX: null, targetY: null, fire: false };
    this.pointerId = null;
  }

  setTouchEnabled(enabled: boolean): void {
    this.touchEnabled = enabled;
    if (!enabled) this.pointer = { active: false, targetX: null, targetY: null, fire: false };
  }

  private updatePointer(event: PointerEvent): void {
    const element = this.element;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const relativeX = (event.clientX - rect.left) / rect.width;
    const relativeY = (event.clientY - rect.top) / rect.height;
    this.pointer.targetX = Math.max(0, Math.min(1, relativeX)) * ARENA.width;
    this.pointer.targetY = Math.max(0, Math.min(1, relativeY)) * ARENA.height;
  }

  /**
   * Registers a one-shot special press (used by the on-screen Overdrive
   * button). The simulation edge-triggers Overdrive, so a short pulse is
   * exactly equivalent to tapping the key.
   */
  pulseSpecial(): void {
    this.specialPulse = 3;
  }

  /** Clear the drag target (e.g. on pause) so the ship stops tracking. */
  clearPointer(): void {
    this.pointer.targetX = null;
    this.pointer.fire = false;
  }

  get pointerTarget(): { x: number | null; y: number | null } {
    return { x: this.pointer.targetX, y: this.pointer.targetY };
  }

  get pointerFiring(): boolean {
    return this.pointer?.fire ?? false;
  }

  private readGamepad(): { axis: number; fire: boolean; special: boolean; pause: boolean } {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) {
      return { axis: 0, fire: false, special: false, pause: false };
    }
    const pads = navigator.getGamepads();
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      if (this.gamepadIndex === null) this.gamepadIndex = pad.index;
      if (pad.index !== this.gamepadIndex) continue;
      const axis = pad.axes[0] ?? 0;
      const dpadLeft = pad.buttons[14]?.pressed ?? false;
      const dpadRight = pad.buttons[15]?.pressed ?? false;
      const fire = (pad.buttons[0]?.pressed ?? false) || (pad.buttons[7]?.value ?? 0) > 0.4;
      const special = (pad.buttons[2]?.pressed ?? false) || (pad.buttons[1]?.pressed ?? false);
      const pause = pad.buttons[9]?.pressed ?? false;
      const direction = Math.abs(axis) > 0.22 ? Math.sign(axis) : dpadLeft ? -1 : dpadRight ? 1 : 0;
      return { axis: direction, fire, special, pause };
    }
    return { axis: 0, fire: false, special: false, pause: false };
  }

  /** Resolve the current logical input once per simulation tick. */
  poll(): InputState {
    const left = [...KEY_LEFT].some((code) => this.keys.has(code));
    const right = [...KEY_RIGHT].some((code) => this.keys.has(code));
    const keyboardFire = [...KEY_FIRE].some((code) => this.keys.has(code));
    const special = [...KEY_SPECIAL].some((code) => this.keys.has(code));

    const gamepad = this.readGamepad();
    const sign = (right ? 1 : 0) - (left ? 1 : 0);
    if (sign !== 0) this.lastSign = sign;
    if (gamepad.pause) this.bindings.onPause?.();

    const pointerActive = this.pointer.active && this.pointer.targetX !== null;

    const pulsing = this.specialPulse > 0;
    if (pulsing) this.specialPulse -= 1;

    return {
      left: sign < 0 || gamepad.axis < 0,
      right: sign > 0 || gamepad.axis > 0,
      fire: keyboardFire || gamepad.fire || (pointerActive && this.pointer.fire),
      special: special || gamepad.special || pulsing,
    };
  }

  get isIdle(): boolean {
    const input = this.poll();
    return !input.left && !input.right && !input.fire && !input.special;
  }
}

export const INPUT_SNAPSHOT = EMPTY_INPUT;
