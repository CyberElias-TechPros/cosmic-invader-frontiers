
import { useRef, useEffect, useCallback } from 'react';
import { GameState } from '@/types/game';

interface SoundEffects {
  shoot: HTMLAudioElement;
  explosion: HTMLAudioElement;
  hit: HTMLAudioElement;
  ufo: HTMLAudioElement;
  gameOver: HTMLAudioElement;
  levelUp: HTMLAudioElement;
  background: HTMLAudioElement;
}

export function useGameSounds(gameState: GameState, previousGameState: GameState | null) {
  const sounds = useRef<Partial<SoundEffects>>({});
  const isMuted = useRef<boolean>(JSON.parse(localStorage.getItem('cosmic-invaders-muted') || 'false'));
  
  // Initialize sound effects
  useEffect(() => {
    // Create audio elements
    sounds.current = {
      shoot: new Audio('/sounds/shoot.mp3'),
      explosion: new Audio('/sounds/explosion.mp3'),
      hit: new Audio('/sounds/hit.mp3'),
      ufo: new Audio('/sounds/ufo.mp3'),
      gameOver: new Audio('/sounds/game-over.mp3'),
      levelUp: new Audio('/sounds/level-up.mp3'),
      background: new Audio('/sounds/background.mp3')
    };
    
    // Configure looping for background music
    if (sounds.current.background) {
      sounds.current.background.loop = true;
      sounds.current.background.volume = 0.3;
    }
    
    if (sounds.current.ufo) {
      sounds.current.ufo.loop = true;
      sounds.current.ufo.volume = 0.4;
    }
    
    // Set volumes for effects
    if (sounds.current.explosion) sounds.current.explosion.volume = 0.4;
    if (sounds.current.hit) sounds.current.hit.volume = 0.3;
    if (sounds.current.shoot) sounds.current.shoot.volume = 0.2;
    if (sounds.current.gameOver) sounds.current.gameOver.volume = 0.5;
    if (sounds.current.levelUp) sounds.current.levelUp.volume = 0.5;
    
    // Clean up audio elements on unmount
    return () => {
      Object.values(sounds.current).forEach(sound => {
        if (sound) {
          sound.pause();
          sound.currentTime = 0;
        }
      });
    };
  }, []);
  
  // Toggle mute function
  const toggleMute = useCallback(() => {
    isMuted.current = !isMuted.current;
    localStorage.setItem('cosmic-invaders-muted', JSON.stringify(isMuted.current));
    
    Object.values(sounds.current).forEach(sound => {
      if (sound) {
        sound.muted = isMuted.current;
      }
    });
    
    return isMuted.current;
  }, []);
  
  // Set initial mute state for all sounds
  useEffect(() => {
    Object.values(sounds.current).forEach(sound => {
      if (sound) {
        sound.muted = isMuted.current;
      }
    });
  }, []);
  
  // Play sound effect function
  const playSound = useCallback((soundName: keyof SoundEffects) => {
    const sound = sounds.current[soundName];
    if (sound && !isMuted.current) {
      // For non-looping sounds, reset and play
      if (soundName !== 'background' && soundName !== 'ufo') {
        sound.currentTime = 0;
      }
      sound.play().catch(err => console.log('Error playing sound:', err));
    }
  }, []);
  
  // Handle game state changes to trigger sounds
  useEffect(() => {
    if (!previousGameState) return;
    
    // Game start
    if (previousGameState.status !== 'playing' && gameState.status === 'playing') {
      playSound('levelUp');
      playSound('background');
    }
    
    // Game over
    if (previousGameState.status === 'playing' && gameState.status === 'gameOver') {
      playSound('gameOver');
      if (sounds.current.background) {
        sounds.current.background.pause();
        sounds.current.background.currentTime = 0;
      }
      if (sounds.current.ufo) {
        sounds.current.ufo.pause();
        sounds.current.ufo.currentTime = 0;
      }
    }
    
    // Level up
    if (gameState.level > previousGameState.level) {
      playSound('levelUp');
    }
    
    // UFO appears
    if (!previousGameState.ufo && gameState.ufo) {
      playSound('ufo');
    }
    
    // UFO disappears
    if (previousGameState.ufo && !gameState.ufo) {
      if (sounds.current.ufo) {
        sounds.current.ufo.pause();
        sounds.current.ufo.currentTime = 0;
      }
      playSound('explosion');
    }
    
    // New projectiles from player (shooting)
    if (gameState.projectiles.length > previousGameState.projectiles.length) {
      const newProjectiles = gameState.projectiles.filter(
        p => !previousGameState.projectiles.some(pp => pp.id === p.id)
      );
      
      if (newProjectiles.some(p => p.source === 'player')) {
        playSound('shoot');
      }
    }
    
    // Enemy destroyed
    if (previousGameState.enemies.length > gameState.enemies.length) {
      playSound('explosion');
    }
    
    // Player hit
    if (gameState.player.lives < previousGameState.player.lives) {
      playSound('hit');
    }
    
    // Game paused
    if (previousGameState.status === 'playing' && gameState.status === 'paused') {
      if (sounds.current.background) {
        sounds.current.background.pause();
      }
      if (sounds.current.ufo) {
        sounds.current.ufo.pause();
      }
    }
    
    // Game resumed
    if (previousGameState.status === 'paused' && gameState.status === 'playing') {
      if (sounds.current.background) {
        sounds.current.background.play().catch(err => console.log('Error playing background:', err));
      }
      if (gameState.ufo && sounds.current.ufo) {
        sounds.current.ufo.play().catch(err => console.log('Error playing ufo:', err));
      }
    }
  }, [gameState, previousGameState, playSound]);
  
  return { playSound, toggleMute, isMuted: isMuted.current };
}
