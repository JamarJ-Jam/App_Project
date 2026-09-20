import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { usePathname, useRouter, useSegments, type Href } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { classifyRoute, resolveRouteAccess } from '../src/auth/routeAccess';

export default function AuthRouteGuard() {
  const { authState } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const pathname = usePathname();
  const lastRedirect = useRef<string | null>(null);
  const routeKind = classifyRoute(segments);
  const decision = resolveRouteAccess(authState, routeKind);

  useEffect(() => {
    if (decision.type !== 'redirect') {
      lastRedirect.current = null;
      return;
    }

    const redirectKey = `${pathname}:${decision.href}`;
    if (lastRedirect.current === redirectKey || pathname === decision.href) return;
    lastRedirect.current = redirectKey;
    router.replace(decision.href as Href);
  }, [decision, pathname, router]);

  if (decision.type === 'hold' || decision.type === 'redirect') {
    return (
      <View style={styles.loading} pointerEvents="none">
        <ActivityIndicator />
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  loading: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    zIndex: 10,
  },
});