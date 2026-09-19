import React, { useState } from 'react';
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
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/context/ThemeContext';
import { LightTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/constants/colors';
import { useAuth } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/context/AuthContext';

export default function SignUpScreen() {
  const { theme = LightTheme } = useTheme() || {};
  const router = useRouter();
  const { signUp, signInWithGoogle } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSignUp = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      Alert.alert('Missing Information', 'Please complete all fields to create your account.');
      return;
    }
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const result = await signUp(email.trim(), password, name.trim());
      if (result.status === 'verification_required') {
        Alert.alert('Verify Your Email', 'Check your inbox and verify your email before continuing.');
        return;
      }
      router.replace('/auth/onboarding');
    } catch (error) {
      Alert.alert('Unable to Create Account', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const handleGoogleSignUp = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await signInWithGoogle();
    } catch (error) {
      Alert.alert('Google Sign Up', error instanceof Error ? error.message : 'Google sign-up is not available yet.');
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
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
              <Ionicons name="sparkles" size={24} color={theme.primaryAccent} />
            </View>
            <Text style={[styles.title, { color: theme.textPrimary }]}>Create Account</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              Set up your account, then Chawgee will personalize the experience around you.
            </Text>
          </View>

          <View style={[styles.formCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.textPrimary }]}>Full Name</Text>
              <View style={[styles.inputWrapper, { borderColor: theme.border, backgroundColor: theme.inputBackground }]}>
                <Ionicons name="person-outline" size={20} color={theme.textSecondary} style={styles.inputIcon} />
                <TextInput style={[styles.input, { color: theme.textPrimary }]} placeholder="Alex Morgan" placeholderTextColor={theme.textSecondary} value={name} onChangeText={setName} />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.textPrimary }]}>Email Address</Text>
              <View style={[styles.inputWrapper, { borderColor: theme.border, backgroundColor: theme.inputBackground }]}>
                <Ionicons name="mail-outline" size={20} color={theme.textSecondary} style={styles.inputIcon} />
                <TextInput style={[styles.input, { color: theme.textPrimary }]} placeholder="alex@example.com" placeholderTextColor={theme.textSecondary} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.textPrimary }]}>Password</Text>
              <View style={[styles.inputWrapper, { borderColor: theme.border, backgroundColor: theme.inputBackground }]}>
                <Ionicons name="lock-closed-outline" size={20} color={theme.textSecondary} style={styles.inputIcon} />
                <TextInput style={[styles.input, { color: theme.textPrimary }]} placeholder="••••••••" placeholderTextColor={theme.textSecondary} value={password} onChangeText={setPassword} secureTextEntry />
              </View>
            </View>

            <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: theme.primaryAccent }]} onPress={handleSignUp} activeOpacity={0.85}>
              <Text style={styles.primaryBtnText}>Get Started</Text>
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
              <Text style={[styles.dividerText, { color: theme.textSecondary }]}>OR</Text>
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
            </View>

            <TouchableOpacity style={[styles.socialBtn, { borderColor: theme.border, backgroundColor: theme.inputBackground }]} onPress={handleGoogleSignUp}>
              <Ionicons name="logo-google" size={18} color="#EA4335" />
              <Text style={[styles.socialBtnText, { color: theme.textPrimary }]}>Sign Up with Google</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={{ color: theme.textSecondary }}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.replace('/auth/login')}>
              <Text style={[styles.loginLink, { color: theme.primaryAccent }]}>Sign In</Text>
            </TouchableOpacity>
          </View>
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
  subtitle: { fontSize: 14, lineHeight: 20, fontWeight: '600', marginTop: 6, textAlign: 'center', maxWidth: 340 },
  formCard: { borderWidth: 1, borderRadius: 22, padding: 18, gap: 14 },
  inputGroup: { gap: 7 },
  label: { fontSize: 12, fontWeight: '800' },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, minHeight: 50 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 15 },
  primaryBtn: { minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '900', fontSize: 15 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 2 },
  divider: { flex: 1, height: 1 },
  dividerText: { fontSize: 10, fontWeight: '800' },
  socialBtn: { flexDirection: 'row', minHeight: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  socialBtnText: { fontWeight: '800', fontSize: 14 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  loginLink: { fontWeight: '900' },
});
