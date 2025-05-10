
import { useRef, useEffect, useState, useCallback } from 'react';
import { useAccessibility } from '@/contexts/AccessibilityContext';
import { useGameData } from '@/contexts/GameDataContext';
import GameBoard from './game/GameBoard';
import GameHUD from './game/GameHUD';
import GameOverlay from './game/GameOverlay';
import { Volume2, VolumeX } from 'lucide-react';

// Custom hooks
import { useGame } from '@/hooks/useGame';
import { useGameInput } from '@/hooks/useGameInput';
import { useGameLoop } from '@/hooks/useGameLoop';

const GameScreen = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const { incrementGamesPlayed } = useGameData();
  const { announceToScreenReader } = useAccessibility();
  
  // Update dimensions when container size changes
  const updateDimensions = useCallback(() => {
    if (containerRef.current) {
      const { width, height } = containerRef.current.getBoundingClientRect();
      setDimensions({ width, height });
    }
  }, []);
  
  // Set up resize observer
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
  
  // Initialize game with our enhanced hook
  const { 
    gameState, 
    initGame: baseInitGame, 
    togglePause, 
    playerShoot,
    gameAreaRef,
    updateGameState,
    nextLevel,
    gameOver,
    soundControls
  } = useGame(dimensions.width, dimensions.height);

  // Custom game initialization to track game count
  const handleGameStart = useCallback(() => {
    baseInitGame();
    incrementGamesPlayed();
    announceToScreenReader("Game started. Use arrow keys to move and space to shoot.");
  }, [baseInitGame, incrementGamesPlayed, announceToScreenReader]);

  // Set up game input
  const { keysPressed } = useGameInput(
    gameState,
    updateGameState,
    handleGameStart,
    togglePause,
    playerShoot,
    gameAreaRef
  );

  // Set up game loop
  useGameLoop(
    gameState,
    updateGameState,
    nextLevel,
    gameOver,
    dimensions.width,
    dimensions.height,
    keysPressed
  );

  // Handle keyboard accessibility for starting game
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Enter' && gameState.status === 'ready') {
        handleGameStart();
      } else if (e.code === 'Enter' && gameState.status === 'gameOver') {
        handleGameStart();
      } else if (e.code === 'KeyM') {
        soundControls.toggleMute();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState.status, handleGameStart, soundControls]);

  // Announce game status changes to screen readers
  useEffect(() => {
    if (gameState.status === 'paused') {
      announceToScreenReader("Game paused");
    } else if (gameState.status === 'gameOver') {
      const isNewHighScore = gameState.score > gameState.highScore;
      
      if (isNewHighScore) {
        announceToScreenReader(`Game over. New high score: ${gameState.score}`);
      } else {
        announceToScreenReader(`Game over. Score: ${gameState.score}`);
      }
    } else if (gameState.status === 'playing' && gameState.player.lives < 3) {
      announceToScreenReader(`Lives remaining: ${gameState.player.lives}`);
    }
  }, [gameState.status, gameState.score, gameState.highScore, gameState.player.lives, announceToScreenReader]);

  return (
    <div 
      ref={containerRef}
      className="w-full h-full relative bg-space-background overflow-hidden"
    >
      <GameBoard
        gameState={gameState}
        dimensions={dimensions}
        gameAreaRef={gameAreaRef}
      />
      
      {/* Game HUD */}
      <GameHUD gameState={gameState} />
      
      {/* Sound control button */}
      <button
        onClick={() => soundControls.toggleMute()}
        className="absolute top-4 right-4 z-50 w-10 h-10 flex items-center justify-center rounded-full bg-space-background bg-opacity-70 hover:bg-opacity-100 transition-all"
        aria-label={soundControls.isMuted ? "Unmute game sounds" : "Mute game sounds"}
      >
        {soundControls.isMuted ? (
          <VolumeX className="text-white" size={20} />
        ) : (
          <Volume2 className="text-white" size={20} />
        )}
      </button>
      
      {/* Game Overlays (Start, Pause, GameOver screens) */}
      <GameOverlay 
        gameState={gameState} 
        onStartGame={handleGameStart} 
        onResumeGame={togglePause} 
      />
    </div>
  );
};

export default GameScreen;
