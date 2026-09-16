import AsyncStorage from '@react-native-async-storage/async-storage';

import { loadUserProfile, UserProfile } from '../storage/userProfileStorage';
import {
  loadMacroGoals,
  loadTodayMealLogs,
  MacroGoals,
  MealItem,
} from '../storage/nutritionStorage';
import {
  getTasks,
  CalendarTask,
  fetchDeviceEvents,
} from '../storage/efficiencyStorage';
import { getUserScopedStorageKey } from '../storage/userScopedStorage';
import {
  getDeepWorkSessions,
  DeepWorkSession,
} from '../storage/deepWorkStorage';

const STORAGE_KEY_WORKOUT_HISTORY = '@activity_workout_history';
const STORAGE_KEY_MOVEMENT_HISTORY = '@fitness_movement_history';

type MovementType = 'Walking' | 'Jogging' | 'Running';

interface MovementEntry {
  id: string;
  type: MovementType;
  date: string;
  steps: number;
  distanceKm: number;
  durationMinutes: number;
}

export interface ChawgeeContext {
  profile: UserProfile;

  fitness: {
    currentWeight: number;
    targetWeight: number;
    workouts: any[];
    movement: {
      dailyStepGoal: number;
      stepsToday: number;
      distanceKmToday: number;
      activeMinutesToday: number;
      walkingSteps: number;
      joggingSteps: number;
      runningSteps: number;
      entriesToday: MovementEntry[];
    };
  };

  nutrition: {
    goals: MacroGoals;
    todayMeals: MealItem[];
    mealCount: number;
    caloriesConsumed: number;
    proteinConsumed: number;
    carbsConsumed: number;
    fatsConsumed: number;
    caloriesRemaining: number;
    proteinRemaining: number;
    calorieGoalProgressPercent: number;
    proteinGoalProgressPercent: number;
  };

  efficiency: {
    tasks: CalendarTask[];
    deepWorkTargetHours: number;
    deepWorkTodayMinutes: number;
    deepWorkTodayHours: number;
    deepWorkSessionsToday: DeepWorkSession[];
  };

  calendar: {
    enabled: boolean;
    events: any[];
  };
}

const getTodayString = (): string => {
  return new Date().toDateString();
};

const loadWorkoutHistory = async (): Promise<any[]> => {
  try {
    const workoutHistoryKey = await getUserScopedStorageKey(
      STORAGE_KEY_WORKOUT_HISTORY
    );

    const raw = await AsyncStorage.getItem(workoutHistoryKey);

    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error('Error loading workout history:', error);
    return [];
  }
};

const loadMovementHistory = async (): Promise<MovementEntry[]> => {
  try {
    const movementHistoryKey = await getUserScopedStorageKey(
      STORAGE_KEY_MOVEMENT_HISTORY
    );

    const raw = await AsyncStorage.getItem(movementHistoryKey);

    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error('Error loading movement history:', error);
    return [];
  }
};

const summarizeTodayMovement = (
  movementHistory: MovementEntry[],
  dailyStepGoal: number
) => {
  const today = getTodayString();

  const entriesToday = movementHistory.filter(
    (entry) => new Date(entry.date).toDateString() === today
  );

  const stepsToday = entriesToday.reduce(
    (sum, entry) => sum + Number(entry.steps || 0),
    0
  );

  const distanceKmToday = entriesToday.reduce(
    (sum, entry) => sum + Number(entry.distanceKm || 0),
    0
  );

  const activeMinutesToday = entriesToday.reduce(
    (sum, entry) => sum + Number(entry.durationMinutes || 0),
    0
  );

  const walkingSteps = entriesToday
    .filter((entry) => entry.type === 'Walking')
    .reduce((sum, entry) => sum + Number(entry.steps || 0), 0);

  const joggingSteps = entriesToday
    .filter((entry) => entry.type === 'Jogging')
    .reduce((sum, entry) => sum + Number(entry.steps || 0), 0);

  const runningSteps = entriesToday
    .filter((entry) => entry.type === 'Running')
    .reduce((sum, entry) => sum + Number(entry.steps || 0), 0);

  return {
    dailyStepGoal,
    stepsToday,
    distanceKmToday,
    activeMinutesToday,
    walkingSteps,
    joggingSteps,
    runningSteps,
    entriesToday,
  };
};

const loadCalendarEvents = async (
  profile: UserProfile
): Promise<any[]> => {
  try {
    if (!profile.calendarSyncEnabled) {
      return [];
    }

    return await fetchDeviceEvents();
  } catch (error) {
    console.error('Error loading calendar events:', error);
    return [];
  }
};

export const buildChawgeeContext = async (): Promise<ChawgeeContext> => {
  const [
    profile,
    goals,
    todayMeals,
    tasks,
    workouts,
    movementHistory,
    deepWorkSessions,
  ] = await Promise.all([
    loadUserProfile(),
    loadMacroGoals(),
    loadTodayMealLogs(),
    getTasks(),
    loadWorkoutHistory(),
    loadMovementHistory(),
    getDeepWorkSessions(),
  ]);

  const calendarEvents = await loadCalendarEvents(profile);

  const caloriesConsumed = todayMeals.reduce(
    (sum, meal) => sum + meal.calories,
    0
  );

  const proteinConsumed = todayMeals.reduce(
    (sum, meal) => sum + meal.protein,
    0
  );

  const carbsConsumed = todayMeals.reduce(
    (sum, meal) => sum + meal.carbs,
    0
  );

  const fatsConsumed = todayMeals.reduce(
    (sum, meal) => sum + meal.fats,
    0
  );

  const movement = summarizeTodayMovement(
    movementHistory,
    profile.dailySteps
  );

  const todayDateKey = (() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  })();

  const deepWorkSessionsToday = deepWorkSessions.filter(
    (session) => session.date === todayDateKey
  );

  const deepWorkTodayMinutes = deepWorkSessionsToday.reduce(
    (sum, session) =>
      sum + Number(session.durationMinutes || 0),
    0
  );

  return {
    profile,

    fitness: {
      currentWeight: profile.currentWeight,
      targetWeight: profile.targetWeight,
      workouts,
      movement,
    },

    nutrition: {
      goals,
      todayMeals,
      mealCount: todayMeals.length,
      caloriesConsumed,
      proteinConsumed,
      carbsConsumed,
      fatsConsumed,
      caloriesRemaining: Math.max(
        0,
        Number(goals.dailyCalories || 0) - caloriesConsumed
      ),
      proteinRemaining: Math.max(
        0,
        Number(goals.proteinGrams || 0) - proteinConsumed
      ),
      calorieGoalProgressPercent:
        Number(goals.dailyCalories || 0) > 0
          ? Math.round(
              (caloriesConsumed /
                Number(goals.dailyCalories)) *
                100
            )
          : 0,
      proteinGoalProgressPercent:
        Number(goals.proteinGrams || 0) > 0
          ? Math.round(
              (proteinConsumed /
                Number(goals.proteinGrams)) *
                100
            )
          : 0,
    },

    efficiency: {
      tasks,
      deepWorkTargetHours: profile.deepWorkHours,
      deepWorkTodayMinutes,
      deepWorkTodayHours: Number(
        (deepWorkTodayMinutes / 60).toFixed(2)
      ),
      deepWorkSessionsToday,
    },

    calendar: {
      enabled: profile.calendarSyncEnabled,
      events: calendarEvents,
    },
  };
};
