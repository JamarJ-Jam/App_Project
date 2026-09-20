import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { getSupabaseClient } from '../auth/supabaseClient';
import { AuthLifecycleCoordinator } from '../auth/authLifecycle';
import { bootstrapChawgeeAccount, type BootstrapAccount } from '../services/chawgeeApi';

export interface User {
  id: string;
  email: string;
  name?: string;
  isGuest: boolean;
  provider?: 'email';
}

export type AuthState =
  | 'loading'
  | 'unauthenticated'
  | 'guest'
  | 'verification_required'
  | 'authenticated'
  | 'bootstrap_failed';

export interface AuthActionResult {
  status: 'authenticated' | 'verification_required';
}

interface AuthContextType {
  user: User | null;
  authState: AuthState;
  authError: string | null;
  pendingVerificationEmail: string | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<AuthActionResult>;
  signUp: (email: string, password: string, name?: string) => Promise<AuthActionResult>;
  signInWithGoogle: () => Promise<void>;
  signInAsGuest: () => Promise<void>;
  updateAccountIdentity: (email: string, name?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  authState: 'loading',
  authError: null,
  pendingVerificationEmail: null,
  isLoading: true,
  signIn: async () => ({ status: 'verification_required' }),
  signUp: async () => ({ status: 'verification_required' }),
  signInWithGoogle: async () => {},
  signInAsGuest: async () => {},
  updateAccountIdentity: async () => {},
  signOut: async () => {},
});

const AUTH_STORAGE_KEY = '@accountability_user_session';
const LEGACY_MOCK_STORAGE_KEY = '@accountability_legacy_mock_session';

// TEMP AUTH DIAGNOSTIC - REMOVE AFTER LIVE TEST
const logAuthDiagnostic = (message: string): void => {
  console.log(`[AUTH_DIAG] TEMP AUTH DIAGNOSTIC - REMOVE AFTER LIVE TEST ${message}`);
};

const safeDiagnosticName = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.-]+$/.test(value)) return undefined;
  return value;
};

const classifySignInThrow = (error: unknown): string => {
  const candidate = error as {
    constructor?: { name?: unknown };
    name?: unknown;
    code?: unknown;
    message?: unknown;
  } | null;
  const type = safeDiagnosticName(candidate?.constructor?.name) ?? 'unknown';
  const name = safeDiagnosticName(candidate?.name);
  const code = safeDiagnosticName(candidate?.code);
  const message = typeof candidate?.message === 'string' ? candidate.message.toLowerCase() : '';

  logAuthDiagnostic(`SIGN_IN_THROW_TYPE=${type}`);
  if (name) logAuthDiagnostic(`SIGN_IN_THROW_NAME=${name}`);
  if (code) logAuthDiagnostic(`SIGN_IN_THROW_CODE=${code}`);

  const category = message.includes('timeout') || code === 'ETIMEDOUT'
    ? 'timeout'
    : message.includes('abort') || code === 'ABORT_ERR'
      ? 'abort'
      : message.includes('tls') || message.includes('certificate')
        ? 'tls'
        : message.includes('fetch') || message.includes('network') || code === 'ERR_NETWORK'
          ? 'fetch'
          : 'unknown';
  logAuthDiagnostic(`SIGN_IN_THROW_CATEGORY=${category}`);
  return category;
};

const isVerifiedEmailSession = (session: Session): boolean =>
  Boolean(session.user.email_confirmed_at);

const safeAuthMessage = (operation: 'sign in' | 'create account'): string =>
  `Unable to ${operation}. Check your details and try again.`;

const accountToUser = (session: Session, account: BootstrapAccount): User => ({
  id: account.id,
  email: session.user.email ?? '',
  name: typeof session.user.user_metadata?.full_name === 'string'
    ? session.user.user_metadata.full_name
    : undefined,
  isGuest: false,
  provider: 'email',
});

