
import React from 'react';
import { GameState } from '@/types/game';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { useGameData } from '@/contexts/GameDataContext';

interface GameOverlayProps {
  gameState: GameState;
  onStartGame: () => void;
  onResumeGame: () => void;
}

const GameOverlay = ({ gameState, onStartGame, onResumeGame }: GameOverlayProps) => {
  const isMobile = useIsMobile();
  const { gameData } = useGameData();

  if (gameState.status === 'ready') {
    return (
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
          onClick={onStartGame}
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
    );
  }

  if (gameState.status === 'paused') {
    return (
      <div 
        className="absolute inset-0 bg-black bg-opacity-50 flex flex-col items-center justify-center"
        role="dialog"
        aria-label="Game paused"
        aria-modal="true"
      >
        <h2 className="text-4xl font-bold text-space-primary mb-8">PAUSED</h2>
        <Button 
          onClick={onResumeGame}
          className="bg-space-primary text-white text-xl px-6 py-4 rounded-lg hover:bg-space-secondary transition-colors"
          aria-label="Resume game"
        >
          Resume Game
        </Button>
      </div>
    );
  }

  if (gameState.status === 'gameOver') {
    return (
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
          onClick={onStartGame}
          className="bg-space-primary text-white text-xl px-6 py-4 rounded-lg hover:bg-space-secondary transition-colors"
          aria-label="Play again"
        >
          Play Again
        </Button>
      </div>
    );
  }

  return null;
};

export default GameOverlay;
