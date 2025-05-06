import { 
  Entity, 
  Enemy, 
  Projectile, 
  Shield, 
  EntityPosition, 
  EnemyType,
  Star,
  ProjectileSource
} from '../types/game';
import { v4 as uuidv4 } from 'uuid';

/**
 * Checks collision between two entities
 * @param entity1 First entity
 * @param entity2 Second entity
 * @returns Boolean indicating if collision occurred
 */
export function checkCollision(entity1: Entity, entity2: Entity): boolean {
  return (
    entity1.x < entity2.x + entity2.width &&
    entity1.x + entity1.width > entity2.x &&
    entity1.y < entity2.y + entity2.height &&
    entity1.y + entity1.height > entity2.y
  );
}

// Create an enemy formation based on level
export function createEnemyFormation(level: number, gameWidth: number): Enemy[] {
  const enemies: Enemy[] = [];
  const rows = Math.min(5, 3 + Math.floor(level / 2));
  const enemiesPerRow = Math.min(10, 6 + Math.floor(level / 3));
  
  const enemyWidth = 30;
  const enemyHeight = 30;
  const startX = (gameWidth - (enemiesPerRow * (enemyWidth + 15))) / 2;
  
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < enemiesPerRow; col++) {
      let type: 'basic' | 'shooter' | 'tank' = 'basic';
      let health = 1;
      let points = 10;
      
      // Different enemy types based on row
      if (row === 0) {
        type = 'tank';
        health = 2;
        points = 30;
      } else if (row === 1 || row === 2) {
        type = 'shooter';
        points = 20;
      }
      
      // Increase difficulty with level
      const speedMultiplier = 1 + (level * 0.1);
      
      enemies.push({
        id: uuidv4(),
        x: startX + col * (enemyWidth + 15),
        y: 60 + row * (enemyHeight + 15),
        width: enemyWidth,
        height: enemyHeight,
        type,
        points,
        speed: 20 * speedMultiplier,
        health,
        cooldown: type === 'shooter' ? 1500 : undefined,
        lastShot: type === 'shooter' ? Date.now() : undefined
      });
    }
  }
  
  return enemies;
}

// Create shield bunkers
export function createShields(gameWidth: number, gameHeight: number): Shield[] {
  const shields: Shield[] = [];
  const shieldCount = 4;
  const shieldWidth = 60;
  const shieldHeight = 40;
  const shieldY = gameHeight - 150;
  
  const spacing = (gameWidth - (shieldCount * shieldWidth)) / (shieldCount + 1);
  
  for (let i = 0; i < shieldCount; i++) {
    shields.push({
      id: uuidv4(),
      x: spacing + i * (shieldWidth + spacing),
      y: shieldY,
      width: shieldWidth,
      height: shieldHeight,
      health: 3
    });
  }
  
  return shields;
}

/**
 * Create a UFO enemy that moves across the screen
 * @param gameWidth Width of game area
 * @returns Enemy object representing the UFO
 */
export function createUfo(gameWidth: number): Enemy {
  return {
    id: uuidv4(),
    x: -50,
    y: 30,
    width: 50,
    height: 20,
    type: 'ufo',
    points: 100,
    speed: 60,
    health: 1
  };
}

// Create a new player projectile
export function createPlayerProjectile(playerX: number, playerY: number, playerWidth: number): Projectile {
  return {
    id: uuidv4(),
    x: playerX + (playerWidth / 2) - 1,
    y: playerY,
    width: 2,
    height: 15,
    speed: 400,
    source: 'player'
  };
}

// Create a new enemy projectile
export function createEnemyProjectile(enemyX: number, enemyY: number, enemyWidth: number): Projectile {
  return {
    id: uuidv4(),
    x: enemyX + (enemyWidth / 2) - 1,
    y: enemyY + 30,
    width: 2,
    height: 15,
    speed: 200,
    source: 'enemy'
  };
}

/**
 * Check if player is hit by an enemy projectile
 * @param player Player entity
 * @param projectiles Array of projectiles
 * @returns Boolean indicating if player is hit
 */
export function isPlayerHit(player: Entity, projectiles: Projectile[]): boolean {
  return projectiles.some(projectile => 
    projectile.source === 'enemy' && checkCollision(player, projectile)
  );
}

// Process shield hit by a projectile
export function processShieldHit(shield: Shield, projectile: Projectile): Shield | null {
  if (checkCollision(shield, projectile)) {
    const newHealth = shield.health - 1;
    if (newHealth <= 0) {
      return null;
    }
    return {
      ...shield,
      health: newHealth
    };
  }
  return shield;
}

// Check if a projectile hits any enemy
export function checkEnemyHits(projectile: Projectile, enemies: Enemy[]): { hit: boolean, enemyId?: string, points?: number } {
  if (projectile.source !== 'player') {
    return { hit: false };
  }
  
  for (const enemy of enemies) {
    if (checkCollision(projectile, enemy)) {
      return { hit: true, enemyId: enemy.id, points: enemy.points };
    }
  }
  
  return { hit: false };
}

/**
 * Creates a starfield effect for the background
 * @param count Number of stars to create
 * @param width Width of game area
 * @param height Height of game area
 * @returns Array of stars for rendering
 */
export function createStars(count: number, width: number, height: number): Star[] {
  const stars: Star[] = [];
  
  for (let i = 0; i < count; i++) {
    const size = Math.random() < 0.3 ? 'large' : Math.random() < 0.6 ? 'medium' : 'small';
    const x = Math.random() * width;
    const y = Math.random() * height;
    const duration = 15 + Math.random() * 20;
    const delay = Math.random() * duration;
    
    stars.push({ id: i, x, y, size, duration, delay });
  }
  
  return stars;
}
