
import { useCallback, useRef, useEffect } from 'react';
import { GameState } from '@/types/game';
import { useGameState } from './useGameState';

export function useGameInput(
  gameState: GameState, 
  updateGameState: (updater: (state: GameState) => GameState) => void,
  initGame: () => void,
  togglePause: () => void,
  playerShoot: () => void,
  gameAreaRef: React.RefObject<HTMLDivElement>
) {
  const keysPressed = useRef<Record<string, boolean>>({});
  const touchStartX = useRef<number | null>(null);

  // Movement handler for keyboard input
  const handleKeyPress = useCallback((e: KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Space') {
      playerShoot();
    } else if (e.key === 'p' || e.key === 'P') {
      togglePause();
    } else if (e.key === 'Enter' && gameState.status === 'ready') {
      initGame();
    } else if (e.key === 'Enter' && gameState.status === 'gameOver') {
      initGame();
    }
    
    keysPressed.current[e.key] = true;
  }, [playerShoot, togglePause, initGame, gameState.status]);

  const handleKeyRelease = useCallback((e: KeyboardEvent) => {
    keysPressed.current[e.key] = false;
  }, []);

  // Touch input handlers
  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (gameState.status === 'ready' || gameState.status === 'gameOver') {
      initGame();
      return;
    }
    
    const touch = e.touches[0];
    touchStartX.current = touch.clientX;
    
    // Shoot on tap
    playerShoot();
    
    e.preventDefault();
  }, [gameState.status, initGame, playerShoot]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (gameState.status !== 'playing' || touchStartX.current === null || !gameAreaRef.current) {
      return;
    }
    
    const touch = e.touches[0];
    const gameAreaRect = gameAreaRef.current.getBoundingClientRect();
    const touchX = touch.clientX;
    
    // Calculate relative position within game area
    const relativeX = touchX - gameAreaRect.left;
    const playerCenterX = relativeX - (gameState.player.width / 2);
    
    // Move player to touch position (bounded by game area)
    updateGameState(prevState => ({
      ...prevState,
      player: {
        ...prevState.player,
        x: Math.max(0, Math.min(gameAreaRect.width - prevState.player.width, playerCenterX))
      }
    }));
    
    e.preventDefault();
  }, [gameState.status, gameState.player.width, updateGameState, gameAreaRef]);

  const handleTouchEnd = useCallback(() => {
    touchStartX.current = null;
  }, []);

  // Set up event listeners
  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    window.addEventListener('keyup', handleKeyRelease);
    
    if (gameAreaRef.current) {
      gameAreaRef.current.addEventListener('touchstart', handleTouchStart as any);
      gameAreaRef.current.addEventListener('touchmove', handleTouchMove as any);
      gameAreaRef.current.addEventListener('touchend', handleTouchEnd as any);
    }
    
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
      window.removeEventListener('keyup', handleKeyRelease);
      
      if (gameAreaRef.current) {
        gameAreaRef.current.removeEventListener('touchstart', handleTouchStart as any);
        gameAreaRef.current.removeEventListener('touchmove', handleTouchMove as any);
        gameAreaRef.current.removeEventListener('touchend', handleTouchEnd as any);
      }
    };
  }, [handleKeyPress, handleKeyRelease, handleTouchStart, handleTouchMove, handleTouchEnd, gameAreaRef]);

  return { keysPressed };
}
