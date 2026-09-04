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

export default function LoginScreen() {
  const { theme } = useTheme();
  const { signIn, signInAsGuest } = useAuth();
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

  const handleGuestLogin = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await signInAsGuest();
    router.replace('/(tabs)');
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
          <Text style={[styles.brandTitle, { color: theme.textPrimary }]}>Welcome Back</Text>
          <Text style={[styles.brandDescription, { color: theme.textSecondary }]}>
            Sign in to access your workouts, efficiency score, and calendar audit.
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
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

          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
            <Text style={[styles.dividerText, { color: theme.textSecondary }]}>OR</Text>
            <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
          </View>

          <TouchableOpacity
            style={[styles.guestBtn, { borderColor: theme.border }]}
            onPress={handleGuestLogin}
          >
            <Text style={[styles.guestBtnText, { color: theme.textPrimary }]}>Continue as Guest</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  innerContainer: { flex: 1, padding: 20, justifyContent: 'center' },
  headerBox: { marginBottom: 24, alignItems: 'center' },
  brandSubtitle: { fontSize: 12, fontWeight: 'bold', letterSpacing: 1.5, marginBottom: 4 },
  brandTitle: { fontSize: 28, fontWeight: 'bold', marginBottom: 8 },
  brandDescription: { fontSize: 13, textAlign: 'center', paddingHorizontal: 20 },
  card: { padding: 20, borderRadius: 14, borderWidth: 1 },
  inputLabel: { fontSize: 12, fontWeight: 'bold', marginBottom: 6 },
  input: { padding: 12, borderRadius: 8, fontSize: 14, fontWeight: '600' },
  loginBtn: { paddingVertical: 14, borderRadius: 8, alignItems: 'center', marginTop: 18 },
  loginBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 18 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { marginHorizontal: 10, fontSize: 11, fontWeight: 'bold' },
  guestBtn: { paddingVertical: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1 },
  guestBtnText: { fontWeight: 'bold', fontSize: 14 },
});