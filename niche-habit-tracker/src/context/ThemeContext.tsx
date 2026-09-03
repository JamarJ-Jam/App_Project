import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ThemePalette {
  background: string;
  cardBackground: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  primaryAccent: string;
  fitnessAccent: string;
  efficiencyAccent: string;
  cardShadow: string;
  isDark: boolean;
}

export const lightTheme: ThemePalette = {
  background: '#F4F7FB',
  cardBackground: '#FFFFFF',
  border: '#E1E8F0',
  textPrimary: '#1E293B',
  textSecondary: '#64748B',
  primaryAccent: '#2563EB',
  fitnessAccent: '#059669',
  efficiencyAccent: '#0284C7',
  cardShadow: 'rgba(148, 163, 184, 0.12)',
  isDark: false,
};

export const darkTheme: ThemePalette = {
  background: '#121212',
  cardBackground: '#1E1E1E',
  border: '#2A2A2A',
  textPrimary: '#FFFFFF',
  textSecondary: '#AAAAAA',
  primaryAccent: '#3B82F6',
  fitnessAccent: '#10B981',
  efficiencyAccent: '#38BDF8',
  cardShadow: 'rgba(0, 0, 0, 0.5)',
  isDark: true,
};

interface ThemeContextType {
  theme: ThemePalette;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: lightTheme,
  toggleTheme: () => {},
});

const THEME_STORAGE_KEY = '@accountability_theme_mode';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Load saved user theme preference on launch
    AsyncStorage.getItem(THEME_STORAGE_KEY).then((savedTheme) => {
      if (savedTheme !== null) {
        setIsDark(savedTheme === 'dark');
      }
    });
  }, []);

  const toggleTheme = () => {
    setIsDark((prev) => {
      const nextMode = !prev;
      AsyncStorage.setItem(THEME_STORAGE_KEY, nextMode ? 'dark' : 'light');
      return nextMode;
    });
  };

  const theme = isDark ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);