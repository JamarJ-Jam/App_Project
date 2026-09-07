import AsyncStorage from '@react-native-async-storage/async-storage';

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
  loggedAt: string; // ISO String
}

export const DEFAULT_MACRO_GOALS: MacroGoals = {
  dailyCalories: 2200,
  proteinGrams: 160,
  carbsGrams: 220,
  fatsGrams: 70,
};

export const loadMacroGoals = async (): Promise<MacroGoals> => {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY_NUTRITION_GOALS);
    return saved ? JSON.parse(saved) : DEFAULT_MACRO_GOALS;
  } catch (e) {
    console.log('Error loading macro goals:', e);
    return DEFAULT_MACRO_GOALS;
  }
};

export const saveMacroGoals = async (goals: MacroGoals): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY_NUTRITION_GOALS, JSON.stringify(goals));
  } catch (e) {
    console.log('Error saving macro goals:', e);
  }
};

export const loadTodayMealLogs = async (): Promise<MealItem[]> => {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY_MEAL_LOGS);
    if (!saved) return [];
    const logs: MealItem[] = JSON.parse(saved);

    const todayStr = new Date().toISOString().split('T')[0];
    return logs.filter((item) => item.loggedAt.startsWith(todayStr));
  } catch (e) {
    console.log('Error loading today meal logs:', e);
    return [];
  }
};

export const addMealLog = async (meal: Omit<MealItem, 'id' | 'loggedAt'>): Promise<MealItem[]> => {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY_MEAL_LOGS);
    const logs: MealItem[] = saved ? JSON.parse(saved) : [];

    const newLog: MealItem = {
      ...meal,
      id: Date.now().toString(),
      loggedAt: new Date().toISOString(),
    };

    const updated = [newLog, ...logs];
    await AsyncStorage.setItem(STORAGE_KEY_MEAL_LOGS, JSON.stringify(updated));

    const todayStr = new Date().toISOString().split('T')[0];
    return updated.filter((item) => item.loggedAt.startsWith(todayStr));
  } catch (e) {
    console.log('Error adding meal log:', e);
    return [];
  }
};

export const deleteMealLog = async (mealId: string): Promise<MealItem[]> => {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY_MEAL_LOGS);
    if (!saved) return [];
    const logs: MealItem[] = JSON.parse(saved);

    const updated = logs.filter((item) => item.id !== mealId);
    await AsyncStorage.setItem(STORAGE_KEY_MEAL_LOGS, JSON.stringify(updated));

    const todayStr = new Date().toISOString().split('T')[0];
    return updated.filter((item) => item.loggedAt.startsWith(todayStr));
  } catch (e) {
    console.log('Error deleting meal log:', e);
    return [];
  }
};