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
  Animated,
  PanResponder,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/context/ThemeContext';
import { useAuth } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/context/AuthContext';
import { LightTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/constants/colors';
import { fetchChawgeeBriefing } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/services/chawgeeApi';
import { buildChawgeeContext } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/services/chawgeeContext';
import {
  getDashboardRangeComparison,
} from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/storage/dashboardAnalytics';
import { getUserScopedStorageKey } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/storage/userScopedStorage';
import {
  CalendarTask,
  fetchDeviceEvents,
  getTasks,
  setTaskCompleted,
  setTaskOutcome,
} from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/storage/efficiencyStorage';
import {
  loadUserProfile,
} from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/storage/userProfileStorage';
import {
  cancelStoredTaskNotifications,
  runTimelineNotificationTransaction,
  StoredTaskNotifications,
} from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/services/taskNotificationService';

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


const formatTimelineTime = (value?: string): string => {
  if (!value) return '';

  const [hourString, minuteString] = value.split(':');
  const hour = Number(hourString);
  const minute = Number(minuteString);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return value;
  }

  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${String(minute).padStart(2, '0')} ${suffix}`;
};

const timelineTimeToMinutes = (value?: string): number | null => {
  if (!value) return null;

  const [hourString, minuteString] = value.split(':');
  const hours = Number(hourString);
  const minutes = Number(minuteString);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return hours * 60 + minutes;
};

const timelineDateTime = (
  dateKey: string,
  time?: string
): Date | null => {
  const minutes = timelineTimeToMinutes(time);
  if (minutes === null) return null;

  const date = fromDateKey(dateKey);
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date;
};

type TimelineLifecycleState =
  | 'upcoming'
  | 'starting_soon'
  | 'in_progress'
  | 'awaiting_outcome'
  | 'completed'
  | 'missed'
  | 'unscheduled';

interface TimelineDeckItem {
  item: CalendarTask;
  lifecycle: TimelineLifecycleState;
  start: number | null;
  end: number | null;
}

const getTimelineLifecycle = (
  item: CalendarTask,
  now: Date
): TimelineLifecycleState => {
  if (item.outcome === 'completed' || item.completed) {
    return 'completed';
  }

  if (item.outcome === 'missed') return 'missed';

  const start = timelineDateTime(item.date, item.startTime);
  const end = timelineDateTime(item.date, item.endTime);

  if (!start || !end) return 'unscheduled';

  if (now >= end) return 'awaiting_outcome';
  if (now >= start) return 'in_progress';
  if (start.getTime() - now.getTime() <= 10 * 60 * 1000) {
    return 'starting_soon';
  }

  return 'upcoming';
};

const getLifecycleLabel = (
  lifecycle: TimelineLifecycleState,
  item: CalendarTask,
  now: Date
): string => {
  switch (lifecycle) {
    case 'starting_soon': {
      const start = timelineDateTime(item.date, item.startTime);
      const remainingMinutes = start
        ? Math.max(
            1,
            Math.ceil(
              (start.getTime() - now.getTime()) / 60000
            )
          )
        : 10;

      return `STARTING IN ${remainingMinutes} MINUTE${
        remainingMinutes === 1 ? '' : 'S'
      }`;
    }
    case 'in_progress':
      return 'IN PROGRESS';
    case 'awaiting_outcome':
      return 'TIME PASSED • OUTCOME NEEDED';
    case 'completed':
      return 'COMPLETED';
    case 'missed':
      return 'MISSED';
    case 'unscheduled':
      return 'TIME NOT SET';
    default:
      return 'UPCOMING';
  }
};

export default function DashboardScreen() {
  const { theme = LightTheme } = useTheme() || {};
  const { user } = useAuth();
  const router = useRouter();

  const ensureNotificationPermission = useCallback(async () => {
    const current = await Notifications.getPermissionsAsync();

    if (current.status === 'granted') return true;

    const requested = await Notifications.requestPermissionsAsync();
    return requested.status === 'granted';
  }, []);


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

  const [aiBriefing, setAiBriefing] = useState<string>('');
  const [loadingAi, setLoadingAi] = useState<boolean>(false);
  const [isNewUser, setIsNewUser] = useState(false);
  const [activeBriefingPage, setActiveBriefingPage] = useState(0);
  const [briefingPaused, setBriefingPaused] = useState(false);
  const briefingCarouselRef = useRef<ScrollView>(null);

  const [timelineItems, setTimelineItems] = useState<CalendarTask[]>([]);
  const [timelineNow, setTimelineNow] = useState(() => new Date());
  const [deckIndex, setDeckIndex] = useState(0);
  const [deckManuallyMoved, setDeckManuallyMoved] = useState(false);
  const deckSwipe = useRef(new Animated.ValueXY()).current;
  const previousAutoFocusId = useRef<string | null>(null);

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

  useEffect(() => {
    const interval = setInterval(() => {
      setTimelineNow(new Date());
    }, 30000);

    return () => clearInterval(interval);
  }, []);

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

  const syncTimelineNotifications = useCallback(
    async (items: CalendarTask[]) => {
      await runTimelineNotificationTransaction(
        async ({ notifications: saved, notificationScopeId }) => {
          try {
            const allowed = await ensureNotificationPermission();
            if (!allowed) {
              return { notifications: saved, result: undefined };
            }

        const next: Record<string, StoredTaskNotifications> = {};

        const now = new Date();
        const todayKey = toDateKey(now);

        for (const item of items) {
          const existing = saved[item.id];
          const desired: StoredTaskNotifications = {};

          const start = item.startTime
            ? fromDateKey(item.date)
            : null;
          const end = item.endTime
            ? fromDateKey(item.date)
            : null;

          if (start && end) {
            const [startHourString, startMinuteString] =
              item.startTime!.split(':');
            const [endHourString, endMinuteString] =
              item.endTime!.split(':');
            const startHour = Number(startHourString);
            const startMinute = Number(startMinuteString);
            const endHour = Number(endHourString);
            const endMinute = Number(endMinuteString);

            if (
              Number.isInteger(startHour) &&
              Number.isInteger(startMinute) &&
              Number.isInteger(endHour) &&
              Number.isInteger(endMinute) &&
              startHour >= 0 && startHour <= 23 &&
              startMinute >= 0 && startMinute <= 59 &&
              endHour >= 0 && endHour <= 23 &&
              endMinute >= 0 && endMinute <= 59
            ) {
              start.setHours(startHour, startMinute, 0, 0);
              end.setHours(endHour, endMinute, 0, 0);
            } else {
              start.setTime(NaN);
              end.setTime(NaN);
            }
          }

          const validSchedule = Boolean(
            start && end &&
            Number.isFinite(start.getTime()) &&
            Number.isFinite(end.getTime()) &&
            end > start
          );
          const terminal =
            item.completed ||
            item.outcome === 'completed' ||
            item.outcome === 'missed';
          const localTask =
            item.source === 'manual' || item.source === 'chawgee';
          const preStartEligible = Boolean(
            !terminal &&
            validSchedule &&
            item.date >= todayKey &&
            start &&
            start.getTime() - 10 * 60 * 1000 > now.getTime()
          );
          const outcomePromptEligible = Boolean(
            !terminal &&
            localTask &&
            validSchedule &&
            end &&
            end.getTime() + 5 * 60 * 1000 > now.getTime()
          );

          if (localTask) {
            console.log('[CHAWGEE NOTIFICATION DEBUG]', {
              taskId: item.id,
              title: item.title,
              source: item.source,
              date: item.date,
              startTime: item.startTime,
              endTime: item.endTime,
              now: now.toISOString(),
              calculatedStart: start?.toISOString(),
              calculatedEnd: end?.toISOString(),
              calculatedPreStartTrigger: start
                ? new Date(
                    start.getTime() - 10 * 60 * 1000
                  ).toISOString()
                : undefined,
              calculatedOutcomeTrigger: end
                ? new Date(
                    end.getTime() + 5 * 60 * 1000
                  ).toISOString()
                : undefined,
              validSchedule,
              terminal,
              preStartEligible,
              outcomePromptEligible,
              storedPreStartNotificationId:
                existing?.preStart?.notificationId,
              storedOutcomePromptNotificationId:
                existing?.outcomePrompt?.notificationId,
            });
          }

          if (
            preStartEligible
          ) {
            const signature = [
              'pre_start',
              item.title,
              item.date,
              item.startTime,
              item.endTime ?? '',
            ].join('|');
            if (existing?.preStart?.signature === signature) {
              desired.preStart = existing.preStart;
            } else {
              if (existing?.preStart) {
                console.log(
                  '[CHAWGEE NOTIFICATION DEBUG] ROLE_CANCELLED',
                  {
                    taskId: item.id,
                    role: 'preStart',
                    notificationId:
                      existing.preStart.notificationId,
                    reason: 'signature_changed',
                  }
                );
                await Notifications.cancelScheduledNotificationAsync(
                  existing.preStart.notificationId
                );
              }
              const preStartTrigger = new Date(
                start!.getTime() - 10 * 60 * 1000
              );
              console.log(
                '[CHAWGEE NOTIFICATION DEBUG] PRESTART_SCHEDULING',
                {
                  taskId: item.id,
                  trigger: preStartTrigger.toISOString(),
                  signature,
                }
              );
              let notificationId: string;
              try {
                notificationId =
                  await Notifications.scheduleNotificationAsync({
                    content: {
                      title: 'Upcoming with Chawgee',
                      body: `${item.title} starts in 10 minutes.`,
                      data: {
                        type: 'timeline_upcoming',
                        notificationRole: 'pre_start',
                        taskId: item.id,
                        taskDate: item.date,
                        notificationScopeId,
                      },
                      sound: true,
                    },
                    trigger: {
                      type:
                        Notifications.SchedulableTriggerInputTypes.DATE,
                      date: preStartTrigger,
                    },
                  });
              } catch (error) {
                console.warn(
                  '[CHAWGEE NOTIFICATION DEBUG] PRESTART_SCHEDULE_FAILED',
                  {
                    taskId: item.id,
                    message:
                      error instanceof Error
                        ? error.message
                        : 'Unknown scheduling error',
                  }
                );
                throw error;
              }
              console.log(
                '[CHAWGEE NOTIFICATION DEBUG] PRESTART_SCHEDULED',
                { taskId: item.id, notificationId }
              );
              desired.preStart = { notificationId, signature };
            }
          }

          if (
            outcomePromptEligible
          ) {
            const triggerAt = new Date(
              end!.getTime() + 5 * 60 * 1000
            );
            const signature = [
              'outcome_prompt',
              item.title,
              item.date,
              item.startTime,
              item.endTime,
              triggerAt.toISOString(),
            ].join('|');
            if (existing?.outcomePrompt?.signature === signature) {
              desired.outcomePrompt = existing.outcomePrompt;
            } else {
              if (existing?.outcomePrompt) {
                console.log(
                  '[CHAWGEE NOTIFICATION DEBUG] ROLE_CANCELLED',
                  {
                    taskId: item.id,
                    role: 'outcomePrompt',
                    notificationId:
                      existing.outcomePrompt.notificationId,
                    reason: 'signature_changed',
                  }
                );
                await Notifications.cancelScheduledNotificationAsync(
                  existing.outcomePrompt.notificationId
                );
              }
              console.log(
                '[CHAWGEE NOTIFICATION DEBUG] OUTCOME_SCHEDULING',
                {
                  taskId: item.id,
                  trigger: triggerAt.toISOString(),
                  signature,
                }
              );
              let notificationId: string;
              try {
                notificationId =
                  await Notifications.scheduleNotificationAsync({
                    content: {
                      title: 'How did it go?',
                      body: `${item.title} has ended. Let Chawgee know if you completed it, missed it, or need to reschedule.`,
                      data: {
                        type: 'task_outcome_prompt',
                        notificationRole: 'outcome_prompt',
                        taskId: item.id,
                        taskDate: item.date,
                        notificationScopeId,
                      },
                      sound: true,
                    },
                    trigger: {
                      type:
                        Notifications.SchedulableTriggerInputTypes.DATE,
                      date: triggerAt,
                    },
                  });
              } catch (error) {
                console.warn(
                  '[CHAWGEE NOTIFICATION DEBUG] OUTCOME_SCHEDULE_FAILED',
                  {
                    taskId: item.id,
                    message:
                      error instanceof Error
                        ? error.message
                        : 'Unknown scheduling error',
                  }
                );
                throw error;
              }
              console.log(
                '[CHAWGEE NOTIFICATION DEBUG] OUTCOME_SCHEDULED',
                { taskId: item.id, notificationId }
              );
              desired.outcomePrompt = {
                notificationId,
                signature,
              };
            }
          }

          if (existing?.preStart && !desired.preStart) {
            console.log(
              '[CHAWGEE NOTIFICATION DEBUG] ROLE_CANCELLED',
              {
                taskId: item.id,
                role: 'preStart',
                notificationId: existing.preStart.notificationId,
                reason: terminal
                  ? 'terminal'
                  : 'no_longer_eligible',
              }
            );
            await Notifications.cancelScheduledNotificationAsync(
              existing.preStart.notificationId
            );
          }
          if (existing?.outcomePrompt && !desired.outcomePrompt) {
            console.log(
              '[CHAWGEE NOTIFICATION DEBUG] ROLE_CANCELLED',
              {
                taskId: item.id,
                role: 'outcomePrompt',
                notificationId:
                  existing.outcomePrompt.notificationId,
                reason: terminal
                  ? 'terminal'
                  : 'no_longer_eligible',
              }
            );
            await Notifications.cancelScheduledNotificationAsync(
              existing.outcomePrompt.notificationId
            );
          }
          if (desired.preStart || desired.outcomePrompt) {
            next[item.id] = desired;
          }

        }

        for (const [taskId, record] of Object.entries(saved)) {
          if (!next[taskId]) {
            try {
              for (const stored of [
                record.preStart,
                record.outcomePrompt,
              ]) {
                if (stored) {
                  console.log(
                    '[CHAWGEE NOTIFICATION DEBUG] ROLE_CANCELLED',
                    {
                      taskId,
                      role:
                        stored === record.preStart
                          ? 'preStart'
                          : 'outcomePrompt',
                      notificationId: stored.notificationId,
                      reason: 'stale_task',
                    }
                  );
                  await Notifications.cancelScheduledNotificationAsync(
                    stored.notificationId
                  );
                }
              }
            } catch (cancelError) {
              console.warn(
                'Unable to cancel stale timeline notification:',
                cancelError
              );
            }
          }
        }

            return { notifications: next, result: undefined };
          } catch (error) {
            console.warn(
              'Unable to sync Chawgee timeline notifications:',
              error
            );
            return { notifications: saved, result: undefined };
          }
        }
      );
    },
    [ensureNotificationPermission]
  );

  const cancelTimelineNotification = useCallback(
    async (taskId: string) => {
      await cancelStoredTaskNotifications(taskId);
    },
    []
  );

  const loadDashboardTimeline = useCallback(async () => {
    try {
      const [savedTasks, profile] = await Promise.all([
        getTasks(),
        loadUserProfile(),
      ]);

      let calendarEvents: CalendarTask[] = [];

      if (profile.calendarSyncEnabled) {
        try {
          calendarEvents = await fetchDeviceEvents();
        } catch (calendarError) {
          console.warn(
            'Unable to load calendar events for dashboard timeline:',
            calendarError
          );
        }
      }

      const combined = [...savedTasks];

      calendarEvents.forEach((event) => {
        const duplicate = combined.some(
          (task) =>
            task.externalEventId === event.externalEventId ||
            task.id === event.id
        );

        if (!duplicate) {
          combined.push(event);
        }
      });

      setTimelineItems(combined);
      await syncTimelineNotifications(combined);
    } catch (error) {
      console.error('Failed to load dashboard timeline:', error);
      setTimelineItems([]);
    }
  }, [syncTimelineNotifications]);;

  useFocusEffect(
    useCallback(() => {
      loadChawgeeBriefing();
      loadDashboardTimeline();
    }, [
      range.startDate,
      range.endDate,
      loadDashboardTimeline,
    ])
  );



  const toggleDashboardTaskCompletion = async (
    task: CalendarTask
  ) => {
    if (task.source === 'calendar') return;

    const completed = !task.completed;
    const timestamp = completed
      ? new Date().toISOString()
      : undefined;

    Haptics.selectionAsync();

    setTimelineItems((current) =>
      current.map((item) =>
        item.id === task.id
          ? {
              ...item,
              completed,
              completedAt: timestamp,
              outcome: completed ? 'completed' : undefined,
              outcomeAt: timestamp,
            }
          : item
      )
    );

    try {
      await setTaskCompleted(task.id, completed);

      if (completed) {
        await cancelTimelineNotification(task.id);
      }
    } catch (error) {
      console.error(
        'Failed to update task completion from dashboard:',
        error
      );

      setTimelineItems((current) =>
        current.map((item) =>
          item.id === task.id
            ? {
                ...item,
                completed: task.completed,
                completedAt: task.completedAt,
                outcome: task.outcome,
                outcomeAt: task.outcomeAt,
              }
            : item
        )
      );
    }
  };

  const setDashboardTaskOutcome = async (
    task: CalendarTask,
    outcome: 'completed' | 'missed'
  ) => {
    if (task.source === 'calendar') return;

    const timestamp = new Date().toISOString();
    const nextTask = {
      ...task,
      completed: outcome === 'completed',
      completedAt:
        outcome === 'completed' ? timestamp : undefined,
      outcome,
      outcomeAt: timestamp,
    };

    setTimelineItems((current) =>
      current.map((item) =>
        item.id === task.id ? nextTask : item
      )
    );

    try {
      const savedTask = await setTaskOutcome(task.id, outcome);

      if (!savedTask) {
        throw new Error('Task was not found while saving outcome.');
      }

      await cancelTimelineNotification(task.id);
    } catch (error) {
      console.error(
        'Failed to update task outcome from dashboard:',
        error
      );

      setTimelineItems((current) =>
        current.map((item) =>
          item.id === task.id ? task : item
        )
      );
    }
  };

  const dashboardTodayKey = toDateKey(timelineNow);

  const dashboardDeck = useMemo(() => {
    const todaysItems = timelineItems.filter(
      (item) => item.date === dashboardTodayKey
    );

    const deckItems: TimelineDeckItem[] = todaysItems
      .map((item) => ({
        item,
        lifecycle: getTimelineLifecycle(item, timelineNow),
        start: timelineTimeToMinutes(item.startTime),
        end: timelineTimeToMinutes(item.endTime),
      }))
      .sort((a, b) => {
        if (a.start !== null && b.start !== null) {
          return a.start - b.start;
        }

        if (a.start !== null) return -1;
        if (b.start !== null) return 1;

        const priorityRank = {
          High: 0,
          Medium: 1,
          Low: 2,
        };

        return (
          priorityRank[a.item.priority] -
            priorityRank[b.item.priority] ||
          a.item.createdAt.localeCompare(b.item.createdAt)
        );
      });

    let focusIndex = deckItems.findIndex(
      (entry) => entry.lifecycle === 'starting_soon'
    );

    if (focusIndex < 0) {
      focusIndex = deckItems.findIndex(
        (entry) => entry.lifecycle === 'in_progress'
      );
    }

    if (focusIndex < 0) {
      const unresolvedPassed = deckItems
        .map((entry, index) => ({ entry, index }))
        .filter(
          ({ entry }) =>
            entry.lifecycle === 'awaiting_outcome'
        )
        .pop();

      focusIndex = unresolvedPassed?.index ?? -1;
    }

    if (focusIndex < 0) {
      focusIndex = deckItems.findIndex(
        (entry) => entry.lifecycle === 'upcoming'
      );
    }

    if (focusIndex < 0 && deckItems.length > 0) {
      focusIndex = 0;
    }

    return {
      items: deckItems,
      focusIndex,
      focusId:
        focusIndex >= 0
          ? deckItems[focusIndex]?.item.id ?? null
          : null,
    };
  }, [timelineItems, dashboardTodayKey, timelineNow]);

  useEffect(() => {
    if (dashboardDeck.items.length === 0) {
      setDeckIndex(0);
      previousAutoFocusId.current = null;
      return;
    }

    const nextFocusId = dashboardDeck.focusId;

    if (
      nextFocusId &&
      nextFocusId !== previousAutoFocusId.current
    ) {
      setDeckIndex(Math.max(dashboardDeck.focusIndex, 0));
      setDeckManuallyMoved(false);
      previousAutoFocusId.current = nextFocusId;
    } else if (
      deckIndex >= dashboardDeck.items.length
    ) {
      setDeckIndex(dashboardDeck.items.length - 1);
    }
  }, [
    dashboardDeck.focusId,
    dashboardDeck.focusIndex,
    dashboardDeck.items.length,
    deckIndex,
  ]);

  const moveDeck = useCallback(
    (direction: 1 | -1) => {
      if (dashboardDeck.items.length <= 1) return;

      setDeckManuallyMoved(true);
      setDeckIndex((current) => {
        const next = current + direction;
        return Math.max(
          0,
          Math.min(next, dashboardDeck.items.length - 1)
        );
      });

      deckSwipe.setValue({ x: 0, y: 0 });
      Haptics.selectionAsync();
    },
    [dashboardDeck.items.length, deckSwipe]
  );

  const deckPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 10 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderMove: Animated.event(
          [null, { dx: deckSwipe.x }],
          { useNativeDriver: false }
        ),
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx < -55) {
            moveDeck(1);
          } else if (gesture.dx > 55) {
            moveDeck(-1);
          }

          Animated.spring(deckSwipe, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: false,
            friction: 7,
          }).start();
        },
      }),
    [deckSwipe, moveDeck]
  );

  const activeDeckItem =
    dashboardDeck.items[deckIndex] ?? null;

  const openCalendarReschedule = (task: CalendarTask) => {
    if (
      task.source !== 'calendar' ||
      !task.externalEventId ||
      !task.calendarAllowsModifications ||
      task.calendarAllDay ||
      task.calendarRecurring
    ) {
      return;
    }

    router.push({
      pathname: '/(tabs)/efficiency',
      params: {
        mode: 'calendar-reschedule',
        source: 'calendar',
        externalEventId: task.externalEventId,
        calendarId: task.calendarId,
      },
    });
  };

  const followingLayerItems = dashboardDeck.items.slice(
    deckIndex + 1,
    deckIndex + 3
  );
  const precedingLayerCount =
    2 - followingLayerItems.length;
  const timelineLayerItems = [
    ...followingLayerItems,
    ...dashboardDeck.items
      .slice(
        Math.max(0, deckIndex - precedingLayerCount),
        deckIndex
      )
      .reverse(),
  ];



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
          <View>
            <Text
              style={[
                styles.dashboardSectionTitle,
                { color: theme.textPrimary },
              ]}
            >
              Daily Timeline
            </Text>
            <Text
              style={[
                styles.timelineDeckSubtitle,
                { color: theme.textSecondary },
              ]}
            >
              {dashboardDeck.items.length > 0
                ? `${deckIndex + 1} of ${dashboardDeck.items.length} today`
                : 'Your day at a glance'}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => router.push('/(tabs)/efficiency')}
          >
            <Text
              style={[
                styles.seeAllText,
                { color: theme.primaryAccent },
              ]}
            >
              Manage Tasks
            </Text>
          </TouchableOpacity>
        </View>

        {dashboardDeck.items.length === 0 ? (
          <View
            style={[
              styles.timelineCard,
              {
                backgroundColor: theme.cardBackground,
                borderColor: theme.border,
              },
            ]}
          >
            <View style={styles.timelineEmpty}>
              <Ionicons
                name="calendar-outline"
                size={24}
                color={theme.textSecondary}
              />
              <Text
                style={[
                  styles.timelineEmptyTitle,
                  { color: theme.textPrimary },
                ]}
              >
                No tasks or events today
              </Text>
              <Text
                style={[
                  styles.timelineEmptyText,
                  { color: theme.textSecondary },
                ]}
              >
                Add tasks from Efficiency and they will appear here.
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.timelineDeckShell}>
            <View style={styles.timelineDeckStage}>
              {timelineLayerItems
                .reverse()
                .map((entry, reverseIndex, visibleBehind) => {
                  const depth = visibleBehind.length - reverseIndex;

                  return (
                    <View
                      key={`behind-${entry.item.id}`}
                      pointerEvents="none"
                      style={[
                        styles.timelineStackCard,
                        styles.timelineStackBehind,
                        {
                          backgroundColor: theme.cardBackground,
                          borderColor: theme.border,
                          top: depth * 14,
                          left: -depth * 6,
                          right: -depth * 6,
                          opacity: 1 - depth * 0.18,
                          zIndex: 3 - depth,
                        },
                      ]}
                    >
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.timelineBehindTitle,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {entry.item.title}
                      </Text>
                    </View>
                  );
                })}

              {activeDeckItem && (
                <Animated.View
                  {...deckPanResponder.panHandlers}
                  style={[
                    styles.timelineStackCard,
                    styles.timelineFrontCard,
                    {
                      backgroundColor: theme.cardBackground,
                      borderColor:
                        activeDeckItem.lifecycle === 'starting_soon'
                          ? theme.primaryAccent
                          : activeDeckItem.lifecycle === 'in_progress'
                            ? theme.success
                            : activeDeckItem.lifecycle === 'missed'
                              ? theme.danger
                            : theme.border,
                      transform: [
                        { translateX: deckSwipe.x },
                        {
                          rotate: deckSwipe.x.interpolate({
                            inputRange: [-180, 0, 180],
                            outputRange: ['-3deg', '0deg', '3deg'],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <View style={styles.timelineDeckTopRow}>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.timelineLifecycleLabel,
                          {
                            color:
                              activeDeckItem.lifecycle === 'starting_soon'
                                ? theme.primaryAccent
                                : activeDeckItem.lifecycle === 'in_progress'
                                  ? theme.success
                                  : activeDeckItem.lifecycle ===
                                      'awaiting_outcome'
                                    ? theme.nutritionAccent
                                      : activeDeckItem.lifecycle === 'missed'
                                        ? theme.danger
                                    : theme.textSecondary,
                          },
                        ]}
                      >
                        {getLifecycleLabel(
                          activeDeckItem.lifecycle,
                          activeDeckItem.item,
                          timelineNow
                        )}
                      </Text>

                      <Text
                        style={[
                          styles.timelineDeckTitle,
                          {
                            color: theme.textPrimary,
                            textDecorationLine:
                              activeDeckItem.item.completed
                                ? 'line-through'
                                : 'none',
                          },
                        ]}
                      >
                        {activeDeckItem.item.title}
                      </Text>

                      <Text
                        style={[
                          styles.timelineDeckTime,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {activeDeckItem.start !== null &&
                        activeDeckItem.end !== null
                          ? `${formatTimelineTime(
                              activeDeckItem.item.startTime
                            )} - ${formatTimelineTime(
                              activeDeckItem.item.endTime
                            )}`
                          : `${activeDeckItem.item.category} • ${activeDeckItem.item.priority} priority`}
                      </Text>
                    </View>

                    {activeDeckItem.item.source === 'calendar' ? (
                      activeDeckItem.item.calendarAllowsModifications &&
                      !activeDeckItem.item.calendarAllDay &&
                      !activeDeckItem.item.calendarRecurring ? (
                        <TouchableOpacity
                          onPress={() =>
                            openCalendarReschedule(
                              activeDeckItem.item
                            )
                          }
                          hitSlop={10}
                        >
                          <Ionicons
                            name="calendar-outline"
                            size={22}
                            color={theme.primaryAccent}
                          />
                        </TouchableOpacity>
                      ) : (
                        <Ionicons
                          name="calendar-outline"
                          size={22}
                          color={theme.primaryAccent}
                        />
                      )
                    ) : (
                      <TouchableOpacity
                        style={styles.timelineDeckCheck}
                        onPress={() =>
                          toggleDashboardTaskCompletion(
                            activeDeckItem.item
                          )
                        }
                        hitSlop={10}
                      >
                        <Ionicons
                          name={
                            activeDeckItem.item.completed
                              ? 'checkmark-circle'
                              : 'ellipse-outline'
                          }
                          size={28}
                          color={
                            activeDeckItem.item.completed
                              ? theme.success
                              : theme.textSecondary
                          }
                        />
                      </TouchableOpacity>
                    )}
                  </View>

                  {activeDeckItem.lifecycle ===
                    'awaiting_outcome' && (
                    <View
                      style={[
                        styles.timelineOutcomePrompt,
                        {
                          backgroundColor:
                            `${theme.nutritionAccent}10`,
                          borderColor:
                            `${theme.nutritionAccent}35`,
                        },
                      ]}
                    >
                      {activeDeckItem.item.source === 'calendar' ? (
                        <>
                          <Ionicons
                            name="help-circle-outline"
                            size={18}
                            color={theme.nutritionAccent}
                          />
                          <Text
                            style={[
                              styles.timelineOutcomeText,
                              { color: theme.textSecondary },
                            ]}
                          >
                            This calendar event has passed.
                          </Text>
                          {activeDeckItem.item.externalEventId &&
                            activeDeckItem.item.calendarAllowsModifications &&
                            !activeDeckItem.item.calendarAllDay &&
                            !activeDeckItem.item.calendarRecurring && (
                              <TouchableOpacity
                                style={[
                                  styles.timelineOutcomeButton,
                                  { borderColor: theme.border },
                                ]}
                                onPress={() =>
                                  openCalendarReschedule(
                                    activeDeckItem.item
                                  )
                                }
                              >
                                <Ionicons
                                  name="calendar-outline"
                                  size={16}
                                  color={theme.textSecondary}
                                />
                                <Text
                                  style={[
                                    styles.timelineOutcomeButtonText,
                                    { color: theme.textSecondary },
                                  ]}
                                >
                                  Reschedule
                                </Text>
                              </TouchableOpacity>
                            )}
                        </>
                      ) : (
                        <View style={styles.timelineOutcomeContent}>
                          <View style={styles.timelineOutcomeHeader}>
                            <Ionicons
                              name="help-circle-outline"
                              size={18}
                              color={theme.nutritionAccent}
                            />
                            <Text
                              style={[
                                styles.timelineOutcomeText,
                                { color: theme.textSecondary },
                              ]}
                            >
                              What happened?
                            </Text>
                          </View>

                          <View style={styles.timelineOutcomeActions}>
                            <TouchableOpacity
                              style={[
                                styles.timelineOutcomeButton,
                                {
                                  backgroundColor: theme.success,
                                },
                              ]}
                              onPress={() =>
                                setDashboardTaskOutcome(
                                  activeDeckItem.item,
                                  'completed'
                                )
                              }
                            >
                              <Ionicons
                                name="checkmark"
                                size={16}
                                color="#FFFFFF"
                              />
                              <Text style={styles.timelineOutcomeButtonText}>
                                Completed
                              </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[
                                styles.timelineOutcomeButton,
                                {
                                  backgroundColor: theme.danger,
                                },
                              ]}
                              onPress={() =>
                                setDashboardTaskOutcome(
                                  activeDeckItem.item,
                                  'missed'
                                )
                              }
                            >
                              <Ionicons
                                name="close"
                                size={16}
                                color="#FFFFFF"
                              />
                              <Text style={styles.timelineOutcomeButtonText}>
                                Missed
                              </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[
                                styles.timelineOutcomeButton,
                                {
                                  borderColor: theme.border,
                                },
                              ]}
                              onPress={() =>
                                router.push({
                                  pathname: '/(tabs)/efficiency',
                                  params: {
                                    mode: 'reschedule',
                                    taskId: activeDeckItem.item.id,
                                  },
                                })
                              }
                            >
                              <Ionicons
                                name="calendar-outline"
                                size={16}
                                color={theme.textSecondary}
                              />
                              <Text
                                style={[
                                  styles.timelineOutcomeButtonText,
                                  { color: theme.textSecondary },
                                ]}
                              >
                                Reschedule
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                    </View>
                  )}

                  <View style={styles.timelineDeckFooter}>
                    <TouchableOpacity
                      disabled={deckIndex === 0}
                      onPress={() => moveDeck(-1)}
                      style={[
                        styles.timelineDeckNavButton,
                        {
                          borderColor: theme.border,
                          opacity: deckIndex === 0 ? 0.35 : 1,
                        },
                      ]}
                    >
                      <Ionicons
                        name="chevron-back"
                        size={17}
                        color={theme.textSecondary}
                      />
                      <Text
                        style={[
                          styles.timelineDeckNavText,
                          { color: theme.textSecondary },
                        ]}
                      >
                        Previous
                      </Text>
                    </TouchableOpacity>

                    <Text
                      style={[
                        styles.timelineSwipeHint,
                        { color: theme.textSecondary },
                      ]}
                    >
                      Swipe to review your day
                    </Text>

                    <TouchableOpacity
                      disabled={
                        deckIndex >=
                        dashboardDeck.items.length - 1
                      }
                      onPress={() => moveDeck(1)}
                      style={[
                        styles.timelineDeckNavButton,
                        {
                          borderColor: theme.border,
                          opacity:
                            deckIndex >=
                            dashboardDeck.items.length - 1
                              ? 0.35
                              : 1,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.timelineDeckNavText,
                          { color: theme.textSecondary },
                        ]}
                      >
                        Next
                      </Text>
                      <Ionicons
                        name="chevron-forward"
                        size={17}
                        color={theme.textSecondary}
                      />
                    </TouchableOpacity>
                  </View>

                  {deckManuallyMoved &&
                    dashboardDeck.focusIndex !== deckIndex && (
                      <TouchableOpacity
                        onPress={() => {
                          setDeckIndex(
                            Math.max(
                              dashboardDeck.focusIndex,
                              0
                            )
                          );
                          setDeckManuallyMoved(false);
                        }}
                        style={styles.returnToNowButton}
                      >
                        <Text
                          style={[
                            styles.returnToNowText,
                            { color: theme.primaryAccent },
                          ]}
                        >
                          Return to current / upcoming
                        </Text>
                      </TouchableOpacity>
                    )}
                </Animated.View>
              )}
            </View>

            <View style={styles.timelineStackIndicator}>
              {dashboardDeck.items.slice(0, 6).map((entry, index) => (
                <View
                  key={`dot-${entry.item.id}`}
                  style={[
                    styles.timelineStackDot,
                    {
                      width: index === deckIndex ? 18 : 6,
                      backgroundColor:
                        index === deckIndex
                          ? theme.primaryAccent
                          : theme.border,
                    },
                  ]}
                />
              ))}
            </View>
          </View>
        )}

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

  timelineCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
  },

  timelineEmpty: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 24,
  },

  timelineEmptyTitle: {
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },

  timelineEmptyText: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },

  timelineDeckSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },

  timelineDeckShell: {
    gap: 10,
  },

  timelineDeckStage: {
    minHeight: 245,
    position: 'relative',
    paddingTop: 30,
  },

  timelineStackCard: {
    position: 'absolute',
    borderWidth: 1,
    borderRadius: 20,
  },

  timelineStackBehind: {
    height: 215,
    paddingHorizontal: 16,
    paddingTop: 12,
  },

  timelineBehindTitle: {
    fontSize: 11,
    fontWeight: '800',
  },

  timelineFrontCard: {
    left: 0,
    right: 0,
    top: 0,
    minHeight: 215,
    padding: 16,
    zIndex: 10,
  },

  timelineDeckTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },

  timelineLifecycleLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.65,
  },

  timelineDeckTitle: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '900',
    marginTop: 6,
  },

  timelineDeckTime: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    marginTop: 3,
  },

  timelineDeckCheck: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },

  timelineOutcomePrompt: {
    marginTop: 14,
    borderRadius: 13,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  timelineOutcomeContent: {
    flex: 1,
    gap: 10,
  },

  timelineOutcomeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  timelineOutcomeActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },

  timelineOutcomeButton: {
    minHeight: 32,
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },

  timelineOutcomeText: {
    fontSize: 10,
    lineHeight: 15,
    fontWeight: '700',
  },

  timelineOutcomeButtonText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },

  timelineDeckFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginTop: 18,
  },

  timelineDeckNavButton: {
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },

  timelineDeckNavText: {
    fontSize: 10,
    fontWeight: '800',
  },

  timelineSwipeHint: {
    flex: 1,
    textAlign: 'center',
    fontSize: 9,
    fontWeight: '700',
  },

  returnToNowButton: {
    alignSelf: 'center',
    marginTop: 10,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },

  returnToNowText: {
    fontSize: 10,
    fontWeight: '900',
  },

  timelineStackIndicator: {
    minHeight: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },

  timelineStackDot: {
    height: 6,
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
