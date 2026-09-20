import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAuthCallbackHandoff } from '../../src/context/AuthCallbackHandoffContext';
import { useTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/context/ThemeContext';
import { LightTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/constants/colors';

 type CallbackViewState =
  | { kind: 'processing' }
  | { kind: 'complete' }
  | { kind: 'failed'; message: string };

const failureMessage = (reason: string): string => {
  if (reason === 'device_verifier_missing') {
    return 'Verification may have completed, but this device cannot finish the session. Return to My Chawgee and sign in.';
  }
  if (reason === 'conflicting_identity') {
    return 'This verification link cannot be used with the current account.';
  }
  if (reason === 'replayed') {
    return 'This verification link has already been used.';
  }
  return 'We could not complete email verification. Return to My Chawgee and try again.';
};

export default function AuthCallbackScreen() {
  const { theme = LightTheme } = useTheme() || {};
  const callback = useAuthCallbackHandoff();
  const viewState: CallbackViewState = callback.status !== 'complete'
    ? { kind: 'processing' }
    : callback.result.status === 'authenticated' || callback.result.status === 'verification_required'
      ? { kind: 'complete' }
      : { kind: 'failed', message: failureMessage(callback.result.reason) };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {viewState.kind === 'processing' ? <ActivityIndicator color={theme.primaryAccent} /> : null}
      <Text style={[styles.title, { color: theme.textPrimary }]}>
        {viewState.kind === 'processing' ? 'Verifying your email' : viewState.kind === 'complete' ? 'Email verification complete' : 'Verification could not be completed'}
      </Text>
      {viewState.kind === 'failed' ? (
        <Text style={[styles.message, { color: theme.textSecondary }]}>{viewState.message}</Text>
      ) : null}
      {viewState.kind === 'complete' ? (
        <Text style={[styles.message, { color: theme.textSecondary }]}>Return to My Chawgee to continue.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  message: {
    maxWidth: 340,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
});
