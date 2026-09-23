import { createThemedStyles } from '@/features/appearance/theme-provider';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { useRewards } from '@/features/rewards/use-rewards';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function RewardsCard() {
  const styles = useStyles();

  const { summary, error, refresh } = useRewards();
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  const total = summary?.total ?? 0;
  const level = Math.floor(total / 250) + 1;
  const remaining = 250 - (total % 250);
  return (
    <View style={styles.card}>
      <View style={styles.heading}>
        <Text style={styles.label}>★ MES POINTS DE VIGILANCE</Text>
        <Text style={styles.level}>Niveau {level}</Text>
      </View>
      <Text accessibilityLiveRegion="polite" style={styles.total}>
        {summary ? total.toLocaleString('fr-FR') : '…'}{' '}
        <Text style={styles.unit}>points</Text>
      </Text>
      <Text style={styles.body}>
        {summary?.count ?? 0} signalement{summary?.count === 1 ? '' : 's'}{' '}
        récompensé{summary?.count === 1 ? '' : 's'} · 25 points par parcours
        terminé
      </Text>
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 250, now: total % 250 }}
        accessibilityLabel="Progression vers le prochain niveau"
        style={styles.track}
      >
        <View
          style={[styles.fill, { width: `${((total % 250) / 250) * 100}%` }]}
        />
      </View>
      <Text style={styles.body}>
        Encore {remaining} points avant le niveau {level + 1}
      </Text>
      {error && (
        <AnimatedPressable
          accessibilityRole="button"
          onPress={() => void refresh()}
        >
          <Text style={styles.error}>Solde indisponible · Réessayer</Text>
        </AnimatedPressable>
      )}
    </View>
  );
}
const useStyles = createThemedStyles((themeColor) => StyleSheet.create({
  card: {
    backgroundColor: themeColor('#FDF6E6', 'warningSoft'),
    borderWidth: 1,
    borderColor: themeColor('#F0E2C2', 'border'),
    padding: 22,
    borderRadius: 24,
    gap: 12,
  },
  heading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  label: {
    fontSize: 10,
    letterSpacing: 1,
    color: themeColor('#8B682B', 'warning'),
    fontWeight: '800',
  },
  level: {
    fontSize: 11,
    color: themeColor('#6D612F', 'warning'),
    backgroundColor: themeColor('#F3E9C9', 'warningSoft'),
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    fontWeight: '700',
  },
  total: {
    fontSize: 42,
    fontWeight: '800',
    color: themeColor('#72521F', 'warning'),
    letterSpacing: -1,
  },
  unit: { fontSize: 16, fontWeight: '500', letterSpacing: 0 },
  body: { color: themeColor('#918063', 'muted'), fontSize: 12, lineHeight: 18 },
  track: {
    height: 7,
    borderRadius: 4,
    backgroundColor: themeColor('#EEE3C6', 'warningSoft'),
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: '#CAA14C', borderRadius: 4 },
  error: { fontSize: 13, color: themeColor('#A24436', 'accent'), paddingVertical: 6 },
}));
