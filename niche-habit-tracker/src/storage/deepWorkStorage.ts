import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUserScopedStorageKey } from './userScopedStorage';

const DEEP_WORK_SESSIONS_KEY = '@efficiency_deep_work_sessions';
const ACTIVE_DEEP_WORK_KEY = '@efficiency_active_deep_work';

export interface DeepWorkSession {
  id: string;
  date: string; // YYYY-MM-DD, local calendar date
  startedAt: string;
  endedAt: string;
  durationMinutes: number;
  title?: string;
  source: 'timer' | 'manual';
}

export interface ActiveDeepWorkSession {
  id: string;
  startedAt: string;
  title?: string;
}

const toLocalDateKey = (value: Date | string): string => {
  const date = value instanceof Date ? value : new Date(value);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

export const getDeepWorkSessions = async (): Promise<
  DeepWorkSession[]
> => {
  try {
    const key = await getUserScopedStorageKey(
      DEEP_WORK_SESSIONS_KEY
    );
    const raw = await AsyncStorage.getItem(key);

    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error('Error loading deep work sessions:', error);
    return [];
  }
};

export const saveDeepWorkSessions = async (
  sessions: DeepWorkSession[]
): Promise<void> => {
  const key = await getUserScopedStorageKey(
    DEEP_WORK_SESSIONS_KEY
  );

  await AsyncStorage.setItem(key, JSON.stringify(sessions));
};

export const addManualDeepWorkSession = async ({
  durationMinutes,
  title,
  date = new Date(),
}: {
  durationMinutes: number;
  title?: string;
  date?: Date;
}): Promise<DeepWorkSession> => {
  const safeMinutes = Math.max(
    1,
    Math.round(Number(durationMinutes) || 0)
  );

  const endedAt = new Date(date);
  const startedAt = new Date(
    endedAt.getTime() - safeMinutes * 60_000
  );

  const session: DeepWorkSession = {
    id: `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    date: toLocalDateKey(endedAt),
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMinutes: safeMinutes,
    title: title?.trim() || undefined,
    source: 'manual',
  };

  const current = await getDeepWorkSessions();
  await saveDeepWorkSessions([session, ...current]);

  return session;
};

export const getActiveDeepWorkSession =
  async (): Promise<ActiveDeepWorkSession | null> => {
    try {
      const key = await getUserScopedStorageKey(
        ACTIVE_DEEP_WORK_KEY
      );
      const raw = await AsyncStorage.getItem(key);

      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.error(
        'Error loading active deep work session:',
        error
      );
      return null;
    }
  };

export const startDeepWorkSession = async (
  title?: string
): Promise<ActiveDeepWorkSession> => {
  const existing = await getActiveDeepWorkSession();

  if (existing) {
    return existing;
  }

  const active: ActiveDeepWorkSession = {
    id: `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    startedAt: new Date().toISOString(),
    title: title?.trim() || undefined,
  };

  const key = await getUserScopedStorageKey(
    ACTIVE_DEEP_WORK_KEY
  );

  await AsyncStorage.setItem(key, JSON.stringify(active));

  return active;
};

export const stopDeepWorkSession =
  async (): Promise<DeepWorkSession | null> => {
    const active = await getActiveDeepWorkSession();

    if (!active) {
      return null;
    }

    const endedAt = new Date();
    const startedAt = new Date(active.startedAt);

    const durationMinutes = Math.max(
      1,
      Math.round(
        (endedAt.getTime() - startedAt.getTime()) / 60_000
      )
    );

    const session: DeepWorkSession = {
      id: active.id,
      date: toLocalDateKey(endedAt),
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationMinutes,
      title: active.title,
      source: 'timer',
    };

    const sessions = await getDeepWorkSessions();
    await saveDeepWorkSessions([session, ...sessions]);

    const activeKey = await getUserScopedStorageKey(
      ACTIVE_DEEP_WORK_KEY
    );
    await AsyncStorage.removeItem(activeKey);

    return session;
  };

export const deleteDeepWorkSession = async (
  id: string
): Promise<void> => {
  const sessions = await getDeepWorkSessions();

  await saveDeepWorkSessions(
    sessions.filter((session) => session.id !== id)
  );
};

export const getDeepWorkMinutesForRange = async (
  startDate: string,
  endDate: string
): Promise<number> => {
  const sessions = await getDeepWorkSessions();

  return sessions
    .filter(
      (session) =>
        session.date >= startDate &&
        session.date <= endDate
    )
    .reduce(
      (sum, session) =>
        sum + Number(session.durationMinutes || 0),
      0
    );
};
