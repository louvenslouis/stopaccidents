import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import { StyleSheet } from 'react-native';
import { View } from '@/features/language/native';
import { AnimatedPressable } from './ui/animated-pressable';

export function ReportPhotoCarouselControls({ count, index, onSelect, bottom = 24 }: {
  count: number; index: number; onSelect: (index: number) => void; bottom?: number;
}) {
  if (count < 2) return null;
  const first = Math.max(0, Math.min(index - 3, count - 7));
  return <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
    {index > 0 && <AnimatedPressable accessibilityRole="button" accessibilityLabel="Photo précédente" onPress={() => onSelect(index - 1)}
      style={[styles.arrow, { left: 10 }]}><ChevronLeft size={22} color="#FFFFFF" /></AnimatedPressable>}
    {index < count - 1 && <AnimatedPressable accessibilityRole="button" accessibilityLabel="Photo suivante" onPress={() => onSelect(index + 1)}
      style={[styles.arrow, { right: 10 }]}><ChevronRight size={22} color="#FFFFFF" /></AnimatedPressable>}
    <View pointerEvents="box-none" style={[styles.dots, { bottom }]}>
      {Array.from({ length: Math.min(7, count) }, (_, offset) => first + offset).map(page =>
        <AnimatedPressable key={page} accessibilityRole="button" accessibilityLabel={`Photo ${page + 1} sur ${count}`}
          accessibilityState={{ selected: page === index }} onPress={() => onSelect(page)} style={styles.dotTouch}>
          <View style={[styles.dot, page === index && styles.selected]} />
        </AnimatedPressable>)}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  arrow: { position: 'absolute', top: '50%', marginTop: -22, width: 44, height: 44, borderRadius: 22, backgroundColor: '#14202B88', borderWidth: 1, borderColor: '#FFFFFF80', alignItems: 'center', justifyContent: 'center' },
  dots: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', borderRadius: 18, backgroundColor: '#14202B88' },
  dotTouch: { width: 24, height: 28, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#FFFFFF60' },
  selected: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#FFFFFF' },
});
