
import { useState, useEffect, useCallback, useRef } from 'react';
import { GameState, Player, Enemy, Projectile, Shield } from '../types/game';
import { 
  checkCollision, 
  createEnemyFormation, 
  createShields, 
  createUfo, 
  createPlayerProjectile, 
  createEnemyProjectile,
  isPlayerHit,
  processShieldHit,
  checkEnemyHits
} from '../utils/gameUtils';
import { v4 as uuidv4 } from 'uuid';
import { useToast } from '@/components/ui/use-toast';

export function useGame(canvasWidth: number, canvasHeight: number) {
  const { toast } = useToast();
  const [gameState, setGameState] = useState<GameState>({
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
  });

  const requestRef = useRef<number>();
  const previousTimeRef = useRef<number>();
  const keysPressed = useRef<Record<string, boolean>>({});
  const touchStartX = useRef<number | null>(null);
  const gameAreaRef = useRef<HTMLDivElement | null>(null);

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
      
      return {
        ...prevState,
        projectiles: [
          ...prevState.projectiles,
          createPlayerProjectile(
            prevState.player.x, 
            prevState.player.y,
            prevState.player.width
          )
        ],
        player: {
          ...prevState.player,
          lastShot: now
        }
      };
    });
  }, []);

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
    setGameState(prevState => ({
      ...prevState,
      player: {
        ...prevState.player,
        x: Math.max(0, Math.min(canvasWidth - prevState.player.width, playerCenterX))
      }
    }));
    
    e.preventDefault();
  }, [gameState.status, gameState.player.width, canvasWidth]);

  const handleTouchEnd = useCallback(() => {
    touchStartX.current = null;
  }, []);

  // Game loop (animation frame)
  const gameLoop = useCallback((time: number) => {
    if (previousTimeRef.current === undefined) {
      previousTimeRef.current = time;
    }
    
    // Calculate time delta for frame-rate independent movement
    const delta = (time - previousTimeRef.current) / 1000;
    previousTimeRef.current = time;
    
    // Skip updates if game is not playing
    if (gameState.status !== 'playing') {
      requestRef.current = requestAnimationFrame(gameLoop);
      return;
    }
    
    setGameState(prevState => {
      let { player, enemies, projectiles, shields, ufo, lastUfoSpawn, score } = prevState;
      
      // Handle keyboard movement
      if (keysPressed.current['ArrowLeft'] || keysPressed.current['a']) {
        player = {
          ...player,
          x: Math.max(0, player.x - player.speed * delta)
        };
      }
      if (keysPressed.current['ArrowRight'] || keysPressed.current['d']) {
        player = {
          ...player,
          x: Math.min(canvasWidth - player.width, player.x + player.speed * delta)
        };
      }
      
      // Move projectiles
      projectiles = projectiles.filter(projectile => {
        if (projectile.source === 'player') {
          return projectile.y > 0;
        } else {
          return projectile.y < canvasHeight;
        }
      }).map(projectile => ({
        ...projectile,
        y: projectile.source === 'player' 
          ? projectile.y - projectile.speed * delta
          : projectile.y + projectile.speed * delta
      }));
      
      // Check for player hit by enemy projectiles
      if (isPlayerHit(player, projectiles)) {
        // Remove projectiles that hit the player
        projectiles = projectiles.filter(
          projectile => !(projectile.source === 'enemy' && checkCollision(player, projectile))
        );
        
        player = {
          ...player,
          lives: player.lives - 1
        };
        
        if (player.lives <= 0) {
          return {
            ...prevState,
            player,
            projectiles,
            status: 'gameOver'
          };
        }
      }
      
      // Process shield hits
      shields = shields.map(shield => {
        let updatedShield = shield;
        
        projectiles = projectiles.filter(projectile => {
          if (checkCollision(shield, projectile)) {
            updatedShield = processShieldHit(updatedShield, projectile) as Shield;
            return false; // Remove projectile
          }
          return true;
        });
        
        return updatedShield;
      }).filter(Boolean) as Shield[]; // Remove destroyed shields
      
      // Process enemy movements and actions
      let directionX = 1;
      let needsVerticalMove = false;
      
      // Determine group movement direction and if vertical move is needed
      for (const enemy of enemies) {
        if (enemy.x + enemy.width >= canvasWidth - 10) {
          directionX = -1;
          needsVerticalMove = true;
          break;
        }
        if (enemy.x <= 10) {
          directionX = 1;
          needsVerticalMove = true;
          break;
        }
      }
      
      enemies = enemies.map(enemy => {
        const updatedX = enemy.x + directionX * enemy.speed * delta;
        const updatedY = needsVerticalMove ? enemy.y + 10 : enemy.y;
        
        // Enemy shooting logic
        let lastShot = enemy.lastShot;
        if (enemy.type === 'shooter') {
          const now = Date.now();
          if (lastShot !== undefined && 
              enemy.cooldown !== undefined && 
              now - lastShot > enemy.cooldown &&
              Math.random() < 0.01) {
            
            // Create new enemy projectile
            projectiles.push(createEnemyProjectile(enemy.x, enemy.y, enemy.width));
            lastShot = now;
          }
        }
        
        return {
          ...enemy,
          x: updatedX,
          y: updatedY,
          lastShot
        };
      });
      
      // Check for projectile hits on enemies
      const hitResults: { enemyId: string, points: number }[] = [];
      
      projectiles = projectiles.filter(projectile => {
        const result = checkEnemyHits(projectile, enemies);
        if (result.hit && result.enemyId && result.points) {
          hitResults.push({
            enemyId: result.enemyId,
            points: result.points
          });
          return false; // Remove projectile
        }
        return true;
      });
      
      // Update enemies and score based on hits
      if (hitResults.length > 0) {
        const hitEnemyIds = hitResults.map(result => result.enemyId);
        
        enemies = enemies
          .map(enemy => {
            if (hitEnemyIds.includes(enemy.id)) {
              return {
                ...enemy,
                health: enemy.health - 1
              };
            }
            return enemy;
          })
          .filter(enemy => enemy.health > 0);
        
        // Update score
        score += hitResults.reduce((total, hit) => total + hit.points, 0);
      }
      
      // Handle UFO
      const now = Date.now();
      if (!ufo && now - lastUfoSpawn > 15000 + Math.random() * 15000) {
        ufo = createUfo(canvasWidth);
        lastUfoSpawn = now;
      }
      
      if (ufo) {
        // Move UFO
        ufo = {
          ...ufo,
          x: ufo.x + ufo.speed * delta
        };
        
        // Check if UFO is off screen
        if (ufo.x > canvasWidth + 50) {
          ufo = null;
        }
        
        // Check for UFO hit
        projectiles = projectiles.filter(projectile => {
          if (ufo && projectile.source === 'player' && checkCollision(projectile, ufo)) {
            score += ufo.points;
            ufo = null;
            return false;
          }
          return true;
        });
      }
      
      // Check if all enemies defeated (next level)
      if (enemies.length === 0) {
        return {
          ...prevState,
          player,
          projectiles,
          shields,
          ufo,
          lastUfoSpawn,
          score,
          level: prevState.level + 1,
          enemies: createEnemyFormation(prevState.level + 1, canvasWidth)
        };
      }
      
      // Check if enemies reached the bottom (game over)
      const enemyReachedBottom = enemies.some(enemy => enemy.y + enemy.height > player.y - 20);
      if (enemyReachedBottom) {
        return {
          ...prevState,
          status: 'gameOver',
          player,
          projectiles,
          shields,
          ufo,
          lastUfoSpawn,
          score,
          highScore: Math.max(score, prevState.highScore)
        };
      }
      
      return {
        ...prevState,
        player,
        enemies,
        projectiles,
        shields,
        ufo,
        lastUfoSpawn,
        score
      };
    });
    
    requestRef.current = requestAnimationFrame(gameLoop);
  }, [canvasWidth, canvasHeight, gameState.status]);

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
  }, [handleKeyPress, handleKeyRelease, handleTouchStart, handleTouchMove, handleTouchEnd]);

  // Start animation loop
  useEffect(() => {
    requestRef.current = requestAnimationFrame(gameLoop);
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [gameLoop]);

  // Game status change effects
  useEffect(() => {
    if (gameState.status === 'gameOver') {
      gameOver();
    }
  }, [gameState.status, gameOver]);

  return {
    gameState,
    initGame,
    togglePause,
    playerShoot,
    gameAreaRef
  };
}
