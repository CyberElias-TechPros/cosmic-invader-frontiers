
import { useRef } from 'react';
import { useGameState } from './useGameState';

export function useGame(canvasWidth: number, canvasHeight: number) {
  const gameAreaRef = useRef<HTMLDivElement | null>(null);
  
  const { 
    gameState, 
    initGame, 
    togglePause, 
    playerShoot 
  } = useGameState(canvasWidth, canvasHeight);

  return {
    gameState,
    initGame,
    togglePause,
    playerShoot,
    gameAreaRef
  };
}
