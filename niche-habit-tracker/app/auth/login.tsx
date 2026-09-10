import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/context/ThemeContext';
import { LightTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/constants/colors';
import { useAuth } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/context/AuthContext';

export default function LoginScreen() {
  const { theme = LightTheme } = useTheme() || {};
  const router = useRouter();
  const { signIn, signInWithGoogle, signInAsGuest } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing Fields', 'Please enter both email and password.');
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await signIn(email.trim());
    router.replace('/(tabs)/dashboard');
  };

  const handleGoogleAuth = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await signInWithGoogle('user@gmail.com', 'Google User');
    router.replace('/auth/onboarding');
  };

  const handleGuestLogin = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await signInAsGuest();
    router.replace('/(tabs)/dashboard');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.headerContainer}>
          <TouchableOpacity
            style={[styles.backButton, { borderColor: theme.border }]}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={20} color={theme.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.textPrimary }]}>Welcome Back</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Sign in to continue tracking your accountability goals
          </Text>
        </View>

        <View style={styles.formContainer}>
          {/* Email Input */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.textPrimary }]}>Email Address</Text>
            <View style={[styles.inputWrapper, { borderColor: theme.border, backgroundColor: theme.cardBackground }]}>
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

          {/* Password Input */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.textPrimary }]}>Password</Text>
            <View style={[styles.inputWrapper, { borderColor: theme.border, backgroundColor: theme.cardBackground }]}>
              <Ionicons name="lock-closed-outline" size={20} color={theme.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: theme.textPrimary }]}
                placeholder="••••••••"
                placeholderTextColor={theme.textSecondary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={theme.textSecondary}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Login Button */}
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: theme.fitnessAccent }]}
            onPress={handleLogin}
          >
            <Text style={styles.primaryBtnText}>Sign In</Text>
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <Text style={[styles.dividerText, { color: theme.textSecondary }]}>OR</Text>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
          </View>

          {/* Google OAuth Button */}
          <TouchableOpacity
            style={[styles.socialBtn, { borderColor: theme.border, backgroundColor: theme.cardBackground }]}
            onPress={handleGoogleAuth}
          >
            <Ionicons name="logo-google" size={18} color="#EA4335" />
            <Text style={[styles.socialBtnText, { color: theme.textPrimary }]}>Continue with Google</Text>
          </TouchableOpacity>

          {/* Guest Login */}
          <TouchableOpacity
            style={[styles.guestBtn, { borderColor: theme.border }]}
            onPress={handleGuestLogin}
          >
            <Text style={[styles.guestBtnText, { color: theme.textSecondary }]}>Explore as Guest</Text>
          </TouchableOpacity>
        </View>

        {/* Footer Link */}
        <View style={styles.footer}>
          <Text style={{ color: theme.textSecondary }}>Don't have an account? </Text>
          <TouchableOpacity onPress={() => router.replace('/auth/signup')}>
            <Text style={[styles.signUpLink, { color: theme.fitnessAccent }]}>Sign Up</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  keyboardView: { flex: 1, paddingHorizontal: 24, justifyContent: 'space-between', paddingVertical: 20 },
  headerContainer: { marginTop: 10 },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { fontSize: 14, marginTop: 6, lineHeight: 20 },
  formContainer: { gap: 16, marginVertical: 20 },
  inputGroup: { gap: 6 },
  label: { fontSize: 13, fontWeight: '700' },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 15 },
  primaryBtn: {
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 6 },
  divider: { flex: 1, height: 1 },
  dividerText: { fontSize: 11, fontWeight: '700' },
  socialBtn: {
    flexDirection: 'row',
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  socialBtnText: { fontWeight: '700', fontSize: 14 },
  guestBtn: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestBtnText: { fontWeight: '600', fontSize: 13 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginBottom: 10 },
  signUpLink: { fontWeight: '800' },
});