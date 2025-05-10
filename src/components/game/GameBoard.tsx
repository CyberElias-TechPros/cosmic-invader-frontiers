
import { useRef } from 'react';
import { GameState } from '@/types/game';
import StarField from '../StarField';
import PlayerShip from './entities/PlayerShip';
import Enemy from './entities/Enemy';
import Projectile from './entities/Projectile';
import Shield from './entities/Shield';
import Ufo from './entities/Ufo';

interface GameBoardProps {
  gameState: GameState;
  dimensions: { width: number; height: number };
  gameAreaRef: React.RefObject<HTMLDivElement>;
}

const GameBoard = ({ gameState, dimensions, gameAreaRef }: GameBoardProps) => {
  return (
    <div 
      ref={gameAreaRef} 
      className="w-full h-full absolute top-0 left-0"
      role="application"
      aria-label="Cosmic Invader Frontiers game area"
    >
      <StarField width={dimensions.width} height={dimensions.height} />
      
      {/* Player ship */}
      {gameState.status !== 'ready' && (
        <PlayerShip 
          x={gameState.player.x}
          bottom={30}
          width={gameState.player.width}
          height={gameState.player.height}
        />
      )}
      
      {/* Enemies */}
      {gameState.enemies.map(enemy => (
        <Enemy key={enemy.id} enemy={enemy} />
      ))}
      
      {/* UFO */}
      {gameState.ufo && <Ufo ufo={gameState.ufo} />}
      
      {/* Shields */}
      {gameState.shields.map(shield => (
        <Shield key={shield.id} shield={shield} />
      ))}
      
      {/* Projectiles */}
      {gameState.projectiles.map(projectile => (
        <Projectile key={projectile.id} projectile={projectile} />
      ))}
    </div>
  );
};

export default GameBoard;