const guestUser = (): User => ({
  id: `guest:${Date.now()}`,
  email: 'Guest User',
  name: 'Guest',
  isGuest: true,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [authError, setAuthError] = useState<string | null>(null);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);
  const bootstrapPromises = useRef(new Map<string, Promise<AuthActionResult>>());
  const authLifecycle = useRef(new AuthLifecycleCoordinator());

  const clearAuthenticatedState = () => {
    setUser(null);
    setAuthError(null);
    setPendingVerificationEmail(null);
  };

  const setDiagnosticAuthState = (nextState: AuthState) => {
    setAuthState(nextState);
    logAuthDiagnostic(`AUTH_STATE=${nextState}`);
  };

  const reconcileSession = useCallback(async (session: Session | null): Promise<AuthActionResult> => {
    if (!session) {
      authLifecycle.current.invalidate();
      clearAuthenticatedState();
      setDiagnosticAuthState('unauthenticated');
      return { status: 'verification_required' };
    }

    if (!isVerifiedEmailSession(session)) {
      authLifecycle.current.beginSession(session.user.id, session.access_token);
      setUser(null);
      setAuthError(null);
      setPendingVerificationEmail(session.user.email ?? null);
      setDiagnosticAuthState('verification_required');
      return { status: 'verification_required' };
    }

    const generation = authLifecycle.current.beginSession(session.user.id, session.access_token);
    const bootstrapKey = `${generation}:${session.access_token}`;
    const existing = bootstrapPromises.current.get(bootstrapKey);
    if (existing) return existing;

    const bootstrap = (async (): Promise<AuthActionResult> => {
      try {
        const account = await bootstrapChawgeeAccount(session.access_token);
        if (!authLifecycle.current.isCurrent(generation, session.user.id, session.access_token)) {
          return { status: 'verification_required' };
        }
        const nextUser = accountToUser(session, account);
        setUser(nextUser);
        setAuthError(null);
        setPendingVerificationEmail(null);
        setDiagnosticAuthState('authenticated');
        await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextUser));
        return { status: 'authenticated' };
      } catch (error) {
        if (!authLifecycle.current.isCurrent(generation, session.user.id, session.access_token)) {
          return { status: 'verification_required' };
        }
        clearAuthenticatedState();
        setDiagnosticAuthState('bootstrap_failed');
        throw error instanceof Error
          ? error
          : new Error('Unable to initialize your Chawgee account.');
      } finally {
        bootstrapPromises.current.delete(bootstrapKey);
      }
    })();

    bootstrapPromises.current.set(bootstrapKey, bootstrap);
    return bootstrap;
  }, []);

  useEffect(() => {
    let mounted = true;
    let client: ReturnType<typeof getSupabaseClient> | undefined;
    let subscription: { unsubscribe: () => void } | undefined;

    const restore = async () => {
      try {
        client = getSupabaseClient();
        const { data, error } = await client.auth.getSession();
        if (!mounted) return;

        if (error) throw error;
        if (data.session) {
          await reconcileSession(data.session);
          return;
        }

        const stored = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
        if (stored) {
          try {
            const parsed = JSON.parse(stored) as User;
            if (parsed.isGuest) {
              setUser(parsed);
              setDiagnosticAuthState('guest');
              return;
            }
            await AsyncStorage.setItem(LEGACY_MOCK_STORAGE_KEY, stored);
            await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
          } catch {
            await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
          }
        }
        setDiagnosticAuthState('unauthenticated');
      } catch {
        if (mounted) {
          const stored = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
          try {
            const parsed = stored ? JSON.parse(stored) as User : null;
            if (parsed?.isGuest) {
              setUser(parsed);
              setDiagnosticAuthState('guest');
              return;
            }
            if (stored) {
              await AsyncStorage.setItem(LEGACY_MOCK_STORAGE_KEY, stored);
              await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
            }
          } catch {
            await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
          }
          clearAuthenticatedState();
          setDiagnosticAuthState('unauthenticated');
          setAuthError('Authentication is not configured.');
        }
      } finally {
        if (mounted) setAuthState((current) => current === 'loading' ? 'unauthenticated' : current);
      }
    };

    void restore();
    try {
      client = client ?? getSupabaseClient();
      const result = client.auth.onAuthStateChange((_event, session) => {
        if (mounted) void reconcileSession(session);
      });
      subscription = result.data.subscription;
    } catch {
      // Missing public configuration is surfaced through the existing auth state.
    }

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, [reconcileSession]);

  const signIn = async (email: string, password: string): Promise<AuthActionResult> => {
    let signInResultReceived = false;
    let signInRequestStarted = false;
    try {
      let client: ReturnType<typeof getSupabaseClient>;
      try {
        client = getSupabaseClient();
        logAuthDiagnostic('SUPABASE_CLIENT_READY');
      } catch {
        logAuthDiagnostic('SUPABASE_CLIENT_THROW');
        throw new Error(safeAuthMessage('sign in'));
      }

      logAuthDiagnostic('SUPABASE_SIGN_IN_REQUEST_STARTED');
      signInRequestStarted = true;
      const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
      signInResultReceived = true;
      if (error) {
        const safeCode = typeof error.code === 'string' && /^[a-z0-9_.-]+$/i.test(error.code)
          ? error.code
          : undefined;
        const safeStatus = typeof error.status === 'number' && Number.isInteger(error.status)
          ? error.status
          : undefined;
        logAuthDiagnostic(
          safeCode || safeStatus !== undefined
            ? `SUPABASE_SIGN_IN_FAILED${safeCode ? ` code=${safeCode}` : ''}${safeStatus !== undefined ? ` status=${safeStatus}` : ''}`
            : 'SUPABASE_SIGN_IN_FAILED'
        );
        const errorText = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
        if (errorText.includes('email_not_confirmed') || errorText.includes('email not confirmed')) {
          setPendingVerificationEmail(email.trim());
          setDiagnosticAuthState('verification_required');
          return { status: 'verification_required' };
        }
        throw new Error(safeAuthMessage('sign in'));
      }
      logAuthDiagnostic('SUPABASE_SIGN_IN_SUCCEEDED');
      if (!data.session) throw new Error(safeAuthMessage('sign in'));
      return await reconcileSession(data.session);
    } catch (error) {
      if (signInRequestStarted && !signInResultReceived) {
        logAuthDiagnostic('SUPABASE_SIGN_IN_THROW');
        classifySignInThrow(error);
      }
      const message = error instanceof Error && error.message.includes('Chawgee account')
        ? error.message
        : safeAuthMessage('sign in');
      setAuthError(message);
      throw new Error(message);
    }
  };

  const signUp = async (email: string, password: string, name?: string): Promise<AuthActionResult> => {
    try {
      const { data, error } = await getSupabaseClient().auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: name?.trim() || undefined } },
      });
      if (error) throw new Error(safeAuthMessage('create account'));
      if (!data.session) {
        setPendingVerificationEmail(data.user?.email ?? email.trim());
        setDiagnosticAuthState('verification_required');
        return { status: 'verification_required' };
      }
      return await reconcileSession(data.session);
    } catch (error) {
      const message = error instanceof Error && error.message.includes('Chawgee account')
        ? error.message
        : safeAuthMessage('create account');
      setAuthError(message);
      throw new Error(message);
    }
  };

  const signInWithGoogle = async () => {
    throw new Error('Google sign-in is not available yet.');
  };

  const signInAsGuest = async () => {
    authLifecycle.current.invalidate();
    const nextUser = guestUser();
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextUser));
    setUser(nextUser);
    setAuthError(null);
    setDiagnosticAuthState('guest');
  };

  const updateAccountIdentity = async (email: string, name?: string) => {
    if (!user || user.isGuest) return;
    const { error } = await getSupabaseClient().auth.updateUser({
      email: email.trim(),
      data: { full_name: name?.trim() || undefined },
    });
    if (error) throw new Error('Unable to update your account details.');
    setUser((current) => current ? { ...current, email: email.trim(), name: name?.trim() || undefined } : current);
  };

  const signOut = async () => {
    authLifecycle.current.invalidate();
    clearAuthenticatedState();
    setDiagnosticAuthState('unauthenticated');

    if (user?.isGuest) {
      await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
    } else {
      try {
        await getSupabaseClient().auth.signOut();
      } catch {
        throw new Error('Unable to sign out right now.');
      }
      await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      authState,
      authError,
      pendingVerificationEmail,
      isLoading: authState === 'loading',
      signIn,
      signUp,
      signInWithGoogle,
      signInAsGuest,
      updateAccountIdentity,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
