import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Calendar from 'expo-calendar/legacy';
import { Platform } from 'react-native';
import { getUserScopedStorageKey } from './userScopedStorage';

export interface CalendarTask {
  id: string;
  title: string;
  category: 'Meeting' | 'Project' | 'Personal Time' | 'Hobby';
  startTime: string; // HH:MM format
  endTime: string; // HH:MM format
  completed: boolean;
  date: string; // YYYY-MM-DD
}

const TASKS_KEY = '@accountability_tasks';

export const saveTasks = async (
  tasks: CalendarTask[]
): Promise<void> => {
  const tasksKey = await getUserScopedStorageKey(TASKS_KEY);

  await AsyncStorage.setItem(
    tasksKey,
    JSON.stringify(tasks)
  );
};

export const getTasks = async (): Promise<CalendarTask[]> => {
  try {
    const tasksKey = await getUserScopedStorageKey(TASKS_KEY);
    const data = await AsyncStorage.getItem(tasksKey);

    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error loading tasks:', error);
    return [];
  }
};

export const requestCalendarPermissions = async (): Promise<boolean> => {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  return status === 'granted';
};

export const fetchDeviceEvents = async (): Promise<Partial<CalendarTask>[]> => {
  const hasPermission = await requestCalendarPermissions();

  if (!hasPermission) return [];

  const calendars = await Calendar.getCalendarsAsync(
    Calendar.EntityTypes.EVENT
  );

  const defaultCalendar =
    Platform.OS === 'android'
      ? calendars.find((cal) => cal.isPrimary) || calendars[0]
      : calendars.find((cal) => cal.source.name === 'Default') || calendars[0];

  if (!defaultCalendar) return [];

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
    59
  );

  const events = await Calendar.getEventsAsync(
    [defaultCalendar.id],
    startOfDay,
    endOfDay
  );

  return events.map((event) => ({
    id: event.id,
    title: event.title,
    category: 'Meeting',
    startTime: new Date(event.startDate).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    }),
    endTime: new Date(event.endDate).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    }),
    completed: false,
    date: new Date(event.startDate).toISOString().split('T')[0],
  }));
};
