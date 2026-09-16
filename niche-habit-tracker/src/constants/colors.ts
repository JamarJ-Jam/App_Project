export interface Theme {
  isDark: boolean;

  background: string;
  cardBackground: string;
  elevatedBackground: string;
  surfaceMuted: string;
  inputBackground: string;

  textPrimary: string;
  textSecondary: string;

  border: string;

  primaryAccent: string;
  fitnessAccent: string;
  nutritionAccent: string;
  efficiencyAccent: string;

  success: string;
  warning: string;
  danger: string;

  // Backward-compatible aliases for older screens.
  // New code should use the semantic tokens above.
  text: string;
  card: string;
  primary: string;
}

type ThemeBase = Omit<Theme, 'text' | 'card' | 'primary'>;

const createTheme = (theme: ThemeBase): Theme => ({
  ...theme,
  text: theme.textPrimary,
  card: theme.cardBackground,
  primary: theme.primaryAccent,
});

export const LightTheme: Theme = createTheme({
  isDark: false,

  background: '#F6F8FC',
  cardBackground: '#FFFFFF',
  elevatedBackground: '#FFFFFF',
  surfaceMuted: '#EEF2F7',
  inputBackground: '#F8FAFC',

  textPrimary: '#111827',
  textSecondary: '#64748B',

  border: '#E2E8F0',

  primaryAccent: '#6366F1',
  fitnessAccent: '#0EA5E9',
  nutritionAccent: '#10B981',
  efficiencyAccent: '#8B5CF6',

  success: '#16A34A',
  warning: '#D97706',
  danger: '#DC2626',
});

export const DuskTheme: Theme = createTheme({
  isDark: true,

  background: '#17151F',
  cardBackground: '#211E2B',
  elevatedBackground: '#292536',
  surfaceMuted: '#2C2838',
  inputBackground: '#1D1A26',

  textPrimary: '#F7F4FF',
  textSecondary: '#B9B2C8',

  border: '#3A3448',

  primaryAccent: '#A78BFA',
  fitnessAccent: '#5CC8FF',
  nutritionAccent: '#4ADE80',
  efficiencyAccent: '#C4A7FF',

  success: '#4ADE80',
  warning: '#FBBF24',
  danger: '#FB7185',
});

export const DarkTheme: Theme = createTheme({
  isDark: true,

  background: '#090E1A',
  cardBackground: '#111827',
  elevatedBackground: '#172033',
  surfaceMuted: '#182234',
  inputBackground: '#0D1422',

  textPrimary: '#F8FAFC',
  textSecondary: '#A7B2C3',

  border: '#283548',

  primaryAccent: '#818CF8',
  fitnessAccent: '#38BDF8',
  nutritionAccent: '#34D399',
  efficiencyAccent: '#A78BFA',

  success: '#4ADE80',
  warning: '#FBBF24',
  danger: '#FB7185',
});

// Backward compatibility for screens importing lowercase names.
export const lightTheme = LightTheme;
export const darkTheme = DarkTheme;
