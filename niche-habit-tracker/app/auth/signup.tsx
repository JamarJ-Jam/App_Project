import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/context/ThemeContext';
import { useAuth } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/context/AuthContext';
import { LightTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/constants/colors';

export default function SignUpScreen() {
  const { theme = LightTheme } = useTheme() || {};
  const { signUp, signInWithGoogle } = useAuth();
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleSignUp = async () => {
    if (!email.trim() || !password.trim() || !fullName.trim()) {
      Alert.alert('Missing Fields', 'Please complete all fields to create your account.');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Password Mismatch', 'Passwords do not match. Please re-enter.');
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await signUp(email.trim(), fullName.trim());
    router.replace('/auth/onboarding');
  };

  const handleGoogleAuth = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await signInWithGoogle('user@gmail.com', 'Google User');
    router.replace('/auth/onboarding');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.innerContainer}
      >
        <View style={styles.headerBox}>
          <Text style={[styles.brandSubtitle, { color: theme.fitnessAccent }]}>
            ACCOUNTABILITY APP
          </Text>
          <Text style={[styles.brandTitle, { color: theme.textPrimary }]}>Create Account</Text>
          <Text style={[styles.brandDescription, { color: theme.textSecondary }]}>
            Start tracking workouts, biometrics, and daily efficiency goals.
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
          <TouchableOpacity
            style={[styles.googleBtn, { backgroundColor: theme.isDark ? '#2A2A2A' : '#FFFFFF', borderColor: theme.border }]}
            onPress={handleGoogleAuth}
          >
            <Text style={[styles.googleBtnText, { color: theme.textPrimary }]}>🌐 Continue with Google</Text>
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
            <Text style={[styles.dividerText, { color: theme.textSecondary }]}>OR WITH EMAIL</Text>
            <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
          </View>

          <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Full Name</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
            placeholder="John Doe"
            placeholderTextColor={theme.textSecondary}
            value={fullName}
            onChangeText={setFullName}
          />

          <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 10 }]}>Email Address</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
            placeholder="name@example.com"
            placeholderTextColor={theme.textSecondary}
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />

          <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 10 }]}>Password</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
            placeholder="••••••••"
            placeholderTextColor={theme.textSecondary}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 10 }]}>Confirm Password</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
            placeholder="••••••••"
            placeholderTextColor={theme.textSecondary}
            secureTextEntry
            value={confirmPassword}
            onChangeText={setConfirmPassword}
          />

          <TouchableOpacity
            style={[styles.signUpBtn, { backgroundColor: theme.fitnessAccent }]}
            onPress={handleSignUp}
          >
            <Text style={styles.signUpBtnText}>Create Account</Text>
          </TouchableOpacity>

          <TouchableOpacity style={{ marginTop: 16, alignItems: 'center' }} onPress={() => router.push('/auth/login')}>
            <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
              Already have an account? <Text style={{ color: theme.primaryAccent, fontWeight: 'bold' }}>Sign In</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  innerContainer: { flex: 1, padding: 20, justifyContent: 'center' },
  headerBox: { marginBottom: 16, alignItems: 'center' },
  brandSubtitle: { fontSize: 12, fontWeight: 'bold', letterSpacing: 1.5, marginBottom: 4 },
  brandTitle: { fontSize: 26, fontWeight: 'bold', marginBottom: 6 },
  brandDescription: { fontSize: 12, textAlign: 'center', paddingHorizontal: 20 },
  card: { padding: 18, borderRadius: 14, borderWidth: 1 },
  googleBtn: { paddingVertical: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1 },
  googleBtnText: { fontWeight: 'bold', fontSize: 14 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 14 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { marginHorizontal: 10, fontSize: 10, fontWeight: 'bold' },
  inputLabel: { fontSize: 11, fontWeight: 'bold', marginBottom: 4 },
  input: { padding: 10, borderRadius: 8, fontSize: 14, fontWeight: '600' },
  signUpBtn: { paddingVertical: 13, borderRadius: 8, alignItems: 'center', marginTop: 16 },
  signUpBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
});