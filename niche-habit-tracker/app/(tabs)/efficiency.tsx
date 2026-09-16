import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { useTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/context/ThemeContext';
import { LightTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/constants/colors';
import {
  loadUserProfile,
} from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/storage/userProfileStorage';
import {
  CalendarTask,
  getTasks,
  saveTasks,
} from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/storage/efficiencyStorage';
import {
  addManualDeepWorkSession,
  DeepWorkSession,
  getActiveDeepWorkSession,
  getDeepWorkSessions,
  startDeepWorkSession,
  stopDeepWorkSession,
} from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/storage/deepWorkStorage';

type TaskPriority = 'High' | 'Medium' | 'Low';

interface TaskItem {
  id: string;
  title: string;
  priority: TaskPriority;
  completed: boolean;
  timeBlock?: string;
  date: string;
}

const toLocalDateKey = (date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getElapsedSeconds = (startedAt?: string): number => {
  if (!startedAt) return 0;

  return Math.max(
    0,
    Math.floor(
      (Date.now() - new Date(startedAt).getTime()) / 1000
    )
  );
};

const formatTimerDisplay = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const remainingSec = seconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${mins
      .toString()
      .padStart(2, '0')}:${remainingSec
      .toString()
      .padStart(2, '0')}`;
  }

  return `${mins.toString().padStart(2, '0')}:${remainingSec
    .toString()
    .padStart(2, '0')}`;
};

const taskToCalendarTask = (task: TaskItem): CalendarTask => ({
  id: task.id,
  title: task.title,
  category: 'Project',
  startTime: task.timeBlock?.split(' - ')[0] || '',
  endTime: task.timeBlock?.split(' - ')[1] || '',
  completed: task.completed,
  date: task.date,
});

const calendarTaskToTask = (task: CalendarTask): TaskItem => ({
  id: task.id,
  title: task.title,
  priority: 'Medium',
  completed: task.completed,
  timeBlock:
    task.startTime && task.endTime
      ? `${task.startTime} - ${task.endTime}`
      : undefined,
  date: task.date,
});

export default function EfficiencyScreen() {
  const { theme = LightTheme } = useTheme() || {};
  const router = useRouter();
  const { quickAction } = useLocalSearchParams<{
    quickAction?: string;
  }>();

  const [workSetup, setWorkSetup] = useState('Remote');
  const [scheduleType, setScheduleType] =
    useState('Asynchronous');
  const [dailyTargetHours, setDailyTargetHours] =
    useState(0);

  const [deepWorkSessions, setDeepWorkSessions] = useState<
    DeepWorkSession[]
  >([]);
  const [activeSessionStartedAt, setActiveSessionStartedAt] =
    useState<string | null>(null);
  const [secondsActive, setSecondsActive] = useState(0);

  const [calendarSyncActive, setCalendarSyncActive] =
    useState(false);

  const [tasks, setTasks] = useState<TaskItem[]>([]);

  const [taskModalVisible, setTaskModalVisible] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] =
    useState<TaskPriority>('Medium');
  const [newTaskTime, setNewTaskTime] = useState('');

  const [manualLogVisible, setManualLogVisible] = useState(false);
  const [manualMinutes, setManualMinutes] = useState('');
  const [manualLabel, setManualLabel] = useState('');

  useEffect(() => {
    if (quickAction !== 'addTask') return;

    setTaskModalVisible(true);
    router.setParams({ quickAction: '' });
  }, [quickAction]);


  const todayKey = toLocalDateKey();

  const loadEfficiencyData = useCallback(async () => {
    try {
      const [profile, savedTasks, sessions, activeSession] =
        await Promise.all([
          loadUserProfile(),
          getTasks(),
          getDeepWorkSessions(),
          getActiveDeepWorkSession(),
        ]);

      setWorkSetup(profile.workLocation || 'Remote');
      setScheduleType(profile.scheduleType || 'Asynchronous');
      setDailyTargetHours(
        Number(profile.deepWorkHours) || 0
      );
      setCalendarSyncActive(
        Boolean(profile.calendarSyncEnabled)
      );

      setTasks(savedTasks.map(calendarTaskToTask));
      setDeepWorkSessions(sessions);

      if (activeSession) {
        setActiveSessionStartedAt(activeSession.startedAt);
        setSecondsActive(
          getElapsedSeconds(activeSession.startedAt)
        );
      } else {
        setActiveSessionStartedAt(null);
        setSecondsActive(0);
      }
    } catch (error) {
      console.error(
        'Failed to load efficiency data:',
        error
      );
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadEfficiencyData();
    }, [loadEfficiencyData])
  );

  useEffect(() => {
    if (!activeSessionStartedAt) {
      return;
    }

    const interval = setInterval(() => {
      setSecondsActive(
        getElapsedSeconds(activeSessionStartedAt)
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [activeSessionStartedAt]);

  const todaysSessions = useMemo(
    () =>
      deepWorkSessions.filter(
        (session) => session.date === todayKey
      ),
    [deepWorkSessions, todayKey]
  );

  const loggedMinutes = todaysSessions.reduce(
    (sum, session) =>
      sum + Number(session.durationMinutes || 0),
    0
  );

  const loggedHours = loggedMinutes / 60;

  const targetMinutes = dailyTargetHours * 60;

  const progressPercent =
    targetMinutes > 0
      ? Math.min((loggedMinutes / targetMinutes) * 100, 100)
      : 0;

  const persistTasks = async (nextTasks: TaskItem[]) => {
    setTasks(nextTasks);

    try {
      await saveTasks(
        nextTasks.map(taskToCalendarTask)
      );
    } catch (error) {
      console.error('Failed to save tasks:', error);
      Alert.alert(
        'Unable to save',
        'Your task changes could not be saved.'
      );
    }
  };

  const toggleTimer = async () => {
    Haptics.impactAsync(
      Haptics.ImpactFeedbackStyle.Medium
    );

    try {
      if (activeSessionStartedAt) {
        const saved = await stopDeepWorkSession();

        setActiveSessionStartedAt(null);
        setSecondsActive(0);

        if (saved) {
          setDeepWorkSessions((current) => [
            saved,
            ...current,
          ]);
        }

        Alert.alert(
          'Focus Session Saved',
          'Your deep work time has been added to today.'
        );
      } else {
        const active = await startDeepWorkSession();

        setActiveSessionStartedAt(active.startedAt);
        setSecondsActive(
          getElapsedSeconds(active.startedAt)
        );
      }
    } catch (error) {
      console.error('Deep work timer error:', error);

      Alert.alert(
        'Unable to update timer',
        'Please try again.'
      );
    }
  };

  const handleManualLog = async () => {
    const minutes = Math.round(
      Number.parseFloat(manualMinutes)
    );

    if (!Number.isFinite(minutes) || minutes <= 0) {
      Alert.alert(
        'Enter focus time',
        'Enter the number of minutes you completed.'
      );
      return;
    }

    try {
      const saved = await addManualDeepWorkSession({
        durationMinutes: minutes,
        title: manualLabel.trim() || undefined,
      });

      setDeepWorkSessions((current) => [
        saved,
        ...current,
      ]);

      setManualMinutes('');
      setManualLabel('');
      setManualLogVisible(false);

      await Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success
      );
    } catch (error) {
      console.error(
        'Manual deep work log error:',
        error
      );

      Alert.alert(
        'Unable to save',
        'Your focus session could not be saved.'
      );
    }
  };

  const toggleTaskCompletion = (id: string) => {
    Haptics.selectionAsync();

    persistTasks(
      tasks.map((task) =>
        task.id === id
          ? { ...task, completed: !task.completed }
          : task
      )
    );
  };

  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) {
      Alert.alert(
        'Input Error',
        'Please enter a task title.'
      );
      return;
    }

    const newTask: TaskItem = {
      id: Date.now().toString(),
      title: newTaskTitle.trim(),
      priority: newTaskPriority,
      completed: false,
      timeBlock: newTaskTime.trim() || undefined,
      date: todayKey,
    };

    await persistTasks([...tasks, newTask]);

    setNewTaskTitle('');
    setNewTaskTime('');
    setNewTaskPriority('Medium');
    setTaskModalVisible(false);

    Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Success
    );
  };

  const deleteTask = (id: string) => {
    Haptics.impactAsync(
      Haptics.ImpactFeedbackStyle.Light
    );

    persistTasks(tasks.filter((task) => task.id !== id));
  };

  const todaysTasks = tasks.filter(
    (task) => task.date === todayKey
  );

  return (
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor: theme.background },
      ]}
    >
      <View
        style={[
          styles.fixedHeader,
          {
            backgroundColor: theme.background,
            borderBottomColor: theme.border,
          },
        ]}
      >
        <View style={styles.header}>
          <View>
            <Text
              style={[
                styles.title,
                { color: theme.textPrimary },
              ]}
            >
              Efficiency
            </Text>

            <Text
              style={[
                styles.subtitle,
                { color: theme.textSecondary },
              ]}
            >
              Focus with purpose. Protect your time.
            </Text>
          </View>

          <View
            style={[
              styles.headerIcon,
              {
                backgroundColor:
                  `${theme.efficiencyAccent}18`,
              },
            ]}
          >
            <Ionicons
              name="flash-outline"
              size={23}
              color={theme.efficiencyAccent}
            />
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.cardBackground,
              borderColor: theme.border,
            },
          ]}
        >
          <View style={styles.cardHeader}>
            <View style={styles.headerLeft}>
              <View
                style={[
                  styles.iconFrame,
                  {
                    backgroundColor:
                      `${theme.efficiencyAccent}18`,
                  },
                ]}
              >
                <Ionicons
                  name="flash-outline"
                  size={20}
                  color={theme.efficiencyAccent}
                />
              </View>

              <View>
                <Text
                  style={[
                    styles.cardTitle,
                    { color: theme.textPrimary },
                  ]}
                >
                  Deep Work Target
                </Text>

                <Text
                  style={[
                    styles.cardMeta,
                    { color: theme.textSecondary },
                  ]}
                >
                  {loggedHours.toFixed(2)} /{' '}
                  {dailyTargetHours.toFixed(1)} Hours Goal
                </Text>
              </View>
            </View>

            <Text
              style={[
                styles.progressPercent,
                { color: theme.efficiencyAccent },
              ]}
            >
              {progressPercent.toFixed(0)}%
            </Text>
          </View>

          <View
            style={[
              styles.progressBarTrack,
              { backgroundColor: theme.border },
            ]}
          >
            <View
              style={[
                styles.progressBarFill,
                {
                  backgroundColor: theme.efficiencyAccent,
                  width: `${progressPercent}%`,
                },
              ]}
            />
          </View>

          <View
            style={[
              styles.timerBox,
              {
                backgroundColor: theme.background,
                borderColor: theme.border,
              },
            ]}
          >
            <View>
              <Text
                style={[
                  styles.timerLabel,
                  { color: theme.textSecondary },
                ]}
              >
                {activeSessionStartedAt
                  ? 'FOCUS SESSION ACTIVE'
                  : 'TIMER READY'}
              </Text>

              <Text
                style={[
                  styles.timerDisplay,
                  { color: theme.textPrimary },
                ]}
              >
                {activeSessionStartedAt
                  ? formatTimerDisplay(secondsActive)
                  : '00:00'}
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.timerBtn,
                {
                  backgroundColor: activeSessionStartedAt
                    ? theme.danger
                    : theme.efficiencyAccent,
                },
              ]}
              onPress={toggleTimer}
            >
              <Ionicons
                name={
                  activeSessionStartedAt
                    ? 'stop'
                    : 'play'
                }
                size={18}
                color="#FFFFFF"
              />

              <Text style={styles.timerBtnText}>
                {activeSessionStartedAt
                  ? 'Stop & Save'
                  : 'Start Focus'}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[
              styles.manualLogButton,
              { borderColor: theme.border },
            ]}
            onPress={() => setManualLogVisible(true)}
          >
            <Ionicons
              name="create-outline"
              size={17}
              color={theme.efficiencyAccent}
            />

            <Text
              style={[
                styles.manualLogButtonText,
                { color: theme.textPrimary },
              ]}
            >
              Log focus time manually
            </Text>
          </TouchableOpacity>
        </View>

        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.cardBackground,
              borderColor: theme.border,
            },
          ]}
        >
          <View style={styles.aiHeader}>
            <Ionicons
              name="sparkles"
              size={18}
              color={theme.efficiencyAccent}
            />

            <Text
              style={[
                styles.cardTitle,
                { color: theme.textPrimary },
              ]}
            >
              Schedule AI Strategy
            </Text>
          </View>

          <Text
            style={[
              styles.aiBody,
              { color: theme.textSecondary },
            ]}
          >
            Configured for{' '}
            <Text
              style={{
                fontWeight: '800',
                color: theme.textPrimary,
              }}
            >
              {workSetup}
            </Text>{' '}
            /{' '}
            <Text
              style={{
                fontWeight: '800',
                color: theme.textPrimary,
              }}
            >
              {scheduleType}
            </Text>{' '}
            tasks. Chawgee can use your saved focus
            sessions and task activity when reviewing
            productivity trends.
          </Text>
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text
            style={[
              styles.sectionHeading,
              { color: theme.textSecondary },
            ]}
          >
            SCHEDULE & TASK BOARD
          </Text>

          <TouchableOpacity
            style={[
              styles.addBtn,
              { backgroundColor: theme.efficiencyAccent },
            ]}
            onPress={() => setTaskModalVisible(true)}
          >
            <Ionicons
              name="add"
              size={16}
              color="#FFFFFF"
            />
            <Text style={styles.addBtnText}>
              Add Task
            </Text>
          </TouchableOpacity>
        </View>

        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.cardBackground,
              borderColor: theme.border,
            },
          ]}
        >
          {todaysTasks.length === 0 ? (
            <Text
              style={[
                styles.emptyText,
                { color: theme.textSecondary },
              ]}
            >
              No active tasks for today.
            </Text>
          ) : (
            todaysTasks.map((task) => (
              <View
                key={task.id}
                style={[
                  styles.taskRow,
                  {
                    borderBottomColor: theme.border,
                  },
                ]}
              >
                <TouchableOpacity
                  style={styles.taskLeft}
                  onPress={() =>
                    toggleTaskCompletion(task.id)
                  }
                >
                  <Ionicons
                    name={
                      task.completed
                        ? 'checkmark-circle'
                        : 'ellipse-outline'
                    }
                    size={22}
                    color={
                      task.completed
                        ? theme.efficiencyAccent
                        : theme.textSecondary
                    }
                  />

                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.taskTitle,
                        {
                          color: task.completed
                            ? theme.textSecondary
                            : theme.textPrimary,
                          textDecorationLine:
                            task.completed
                              ? 'line-through'
                              : 'none',
                        },
                      ]}
                    >
                      {task.title}
                    </Text>

                    {task.timeBlock && (
                      <Text
                        style={[
                          styles.taskTime,
                          {
                            color:
                              theme.textSecondary,
                          },
                        ]}
                      >
                        {task.timeBlock}
                      </Text>
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
                            ? theme.danger
                            : task.priority ===
                                'Medium'
                              ? theme.warning
                              : theme.success,
                      },
                    ]}
                  >
                    {task.priority.toUpperCase()}
                  </Text>

                  <TouchableOpacity
                    onPress={() =>
                      deleteTask(task.id)
                    }
                  >
                    <Ionicons
                      name="trash-outline"
                      size={16}
                      color={theme.danger}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}

          <View
            style={[
              styles.calendarSyncRow,
              { borderTopColor: theme.border },
            ]}
          >
            <View
              style={{
                flex: 1,
                paddingRight: 8,
              }}
            >
              <Text
                style={[
                  styles.syncTitle,
                  { color: theme.textPrimary },
                ]}
              >
                Calendar Event Sync
              </Text>

              <Text
                style={[
                  styles.syncSub,
                  { color: theme.textSecondary },
                ]}
              >
                Calendar preference is controlled from
                your saved profile.
              </Text>
            </View>

            <Switch
              value={calendarSyncActive}
              disabled
            />
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={taskModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() =>
          setTaskModalVisible(false)
        }
      >
        <KeyboardAvoidingView
          behavior={
            Platform.OS === 'ios'
              ? 'padding'
              : 'height'
          }
          style={styles.modalOverlay}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            contentContainerStyle={[
              styles.modalContent,
              {
                backgroundColor:
                  theme.cardBackground,
              },
            ]}
          >
            <Text
              style={[
                styles.modalTitle,
                { color: theme.textPrimary },
              ]}
            >
              Add Priority Task
            </Text>

            <View style={styles.inputGroup}>
              <Text
                style={[
                  styles.inputLabel,
                  { color: theme.textSecondary },
                ]}
              >
                Task Title
              </Text>

              <TextInput
                style={[
                  styles.input,
                  {
                    borderColor: theme.border,
                    color: theme.textPrimary,
                    backgroundColor:
                      theme.background,
                  },
                ]}
                placeholder="e.g. Execute Async Data Review"
                placeholderTextColor={
                  theme.textSecondary
                }
                value={newTaskTitle}
                onChangeText={setNewTaskTitle}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text
                style={[
                  styles.inputLabel,
                  { color: theme.textSecondary },
                ]}
              >
                Time Block (Optional)
              </Text>

              <TextInput
                style={[
                  styles.input,
                  {
                    borderColor: theme.border,
                    color: theme.textPrimary,
                    backgroundColor:
                      theme.background,
                  },
                ]}
                placeholder="e.g. 14:00 - 15:30"
                placeholderTextColor={
                  theme.textSecondary
                }
                value={newTaskTime}
                onChangeText={setNewTaskTime}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text
                style={[
                  styles.inputLabel,
                  { color: theme.textSecondary },
                ]}
              >
                Priority Level
              </Text>

              <View style={styles.prioritySelector}>
                {(
                  [
                    'High',
                    'Medium',
                    'Low',
                  ] as TaskPriority[]
                ).map((priority) => (
                  <TouchableOpacity
                    key={priority}
                    style={[
                      styles.priorityPillBtn,
                      newTaskPriority ===
                        priority && {
                        backgroundColor:
                          '#8B5CF6',
                      },
                    ]}
                    onPress={() =>
                      setNewTaskPriority(
                        priority
                      )
                    }
                  >
                    <Text
                      style={[
                        styles.priorityPillBtnText,
                        {
                          color:
                            newTaskPriority ===
                            priority
                              ? '#FFFFFF'
                              : theme.textSecondary,
                        },
                      ]}
                    >
                      {priority}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  {
                    borderColor: theme.border,
                    borderWidth: 1,
                  },
                ]}
                onPress={() =>
                  setTaskModalVisible(false)
                }
              >
                <Text
                  style={{
                    color: theme.textPrimary,
                    fontWeight: '700',
                  }}
                >
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  {
                    backgroundColor:
                      '#8B5CF6',
                  },
                ]}
                onPress={handleAddTask}
              >
                <Text
                  style={{
                    color: '#FFFFFF',
                    fontWeight: '800',
                  }}
                >
                  Create Task
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={manualLogVisible}
        animationType="slide"
        transparent
        onRequestClose={() =>
          setManualLogVisible(false)
        }
      >
        <KeyboardAvoidingView
          behavior={
            Platform.OS === 'ios'
              ? 'padding'
              : 'height'
          }
          style={styles.modalOverlay}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            contentContainerStyle={[
              styles.modalContent,
              {
                backgroundColor:
                  theme.cardBackground,
              },
            ]}
          >
            <Text
              style={[
                styles.modalTitle,
                { color: theme.textPrimary },
              ]}
            >
              Log Focus Time
            </Text>

            <View style={styles.inputGroup}>
              <Text
                style={[
                  styles.inputLabel,
                  { color: theme.textSecondary },
                ]}
              >
                Minutes
              </Text>

              <TextInput
                style={[
                  styles.input,
                  {
                    borderColor: theme.border,
                    color: theme.textPrimary,
                    backgroundColor:
                      theme.background,
                  },
                ]}
                value={manualMinutes}
                onChangeText={setManualMinutes}
                keyboardType="numeric"
                placeholder="e.g. 90"
                placeholderTextColor={
                  theme.textSecondary
                }
              />
            </View>

            <View style={styles.inputGroup}>
              <Text
                style={[
                  styles.inputLabel,
                  { color: theme.textSecondary },
                ]}
              >
                Focus Label (Optional)
              </Text>

              <TextInput
                style={[
                  styles.input,
                  {
                    borderColor: theme.border,
                    color: theme.textPrimary,
                    backgroundColor:
                      theme.background,
                  },
                ]}
                value={manualLabel}
                onChangeText={setManualLabel}
                placeholder="e.g. Product planning"
                placeholderTextColor={
                  theme.textSecondary
                }
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  {
                    borderColor: theme.border,
                    borderWidth: 1,
                  },
                ]}
                onPress={() =>
                  setManualLogVisible(false)
                }
              >
                <Text
                  style={{
                    color: theme.textPrimary,
                    fontWeight: '700',
                  }}
                >
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  {
                    backgroundColor:
                      '#8B5CF6',
                  },
                ]}
                onPress={handleManualLog}
              >
                <Text
                  style={{
                    color: '#FFFFFF',
                    fontWeight: '800',
                  }}
                >
                  Save Session
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  fixedHeader: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 10,
    elevation: 2,
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 18,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    marginTop: 3,
  },

  title: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
  },

  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  card: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    gap: 14,
  },

  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },

  iconFrame: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  cardTitle: {
    fontSize: 17,
    fontWeight: '900',
  },

  cardMeta: {
    fontSize: 12,
    marginTop: 1,
  },

  progressPercent: {
    fontSize: 18,
    fontWeight: '900',
  },

  progressBarTrack: {
    height: 7,
    borderRadius: 999,
    overflow: 'hidden',
  },

  progressBarFill: {
    height: '100%',
    borderRadius: 999,
  },

  timerBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 4,
    gap: 12,
  },

  timerLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },

  timerDisplay: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.5,
  },

  timerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },

  timerBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },

  manualLogButton: {
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 10,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  manualLogButtonText: {
    fontSize: 12,
    fontWeight: '800',
  },

  aiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  aiBody: {
    fontSize: 13,
    lineHeight: 18,
  },

  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },

  sectionHeading: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },

  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 4,
  },

  addBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },

  emptyText: {
    fontSize: 12,
    fontStyle: 'italic',
  },

  taskRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },

  taskLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    paddingRight: 10,
  },

  taskTitle: {
    fontSize: 13,
    fontWeight: '700',
  },

  taskTime: {
    fontSize: 11,
    marginTop: 2,
  },

  taskRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  priorityPill: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  calendarSyncRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
  },

  syncTitle: {
    fontSize: 13,
    fontWeight: '700',
  },

  syncSub: {
    fontSize: 11,
    marginTop: 2,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },

  modalContent: {
    padding: 20,
    borderRadius: 16,
    gap: 14,
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },

  inputGroup: {
    gap: 6,
  },

  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
  },

  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 14,
    fontWeight: '700',
  },

  prioritySelector: {
    flexDirection: 'row',
    gap: 8,
  },

  priorityPillBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },

  priorityPillBtnText: {
    fontSize: 12,
    fontWeight: '800',
  },

  modalActions: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
    marginTop: 6,
  },

  modalBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
