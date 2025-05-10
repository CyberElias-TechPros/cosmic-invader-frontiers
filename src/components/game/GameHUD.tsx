
import React from 'react';
import { GameState } from '@/types/game';

interface GameHUDProps {
  gameState: GameState;
}

const GameHUD = ({ gameState }: GameHUDProps) => {
  return (
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
  );
};

export default GameHUD;
