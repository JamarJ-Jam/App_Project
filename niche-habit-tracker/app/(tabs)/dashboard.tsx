import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/context/ThemeContext';
import { LightTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/constants/colors';

const { width } = Dimensions.get('window');

export default function DashboardScreen() {
  const { theme = LightTheme } = useTheme() || {};
  const router = useRouter();

  const [selectedPeriod, setSelectedPeriod] = useState<'Day' | 'Week' | 'Month'>('Day');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Header Bar */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: theme.textSecondary }]}>OVERVIEW</Text>
            <Text style={[styles.title, { color: theme.textPrimary }]}>Executive Hub</Text>
          </View>

          {/* Timeframe Filter */}
          <View style={[styles.filterContainer, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
            {(['Day', 'Week', 'Month'] as const).map((period) => (
              <TouchableOpacity
                key={period}
                style={[
                  styles.filterBtn,
                  selectedPeriod === period && { backgroundColor: theme.fitnessAccent },
                ]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSelectedPeriod(period);
                }}
              >
                <Text
                  style={[
                    styles.filterText,
                    { color: selectedPeriod === period ? '#FFFFFF' : theme.textSecondary },
                  ]}
                >
                  {period}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Quick Engine Metrics Grid */}
        <View style={styles.grid}>
          {/* Fitness Engine Card */}
          <TouchableOpacity
            style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/(tabs)/fitness');
            }}
          >
            <View style={styles.cardHeader}>
              <View style={[styles.iconWrapper, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}>
                <Ionicons name="fitness-outline" size={20} color={theme.fitnessAccent} />
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
            </View>
            <Text style={[styles.cardValue, { color: theme.textPrimary }]}>84%</Text>
            <Text style={[styles.cardLabel, { color: theme.textSecondary }]}>Fitness Target</Text>
          </TouchableOpacity>

          {/* Nutrition Engine Card */}
          <TouchableOpacity
            style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/(tabs)/nutrition');
            }}
          >
            <View style={styles.cardHeader}>
              <View style={[styles.iconWrapper, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
                <Ionicons name="nutrition-outline" size={20} color="#10B981" />
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
            </View>
            <Text style={[styles.cardValue, { color: theme.textPrimary }]}>2,150</Text>
            <Text style={[styles.cardLabel, { color: theme.textSecondary }]}>Kcal Consumed</Text>
          </TouchableOpacity>

          {/* Efficiency Engine Card */}
          <TouchableOpacity
            style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/(tabs)/efficiency');
            }}
          >
            <View style={styles.cardHeader}>
              <View style={[styles.iconWrapper, { backgroundColor: 'rgba(139, 92, 246, 0.1)' }]}>
                <Ionicons name="flash-outline" size={20} color="#8B5CF6" />
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
            </View>
            <Text style={[styles.cardValue, { color: theme.textPrimary }]}>6.2 hrs</Text>
            <Text style={[styles.cardLabel, { color: theme.textSecondary }]}>Deep Work</Text>
          </TouchableOpacity>

          {/* Account Status Card */}
          <TouchableOpacity
            style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/(tabs)/account');
            }}
          >
            <View style={styles.cardHeader}>
              <View style={[styles.iconWrapper, { backgroundColor: 'rgba(245, 158, 11, 0.1)' }]}>
                <Ionicons name="person-outline" size={20} color="#F59E0B" />
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
            </View>
            <Text style={[styles.cardValue, { color: theme.textPrimary }]}>Pro Tier</Text>
            <Text style={[styles.cardLabel, { color: theme.textSecondary }]}>Account Status</Text>
          </TouchableOpacity>
        </View>

        {/* AI Mascot Briefing Banner */}
        <View style={[styles.aiBanner, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
          <View style={styles.aiHeader}>
            <Ionicons name="sparkles" size={18} color={theme.fitnessAccent} />
            <Text style={[styles.aiTitle, { color: theme.textPrimary }]}>My Chawgee Briefing</Text>
          </View>
          <Text style={[styles.aiBody, { color: theme.textSecondary }]}>
            You're on track to hit your weekly fitness output. Consider increasing hydration during your next afternoon deep work session.
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingVertical: 20, gap: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  greeting: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  title: { fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  filterContainer: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1,
    padding: 3,
    gap: 2,
  },
  filterBtn: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 7 },
  filterText: { fontSize: 11, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: {
    width: (width - 52) / 2,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  iconWrapper: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cardValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  cardLabel: { fontSize: 12, fontWeight: '600' },
  aiBanner: { padding: 18, borderRadius: 16, borderWidth: 1, gap: 8 },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  aiTitle: { fontSize: 15, fontWeight: '800' },
  aiBody: { fontSize: 13, lineHeight: 18 },
});