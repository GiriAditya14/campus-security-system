import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => {
    // Check localStorage first
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      return savedTheme;
    }
    
    // Check system preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    
    return 'light';
  });

  const [reducedMotion, setReducedMotion] = useState(() => {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  const [highContrast, setHighContrast] = useState(() => {
    return localStorage.getItem('highContrast') === 'true';
  });

  const [fontSize, setFontSize] = useState(() => {
    return localStorage.getItem('fontSize') || 'normal';
  });

  useEffect(() => {
    // Apply theme to document
    const root = document.documentElement;
    
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    
    // Apply high contrast
    if (highContrast) {
      root.classList.add('high-contrast');
    } else {
      root.classList.remove('high-contrast');
    }
    
    // Apply font size
    root.classList.remove('text-sm', 'text-base', 'text-lg', 'text-xl');
    switch (fontSize) {
      case 'small':
        root.classList.add('text-sm');
        break;
      case 'large':
        root.classList.add('text-lg');
        break;
      case 'extra-large':
        root.classList.add('text-xl');
        break;
      default:
        root.classList.add('text-base');
    }
    
    // Apply reduced motion
    if (reducedMotion) {
      root.classList.add('reduce-motion');
    } else {
      root.classList.remove('reduce-motion');
    }
    
    // Save to localStorage
    localStorage.setItem('theme', theme);
    localStorage.setItem('highContrast', highContrast.toString());
    localStorage.setItem('fontSize', fontSize);
  }, [theme, highContrast, fontSize, reducedMotion]);

  useEffect(() => {
    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => {
      if (!localStorage.getItem('theme')) {
        setTheme(e.matches ? 'dark' : 'light');
      }
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    // Listen for reduced motion preference changes
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (e) => {
      setReducedMotion(e.matches);
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const toggleHighContrast = () => {
    setHighContrast(prev => !prev);
  };

  const changeFontSize = (size) => {
    setFontSize(size);
  };

  const value = {
    theme,
    setTheme,
    toggleTheme,
    isDark: theme === 'dark',
    reducedMotion,
    setReducedMotion,
    highContrast,
    toggleHighContrast,
    fontSize,
    changeFontSize
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};