
import { ThemeToggle } from '@/contexts/ThemeContext';
import { useGameData } from '@/contexts/GameDataContext';

const ThemeAwareHeader = () => {
  const { gameData } = useGameData();

  return (
    <header className="absolute top-0 right-0 z-10 flex items-center justify-between w-full p-4">
      <div className="flex items-center space-x-2">
        <h1 className="sr-only">Cosmic Invader Frontiers</h1>
        {gameData.totalGamesPlayed > 0 && (
          <div className="text-sm text-space-white/70 hidden sm:block">
            <span className="font-bold mr-1">Games Played:</span> 
            <span className="text-space-accent">{gameData.totalGamesPlayed}</span>
          </div>
        )}
      </div>
      <ThemeToggle />
    </header>
  );
};

export default ThemeAwareHeader;
