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

export default function LoginScreen() {
  const { theme = LightTheme } = useTheme() || {};
  const { signIn, signInWithGoogle, signInAsGuest } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing Fields', 'Please enter both email and password.');
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await signIn(email.trim());
    router.replace('/(tabs)');
  };

  const handleGoogleAuth = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await signInWithGoogle('user@gmail.com', 'Google User');
    router.replace('/auth/onboarding');
  };

  const handleGuestLogin = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await signInAsGuest();
    router.replace('/(tabs)');
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
              <Ionicons name="key-outline" size={24} color={theme.primaryAccent} />
            </View>
            <Text style={[styles.brandSubtitle, { color: theme.fitnessAccent }]}>ACCOUNTABILITY OS</Text>
            <Text style={[styles.brandTitle, { color: theme.textPrimary }]}>Welcome Back</Text>
            <Text style={[styles.brandDescription, { color: theme.textSecondary }]}>
              Sign in to access your workouts, efficiency score, and fuel logs.
            </Text>
          </View>

          {/* Form Card */}
          <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
            
            <TouchableOpacity
              style={[
                styles.googleBtn,
                { backgroundColor: theme.isDark ? '#2A2A2A' : '#FFFFFF', borderColor: theme.border },
              ]}
              onPress={handleGoogleAuth}
            >
              <Ionicons name="logo-google" size={18} color="#EA4335" style={{ marginRight: 8 }} />
              <Text style={[styles.googleBtnText, { color: theme.textPrimary }]}>Sign in with Google</Text>
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
              <Text style={[styles.dividerText, { color: theme.textSecondary }]}>OR WITH EMAIL</Text>
              <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
            </View>

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Email Address</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
              placeholder="name@example.com"
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

            <TouchableOpacity
              style={[styles.loginBtn, { backgroundColor: theme.primaryAccent }]}
              onPress={handleLogin}
            >
              <Text style={styles.loginBtnText}>Sign In</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{ marginTop: 16, alignItems: 'center' }}
              onPress={() => router.push('/auth/signup')}
            >
              <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                Don't have an account? <Text style={{ color: theme.fitnessAccent, fontWeight: '700' }}>Sign Up</Text>
              </Text>
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
              <Text style={[styles.dividerText, { color: theme.textSecondary }]}>GUEST ACCESS</Text>
              <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
            </View>

            <TouchableOpacity
              style={[styles.guestBtn, { borderColor: theme.border }]}
              onPress={handleGuestLogin}
            >
              <Ionicons name="person-outline" size={16} color={theme.textPrimary} style={{ marginRight: 6 }} />
              <Text style={[styles.guestBtnText, { color: theme.textPrimary }]}>Continue as Guest</Text>
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
  brandTitle: { fontSize: 28, fontWeight: '800', marginBottom: 6 },
  brandDescription: { fontSize: 13, textAlign: 'center', paddingHorizontal: 20 },
  card: { padding: 20, borderRadius: 16, borderWidth: 1 },
  googleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 10, borderWidth: 1 },
  googleBtnText: { fontWeight: '700', fontSize: 14 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 16 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { marginHorizontal: 10, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  inputLabel: { fontSize: 11, fontWeight: '700', marginBottom: 6 },
  input: { padding: 12, borderRadius: 8, fontSize: 14, fontWeight: '600' },
  loginBtn: { paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginTop: 18 },
  loginBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  guestBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 10, borderWidth: 1 },
  guestBtnText: { fontWeight: '700', fontSize: 14 },
});