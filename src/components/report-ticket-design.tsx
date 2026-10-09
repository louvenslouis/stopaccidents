import { useState, type ReactNode } from 'react';
import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';
import { Text, View } from '@/features/language/native';
import { createThemedStyles } from '@/features/appearance/theme-provider';
import { AppIcon } from './ui/app-icon';
import { AnimatedPressable } from './ui/animated-pressable';
import UsersRound from 'lucide-react-native/icons/users-round';
import Flame from 'lucide-react-native/icons/flame';
import ShieldAlert from 'lucide-react-native/icons/shield-alert';
import Construction from 'lucide-react-native/icons/construction';
import Wrench from 'lucide-react-native/icons/wrench';
import UserRoundSearch from 'lucide-react-native/icons/user-round-search';
import CarFront from 'lucide-react-native/icons/car-front';
import type { SafetyReportSummary } from '@/features/safety-report/read';

export function ReportTicketHero({ kind, title, actions, onPress, expanded, accessibilityLabel, children, photos = [] }: {
  photos?: readonly string[];
  kind: SafetyReportSummary['report_kind']; title: string; actions?: ReactNode; children?: ReactNode;
  onPress?: () => void; expanded?: boolean; accessibilityLabel?: string;
}) {
  const styles = useStyles();
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const photo = photos.find(url => !failed.includes(url));
  const hasPhoto = Boolean(photo && loaded === photo);
  const accent = kind === 'gathering' ? '#79CDD0' : kind === 'fire' ? '#FFAC78' : kind === 'gunfire' || kind === 'armed_presence' ? '#FFADB0' : kind === 'kidnapping' ? '#CFB9FA' : kind === 'barricade' ? '#F5D878' : kind === 'breakdown' ? '#C6E58C' : kind === 'suspicious_vehicle' ? '#A9CFF5' : '#FFB39A';
  const icon = kind === 'gathering' ? UsersRound : kind === 'fire' ? Flame : kind === 'gunfire' || kind === 'armed_presence' ? ShieldAlert : kind === 'barricade' ? Construction : kind === 'breakdown' ? Wrench : kind === 'kidnapping' ? UserRoundSearch : CarFront;
  const titleRow = <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <View style={[styles.heroIcon, hasPhoto && styles.photoIcon]}><AppIcon icon={icon} size={35} color={hasPhoto ? "#FFFFFF" : "#182C2A"} /></View>
      <Text style={[styles.heroTitle, { flex: 1 }, hasPhoto && styles.photoText]}>{title}</Text>
      {children}
    </View>;
  return <View style={[styles.hero, { backgroundColor: accent }]}>
    {photo && <View pointerEvents="none" aria-hidden style={[StyleSheet.absoluteFill, { opacity: hasPhoto ? 1 : 0 }]}>
      <Image key={photo} recyclingKey={photo} source={{ uri: photo }} style={StyleSheet.absoluteFill}
        contentFit="cover" contentPosition="center" cachePolicy="memory-disk" accessible={false} alt=""
        onLoad={() => setLoaded(photo)} onError={() => setFailed(current => [...current, photo])} />
      <View style={[StyleSheet.absoluteFill, styles.photoShade]} />
    </View>}
    {!hasPhoto && <View pointerEvents="none" aria-hidden style={styles.orbitOuter} />}
    {!hasPhoto && <View pointerEvents="none" aria-hidden style={styles.orbitInner} />}
    <View style={styles.heroMeta}>
      <Text translate={false} style={[styles.heroBrand, hasPhoto && styles.photoText]}>STOP / ACCIDENTS</Text>
      {actions}
    </View>
    {onPress ? <AnimatedPressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ expanded }} onPress={onPress} pressedScale={0.985}>{titleRow}</AnimatedPressable> : titleRow}
  </View>;
}
export function ReportTicketSeam() {
  const styles = useStyles();
  return <View style={styles.ticketSeam} pointerEvents="none" aria-hidden>
    <View style={[styles.ticketNotch, styles.ticketNotchLeft]} /><View style={styles.ticketDashes} /><View style={[styles.ticketNotch, styles.ticketNotchRight]} />
  </View>;
}
const useStyles = createThemedStyles(themeColor => StyleSheet.create({
  photoShade: { backgroundColor: '#081B21A6' },
  photoText: { color: '#FFFFFF' },
  photoIcon: { borderRightColor: '#FFFFFF50' },
  hero: { marginHorizontal: -20, marginTop: -20, padding: 20, paddingBottom: 24, overflow: 'hidden', borderBottomLeftRadius: 12, borderBottomRightRadius: 12, gap: 22 },
  heroMeta: { minHeight: 42, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroBrand: { color: '#31423A', fontSize: 10, letterSpacing: 2, fontWeight: '800' },
  heroTitle: { color: '#182C2A', fontSize: 25, lineHeight: 29, fontWeight: '800', letterSpacing: -0.9 },
  heroIcon: { width: 52, height: 56, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: '#182C2A30', paddingRight: 12 },
  heroChevron: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFFFFF65', alignItems: 'center', justifyContent: 'center' },
  orbitOuter: { position: 'absolute', width: 220, height: 220, borderRadius: 110, borderWidth: 1, borderColor: '#182C2A14', right: -45, top: -70 },
  orbitInner: { position: 'absolute', width: 170, height: 170, borderRadius: 85, borderWidth: 25, borderColor: '#FFFFFF20', right: -20, top: -45 },
  ticketSeam: { height: 18, marginTop: 14, marginBottom: -12, marginHorizontal: -20, justifyContent: 'center' },
  ticketDashes: { marginHorizontal: 22, borderTopWidth: 1, borderStyle: 'dashed', borderColor: themeColor('#CFD6CD', 'border') },
  ticketNotch: { position: 'absolute', width: 18, height: 18, borderRadius: 9, backgroundColor: themeColor('#EDF0E7', 'background') },
  ticketNotchLeft: { left: -9 },
  ticketNotchRight: { right: -9 },
}));
