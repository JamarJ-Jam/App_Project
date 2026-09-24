import '../src/storage/utils/notifications';
import React from 'react';
import { Stack } from 'expo-router';
import { ThemeProvider } from '../src/context/ThemeContext';
import { AuthProvider } from '../src/context/AuthContext';
import { AuthCallbackHandoffProvider } from '../src/context/AuthCallbackHandoffContext';
import AuthRouteGuard from '../components/AuthRouteGuard';

export default function RootLayout() {
  return (
    <AuthProvider>
      <AuthCallbackHandoffProvider>
        <ThemeProvider>
          <AuthRouteGuard />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="auth/login" />
            <Stack.Screen name="auth/signup" />
            <Stack.Screen name="auth/onboarding" />
            <Stack.Screen name="auth/callback" />
            <Stack.Screen name="auth/reset-password" />
            <Stack.Screen name="(tabs)" />
          </Stack>
        </ThemeProvider>
      </AuthCallbackHandoffProvider>
    </AuthProvider>
  );
}
