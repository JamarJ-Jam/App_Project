import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/context/ThemeContext';
import { LightTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/constants/colors';
import { STORAGE_KEY_ONBOARDING_EFFICIENCY } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/app/auth/onboarding';

export const STORAGE_KEY_EFFICIENCY_TASKS = '@activity_efficiency_tasks';

interface TaskItem {
  id: string;
  title: string;
  durationMinutes: number;
  completed: boolean;
  category: 'Work' | 'Personal' | 'Focus';
}

export default function EfficiencyScreen() {
  const { theme = LightTheme } = useTheme() || {};

  // Shift & Employment State
  const [isEmployed, setIsEmployed] = useState(true);
  const [workStyle, setWorkStyle] = useState<'shift' | 'async'>('shift');
  const [shiftStart, setShiftStart] = useState('09:00');
  const [shiftEnd, setShiftEnd] = useState('17:00');
  const [selectedShiftDays, setSelectedShiftDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);

  // Task State
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDuration, setNewTaskDuration] = useState('30');
  const [newTaskCategory, setNewTaskCategory] = useState<'Work' | 'Personal' | 'Focus'>('Focus');

  useFocusEffect(
    useCallback(() => {
      loadEfficiencyData();
    }, [])
  );

  const loadEfficiencyData = async () => {
    try {
      const savedProfile = await AsyncStorage.getItem(STORAGE_KEY_ONBOARDING_EFFICIENCY);
      if (savedProfile) {
        const parsed = JSON.parse(savedProfile);
        setIsEmployed(parsed.isEmployed ?? true);
        if (parsed.workStyle) setWorkStyle(parsed.workStyle);
        if (parsed.shiftStart) setShiftStart(parsed.shiftStart);
        if (parsed.shiftEnd) setShiftEnd(parsed.shiftEnd);
        if (parsed.selectedShiftDays) setSelectedShiftDays(parsed.selectedShiftDays);
      }

      const savedTasks = await AsyncStorage.getItem(STORAGE_KEY_EFFICIENCY_TASKS);
      if (savedTasks) {
        setTasks(JSON.parse(savedTasks));
      }
    } catch (e) {
      console.log('Error loading efficiency data:', e);
    }
  };

  const saveTasks = async (updatedTasks: TaskItem[]) => {
    setTasks(updatedTasks);
    try {
      await AsyncStorage.setItem(STORAGE_KEY_EFFICIENCY_TASKS, JSON.stringify(updatedTasks));
    } catch (e) {
      console.log('Error saving efficiency tasks:', e);
    }
  };

  // Calculate Shift & Free Hours
  const calculateHours = () => {
    const todayDay = new Date().toLocaleDateString('en-US', { weekday: 'short' });
    const isShiftToday = isEmployed && workStyle === 'shift' && selectedShiftDays.includes(todayDay);

    if (!isShiftToday) {
      return { shiftHours: 0, freeHours: 16, isShiftDay: false }; // Assuming 8 hrs sleep
    }

    const [startH, startM] = shiftStart.split(':').map(Number);
    const [endH, endM] = shiftEnd.split(':').map(Number);

    let startTotal = (startH || 9) * 60 + (startM || 0);
    let endTotal = (endH || 17) * 60 + (endM || 0);
    if (endTotal <= startTotal) endTotal += 24 * 60; // Handle overnight shifts

    const shiftMinutes = endTotal - startTotal;
    const shiftHours = Math.round((shiftMinutes / 60) * 10) / 10;
    const freeHours = Math.max(0, Math.round((16 - shiftHours) * 10) / 10);

    return { shiftHours, freeHours, isShiftDay: true };
  };

  const { shiftHours, freeHours, isShiftDay } = calculateHours();

  // Efficiency Score Calculation
  const totalTaskMins = tasks.reduce((sum, t) => sum + t.durationMinutes, 0);
  const completedTaskMins = tasks.filter((t) => t.completed).reduce((sum, t) => sum + t.durationMinutes, 0);
  const efficiencyScore = totalTaskMins > 0 ? Math.round((completedTaskMins / totalTaskMins) * 100) : 0;

  const handleAddTask = () => {
    if (!newTaskTitle.trim()) {
      Alert.alert('Input Error', 'Please enter a task title.');
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const newTask: TaskItem = {
      id: Date.now().toString(),
      title: newTaskTitle.trim(),
      durationMinutes: parseInt(newTaskDuration, 10) || 30,
      completed: false,
      category: newTaskCategory,
    };

    const updated = [newTask, ...tasks];
    saveTasks(updated);
    setNewTaskTitle('');
  };

  const toggleTask = (taskId: string) => {
    Haptics.selectionAsync();
    const updated = tasks.map((t) => (t.id === taskId ? { ...t, completed: !t.completed } : t));
    saveTasks(updated);
  };

  const deleteTask = (taskId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const updated = tasks.filter((t) => t.id !== taskId);
    saveTasks(updated);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Header */}
        <View style={styles.headerBox}>
          <Text style={[styles.subtitle, { color: theme.primaryAccent }]}>TIME & PRODUCTIVITY</Text>
          <Text style={[styles.title, { color: theme.textPrimary }]}>Efficiency Engine</Text>
        </View>

        {/* Free Slot & Shift Summary Card */}
        <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border, marginBottom: 16 }]}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="time-outline" size={18} color={theme.primaryAccent} />
            <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>Today's Availability Breakdown</Text>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: theme.textPrimary }]}>{isShiftDay ? `${shiftHours}h` : 'Off'}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Shift Duration</Text>
              {isShiftDay && <Text style={[styles.statSub, { color: theme.textSecondary }]}>{shiftStart} - {shiftEnd}</Text>}
            </View>

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: theme.fitnessAccent }]}>{freeHours}h</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Free Focus Window</Text>
              <Text style={[styles.statSub, { color: theme.textSecondary }]}>Non-Work Availability</Text>
            </View>

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: efficiencyScore >= 70 ? '#10B981' : theme.primaryAccent }]}>
                {efficiencyScore}%
              </Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Efficiency Score</Text>
              <Text style={[styles.statSub, { color: theme.textSecondary }]}>{completedTaskMins}m / {totalTaskMins}m</Text>
            </View>
          </View>
        </View>

        {/* Add Task Creator Card */}
        <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border, marginBottom: 16 }]}>
          <Text style={[styles.cardTitle, { color: theme.textPrimary, marginBottom: 10 }]}>Log Focus Task</Text>

          <TextInput
            style={[styles.input, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
            placeholder="Task name (e.g. Study React Native / Prep meal)"
            placeholderTextColor={theme.textSecondary}
            value={newTaskTitle}
            onChangeText={setNewTaskTitle}
          />

          <View style={styles.gridRow}>
            <View style={{ width: '48%' }}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Duration (Mins)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
                keyboardType="numeric"
                value={newTaskDuration}
                onChangeText={setNewTaskDuration}
              />
            </View>

            <View style={{ width: '48%' }}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Category</Text>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {(['Focus', 'Work', 'Personal'] as const).map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.categoryBtn,
                      { backgroundColor: newTaskCategory === cat ? theme.primaryAccent : theme.isDark ? '#2A2A2A' : '#E2E8F0' },
                    ]}
                    onPress={() => setNewTaskCategory(cat)}
                  >
                    <Text style={{ color: newTaskCategory === cat ? '#FFF' : theme.textPrimary, fontWeight: '700', fontSize: 10 }}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          <TouchableOpacity style={[styles.addBtn, { backgroundColor: theme.primaryAccent }]} onPress={handleAddTask}>
            <Text style={styles.addBtnText}>+ Add Task</Text>
          </TouchableOpacity>
        </View>

        {/* Active Tasks List */}
        <View style={styles.listHeaderRow}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Today's Focus Tasks ({tasks.length})</Text>
        </View>

        {tasks.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
            <Ionicons name="checkbox-outline" size={28} color={theme.textSecondary} style={{ marginBottom: 6 }} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No focus tasks scheduled for today.</Text>
            <Text style={[styles.emptySubText, { color: theme.textSecondary }]}>Use your {freeHours} free focus hours to add actionable tasks.</Text>
          </View>
        ) : (
          tasks.map((task) => (
            <View key={task.id} style={[styles.taskCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
              <TouchableOpacity style={styles.taskLeftRow} onPress={() => toggleTask(task.id)}>
                <Ionicons
                  name={task.completed ? 'checkmark-circle' : 'ellipse-outline'}
                  size={22}
                  color={task.completed ? '#10B981' : theme.textSecondary}
                />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text
                    style={[
                      styles.taskTitle,
                      {
                        color: task.completed ? theme.textSecondary : theme.textPrimary,
                        textDecorationLine: task.completed ? 'line-through' : 'none',
                      },
                    ]}
                  >
                    {task.title}
                  </Text>
                  <Text style={[styles.taskSub, { color: theme.textSecondary }]}>
                    {task.durationMinutes} mins • {task.category}
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => deleteTask(task.id)}>
                <Ionicons name="trash-outline" size={18} color="#EF4444" />
              </TouchableOpacity>
            </View>
          ))
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20 },
  headerBox: { marginBottom: 16 },
  subtitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 2 },
  title: { fontSize: 26, fontWeight: '800' },
  card: { padding: 16, borderRadius: 14, borderWidth: 1 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statBox: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 10, fontWeight: '600', marginTop: 2, textAlign: 'center' },
  statSub: { fontSize: 10, marginTop: 2, textAlign: 'center' },
  divider: { width: 1, height: '80%' },
  input: { padding: 10, borderRadius: 8, fontSize: 13, fontWeight: '600', marginBottom: 10 },
  gridRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  inputLabel: { fontSize: 11, fontWeight: '700', marginBottom: 4 },
  categoryBtn: { flex: 1, paddingVertical: 8, borderRadius: 6, alignItems: 'center' },
  addBtn: { paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginTop: 4 },
  addBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  listHeaderRow: { marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  emptyCard: { padding: 24, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  emptyText: { fontWeight: '700', fontSize: 14, marginBottom: 2 },
  emptySubText: { fontSize: 12, textAlign: 'center' },
  taskCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
  taskLeftRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  taskTitle: { fontSize: 14, fontWeight: '700' },
  taskSub: { fontSize: 11, marginTop: 2 },
});