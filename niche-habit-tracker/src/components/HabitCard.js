import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';

export default function HabitCard({ item, onOpenEdit, onDelete, onToggle }) {
  return (
    <TouchableOpacity
      style={[styles.habitCard, item.completed && styles.habitCardCompleted]}
      onPress={() => onOpenEdit(item)}
      onLongPress={() => onDelete(item.id)}
      activeOpacity={0.7}
    >
      <View style={styles.habitInfo}>
        <Text style={[styles.habitTitle, item.completed && styles.habitTitleCompleted]}>
          {item.title}
        </Text>
        <Text style={styles.habitCategory}>{item.category}</Text>
      </View>

      <View style={styles.habitRight}>
        <View style={styles.streakBadge}>
          <Text style={styles.streakText}>🔥 {item.streak || 0}</Text>
        </View>

        <TouchableOpacity
          style={[styles.checkbox, item.completed && styles.checkboxCompleted]}
          onPress={() => onToggle(item.id)}
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
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  habitCardCompleted: {
    backgroundColor: '#18241B',
    borderColor: '#2E4D34',
  },
  habitInfo: {
    flex: 1,
  },
  habitTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  habitTitleCompleted: {
    textDecorationLine: 'line-through',
    color: '#888',
  },
  habitCategory: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
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
  checkboxCompleted: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  checkmark: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
});