import { Stack } from 'expo-router';
import { ThemeProvider } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/context/ThemeContext'

export default function RootLayout() {
  return (
    <ThemeProvider>
      <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      </Stack>
    </ThemeProvider>
  );
}