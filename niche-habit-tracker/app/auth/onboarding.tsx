import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  Switch,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/context/ThemeContext';
import { LightTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/constants/colors';

export default function OnboardingScreen() {
  const { theme = LightTheme } = useTheme() || {};
  const router = useRouter();

  // Unit Preferences
  const [heightUnit, setHeightUnit] = useState<'cm' | 'ft'>('cm');
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lbs'>('kg');

  // Biometrics Form Fields
  const [age, setAge] = useState('28');
  const [gender, setGender] = useState('Male');
  const [height, setHeight] = useState('178');
  const [currentWeight, setCurrentWeight] = useState('82');
  const [targetWeight, setTargetWeight] = useState('78');
  const [primaryGoal, setPrimaryGoal] = useState('Muscle Gain & Focus');
  const [calories, setCalories] = useState('2450');
  const [steps, setSteps] = useState('7000');
  const [deepWork, setDeepWork] = useState('6.0');

  // Efficiency Engine Profile Fields
  const [employmentStatus, setEmploymentStatus] = useState<'Employed' | 'Unemployed' | 'Student'>('Employed');
  const [workLocation, setWorkLocation] = useState<'Remote' | 'In Office' | 'Hybrid'>('Remote');
  const [scheduleType, setScheduleType] = useState<'Set Shift' | 'Asynchronous'>('Asynchronous');
  const [calendarSyncEnabled, setCalendarSyncEnabled] = useState(true);

  const handleCompleteOnboarding = async () => {
    if (!age || !height || !currentWeight || !targetWeight) {
      Alert.alert('Missing Info', 'Please complete your biometrics to personalize your experience.');
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace('/(tabs)/dashboard');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          
          <View style={styles.header}>
            <Text style={[styles.stepIndicator, { color: theme.fitnessAccent }]}>STEP 1 OF 1</Text>
            <Text style={[styles.title, { color: theme.textPrimary }]}>Personalize Your Engine</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              Set up your biometrics and efficiency profile so AI Chawgee can optimize your daily routines.
            </Text>
          </View>

          {/* Unit Selector Card */}
          <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
            <Text style={[styles.cardHeading, { color: theme.textPrimary }]}>Preferred Measurement Units</Text>
            
            <View style={styles.unitRow}>
              <Text style={[styles.unitLabel, { color: theme.textSecondary }]}>Height</Text>
              <View style={styles.pillContainer}>
                {(['cm', 'ft'] as const).map((unit) => (
                  <TouchableOpacity
                    key={unit}
                    style={[styles.pill, heightUnit === unit && { backgroundColor: theme.fitnessAccent }]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setHeightUnit(unit);
                    }}
                  >
                    <Text style={[styles.pillText, { color: heightUnit === unit ? '#FFFFFF' : theme.textSecondary }]}>
                      {unit.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.unitRow}>
              <Text style={[styles.unitLabel, { color: theme.textSecondary }]}>Weight</Text>
              <View style={styles.pillContainer}>
                {(['kg', 'lbs'] as const).map((unit) => (
                  <TouchableOpacity
                    key={unit}
                    style={[styles.pill, weightUnit === unit && { backgroundColor: theme.fitnessAccent }]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setWeightUnit(unit);
                    }}
                  >
                    <Text style={[styles.pillText, { color: weightUnit === unit ? '#FFFFFF' : theme.textSecondary }]}>
                      {unit.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          {/* Biometrics Profile Card */}
          <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
            <Text style={[styles.cardHeading, { color: theme.textPrimary }]}>Biometrics Profile</Text>

            <View style={styles.gridRow}>
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Age</Text>
                <TextInput
                  style={[styles.input, { borderColor: theme.border, color: theme.textPrimary, backgroundColor: theme.background }]}
                  value={age}
                  onChangeText={setAge}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Gender</Text>
                <TextInput
                  style={[styles.input, { borderColor: theme.border, color: theme.textPrimary, backgroundColor: theme.background }]}
                  value={gender}
                  onChangeText={setGender}
                />
              </View>
            </View>

            <View style={styles.gridRow}>
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Height ({heightUnit})</Text>
                <TextInput
                  style={[styles.input, { borderColor: theme.border, color: theme.textPrimary, backgroundColor: theme.background }]}
                  value={height}
                  onChangeText={setHeight}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Current Weight ({weightUnit})</Text>
                <TextInput
                  style={[styles.input, { borderColor: theme.border, color: theme.textPrimary, backgroundColor: theme.background }]}
                  value={currentWeight}
                  onChangeText={setCurrentWeight}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={styles.gridRow}>
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Target Weight ({weightUnit})</Text>
                <TextInput
                  style={[styles.input, { borderColor: theme.border, color: theme.textPrimary, backgroundColor: theme.background }]}
                  value={targetWeight}
                  onChangeText={setTargetWeight}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Primary Goal</Text>
                <TextInput
                  style={[styles.input, { borderColor: theme.border, color: theme.textPrimary, backgroundColor: theme.background }]}
                  value={primaryGoal}
                  onChangeText={setPrimaryGoal}
                />
              </View>
            </View>
          </View>

          {/* Efficiency Engine & Schedule Card */}
          <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
            <Text style={[styles.cardHeading, { color: theme.textPrimary }]}>Efficiency & Task Optimization</Text>

            {/* Employment Status Selector */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Occupation Status</Text>
              <View style={styles.pillContainerFull}>
                {(['Employed', 'Unemployed', 'Student'] as const).map((status) => (
                  <TouchableOpacity
                    key={status}
                    style={[styles.fullPill, employmentStatus === status && { backgroundColor: theme.fitnessAccent }]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setEmploymentStatus(status);
                    }}
                  >
                    <Text style={[styles.pillText, { color: employmentStatus === status ? '#FFFFFF' : theme.textSecondary }]}>
                      {status}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Conditional Employed Fields */}
            {employmentStatus === 'Employed' && (
              <>
                <View style={styles.fieldGroup}>
                  <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Work Setup</Text>
                  <View style={styles.pillContainerFull}>
                    {(['Remote', 'In Office', 'Hybrid'] as const).map((loc) => (
                      <TouchableOpacity
                        key={loc}
                        style={[styles.fullPill, workLocation === loc && { backgroundColor: theme.fitnessAccent }]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setWorkLocation(loc);
                        }}
                      >
                        <Text style={[styles.pillText, { color: workLocation === loc ? '#FFFFFF' : theme.textSecondary }]}>
                          {loc}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Schedule Structure</Text>
                  <View style={styles.pillContainerFull}>
                    {(['Set Shift', 'Asynchronous'] as const).map((sched) => (
                      <TouchableOpacity
                        key={sched}
                        style={[styles.fullPill, scheduleType === sched && { backgroundColor: theme.fitnessAccent }]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setScheduleType(sched);
                        }}
                      >
                        <Text style={[styles.pillText, { color: scheduleType === sched ? '#FFFFFF' : theme.textSecondary }]}>
                          {sched}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </>
            )}

            {/* Calendar Integration Option */}
            <View style={styles.toggleRow}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={[styles.toggleTitle, { color: theme.textPrimary }]}>Calendar Integration</Text>
                <Text style={[styles.toggleSub, { color: theme.textSecondary }]}>
                  Allow AI Chawgee to analyze scheduled events for smart task suggestions.
                </Text>
              </View>
              <Switch value={calendarSyncEnabled} onValueChange={setCalendarSyncEnabled} />
            </View>
          </View>

          {/* Daily Output Targets Card */}
          <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
            <Text style={[styles.cardHeading, { color: theme.textPrimary }]}>Daily Output Targets</Text>

            <View style={styles.gridRow}>
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Calories (kcal)</Text>
                <TextInput
                  style={[styles.input, { borderColor: theme.border, color: theme.textPrimary, backgroundColor: theme.background }]}
                  value={calories}
                  onChangeText={setCalories}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Steps / Day</Text>
                <TextInput
                  style={[styles.input, { borderColor: theme.border, color: theme.textPrimary, backgroundColor: theme.background }]}
                  value={steps}
                  onChangeText={setSteps}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Deep Work Goal (Hours)</Text>
              <TextInput
                style={[styles.input, { borderColor: theme.border, color: theme.textPrimary, backgroundColor: theme.background }]}
                value={deepWork}
                onChangeText={setDeepWork}
                keyboardType="numeric"
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: theme.fitnessAccent }]}
            onPress={handleCompleteOnboarding}
          >
            <Text style={styles.submitBtnText}>Launch Dashboard</Text>
            <Ionicons name="rocket-outline" size={18} color="#FFFFFF" />
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingVertical: 20, gap: 16 },
  header: { gap: 4 },
  stepIndicator: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  title: { fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  subtitle: { fontSize: 13, lineHeight: 18 },
  card: { padding: 16, borderRadius: 16, borderWidth: 1, gap: 12 },
  cardHeading: { fontSize: 15, fontWeight: '800' },
  unitRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  unitLabel: { fontSize: 13, fontWeight: '600' },
  pillContainer: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 8, padding: 2, gap: 2 },
  pillContainerFull: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 8, padding: 2, gap: 2 },
  pill: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 6 },
  fullPill: { flex: 1, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  pillText: { fontSize: 11, fontWeight: '800' },
  fieldGroup: { gap: 6 },
  gridRow: { flexDirection: 'row', gap: 12 },
  inputGroup: { flex: 1, gap: 6 },
  inputLabel: { fontSize: 12, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, height: 44, fontSize: 14, fontWeight: '700' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  toggleTitle: { fontSize: 13, fontWeight: '700' },
  toggleSub: { fontSize: 11, lineHeight: 15, marginTop: 2 },
  submitBtn: {
    flexDirection: 'row',
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  submitBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
});