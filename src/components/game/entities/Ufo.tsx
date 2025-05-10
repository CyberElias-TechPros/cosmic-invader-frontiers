
import { memo } from 'react';
import { Enemy } from '@/types/game';

interface UfoProps {
  ufo: Enemy;
}

const Ufo = memo(({ ufo }: UfoProps) => (
  <div
    className="absolute bg-space-accent animate-float"
    style={{
      left: `${ufo.x}px`,
      top: `${ufo.y}px`,
      width: `${ufo.width}px`,
      height: `${ufo.height}px`,
      borderRadius: '50% 50% 20% 20% / 60% 60% 40% 40%'
    }}
    role="img"
    aria-label="UFO bonus target"
  />
));

Ufo.displayName = 'Ufo';

export default Ufo;
