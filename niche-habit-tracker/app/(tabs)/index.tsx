import React, { useState } from 'react';
import { StyleSheet, Text, View, ScrollView, SafeAreaView, TouchableOpacity, Dimensions } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import {
  calculateBMI,
  getBMICategory,
  initialProfile,
  initialFitness,
  initialEfficiency,
} from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/src/analytics.ts';

const screenWidth = Dimensions.get('window').width - 32;

export default function HomeScreen() {
  const [profile] = useState(initialProfile);
  const [fitness] = useState(initialFitness);
  const [efficiency] = useState(initialEfficiency);

  const bmi = calculateBMI(profile.weightKg, profile.heightCm);
  const bmiCategory = getBMICategory(bmi);
  const overallScore = Math.round((efficiency.weeklyCompletionRate + (fitness.workoutsCompleted / 7) * 100) / 2);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header & Overall Score */}
        <View style={styles.header}>
          <Text style={styles.headerSubtitle}>MY ACCOUNTABILITY</Text>
          <Text style={styles.headerTitle}>Assistant Overview</Text>
        </View>

        <View style={styles.scoreCard}>
          <View style={styles.scoreHeader}>
            <Text style={styles.scoreTitle}>Accountability Score</Text>
            <Text style={styles.scoreBadge}>+{efficiency.wowGrowthPercent}% WOW</Text>
          </View>
          <Text style={styles.scoreNumber}>{overallScore}%</Text>
          <View style={styles.progressBarBackground}>
            <View style={[styles.progressBarFill, { width: `${overallScore}%` }]} />
          </View>
        </View>

        {/* Smart Assistant Insight Banner */}
        <View style={styles.insightCard}>
          <Text style={styles.insightTag}>💡 Smart Assistant</Text>
          <Text style={styles.insightText}>
            You have an open 45-min gap today at 3:00 PM. Perfect time to log your 20-minute Squats & Push-ups routine!
          </Text>
        </View>

        {/* Twin Pillar Cards Grid */}
        <View style={styles.pillarGrid}>
          {/* Efficiency Pillar */}
          <View style={styles.pillarCard}>
            <Text style={styles.pillarTitle}>📊 Efficiency</Text>
            <Text style={styles.pillarMainStat}>{efficiency.weeklyCompletionRate}%</Text>
            <Text style={styles.pillarSubtext}>
              {efficiency.tasksCompleted}/{efficiency.totalTasks} Tasks Done
            </Text>
            <Text style={styles.trendText}>📈 +{efficiency.wowGrowthPercent}% WOW Growth</Text>
          </View>

          {/* Fitness Pillar */}
          <View style={styles.pillarCard}>
            <Text style={styles.pillarTitle}>🏋️ Fitness</Text>
            <Text style={styles.pillarMainStat}>{fitness.workoutsCompleted} Days</Text>
            <Text style={styles.pillarSubtext}>~{fitness.caloriesBurned} kcal burned</Text>
            <Text style={styles.trendText}>BMI: {bmi} ({bmiCategory})</Text>
          </View>
        </View>

        {/* WOW Efficiency Chart */}
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Weekly Efficiency Trend (WOW)</Text>
          <LineChart
            data={{
              labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
              datasets: [{ data: [65, 70, 80, 75, 85, 90, 82] }],
            }}
            width={screenWidth - 32}
            height={180}
            yAxisSuffix="%"
            chartConfig={{
              backgroundColor: '#1E1E1E',
              backgroundGradientFrom: '#1E1E1E',
              backgroundGradientTo: '#1E1E1E',
              decimalPlaces: 0,
              color: (opacity = 1) => `rgba(76, 175, 80, ${opacity})`,
              labelColor: (opacity = 1) => `rgba(170, 170, 170, ${opacity})`,
              style: { borderRadius: 12 },
              propsForDots: { r: '4', strokeWidth: '2', stroke: '#4CAF50' },
            }}
            bezier
            style={{ marginVertical: 8, borderRadius: 12 }}
          />
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionButton}>
            <Text style={styles.actionText}>+ Workout</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton}>
            <Text style={styles.actionText}>+ Task</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton}>
            <Text style={styles.actionText}>⚖️ Weight</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  scrollContent: { padding: 16 },
  header: { marginBottom: 16 },
  headerSubtitle: { color: '#4CAF50', fontSize: 12, fontWeight: 'bold', letterSpacing: 1 },
  headerTitle: { color: '#FFF', fontSize: 24, fontWeight: 'bold' },
  scoreCard: { backgroundColor: '#1E1E1E', padding: 16, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: '#2A2A2A' },
  scoreHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scoreTitle: { color: '#AAA', fontSize: 14 },
  scoreBadge: { color: '#4CAF50', backgroundColor: '#1E2E20', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, fontSize: 12, fontWeight: 'bold' },
  scoreNumber: { color: '#FFF', fontSize: 36, fontWeight: 'bold', marginVertical: 8 },
  progressBarBackground: { height: 8, backgroundColor: '#2A2A2A', borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#4CAF50' },
  insightCard: { backgroundColor: '#1E2638', padding: 14, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: '#2196F3' },
  insightTag: { color: '#2196F3', fontSize: 12, fontWeight: 'bold', marginBottom: 4 },
  insightText: { color: '#DDD', fontSize: 13, lineHeight: 18 },
  pillarGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  pillarCard: { flex: 0.48, backgroundColor: '#1E1E1E', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#2A2A2A' },
  pillarTitle: { color: '#AAA', fontSize: 12, fontWeight: 'bold' },
  pillarMainStat: { color: '#FFF', fontSize: 22, fontWeight: 'bold', marginVertical: 6 },
  pillarSubtext: { color: '#888', fontSize: 12 },
  trendText: { color: '#4CAF50', fontSize: 11, fontWeight: '600', marginTop: 8 },
  chartCard: { backgroundColor: '#1E1E1E', padding: 16, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: '#2A2A2A' },
  chartTitle: { color: '#AAA', fontSize: 12, fontWeight: 'bold', marginBottom: 8 },
  sectionTitle: { color: '#FFF', fontSize: 16, fontWeight: 'bold', marginBottom: 12 },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between' },
  actionButton: { flex: 0.31, backgroundColor: '#2A2A2A', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  actionText: { color: '#FFF', fontWeight: '600', fontSize: 13 },
});