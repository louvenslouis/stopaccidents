import { StyleSheet } from 'react-native';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';
import { Text, View } from '@/features/language/native';
import { createThemedStyles, useThemeColor } from '@/features/appearance/theme-provider';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import type { SavedPlace } from '@/features/profile/saved-places';

export function ReportPlaceCard({ place, disabled, onPress }: {
  place: SavedPlace | null;
  disabled: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  const color = useThemeColor();
  const accent = color('#267E70', 'success');
  return (
    <AnimatedPressable accessibilityRole="button" accessibilityLabel={place ? `Modifier le lieu : ${place.address}` : 'Choisir le lieu'}
      accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
      haptic="selection" pressedScale={0.98} style={[styles.card, disabled && styles.disabled]}>
      <View style={styles.label}>
        <Text numberOfLines={3} style={styles.title}>{place?.address || 'Choisir le lieu'}</Text>
        <View style={styles.action} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Svg width={18} height={18} viewBox="0 0 24 24">
            <Path d={place ? 'M5 17v3h3L20 8l-3-3L5 17ZM14 8l3 3' : 'M5 12h14m-6-6 6 6-6 6'}
              stroke={accent} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </Svg>
        </View>
      </View>
      <View pointerEvents="none" style={styles.map} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Svg width="100%" height="100%" viewBox="0 0 150 120">
          <Rect width="150" height="120" rx="24" fill={color('#E1EDE6', 'surface')} />
          <Path d="M-8 85C28 110 65 41 86 47S111 105 164 92" stroke={color('#C1DFE3', 'border')} strokeWidth="19" fill="none" />
          <Path d="M-10 29 159 67M38-10 65 135M117-10 92 132" stroke={color('#F9FCF8', 'elevated')} strokeWidth="12" fill="none" />
          <Path d="M-10 29 159 67M38-10 65 135" stroke={color('#D1DDD1', 'border')} strokeWidth="1" fill="none" />
          <Rect x="14" y="48" width="19" height="15" rx="5" fill={color('#C5DBBB', 'border')} transform="rotate(12 24 55)" />
          <Rect x="113" y="16" width="23" height="20" rx="6" fill={color('#C5DBBB', 'border')} transform="rotate(12 124 26)" />
          <Ellipse cx="80" cy="91" rx="18" ry="6" fill={accent} opacity="0.12" />
          <Circle cx="80" cy="87" r="24" fill="none" stroke={accent} strokeWidth="1" opacity="0.14" />
          <Path d="M80 84S59 64 59 50a21 21 0 0 1 42 0c0 14-21 34-21 34Z" fill={accent} />
          {place ? <Path d="m71 50 6 6 12-13" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            : <Circle cx="80" cy="50" r="8" fill="#FFFFFF" />}
        </Svg>
      </View>
    </AnimatedPressable>
  );
}

const useStyles = createThemedStyles((color) => StyleSheet.create({
  card: { minHeight: 106, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, paddingLeft: 20,
    borderRadius: 26, borderWidth: 1, borderColor: color('#DCE8E2', 'border'), backgroundColor: color('#F4F8F5', 'elevated'), overflow: 'hidden' },
  label: { flex: 1, gap: 8, paddingVertical: 6 },
  title: { fontSize: 18, lineHeight: 24, fontWeight: '700', color: color('#243D36', 'text') },
  action: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: color('#E3EEE7', 'surface') },
  map: { width: 108, height: 86, borderRadius: 20, overflow: 'hidden' },
  disabled: { opacity: 0.5 },
}));
