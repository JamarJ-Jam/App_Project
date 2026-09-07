export interface Theme {
  isDark: boolean;
  background: string;
  cardBackground: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  primaryAccent: string;
  fitnessAccent: string;
}

export const LightTheme: Theme = {
  isDark: false,
  background: '#F8FAFC',
  cardBackground: '#FFFFFF',
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  border: '#E2E8F0',
  primaryAccent: '#3B82F6',
  fitnessAccent: '#0EA5E9',
};

export const DarkTheme: Theme = {
  isDark: true,
  background: '#0F172A',
  cardBackground: '#1E293B',
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  border: '#334155',
  primaryAccent: '#3B82F6',
  fitnessAccent: '#38BDF8',
};

// Aliasing for backward compatibility if any screen uses lightTheme/darkTheme lowercase
export const lightTheme = LightTheme;
export const darkTheme = DarkTheme;