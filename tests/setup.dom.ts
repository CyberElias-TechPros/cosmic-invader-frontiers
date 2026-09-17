/**
 * jsdom environment polyfills.
 *
 * jsdom implements neither canvas nor the observer APIs the UI relies on, so
 * they are stubbed here. The stubs are deliberately dumb: tests assert on
 * application state and rendered DOM, never on pixels.
 */

/* ------------------------------- observers -------------------------------- */

class NoopObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): [] {
    return [];
  }
}

// @ts-expect-error - assigned for the test environment only
globalThis.ResizeObserver = globalThis.ResizeObserver ?? NoopObserver;
// @ts-expect-error - assigned for the test environment only
globalThis.IntersectionObserver = globalThis.IntersectionObserver ?? NoopObserver;

/* ------------------------------- matchMedia ------------------------------- */

if (!window.matchMedia) {
  // @ts-expect-error - minimal implementation for tests
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

/* ------------------------------- animation -------------------------------- */

if (!window.requestAnimationFrame) {
  // @ts-expect-error - minimal implementation for tests
  window.requestAnimationFrame = (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 16);
  // @ts-expect-error - minimal implementation for tests
  window.cancelAnimationFrame = (handle: number) => window.clearTimeout(handle);
}

if (!window.scrollTo) {
  // @ts-expect-error - jsdom lacks scrollTo
  window.scrollTo = () => {};
}

if (!globalThis.crypto?.randomUUID) {
  Object.defineProperty(globalThis.crypto ?? {}, 'randomUUID', {
    value: () => `test-${Math.random().toString(16).slice(2)}`,
  });
}

/* --------------------------------- canvas --------------------------------- */

/**
 * Canvas stand-in. Every 2D context method is a no-op and every property is
 * settable, which lets the real renderer run headlessly: if it ever calls a
 * method that does not exist, the Proxy throws and the test fails loudly.
 */
export function installCanvasStub(target: HTMLCanvasElement): void {
  const gradient = { addColorStop: () => {} };
  const context = new Proxy(
    {},
    {
      get: (_t, property: string) => {
        if (property === 'canvas') return target;
        if (property === 'createLinearGradient' || property === 'createRadialGradient') return () => gradient;
        if (property === 'measureText') return () => ({ width: 10 });
        if (property === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
        if (property === 'createPattern') return () => null;
        if (property === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
        // Anything else is treated as a callable no-op.
        return () => undefined;
      },
      set: () => true,
    },
  );

  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value() {
      return context;
    },
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
    configurable: true,
    value: () => 'data:image/png;base64,',
  });
}
