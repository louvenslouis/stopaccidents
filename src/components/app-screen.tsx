import Head from 'expo-router/head';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent, StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

type AppScreenProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  hideIntro?: boolean;
  headerRight?: ReactNode;
  headerLeft?: ReactNode;
  backgroundColor?: string;
  children?: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
};

export function AppScreen({
  eyebrow,
  title,
  description,
  hideIntro = false,
  headerRight,
  headerLeft,
  backgroundColor,
  children,
  contentContainerStyle,
  onScroll,
}: AppScreenProps) {
  return (
    <SafeAreaView edges={['top']} style={[styles.safeArea, backgroundColor ? { backgroundColor } : undefined]}>
      <Head>
        <title>{title} — Stop Accidents</title>
      </Head>
      <StatusBar style="dark" />

      <Animated.ScrollView
        contentContainerStyle={[styles.content, contentContainerStyle]}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}>
        <Animated.View
          entering={FadeInDown.duration(320).reduceMotion(ReduceMotion.System)}
          style={[styles.header, hideIntro && styles.compactHeader]}>
          {headerLeft}
          {!hideIntro && <View style={styles.heading}>
            <Text style={styles.eyebrow}>{eyebrow}</Text>
            <Text style={styles.title}>{title}</Text>
          </View>}
          {headerRight}
        </Animated.View>
        {!hideIntro && description && <Animated.Text
          entering={FadeInDown.delay(70).duration(320).reduceMotion(ReduceMotion.System)}
          style={styles.description}>
          {description}
        </Animated.Text>}
        <Animated.View
          entering={FadeInDown.delay(120).duration(340).reduceMotion(ReduceMotion.System)}>
          {children}
        </Animated.View>
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F7F7',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 36,
    paddingBottom: 116,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  heading: {
    flex: 1,
  },
  compactHeader: {
    justifyContent: 'flex-end',
  },
  eyebrow: {
    color: '#FF5A45',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  title: {
    marginTop: 8,
    color: '#171719',
    fontSize: 36,
    lineHeight: 42,
    fontWeight: '700',
    letterSpacing: -1.1,
  },
  description: {
    maxWidth: 480,
    marginTop: 10,
    color: '#77777C',
    fontSize: 16,
    lineHeight: 24,
  },
});
