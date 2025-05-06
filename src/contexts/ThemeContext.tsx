
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

type ThemeType = 'light' | 'dark';

interface ThemeContextType {
  theme: ThemeType;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Initialize theme from localStorage or default to 'dark' for the space theme
  const [theme, setTheme] = useState<ThemeType>(() => {
    const savedTheme = localStorage.getItem('cosmic-invaders-theme') as ThemeType;
    return savedTheme || 'dark';
  });

  // Apply theme class to document when theme changes
  useEffect(() => {
    const root = window.document.documentElement;
    
    // Remove both classes and add the current one
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    
    // Save to localStorage
    localStorage.setItem('cosmic-invaders-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  
  return (
    <button 
      onClick={toggleTheme} 
      className="p-2 rounded-full bg-space-secondary/20 hover:bg-space-secondary/40 transition-colors"
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {theme === 'dark' ? (
        <Sun className="h-5 w-5 text-space-white" aria-hidden="true" />
      ) : (
        <Moon className="h-5 w-5 text-space-primary" aria-hidden="true" />
      )}
    </button>
  );
};
