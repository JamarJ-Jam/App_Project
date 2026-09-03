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
import {
  DetailedExercise,
  SetDetail,
  DayRoutine,
  STORAGE_KEY_ROUTINES,
  STORAGE_KEY_BIOMETRICS,
  STORAGE_KEY_LOGGED_WORKOUTS,
  calculateExerciseCalories,
} from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/src/fitnessStorage';

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

  // Exercise Modal State
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [exerciseName, setExerciseName] = useState('');
  const [exerciseType, setExerciseType] = useState<'strength' | 'cardio'>('strength');
  const [distance, setDistance] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('30');
  
  // Dynamic Sets Array
  const [sets, setSets] = useState<SetDetail[]>([
    { id: '1', weightLoad: '175', reps: '8' },
    { id: '2', weightLoad: '200', reps: '8' },
  ]);

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

  // Set Handlers
  const handleAddSet = () => {
    const lastSet = sets[sets.length - 1];
    const newSet: SetDetail = {
      id: Date.now().toString(),
      weightLoad: lastSet ? lastSet.weightLoad : '100',
      reps: lastSet ? lastSet.reps : '10',
    };
    setSets([...sets, newSet]);
    Haptics.selectionAsync();
  };

  const handleUpdateSet = (id: string, field: 'weightLoad' | 'reps', value: string) => {
    setSets(sets.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  };

  const handleRemoveSet = (id: string) => {
    if (sets.length <= 1) return;
    setSets(sets.filter((s) => s.id !== id));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // Add Exercise Handler
  const handleAddExercise = async () => {
    if (!exerciseName.trim()) {
      Alert.alert('Missing Name', 'Please enter an exercise name.');
      return;
    }

    const newEx: DetailedExercise = {
      id: Date.now().toString(),
      name: exerciseName.trim(),
      type: exerciseType,
      sets: exerciseType === 'strength' ? sets : [],
      distance: exerciseType === 'cardio' ? distance : undefined,
      durationMinutes: exerciseType === 'cardio' ? durationMinutes : undefined,
    };

    const currentDayList = routines[selectedDay] || [];
    const updatedDayList = [...currentDayList, newEx];
    const updatedRoutines = { ...routines, [selectedDay]: updatedDayList };

    await saveRoutinesToStorage(updatedRoutines);

    // Save Calorie Burn Log
    const caloriesBurned = calculateExerciseCalories(newEx, weightInKg);
    const existingLogsRaw = await AsyncStorage.getItem(STORAGE_KEY_LOGGED_WORKOUTS);
    const existingLogs = existingLogsRaw ? JSON.parse(existingLogsRaw) : [];
    existingLogs.push({
      date: new Date().toISOString().split('T')[0],
      calories: caloriesBurned,
      exerciseName: newEx.name,
    });
    await AsyncStorage.setItem(STORAGE_KEY_LOGGED_WORKOUTS, JSON.stringify(existingLogs));

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Reset Form
    setExerciseName('');
    setSets([
      { id: '1', weightLoad: '175', reps: '8' },
      { id: '2', weightLoad: '200', reps: '8' },
    ]);
    setIsModalVisible(false);
  };

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
                  Current: <Text style={{ fontWeight: 'bold' }}>{weightInput} {unit}</Text> (BMI: <Text style={{ color: theme.fitnessAccent, fontWeight: 'bold' }}>{currentBmi}</Text>) • Goal BMI: <Text style={{ color: theme.primaryAccent, fontWeight: 'bold' }}>{projectedBmi}</Text>
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

        {/* Days Row */}
        <View style={styles.daysRow}>
          {DAYS.map((day) => {
            const isSelected = selectedDay === day;
            const hasExercises = (routines[day] || []).length > 0;
            return (
              <TouchableOpacity
                key={day}
                style={[
                  styles.dayChip,
                  { backgroundColor: isSelected ? theme.fitnessAccent : theme.isDark ? '#2A2A2A' : '#E2E8F0' },
                ]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSelectedDay(day);
                }}
              >
                <Text style={[styles.dayChipText, { color: isSelected ? '#FFFFFF' : theme.textPrimary }]}>{day}</Text>
                {hasExercises && <View style={[styles.dotIndicator, { backgroundColor: isSelected ? '#FFFFFF' : theme.fitnessAccent }]} />}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Daily Workout Plan */}
        <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
          <View style={styles.routineHeaderRow}>
            <Text style={[styles.cardTitle, { color: theme.textSecondary }]}>{selectedDay.toUpperCase()} ROUTINE</Text>
            <TouchableOpacity style={[styles.addExBtn, { backgroundColor: theme.fitnessAccent }]} onPress={() => setIsModalVisible(true)}>
              <Text style={styles.addExBtnText}>+ Add Exercise</Text>
            </TouchableOpacity>
          </View>

          {(!routines[selectedDay] || routines[selectedDay].length === 0) ? (
            <View style={styles.emptyState}>
              <Text style={{ fontSize: 28, marginBottom: 6 }}>🏋️‍♂️</Text>
              <Text style={[styles.emptyText, { color: theme.textPrimary }]}>No exercises for {selectedDay}.</Text>
            </View>
          ) : (
            routines[selectedDay].map((item) => {
              const estCal = calculateExerciseCalories(item, weightInKg);
              return (
                <View key={item.id} style={[styles.exerciseCard, { borderColor: theme.border }]}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={[styles.exerciseName, { color: theme.textPrimary }]}>{item.name}</Text>
                      <Text style={[styles.calorieBadge, { color: theme.fitnessAccent }]}>🔥 ~{estCal} kcal</Text>
                    </View>

                    {item.type === 'strength' ? (
                      item.sets.map((s, idx) => (
                        <Text key={s.id || idx} style={[styles.setDetailText, { color: theme.textSecondary }]}>
                          Set {idx + 1}: <Text style={{ fontWeight: 'bold', color: theme.textPrimary }}>{s.weightLoad} {unit}</Text> × {s.reps} reps
                        </Text>
                      ))
                    ) : (
                      <Text style={[styles.setDetailText, { color: theme.textSecondary }]}>
                        🏃 Distance: {item.distance || 'N/A'} • Duration: {item.durationMinutes} mins
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity onPress={() => handleDeleteExercise(item.id)}>
                    <Text style={styles.deleteText}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Add Exercise & Per-Set Modal */}
      <Modal visible={isModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalScroll}>
            <View style={[styles.modalContainer, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
              <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Add Exercise to {selectedDay}</Text>

              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Exercise Name:</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
                placeholder="e.g. Barbell Bench Press"
                placeholderTextColor={theme.textSecondary}
                value={exerciseName}
                onChangeText={setExerciseName}
              />

              {/* Type Switcher */}
              <View style={styles.typeRow}>
                <TouchableOpacity
                  style={[styles.typeBtn, { backgroundColor: exerciseType === 'strength' ? theme.fitnessAccent : theme.isDark ? '#2A2A2A' : '#E2E8F0' }]}
                  onPress={() => setExerciseType('strength')}
                >
                  <Text style={{ color: exerciseType === 'strength' ? '#FFF' : theme.textPrimary, fontWeight: 'bold' }}>🏋️ Strength Sets</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeBtn, { backgroundColor: exerciseType === 'cardio' ? theme.fitnessAccent : theme.isDark ? '#2A2A2A' : '#E2E8F0' }]}
                  onPress={() => setExerciseType('cardio')}
                >
                  <Text style={{ color: exerciseType === 'cardio' ? '#FFF' : theme.textPrimary, fontWeight: 'bold' }}>🏃 Cardio</Text>
                </TouchableOpacity>
              </View>

              {exerciseType === 'strength' ? (
                <View>
                  <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>CONFIGURE SETS & WEIGHTS:</Text>
                  {sets.map((s, index) => (
                    <View key={s.id} style={styles.setRow}>
                      <Text style={[styles.setLabel, { color: theme.textPrimary }]}>Set {index + 1}</Text>
                      <TextInput
                        style={[styles.setContainerInput, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
                        placeholder={`Weight (${unit})`}
                        placeholderTextColor={theme.textSecondary}
                        keyboardType="numeric"
                        value={s.weightLoad}
                        onChangeText={(v) => handleUpdateSet(s.id, 'weightLoad', v)}
                      />
                      <TextInput
                        style={[styles.setContainerInput, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
                        placeholder="Reps"
                        placeholderTextColor={theme.textSecondary}
                        keyboardType="numeric"
                        value={s.reps}
                        onChangeText={(v) => handleUpdateSet(s.id, 'reps', v)}
                      />
                      {sets.length > 1 && (
                        <TouchableOpacity onPress={() => handleRemoveSet(s.id)}>
                          <Text style={{ fontSize: 16 }}>❌</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}

                  <TouchableOpacity style={[styles.addSetBtn, { borderColor: theme.fitnessAccent }]} onPress={handleAddSet}>
                    <Text style={[styles.addSetBtnText, { color: theme.fitnessAccent }]}>+ Add Another Set</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ marginTop: 8 }}>
                  <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Distance (Optional):</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
                    placeholder="e.g. 5 km or 3.2 mi"
                    placeholderTextColor={theme.textSecondary}
                    value={distance}
                    onChangeText={setDistance}
                  />
                  <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 8 }]}>Duration (Minutes):</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
                    keyboardType="numeric"
                    value={durationMinutes}
                    onChangeText={setDurationMinutes}
                  />
                </View>
              )}

              <View style={styles.modalActions}>
                <TouchableOpacity style={[styles.cancelBtn, { backgroundColor: theme.isDark ? '#2A2A2A' : '#E2E8F0' }]} onPress={() => setIsModalVisible(false)}>
                  <Text style={{ color: theme.textSecondary, fontWeight: '600' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.saveBtn, { backgroundColor: theme.fitnessAccent }]} onPress={handleAddExercise}>
                  <Text style={{ color: '#FFFFFF', fontWeight: 'bold' }}>Save Exercise</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
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
  input: { padding: 12, borderRadius: 8, fontSize: 14, fontWeight: 'bold', marginBottom: 10 },
  resultsBox: { padding: 12, borderRadius: 8, marginTop: 10, borderWidth: 1 },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resultLabel: { fontSize: 13, fontWeight: '600' },
  resultValue: { fontSize: 14, fontWeight: 'bold' },
  saveBioBtn: { paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginTop: 12 },
  saveBioBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 13 },
  daysRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  dayChip: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', marginHorizontal: 2 },
  dayChipText: { fontSize: 12, fontWeight: 'bold' },
  dotIndicator: { width: 4, height: 4, borderRadius: 2, marginTop: 4 },
  routineHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  addExBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  addExBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' },
  emptyState: { alignItems: 'center', paddingVertical: 24 },
  emptyText: { fontSize: 15, fontWeight: 'bold' },
  exerciseCard: { paddingVertical: 12, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  exerciseName: { fontSize: 15, fontWeight: 'bold' },
  calorieBadge: { fontSize: 12, fontWeight: 'bold' },
  setDetailText: { fontSize: 12, marginTop: 4 },
  deleteText: { fontSize: 16, padding: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center' },
  modalScroll: { padding: 20, justifyContent: 'center' },
  modalContainer: { borderRadius: 14, padding: 20, borderWidth: 1 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 14 },
  typeRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  typeBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  sectionSubtitle: { fontSize: 11, fontWeight: 'bold', marginVertical: 8 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  setLabel: { width: 42, fontSize: 12, fontWeight: 'bold' },
  setContainerInput: { flex: 1, padding: 10, borderRadius: 8, fontSize: 13, fontWeight: 'bold' },
  addSetBtn: { paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', marginVertical: 10 },
  addSetBtnText: { fontSize: 12, fontWeight: 'bold' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 14, gap: 10 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  saveBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
});