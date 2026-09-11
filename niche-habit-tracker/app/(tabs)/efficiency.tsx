import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  Switch,
  Modal,
  Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/context/ThemeContext';
import { LightTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/constants/colors';

type TaskPriority = 'High' | 'Medium' | 'Low';

interface TaskItem {
  id: string;
  title: string;
  priority: TaskPriority;
  completed: boolean;
  timeBlock?: string;
}

export default function EfficiencyScreen() {
  const { theme = LightTheme } = useTheme() || {};

  // Efficiency Profile Context (Simulated / Pulled from Onboarding)
  const workSetup = 'Remote'; // Remote | In Office | Hybrid
  const scheduleType = 'Asynchronous'; // Set Shift | Asynchronous
  const dailyTargetHours = 6.0;

  // Deep Work Timer State
  const [loggedHours, setLoggedHours] = useState(3.5);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [secondsActive, setSecondsActive] = useState(0);

  // Calendar Sync State
  const [calendarSyncActive, setCalendarSyncActive] = useState(true);

  // Task Management State
  const [tasks, setTasks] = useState<TaskItem[]>([
    { id: '1', title: 'Complete Deep Work Focus Block', priority: 'High', completed: true, timeBlock: '09:00 - 11:00' },
    { id: '2', title: 'Audit Async Task Annotations', priority: 'High', completed: false, timeBlock: '13:00 - 14:30' },
    { id: '3', title: 'Review Code Base Optimization', priority: 'Medium', completed: false, timeBlock: '15:00 - 16:00' },
  ]);

  // Task Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>('Medium');
  const [newTaskTime, setNewTaskTime] = useState('');

  // Timer Effect
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isTimerRunning) {
      interval = setInterval(() => {
        setSecondsActive((prev) => prev + 1);
      }, 1000);
    } else if (!isTimerRunning && interval) {
      clearInterval(interval);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerRunning]);

  // Derived Calculations
  const progressPercent = Math.min((loggedHours / dailyTargetHours) * 100, 100);

  const toggleTimer = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isTimerRunning) {
      // Log accumulated time to total
      const hoursAdded = secondsActive / 3600;
      setLoggedHours((prev) => parseFloat((prev + hoursAdded).toFixed(2)));
      setSecondsActive(0);
      setIsTimerRunning(false);
      Alert.alert('Focus Session Saved', 'Logged session time towards daily deep work goal.');
    } else {
      setIsTimerRunning(true);
    }
  };

  const formatTimerDisplay = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const remainingSec = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSec.toString().padStart(2, '0')}`;
  };

  const toggleTaskCompletion = (id: string) => {
    Haptics.selectionAsync();
    setTasks(
      tasks.map((task) => (task.id === id ? { ...task, completed: !task.completed } : task))
    );
  };

  const handleAddTask = () => {
    if (!newTaskTitle.trim()) {
      Alert.alert('Input Error', 'Please enter a task title.');
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const newTask: TaskItem = {
      id: Date.now().toString(),
      title: newTaskTitle.trim(),
      priority: newTaskPriority,
      completed: false,
      timeBlock: newTaskTime.trim() || undefined,
    };

    setTasks([...tasks, newTask]);
    setNewTaskTitle('');
    setNewTaskTime('');
    setModalVisible(false);
  };

  const deleteTask = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTasks(tasks.filter((t) => t.id !== id));
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.subtitle, { color: '#8B5CF6' }]}>ENGINE 03</Text>
          <Text style={[styles.title, { color: theme.textPrimary }]}>Efficiency Hub</Text>
        </View>

        {/* 1. Deep Work Goal & Timer Card */}
        <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
          <View style={styles.cardHeader}>
            <View style={styles.headerLeft}>
              <View style={[styles.iconFrame, { backgroundColor: 'rgba(139, 92, 246, 0.1)' }]}>
                <Ionicons name="flash-outline" size={20} color="#8B5CF6" />
              </View>
              <View>
                <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>Deep Work Target</Text>
                <Text style={[styles.cardMeta, { color: theme.textSecondary }]}>
                  {loggedHours} / {dailyTargetHours} Hours Goal
                </Text>
              </View>
            </View>
            <Text style={[styles.progressPercent, { color: '#8B5CF6' }]}>{progressPercent.toFixed(0)}%</Text>
          </View>

          {/* Progress Bar */}
          <View style={[styles.progressBarTrack, { backgroundColor: theme.border }]}>
            <View style={[styles.progressBarFill, { backgroundColor: '#8B5CF6', width: `${progressPercent}%` }]} />
          </View>

          {/* Active Timer Box */}
          <View style={[styles.timerBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <View>
              <Text style={[styles.timerLabel, { color: theme.textSecondary }]}>
                {isTimerRunning ? 'FOCUS SESSION ACTIVE' : 'TIMER READY'}
              </Text>
              <Text style={[styles.timerDisplay, { color: theme.textPrimary }]}>
                {isTimerRunning ? formatTimerDisplay(secondsActive) : '00:00'}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.timerBtn, { backgroundColor: isTimerRunning ? '#EF4444' : '#8B5CF6' }]}
              onPress={toggleTimer}
            >
              <Ionicons name={isTimerRunning ? 'pause' : 'play'} size={18} color="#FFFFFF" />
              <Text style={styles.timerBtnText}>{isTimerRunning ? 'Pause' : 'Start Focus'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 2. AI Work Setup Briefing Banner */}
        <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
          <View style={styles.aiHeader}>
            <Ionicons name="sparkles" size={18} color="#8B5CF6" />
            <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>Schedule AI Strategy</Text>
          </View>
          <Text style={[styles.aiBody, { color: theme.textSecondary }]}>
            Configured for <Text style={{ fontWeight: '800', color: theme.textPrimary }}>{workSetup}</Text> /{' '}
            <Text style={{ fontWeight: '800', color: theme.textPrimary }}>{scheduleType}</Text> tasks. 
            AI Chawgee recommends batching high-priority async work into 90-minute uninterrupted blocks during your peak energy hours.
          </Text>
        </View>

        {/* 3. Task Prioritization Board */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionHeading, { color: theme.textSecondary }]}>SCHEDULE & TASK BOARD</Text>
          <TouchableOpacity style={[styles.addBtn, { backgroundColor: '#8B5CF6' }]} onPress={() => setModalVisible(true)}>
            <Ionicons name="add" size={16} color="#FFFFFF" />
            <Text style={styles.addBtnText}>Add Task</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
          {tasks.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No active tasks for today.</Text>
          ) : (
            tasks.map((task) => (
              <View key={task.id} style={[styles.taskRow, { borderBottomColor: theme.border }]}>
                <TouchableOpacity style={styles.taskLeft} onPress={() => toggleTaskCompletion(task.id)}>
                  <Ionicons
                    name={task.completed ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={task.completed ? '#8B5CF6' : theme.textSecondary}
                  />
                  <View style={{ flex: 1 }}>
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
                    {task.timeBlock && (
                      <Text style={[styles.taskTime, { color: theme.textSecondary }]}>{task.timeBlock}</Text>
                    )}
                  </View>
                </TouchableOpacity>

                <View style={styles.taskRight}>
                  <Text
                    style={[
                      styles.priorityPill,
                      {
                        color:
                          task.priority === 'High'
                            ? '#EF4444'
                            : task.priority === 'Medium'
                            ? '#F59E0B'
                            : '#10B981',
                      },
                    ]}
                  >
                    {task.priority.toUpperCase()}
                  </Text>
                  <TouchableOpacity onPress={() => deleteTask(task.id)}>
                    <Ionicons name="trash-outline" size={16} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}

          {/* Calendar Integration Toggle */}
          <View style={[styles.calendarSyncRow, { borderTopColor: theme.border }]}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={[styles.syncTitle, { color: theme.textPrimary }]}>Calendar Event Sync</Text>
              <Text style={[styles.syncSub, { color: theme.textSecondary }]}>Auto-parse schedule events for task windows</Text>
            </View>
            <Switch value={calendarSyncActive} onValueChange={setCalendarSyncActive} />
          </View>
        </View>

      </ScrollView>

      {/* Add Task Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.cardBackground }]}>
            <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Add Priority Task</Text>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Task Title</Text>
              <TextInput
                style={[styles.input, { borderColor: theme.border, color: theme.textPrimary, backgroundColor: theme.background }]}
                placeholder="e.g. Execute Async Data Review"
                placeholderTextColor={theme.textSecondary}
                value={newTaskTitle}
                onChangeText={setNewTaskTitle}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Time Block (Optional)</Text>
              <TextInput
                style={[styles.input, { borderColor: theme.border, color: theme.textPrimary, backgroundColor: theme.background }]}
                placeholder="e.g. 14:00 - 15:30"
                placeholderTextColor={theme.textSecondary}
                value={newTaskTime}
                onChangeText={setNewTaskTime}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Priority Level</Text>
              <View style={styles.prioritySelector}>
                {(['High', 'Medium', 'Low'] as TaskPriority[]).map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[
                      styles.priorityPillBtn,
                      newTaskPriority === p && { backgroundColor: '#8B5CF6' },
                    ]}
                    onPress={() => setNewTaskPriority(p)}
                  >
                    <Text
                      style={[
                        styles.priorityPillBtnText,
                        { color: newTaskPriority === p ? '#FFFFFF' : theme.textSecondary },
                      ]}
                    >
                      {p}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { borderColor: theme.border, borderWidth: 1 }]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={{ color: theme.textPrimary, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#8B5CF6' }]}
                onPress={handleAddTask}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>Create Task</Text>
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
  scrollContent: { paddingHorizontal: 20, paddingVertical: 20, gap: 16 },
  header: { gap: 2 },
  subtitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  title: { fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  card: { padding: 18, borderRadius: 16, borderWidth: 1, gap: 14 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconFrame: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '800' },
  cardMeta: { fontSize: 12, marginTop: 1 },
  progressPercent: { fontSize: 18, fontWeight: '900' },
  progressBarTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 4 },
  timerBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
  },
  timerLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  timerDisplay: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  timerBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, gap: 6 },
  timerBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  aiBody: { fontSize: 13, lineHeight: 18 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  sectionHeading: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  addBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, gap: 4 },
  addBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  emptyText: { fontSize: 12, fontStyle: 'italic' },
  taskRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
  taskLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, paddingRight: 10 },
  taskTitle: { fontSize: 13, fontWeight: '700' },
  taskTime: { fontSize: 11, marginTop: 2 },
  taskRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  priorityPill: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  calendarSyncRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTopWidth: 1 },
  syncTitle: { fontSize: 13, fontWeight: '700' },
  syncSub: { fontSize: 11, marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { padding: 20, borderRadius: 16, gap: 14 },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  inputGroup: { gap: 6 },
  inputLabel: { fontSize: 12, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, height: 44, fontSize: 14, fontWeight: '700' },
  prioritySelector: { flexDirection: 'row', gap: 8 },
  priorityPillBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' },
  priorityPillBtnText: { fontSize: 12, fontWeight: '800' },
  modalActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 6 },
  modalBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});