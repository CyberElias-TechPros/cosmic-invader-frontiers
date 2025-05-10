import { useRef, useState, useEffect } from 'react';
import { useGameState } from './useGameState';
import { useGameSounds } from './useGameSounds';

export function useGame(canvasWidth: number, canvasHeight: number) {
  const gameAreaRef = useRef<HTMLDivElement | null>(null);
  
  const { 
    gameState, 
    initGame, 
    togglePause, 
    playerShoot 
  } = useGameState(canvasWidth, canvasHeight);
  
  // Keep track of previous game state for sound effects
  const [prevGameState, setPrevGameState] = useState(null);
  
  // Update previous game state after current state changes
  useEffect(() => {
    setPrevGameState(gameState);
  }, [gameState]);
  
  // Initialize sound system
  const { playSound, toggleMute, isMuted } = useGameSounds(gameState, prevGameState);
  
  // Enhanced game initialization with sound
  const enhancedInitGame = () => {
    initGame();
    playSound('levelUp');
  };
  
  // Enhanced player shoot with sound
  const enhancedPlayerShoot = () => {
    playerShoot();
  };
  
  return {
    gameState,
    initGame: enhancedInitGame,
    togglePause,
    playerShoot: enhancedPlayerShoot,
    gameAreaRef,
    soundControls: {
      toggleMute,
      isMuted
    }
  };
}
