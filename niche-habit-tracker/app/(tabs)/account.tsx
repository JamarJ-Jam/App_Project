import React, { useEffect, useState } from 'react';
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
  KeyboardAvoidingView,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as LocalAuthentication from 'expo-local-authentication';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../src/context/ThemeContext';
import { LightTheme } from '../../src/constants/colors';
import { useAuth } from '../../src/context/AuthContext';

import {
  loadUserProfile,
  saveUserProfile,
  UserProfile,
} from '../../src/storage/userProfileStorage';

import AsyncStorage from '@react-native-async-storage/async-storage';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const STORAGE_KEY_BIOMETRIC_LOCK =
  '@chawgee_biometric_lock_enabled';

interface AccordionSectionProps {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  theme: typeof LightTheme;
}

const AccordionSection = ({
  title,
  icon,
  isOpen,
  onToggle,
  children,
  theme,
}: AccordionSectionProps) => (
  <View
    style={[
      styles.accordionWrapper,
      {
        backgroundColor: theme.cardBackground,
        borderColor: theme.border,
      },
    ]}
  >
    <TouchableOpacity
      style={styles.accordionHeader}
      onPress={() => {
        Haptics.selectionAsync();

        LayoutAnimation.configureNext(
          LayoutAnimation.Presets.easeInEaseOut
        );

        onToggle();
      }}
      activeOpacity={0.7}
    >
      <View style={styles.headerLeft}>
        <View
          style={[
            styles.iconFrame,
            {
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
            },
          ]}
        >
          <Ionicons
            name={icon}
            size={18}
            color={theme.fitnessAccent}
          />
        </View>

        <Text
          style={[
            styles.headerTitle,
            { color: theme.textPrimary },
          ]}
        >
          {title}
        </Text>
      </View>

      <Ionicons
        name={
          isOpen
            ? 'chevron-up'
            : 'chevron-down'
        }
        size={18}
        color={theme.textSecondary}
      />
    </TouchableOpacity>

    {isOpen && (
      <View
        style={[
          styles.accordionContent,
          {
            borderTopColor: theme.border,
          },
        ]}
      >
        {children}
      </View>
    )}
  </View>
);

