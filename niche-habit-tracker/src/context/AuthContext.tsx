import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface User {
  id: string;
  email: string;
  name?: string;
  isGuest: boolean;
  provider?: 'email' | 'google';
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  signIn: (email: string) => Promise<void>;
  signUp: (email: string, name?: string) => Promise<void>;
  signInWithGoogle: (email: string, name: string) => Promise<void>;
  signInAsGuest: () => Promise<void>;
  updateAccountIdentity: (email: string, name?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  signIn: async () => {},
  signUp: async () => {},
  signInWithGoogle: async () => {},
  signInAsGuest: async () => {},
  updateAccountIdentity: async () => {},
  signOut: async () => {},
});

const AUTH_STORAGE_KEY = '@accountability_user_session';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(AUTH_STORAGE_KEY).then((storedUser) => {
      if (storedUser) {
        setUser(JSON.parse(storedUser));
      }
      setIsLoading(false);
    });
  }, []);

  const persistSession = async (sessionData: User) => {
    setUser(sessionData);
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(sessionData));
  };

  const signIn = async (email: string) => {
    const normalizedEmail = email.trim().toLowerCase();

    await persistSession({
      id: `email:${normalizedEmail}`,
      email: normalizedEmail,
      isGuest: false,
      provider: 'email',
    });
  };

  const signUp = async (email: string, name?: string) => {
    const normalizedEmail = email.trim().toLowerCase();

    await persistSession({
      id: `email:${normalizedEmail}`,
      email: normalizedEmail,
      name: name?.trim() || undefined,
      isGuest: false,
      provider: 'email',
    });
  };

  const signInWithGoogle = async (email: string, name: string) => {
    const normalizedEmail = email.trim().toLowerCase();

    await persistSession({
      id: `google:${normalizedEmail}`,
      email: normalizedEmail,
      name: name.trim(),
      isGuest: false,
      provider: 'google',
    });
  };

  const signInAsGuest = async () => {
    await persistSession({
      id: `guest:${Date.now()}`,
      email: 'Guest User',
      name: 'Guest',
      isGuest: true,
    });
  };

  const updateAccountIdentity = async (email: string, name?: string) => {
    if (!user || user.isGuest) return;

    const normalizedEmail = email.trim().toLowerCase();

    // Keep the original stable ID so user-scoped Fitness/Nutrition/Efficiency
    // storage does not become orphaned when an email address changes.
    await persistSession({
      ...user,
      email: normalizedEmail,
      name: name?.trim() || undefined,
    });
  };

  const signOut = async () => {
    setUser(null);
    await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        signIn,
        signUp,
        signInWithGoogle,
        signInAsGuest,
        updateAccountIdentity,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
