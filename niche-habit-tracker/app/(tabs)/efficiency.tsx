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
  addTask,
  CalendarTask,
  deleteTask as deleteStoredTask,
  getTasks,
  setTaskCompleted,
  TaskCategory,
  TaskPriority,
} from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/storage/efficiencyStorage';
import {
  addManualDeepWorkSession,
  DeepWorkSession,
  getActiveDeepWorkSession,
  getDeepWorkSessions,
  startDeepWorkSession,
  stopDeepWorkSession,
} from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/storage/deepWorkStorage';

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

const TIME_OPTIONS = Array.from({ length: 96 }, (_, index) => {
  const totalMinutes = index * 15;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
});

const formatTaskTime = (value?: string): string => {
  if (!value) return 'Select time';

  const [hourString, minuteString] = value.split(':');
  const hour = Number(hourString);
  const minute = Number(minuteString);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return value;
  }

  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${String(minute).padStart(2, '0')} ${suffix}`;
};


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

  const [tasks, setTasks] = useState<CalendarTask[]>([]);
  const [taskBoardExpanded, setTaskBoardExpanded] = useState(false);

  const [taskModalVisible, setTaskModalVisible] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] =
    useState<TaskPriority>('Medium');
  const [newTaskCategory, setNewTaskCategory] =
    useState<TaskCategory>('Project');
  const [newTaskEstimatedMinutes, setNewTaskEstimatedMinutes] =
    useState('');
  const [newTaskStartTime, setNewTaskStartTime] = useState('');
  const [newTaskEndTime, setNewTaskEndTime] = useState('');
  const [newTaskNotes, setNewTaskNotes] = useState('');
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [timePickerTarget, setTimePickerTarget] =
    useState<'start' | 'end'>('start');

  const [manualLogVisible, setManualLogVisible] = useState(false);
  const [manualMinutes, setManualMinutes] = useState('');
  const [manualLabel, setManualLabel] = useState('');

  useEffect(() => {
    if (quickAction !== 'addTask') return;

    setTaskBoardExpanded(true);
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

      setTasks(savedTasks);
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

  const toggleTaskCompletion = async (id: string) => {
    Haptics.selectionAsync();

    const task = tasks.find((item) => item.id === id);
    if (!task) return;

    const completed = !task.completed;

    // Optimistic UI update so the interaction feels immediate.
    setTasks((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              completed,
              completedAt: completed
                ? new Date().toISOString()
                : undefined,
            }
          : item
      )
    );

    try {
      await setTaskCompleted(id, completed);
    } catch (error) {
      console.error('Failed to update task:', error);
      await loadEfficiencyData();
      Alert.alert(
        'Unable to update task',
        'Your task status could not be saved.'
      );
    }
  };

  const openTimePicker = (target: 'start' | 'end') => {
    setTimePickerTarget(target);
    setTimePickerVisible(true);
  };

  const selectTaskTime = (time: string) => {
    if (timePickerTarget === 'start') {
      setNewTaskStartTime(time);

      // Clear an invalid end time instead of silently saving a bad block.
      if (newTaskEndTime && time >= newTaskEndTime) {
        setNewTaskEndTime('');
      }
    } else {
      if (newTaskStartTime && time <= newTaskStartTime) {
        Alert.alert(
          'Choose a later time',
          'The end time must be later than the start time.'
        );
        return;
      }

      setNewTaskEndTime(time);
    }

    setTimePickerVisible(false);
  };

  const resetTaskForm = () => {
    setNewTaskTitle('');
    setNewTaskPriority('Medium');
    setNewTaskCategory('Project');
    setNewTaskEstimatedMinutes('');
    setNewTaskStartTime('');
    setNewTaskEndTime('');
    setNewTaskNotes('');
  };

  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) {
      Alert.alert(
        'Input Error',
        'Please enter a task title.'
      );
      return;
    }

    const estimatedMinutes = newTaskEstimatedMinutes.trim()
      ? Math.round(Number(newTaskEstimatedMinutes))
      : undefined;

    if (
      estimatedMinutes !== undefined &&
      (!Number.isFinite(estimatedMinutes) || estimatedMinutes <= 0)
    ) {
      Alert.alert(
        'Check estimated duration',
        'Enter a duration greater than 0 minutes.'
      );
      return;
    }

    if (
      newTaskStartTime &&
      newTaskEndTime &&
      newTaskEndTime <= newTaskStartTime
    ) {
      Alert.alert(
        'Check task time',
        'The end time must be later than the start time.'
      );
      return;
    }

    try {
      const saved = await addTask({
        title: newTaskTitle.trim(),
        category: newTaskCategory,
        priority: newTaskPriority,
        date: todayKey,
        startTime: newTaskStartTime || undefined,
        endTime: newTaskEndTime || undefined,
        estimatedMinutes,
        completed: false,
        notes: newTaskNotes.trim() || undefined,
        source: 'manual',
      });

      setTasks((current) => [...current, saved]);
      resetTaskForm();
      setTaskModalVisible(false);

      await Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success
      );
    } catch (error) {
      console.error('Failed to create task:', error);
      Alert.alert(
        'Unable to save',
        'Your task could not be created.'
      );
    }
  };

  const deleteTask = async (id: string) => {
    Haptics.impactAsync(
      Haptics.ImpactFeedbackStyle.Light
    );

    const previousTasks = tasks;
    setTasks((current) => current.filter((task) => task.id !== id));

    try {
      await deleteStoredTask(id);
    } catch (error) {
      console.error('Failed to delete task:', error);
      setTasks(previousTasks);
      Alert.alert(
        'Unable to delete',
        'Your task could not be deleted.'
      );
    }
  };

  const todaysTasks = useMemo(
    () => tasks.filter((task) => task.date === todayKey),
    [tasks, todayKey]
  );

  const priorityRank: Record<TaskPriority, number> = {
    High: 0,
    Medium: 1,
    Low: 2,
  };

  const scheduledTasks = useMemo(
    () =>
      todaysTasks
        .filter((task) => !task.completed && Boolean(task.startTime))
        .sort((a, b) => {
          const timeCompare = (a.startTime || '').localeCompare(
            b.startTime || ''
          );

          if (timeCompare !== 0) return timeCompare;

          return priorityRank[a.priority] - priorityRank[b.priority];
        }),
    [todaysTasks]
  );

  const priorityTasks = useMemo(
    () =>
      todaysTasks
        .filter((task) => !task.completed && !task.startTime)
        .sort((a, b) => {
          const priorityCompare =
            priorityRank[a.priority] - priorityRank[b.priority];

          if (priorityCompare !== 0) return priorityCompare;

          if (a.dueDate && b.dueDate) {
            const dueCompare = a.dueDate.localeCompare(b.dueDate);
            if (dueCompare !== 0) return dueCompare;
          } else if (a.dueDate) {
            return -1;
          } else if (b.dueDate) {
            return 1;
          }

          return a.createdAt.localeCompare(b.createdAt);
        }),
    [todaysTasks]
  );

  const completedTasks = useMemo(
    () =>
      todaysTasks
        .filter((task) => task.completed)
        .sort((a, b) =>
          (b.completedAt || '').localeCompare(a.completedAt || '')
        ),
    [todaysTasks]
  );

  const completedTaskCount = completedTasks.length;
  const remainingTaskCount =
    scheduledTasks.length + priorityTasks.length;

  const remainingEstimatedMinutes = useMemo(
    () =>
      [...scheduledTasks, ...priorityTasks].reduce(
        (total, task) => total + (task.estimatedMinutes || 0),
        0
      ),
    [scheduledTasks, priorityTasks]
  );

  const formatDurationSummary = (minutes: number): string => {
    if (minutes <= 0) return 'No duration estimates';

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (hours > 0 && remainingMinutes > 0) {
      return `${hours}h ${remainingMinutes}m remaining`;
    }

    if (hours > 0) {
      return `${hours}h remaining`;
    }

    return `${remainingMinutes}m remaining`;
  };

  const renderPlanTask = (
    task: CalendarTask,
    showSchedule = false
  ) => (
    <View
      key={task.id}
      style={[
        styles.planTaskRow,
        { borderBottomColor: theme.border },
      ]}
    >
      <TouchableOpacity
        style={styles.planTaskMain}
        onPress={() => toggleTaskCompletion(task.id)}
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
              styles.planTaskTitle,
              {
                color: task.completed
                  ? theme.textSecondary
                  : theme.textPrimary,
                textDecorationLine: task.completed
                  ? 'line-through'
                  : 'none',
              },
            ]}
          >
            {task.title}
          </Text>

          <View style={styles.planTaskMetaRow}>
            {showSchedule && task.startTime && (
              <Text
                style={[
                  styles.planTaskMeta,
                  { color: theme.efficiencyAccent },
                ]}
              >
                {formatTaskTime(task.startTime)}
                {task.endTime
                  ? ` - ${formatTaskTime(task.endTime)}`
                  : ''}
              </Text>
            )}

            {!showSchedule && task.estimatedMinutes && (
              <Text
                style={[
                  styles.planTaskMeta,
                  { color: theme.textSecondary },
                ]}
              >
                {task.estimatedMinutes} min
              </Text>
            )}

            <Text
              style={[
                styles.planPriority,
                {
                  color:
                    task.priority === 'High'
                      ? theme.danger
                      : task.priority === 'Medium'
                        ? theme.warning
                        : theme.success,
                },
              ]}
            >
              {task.priority.toUpperCase()}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    </View>
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

          {activeSessionStartedAt ? (
            <View
              style={[
                styles.collapsedTimerBox,
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
                  FOCUS SESSION ACTIVE
                </Text>
                <Text
                  style={[
                    styles.timerDisplay,
                    { color: theme.textPrimary },
                  ]}
                >
                  {formatTimerDisplay(secondsActive)}
                </Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.timerBtn,
                  { backgroundColor: theme.danger },
                ]}
                onPress={toggleTimer}
              >
                <Ionicons
                  name="stop"
                  size={18}
                  color="#FFFFFF"
                />
                <Text style={styles.timerBtnText}>
                  Stop & Save
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
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
            </>
          )}
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
          <View style={styles.planHeader}>
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
                  name="today-outline"
                  size={20}
                  color={theme.efficiencyAccent}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.cardTitle,
                    { color: theme.textPrimary },
                  ]}
                >
                  Today&apos;s Plan
                </Text>

                <Text
                  style={[
                    styles.planSummary,
                    { color: theme.textSecondary },
                  ]}
                >
                  {completedTaskCount} of {todaysTasks.length} completed
                  {' • '}
                  {formatDurationSummary(
                    remainingEstimatedMinutes
                  )}
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.remainingBadge,
                {
                  backgroundColor:
                    `${theme.efficiencyAccent}18`,
                },
              ]}
            >
              <Text
                style={[
                  styles.remainingBadgeText,
                  { color: theme.efficiencyAccent },
                ]}
              >
                {remainingTaskCount} LEFT
              </Text>
            </View>
          </View>

          {todaysTasks.length === 0 ? (
            <View style={styles.planEmptyState}>
              <Ionicons
                name="checkmark-done-outline"
                size={24}
                color={theme.textSecondary}
              />
              <Text
                style={[
                  styles.emptyText,
                  {
                    color: theme.textSecondary,
                    textAlign: 'center',
                  },
                ]}
              >
                Nothing planned yet. Add a task to start shaping
                your day.
              </Text>
            </View>
          ) : (
            <>
              {scheduledTasks.length > 0 && (
                <View style={styles.planGroup}>
                  <View style={styles.planGroupHeader}>
                    <Ionicons
                      name="time-outline"
                      size={15}
                      color={theme.efficiencyAccent}
                    />
                    <Text
                      style={[
                        styles.planGroupTitle,
                        { color: theme.textSecondary },
                      ]}
                    >
                      SCHEDULED / UP NEXT
                    </Text>
                  </View>

                  {scheduledTasks.map((task) =>
                    renderPlanTask(task, true)
                  )}
                </View>
              )}

              {priorityTasks.length > 0 && (
                <View style={styles.planGroup}>
                  <View style={styles.planGroupHeader}>
                    <Ionicons
                      name="flag-outline"
                      size={15}
                      color={theme.efficiencyAccent}
                    />
                    <Text
                      style={[
                        styles.planGroupTitle,
                        { color: theme.textSecondary },
                      ]}
                    >
                      PRIORITY TASKS
                    </Text>
                  </View>

                  {priorityTasks.map((task) =>
                    renderPlanTask(task)
                  )}
                </View>
              )}

              {completedTasks.length > 0 && (
                <View style={styles.planGroup}>
                  <View style={styles.planGroupHeader}>
                    <Ionicons
                      name="checkmark-done-outline"
                      size={15}
                      color={theme.success}
                    />
                    <Text
                      style={[
                        styles.planGroupTitle,
                        { color: theme.textSecondary },
                      ]}
                    >
                      COMPLETED
                    </Text>
                  </View>

                  {completedTasks.map((task) =>
                    renderPlanTask(task, Boolean(task.startTime))
                  )}
                </View>
              )}
            </>
          )}
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

          <View style={styles.taskBoardActions}>
            <TouchableOpacity
              style={[
                styles.boardToggleBtn,
                { borderColor: theme.border },
              ]}
              onPress={() =>
                setTaskBoardExpanded((current) => !current)
              }
            >
              <Ionicons
                name={
                  taskBoardExpanded
                    ? 'chevron-up'
                    : 'chevron-down'
                }
                size={16}
                color={theme.textSecondary}
              />
              <Text
                style={[
                  styles.boardToggleText,
                  { color: theme.textSecondary },
                ]}
              >
                {taskBoardExpanded ? 'Collapse' : 'View'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.addBtn,
                { backgroundColor: theme.efficiencyAccent },
              ]}
              onPress={() => {
                setTaskBoardExpanded(true);
                setTaskModalVisible(true);
              }}
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
        </View>

        {taskBoardExpanded ? (
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

                    {(task.startTime || task.endTime || task.estimatedMinutes) && (
                      <Text
                        style={[
                          styles.taskTime,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {task.startTime
                          ? `${formatTaskTime(task.startTime)}${
                              task.endTime
                                ? ` - ${formatTaskTime(task.endTime)}`
                                : ''
                            }`
                          : `${task.estimatedMinutes} min estimated`}
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
        ) : (
          <TouchableOpacity
            style={[
              styles.collapsedBoardCard,
              {
                backgroundColor: theme.cardBackground,
                borderColor: theme.border,
              },
            ]}
            onPress={() => setTaskBoardExpanded(true)}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.collapsedBoardTitle,
                  { color: theme.textPrimary },
                ]}
              >
                {todaysTasks.length} task
                {todaysTasks.length === 1 ? '' : 's'} today
              </Text>
              <Text
                style={[
                  styles.collapsedBoardMeta,
                  { color: theme.textSecondary },
                ]}
              >
                {completedTaskCount} completed • {remainingTaskCount} remaining
              </Text>
            </View>
            <Ionicons
              name="chevron-down"
              size={18}
              color={theme.textSecondary}
            />
          </TouchableOpacity>
        )}
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
                Schedule (Optional)
              </Text>

              <View style={styles.timeSelectorRow}>
                <TouchableOpacity
                  style={[
                    styles.timeSelector,
                    {
                      borderColor: theme.border,
                      backgroundColor: theme.background,
                    },
                  ]}
                  onPress={() => openTimePicker('start')}
                >
                  <Ionicons
                    name="time-outline"
                    size={17}
                    color={theme.efficiencyAccent}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.timeSelectorLabel,
                        { color: theme.textSecondary },
                      ]}
                    >
                      START
                    </Text>
                    <Text
                      style={[
                        styles.timeSelectorValue,
                        { color: theme.textPrimary },
                      ]}
                    >
                      {formatTaskTime(newTaskStartTime)}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-down"
                    size={16}
                    color={theme.textSecondary}
                  />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.timeSelector,
                    {
                      borderColor: theme.border,
                      backgroundColor: theme.background,
                    },
                  ]}
                  onPress={() => openTimePicker('end')}
                >
                  <Ionicons
                    name="time-outline"
                    size={17}
                    color={theme.efficiencyAccent}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.timeSelectorLabel,
                        { color: theme.textSecondary },
                      ]}
                    >
                      END
                    </Text>
                    <Text
                      style={[
                        styles.timeSelectorValue,
                        { color: theme.textPrimary },
                      ]}
                    >
                      {formatTaskTime(newTaskEndTime)}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-down"
                    size={16}
                    color={theme.textSecondary}
                  />
                </TouchableOpacity>
              </View>

              {(newTaskStartTime || newTaskEndTime) && (
                <TouchableOpacity
                  onPress={() => {
                    setNewTaskStartTime('');
                    setNewTaskEndTime('');
                  }}
                >
                  <Text
                    style={[
                      styles.clearScheduleText,
                      { color: theme.efficiencyAccent },
                    ]}
                  >
                    Clear scheduled time
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text
                style={[
                  styles.inputLabel,
                  { color: theme.textSecondary },
                ]}
              >
                Estimated Duration (Optional)
              </Text>

              <TextInput
                style={[
                  styles.input,
                  {
                    borderColor: theme.border,
                    color: theme.textPrimary,
                    backgroundColor: theme.background,
                  },
                ]}
                placeholder="Minutes, e.g. 90"
                placeholderTextColor={theme.textSecondary}
                keyboardType="numeric"
                value={newTaskEstimatedMinutes}
                onChangeText={setNewTaskEstimatedMinutes}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text
                style={[
                  styles.inputLabel,
                  { color: theme.textSecondary },
                ]}
              >
                Category
              </Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categorySelector}
              >
                {(
                  [
                    'Work',
                    'Project',
                    'Meeting',
                    'Personal',
                    'Fitness',
                    'Nutrition',
                    'Recovery',
                    'Other',
                  ] as TaskCategory[]
                ).map((category) => (
                  <TouchableOpacity
                    key={category}
                    style={[
                      styles.categoryPill,
                      { borderColor: theme.border },
                      newTaskCategory === category && {
                        backgroundColor: theme.efficiencyAccent,
                        borderColor: theme.efficiencyAccent,
                      },
                    ]}
                    onPress={() => setNewTaskCategory(category)}
                  >
                    <Text
                      style={[
                        styles.categoryPillText,
                        {
                          color:
                            newTaskCategory === category
                              ? '#FFFFFF'
                              : theme.textSecondary,
                        },
                      ]}
                    >
                      {category}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={styles.inputGroup}>
              <Text
                style={[
                  styles.inputLabel,
                  { color: theme.textSecondary },
                ]}
              >
                Notes (Optional)
              </Text>

              <TextInput
                style={[
                  styles.input,
                  styles.notesInput,
                  {
                    borderColor: theme.border,
                    color: theme.textPrimary,
                    backgroundColor: theme.background,
                  },
                ]}
                placeholder="Add useful context for this task"
                placeholderTextColor={theme.textSecondary}
                multiline
                value={newTaskNotes}
                onChangeText={setNewTaskNotes}
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
                onPress={() => {
                  resetTaskForm();
                  setTaskModalVisible(false);
                }}
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
        visible={timePickerVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setTimePickerVisible(false)}
      >
        <View style={styles.timePickerOverlay}>
          <View
            style={[
              styles.timePickerCard,
              {
                backgroundColor: theme.cardBackground,
                borderColor: theme.border,
              },
            ]}
          >
            <View style={styles.timePickerHeader}>
              <View>
                <Text
                  style={[
                    styles.modalTitle,
                    { color: theme.textPrimary },
                  ]}
                >
                  Select {timePickerTarget === 'start' ? 'Start' : 'End'} Time
                </Text>
                <Text
                  style={[
                    styles.timePickerHint,
                    { color: theme.textSecondary },
                  ]}
                >
                  Choose a time in 15-minute intervals.
                </Text>
              </View>

              <TouchableOpacity
                style={styles.closeTimePickerButton}
                onPress={() => setTimePickerVisible(false)}
              >
                <Ionicons
                  name="close"
                  size={22}
                  color={theme.textPrimary}
                />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              style={styles.timeOptionsList}
            >
              {TIME_OPTIONS.map((time) => {
                const selected =
                  timePickerTarget === 'start'
                    ? newTaskStartTime === time
                    : newTaskEndTime === time;

                return (
                  <TouchableOpacity
                    key={time}
                    style={[
                      styles.timeOption,
                      { borderBottomColor: theme.border },
                      selected && {
                        backgroundColor: `${theme.efficiencyAccent}18`,
                      },
                    ]}
                    onPress={() => selectTaskTime(time)}
                  >
                    <Text
                      style={[
                        styles.timeOptionText,
                        {
                          color: selected
                            ? theme.efficiencyAccent
                            : theme.textPrimary,
                        },
                      ]}
                    >
                      {formatTaskTime(time)}
                    </Text>

                    {selected && (
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color={theme.efficiencyAccent}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
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

  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },

  planSummary: {
    fontSize: 11,
    marginTop: 2,
    fontWeight: '600',
  },

  remainingBadge: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
  },

  remainingBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.6,
  },

  planEmptyState: {
    minHeight: 90,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 24,
  },

  planGroup: {
    gap: 2,
  },

  planGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
    marginBottom: 2,
  },

  planGroupTitle: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },

  planTaskRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
  },

  planTaskMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  planTaskTitle: {
    fontSize: 13,
    fontWeight: '800',
  },

  planTaskMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 3,
  },

  planTaskMeta: {
    fontSize: 10,
    fontWeight: '700',
  },

  planPriority: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.4,
  },

  collapsedTimerBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
  },

  taskBoardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  boardToggleBtn: {
    minHeight: 32,
    paddingHorizontal: 9,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  boardToggleText: {
    fontSize: 11,
    fontWeight: '800',
  },

  collapsedBoardCard: {
    minHeight: 64,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  collapsedBoardTitle: {
    fontSize: 13,
    fontWeight: '800',
  },

  collapsedBoardMeta: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
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

  timeSelectorRow: {
    flexDirection: 'row',
    gap: 10,
  },

  timeSelector: {
    flex: 1,
    minHeight: 58,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  timeSelectorLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.7,
  },

  timeSelectorValue: {
    fontSize: 13,
    fontWeight: '800',
    marginTop: 2,
  },

  clearScheduleText: {
    fontSize: 11,
    fontWeight: '800',
    alignSelf: 'flex-end',
    marginTop: 2,
  },

  categorySelector: {
    gap: 8,
    paddingRight: 4,
  },

  categoryPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },

  categoryPillText: {
    fontSize: 11,
    fontWeight: '800',
  },

  notesInput: {
    minHeight: 84,
    height: 84,
    paddingTop: 12,
    textAlignVertical: 'top',
  },

  timePickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },

  timePickerCard: {
    maxHeight: '72%',
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },

  timePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 18,
  },

  timePickerHint: {
    fontSize: 11,
    marginTop: 3,
  },

  closeTimePickerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  timeOptionsList: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },

  timeOption: {
    minHeight: 48,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  timeOptionText: {
    fontSize: 14,
    fontWeight: '700',
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
