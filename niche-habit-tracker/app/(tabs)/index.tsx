import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/context/ThemeContext';
import { useAuth } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/context/AuthContext';
import { LightTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/constants/colors';
import { STORAGE_KEY_BIOMETRICS } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/src/fitnessStorage';
import { STORAGE_KEY_WORKOUT_HISTORY } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/app/(tabs)/fitness';
import { STORAGE_KEY_EFFICIENCY_TASKS } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/app/(tabs)/efficiency';

export default function DashboardScreen() {
  const { theme = LightTheme } = useTheme() || {};
  const { user } = useAuth();
  const router = useRouter();

  // Biometrics State
  const [currentWeight, setCurrentWeight] = useState('168');
  const [targetWeight, setTargetWeight] = useState('155');
  const [unit, setUnit] = useState<'lbs' | 'kg'>('lbs');

  // Activity Stats State
  const [recentWorkouts, setRecentWorkouts] = useState<any[]>([]);
  const [weeklyWorkoutCount, setWeeklyWorkoutCount] = useState(0);
  const [taskEfficiencyScore, setTaskEfficiencyScore] = useState(0);
  const [completedTasksCount, setCompletedTasksCount] = useState(0);
  const [totalTasksCount, setTotalTasksCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      loadDashboardMetrics();
    }, [])
  );

  const loadDashboardMetrics = async () => {
    try {
      // 1. Load Biometrics
      const savedBio = await AsyncStorage.getItem(STORAGE_KEY_BIOMETRICS);
      if (savedBio) {
        const parsedBio = JSON.parse(savedBio);
        if (parsedBio.weightInput) setCurrentWeight(parsedBio.weightInput);
        if (parsedBio.targetWeightInput) setTargetWeight(parsedBio.targetWeightInput);
        if (parsedBio.unit) setUnit(parsedBio.unit);
      }

      // 2. Load Workout History
      const savedWorkouts = await AsyncStorage.getItem(STORAGE_KEY_WORKOUT_HISTORY);
      if (savedWorkouts) {
        const history = JSON.parse(savedWorkouts);
        setRecentWorkouts(history.slice(0, 3)); // Top 3 recent

        // Calculate workouts completed in the last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const thisWeek = history.filter((item: any) => new Date(item.completedAt) >= sevenDaysAgo);
        setWeeklyWorkoutCount(thisWeek.length);
      } else {
        setRecentWorkouts([]);
        setWeeklyWorkoutCount(0);
      }

      // 3. Load Efficiency Tasks
      const savedTasks = await AsyncStorage.getItem(STORAGE_KEY_EFFICIENCY_TASKS);
      if (savedTasks) {
        const tasks = JSON.parse(savedTasks);
        setTotalTasksCount(tasks.length);
        const completed = tasks.filter((t: any) => t.completed);
        setCompletedTasksCount(completed.length);

        const totalMins = tasks.reduce((sum: number, t: any) => sum + (t.durationMinutes || 0), 0);
        const completedMins = completed.reduce((sum: number, t: any) => sum + (t.durationMinutes || 0), 0);
        
        const score = totalMins > 0 ? Math.round((completedMins / totalMins) * 100) : 0;
        setTaskEfficiencyScore(score);
      } else {
        setTaskEfficiencyScore(0);
        setCompletedTasksCount(0);
        setTotalTasksCount(0);
      }
    } catch (e) {
      console.log('Error loading dashboard metrics:', e);
    }
  };

  const weightDelta = (parseFloat(currentWeight) - parseFloat(targetWeight)).toFixed(1);
  const isLossGoal = parseFloat(currentWeight) >= parseFloat(targetWeight);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Top Greeting Header */}
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.greetingSubtitle, { color: theme.fitnessAccent }]}>EXECUTIVE DASHBOARD</Text>
            <Text style={[styles.greetingTitle, { color: theme.textPrimary }]}>
              Welcome, {user?.name || (user?.isGuest ? 'Guest' : user?.email?.split('@')[0])}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.profileIconBtn, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}
            onPress={() => router.push('/(tabs)/account')}
          >
            <Ionicons name="person-outline" size={18} color={theme.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* High Level KPI Metrics */}
        <View style={styles.kpiGrid}>
          {/* Efficiency Score KPI */}
          <View style={[styles.kpiCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
            <View style={styles.kpiHeader}>
              <Ionicons name="flash-outline" size={16} color={theme.primaryAccent} />
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>Efficiency</Text>
            </View>
            <Text style={[styles.kpiValue, { color: taskEfficiencyScore >= 70 ? '#10B981' : theme.primaryAccent }]}>
              {taskEfficiencyScore}%
            </Text>
            <Text style={[styles.kpiSub, { color: theme.textSecondary }]}>
              {completedTasksCount}/{totalTasksCount} tasks complete
            </Text>
          </View>

          {/* Weekly Workouts KPI */}
          <View style={[styles.kpiCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
            <View style={styles.kpiHeader}>
              <Ionicons name="barbell-outline" size={16} color={theme.fitnessAccent} />
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>7-Day Sessions</Text>
            </View>
            <Text style={[styles.kpiValue, { color: theme.textPrimary }]}>{weeklyWorkoutCount}</Text>
            <Text style={[styles.kpiSub, { color: theme.textSecondary }]}>Workouts completed</Text>
          </View>
        </View>

        {/* Weight Target Tracking Card */}
        <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border, marginBottom: 16 }]}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="trending-down-outline" size={18} color={theme.fitnessAccent} />
            <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>Biometrics Progress</Text>
          </View>

          <View style={styles.biometricsRow}>
            <View style={styles.bioBox}>
              <Text style={[styles.bioLabel, { color: theme.textSecondary }]}>Current</Text>
              <Text style={[styles.bioValue, { color: theme.textPrimary }]}>{currentWeight} {unit}</Text>
            </View>

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            <View style={styles.bioBox}>
              <Text style={[styles.bioLabel, { color: theme.textSecondary }]}>Goal</Text>
              <Text style={[styles.bioValue, { color: theme.fitnessAccent }]}>{targetWeight} {unit}</Text>
            </View>

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            <View style={styles.bioBox}>
              <Text style={[styles.bioLabel, { color: theme.textSecondary }]}>Remaining</Text>
              <Text style={[styles.bioValue, { color: isLossGoal ? '#10B981' : theme.primaryAccent }]}>
                {Math.abs(parseFloat(weightDelta))} {unit}
              </Text>
            </View>
          </View>
        </View>

        {/* Action Shortcuts */}
        <Text style={[styles.sectionTitle, { color: theme.textPrimary, marginBottom: 10 }]}>Quick Actions</Text>
        <View style={styles.quickActionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: theme.fitnessAccent }]}
            onPress={() => router.push('/(tabs)/fitness')}
          >
            <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.actionBtnText}>Log Workout</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: theme.primaryAccent }]}
            onPress={() => router.push('/(tabs)/efficiency')}
          >
            <Ionicons name="checkbox-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.actionBtnText}>Log Task</Text>
          </TouchableOpacity>
        </View>

        {/* Recent Workout Activity Feed */}
        <View style={{ marginTop: 20 }}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="time-outline" size={18} color={theme.primaryAccent} />
            <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Recent Activity</Text>
          </View>

          {recentWorkouts.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No workout activity logged yet.</Text>
              <Text style={[styles.emptySub, { color: theme.textSecondary }]}>
                Complete a session in the Fitness tab to track your history here.
              </Text>
            </View>
          ) : (
            recentWorkouts.map((item) => {
              const formattedDate = new Date(item.completedAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <View key={item.id} style={[styles.historyCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
                  <View style={styles.historyHeader}>
                    <Text style={[styles.historyCategory, { color: theme.fitnessAccent }]}>{item.category} Session</Text>
                    <Text style={[styles.historyDate, { color: theme.textSecondary }]}>{formattedDate}</Text>
                  </View>

                  <Text style={[styles.historyDetail, { color: theme.textPrimary }]}>
                    {item.exercises?.length || 0} movement(s) logged
                  </Text>
                </View>
              );
            })
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  greetingSubtitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 2 },
  greetingTitle: { fontSize: 24, fontWeight: '800' },
  profileIconBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  kpiGrid: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  kpiCard: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1 },
  kpiHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  kpiLabel: { fontSize: 11, fontWeight: '700' },
  kpiValue: { fontSize: 22, fontWeight: '800' },
  kpiSub: { fontSize: 10, marginTop: 2 },
  card: { padding: 16, borderRadius: 14, borderWidth: 1 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  biometricsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bioBox: { flex: 1, alignItems: 'center' },
  bioLabel: { fontSize: 11, fontWeight: '600', marginBottom: 2 },
  bioValue: { fontSize: 18, fontWeight: '800' },
  divider: { width: 1, height: '80%' },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  quickActionRow: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 10 },
  actionBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  emptyCard: { padding: 20, borderRadius: 12, borderWidth: 1, alignItems: 'center', marginTop: 8 },
  emptyText: { fontWeight: '700', fontSize: 13, marginBottom: 2 },
  emptySub: { fontSize: 11, textAlign: 'center' },
  historyCard: { padding: 12, borderRadius: 10, borderWidth: 1, marginTop: 8 },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  historyCategory: { fontSize: 13, fontWeight: '700' },
  historyDate: { fontSize: 11 },
  historyDetail: { fontSize: 12, fontWeight: '600' },
});