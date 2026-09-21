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
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import { LightTheme } from '../../src/constants/colors';

const failureMessage = (reason?: string): string => {
  if (reason === 'invalid_password') return 'Enter a new password to continue.';
  if (reason === 'cleanup_failed') {
    return 'Your password was updated, but we could not safely finish this session. Please sign in with your new password.';
  }
  if (reason === 'not_authorized') return 'This reset link is no longer valid. Request a new password reset link.';
  return 'Unable to update your password right now. Please try again.';
};

/** Route access is one layer; completePasswordRecovery independently enforces authorization. */
export default function ResetPasswordScreen() {
  const { authState, completePasswordRecovery } = useAuth();
  const { theme = LightTheme } = useTheme() || {};
  const router = useRouter();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (authState !== 'recovery') return null;

  const handleSubmit = async () => {
    if (submitting) return;
    if (!newPassword.trim()) {
      Alert.alert('Missing Password', 'Enter a new password to continue.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Passwords Do Not Match', 'Re-enter your new password so both fields match.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    try {
      const result = await completePasswordRecovery(newPassword);
      if (result.status === 'completed') {
        router.replace({ pathname: '/auth/login', params: { passwordUpdated: '1' } });
        return;
      }
      setErrorMessage(failureMessage(result.reason));
    } finally {
      setSubmitting(false);
    }
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
          <View style={styles.headerContainer}>
            <View style={[styles.brandIcon, { backgroundColor: `${theme.primaryAccent}18` }]}>
              <Ionicons name="key-outline" size={24} color={theme.primaryAccent} />
            </View>
            <Text style={[styles.title, { color: theme.textPrimary }]}>Create a New Password</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              Choose a new password for your My Chawgee account.
            </Text>
          </View>

          <View style={[styles.formCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.textPrimary }]}>New Password</Text>
              <View style={[styles.inputWrapper, { borderColor: theme.border, backgroundColor: theme.inputBackground }]}>
                <Ionicons name="lock-closed-outline" size={20} color={theme.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: theme.textPrimary }]}
                  placeholder="••••••••"
                  placeholderTextColor={theme.textSecondary}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry={!showPassword}
                  editable={!submitting}
                />
                <TouchableOpacity onPress={() => setShowPassword((current) => !current)}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.textPrimary }]}>Confirm Password</Text>
              <View style={[styles.inputWrapper, { borderColor: theme.border, backgroundColor: theme.inputBackground }]}>
                <Ionicons name="lock-closed-outline" size={20} color={theme.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: theme.textPrimary }]}
                  placeholder="••••••••"
                  placeholderTextColor={theme.textSecondary}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                  editable={!submitting}
                />
              </View>
            </View>

            {errorMessage && (
              <Text style={[styles.errorMessage, { color: theme.textSecondary }]}>{errorMessage}</Text>
            )}

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: theme.primaryAccent, opacity: submitting ? 0.7 : 1 }]}
              onPress={handleSubmit}
              activeOpacity={0.85}
              disabled={submitting}
            >
              <Text style={styles.primaryBtnText}>{submitting ? 'Updating…' : 'Update Password'}</Text>
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
  headerContainer: { alignItems: 'center', marginBottom: 22 },
  brandIcon: { width: 52, height: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { fontSize: 26, fontWeight: '900', letterSpacing: -0.6, textAlign: 'center' },
  subtitle: { fontSize: 14, lineHeight: 20, fontWeight: '600', marginTop: 6, textAlign: 'center' },
  formCard: { borderWidth: 1, borderRadius: 22, padding: 18, gap: 16 },
  inputGroup: { gap: 7 },
  label: { fontSize: 12, fontWeight: '800' },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, minHeight: 50 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 15 },
  errorMessage: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  primaryBtn: { minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '900', fontSize: 15 },
});
