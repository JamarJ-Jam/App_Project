import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/context/ThemeContext';
import { STORAGE_KEY_BIOMETRICS } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/src/fitnessStorage';
import { LightTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/constants/colors';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const STORAGE_KEY_ONBOARDING_EFFICIENCY = '@user_efficiency_profile';

export default function OnboardingScreen() {
  const { theme = LightTheme } = useTheme() || {};
  const router = useRouter();

  const [step, setStep] = useState<1 | 2>(1);

  // --- Step 1: Fitness State ---
  const [fitnessGoal, setFitnessGoal] = useState<'weight_loss' | 'muscle_gain' | 'endurance' | 'maintenance'>('weight_loss');
  const [currentWeight, setCurrentWeight] = useState('168');
  const [targetWeight, setTargetWeight] = useState('155');
  const [heightCm, setHeightCm] = useState('175');
  const [unit, setUnit] = useState<'lbs' | 'kg'>('lbs');
  const [workoutFrequency, setWorkoutFrequency] = useState('4');

  // --- Step 2: Efficiency & Shift State ---
  const [isEmployed, setIsEmployed] = useState(true);
  const [workLocation, setWorkLocation] = useState<'remote' | 'office' | 'hybrid'>('remote');
  const [workStyle, setWorkStyle] = useState<'shift' | 'async'>('shift');
  const [shiftStart, setShiftStart] = useState('09:00');
  const [shiftEnd, setShiftEnd] = useState('17:00');
  const [selectedShiftDays, setSelectedShiftDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);

  const toggleDaySelection = (day: string) => {
    Haptics.selectionAsync();
    if (selectedShiftDays.includes(day)) {
      setSelectedShiftDays(selectedShiftDays.filter((d) => d !== day));
    } else {
      setSelectedShiftDays([...selectedShiftDays, day]);
    }
  };

  const handleCompleteOnboarding = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Save Fitness Biometrics for the Fitness Engine & My Account Hub
    const biometricsData = {
      unit,
      weightInput: currentWeight,
      heightCm,
      targetWeightInput: targetWeight,
      fitnessGoal,
      workoutFrequency,
    };
    await AsyncStorage.setItem(STORAGE_KEY_BIOMETRICS, JSON.stringify(biometricsData));

    // Save Efficiency & Shift Profile for Calendar/Task Analyzer
    const efficiencyProfile = {
      isEmployed,
      workLocation,
      workStyle,
      shiftStart,
      shiftEnd,
      selectedShiftDays,
      isOnboarded: true,
    };
    await AsyncStorage.setItem(STORAGE_KEY_ONBOARDING_EFFICIENCY, JSON.stringify(efficiencyProfile));

    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          
          {/* Header Progress Indicator */}
          <View style={styles.header}>
            <Text style={[styles.stepBadge, { color: theme.fitnessAccent }]}>
              STEP {step} OF 2 • {step === 1 ? 'FITNESS PROFILE' : 'EFFICIENCY & WORK SCHEDULE'}
            </Text>
            <Text style={[styles.title, { color: theme.textPrimary }]}>
              {step === 1 ? 'Personalize Your Fitness' : 'Optimize Your Free Time'}
            </Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              {step === 1
                ? 'Tell us about your physical baseline and primary goals.'
                : 'Help us schedule tasks and optimize focus blocks around your availability.'}
            </Text>
          </View>

          {/* STEP 1: FITNESS FORM */}
          {step === 1 && (
            <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>Primary Goal</Text>
              <View style={styles.gridRow}>
                {[
                  { id: 'weight_loss', label: '📉 Weight Loss' },
                  { id: 'muscle_gain', label: '💪 Muscle Gain' },
                  { id: 'endurance', label: '🏃 Endurance' },
                  { id: 'maintenance', label: '⚖️ Maintenance' },
                ].map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.optionChip,
                      {
                        backgroundColor: fitnessGoal === item.id ? theme.fitnessAccent : theme.isDark ? '#2A2A2A' : '#F1F5F9',
                        width: '48%',
                      },
                    ]}
                    onPress={() => setFitnessGoal(item.id as any)}
                  >
                    <Text style={{ color: fitnessGoal === item.id ? '#FFF' : theme.textPrimary, fontWeight: 'bold', fontSize: 12 }}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Units & Biometrics Inputs */}
              <View style={[styles.unitRow, { marginTop: 14 }]}>
                <Text style={[styles.label, { color: theme.textSecondary }]}>Weight Unit</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {['lbs', 'kg'].map((u) => (
                    <TouchableOpacity
                      key={u}
                      style={[
                        styles.unitBtn,
                        { backgroundColor: unit === u ? theme.fitnessAccent : theme.isDark ? '#2A2A2A' : '#E2E8F0' },
                      ]}
                      onPress={() => setUnit(u as any)}
                    >
                      <Text style={{ color: unit === u ? '#FFF' : theme.textPrimary, fontWeight: 'bold', fontSize: 12 }}>{u}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.gridRow}>
                <View style={{ width: '48%' }}>
                  <Text style={[styles.label, { color: theme.textSecondary }]}>Current Weight ({unit})</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
                    keyboardType="numeric"
                    value={currentWeight}
                    onChangeText={setCurrentWeight}
                  />
                </View>
                <View style={{ width: '48%' }}>
                  <Text style={[styles.label, { color: theme.textSecondary }]}>Goal Weight ({unit})</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
                    keyboardType="numeric"
                    value={targetWeight}
                    onChangeText={setTargetWeight}
                  />
                </View>
              </View>

              <View style={styles.gridRow}>
                <View style={{ width: '48%' }}>
                  <Text style={[styles.label, { color: theme.textSecondary }]}>Height (cm)</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
                    keyboardType="numeric"
                    value={heightCm}
                    onChangeText={setHeightCm}
                  />
                </View>
                <View style={{ width: '48%' }}>
                  <Text style={[styles.label, { color: theme.textSecondary }]}>Workouts / Week</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
                    keyboardType="numeric"
                    value={workoutFrequency}
                    onChangeText={setWorkoutFrequency}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: theme.fitnessAccent }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setStep(2);
                }}
              >
                <Text style={styles.actionBtnText}>Continue to Efficiency Setup →</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* STEP 2: EFFICIENCY & SHIFT FORM */}
          {step === 2 && (
            <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
              
              <Text style={[styles.label, { color: theme.textSecondary }]}>Employment Status</Text>
              <View style={styles.gridRow}>
                <TouchableOpacity
                  style={[styles.optionChip, { backgroundColor: isEmployed ? theme.primaryAccent : theme.isDark ? '#2A2A2A' : '#F1F5F9', width: '48%' }]}
                  onPress={() => setIsEmployed(true)}
                >
                  <Text style={{ color: isEmployed ? '#FFF' : theme.textPrimary, fontWeight: 'bold', fontSize: 12 }}>💼 Employed</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.optionChip, { backgroundColor: !isEmployed ? theme.primaryAccent : theme.isDark ? '#2A2A2A' : '#F1F5F9', width: '48%' }]}
                  onPress={() => setIsEmployed(false)}
                >
                  <Text style={{ color: !isEmployed ? '#FFF' : theme.textPrimary, fontWeight: 'bold', fontSize: 12 }}>🎓 Unemployed / Student</Text>
                </TouchableOpacity>
              </View>

              {isEmployed && (
                <>
                  <Text style={[styles.label, { color: theme.textSecondary, marginTop: 12 }]}>Work Setup</Text>
                  <View style={styles.gridRow}>
                    {[
                      { id: 'remote', label: '🏠 Remote' },
                      { id: 'office', label: '🏢 In-Office' },
                      { id: 'hybrid', label: '🔄 Hybrid' },
                    ].map((loc) => (
                      <TouchableOpacity
                        key={loc.id}
                        style={[styles.optionChip, { backgroundColor: workLocation === loc.id ? theme.primaryAccent : theme.isDark ? '#2A2A2A' : '#F1F5F9', width: '31%' }]}
                        onPress={() => setWorkLocation(loc.id as any)}
                      >
                        <Text style={{ color: workLocation === loc.id ? '#FFF' : theme.textPrimary, fontWeight: 'bold', fontSize: 11 }}>{loc.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={[styles.label, { color: theme.textSecondary, marginTop: 12 }]}>Schedule Type</Text>
                  <View style={styles.gridRow}>
                    <TouchableOpacity
                      style={[styles.optionChip, { backgroundColor: workStyle === 'shift' ? theme.primaryAccent : theme.isDark ? '#2A2A2A' : '#F1F5F9', width: '48%' }]}
                      onPress={() => setWorkStyle('shift')}
                    >
                      <Text style={{ color: workStyle === 'shift' ? '#FFF' : theme.textPrimary, fontWeight: 'bold', fontSize: 12 }}>⏱️ Fixed Shift Hours</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.optionChip, { backgroundColor: workStyle === 'async' ? theme.primaryAccent : theme.isDark ? '#2A2A2A' : '#F1F5F9', width: '48%' }]}
                      onPress={() => setWorkStyle('async')}
                    >
                      <Text style={{ color: workStyle === 'async' ? '#FFF' : theme.textPrimary, fontWeight: 'bold', fontSize: 12 }}>⚡ Asynchronous</Text>
                    </TouchableOpacity>
                  </View>

                  {workStyle === 'shift' && (
                    <View style={{ marginTop: 12 }}>
                      <Text style={[styles.label, { color: theme.textSecondary }]}>Shift Operating Hours</Text>
                      <View style={styles.gridRow}>
                        <View style={{ width: '48%' }}>
                          <Text style={[styles.subLabel, { color: theme.textSecondary }]}>Start Time</Text>
                          <TextInput
                            style={[styles.input, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
                            placeholder="09:00"
                            placeholderTextColor={theme.textSecondary}
                            value={shiftStart}
                            onChangeText={setShiftStart}
                          />
                        </View>
                        <View style={{ width: '48%' }}>
                          <Text style={[styles.subLabel, { color: theme.textSecondary }]}>End Time</Text>
                          <TextInput
                            style={[styles.input, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
                            placeholder="17:00"
                            placeholderTextColor={theme.textSecondary}
                            value={shiftEnd}
                            onChangeText={setShiftEnd}
                          />
                        </View>
                      </View>

                      <Text style={[styles.label, { color: theme.textSecondary, marginTop: 12 }]}>Shift Working Days</Text>
                      <View style={styles.daysRow}>
                        {DAYS.map((day) => {
                          const isSelected = selectedShiftDays.includes(day);
                          return (
                            <TouchableOpacity
                              key={day}
                              style={[
                                styles.dayChip,
                                { backgroundColor: isSelected ? theme.primaryAccent : theme.isDark ? '#2A2A2A' : '#E2E8F0' },
                              ]}
                              onPress={() => toggleDaySelection(day)}
                            >
                              <Text style={{ color: isSelected ? '#FFF' : theme.textPrimary, fontWeight: 'bold', fontSize: 11 }}>{day}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}
                </>
              )}

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: theme.isDark ? '#2A2A2A' : '#E2E8F0', flex: 0.35 }]}
                  onPress={() => setStep(1)}
                >
                  <Text style={{ color: theme.textPrimary, fontWeight: 'bold', textAlign: 'center' }}>← Back</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: theme.fitnessAccent, flex: 0.65 }]}
                  onPress={handleCompleteOnboarding}
                >
                  <Text style={styles.actionBtnText}>Complete Setup ✓</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20 },
  header: { marginBottom: 16 },
  stepBadge: { fontSize: 11, fontWeight: 'bold', letterSpacing: 1, marginBottom: 4 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 4 },
  subtitle: { fontSize: 12, lineHeight: 18 },
  card: { padding: 18, borderRadius: 14, borderWidth: 1 },
  label: { fontSize: 12, fontWeight: 'bold', marginBottom: 6 },
  subLabel: { fontSize: 11, fontWeight: '600', marginBottom: 4 },
  gridRow: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  optionChip: { paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8, alignItems: 'center' },
  unitRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  unitBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  input: { padding: 12, borderRadius: 8, fontSize: 14, fontWeight: 'bold' },
  daysRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  dayChip: { flex: 1, paddingVertical: 8, borderRadius: 6, alignItems: 'center', marginHorizontal: 2 },
  actionBtn: { paddingVertical: 14, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  actionBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
});