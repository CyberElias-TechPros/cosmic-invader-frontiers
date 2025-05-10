
import { memo } from 'react';

interface PlayerShipProps {
  x: number;
  bottom: number;
  width: number;
  height: number;
}

const PlayerShip = memo(({ x, bottom, width, height }: PlayerShipProps) => (
  <div 
    className="absolute bg-space-primary animate-pulse-glow"
    style={{
      left: `${x}px`,
      bottom: `${bottom}px`,
      width: `${width}px`,
      height: `${height}px`,
      clipPath: 'polygon(0% 100%, 100% 100%, 50% 0%)'
    }}
    role="img"
    aria-label="Player ship"
  />
));

PlayerShip.displayName = 'PlayerShip';

export default PlayerShip;
