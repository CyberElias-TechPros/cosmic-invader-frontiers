
import { useState, useCallback } from 'react';
import { GameState, Player } from '@/types/game';
import { useToast } from '@/hooks/use-toast';
import { 
  createEnemyFormation,
  createShields,
  loadGameState,
  saveGameState
} from '@/utils/gameUtils';

export function useGameState(canvasWidth: number, canvasHeight: number) {
  const { toast } = useToast();

  // Initialize game state with saved state or defaults
  const [gameState, setGameState] = useState<GameState>(() => {
    const savedState = loadGameState();
    if (savedState && savedState.status !== 'gameOver') {
      return {
        ...savedState,
        player: {
          ...savedState.player,
          x: canvasWidth / 2 - 20 // Reposition player based on current canvas
        },
        highScore: parseInt(localStorage.getItem('spaceInvadersHighScore') || '0')
      };
    }
    
    return {
      status: 'ready',
      score: 0,
      highScore: parseInt(localStorage.getItem('spaceInvadersHighScore') || '0'),
      level: 1,
      player: {
        id: 'player',
        x: canvasWidth / 2 - 20,
        y: canvasHeight - 60,
        width: 40,
        height: 30,
        lives: 3,
        speed: 300,
        cooldown: 300,
        lastShot: 0
      },
      enemies: [],
      projectiles: [],
      shields: [],
      ufo: null,
      lastUfoSpawn: 0
    };
  });

  // Initialize game
  const initGame = useCallback(() => {
    setGameState(prevState => ({
      ...prevState,
      status: 'playing',
      score: 0,
      level: 1,
      player: {
        ...prevState.player,
        x: canvasWidth / 2 - 20,
        y: canvasHeight - 60,
        lives: 3
      },
      enemies: createEnemyFormation(1, canvasWidth),
      projectiles: [],
      shields: createShields(canvasWidth, canvasHeight),
      ufo: null,
      lastUfoSpawn: Date.now()
    }));

    toast({
      title: "Game Started",
      description: "Defend Earth from the space invaders!",
      duration: 2000,
    });
  }, [canvasWidth, canvasHeight, toast]);

  // Next level
  const nextLevel = useCallback(() => {
    setGameState(prevState => {
      const newLevel = prevState.level + 1;
      
      toast({
        title: `Level ${newLevel}`,
        description: "Enemy forces have increased!",
        duration: 2000,
      });
      
      return {
        ...prevState,
        level: newLevel,
        enemies: createEnemyFormation(newLevel, canvasWidth),
        shields: createShields(canvasWidth, canvasHeight)
      };
    });
  }, [canvasWidth, canvasHeight, toast]);

  // Game over
  const gameOver = useCallback(() => {
    setGameState(prevState => {
      // Save high score
      if (prevState.score > prevState.highScore) {
        localStorage.setItem('spaceInvadersHighScore', prevState.score.toString());
        
        toast({
          title: "New High Score!",
          description: `You achieved ${prevState.score} points!`,
          duration: 4000,
        });
      } else {
        toast({
          title: "Game Over",
          description: `Your score: ${prevState.score}`,
          duration: 3000,
        });
      }
      
      return {
        ...prevState,
        status: 'gameOver',
        highScore: Math.max(prevState.score, prevState.highScore)
      };
    });
  }, [toast]);

  // Pause/Resume game
  const togglePause = useCallback(() => {
    setGameState(prevState => ({
      ...prevState,
      status: prevState.status === 'paused' ? 'playing' : 'paused'
    }));
  }, []);

  // Player shooting
  const playerShoot = useCallback(() => {
    setGameState(prevState => {
      const now = Date.now();
      if (now - prevState.player.lastShot < prevState.player.cooldown) {
        return prevState;
      }
      
      const newProjectile = {
        id: `player-projectile-${now}`,
        x: prevState.player.x + (prevState.player.width / 2) - 1,
        y: prevState.player.y,
        width: 2,
        height: 15,
        speed: 400,
        source: 'player' as const
      };

      return {
        ...prevState,
        projectiles: [...prevState.projectiles, newProjectile],
        player: {
          ...prevState.player,
          lastShot: now
        }
      };
    });
  }, []);

  // Update game state
  const updateGameState = useCallback((updater: (state: GameState) => GameState) => {
    setGameState(updater);
  }, []);

  return { 
    gameState, 
    setGameState, 
    initGame, 
    nextLevel, 
    gameOver, 
    togglePause, 
    playerShoot,
    updateGameState
  };
}
