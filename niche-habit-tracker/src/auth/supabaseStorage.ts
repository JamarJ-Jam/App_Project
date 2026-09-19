import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Conservative direct-SecureStore threshold based on Supabase guidance; this
// is not a universal Expo SecureStore limit.
const SECURE_STORE_MAX_BYTES = 2048;

// TODO: Before production auth release, validate or replace this strategy for
// larger sessions with a reviewed secure design and Android/iOS device tests.

const webStorage = {
  getItem: async (key: string) =>
    typeof window === 'undefined' ? null : window.localStorage.getItem(key),
  setItem: async (key: string, value: string) => {
    if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
  },
  removeItem: async (key: string) => {
    if (typeof window !== 'undefined') window.localStorage.removeItem(key);
  },
};

const nativeStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: async (key: string, value: string) => {
    if (new TextEncoder().encode(value).length > SECURE_STORE_MAX_BYTES) {
      throw new Error(
        'Supabase session exceeds Chawgee\'s conservative direct SecureStore threshold.'
      );
    }
    await SecureStore.setItemAsync(key, value);
  },
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabaseStorage = Platform.OS === 'web' ? webStorage : nativeStorage;