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
import {
  CalendarTask,
  getTasks,
  saveTasks,
  fetchDeviceEvents,
} from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/src/utils/efficiencyStorage.ts';

export default function EfficiencyScreen() {
  const [tasks, setTasks] = useState<CalendarTask[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);

  // Form State
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

  // Metrics
  const completedCount = tasks.filter((t) => t.completed).length;
  const completionRate = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;
  const previousWeekRate = 72; // Baseline baseline for WOW comparison
  const wowGrowth = completionRate - previousWeekRate;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header Banner */}
        <View style={styles.header}>
          <Text style={styles.headerSubtitle}>EFFICIENCY ENGINE</Text>
          <Text style={styles.headerTitle}>Task & Calendar Audit</Text>
        </View>

        {/* WOW Analytics Summary */}
        <View style={styles.analyticsCard}>
          <Text style={styles.cardTitle}>📈 Week-Over-Week Efficiency</Text>
          <View style={styles.statRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{completionRate}%</Text>
              <Text style={styles.statLabel}>Current Rate</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: wowGrowth >= 0 ? '#4CAF50' : '#F44336' }]}>
                {wowGrowth >= 0 ? `+${wowGrowth}%` : `${wowGrowth}%`}
              </Text>
              <Text style={styles.statLabel}>WOW Growth</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: '#2196F3' }]}>02:00 PM</Text>
              <Text style={styles.statLabel}>Peak Focus</Text>
            </View>
          </View>
        </View>

        {/* Actions Row */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.syncBtn} onPress={handleSyncCalendar}>
            <Text style={styles.syncBtnText}>🔄 Sync Device Calendar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.addBtn} onPress={() => setIsModalVisible(true)}>
            <Text style={styles.addBtnText}>+ Add Task</Text>
          </TouchableOpacity>
        </View>

        {/* Scheduled Tasks List */}
        <Text style={styles.sectionTitle}>Today's Scheduled Tasks ({completedCount}/{tasks.length})</Text>
        {tasks.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={{ fontSize: 36, marginBottom: 8 }}>📅</Text>
            <Text style={styles.emptyText}>No calendar tasks logged today.</Text>
            <Text style={styles.emptySubtext}>Sync your device calendar or create a custom task!</Text>
          </View>
        ) : (
          tasks.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.taskCard, item.completed && styles.taskCardCompleted]}
              onPress={() => handleToggleTask(item.id)}
              activeOpacity={0.7}
            >
              <View style={styles.taskLeft}>
                <View style={[styles.checkbox, item.completed && styles.checkboxActive]}>
                  {item.completed && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <View style={{ marginLeft: 12 }}>
                  <Text style={[styles.taskTitle, item.completed && styles.taskTitleCompleted]}>
                    {item.title}
                  </Text>
                  <Text style={styles.taskSubtext}>
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
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Add Calendar Task</Text>

            <Text style={styles.inputLabel}>Task Title:</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Project Strategy Session"
              placeholderTextColor="#666"
              value={taskTitle}
              onChangeText={setTaskTitle}
            />

            <Text style={styles.inputLabel}>Category:</Text>
            <View style={styles.categoryRow}>
              {(['Project', 'Meeting', 'Personal Time', 'Hobby'] as const).map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.catChip, taskCategory === cat && styles.catChipActive]}
                  onPress={() => setTaskCategory(cat)}
                >
                  <Text style={styles.catChipText}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flex: 0.48 }}>
                <Text style={styles.inputLabel}>Start Time:</Text>
                <TextInput
                  style={styles.input}
                  value={startTime}
                  onChangeText={setStartTime}
                />
              </View>
              <View style={{ flex: 0.48 }}>
                <Text style={styles.inputLabel}>End Time:</Text>
                <TextInput
                  style={styles.input}
                  value={endTime}
                  onChangeText={setEndTime}
                />
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleAddTask}>
                <Text style={styles.saveBtnText}>Save Task</Text>
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
  headerSubtitle: { color: '#2196F3', fontSize: 12, fontWeight: 'bold', letterSpacing: 1 },
  headerTitle: { color: '#FFF', fontSize: 24, fontWeight: 'bold' },
  analyticsCard: { backgroundColor: '#1E1E1E', padding: 16, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: '#2A2A2A' },
  cardTitle: { color: '#AAA', fontSize: 13, fontWeight: 'bold', marginBottom: 12 },
  statRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  statBox: { alignItems: 'center' },
  statValue: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  statLabel: { color: '#888', fontSize: 11, marginTop: 4 },
  statDivider: { width: 1, height: 28, backgroundColor: '#333' },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  syncBtn: { flex: 0.48, backgroundColor: '#2196F3', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  syncBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  addBtn: { flex: 0.48, backgroundColor: '#2A2A2A', paddingVertical: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#444' },
  addBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  sectionTitle: { color: '#FFF', fontSize: 16, fontWeight: 'bold', marginBottom: 12 },
  taskCard: { backgroundColor: '#1E1E1E', borderRadius: 10, padding: 14, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#2A2A2A' },
  taskCardCompleted: { backgroundColor: '#161F18', borderColor: '#233827', opacity: 0.8 },
  taskLeft: { flexDirection: 'row', alignItems: 'center' },
  checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#555', alignItems: 'center', justifyContent: 'center' },
  checkboxActive: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  checkmark: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  taskTitle: { color: '#FFF', fontSize: 15, fontWeight: '600' },
  taskTitleCompleted: { textDecorationLine: 'line-through', color: '#777' },
  taskSubtext: { color: '#777', fontSize: 12, marginTop: 2 },
  emptyContainer: { alignItems: 'center', paddingVertical: 32 },
  emptyText: { color: '#AAA', fontSize: 16, fontWeight: 'bold' },
  emptySubtext: { color: '#666', fontSize: 13, marginTop: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20 },
  modalContainer: { backgroundColor: '#1E1E1E', borderRadius: 14, padding: 20, borderWidth: 1, borderColor: '#333' },
  modalTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  inputLabel: { color: '#AAA', fontSize: 12, fontWeight: 'bold', marginBottom: 6, marginTop: 8 },
  input: { backgroundColor: '#2A2A2A', color: '#FFF', padding: 12, borderRadius: 8, marginBottom: 10, fontSize: 14 },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  catChip: { backgroundColor: '#2A2A2A', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  catChipActive: { backgroundColor: '#2196F3' },
  catChipText: { color: '#FFF', fontSize: 11, fontWeight: '600' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16, gap: 10 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#2A2A2A' },
  cancelBtnText: { color: '#AAA', fontWeight: '600' },
  saveBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#2196F3' },
  saveBtnText: { color: '#FFF', fontWeight: 'bold' },
});