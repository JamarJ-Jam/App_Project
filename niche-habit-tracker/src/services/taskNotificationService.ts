import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { getUserScopedStorageKey } from '../storage/userScopedStorage';

export const TIMELINE_NOTIFICATIONS_KEY =
  '@chawgee_timeline_notifications';

export type StoredNotification = {
  notificationId: string;
  signature: string;
};

export type StoredTaskNotifications = {
  preStart?: StoredNotification;
  outcomePrompt?: StoredNotification;
};

export type TimelineNotificationMap = Record<
  string,
  StoredTaskNotifications
>;

const isStoredNotification = (
  value: unknown
): value is StoredNotification => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.notificationId === 'string' &&
    typeof record.signature === 'string'
  );
};

const normalizeRecord = (
  value: unknown
): StoredTaskNotifications | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;

  if (isStoredNotification(record)) {
    return { preStart: record };
  }

  const normalized: StoredTaskNotifications = {};
  if (isStoredNotification(record.preStart)) {
    normalized.preStart = record.preStart;
  }
  if (isStoredNotification(record.outcomePrompt)) {
    normalized.outcomePrompt = record.outcomePrompt;
  }

  return normalized.preStart || normalized.outcomePrompt
    ? normalized
    : null;
};

export const getTimelineNotificationKey = async (): Promise<string> =>
  getUserScopedStorageKey(TIMELINE_NOTIFICATIONS_KEY);

export const loadTimelineNotifications = async (): Promise<
  TimelineNotificationMap
> => {
  try {
    const key = await getTimelineNotificationKey();
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return {};

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};

    const normalized: TimelineNotificationMap = {};
    for (const [taskId, value] of Object.entries(
      parsed as Record<string, unknown>
    )) {
      const record = normalizeRecord(value);
      if (record) normalized[taskId] = record;
    }
    return normalized;
  } catch {
    return {};
  }
};

export const saveTimelineNotifications = async (
  notifications: TimelineNotificationMap
): Promise<void> => {
  const key = await getTimelineNotificationKey();
  await AsyncStorage.setItem(key, JSON.stringify(notifications));
};

export const cancelStoredTaskNotifications = async (
  taskId: string
): Promise<void> => {
  try {
    const notifications = await loadTimelineNotifications();
    const record = notifications[taskId];
    if (!record) return;

    const records = [record.preStart, record.outcomePrompt];
    for (const stored of records) {
      if (!stored?.notificationId) continue;
      try {
        await Notifications.cancelScheduledNotificationAsync(
          stored.notificationId
        );
      } catch {
        // Keep cleanup best-effort; task persistence must remain independent.
      }
    }

    delete notifications[taskId];
    await saveTimelineNotifications(notifications);
  } catch {
    // Notification cleanup must not block task persistence.
  }
};
