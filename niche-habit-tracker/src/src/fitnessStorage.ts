import AsyncStorage from '@react-native-async-storage/async-storage';

export interface WorkoutLog {
  id: string;
  type: 'fundamental' | 'gym';
  exerciseName: string; // e.g., 'Push-ups', 'Running', 'Bench Press'
  durationMinutes?: number;
  reps?: number;
  sets?: number;
  weightLbs?: number;
  estimatedCalories: number;
  date: string; // YYYY-MM-DD
}

export interface Biometrics {
  weightLbs: number;
  heightInches: number;
  age: number;
  targetWeightLbs: number;
}

const WORKOUT_KEY = '@accountability_workouts';
const BIOMETRICS_KEY = '@accountability_biometrics';

export const defaultBiometrics: Biometrics = {
  weightLbs: 175,
  heightInches: 70, // 5'10"
  age: 28,
  targetWeightLbs: 165,
};

export const FUNDAMENTAL_EXERCISES = [
  { name: 'Running', unit: 'minutes', calPerMin: 11.5, icon: '🏃' },
  { name: 'Walking', unit: 'minutes', calPerMin: 4.5, icon: '🚶' },
  { name: 'Push-ups', unit: 'reps', calPerRep: 0.5, icon: '💪' },
  { name: 'Squats', unit: 'reps', calPerRep: 0.6, icon: '🏋️' },
  { name: 'Plank', unit: 'seconds', calPerMin: 5.0, icon: '🧘' },
];

export const saveWorkouts = async (workouts: WorkoutLog[]) => {
  await AsyncStorage.setItem(WORKOUT_KEY, JSON.stringify(workouts));
};

export const getWorkouts = async (): Promise<WorkoutLog[]> => {
  const data = await AsyncStorage.getItem(WORKOUT_KEY);
  return data ? JSON.parse(data) : [];
};

export const saveBiometrics = async (bio: Biometrics) => {
  await AsyncStorage.setItem(BIOMETRICS_KEY, JSON.stringify(bio));
};

export const getBiometrics = async (): Promise<Biometrics> => {
  const data = await AsyncStorage.getItem(BIOMETRICS_KEY);
  return data ? JSON.parse(data) : defaultBiometrics;
};