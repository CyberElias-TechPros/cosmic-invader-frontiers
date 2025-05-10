
import { memo } from 'react';
import { Enemy as EnemyType } from '@/types/game';

interface EnemyProps {
  enemy: EnemyType;
}

const Enemy = memo(({ enemy }: EnemyProps) => (
  <div
    key={enemy.id}
    className={`absolute animate-enemy-move ${
      enemy.type === 'tank' 
        ? 'bg-space-danger' 
        : enemy.type === 'shooter' 
          ? 'bg-space-warning'
          : 'bg-space-secondary'
    }`}
    style={{
      left: `${enemy.x}px`,
      top: `${enemy.y}px`,
      width: `${enemy.width}px`,
      height: `${enemy.height}px`,
      clipPath: 
        enemy.type === 'tank' 
          ? 'polygon(0% 25%, 25% 0%, 75% 0%, 100% 25%, 100% 75%, 75% 100%, 25% 100%, 0% 75%)' 
          : enemy.type === 'shooter'
            ? 'polygon(0% 0%, 100% 0%, 80% 100%, 20% 100%)'
            : 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)'
    }}
    role="img"
    aria-label={`${enemy.type} enemy`}
  />
));

Enemy.displayName = 'Enemy';

export default Enemy;
