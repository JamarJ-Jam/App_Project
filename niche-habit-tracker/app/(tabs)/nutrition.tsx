import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/context/ThemeContext';
import { LightTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/constants/colors';
import {
  MacroGoals,
  MealItem,
  loadMacroGoals,
  saveMacroGoals,
  loadTodayMealLogs,
  addMealLog,
  deleteMealLog,
} from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/src/utils/nutritionStorage';

type CategoryType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';

export default function NutritionScreen() {
  const { theme = LightTheme } = useTheme() || {};

  const [goals, setGoals] = useState<MacroGoals>({
    dailyCalories: 2200,
    proteinGrams: 160,
    carbsGrams: 220,
    fatsGrams: 70,
  });

  const [todayMeals, setTodayMeals] = useState<MealItem[]>([]);

  // Modal State: Log Meal
  const [mealModalVisible, setMealModalVisible] = useState(false);
  const [mealName, setMealName] = useState('');
  const [caloriesInput, setCaloriesInput] = useState('');
  const [proteinInput, setProteinInput] = useState('');
  const [carbsInput, setCarbsInput] = useState('');
  const [fatsInput, setFatsInput] = useState('');
  const [mealCategory, setMealCategory] = useState<CategoryType>('Lunch');

  // Modal State: Edit Macro Goals
  const [goalsModalVisible, setGoalsModalVisible] = useState(false);
  const [goalCalories, setGoalCalories] = useState('2200');
  const [goalProtein, setGoalProtein] = useState('160');
  const [goalCarbs, setGoalCarbs] = useState('220');
  const [goalFats, setGoalFats] = useState('70');

  useFocusEffect(
    useCallback(() => {
      const loadNutritionData = async () => {
        const loadedGoals = await loadMacroGoals();
        setGoals(loadedGoals);
        setGoalCalories(loadedGoals.dailyCalories.toString());
        setGoalProtein(loadedGoals.proteinGrams.toString());
        setGoalCarbs(loadedGoals.carbsGrams.toString());
        setGoalFats(loadedGoals.fatsGrams.toString());

        const loadedMeals = await loadTodayMealLogs();
        setTodayMeals(loadedMeals);
      };

      loadNutritionData();
    }, [])
  );

  // Compute Totals
  const totalCalories = todayMeals.reduce((sum, m) => sum + m.calories, 0);
  const totalProtein = todayMeals.reduce((sum, m) => sum + m.protein, 0);
  const totalCarbs = todayMeals.reduce((sum, m) => sum + m.carbs, 0);
  const totalFats = todayMeals.reduce((sum, m) => sum + m.fats, 0);

  const handleAddMeal = async () => {
    if (!mealName.trim() || !caloriesInput.trim()) {
      Alert.alert('Missing Fields', 'Please enter a meal name and calories.');
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const updated = await addMealLog({
      name: mealName.trim(),
      calories: parseInt(caloriesInput, 10) || 0,
      protein: parseInt(proteinInput, 10) || 0,
      carbs: parseInt(carbsInput, 10) || 0,
      fats: parseInt(fatsInput, 10) || 0,
      category: mealCategory,
    });

    setTodayMeals(updated);
    setMealName('');
    setCaloriesInput('');
    setProteinInput('');
    setCarbsInput('');
    setFatsInput('');
    setMealModalVisible(false);
  };

  const handleDeleteMeal = async (mealId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const updated = await deleteMealLog(mealId);
    setTodayMeals(updated);
  };

  const handleSaveGoals = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const newGoals: MacroGoals = {
      dailyCalories: parseInt(goalCalories, 10) || 2000,
      proteinGrams: parseInt(goalProtein, 10) || 150,
      carbsGrams: parseInt(goalCarbs, 10) || 200,
      fatsGrams: parseInt(goalFats, 10) || 65,
    };

    await saveMacroGoals(newGoals);
    setGoals(newGoals);
    setGoalsModalVisible(false);
  };

  const renderProgressBar = (current: number, target: number, color: string) => {
    const percent = Math.min(100, Math.round((current / (target || 1)) * 100));
    return (
      <View style={[styles.progressTrack, { backgroundColor: theme.isDark ? '#334155' : '#E2E8F0' }]}>
        <View style={[styles.progressFill, { width: `${percent}%`, backgroundColor: color }]} />
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Header */}
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.subtitle, { color: theme.fitnessAccent }]}>NUTRITION & MACROS</Text>
            <Text style={[styles.title, { color: theme.textPrimary }]}>Daily Fuel</Text>
          </View>
          <TouchableOpacity
            style={[styles.editGoalsBtn, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}
            onPress={() => setGoalsModalVisible(true)}
          >
            <Ionicons name="settings-outline" size={16} color={theme.textPrimary} style={{ marginRight: 4 }} />
            <Text style={[styles.editGoalsText, { color: theme.textPrimary }]}>Goals</Text>
          </TouchableOpacity>
        </View>

        {/* Calorie & Macro Progress Card */}
        <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border, marginBottom: 16 }]}>
          <View style={styles.calorieHeader}>
            <View>
              <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>Calories Consumed</Text>
              <Text style={[styles.calorieValue, { color: theme.textPrimary }]}>
                {totalCalories} <Text style={{ fontSize: 14, color: theme.textSecondary }}>/ {goals.dailyCalories} kcal</Text>
              </Text>
            </View>
            <Text
              style={[
                styles.calorieRemaining,
                { color: goals.dailyCalories - totalCalories >= 0 ? '#10B981' : '#EF4444' },
              ]}
            >
              {goals.dailyCalories - totalCalories >= 0
                ? `${goals.dailyCalories - totalCalories} left`
                : `${Math.abs(goals.dailyCalories - totalCalories)} over`}
            </Text>
          </View>

          {renderProgressBar(totalCalories, goals.dailyCalories, theme.fitnessAccent)}

          {/* Individual Macro Breakdown Bars */}
          <View style={styles.macroGrid}>
            <View style={styles.macroBox}>
              <View style={styles.macroLabelRow}>
                <Text style={[styles.macroName, { color: theme.textSecondary }]}>Protein</Text>
                <Text style={[styles.macroStat, { color: theme.textPrimary }]}>
                  {totalProtein}g / {goals.proteinGrams}g
                </Text>
              </View>
              {renderProgressBar(totalProtein, goals.proteinGrams, '#3B82F6')}
            </View>

            <View style={styles.macroBox}>
              <View style={styles.macroLabelRow}>
                <Text style={[styles.macroName, { color: theme.textSecondary }]}>Carbs</Text>
                <Text style={[styles.macroStat, { color: theme.textPrimary }]}>
                  {totalCarbs}g / {goals.carbsGrams}g
                </Text>
              </View>
              {renderProgressBar(totalCarbs, goals.carbsGrams, '#F59E0B')}
            </View>

            <View style={styles.macroBox}>
              <View style={styles.macroLabelRow}>
                <Text style={[styles.macroName, { color: theme.textSecondary }]}>Fats</Text>
                <Text style={[styles.macroStat, { color: theme.textPrimary }]}>
                  {totalFats}g / {goals.fatsGrams}g
                </Text>
              </View>
              {renderProgressBar(totalFats, goals.fatsGrams, '#10B981')}
            </View>
          </View>
        </View>

        {/* Action Header & Log Meal Button */}
        <View style={styles.actionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Today's Logs ({todayMeals.length})</Text>
          <TouchableOpacity
            style={[styles.addMealBtn, { backgroundColor: theme.fitnessAccent }]}
            onPress={() => setMealModalVisible(true)}
          >
            <Text style={styles.addMealBtnText}>+ Log Meal</Text>
          </TouchableOpacity>
        </View>

        {/* Meal Logs List */}
        {todayMeals.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
            <Ionicons name="restaurant-outline" size={28} color={theme.textSecondary} style={{ marginBottom: 6 }} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No meals logged today.</Text>
            <Text style={[styles.emptySub, { color: theme.textSecondary }]}>Tap "+ Log Meal" to record calories and macronutrients.</Text>
          </View>
        ) : (
          todayMeals.map((meal) => (
            <View key={meal.id} style={[styles.mealCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
              <View style={styles.mealHeader}>
                <View>
                  <Text style={[styles.mealTitle, { color: theme.textPrimary }]}>{meal.name}</Text>
                  <Text style={[styles.mealCategory, { color: theme.fitnessAccent }]}>{meal.category}</Text>
                </View>
                <TouchableOpacity onPress={() => handleDeleteMeal(meal.id)}>
                  <Ionicons name="trash-outline" size={18} color="#EF4444" />
                </TouchableOpacity>
              </View>

              <View style={styles.mealStatsRow}>
                <Text style={[styles.mealStatText, { color: theme.textPrimary }]}>{meal.calories} kcal</Text>
                <Text style={[styles.mealStatSub, { color: theme.textSecondary }]}>
                  P: {meal.protein}g • C: {meal.carbs}g • F: {meal.fats}g
                </Text>
              </View>
            </View>
          ))
        )}

      </ScrollView>

      {/* MODAL: LOG MEAL */}
      <Modal visible={mealModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.cardBackground }]}>
            <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Log Meal</Text>

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Meal Name</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
              placeholder="e.g. Grilled Chicken Breast & Rice"
              placeholderTextColor={theme.textSecondary}
              value={mealName}
              onChangeText={setMealName}
            />

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Category</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
              {(['Breakfast', 'Lunch', 'Dinner', 'Snack'] as CategoryType[]).map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.chipBtn,
                    { backgroundColor: mealCategory === cat ? theme.fitnessAccent : theme.isDark ? '#2A2A2A' : '#E2E8F0' },
                  ]}
                  onPress={() => setMealCategory(cat)}
                >
                  <Text style={{ color: mealCategory === cat ? '#FFF' : theme.textPrimary, fontWeight: '700', fontSize: 11 }}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.gridRow}>
              <View style={{ width: '48%' }}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Calories (kcal)</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
                  keyboardType="numeric"
                  placeholder="550"
                  placeholderTextColor={theme.textSecondary}
                  value={caloriesInput}
                  onChangeText={setCaloriesInput}
                />
              </View>

              <View style={{ width: '48%' }}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Protein (g)</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
                  keyboardType="numeric"
                  placeholder="40"
                  placeholderTextColor={theme.textSecondary}
                  value={proteinInput}
                  onChangeText={setProteinInput}
                />
              </View>
            </View>

            <View style={styles.gridRow}>
              <View style={{ width: '48%' }}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Carbs (g)</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
                  keyboardType="numeric"
                  placeholder="50"
                  placeholderTextColor={theme.textSecondary}
                  value={carbsInput}
                  onChangeText={setCarbsInput}
                />
              </View>

              <View style={{ width: '48%' }}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Fats (g)</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
                  keyboardType="numeric"
                  placeholder="12"
                  placeholderTextColor={theme.textSecondary}
                  value={fatsInput}
                  onChangeText={setFatsInput}
                />
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: theme.border }]} onPress={() => setMealModalVisible(false)}>
                <Text style={{ color: theme.textPrimary, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: theme.fitnessAccent }]} onPress={handleAddMeal}>
                <Text style={{ color: '#FFF', fontWeight: '700' }}>Add Meal</Text>
              </TouchableOpacity>
            </View>

          </View>
        </View>
      </Modal>

      {/* MODAL: EDIT MACRO GOALS */}
      <Modal visible={goalsModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.cardBackground }]}>
            <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Edit Daily Target Goals</Text>

            <View style={styles.gridRow}>
              <View style={{ width: '48%' }}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Daily Calories</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
                  keyboardType="numeric"
                  value={goalCalories}
                  onChangeText={setGoalCalories}
                />
              </View>
              <View style={{ width: '48%' }}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Target Protein (g)</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
                  keyboardType="numeric"
                  value={goalProtein}
                  onChangeText={setGoalProtein}
                />
              </View>
            </View>

            <View style={styles.gridRow}>
              <View style={{ width: '48%' }}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Target Carbs (g)</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
                  keyboardType="numeric"
                  value={goalCarbs}
                  onChangeText={setGoalCarbs}
                />
              </View>
              <View style={{ width: '48%' }}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Target Fats (g)</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: theme.isDark ? '#2A2A2A' : '#F1F5F9', color: theme.textPrimary }]}
                  keyboardType="numeric"
                  value={goalFats}
                  onChangeText={setGoalFats}
                />
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: theme.border }]} onPress={() => setGoalsModalVisible(false)}>
                <Text style={{ color: theme.textPrimary, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: theme.fitnessAccent }]} onPress={handleSaveGoals}>
                <Text style={{ color: '#FFF', fontWeight: '700' }}>Save Goals</Text>
              </TouchableOpacity>
            </View>

          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  subtitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 2 },
  title: { fontSize: 26, fontWeight: '800' },
  editGoalsBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  editGoalsText: { fontSize: 12, fontWeight: '700' },
  card: { padding: 16, borderRadius: 14, borderWidth: 1 },
  cardTitle: { fontSize: 14, fontWeight: '700' },
  calorieHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  calorieValue: { fontSize: 22, fontWeight: '800', marginTop: 2 },
  calorieRemaining: { fontSize: 13, fontWeight: '800' },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden', width: '100%' },
  progressFill: { height: '100%', borderRadius: 4 },
  macroGrid: { marginTop: 14, gap: 10 },
  macroBox: {},
  macroLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  macroName: { fontSize: 11, fontWeight: '600' },
  macroStat: { fontSize: 11, fontWeight: '700' },
  actionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  addMealBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  addMealBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
  emptyCard: { padding: 24, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  emptyText: { fontWeight: '700', fontSize: 14, marginBottom: 2 },
  emptySub: { fontSize: 11, textAlign: 'center' },
  mealCard: { padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
  mealHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  mealTitle: { fontSize: 14, fontWeight: '700' },
  mealCategory: { fontSize: 11, fontWeight: '600' },
  mealStatsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  mealStatText: { fontSize: 13, fontWeight: '800' },
  mealStatSub: { fontSize: 11, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { padding: 20, borderRadius: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 14 },
  inputLabel: { fontSize: 11, fontWeight: '700', marginBottom: 4 },
  modalInput: { padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 10 },
  gridRow: { flexDirection: 'row', justifyContent: 'space-between' },
  chipBtn: { flex: 1, paddingVertical: 8, borderRadius: 6, alignItems: 'center' },
  modalActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 8 },
  modalBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
});