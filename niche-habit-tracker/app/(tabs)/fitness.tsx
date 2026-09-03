import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  Modal,
  TextInput,
  FlatList,
  Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  WorkoutLog,
  Biometrics,
  FUNDAMENTAL_EXERCISES,
  getWorkouts,
  saveWorkouts,
  getBiometrics,
  saveBiometrics,
} from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/src/fitnessStorage';

export default function FitnessScreen() {
  const [workouts, setWorkouts] = useState<WorkoutLog[]>([]);
  const [biometrics, setBiometrics] = useState<Biometrics>({
    weightLbs: 175,
    heightInches: 70,
    age: 28,
    targetWeightLbs: 165,
  });

  // Modal States
  const [activeTab, setActiveTab] = useState<'fundamentals' | 'gym'>('fundamentals');
  const [isLogModalVisible, setIsLogModalVisible] = useState(false);
  const [isBioModalVisible, setIsBioModalVisible] = useState(false);

  // Form Fields
  const [selectedExercise, setSelectedExercise] = useState('Running');
  const [inputValue, setInputValue] = useState(''); // Reps or minutes or sets
  const [gymExerciseName, setGymExerciseName] = useState('');
  const [gymWeight, setGymWeight] = useState('');
  const [gymReps, setGymReps] = useState('');

  // Biometrics Form Fields
  const [bioWeight, setBioWeight] = useState('');
  const [bioHeight, setBioHeight] = useState('');
  const [bioAge, setBioAge] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const loadedWorkouts = await getWorkouts();
    const loadedBio = await getBiometrics();
    setWorkouts(loadedWorkouts);
    setBiometrics(loadedBio);
  };

  // Calculate Metrics
  const heightMeters = biometrics.heightInches * 0.0254;
  const weightKg = biometrics.weightLbs * 0.453592;
  const bmi = heightMeters > 0 ? (weightKg / (heightMeters * heightMeters)).toFixed(1) : '0';

  const totalCaloriesBurned = workouts.reduce((acc, w) => acc + w.estimatedCalories, 0);
  const projectedWeightLossLbs = (totalCaloriesBurned / 3500).toFixed(2); // ~3500 kcal per lb of fat

  const handleAddWorkout = async () => {
    if (activeTab === 'fundamentals' && !inputValue) {
      Alert.alert('Missing Input', 'Please enter duration or repetition amount.');
      return;
    }

    let calories = 0;
    let name = selectedExercise;

    if (activeTab === 'fundamentals') {
      const fund = FUNDAMENTAL_EXERCISES.find((f) => f.name === selectedExercise);
      const val = parseFloat(inputValue) || 0;
      if (fund?.calPerMin) calories = Math.round(val * fund.calPerMin);
      if (fund?.calPerRep) calories = Math.round(val * fund.calPerRep);
    } else {
      if (!gymExerciseName) {
        Alert.alert('Missing Input', 'Please enter a gym exercise name.');
        return;
      }
      name = gymExerciseName;
      const sets = 3;
      const reps = parseFloat(gymReps) || 10;
      calories = Math.round(sets * reps * 0.8); // Estimated burn for resistance training
    }

    const newLog: WorkoutLog = {
      id: Date.now().toString(),
      type: activeTab,
      exerciseName: name,
      estimatedCalories: calories,
      reps: activeTab === 'gym' ? parseFloat(gymReps) : parseFloat(inputValue),
      weightLbs: activeTab === 'gym' ? parseFloat(gymWeight) : undefined,
      date: new Date().toISOString().split('T')[0],
    };

    const updated = [newLog, ...workouts];
    setWorkouts(updated);
    await saveWorkouts(updated);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setIsLogModalVisible(false);
    setInputValue('');
    setGymExerciseName('');
    setGymWeight('');
    setGymReps('');
  };

  const handleUpdateBiometrics = async () => {
    const updated: Biometrics = {
      weightLbs: parseFloat(bioWeight) || biometrics.weightLbs,
      heightInches: parseFloat(bioHeight) || biometrics.heightInches,
      age: parseFloat(bioAge) || biometrics.age,
      targetWeightLbs: biometrics.targetWeightLbs,
    };

    setBiometrics(updated);
    await saveBiometrics(updated);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setIsBioModalVisible(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Top Summary Banner */}
        <View style={styles.header}>
          <Text style={styles.headerSubtitle}>FITNESS ENGINE</Text>
          <Text style={styles.headerTitle}>Workouts & Biometrics</Text>
        </View>

        {/* Biometrics & Projection Card */}
        <View style={styles.bioCard}>
          <View style={styles.bioHeader}>
            <Text style={styles.cardTitle}>📊 Body Metrics & Projections</Text>
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => {
                setBioWeight(biometrics.weightLbs.toString());
                setBioHeight(biometrics.heightInches.toString());
                setBioAge(biometrics.age.toString());
                setIsBioModalVisible(true);
              }}
            >
              <Text style={styles.editButtonText}>Update Bio</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.bioRow}>
            <View style={styles.bioStat}>
              <Text style={styles.statLabel}>Current Weight</Text>
              <Text style={styles.statValue}>{biometrics.weightLbs} lbs</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.bioStat}>
              <Text style={styles.statLabel}>BMI</Text>
              <Text style={[styles.statValue, { color: '#4CAF50' }]}>{bmi}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.bioStat}>
              <Text style={styles.statLabel}>Est. Weight Change</Text>
              <Text style={[styles.statValue, { color: '#2196F3' }]}>-{projectedWeightLossLbs} lbs</Text>
            </View>
          </View>
        </View>

        {/* Action Bar */}
        <TouchableOpacity
          style={styles.logWorkoutBtn}
          onPress={() => setIsLogModalVisible(true)}
        >
          <Text style={styles.logWorkoutBtnText}>+ Log Workout Session</Text>
        </TouchableOpacity>

        {/* Recent Workout History */}
        <Text style={styles.sectionTitle}>Recent Activity Logs</Text>
        {workouts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={{ fontSize: 36, marginBottom: 8 }}>🏋️</Text>
            <Text style={styles.emptyText}>No workouts logged yet.</Text>
            <Text style={styles.emptySubtext}>Tap button above to record your first session!</Text>
          </View>
        ) : (
          workouts.map((item) => (
            <View key={item.id} style={styles.logCard}>
              <View style={styles.logLeft}>
                <Text style={styles.logIcon}>
                  {item.type === 'gym' ? '🏋️' : '🏃'}
                </Text>
                <View>
                  <Text style={styles.logTitle}>{item.exerciseName}</Text>
                  <Text style={styles.logSubtext}>
                    {item.date} • {item.type === 'gym' ? 'Gym Session' : 'Fundamental'}
                  </Text>
                </View>
              </View>
              <View style={styles.logRight}>
                <Text style={styles.calorieText}>+{item.estimatedCalories} kcal</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Log Workout Modal */}
      <Modal visible={isLogModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Log Workout Session</Text>

            {/* Mode Switcher */}
            <View style={styles.modeRow}>
              <TouchableOpacity
                style={[styles.modeTab, activeTab === 'fundamentals' && styles.modeTabActive]}
                onPress={() => setActiveTab('fundamentals')}
              >
                <Text style={[styles.modeTabText, activeTab === 'fundamentals' && styles.modeTabTextActive]}>
                  Fundamentals
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modeTab, activeTab === 'gym' && styles.modeTabActive]}
                onPress={() => setActiveTab('gym')}
              >
                <Text style={[styles.modeTabText, activeTab === 'gym' && styles.modeTabTextActive]}>
                  Gym Category
                </Text>
              </TouchableOpacity>
            </View>

            {activeTab === 'fundamentals' ? (
              <View>
                <Text style={styles.inputLabel}>Select Fundamental Exercise:</Text>
                <View style={styles.exerciseSelector}>
                  {FUNDAMENTAL_EXERCISES.map((ex) => (
                    <TouchableOpacity
                      key={ex.name}
                      style={[
                        styles.exerciseChip,
                        selectedExercise === ex.name && styles.exerciseChipActive,
                      ]}
                      onPress={() => setSelectedExercise(ex.name)}
                    >
                      <Text style={styles.exerciseChipText}>
                        {ex.icon} {ex.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.inputLabel}>Amount (Minutes / Reps):</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 30 (mins) or 50 (reps)"
                  placeholderTextColor="#666"
                  keyboardType="numeric"
                  value={inputValue}
                  onChangeText={setInputValue}
                />
              </View>
            ) : (
              <View>
                <Text style={styles.inputLabel}>Gym Exercise Name:</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Bench Press, Lat Pulldown"
                  placeholderTextColor="#666"
                  value={gymExerciseName}
                  onChangeText={setGymExerciseName}
                />

                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <View style={{ flex: 0.48 }}>
                    <Text style={styles.inputLabel}>Weight (lbs):</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. 135"
                      placeholderTextColor="#666"
                      keyboardType="numeric"
                      value={gymWeight}
                      onChangeText={setGymWeight}
                    />
                  </View>
                  <View style={{ flex: 0.48 }}>
                    <Text style={styles.inputLabel}>Reps:</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. 10"
                      placeholderTextColor="#666"
                      keyboardType="numeric"
                      value={gymReps}
                      onChangeText={setGymReps}
                    />
                  </View>
                </View>
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsLogModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleAddWorkout}>
                <Text style={styles.saveBtnText}>Save Workout</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Biometrics Modal */}
      <Modal visible={isBioModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Update Biometrics</Text>

            <Text style={styles.inputLabel}>Weight (lbs):</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={bioWeight}
              onChangeText={setBioWeight}
            />

            <Text style={styles.inputLabel}>Height (Inches):</Text>
            <TextInput
              style={styles.input}
              placeholder="70 (5'10&quot;)"
              placeholderTextColor="#666"
              keyboardType="numeric"
              value={bioHeight}
              onChangeText={setBioHeight}
            />

            <Text style={styles.inputLabel}>Age:</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={bioAge}
              onChangeText={setBioAge}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsBioModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleUpdateBiometrics}>
                <Text style={styles.saveBtnText}>Update</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  scrollContent: { padding: 16 },
  header: { marginBottom: 16 },
  headerSubtitle: { color: '#FF5722', fontSize: 12, fontWeight: 'bold', letterSpacing: 1 },
  headerTitle: { color: '#FFF', fontSize: 24, fontWeight: 'bold' },
  bioCard: { backgroundColor: '#1E1E1E', padding: 16, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: '#2A2A2A' },
  bioHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitle: { color: '#AAA', fontSize: 13, fontWeight: 'bold' },
  editButton: { backgroundColor: '#2A2A2A', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  editButtonText: { color: '#FF5722', fontSize: 12, fontWeight: '600' },
  bioRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginTop: 8 },
  bioStat: { alignItems: 'center' },
  statLabel: { color: '#888', fontSize: 11, marginBottom: 4 },
  statValue: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  statDivider: { width: 1, height: 28, backgroundColor: '#333' },
  logWorkoutBtn: { backgroundColor: '#FF5722', paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginBottom: 20 },
  logWorkoutBtnText: { color: '#FFF', fontSize: 15, fontWeight: 'bold' },
  sectionTitle: { color: '#FFF', fontSize: 16, fontWeight: 'bold', marginBottom: 12 },
  logCard: { backgroundColor: '#1E1E1E', borderRadius: 10, padding: 14, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#2A2A2A' },
  logLeft: { flexDirection: 'row', alignItems: 'center' },
  logIcon: { fontSize: 24, marginRight: 12 },
  logTitle: { color: '#FFF', fontSize: 15, fontWeight: '600' },
  logSubtext: { color: '#777', fontSize: 12, marginTop: 2 },
  logRight: { alignItems: 'flex-end' },
  calorieText: { color: '#FF9800', fontWeight: 'bold', fontSize: 13 },
  emptyContainer: { alignItems: 'center', paddingVertical: 32 },
  emptyText: { color: '#AAA', fontSize: 16, fontWeight: 'bold' },
  emptySubtext: { color: '#666', fontSize: 13, marginTop: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20 },
  modalContainer: { backgroundColor: '#1E1E1E', borderRadius: 14, padding: 20, borderWidth: 1, borderColor: '#333' },
  modalTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  modeRow: { flexDirection: 'row', marginBottom: 16, backgroundColor: '#2A2A2A', borderRadius: 8, padding: 3 },
  modeTab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
  modeTabActive: { backgroundColor: '#FF5722' },
  modeTabText: { color: '#888', fontWeight: '600', fontSize: 13 },
  modeTabTextActive: { color: '#FFF' },
  exerciseSelector: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  exerciseChip: { backgroundColor: '#2A2A2A', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  exerciseChipActive: { backgroundColor: '#FF5722' },
  exerciseChipText: { color: '#FFF', fontSize: 12, fontWeight: '600' },
  inputLabel: { color: '#AAA', fontSize: 12, fontWeight: 'bold', marginBottom: 6, marginTop: 8 },
  input: { backgroundColor: '#2A2A2A', color: '#FFF', padding: 12, borderRadius: 8, marginBottom: 10, fontSize: 14 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16, gap: 10 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#2A2A2A' },
  cancelBtnText: { color: '#AAA', fontWeight: '600' },
  saveBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#FF5722' },
  saveBtnText: { color: '#FFF', fontWeight: 'bold' },
});