
import { memo } from 'react';
import { Projectile as ProjectileType } from '@/types/game';

interface ProjectileProps {
  projectile: ProjectileType;
}

const Projectile = memo(({ projectile }: ProjectileProps) => (
  <div
    key={projectile.id}
    className={`laser ${projectile.source === 'enemy' ? 'enemy-laser' : ''}`}
    style={{
      left: `${projectile.x}px`,
      top: `${projectile.y}px`,
      width: `${projectile.width}px`,
      height: `${projectile.height}px`,
    }}
    role="img"
    aria-hidden="true" // Hide from screen readers since they're visual effects
  />
));

Projectile.displayName = 'Projectile';

export default Projectile;
