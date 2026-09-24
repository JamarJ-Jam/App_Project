import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useTheme } from '../../src/context/ThemeContext';
import { LightTheme } from '../../src/constants/colors';
import { loadUserProfile } from '../../src/storage/userProfileStorage';
import {
  addTask,
  CalendarTask,
  deleteTask as deleteStoredTask,
  getTasks,
  setTaskCompleted,
  TaskCategory,
  TaskPriority,
  updateTask,
} from '../../src/storage/efficiencyStorage';
import {
  addManualDeepWorkSession,
  DeepWorkSession,
  getActiveDeepWorkSession,
  getDeepWorkSessions,
  startDeepWorkSession,
  stopDeepWorkSession,
} from '../../src/storage/deepWorkStorage';
import { cancelStoredTaskNotifications } from '../../src/services/taskNotificationService';
import {
  CalendarEventContext,
  getCalendarEventContext,
  rescheduleCalendarEvent,
} from '../../src/services/calendarTaskService';

const toLocalDateKey = (date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getElapsedSeconds = (startedAt?: string): number => {
  if (!startedAt) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
};

const formatTimerDisplay = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secondsRemaining = seconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secondsRemaining).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(secondsRemaining).padStart(2, '0')}`;
};

const TIME_OPTIONS = Array.from({ length: 96 }, (_, index) => {
  const totalMinutes = index * 15;
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
});

const formatTaskTime = (value?: string): string => {
  if (!value) return 'Select time';
  const [hourString, minuteString] = value.split(':');
  const hour = Number(hourString);
  const minute = Number(minuteString);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return value;
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
};

const fromLocalDateKey = (dateKey: string): Date => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const getMonthCells = (month: Date): Array<number | null> => {
  const cells: Array<number | null> = [];
  const firstWeekday = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  for (let index = 0; index < firstWeekday; index += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
};

const formatTaskDate = (dateKey: string): string =>
  fromLocalDateKey(dateKey).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });

const getRouteParam = (
  value?: string | string[]
): string | undefined =>
  Array.isArray(value) ? value[0] : value;

export default function EfficiencyScreen() {
  const { theme = LightTheme } = useTheme() || {};
  const router = useRouter();
  const { quickAction, mode, taskId, source, externalEventId, calendarId } = useLocalSearchParams<{
    quickAction?: string | string[];
    mode?: string | string[];
    taskId?: string | string[];
    source?: string | string[];
    externalEventId?: string | string[];
    calendarId?: string | string[];
  }>();
  const normalizedQuickAction = getRouteParam(quickAction);
  const normalizedMode = getRouteParam(mode);
  const normalizedTaskId = getRouteParam(taskId);
  const normalizedSource = getRouteParam(source);
  const normalizedExternalEventId = getRouteParam(externalEventId);
  const normalizedCalendarId = getRouteParam(calendarId);
  const [workSetup, setWorkSetup] = useState('Remote');
  const [scheduleType, setScheduleType] = useState('Asynchronous');
  const [dailyTargetHours, setDailyTargetHours] = useState(0);
  const [deepWorkSessions, setDeepWorkSessions] = useState<DeepWorkSession[]>([]);
  const [activeSessionStartedAt, setActiveSessionStartedAt] = useState<string | null>(null);
  const [secondsActive, setSecondsActive] = useState(0);
  const [calendarSyncActive, setCalendarSyncActive] = useState(false);
  const [tasks, setTasks] = useState<CalendarTask[]>([]);
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const [taskBoardExpanded, setTaskBoardExpanded] = useState(false);
  const [taskModalVisible, setTaskModalVisible] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskFormMode, setTaskFormMode] = useState<'add' | 'edit' | 'reschedule' | 'calendar-reschedule'>('add');
  const [calendarEventContext, setCalendarEventContext] = useState<CalendarEventContext | null>(null);
  const [calendarEventId, setCalendarEventId] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>('Medium');
  const [newTaskCategory, setNewTaskCategory] = useState<TaskCategory>('Project');
  const [newTaskDate, setNewTaskDate] = useState(() => toLocalDateKey());
  const [newTaskEstimatedMinutes, setNewTaskEstimatedMinutes] = useState('');
  const [newTaskStartTime, setNewTaskStartTime] = useState('');
  const [newTaskEndTime, setNewTaskEndTime] = useState('');
  const [newTaskNotes, setNewTaskNotes] = useState('');
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [timePickerTarget, setTimePickerTarget] = useState<'start' | 'end'>('start');
  const [exactTimeMode, setExactTimeMode] = useState(false);
  const [exactHour, setExactHour] = useState(12);
  const [exactMinute, setExactMinute] = useState(0);
  const [exactPeriod, setExactPeriod] = useState<'AM' | 'PM'>('AM');
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [datePickerMonth, setDatePickerMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [manualLogVisible, setManualLogVisible] = useState(false);
  const [manualMinutes, setManualMinutes] = useState('');
  const [manualLabel, setManualLabel] = useState('');

  const todayKey = toLocalDateKey();

  const loadEfficiencyData = useCallback(async () => {
    try {
      const [profile, savedTasks, sessions, activeSession] = await Promise.all([
        loadUserProfile(), getTasks(), getDeepWorkSessions(), getActiveDeepWorkSession(),
      ]);
      setWorkSetup(profile.workLocation || 'Remote');
      setScheduleType(profile.scheduleType || 'Asynchronous');
      setDailyTargetHours(Number(profile.deepWorkHours) || 0);
      setCalendarSyncActive(Boolean(profile.calendarSyncEnabled));
      setTasks(savedTasks);
      setTasksLoaded(true);
      setDeepWorkSessions(sessions);
      if (activeSession) {
        setActiveSessionStartedAt(activeSession.startedAt);
        setSecondsActive(getElapsedSeconds(activeSession.startedAt));
      } else {
        setActiveSessionStartedAt(null);
        setSecondsActive(0);
      }
    } catch (error) {
      setTasksLoaded(true);
      console.error('Failed to load efficiency data:', error);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    loadEfficiencyData();
  }, [loadEfficiencyData]));

  useEffect(() => {
    if (!activeSessionStartedAt) return;
    const interval = setInterval(() => setSecondsActive(getElapsedSeconds(activeSessionStartedAt)), 1000);
    return () => clearInterval(interval);
  }, [activeSessionStartedAt]);

  const todaysSessions = useMemo(
    () => deepWorkSessions.filter((session) => session.date === todayKey),
    [deepWorkSessions, todayKey]
  );
  const loggedMinutes = todaysSessions.reduce((sum, session) => sum + Number(session.durationMinutes || 0), 0);
  const loggedHours = loggedMinutes / 60;
  const targetMinutes = dailyTargetHours * 60;
  const progressPercent = targetMinutes > 0 ? Math.min((loggedMinutes / targetMinutes) * 100, 100) : 0;

  const toggleTimer = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      if (activeSessionStartedAt) {
        const saved = await stopDeepWorkSession();
        setActiveSessionStartedAt(null);
        setSecondsActive(0);
        if (saved) setDeepWorkSessions((current) => [saved, ...current]);
        Alert.alert('Focus Session Saved', 'Your deep work time has been added to today.');
      } else {
        const active = await startDeepWorkSession();
        setActiveSessionStartedAt(active.startedAt);
        setSecondsActive(getElapsedSeconds(active.startedAt));
      }
    } catch (error) {
      console.error('Deep work timer error:', error);
      Alert.alert('Unable to update timer', 'Please try again.');
    }
  };

  const handleManualLog = async () => {
    const minutes = Math.round(Number.parseFloat(manualMinutes));
    if (!Number.isFinite(minutes) || minutes <= 0) {
      Alert.alert('Enter focus time', 'Enter the number of minutes you completed.');
      return;
    }
    try {
      const saved = await addManualDeepWorkSession({ durationMinutes: minutes, title: manualLabel.trim() || undefined });
      setDeepWorkSessions((current) => [saved, ...current]);
      setManualMinutes('');
      setManualLabel('');
      setManualLogVisible(false);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Manual deep work log error:', error);
      Alert.alert('Unable to save', 'Your focus session could not be saved.');
    }
  };

  const toggleTaskCompletion = async (id: string) => {
    Haptics.selectionAsync();
    const task = tasks.find((item) => item.id === id);
    if (!task) return;
    const completed = !task.completed;
    setTasks((current) => current.map((item) => item.id === id ? {
      ...item,
      completed,
      completedAt: completed ? new Date().toISOString() : undefined,
    } : item));
    try {
      await setTaskCompleted(id, completed);
      if (completed) {
        await cancelStoredTaskNotifications(id);
      }
    } catch (error) {
      console.error('Failed to update task:', error);
      await loadEfficiencyData();
      Alert.alert('Unable to update task', 'Your task status could not be saved.');
    }
  };

  const openTimePicker = (target: 'start' | 'end') => {
    setTimePickerTarget(target);
    setExactTimeMode(false);
    setTimePickerVisible(true);
  };

  const prepareExactTime = () => {
    const value =
      timePickerTarget === 'start'
        ? newTaskStartTime
        : newTaskEndTime;
    const [hourString, minuteString] = (value || '12:00').split(':');
    const hour24 = Number(hourString);
    const minute = Number(minuteString);
    const validHour = Number.isInteger(hour24) && hour24 >= 0 && hour24 <= 23
      ? hour24
      : 12;
    const validMinute = Number.isInteger(minute) && minute >= 0 && minute <= 59
      ? minute
      : 0;

    setExactHour(validHour % 12 || 12);
    setExactMinute(validMinute);
    setExactPeriod(validHour >= 12 ? 'PM' : 'AM');
    setExactTimeMode(true);
  };

  const applyExactTime = () => {
    let hour24 = exactHour % 12;
    if (exactPeriod === 'PM') hour24 += 12;

    const time = `${String(hour24).padStart(2, '0')}:${String(
      exactMinute
    ).padStart(2, '0')}`;
    selectTaskTime(time);
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
    setNewTaskDate(toLocalDateKey());
    setNewTaskEstimatedMinutes('');
    setNewTaskStartTime('');
    setNewTaskEndTime('');
    setNewTaskNotes('');
  };

  useEffect(() => {
    if (normalizedQuickAction !== 'addTask') return;

    setEditingTaskId(null);
    setTaskFormMode('add');
    resetTaskForm();
    setTaskBoardExpanded(true);
    setTaskModalVisible(true);
    router.setParams({ quickAction: '' });
  }, [normalizedQuickAction]);

  const openTaskEditor = (
    task: CalendarTask,
    formMode: 'edit' | 'reschedule'
  ) => {
    if (task.source !== 'manual' && task.source !== 'chawgee') {
      Alert.alert(
        'Task cannot be edited',
        'Calendar events are managed by the calendar provider.'
      );
      return;
    }

    setEditingTaskId(task.id);
    setTaskFormMode(formMode);
    setNewTaskTitle(task.title);
    setNewTaskPriority(task.priority);
    setNewTaskCategory(task.category);
    setNewTaskDate(task.date);
    setNewTaskEstimatedMinutes(
      task.estimatedMinutes?.toString() || ''
    );
    setNewTaskStartTime(task.startTime || '');
    setNewTaskEndTime(task.endTime || '');
    setNewTaskNotes(task.notes || '');
    setTaskBoardExpanded(true);
    setTaskModalVisible(true);
  };

  useEffect(() => {
    if (
      normalizedMode !== 'reschedule' ||
      !normalizedTaskId ||
      !tasksLoaded
    ) {
      return;
    }

    const task = tasks.find(
      (item) => item.id === normalizedTaskId
    );

    if (!task) {
      Alert.alert(
        'Task unavailable',
        'That task could not be found.'
      );
      router.setParams({ mode: '', taskId: '' });
      return;
    }

    if (task.source !== 'manual' && task.source !== 'chawgee') {
      Alert.alert(
        'Task cannot be rescheduled here',
        'Calendar events are managed by the calendar provider.'
      );
      router.setParams({ mode: '', taskId: '' });
      return;
    }

    openTaskEditor(task, 'reschedule');
    router.setParams({ mode: '', taskId: '' });
  }, [normalizedMode, normalizedTaskId, tasks, tasksLoaded]);

  useEffect(() => {
    if (
      normalizedMode !== 'calendar-reschedule' ||
      normalizedSource !== 'calendar' ||
      !normalizedExternalEventId
    ) {
      return;
    }

    let cancelled = false;

    const loadCalendarEvent = async () => {
      const result = await getCalendarEventContext(
        normalizedExternalEventId,
        normalizedCalendarId
      );

      if (cancelled) return;

      if (!result.ok) {
        Alert.alert('Calendar event unavailable', result.message);
        return;
      }

      setCalendarEventContext(result.value);
      setCalendarEventId(result.value.externalEventId);
      setTaskFormMode('calendar-reschedule');
      setNewTaskTitle(result.value.event.title || 'Calendar Event');
      setNewTaskDate(toLocalDateKey(result.value.startDate));
      setNewTaskStartTime(
        `${String(result.value.startDate.getHours()).padStart(2, '0')}:${String(
          result.value.startDate.getMinutes()
        ).padStart(2, '0')}`
      );
      setNewTaskEndTime(
        `${String(result.value.endDate.getHours()).padStart(2, '0')}:${String(
          result.value.endDate.getMinutes()
        ).padStart(2, '0')}`
      );
      setTaskBoardExpanded(true);
      setTaskModalVisible(true);
      router.setParams({
        mode: '',
        source: '',
        externalEventId: '',
        calendarId: '',
      });
    };

    loadCalendarEvent();

    return () => {
      cancelled = true;
    };
  }, [
    normalizedMode,
    normalizedSource,
    normalizedExternalEventId,
    normalizedCalendarId,
  ]);

  const openDatePicker = () => {
    const selectedDate = fromLocalDateKey(newTaskDate);
    setDatePickerMonth(
      new Date(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        1
      )
    );
    setDatePickerVisible(true);
  };

  const selectTaskDate = (day: number) => {
    const selectedDate = new Date(
      datePickerMonth.getFullYear(),
      datePickerMonth.getMonth(),
      day
    );
    const selectedKey = toLocalDateKey(selectedDate);

    if (selectedKey < todayKey) return;

    setNewTaskDate(selectedKey);
    setDatePickerVisible(false);
  };

  const handleSaveTask = async () => {
    if (taskFormMode === 'calendar-reschedule') {
      if (!calendarEventContext || !calendarEventId) {
        Alert.alert(
          'Calendar event unavailable',
          'This event could not be loaded for rescheduling.'
        );
        return;
      }

      if (!newTaskStartTime) {
        Alert.alert(
          'Choose a start time',
          'A calendar event needs a start time.'
        );
        return;
      }

      const [startHour, startMinute] = newTaskStartTime
        .split(':')
        .map(Number);
      const [endHour, endMinute] = (newTaskEndTime || '')
        .split(':')
        .map(Number);
      const nextStart = fromLocalDateKey(newTaskDate);
      nextStart.setHours(startHour, startMinute, 0, 0);
      const nextEnd = newTaskEndTime
        ? fromLocalDateKey(newTaskDate)
        : undefined;

      if (nextEnd) {
        nextEnd.setHours(endHour, endMinute, 0, 0);
      }

      const result = await rescheduleCalendarEvent(
        calendarEventId,
        nextStart,
        nextEnd,
        calendarEventContext.calendarId
      );

      if (!result.ok) {
        Alert.alert('Unable to reschedule event', result.message);
        return;
      }

      setCalendarEventContext(null);
      resetTaskForm();
      setTaskFormMode('add');
      setTaskModalVisible(false);
      router.replace('/(tabs)/dashboard');
      return;
    }

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
      let saved: CalendarTask | null;

      if (editingTaskId) {
        const originalTask = tasks.find(
          (task) => task.id === editingTaskId
        );

        if (!originalTask) {
          throw new Error('Task was not found while saving.');
        }

        const scheduleChanged =
          originalTask.date !== newTaskDate ||
          (originalTask.startTime || '') !==
            (newTaskStartTime || '') ||
          (originalTask.endTime || '') !==
            (newTaskEndTime || '');
        const shouldClearOutcome =
          taskFormMode === 'reschedule' ||
          (scheduleChanged &&
            (originalTask.completed ||
              Boolean(originalTask.outcome)));

        saved = await updateTask(editingTaskId, {
          title: newTaskTitle.trim(),
          category: newTaskCategory,
          priority: newTaskPriority,
          date: newTaskDate,
          startTime: newTaskStartTime || undefined,
          endTime: newTaskEndTime || undefined,
          estimatedMinutes,
          notes: newTaskNotes.trim() || undefined,
          ...(shouldClearOutcome
            ? {
                completed: false,
                completedAt: undefined,
                outcome: undefined,
                outcomeAt: undefined,
              }
            : {}),
        });
      } else {
        saved = await addTask({
          title: newTaskTitle.trim(),
          category: newTaskCategory,
          priority: newTaskPriority,
          date: newTaskDate,
          startTime: newTaskStartTime || undefined,
          endTime: newTaskEndTime || undefined,
          estimatedMinutes,
          completed: false,
          notes: newTaskNotes.trim() || undefined,
          source: 'manual',
        });
      }

      if (!saved) {
        throw new Error('Task could not be saved.');
      }

      setTasks((current) =>
        editingTaskId
          ? current.map((task) =>
              task.id === saved?.id ? saved : task
            )
          : [...current, saved as CalendarTask]
      );
      resetTaskForm();
      const wasReschedule = taskFormMode === 'reschedule';
      setEditingTaskId(null);
      setTaskFormMode('add');
      setTaskModalVisible(false);

      if (wasReschedule) {
        router.replace('/(tabs)/dashboard');
      }

      await Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success
      );
    } catch (error) {
      console.error('Failed to save task:', error);
      Alert.alert(
        'Unable to save',
        'Your task could not be saved.'
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
      await cancelStoredTaskNotifications(id);
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

  const upcomingTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.date > todayKey)
        .sort((a, b) => {
          const dateCompare = a.date.localeCompare(b.date);
          if (dateCompare !== 0) return dateCompare;

          const timeCompare = (a.startTime || '').localeCompare(
            b.startTime || ''
          );
          if (timeCompare !== 0) return timeCompare;

          return priorityRank[a.priority] - priorityRank[b.priority];
        }),
    [tasks, todayKey]
  );

  const historicalTasks = useMemo(
    () =>
      tasks
        .filter(
          (task) =>
            task.date < todayKey &&
            (task.completed || task.outcome === 'missed')
        )
        .sort((a, b) => b.date.localeCompare(a.date)),
    [tasks, todayKey]
  );

  const historicalOpenTasks = useMemo(
    () =>
      tasks
        .filter(
          (task) =>
            task.date < todayKey &&
            !task.completed &&
            task.outcome !== 'missed'
        )
        .sort((a, b) => b.date.localeCompare(a.date)),
    [tasks, todayKey]
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

  const renderBoardTask = (task: CalendarTask) => {
    const isMissed = task.outcome === 'missed';
    const isCompleted = task.completed || task.outcome === 'completed';
    const canEdit =
      task.source === 'manual' || task.source === 'chawgee';

    return (
      <View
        key={task.id}
        style={[
          styles.taskRow,
          { borderBottomColor: theme.border },
        ]}
      >
        <TouchableOpacity
          style={styles.taskLeft}
          disabled={!canEdit}
          onPress={() =>
            canEdit && openTaskEditor(task, 'edit')
          }
        >
          <Ionicons
            name={
              isCompleted
                ? 'checkmark-circle'
                : isMissed
                  ? 'close-circle'
                  : 'ellipse-outline'
            }
            size={22}
            color={
              isCompleted
                ? theme.success
                : isMissed
                  ? theme.danger
                  : theme.textSecondary
            }
          />

          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.taskTitle,
                {
                  color:
                    isCompleted || isMissed
                      ? theme.textSecondary
                      : theme.textPrimary,
                  textDecorationLine: isCompleted
                    ? 'line-through'
                    : 'none',
                },
              ]}
            >
              {task.title}
            </Text>

            <Text
              style={[
                styles.taskTime,
                { color: theme.textSecondary },
              ]}
            >
              {formatTaskDate(task.date)}
              {task.startTime
                ? ` • ${formatTaskTime(task.startTime)}${
                    task.endTime
                      ? ` - ${formatTaskTime(task.endTime)}`
                      : ''
                  }`
                : ''}
            </Text>

            <View style={styles.taskBoardMetaRow}>
              <Text
                style={[
                  styles.taskBoardCategory,
                  { color: theme.textSecondary },
                ]}
              >
                {task.category}
              </Text>
              <Text
                style={[
                  styles.priorityPill,
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
              {(isCompleted || isMissed) && (
                <Text
                  style={[
                    styles.taskBoardStatus,
                    {
                      color: isMissed
                        ? theme.danger
                        : theme.success,
                    },
                  ]}
                >
                  {isMissed ? 'MISSED' : 'COMPLETED'}
                </Text>
              )}
            </View>
          </View>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => deleteTask(task.id)}>
          <Ionicons
            name="trash-outline"
            size={16}
            color={theme.danger}
          />
        </TouchableOpacity>
      </View>
    );
  };

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
                  { backgroundColor: `${theme.efficiencyAccent}18` },
                ]}
              >
                <Ionicons
                  name="flash-outline"
                  size={20}
                  color={theme.efficiencyAccent}
                />
              </View>
              <View>
                <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>Deep Work Target</Text>
                <Text style={[styles.cardMeta, { color: theme.textSecondary }]}>
                  {loggedHours.toFixed(2)} / {dailyTargetHours.toFixed(1)} Hours Goal
                </Text>
              </View>
            </View>
            <Text style={[styles.progressPercent, { color: theme.efficiencyAccent }]}>
              {progressPercent.toFixed(0)}%
            </Text>
          </View>

          {activeSessionStartedAt ? (
            <View style={[styles.collapsedTimerBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <View>
                <Text style={[styles.timerLabel, { color: theme.textSecondary }]}>FOCUS SESSION ACTIVE</Text>
                <Text style={[styles.timerDisplay, { color: theme.textPrimary }]}>
                  {formatTimerDisplay(secondsActive)}
                </Text>
              </View>
              <TouchableOpacity style={[styles.timerBtn, { backgroundColor: theme.danger }]} onPress={toggleTimer}>
                <Ionicons name="stop" size={18} color="#FFFFFF" />
                <Text style={styles.timerBtnText}>Stop & Save</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={[styles.progressBarTrack, { backgroundColor: theme.border }]}>
                <View style={[styles.progressBarFill, { backgroundColor: theme.efficiencyAccent, width: `${progressPercent}%` }]} />
              </View>
              <View style={[styles.timerBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <View>
                  <Text style={[styles.timerLabel, { color: theme.textSecondary }]}>TIMER READY</Text>
                  <Text style={[styles.timerDisplay, { color: theme.textPrimary }]}>00:00</Text>
                </View>
                <TouchableOpacity style={[styles.timerBtn, { backgroundColor: theme.efficiencyAccent }]} onPress={toggleTimer}>
                  <Ionicons name="play" size={18} color="#FFFFFF" />
                  <Text style={styles.timerBtnText}>Start Focus</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={[styles.manualLogButton, { borderColor: theme.border }]} onPress={() => setManualLogVisible(true)}>
                <Ionicons name="create-outline" size={17} color={theme.efficiencyAccent} />
                <Text style={[styles.manualLogButtonText, { color: theme.textPrimary }]}>Log focus time manually</Text>
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
                resetTaskForm();
                setEditingTaskId(null);
                setTaskFormMode('add');
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
          {todaysTasks.length > 0 && (
            <View style={styles.taskBoardSection}>
              <Text
                style={[
                  styles.taskBoardSectionTitle,
                  { color: theme.textSecondary },
                ]}
              >
                TODAY
              </Text>
              {todaysTasks.map(renderBoardTask)}
            </View>
          )}

          {upcomingTasks.length > 0 && (
            <View style={styles.taskBoardSection}>
              <Text
                style={[
                  styles.taskBoardSectionTitle,
                  { color: theme.textSecondary },
                ]}
              >
                UPCOMING
              </Text>
              {upcomingTasks.map(renderBoardTask)}
            </View>
          )}

          {(historicalTasks.length > 0 ||
            historicalOpenTasks.length > 0) && (
            <View style={styles.taskBoardSection}>
              <Text
                style={[
                  styles.taskBoardSectionTitle,
                  { color: theme.textSecondary },
                ]}
              >
                HISTORY
              </Text>
              {historicalTasks.map(renderBoardTask)}
              {historicalOpenTasks.map(renderBoardTask)}
            </View>
          )}

          {todaysTasks.length === 0 &&
            upcomingTasks.length === 0 &&
            historicalTasks.length === 0 &&
            historicalOpenTasks.length === 0 && (
              <Text
                style={[
                  styles.emptyText,
                  { color: theme.textSecondary },
                ]}
              >
                No saved tasks.
              </Text>
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
                {tasks.length} task
                {tasks.length === 1 ? '' : 's'} saved
              </Text>
              <Text
                style={[
                  styles.collapsedBoardMeta,
                  { color: theme.textSecondary },
                ]}
              >
                {todaysTasks.length} today • {upcomingTasks.length} upcoming
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
              {taskFormMode === 'calendar-reschedule'
                ? 'Reschedule Calendar Event'
                : taskFormMode === 'reschedule'
                  ? 'Reschedule Task'
                : taskFormMode === 'edit'
                  ? 'Edit Task'
                  : 'Add Priority Task'}
            </Text>

            <View style={styles.inputGroup}>
              <Text
                style={[
                  styles.inputLabel,
                  { color: theme.textSecondary },
                ]}
              >
                Date
              </Text>

              <TouchableOpacity
                style={[
                  styles.dateSelector,
                  {
                    borderColor: theme.border,
                    backgroundColor: theme.background,
                  },
                ]}
                onPress={openDatePicker}
              >
                <Ionicons
                  name="calendar-outline"
                  size={18}
                  color={theme.efficiencyAccent}
                />
                <Text
                  style={[
                    styles.dateSelectorValue,
                    { color: theme.textPrimary },
                  ]}
                >
                  {formatTaskDate(newTaskDate)}
                </Text>
                <Ionicons
                  name="chevron-down"
                  size={16}
                  color={theme.textSecondary}
                />
              </TouchableOpacity>
            </View>

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
                editable={taskFormMode !== 'calendar-reschedule'}
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

            {taskFormMode !== 'calendar-reschedule' && (
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
            )}

            {taskFormMode !== 'calendar-reschedule' && (
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
            )}

            {taskFormMode !== 'calendar-reschedule' && (
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
            )}

            {taskFormMode !== 'calendar-reschedule' && (
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
            )}

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
                  setEditingTaskId(null);
                  setTaskFormMode('add');
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
                onPress={handleSaveTask}
              >
                <Text
                  style={{
                    color: '#FFFFFF',
                    fontWeight: '800',
                  }}
                >
                  {taskFormMode === 'add'
                    ? 'Create Task'
                    : 'Save Task'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={datePickerVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setDatePickerVisible(false)}
      >
        <View style={styles.datePickerOverlay}>
          <View
            style={[
              styles.datePickerCard,
              { backgroundColor: theme.cardBackground },
            ]}
          >
            <View style={styles.datePickerHeader}>
              <View>
                <Text
                  style={[
                    styles.modalTitle,
                    { color: theme.textPrimary },
                  ]}
                >
                  Choose task date
                </Text>
                <Text
                  style={[
                    styles.datePickerHint,
                    { color: theme.textSecondary },
                  ]}
                >
                  Today or a future date
                </Text>
              </View>

              <TouchableOpacity
                style={styles.closeDatePickerButton}
                onPress={() => setDatePickerVisible(false)}
              >
                <Ionicons
                  name="close"
                  size={21}
                  color={theme.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <View
              style={[
                styles.datePickerMonthHeader,
                { borderTopColor: theme.border },
              ]}
            >
              <TouchableOpacity
                disabled={
                  datePickerMonth.getFullYear() ===
                    new Date().getFullYear() &&
                  datePickerMonth.getMonth() === new Date().getMonth()
                }
                onPress={() =>
                  setDatePickerMonth(
                    new Date(
                      datePickerMonth.getFullYear(),
                      datePickerMonth.getMonth() - 1,
                      1
                    )
                  )
                }
                style={styles.datePickerMonthButton}
              >
                <Ionicons
                  name="chevron-back"
                  size={20}
                  color={theme.textSecondary}
                />
              </TouchableOpacity>

              <Text
                style={[
                  styles.datePickerMonthTitle,
                  { color: theme.textPrimary },
                ]}
              >
                {datePickerMonth.toLocaleDateString(undefined, {
                  month: 'long',
                  year: 'numeric',
                })}
              </Text>

              <TouchableOpacity
                onPress={() =>
                  setDatePickerMonth(
                    new Date(
                      datePickerMonth.getFullYear(),
                      datePickerMonth.getMonth() + 1,
                      1
                    )
                  )
                }
                style={styles.datePickerMonthButton}
              >
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={theme.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.datePickerWeekRow}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(
                (label, index) => (
                  <Text
                    key={`${label}-${index}`}
                    style={[
                      styles.datePickerWeekLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {label}
                  </Text>
                )
              )}
            </View>

            <View style={styles.datePickerGrid}>
              {getMonthCells(datePickerMonth).map((day, index) => {
                if (day === null) {
                  return (
                    <View
                      key={`empty-date-${index}`}
                      style={styles.datePickerDay}
                    />
                  );
                }

                const selectedDate = new Date(
                  datePickerMonth.getFullYear(),
                  datePickerMonth.getMonth(),
                  day
                );
                const dateKey = toLocalDateKey(selectedDate);
                const isPast = dateKey < todayKey;
                const isSelected = dateKey === newTaskDate;

                return (
                  <TouchableOpacity
                    key={dateKey}
                    disabled={isPast}
                    onPress={() => selectTaskDate(day)}
                    style={[
                      styles.datePickerDay,
                      isSelected && {
                        backgroundColor: theme.efficiencyAccent,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.datePickerDayText,
                        {
                          color: isPast
                            ? `${theme.textSecondary}80`
                            : isSelected
                              ? '#FFFFFF'
                              : theme.textPrimary,
                        },
                      ]}
                    >
                      {day}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
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
                  {exactTimeMode
                    ? 'Choose an exact time.'
                    : 'Choose a time in 15-minute intervals.'}
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

            {exactTimeMode ? (
              <View style={styles.exactTimeContent}>
                <Text style={[styles.exactTimeLabel, { color: theme.textSecondary }]}>HOUR</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.exactTimeOptions}
                >
                  {Array.from({ length: 12 }, (_, index) => index + 1).map((hour) => (
                    <TouchableOpacity
                      key={hour}
                      style={[
                        styles.exactTimeOption,
                        { borderColor: theme.border },
                        exactHour === hour && {
                          backgroundColor: theme.efficiencyAccent,
                          borderColor: theme.efficiencyAccent,
                        },
                      ]}
                      onPress={() => setExactHour(hour)}
                    >
                      <Text style={{ color: exactHour === hour ? '#FFFFFF' : theme.textPrimary, fontWeight: '800' }}>
                        {hour}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <Text style={[styles.exactTimeLabel, { color: theme.textSecondary }]}>MINUTE</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.exactTimeOptions}
                >
                  {Array.from({ length: 60 }, (_, minute) => minute).map((minute) => (
                    <TouchableOpacity
                      key={minute}
                      style={[
                        styles.exactTimeOption,
                        { borderColor: theme.border },
                        exactMinute === minute && {
                          backgroundColor: theme.efficiencyAccent,
                          borderColor: theme.efficiencyAccent,
                        },
                      ]}
                      onPress={() => setExactMinute(minute)}
                    >
                      <Text style={{ color: exactMinute === minute ? '#FFFFFF' : theme.textPrimary, fontWeight: '800' }}>
                        {String(minute).padStart(2, '0')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <View style={styles.exactPeriodRow}>
                  {(['AM', 'PM'] as const).map((period) => (
                    <TouchableOpacity
                      key={period}
                      style={[
                        styles.exactPeriodOption,
                        { borderColor: theme.border },
                        exactPeriod === period && {
                          backgroundColor: theme.efficiencyAccent,
                          borderColor: theme.efficiencyAccent,
                        },
                      ]}
                      onPress={() => setExactPeriod(period)}
                    >
                      <Text style={{ color: exactPeriod === period ? '#FFFFFF' : theme.textPrimary, fontWeight: '800' }}>
                        {period}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  style={[styles.exactTimeApplyButton, { backgroundColor: theme.efficiencyAccent }]}
                  onPress={applyExactTime}
                >
                  <Text style={styles.exactTimeApplyText}>Use Exact Time</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => setExactTimeMode(false)}>
                  <Text style={[styles.exactTimeBackText, { color: theme.efficiencyAccent }]}>Back to 15-minute options</Text>
                </TouchableOpacity>
              </View>
            ) : (
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
            )}

            {!exactTimeMode && (
              <TouchableOpacity
                style={[styles.exactTimeLink, { borderTopColor: theme.border }]}
                onPress={prepareExactTime}
              >
                <Ionicons name="options-outline" size={16} color={theme.efficiencyAccent} />
                <Text style={[styles.exactTimeLinkText, { color: theme.efficiencyAccent }]}>Set Exact Time</Text>
              </TouchableOpacity>
            )}
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

  taskBoardSection: {
    gap: 0,
  },

  taskBoardSectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.7,
    paddingTop: 4,
    paddingBottom: 4,
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

  taskBoardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },

  taskBoardCategory: {
    fontSize: 10,
    fontWeight: '700',
  },

  taskBoardStatus: {
    fontSize: 10,
    fontWeight: '900',
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

  dateSelector: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },

  dateSelectorValue: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
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

  datePickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },

  datePickerCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },

  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 18,
  },

  datePickerHint: {
    fontSize: 11,
    marginTop: 3,
  },

  closeDatePickerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  datePickerMonthHeader: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  datePickerMonthButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },

  datePickerMonthTitle: {
    fontSize: 14,
    fontWeight: '800',
  },

  datePickerWeekRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
  },

  datePickerWeekLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '800',
    paddingVertical: 6,
  },

  datePickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingBottom: 14,
  },

  datePickerDay: {
    width: '14.2857%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },

  datePickerDayText: {
    fontSize: 13,
    fontWeight: '700',
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

  exactTimeLink: {
    minHeight: 44,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },

  exactTimeLinkText: {
    fontSize: 12,
    fontWeight: '800',
  },

  exactTimeContent: {
    padding: 16,
    gap: 8,
  },

  exactTimeLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.7,
  },

  exactTimeOptions: {
    gap: 7,
    paddingVertical: 2,
  },

  exactTimeOption: {
    minWidth: 42,
    height: 38,
    borderWidth: 1,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9,
  },

  exactPeriodRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 3,
  },

  exactPeriodOption: {
    flex: 1,
    height: 38,
    borderWidth: 1,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },

  exactTimeApplyButton: {
    minHeight: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },

  exactTimeApplyText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },

  exactTimeBackText: {
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '800',
    paddingVertical: 4,
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
