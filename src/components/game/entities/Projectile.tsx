
import { memo } from 'react';
import { Projectile as ProjectileType } from '@/types/game';

interface ProjectileProps {
  projectile: ProjectileType;
}

const Projectile = memo(({ projectile }: ProjectileProps) => {
  const isPlayerProjectile = projectile.source === 'player';
  
  return (
    <div
      className={`absolute ${isPlayerProjectile ? 'bg-blue-500' : 'bg-red-500'}`}
      style={{
        left: `${projectile.x}px`,
        top: `${projectile.y}px`,
        width: `${projectile.width}px`,
        height: `${projectile.height}px`,
        boxShadow: isPlayerProjectile ? '0 0 5px 2px rgba(59, 130, 246, 0.8)' : '0 0 5px 2px rgba(239, 68, 68, 0.8)',
        animation: isPlayerProjectile ? 'pulse-blue 0.5s infinite alternate' : 'pulse-red 0.5s infinite alternate'
      }}
      role="img"
      aria-hidden="true" // Hide from screen readers since they're visual effects
    />
  );
});

Projectile.displayName = 'Projectile';

export default Projectile;
