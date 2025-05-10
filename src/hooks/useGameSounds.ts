
import { useRef, useEffect, useCallback, useState } from 'react';
import { GameState } from '@/types/game';

interface SoundEffects {
  shoot: HTMLAudioElement | null;
  explosion: HTMLAudioElement | null;
  hit: HTMLAudioElement | null;
  ufo: HTMLAudioElement | null;
  gameOver: HTMLAudioElement | null;
  levelUp: HTMLAudioElement | null;
  background: HTMLAudioElement | null;
}

export function useGameSounds(gameState: GameState, previousGameState: GameState | null) {
  const sounds = useRef<SoundEffects>({
    shoot: null,
    explosion: null,
    hit: null,
    ufo: null,
    gameOver: null,
    levelUp: null,
    background: null
  });
  const [isMutedState, setIsMutedState] = useState<boolean>(
    JSON.parse(localStorage.getItem('cosmic-invaders-muted') || 'false')
  );
  
  // Initialize sound effects
  useEffect(() => {
    // Check if audio is supported in this browser
    const audioTest = document.createElement('audio');
    if (!audioTest || !audioTest.canPlayType) {
      console.warn('Audio not supported in this browser');
      return;
    }

    // Function to safely create audio element
    const createAudio = (path: string): HTMLAudioElement | null => {
      try {
        const audio = new Audio(path);
        return audio;
      } catch (error) {
        console.warn(`Failed to create audio for ${path}:`, error);
        return null;
      }
    };
    
    // Create audio elements
    sounds.current = {
      shoot: createAudio('/sounds/shoot.mp3'),
      explosion: createAudio('/sounds/explosion.mp3'),
      hit: createAudio('/sounds/hit.mp3'),
      ufo: createAudio('/sounds/ufo.mp3'),
      gameOver: createAudio('/sounds/game-over.mp3'),
      levelUp: createAudio('/sounds/level-up.mp3'),
      background: createAudio('/sounds/background.mp3')
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
    
    // Set initial mute state
    const isMuted = JSON.parse(localStorage.getItem('cosmic-invaders-muted') || 'false');
    Object.values(sounds.current).forEach(sound => {
      if (sound) {
        sound.muted = isMuted;
      }
    });
    
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
    const newMuteState = !isMutedState;
    setIsMutedState(newMuteState);
    localStorage.setItem('cosmic-invaders-muted', JSON.stringify(newMuteState));
    
    Object.values(sounds.current).forEach(sound => {
      if (sound) {
        sound.muted = newMuteState;
      }
    });
    
    return newMuteState;
  }, [isMutedState]);
  
  // Play sound effect function
  const playSound = useCallback((soundName: keyof SoundEffects) => {
    const sound = sounds.current[soundName];
    if (!sound || isMutedState) return;
    
    try {
      if (soundName !== 'background' && soundName !== 'ufo') {
        sound.currentTime = 0;
      }
      const playPromise = sound.play();
      
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          console.warn(`Sound failed to play: ${soundName}`, err);
        });
      }
    } catch (error) {
      console.warn(`Error playing sound ${soundName}:`, error);
    }
  }, [isMutedState]);
  
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
        if (sounds.current.background.currentTime) sounds.current.background.currentTime = 0;
      }
      if (sounds.current.ufo) {
        sounds.current.ufo.pause();
        if (sounds.current.ufo.currentTime) sounds.current.ufo.currentTime = 0;
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
        if (sounds.current.ufo.currentTime) sounds.current.ufo.currentTime = 0;
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
        try {
          sounds.current.background.play().catch(() => {});
        } catch (e) {
          console.warn("Could not resume background music", e);
        }
      }
      if (gameState.ufo && sounds.current.ufo) {
        try {
          sounds.current.ufo.play().catch(() => {});
        } catch (e) {
          console.warn("Could not resume UFO sound", e);
        }
      }
    }
  }, [gameState, previousGameState, playSound]);
  
  return { playSound, toggleMute, isMuted: isMutedState };
}
