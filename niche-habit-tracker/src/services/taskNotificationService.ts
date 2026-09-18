import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import {
  getCurrentUserStorageId,
  getUserScopedStorageKey,
} from '../storage/userScopedStorage';

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

type PendingTimelineNotification = {
  id: string;
  data: Record<string, unknown>;
};

export type TimelineNotificationTransaction = {
  notifications: TimelineNotificationMap;
  pending: PendingTimelineNotification[];
  notificationScopeId: string;
};

export type TimelineNotificationTransactionResult<T> = {
  notifications: TimelineNotificationMap;
  result: T;
};

let timelineNotificationQueue = Promise.resolve();

const enqueueTimelineNotificationOperation = <T>(
  operation: () => Promise<T>
): Promise<T> => {
  const next = timelineNotificationQueue.then(operation, operation);
  timelineNotificationQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
};

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

const loadTimelineNotifications = async (): Promise<
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

const getPendingTimelineNotifications = async (): Promise<
  PendingTimelineNotification[] | null
> => {
  try {
    const pending =
      await Notifications.getAllScheduledNotificationsAsync();

    return pending.map((notification) => ({
      id: notification.identifier,
      data:
        notification.content.data &&
        typeof notification.content.data === 'object'
          ? (notification.content.data as Record<string, unknown>)
          : {},
    }));
  } catch {
    return null;
  }
};

const isOwnedTimelineNotification = (
  pending: PendingTimelineNotification
): boolean => {
  const type = pending.data.type;
  const role = pending.data.notificationRole;
  const taskId = pending.data.taskId;

  return (
    (type === 'timeline_upcoming' && role === 'pre_start' ||
      type === 'task_outcome_prompt' && role === 'outcome_prompt') &&
    typeof taskId === 'string' &&
    taskId.length > 0
  );
};

const reconcileNotificationMap = (
  notifications: TimelineNotificationMap,
  pending: PendingTimelineNotification[]
): TimelineNotificationMap => {
  const pendingIds = new Set(pending.map((notification) => notification.id));
  const reconciled: TimelineNotificationMap = {};

  for (const [taskId, record] of Object.entries(notifications)) {
    const nextRecord: StoredTaskNotifications = {};

    if (
      record.preStart &&
      pendingIds.has(record.preStart.notificationId)
    ) {
      nextRecord.preStart = record.preStart;
    } else if (record.preStart) {
      console.log(
        '[CHAWGEE NOTIFICATION DEBUG] STORED_ROLE_REMOVED',
        {
          taskId,
          role: 'preStart',
          notificationId: record.preStart.notificationId,
          reason: 'missing_from_pending_snapshot',
        }
      );
    }
    if (
      record.outcomePrompt &&
      pendingIds.has(record.outcomePrompt.notificationId)
    ) {
      nextRecord.outcomePrompt = record.outcomePrompt;
    } else if (record.outcomePrompt) {
      console.log(
        '[CHAWGEE NOTIFICATION DEBUG] STORED_ROLE_REMOVED',
        {
          taskId,
          role: 'outcomePrompt',
          notificationId: record.outcomePrompt.notificationId,
          reason: 'missing_from_pending_snapshot',
        }
      );
    }

    if (nextRecord.preStart || nextRecord.outcomePrompt) {
      reconciled[taskId] = nextRecord;
    }
  }

  return reconciled;
};

export const runTimelineNotificationTransaction = <T>(
  operation: (
    transaction: TimelineNotificationTransaction
  ) => Promise<TimelineNotificationTransactionResult<T>>
): Promise<T> =>
  enqueueTimelineNotificationOperation(async () => {
    const notifications = await loadTimelineNotifications();
    const pendingResult = await getPendingTimelineNotifications();
    const pending = pendingResult ?? [];
    const notificationScopeId = await getCurrentUserStorageId();
    const reconciled = pendingResult
      ? reconcileNotificationMap(notifications, pending)
      : notifications;

    const representedIds = new Set<string>();
    for (const record of Object.values(reconciled)) {
      if (record.preStart) {
        representedIds.add(record.preStart.notificationId);
      }
      if (record.outcomePrompt) {
        representedIds.add(record.outcomePrompt.notificationId);
      }
    }

    for (const scheduled of pendingResult ?? []) {
      if (isOwnedTimelineNotification(scheduled)) {
        console.log(
          '[CHAWGEE NOTIFICATION DEBUG] PENDING_SNAPSHOT',
          {
            notificationId: scheduled.id,
            type: scheduled.data.type,
            notificationRole: scheduled.data.notificationRole,
            taskId: scheduled.data.taskId,
            notificationScopeIdPresent:
              typeof scheduled.data.notificationScopeId === 'string',
            notificationScopeMatches:
              scheduled.data.notificationScopeId ===
              notificationScopeId,
          }
        );
      }
    }

    for (const scheduled of pendingResult ?? []) {
      if (
        isOwnedTimelineNotification(scheduled) &&
        scheduled.data.notificationScopeId === notificationScopeId &&
        !representedIds.has(scheduled.id)
      ) {
        try {
          console.log(
            '[CHAWGEE NOTIFICATION DEBUG] ORPHAN_CANCELLED',
            {
              taskId: scheduled.data.taskId,
              role: scheduled.data.notificationRole,
              notificationId: scheduled.id,
              reason: 'orphan',
            }
          );
          await Notifications.cancelScheduledNotificationAsync(
            scheduled.id
          );
        } catch {
          // Orphan cleanup is best-effort.
        }
      }
    }

    const outcome = await operation({
      notifications: reconciled,
      pending,
      notificationScopeId,
    });
    await saveTimelineNotifications(outcome.notifications);
    return outcome.result;
  });

const saveTimelineNotifications = async (
  notifications: TimelineNotificationMap
): Promise<void> => {
  const key = await getTimelineNotificationKey();
  await AsyncStorage.setItem(key, JSON.stringify(notifications));
};

export const cancelStoredTaskNotifications = async (
  taskId: string
): Promise<void> => {
  await enqueueTimelineNotificationOperation(async () => {
    try {
      const notifications = await loadTimelineNotifications();
      const record = notifications[taskId];
      if (!record) return;

      for (const stored of [record.preStart, record.outcomePrompt]) {
        if (!stored?.notificationId) continue;
        try {
          console.log(
            '[CHAWGEE NOTIFICATION DEBUG] ROLE_CANCELLED',
            {
              taskId,
              role:
                stored === record.preStart
                  ? 'preStart'
                  : 'outcomePrompt',
              notificationId: stored.notificationId,
              reason: 'explicit_task_cleanup',
            }
          );
          await Notifications.cancelScheduledNotificationAsync(
            stored.notificationId
          );
        } catch {
          // Cleanup is best-effort; task persistence remains independent.
        }
      }

      delete notifications[taskId];
      await saveTimelineNotifications(notifications);
    } catch {
      // Notification cleanup must not block task persistence.
    }
  });
};
