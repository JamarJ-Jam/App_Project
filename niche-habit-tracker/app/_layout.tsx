import '../src/storage/utils/notifications';
import React from 'react';
import { Stack } from 'expo-router';
import { ThemeProvider } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/context/ThemeContext';
import { AuthProvider } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/context/AuthContext';

export default function RootLayout() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="auth/login" />
          <Stack.Screen name="auth/signup" />
          <Stack.Screen name="auth/onboarding" />
          <Stack.Screen name="(tabs)" />
        </Stack>
      </ThemeProvider>
    </AuthProvider>
  );
}
