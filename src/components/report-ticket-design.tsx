import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { Text, View } from '@/features/language/native';
import { createThemedStyles } from '@/features/appearance/theme-provider';
import { AppIcon } from './ui/app-icon';
import Flame from 'lucide-react-native/icons/flame';
import ShieldAlert from 'lucide-react-native/icons/shield-alert';
import Construction from 'lucide-react-native/icons/construction';
import Wrench from 'lucide-react-native/icons/wrench';
import UserRoundSearch from 'lucide-react-native/icons/user-round-search';
import CarFront from 'lucide-react-native/icons/car-front';
import type { SafetyReportSummary } from '@/features/safety-report/read';

export function ReportTicketHero({ kind, title, position, count, children }: { kind: SafetyReportSummary['report_kind']; title: string; position?: number; count?: number; children?: ReactNode }) {
  const styles = useStyles();
  const accent = kind === 'fire' ? '#FFAC78' : kind === 'gunfire' || kind === 'armed_presence' ? '#FFADB0' : kind === 'kidnapping' ? '#CFB9FA' : kind === 'barricade' ? '#F5D878' : kind === 'breakdown' ? '#C6E58C' : kind === 'suspicious_vehicle' ? '#A9CFF5' : '#FFB39A';
  const icon = kind === 'fire' ? Flame : kind === 'gunfire' || kind === 'armed_presence' ? ShieldAlert : kind === 'barricade' ? Construction : kind === 'breakdown' ? Wrench : kind === 'kidnapping' ? UserRoundSearch : CarFront;
  return <View style={[styles.hero, { backgroundColor: accent }]}>
    <View pointerEvents="none" aria-hidden style={styles.orbitOuter} />
    <View pointerEvents="none" aria-hidden style={styles.orbitInner} />
    <View style={styles.heroMeta}>
      <Text translate={false} style={styles.heroBrand}>STOP / ACCIDENTS</Text>
      {position !== undefined && <Text translate={false} style={styles.heroIndex}>{String(position).padStart(2, '0')}<Text translate={false} style={styles.heroTotal}> / {String(count ?? 1).padStart(2, '0')}</Text></Text>}
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <View style={styles.heroIcon}><AppIcon icon={icon} size={35} color="#182C2A" /></View>
      <Text style={[styles.heroTitle, { flex: 1 }]}>{title}</Text>
      {children}
    </View>
  </View>;
}
export function ReportTicketSeam() {
  const styles = useStyles();
  return <View style={styles.ticketSeam} pointerEvents="none" aria-hidden>
    <View style={[styles.ticketNotch, styles.ticketNotchLeft]} /><View style={styles.ticketDashes} /><View style={[styles.ticketNotch, styles.ticketNotchRight]} />
  </View>;
}
const useStyles = createThemedStyles(themeColor => StyleSheet.create({
  hero: { marginHorizontal: -20, marginTop: -20, padding: 20, paddingBottom: 24, overflow: 'hidden', borderBottomLeftRadius: 12, borderBottomRightRadius: 12, gap: 22 },
  heroMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroBrand: { color: '#31423A', fontSize: 10, letterSpacing: 2, fontWeight: '800' },
  heroIndex: { color: '#182C2A', fontSize: 29, letterSpacing: -1.5, fontWeight: '900', fontVariant: ['tabular-nums'] },
  heroTotal: { color: '#435449', fontSize: 12, letterSpacing: 0, fontWeight: '600' },
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
