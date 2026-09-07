import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  Switch,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/context/ThemeContext';
import { useAuth } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/context/AuthContext';
import { STORAGE_KEY_BIOMETRICS } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/src/fitnessStorage';
import { STORAGE_KEY_ONBOARDING_EFFICIENCY } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/app/auth/onboarding';
import { LightTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/constants/colors';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function AccountScreen() {
  const { theme = LightTheme, toggleTheme } = useTheme() || {};
  const { user, signOut } = useAuth();

  // Biometrics state
  const [unit, setUnit] = useState<'lbs' | 'kg'>('lbs');
  const [currentWeight, setCurrentWeight] = useState('168');
  const [targetWeight, setTargetWeight] = useState('155');
  const [heightCm, setHeightCm] = useState('175');
  const [workoutFrequency, setWorkoutFrequency] = useState('4');

  // Work & Shift state
  const [isEmployed, setIsEmployed] = useState(true);
  const [workLocation, setWorkLocation] = useState<'remote' | 'office' | 'hybrid'>('remote');
  const [workStyle, setWorkStyle] = useState<'shift' | 'async'>('shift');
  const [shiftStart, setShiftStart] = useState('09:00');
  const [shiftEnd, setShiftEnd] = useState('17:00');
  const [selectedShiftDays, setSelectedShiftDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);

  useEffect(() => {
    loadProfileData();
  }, []);

  const loadProfileData = async () => {
    try {
      const savedBio = await AsyncStorage.getItem(STORAGE_KEY_BIOMETRICS);
      if (savedBio) {
        const parsed = JSON.parse(savedBio);
        if (parsed.unit) setUnit(parsed.unit);
        if (parsed.weightInput) setCurrentWeight(parsed.weightInput);
        if (parsed.targetWeightInput) setTargetWeight(parsed.targetWeightInput);
        if (parsed.heightCm) setHeightCm(parsed.heightCm);
        if (parsed.workoutFrequency) setWorkoutFrequency(parsed.workoutFrequency);
      }

      const savedEff = await AsyncStorage.getItem(STORAGE_KEY_ONBOARDING_EFFICIENCY);
      if (savedEff) {
        const parsedEff = JSON.parse(savedEff);
        setIsEmployed(parsedEff.isEmployed ?? true);
        if (parsedEff.workLocation) setWorkLocation(parsedEff.workLocation);
        if (parsedEff.workStyle) setWorkStyle(parsedEff.workStyle);
        if (parsedEff.shiftStart) setShiftStart(parsedEff.shiftStart);
        if (parsedEff.shiftEnd) setShiftEnd(parsedEff.shiftEnd);
        if (parsedEff.selectedShiftDays) setSelectedShiftDays(parsedEff.selectedShiftDays);
      }
    } catch (e) {
      console.log('Error loading account settings:', e);
    }
  };

  const saveProfileData = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const biometricsData = {
      unit,
      weightInput: currentWeight,
      heightCm,
      targetWeightInput: targetWeight,
      workoutFrequency,
    };
    await AsyncStorage.setItem(STORAGE_KEY_BIOMETRICS, JSON.stringify(biometricsData));

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

    Alert.alert('Settings Saved', 'Your biometrics and shift schedule have been updated successfully.');
  };

  const toggleDaySelection = (day: string) => {
    Haptics.selectionAsync();
    if (selectedShiftDays.includes(day)) {
      setSelectedShiftDays(selectedShiftDays.filter((d) => d !== day));
    } else {
      setSelectedShiftDays([...selectedShiftDays, day]);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Header */}
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.headerSubtitle, { color: theme.fitnessAccent }]}>PROFILE & SETTINGS</Text>
            <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>My Account</Text>
          </View>
          <View style={styles.themeToggleRow}>
            <Text style={styles.toggleEmoji}>{theme.isDark ? '🌙' : '☀️'}</Text>
            <Switch
              value={theme.isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: '#CBD5E1', true: '#334155' }}
              thumbColor={theme.isDark ? '#3B82F6' : '#FFFFFF'}
            />
          </View>
        </View>

        {/* User Session Info Card */}
        <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border, marginBottom: 16 }]}>
          <View style={styles.userCardRow}>
            <View style={[styles.avatarCircle, { backgroundColor: theme.primaryAccent }]}>
              <Text style={styles.avatarText}>
                {user?.name ? user.name[0].toUpperCase() : user?.email ? user.email[0].toUpperCase() : 'G'}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.userName, { color: theme.textPrimary }]}>
                {user?.name || (user?.isGuest ? 'Guest User' : user?.email?.split('@')[0])}
              </Text>
              <Text style={[styles.userEmail, { color: theme.textSecondary }]}>
                {user?.email || 'Guest Mode'}
              </Text>
            </View>
            <TouchableOpacity style={[styles.signOutBtn, { borderColor: theme.border }]} onPress={signOut}>
              <Text style={{ color: '#EF4444', fontWeight: 'bold', fontSize: 12 }}>Log Out</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Biometrics Settings Card */}
        <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border, marginBottom: 16 }]}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>🏋️ Fitness & Biometrics</Text>

          <View style={styles.unitRow}>
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
        </View>

        {/* Work & Shift Settings Card */}
        <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border, marginBottom: 20 }]}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>💼 Employment & Shift Schedule</Text>

          <Text style={[styles.label, { color: theme.textSecondary }]}>Employment Status</Text>
          <View style={styles.gridRow}>
            <TouchableOpacity
              style={[styles.optionChip, { backgroundColor: isEmployed ? theme.primaryAccent : theme.isDark ? '#2A2A2A' : '#F1F5F9', width: '48%' }]}
              onPress={() => setIsEmployed(true)}
            >
              <Text style={{ color: isEmployed ? '#FFF' : theme.textPrimary, fontWeight: 'bold', fontSize: 12 }}>Employed</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.optionChip, { backgroundColor: !isEmployed ? theme.primaryAccent : theme.isDark ? '#2A2A2A' : '#F1F5F9', width: '48%' }]}
              onPress={() => setIsEmployed(false)}
            >
              <Text style={{ color: !isEmployed ? '#FFF' : theme.textPrimary, fontWeight: 'bold', fontSize: 12 }}>Unemployed / Student</Text>
            </TouchableOpacity>
          </View>

          {isEmployed && (
            <>
              <Text style={[styles.label, { color: theme.textSecondary, marginTop: 12 }]}>Work Setup</Text>
              <View style={styles.gridRow}>
                {[
                  { id: 'remote', label: '🏠 Remote' },
                  { id: 'office', label: '🏢 Office' },
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

              <Text style={[styles.label, { color: theme.textSecondary, marginTop: 12 }]}>Schedule Style</Text>
              <View style={styles.gridRow}>
                <TouchableOpacity
                  style={[styles.optionChip, { backgroundColor: workStyle === 'shift' ? theme.primaryAccent : theme.isDark ? '#2A2A2A' : '#F1F5F9', width: '48%' }]}
                  onPress={() => setWorkStyle('shift')}
                >
                  <Text style={{ color: workStyle === 'shift' ? '#FFF' : theme.textPrimary, fontWeight: 'bold', fontSize: 12 }}>⏱️ Fixed Shift</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.optionChip, { backgroundColor: workStyle === 'async' ? theme.primaryAccent : theme.isDark ? '#2A2A2A' : '#F1F5F9', width: '48%' }]}
                  onPress={() => setWorkStyle('async')}
                >
                  <Text style={{ color: workStyle === 'async' ? '#FFF' : theme.textPrimary, fontWeight: 'bold', fontSize: 12 }}>⚡ Async</Text>
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
                        value={shiftStart}
                        onChangeText={setShiftStart}
                      />
                    </View>
                    <View style={{ width: '48%' }}>
                      <Text style={[styles.subLabel, { color: theme.textSecondary }]}>End Time</Text>
                      <TextInput
                        style={[styles.input, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
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
        </View>

        {/* Save Changes Button */}
        <TouchableOpacity style={[styles.saveBtn, { backgroundColor: theme.fitnessAccent }]} onPress={saveProfileData}>
          <Text style={styles.saveBtnText}>Save Account Settings</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  headerSubtitle: { fontSize: 11, fontWeight: 'bold', letterSpacing: 1 },
  headerTitle: { fontSize: 26, fontWeight: 'bold' },
  themeToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  toggleEmoji: { fontSize: 16 },
  card: { padding: 18, borderRadius: 14, borderWidth: 1 },
  userCardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarCircle: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#FFF', fontWeight: 'bold', fontSize: 18 },
  userName: { fontSize: 16, fontWeight: 'bold' },
  userEmail: { fontSize: 12 },
  signOutBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 14 },
  unitRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  unitBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  label: { fontSize: 12, fontWeight: 'bold', marginBottom: 6 },
  subLabel: { fontSize: 11, fontWeight: '600', marginBottom: 4 },
  gridRow: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  optionChip: { paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8, alignItems: 'center' },
  input: { padding: 10, borderRadius: 8, fontSize: 14, fontWeight: 'bold' },
  daysRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  dayChip: { flex: 1, paddingVertical: 8, borderRadius: 6, alignItems: 'center', marginHorizontal: 2 },
  saveBtn: { paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  saveBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },
});