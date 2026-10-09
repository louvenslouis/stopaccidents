import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet } from 'react-native';
import { View } from '@/features/language/native';
import { Image } from 'expo-image';
import Car from 'lucide-react-native/icons/car';
import Bike from 'lucide-react-native/icons/bike';
import Truck from 'lucide-react-native/icons/truck';
import Bus from 'lucide-react-native/icons/bus';
import Flame from 'lucide-react-native/icons/flame';
import House from 'lucide-react-native/icons/house';
import Trees from 'lucide-react-native/icons/trees';
import Building from 'lucide-react-native/icons/building';
import Users from 'lucide-react-native/icons/users';
import Footprints from 'lucide-react-native/icons/footprints';
import Shield from 'lucide-react-native/icons/shield';
import Volume from 'lucide-react-native/icons/volume-2';
import CircleHelp from 'lucide-react-native/icons/circle-question-mark';
import Wind from 'lucide-react-native/icons/wind';
import Check from 'lucide-react-native/icons/check';
import { AppIcon, type AppIconComponent } from '@/components/ui/app-icon';
import { accidentTypes } from '@/components/accident-type-picker';
import { useThemeColor } from '@/features/appearance/theme-provider';

type Kind = 'accident' | 'breakdown' | 'fire' | 'gathering' | 'barricade' | 'gunfire' | 'armed' | 'kidnapping' | 'vehicle';
const defaultArt = {
  breakdown: [require('../../assets/images/breakdown-report/position.png'), require('../../assets/images/breakdown-report/vehicle-types.png'), require('../../assets/images/breakdown-report/traffic-impact.png')],
  fire: [require('../../assets/images/fire-report/targets.png'), require('../../assets/images/fire-report/state.png'), require('../../assets/images/fire-report/people.png')],
  gathering: [require('../../assets/images/gathering-report/types.png'), require('../../assets/images/gathering-report/situation.png'), require('../../assets/images/gathering-report/traffic.png')],
};
const vehicles: Record<string, AppIconComponent> = { car: Car, sedan: Car, suv: Car, motorcycle: Bike, truck: Truck, pickup: Truck, bus: Bus, minibus: Bus, van: Bus, tuktuk: Bike };
const obstacles: Record<string, number> = {
  stones: require('../../assets/images/barricade-types/stones.png'),
  wrecks: require('../../assets/images/barricade-types/wrecks.png'),
  'burning-tires': require('../../assets/images/barricade-types/burning-tires.png'),
  'tree-trunks': require('../../assets/images/barricade-types/tree-trunks.png'),
  other: require('../../assets/images/barricade-types/other.png'),
};

/** Decorative only: the adjacent controls remain the accessible source of truth. */
export function ReportScene({ kind, value, step = 1 }: { kind: Kind; value: string | null; step?: number }) {
  const color = useThemeColor();
  const [scale] = useState(() => new Animated.Value(1));
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (mounted) setReduceMotion(value); });
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { mounted = false; listener.remove(); };
  }, []);
  useEffect(() => {
    if (!value || reduceMotion) { scale.setValue(1); return; }
    scale.setValue(0.94);
    const animation = Animated.spring(scale, { toValue: 1, useNativeDriver: true, damping: 14, stiffness: 180 });
    animation.start();
    return () => animation.stop();
  }, [value, reduceMotion, scale]);

  const selected = Boolean(value);
  const positive = ['none', 'normal', 'extinguished', 'no', 'dispersed'].includes(value ?? '');
  const tint = color(positive ? '#23766A' : '#B76518', positive ? 'success' : 'warning');
  let icons: AppIconComponent[] = [CircleHelp];
  if (kind === 'breakdown' || kind === 'vehicle') icons = [vehicles[value ?? ''] ?? Car];
  if (kind === 'fire') icons = [({ house: House, commerce: Building, building: Building, warehouse: Building, vegetation: Trees, car: Car, other_vehicle: Truck, smoke: Wind, extinguished: Check, yes: Users, no: Shield } as Record<string, AppIconComponent>)[value ?? ''] ?? Flame];
  if (kind === 'gathering') icons = [value === 'moving' || value === 'march' ? Footprints : value === 'dispersed' ? Check : Users];
  if (kind === 'armed') icons = [Users, Shield];
  if (kind === 'kidnapping') icons = [Car];
  if (kind === 'gunfire') icons = Array.from({ length: value === 'one' ? 1 : value === 'two_to_five' ? 2 : value === 'six_to_ten' ? 3 : value === 'more_than_ten' ? 4 : 1 }, () => Volume);
  const initialArt = !value && kind in defaultArt ? defaultArt[kind as keyof typeof defaultArt][step - 1] : null;
  const accident = kind === 'accident' ? accidentTypes.find((type) => type.value === value) : null;
  const barricades = kind === 'barricade' ? (value ?? '').split(',').filter((key) => obstacles[key]) : [];
  return (
    <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={[styles.scene, { backgroundColor: color('#F5F7F6', 'elevated') }]}>
      <View style={[styles.road, { backgroundColor: color('#DEE5E3', 'border') }]} />
      <Animated.View style={[styles.items, {
        opacity: selected || initialArt ? 1 : 0.45,
        transform: [{ scale }, { translateX: value === 'shoulder' || value === 'off_road' || value === 'sidewalk' ? 56 : 0 }],
      }]}>
        {initialArt ? <Image source={initialArt} style={styles.art} contentFit="contain" alt="" /> : accident ? <Image source={accident.illustration} style={styles.art} contentFit="contain" alt="" />
          : barricades.length ? barricades.map((key) => <Image key={key} source={obstacles[key]} style={styles.obstacle} contentFit="contain" alt="" />)
          : icons.map((icon, index) => <AppIcon key={index} icon={icon} size={kind === 'gunfire' ? 30 : 56} color={selected ? tint : color('#89919E', 'muted')} />)}
      </Animated.View>
    </View>
  );
}
const styles = StyleSheet.create({
  scene: { minHeight: 124, borderRadius: 24, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  road: { position: 'absolute', bottom: 22, width: '76%', height: 3, borderRadius: 2 },
  items: { minHeight: 112, flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'center' },
  art: { width: 150, height: 112 }, obstacle: { width: 64, height: 84 },
});
