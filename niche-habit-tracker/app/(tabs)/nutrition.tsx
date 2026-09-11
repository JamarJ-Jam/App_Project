import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  Modal,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/context/ThemeContext';
import { LightTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/constants/colors';

type MealCategory = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snacks';

interface MealItem {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  category: MealCategory;
  imageUri?: string;
}

export default function NutritionScreen() {
  const { theme = LightTheme } = useTheme() || {};

  // Daily Targets
  const targetCalories = 2450;
  const targetProtein = 180;
  const targetCarbs = 250;
  const targetFats = 70;

  // Meal Logs State
  const [loggedMeals, setLoggedMeals] = useState<MealItem[]>([
    {
      id: '1',
      name: 'Oatmeal & Whey Protein',
      calories: 450,
      protein: 35,
      carbs: 55,
      fats: 8,
      category: 'Breakfast',
    },
    {
      id: '2',
      name: 'Grilled Chicken & Brown Rice',
      calories: 650,
      protein: 52,
      carbs: 65,
      fats: 12,
      category: 'Lunch',
    },
  ]);

  // Modal & Form State
  const [modalVisible, setModalVisible] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [activeCategory, setActiveCategory] = useState<MealCategory>('Breakfast');
  
  const [itemName, setItemName] = useState('');
  const [itemCalories, setItemCalories] = useState('');
  const [itemProtein, setItemProtein] = useState('');
  const [itemCarbs, setItemCarbs] = useState('');
  const [itemFats, setItemFats] = useState('');
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);

  // Aggregated Totals
  const totalCaloriesLogged = loggedMeals.reduce((sum, item) => sum + item.calories, 0);
  const totalProteinLogged = loggedMeals.reduce((sum, item) => sum + item.protein, 0);
  const totalCarbsLogged = loggedMeals.reduce((sum, item) => sum + item.carbs, 0);
  const totalFatsLogged = loggedMeals.reduce((sum, item) => sum + item.fats, 0);

  const remainingCalories = Math.max(0, targetCalories - totalCaloriesLogged);
  const calorieProgressPercent = Math.min((totalCaloriesLogged / targetCalories) * 100, 100);

  const openAddModal = (category: MealCategory) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveCategory(category);
    setItemName('');
    setItemCalories('');
    setItemProtein('');
    setItemCarbs('');
    setItemFats('');
    setSelectedImageUri(null);
    setModalVisible(true);
  };

  // Image Picker Logic (Camera or Photo Roll)
  const handlePickImage = async (useCamera: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    let permissionResult;
    if (useCamera) {
      permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    } else {
      permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    }

    if (!permissionResult.granted) {
      Alert.alert('Permission Denied', 'Camera or Photo library access is required to scan meals.');
      return;
    }

    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, quality: 0.8 });

    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      setSelectedImageUri(uri);
      simulateVisionAiAnalysis(uri);
    }
  };

  // Simulated Vision AI Scan Processing
  const simulateVisionAiAnalysis = (uri: string) => {
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setItemName('Scanned Meal (Salmon & Quinoa Bowl)');
      setItemCalories('580');
      setItemProtein('42');
      setItemCarbs('48');
      setItemFats('20');
    }, 1800);
  };

  const handleAddMeal = () => {
    if (!itemName.trim() || !itemCalories.trim()) {
      Alert.alert('Input Error', 'Please enter an item name and calorie amount.');
      return;
    }

    const calNum = parseInt(itemCalories.trim(), 10) || 0;
    const proNum = parseInt(itemProtein.trim(), 10) || 0;
    const carbNum = parseInt(itemCarbs.trim(), 10) || 0;
    const fatNum = parseInt(itemFats.trim(), 10) || 0;

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const newMeal: MealItem = {
      id: Date.now().toString(),
      name: itemName.trim(),
      calories: calNum,
      protein: proNum,
      carbs: carbNum,
      fats: fatNum,
      category: activeCategory,
      imageUri: selectedImageUri || undefined,
    };

    setLoggedMeals([...loggedMeals, newMeal]);
    setModalVisible(false);
  };

  const handleRemoveMeal = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoggedMeals(loggedMeals.filter((meal) => meal.id !== id));
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.subtitle, { color: '#10B981' }]}>ENGINE 02</Text>
          <Text style={[styles.title, { color: theme.textPrimary }]}>Nutrition Output</Text>
        </View>

        {/* Calorie & Macro Target Card */}
        <View style={[styles.summaryCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
          <View style={styles.summaryHeader}>
            <View style={styles.headerLeft}>
              <View style={[styles.iconFrame, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
                <Ionicons name="nutrition-outline" size={20} color="#10B981" />
              </View>
              <View>
                <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>Calorie Budget</Text>
                <Text style={[styles.cardMeta, { color: theme.textSecondary }]}>
                  {totalCaloriesLogged.toLocaleString()} / {targetCalories.toLocaleString()} kcal
                </Text>
              </View>
            </View>
            <Text style={[styles.progressPercent, { color: '#10B981' }]}>
              {calorieProgressPercent.toFixed(0)}%
            </Text>
          </View>

          {/* Progress Bar */}
          <View style={[styles.progressBarTrack, { backgroundColor: theme.border }]}>
            <View style={[styles.progressBarFill, { backgroundColor: '#10B981', width: `${calorieProgressPercent}%` }]} />
          </View>

          {/* Macro Breakdown Rows */}
          <View style={styles.macroGrid}>
            <View style={styles.macroItem}>
              <Text style={[styles.macroVal, { color: theme.textPrimary }]}>{totalProteinLogged}g</Text>
              <Text style={[styles.macroLabel, { color: theme.textSecondary }]}>Protein / {targetProtein}g</Text>
            </View>
            <View style={[styles.macroDivider, { backgroundColor: theme.border }]} />
            <View style={styles.macroItem}>
              <Text style={[styles.macroVal, { color: theme.textPrimary }]}>{totalCarbsLogged}g</Text>
              <Text style={[styles.macroLabel, { color: theme.textSecondary }]}>Carbs / {targetCarbs}g</Text>
            </View>
            <View style={[styles.macroDivider, { backgroundColor: theme.border }]} />
            <View style={styles.macroItem}>
              <Text style={[styles.macroVal, { color: theme.textPrimary }]}>{totalFatsLogged}g</Text>
              <Text style={[styles.macroLabel, { color: theme.textSecondary }]}>Fats / {targetFats}g</Text>
            </View>
          </View>
        </View>

        {/* Meal Logs Header */}
        <Text style={[styles.sectionHeading, { color: theme.textSecondary }]}>MEAL LOGS & VISION CAPTURE</Text>

        {(['Breakfast', 'Lunch', 'Dinner', 'Snacks'] as MealCategory[]).map((category) => {
          const categoryMeals = loggedMeals.filter((m) => m.category === category);
          const categoryTotal = categoryMeals.reduce((sum, m) => sum + m.calories, 0);

          return (
            <View key={category} style={[styles.mealCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
              <View style={styles.mealCardHeader}>
                <View>
                  <Text style={[styles.mealCategoryTitle, { color: theme.textPrimary }]}>{category}</Text>
                  <Text style={[styles.mealCategoryTotal, { color: theme.textSecondary }]}>{categoryTotal} kcal</Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity
                    style={[styles.addBtn, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}
                    onPress={() => openAddModal(category)}
                  >
                    <Ionicons name="add" size={16} color="#10B981" />
                    <Text style={[styles.addBtnText, { color: '#10B981' }]}>Log</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {categoryMeals.length === 0 ? (
                <Text style={[styles.emptyCategoryText, { color: theme.textSecondary }]}>No items logged yet.</Text>
              ) : (
                <View style={styles.mealList}>
                  {categoryMeals.map((meal) => (
                    <View key={meal.id} style={[styles.mealItemRow, { borderTopColor: theme.border }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                        {meal.imageUri ? (
                          <Image source={{ uri: meal.imageUri }} style={styles.mealThumb} />
                        ) : (
                          <View style={[styles.mealThumbPlaceholder, { backgroundColor: theme.border }]}>
                            <Ionicons name="fast-food-outline" size={14} color={theme.textSecondary} />
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.mealItemName, { color: theme.textPrimary }]}>{meal.name}</Text>
                          <Text style={[styles.mealItemMacros, { color: theme.textSecondary }]}>
                            P: {meal.protein}g | C: {meal.carbs}g | F: {meal.fats}g
                          </Text>
                        </View>
                      </View>

                      <View style={styles.mealItemRight}>
                        <Text style={[styles.mealItemCal, { color: theme.textSecondary }]}>{meal.calories} kcal</Text>
                        <TouchableOpacity onPress={() => handleRemoveMeal(meal.id)}>
                          <Ionicons name="trash-outline" size={16} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}

      </ScrollView>

      {/* Add / Scan Meal Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.cardBackground }]}>
            <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Log {activeCategory}</Text>

            {/* Photo Scan Buttons */}
            <View style={styles.photoActionsRow}>
              <TouchableOpacity
                style={[styles.photoBtn, { borderColor: theme.border, backgroundColor: theme.background }]}
                onPress={() => handlePickImage(true)}
              >
                <Ionicons name="camera" size={18} color="#10B981" />
                <Text style={[styles.photoBtnText, { color: theme.textPrimary }]}>Snap Photo</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.photoBtn, { borderColor: theme.border, backgroundColor: theme.background }]}
                onPress={() => handlePickImage(false)}
              >
                <Ionicons name="images" size={18} color="#10B981" />
                <Text style={[styles.photoBtnText, { color: theme.textPrimary }]}>Gallery</Text>
              </TouchableOpacity>
            </View>

            {/* Scanning Indicator or Image Preview */}
            {isScanning ? (
              <View style={[styles.scanBox, { borderColor: theme.border }]}>
                <ActivityIndicator size="small" color="#10B981" />
                <Text style={[styles.scanText, { color: theme.textSecondary }]}>AI Chawgee Analyzing Plate...</Text>
              </View>
            ) : selectedImageUri ? (
              <View style={styles.previewContainer}>
                <Image source={{ uri: selectedImageUri }} style={styles.imagePreview} />
                <Text style={[styles.scannedBadge, { color: '#10B981' }]}>✓ Vision Macros Extracted</Text>
              </View>
            ) : null}

            {/* Meal Name Input */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Food / Meal Name</Text>
              <TextInput
                style={[styles.input, { borderColor: theme.border, color: theme.textPrimary, backgroundColor: theme.background }]}
                placeholder="e.g. Scrambled Eggs & Toast"
                placeholderTextColor={theme.textSecondary}
                value={itemName}
                onChangeText={setItemName}
              />
            </View>

            {/* Calories & Macro Inputs */}
            <View style={styles.gridRow}>
              <View style={styles.gridInputGroup}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Calories (kcal)</Text>
                <TextInput
                  style={[styles.input, { borderColor: theme.border, color: theme.textPrimary, backgroundColor: theme.background }]}
                  placeholder="350"
                  placeholderTextColor={theme.textSecondary}
                  value={itemCalories}
                  onChangeText={setItemCalories}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.gridInputGroup}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Protein (g)</Text>
                <TextInput
                  style={[styles.input, { borderColor: theme.border, color: theme.textPrimary, backgroundColor: theme.background }]}
                  placeholder="25"
                  placeholderTextColor={theme.textSecondary}
                  value={itemProtein}
                  onChangeText={setItemProtein}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={styles.gridRow}>
              <View style={styles.gridInputGroup}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Carbs (g)</Text>
                <TextInput
                  style={[styles.input, { borderColor: theme.border, color: theme.textPrimary, backgroundColor: theme.background }]}
                  placeholder="30"
                  placeholderTextColor={theme.textSecondary}
                  value={itemCarbs}
                  onChangeText={setItemCarbs}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.gridInputGroup}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Fats (g)</Text>
                <TextInput
                  style={[styles.input, { borderColor: theme.border, color: theme.textPrimary, backgroundColor: theme.background }]}
                  placeholder="10"
                  placeholderTextColor={theme.textSecondary}
                  value={itemFats}
                  onChangeText={setItemFats}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { borderColor: theme.border, borderWidth: 1 }]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={{ color: theme.textPrimary, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#10B981' }]}
                onPress={handleAddMeal}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>Add Meal</Text>
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
  scrollContent: { paddingHorizontal: 20, paddingVertical: 20, gap: 16 },
  header: { gap: 2 },
  subtitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  title: { fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  summaryCard: { padding: 18, borderRadius: 16, borderWidth: 1, gap: 14 },
  summaryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconFrame: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '800' },
  cardMeta: { fontSize: 12, marginTop: 1 },
  progressPercent: { fontSize: 18, fontWeight: '900' },
  progressBarTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 4 },
  macroGrid: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingTop: 4 },
  macroItem: { alignItems: 'center' },
  macroVal: { fontSize: 16, fontWeight: '800' },
  macroLabel: { fontSize: 10, marginTop: 2, fontWeight: '600' },
  macroDivider: { width: 1, height: 26 },
  sectionHeading: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: 4 },
  mealCard: { padding: 16, borderRadius: 16, borderWidth: 1, gap: 10 },
  mealCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mealCategoryTitle: { fontSize: 15, fontWeight: '800' },
  mealCategoryTotal: { fontSize: 12, marginTop: 1 },
  addBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, gap: 4 },
  addBtnText: { fontSize: 12, fontWeight: '800' },
  emptyCategoryText: { fontSize: 12, fontStyle: 'italic', marginTop: 4 },
  mealList: { marginTop: 4 },
  mealItemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1 },
  mealThumb: { width: 36, height: 36, borderRadius: 8 },
  mealThumbPlaceholder: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  mealItemName: { fontSize: 13, fontWeight: '700' },
  mealItemMacros: { fontSize: 10, marginTop: 2 },
  mealItemRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mealItemCal: { fontSize: 12, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { padding: 20, borderRadius: 16, gap: 12 },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  photoActionsRow: { flexDirection: 'row', gap: 10 },
  photoBtn: { flex: 1, flexDirection: 'row', height: 42, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 6 },
  photoBtnText: { fontSize: 12, fontWeight: '700' },
  scanBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 10, borderWidth: 1, gap: 8 },
  scanText: { fontSize: 12, fontWeight: '700' },
  previewContainer: { alignItems: 'center', gap: 4 },
  imagePreview: { width: '100%', height: 120, borderRadius: 10 },
  scannedBadge: { fontSize: 11, fontWeight: '800' },
  inputGroup: { gap: 4 },
  gridRow: { flexDirection: 'row', gap: 10 },
  gridInputGroup: { flex: 1, gap: 4 },
  inputLabel: { fontSize: 11, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, height: 42, fontSize: 13, fontWeight: '700' },
  modalActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 4 },
  modalBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});