import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
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
import * as Calendar from 'expo-calendar/legacy';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/context/ThemeContext';
import { LightTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/constants/colors';
import { saveOnboardingProfile } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/storage/userProfileStorage';

import { appConfig } from '../../src/config';

type HeightUnit = 'cm' | 'ft';
type WeightUnit = 'kg' | 'lbs';
type EmploymentStatus = 'Employed' | 'Unemployed' | 'Student';
type WorkLocation = 'Remote' | 'In Office' | 'Hybrid';
type ScheduleType = 'Set Shift' | 'Asynchronous';

type OnboardingField =
  | 'primaryGoal'
  | 'units'
  | 'age'
  | 'gender'
  | 'height'
  | 'currentWeight'
  | 'targetWeight'
  | 'employmentStatus'
  | 'workLocation'
  | 'scheduleType'
  | 'nutritionTargets'
  | 'dailyCalories'
  | 'proteinGrams'
  | 'carbsGrams'
  | 'fatsGrams'
  | 'dailySteps'
  | 'deepWorkHours'
  | 'calendarSyncEnabled'
  | 'complete';

interface OnboardingProfileDraft {
  age?: number;
  gender?: string;
  height?: number;
  heightUnit?: HeightUnit;
  currentWeight?: number;
  targetWeight?: number;
  weightUnit?: WeightUnit;
  primaryGoal?: string;

  nutritionTargetsSource?: 'manual' | 'recommended';
  dailyCalories?: number;
  proteinGrams?: number;
  carbsGrams?: number;
  fatsGrams?: number;

  dailySteps?: number;
  deepWorkHours?: number;
  employmentStatus?: EmploymentStatus;
  workLocation?: WorkLocation;
  scheduleType?: ScheduleType;
  calendarSyncEnabled?: boolean;
}

type CompleteOnboardingProfile = OnboardingProfileDraft &
  Required<
    Pick<
      OnboardingProfileDraft,
      | 'age'
      | 'gender'
      | 'height'
      | 'heightUnit'
      | 'currentWeight'
      | 'targetWeight'
      | 'weightUnit'
      | 'primaryGoal'
      | 'nutritionTargetsSource'
      | 'dailyCalories'
      | 'proteinGrams'
      | 'carbsGrams'
      | 'fatsGrams'
      | 'dailySteps'
      | 'deepWorkHours'
      | 'employmentStatus'
      | 'scheduleType'
      | 'calendarSyncEnabled'
    >
  >;

interface ChatMessage {
  id: string;
  role: 'assistant' | 'user';
  text: string;
}

interface OnboardingResponse {
  assistantMessage: string;
  profileUpdates?: Partial<OnboardingProfileDraft>;
  nextField: OnboardingField;
  quickReplies?: string[];
  isComplete: boolean;
}

const FIRST_MESSAGE =
  "Hey, I’m Chawgee. I’ll learn how you want to use the app, then tailor your fitness, nutrition, focus, and daily targets around you. What would you most like help improving?";

const FIRST_REPLIES = [
  'Fitness',
  'Nutrition',
  'Productivity',
  'A mix of everything',
];

const TOTAL_PROFILE_STEPS = 18;

const countCompletedFields = (profile: OnboardingProfileDraft) => {
  const keys: (keyof OnboardingProfileDraft)[] = [
    'primaryGoal',
    'heightUnit',
    'weightUnit',
    'age',
    'gender',
    'height',
    'currentWeight',
    'targetWeight',
    'employmentStatus',
    'scheduleType',
    'nutritionTargetsSource',
    'dailyCalories',
    'proteinGrams',
    'carbsGrams',
    'fatsGrams',
    'dailySteps',
    'deepWorkHours',
    'calendarSyncEnabled',
  ];

  return keys.filter((key) => profile[key] !== undefined).length;
};

export default function OnboardingScreen() {
  const { theme = LightTheme } = useTheme() || {};
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const keepKeyboardOpenRef = useRef(false);

  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'welcome', role: 'assistant', text: FIRST_MESSAGE },
  ]);
  const [profile, setProfile] = useState<OnboardingProfileDraft>({});
  const [currentField, setCurrentField] = useState<OnboardingField>('primaryGoal');
  const [quickReplies, setQuickReplies] = useState<string[]>(FIRST_REPLIES);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  const progress = useMemo(
    () => Math.min(countCompletedFields(profile) / TOTAL_PROFILE_STEPS, 1),
    [profile]
  );

  const scrollToBottom = (animated = true) => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated });
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated });
      }, 80);
    });
  };

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => {
      scrollToBottom(false);
    });

    const frameSubscription = Keyboard.addListener('keyboardDidChangeFrame', () => {
      scrollToBottom(false);
    });

    return () => {
      showSubscription.remove();
      frameSubscription.remove();
    };
  }, []);

  const hasRequiredProfileFields = (
    draft: OnboardingProfileDraft
  ): draft is CompleteOnboardingProfile =>
    !(
      draft.age === undefined ||
      !draft.gender ||
      draft.height === undefined ||
      !draft.heightUnit ||
      draft.currentWeight === undefined ||
      draft.targetWeight === undefined ||
      !draft.weightUnit ||
      !draft.primaryGoal ||
      !draft.nutritionTargetsSource ||
      draft.dailyCalories === undefined ||
      draft.proteinGrams === undefined ||
      draft.carbsGrams === undefined ||
      draft.fatsGrams === undefined ||
      draft.dailySteps === undefined ||
      draft.deepWorkHours === undefined ||
      !draft.employmentStatus ||
      !draft.scheduleType ||
      draft.calendarSyncEnabled === undefined
    );

  const saveCompletedProfile = async (draft: OnboardingProfileDraft) => {
    if (!hasRequiredProfileFields(draft)) {
      throw new Error('Onboarding finished without all required profile fields.');
    }

    await saveOnboardingProfile({
      age: draft.age,
      gender: draft.gender,
      height: draft.height,
      heightUnit: draft.heightUnit,
      currentWeight: draft.currentWeight,
      targetWeight: draft.targetWeight,
      weightUnit: draft.weightUnit,
      primaryGoal: draft.primaryGoal,
      dailyCalories: draft.dailyCalories,
      proteinGrams: draft.proteinGrams,
      carbsGrams: draft.carbsGrams,
      fatsGrams: draft.fatsGrams,
      dailySteps: draft.dailySteps,
      deepWorkHours: draft.deepWorkHours,
      employmentStatus: draft.employmentStatus,
      workLocation: draft.workLocation ?? 'Remote',
      scheduleType: draft.scheduleType,
      calendarSyncEnabled: draft.calendarSyncEnabled,
    });
  };

  const resolveCalendarSyncChoice = async (
    answer: string
  ): Promise<boolean | undefined> => {
    if (currentField !== 'calendarSyncEnabled') return undefined;

    const normalized = answer.trim().toLowerCase();

    const approvals = [
      'yes', 'yes please', 'sure', 'okay', 'ok', 'allow', 'enable',
      'enable it', 'connect', 'connect it', 'sync', 'sync it',
    ];

    const declines = [
      'no', 'no thanks', 'no thank you', 'not now', 'skip', 'skip it',
      "don't allow", 'do not allow', 'disable',
    ];

    if (declines.includes(normalized)) return false;
    if (!approvals.includes(normalized)) return undefined;

    const permission = await Calendar.requestCalendarPermissionsAsync();
    return permission.status === 'granted';
  };

  const sendAnswer = async (answer: string, keepKeyboardOpen = false) => {
    const trimmed = answer.trim();
    if (!trimmed || isLoading) return;

    Haptics.selectionAsync();

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: trimmed,
    };

    const conversationContext = [...messages, userMessage].slice(-8);

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setQuickReplies([]);
    setIsLoading(true);

    keepKeyboardOpenRef.current = keepKeyboardOpen;

    if (keepKeyboardOpen) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }

    scrollToBottom(false);

    try {
      const resolvedCalendarSync = await resolveCalendarSyncChoice(trimmed);

      const profileForRequest =
        resolvedCalendarSync === undefined
          ? profile
          : { ...profile, calendarSyncEnabled: resolvedCalendarSync };

      const response = await fetch(`${appConfig.apiBaseUrl}/api/chawgee/onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          expectedField: currentField,
          profile: profileForRequest,
          recentMessages: conversationContext,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Onboarding request failed (${response.status}): ${body}`);
      }

      const data = (await response.json()) as OnboardingResponse;
      const updatedProfile = {
        ...profileForRequest,
        ...(data.profileUpdates ?? {}),
        ...(resolvedCalendarSync !== undefined
          ? { calendarSyncEnabled: resolvedCalendarSync }
          : {}),
      };

      setProfile(updatedProfile);
      setCurrentField(data.nextField);
      setQuickReplies(data.quickReplies ?? []);

      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          text: data.assistantMessage,
        },
      ]);

      if (keepKeyboardOpenRef.current && !data.isComplete) {
        requestAnimationFrame(() => inputRef.current?.focus());
      }

      setTimeout(() => scrollToBottom(false), 100);

      const onboardingCanComplete =
        data.isComplete && hasRequiredProfileFields(updatedProfile);

      if (onboardingCanComplete) {
        if (!isComplete) {
          Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success
          );
        }
        setIsComplete(true);
      } else {
        setIsComplete(false);
      }
    } catch (error) {
      console.error('Chawgee onboarding error:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          text: "I hit a connection problem. Your answers haven't been lost. Try that response again.",
        },
      ]);
    } finally {
      setIsLoading(false);

      if (keepKeyboardOpenRef.current) {
        requestAnimationFrame(() => inputRef.current?.focus());
      }

      scrollToBottom(false);
    }
  };

  const launchDashboard = async () => {
    try {
      await saveCompletedProfile(profile);
      router.replace('/(tabs)/dashboard');
    } catch (error) {
      console.error('Unable to finalize onboarding profile:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: `finalize-error-${Date.now()}`,
          role: 'assistant',
          text: "I couldn't save that last change yet. Try again before launching.",
        },
      ]);
      scrollToBottom(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Fixed header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.background,
            borderBottomColor: theme.border,
          },
        ]}
      >
        <View style={styles.headerTopRow}>
          <View style={styles.brandRow}>
            <View
              style={[
                styles.avatar,
                { backgroundColor: `${theme.fitnessAccent}18` },
              ]}
            >
              <Ionicons
                name="sparkles"
                size={18}
                color={theme.fitnessAccent}
              />
            </View>
            <View>
              <Text style={[styles.title, { color: theme.textPrimary }]}>Chawgee</Text>
              <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Personalizing your experience</Text>
            </View>
          </View>

          <Text style={[styles.progressLabel, { color: theme.textSecondary }]}>
            {Math.round(progress * 100)}%
          </Text>
        </View>

        <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: theme.fitnessAccent,
                width: `${Math.max(progress * 100, 4)}%`,
              },
            ]}
          />
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.chatContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          onContentSizeChange={() => scrollToBottom(false)}
        >
          {messages.map((message) => {
            const assistant = message.role === 'assistant';
            return (
              <View
                key={message.id}
                style={[
                  styles.messageRow,
                  assistant ? styles.assistantRow : styles.userRow,
                ]}
              >
                {assistant && (
                  <View
                    style={[
                      styles.smallAvatar,
                      { backgroundColor: `${theme.fitnessAccent}18` },
                    ]}
                  >
                    <Ionicons
                      name="sparkles"
                      size={14}
                      color={theme.fitnessAccent}
                    />
                  </View>
                )}

                <View
                  style={[
                    styles.bubble,
                    assistant
                      ? {
                          backgroundColor: theme.cardBackground,
                          borderColor: theme.border,
                        }
                      : { backgroundColor: theme.fitnessAccent },
                  ]}
                >
                  <Text
                    style={[
                      styles.messageText,
                      {
                        color: assistant ? theme.textPrimary : '#FFFFFF',
                      },
                    ]}
                  >
                    {message.text}
                  </Text>
                </View>
              </View>
            );
          })}

          {isLoading && (
            <View style={[styles.messageRow, styles.assistantRow]}>
              <View
                style={[
                  styles.smallAvatar,
                  { backgroundColor: `${theme.fitnessAccent}18` },
                ]}
              >
                <Ionicons
                  name="sparkles"
                  size={14}
                  color={theme.fitnessAccent}
                />
              </View>
              <View
                style={[
                  styles.typingBubble,
                  {
                    backgroundColor: theme.cardBackground,
                    borderColor: theme.border,
                  },
                ]}
              >
                <ActivityIndicator size="small" color={theme.fitnessAccent} />
                <Text style={[styles.typingText, { color: theme.textSecondary }]}>Chawgee is thinking</Text>
              </View>
            </View>
          )}

          {!isLoading && quickReplies.length > 0 && !isComplete && (
            <View style={styles.quickReplyWrap}>
              {quickReplies.map((reply) => (
                <TouchableOpacity
                  key={reply}
                  style={[
                    styles.quickReply,
                    {
                      backgroundColor: theme.cardBackground,
                      borderColor: theme.fitnessAccent,
                    },
                  ]}
                  onPress={() => sendAnswer(reply)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.quickReplyText, { color: theme.fitnessAccent }]}> {reply} </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {isComplete && (
            <View
              style={[
                styles.completeCard,
                {
                  backgroundColor: theme.cardBackground,
                  borderColor: theme.border,
                },
              ]}
            >
              <View
                style={[
                  styles.completeIcon,
                  { backgroundColor: `${theme.fitnessAccent}18` },
                ]}
              >
                <Ionicons
                  name="checkmark-circle"
                  size={28}
                  color={theme.fitnessAccent}
                />
              </View>

              <Text style={[styles.completeTitle, { color: theme.textPrimary }]}>Your Chawgee is ready</Text>
              <Text style={[styles.completeText, { color: theme.textSecondary }]}>Your starting profile is ready. You can still tell me about any changes before you launch, and I’ll carry the latest version forward.</Text>

              <TouchableOpacity
                style={[styles.launchButton, { backgroundColor: theme.fitnessAccent }]}
                onPress={launchDashboard}
                activeOpacity={0.85}
              >
                <Text style={styles.launchText}>Launch Dashboard</Text>
                <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

        <View
            style={[
              styles.composer,
              {
                backgroundColor: theme.background,
                borderTopColor: theme.border,
              },
            ]}
          >
            <TextInput
              ref={inputRef}
              value={input}
              onChangeText={setInput}
              placeholder="Reply to Chawgee..."
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.input,
                {
                  color: theme.textPrimary,
                  backgroundColor: theme.cardBackground,
                  borderColor: theme.border,
                },
              ]}
              editable={true}
              returnKeyType="send"
              blurOnSubmit={false}
              onSubmitEditing={() => sendAnswer(input, true)}
            />

            <TouchableOpacity
              style={[
                styles.sendButton,
                {
                  backgroundColor:
                    input.trim() && !isLoading ? theme.fitnessAccent : theme.border,
                },
              ]}
              disabled={!input.trim() || isLoading}
              onPress={() => sendAnswer(input, true)}
            >
              <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 10,
    elevation: 4,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 11,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 11,
    marginTop: 1,
    fontWeight: '600',
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: '800',
  },
  progressTrack: {
    height: 5,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  chatContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 24,
    gap: 14,
  },
  messageRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  assistantRow: { justifyContent: 'flex-start' },
  userRow: { justifyContent: 'flex-end' },
  smallAvatar: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  typingBubble: {
    minHeight: 42,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  typingText: {
    fontSize: 12,
    fontWeight: '600',
  },
  quickReplyWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingLeft: 36,
  },
  quickReply: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  quickReplyText: {
    fontSize: 12,
    fontWeight: '800',
  },
  composer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 10 : 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 110,
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '600',
  },
  sendButton: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeCard: {
    marginTop: 6,
    marginBottom: 8,
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
  },
  completeIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  completeTitle: {
    fontSize: 19,
    fontWeight: '900',
  },
  completeText: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 6,
  },
  launchButton: {
    height: 48,
    borderRadius: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    alignSelf: 'stretch',
  },
  launchText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
});
