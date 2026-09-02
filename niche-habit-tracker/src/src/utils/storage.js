import AsyncStorage from '@react-native-async-storage/async-storage';

const HABITS_KEY = '@niche_habits_data';

// Helper to get today's date in YYYY-MM-DD
const getTodayString = () => new Date().toISOString().split('T')[0];

// Fetch habits and automatically reset daily completion status if it's a new day
export const getHabits = async () => {
  try {
    const jsonValue = await AsyncStorage.getItem(HABITS_KEY);
    const habits = jsonValue != null ? JSON.parse(jsonValue) : [];
    const today = getTodayString();

    let updated = false;
    const sanitizedHabits = habits.map((habit) => {
      // If completed on a previous day, reset completion status for today
      if (habit.completed && habit.lastCompletedDate !== today) {
        updated = true;
        return { ...habit, completed: false };
      }
      return habit;
    });

    // Save back if any habit statuses were updated for midnight reset
    if (updated) {
      await saveHabits(sanitizedHabits);
    }

    return sanitizedHabits;
  } catch (e) {
    console.error('Error reading habits', e);
    return [];
  }
};

// Save full habit list
export const saveHabits = async (habits) => {
  try {
    const jsonValue = JSON.stringify(habits);
    await AsyncStorage.setItem(HABITS_KEY, jsonValue);
  } catch (e) {
    console.error('Error saving habits', e);
  }
};

// Toggle habit status & adjust streaks
export const toggleHabitCompletion = async (habitId) => {
  const habits = await getHabits();
  const today = getTodayString();

  const updatedHabits = habits.map((habit) => {
    if (habit.id === habitId) {
      const isCompleting = !habit.completed;
      return {
        ...habit,
        completed: isCompleting,
        lastCompletedDate: isCompleting ? today : null,
        streak: isCompleting ? (habit.streak || 0) + 1 : Math.max(0, (habit.streak || 1) - 1),
      };
    }
    return habit;
  });

  await saveHabits(updatedHabits);
  return updatedHabits;
};


// Update existing habit title and category
export const updateHabit = async (updatedHabit) => {
  const habits = await getHabits();
  const updatedHabits = habits.map((habit) => 
    habit.id === updatedHabit.id ? { ...habit, ...updatedHabit } : habit
  );
  await saveHabits(updatedHabits);
  return updatedHabits;
};