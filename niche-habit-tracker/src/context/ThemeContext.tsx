import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LightTheme, DarkTheme, Theme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/constants/colors';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const THEME_STORAGE_KEY = '@accountability_theme_preference';

const ThemeContext = createContext<ThemeContextType>({
  theme: LightTheme,
  toggleTheme: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDark, setIsDark] = useState<boolean>(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then((savedTheme) => {
      if (savedTheme !== null) {
        setIsDark(savedTheme === 'dark');
      }
    });
  }, []);

  const toggleTheme = async () => {
    const nextTheme = !isDark;
    setIsDark(nextTheme);
    await AsyncStorage.setItem(THEME_STORAGE_KEY, nextTheme ? 'dark' : 'light');
  };

  const currentTheme = isDark ? DarkTheme : LightTheme;

  return (
    <ThemeContext.Provider value={{ theme: currentTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context || !context.theme) {
    return { theme: LightTheme, toggleTheme: () => {} };
  }
  return context;
};