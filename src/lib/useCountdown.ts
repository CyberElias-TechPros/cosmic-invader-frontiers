import { useEffect, useState } from 'react';
import { countdownParts } from './format';

/**
 * Ticking countdown to a UTC instant.
 *
 * Ticks once per second, stops when the target passes, and normalises the
 * remaining time to the whole second so the rendered labels never flicker.
 */
export function useCountdown(target: string | null | undefined): {
  hours: string;
  minutes: string;
  seconds: string;
  expired: boolean;
  ready: boolean;
} {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!target) return;
    const timer = window.setInterval(() => {
      const next = Date.now();
      setNow(next);
      if (Date.parse(target) <= next) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [target]);

  if (!target) return { hours: '--', minutes: '--', seconds: '--', expired: false, ready: false };
  return { ...countdownParts(target, now), ready: true };
}
