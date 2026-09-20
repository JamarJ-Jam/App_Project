import React, { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import * as Linking from 'expo-linking';
import { AuthCallbackHandoff } from '../auth/authCallbackHandoff';
import { useAuth } from './AuthContext';

const HandoffContext = createContext<AuthCallbackHandoff | null>(null);

export function AuthCallbackHandoffProvider({ children }: { children: React.ReactNode }) {
  const { processAuthCallback } = useAuth();
  const [handoff] = useState(() => new AuthCallbackHandoff());
  const ready = useSyncExternalStore(handoff.subscribe, handoff.isReady, handoff.isReady);

  useEffect(() => handoff.start(Linking, processAuthCallback),
    [handoff, processAuthCallback]);

  // Install capture before Router screens mount, including the callback screen.
  return <HandoffContext.Provider value={handoff}>{ready ? children : null}</HandoffContext.Provider>;
}

export function useAuthCallbackHandoff() {
  const handoff = useContext(HandoffContext);
  if (!handoff) throw new Error('Auth callback handoff provider is unavailable.');
  return useSyncExternalStore(handoff.subscribe, handoff.getSnapshot, handoff.getSnapshot);
}
