import AsyncStorage from '@react-native-async-storage/async-storage';

export const STORAGE_KEY_USER_PROFILE = '@chawgee_user_profile';
const AUTH_STORAGE_KEY = '@accountability_user_session';

interface StoredUserSession {
  id?: string;
  email: string;
  isGuest: boolean;
  provider?: 'email' | 'google';
}

export interface UserProfile {
  age: number;
  gender: string;

  height: number;
  heightUnit: 'cm' | 'ft';
  currentWeight: number;
  targetWeight: number;
  weightUnit: 'kg' | 'lbs';

  primaryGoal: string;

  dailyCalories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatsGrams: number;

  dailySteps: number;
  deepWorkHours: number;

  employmentStatus: 'Employed' | 'Unemployed' | 'Student';
  workLocation: 'Remote' | 'In Office' | 'Hybrid';
  scheduleType: 'Set Shift' | 'Asynchronous';

  calendarSyncEnabled: boolean;

  baseline: {
    startingWeight: number;
    startingTargetWeight: number;
    recordedAt: string;
  };

  updatedAt: string;
}

export const DEFAULT_USER_PROFILE: UserProfile = {
  age: 0,
  gender: '',

  height: 0,
  heightUnit: 'cm',

  currentWeight: 0,
  targetWeight: 0,
  weightUnit: 'kg',

  primaryGoal: '',

  dailyCalories: 0,
  proteinGrams: 0,
  carbsGrams: 0,
  fatsGrams: 0,

  dailySteps: 0,
  deepWorkHours: 0,

  employmentStatus: 'Employed',
  workLocation: 'Remote',
  scheduleType: 'Asynchronous',

  calendarSyncEnabled: false,

  baseline: {
    startingWeight: 0,
    startingTargetWeight: 0,
    recordedAt: '',
  },

  updatedAt: '',
};

const getCurrentUserStorageId = async (): Promise<string> => {
  const storedSession = await AsyncStorage.getItem(AUTH_STORAGE_KEY);

  if (!storedSession) {
    return 'anonymous';
  }

  try {
    const session: StoredUserSession = JSON.parse(storedSession);

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

export const getUserProfileStorageKey = async (): Promise<string> => {
  const userId = await getCurrentUserStorageId();

  return `${STORAGE_KEY_USER_PROFILE}:${userId}`;
};

export const loadUserProfile = async (): Promise<UserProfile> => {
  try {
    const storageKey = await getUserProfileStorageKey();
    const saved = await AsyncStorage.getItem(storageKey);

    if (!saved) {
      return DEFAULT_USER_PROFILE;
    }

    const parsed = JSON.parse(saved);

    return {
      ...DEFAULT_USER_PROFILE,
      ...parsed,
      baseline: {
        ...DEFAULT_USER_PROFILE.baseline,
        ...(parsed.baseline || {}),
      },
    };
  } catch (error) {
    console.error('Error loading user profile:', error);
    return DEFAULT_USER_PROFILE;
  }
};

export const saveUserProfile = async (
  profile: UserProfile
): Promise<UserProfile> => {
  const updatedProfile: UserProfile = {
    ...profile,
    updatedAt: new Date().toISOString(),
  };

  const storageKey = await getUserProfileStorageKey();

  await AsyncStorage.setItem(
    storageKey,
    JSON.stringify(updatedProfile)
  );

  return updatedProfile;
};

export const updateUserProfile = async (
  updates: Partial<UserProfile>
): Promise<UserProfile> => {
  const current = await loadUserProfile();

  const updated: UserProfile = {
    ...current,
    ...updates,
    baseline: current.baseline,
    updatedAt: new Date().toISOString(),
  };

  const storageKey = await getUserProfileStorageKey();

  await AsyncStorage.setItem(
    storageKey,
    JSON.stringify(updated)
  );

  return updated;
};

type OnboardingProfileInput = Omit<
  UserProfile,
  | 'baseline'
  | 'updatedAt'
  | 'proteinGrams'
  | 'carbsGrams'
  | 'fatsGrams'
> & {
  proteinGrams?: number;
  carbsGrams?: number;
  fatsGrams?: number;
};

export const saveOnboardingProfile = async (
  profile: OnboardingProfileInput
): Promise<UserProfile> => {
  const now = new Date().toISOString();

  const completeProfile: UserProfile = {
    ...profile,

    proteinGrams: profile.proteinGrams ?? 0,
    carbsGrams: profile.carbsGrams ?? 0,
    fatsGrams: profile.fatsGrams ?? 0,

    baseline: {
      startingWeight: profile.currentWeight,
      startingTargetWeight: profile.targetWeight,
      recordedAt: now,
    },

    updatedAt: now,
  };

  const storageKey = await getUserProfileStorageKey();

  await AsyncStorage.setItem(
    storageKey,
    JSON.stringify(completeProfile)
  );

  return completeProfile;
};

export const clearUserProfile = async (): Promise<void> => {
  const storageKey = await getUserProfileStorageKey();
  await AsyncStorage.removeItem(storageKey);
};
