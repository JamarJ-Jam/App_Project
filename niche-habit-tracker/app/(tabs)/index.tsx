import React, { useRef, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  TouchableOpacity,
  Animated,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import LottieView from 'lottie-react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/context/ThemeContext';
import { LightTheme } from '/home/jamarj/repos/App/App_Project/niche-habit-tracker/src/constants/colors';

const { width } = Dimensions.get('window');

export default function EntrySplashScreen() {
  const { theme = LightTheme } = useTheme() || {};
  const router = useRouter();
  const lottieRef = useRef<LottieView>(null);

  // Animations
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleScale = useRef(new Animated.Value(0.8)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslateY = useRef(new Animated.Value(40)).current;

  const triggerUIEntrance = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    Animated.parallel([
      Animated.timing(titleOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(titleScale, { toValue: 1, friction: 6, useNativeDriver: true }),
    ]).start(() => {
      Animated.parallel([
        Animated.timing(cardOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(cardTranslateY, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start();
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        
        {/* Title Header */}
        <Animated.View
          style={[
            styles.titleContainer,
            {
              opacity: titleOpacity,
              transform: [{ scale: titleScale }],
            },
          ]}
        >
          <Text style={[styles.brandSubtitle, { color: theme.fitnessAccent }]}>ACCOUNTABILITY OS</Text>
          <Text style={[styles.brandTitle, { color: theme.textPrimary }]}>My Chawgee</Text>
        </Animated.View>

        {/* Mascot Frame */}
        <View style={styles.mascotFrame}>
          <LottieView
            ref={lottieRef}
            source={require('/home/jamarj/repos/App/App_Project/niche-habit-tracker/assets/my_chawgee_mascot.json')}
            autoPlay
            loop={false}
            onAnimationFinish={triggerUIEntrance}
            style={styles.lottie}
          />
        </View>

        {/* Action Buttons */}
        <Animated.View
          style={[
            styles.cardContainer,
            {
              opacity: cardOpacity,
              transform: [{ translateY: cardTranslateY }],
            },
          ]}
        >
          <View style={[styles.actionCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: theme.fitnessAccent }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                router.push('/auth/signup');
              }}
            >
              <Text style={styles.primaryBtnText}>Get Started</Text>
              <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryBtn, { borderColor: theme.border }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/auth/login');
              }}
            >
              <Text style={[styles.secondaryBtnText, { color: theme.textPrimary }]}>I already have an account</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 30,
    paddingHorizontal: 20,
  },
  titleContainer: { alignItems: 'center', marginTop: 10 },
  brandSubtitle: { fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 4 },
  brandTitle: { fontSize: 32, fontWeight: '900', letterSpacing: -0.5 },
  mascotFrame: {
    width: width * 0.85,
    height: width * 0.85,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lottie: { width: '100%', height: '100%' },
  cardContainer: { width: '100%' },
  actionCard: { padding: 20, borderRadius: 16, borderWidth: 1, gap: 12 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    gap: 8,
  },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  secondaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  secondaryBtnText: { fontWeight: '700', fontSize: 13 },
});