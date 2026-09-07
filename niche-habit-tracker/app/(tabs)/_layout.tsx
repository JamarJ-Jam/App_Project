import { Tabs } from 'expo-router';
import { useTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/context/ThemeContext';
import { LightTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/constants/colors';

export default function TabLayout() {
  const { theme = LightTheme } = useTheme() || {};

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme?.cardBackground || '#FFFFFF',
          borderTopColor: theme?.border || '#E2E8F0',
        },
        tabBarActiveTintColor: theme?.primaryAccent || '#3B82F6',
        tabBarInactiveTintColor: theme?.textSecondary || '#64748B',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
        }}
      />
      <Tabs.Screen
        name="fitness"
        options={{
          title: 'Fitness',
        }}
      />
      <Tabs.Screen
        name="nutrition"
        options={{
          title: 'Nutrition',
        }}
        />
      <Tabs.Screen
        name="efficiency"
        options={{
          title: 'Efficiency',
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'My Account',
        }}
      />
    </Tabs>
  );
}