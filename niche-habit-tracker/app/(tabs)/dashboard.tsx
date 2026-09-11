import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  Dimensions,
  Modal,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/context/ThemeContext';
import { LightTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/constants/colors';

const { width } = Dimensions.get('window');

type MetricType = 'fitness' | 'nutrition' | 'efficiency' | null;

export default function DashboardScreen() {
  const { theme = LightTheme } = useTheme() || {};
  const [selectedPeriod, setSelectedPeriod] = useState<'Day' | 'Week' | 'Month'>('Day');
  const [activeModal, setActiveModal] = useState<MetricType>(null);

  const openBreakoutModal = (metric: MetricType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActiveModal(metric);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Header Bar */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: theme.textSecondary }]}>PROGRESS REPORTS & AI</Text>
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

        {/* AI Mascot Interaction Card */}
        <View style={[styles.aiBanner, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
          <View style={styles.aiHeader}>
            <Ionicons name="sparkles" size={18} color={theme.fitnessAccent} />
            <Text style={[styles.aiTitle, { color: theme.textPrimary }]}>AI Chawgee Insight</Text>
          </View>
          <Text style={[styles.aiBody, { color: theme.textSecondary }]}>
            Your fitness score is up 12% today! To reach 100%, consider adding 1,120 steps or logging your planned evening stretch routine.
          </Text>
        </View>

        {/* Progress Metrics Grid */}
        <Text style={[styles.sectionHeading, { color: theme.textSecondary }]}>METRIC BREAKDOWNS (TAP TO INSPECT)</Text>
        
        <View style={styles.grid}>
          {/* Fitness Engine Card */}
          <TouchableOpacity
            style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}
            onPress={() => openBreakoutModal('fitness')}
          >
            <View style={styles.cardHeader}>
              <View style={[styles.iconWrapper, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}>
                <Ionicons name="fitness-outline" size={20} color={theme.fitnessAccent} />
              </View>
              <Ionicons name="analytics-outline" size={16} color={theme.textSecondary} />
            </View>
            <Text style={[styles.cardValue, { color: theme.textPrimary }]}>84%</Text>
            <Text style={[styles.cardLabel, { color: theme.textSecondary }]}>Fitness Target</Text>
          </TouchableOpacity>

          {/* Nutrition Engine Card */}
          <TouchableOpacity
            style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}
            onPress={() => openBreakoutModal('nutrition')}
          >
            <View style={styles.cardHeader}>
              <View style={[styles.iconWrapper, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
                <Ionicons name="nutrition-outline" size={20} color="#10B981" />
              </View>
              <Ionicons name="analytics-outline" size={16} color={theme.textSecondary} />
            </View>
            <Text style={[styles.cardValue, { color: theme.textPrimary }]}>2,150</Text>
            <Text style={[styles.cardLabel, { color: theme.textSecondary }]}>Kcal Consumed</Text>
          </TouchableOpacity>

          {/* Efficiency Engine Card */}
          <TouchableOpacity
            style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}
            onPress={() => openBreakoutModal('efficiency')}
          >
            <View style={styles.cardHeader}>
              <View style={[styles.iconWrapper, { backgroundColor: 'rgba(139, 92, 246, 0.1)' }]}>
                <Ionicons name="flash-outline" size={20} color="#8B5CF6" />
              </View>
              <Ionicons name="analytics-outline" size={16} color={theme.textSecondary} />
            </View>
            <Text style={[styles.cardValue, { color: theme.textPrimary }]}>6.2 hrs</Text>
            <Text style={[styles.cardLabel, { color: theme.textSecondary }]}>Deep Work</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>

      {/* Metric Detail Breakout Modal */}
      <Modal visible={activeModal !== null} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.cardBackground }]}>
            
            {activeModal === 'fitness' && (
              <>
                <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Fitness Target Composition (84%)</Text>
                <View style={styles.breakoutRow}>
                  <Text style={[styles.breakoutLabel, { color: theme.textSecondary }]}>Steps Progress (5,880 / 7,000)</Text>
                  <Text style={[styles.breakoutVal, { color: theme.fitnessAccent }]}>84%</Text>
                </View>
                <View style={styles.breakoutRow}>
                  <Text style={[styles.breakoutLabel, { color: theme.textSecondary }]}>Workout Consistency</Text>
                  <Text style={[styles.breakoutVal, { color: theme.fitnessAccent }]}>100%</Text>
                </View>
                <View style={styles.breakoutRow}>
                  <Text style={[styles.breakoutLabel, { color: theme.textSecondary }]}>Active Calorie Output</Text>
                  <Text style={[styles.breakoutVal, { color: theme.fitnessAccent }]}>680 kcal</Text>
                </View>
              </>
            )}

            {activeModal === 'nutrition' && (
              <>
                <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Nutrition Target (2,150 Kcal)</Text>
                <View style={styles.breakoutRow}>
                  <Text style={[styles.breakoutLabel, { color: theme.textSecondary }]}>Target Daily Limit</Text>
                  <Text style={[styles.breakoutVal, { color: '#10B981' }]}>2,450 kcal</Text>
                </View>
                <View style={styles.breakoutRow}>
                  <Text style={[styles.breakoutLabel, { color: theme.textSecondary }]}>Remaining Calories</Text>
                  <Text style={[styles.breakoutVal, { color: '#10B981' }]}>300 kcal</Text>
                </View>
              </>
            )}

            {activeModal === 'efficiency' && (
              <>
                <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Deep Work Composition (6.2 hrs)</Text>
                <View style={styles.breakoutRow}>
                  <Text style={[styles.breakoutLabel, { color: theme.textSecondary }]}>Focus Goal Target</Text>
                  <Text style={[styles.breakoutVal, { color: '#8B5CF6' }]}>6.0 hrs / day</Text>
                </View>
                <View style={styles.breakoutRow}>
                  <Text style={[styles.breakoutLabel, { color: theme.textSecondary }]}>Schedule Alignment</Text>
                  <Text style={[styles.breakoutVal, { color: '#8B5CF6' }]}>103% Goal Met</Text>
                </View>
              </>
            )}

            <TouchableOpacity
              style={[styles.closeModalBtn, { backgroundColor: theme.fitnessAccent }]}
              onPress={() => setActiveModal(null)}
            >
              <Text style={styles.closeModalText}>Close Breakdown</Text>
            </TouchableOpacity>

          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingVertical: 20, gap: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  greeting: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  title: { fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  filterContainer: { flexDirection: 'row', borderRadius: 10, borderWidth: 1, padding: 3, gap: 2 },
  filterBtn: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 7 },
  filterText: { fontSize: 11, fontWeight: '700' },
  aiBanner: { padding: 18, borderRadius: 16, borderWidth: 1, gap: 8 },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  aiTitle: { fontSize: 15, fontWeight: '800' },
  aiBody: { fontSize: 13, lineHeight: 18 },
  sectionHeading: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { width: (width - 52) / 2, padding: 16, borderRadius: 16, borderWidth: 1, gap: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  iconWrapper: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cardValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  cardLabel: { fontSize: 12, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { padding: 20, borderRadius: 16, gap: 14 },
  modalTitle: { fontSize: 16, fontWeight: '800' },
  breakoutRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  breakoutLabel: { fontSize: 13, fontWeight: '600' },
  breakoutVal: { fontSize: 13, fontWeight: '800' },
  closeModalBtn: { height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  closeModalText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
});