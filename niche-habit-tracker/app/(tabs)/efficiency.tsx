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
  Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/context/ThemeContext';
import {
  CalendarTask,
  getTasks,
  saveTasks,
  fetchDeviceEvents,
} from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/src/utils/efficiencyStorage';

export default function EfficiencyScreen() {
  const { theme } = useTheme();
  const [tasks, setTasks] = useState<CalendarTask[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);

  const [taskTitle, setTaskTitle] = useState('');
  const [taskCategory, setTaskCategory] = useState<'Meeting' | 'Project' | 'Personal Time' | 'Hobby'>('Project');
  const [startTime, setStartTime] = useState('10:00 AM');
  const [endTime, setEndTime] = useState('11:00 AM');

  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    const loaded = await getTasks();
    setTasks(loaded);
  };

  const handleSyncCalendar = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const deviceEvents = await fetchDeviceEvents();

    if (deviceEvents.length === 0) {
      Alert.alert('Calendar Sync', 'No device calendar events found for today or permissions were denied.');
      return;
    }

    const newTasks: CalendarTask[] = deviceEvents.map((evt) => ({
      id: evt.id || Date.now().toString(),
      title: evt.title || 'Imported Task',
      category: evt.category || 'Meeting',
      startTime: evt.startTime || '09:00 AM',
      endTime: evt.endTime || '10:00 AM',
      completed: false,
      date: evt.date || new Date().toISOString().split('T')[0],
    }));

    const combined = [...newTasks, ...tasks.filter((t) => !newTasks.some((nt) => nt.id === t.id))];
    setTasks(combined);
    await saveTasks(combined);
    Alert.alert('Sync Complete', `Synced ${deviceEvents.length} calendar events!`);
  };

  const handleAddTask = async () => {
    if (!taskTitle) {
      Alert.alert('Missing Title', 'Please enter a task or event title.');
      return;
    }

    const newTask: CalendarTask = {
      id: Date.now().toString(),
      title: taskTitle,
      category: taskCategory,
      startTime,
      endTime,
      completed: false,
      date: new Date().toISOString().split('T')[0],
    };

    const updated = [newTask, ...tasks];
    setTasks(updated);
    await saveTasks(updated);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setIsModalVisible(false);
    setTaskTitle('');
  };

  const handleToggleTask = async (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const updated = tasks.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t));
    setTasks(updated);
    await saveTasks(updated);
  };

  const completedCount = tasks.filter((t) => t.completed).length;
  const completionRate = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;
  const previousWeekRate = 72;
  const wowGrowth = completionRate - previousWeekRate;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerSubtitle, { color: theme.efficiencyAccent }]}>EFFICIENCY ENGINE</Text>
          <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>Task & Calendar Audit</Text>
        </View>

        {/* WOW Analytics Summary */}
        <View style={[styles.analyticsCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
          <Text style={[styles.cardTitle, { color: theme.textSecondary }]}>📈 Week-Over-Week Efficiency</Text>
          <View style={styles.statRow}>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: theme.textPrimary }]}>{completionRate}%</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Current Rate</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: wowGrowth >= 0 ? theme.fitnessAccent : '#DC2626' }]}>
                {wowGrowth >= 0 ? `+${wowGrowth}%` : `${wowGrowth}%`}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>WOW Growth</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: theme.efficiencyAccent }]}>02:00 PM</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Peak Focus</Text>
            </View>
          </View>
        </View>

        {/* Actions Row */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.syncBtn, { backgroundColor: theme.efficiencyAccent }]} onPress={handleSyncCalendar}>
            <Text style={styles.syncBtnText}>🔄 Sync Device Calendar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.addBtn, { backgroundColor: theme.cardBackground, borderColor: theme.border }]} onPress={() => setIsModalVisible(true)}>
            <Text style={[styles.addBtnText, { color: theme.textPrimary }]}>+ Add Task</Text>
          </TouchableOpacity>
        </View>

        {/* Scheduled Tasks List */}
        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Today's Scheduled Tasks ({completedCount}/{tasks.length})</Text>
        {tasks.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={{ fontSize: 36, marginBottom: 8 }}>📅</Text>
            <Text style={[styles.emptyText, { color: theme.textPrimary }]}>No calendar tasks logged today.</Text>
            <Text style={[styles.emptySubtext, { color: theme.textSecondary }]}>Sync your device calendar or create a custom task!</Text>
          </View>
        ) : (
          tasks.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.taskCard,
                { backgroundColor: theme.cardBackground, borderColor: theme.border },
                item.completed && { opacity: 0.6 },
              ]}
              onPress={() => handleToggleTask(item.id)}
              activeOpacity={0.7}
            >
              <View style={styles.taskLeft}>
                <View style={[styles.checkbox, item.completed && { backgroundColor: theme.fitnessAccent, borderColor: theme.fitnessAccent }]}>
                  {item.completed && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <View style={{ marginLeft: 12 }}>
                  <Text style={[styles.taskTitle, { color: theme.textPrimary }, item.completed && styles.taskTitleCompleted]}>
                    {item.title}
                  </Text>
                  <Text style={[styles.taskSubtext, { color: theme.textSecondary }]}>
                    {item.startTime} - {item.endTime} • {item.category}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* Add Task Modal */}
      <Modal visible={isModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Add Calendar Task</Text>

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Task Title:</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
              placeholder="e.g. Project Strategy Session"
              placeholderTextColor={theme.textSecondary}
              value={taskTitle}
              onChangeText={setTaskTitle}
            />

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Category:</Text>
            <View style={styles.categoryRow}>
              {(['Project', 'Meeting', 'Personal Time', 'Hobby'] as const).map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.catChip,
                    { backgroundColor: taskCategory === cat ? theme.efficiencyAccent : theme.isDark ? '#2A2A2A' : '#E2E8F0' },
                  ]}
                  onPress={() => setTaskCategory(cat)}
                >
                  <Text style={{ color: taskCategory === cat ? '#FFFFFF' : theme.textPrimary, fontSize: 11, fontWeight: '600' }}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flex: 0.48 }}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Start Time:</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
                  value={startTime}
                  onChangeText={setStartTime}
                />
              </View>
              <View style={{ flex: 0.48 }}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>End Time:</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
                  value={endTime}
                  onChangeText={setEndTime}
                />
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.cancelBtn, { backgroundColor: theme.isDark ? '#2A2A2A' : '#E2E8F0' }]} onPress={() => setIsModalVisible(false)}>
                <Text style={{ color: theme.textSecondary, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: theme.efficiencyAccent }]} onPress={handleAddTask}>
                <Text style={{ color: '#FFFFFF', fontWeight: 'bold' }}>Save Task</Text>
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
  analyticsCard: { padding: 16, borderRadius: 12, marginBottom: 16, borderWidth: 1 },
  cardTitle: { fontSize: 12, fontWeight: 'bold', marginBottom: 12 },
  statRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  statBox: { alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: 'bold' },
  statLabel: { fontSize: 11, marginTop: 4 },
  statDivider: { width: 1, height: 28 },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  syncBtn: { flex: 0.48, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  syncBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  addBtn: { flex: 0.48, paddingVertical: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1 },
  addBtnText: { fontWeight: 'bold', fontSize: 12 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 12 },
  taskCard: { borderRadius: 10, padding: 14, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1 },
  taskLeft: { flexDirection: 'row', alignItems: 'center' },
  checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#888', alignItems: 'center', justifyContent: 'center' },
  checkmark: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  taskTitle: { fontSize: 15, fontWeight: '600' },
  taskTitleCompleted: { textDecorationLine: 'line-through' },
  taskSubtext: { fontSize: 12, marginTop: 2 },
  emptyContainer: { alignItems: 'center', paddingVertical: 32 },
  emptyText: { fontSize: 16, fontWeight: 'bold' },
  emptySubtext: { fontSize: 13, marginTop: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  modalContainer: { borderRadius: 14, padding: 20, borderWidth: 1 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  inputLabel: { fontSize: 12, fontWeight: 'bold', marginBottom: 6, marginTop: 8 },
  input: { padding: 12, borderRadius: 8, marginBottom: 10, fontSize: 14 },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  catChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16, gap: 10 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  saveBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
});