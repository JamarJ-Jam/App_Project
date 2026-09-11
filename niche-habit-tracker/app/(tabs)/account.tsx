import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as LocalAuthentication from 'expo-local-authentication';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/context/ThemeContext';
import { LightTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/constants/colors';
import { useAuth } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/context/AuthContext';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface AccordionSectionProps {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  theme: typeof LightTheme;
}

const AccordionSection = ({ title, icon, isOpen, onToggle, children, theme }: AccordionSectionProps) => (
  <View style={[styles.accordionWrapper, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
    <TouchableOpacity
      style={styles.accordionHeader}
      onPress={() => {
        Haptics.selectionAsync();
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        onToggle();
      }}
      activeOpacity={0.7}
    >
      <View style={styles.headerLeft}>
        <View style={[styles.iconFrame, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}>
          <Ionicons name={icon} size={18} color={theme.fitnessAccent} />
        </View>
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>{title}</Text>
      </View>
      <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={theme.textSecondary} />
    </TouchableOpacity>
    {isOpen && <View style={[styles.accordionContent, { borderTopColor: theme.border }]}>{children}</View>}
  </View>
);

export default function AccountScreen() {
  const { theme = LightTheme, isDark, toggleTheme } = useTheme() || {};
  const { user, signOut } = useAuth();
  const router = useRouter();

  // Accordion States
  const [openSection, setOpenSection] = useState<'subscription' | 'profile' | 'settings' | null>('subscription');
  const [pushEnabled, setPushEnabled] = useState(true);
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);

  // Editable Biometrics & Unit Selections
  const [isEditingBiometrics, setIsEditingBiometrics] = useState(false);
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lbs'>('kg');
  const [heightUnit, setHeightUnit] = useState<'cm' | 'ft'>('cm');

  const [age, setAge] = useState('28');
  const [gender, setGender] = useState('Male');
  const [height, setHeight] = useState('178');
  const [currentWeight, setCurrentWeight] = useState('82');
  const [targetWeight, setTargetWeight] = useState('78');
  const [primaryGoal, setPrimaryGoal] = useState('Muscle Gain & Focus');
  const [calories, setCalories] = useState('2450');
  const [deepWork, setDeepWork] = useState('6.0');

  const toggleAccordion = (section: 'subscription' | 'profile' | 'settings') => {
    setOpenSection(openSection === section ? null : section);
  };

  const handleToggleBiometrics = async (value: boolean) => {
    if (value) {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !isEnrolled) {
        Alert.alert('Biometrics Unavailable', 'Your device does not have fingerprint or FaceID security configured.');
        return;
      }

      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to enable Fingerprint Sign-In',
      });

      if (res.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setBiometricsEnabled(true);
        Alert.alert('Biometrics Enabled', 'You can now sign in using your fingerprint.');
      }
    } else {
      setBiometricsEnabled(false);
    }
  };

  const handleSaveBiometrics = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setIsEditingBiometrics(false);
    Alert.alert('Profile Updated', 'Your biometrics and preferred measurement units have been saved.');
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to log out of My Chawgee?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          if (signOut) await signOut();
          router.replace('/auth/login');
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* User Profile Header */}
        <View style={[styles.profileCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
          <View style={[styles.avatar, { backgroundColor: theme.fitnessAccent }]}>
            <Text style={styles.avatarText}>{user?.email ? user.email[0].toUpperCase() : 'A'}</Text>
          </View>
          <View style={styles.profileMeta}>
            <Text style={[styles.userName, { color: theme.textPrimary }]}>{user?.email?.split('@')[0] || 'Accountability Member'}</Text>
            <Text style={[styles.userEmail, { color: theme.textSecondary }]}>{user?.email || 'guest@mychawgee.app'}</Text>
          </View>
        </View>

        {/* 1. Subscription Hub Accordion */}
        <AccordionSection
          title="Subscription & Membership"
          icon="card-outline"
          isOpen={openSection === 'subscription'}
          onToggle={() => toggleAccordion('subscription')}
          theme={theme}
        >
          <View style={styles.planCard}>
            <View style={styles.planHeader}>
              <View>
                <Text style={[styles.planTitle, { color: theme.textPrimary }]}>Pro Accountability Pass</Text>
                <Text style={[styles.planPrice, { color: theme.fitnessAccent }]}>$9.99 / month</Text>
              </View>
              <Text style={styles.activePill}>ACTIVE</Text>
            </View>
            <Text style={[styles.planDesc, { color: theme.textSecondary }]}>
              Renews on Oct 14, 2026. Includes AI Chawgee Mascot Briefings, Unlimited Fitness Triggers, and Analytics Sync.
            </Text>
            <TouchableOpacity
              style={[styles.actionBtn, { borderColor: theme.border }]}
              onPress={() => Alert.alert('Manage Plan', 'Redirecting to App Store Subscription Settings...')}
            >
              <Text style={[styles.actionBtnText, { color: theme.textPrimary }]}>Manage Billing & Plans</Text>
            </TouchableOpacity>
          </View>
        </AccordionSection>

        {/* 2. Biometrics & Onboarding Profile Accordion */}
        <AccordionSection
          title="Profile & Biometrics"
          icon="person-outline"
          isOpen={openSection === 'profile'}
          onToggle={() => toggleAccordion('profile')}
          theme={theme}
        >
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.subHeading, { color: theme.textSecondary }]}>ONBOARDING BIOMETRICS</Text>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                if (isEditingBiometrics) {
                  handleSaveBiometrics();
                } else {
                  setIsEditingBiometrics(true);
                }
              }}
            >
              <Text style={[styles.editToggleText, { color: theme.fitnessAccent }]}>
                {isEditingBiometrics ? 'Save' : 'Edit'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Unit Toggle Selectors */}
          {isEditingBiometrics && (
            <View style={[styles.unitToggleCard, { borderColor: theme.border, backgroundColor: theme.background }]}>
              <View style={styles.unitRow}>
                <Text style={[styles.unitRowLabel, { color: theme.textSecondary }]}>Height Units</Text>
                <View style={styles.unitSelectorContainer}>
                  {(['cm', 'ft'] as const).map((unit) => (
                    <TouchableOpacity
                      key={unit}
                      style={[styles.unitPill, heightUnit === unit && { backgroundColor: theme.fitnessAccent }]}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setHeightUnit(unit);
                      }}
                    >
                      <Text style={[styles.unitPillText, { color: heightUnit === unit ? '#FFFFFF' : theme.textSecondary }]}>
                        {unit.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.unitRow}>
                <Text style={[styles.unitRowLabel, { color: theme.textSecondary }]}>Weight Units</Text>
                <View style={styles.unitSelectorContainer}>
                  {(['kg', 'lbs'] as const).map((unit) => (
                    <TouchableOpacity
                      key={unit}
                      style={[styles.unitPill, weightUnit === unit && { backgroundColor: theme.fitnessAccent }]}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setWeightUnit(unit);
                      }}
                    >
                      <Text style={[styles.unitPillText, { color: weightUnit === unit ? '#FFFFFF' : theme.textSecondary }]}>
                        {unit.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          )}

          {/* Age */}
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Age</Text>
            {isEditingBiometrics ? (
              <View style={[styles.editInputWrapper, { borderColor: theme.border, backgroundColor: theme.background }]}>
                <TextInput style={[styles.editInput, { color: theme.textPrimary }]} value={age} onChangeText={setAge} keyboardType="numeric" />
                <Text style={[styles.unitText, { color: theme.textSecondary }]}>yrs</Text>
              </View>
            ) : (
              <Text style={[styles.infoValue, { color: theme.textPrimary }]}>{age} yrs</Text>
            )}
          </View>

          {/* Gender */}
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Gender</Text>
            {isEditingBiometrics ? (
              <View style={[styles.editInputWrapper, { borderColor: theme.border, backgroundColor: theme.background }]}>
                <TextInput style={[styles.editInput, { color: theme.textPrimary }]} value={gender} onChangeText={setGender} />
              </View>
            ) : (
              <Text style={[styles.infoValue, { color: theme.textPrimary }]}>{gender}</Text>
            )}
          </View>

          {/* Height */}
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Height</Text>
            {isEditingBiometrics ? (
              <View style={[styles.editInputWrapper, { borderColor: theme.border, backgroundColor: theme.background }]}>
                <TextInput style={[styles.editInput, { color: theme.textPrimary }]} value={height} onChangeText={setHeight} keyboardType="numeric" />
                <Text style={[styles.unitText, { color: theme.textSecondary }]}>{heightUnit}</Text>
              </View>
            ) : (
              <Text style={[styles.infoValue, { color: theme.textPrimary }]}>{height} {heightUnit}</Text>
            )}
          </View>

          {/* Current Weight */}
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Current Weight</Text>
            {isEditingBiometrics ? (
              <View style={[styles.editInputWrapper, { borderColor: theme.border, backgroundColor: theme.background }]}>
                <TextInput style={[styles.editInput, { color: theme.textPrimary }]} value={currentWeight} onChangeText={setCurrentWeight} keyboardType="numeric" />
                <Text style={[styles.unitText, { color: theme.textSecondary }]}>{weightUnit}</Text>
              </View>
            ) : (
              <Text style={[styles.infoValue, { color: theme.textPrimary }]}>{currentWeight} {weightUnit}</Text>
            )}
          </View>

          {/* Target Weight */}
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Target Weight</Text>
            {isEditingBiometrics ? (
              <View style={[styles.editInputWrapper, { borderColor: theme.border, backgroundColor: theme.background }]}>
                <TextInput style={[styles.editInput, { color: theme.textPrimary }]} value={targetWeight} onChangeText={setTargetWeight} keyboardType="numeric" />
                <Text style={[styles.unitText, { color: theme.textSecondary }]}>{weightUnit}</Text>
              </View>
            ) : (
              <Text style={[styles.infoValue, { color: theme.textPrimary }]}>{targetWeight} {weightUnit}</Text>
            )}
          </View>

          {/* Primary Goal */}
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Primary Focus</Text>
            {isEditingBiometrics ? (
              <View style={[styles.editInputWrapper, { borderColor: theme.border, backgroundColor: theme.background }]}>
                <TextInput style={[styles.editInput, { color: theme.textPrimary }]} value={primaryGoal} onChangeText={setPrimaryGoal} />
              </View>
            ) : (
              <Text style={[styles.infoValue, { color: theme.textPrimary }]}>{primaryGoal}</Text>
            )}
          </View>

          <View style={[styles.divider, { backgroundColor: theme.border, marginVertical: 4 }]} />
          <Text style={[styles.subHeading, { color: theme.textSecondary, marginBottom: 2 }]}>DAILY TARGETS</Text>

          {/* Calorie Target */}
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Daily Calorie Target</Text>
            {isEditingBiometrics ? (
              <View style={[styles.editInputWrapper, { borderColor: theme.border, backgroundColor: theme.background }]}>
                <TextInput style={[styles.editInput, { color: theme.textPrimary }]} value={calories} onChangeText={setCalories} keyboardType="numeric" />
                <Text style={[styles.unitText, { color: theme.textSecondary }]}>kcal</Text>
              </View>
            ) : (
              <Text style={[styles.infoValue, { color: theme.textPrimary }]}>{calories} kcal</Text>
            )}
          </View>

          {/* Deep Work */}
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Deep Work Goal</Text>
            {isEditingBiometrics ? (
              <View style={[styles.editInputWrapper, { borderColor: theme.border, backgroundColor: theme.background }]}>
                <TextInput style={[styles.editInput, { color: theme.textPrimary }]} value={deepWork} onChangeText={setDeepWork} keyboardType="numeric" />
                <Text style={[styles.unitText, { color: theme.textSecondary }]}>hrs</Text>
              </View>
            ) : (
              <Text style={[styles.infoValue, { color: theme.textPrimary }]}>{deepWork} hrs / day</Text>
            )}
          </View>
        </AccordionSection>

        {/* 3. Settings & Security Accordion */}
        <AccordionSection
          title="Settings & Security"
          icon="settings-outline"
          isOpen={openSection === 'settings'}
          onToggle={() => toggleAccordion('settings')}
          theme={theme}
        >
          <View style={styles.toggleRow}>
            <Text style={[styles.toggleLabel, { color: theme.textPrimary }]}>Dark Mode</Text>
            <Switch value={isDark} onValueChange={toggleTheme} />
          </View>
          <View style={styles.toggleRow}>
            <Text style={[styles.toggleLabel, { color: theme.textPrimary }]}>Daily Goal Reminders</Text>
            <Switch value={pushEnabled} onValueChange={setPushEnabled} />
          </View>

          {/* Fingerprint / Biometric Toggle */}
          <View style={styles.toggleRow}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={[styles.toggleLabel, { color: theme.textPrimary }]}>Fingerprint / Biometric Login</Text>
              <Text style={[styles.toggleSubText, { color: theme.textSecondary }]}>Require fingerprint or FaceID when launching app</Text>
            </View>
            <Switch value={biometricsEnabled} onValueChange={handleToggleBiometrics} />
          </View>
        </AccordionSection>

        {/* Sign Out Button */}
        <TouchableOpacity
          style={[styles.signOutBtn, { borderColor: theme.border, backgroundColor: theme.cardBackground }]}
          onPress={handleSignOut}
        >
          <Ionicons name="log-out-outline" size={18} color="#EF4444" />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingVertical: 20, gap: 14 },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  profileMeta: { flex: 1 },
  userName: { fontSize: 16, fontWeight: '800' },
  userEmail: { fontSize: 12, marginTop: 2 },
  accordionWrapper: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  accordionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconFrame: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 15, fontWeight: '700' },
  accordionContent: { padding: 16, borderTopWidth: 1, gap: 12 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  subHeading: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  editToggleText: { fontSize: 13, fontWeight: '800' },
  unitToggleCard: { padding: 12, borderRadius: 12, borderWidth: 1, gap: 10, marginBottom: 4 },
  unitRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  unitRowLabel: { fontSize: 12, fontWeight: '700' },
  unitSelectorContainer: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 8, padding: 2, gap: 2 },
  unitPill: { paddingVertical: 4, paddingHorizontal: 12, borderRadius: 6 },
  unitPillText: { fontSize: 11, fontWeight: '800' },
  planCard: { gap: 10 },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  planTitle: { fontSize: 15, fontWeight: '800' },
  planPrice: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  activePill: { color: '#10B981', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  planDesc: { fontSize: 12, lineHeight: 18 },
  actionBtn: { paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center', marginTop: 4 },
  actionBtnText: { fontSize: 12, fontWeight: '700' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  infoLabel: { fontSize: 13, fontWeight: '600' },
  infoValue: { fontSize: 13, fontWeight: '800' },
  editInputWrapper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, gap: 4 },
  editInput: { fontSize: 13, fontWeight: '800', minWidth: 45, textAlign: 'right', padding: 0 },
  unitText: { fontSize: 12, fontWeight: '600' },
  divider: { height: 1, width: '100%' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toggleLabel: { fontSize: 13, fontWeight: '600' },
  toggleSubText: { fontSize: 11, marginTop: 2 },
  signOutBtn: { flexDirection: 'row', height: 48, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10 },
  signOutText: { color: '#EF4444', fontWeight: '800', fontSize: 14 },
});