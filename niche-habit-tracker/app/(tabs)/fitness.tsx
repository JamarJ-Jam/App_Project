import React, { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/context/ThemeContext';
import { LightTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/constants/colors';
import { loadUserProfile } from '../../src/storage/userProfileStorage';
import { useAuth } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/context/AuthContext';

export const STORAGE_KEY_WORKOUT_HISTORY = '@activity_workout_history';

const STORAGE_KEY_ACTIVE_EXERCISES = '@fitness_active_exercises';
const STORAGE_KEY_MOVEMENT_HISTORY = '@fitness_movement_history';

type CategoryType = 'Gym' | 'Foundational' | 'Stretching';
type MovementType = 'Walking' | 'Jogging' | 'Running';

interface SetItem {
  reps: string;
  weight: string;
}

interface ExerciseItem {
  id: string;
  name: string;
  category: CategoryType;
  bodyPart: string;
  sets: SetItem[];
}

interface WorkoutHistoryEntry {
  date: string;
  calories: number;
  exercises: ExerciseItem[];
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

const poundsToKg = (pounds: number): number =>
  pounds * 0.45359237;

const estimateMovementCalories = (
  type: MovementType,
  durationMinutes: number,
  weightKg: number
): number => {
  if (durationMinutes <= 0 || weightKg <= 0) {
    return 0;
  }

  const metByType: Record<MovementType, number> = {
    Walking: 3.5,
    Jogging: 7,
    Running: 9.8,
  };

  const met = metByType[type];

  return Math.round(
    (met * 3.5 * weightKg * durationMinutes) / 200
  );
};

const EXERCISE_LIBRARY: Record<
  CategoryType,
  Record<string, string[]>
> = {
  Gym: {
    Chest: [
      'Bench Press',
      'Incline Dumbbell Press',
      'Cable Flyes',
      'Chest Press Machine',
    ],
    Back: [
      'Lat Pulldown',
      'Seated Cable Row',
      'Barbell Row',
      'Deadlift',
    ],
    Shoulders: [
      'Overhead Dumbbell Press',
      'Lateral Raises',
      'Face Pulls',
    ],
    Arms: [
      'Bicep Curls',
      'Tricep Rope Pushdown',
      'Hammer Curls',
    ],
    Legs: [
      'Barbell Squat',
      'Leg Press',
      'Hamstring Curl',
      'Calf Raises',
    ],
    'Gym Cardio': [
      'Treadmill Run',
      'Stairmaster',
      'Elliptical',
      'Rowing Machine',
    ],
  },

  Foundational: {
    'Upper Body': [
      'Push-ups',
      'Pike Push-ups',
      'Dips',
      'Bodyweight Rows',
    ],
    'Lower Body': [
      'Bodyweight Squats',
      'Lunges',
      'Bulgarian Split Squats',
      'Glute Bridges',
    ],
    Core: [
      'Plank',
      'Hanging Leg Raises',
      'Russian Twists',
      'Ab Wheel Rollouts',
    ],
    'Bodyweight Cardio': [
      'Jumping Jacks',
      'Burpees',
      'Mountain Climbers',
      'High Knees',
    ],
  },

  Stretching: {
    'Full Body Mobility': [
      "World's Greatest Stretch",
      'Cat-Cow',
      'Thoracic Rotations',
    ],
    'Upper Stretches': [
      'Doorway Chest Stretch',
      'Cross-Body Shoulder Stretch',
      'Tricep Stretch',
    ],
    'Lower Stretches': [
      'Hamstring Stretch',
      'Pigeon Pose',
      'Couch Stretch (Quads)',
    ],
    'Dynamic Warm-Up': [
      'Arm Circles',
      'Leg Swings',
      'Hip Openers',
    ],
  },
};

const categoryIcons: Record<CategoryType, keyof typeof Ionicons.glyphMap> = {
  Gym: 'barbell-outline',
  Foundational: 'body-outline',
  Stretching: 'leaf-outline',
};

const movementIcons: Record<MovementType, keyof typeof Ionicons.glyphMap> = {
  Walking: 'walk-outline',
  Jogging: 'fitness-outline',
  Running: 'flash-outline',
};

export default function FitnessScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const { quickAction } = useLocalSearchParams<{
    quickAction?: string;
  }>();
  const { user } = useAuth();

  const colors = theme || LightTheme;

  const userStorageId = user?.id ?? 'anonymous';

  const workoutHistoryKey =
    `${STORAGE_KEY_WORKOUT_HISTORY}:${userStorageId}`;
  const activeExercisesKey =
    `${STORAGE_KEY_ACTIVE_EXERCISES}:${userStorageId}`;
  const movementHistoryKey =
    `${STORAGE_KEY_MOVEMENT_HISTORY}:${userStorageId}`;

  const [selectedCategory, setSelectedCategory] =
    useState<CategoryType>('Gym');

  const [exercises, setExercises] = useState<ExerciseItem[]>([]);

  const [modalVisible, setModalVisible] = useState(false);
  const [selectedBodyPart, setSelectedBodyPart] = useState('');
  const [selectedExerciseName, setSelectedExerciseName] = useState('');
  const [customExerciseName, setCustomExerciseName] = useState('');

  const [initialReps, setInitialReps] = useState('10');
  const [initialWeight, setInitialWeight] = useState('0');

  const [workoutHistory, setWorkoutHistory] = useState<
    WorkoutHistoryEntry[]
  >([]);

  const [dailyStepGoal, setDailyStepGoal] = useState(10000);
  const [movementHistory, setMovementHistory] = useState<MovementEntry[]>([]);
  const [movementModalVisible, setMovementModalVisible] = useState(false);
  const [movementType, setMovementType] = useState<MovementType>('Walking');
  const [movementSteps, setMovementSteps] = useState('');
  const [movementDistance, setMovementDistance] = useState('');
  const [movementDuration, setMovementDuration] = useState('');

  useFocusEffect(
    useCallback(() => {
      let mounted = true;

      const loadFitnessData = async () => {
        try {
          const profile = await loadUserProfile();

          const activeExercisesRaw =
            await AsyncStorage.getItem(activeExercisesKey);

          const historyRaw =
            await AsyncStorage.getItem(workoutHistoryKey);

          const movementRaw =
            await AsyncStorage.getItem(movementHistoryKey);

          if (!mounted) return;

          setExercises(
            activeExercisesRaw
              ? JSON.parse(activeExercisesRaw)
              : []
          );

          setWorkoutHistory(
            historyRaw
              ? JSON.parse(historyRaw)
              : []
          );

          // Account/profile remains the source of truth for the daily step target.
          // The fallback aliases keep this screen compatible if the profile field
          // is currently named dailySteps, stepGoal, or dailyStepGoal.
          const profileWithGoals = profile as typeof profile & {
            dailySteps?: number;
            stepGoal?: number;
            dailyStepGoal?: number;
          };

          setDailyStepGoal(
            Number(
              profileWithGoals.dailySteps ??
                profileWithGoals.stepGoal ??
                profileWithGoals.dailyStepGoal ??
                10000
            ) || 10000
          );

          setMovementHistory(
            movementRaw
              ? JSON.parse(movementRaw)
              : []
          );
        } catch (error) {
          console.error(
            'Error loading fitness data:',
            error
          );
        }
      };

      loadFitnessData();

      return () => {
        mounted = false;
      };
    }, [user?.id])
  );

  const saveExercises = async (
    updatedExercises: ExerciseItem[]
  ) => {
    setExercises(updatedExercises);

    try {
      await AsyncStorage.setItem(
        activeExercisesKey,
        JSON.stringify(updatedExercises)
      );
    } catch (error) {
      console.error(
        'Error saving fitness exercises:',
        error
      );
    }
  };

  const totalSets = exercises.reduce(
    (total, exercise) =>
      total + exercise.sets.length,
    0
  );

  const openAddModal = () => {
    setSelectedBodyPart('');
    setSelectedExerciseName('');
    setCustomExerciseName('');
    setInitialReps('10');
    setInitialWeight(
      selectedCategory === 'Gym' ? '135' : '0'
    );
    setModalVisible(true);
  };

  useEffect(() => {
    if (quickAction !== 'addWorkout') return;

    openAddModal();
    router.setParams({ quickAction: '' });
  }, [quickAction]);

  const handleAddExercise = async () => {
    const exerciseName =
      customExerciseName.trim() ||
      selectedExerciseName;

    if (!exerciseName) {
      Alert.alert(
        'Choose an exercise',
        'Select an exercise or enter a custom exercise name.'
      );
      return;
    }

    const newExercise: ExerciseItem = {
      id: Date.now().toString(),
      name: exerciseName,
      category: selectedCategory,
      bodyPart:
        selectedBodyPart || 'Custom',
      sets: [
        {
          reps: initialReps || '10',
          weight: initialWeight || '0',
        },
      ],
    };

    await saveExercises([
      ...exercises,
      newExercise,
    ]);

    await Haptics.impactAsync(
      Haptics.ImpactFeedbackStyle.Light
    );

    setModalVisible(false);
  };

  const addSet = async (exerciseId: string) => {
    const updated = exercises.map((exercise) => {
      if (exercise.id !== exerciseId) {
        return exercise;
      }

      const lastSet =
        exercise.sets[exercise.sets.length - 1];

      return {
        ...exercise,
        sets: [
          ...exercise.sets,
          {
            reps: lastSet?.reps || '10',
            weight: lastSet?.weight || '0',
          },
        ],
      };
    });

    await saveExercises(updated);
  };

  const updateSet = async (
    exerciseId: string,
    setIndex: number,
    field: keyof SetItem,
    value: string
  ) => {
    const updated = exercises.map((exercise) => {
      if (exercise.id !== exerciseId) {
        return exercise;
      }

      const updatedSets = exercise.sets.map(
        (set, index) =>
          index === setIndex
            ? {
                ...set,
                [field]: value,
              }
            : set
      );

      return {
        ...exercise,
        sets: updatedSets,
      };
    });

    await saveExercises(updated);
  };

  const removeSet = async (
    exerciseId: string,
    setIndex: number
  ) => {
    const updated = exercises.map((exercise) => {
      if (exercise.id !== exerciseId) {
        return exercise;
      }

      return {
        ...exercise,
        sets: exercise.sets.filter(
          (_, index) => index !== setIndex
        ),
      };
    });

    await saveExercises(
      updated.filter(
        (exercise) => exercise.sets.length > 0
      )
    );
  };

  const removeExercise = async (
    exerciseId: string
  ) => {
    Alert.alert(
      'Remove exercise?',
      'This will remove the exercise from today’s routine.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const updated = exercises.filter(
              (exercise) =>
                exercise.id !== exerciseId
            );

            await saveExercises(updated);
          },
        },
      ]
    );
  };

  const logCompletedWorkout = async () => {
    if (exercises.length === 0) {
      Alert.alert(
        'No exercises',
        'Add at least one exercise before completing your workout.'
      );
      return;
    }

    try {
      const workoutCalories = exercises.reduce(
        (total, exercise) => {
          const exerciseCalories =
            exercise.sets.length * 12;

          return total + exerciseCalories;
        },
        0
      );

      const newWorkout: WorkoutHistoryEntry = {
        date: new Date().toISOString(),
        calories: workoutCalories,
        exercises,
      };

      const updatedHistory = [
        newWorkout,
        ...workoutHistory,
      ];

      await AsyncStorage.setItem(
        workoutHistoryKey,
        JSON.stringify(updatedHistory)
      );

      await AsyncStorage.removeItem(activeExercisesKey);

      setWorkoutHistory(updatedHistory);
      setExercises([]);

      await Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success
      );

      Alert.alert(
        'Workout logged',
        'Your completed workout has been saved.'
      );
    } catch (error) {
      console.error(
        'Error logging workout:',
        error
      );

      Alert.alert(
        'Unable to save',
        'Something went wrong while saving your workout.'
      );
    }
  };

  const openMovementModal = () => {
    setMovementType('Walking');
    setMovementSteps('');
    setMovementDistance('');
    setMovementDuration('');
    setMovementModalVisible(true);
  };

  const logMovement = async () => {
    const steps = Number.parseInt(movementSteps, 10) || 0;
    const distanceKm = Number.parseFloat(movementDistance) || 0;
    const durationMinutes = Number.parseInt(movementDuration, 10) || 0;

    if (steps <= 0 && distanceKm <= 0 && durationMinutes <= 0) {
      Alert.alert(
        'Add movement details',
        'Enter steps, distance, or active minutes before saving.'
      );
      return;
    }

    const profile = await loadUserProfile();

    const currentWeight = Number(profile.currentWeight) || 0;
    const weightKg =
      profile.weightUnit === 'lbs'
        ? poundsToKg(currentWeight)
        : currentWeight;

    const caloriesBurned = estimateMovementCalories(
      movementType,
      durationMinutes,
      weightKg
    );

    const newEntry: MovementEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: movementType,
      date: new Date().toISOString(),
      steps,
      distanceKm,
      durationMinutes,
      caloriesBurned,
    };

    const updatedMovement = [newEntry, ...movementHistory];

    try {
      await AsyncStorage.setItem(
        movementHistoryKey,
        JSON.stringify(updatedMovement)
      );

      setMovementHistory(updatedMovement);
      setMovementModalVisible(false);

      await Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success
      );
    } catch (error) {
      console.error('Error logging movement:', error);
      Alert.alert(
        'Unable to save',
        'Something went wrong while saving your movement.'
      );
    }
  };

  const todayKey = new Date().toDateString();

  const todaysMovement = movementHistory.filter(
    (entry) => new Date(entry.date).toDateString() === todayKey
  );

  const todaySteps = todaysMovement.reduce(
    (total, entry) => total + entry.steps,
    0
  );

  const todayDistance = todaysMovement.reduce(
    (total, entry) => total + entry.distanceKm,
    0
  );

  const todayActiveMinutes = todaysMovement.reduce(
    (total, entry) => total + entry.durationMinutes,
    0
  );

  const movementProgress =
    dailyStepGoal > 0
      ? Math.min(todaySteps / dailyStepGoal, 1)
      : 0;

  const getDistanceForType = (type: MovementType) =>
    todaysMovement
      .filter((entry) => entry.type === type)
      .reduce((total, entry) => total + entry.distanceKm, 0);

  const bodyParts = Object.keys(
    EXERCISE_LIBRARY[selectedCategory]
  );

  const availableExercises =
    selectedBodyPart
      ? EXERCISE_LIBRARY[selectedCategory][
          selectedBodyPart
        ] || []
      : [];

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        {
          backgroundColor:
            colors.background || '#F7F8FA',
        },
      ]}
    >
      <View
        style={[
          styles.fixedHeader,
          {
            backgroundColor:
              colors.background || '#F7F8FA',
            borderBottomColor:
              colors.border || '#E5E7EB',
          },
        ]}
      >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text
            style={[
              styles.title,
              {
                color:
                  colors.textPrimary || '#111827',
              },
            ]}
          >
            Fitness
          </Text>

          <Text
            style={[
              styles.subtitle,
              {
                color:
                  colors.textSecondary ||
                  '#6B7280',
              },
            ]}
          >
            Train with intent. Track your progress.
          </Text>
        </View>

        <View
          style={[
            styles.headerIcon,
            {
              backgroundColor:
                colors.fitnessAccent
                  ? `${colors.fitnessAccent}18`
                  : '#EEF2FF',
            },
          ]}
        >
          <Ionicons
            name="fitness-outline"
            size={23}
            color={
              colors.fitnessAccent || '#6366F1'
            }
          />
        </View>
      </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* Daily Movement */}
        <View
          style={[
            styles.card,
            {
              backgroundColor:
                colors.cardBackground || '#FFFFFF',
            },
          ]}
        >
          <View style={styles.sectionHeader}>
            <View>
              <Text
                style={[
                  styles.sectionTitle,
                  {
                    color:
                      colors.textPrimary || '#111827',
                  },
                ]}
              >
                Daily movement
              </Text>

              <Text
                style={[
                  styles.sectionSubtitle,
                  {
                    color:
                      colors.textSecondary || '#6B7280',
                  },
                ]}
              >
                Steps, walking, jogging and running
              </Text>
            </View>

            <Ionicons
              name="walk-outline"
              size={22}
              color={colors.fitnessAccent || '#6366F1'}
            />
          </View>

          <View style={styles.stepHeader}>
            <View>
              <Text
                style={[
                  styles.stepValue,
                  {
                    color:
                      colors.textPrimary || '#111827',
                  },
                ]}
              >
                {todaySteps.toLocaleString()}
              </Text>

              <Text
                style={[
                  styles.stepGoal,
                  {
                    color:
                      colors.textSecondary || '#6B7280',
                  },
                ]}
              >
                of {dailyStepGoal.toLocaleString()} steps
              </Text>
            </View>

            <Text
              style={[
                styles.stepPercent,
                {
                  color:
                    colors.fitnessAccent || '#6366F1',
                },
              ]}
            >
              {Math.round(movementProgress * 100)}%
            </Text>
          </View>

          <View
            style={[
              styles.progressTrack,
              {
                backgroundColor:
                  colors.border || '#E5E7EB',
              },
            ]}
          >
            <View
              style={[
                styles.progressFill,
                {
                  width: `${movementProgress * 100}%`,
                  backgroundColor:
                    colors.fitnessAccent || '#6366F1',
                },
              ]}
            />
          </View>

          <View style={styles.movementStats}>
            <View style={styles.movementStat}>
              <Text
                style={[
                  styles.movementStatValue,
                  {
                    color:
                      colors.textPrimary || '#111827',
                  },
                ]}
              >
                {todayDistance.toFixed(1)} km
              </Text>
              <Text
                style={[
                  styles.movementStatLabel,
                  {
                    color:
                      colors.textSecondary || '#6B7280',
                  },
                ]}
              >
                Distance
              </Text>
            </View>

            <View style={styles.movementStat}>
              <Text
                style={[
                  styles.movementStatValue,
                  {
                    color:
                      colors.textPrimary || '#111827',
                  },
                ]}
              >
                {todayActiveMinutes} min
              </Text>
              <Text
                style={[
                  styles.movementStatLabel,
                  {
                    color:
                      colors.textSecondary || '#6B7280',
                  },
                ]}
              >
                Active time
              </Text>
            </View>
          </View>

          <View style={styles.activityBreakdown}>
            {(['Walking', 'Jogging', 'Running'] as MovementType[]).map(
              (type) => (
                <View
                  key={type}
                  style={[
                    styles.activityItem,
                    {
                      backgroundColor:
                        colors.background || '#F7F8FA',
                    },
                  ]}
                >
                  <Ionicons
                    name={movementIcons[type]}
                    size={18}
                    color={colors.fitnessAccent || '#6366F1'}
                  />

                  <Text
                    style={[
                      styles.activityValue,
                      {
                        color:
                          colors.textPrimary || '#111827',
                      },
                    ]}
                  >
                    {getDistanceForType(type).toFixed(1)} km
                  </Text>

                  <Text
                    style={[
                      styles.activityLabel,
                      {
                        color:
                          colors.textSecondary || '#6B7280',
                      },
                    ]}
                  >
                    {type}
                  </Text>
                </View>
              )
            )}
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={openMovementModal}
            style={[
              styles.outlineButton,
              styles.movementButton,
              {
                borderColor:
                  colors.fitnessAccent || '#6366F1',
              },
            ]}
          >
            <Ionicons
              name="add"
              size={19}
              color={colors.fitnessAccent || '#6366F1'}
            />
            <Text
              style={[
                styles.outlineButtonText,
                {
                  color:
                    colors.fitnessAccent || '#6366F1',
                },
              ]}
            >
              Log Movement
            </Text>
          </TouchableOpacity>
        </View>

        {/* Today's workout summary */}
        <View
          style={[
            styles.summaryCard,
            {
              backgroundColor:
                colors.fitnessAccent || '#6366F1',
            },
          ]}
        >
          <View style={styles.summaryTop}>
            <View>
              <Text style={styles.summaryEyebrow}>
                TODAY'S TRAINING
              </Text>

              <Text style={styles.summaryTitle}>
                {exercises.length === 0
                  ? 'Ready when you are'
                  : `${exercises.length} exercise${
                      exercises.length === 1
                        ? ''
                        : 's'
                    } planned`}
              </Text>
            </View>

            <View style={styles.summaryIcon}>
              <Ionicons
                name="barbell-outline"
                size={23}
                color="#FFFFFF"
              />
            </View>
          </View>

          <View style={styles.summaryStats}>
            <View>
              <Text style={styles.summaryStatValue}>
                {exercises.length}
              </Text>
              <Text style={styles.summaryStatLabel}>
                Exercises
              </Text>
            </View>

            <View>
              <Text style={styles.summaryStatValue}>
                {totalSets}
              </Text>
              <Text style={styles.summaryStatLabel}>
                Sets
              </Text>
            </View>

            <View>
              <Text style={styles.summaryStatValue}>
                {workoutHistory.length}
              </Text>
              <Text style={styles.summaryStatLabel}>
                Sessions logged
              </Text>
            </View>
          </View>
        </View>

        {/* Category selector */}
        <View style={styles.sectionHeaderOutside}>
          <View>
            <Text
              style={[
                styles.sectionTitle,
                {
                  color:
                    colors.textPrimary || '#111827',
                },
              ]}
            >
              Training type
            </Text>

            <Text
              style={[
                styles.sectionSubtitle,
                {
                  color:
                    colors.textSecondary ||
                    '#6B7280',
                },
              ]}
            >
              Choose what you want to work on
            </Text>
          </View>
        </View>

        <View style={styles.categoryRow}>
          {(
            Object.keys(
              EXERCISE_LIBRARY
            ) as CategoryType[]
          ).map((category) => {
            const active =
              selectedCategory === category;

            return (
              <TouchableOpacity
                key={category}
                activeOpacity={0.8}
                onPress={() => {
                  setSelectedCategory(category);
                  setSelectedBodyPart('');
                  setSelectedExerciseName('');
                }}
                style={[
                  styles.categoryButton,
                  {
                    backgroundColor: active
                      ? colors.fitnessAccent ||
                        '#6366F1'
                      : colors.cardBackground ||
                        '#FFFFFF',
                    borderColor: active
                      ? colors.fitnessAccent ||
                        '#6366F1'
                      : colors.border ||
                        '#E5E7EB',
                  },
                ]}
              >
                <Ionicons
                  name={categoryIcons[category]}
                  size={17}
                  color={
                    active
                      ? '#FFFFFF'
                      : colors.textSecondary ||
                        '#6B7280'
                  }
                />

                <Text
                  style={[
                    styles.categoryText,
                    {
                      color: active
                        ? '#FFFFFF'
                        : colors.textPrimary ||
                          '#111827',
                    },
                  ]}
                >
                  {category}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Routine */}
        <View style={styles.sectionHeaderOutside}>
          <View>
            <Text
              style={[
                styles.sectionTitle,
                {
                  color:
                    colors.textPrimary || '#111827',
                },
              ]}
            >
              Today's routine
            </Text>

            <Text
              style={[
                styles.sectionSubtitle,
                {
                  color:
                    colors.textSecondary ||
                    '#6B7280',
                },
              ]}
            >
              Build your session exercise by exercise
            </Text>
          </View>

          <View
            style={[
              styles.countPill,
              {
                backgroundColor:
                  colors.fitnessAccent
                    ? `${colors.fitnessAccent}15`
                    : '#EEF2FF',
              },
            ]}
          >
            <Text
              style={[
                styles.countPillText,
                {
                  color:
                    colors.fitnessAccent ||
                    '#6366F1',
                },
              ]}
            >
              {exercises.length}
            </Text>
          </View>
        </View>

        {exercises.length === 0 ? (
          <View
            style={[
              styles.emptyCard,
              {
                backgroundColor:
                  colors.cardBackground || '#FFFFFF',
                borderColor:
                  colors.border ||
                  '#E5E7EB',
              },
            ]}
          >
            <View
              style={[
                styles.emptyIcon,
                {
                  backgroundColor:
                    colors.fitnessAccent
                      ? `${colors.fitnessAccent}15`
                      : '#EEF2FF',
                },
              ]}
            >
              <Ionicons
                name="add-outline"
                size={28}
                color={
                  colors.fitnessAccent ||
                  '#6366F1'
                }
              />
            </View>

            <Text
              style={[
                styles.emptyTitle,
                {
                  color:
                    colors.textPrimary ||
                    '#111827',
                },
              ]}
            >
              No exercises yet
            </Text>

            <Text
              style={[
                styles.emptyText,
                {
                  color:
                    colors.textSecondary ||
                    '#6B7280',
                },
              ]}
            >
              Add exercises to build today's
              workout.
            </Text>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={openAddModal}
              style={[
                styles.primaryButton,
                {
                  backgroundColor:
                    colors.fitnessAccent ||
                    '#6366F1',
                },
              ]}
            >
              <Ionicons
                name="add"
                size={20}
                color="#FFFFFF"
              />

              <Text style={styles.primaryButtonText}>
                Add Exercise
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {exercises.map((exercise, exerciseIndex) => (
              <View
                key={exercise.id}
                style={[
                  styles.exerciseCard,
                  {
                    backgroundColor:
                      colors.cardBackground ||
                      '#FFFFFF',
                    borderColor:
                      colors.border ||
                      '#E5E7EB',
                  },
                ]}
              >
                <View style={styles.exerciseHeader}>
                  <View
                    style={[
                      styles.exerciseNumber,
                      {
                        backgroundColor:
                          colors.fitnessAccent
                            ? `${colors.fitnessAccent}15`
                            : '#EEF2FF',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.exerciseNumberText,
                        {
                          color:
                            colors.fitnessAccent ||
                            '#6366F1',
                        },
                      ]}
                    >
                      {exerciseIndex + 1}
                    </Text>
                  </View>

                  <View style={styles.exerciseInfo}>
                    <Text
                      style={[
                        styles.exerciseName,
                        {
                          color:
                            colors.textPrimary ||
                            '#111827',
                        },
                      ]}
                    >
                      {exercise.name}
                    </Text>

                    <Text
                      style={[
                        styles.exerciseMeta,
                        {
                          color:
                            colors.textSecondary ||
                            '#6B7280',
                        },
                      ]}
                    >
                      {exercise.bodyPart} ·{' '}
                      {exercise.sets.length}{' '}
                      {exercise.sets.length === 1
                        ? 'set'
                        : 'sets'}
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={() =>
                      removeExercise(
                        exercise.id
                      )
                    }
                    style={styles.iconButton}
                  >
                    <Ionicons
                      name="ellipsis-horizontal"
                      size={20}
                      color={
                        colors.textSecondary ||
                        '#6B7280'
                      }
                    />
                  </TouchableOpacity>
                </View>

                <View
                  style={[
                    styles.tableHeader,
                    {
                      borderBottomColor:
                        colors.border ||
                        '#E5E7EB',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.tableHeaderText,
                      {
                        color:
                          colors.textSecondary ||
                          '#6B7280',
                      },
                    ]}
                  >
                    SET
                  </Text>

                  <Text
                    style={[
                      styles.tableHeaderText,
                      {
                        color:
                          colors.textSecondary ||
                          '#6B7280',
                      },
                    ]}
                  >
                    REPS
                  </Text>

                  <Text
                    style={[
                      styles.tableHeaderText,
                      {
                        color:
                          colors.textSecondary ||
                          '#6B7280',
                      },
                    ]}
                  >
                    WEIGHT
                  </Text>

                  <View style={{ width: 30 }} />
                </View>

                {exercise.sets.map(
                  (set, setIndex) => (
                    <View
                      key={`${exercise.id}-${setIndex}`}
                      style={styles.setRow}
                    >
                      <View
                        style={[
                          styles.setNumber,
                          {
                            backgroundColor:
                              colors.background ||
                              '#F7F8FA',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.setNumberText,
                            {
                              color:
                                colors.textPrimary ||
                                '#111827',
                            },
                          ]}
                        >
                          {setIndex + 1}
                        </Text>
                      </View>

                      <TextInput
                        value={set.reps}
                        onChangeText={(value) =>
                          updateSet(
                            exercise.id,
                            setIndex,
                            'reps',
                            value
                          )
                        }
                        keyboardType="numeric"
                        style={[
                          styles.input,
                          {
                            color:
                              colors.textPrimary ||
                              '#111827',
                            backgroundColor:
                              colors.background ||
                              '#F7F8FA',
                            borderColor:
                              colors.border ||
                              '#E5E7EB',
                          },
                        ]}
                      />

                      <TextInput
                        value={set.weight}
                        onChangeText={(value) =>
                          updateSet(
                            exercise.id,
                            setIndex,
                            'weight',
                            value
                          )
                        }
                        keyboardType="numeric"
                        style={[
                          styles.input,
                          {
                            color:
                              colors.textPrimary ||
                              '#111827',
                            backgroundColor:
                              colors.background ||
                              '#F7F8FA',
                            borderColor:
                              colors.border ||
                              '#E5E7EB',
                          },
                        ]}
                      />

                      <TouchableOpacity
                        onPress={() =>
                          removeSet(
                            exercise.id,
                            setIndex
                          )
                        }
                        style={styles.removeSetButton}
                      >
                        <Ionicons
                          name="close"
                          size={17}
                          color={
                            colors.textSecondary ||
                            '#6B7280'
                          }
                        />
                      </TouchableOpacity>
                    </View>
                  )
                )}

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() =>
                    addSet(exercise.id)
                  }
                  style={[
                    styles.addSetButton,
                    {
                      borderColor:
                        colors.border ||
                        '#E5E7EB',
                    },
                  ]}
                >
                  <Ionicons
                    name="add"
                    size={18}
                    color={
                      colors.fitnessAccent ||
                      '#6366F1'
                    }
                  />

                  <Text
                    style={[
                      styles.addSetText,
                      {
                        color:
                          colors.fitnessAccent ||
                          '#6366F1',
                      },
                    ]}
                  >
                    Add Set
                  </Text>
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={openAddModal}
              style={[
                styles.outlineButton,
                {
                  borderColor:
                    colors.fitnessAccent ||
                    '#6366F1',
                },
              ]}
            >
              <Ionicons
                name="add"
                size={20}
                color={
                  colors.fitnessAccent ||
                  '#6366F1'
                }
              />

              <Text
                style={[
                  styles.outlineButtonText,
                  {
                    color:
                      colors.fitnessAccent ||
                      '#6366F1',
                  },
                ]}
              >
                Add Another Exercise
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={logCompletedWorkout}
              style={[
                styles.primaryButton,
                styles.completeButton,
                {
                  backgroundColor:
                    colors.fitnessAccent ||
                    '#6366F1',
                },
              ]}
            >
              <Ionicons
                name="checkmark-circle-outline"
                size={21}
                color="#FFFFFF"
              />

              <Text style={styles.primaryButtonText}>
                Complete Workout
              </Text>
            </TouchableOpacity>
          </>
        )}

        {/* Recent sessions */}
        {workoutHistory.length > 0 && (
          <>
            <View
              style={[
                styles.sectionHeaderOutside,
                { marginTop: 10 },
              ]}
            >
              <View>
                <Text
                  style={[
                    styles.sectionTitle,
                    {
                      color:
                        colors.textPrimary ||
                        '#111827',
                    },
                  ]}
                >
                  Recent sessions
                </Text>

                <Text
                  style={[
                    styles.sectionSubtitle,
                    {
                      color:
                        colors.textSecondary ||
                        '#6B7280',
                    },
                  ]}
                >
                  Your latest completed workouts
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.card,
                {
                  backgroundColor:
                    colors.cardBackground ||
                    '#FFFFFF',
                },
              ]}
            >
              {workoutHistory
                .slice(0, 3)
                .map((workout, index) => (
                  <View
                    key={`${workout.date}-${index}`}
                    style={[
                      styles.historyRow,
                      index <
                      Math.min(
                        workoutHistory.length,
                        3
                      ) -
                        1 && {
                        borderBottomWidth: 1,
                        borderBottomColor:
                          colors.border ||
                          '#E5E7EB',
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.historyIcon,
                        {
                          backgroundColor:
                            colors.fitnessAccent
                              ? `${colors.fitnessAccent}15`
                              : '#EEF2FF',
                        },
                      ]}
                    >
                      <Ionicons
                        name="checkmark"
                        size={18}
                        color={
                          colors.fitnessAccent ||
                          '#6366F1'
                        }
                      />
                    </View>

                    <View
                      style={
                        styles.historyInfo
                      }
                    >
                      <Text
                        style={[
                          styles.historyTitle,
                          {
                            color:
                              colors.textPrimary ||
                              '#111827',
                          },
                        ]}
                      >
                        Workout completed
                      </Text>

                      <Text
                        style={[
                          styles.historyMeta,
                          {
                            color:
                              colors.textSecondary ||
                              '#6B7280',
                          },
                        ]}
                      >
                        {new Date(
                          workout.date
                        ).toLocaleDateString(
                          [],
                          {
                            month: 'short',
                            day: 'numeric',
                          }
                        )}
                        {' · '}
                        {
                          workout.exercises
                            ?.length || 0
                        }{' '}
                        exercises
                      </Text>
                    </View>
                  </View>
                ))}
            </View>
          </>
        )}
      </ScrollView>

      {/* Log Movement Modal */}
      <Modal
        visible={movementModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() =>
          setMovementModalVisible(false)
        }
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View
            style={[
              styles.modalContainer,
              {
                backgroundColor:
                  colors.cardBackground || '#FFFFFF',
              },
            ]}
          >
            <View style={styles.modalHandle} />

            <View style={styles.modalHeader}>
              <View>
                <Text
                  style={[
                    styles.modalTitle,
                    {
                      color:
                        colors.textPrimary || '#111827',
                    },
                  ]}
                >
                  Log Movement
                </Text>
                <Text
                  style={[
                    styles.modalSubtitle,
                    {
                      color:
                        colors.textSecondary || '#6B7280',
                    },
                  ]}
                >
                  Add today's walking, jogging or running
                </Text>
              </View>

              <TouchableOpacity
                onPress={() =>
                  setMovementModalVisible(false)
                }
                style={[
                  styles.modalClose,
                  {
                    backgroundColor:
                      colors.background || '#F3F4F6',
                  },
                ]}
              >
                <Ionicons
                  name="close"
                  size={22}
                  color={
                    colors.textSecondary || '#6B7280'
                  }
                />
              </TouchableOpacity>
            </View>

            <Text
              style={[
                styles.fieldLabel,
                {
                  color:
                    colors.textPrimary || '#111827',
                },
              ]}
            >
              Activity type
            </Text>

            <View style={styles.movementTypeRow}>
              {(['Walking', 'Jogging', 'Running'] as MovementType[]).map(
                (type) => {
                  const active = movementType === type;

                  return (
                    <TouchableOpacity
                      key={type}
                      activeOpacity={0.8}
                      onPress={() => setMovementType(type)}
                      style={[
                        styles.movementTypeButton,
                        {
                          backgroundColor: active
                            ? colors.fitnessAccent || '#6366F1'
                            : colors.background || '#F7F8FA',
                          borderColor: active
                            ? colors.fitnessAccent || '#6366F1'
                            : colors.border || '#E5E7EB',
                        },
                      ]}
                    >
                      <Ionicons
                        name={movementIcons[type]}
                        size={18}
                        color={
                          active
                            ? '#FFFFFF'
                            : colors.textSecondary || '#6B7280'
                        }
                      />
                      <Text
                        style={[
                          styles.movementTypeText,
                          {
                            color: active
                              ? '#FFFFFF'
                              : colors.textPrimary || '#111827',
                          },
                        ]}
                      >
                        {type}
                      </Text>
                    </TouchableOpacity>
                  );
                }
              )}
            </View>

            <Text
              style={[
                styles.fieldLabel,
                {
                  color:
                    colors.textPrimary || '#111827',
                },
              ]}
            >
              Steps
            </Text>
            <TextInput
              value={movementSteps}
              onChangeText={setMovementSteps}
              keyboardType="number-pad"
              placeholder="e.g. 3200"
              placeholderTextColor={
                colors.textSecondary || '#9CA3AF'
              }
              style={[
                styles.modalInput,
                {
                  color:
                    colors.textPrimary || '#111827',
                  backgroundColor:
                    colors.background || '#F7F8FA',
                  borderColor:
                    colors.border || '#E5E7EB',
                },
              ]}
            />

            <View style={styles.twoColumn}>
              <View style={styles.column}>
                <Text
                  style={[
                    styles.fieldLabel,
                    {
                      color:
                        colors.textPrimary || '#111827',
                    },
                  ]}
                >
                  Distance (km)
                </Text>
                <TextInput
                  value={movementDistance}
                  onChangeText={setMovementDistance}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 2.4"
                  placeholderTextColor={
                    colors.textSecondary || '#9CA3AF'
                  }
                  style={[
                    styles.modalInput,
                    {
                      color:
                        colors.textPrimary || '#111827',
                      backgroundColor:
                        colors.background || '#F7F8FA',
                      borderColor:
                        colors.border || '#E5E7EB',
                    },
                  ]}
                />
              </View>

              <View style={styles.column}>
                <Text
                  style={[
                    styles.fieldLabel,
                    {
                      color:
                        colors.textPrimary || '#111827',
                    },
                  ]}
                >
                  Active minutes
                </Text>
                <TextInput
                  value={movementDuration}
                  onChangeText={setMovementDuration}
                  keyboardType="number-pad"
                  placeholder="e.g. 30"
                  placeholderTextColor={
                    colors.textSecondary || '#9CA3AF'
                  }
                  style={[
                    styles.modalInput,
                    {
                      color:
                        colors.textPrimary || '#111827',
                      backgroundColor:
                        colors.background || '#F7F8FA',
                      borderColor:
                        colors.border || '#E5E7EB',
                    },
                  ]}
                />
              </View>
            </View>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={logMovement}
              style={[
                styles.primaryButton,
                {
                  backgroundColor:
                    colors.fitnessAccent || '#6366F1',
                },
              ]}
            >
              <Ionicons
                name="checkmark"
                size={20}
                color="#FFFFFF"
              />
              <Text style={styles.primaryButtonText}>
                Save Movement
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Exercise Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() =>
          setModalVisible(false)
        }
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View
            style={[
              styles.modalContainer,
              {
                backgroundColor:
                  colors.cardBackground || '#FFFFFF',
              },
            ]}
          >
            <View style={styles.modalHandle} />

            <View style={styles.modalHeader}>
              <View>
                <Text
                  style={[
                    styles.modalTitle,
                    {
                      color:
                        colors.textPrimary ||
                        '#111827',
                    },
                  ]}
                >
                  Add Exercise
                </Text>

                <Text
                  style={[
                    styles.modalSubtitle,
                    {
                      color:
                        colors.textSecondary ||
                        '#6B7280',
                    },
                  ]}
                >
                  Build your {selectedCategory.toLowerCase()}{' '}
                  session
                </Text>
              </View>

              <TouchableOpacity
                onPress={() =>
                  setModalVisible(false)
                }
                style={styles.modalClose}
              >
                <Ionicons
                  name="close"
                  size={22}
                  color={
                    colors.textSecondary ||
                    '#6B7280'
                  }
                />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            >
              <Text
                style={[
                  styles.fieldLabel,
                  {
                    color:
                      colors.textPrimary ||
                      '#111827',
                  },
                ]}
              >
                Muscle / focus area
              </Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={
                  styles.horizontalOptions
                }
              >
                {bodyParts.map((bodyPart) => {
                  const active =
                    selectedBodyPart ===
                    bodyPart;

                  return (
                    <TouchableOpacity
                      key={bodyPart}
                      onPress={() => {
                        setSelectedBodyPart(
                          bodyPart
                        );
                        setSelectedExerciseName(
                          ''
                        );
                      }}
                      style={[
                        styles.optionChip,
                        {
                          backgroundColor:
                            active
                              ? colors.fitnessAccent ||
                                '#6366F1'
                              : colors.background ||
                                '#F7F8FA',
                          borderColor:
                            active
                              ? colors.fitnessAccent ||
                                '#6366F1'
                              : colors.border ||
                                '#E5E7EB',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.optionChipText,
                          {
                            color: active
                              ? '#FFFFFF'
                              : colors.textPrimary ||
                                '#111827',
                          },
                        ]}
                      >
                        {bodyPart}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {selectedBodyPart && (
                <>
                  <Text
                    style={[
                      styles.fieldLabel,
                      {
                        color:
                          colors.textPrimary ||
                          '#111827',
                      },
                    ]}
                  >
                    Exercise
                  </Text>

                  <View style={styles.exerciseOptions}>
                    {availableExercises.map(
                      (exercise) => {
                        const active =
                          selectedExerciseName ===
                          exercise;

                        return (
                          <TouchableOpacity
                            key={exercise}
                            onPress={() => {
                              setSelectedExerciseName(
                                exercise
                              );
                              setCustomExerciseName(
                                ''
                              );
                            }}
                            style={[
                              styles.exerciseOption,
                              {
                                backgroundColor:
                                  active
                                    ? colors.fitnessAccent
                                      ? `${colors.fitnessAccent}12`
                                      : '#EEF2FF'
                                    : colors.background ||
                                      '#F7F8FA',
                                borderColor:
                                  active
                                    ? colors.fitnessAccent ||
                                      '#6366F1'
                                    : colors.border ||
                                      '#E5E7EB',
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.exerciseOptionText,
                                {
                                  color:
                                    colors.textPrimary ||
                                    '#111827',
                                },
                              ]}
                            >
                              {exercise}
                            </Text>

                            {active && (
                              <Ionicons
                                name="checkmark-circle"
                                size={20}
                                color={
                                  colors.fitnessAccent ||
                                  '#6366F1'
                                }
                              />
                            )}
                          </TouchableOpacity>
                        );
                      }
                    )}
                  </View>
                </>
              )}

              <Text
                style={[
                  styles.fieldLabel,
                  {
                    color:
                      colors.textPrimary ||
                      '#111827',
                  },
                ]}
              >
                Or enter a custom exercise
              </Text>

              <TextInput
                value={customExerciseName}
                onChangeText={(value) => {
                  setCustomExerciseName(value);
                  if (value.trim()) {
                    setSelectedExerciseName('');
                  }
                }}
                placeholder="Exercise name"
                placeholderTextColor={
                  colors.textSecondary ||
                  '#9CA3AF'
                }
                style={[
                  styles.modalInput,
                  {
                    color:
                      colors.textPrimary ||
                      '#111827',
                    backgroundColor:
                      colors.background ||
                      '#F7F8FA',
                    borderColor:
                      colors.border ||
                      '#E5E7EB',
                  },
                ]}
              />

              <View style={styles.twoColumn}>
                <View style={styles.column}>
                  <Text
                    style={[
                      styles.fieldLabel,
                      {
                        color:
                          colors.textPrimary ||
                          '#111827',
                      },
                    ]}
                  >
                    Starting reps
                  </Text>

                  <TextInput
                    value={initialReps}
                    onChangeText={
                      setInitialReps
                    }
                    keyboardType="numeric"
                    style={[
                      styles.modalInput,
                      {
                        color:
                          colors.textPrimary ||
                          '#111827',
                        backgroundColor:
                          colors.background ||
                          '#F7F8FA',
                        borderColor:
                          colors.border ||
                          '#E5E7EB',
                      },
                    ]}
                  />
                </View>

                <View style={styles.column}>
                  <Text
                    style={[
                      styles.fieldLabel,
                      {
                        color:
                          colors.textPrimary ||
                          '#111827',
                      },
                    ]}
                  >
                    Starting weight
                  </Text>

                  <TextInput
                    value={initialWeight}
                    onChangeText={
                      setInitialWeight
                    }
                    keyboardType="numeric"
                    style={[
                      styles.modalInput,
                      {
                        color:
                          colors.textPrimary ||
                          '#111827',
                        backgroundColor:
                          colors.background ||
                          '#F7F8FA',
                        borderColor:
                          colors.border ||
                          '#E5E7EB',
                      },
                    ]}
                  />
                </View>
              </View>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleAddExercise}
                style={[
                  styles.primaryButton,
                  {
                    backgroundColor:
                      colors.fitnessAccent ||
                      '#6366F1',
                  },
                ]}
              >
                <Ionicons
                  name="add"
                  size={21}
                  color="#FFFFFF"
                />

                <Text
                  style={styles.primaryButtonText}
                >
                  Add to Workout
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },

  container: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 18,
  },

  fixedHeader: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 10,
    elevation: 3,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  title: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.6,
  },

  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    marginTop: 4,
  },

  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },

  card: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    marginBottom: 0,
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
  },

  sectionHeaderOutside: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 5,
    marginBottom: 12,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
  },

  sectionSubtitle: {
    fontSize: 12.5,
    marginTop: 4,
    lineHeight: 17,
  },

  stepHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },

  stepValue: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.4,
  },

  stepGoal: {
    fontSize: 11.5,
    marginTop: 2,
  },

  stepPercent: {
    fontSize: 15,
    fontWeight: '800',
  },

  progressTrack: {
    height: 7,
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 13,
    marginBottom: 18,
  },

  progressFill: {
    height: '100%',
    borderRadius: 999,
  },

  movementStats: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 16,
  },

  movementStat: {
    flex: 1,
  },

  movementStatValue: {
    fontSize: 17,
    fontWeight: '800',
  },

  movementStatLabel: {
    fontSize: 11,
    marginTop: 3,
  },

  activityBreakdown: {
    flexDirection: 'row',
    gap: 8,
  },

  activityItem: {
    flex: 1,
    borderRadius: 13,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
  },

  activityValue: {
    fontSize: 12.5,
    fontWeight: '800',
    marginTop: 7,
  },

  activityLabel: {
    fontSize: 9.5,
    marginTop: 2,
  },

  movementButton: {
    marginTop: 16,
    marginBottom: 0,
  },

  movementTypeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18,
  },

  movementTypeButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 13,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },

  movementTypeText: {
    fontSize: 11,
    fontWeight: '700',
  },

  summaryCard: {
    borderRadius: 18,
    padding: 19,
    marginBottom: 22,
  },

  summaryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  summaryEyebrow: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },

  summaryTitle: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '800',
    marginTop: 5,
  },

  summaryIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  summaryStats: {
    flexDirection: 'row',
    marginTop: 20,
    gap: 32,
  },

  summaryStatValue: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },

  summaryStatLabel: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 11,
    marginTop: 2,
  },

  categoryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },

  categoryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },

  categoryText: {
    fontSize: 12,
    fontWeight: '700',
  },

  countPill: {
    minWidth: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },

  countPillText: {
    fontSize: 13,
    fontWeight: '800',
  },

  emptyCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 28,
    alignItems: 'center',
    marginBottom: 18,
  },

  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },

  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
  },

  emptyText: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 5,
    marginBottom: 20,
  },

  exerciseCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
  },

  exerciseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },

  exerciseNumber: {
    width: 38,
    height: 38,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },

  exerciseNumberText: {
    fontSize: 15,
    fontWeight: '800',
  },

  exerciseInfo: {
    flex: 1,
    marginLeft: 11,
  },

  exerciseName: {
    fontSize: 16,
    fontWeight: '800',
  },

  exerciseMeta: {
    fontSize: 11.5,
    marginTop: 3,
  },

  iconButton: {
    width: 34,
    height: 34,
    justifyContent: 'center',
    alignItems: 'center',
  },

  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
  },

  tableHeaderText: {
    flex: 1,
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 9,
  },

  setNumber: {
    width: 34,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },

  setNumberText: {
    fontSize: 13,
    fontWeight: '700',
  },

  input: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontSize: 13,
    textAlign: 'center',
  },

  removeSetButton: {
    width: 30,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },

  addSetButton: {
    height: 42,
    borderRadius: 11,
    borderWidth: 1,
    borderStyle: 'dashed',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
    marginTop: 13,
  },

  addSetText: {
    fontSize: 12,
    fontWeight: '700',
  },

  primaryButton: {
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 13,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 7,
  },

  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  outlineButton: {
    minHeight: 48,
    borderRadius: 13,
    borderWidth: 1.5,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 7,
    marginBottom: 10,
  },

  outlineButtonText: {
    fontSize: 14,
    fontWeight: '800',
  },

  completeButton: {
    marginBottom: 20,
  },

  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },

  historyIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 11,
  },

  historyInfo: {
    flex: 1,
  },

  historyTitle: {
    fontSize: 13.5,
    fontWeight: '700',
  },

  historyMeta: {
    fontSize: 11.5,
    marginTop: 3,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },

  modalContainer: {
    maxHeight: '90%',
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 30,
  },

  modalHandle: {
    width: 42,
    height: 4,
    borderRadius: 3,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginBottom: 17,
  },

  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },

  modalTitle: {
    fontSize: 21,
    fontWeight: '800',
  },

  modalSubtitle: {
    fontSize: 12.5,
    marginTop: 4,
  },

  modalClose: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },

  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 9,
    marginTop: 4,
  },

  horizontalOptions: {
    gap: 8,
    paddingBottom: 5,
  },

  optionChip: {
    paddingHorizontal: 14,
    minHeight: 38,
    borderRadius: 11,
    borderWidth: 1,
    justifyContent: 'center',
  },

  optionChipText: {
    fontSize: 12,
    fontWeight: '700',
  },

  exerciseOptions: {
    gap: 8,
    marginBottom: 15,
  },

  exerciseOption: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  exerciseOptionText: {
    fontSize: 13,
    fontWeight: '600',
  },

  modalInput: {
    height: 47,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 13,
    fontSize: 13,
    marginBottom: 15,
  },

  twoColumn: {
    flexDirection: 'row',
    gap: 10,
  },

  column: {
    flex: 1,
  },
});