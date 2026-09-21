import Head from 'expo-router/head';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent, StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

type AppScreenProps = {
  eyebrow: string;
  title: string;
  description: string;
  headerRight?: ReactNode;
  children?: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
};

export function AppScreen({
  eyebrow,
  title,
  description,
  headerRight,
  children,
  contentContainerStyle,
  onScroll,
}: AppScreenProps) {
  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <Head>
        <title>{title} — Stop Accidents</title>
      </Head>
      <StatusBar style="dark" />

      <Animated.ScrollView
        contentContainerStyle={[styles.content, contentContainerStyle]}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.heading}>
            <Text style={styles.eyebrow}>{eyebrow}</Text>
            <Text style={styles.title}>{title}</Text>
          </View>
          {headerRight}
        </View>
        <Text style={styles.description}>{description}</Text>
        {children}
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
