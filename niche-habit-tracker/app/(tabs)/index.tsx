import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  SafeAreaView,
  StatusBar,
  Alert,
} from 'react-native';
import { getHabits, saveHabits, toggleHabitCompletion, updateHabit } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/src/utils/storage.js';
import HabitCard from '../../src/components/HabitCard';

// TypeScript Interface for Habit
export interface Habit {
  id: string;
  title: string;
  category: string;
  completed: boolean;
  streak: number;
  lastCompletedDate: string | null;
}

export default function App() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [editingHabitId, setEditingHabitId] = useState<string | null>(null);
  const [newHabitTitle, setNewHabitTitle] = useState<string>('');
  const [newHabitCategory, setNewHabitCategory] = useState<string>('');

  // Load habits on initial render
  useEffect(() => {
    loadHabits();
  }, []);

  const loadHabits = async () => {
    const loadedHabits = await getHabits();
    setHabits(loadedHabits);
  };

  // Dynamic Categories and Filtered List
  const categories = ['All', ...Array.from(new Set(habits.map((h) => h.category || 'General')))];
  const filteredHabits =
    selectedCategory === 'All'
      ? habits
      : habits.filter((h) => (h.category || 'General') === selectedCategory);

  const handleToggleHabit = async (id: string) => {
    const updated = await toggleHabitCompletion(id);
    setHabits(updated);
  };

  const handleOpenEditModal = (habit: Habit) => {
    setEditingHabitId(habit.id);
    setNewHabitTitle(habit.title);
    setNewHabitCategory(habit.category);
    setModalVisible(true);
  };

  const handleSaveHabit = async () => {
    if (!newHabitTitle.trim()) {
      Alert.alert('Validation Error', 'Please enter a habit title.');
      return;
    }

    if (editingHabitId) {
      const updated = await updateHabit({
        id: editingHabitId,
        title: newHabitTitle.trim(),
        category: newHabitCategory.trim() || 'General',
      });
      setHabits(updated);
    } else {
      const newHabit: Habit = {
        id: Date.now().toString(),
        title: newHabitTitle.trim(),
        category: newHabitCategory.trim() || 'General',
        completed: false,
        streak: 0,
        lastCompletedDate: null,
      };
      const updatedHabits = [...habits, newHabit];
      await saveHabits(updatedHabits);
      setHabits(updatedHabits);
    }

    setNewHabitTitle('');
    setNewHabitCategory('');
    setEditingHabitId(null);
    setModalVisible(false);
  };

  const handleDeleteHabit = (id: string) => {
    Alert.alert('Delete Habit', 'Are you sure you want to delete this habit?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const updated = habits.filter((h) => h.id !== id);
          await saveHabits(updated);
          setHabits(updated);
        },
      },
    ]);
  };

  const completedCount = habits.filter((h) => h.completed).length;
  const progressPercent = habits.length > 0 ? Math.round((completedCount / habits.length) * 100) : 0;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#121212" />

      {/* Header & Progress Stats */}
      <View style={styles.headerContainer}>
        <Text style={styles.headerTitle}>Daily Habit Tracker</Text>
        <Text style={styles.progressText}>
          {completedCount} of {habits.length} habits completed ({progressPercent}%)
        </Text>
        <View style={styles.progressBarBackground}>
          <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
        </View>
      </View>

      {/* Category Filter Bar */}
      <View style={styles.filterContainer}>
        <FlatList
          horizontal
          data={categories}
          keyExtractor={(item) => item}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterList}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.filterChip, selectedCategory === item && styles.filterChipActive]}
              onPress={() => setSelectedCategory(item)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  selectedCategory === item && styles.filterChipTextActive,
                ]}
              >
                {item}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Habit List */}
      <FlatList
        data={filteredHabits}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No habits found.</Text>
            <Text style={styles.emptySubtext}>Tap the button below to create one!</Text>
          </View>
        }
        renderItem={({ item }) => (
          <HabitCard
            item={item}
            onOpenEdit={handleOpenEditModal}
            onDelete={handleDeleteHabit}
            onToggle={handleToggleHabit}
          />
        )}
      />

      {/* Add Habit FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          setEditingHabitId(null);
          setNewHabitTitle('');
          setNewHabitCategory('');
          setModalVisible(true);
        }}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* Add / Edit Habit Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingHabitId ? 'Edit Habit' : 'New Habit'}</Text>

            <TextInput
              style={styles.input}
              placeholder="Habit Title (e.g., Read 20 pages)"
              placeholderTextColor="#888"
              value={newHabitTitle}
              onChangeText={setNewHabitTitle}
            />

            <TextInput
              style={styles.input}
              placeholder="Category (e.g., Fitness, Learning)"
              placeholderTextColor="#888"
              value={newHabitCategory}
              onChangeText={setNewHabitCategory}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setEditingHabitId(null);
                  setNewHabitTitle('');
                  setNewHabitCategory('');
                  setModalVisible(false);
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.modalButton, styles.saveButton]} onPress={handleSaveHabit}>
                <Text style={styles.saveButtonText}>
                  {editingHabitId ? 'Save Changes' : 'Add Habit'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  headerContainer: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 8,
  },
  progressText: {
    fontSize: 14,
    color: '#AAA',
    marginBottom: 10,
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: '#333',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 4,
  },
  filterContainer: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  filterList: {
    paddingHorizontal: 16,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#2A2A2A',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#4CAF50',
  },
  filterChipText: {
    color: '#AAA',
    fontSize: 14,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#FFF',
  },
  listContainer: {
    padding: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
  },
  emptySubtext: {
    color: '#777',
    fontSize: 14,
    marginTop: 6,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 30,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  fabText: {
    color: '#FFF',
    fontSize: 32,
    lineHeight: 34,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#333',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#2A2A2A',
    color: '#FFF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 15,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginLeft: 10,
  },
  cancelButton: {
    backgroundColor: '#333',
  },
  cancelButtonText: {
    color: '#AAA',
  },
  saveButton: {
    backgroundColor: '#4CAF50',
  },
  saveButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
  },
});