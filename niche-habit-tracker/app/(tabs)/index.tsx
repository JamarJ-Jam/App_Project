import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  Switch,
  Dimensions,
} from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { useTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/context/ThemeContext';

export default function HomeScreen() {
  const { theme, toggleTheme } = useTheme();

  // Mock initial state for dashboard indicators
  const [efficiency] = useState({
    weeklyCompletionRate: 85,
    tasksCompleted: 17,
    totalTasks: 20,
    wowGrowthPercent: 12, // Positive = ▲ Green, Negative = ▼ Red
  });

  const [fitness] = useState({
    workoutsCompleted: 5,
    projectedWeightLbs: 168,
    currentBmi: 23.4,
  });

  const overallScore = Math.round(
    (efficiency.weeklyCompletionRate + (fitness.workoutsCompleted / 7) * 100) / 2
  );

  const isMoreProductive = efficiency.wowGrowthPercent >= 0;
  const arrowSymbol = isMoreProductive ? '▲' : '▼';
  const arrowColor = isMoreProductive ? '#059669' : '#DC2626';

  const screenWidth = Dimensions.get('window').width - 32;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header with Dark Mode Toggle Switch */}
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.headerSubtitle, { color: theme.fitnessAccent }]}>
              MY ACCOUNTABILITY
            </Text>
            <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>
              Assistant Overview
            </Text>
          </View>

          <View style={styles.toggleContainer}>
            <Text style={styles.toggleEmoji}>{theme.isDark ? '🌙' : '☀️'}</Text>
            <Switch
              value={theme.isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: '#CBD5E1', true: '#334155' }}
              thumbColor={theme.isDark ? '#3B82F6' : '#FFFFFF'}
            />
          </View>
        </View>

        {/* Overall Score Card */}
        <View style={[styles.scoreCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
          <View style={styles.scoreHeader}>
            <Text style={[styles.scoreTitle, { color: theme.textSecondary }]}>Weekly Score</Text>
            <Text style={[styles.scoreBadge, { color: theme.fitnessAccent, backgroundColor: theme.isDark ? '#064E3B' : '#ECFDF5' }]}>
              EXCELLENT
            </Text>
          </View>
          <Text style={[styles.scoreNumber, { color: theme.textPrimary }]}>{overallScore}%</Text>
          <View style={styles.progressBarBackground}>
            <View style={[styles.progressBarFill, { width: `${overallScore}%`, backgroundColor: theme.fitnessAccent }]} />
          </View>
        </View>

        {/* Twin Pillar Cards Grid */}
        <View style={styles.pillarGrid}>
          {/* Fitness Pillar */}
          <View style={[styles.pillarCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
            <Text style={[styles.pillarTitle, { color: theme.textSecondary }]}>🏋️ Fitness</Text>
            <Text style={[styles.pillarMainStat, { color: theme.textPrimary }]}>{fitness.workoutsCompleted}/7</Text>
            <Text style={[styles.pillarSubtext, { color: theme.textSecondary }]}>
              Sessions Finished
            </Text>
            <Text style={[styles.pillarSubtext, { color: theme.textSecondary, marginTop: 4 }]}>
              BMI: {fitness.currentBmi}
            </Text>
          </View>

          {/* Efficiency Pillar */}
          <View style={[styles.pillarCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
            <Text style={[styles.pillarTitle, { color: theme.textSecondary }]}>📊 Efficiency</Text>
            <Text style={[styles.pillarMainStat, { color: theme.textPrimary }]}>{efficiency.weeklyCompletionRate}%</Text>
            <Text style={[styles.pillarSubtext, { color: theme.textSecondary }]}>
              {efficiency.tasksCompleted}/{efficiency.totalTasks} Tasks Done
            </Text>

            {/* WOW Arrow Indicator */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
              <Text style={{ color: arrowColor, fontSize: 13, fontWeight: 'bold', marginRight: 4 }}>
                {arrowSymbol} {Math.abs(efficiency.wowGrowthPercent)}%
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 11 }}>vs last week</Text>
            </View>
          </View>
        </View>

        {/* WOW Chart Card */}
        <View style={[styles.chartCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
          <Text style={[styles.chartTitle, { color: theme.textSecondary }]}>WEEK-OVER-WEEK PERFORMANCE</Text>
          <LineChart
            data={{
              labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
              datasets: [{ data: [65, 70, 80, 75, 90, 85, 92] }],
            }}
            width={screenWidth - 32}
            height={180}
            chartConfig={{
              backgroundColor: theme.cardBackground,
              backgroundGradientFrom: theme.cardBackground,
              backgroundGradientTo: theme.cardBackground,
              decimalPlaces: 0,
              color: (opacity = 1) =>
                theme.isDark ? `rgba(59, 130, 246, ${opacity})` : `rgba(37, 99, 235, ${opacity})`,
              labelColor: (opacity = 1) =>
                theme.isDark ? `rgba(170, 170, 170, ${opacity})` : `rgba(100, 116, 139, ${opacity})`,
              propsForDots: { r: '4', strokeWidth: '2', stroke: theme.primaryAccent },
            }}
            bezier
            style={{ borderRadius: 8, marginTop: 8 }}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  headerSubtitle: { fontSize: 12, fontWeight: 'bold', letterSpacing: 1 },
  headerTitle: { fontSize: 24, fontWeight: 'bold' },
  toggleContainer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  toggleEmoji: { fontSize: 16 },
  scoreCard: { padding: 16, borderRadius: 12, marginBottom: 16, borderWidth: 1 },
  scoreHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scoreTitle: { fontSize: 14, fontWeight: '600' },
  scoreBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, fontSize: 12, fontWeight: 'bold' },
  scoreNumber: { fontSize: 36, fontWeight: 'bold', marginVertical: 8 },
  progressBarBackground: { height: 8, backgroundColor: '#E2E8F0', borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 4 },
  pillarGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  pillarCard: { flex: 0.48, padding: 14, borderRadius: 12, borderWidth: 1 },
  pillarTitle: { fontSize: 12, fontWeight: 'bold' },
  pillarMainStat: { fontSize: 22, fontWeight: 'bold', marginVertical: 6 },
  pillarSubtext: { fontSize: 12 },
  chartCard: { padding: 16, borderRadius: 12, marginBottom: 16, borderWidth: 1 },
  chartTitle: { fontSize: 12, fontWeight: 'bold', marginBottom: 4 },
});