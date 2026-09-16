import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  LightTheme,
  DuskTheme,
  DarkTheme,
  Theme,
} from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/constants/colors';

export type ThemePreference = 'light' | 'dark' | 'auto';
export type AutomaticThemePhase = 'light' | 'dusk' | 'dark';

interface ThemeContextType {
  theme: Theme;
  isDark: boolean;
  preference: ThemePreference;
  automaticPhase: AutomaticThemePhase;
  setThemePreference: (preference: ThemePreference) => Promise<void>;
  toggleTheme: () => void;
}

const THEME_STORAGE_KEY = '@accountability_theme_preference';

const getAutomaticThemePhase = (date = new Date()): AutomaticThemePhase => {
  const hour = date.getHours();

  // 6:00 AM–5:59 PM: light
  if (hour >= 6 && hour < 18) {
    return 'light';
  }

  // 6:00 PM–9:59 PM: warmer dusk palette
  if (hour >= 18 && hour < 22) {
    return 'dusk';
  }

  // 10:00 PM–5:59 AM: deeper dark palette
  return 'dark';
};

const getThemeForPhase = (phase: AutomaticThemePhase): Theme => {
  if (phase === 'dusk') return DuskTheme;
  if (phase === 'dark') return DarkTheme;
  return LightTheme;
};

const ThemeContext = createContext<ThemeContextType>({
  theme: LightTheme,
  isDark: false,
  preference: 'light',
  automaticPhase: 'light',
  setThemePreference: async () => {},
  toggleTheme: () => {},
});

export const ThemeProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [preference, setPreference] =
    useState<ThemePreference>('light');

  const [automaticPhase, setAutomaticPhase] =
    useState<AutomaticThemePhase>(() =>
      getAutomaticThemePhase()
    );

  useEffect(() => {
    const loadThemePreference = async () => {
      const savedTheme = await AsyncStorage.getItem(
        THEME_STORAGE_KEY
      );

      if (
        savedTheme === 'light' ||
        savedTheme === 'dark' ||
        savedTheme === 'auto'
      ) {
        setPreference(savedTheme);
      }
    };

    loadThemePreference();
  }, []);

  useEffect(() => {
    if (preference !== 'auto') return;

    const refreshAutomaticTheme = () => {
      setAutomaticPhase(getAutomaticThemePhase());
    };

    refreshAutomaticTheme();

    const interval = setInterval(
      refreshAutomaticTheme,
      60 * 1000
    );

    const appStateSubscription = AppState.addEventListener(
      'change',
      (state) => {
        if (state === 'active') {
          refreshAutomaticTheme();
        }
      }
    );

    return () => {
      clearInterval(interval);
      appStateSubscription.remove();
    };
  }, [preference]);

  const setThemePreference = async (
    nextPreference: ThemePreference
  ) => {
    setPreference(nextPreference);

    if (nextPreference === 'auto') {
      setAutomaticPhase(getAutomaticThemePhase());
    }

    await AsyncStorage.setItem(
      THEME_STORAGE_KEY,
      nextPreference
    );
  };

  const currentTheme = useMemo(() => {
    if (preference === 'auto') {
      return getThemeForPhase(automaticPhase);
    }

    return preference === 'dark'
      ? DarkTheme
      : LightTheme;
  }, [preference, automaticPhase]);

  // Kept for compatibility with the existing Account-screen switch.
  // Once Account gets the Light / Dark / Auto selector, it can use
  // setThemePreference directly.
  const toggleTheme = () => {
    void setThemePreference(
      currentTheme.isDark ? 'light' : 'dark'
    );
  };

  return (
    <ThemeContext.Provider
      value={{
        theme: currentTheme,
        isDark: currentTheme.isDark,
        preference,
        automaticPhase,
        setThemePreference,
        toggleTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  return useContext(ThemeContext);
};
