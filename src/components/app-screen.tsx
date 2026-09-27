import { useTabContrastControls } from '@/features/navigation/tab-contrast-provider';
import { useLanguage } from '@/features/language/language-provider';
import { Text, View } from '@/features/language/native';
import { createThemedStyles } from '@/features/appearance/theme-provider';
import Head from 'expo-router/head';
import type { ReactNode } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent, StyleProp, ViewStyle } from 'react-native';
import { StyleSheet } from 'react-native';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

type AppScreenProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  hideIntro?: boolean;
  headerLeft?: ReactNode;
  headerRight?: ReactNode;
  children?: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
};

export function AppScreen({
  eyebrow,
  title,
  description,
  hideIntro = false,
  headerLeft,
  headerRight,
  children,
  contentContainerStyle,
  onScroll,
}: AppScreenProps) {
  const { t } = useLanguage();
  const styles = useStyles();
  const contrast = useTabContrastControls();

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <Head>
        <title>{t(title)} — Stop Accidents</title>
      </Head>

      <Animated.ScrollView
        contentContainerStyle={[styles.content, contentContainerStyle]}
        onScroll={onScroll}
        onScrollBeginDrag={contrast?.start}
        onScrollEndDrag={contrast?.stop}
        onMomentumScrollBegin={contrast?.start}
        onMomentumScrollEnd={contrast?.stop}
        onContentSizeChange={() => { contrast?.start(); contrast?.stop(); }}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}>
        <Animated.View
          entering={FadeInDown.duration(320).reduceMotion(ReduceMotion.System)}
          style={[styles.header, hideIntro && styles.compactHeader, !!headerLeft && styles.headerWithLeft]}>
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
          {t(description)}
        </Animated.Text>}
        <Animated.View
          entering={FadeInDown.delay(120).duration(340).reduceMotion(ReduceMotion.System)}>
          {children}
        </Animated.View>
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((themeColor) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: themeColor('#F7F7F7', 'background'),
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
  headerWithLeft: {
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eyebrow: {
    color: themeColor('#FF5A45', 'accent'),
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  title: {
    marginTop: 8,
    color: themeColor('#171719', 'text'),
    fontSize: 36,
    lineHeight: 42,
    fontWeight: '700',
    letterSpacing: -1.1,
  },
  description: {
    maxWidth: 480,
    marginTop: 10,
    color: themeColor('#77777C', 'muted'),
    fontSize: 16,
    lineHeight: 24,
  },
}));
