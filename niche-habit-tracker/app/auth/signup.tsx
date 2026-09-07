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
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
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
      Alert.alert('Missing Fields', 'Please complete all required fields.');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Password Mismatch', 'Passwords do not match. Please verify.');
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
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          
          {/* Header Branding */}
          <View style={styles.headerBox}>
            <View style={[styles.iconBadge, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
              <Ionicons name="shield-checkmark-outline" size={24} color={theme.fitnessAccent} />
            </View>
            <Text style={[styles.brandSubtitle, { color: theme.fitnessAccent }]}>ACCOUNTABILITY OS</Text>
            <Text style={[styles.brandTitle, { color: theme.textPrimary }]}>Create Your Account</Text>
            <Text style={[styles.brandDescription, { color: theme.textSecondary }]}>
              Build habits, optimize shift schedules, and track baseline metrics.
            </Text>
          </View>

          {/* Form Card */}
          <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
            
            {/* Google OAuth Button with Icon */}
            <TouchableOpacity
              style={[
                styles.googleBtn,
                { backgroundColor: theme.isDark ? '#2A2A2A' : '#FFFFFF', borderColor: theme.border },
              ]}
              onPress={handleGoogleAuth}
            >
              <Ionicons name="logo-google" size={18} color="#EA4335" style={{ marginRight: 8 }} />
              <Text style={[styles.googleBtnText, { color: theme.textPrimary }]}>Sign up with Google</Text>
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
              <Text style={[styles.dividerText, { color: theme.textSecondary }]}>OR WITH EMAIL</Text>
              <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
            </View>

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Full Name</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
              placeholder="Alex Morgan"
              placeholderTextColor={theme.textSecondary}
              value={fullName}
              onChangeText={setFullName}
            />

            <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 12 }]}>Email Address</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
              placeholder="alex@example.com"
              placeholderTextColor={theme.textSecondary}
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />

            <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 12 }]}>Password</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
              placeholder="••••••••"
              placeholderTextColor={theme.textSecondary}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />

            <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 12 }]}>Confirm Password</Text>
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
              <Text style={styles.signUpBtnText}>Get Started →</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{ marginTop: 16, alignItems: 'center' }}
              onPress={() => router.push('/auth/login')}
            >
              <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                Already registered? <Text style={{ color: theme.primaryAccent, fontWeight: '700' }}>Sign In</Text>
              </Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, justifyContent: 'center', minHeight: '100%' },
  headerBox: { marginBottom: 20, alignItems: 'center' },
  iconBadge: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  brandSubtitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 4 },
  brandTitle: { fontSize: 26, fontWeight: '800', marginBottom: 6 },
  brandDescription: { fontSize: 13, textAlign: 'center', paddingHorizontal: 20 },
  card: { padding: 20, borderRadius: 16, borderWidth: 1 },
  googleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 10, borderWidth: 1 },
  googleBtnText: { fontWeight: '700', fontSize: 14 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 16 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { marginHorizontal: 10, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  inputLabel: { fontSize: 11, fontWeight: '700', marginBottom: 6 },
  input: { padding: 12, borderRadius: 8, fontSize: 14, fontWeight: '600' },
  signUpBtn: { paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginTop: 18 },
  signUpBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
});