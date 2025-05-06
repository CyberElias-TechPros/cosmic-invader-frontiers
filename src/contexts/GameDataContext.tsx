
import React, { createContext, useContext, useEffect, useState } from 'react';

interface GameData {
  highScore: number;
  lastPlayedDate: string | null;
  totalGamesPlayed: number;
}

interface GameDataContextType {
  gameData: GameData;
  updateHighScore: (score: number) => void;
  incrementGamesPlayed: () => void;
}

const defaultGameData: GameData = {
  highScore: 0,
  lastPlayedDate: null,
  totalGamesPlayed: 0
};

const GameDataContext = createContext<GameDataContextType | undefined>(undefined);

export function GameDataProvider({ children }: { children: React.ReactNode }) {
  const [gameData, setGameData] = useState<GameData>(() => {
    const savedData = localStorage.getItem('cosmic-invaders-data');
    return savedData ? JSON.parse(savedData) : defaultGameData;
  });

  // Save to localStorage whenever gameData changes
  useEffect(() => {
    localStorage.setItem('cosmic-invaders-data', JSON.stringify(gameData));
  }, [gameData]);

  const updateHighScore = (score: number) => {
    if (score > gameData.highScore) {
      setGameData(prev => ({
        ...prev,
        highScore: score,
        lastPlayedDate: new Date().toISOString()
      }));
      return true; // New high score achieved
    }
    return false; // No new high score
  };

  const incrementGamesPlayed = () => {
    setGameData(prev => ({
      ...prev,
      totalGamesPlayed: prev.totalGamesPlayed + 1,
      lastPlayedDate: new Date().toISOString()
    }));
  };

  return (
    <GameDataContext.Provider value={{ gameData, updateHighScore, incrementGamesPlayed }}>
      {children}
    </GameDataContext.Provider>
  );
}

export function useGameData() {
  const context = useContext(GameDataContext);
  if (context === undefined) {
    throw new Error('useGameData must be used within a GameDataProvider');
  }
  return context;
}
