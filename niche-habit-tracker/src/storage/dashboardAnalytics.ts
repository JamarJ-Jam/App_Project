import AsyncStorage from '@react-native-async-storage/async-storage';

import { loadUserProfile } from './userProfileStorage';
import {
  STORAGE_KEY_MEAL_LOGS,
  MealItem,
  loadMacroGoals,
} from './nutritionStorage';
import {
  getTasks,
  CalendarTask,
} from './efficiencyStorage';
import {
  getDeepWorkSessions,
  DeepWorkSession,
} from './deepWorkStorage';
import { getUserScopedStorageKey } from './userScopedStorage';

const STORAGE_KEY_WORKOUT_HISTORY = '@activity_workout_history';
const STORAGE_KEY_MOVEMENT_HISTORY = '@fitness_movement_history';

type MovementType = 'Walking' | 'Jogging' | 'Running';

interface WorkoutHistoryEntry {
  date: string;
  calories: number;
  exercises?: unknown[];
}

interface MovementEntry {
  id: string;
  type: MovementType;
  date: string;
  steps: number;
  distanceKm: number;
  durationMinutes: number;
  caloriesBurned?: number;
}

export interface DashboardRangeSummary {
  startDate: string;
  endDate: string;
  dayCount: number;

  fitness: {
    caloriesBurned: number;
    movementCaloriesBurned: number;
    workoutCaloriesBurned: number;
    steps: number;
    averageStepsPerDay: number;
    activeMinutes: number;
    distanceKm: number;
    workouts: number;
    movementEntries: number;
    stepGoalDays: number;
  };

  nutrition: {
    caloriesConsumed: number;
    averageCaloriesPerDay: number;
    averageCaloriesPerLoggedDay: number;
    proteinConsumed: number;
    carbsConsumed: number;
    fatsConsumed: number;
    averageProteinPerDay: number;
    averageCarbsPerDay: number;
    averageFatsPerDay: number;
    averageProteinPerLoggedDay: number;
    mealsLogged: number;
    loggedDays: number;
    loggingConsistencyPercent: number;
    dailyCalorieGoal: number;
    proteinGoal: number;
    carbsGoal: number;
    fatsGoal: number;
    calorieGoalDays: number;
    proteinGoalDays: number;
  };

  efficiency: {
    tasks: number;
    completedTasks: number;
    completionRate: number;
    deepWorkMinutes: number;
    deepWorkHours: number;
    averageDeepWorkHoursPerDay: number;
    deepWorkSessions: number;
    deepWorkTargetHours: number;
    deepWorkGoalDays: number;
  };
}


export interface MetricTrend {
  current: number;
  previous: number;
  delta: number;
  percentChange: number | null;
}

export interface DashboardRangeComparison {
  currentRange: { startDate: string; endDate: string };
  previousRange: { startDate: string; endDate: string };
  current: DashboardRangeSummary;
  previous: DashboardRangeSummary;
  trends: {
    fitness: {
      caloriesBurned: MetricTrend;
      steps: MetricTrend;
      averageStepsPerDay: MetricTrend;
      workouts: MetricTrend;
    };
    nutrition: {
      averageCaloriesPerDay: MetricTrend;
      averageProteinPerDay: MetricTrend;
      loggingConsistencyPercent: MetricTrend;
      mealsLogged: MetricTrend;
    };
    efficiency: {
      deepWorkHours: MetricTrend;
      averageDeepWorkHoursPerDay: MetricTrend;
      completionRate: MetricTrend;
      deepWorkSessions: MetricTrend;
    };
  };
}

