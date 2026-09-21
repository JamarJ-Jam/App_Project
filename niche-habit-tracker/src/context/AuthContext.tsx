import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import { evaluateProviderIdentity, type AuthProvider as IdentityProvider } from '../auth/authProviderIdentity';
import { getSupabaseClient } from '../auth/supabaseClient';
import { AuthLifecycleCoordinator, RecoveryEvidenceMismatchError } from '../auth/authLifecycle';
import { AuthCallbackCoordinator, type CallbackResult } from '../auth/authCallbackCoordinator';
import { AUTH_CALLBACK_URI, parseAuthCallbackUrl, type AuthCallbackIntent } from '../auth/authRedirect';
import { supabaseStorage } from '../auth/supabaseStorage';
import { bootstrapChawgeeAccount, type BootstrapAccount } from '../services/chawgeeApi';
import {
  isValidRecoveryEmail,
  requestPasswordRecovery as requestPasswordRecoveryAction,
  type PasswordRecoveryRequestResult,
} from '../auth/passwordRecoveryRequest';
import {
  isValidRecoveryPassword,
  type PasswordRecoveryCompletionResult,
} from '../auth/passwordRecoveryCompletion';

export interface User {
  id: string;
  email: string;
  name?: string;
  isGuest: boolean;
  provider?: IdentityProvider;
}

export type AuthState =
  | 'loading'
  | 'unauthenticated'
  | 'guest'
  | 'verification_required'
  | 'authenticated'
  | 'bootstrap_failed'
  | 'recovery_processing'
  | 'recovery'
  | 'recovery_interrupted';

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
  processAuthCallback: (incomingUrl: string, googleProvenance?: { owner: number; flowId: string }) => Promise<CallbackResult>;
  signInWithGoogle: () => Promise<CallbackResult>;
  signInAsGuest: () => Promise<void>;
  updateAccountIdentity: (email: string, name?: string) => Promise<void>;
  requestPasswordRecovery: (email: string) => Promise<PasswordRecoveryRequestResult>;
  completePasswordRecovery: (newPassword: string) => Promise<PasswordRecoveryCompletionResult>;
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
  processAuthCallback: async () => ({ status: 'failed', reason: 'invalid_callback' }),
  signInWithGoogle: async () => ({ status: 'failed', reason: 'verification_failed' }),
  signInAsGuest: async () => {},
  updateAccountIdentity: async () => {},
  requestPasswordRecovery: async () => ({ status: 'failed', reason: 'request_failed' }),
  completePasswordRecovery: async () => ({ status: 'failed', reason: 'not_authorized' }),
  signOut: async () => {},
});

const AUTH_STORAGE_KEY = '@accountability_user_session';
const LEGACY_MOCK_STORAGE_KEY = '@accountability_legacy_mock_session';

const safeAuthMessage = (operation: 'sign in' | 'create account'): string =>
  `Unable to ${operation}. Check your details and try again.`;

