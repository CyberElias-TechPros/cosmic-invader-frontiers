
import React, { createContext, useContext, useEffect } from 'react';

interface AccessibilityContextType {
  announceToScreenReader: (message: string) => void;
}

const AccessibilityContext = createContext<AccessibilityContextType | undefined>(undefined);

export function AccessibilityProvider({ children }: { children: React.ReactNode }) {
  // Function to announce messages to screen readers
  const announceToScreenReader = (message: string) => {
    // Create or get the aria-live region
    let announcer = document.getElementById('screen-reader-announcer');
    if (!announcer) {
      announcer = document.createElement('div');
      announcer.id = 'screen-reader-announcer';
      announcer.setAttribute('aria-live', 'assertive');
      announcer.setAttribute('aria-atomic', 'true');
      announcer.className = 'sr-only'; // Screen reader only
      document.body.appendChild(announcer);
    }
    
    // Set the message to be announced
    announcer.textContent = message;
    
    // Clear the announcer after a delay to prevent duplicate announcements
    setTimeout(() => {
      if (announcer) announcer.textContent = '';
    }, 1000);
  };
  
  return (
    <AccessibilityContext.Provider value={{ announceToScreenReader }}>
      {children}
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility() {
  const context = useContext(AccessibilityContext);
  if (context === undefined) {
    throw new Error('useAccessibility must be used within an AccessibilityProvider');
  }
  return context;
}
