import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/context/ThemeContext';

export interface Exercise {
  id: string;
  name: string;
  sets: string;
  reps: string;
  weightLoad?: string;
  distance?: string;
}

export interface DayRoutine {
  [day: string]: Exercise[];
}

const STORAGE_KEY_ROUTINES = '@fitness_weekly_routines';
const STORAGE_KEY_BIOMETRICS = '@fitness_user_biometrics';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function FitnessScreen() {
  const { theme } = useTheme();

  // Day Selection & Routine State
  const [selectedDay, setSelectedDay] = useState<string>('Mon');
  const [routines, setRoutines] = useState<DayRoutine>({
    Mon: [], Tue: [], Wed: [], Thu: [], Fri: [], Sat: [], Sun: [],
  });

  // Biometrics State & Unit Preference
  const [unit, setUnit] = useState<'lbs' | 'kg'>('lbs');
  const [weightInput, setWeightInput] = useState('168');
  const [heightCm, setHeightCm] = useState('175');
  const [targetWeightInput, setTargetWeightInput] = useState('155');
  const [isBiometricsExpanded, setIsBiometricsExpanded] = useState(false);

  // Manual Exercise Modal State
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [exerciseName, setExerciseName] = useState('');
  const [exerciseSets, setExerciseSets] = useState('3');
  const [exerciseReps, setExerciseReps] = useState('10');
  const [exerciseWeightLoad, setExerciseWeightLoad] = useState('');
  const [exerciseDistance, setExerciseDistance] = useState('');

  useEffect(() => {
    loadSavedData();
  }, []);

  const loadSavedData = async () => {
    try {
      const savedRoutines = await AsyncStorage.getItem(STORAGE_KEY_ROUTINES);
      if (savedRoutines) setRoutines(JSON.parse(savedRoutines));

      const savedBiometrics = await AsyncStorage.getItem(STORAGE_KEY_BIOMETRICS);
      if (savedBiometrics) {
        const parsed = JSON.parse(savedBiometrics);
        setUnit(parsed.unit || 'lbs');
        setWeightInput(parsed.weightInput || '168');
        setHeightCm(parsed.heightCm || '175');
        setTargetWeightInput(parsed.targetWeightInput || '155');
      }
    } catch (e) {
      console.error('Failed to load fitness data', e);
    }
  };

  const saveRoutinesToStorage = async (updated: DayRoutine) => {
    setRoutines(updated);
    await AsyncStorage.setItem(STORAGE_KEY_ROUTINES, JSON.stringify(updated));
  };

  const saveBiometricsToStorage = async () => {
    const data = { unit, weightInput, heightCm, targetWeightInput };
    await AsyncStorage.setItem(STORAGE_KEY_BIOMETRICS, JSON.stringify(data));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setIsBiometricsExpanded(false);
  };

  // --- Dynamic BMI & Weight Calculations ---
  const rawWeight = parseFloat(weightInput) || 0;
  const rawTargetWeight = parseFloat(targetWeightInput) || 0;
  const rawHeightCm = parseFloat(heightCm) || 0;

  const weightInKg = unit === 'lbs' ? rawWeight * 0.453592 : rawWeight;
  const targetWeightInKg = unit === 'lbs' ? rawTargetWeight * 0.453592 : rawTargetWeight;
  const heightM = rawHeightCm / 100;

  const currentBmi =
    weightInKg > 0 && heightM > 0 ? (weightInKg / (heightM * heightM)).toFixed(1) : '0.0';

  const projectedBmi =
    targetWeightInKg > 0 && heightM > 0
      ? (targetWeightInKg / (heightM * heightM)).toFixed(1)
      : '0.0';

  const weightChangeNeeded =
    rawWeight > 0 && rawTargetWeight > 0 ? (rawWeight - rawTargetWeight).toFixed(1) : '0.0';

  const getBmiCategory = (bmiValue: number) => {
    if (bmiValue <= 0) return 'Invalid';
    if (bmiValue < 18.5) return 'Underweight';
    if (bmiValue < 25) return 'Normal';
    if (bmiValue < 30) return 'Overweight';
    return 'Obese';
  };

  const handleToggleUnit = (newUnit: 'lbs' | 'kg') => {
    if (newUnit === unit) return;
    Haptics.selectionAsync();

    if (rawWeight > 0) {
      const convertedWeight =
        newUnit === 'kg' ? (rawWeight * 0.453592).toFixed(1) : (rawWeight / 0.453592).toFixed(1);
      setWeightInput(convertedWeight);
    }

    if (rawTargetWeight > 0) {
      const convertedTarget =
        newUnit === 'kg'
          ? (rawTargetWeight * 0.453592).toFixed(1)
          : (rawTargetWeight / 0.453592).toFixed(1);
      setTargetWeightInput(convertedTarget);
    }

    setUnit(newUnit);
  };

  // Add Exercise Handler
  const handleAddExercise = async () => {
    if (!exerciseName.trim()) {
      Alert.alert('Missing Name', 'Please enter an exercise name.');
      return;
    }

    const newEx: Exercise = {
      id: Date.now().toString(),
      name: exerciseName.trim(),
      sets: exerciseSets,
      reps: exerciseReps,
      weightLoad: exerciseWeightLoad.trim() ? exerciseWeightLoad.trim() : undefined,
      distance: exerciseDistance.trim() ? exerciseDistance.trim() : undefined,
    };

    const currentDayList = routines[selectedDay] || [];
    const updatedDayList = [...currentDayList, newEx];
    const updatedRoutines = { ...routines, [selectedDay]: updatedDayList };

    await saveRoutinesToStorage(updatedRoutines);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Reset Form
    setExerciseName('');
    setExerciseWeightLoad('');
    setExerciseDistance('');
    setIsModalVisible(false);
  };

  // Delete Exercise Handler
  const handleDeleteExercise = async (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const updatedDayList = routines[selectedDay].filter((ex) => ex.id !== id);
    const updatedRoutines = { ...routines, [selectedDay]: updatedDayList };
    await saveRoutinesToStorage(updatedRoutines);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerSubtitle, { color: theme.fitnessAccent }]}>FITNESS TRACKER</Text>
          <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>Workout Planner & Biometrics</Text>
        </View>

        {/* Collapsible Biometrics Section */}
        <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
          <TouchableOpacity
            style={styles.collapsibleHeader}
            onPress={() => {
              Haptics.selectionAsync();
              setIsBiometricsExpanded(!isBiometricsExpanded);
            }}
            activeOpacity={0.7}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: theme.textSecondary, marginBottom: 2 }]}>
                BIOMETRICS SUMMARY
              </Text>
              {!isBiometricsExpanded && (
                <Text style={[styles.summaryText, { color: theme.textPrimary }]}>
                  Current: <Text style={{ fontWeight: 'bold' }}>{weightInput} {unit}</Text> (BMI: <Text style={{ color: theme.fitnessAccent, fontWeight: 'bold' }}>{currentBmi}</Text>)  •  Goal BMI: <Text style={{ color: theme.primaryAccent, fontWeight: 'bold' }}>{projectedBmi}</Text>
                </Text>
              )}
            </View>
            <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: 'bold', marginLeft: 8 }}>
              {isBiometricsExpanded ? '▲ Minimize' : '▼ Expand'}
            </Text>
          </TouchableOpacity>

          {isBiometricsExpanded && (
            <View style={{ marginTop: 14 }}>
              
              {/* Unit Switcher */}
              <View style={styles.unitRow}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary, marginBottom: 0 }]}>Weight Unit:</Text>
                <View style={styles.unitToggleGroup}>
                  <TouchableOpacity
                    style={[
                      styles.unitBtn,
                      { backgroundColor: unit === 'lbs' ? theme.fitnessAccent : theme.isDark ? '#2A2A2A' : '#E2E8F0' },
                    ]}
                    onPress={() => handleToggleUnit('lbs')}
                  >
                    <Text style={[styles.unitBtnText, { color: unit === 'lbs' ? '#FFF' : theme.textPrimary }]}>lbs</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.unitBtn,
                      { backgroundColor: unit === 'kg' ? theme.fitnessAccent : theme.isDark ? '#2A2A2A' : '#E2E8F0' },
                    ]}
                    onPress={() => handleToggleUnit('kg')}
                  >
                    <Text style={[styles.unitBtnText, { color: unit === 'kg' ? '#FFF' : theme.textPrimary }]}>kg</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Inputs */}
              <View style={styles.inputGrid}>
                <View style={styles.inputBox}>
                  <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Current Weight ({unit})</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
                    keyboardType="numeric"
                    value={weightInput}
                    onChangeText={setWeightInput}
                  />
                </View>

                <View style={styles.inputBox}>
                  <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Height (cm)</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
                    keyboardType="numeric"
                    value={heightCm}
                    onChangeText={setHeightCm}
                  />
                </View>

                <View style={[styles.inputBox, { width: '100%', marginTop: 8 }]}>
                  <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Goal Weight ({unit})</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
                    keyboardType="numeric"
                    value={targetWeightInput}
                    onChangeText={setTargetWeightInput}
                  />
                </View>
              </View>

              {/* Live vs Projected BMI Comparison */}
              <View style={[styles.resultsBox, { backgroundColor: theme.isDark ? '#1A1A1A' : '#F8FAFC', borderColor: theme.border }]}>
                <View style={styles.resultRow}>
                  <Text style={[styles.resultLabel, { color: theme.textSecondary }]}>Current BMI:</Text>
                  <Text style={[styles.resultValue, { color: theme.fitnessAccent }]}>
                    {currentBmi} ({getBmiCategory(parseFloat(currentBmi))})
                  </Text>
                </View>

                <View style={[styles.resultRow, { marginTop: 8 }]}>
                  <Text style={[styles.resultLabel, { color: theme.textSecondary }]}>Projected Goal BMI:</Text>
                  <Text style={[styles.resultValue, { color: theme.primaryAccent }]}>
                    {projectedBmi} ({getBmiCategory(parseFloat(projectedBmi))})
                  </Text>
                </View>

                <View style={[styles.resultRow, { marginTop: 8 }]}>
                  <Text style={[styles.resultLabel, { color: theme.textSecondary }]}>Target Reduction:</Text>
                  <Text style={[styles.resultValue, { color: theme.textPrimary }]}>
                    {weightChangeNeeded} {unit}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.saveBioBtn, { backgroundColor: theme.fitnessAccent }]}
                onPress={saveBiometricsToStorage}
              >
                <Text style={styles.saveBioBtnText}>Save & Minimize Biometrics</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Days of the Week Selector */}
        <View style={styles.daysRow}>
          {DAYS.map((day) => {
            const isSelected = selectedDay === day;
            const hasExercises = (routines[day] || []).length > 0;
            return (
              <TouchableOpacity
                key={day}
                style={[
                  styles.dayChip,
                  {
                    backgroundColor: isSelected
                      ? theme.fitnessAccent
                      : theme.isDark
                      ? '#2A2A2A'
                      : '#E2E8F0',
                  },
                ]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSelectedDay(day);
                }}
              >
                <Text style={[styles.dayChipText, { color: isSelected ? '#FFFFFF' : theme.textPrimary }]}>
                  {day}
                </Text>
                {hasExercises && (
                  <View style={[styles.dotIndicator, { backgroundColor: isSelected ? '#FFFFFF' : theme.fitnessAccent }]} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Weekly Routine Editor */}
        <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
          <View style={styles.routineHeaderRow}>
            <Text style={[styles.cardTitle, { color: theme.textSecondary }]}>
              {selectedDay.toUpperCase()} WORKOUT ROUTINE
            </Text>
            <TouchableOpacity
              style={[styles.addExBtn, { backgroundColor: theme.fitnessAccent }]}
              onPress={() => setIsModalVisible(true)}
            >
              <Text style={styles.addExBtnText}>+ Add Exercise</Text>
            </TouchableOpacity>
          </View>

          {(!routines[selectedDay] || routines[selectedDay].length === 0) ? (
            <View style={styles.emptyState}>
              <Text style={{ fontSize: 28, marginBottom: 6 }}>🏋️‍♂️</Text>
              <Text style={[styles.emptyText, { color: theme.textPrimary }]}>No exercises set for {selectedDay}.</Text>
              <Text style={[styles.emptySubtext, { color: theme.textSecondary }]}>
                Tap "+ Add Exercise" to build your workout plan for this day!
              </Text>
            </View>
          ) : (
            routines[selectedDay].map((item) => (
              <View key={item.id} style={[styles.exerciseCard, { borderColor: theme.border }]}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={[styles.exerciseName, { color: theme.textPrimary }]}>{item.name}</Text>
                  <Text style={[styles.exerciseMeta, { color: theme.textSecondary }]}>
                    {item.sets} Sets  •  {item.reps} Reps
                    {item.weightLoad ? `  •  🏋️ ${item.weightLoad}` : ''}
                    {item.distance ? `  •  🏃 ${item.distance}` : ''}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => handleDeleteExercise(item.id)}>
                  <Text style={styles.deleteText}>🗑️</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

      </ScrollView>

      {/* Manual Exercise Creation Modal */}
      <Modal visible={isModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>
              Add Exercise to {selectedDay}
            </Text>

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Exercise Name:</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
              placeholder="e.g. Bench Press or Outdoor Run"
              placeholderTextColor={theme.textSecondary}
              value={exerciseName}
              onChangeText={setExerciseName}
            />

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
              <View style={{ flex: 0.48 }}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Sets:</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
                  keyboardType="numeric"
                  value={exerciseSets}
                  onChangeText={setExerciseSets}
                />
              </View>

              <View style={{ flex: 0.48 }}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Reps / Duration:</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
                  value={exerciseReps}
                  onChangeText={setExerciseReps}
                />
              </View>
            </View>

            {/* Weight Load & Distance Inputs */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
              <View style={{ flex: 0.48 }}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Weight Used (Optional):</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
                  placeholder={`e.g. 135 ${unit}`}
                  placeholderTextColor={theme.textSecondary}
                  value={exerciseWeightLoad}
                  onChangeText={setExerciseWeightLoad}
                />
              </View>

              <View style={{ flex: 0.48 }}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Distance (Optional):</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
                  placeholder="e.g. 6 km or 3.5 mi"
                  placeholderTextColor={theme.textSecondary}
                  value={exerciseDistance}
                  onChangeText={setExerciseDistance}
                />
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.cancelBtn, { backgroundColor: theme.isDark ? '#2A2A2A' : '#E2E8F0' }]}
                onPress={() => setIsModalVisible(false)}
              >
                <Text style={{ color: theme.textSecondary, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: theme.fitnessAccent }]}
                onPress={handleAddExercise}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: 'bold' }}>Save Exercise</Text>
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
  scrollContent: { padding: 16 },
  header: { marginBottom: 16 },
  headerSubtitle: { fontSize: 12, fontWeight: 'bold', letterSpacing: 1 },
  headerTitle: { fontSize: 24, fontWeight: 'bold' },
  card: { padding: 16, borderRadius: 12, marginBottom: 16, borderWidth: 1 },
  cardTitle: { fontSize: 12, fontWeight: 'bold' },
  collapsibleHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryText: { fontSize: 13, marginTop: 4 },
  unitRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  unitToggleGroup: { flexDirection: 'row', gap: 6 },
  unitBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 6 },
  unitBtnText: { fontWeight: 'bold', fontSize: 12 },
  inputGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  inputBox: { width: '48%', marginBottom: 8 },
  inputLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  input: { padding: 12, borderRadius: 8, fontSize: 14, fontWeight: 'bold' },
  resultsBox: { padding: 12, borderRadius: 8, marginTop: 10, borderWidth: 1 },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resultLabel: { fontSize: 13, fontWeight: '600' },
  resultValue: { fontSize: 14, fontWeight: 'bold' },
  saveBioBtn: { paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginTop: 12 },
  saveBioBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 13 },
  daysRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  dayChip: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', marginHorizontal: 2, position: 'relative' },
  dayChipText: { fontSize: 12, fontWeight: 'bold' },
  dotIndicator: { width: 4, height: 4, borderRadius: 2, marginTop: 4 },
  routineHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  addExBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  addExBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' },
  emptyState: { alignItems: 'center', paddingVertical: 24 },
  emptyText: { fontSize: 15, fontWeight: 'bold' },
  emptySubtext: { fontSize: 12, marginTop: 4, textAlign: 'center' },
  exerciseCard: { paddingVertical: 10, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  exerciseName: { fontSize: 15, fontWeight: '600' },
  exerciseMeta: { fontSize: 12, marginTop: 2 },
  deleteText: { fontSize: 16, padding: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  modalContainer: { borderRadius: 14, padding: 20, borderWidth: 1 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 18, gap: 10 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  saveBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
});