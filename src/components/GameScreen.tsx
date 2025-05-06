
import { useRef, useEffect, useState } from 'react';
import { useGame } from '@/hooks/useGame';
import { Button } from '@/components/ui/button';
import StarField from './StarField';

const GameScreen = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        setDimensions({ width, height });
      }
    };
    
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    
    return () => {
      window.removeEventListener('resize', updateDimensions);
    };
  }, []);
  
  const { gameState, initGame, togglePause, playerShoot, gameAreaRef } = useGame(
    dimensions.width,
    dimensions.height
  );
  
  return (
    <div 
      ref={containerRef}
      className="w-full h-full relative bg-space-background overflow-hidden"
    >
      <div 
        ref={gameAreaRef} 
        className="w-full h-full absolute top-0 left-0"
      >
        <StarField width={dimensions.width} height={dimensions.height} />
        
        {/* Game UI */}
        <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-center">
          <div className="text-space-white text-xl">
            <div className="flex items-center">
              <span className="font-bold mr-1">Score:</span> 
              <span className="text-space-primary">{gameState.score}</span>
            </div>
            <div className="flex items-center">
              <span className="font-bold mr-1">High:</span> 
              <span className="text-space-accent">{gameState.highScore}</span>
            </div>
          </div>
          
          <div className="text-space-white text-xl">
            <div className="flex items-center">
              <span className="font-bold mr-1">Level:</span> 
              <span className="text-space-warning">{gameState.level}</span>
            </div>
            <div className="flex items-center">
              <span className="font-bold mr-1">Lives:</span>
              {Array.from({ length: gameState.player.lives }).map((_, i) => (
                <span key={i} className="text-space-danger mx-1">♥</span>
              ))}
            </div>
          </div>
        </div>
        
        {/* Player ship */}
        {gameState.status !== 'ready' && (
          <div 
            className="absolute bg-space-primary animate-pulse-glow"
            style={{
              left: `${gameState.player.x}px`,
              bottom: `${30}px`,
              width: `${gameState.player.width}px`,
              height: `${gameState.player.height}px`,
              clipPath: 'polygon(0% 100%, 100% 100%, 50% 0%)'
            }}
          />
        )}
        
        {/* Enemies */}
        {gameState.enemies.map(enemy => (
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
          />
        ))}
        
        {/* UFO */}
        {gameState.ufo && (
          <div
            className="absolute bg-space-accent animate-float"
            style={{
              left: `${gameState.ufo.x}px`,
              top: `${gameState.ufo.y}px`,
              width: `${gameState.ufo.width}px`,
              height: `${gameState.ufo.height}px`,
              borderRadius: '50% 50% 20% 20% / 60% 60% 40% 40%'
            }}
          />
        )}
        
        {/* Shields */}
        {gameState.shields.map(shield => (
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
          />
        ))}
        
        {/* Projectiles */}
        {gameState.projectiles.map(projectile => (
          <div
            key={projectile.id}
            className={`laser ${projectile.source === 'enemy' ? 'enemy-laser' : ''}`}
            style={{
              left: `${projectile.x}px`,
              top: `${projectile.y}px`,
              width: `${projectile.width}px`,
              height: `${projectile.height}px`,
            }}
          />
        ))}
        
        {/* Start screen */}
        {gameState.status === 'ready' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <h1 className="text-4xl md:text-6xl font-bold text-space-primary animate-pulse-glow mb-8">
              COSMIC INVADER
              <span className="text-space-accent">FRONTIERS</span>
            </h1>
            <p className="text-space-white text-xl mb-12 max-w-md text-center">
              Defend Earth against the invading alien armada! Move with arrow keys and shoot with space bar.
            </p>
            <Button 
              onClick={initGame}
              className="bg-space-primary text-white text-xl px-8 py-6 rounded-lg hover:bg-space-secondary transition-colors"
            >
              Start Game
            </Button>
            <div className="mt-8 text-space-white text-lg">
              <p><span className="text-space-primary">←/→</span> or <span className="text-space-primary">A/D</span>: Move ship</p>
              <p><span className="text-space-primary">Space</span>: Shoot</p>
              <p><span className="text-space-primary">P</span>: Pause game</p>
            </div>
          </div>
        )}
        
        {/* Paused screen */}
        {gameState.status === 'paused' && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex flex-col items-center justify-center">
            <h2 className="text-4xl font-bold text-space-primary mb-8">PAUSED</h2>
            <Button 
              onClick={togglePause}
              className="bg-space-primary text-white text-xl px-6 py-4 rounded-lg hover:bg-space-secondary transition-colors"
            >
              Resume Game
            </Button>
          </div>
        )}
        
        {/* Game over screen */}
        {gameState.status === 'gameOver' && (
          <div className="absolute inset-0 bg-black bg-opacity-70 flex flex-col items-center justify-center">
            <h2 className="text-4xl font-bold text-space-danger mb-4">GAME OVER</h2>
            <p className="text-space-white text-2xl mb-2">Score: <span className="text-space-primary">{gameState.score}</span></p>
            <p className="text-space-white text-2xl mb-8">High Score: <span className="text-space-accent">{gameState.highScore}</span></p>
            <Button 
              onClick={initGame}
              className="bg-space-primary text-white text-xl px-6 py-4 rounded-lg hover:bg-space-secondary transition-colors"
            >
              Play Again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default GameScreen;