const toLocalDateKey = (value: string | Date): string => {
  const date = value instanceof Date ? value : new Date(value);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const parseDateKey = (dateKey: string): Date => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const getInclusiveDayCount = (
  startDate: string,
  endDate: string
): number => {
  const start = parseDateKey(startDate);
  const end = parseDateKey(endDate);

  const difference = end.getTime() - start.getTime();
  return Math.max(1, Math.round(difference / 86400000) + 1);
};

const isInRange = (
  dateValue: string,
  startDate: string,
  endDate: string
): boolean => {
  const key = toLocalDateKey(dateValue);
  return key >= startDate && key <= endDate;
};

const poundsToKg = (pounds: number): number => pounds * 0.45359237;

const estimateMovementCalories = (
  entry: MovementEntry,
  weightKg: number
): number => {
  if (Number(entry.caloriesBurned) > 0) {
    return Number(entry.caloriesBurned);
  }

  if (entry.durationMinutes <= 0 || weightKg <= 0) {
    return 0;
  }

  const metByType: Record<MovementType, number> = {
    Walking: 3.5,
    Jogging: 7,
    Running: 9.8,
  };

  const met = metByType[entry.type] ?? 3.5;

  return (met * 3.5 * weightKg * entry.durationMinutes) / 200;
};

const loadScopedArray = async <T,>(
  baseKey: string
): Promise<T[]> => {
  try {
    const key = await getUserScopedStorageKey(baseKey);
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error(`Error loading ${baseKey}:`, error);
    return [];
  }
};

export const getDashboardRangeSummary = async (
  startDate: string,
  endDate: string
): Promise<DashboardRangeSummary> => {
  const [profile, macroGoals] = await Promise.all([
    loadUserProfile(),
    loadMacroGoals(),
  ]);

  const [workouts, movement, meals, tasks, deepWorkSessions] =
    await Promise.all([
      loadScopedArray<WorkoutHistoryEntry>(STORAGE_KEY_WORKOUT_HISTORY),
      loadScopedArray<MovementEntry>(STORAGE_KEY_MOVEMENT_HISTORY),
      loadScopedArray<MealItem>(STORAGE_KEY_MEAL_LOGS),
      getTasks(),
      getDeepWorkSessions(),
    ]);

  const dayCount = getInclusiveDayCount(startDate, endDate);

  const weightKg =
    profile.weightUnit === 'lbs'
      ? poundsToKg(Number(profile.currentWeight) || 0)
      : Number(profile.currentWeight) || 0;

  const rangeWorkouts = workouts.filter((entry) =>
    isInRange(entry.date, startDate, endDate)
  );

  const rangeMovement = movement.filter((entry) =>
    isInRange(entry.date, startDate, endDate)
  );

  const rangeMeals = meals.filter((entry) =>
    isInRange(entry.loggedAt, startDate, endDate)
  );

  const rangeTasks = tasks.filter((entry: CalendarTask) => {
    return entry.date >= startDate && entry.date <= endDate;
  });

  const rangeDeepWorkSessions = deepWorkSessions.filter(
    (session: DeepWorkSession) =>
      session.date >= startDate &&
      session.date <= endDate
  );

  const workoutCaloriesBurned = rangeWorkouts.reduce(
    (sum, workout) => sum + Number(workout.calories || 0),
    0
  );

  const movementCaloriesBurned = rangeMovement.reduce(
    (sum, entry) =>
      sum + estimateMovementCalories(entry, weightKg),
    0
  );

  const steps = rangeMovement.reduce(
    (sum, entry) => sum + Number(entry.steps || 0),
    0
  );

  const activeMinutes = rangeMovement.reduce(
    (sum, entry) => sum + Number(entry.durationMinutes || 0),
    0
  );

  const distanceKm = rangeMovement.reduce(
    (sum, entry) => sum + Number(entry.distanceKm || 0),
    0
  );

  const stepsByDate = rangeMovement.reduce<Record<string, number>>(
    (acc, entry) => {
      const key = toLocalDateKey(entry.date);
      acc[key] = (acc[key] || 0) + Number(entry.steps || 0);
      return acc;
    },
    {}
  );

  const dailyStepGoal = Number(profile.dailySteps) || 0;

  const stepGoalDays =
    dailyStepGoal > 0
      ? Object.values(stepsByDate).filter(
          (dailySteps) => dailySteps >= dailyStepGoal
        ).length
      : 0;

  const caloriesConsumed = rangeMeals.reduce(
    (sum, meal) => sum + Number(meal.calories || 0),
    0
  );

  const proteinConsumed = rangeMeals.reduce(
    (sum, meal) => sum + Number(meal.protein || 0),
    0
  );

  const carbsConsumed = rangeMeals.reduce(
    (sum, meal) => sum + Number(meal.carbs || 0),
    0
  );

  const fatsConsumed = rangeMeals.reduce(
    (sum, meal) => sum + Number(meal.fats || 0),
    0
  );

  const nutritionByDate = rangeMeals.reduce<
    Record<
      string,
      {
        calories: number;
        protein: number;
      }
    >
  >((acc, meal) => {
    const key = toLocalDateKey(meal.loggedAt);

    if (!acc[key]) {
      acc[key] = {
        calories: 0,
        protein: 0,
      };
    }

    acc[key].calories += Number(meal.calories || 0);
    acc[key].protein += Number(meal.protein || 0);

    return acc;
  }, {});

  const loggedDays = Object.keys(nutritionByDate).length;

  const dailyCalorieGoal = Number(profile.dailyCalories) || 0;

  const calorieGoalDays =
    dailyCalorieGoal > 0
      ? Object.values(nutritionByDate).filter(
          (day) =>
            day.calories >= dailyCalorieGoal * 0.9 &&
            day.calories <= dailyCalorieGoal * 1.1
        ).length
      : 0;

  const proteinGoal = Number(macroGoals.proteinGrams) || 0;
  const carbsGoal = Number(macroGoals.carbsGrams) || 0;
  const fatsGoal = Number(macroGoals.fatsGrams) || 0;

  const proteinGoalDays =
    proteinGoal > 0
      ? Object.values(nutritionByDate).filter(
          (day) => day.protein >= proteinGoal
        ).length
      : 0;

  const loggingConsistencyPercent = Math.round(
    (loggedDays / dayCount) * 100
  );

  const completedTasks = rangeTasks.filter(
    (task) => task.completed
  ).length;

  const completionRate =
    rangeTasks.length > 0
      ? (completedTasks / rangeTasks.length) * 100
      : 0;

  const deepWorkMinutes = rangeDeepWorkSessions.reduce(
    (sum, session) =>
      sum + Number(session.durationMinutes || 0),
    0
  );

  const deepWorkHours = deepWorkMinutes / 60;
  const deepWorkTargetHours =
    Number(profile.deepWorkHours) || 0;

  const deepWorkMinutesByDate =
    rangeDeepWorkSessions.reduce<Record<string, number>>(
      (acc, session) => {
        acc[session.date] =
          (acc[session.date] || 0) +
          Number(session.durationMinutes || 0);
        return acc;
      },
      {}
    );

  const deepWorkGoalDays =
    deepWorkTargetHours > 0
      ? Object.values(deepWorkMinutesByDate).filter(
          (minutes) =>
            minutes >= deepWorkTargetHours * 60
        ).length
      : 0;

  return {
    startDate,
    endDate,
    dayCount,

    fitness: {
      caloriesBurned: Math.round(
        workoutCaloriesBurned + movementCaloriesBurned
      ),
      movementCaloriesBurned: Math.round(
        movementCaloriesBurned
      ),
      workoutCaloriesBurned: Math.round(
        workoutCaloriesBurned
      ),
      steps,
      averageStepsPerDay: Math.round(steps / dayCount),
      activeMinutes,
      distanceKm: Number(distanceKm.toFixed(2)),
      workouts: rangeWorkouts.length,
      movementEntries: rangeMovement.length,
      stepGoalDays,
    },

    nutrition: {
      caloriesConsumed: Math.round(caloriesConsumed),
      averageCaloriesPerDay: Math.round(
        caloriesConsumed / dayCount
      ),
      averageCaloriesPerLoggedDay:
        loggedDays > 0
          ? Math.round(caloriesConsumed / loggedDays)
          : 0,
      proteinConsumed: Math.round(proteinConsumed),
      carbsConsumed: Math.round(carbsConsumed),
      fatsConsumed: Math.round(fatsConsumed),
      averageProteinPerDay: Math.round(
        proteinConsumed / dayCount
      ),
      averageCarbsPerDay: Math.round(
        carbsConsumed / dayCount
      ),
      averageFatsPerDay: Math.round(
        fatsConsumed / dayCount
      ),
      averageProteinPerLoggedDay:
        loggedDays > 0
          ? Math.round(proteinConsumed / loggedDays)
          : 0,
      mealsLogged: rangeMeals.length,
      loggedDays,
      loggingConsistencyPercent,
      dailyCalorieGoal,
      proteinGoal,
      carbsGoal,
      fatsGoal,
      calorieGoalDays,
      proteinGoalDays,
    },

    efficiency: {
      tasks: rangeTasks.length,
      completedTasks,
      completionRate: Math.round(completionRate),
      deepWorkMinutes,
      deepWorkHours: Number(deepWorkHours.toFixed(2)),
      averageDeepWorkHoursPerDay: Number(
        (deepWorkHours / dayCount).toFixed(2)
      ),
      deepWorkSessions: rangeDeepWorkSessions.length,
      deepWorkTargetHours,
      deepWorkGoalDays,
    },
  };
};

const addDaysToDateKey = (dateKey: string, amount: number): string => {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + amount);
  return toLocalDateKey(date);
};

