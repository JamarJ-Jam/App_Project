import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';

interface WeeklyCalendarProps {
  completedDates?: string[]; // Array of YYYY-MM-DD strings when habits were completed
}

export default function WeeklyCalendar({ completedDates = [] }: WeeklyCalendarProps) {
  const getWeekDays = () => {
    const today = new Date();
    const currentDayOfWeek = today.getDay(); // 0 = Sun, 1 = Mon, ...
    
    // Calculate Monday of the current week
    const monday = new Date(today);
    const dayOffset = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;
    monday.setDate(today.getDate() + dayOffset);

    const week = [];
    const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(monday);
      dayDate.setDate(monday.getDate() + i);

      const isoDate = dayDate.toISOString().split('T')[0];
      const isToday = isoDate === today.toISOString().split('T')[0];
      const isCompleted = completedDates.includes(isoDate);

      week.push({
        label: dayLabels[i],
        dayNumber: dayDate.getDate(),
        isoDate,
        isToday,
        isCompleted,
      });
    }

    return week;
  };

  const weekDays = getWeekDays();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>This Week's Consistency</Text>
      <View style={styles.daysRow}>
        {weekDays.map((day) => (
          <View
            key={day.isoDate}
            style={[
              styles.dayCard,
              day.isToday && styles.dayCardToday,
              day.isCompleted && styles.dayCardCompleted,
            ]}
          >
            <Text style={[styles.dayLabel, day.isToday && styles.textToday]}>
              {day.label}
            </Text>
            <Text style={[styles.dayNumber, day.isToday && styles.textToday]}>
              {day.dayNumber}
            </Text>
            <View style={styles.statusDot}>
              {day.isCompleted ? (
                <Text style={styles.checkIcon}>✓</Text>
              ) : (
                <View style={[styles.emptyDot, day.isToday && styles.todayDot]} />
              )}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1E1E1E',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  title: {
    color: '#AAA',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dayCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: '#2A2A2A',
    width: 40,
  },
  dayCardToday: {
    borderColor: '#4CAF50',
    borderWidth: 1.5,
    backgroundColor: '#1E2E20',
  },
  dayCardCompleted: {
    backgroundColor: '#2E4D34',
  },
  dayLabel: {
    color: '#888',
    fontSize: 11,
    fontWeight: 'bold',
  },
  dayNumber: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
    marginVertical: 4,
  },
  textToday: {
    color: '#4CAF50',
  },
  statusDot: {
    height: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkIcon: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptyDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#555',
  },
  todayDot: {
    backgroundColor: '#4CAF50',
  },
});