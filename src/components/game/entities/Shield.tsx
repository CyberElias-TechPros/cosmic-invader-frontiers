
import { memo } from 'react';
import { Shield as ShieldType } from '@/types/game';

interface ShieldProps {
  shield: ShieldType;
}

const Shield = memo(({ shield }: ShieldProps) => (
  <div
    key={shield.id}
    className={`shield ${
      shield.health === 2 ? 'damaged' : shield.health === 1 ? 'heavily-damaged' : ''
    }`}
    style={{
      left: `${shield.x}px`,
      top: `${shield.y}px`,
      width: `${shield.width}px`,
      height: `${shield.height}px`,
    }}
    role="img"
    aria-label={`Shield with ${shield.health} health remaining`}
  />
));

Shield.displayName = 'Shield';

export default Shield;
