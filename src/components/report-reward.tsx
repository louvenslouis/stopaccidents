import { createThemedStyles, useThemeColor } from '@/features/appearance/theme-provider';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { useRewards, type RewardSummary } from '@/features/rewards/use-rewards';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

export function ReportReward({
  reportId,
  reportKind,
  onDone,
  visible = true,
}: {
  reportId: string;
  reportKind: string;
  onDone: () => void;
  visible?: boolean;
}) {
  const { summary, error, refresh } = useRewards(reportId, reportKind);
  return (
    <RewardCelebration
      summary={summary}
      error={error}
      refresh={refresh}
      reportId={reportId}
      onDone={onDone}
      visible={visible}
    />
  );
}

export function RewardCelebration({
  summary,
  error,
  refresh,
  reportId,
  onDone,
  visible = true,
}: {
  summary: RewardSummary | null;
  error: boolean;
  refresh: () => Promise<void>;
  reportId: string;
  onDone: () => void;
  visible?: boolean;
}) {
  const styles = useStyles();
  const themeColor = useThemeColor();

  const [collected, setCollected] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [displayTotal, setDisplayTotal] = useState<number | null>(null);
  const reduced = useRef(true);
  const locked = useRef(false);
  const [progress] = useState(() => new Animated.Value(0));
  const [enter] = useState(() => new Animated.Value(1));
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (!active) return;
      reduced.current = value;
      if (!value) {
        enter.setValue(0);
        Animated.spring(enter, {
          toValue: 1,
          damping: 12,
          stiffness: 140,
          useNativeDriver: true,
        }).start();
      }
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (value) => {
        reduced.current = value;
      },
    );
    return () => {
      active = false;
      subscription.remove();
      enter.stopAnimation();
      progress.stopAnimation();
    };
  }, [enter, progress]);
  function collect() {
    if (!summary?.earned || locked.current) return;
    locked.current = true;
    setCollecting(true);
    const before = summary.total - summary.earned;
    const listener = progress.addListener(({ value }) =>
      setDisplayTotal(before + Math.round(value * summary.earned)),
    );
    if (!reduced.current && Platform.OS !== 'web') {
      void Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => undefined);
    }
    Animated.timing(progress, {
      toValue: 1,
      duration: reduced.current ? 0 : 1250,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      progress.removeListener(listener);
      if (finished) {
        setCollected(true);
        setCollecting(false);
        setDisplayTotal(summary.total);
      }
    });
  }
  // Closing/reopening the sheet never replays or changes an award.
  useEffect(() => {
    if (!visible && locked.current) {
      progress.stopAnimation();
      progress.removeAllListeners();
      void Promise.resolve().then(() => {
        setCollected(true);
        setCollecting(false);
        setDisplayTotal(null);
      });
    }
  }, [visible, progress]);
  return (
    <ScrollView contentContainerStyle={styles.screen} bounces={false}>
      <View style={styles.topline}>
        <Text style={styles.eyebrow}>CONTRIBUTION ENREGISTRÉE</Text>
        <Text style={styles.check}>✓</Text>
      </View>
      <Animated.View
        style={[
          styles.hero,
          {
            opacity: enter,
            transform: [
              {
                scale: enter.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.85, 1],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.orbit} />
        <View style={styles.coin}>
          <Text style={styles.star}>★</Text>
        </View>
        <Text style={styles.sparkLeft}>✦</Text>
        <Text style={styles.sparkRight}>✧</Text>
        <Text style={styles.reward}>
          {summary?.earned ? `+${summary.earned}` : 'Merci !'}
        </Text>
        <Text style={styles.rewardLabel}>
          {summary?.earned ? 'POINTS DE VIGILANCE' : 'POUR VOTRE VIGILANCE'}
        </Text>
        {Array.from({ length: 9 }, (_, i) => (
          <Animated.View
            key={i}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            aria-hidden
            pointerEvents="none"
            style={[
              styles.flyingCoin,
              {
                opacity: progress.interpolate({
                  inputRange: [0, 0.06, 0.8, 1],
                  outputRange: [0, 1, 1, 0],
                }),
                transform: [
                  {
                    translateX: progress.interpolate({
                      inputRange: [0, 0.4, 1],
                      outputRange: [0, Math.cos(i * 2.4) * 100, 0],
                    }),
                  },
                  {
                    translateY: progress.interpolate({
                      inputRange: [0, 0.4, 1],
                      outputRange: [0, -65 - i * 6, 220],
                    }),
                  },
                  {
                    scale: progress.interpolate({
                      inputRange: [0, 0.3, 1],
                      outputRange: [0.4, 1, 0.3],
                    }),
                  },
                  {
                    rotate: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', `${180 + i * 45}deg`],
                    }),
                  },
                ],
              },
            ]}
          >
            <Text style={styles.miniStar}>★</Text>
          </Animated.View>
        ))}
      </Animated.View>
      <Text accessibilityRole="header" style={styles.title}>
        {collected ? 'Vos points sont récoltés !' : 'Votre vigilance compte.'}
      </Text>
      <Text style={styles.body}>
        Signalement complété. Merci d’aider la communauté à mieux s’informer et
        à se déplacer en sécurité.
      </Text>
      {summary && summary.earned === 0 && <Text style={styles.body}>Votre témoignage est conservé. Aucun point supplémentaire n’est attribué pour un événement déjà récompensé ou un signalement similaire récent.</Text>}
      <View style={styles.balance}>
        <View>
          <Text style={styles.balanceLabel}>VOTRE SOLDE</Text>
          <Text style={styles.balanceHint}>
            {collected
              ? 'Merci pour votre contribution'
              : 'Chaque contribution compte'}
          </Text>
        </View>
        <Text
          accessibilityLiveRegion={collecting ? 'none' : 'polite'}
          style={styles.total}
        >
          {summary
            ? `${displayTotal ?? summary.total - (collected ? 0 : summary.earned)} pts`
            : '…'}
        </Text>
      </View>
      {error ? (
        <AnimatedPressable
          accessibilityRole="button"
          onPress={() => void refresh()}
          style={styles.retry}
        >
          <Text style={styles.body}>
            Points indisponibles. Toucher pour réessayer.
          </Text>
        </AnimatedPressable>
      ) : !summary ? (
        <ActivityIndicator color={themeColor("#A46A13", 'warning')} />
      ) : null}
      <Text selectable style={styles.reference}>
        Réf. {reportId.toUpperCase()}
      </Text>
      <Text style={styles.notice}>
        Cet envoi ne contacte pas automatiquement la police ou les secours. En
        cas d’urgence, alertez les autorités compétentes.
      </Text>
      {summary?.earned && !collected ? (
        <AnimatedPressable
          accessibilityRole="button"
          disabled={collecting}
          onPress={collect}
          style={styles.button}
        >
          <Text style={styles.buttonText}>
            {collecting
              ? 'Collecte en cours…'
              : `Récolter mes ${summary.earned} points`}
          </Text>
        </AnimatedPressable>
      ) : null}
      <AnimatedPressable
        accessibilityRole="button"
        onPress={onDone}
        style={collected || !summary?.earned ? styles.button : styles.later}
      >
        <Text
          style={
            collected || !summary?.earned ? styles.buttonText : styles.laterText
          }
        >
          {collected || !summary?.earned
            ? 'Terminer'
            : 'Fermer · points déjà enregistrés'}
        </Text>
      </AnimatedPressable>
    </ScrollView>
  );
}

