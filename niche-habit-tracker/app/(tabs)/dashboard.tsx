import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Dimensions,
  Image,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/context/ThemeContext';
import { useAuth } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/context/AuthContext';
import { LightTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/constants/colors';
import { fetchChawgeeBriefing } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/services/chawgeeApi';
import { buildChawgeeContext } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/services/chawgeeContext';
import {
  DashboardRangeSummary,
  DashboardRangeComparison,
  getDashboardRangeComparison,
} from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/storage/dashboardAnalytics';
import { getUserScopedStorageKey } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/storage/userScopedStorage';

const STORAGE_KEY_CHAWGEE_BRIEFING = '@chawgee_briefing';

type RangePreset = 'today' | '7d' | '14d' | '30d' | 'custom';

interface DashboardDateRange {
  startDate: string;
  endDate: string;
  preset: RangePreset;
}

interface CachedBriefing {
  signature: string;
  briefing: string;
  generatedAt: string;
}

const toDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const fromDateKey = (dateKey: string): Date => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const addDays = (date: Date, amount: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};

const createPresetRange = (
  preset: Exclude<RangePreset, 'custom'>
): DashboardDateRange => {
  const today = new Date();
  const endDate = toDateKey(today);

  const daysBack =
    preset === 'today'
      ? 0
      : preset === '7d'
        ? 6
        : preset === '14d'
          ? 13
          : 29;

  return {
    startDate: toDateKey(addDays(today, -daysBack)),
    endDate,
    preset,
  };
};

const formatShortDate = (dateKey: string): string => {
  return fromDateKey(dateKey).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
};

const formatRangeLabel = (range: DashboardDateRange): string => {
  if (range.startDate === range.endDate) {
    return fromDateKey(range.startDate).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  return `${formatShortDate(range.startDate)} – ${fromDateKey(
    range.endDate
  ).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`;
};

const createContextSignature = (context: unknown): string => {
  const value = JSON.stringify(context);
  let hash = 5381;

  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }

  return (hash >>> 0).toString(36);
};

const getMonthCells = (month: Date): Array<number | null> => {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const cells: Array<number | null> = [];

  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(day);
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
};


type BriefingSectionKey =
  | 'overall'
  | 'win'
  | 'attention'
  | 'action';

interface BriefingSection {
  key: BriefingSectionKey;
  title: string;
  text: string;
  icon: keyof typeof Ionicons.glyphMap;
}

interface BriefingSlide {
  id: string;
  sectionKey: BriefingSectionKey;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  points: string[];
}

const BRIEFING_SECTION_META: Record<
  BriefingSectionKey,
  {
    title: string;
    icon: keyof typeof Ionicons.glyphMap;
  }
> = {
  overall: {
    title: 'Overall Performance',
    icon: 'analytics-outline',
  },
  win: {
    title: 'Biggest Win',
    icon: 'trophy-outline',
  },
  attention: {
    title: 'Needs Attention',
    icon: 'alert-circle-outline',
  },
  action: {
    title: 'Next Action',
    icon: 'arrow-forward-circle-outline',
  },
};

const cleanBriefingText = (value: string): string =>
  value
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/`/g, '')
    .replace(/^\s*[-•]\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim();

const parseChawgeeBriefing = (
  briefing: string
): BriefingSection[] => {
  const cleaned = briefing.trim();

  if (!cleaned) return [];

  const headingPattern =
    /(?:^|\n)\s*(?:#{1,3}\s*)?(?:\*\*)?(Overall Performance|Biggest Win|Needs Attention|Next Action)(?:\*\*)?\s*:?\s*/gi;

  const matches = Array.from(cleaned.matchAll(headingPattern));

  if (matches.length === 0) {
    return [
      {
        key: 'overall',
        ...BRIEFING_SECTION_META.overall,
        text: cleanBriefingText(cleaned),
      },
    ];
  }

  const keyByHeading: Record<string, BriefingSectionKey> = {
    'overall performance': 'overall',
    'biggest win': 'win',
    'needs attention': 'attention',
    'next action': 'action',
  };

  return matches
    .map((match, index) => {
      const heading = match[1].toLowerCase();
      const key = keyByHeading[heading];
      const contentStart = (match.index ?? 0) + match[0].length;
      const contentEnd =
        index + 1 < matches.length
          ? matches[index + 1].index ?? cleaned.length
          : cleaned.length;

      const text = cleanBriefingText(
        cleaned.slice(contentStart, contentEnd)
      );

      return {
        key,
        ...BRIEFING_SECTION_META[key],
        text,
      };
    })
    .filter((section) => section.text.length > 0);
};

const splitIntoBriefingPoints = (text: string): string[] => {
  const cleaned = cleanBriefingText(text);

  const sentences =
    cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((part) =>
      part.trim()
    ) ?? [];

  return sentences.filter(Boolean);
};

const buildBriefingSlides = (
  sections: BriefingSection[]
): BriefingSlide[] => {
  const slides: BriefingSlide[] = [];

  sections.forEach((section) => {
    const points = splitIntoBriefingPoints(section.text);
    let currentPoints: string[] = [];
    let currentLength = 0;
    let chunkIndex = 0;

    const flush = () => {
      if (currentPoints.length === 0) return;

      slides.push({
        id: `${section.key}-${chunkIndex}`,
        sectionKey: section.key,
        title: section.title,
        icon: section.icon,
        points: currentPoints,
      });

      chunkIndex += 1;
      currentPoints = [];
      currentLength = 0;
    };

    points.forEach((point) => {
      const nextLength = currentLength + point.length;

      if (
        currentPoints.length >= 3 ||
        (currentPoints.length >= 1 && nextLength > 230)
      ) {
        flush();
      }

      currentPoints.push(point);
      currentLength += point.length;
    });

    flush();
  });

  return slides;
};

const renderMetricEmphasis = (
  text: string,
  accentColor: string
) => {
  const metricPattern =
    /(\b\d[\d,.]*(?:\s?(?:%|kcal|kg|g|km|mi|steps?|hours?|hrs?|h|minutes?|mins?|min))?\b)/gi;

  return text.split(metricPattern).map((part, index) => {
    const isMetric = metricPattern.test(part);
    metricPattern.lastIndex = 0;

    return (
      <Text
        key={`${part}-${index}`}
        style={
          isMetric
            ? {
                color: accentColor,
                fontWeight: '900',
              }
            : undefined
        }
      >
        {part}
      </Text>
    );
  });
};

const SCREEN_WIDTH = Dimensions.get('window').width;
const BRIEFING_CARD_WIDTH = SCREEN_WIDTH - 76;
const BRIEFING_AUTOPLAY_MS = 5000;

export default function DashboardScreen() {
  const { theme = LightTheme } = useTheme() || {};
  const { user } = useAuth();
  const router = useRouter();

  const now = new Date();
  const hour = now.getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const greetingIcon =
    hour < 12 ? 'sunny-outline' : hour < 18 ? 'partly-sunny-outline' : 'moon-outline';
  const displayName = user?.name?.trim()?.split(/\s+/)[0] || 'there';
  const displayDate = now.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const [range, setRange] = useState<DashboardDateRange>(() =>
    createPresetRange('today')
  );

  const [rangeSummary, setRangeSummary] =
    useState<DashboardRangeSummary | null>(null);

  const [rangeComparison, setRangeComparison] =
    useState<DashboardRangeComparison | null>(null);

  const [targetCalories, setTargetCalories] = useState(0);

  const [aiBriefing, setAiBriefing] = useState<string>('');
  const [loadingAi, setLoadingAi] = useState<boolean>(false);
  const [isNewUser, setIsNewUser] = useState(false);
  const [activeBriefingPage, setActiveBriefingPage] = useState(0);
  const [briefingPaused, setBriefingPaused] = useState(false);
  const briefingCarouselRef = useRef<ScrollView>(null);

  const [calendarVisible, setCalendarVisible] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const [draftStartDate, setDraftStartDate] = useState(
    range.startDate
  );
  const [draftEndDate, setDraftEndDate] = useState(
    range.endDate
  );

  const calendarCells = useMemo(
    () => getMonthCells(calendarMonth),
    [calendarMonth]
  );

  const briefingSections = useMemo(
    () => parseChawgeeBriefing(aiBriefing),
    [aiBriefing]
  );

  const briefingSlides = useMemo(
    () => buildBriefingSlides(briefingSections),
    [briefingSections]
  );

  const scrollToBriefingPage = useCallback(
    (page: number, animated = true) => {
      if (briefingSlides.length === 0) return;

      const boundedPage =
        ((page % briefingSlides.length) + briefingSlides.length) %
        briefingSlides.length;

      briefingCarouselRef.current?.scrollTo({
        x: boundedPage * (BRIEFING_CARD_WIDTH + 10),
        animated,
      });

      setActiveBriefingPage(boundedPage);
    },
    [briefingSlides.length]
  );

  const toggleBriefingPause = useCallback(() => {
    setBriefingPaused((current) => !current);
    Haptics.selectionAsync();
  }, []);

  useEffect(() => {
    if (
      briefingPaused ||
      loadingAi ||
      briefingSlides.length <= 1
    ) {
      return;
    }

    const interval = setInterval(() => {
      setActiveBriefingPage((currentPage) => {
        const nextPage =
          (currentPage + 1) % briefingSlides.length;

        briefingCarouselRef.current?.scrollTo({
          x: nextPage * (BRIEFING_CARD_WIDTH + 10),
          animated: true,
        });

        return nextPage;
      });
    }, BRIEFING_AUTOPLAY_MS);

    return () => clearInterval(interval);
  }, [
    briefingPaused,
    loadingAi,
    briefingSlides.length,
  ]);

  useEffect(() => {
    if (activeBriefingPage >= briefingSlides.length) {
      setActiveBriefingPage(0);
      briefingCarouselRef.current?.scrollTo({
        x: 0,
        animated: false,
      });
    }
  }, [activeBriefingPage, briefingSlides.length]);

  const openCalendar = () => {
    setDraftStartDate(range.startDate);
    setDraftEndDate(range.endDate);

    const selectedMonth = fromDateKey(range.startDate);
    setCalendarMonth(
      new Date(
        selectedMonth.getFullYear(),
        selectedMonth.getMonth(),
        1
      )
    );

    setCalendarVisible(true);
  };

  const applyPreset = (
    preset: Exclude<RangePreset, 'custom'>
  ) => {
    Haptics.selectionAsync();
    setRange(createPresetRange(preset));
  };

  const chooseCalendarDate = (day: number) => {
    const selected = new Date(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth(),
      day
    );
    const selectedKey = toDateKey(selected);

    if (
      !draftStartDate ||
      (draftStartDate && draftEndDate)
    ) {
      setDraftStartDate(selectedKey);
      setDraftEndDate('');
      return;
    }

    if (selectedKey < draftStartDate) {
      setDraftEndDate(draftStartDate);
      setDraftStartDate(selectedKey);
    } else {
      setDraftEndDate(selectedKey);
    }
  };

  const applyCustomRange = () => {
    if (!draftStartDate) {
      return;
    }

    const endDate = draftEndDate || draftStartDate;

    setRange({
      startDate: draftStartDate,
      endDate,
      preset: 'custom',
    });

    setCalendarVisible(false);
  };

  const loadChawgeeBriefing = async () => {
    setLoadingAi(true);

    try {
      const context = await buildChawgeeContext();

      const comparison = await getDashboardRangeComparison(
        range.startDate,
        range.endDate
      );

      const summary = comparison.current;

      setRangeSummary(summary);
      setRangeComparison(comparison);

      setTargetCalories(
        Number(
          context.nutrition?.goals?.dailyCalories ??
            context.profile?.dailyCalories
        ) || 0
      );

      const workoutCount = Array.isArray(context.fitness?.workouts)
        ? context.fitness.workouts.length
        : 0;

      const taskCount = Array.isArray(context.efficiency?.tasks)
        ? context.efficiency.tasks.length
        : 0;

      const todayMovement =
        Number(context.fitness?.movement?.stepsToday) > 0 ||
        Number(context.fitness?.movement?.activeMinutesToday) > 0;

      const todayNutrition =
        Number(context.nutrition?.caloriesConsumed) > 0 ||
        Number(context.nutrition?.proteinConsumed) > 0 ||
        Number(context.nutrition?.carbsConsumed) > 0 ||
        Number(context.nutrition?.fatsConsumed) > 0;

      const hasAnyTrackedData =
        workoutCount > 0 ||
        taskCount > 0 ||
        todayMovement ||
        todayNutrition;

      const hasRangeData =
        summary.fitness.workouts > 0 ||
        summary.fitness.movementEntries > 0 ||
        summary.nutrition.mealsLogged > 0 ||
        summary.efficiency.tasks > 0 ||
        summary.efficiency.deepWorkSessions > 0;

      setIsNewUser(!hasAnyTrackedData && !hasRangeData);

      if (!hasAnyTrackedData && !hasRangeData) {
        setAiBriefing(
          "You're all set. As you begin logging movement, workouts, meals, and tasks, I'll use that activity to give you more useful updates."
        );
        return;
      }

      if (!hasRangeData) {
        setAiBriefing(
          `No tracked activity was found for ${formatRangeLabel(
            range
          )}. Choose another period to review your performance.`
        );
        return;
      }

      const briefingContext = {
        ...context,
        dashboardRange: {
          startDate: range.startDate,
          endDate: range.endDate,
          preset: range.preset,
          label: formatRangeLabel(range),
        },
        dashboardRangeSummary: summary,
        dashboardRangeComparison: comparison,
        dashboardBriefingPresentation: {
          format:
            'Use these exact section headings when relevant: Overall Performance, Biggest Win, Needs Attention, Next Action.',
          rules: [
            'Keep each section concise and easy to scan.',
            'Write in plain text with short sentences. Do not use Markdown markers such as **, __, #, or backticks.',
            'Prefer 2 to 4 concise points per section instead of a dense paragraph.',
            'Omit any section that would only contain filler.',
            'Use the selected range and previous-period comparison.',
            'Do not repeat every metric.',
            'Prioritize the most useful insight and practical next step.',
          ],
        },
      };

      const briefingKey = await getUserScopedStorageKey(
        `${STORAGE_KEY_CHAWGEE_BRIEFING}:${range.startDate}:${range.endDate}`
      );

      const signature = createContextSignature(briefingContext);
      const savedBriefing = await AsyncStorage.getItem(briefingKey);

      if (savedBriefing) {
        try {
          const cached: CachedBriefing = JSON.parse(savedBriefing);

          if (
            cached.signature === signature &&
            cached.briefing
          ) {
            setAiBriefing(cached.briefing);
            return;
          }
        } catch (cacheError) {
          console.warn(
            'Invalid Chawgee briefing cache:',
            cacheError
          );
        }
      }

      const result = await fetchChawgeeBriefing({
        userContext: briefingContext,
      });

      if (result.success && result.chawgeeInsight) {
        setAiBriefing(result.chawgeeInsight);

        const cache: CachedBriefing = {
          signature,
          briefing: result.chawgeeInsight,
          generatedAt: new Date().toISOString(),
        };

        await AsyncStorage.setItem(
          briefingKey,
          JSON.stringify(cache)
        );
      } else {
        setAiBriefing(
          result.error ||
            'Unable to connect to Chawgee AI backend.'
        );
      }
    } catch (error) {
      console.error('Failed to build Chawgee context:', error);

      setAiBriefing(
        'Unable to load your Chawgee context. Please try again.'
      );
    } finally {
      setLoadingAi(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadChawgeeBriefing();
    }, [range.startDate, range.endDate])
  );

  const formatTrend = (
    percentChange: number | null | undefined,
    delta: number | undefined,
    unit = '%'
  ): string => {
    if (percentChange == null) {
      if (!delta) return 'No prior activity';
      return delta > 0 ? 'New activity' : 'No change';
    }

    const rounded = Math.abs(percentChange).toFixed(0);

    if (percentChange > 0) return `↑ ${rounded}${unit}`;
    if (percentChange < 0) return `↓ ${rounded}${unit}`;
    return 'No change';
  };

  const fitnessTrend = formatTrend(
    rangeComparison?.trends.fitness.caloriesBurned.percentChange,
    rangeComparison?.trends.fitness.caloriesBurned.delta
  );

  const nutritionTrend = formatTrend(
    rangeComparison?.trends.nutrition.loggingConsistencyPercent.percentChange,
    rangeComparison?.trends.nutrition.loggingConsistencyPercent.delta
  );

  const efficiencyTrend = formatTrend(
    rangeComparison?.trends.efficiency.deepWorkHours.percentChange,
    rangeComparison?.trends.efficiency.deepWorkHours.delta
  );

  const fitnessPrimary = `${rangeSummary?.fitness.caloriesBurned ?? 0} kcal burned`;

  const fitnessSecondary =
    (rangeSummary?.dayCount ?? 1) === 1
      ? `${rangeSummary?.fitness.steps ?? 0} steps • ${
          rangeSummary?.fitness.activeMinutes ?? 0
        } active min`
      : `Avg ${
          rangeSummary?.fitness.averageStepsPerDay ?? 0
        } steps/day • ${
          rangeSummary?.fitness.workouts ?? 0
        } workouts`;

  const nutritionPrimary =
    (rangeSummary?.dayCount ?? 1) === 1
      ? `${rangeSummary?.nutrition.caloriesConsumed ?? 0} kcal eaten`
      : `${rangeSummary?.nutrition.averageCaloriesPerDay ?? 0} kcal eaten/day`;

  const nutritionSecondary =
    (rangeSummary?.dayCount ?? 1) === 1
      ? `Protein ${
          rangeSummary?.nutrition.proteinConsumed ?? 0
        }g / ${
          rangeSummary?.nutrition.proteinGoal ?? 0
        }g`
      : `Protein avg ${
          rangeSummary?.nutrition.averageProteinPerDay ?? 0
        }g/day • ${
          rangeSummary?.nutrition.loggingConsistencyPercent ?? 0
        }% logged`;

  const efficiencyPrimary =
    `${rangeSummary?.efficiency.deepWorkHours ?? 0}h`;

  const efficiencySecondary =
    (rangeSummary?.dayCount ?? 1) === 1
      ? `${
          rangeSummary?.efficiency.deepWorkSessions ?? 0
        } focus session${
          (rangeSummary?.efficiency.deepWorkSessions ?? 0) === 1
            ? ''
            : 's'
        } • Target ${
          rangeSummary?.efficiency.deepWorkTargetHours ?? 0
        }h`
      : `Avg ${
          rangeSummary?.efficiency.averageDeepWorkHoursPerDay ?? 0
        }h/day • ${
          rangeSummary?.efficiency.deepWorkGoalDays ?? 0
        } goal days`;


  const todayCalories = rangeSummary?.nutrition.caloriesConsumed ?? 0;
  const calorieProgress =
    targetCalories > 0
      ? Math.min(todayCalories / targetCalories, 1)
      : 0;

  const todayWorkouts = rangeSummary?.fitness.workouts ?? 0;
  const workoutProgress = Math.min(todayWorkouts, 1);

  const deepWorkHours = rangeSummary?.efficiency.deepWorkHours ?? 0;
  const deepWorkTarget =
    rangeSummary?.efficiency.deepWorkTargetHours ?? 0;
  const deepWorkProgress =
    deepWorkTarget > 0
      ? Math.min(deepWorkHours / deepWorkTarget, 1)
      : 0;

  return (
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor: theme.background },
      ]}
    >
      <View
          style={[
            styles.heroHeader,
            {
              backgroundColor: theme.cardBackground,
              borderColor: theme.border,
            },
          ]}
        >
          <View
            pointerEvents="none"
            style={[
              styles.heroGlowOne,
              { backgroundColor: `${theme.primaryAccent}22` },
            ]}
          />
          <View
            pointerEvents="none"
            style={[
              styles.heroGlowTwo,
              { backgroundColor: `${theme.fitnessAccent}18` },
            ]}
          />

          <View style={styles.heroTopRow}>
            <View style={styles.heroCopy}>
              <Text
                style={[
                  styles.heroGreeting,
                  { color: theme.textPrimary },
                ]}
              >
                {greeting},{' '}
                <Text style={{ color: theme.primaryAccent }}>
                  {displayName}
                </Text>
              </Text>

              <Text
                style={[
                  styles.heroSubtitle,
                  { color: theme.textSecondary },
                ]}
              >
                Here’s your Chawgee Briefing
              </Text>

              <TouchableOpacity
                onPress={openCalendar}
                activeOpacity={0.75}
                style={styles.heroDateRow}
              >
                <Text
                  style={[
                    styles.heroDate,
                    { color: theme.textSecondary },
                  ]}
                >
                  {displayDate}
                </Text>
                <Ionicons
                  name="calendar-outline"
                  size={14}
                  color={theme.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <View
              style={[
                styles.heroIconFrame,
                {
                  backgroundColor: `${theme.primaryAccent}14`,
                  borderColor: `${theme.primaryAccent}30`,
                },
              ]}
            >
              <Ionicons
                name={greetingIcon}
                size={28}
                color={theme.primaryAccent}
              />
            </View>
          </View>

      </View>


      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >

        <View
          style={[
            styles.briefingShell,
            {
              backgroundColor: theme.cardBackground,
              borderColor: theme.border,
            },
          ]}
        >
          <View style={styles.briefingShellHeader}>
            <View style={styles.aiHeaderLeft}>
              <Ionicons
                name="sparkles"
                size={20}
                color={theme.primaryAccent}
              />
              <Text
                style={[
                  styles.briefingShellTitle,
                  { color: theme.textPrimary },
                ]}
              >
                {isNewUser ? 'Welcome to Chawgee' : 'Chawgee Briefing'}
              </Text>
            </View>

            <TouchableOpacity
              onPress={loadChawgeeBriefing}
              disabled={loadingAi}
              style={styles.refreshButton}
            >
              <Ionicons
                name="refresh"
                size={18}
                color={theme.textSecondary}
              />
            </TouchableOpacity>
          </View>

          {loadingAi ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator
                size="small"
                color={theme.primaryAccent}
              />
              <Text
                style={[
                  styles.loadingText,
                  { color: theme.textSecondary },
                ]}
              >
                Chawgee is reviewing your progress...
              </Text>
            </View>
          ) : (
            <View style={styles.briefingCarousel}>
              <ScrollView
                ref={briefingCarouselRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={BRIEFING_CARD_WIDTH + 10}
                decelerationRate="fast"
                contentContainerStyle={styles.briefingCarouselContent}
                onMomentumScrollEnd={(event) => {
                  const page = Math.round(
                    event.nativeEvent.contentOffset.x /
                      (BRIEFING_CARD_WIDTH + 10)
                  );

                  setActiveBriefingPage(
                    Math.max(
                      0,
                      Math.min(page, briefingSlides.length - 1)
                    )
                  );
                }}
              >
                {briefingSlides.map((slide, index) => (
                  <TouchableOpacity
                    key={slide.id}
                    activeOpacity={0.97}
                    onPress={toggleBriefingPause}
                    style={[
                      styles.briefingSection,
                      {
                        width: BRIEFING_CARD_WIDTH,
                        backgroundColor: theme.surfaceMuted,
                        borderColor:
                          index === activeBriefingPage
                            ? theme.primaryAccent
                            : theme.border,
                      },
                    ]}
                  >
                    <View style={styles.briefingSectionHeader}>
                      <View style={styles.briefingHeaderLeft}>
                        <View
                          style={[
                            styles.briefingSectionIcon,
                            {
                              backgroundColor: `${theme.primaryAccent}18`,
                            },
                          ]}
                        >
                          <Ionicons
                            name={slide.icon}
                            size={18}
                            color={theme.primaryAccent}
                          />
                        </View>

                        <Text
                          style={[
                            styles.briefingSectionTitle,
                            { color: theme.textPrimary },
                          ]}
                        >
                          {slide.title}
                        </Text>
                      </View>

                      <Text
                        style={[
                          styles.briefingCounter,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {index + 1} of {briefingSlides.length}
                      </Text>
                    </View>

                    <View style={styles.briefingConversationRow}>
                      <View
                        style={[
                          styles.chawgeeAvatarFrame,
                          {
                            backgroundColor: `${theme.primaryAccent}0D`,
                          },
                        ]}
                      >
                        <Image
                          source={require('../../assets/images/chawgee-avatar-transparent.png')}
                          style={styles.chawgeeAvatar}
                          resizeMode="contain"
                        />
                      </View>

                      <View
                        style={[
                          styles.briefingBubble,
                          {
                            backgroundColor: theme.cardBackground,
                            borderColor: theme.border,
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.briefingBubbleTail,
                            {
                              backgroundColor: theme.cardBackground,
                              borderLeftColor: theme.border,
                              borderBottomColor: theme.border,
                            },
                          ]}
                        />

                        <View style={styles.briefingPointList}>
                          {slide.points.map((point, pointIndex) => (
                            <View
                              key={`${slide.id}-${pointIndex}`}
                              style={styles.briefingPointRow}
                            >
                              <Text
                                style={[
                                  styles.briefingBullet,
                                  { color: theme.primaryAccent },
                                ]}
                              >
                                •
                              </Text>

                              <Text
                                style={[
                                  styles.aiBriefingText,
                                  { color: theme.textPrimary },
                                ]}
                              >
                                {renderMetricEmphasis(
                                  point,
                                  theme.primaryAccent
                                )}
                              </Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    </View>

                    <View style={styles.briefingStatusRow}>
                      <Ionicons
                        name={
                          briefingPaused
                            ? 'pause-circle-outline'
                            : 'play-circle-outline'
                        }
                        size={17}
                        color={theme.primaryAccent}
                      />
                      <View style={styles.briefingStatusCopy}>
                        <Text
                          style={[
                            styles.briefingStatusTitle,
                            { color: theme.textPrimary },
                          ]}
                        >
                          {briefingPaused ? 'Paused' : 'Auto-rotating'}
                        </Text>
                        <Text
                          style={[
                            styles.briefingStatusText,
                            { color: theme.textSecondary },
                          ]}
                        >
                          {briefingPaused
                            ? 'Tap card to resume'
                            : 'Tap card to pause'}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {briefingSlides.length > 1 && (
                <View style={styles.briefingDots}>
                  {briefingSlides.map((slide, index) => (
                    <TouchableOpacity
                      key={slide.id}
                      activeOpacity={0.7}
                      onPress={() => {
                        setBriefingPaused(true);
                        scrollToBriefingPage(index);
                      }}
                      style={[
                        styles.briefingDot,
                        {
                          width:
                            activeBriefingPage === index ? 20 : 7,
                          backgroundColor:
                            activeBriefingPage === index
                              ? theme.primaryAccent
                              : theme.border,
                        },
                      ]}
                    />
                  ))}
                </View>
              )}
            </View>
          )}
        </View>

        <View style={styles.sectionTitleRow}>
          <Text
            style={[
              styles.dashboardSectionTitle,
              { color: theme.textPrimary },
            ]}
          >
            Today’s Progress
          </Text>

          <TouchableOpacity onPress={() => applyPreset('today')}>
            <Text
              style={[
                styles.seeAllText,
                { color: theme.primaryAccent },
              ]}
            >
              See All
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.progressGrid}>
          <View
            style={[
              styles.progressTile,
              {
                backgroundColor: `${theme.nutritionAccent}12`,
                borderColor: `${theme.nutritionAccent}28`,
              },
            ]}
          >
            <Ionicons
              name="flame"
              size={24}
              color={theme.nutritionAccent}
            />
            <Text
              style={[
                styles.progressValue,
                { color: theme.textPrimary },
              ]}
            >
              {todayCalories.toLocaleString()}
            </Text>
            <Text
              style={[
                styles.progressLabel,
                { color: theme.textSecondary },
              ]}
            >
              / {targetCalories.toLocaleString()} cal
            </Text>
            <View
              style={[
                styles.progressTrack,
                { backgroundColor: `${theme.nutritionAccent}20` },
              ]}
            >
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${calorieProgress * 100}%`,
                    backgroundColor: theme.nutritionAccent,
                  },
                ]}
              />
            </View>
          </View>

          <View
            style={[
              styles.progressTile,
              {
                backgroundColor: `${theme.fitnessAccent}12`,
                borderColor: `${theme.fitnessAccent}28`,
              },
            ]}
          >
            <Ionicons
              name="barbell"
              size={24}
              color={theme.fitnessAccent}
            />
            <Text
              style={[
                styles.progressValue,
                { color: theme.textPrimary },
              ]}
            >
              {todayWorkouts}
            </Text>
            <Text
              style={[
                styles.progressLabel,
                { color: theme.textSecondary },
              ]}
            >
              Workouts
            </Text>
            <View
              style={[
                styles.progressTrack,
                { backgroundColor: `${theme.fitnessAccent}20` },
              ]}
            >
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${workoutProgress * 100}%`,
                    backgroundColor: theme.fitnessAccent,
                  },
                ]}
              />
            </View>
          </View>

          <View
            style={[
              styles.progressTile,
              {
                backgroundColor: `${theme.efficiencyAccent}12`,
                borderColor: `${theme.efficiencyAccent}28`,
              },
            ]}
          >
            <Ionicons
              name="time"
              size={24}
              color={theme.efficiencyAccent}
            />
            <Text
              style={[
                styles.progressValue,
                { color: theme.textPrimary },
              ]}
            >
              {deepWorkHours.toFixed(1)} / {deepWorkTarget.toFixed(1)}
            </Text>
            <Text
              style={[
                styles.progressLabel,
                { color: theme.textSecondary },
              ]}
            >
              Deep Work
            </Text>
            <View
              style={[
                styles.progressTrack,
                { backgroundColor: `${theme.efficiencyAccent}20` },
              ]}
            >
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${deepWorkProgress * 100}%`,
                    backgroundColor: theme.efficiencyAccent,
                  },
                ]}
              />
            </View>
          </View>
        </View>

        <Text
          style={[
            styles.dashboardSectionTitle,
            { color: theme.textPrimary },
          ]}
        >
          Quick Actions
        </Text>

        <View style={styles.quickActionsRow}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() =>
              router.push({
                pathname: '/(tabs)/nutrition',
                params: { quickAction: 'logMeal' },
              })
            }
            style={[
              styles.quickActionButton,
              { backgroundColor: theme.nutritionAccent },
            ]}
          >
            <Ionicons name="add" size={18} color="#FFFFFF" />
            <Text style={styles.quickActionText}>Log Meal</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() =>
              router.push({
                pathname: '/(tabs)/fitness',
                params: { quickAction: 'addWorkout' },
              })
            }
            style={[
              styles.quickActionButton,
              { backgroundColor: theme.fitnessAccent },
            ]}
          >
            <Ionicons name="add" size={18} color="#FFFFFF" />
            <Text style={styles.quickActionText}>Add Workout</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() =>
              router.push({
                pathname: '/(tabs)/efficiency',
                params: { quickAction: 'addTask' },
              })
            }
            style={[
              styles.quickActionButton,
              { backgroundColor: theme.efficiencyAccent },
            ]}
          >
            <Ionicons name="add" size={18} color="#FFFFFF" />
            <Text style={styles.quickActionText}>Add Task</Text>
          </TouchableOpacity>
        </View>


      </ScrollView>
      <Modal
        visible={calendarVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCalendarVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.calendarSheet,
              {
                backgroundColor: theme.cardBackground,
                borderColor: theme.border,
              },
            ]}
          >
            <View style={styles.calendarTopRow}>
              <View>
                <Text
                  style={[
                    styles.calendarTitle,
                    { color: theme.textPrimary },
                  ]}
                >
                  Choose a date range
                </Text>

                <Text
                  style={[
                    styles.calendarSelection,
                    { color: theme.textSecondary },
                  ]}
                >
                  {draftStartDate
                    ? `${formatShortDate(draftStartDate)}${
                        draftEndDate
                          ? ` – ${formatShortDate(draftEndDate)}`
                          : ''
                      }`
                    : 'Select a day or range'}
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => setCalendarVisible(false)}
                style={styles.iconButton}
              >
                <Ionicons
                  name="close"
                  size={22}
                  color={theme.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.calendarQuickRow}>
              {(
                [
                  ['7d', '7D'],
                  ['14d', '14D'],
                  ['30d', '30D'],
                ] as const
              ).map(([preset, label]) => {
                const selected = range.preset === preset;

                return (
                  <TouchableOpacity
                    key={preset}
                    onPress={() => {
                      applyPreset(preset);
                      setCalendarVisible(false);
                    }}
                    style={[
                      styles.quickRangeButton,
                      {
                        borderColor: selected
                          ? theme.primaryAccent
                          : theme.border,
                        backgroundColor: selected
                          ? `${theme.primaryAccent}14`
                          : theme.cardBackground,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.quickRangeText,
                        {
                          color: selected
                            ? theme.primaryAccent
                            : theme.textSecondary,
                        },
                      ]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.monthHeader}>
              <TouchableOpacity
                onPress={() =>
                  setCalendarMonth(
                    new Date(
                      calendarMonth.getFullYear(),
                      calendarMonth.getMonth() - 1,
                      1
                    )
                  )
                }
                style={styles.iconButton}
              >
                <Ionicons
                  name="chevron-back"
                  size={20}
                  color={theme.textPrimary}
                />
              </TouchableOpacity>

              <Text
                style={[
                  styles.monthTitle,
                  { color: theme.textPrimary },
                ]}
              >
                {calendarMonth.toLocaleDateString(undefined, {
                  month: 'long',
                  year: 'numeric',
                })}
              </Text>

              <TouchableOpacity
                onPress={() =>
                  setCalendarMonth(
                    new Date(
                      calendarMonth.getFullYear(),
                      calendarMonth.getMonth() + 1,
                      1
                    )
                  )
                }
                style={styles.iconButton}
              >
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={theme.textPrimary}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.weekRow}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(
                (day, index) => (
                  <Text
                    key={`${day}-${index}`}
                    style={[
                      styles.weekLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {day}
                  </Text>
                )
              )}
            </View>

            <View style={styles.calendarGrid}>
              {calendarCells.map((day, index) => {
                if (!day) {
                  return (
                    <View
                      key={`blank-${index}`}
                      style={styles.dayCell}
                    />
                  );
                }

                const dateKey = toDateKey(
                  new Date(
                    calendarMonth.getFullYear(),
                    calendarMonth.getMonth(),
                    day
                  )
                );

                const endForSelection =
                  draftEndDate || draftStartDate;

                const selected =
                  Boolean(draftStartDate) &&
                  dateKey >= draftStartDate &&
                  dateKey <= endForSelection;

                const boundary =
                  dateKey === draftStartDate ||
                  dateKey === draftEndDate;

                return (
                  <TouchableOpacity
                    key={dateKey}
                    onPress={() => chooseCalendarDate(day)}
                    style={[
                      styles.dayCell,
                      selected && {
                        backgroundColor: `${theme.fitnessAccent}22`,
                      },
                      boundary && {
                        backgroundColor: theme.fitnessAccent,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        {
                          color: boundary
                            ? '#FFFFFF'
                            : theme.textPrimary,
                        },
                      ]}
                    >
                      {day}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              onPress={applyCustomRange}
              style={[
                styles.applyButton,
                { backgroundColor: theme.fitnessAccent },
              ]}
            >
              <Text style={styles.applyButtonText}>
                Apply range
              </Text>
            </TouchableOpacity>
          </View>
        </View>
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
    paddingBottom: 28,
    gap: 18,
  },

  heroHeader: {
    position: 'relative',
    overflow: 'hidden',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 12,
    minHeight: 158,
    zIndex: 10,
    elevation: 2,
  },

  heroGlowOne: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    right: -50,
    top: -75,
  },

  heroGlowTwo: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    left: -65,
    bottom: -95,
  },

  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
  },

  heroCopy: {
    flex: 1,
    gap: 5,
  },

  heroGreeting: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900',
    letterSpacing: -0.7,
  },

  heroSubtitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },

  heroDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },

  heroDate: {
    fontSize: 12,
    fontWeight: '700',
  },

  heroIconFrame: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  briefingShell: {
    padding: 14,
    borderRadius: 22,
    borderWidth: 1,
    gap: 12,
  },

  briefingShellHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  briefingShellTitle: {
    fontSize: 18,
    fontWeight: '900',
  },

  aiHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  refreshButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 18,
  },

  loadingText: {
    fontSize: 13,
    fontWeight: '600',
  },

  briefingCarousel: {
    gap: 10,
  },

  briefingCarouselContent: {
    gap: 10,
    paddingRight: 2,
    alignItems: 'flex-start',
  },

  briefingSection: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    gap: 13,
  },

  briefingDots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 10,
  },

  briefingDot: {
    height: 7,
    borderRadius: 999,
  },

  briefingSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },

  briefingHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    flex: 1,
  },

  briefingSectionIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },

  briefingSectionTitle: {
    fontSize: 17,
    fontWeight: '900',
  },

  briefingCounter: {
    fontSize: 11,
    fontWeight: '800',
  },

  briefingConversationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  chawgeeAvatarFrame: {
    width: 78,
    height: 96,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },

  chawgeeAvatar: {
    width: 76,
    height: 94,
  },

  briefingBubble: {
    flex: 1,
    minHeight: 118,
    borderWidth: 1,
    borderRadius: 20,
    borderTopLeftRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 14,
    position: 'relative',
  },

  briefingBubbleTail: {
    position: 'absolute',
    left: -7,
    top: 32,
    width: 14,
    height: 14,
    transform: [{ rotate: '45deg' }],
    borderLeftWidth: 1,
    borderBottomWidth: 1,
  },

  briefingPointList: {
    gap: 9,
  },

  briefingPointRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },

  briefingBullet: {
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '900',
  },

  aiBriefingText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },

  briefingStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 2,
    paddingTop: 1,
  },

  briefingStatusCopy: {
    gap: 1,
  },

  briefingStatusTitle: {
    fontSize: 11,
    fontWeight: '900',
  },

  briefingStatusText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
  },

  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  dashboardSectionTitle: {
    fontSize: 19,
    fontWeight: '900',
    letterSpacing: -0.2,
  },

  seeAllText: {
    fontSize: 12,
    fontWeight: '800',
  },

  progressGrid: {
    flexDirection: 'row',
    gap: 10,
  },

  progressTile: {
    flex: 1,
    minWidth: 0,
    minHeight: 150,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },

  progressValue: {
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },

  progressLabel: {
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },

  progressTrack: {
    width: '100%',
    height: 7,
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 7,
  },

  progressFill: {
    height: '100%',
    borderRadius: 999,
  },

  quickActionsRow: {
    flexDirection: 'row',
    gap: 9,
  },

  quickActionButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 8,
  },

  quickActionText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },

  rangeFooter: {
    gap: 8,
    paddingTop: 4,
  },

  rangeFooterRow: {
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
  },

  rangePill: {
    flex: 1,
    minHeight: 36,
    borderWidth: 1,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
  },

  rangePillText: {
    fontSize: 11,
    fontWeight: '800',
  },

  calendarButton: {
    width: 40,
    height: 36,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  rangeLabel: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },

  calendarSheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
    gap: 16,
  },

  calendarTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },

  calendarTitle: {
    fontSize: 18,
    fontWeight: '900',
  },

  calendarSelection: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
  },

  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  calendarQuickRow: {
    flexDirection: 'row',
    gap: 10,
  },

  quickRangeButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },

  quickRangeText: {
    fontSize: 12,
    fontWeight: '700',
  },

  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  monthTitle: {
    fontSize: 15,
    fontWeight: '800',
  },

  weekRow: {
    flexDirection: 'row',
  },

  weekLabel: {
    width: '14.2857%',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '800',
  },

  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },

  dayCell: {
    width: '14.2857%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },

  dayText: {
    fontSize: 13,
    fontWeight: '700',
  },

  applyButton: {
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  applyButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
});