export default function AccountScreen() {
  const {
    theme = LightTheme,
    preference,
    automaticPhase,
    setThemePreference,
  } = useTheme();

  const { user, signOut, updateAccountIdentity, requestPasswordRecovery } = useAuth();
  const router = useRouter();

  const [openSection, setOpenSection] =
    useState<
      'subscription' | 'profile' | 'settings' | null
    >('subscription');

  const [pushEnabled, setPushEnabled] =
    useState(true);

  const [identityModalVisible, setIdentityModalVisible] =
    useState(false);
  const [accountName, setAccountName] = useState(user?.name ?? '');
  const [accountEmail, setAccountEmail] = useState(user?.email ?? '');

  const [biometricsEnabled, setBiometricsEnabled] =
    useState(false);

  const [
    isEditingProfile,
    setIsEditingProfile,
  ] = useState(false);

  const [profileLoaded, setProfileLoaded] =
    useState(false);

  const [weightUnit, setWeightUnit] =
    useState<'kg' | 'lbs'>('kg');

  const [heightUnit, setHeightUnit] =
    useState<'cm' | 'ft'>('cm');

  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [height, setHeight] = useState('');
  const [currentWeight, setCurrentWeight] =
    useState('');
  const [targetWeight, setTargetWeight] =
    useState('');
  const [primaryGoal, setPrimaryGoal] =
    useState('');
  const [calories, setCalories] =
    useState('');
  const [steps, setSteps] =
    useState('');
  const [deepWork, setDeepWork] =
    useState('');

  const [
    employmentStatus,
    setEmploymentStatus,
  ] = useState<UserProfile['employmentStatus']>(
    'Employed'
  );

  const [
    workLocation,
    setWorkLocation,
  ] = useState<UserProfile['workLocation']>(
    'Remote'
  );

  const [
    scheduleType,
    setScheduleType,
  ] = useState<UserProfile['scheduleType']>(
    'Asynchronous'
  );

  const [
    calendarSyncEnabled,
    setCalendarSyncEnabled,
  ] = useState(true);

  useEffect(() => {
    const loadAccountData = async () => {
      try {
        const profile =
          await loadUserProfile();

        setAge(String(profile.age));
        setGender(profile.gender);
        setHeight(String(profile.height));
        setCurrentWeight(
          String(profile.currentWeight)
        );
        setTargetWeight(
          String(profile.targetWeight)
        );
        setPrimaryGoal(profile.primaryGoal);

        setCalories(
          String(profile.dailyCalories)
        );

        setSteps(
          String(profile.dailySteps)
        );

        setDeepWork(
          String(profile.deepWorkHours)
        );

        setWeightUnit(profile.weightUnit);
        setHeightUnit(profile.heightUnit);

        setEmploymentStatus(
          profile.employmentStatus
        );

        setWorkLocation(
          profile.workLocation
        );

        setScheduleType(
          profile.scheduleType
        );

        setCalendarSyncEnabled(
          profile.calendarSyncEnabled
        );

        const savedBiometric =
          await AsyncStorage.getItem(
            STORAGE_KEY_BIOMETRIC_LOCK
          );

        setBiometricsEnabled(
          savedBiometric === 'true'
        );

        setProfileLoaded(true);
      } catch (error) {
        console.error(
          'Error loading account data:',
          error
        );
      }
    };

    loadAccountData();
  }, []);

  const toggleAccordion = (
    section:
      | 'subscription'
      | 'profile'
      | 'settings'
  ) => {
    setOpenSection(
      openSection === section
        ? null
        : section
    );
  };

  const handleToggleBiometrics = async (
    value: boolean
  ) => {
    try {
      if (value) {
        const hasHardware =
          await LocalAuthentication.hasHardwareAsync();

        const isEnrolled =
          await LocalAuthentication.isEnrolledAsync();

        if (!hasHardware) {
          Alert.alert(
            'Biometrics Unavailable',
            'This device does not support fingerprint or Face ID authentication.'
          );

          return;
        }

        if (!isEnrolled) {
          Alert.alert(
            'Biometrics Not Set Up',
            'Please set up fingerprint or Face ID on your device before enabling biometric login.'
          );

          return;
        }

        const result =
          await LocalAuthentication.authenticateAsync(
            {
              promptMessage:
                'Authenticate to enable biometric login',
              cancelLabel: 'Cancel',
              disableDeviceFallback: false,
            }
          );

        if (!result.success) {
          return;
        }

        await AsyncStorage.setItem(
          STORAGE_KEY_BIOMETRIC_LOCK,
          'true'
        );

        setBiometricsEnabled(true);

        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success
        );

        Alert.alert(
          'Biometrics Enabled',
          'Biometric authentication is now enabled for Chawgee.'
        );
      } else {
        await AsyncStorage.setItem(
          STORAGE_KEY_BIOMETRIC_LOCK,
          'false'
        );

        setBiometricsEnabled(false);

        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success
        );
      }
    } catch (error) {
      console.error(
        'Biometric toggle error:',
        error
      );

      Alert.alert(
        'Biometric Error',
        'Unable to update biometric authentication.'
      );
    }
  };

  const handleSaveProfile = async () => {
    const parsedAge = Number(age);
    const parsedHeight = Number(height);
    const parsedCurrentWeight =
      Number(currentWeight);
    const parsedTargetWeight =
      Number(targetWeight);
    const parsedCalories = Number(calories);
    const parsedSteps = Number(steps);
    const parsedDeepWork = Number(deepWork);

    if (
      !Number.isFinite(parsedAge) ||
      !Number.isFinite(parsedHeight) ||
      !Number.isFinite(parsedCurrentWeight) ||
      !Number.isFinite(parsedTargetWeight) ||
      !Number.isFinite(parsedCalories) ||
      !Number.isFinite(parsedSteps) ||
      !Number.isFinite(parsedDeepWork)
    ) {
      Alert.alert(
        'Invalid Profile',
        'Please enter valid numbers for your profile and daily targets.'
      );

      return;
    }

    if (
      parsedAge <= 0 ||
      parsedHeight <= 0 ||
      parsedCurrentWeight <= 0 ||
      parsedTargetWeight <= 0 ||
      parsedCalories <= 0 ||
      parsedSteps < 0 ||
      parsedDeepWork < 0
    ) {
      Alert.alert(
        'Invalid Profile',
        'Please check your values and make sure they are greater than zero where required.'
      );

      return;
    }

    try {
      const currentProfile =
        await loadUserProfile();

      const updatedProfile: UserProfile = {
        ...currentProfile,

        age: parsedAge,
        gender,

        height: parsedHeight,
        heightUnit,

        currentWeight:
          parsedCurrentWeight,

        targetWeight:
          parsedTargetWeight,

        weightUnit,

        primaryGoal,

        dailyCalories:
          parsedCalories,

        dailySteps:
          parsedSteps,

        deepWorkHours:
          parsedDeepWork,

        employmentStatus,
        workLocation,
        scheduleType,
        calendarSyncEnabled,
      };

      await saveUserProfile(
        updatedProfile
      );

      setIsEditingProfile(false);

      await Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success
      );

      Alert.alert(
        'Profile Updated',
        'Your profile and daily targets have been saved.'
      );
    } catch (error) {
      console.error(
        'Error saving account profile:',
        error
      );

      Alert.alert(
        'Save Failed',
        'Unable to save your profile. Please try again.'
      );
    }
  };

  const openIdentityEditor = () => {
    setAccountName(user?.name ?? '');
    setAccountEmail(user?.email ?? '');
    setIdentityModalVisible(true);
  };

  const handleSaveIdentity = async () => {
    const nextEmail = accountEmail.trim().toLowerCase();
    const nextName = accountName.trim();

    if (!nextEmail || !nextEmail.includes('@')) {
      Alert.alert('Invalid Email', 'Enter a valid email address.');
      return;
    }

    try {
      await updateAccountIdentity(nextEmail, nextName);
      setIdentityModalVisible(false);
      await Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success
      );
    } catch (error) {
      console.error('Account identity update failed:', error);
      Alert.alert('Unable to Update', 'Your name and email could not be updated.');
    }
  };

  const [passwordResetSubmitting, setPasswordResetSubmitting] = useState(false);

  const handlePasswordReset = async () => {
    if (!user || user.isGuest || passwordResetSubmitting) return;
    setPasswordResetSubmitting(true);
    try {
      const result = await requestPasswordRecovery(user.email);
      if (result.status === 'failed' && result.reason === 'invalid_email') {
        Alert.alert('Unable to Send', 'Add a valid email to your account before requesting a reset link.');
        return;
      }
      if (result.status === 'failed') {
        Alert.alert('Unable to Send', 'Unable to send a reset link right now. Please try again in a moment.');
        return;
      }
      Alert.alert('Check Your Email', "If an account exists for this email, we'll send a password reset link.");
    } finally {
      setPasswordResetSubmitting(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to log out of My Chawgee?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Warning
            );

            if (signOut) {
              await signOut();
            }

            router.replace('/auth/login');
          },
        },
      ]
    );
  };

  const renderChoiceSelector = <
    T extends string
  >(
    values: readonly T[],
    selected: T,
    onSelect: (value: T) => void
  ) => (
    <View style={styles.choiceRow}>
      {values.map((value) => {
        const active =
          selected === value;

        return (
          <TouchableOpacity
            key={value}
            onPress={() => {
              Haptics.selectionAsync();
              onSelect(value);
            }}
            style={[
              styles.choicePill,
              {
                backgroundColor: active
                  ? theme.fitnessAccent
                  : theme.background,
                borderColor: active
                  ? theme.fitnessAccent
                  : theme.border,
              },
            ]}
          >
            <Text
              style={[
                styles.choiceText,
                {
                  color: active
                    ? '#FFFFFF'
                    : theme.textSecondary,
                },
              ]}
            >
              {value}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  if (!profileLoaded) {
    return (
      <SafeAreaView
        style={[
          styles.container,
          {
            backgroundColor:
              theme.background,
          },
        ]}
      >
        <View style={styles.loadingContainer}>
          <Text
            style={[
              styles.loadingText,
              {
                color:
                  theme.textSecondary,
              },
            ]}
          >
            Loading profile...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[
        styles.container,
        {
          backgroundColor:
            theme.background,
        },
      ]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      >
        {/* Account Identity */}
        <View
          style={[
            styles.profileCard,
            {
              backgroundColor: theme.cardBackground,
              borderColor: theme.border,
            },
          ]}
        >
          <View
            style={[
              styles.avatar,
              { backgroundColor: theme.primaryAccent },
            ]}
          >
            <Text style={styles.avatarText}>
              {(user?.name || user?.email || 'A')[0].toUpperCase()}
            </Text>
          </View>

          <View style={styles.profileMeta}>
            <Text style={[styles.userName, { color: theme.textPrimary }]}>
              {user?.name?.trim() || user?.email?.split('@')[0] || 'Accountability Member'}
            </Text>
            <Text style={[styles.userEmail, { color: theme.textSecondary }]}>
              {user?.email || 'guest@mychawgee.app'}
            </Text>

            {!user?.isGuest && (
              <View style={styles.identityActions}>
                <TouchableOpacity
                  onPress={openIdentityEditor}
                  style={[styles.identityActionButton, { borderColor: theme.border }]}
                >
                  <Ionicons name="create-outline" size={16} color={theme.primaryAccent} />
                  <Text style={[styles.identityActionText, { color: theme.primaryAccent }]}>
                    Edit
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handlePasswordReset}
                  disabled={passwordResetSubmitting}
                  style={[styles.identityActionButton, { borderColor: theme.border, opacity: passwordResetSubmitting ? 0.6 : 1 }]}
                >
                  <Ionicons name="key-outline" size={16} color={theme.textSecondary} />
                  <Text style={[styles.identityActionText, { color: theme.textSecondary }]}>
                    Reset Password
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* Subscription */}
        <AccordionSection
          title="Subscription & Membership"
          icon="card-outline"
          isOpen={
            openSection ===
            'subscription'
          }
          onToggle={() =>
            toggleAccordion(
              'subscription'
            )
          }
          theme={theme}
        >
          <View style={styles.planCard}>
            <View
              style={styles.planHeader}
            >
              <View>
                <Text
                  style={[
                    styles.planTitle,
                    {
                      color:
                        theme.textPrimary,
                    },
                  ]}
                >
                  Pro Accountability Pass
                </Text>

                <Text
                  style={[
                    styles.planPrice,
                    {
                      color:
                        theme.fitnessAccent,
                    },
                  ]}
                >
                  $9.99 / month
                </Text>
              </View>

              <Text style={styles.activePill}>
                ACTIVE
              </Text>
            </View>

            <Text
              style={[
                styles.planDesc,
                {
                  color:
                    theme.textSecondary,
                },
              ]}
            >
              Renews on Oct 14, 2026. Includes
              AI Chawgee Mascot Briefings,
              Unlimited Fitness Triggers,
              and Analytics Sync.
            </Text>

            <TouchableOpacity
              style={[
                styles.actionBtn,
                {
                  borderColor:
                    theme.border,
                },
              ]}
              onPress={() =>
                Alert.alert(
                  'Manage Plan',
                  'Redirecting to App Store Subscription Settings...'
                )
              }
            >
              <Text
                style={[
                  styles.actionBtnText,
                  {
                    color:
                      theme.textPrimary,
                  },
                ]}
              >
                Manage Billing & Plans
              </Text>
            </TouchableOpacity>
          </View>
        </AccordionSection>

        {/* Profile */}
        <AccordionSection
          title="Profile & Goals"
          icon="person-outline"
          isOpen={
            openSection === 'profile'
          }
          onToggle={() =>
            toggleAccordion('profile')
          }
          theme={theme}
        >
          <View
            style={styles.sectionHeaderRow}
          >
            <Text
              style={[
                styles.subHeading,
                {
                  color:
                    theme.textSecondary,
                },
              ]}
            >
              PERSONAL PROFILE
            </Text>

            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(
                  Haptics.ImpactFeedbackStyle.Light
                );

                if (
                  isEditingProfile
                ) {
                  handleSaveProfile();
                } else {
                  setIsEditingProfile(
                    true
                  );
                }
              }}
            >
              <Text
                style={[
                  styles.editToggleText,
                  {
                    color:
                      theme.fitnessAccent,
                  },
                ]}
              >
                {isEditingProfile
                  ? 'Save'
                  : 'Edit'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Units */}
          {isEditingProfile && (
            <View
              style={[
                styles.unitToggleCard,
                {
                  borderColor:
                    theme.border,
                  backgroundColor:
                    theme.background,
                },
              ]}
            >
              <View
                style={styles.unitRow}
              >
                <Text
                  style={[
                    styles.unitRowLabel,
                    {
                      color:
                        theme.textSecondary,
                    },
                  ]}
                >
                  Height Units
                </Text>

                {renderChoiceSelector(
                  ['cm', 'ft'] as const,
                  heightUnit,
                  setHeightUnit
                )}
              </View>

              <View
                style={styles.unitRow}
              >
                <Text
                  style={[
                    styles.unitRowLabel,
                    {
                      color:
                        theme.textSecondary,
                    },
                  ]}
                >
                  Weight Units
                </Text>

                {renderChoiceSelector(
                  ['kg', 'lbs'] as const,
                  weightUnit,
                  setWeightUnit
                )}
              </View>
            </View>
          )}

          {/* Basic fields */}
          {[
            {
              label: 'Age',
              value: age,
              setValue: setAge,
              unit: 'yrs',
              keyboard: 'numeric' as const,
            },
            {
              label: 'Gender',
              value: gender,
              setValue: setGender,
              unit: '',
              keyboard: 'default' as const,
            },
            {
              label: 'Height',
              value: height,
              setValue: setHeight,
              unit: heightUnit,
              keyboard: 'numeric' as const,
            },
            {
              label: 'Current Weight',
              value: currentWeight,
              setValue: setCurrentWeight,
              unit: weightUnit,
              keyboard: 'numeric' as const,
            },
            {
              label: 'Target Weight',
              value: targetWeight,
              setValue: setTargetWeight,
              unit: weightUnit,
              keyboard: 'numeric' as const,
            },
            {
              label: 'Primary Focus',
              value: primaryGoal,
              setValue: setPrimaryGoal,
              unit: '',
              keyboard: 'default' as const,
            },
          ].map((field) => (
            <View
              key={field.label}
              style={styles.infoRow}
            >
              <Text
                style={[
                  styles.infoLabel,
                  {
                    color:
                      theme.textSecondary,
                  },
                ]}
              >
                {field.label}
              </Text>

              {isEditingProfile ? (
                <View
                  style={[
                    styles.editInputWrapper,
                    {
                      borderColor:
                        theme.border,
                      backgroundColor:
                        theme.background,
                    },
                  ]}
                >
                  <TextInput
                    style={[
                      styles.editInput,
                      {
                        color:
                          theme.textPrimary,
                      },
                    ]}
                    value={field.value}
                    onChangeText={
                      field.setValue
                    }
                    keyboardType={
                      field.keyboard
                    }
                  />

                  {field.unit ? (
                    <Text
                      style={[
                        styles.unitText,
                        {
                          color:
                            theme.textSecondary,
                        },
                      ]}
                    >
                      {field.unit}
                    </Text>
                  ) : null}
                </View>
              ) : (
                <Text
                  style={[
                    styles.infoValue,
                    {
                      color:
                        theme.textPrimary,
                    },
                  ]}
                >
                  {field.value}{' '}
                  {field.unit}
                </Text>
              )}
            </View>
          ))}

          <View
            style={[
              styles.divider,
              {
                backgroundColor:
                  theme.border,
              },
            ]}
          />

          {/* Daily targets */}
          <Text
            style={[
              styles.subHeading,
              {
                color:
                  theme.textSecondary,
              },
            ]}
          >
            DAILY TARGETS
          </Text>

          {[
            {
              label:
                'Daily Calorie Target',
              value: calories,
              setValue: setCalories,
              unit: 'kcal',
              keyboard:
                'numeric' as const,
            },
            {
              label: 'Daily Steps',
              value: steps,
              setValue: setSteps,
              unit: 'steps',
              keyboard:
                'numeric' as const,
            },
            {
              label: 'Deep Work Goal',
              value: deepWork,
              setValue: setDeepWork,
              unit: 'hrs / day',
              keyboard:
                'decimal-pad' as const,
            },
          ].map((field) => (
            <View
              key={field.label}
              style={styles.infoRow}
            >
              <Text
                style={[
                  styles.infoLabel,
                  {
                    color:
                      theme.textSecondary,
                  },
                ]}
              >
                {field.label}
              </Text>

              {isEditingProfile ? (
                <View
                  style={[
                    styles.editInputWrapper,
                    {
                      borderColor:
                        theme.border,
                      backgroundColor:
                        theme.background,
                    },
                  ]}
                >
                  <TextInput
                    style={[
                      styles.editInput,
                      {
                        color:
                          theme.textPrimary,
                      },
                    ]}
                    value={field.value}
                    onChangeText={
                      field.setValue
                    }
                    keyboardType={
                      field.keyboard
                    }
                  />

                  <Text
                    style={[
                      styles.unitText,
                      {
                        color:
                          theme.textSecondary,
                      },
                    ]}
                  >
                    {field.unit}
                  </Text>
                </View>
              ) : (
                <Text
                  style={[
                    styles.infoValue,
                    {
                      color:
                        theme.textPrimary,
                    },
                  ]}
                >
                  {field.value}{' '}
                  {field.unit}
                </Text>
              )}
            </View>
          ))}

          <View
            style={[
              styles.divider,
              {
                backgroundColor:
                  theme.border,
              },
            ]}
          />

          {/* Work profile */}
          <Text
            style={[
              styles.subHeading,
              {
                color:
                  theme.textSecondary,
              },
            ]}
          >
            WORK & EFFICIENCY
          </Text>

          <View style={styles.infoRow}>
            <Text
              style={[
                styles.infoLabel,
                {
                  color:
                    theme.textSecondary,
                },
              ]}
            >
              Employment
            </Text>

            {isEditingProfile ? (
              renderChoiceSelector(
                [
                  'Employed',
                  'Unemployed',
                  'Student',
                ] as const,
                employmentStatus,
                setEmploymentStatus
              )
            ) : (
              <Text
                style={[
                  styles.infoValue,
                  {
                    color:
                      theme.textPrimary,
                  },
                ]}
              >
                {employmentStatus}
              </Text>
            )}
          </View>

          <View style={styles.infoRow}>
            <Text
              style={[
                styles.infoLabel,
                {
                  color:
                    theme.textSecondary,
                },
              ]}
            >
              Work Location
            </Text>

            {isEditingProfile ? (
              renderChoiceSelector(
                [
                  'Remote',
                  'In Office',
                  'Hybrid',
                ] as const,
                workLocation,
                setWorkLocation
              )
            ) : (
              <Text
                style={[
                  styles.infoValue,
                  {
                    color:
                      theme.textPrimary,
                  },
                ]}
              >
                {workLocation}
              </Text>
            )}
          </View>

          <View style={styles.infoRow}>
            <Text
              style={[
                styles.infoLabel,
                {
                  color:
                    theme.textSecondary,
                },
              ]}
            >
              Schedule
            </Text>

            {isEditingProfile ? (
              renderChoiceSelector(
                [
                  'Set Shift',
                  'Asynchronous',
                ] as const,
                scheduleType,
                setScheduleType
              )
            ) : (
              <Text
                style={[
                  styles.infoValue,
                  {
                    color:
                      theme.textPrimary,
                  },
                ]}
              >
                {scheduleType}
              </Text>
            )}
          </View>

          <View style={styles.toggleRow}>
            <View
              style={{
                flex: 1,
                paddingRight: 10,
              }}
            >
              <Text
                style={[
                  styles.toggleLabel,
                  {
                    color:
                      theme.textPrimary,
                  },
                ]}
              >
                Calendar Sync
              </Text>

              <Text
                style={[
                  styles.toggleSubText,
                  {
                    color:
                      theme.textSecondary,
                  },
                ]}
              >
                Allow Chawgee to analyze your calendar
              </Text>
            </View>

            <Switch
              value={calendarSyncEnabled}
              onValueChange={
                isEditingProfile
                  ? setCalendarSyncEnabled
                  : undefined
              }
              disabled={!isEditingProfile}
              trackColor={{
                false: '#D1D5DB',
                true:
                  theme.fitnessAccent,
              }}
              thumbColor="#FFFFFF"
              ios_backgroundColor="#D1D5DB"
            />
          </View>
        </AccordionSection>

        {/* Settings */}
        <AccordionSection
          title="Settings & Security"
          icon="settings-outline"
          isOpen={
            openSection === 'settings'
          }
          onToggle={() =>
            toggleAccordion('settings')
          }
          theme={theme}
        >
          {/* Appearance */}
          <View style={styles.appearanceBlock}>
            <View>
              <Text
                style={[
                  styles.toggleLabel,
                  { color: theme.textPrimary },
                ]}
              >
                Appearance
              </Text>

              <Text
                style={[
                  styles.toggleSubText,
                  { color: theme.textSecondary },
                ]}
              >
                Choose how Chawgee looks on this device
              </Text>
            </View>

            <View style={styles.themeChoiceRow}>
              {(
                [
                  {
                    value: 'light',
                    label: 'Light',
                    icon: 'sunny-outline',
                  },
                  {
                    value: 'dark',
                    label: 'Dark',
                    icon: 'moon-outline',
                  },
                  {
                    value: 'auto',
                    label: 'Auto',
                    icon: 'time-outline',
                  },
                ] as const
              ).map((option) => {
                const active =
                  preference === option.value;

                return (
                  <TouchableOpacity
                    key={option.value}
                    activeOpacity={0.8}
                    onPress={async () => {
                      await Haptics.selectionAsync();
                      await setThemePreference(
                        option.value
                      );
                    }}
                    style={[
                      styles.themeChoice,
                      {
                        backgroundColor: active
                          ? `${theme.primaryAccent}18`
                          : theme.surfaceMuted,
                        borderColor: active
                          ? theme.primaryAccent
                          : theme.border,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.themeChoiceIcon,
                        {
                          backgroundColor: active
                            ? `${theme.primaryAccent}20`
                            : theme.cardBackground,
                        },
                      ]}
                    >
                      <Ionicons
                        name={option.icon}
                        size={19}
                        color={
                          active
                            ? theme.primaryAccent
                            : theme.textSecondary
                        }
                      />
                    </View>

                    <Text
                      style={[
                        styles.themeChoiceLabel,
                        {
                          color: active
                            ? theme.textPrimary
                            : theme.textSecondary,
                        },
                      ]}
                    >
                      {option.label}
                    </Text>

                    {active && (
                      <Ionicons
                        name="checkmark-circle"
                        size={17}
                        color={theme.primaryAccent}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {preference === 'auto' && (
              <View
                style={[
                  styles.autoThemeStatus,
                  {
                    backgroundColor:
                      theme.surfaceMuted,
                    borderColor: theme.border,
                  },
                ]}
              >
                <Ionicons
                  name={
                    automaticPhase === 'light'
                      ? 'sunny-outline'
                      : automaticPhase === 'dusk'
                        ? 'partly-sunny-outline'
                        : 'moon-outline'
                  }
                  size={16}
                  color={theme.primaryAccent}
                />

                <Text
                  style={[
                    styles.autoThemeStatusText,
                    { color: theme.textSecondary },
                  ]}
                >
                  Automatic is currently using the{' '}
                  {automaticPhase === 'light'
                    ? 'day'
                    : automaticPhase === 'dusk'
                      ? 'dusk'
                      : 'night'}{' '}
                  palette.
                </Text>
              </View>
            )}
          </View>

          {/* Notifications */}
          <View style={styles.toggleRow}>
            <View
              style={{
                flex: 1,
                paddingRight: 10,
              }}
            >
              <Text
                style={[
                  styles.toggleLabel,
                  {
                    color:
                      theme.textPrimary,
                  },
                ]}
              >
                Daily Goal Reminders
              </Text>

              <Text
                style={[
                  styles.toggleSubText,
                  {
                    color:
                      theme.textSecondary,
                  },
                ]}
              >
                Receive reminders for your daily goals
              </Text>
            </View>

            <Switch
              value={pushEnabled}
              onValueChange={
                setPushEnabled
              }
              trackColor={{
                false: '#D1D5DB',
                true:
                  theme.fitnessAccent,
              }}
              thumbColor="#FFFFFF"
              ios_backgroundColor="#D1D5DB"
            />
          </View>

          {/* Biometrics */}
          <View style={styles.toggleRow}>
            <View
              style={{
                flex: 1,
                paddingRight: 10,
              }}
            >
              <Text
                style={[
                  styles.toggleLabel,
                  {
                    color:
                      theme.textPrimary,
                  },
                ]}
              >
                Fingerprint / Biometric Login
              </Text>

              <Text
                style={[
                  styles.toggleSubText,
                  {
                    color:
                      theme.textSecondary,
                  },
                ]}
              >
                Use fingerprint or Face ID to protect Chawgee
              </Text>
            </View>

            <Switch
              value={biometricsEnabled}
              onValueChange={
                handleToggleBiometrics
              }
              trackColor={{
                false: '#D1D5DB',
                true:
                  theme.fitnessAccent,
              }}
              thumbColor="#FFFFFF"
              ios_backgroundColor="#D1D5DB"
            />
          </View>
        </AccordionSection>

        {/* Sign Out */}
        <TouchableOpacity
          style={[
            styles.signOutBtn,
            {
              borderColor:
                theme.border,
              backgroundColor:
                theme.cardBackground,
            },
          ]}
          onPress={handleSignOut}
        >
          <Ionicons
            name="log-out-outline"
            size={18}
            color="#EF4444"
          />

          <Text style={styles.signOutText}>
            Sign Out
          </Text>
        </TouchableOpacity>
      </ScrollView>
      </KeyboardAvoidingView>
      <Modal
        visible={identityModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIdentityModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View
            style={[
              styles.identitySheet,
              {
                backgroundColor: theme.cardBackground,
                borderColor: theme.border,
              },
            ]}
          >
            <View style={styles.identitySheetHeader}>
              <View>
                <Text style={[styles.identitySheetTitle, { color: theme.textPrimary }]}>
                  Name & Email
                </Text>
                <Text style={[styles.identitySheetSubtitle, { color: theme.textSecondary }]}>
                  Update how your account appears in Chawgee.
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setIdentityModalVisible(false)}
                style={[styles.sheetCloseButton, { backgroundColor: theme.surfaceMuted }]}
              >
                <Ionicons name="close" size={20} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.identityLabel, { color: theme.textPrimary }]}>Name</Text>
            <TextInput
              value={accountName}
              onChangeText={setAccountName}
              placeholder="Your name"
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.identityInput,
                {
                  color: theme.textPrimary,
                  backgroundColor: theme.inputBackground,
                  borderColor: theme.border,
                },
              ]}
            />

            <Text style={[styles.identityLabel, { color: theme.textPrimary }]}>Email</Text>
            <TextInput
              value={accountEmail}
              onChangeText={setAccountEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder="you@example.com"
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.identityInput,
                {
                  color: theme.textPrimary,
                  backgroundColor: theme.inputBackground,
                  borderColor: theme.border,
                },
              ]}
            />

            <TouchableOpacity
              onPress={handleSaveIdentity}
              style={[styles.identitySaveButton, { backgroundColor: theme.primaryAccent }]}
            >
              <Text style={styles.identitySaveText}>Save Changes</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 18,
  },

  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  loadingText: {
    fontSize: 14,
  },

  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    gap: 14,
  },

  avatar: {
    width: 52,
    height: 52,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },

  profileMeta: {
    flex: 1,
  },

  userName: {
    fontSize: 18,
    fontWeight: '900',
  },

  userEmail: {
    fontSize: 12,
    marginTop: 2,
  },

  accordionWrapper: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },

  accordionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },

  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  iconFrame: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },

  headerTitle: {
    fontSize: 16,
    fontWeight: '900',
  },

  accordionContent: {
    padding: 16,
    borderTopWidth: 1,
    gap: 12,
  },

  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },

  subHeading: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },

  editToggleText: {
    fontSize: 13,
    fontWeight: '800',
  },

  unitToggleCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    marginBottom: 4,
  },

  unitRow: {
    gap: 8,
  },

  unitRowLabel: {
    fontSize: 12,
    fontWeight: '700',
  },

  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },

  choicePill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
  },

  choiceText: {
    fontSize: 10,
    fontWeight: '800',
  },

  planCard: {
    gap: 10,
  },

  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },

  planTitle: {
    fontSize: 15,
    fontWeight: '800',
  },

  planPrice: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },

  activePill: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  planDesc: {
    fontSize: 12,
    lineHeight: 18,
  },

  actionBtn: {
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: 4,
  },

  actionBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },

  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },

  infoLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },

  infoValue: {
    maxWidth: '55%',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
  },

  editInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    gap: 4,
  },

  editInput: {
    fontSize: 13,
    fontWeight: '800',
    minWidth: 45,
    textAlign: 'right',
    padding: 0,
  },

  unitText: {
    fontSize: 11,
    fontWeight: '600',
  },

  divider: {
    height: 1,
    width: '100%',
    marginVertical: 4,
  },

  appearanceBlock: {
    gap: 12,
  },

  themeChoiceRow: {
    flexDirection: 'row',
    gap: 8,
  },

  themeChoice: {
    flex: 1,
    minHeight: 92,
    borderWidth: 1,
    borderRadius: 13,
    paddingVertical: 11,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },

  themeChoiceIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  themeChoiceLabel: {
    fontSize: 12,
    fontWeight: '800',
  },

  autoThemeStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },

  autoThemeStatusText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
  },

  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },

  toggleLabel: {
    fontSize: 13,
    fontWeight: '600',
  },

  toggleSubText: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },

  signOutBtn: {
    flexDirection: 'row',
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
  },

  signOutText: {
    color: '#EF4444',
    fontWeight: '800',
    fontSize: 14,
  },

  flex: {
    flex: 1,
  },

  identityActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },

  identityActionButton: {
    minHeight: 36,
    paddingHorizontal: 11,
    borderRadius: 11,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },

  identityActionText: {
    fontSize: 12,
    fontWeight: '800',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },

  identitySheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
    gap: 10,
  },

  identitySheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 6,
  },

  identitySheetTitle: {
    fontSize: 20,
    fontWeight: '900',
  },

  identitySheetSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },

  sheetCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  identityLabel: {
    fontSize: 12,
    fontWeight: '800',
    marginTop: 4,
  },

  identityInput: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    fontSize: 15,
  },

  identitySaveButton: {
    minHeight: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },

  identitySaveText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
});
