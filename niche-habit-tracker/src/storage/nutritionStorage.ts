import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadUserProfile,
  updateUserProfile,
} from './userProfileStorage';
import { getUserScopedStorageKey } from './userScopedStorage';

export const STORAGE_KEY_NUTRITION_GOALS = '@nutrition_macro_goals';
export const STORAGE_KEY_MEAL_LOGS = '@nutrition_meal_logs';

export interface MacroGoals {
  dailyCalories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatsGrams: number;
}

export interface MealItem {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  category: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';
  loggedAt: string;
}

export const DEFAULT_MACRO_GOALS: MacroGoals = {
  dailyCalories: 0,
  proteinGrams: 0,
  carbsGrams: 0,
  fatsGrams: 0,
};

const getGoalsFromProfile = async (): Promise<MacroGoals> => {
  const profile = await loadUserProfile();

  return {
    dailyCalories: profile.dailyCalories,
    proteinGrams: profile.proteinGrams,
    carbsGrams: profile.carbsGrams,
    fatsGrams: profile.fatsGrams,
  };
};

export const loadMacroGoals = async (): Promise<MacroGoals> => {
  try {
    const goalsKey = await getUserScopedStorageKey(
      STORAGE_KEY_NUTRITION_GOALS
    );

    const [saved, profileGoals] = await Promise.all([
      AsyncStorage.getItem(goalsKey),
      getGoalsFromProfile(),
    ]);

    if (!saved) {
      return profileGoals;
    }

    const parsed: Partial<MacroGoals> = JSON.parse(saved);

    // The profile is now the primary source of truth.
    // Saved macro goals remain as a migration fallback for older users.
    return {
      dailyCalories:
        profileGoals.dailyCalories > 0
          ? profileGoals.dailyCalories
          : Number(parsed.dailyCalories) || 0,

      proteinGrams:
        profileGoals.proteinGrams > 0
          ? profileGoals.proteinGrams
          : Number(parsed.proteinGrams) || 0,

      carbsGrams:
        profileGoals.carbsGrams > 0
          ? profileGoals.carbsGrams
          : Number(parsed.carbsGrams) || 0,

      fatsGrams:
        profileGoals.fatsGrams > 0
          ? profileGoals.fatsGrams
          : Number(parsed.fatsGrams) || 0,
    };
  } catch (e) {
    console.log('Error loading macro goals:', e);

    try {
      return await getGoalsFromProfile();
    } catch {
      return DEFAULT_MACRO_GOALS;
    }
  }
};

export const saveMacroGoals = async (
  goals: MacroGoals
): Promise<void> => {
  try {
    const normalizedGoals: MacroGoals = {
      dailyCalories: Math.max(0, Number(goals.dailyCalories) || 0),
      proteinGrams: Math.max(0, Number(goals.proteinGrams) || 0),
      carbsGrams: Math.max(0, Number(goals.carbsGrams) || 0),
      fatsGrams: Math.max(0, Number(goals.fatsGrams) || 0),
    };

    const goalsKey = await getUserScopedStorageKey(
      STORAGE_KEY_NUTRITION_GOALS
    );

    await Promise.all([
      AsyncStorage.setItem(
        goalsKey,
        JSON.stringify(normalizedGoals)
      ),

      updateUserProfile({
        dailyCalories: normalizedGoals.dailyCalories,
        proteinGrams: normalizedGoals.proteinGrams,
        carbsGrams: normalizedGoals.carbsGrams,
        fatsGrams: normalizedGoals.fatsGrams,
      }),
    ]);
  } catch (e) {
    console.log('Error saving macro goals:', e);
  }
};

const toLocalDateKey = (value: string | Date): string => {
  const date = value instanceof Date ? value : new Date(value);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const loadAllMealLogsInternal = async (): Promise<MealItem[]> => {
  const mealLogsKey = await getUserScopedStorageKey(
    STORAGE_KEY_MEAL_LOGS
  );

  const saved = await AsyncStorage.getItem(mealLogsKey);

  return saved ? JSON.parse(saved) : [];
};

export const loadAllMealLogs = async (): Promise<MealItem[]> => {
  try {
    return await loadAllMealLogsInternal();
  } catch (e) {
    console.log('Error loading meal logs:', e);
    return [];
  }
};

export const loadMealLogsForRange = async (
  startDate: string,
  endDate: string
): Promise<MealItem[]> => {
  try {
    const logs = await loadAllMealLogsInternal();

    return logs.filter((item) => {
      const key = toLocalDateKey(item.loggedAt);
      return key >= startDate && key <= endDate;
    });
  } catch (e) {
    console.log('Error loading ranged meal logs:', e);
    return [];
  }
};

export const loadTodayMealLogs = async (): Promise<MealItem[]> => {
  try {
    const mealLogsKey = await getUserScopedStorageKey(
      STORAGE_KEY_MEAL_LOGS
    );

    const saved = await AsyncStorage.getItem(mealLogsKey);

    if (!saved) return [];

    const logs: MealItem[] = JSON.parse(saved);
    const todayKey = toLocalDateKey(new Date());

    return logs.filter(
      (item) => toLocalDateKey(item.loggedAt) === todayKey
    );
  } catch (e) {
    console.log('Error loading today meal logs:', e);
    return [];
  }
};

export const addMealLog = async (
  meal: Omit<MealItem, 'id' | 'loggedAt'>
): Promise<MealItem[]> => {
  try {
    const mealLogsKey = await getUserScopedStorageKey(
      STORAGE_KEY_MEAL_LOGS
    );

    const saved = await AsyncStorage.getItem(mealLogsKey);

    const logs: MealItem[] = saved
      ? JSON.parse(saved)
      : [];

    const newLog: MealItem = {
      ...meal,
      id: Date.now().toString(),
      loggedAt: new Date().toISOString(),
    };

    const updated = [newLog, ...logs];

    await AsyncStorage.setItem(
      mealLogsKey,
      JSON.stringify(updated)
    );

    const todayKey = toLocalDateKey(new Date());

    return updated.filter(
      (item) => toLocalDateKey(item.loggedAt) === todayKey
    );
  } catch (e) {
    console.log('Error adding meal log:', e);
    return [];
  }
};

export const deleteMealLog = async (
  mealId: string
): Promise<MealItem[]> => {
  try {
    const mealLogsKey = await getUserScopedStorageKey(
      STORAGE_KEY_MEAL_LOGS
    );

    const saved = await AsyncStorage.getItem(mealLogsKey);

    if (!saved) return [];

    const logs: MealItem[] = JSON.parse(saved);

    const updated = logs.filter(
      (item) => item.id !== mealId
    );

    await AsyncStorage.setItem(
      mealLogsKey,
      JSON.stringify(updated)
    );

    const todayKey = toLocalDateKey(new Date());

    return updated.filter(
      (item) => toLocalDateKey(item.loggedAt) === todayKey
    );
  } catch (e) {
    console.log('Error deleting meal log:', e);
    return [];
  }
};
