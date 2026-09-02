import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import * as Haptics from 'expo-haptics';
import { getCategoryColor } from '../utils/colors';

export default function HabitCard({ item, onOpenEdit, onDelete, onToggle }) {
  const categoryColor = getCategoryColor(item.category);

  const handleCheckmarkPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onToggle(item.id);
  };

  return (
    <TouchableOpacity
      style={[styles.habitCard, item.completed && styles.habitCardCompleted]}
      onPress={() => onOpenEdit(item)}
      onLongPress={() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        onDelete(item.id);
      }}
      activeOpacity={0.7}
    >
      {/* Category Accent Border */}
      <View style={[styles.accentStrip, { backgroundColor: categoryColor }]} />

      <View style={styles.habitInfo}>
        <Text style={[styles.habitTitle, item.completed && styles.habitTitleCompleted]}>
          {item.title}
        </Text>
        <View style={styles.categoryBadge}>
          <Text style={[styles.habitCategory, { color: categoryColor }]}>
            {item.category || 'General'}
          </Text>
        </View>
      </View>

      <View style={styles.habitRight}>
        <View style={styles.streakBadge}>
          <Text style={styles.streakText}>🔥 {item.streak || 0}</Text>
        </View>

        <TouchableOpacity
          style={[
            styles.checkbox,
            item.completed && { backgroundColor: categoryColor, borderColor: categoryColor },
          ]}
          onPress={handleCheckmarkPress}
        >
          {item.completed && <Text style={styles.checkmark}>✓</Text>}
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  habitCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    overflow: 'hidden',
    position: 'relative',
  },
  habitCardCompleted: {
    backgroundColor: '#161C18',
    borderColor: '#233827',
    opacity: 0.85,
  },
  accentStrip: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  habitInfo: {
    flex: 1,
    paddingLeft: 6,
  },
  habitTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  habitTitleCompleted: {
    textDecorationLine: 'line-through',
    color: '#777',
  },
  categoryBadge: {
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  habitCategory: {
    fontSize: 12,
    fontWeight: '600',
  },
  habitRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  streakBadge: {
    backgroundColor: '#2A2A2A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 12,
  },
  streakText: {
    color: '#FF9800',
    fontSize: 12,
    fontWeight: 'bold',
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#555',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
});