const accountToUser = (session: Session, account: BootstrapAccount, provider: IdentityProvider): User => ({
  id: account.id,
  email: session.user.email ?? '',
  name: typeof session.user.user_metadata?.full_name === 'string'
    ? session.user.user_metadata.full_name
    : undefined,
  isGuest: false,
  provider,
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
  const authLifecycle = useRef(new AuthLifecycleCoordinator(supabaseStorage));
  const authCallback = useRef(new AuthCallbackCoordinator());
  const callbackRequests = useRef(new Map<string, { intent?: AuthCallbackIntent; promise: Promise<CallbackResult> }>());
  const activeCallbackOwner = useRef<number | null>(null);
  const googleOperation = useRef<{ owner: number; flowId: string } | null>(null);
  const ready = useRef(false);
  const sdkMutation = useRef(false);

  const mutateSdkSession = useCallback(async <T,>(work: () => Promise<T>): Promise<T> => {
    sdkMutation.current = true;
    try { return await work(); } finally { sdkMutation.current = false; }
  }, []);

  const clearAuthenticatedState = () => {
    setUser(null);
    setAuthError(null);
    setPendingVerificationEmail(null);
  };

  const publishRestriction = useCallback(() => {
    clearAuthenticatedState();
    const phase = authLifecycle.current.recoveryPhase;
    setAuthState(phase === 'recovery' ? 'recovery' : phase === 'processing' ? 'recovery_processing' : 'recovery_interrupted');
  }, []);

  const resolveRecovery = useCallback(async (client: Awaited<ReturnType<typeof getSupabaseClient>>): Promise<Session | null> => {
    await authLifecycle.current.checkInterruption();
    if (authLifecycle.current.canReconcile) return null;
    publishRestriction();
    let preserved: Session | null = null;
    await authLifecycle.current.resolveInterruption(async () => {
      // This runs under the lifecycle's session-mutation queue. No newer login
      // can persist a session until cleanup AND marker deletion have finished.
      const before = await client.auth.getSession();
      if (before.error) throw new Error('Unable to resolve authentication state.');
      if (!before.data.session) return;
      if (authLifecycle.current.isUnchangedCallbackSession(before.data.session)) {
        preserved = before.data.session;
        return;
      }
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw new Error('Unable to resolve authentication state.');
      const current = await client.auth.getSession();
      if (current.error || current.data.session) throw new Error('Unable to resolve authentication state.');
    });
    if (!preserved) {
      clearAuthenticatedState();
      setAuthState('unauthenticated');
    }
    return preserved;
  }, [publishRestriction]);

  const invalidateAuthWork = () => {
    authCallback.current.cancel();
    googleOperation.current = null;
    const owner = authLifecycle.current.nextOperation();
    if (authLifecycle.current.recoveryPhase === 'interrupted') publishRestriction();
    return owner;
  };

  const reconcileSession = useCallback(async (session: Session | null): Promise<AuthActionResult> => {
    if (!authLifecycle.current.canReconcile) {
      publishRestriction();
      return { status: 'verification_required' };
    }
    if (!session) {
      authLifecycle.current.invalidate();
      clearAuthenticatedState();
      setAuthState('unauthenticated');
      return { status: 'verification_required' };
    }

    const identity = evaluateProviderIdentity(session.user);
    if (identity.status === 'unsupported_identity') {
      // Revoke pending bootstrap even if the subject/token did not change.
      authLifecycle.current.invalidate();
      clearAuthenticatedState();
      setAuthState('bootstrap_failed');
      setAuthError('Unable to verify your sign-in provider.');
      throw new Error('Unable to initialize your Chawgee account. Sign-in provider is not supported.');
    }
    if (identity.status === 'verification_required') {
      authLifecycle.current.invalidate();
      authLifecycle.current.beginSession(session.user.id, session.access_token);
      setUser(null);
      setAuthError(null);
      setPendingVerificationEmail(session.user.email ?? null);
      setAuthState('verification_required');
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
        const nextUser = accountToUser(session, account, identity.provider);
        setUser(nextUser);
        setAuthError(null);
        setPendingVerificationEmail(null);
        setAuthState('authenticated');
        await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextUser));
        return { status: 'authenticated' };
      } catch (error) {
        if (!authLifecycle.current.isCurrent(generation, session.user.id, session.access_token)) {
          return { status: 'verification_required' };
        }
        clearAuthenticatedState();
        setAuthState('bootstrap_failed');
        throw error instanceof Error
          ? error
          : new Error('Unable to initialize your Chawgee account.');
      } finally {
        bootstrapPromises.current.delete(bootstrapKey);
      }
    })();

    bootstrapPromises.current.set(bootstrapKey, bootstrap);
    return bootstrap;
  }, [publishRestriction]);

  useEffect(() => {
    let mounted = true;
    let client: Awaited<ReturnType<typeof getSupabaseClient>> | undefined;
    let subscription: { unsubscribe: () => void } | undefined;
    const callbackCoordinator = authCallback.current;
    const lifecycleCoordinator = authLifecycle.current;

    const restoreOwner = authLifecycle.current.operationGeneration;
    const restore = async () => {
      try {
        await authLifecycle.current.checkInterruption();
        client = await getSupabaseClient();
        await resolveRecovery(client);
        if (!mounted || !authLifecycle.current.ownsOperation(restoreOwner)) return;
        const { data, error } = await client.auth.getSession();
        if (!mounted || !authLifecycle.current.ownsOperation(restoreOwner)) return;

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
              setAuthState('guest');
              return;
            }
            await AsyncStorage.setItem(LEGACY_MOCK_STORAGE_KEY, stored);
            await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
          } catch {
            await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
          }
        }
        setAuthState('unauthenticated');
      } catch {
        if (mounted) {
          if (!authLifecycle.current.canReconcile) {
            publishRestriction();
            return;
          }
          const stored = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
          try {
            const parsed = stored ? JSON.parse(stored) as User : null;
            if (parsed?.isGuest) {
              setUser(parsed);
              setAuthState('guest');
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
          setAuthState('unauthenticated');
          setAuthError('Authentication is not configured.');
        }
      } finally {
        ready.current = true;
        if (mounted) setAuthState((current) => current === 'loading' ? 'unauthenticated' : current);
      }
    };

    void authLifecycle.current.runExclusive(restore);
    (async () => {
      try {
        client = client ?? await getSupabaseClient();
        if (!mounted) return;
        const result = client.auth.onAuthStateChange((event, session) => {
          if (!mounted) return;
          const lifecycle = authLifecycle.current;
          if (event === 'PASSWORD_RECOVERY') {
            // The callback transaction owns the pre-persistence restriction.
            // Late events outside that transaction cannot grant recovery or
            // overwrite a newer login. Exchange return evidence is also checked.
            if (session && activeCallbackOwner.current !== null) {
              lifecycle.recordRecoveryEvidence(activeCallbackOwner.current, session, 'PASSWORD_RECOVERY');
            } else if (session && lifecycle.canReconcile) {
              const owner = lifecycle.operationGeneration;
              void lifecycle.runExclusive(async () => {
                if (!mounted || !lifecycle.ownsOperation(owner) || !lifecycle.canReconcile) return;
                const current = await client!.auth.getSession();
                if (!lifecycle.ownsOperation(owner) || current.error ||
                    current.data.session?.access_token !== session.access_token ||
                    current.data.session?.user.id !== session.user.id) return;
                // Out-of-transaction evidence cannot authorize recovery. It
                // does quarantine the current SDK session until safe cleanup.
                try { await lifecycle.interruptSession(); } finally { publishRestriction(); }
              }).catch(() => {});
            }
            return;
          }
          // SDK notifications happen inside SDK locks. Never await SDK calls
          // here, and never reconcile an intermediate exchange/login event.
          if (!ready.current || !lifecycle.canReconcile || sdkMutation.current) return;
          const owner = lifecycle.operationGeneration;
          // Reconciliation does not write SDK sessions. Keep it outside the
          // mutation queue so refresh/logout still invalidate pending bootstrap.
          void (async () => {
            if (!mounted || !lifecycle.ownsOperation(owner) || !lifecycle.canReconcile) return;
            const current = await client!.auth.getSession();
            if (current.error || !lifecycle.ownsOperation(owner)) return;
            // Discard delayed notifications that no longer describe the SDK slot.
            if ((current.data.session?.access_token ?? null) !== (session?.access_token ?? null)) return;
            await reconcileSession(current.data.session);
          })().catch(() => {});
        });
        subscription = result.data.subscription;
      } catch {
        // Missing public configuration is surfaced through the existing auth state.
      }
    })();

    return () => {
      mounted = false;
      ready.current = false;
      callbackCoordinator.cancel();
      googleOperation.current = null;
      lifecycleCoordinator.nextOperation();
      subscription?.unsubscribe();
    };
  }, [reconcileSession, resolveRecovery, publishRestriction]);

  const processAuthCallback = useCallback((incomingUrl: string, googleProvenance?: { owner: number; flowId: string }): Promise<CallbackResult> => {
    if (googleProvenance && (!authLifecycle.current.ownsOperation(googleProvenance.owner) ||
        googleOperation.current?.owner !== googleProvenance.owner ||
        googleOperation.current.flowId !== googleProvenance.flowId)) {
      return Promise.resolve({ status: 'failed', reason: 'stale_operation' });
    }
    const parsed = parseAuthCallbackUrl(incomingUrl);
    if (parsed.kind !== 'code' && parsed.kind !== 'recovery') {
      return authCallback.current.process(incomingUrl, {
        exchangeCode: async () => ({ data: { session: null }, error: null }),
        reconcileSession,
      });
    }
    const intent = parsed.kind === 'recovery' ? 'recovery' : parsed.intent;
    const resultIntent = intent === 'recovery' ? { intent: 'recovery' as const } : {};
    const existing = callbackRequests.current.get(parsed.code);
    if (existing) return existing.intent === intent ? existing.promise
      : Promise.resolve({ status: 'failed', reason: 'recovery_evidence_mismatch', intent: 'recovery' });
    if (authCallback.current.hasConsumedCode(parsed.code)) return Promise.resolve({ status: 'replayed', reason: 'replayed', ...resultIntent });
    const admittedGoogle = intent === undefined && (googleProvenance ?? googleOperation.current) &&
      authLifecycle.current.ownsOperation((googleProvenance ?? googleOperation.current!).owner) &&
      googleOperation.current?.owner === (googleProvenance ?? googleOperation.current!).owner &&
      googleOperation.current.flowId === (googleProvenance ?? googleOperation.current!).flowId
      ? (googleProvenance ?? googleOperation.current)
      : null;
    if (googleProvenance && !admittedGoogle) return Promise.resolve({ status: 'failed', reason: 'stale_operation' });
    authCallback.current.cancel();
    const owner = admittedGoogle?.owner ?? authLifecycle.current.nextOperation();
    if (!admittedGoogle) googleOperation.current = null;
    if (authLifecycle.current.recoveryPhase === 'interrupted') publishRestriction();
    const pending = authLifecycle.current.runExclusive(async (): Promise<CallbackResult> => {
      const lifecycle = authLifecycle.current;
      if (!lifecycle.ownsOperation(owner)) return { status: 'failed', reason: 'stale_operation', ...resultIntent };
      try {
        await lifecycle.checkInterruption();
        const client = await getSupabaseClient();
        await resolveRecovery(client);
        if (!lifecycle.ownsOperation(owner)) return { status: 'failed', reason: 'stale_operation', ...resultIntent };
        activeCallbackOwner.current = owner;
        const result = await authCallback.current.process(incomingUrl, {
          exchangeCode: async (code, options) => {
            const exchange = await client.auth.exchangeCodeForSession(code, options);
            // The installed SDK returns redirectType at runtime, but its public
            // exchange declaration omits it. Narrow rather than asserting it.
            if (exchange.data.session && 'redirectType' in exchange.data && exchange.data.redirectType === 'recovery') {
              lifecycle.recordRecoveryEvidence(owner, exchange.data.session, 'exchange_redirect_type');
            }
            return exchange;
          },
          flowId: admittedGoogle?.flowId,
          reconcileSession,
          getCurrentSession: async () => {
            const current = await client.auth.getSession();
            if (current.error) throw new Error('Unable to read authentication state.');
            return current.data.session;
          },
          beforeExchange: async (baseline) => {
            await lifecycle.beginCallback(owner, baseline);
            publishRestriction();
          },
          admitSession: async (session, redirectType, callbackIntent) => {
            const identity = evaluateProviderIdentity(session.user);
            if (admittedGoogle) {
              if (identity.status !== 'eligible' || identity.provider !== 'google') {
                return { status: 'failed', reason: 'verification_failed' };
              }
            }
            let recovery: boolean;
            try {
              recovery = await lifecycle.finishCallback(owner, session, redirectType, callbackIntent);
            } catch (error) {
              if (error instanceof RecoveryEvidenceMismatchError) {
                return { status: 'failed', reason: 'recovery_evidence_mismatch', intent: 'recovery' };
              }
              throw error;
            }
            if (recovery) {
              publishRestriction();
              return { status: 'recovery' };
            }
            if (identity.status === 'eligible' && identity.provider === 'google' && !admittedGoogle) {
              return { status: 'failed', reason: 'verification_failed' };
            }
            return null;
          },
        });
        if (lifecycle.recoveryPhase === 'recovery' && lifecycle.ownsOperation(owner)) return result;
        // Failed/stale exchanges may already have changed SDK persistence.
        // Resolve them before any queued login, logout or guest transition runs.
        if (!lifecycle.canReconcile) {
          const preserved = await resolveRecovery(client);
          if (preserved && lifecycle.ownsOperation(owner)) await reconcileSession(preserved);
        }
        return result;
      } catch {
        if (!lifecycle.canReconcile) publishRestriction();
        return { status: 'failed', reason: 'verification_failed', ...resultIntent };
      } finally {
        activeCallbackOwner.current = null;
        if (admittedGoogle && googleOperation.current?.owner === admittedGoogle.owner) googleOperation.current = null;
      }
    });
    callbackRequests.current.set(parsed.code, { intent, promise: pending });
    void pending.finally(() => { callbackRequests.current.delete(parsed.code); });
    return pending;
  }, [reconcileSession, resolveRecovery, publishRestriction]);

  const signIn = async (email: string, password: string): Promise<AuthActionResult> => {
    const owner = invalidateAuthWork();
    return authLifecycle.current.runExclusive(async () => {
      if (!authLifecycle.current.ownsOperation(owner)) throw new Error('Authentication operation is no longer current.');
      try {
        let client: Awaited<ReturnType<typeof getSupabaseClient>>;
        try {
          await authLifecycle.current.checkInterruption();
          client = await getSupabaseClient();
          await resolveRecovery(client);
        } catch {
          throw new Error(safeAuthMessage('sign in'));
        }

        const { data, error } = await mutateSdkSession(() => client.auth.signInWithPassword({ email: email.trim(), password }));
        if (!authLifecycle.current.ownsOperation(owner)) throw new Error('Stale sign in.');
        if (error) {
          const errorText = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
          if (errorText.includes('email_not_confirmed') || errorText.includes('email not confirmed')) {
            setPendingVerificationEmail(email.trim());
            setAuthState('verification_required');
            return { status: 'verification_required' };
          }
          throw new Error(safeAuthMessage('sign in'));
        }
        if (!data.session) throw new Error(safeAuthMessage('sign in'));
        return await reconcileSession(data.session);
      } catch (error) {
        const message = error instanceof Error && error.message.includes('Chawgee account')
          ? error.message
          : safeAuthMessage('sign in');
        if (!authLifecycle.current.canReconcile) publishRestriction();
        if (authLifecycle.current.ownsOperation(owner)) setAuthError(message);
        throw new Error(message);
      }
    });
  };

  const signUp = async (email: string, password: string, name?: string): Promise<AuthActionResult> => {
    const owner = invalidateAuthWork();
    return authLifecycle.current.runExclusive(async () => {
      if (!authLifecycle.current.ownsOperation(owner)) throw new Error('Authentication operation is no longer current.');
      try {
        await authLifecycle.current.checkInterruption();
        const client = await getSupabaseClient();
        await resolveRecovery(client);
        const { data, error } = await mutateSdkSession(() => client.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: AUTH_CALLBACK_URI,
            data: { full_name: name?.trim() || undefined },
          },
        }));
        if (!authLifecycle.current.ownsOperation(owner)) throw new Error('Stale sign up.');
        if (error) throw new Error(safeAuthMessage('create account'));
        if (!data.session) {
          setPendingVerificationEmail(data.user?.email ?? email.trim());
          setAuthState('verification_required');
          return { status: 'verification_required' };
        }
        return await reconcileSession(data.session);
      } catch (error) {
        const message = error instanceof Error && error.message.includes('Chawgee account')
          ? error.message
          : safeAuthMessage('create account');
        if (!authLifecycle.current.canReconcile) publishRestriction();
        if (authLifecycle.current.ownsOperation(owner)) setAuthError(message);
        throw new Error(message);
      }
    });
  };

  const signInWithGoogle = async (): Promise<CallbackResult> => {
    const owner = invalidateAuthWork();
    let authorizationUrl: string;
    let flowId: string;
    try {
      const initiation = await authLifecycle.current.runExclusive(async () => {
        if (!authLifecycle.current.ownsOperation(owner)) throw new Error('stale');
        await authLifecycle.current.checkInterruption();
        const client = await getSupabaseClient();
        await resolveRecovery(client);
        if (!authLifecycle.current.ownsOperation(owner)) throw new Error('stale');

        const { data, error } = await mutateSdkSession(() => client.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: AUTH_CALLBACK_URI,
            skipBrowserRedirect: true,
          },
        }));

        if (!authLifecycle.current.ownsOperation(owner) || error || !data?.url || !data.flowId) throw new Error('Unable to start Google sign-in.');
        googleOperation.current = { owner, flowId: data.flowId };
        return { url: data.url, flowId: data.flowId };
      });
      authorizationUrl = initiation.url;
      flowId = initiation.flowId;
    } catch {
      if (authLifecycle.current.ownsOperation(owner)) setAuthError('Unable to start Google sign-in.');
      return { status: 'failed', reason: 'verification_failed' };
    }

    if (!authLifecycle.current.ownsOperation(owner) || googleOperation.current?.flowId !== flowId) {
      return { status: 'failed', reason: 'stale_operation' };
    }
    let browserResult: Awaited<ReturnType<typeof WebBrowser.openAuthSessionAsync>>;
    try {
      browserResult = await WebBrowser.openAuthSessionAsync(authorizationUrl, AUTH_CALLBACK_URI);
    } catch {
      browserResult = { type: WebBrowser.WebBrowserResultType.DISMISS };
    }
    if (browserResult.type === 'cancel' || browserResult.type === 'dismiss' || browserResult.type === 'locked') {
      if (googleOperation.current?.owner === owner) {
        googleOperation.current = null;
        authLifecycle.current.nextOperation();
      }
      return { status: 'failed', reason: 'verification_failed' };
    }
    if (browserResult.type !== 'success' || !browserResult.url) return { status: 'failed', reason: 'verification_failed' };
    return processAuthCallback(browserResult.url, { owner, flowId });
  };

  const signInAsGuest = async () => {
    const owner = invalidateAuthWork();
    return authLifecycle.current.runExclusive(async () => {
      if (!authLifecycle.current.ownsOperation(owner)) return;
      try {
        await authLifecycle.current.checkInterruption();
        if (!authLifecycle.current.canReconcile) await resolveRecovery(await getSupabaseClient());
        if (!authLifecycle.current.ownsOperation(owner)) return;
        const nextUser = guestUser();
        await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextUser));
        if (!authLifecycle.current.ownsOperation(owner)) return;
        setUser(nextUser);
        setAuthError(null);
        setAuthState('guest');
      } catch {
        publishRestriction();
        throw new Error('Unable to resolve authentication state.');
      }
    });
  };

  const updateAccountIdentity = async (email: string, name?: string) => {
    if (!user || user.isGuest || !authLifecycle.current.canReconcile) return;
    const owner = authLifecycle.current.operationGeneration;
    return authLifecycle.current.runExclusive(async () => {
      if (!authLifecycle.current.ownsOperation(owner) || !authLifecycle.current.canReconcile) return;
      const client = await getSupabaseClient();
      const { error } = await mutateSdkSession(() => client.auth.updateUser({
        email: email.trim(),
        data: { full_name: name?.trim() || undefined },
      }));
      if (error) throw new Error('Unable to update your account details.');
      if (!authLifecycle.current.ownsOperation(owner)) return;
      setUser((current) => current ? { ...current, email: email.trim(), name: name?.trim() || undefined } : current);
    });
  };

  const requestPasswordRecovery = useCallback(async (email: string): Promise<PasswordRecoveryRequestResult> => {
    if (!isValidRecoveryEmail(email.trim())) return { status: 'failed', reason: 'invalid_email' };
    try {
      const client = await getSupabaseClient();
      return await requestPasswordRecoveryAction(email, AUTH_CALLBACK_URI, (trimmedEmail, options) =>
        mutateSdkSession(() => client.auth.resetPasswordForEmail(trimmedEmail, options)));
    } catch {
      return { status: 'failed', reason: 'request_failed' };
    }
  }, [mutateSdkSession]);

  const completePasswordRecovery = useCallback(async (newPassword: string): Promise<PasswordRecoveryCompletionResult> => {
    if (!isValidRecoveryPassword(newPassword)) return { status: 'failed', reason: 'invalid_password' };

    // Ownership is captured, never advanced: advancing it here would revoke
    // the very recovery this action is meant to complete.
    const owner = authLifecycle.current.operationGeneration;
    return authLifecycle.current.runExclusive(async (): Promise<PasswordRecoveryCompletionResult> => {
      const lifecycle = authLifecycle.current;
      const isAuthorized = () => lifecycle.ownsOperation(owner) && lifecycle.recoveryPhase === 'recovery';
      if (!isAuthorized()) return { status: 'failed', reason: 'not_authorized' };

      let client: Awaited<ReturnType<typeof getSupabaseClient>>;
      try {
        client = await getSupabaseClient();
      } catch {
        return { status: 'failed', reason: 'update_failed' };
      }
      if (!isAuthorized()) return { status: 'failed', reason: 'not_authorized' };

      let updateError: { message?: string } | null;
      try {
        const result = await mutateSdkSession(() => client.auth.updateUser({ password: newPassword }));
        updateError = result.error;
      } catch {
        updateError = { message: 'network' };
      }
      // Re-check after the round trip: a logout, new login, or a newer
      // recovery may have superseded this operation while we awaited the SDK.
      if (!isAuthorized()) return { status: 'failed', reason: 'not_authorized' };
      if (updateError) return { status: 'failed', reason: 'update_failed' };

      try {
        await lifecycle.resolveInterruption(async () => {
          const { error } = await client.auth.signOut({ scope: 'local' });
          if (error) throw new Error('Unable to terminate the recovery session.');
        });
      } catch {
        publishRestriction();
        return { status: 'failed', reason: 'cleanup_failed' };
      }

      clearAuthenticatedState();
      setAuthState('unauthenticated');
      return { status: 'completed' };
    });
  }, [mutateSdkSession, publishRestriction]);

  const signOut = async () => {
    const owner = invalidateAuthWork();
    clearAuthenticatedState();
    setAuthState('unauthenticated');
    return authLifecycle.current.runExclusive(async () => {
      if (!authLifecycle.current.ownsOperation(owner)) return;
      try {
        await authLifecycle.current.checkInterruption();
        if (!authLifecycle.current.canReconcile) {
          const client = await getSupabaseClient();
          const preserved = await resolveRecovery(client);
          if (preserved) {
            const { error } = await mutateSdkSession(() => client.auth.signOut());
            if (error) throw error;
          }
        } else if (!user?.isGuest) {
          const client = await getSupabaseClient();
          const { error } = await mutateSdkSession(() => client.auth.signOut());
          if (error) throw error;
        }
        await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
      } catch {
        if (!authLifecycle.current.canReconcile) publishRestriction();
        throw new Error('Unable to sign out right now.');
      }
    });
  };

  return (
    <AuthContext.Provider value={{
      user,
      authState,
      authError,
      pendingVerificationEmail,
      processAuthCallback,
      isLoading: authState === 'loading',
      signIn,
      signUp,
      signInWithGoogle,
      signInAsGuest,
      updateAccountIdentity,
      requestPasswordRecovery,
      completePasswordRecovery,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
