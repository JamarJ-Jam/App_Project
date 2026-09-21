import React, { useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/context/ThemeContext';
import { LightTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/constants/colors';
import { useAuth } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/context/AuthContext';

export default function LoginScreen() {
  const { theme = LightTheme } = useTheme() || {};
  const router = useRouter();
  const { passwordUpdated } = useLocalSearchParams<{ passwordUpdated?: string }>();
  const { signIn, signInWithGoogle, signInAsGuest, requestPasswordRecovery, authState, authError } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<'signin' | 'forgot'>('signin');
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoverySubmitting, setRecoverySubmitting] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const googlePending = useRef(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing Fields', 'Please enter both email and password.');
      return;
    }
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const result = await signIn(email.trim(), password);
      if (result.status === 'verification_required' || authState === 'verification_required') {
        Alert.alert('Verify Your Email', 'Check your inbox and verify your email before continuing.');
        return;
      }
      router.replace('/(tabs)/dashboard');
    } catch (error) {
      Alert.alert('Unable to Sign In', error instanceof Error ? error.message : authError ?? 'Please try again.');
    }
  };

  const handleForgotPassword = () => {
    setRecoveryEmail(email.trim());
    setRecoveryMessage(null);
    setMode('forgot');
  };

  const handleBackToSignIn = () => {
    setMode('signin');
    setRecoveryMessage(null);
  };

  const handleRequestRecovery = async () => {
    if (recoverySubmitting) return;
    setRecoverySubmitting(true);
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const result = await requestPasswordRecovery(recoveryEmail);
      if (result.status === 'failed' && result.reason === 'invalid_email') {
        Alert.alert('Enter Your Email', 'Enter a valid email address to receive a reset link.');
        return;
      }
      if (result.status === 'failed') {
        setRecoveryMessage('Unable to send a reset link right now. Please try again in a moment.');
        return;
      }
      setRecoveryMessage("If an account exists for this email, we'll send a password reset link.");
    } finally {
      setRecoverySubmitting(false);
    }
  };

  const handleGoogleAuth = async () => {
    if (googlePending.current) return;
    googlePending.current = true;
    setGoogleSubmitting(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const result = await signInWithGoogle();
      if (result.status === 'failed' && result.reason !== 'stale_operation') {
        Alert.alert('Google Sign In', 'Unable to start Google sign-in. Please try again.');
      }
    } catch {
      Alert.alert('Google Sign In', 'Unable to start Google sign-in. Please try again.');
    } finally {
      googlePending.current = false;
      setGoogleSubmitting(false);
    }
  };

  const handleGuestLogin = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await signInAsGuest();
    router.replace('/(tabs)/dashboard');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity
            style={[styles.backButton, { borderColor: theme.border, backgroundColor: theme.cardBackground }]}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={20} color={theme.textPrimary} />
          </TouchableOpacity>

          <View style={styles.headerContainer}>
            <View style={[styles.brandIcon, { backgroundColor: `${theme.primaryAccent}18` }]}>
              <Ionicons name={mode === 'forgot' ? 'key-outline' : 'sparkles'} size={24} color={theme.primaryAccent} />
            </View>
            <Text style={[styles.title, { color: theme.textPrimary }]}>
              {mode === 'forgot' ? 'Reset Your Password' : 'Welcome Back'}
            </Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              {mode === 'forgot'
                ? 'Enter your email and we will send you a password reset link.'
                : 'Sign in to continue with your Chawgee.'}
            </Text>
          </View>

          {mode === 'signin' && passwordUpdated === '1' && (
            <Text style={[styles.recoverySuccessBanner, { color: theme.primaryAccent }]}>
              Password updated. Sign in with your new password.
            </Text>
          )}

          {mode === 'forgot' ? (
            <View style={[styles.formCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: theme.textPrimary }]}>Email Address</Text>
                <View style={[styles.inputWrapper, { borderColor: theme.border, backgroundColor: theme.inputBackground }]}>
                  <Ionicons name="mail-outline" size={20} color={theme.textSecondary} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: theme.textPrimary }]}
                    placeholder="alex@example.com"
                    placeholderTextColor={theme.textSecondary}
                    value={recoveryEmail}
                    onChangeText={setRecoveryEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    editable={!recoverySubmitting}
                  />
                </View>
              </View>

              {recoveryMessage && (
                <Text style={[styles.recoveryMessage, { color: theme.textSecondary }]}>{recoveryMessage}</Text>
              )}

              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: theme.primaryAccent, opacity: recoverySubmitting ? 0.7 : 1 }]}
                onPress={handleRequestRecovery}
                activeOpacity={0.85}
                disabled={recoverySubmitting}
              >
                <Text style={styles.primaryBtnText}>{recoverySubmitting ? 'Sending…' : 'Send Reset Link'}</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={handleBackToSignIn} disabled={recoverySubmitting}>
                <Text style={[styles.signUpLink, { color: theme.primaryAccent, textAlign: 'center' }]}>
                  Back to Sign In
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
          <View style={[styles.formCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.textPrimary }]}>Email Address</Text>
              <View style={[styles.inputWrapper, { borderColor: theme.border, backgroundColor: theme.inputBackground }]}>
                <Ionicons name="mail-outline" size={20} color={theme.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: theme.textPrimary }]}
                  placeholder="alex@example.com"
                  placeholderTextColor={theme.textSecondary}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.textPrimary }]}>Password</Text>
              <View style={[styles.inputWrapper, { borderColor: theme.border, backgroundColor: theme.inputBackground }]}>
                <Ionicons name="lock-closed-outline" size={20} color={theme.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: theme.textPrimary }]}
                  placeholder="••••••••"
                  placeholderTextColor={theme.textSecondary}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity onPress={() => setShowPassword((current) => !current)}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity onPress={handleForgotPassword} style={styles.forgotPasswordRow}>
              <Text style={[styles.forgotPasswordText, { color: theme.primaryAccent }]}>Forgot password?</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: theme.primaryAccent }]}
              onPress={handleLogin}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>Sign In</Text>
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
              <Text style={[styles.dividerText, { color: theme.textSecondary }]}>OR</Text>
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
            </View>

            <TouchableOpacity
              style={[styles.socialBtn, { borderColor: theme.border, backgroundColor: theme.inputBackground }]}
              onPress={handleGoogleAuth}
              disabled={googleSubmitting}
              accessibilityState={{ disabled: googleSubmitting, busy: googleSubmitting }}
            >
              <Ionicons name="logo-google" size={18} color="#EA4335" />
              <Text style={[styles.socialBtnText, { color: theme.textPrimary }]}>Continue with Google</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.guestBtn, { borderColor: theme.border }]}
              onPress={handleGuestLogin}
            >
              <Text style={[styles.guestBtnText, { color: theme.textSecondary }]}>Explore as Guest</Text>
            </TouchableOpacity>
          </View>
          )}

          {mode === 'signin' && (
          <View style={styles.footer}>
            <Text style={{ color: theme.textSecondary }}>Don&apos;t have an account? </Text>
            <TouchableOpacity onPress={() => router.replace('/auth/signup')}>
              <Text style={[styles.signUpLink, { color: theme.primaryAccent }]}>Sign Up</Text>
            </TouchableOpacity>
          </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 28, justifyContent: 'center' },
  backButton: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 22, alignSelf: 'flex-start' },
  headerContainer: { alignItems: 'center', marginBottom: 22 },
  brandIcon: { width: 52, height: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { fontSize: 28, fontWeight: '900', letterSpacing: -0.6 },
  subtitle: { fontSize: 14, lineHeight: 20, fontWeight: '600', marginTop: 6, textAlign: 'center' },
  formCard: { borderWidth: 1, borderRadius: 22, padding: 18, gap: 16 },
  inputGroup: { gap: 7 },
  label: { fontSize: 12, fontWeight: '800' },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, minHeight: 50 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 15 },
  forgotPasswordRow: { alignSelf: 'flex-end', marginTop: -6 },
  forgotPasswordText: { fontSize: 13, fontWeight: '800' },
  recoveryMessage: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  recoverySuccessBanner: { fontSize: 13, fontWeight: '700', lineHeight: 19, textAlign: 'center', marginBottom: 16 },
  primaryBtn: { minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '900', fontSize: 15 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 2 },
  divider: { flex: 1, height: 1 },
  dividerText: { fontSize: 10, fontWeight: '800' },
  socialBtn: { flexDirection: 'row', minHeight: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  socialBtnText: { fontWeight: '800', fontSize: 14 },
  guestBtn: { minHeight: 46, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  guestBtnText: { fontWeight: '700', fontSize: 13 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  signUpLink: { fontWeight: '900' },
});