const createTrend = (current: number, previous: number): MetricTrend => {
  const delta = current - previous;

  return {
    current,
    previous,
    delta: Number(delta.toFixed(2)),
    percentChange:
      previous === 0
        ? null
        : Number(((delta / previous) * 100).toFixed(1)),
  };
};

export const getDashboardRangeComparison = async (
  startDate: string,
  endDate: string
): Promise<DashboardRangeComparison> => {
  const dayCount = getInclusiveDayCount(startDate, endDate);
  const previousEndDate = addDaysToDateKey(startDate, -1);
  const previousStartDate = addDaysToDateKey(
    previousEndDate,
    -(dayCount - 1)
  );

  const [current, previous] = await Promise.all([
    getDashboardRangeSummary(startDate, endDate),
    getDashboardRangeSummary(previousStartDate, previousEndDate),
  ]);

  return {
    currentRange: { startDate, endDate },
    previousRange: {
      startDate: previousStartDate,
      endDate: previousEndDate,
    },
    current,
    previous,
    trends: {
      fitness: {
        caloriesBurned: createTrend(
          current.fitness.caloriesBurned,
          previous.fitness.caloriesBurned
        ),
        steps: createTrend(
          current.fitness.steps,
          previous.fitness.steps
        ),
        averageStepsPerDay: createTrend(
          current.fitness.averageStepsPerDay,
          previous.fitness.averageStepsPerDay
        ),
        workouts: createTrend(
          current.fitness.workouts,
          previous.fitness.workouts
        ),
      },
      nutrition: {
        averageCaloriesPerDay: createTrend(
          current.nutrition.averageCaloriesPerDay,
          previous.nutrition.averageCaloriesPerDay
        ),
        averageProteinPerDay: createTrend(
          current.nutrition.averageProteinPerDay,
          previous.nutrition.averageProteinPerDay
        ),
        loggingConsistencyPercent: createTrend(
          current.nutrition.loggingConsistencyPercent,
          previous.nutrition.loggingConsistencyPercent
        ),
        mealsLogged: createTrend(
          current.nutrition.mealsLogged,
          previous.nutrition.mealsLogged
        ),
      },
      efficiency: {
        deepWorkHours: createTrend(
          current.efficiency.deepWorkHours,
          previous.efficiency.deepWorkHours
        ),
        averageDeepWorkHoursPerDay: createTrend(
          current.efficiency.averageDeepWorkHoursPerDay,
          previous.efficiency.averageDeepWorkHoursPerDay
        ),
        completionRate: createTrend(
          current.efficiency.completionRate,
          previous.efficiency.completionRate
        ),
        deepWorkSessions: createTrend(
          current.efficiency.deepWorkSessions,
          previous.efficiency.deepWorkSessions
        ),
      },
    },
  };
};