const useStyles = createThemedStyles((themeColor) => StyleSheet.create({
  screen: {
    flexGrow: 1,
    padding: 26,
    gap: 16,
    justifyContent: 'center',
    backgroundColor: themeColor('#FFFDFA', 'background'),
  },
  topline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.8,
    fontWeight: '800',
    color: themeColor('#387D6B', 'success'),
  },
  check: { color: themeColor('#387D6B', 'success'), fontWeight: '800' },
  hero: {
    height: 222,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  orbit: {
    position: 'absolute',
    top: 0,
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 1,
    borderColor: themeColor('#F4E3BD', 'border'),
    backgroundColor: themeColor('#FFF7E5', 'warningSoft'),
  },
  coin: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#F4BF49',
    borderWidth: 7,
    borderColor: themeColor('#FFE295', 'border'),
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#AD721C',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 9 },
    elevation: 5,
  },
  star: { fontSize: 52, color: themeColor('#956019', 'warning') },
  sparkLeft: {
    position: 'absolute',
    left: '17%',
    top: 55,
    color: themeColor('#D8A332', 'warning'),
    fontSize: 31,
  },
  sparkRight: {
    position: 'absolute',
    right: '17%',
    top: 17,
    color: themeColor('#D8A332', 'warning'),
    fontSize: 40,
  },
  reward: {
    marginTop: 12,
    fontSize: 52,
    fontWeight: '900',
    color: themeColor('#875A19', 'warning'),
    letterSpacing: -2,
  },
  rewardLabel: {
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: '800',
    color: themeColor('#A47A36', 'warning'),
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800',
    letterSpacing: -0.8,
    textAlign: 'center',
    color: themeColor('#273C38', 'text'),
  },
  body: { fontSize: 14, lineHeight: 22, color: themeColor('#738079', 'muted'), textAlign: 'center' },
  balance: {
    borderRadius: 20,
    padding: 18,
    backgroundColor: themeColor('#EDF5EF', 'elevated'),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  balanceLabel: {
    fontSize: 10,
    letterSpacing: 1.3,
    fontWeight: '800',
    color: themeColor('#4F7261', 'secondary'),
  },
  balanceHint: { fontSize: 11, color: themeColor('#718575', 'muted'), marginTop: 5 },
  total: { fontSize: 25, color: themeColor('#285D49', 'text'), fontWeight: '800' },
  reference: { fontSize: 10, color: themeColor('#8D948D', 'muted'), textAlign: 'center' },
  notice: {
    fontSize: 11,
    lineHeight: 17,
    color: themeColor('#8F8066', 'muted'),
    textAlign: 'center',
  },
  button: {
    minHeight: 54,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 17,
    backgroundColor: '#28644E',
    padding: 14,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  later: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  laterText: { color: themeColor('#78857A', 'muted'), fontSize: 12, textAlign: 'center' },
  retry: { padding: 8 },
  flyingCoin: {
    position: 'absolute',
    top: 64,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: themeColor('#FFE69A', 'border'),
    backgroundColor: '#EDB43C',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  miniStar: { color: themeColor('#9B6718', 'warning'), fontSize: 16 },
}));
