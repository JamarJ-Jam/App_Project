import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Calendar from 'expo-calendar/legacy';
import { Platform } from 'react-native';
import { getUserScopedStorageKey } from './userScopedStorage';

export type TaskPriority = 'High' | 'Medium' | 'Low';

export type TaskSource = 'manual' | 'calendar' | 'chawgee';

export type TaskCategory =
  | 'Work'
  | 'Project'
  | 'Meeting'
  | 'Personal'
  | 'Fitness'
  | 'Nutrition'
  | 'Recovery'
  | 'Other';

export interface CalendarTask {
  id: string;
  title: string;

  category: TaskCategory;
  priority: TaskPriority;

  date: string; // YYYY-MM-DD
  dueDate?: string; // YYYY-MM-DD

  startTime?: string; // HH:MM
  endTime?: string; // HH:MM

  estimatedMinutes?: number;

  completed: boolean;
  completedAt?: string;

  createdAt: string;
  updatedAt?: string;

  notes?: string;

  source: TaskSource;

  /**
   * ID of the original device calendar event when this task
   * originated from a synced calendar.
   */
  externalEventId?: string;
}

const TASKS_KEY = '@accountability_tasks';

/**
 * Generates a local YYYY-MM-DD date key.
 *
 * Avoids using toISOString() for local-day calculations because
 * UTC conversion can move a date into the previous/next day.
 */
const toLocalDateKey = (date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

/**
 * Converts a Date into HH:MM using the device's local time.
 */
const toLocalTime = (date: Date): string => {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${hours}:${minutes}`;
};

/**
 * Creates a stable-enough local task ID for manually-created tasks.
 */
export const createTaskId = (): string => {
  return `task_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
};

/**
 * Normalizes older saved task data into the current task model.
 *
 * This allows existing users/tasks to survive the storage upgrade
 * instead of requiring AsyncStorage to be cleared.
 */
const normalizeTask = (task: Partial<CalendarTask>): CalendarTask => {
  const now = new Date().toISOString();

  return {
    id: task.id || createTaskId(),

    title: task.title?.trim() || 'Untitled Task',

    category: task.category || 'Project',

    priority: task.priority || 'Medium',

    date: task.date || toLocalDateKey(),

    dueDate: task.dueDate,

    startTime: task.startTime || undefined,
    endTime: task.endTime || undefined,

    estimatedMinutes:
      typeof task.estimatedMinutes === 'number'
        ? task.estimatedMinutes
        : undefined,

    completed: Boolean(task.completed),

    completedAt: task.completedAt,

    createdAt: task.createdAt || now,
    updatedAt: task.updatedAt,

    notes: task.notes,

    source: task.source || 'manual',

    externalEventId: task.externalEventId,
  };
};

export const saveTasks = async (
  tasks: CalendarTask[]
): Promise<void> => {
  const tasksKey = await getUserScopedStorageKey(TASKS_KEY);

  const normalizedTasks = tasks.map(normalizeTask);

  await AsyncStorage.setItem(
    tasksKey,
    JSON.stringify(normalizedTasks)
  );
};

export const getTasks = async (): Promise<CalendarTask[]> => {
  try {
    const tasksKey = await getUserScopedStorageKey(TASKS_KEY);
    const data = await AsyncStorage.getItem(tasksKey);

    if (!data) {
      return [];
    }

    const parsed = JSON.parse(data);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map(normalizeTask);
  } catch (error) {
    console.error('Error loading tasks:', error);
    return [];
  }
};

/**
 * Creates and persists a new task.
 */
export const addTask = async (
  task: Omit<
    CalendarTask,
    'id' | 'createdAt' | 'updatedAt'
  >
): Promise<CalendarTask> => {
  const tasks = await getTasks();

  const now = new Date().toISOString();

  const newTask: CalendarTask = normalizeTask({
    ...task,
    id: createTaskId(),
    createdAt: now,
    updatedAt: now,
  });

  await saveTasks([...tasks, newTask]);

  return newTask;
};

/**
 * Updates an existing task.
 */
export const updateTask = async (
  id: string,
  updates: Partial<CalendarTask>
): Promise<CalendarTask | null> => {
  const tasks = await getTasks();

  let updatedTask: CalendarTask | null = null;

  const nextTasks = tasks.map((task) => {
    if (task.id !== id) {
      return task;
    }

    updatedTask = normalizeTask({
      ...task,
      ...updates,
      id: task.id,
      createdAt: task.createdAt,
      updatedAt: new Date().toISOString(),
    });

    return updatedTask;
  });

  if (!updatedTask) {
    return null;
  }

  await saveTasks(nextTasks);

  return updatedTask;
};

/**
 * Marks a task complete/incomplete and records when completion
 * occurred. This will later give Chawgee useful productivity data.
 */
export const setTaskCompleted = async (
  id: string,
  completed: boolean
): Promise<CalendarTask | null> => {
  return updateTask(id, {
    completed,
    completedAt: completed
      ? new Date().toISOString()
      : undefined,
  });
};

/**
 * Removes a task.
 */
export const deleteTask = async (
  id: string
): Promise<void> => {
  const tasks = await getTasks();

  await saveTasks(
    tasks.filter((task) => task.id !== id)
  );
};

export const requestCalendarPermissions =
  async (): Promise<boolean> => {
    const { status } =
      await Calendar.requestCalendarPermissionsAsync();

    return status === 'granted';
  };

/**
 * Retrieves today's device calendar events and converts them into
 * Chawgee's task/event format.
 *
 * These are returned separately and are NOT automatically written
 * into task storage. That distinction will matter when calendar
 * intelligence and syncing are implemented.
 */
export const fetchDeviceEvents =
  async (): Promise<CalendarTask[]> => {
    const hasPermission =
      await requestCalendarPermissions();

    if (!hasPermission) {
      return [];
    }

    const calendars = await Calendar.getCalendarsAsync(
      Calendar.EntityTypes.EVENT
    );

    const defaultCalendar =
      Platform.OS === 'android'
        ? calendars.find((cal) => cal.isPrimary) ||
          calendars[0]
        : calendars.find(
            (cal) => cal.source.name === 'Default'
          ) || calendars[0];

    if (!defaultCalendar) {
      return [];
    }

    const now = new Date();

    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );

    const endOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999
    );

    const events = await Calendar.getEventsAsync(
      [defaultCalendar.id],
      startOfDay,
      endOfDay
    );

    return events.map((event) => {
      const startDate = new Date(event.startDate);
      const endDate = new Date(event.endDate);

      return normalizeTask({
        id: `calendar_${event.id}`,

        externalEventId: event.id,

        title: event.title || 'Calendar Event',

        category: 'Meeting',

        priority: 'Medium',

        startTime: toLocalTime(startDate),
        endTime: toLocalTime(endDate),

        completed: false,

        date: toLocalDateKey(startDate),

        createdAt: new Date().toISOString(),

        source: 'calendar',
      });
    });
  };