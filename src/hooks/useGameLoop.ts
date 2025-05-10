
import { useRef, useCallback, useEffect } from 'react';
import { GameState } from '@/types/game';
import { useIsMobile } from '@/hooks/use-mobile';
import { 
  checkCollision, 
  isPlayerHit, 
  processShieldHit, 
  checkEnemyHits,
  createEnemyProjectile,
  createUfo,
  saveGameState
} from '@/utils/gameUtils';

export function useGameLoop(
  gameState: GameState,
  updateGameState: (updater: (state: GameState) => GameState) => void,
  nextLevel: () => void,
  gameOver: () => void,
  canvasWidth: number, 
  canvasHeight: number,
  keysPressed: React.RefObject<Record<string, boolean>>
) {
  const requestRef = useRef<number>();
  const previousTimeRef = useRef<number>();
  const lastUpdateTimeRef = useRef<number>(0);
  const isMobile = useIsMobile();

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
    
    // Throttle saving to avoid performance issues
    const now = Date.now();
    if (now - lastUpdateTimeRef.current > 2000) {
      saveGameState(gameState);
      lastUpdateTimeRef.current = now;
    }
    
    updateGameState(prevState => {
      let { player, enemies, projectiles, shields, ufo, lastUfoSpawn, score } = prevState;
      
      // Apply mobile speed adjustment factor
      const mobileFactor = isMobile ? 0.6 : 1;
      
      // Handle keyboard movement
      if (keysPressed.current && (keysPressed.current['ArrowLeft'] || keysPressed.current['a'])) {
        player = {
          ...player,
          x: Math.max(0, player.x - player.speed * delta * mobileFactor)
        };
      }
      if (keysPressed.current && (keysPressed.current['ArrowRight'] || keysPressed.current['d'])) {
        player = {
          ...player,
          x: Math.min(canvasWidth - player.width, player.x + player.speed * delta * mobileFactor)
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
          ? projectile.y - projectile.speed * delta * mobileFactor
          : projectile.y + projectile.speed * delta * mobileFactor
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
            updatedShield = processShieldHit(updatedShield, projectile) as typeof shield;
            return false; // Remove projectile
          }
          return true;
        });
        
        return updatedShield;
      }).filter(Boolean) as typeof shields; // Remove destroyed shields
      
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
      
      // Mobile: Reduce vertical movement speed
      const verticalStepSize = isMobile ? 5 : 10;
      
      enemies = enemies.map(enemy => {
        const updatedX = enemy.x + directionX * enemy.speed * delta * mobileFactor;
        const updatedY = needsVerticalMove ? enemy.y + verticalStepSize : enemy.y;
        
        // Enemy shooting logic - reduce shooting frequency on mobile
        let lastShot = enemy.lastShot;
        if (enemy.type === 'shooter') {
          const now = Date.now();
          const shootProbability = isMobile ? 0.005 : 0.01;
          
          if (lastShot !== undefined && 
              enemy.cooldown !== undefined && 
              now - lastShot > enemy.cooldown &&
              Math.random() < shootProbability) {
            
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
      const currentTime = Date.now();
      // Adjust UFO spawn time for mobile
      const ufoBaseTime = isMobile ? 20000 : 15000;
      const ufoRandomTime = isMobile ? 20000 : 15000;
      
      if (!ufo && currentTime - lastUfoSpawn > ufoBaseTime + Math.random() * ufoRandomTime) {
        ufo = createUfo(canvasWidth);
        lastUfoSpawn = currentTime;
      }
      
      if (ufo) {
        // Move UFO with mobile adjustment
        ufo = {
          ...ufo,
          x: ufo.x + ufo.speed * delta * mobileFactor
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
          enemies: [] // Clear for next level initialization
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
  }, [gameState.status, canvasWidth, canvasHeight, updateGameState, keysPressed, isMobile]);

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
    } else if (gameState.enemies.length === 0 && gameState.status === 'playing') {
      nextLevel();
    }
  }, [gameState.status, gameState.enemies.length, gameOver, nextLevel]);

  // Save game state to localStorage when status changes
  useEffect(() => {
    if (gameState.status === 'paused' || gameState.status === 'gameOver') {
      saveGameState(gameState);
    }
  }, [gameState.status, gameState]);
}
