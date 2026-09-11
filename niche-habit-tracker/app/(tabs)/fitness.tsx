import React, { useState, useCallback } from 'react';
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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/context/ThemeContext';
import { LightTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/constants/colors';
import { STORAGE_KEY_BIOMETRICS } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/src/fitnessStorage';

export const STORAGE_KEY_WORKOUT_HISTORY = '@activity_workout_history';

type CategoryType = 'Gym' | 'Foundational' | 'Stretching';

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

const EXERCISE_LIBRARY: Record<CategoryType, Record<string, string[]>> = {
  Gym: {
    Chest: ['Bench Press', 'Incline Dumbbell Press', 'Cable Flyes', 'Chest Press Machine'],
    Back: ['Lat Pulldown', 'Seated Cable Row', 'Barbell Row', 'Deadlift'],
    Shoulders: ['Overhead Dumbbell Press', 'Lateral Raises', 'Face Pulls'],
    Arms: ['Bicep Curls', 'Tricep Rope Pushdown', 'Hammer Curls'],
    Legs: ['Barbell Squat', 'Leg Press', 'Hamstring Curl', 'Calf Raises'],
    'Gym Cardio': ['Treadmill Run', 'Stairmaster', 'Elliptical', 'Rowing Machine'],
  },
  Foundational: {
    'Upper Body': ['Push-ups', 'Pike Push-ups', 'Dips', 'Bodyweight Rows'],
    'Lower Body': ['Bodyweight Squats', 'Lunges', 'Bulgarian Split Squats', 'Glute Bridges'],
    Core: ['Plank', 'Hanging Leg Raises', 'Russian Twists', 'Ab Wheel Rollouts'],
    'Bodyweight Cardio': ['Jumping Jacks', 'Burpees', 'Mountain Climbers', 'High Knees'],
  },
  Stretching: {
    'Full Body Mobility': ["World's Greatest Stretch", 'Cat-Cow', 'Thoracic Rotations'],
    'Upper Stretches': ['Doorway Chest Stretch', 'Cross-Body Shoulder Stretch', 'Tricep Stretch'],
    'Lower Stretches': ['Hamstring Stretch', 'Pigeon Pose', 'Couch Stretch (Quads)'],
    'Dynamic Warm-Up': ['Arm Circles', 'Leg Swings', 'Hip Openers'],
  },
};

export default function FitnessScreen() {
  const { theme = LightTheme } = useTheme() || {};

  const [currentWeight, setCurrentWeight] = useState('168');
  const [targetWeight, setTargetWeight] = useState('155');
  const [heightCm, setHeightCm] = useState('175');
  const [unit, setUnit] = useState<'lbs' | 'kg'>('lbs');

  const [selectedCategory, setSelectedCategory] = useState<CategoryType>('Gym');
  const [exercises, setExercises] = useState<ExerciseItem[]>([]);

  const [modalVisible, setModalVisible] = useState(false);
  const [selectedBodyPart, setSelectedBodyPart] = useState<string>('');
  const [selectedExerciseName, setSelectedExerciseName] = useState<string>('');
  const [customExerciseName, setCustomExerciseName] = useState<string>('');
  
  const [initialReps, setInitialReps] = useState('10');
  const [initialWeight, setInitialWeight] = useState('135');

  useFocusEffect(
    useCallback(() => {
      loadBiometrics();
    }, [])
  );

  const loadBiometrics = async () => {
    try {
      const savedBio = await AsyncStorage.getItem(STORAGE_KEY_BIOMETRICS);
      if (savedBio) {
        const parsed = JSON.parse(savedBio);
        if (parsed.currentWeight || parsed.weightInput) {
          setCurrentWeight(parsed.currentWeight || parsed.weightInput);
        }
        if (parsed.targetWeight || parsed.targetWeightInput) {
          setTargetWeight(parsed.targetWeight || parsed.targetWeightInput);
        }
        if (parsed.height || parsed.heightCm) {
          setHeightCm(parsed.height || parsed.heightCm);
        }
        if (parsed.weightUnit || parsed.unit) {
          setUnit(parsed.weightUnit || parsed.unit);
        }
      }
    } catch (e) {
      console.log('Error loading biometrics on fitness tab:', e);
    }
  };

  const calcBMI = (wVal: string, hVal: string, uVal: string) => {
    const w = parseFloat(wVal);
    const h = parseFloat(hVal) / 100;
    if (!w || !h) return 'N/A';
    const weightKg = uVal === 'lbs' ? w * 0.453592 : w;
    const bmi = weightKg / (h * h);
    return bmi.toFixed(1);
  };

  const currentBMI = calcBMI(currentWeight, heightCm, unit);
  const goalBMI = calcBMI(targetWeight, heightCm, unit);

  const openAddModal = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const defaultBodyParts = Object.keys(EXERCISE_LIBRARY[selectedCategory]);
    setSelectedBodyPart(defaultBodyParts[0] || '');
    setSelectedExerciseName(EXERCISE_LIBRARY[selectedCategory][defaultBodyParts[0]]?.[0] || '');
    setCustomExerciseName('');
    setInitialReps('10');
    setInitialWeight(selectedCategory === 'Gym' ? '135' : '0');
    setModalVisible(true);
  };

  const handleAddExercise = () => {
    const finalName = customExerciseName.trim() || selectedExerciseName;
    if (!finalName) {
      Alert.alert('Selection Error', 'Please select or enter an exercise name.');
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const newEx: ExerciseItem = {
      id: Date.now().toString(),
      name: finalName,
      category: selectedCategory,
      bodyPart: selectedBodyPart,
      sets: [{ reps: initialReps || '10', weight: initialWeight || '0' }],
    };

    setExercises([...exercises, newEx]);
    setModalVisible(false);
  };

  const addSet = (exId: string) => {
    Haptics.selectionAsync();
    setExercises(
      exercises.map((item) => {
        if (item.id === exId) {
          const lastSet = item.sets[item.sets.length - 1] || { reps: '10', weight: '0' };
          return { ...item, sets: [...item.sets, { reps: lastSet.reps, weight: lastSet.weight }] };
        }
        return item;
      })
    );
  };

  const updateSet = (exId: string, setIndex: number, field: 'reps' | 'weight', value: string) => {
    setExercises(
      exercises.map((ex) => {
        if (ex.id === exId) {
          const updatedSets = [...ex.sets];
          updatedSets[setIndex] = { ...updatedSets[setIndex], [field]: value };
          return { ...ex, sets: updatedSets };
        }
        return ex;
      })
    );
  };

  const removeSet = (exId: string, setIndex: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExercises(
      exercises.map((ex) => {
        if (ex.id === exId && ex.sets.length > 1) {
          return { ...ex, sets: ex.sets.filter((_, idx) => idx !== setIndex) };
        }
        return ex;
      })
    );
  };

  const logCompletedWorkout = async () => {
    const filtered = exercises.filter((ex) => ex.category === selectedCategory);
    if (filtered.length === 0) {
      Alert.alert('Empty Session', 'Add at least one exercise before logging completion.');
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const newLogEntry = {
      id: Date.now().toString(),
      category: selectedCategory,
      completedAt: new Date().toISOString(),
      exercises: filtered,
    };

    try {
      const existingHistory = await AsyncStorage.getItem(STORAGE_KEY_WORKOUT_HISTORY);
      const historyArr = existingHistory ? JSON.parse(existingHistory) : [];
      historyArr.unshift(newLogEntry);
      await AsyncStorage.setItem(STORAGE_KEY_WORKOUT_HISTORY, JSON.stringify(historyArr));

      // Clear completed routine from active list
      setExercises(exercises.filter((ex) => ex.category !== selectedCategory));
      Alert.alert('Workout Logged', `${selectedCategory} session has been logged to your activity history.`);
    } catch (e) {
      console.log('Error logging workout history:', e);
    }
  };

  const filteredExercises = exercises.filter((ex) => ex.category === selectedCategory);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Biometrics Summary Header */}
        <View style={[styles.biometricsCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
          <Text style={[styles.cardHeader, { color: theme.fitnessAccent }]}>BIOMETRICS SUMMARY</Text>
          <View style={styles.metricsGrid}>
            <View style={styles.metricBox}>
              <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Current Weight</Text>
              <Text style={[styles.metricValue, { color: theme.textPrimary }]}>{currentWeight} {unit}</Text>
              <Text style={[styles.metricSub, { color: theme.textSecondary }]}>BMI: {currentBMI}</Text>
            </View>

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            <View style={styles.metricBox}>
              <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Goal Weight</Text>
              <Text style={[styles.metricValue, { color: theme.fitnessAccent }]}>{targetWeight} {unit}</Text>
              <Text style={[styles.metricSub, { color: theme.textSecondary }]}>Proj. BMI: {goalBMI}</Text>
            </View>
          </View>
        </View>

        {/* Category Selector */}
        <View style={styles.categoryRow}>
          {(['Gym', 'Foundational', 'Stretching'] as CategoryType[]).map((cat) => {
            const isActive = selectedCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.categoryTab,
                  { backgroundColor: isActive ? theme.fitnessAccent : theme.isDark ? '#1E293B' : '#E2E8F0' },
                ]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSelectedCategory(cat);
                }}
              >
                <Text style={[styles.categoryTabText, { color: isActive ? '#FFFFFF' : theme.textPrimary }]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Action Header */}
        <View style={styles.actionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
            {selectedCategory} Routine ({filteredExercises.length})
          </Text>
          <TouchableOpacity style={[styles.addBtn, { backgroundColor: theme.fitnessAccent }]} onPress={openAddModal}>
            <Text style={styles.addBtnText}>+ Add Exercise</Text>
          </TouchableOpacity>
        </View>

        {filteredExercises.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
            <Ionicons name="barbell-outline" size={28} color={theme.textSecondary} style={{ marginBottom: 6 }} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              No exercises logged for {selectedCategory}.
            </Text>
            <Text style={[styles.emptySubText, { color: theme.textSecondary }]}>
              Select target body parts to configure your session.
            </Text>
          </View>
        ) : (
          <>
            {filteredExercises.map((ex) => (
              <View key={ex.id} style={[styles.exerciseCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
                <View style={styles.exerciseHeader}>
                  <View>
                    <Text style={[styles.exerciseTitle, { color: theme.textPrimary }]}>{ex.name}</Text>
                    <Text style={[styles.bodyPartBadge, { color: theme.fitnessAccent }]}>{ex.bodyPart}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setExercises(exercises.filter((i) => i.id !== ex.id))}>
                    <Text style={{ color: '#EF4444', fontWeight: '700', fontSize: 12 }}>Remove</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.setRowHeader}>
                  <Text style={[styles.setHeaderLabel, { color: theme.textSecondary, flex: 0.8 }]}>SET</Text>
                  <Text style={[styles.setHeaderLabel, { color: theme.textSecondary, flex: 1.2 }]}>REPS</Text>
                  <Text style={[styles.setHeaderLabel, { color: theme.textSecondary, flex: 1.2 }]}>WEIGHT ({unit})</Text>
                  <View style={{ width: 24 }} />
                </View>

                {ex.sets.map((s, idx) => (
                  <View key={idx} style={styles.setRow}>
                    <Text style={[styles.setNumber, { color: theme.textPrimary, flex: 0.8 }]}>Set {idx + 1}</Text>
                    
                    <View style={{ flex: 1.2, paddingRight: 6 }}>
                      <TextInput
                        style={[styles.inlineInput, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
                        keyboardType="numeric"
                        value={s.reps}
                        onChangeText={(val) => updateSet(ex.id, idx, 'reps', val)}
                      />
                    </View>

                    <View style={{ flex: 1.2, paddingRight: 6 }}>
                      <TextInput
                        style={[styles.inlineInput, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
                        keyboardType="numeric"
                        value={s.weight}
                        onChangeText={(val) => updateSet(ex.id, idx, 'weight', val)}
                      />
                    </View>

                    {ex.sets.length > 1 ? (
                      <TouchableOpacity style={{ width: 24, alignItems: 'center' }} onPress={() => removeSet(ex.id, idx)}>
                        <Text style={{ color: '#EF4444', fontWeight: 'bold' }}>✕</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={{ width: 24 }} />
                    )}
                  </View>
                ))}

                <TouchableOpacity style={styles.addSetBtn} onPress={() => addSet(ex.id)}>
                  <Text style={{ color: theme.fitnessAccent, fontWeight: '700', fontSize: 12 }}>+ Add Set</Text>
                </TouchableOpacity>
              </View>
            ))}

            {/* Complete & Log Session Button */}
            <TouchableOpacity
              style={[styles.completeSessionBtn, { backgroundColor: theme.fitnessAccent }]}
              onPress={logCompletedWorkout}
            >
              <Ionicons name="checkmark-done-circle-outline" size={20} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.completeSessionBtnText}>Log Completed {selectedCategory} Session</Text>
            </TouchableOpacity>
          </>
        )}

      </ScrollView>

      {/* Modal Picker */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.cardBackground }]}>
            <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>
              Add {selectedCategory} Exercise
            </Text>

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>1. Target Area / Body Part</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {Object.keys(EXERCISE_LIBRARY[selectedCategory]).map((part) => (
                <TouchableOpacity
                  key={part}
                  style={[
                    styles.chipBtn,
                    { backgroundColor: selectedBodyPart === part ? theme.fitnessAccent : theme.isDark ? '#2A2A2A' : '#E2E8F0' },
                  ]}
                  onPress={() => {
                    setSelectedBodyPart(part);
                    setSelectedExerciseName(EXERCISE_LIBRARY[selectedCategory][part]?.[0] || '');
                  }}
                >
                  <Text style={{ color: selectedBodyPart === part ? '#FFF' : theme.textPrimary, fontWeight: '700', fontSize: 12 }}>
                    {part}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>2. Select Movement</Text>
            <ScrollView style={{ maxHeight: 110, marginBottom: 12 }}>
              {(EXERCISE_LIBRARY[selectedCategory][selectedBodyPart] || []).map((exName) => (
                <TouchableOpacity
                  key={exName}
                  style={[
                    styles.exerciseOption,
                    { backgroundColor: selectedExerciseName === exName ? (theme.isDark ? '#334155' : '#E0F2FE') : 'transparent' },
                  ]}
                  onPress={() => {
                    setSelectedExerciseName(exName);
                    setCustomExerciseName('');
                  }}
                >
                  <Text style={{ color: theme.textPrimary, fontWeight: selectedExerciseName === exName ? 'bold' : 'normal' }}>
                    {selectedExerciseName === exName ? '✓ ' : ''}{exName}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Or Custom Movement</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
              placeholder="e.g. Bulgarian Split Squat"
              placeholderTextColor={theme.textSecondary}
              value={customExerciseName}
              onChangeText={setCustomExerciseName}
            />

            <View style={styles.gridRow}>
              <View style={{ width: '48%' }}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Starting Reps</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
                  keyboardType="numeric"
                  value={initialReps}
                  onChangeText={setInitialReps}
                />
              </View>
              <View style={{ width: '48%' }}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Starting Weight ({unit})</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
                  keyboardType="numeric"
                  value={initialWeight}
                  onChangeText={setInitialWeight}
                />
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: theme.border }]} onPress={() => setModalVisible(false)}>
                <Text style={{ color: theme.textPrimary, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: theme.fitnessAccent }]} onPress={handleAddExercise}>
                <Text style={{ color: '#FFF', fontWeight: '700' }}>Add to Routine</Text>
              </TouchableOpacity>
            </View>

          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20 },
  biometricsCard: { padding: 16, borderRadius: 14, borderWidth: 1, marginBottom: 16 },
  cardHeader: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 10 },
  metricsGrid: { flexDirection: 'row', alignItems: 'center' },
  metricBox: { flex: 1, alignItems: 'center' },
  metricLabel: { fontSize: 11, fontWeight: '600', marginBottom: 2 },
  metricValue: { fontSize: 20, fontWeight: '800' },
  metricSub: { fontSize: 11, marginTop: 2 },
  divider: { width: 1, height: '80%' },
  categoryRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  categoryTab: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  categoryTabText: { fontWeight: '700', fontSize: 12 },
  actionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  addBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  addBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
  emptyCard: { padding: 24, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  emptyText: { fontWeight: '700', fontSize: 14, marginBottom: 2 },
  emptySubText: { fontSize: 12 },
  exerciseCard: { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  exerciseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  exerciseTitle: { fontSize: 15, fontWeight: '700' },
  bodyPartBadge: { fontSize: 11, fontWeight: '600' },
  setRowHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  setHeaderLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  setRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  setNumber: { fontSize: 12, fontWeight: '700' },
  inlineInput: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  addSetBtn: { marginTop: 6, alignItems: 'flex-start' },
  completeSessionBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 14, borderRadius: 10, marginTop: 8 },
  completeSessionBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  gridRow: { flexDirection: 'row', justifyContent: 'space-between' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { padding: 20, borderRadius: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 14 },
  inputLabel: { fontSize: 11, fontWeight: '700', marginBottom: 4 },
  chipBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, marginRight: 8 },
  exerciseOption: { padding: 8, borderRadius: 6, marginBottom: 2 },
  modalInput: { padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 10 },
  modalActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 8 },
  modalBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
});