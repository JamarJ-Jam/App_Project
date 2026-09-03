import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SetDetail {
  id: string;
  weightLoad: string;
  reps: string;
}

export interface DetailedExercise {
  id: string;
  name: string;
  type: 'strength' | 'cardio';
  sets: SetDetail[];
  distance?: string;
  durationMinutes?: string;
}

export interface DayRoutine {
  [day: string]: DetailedExercise[];
}

export const STORAGE_KEY_ROUTINES = '@fitness_weekly_routines_v2';
export const STORAGE_KEY_BIOMETRICS = '@fitness_user_biometrics';
export const STORAGE_KEY_LOGGED_WORKOUTS = '@fitness_logged_workouts';

// Calculate estimated calorie burn based on exercise volume and biometrics
export const calculateExerciseCalories = (
  exercise: DetailedExercise,
  userWeightKg: number = 76
): number => {
  if (exercise.type === 'cardio') {
    const dist = parseFloat(exercise.distance || '0');
    const mins = parseFloat(exercise.durationMinutes || '30');
    // ~8 METs for running/moderate cardio
    const hours = mins / 60;
    return Math.round(8 * userWeightKg * hours + dist * 50);
  }

  // Strength training calorie estimation based on volume (Weight x Reps)
  let totalVolumeKg = 0;
  let totalReps = 0;

  exercise.sets.forEach((s) => {
    const w = parseFloat(s.weightLoad || '0');
    const r = parseFloat(s.reps || '0');
    totalVolumeKg += w * r;
    totalReps += r;
  });

  // Base strength MET calculation (~5 METs) + volume factor
  const baseCalories = exercise.sets.length * 12;
  const volumeCalories = (totalVolumeKg * 0.015);
  return Math.round(baseCalories + volumeCalories);
};

export const getDailyCalorieSummary = async () => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_LOGGED_WORKOUTS);
    if (!raw) return { todayCalories: 0, weeklyCalories: 0 };

    const logs: { date: string; calories: number }[] = JSON.parse(raw);
    const todayStr = new Date().toISOString().split('T')[0];

    const todayCalories = logs
      .filter((l) => l.date === todayStr)
      .reduce((sum, item) => sum + item.calories, 0);

    const weeklyCalories = logs.reduce((sum, item) => sum + item.calories, 0);

    return { todayCalories, weeklyCalories };
  } catch (e) {
    return { todayCalories: 0, weeklyCalories: 0 };
  }
};