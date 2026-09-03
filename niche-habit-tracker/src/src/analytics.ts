export interface UserProfile {
  age: number;
  heightCm: number;
  weightKg: number;
  targetWeightKg: number;
}

export interface FitnessStats {
  workoutsCompleted: number;
  caloriesBurned: number;
  topExercise: string;
}

export interface EfficiencyStats {
  tasksCompleted: number;
  totalTasks: number;
  wowGrowthPercent: number;
  weeklyCompletionRate: number;
}

export const calculateBMI = (weightKg: number, heightCm: number): number => {
  if (!heightCm || heightCm <= 0) return 0;
  const heightInMeters = heightCm / 100;
  const bmi = weightKg / (heightInMeters * heightInMeters);
  return parseFloat(bmi.toFixed(1));
};

export const getBMICategory = (bmi: number): string => {
  if (bmi < 18.5) return 'Underweight';
  if (bmi < 25) return 'Normal';
  if (bmi < 30) return 'Overweight';
  return 'Obese';
};

export const initialProfile: UserProfile = {
  age: 28,
  heightCm: 178,
  weightKg: 78,
  targetWeightKg: 75,
};

export const initialFitness: FitnessStats = {
  workoutsCompleted: 5,
  caloriesBurned: 1850,
  topExercise: 'Running',
};

export const initialEfficiency: EfficiencyStats = {
  tasksCompleted: 18,
  totalTasks: 22,
  wowGrowthPercent: 12,
  weeklyCompletionRate: 82,
};