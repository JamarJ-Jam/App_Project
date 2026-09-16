import AsyncStorage from '@react-native-async-storage/async-storage';

const AUTH_STORAGE_KEY = '@accountability_user_session';

interface StoredUserSession {
  id?: string;
  email: string;
  isGuest: boolean;
  provider?: 'email' | 'google';
}

export const getCurrentUserStorageId = async (): Promise<string> => {
  const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);

  if (!raw) {
    return 'anonymous';
  }

  try {
    const session: StoredUserSession = JSON.parse(raw);

    if (session.id) {
      return session.id;
    }

    if (session.isGuest) {
      return 'guest';
    }

    const provider = session.provider ?? 'email';
    const email = session.email.trim().toLowerCase();

    return `${provider}:${email}`;
  } catch {
    return 'anonymous';
  }
};

export const getUserScopedStorageKey = async (
  baseKey: string
): Promise<string> => {
  const userId = await getCurrentUserStorageId();
  return `${baseKey}:${userId}`;
};
