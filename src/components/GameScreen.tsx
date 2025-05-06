
import { useRef, useEffect, useState, useCallback, memo } from 'react';
import { useGame } from '@/hooks/useGame';
import { Button } from '@/components/ui/button';
import StarField from './StarField';
import { useIsMobile } from '@/hooks/use-mobile';
import { useGameData } from '@/contexts/GameDataContext';
import { useAccessibility } from '@/contexts/AccessibilityContext';

const PlayerShip = memo(({ x, bottom, width, height }: { x: number; bottom: number; width: number; height: number }) => (
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

const Enemy = memo(({ enemy }: { enemy: any }) => (
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

const Projectile = memo(({ projectile }: { projectile: any }) => (
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

const Shield = memo(({ shield }: { shield: any }) => (
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

const Ufo = memo(({ ufo }: { ufo: any }) => (
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

const GameScreen = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const isMobile = useIsMobile();
  const { gameData, updateHighScore, incrementGamesPlayed } = useGameData();
  const { announceToScreenReader } = useAccessibility();
  
  const updateDimensions = useCallback(() => {
    if (containerRef.current) {
      const { width, height } = containerRef.current.getBoundingClientRect();
      setDimensions({ width, height });
    }
  }, []);
  
  useEffect(() => {
    updateDimensions();
    
    // Use ResizeObserver for more accurate dimension tracking
    const resizeObserver = new ResizeObserver(updateDimensions);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    
    window.addEventListener('resize', updateDimensions);
    
    return () => {
      if (containerRef.current) {
        resizeObserver.unobserve(containerRef.current);
      }
      window.removeEventListener('resize', updateDimensions);
    };
  }, [updateDimensions]);
  
  const { 
    gameState, 
    initGame, 
    togglePause, 
    playerShoot, 
    gameAreaRef 
  } = useGame(
    dimensions.width,
    dimensions.height
  );

  // Custom game initialization to track game count
  const handleGameStart = useCallback(() => {
    initGame();
    incrementGamesPlayed();
    announceToScreenReader("Game started. Use arrow keys to move and space to shoot.");
  }, [initGame, incrementGamesPlayed, announceToScreenReader]);

  // Handle keyboard accessibility
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Enter' && gameState.status === 'ready') {
        handleGameStart();
      } else if (e.code === 'Enter' && gameState.status === 'gameOver') {
        handleGameStart();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState.status, handleGameStart]);

  // Announce game status changes to screen readers
  useEffect(() => {
    if (gameState.status === 'paused') {
      announceToScreenReader("Game paused");
    } else if (gameState.status === 'gameOver') {
      const isNewHighScore = updateHighScore(gameState.score);
      if (isNewHighScore) {
        announceToScreenReader(`Game over. New high score: ${gameState.score}`);
      } else {
        announceToScreenReader(`Game over. Score: ${gameState.score}`);
      }
    } else if (gameState.status === 'playing' && gameState.player.lives < 3) {
      announceToScreenReader(`Lives remaining: ${gameState.player.lives}`);
    }
  }, [gameState.status, gameState.score, gameState.player.lives, announceToScreenReader, updateHighScore]);

  return (
    <div 
      ref={containerRef}
      className="w-full h-full relative bg-space-background overflow-hidden"
    >
      <div 
        ref={gameAreaRef} 
        className="w-full h-full absolute top-0 left-0"
        role="application"
        aria-label="Cosmic Invader Frontiers game area"
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
              <span className="sr-only">{gameState.player.lives}</span>
              {Array.from({ length: gameState.player.lives }).map((_, i) => (
                <span key={i} className="text-space-danger mx-1" aria-hidden="true">♥</span>
              ))}
            </div>
          </div>
        </div>
        
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
        
        {/* Start screen */}
        {gameState.status === 'ready' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
            <h1 className="text-3xl md:text-6xl font-bold text-space-primary animate-pulse-glow mb-4 md:mb-8 text-center">
              COSMIC INVADER
              <span className="text-space-accent">FRONTIERS</span>
            </h1>
            <p className="text-space-white text-lg md:text-xl mb-8 md:mb-12 max-w-md text-center">
              Defend Earth against the invading alien armada!
              {!isMobile ? " Move with arrow keys and shoot with space bar." : " Tap to shoot. Touch and drag to move."}
            </p>
            <Button 
              onClick={handleGameStart}
              className="bg-space-primary text-white text-xl px-6 py-4 md:px-8 md:py-6 rounded-lg hover:bg-space-secondary transition-colors"
            >
              Start Game
            </Button>
            <div className="mt-6 md:mt-8 text-space-white text-sm md:text-lg">
              {!isMobile ? (
                <>
                  <p><span className="text-space-primary">←/→</span> or <span className="text-space-primary">A/D</span>: Move ship</p>
                  <p><span className="text-space-primary">Space</span>: Shoot</p>
                  <p><span className="text-space-primary">P</span>: Pause game</p>
                </>
              ) : (
                <>
                  <p><span className="text-space-primary">Tap</span>: Shoot</p>
                  <p><span className="text-space-primary">Touch & Drag</span>: Move ship</p>
                </>
              )}
            </div>
          </div>
        )}
        
        {/* Paused screen */}
        {gameState.status === 'paused' && (
          <div 
            className="absolute inset-0 bg-black bg-opacity-50 flex flex-col items-center justify-center"
            role="dialog"
            aria-label="Game paused"
            aria-modal="true"
          >
            <h2 className="text-4xl font-bold text-space-primary mb-8">PAUSED</h2>
            <Button 
              onClick={togglePause}
              className="bg-space-primary text-white text-xl px-6 py-4 rounded-lg hover:bg-space-secondary transition-colors"
              aria-label="Resume game"
            >
              Resume Game
            </Button>
          </div>
        )}
        
        {/* Game over screen */}
        {gameState.status === 'gameOver' && (
          <div 
            className="absolute inset-0 bg-black bg-opacity-70 flex flex-col items-center justify-center"
            role="dialog"
            aria-label="Game over screen"
            aria-modal="true"
          >
            <h2 className="text-4xl font-bold text-space-danger mb-4">GAME OVER</h2>
            <p className="text-space-white text-2xl mb-2">Score: <span className="text-space-primary">{gameState.score}</span></p>
            <p className="text-space-white text-2xl mb-8">High Score: <span className="text-space-accent">{Math.max(gameData.highScore, gameState.highScore)}</span></p>
            <Button 
              onClick={handleGameStart}
              className="bg-space-primary text-white text-xl px-6 py-4 rounded-lg hover:bg-space-secondary transition-colors"
              aria-label="Play again"
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
