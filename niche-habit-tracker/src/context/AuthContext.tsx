import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface User {
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
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  signIn: async () => {},
  signUp: async () => {},
  signInWithGoogle: async () => {},
  signInAsGuest: async () => {},
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

  const signIn = async (email: string) => {
    const sessionData: User = { email, isGuest: false, provider: 'email' };
    setUser(sessionData);
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(sessionData));
  };

  const signUp = async (email: string, name?: string) => {
    const sessionData: User = { email, name, isGuest: false, provider: 'email' };
    setUser(sessionData);
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(sessionData));
  };

  const signInWithGoogle = async (email: string, name: string) => {
    const sessionData: User = { email, name, isGuest: false, provider: 'google' };
    setUser(sessionData);
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(sessionData));
  };

  const signInAsGuest = async () => {
    const sessionData: User = { email: 'Guest User', name: 'Guest', isGuest: true };
    setUser(sessionData);
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(sessionData));
  };

  const signOut = async () => {
    setUser(null);
    await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, signIn, signUp, signInWithGoogle, signInAsGuest, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);