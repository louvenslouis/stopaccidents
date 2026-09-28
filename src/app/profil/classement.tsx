import { useState } from 'react';
import { useRouter } from 'expo-router';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import { ActivityIndicator, StyleSheet } from 'react-native';
import Crown from 'lucide-react-native/icons/crown';
import MapPin from 'lucide-react-native/icons/map-pin';
import Globe from 'lucide-react-native/icons/globe';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import Medal from 'lucide-react-native/icons/medal';
import { AppScreen } from '@/components/app-screen';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AppIcon } from '@/components/ui/app-icon';
import { surfaceDepth } from '@/components/ui/surface-depth';
import { TrophyArt } from '@/components/leaderboard/trophy-art';
import { CommunePicker } from '@/components/leaderboard/commune-picker';
import { Text, View } from '@/features/language/native';
import { createThemedStyles, useThemeColor } from '@/features/appearance/theme-provider';
import { communes } from '@/features/reports/territories';
import { leaderboardPeriods, type LeaderboardEntry, type LeaderboardPeriod, type LeaderboardScope } from '@/features/leaderboard/model';
import { useLeaderboard } from '@/features/leaderboard/use-leaderboard';

function Score({ points, light = false }: { points: number; light?: boolean }) {
  const s = useStyles();
  return <Text style={[s.score, light && s.lightText]}><Text translate={false}>{points.toLocaleString('fr-FR')}</Text> <Text style={s.unit}>pts</Text></Text>;
}
function Podium({ entries }: { entries: LeaderboardEntry[] }) {
  const s = useStyles();
  const c = useThemeColor();
  const podium = entries.length >= 2 ? [entries[1], entries[0], ...entries.slice(2, 3)] : entries.slice(0, 1);
  return <View style={s.podium}>
    {podium.map((entry) => <View key={entry.alias} style={s.podiumColumn}>
      <View style={s.crownSlot}>{entry.rank === 1 && <AppIcon icon={Crown} color={c('#B17D2D', 'warning')} size={25} fill={c('#F3D28A', 'warningSoft')} />}</View>
      <View style={[s.avatar, entry.rank === 1 ? s.goldAvatar : entry.rank === 2 ? s.silverAvatar : s.bronzeAvatar]}>
        <Text translate={false} style={s.initial}>{entry.alias.slice(0, 1)}</Text>
        <View style={s.medal}><Text translate={false} style={s.medalText}>{entry.rank}</Text></View>
      </View>
      <Text translate={false} numberOfLines={2} style={s.podiumAlias}>{entry.alias}</Text>
      <View style={s.youSlot}>{entry.is_me && <Text style={s.you}>Vous</Text>}</View>
      <View style={[s.plinth, entry.rank === 1 ? s.firstPlinth : entry.rank === 2 ? s.secondPlinth : s.thirdPlinth]}>
        <View style={s.plinthShine} />
        <Score points={entry.points} />
        <Text translate={false} style={s.plinthRank}>{String(entry.rank).padStart(2, '0')}</Text>
      </View>
    </View>)}
  </View>;
}
function RankRow({ entry, featured = false }: { entry: LeaderboardEntry; featured?: boolean }) {
  const s = useStyles();
  const c = useThemeColor();
  return <View style={[s.row, featured && s.featuredRow, entry.is_me && s.myRow]}>
    <View style={[s.rankBadge, featured && s.featuredBadge]}><Text translate={false} style={s.rank}>{String(entry.rank).padStart(2, '0')}</Text></View>
    <View style={s.rowName}><Text translate={false} style={s.alias}>{entry.alias}</Text>{entry.is_me && <Text style={s.you}>Vous</Text>}</View>
    {featured && <AppIcon icon={Medal} size={21} color={c('#88986D', 'success')} />}
    <Score points={entry.points} />
  </View>;
}
export default function LeaderboardScreen() {
  const s = useStyles();
  const c = useThemeColor();
  const router = useRouter();
  const [period, setPeriod] = useState<LeaderboardPeriod>('all');
  const [scope, setScope] = useState<LeaderboardScope>('country');
  const [commune, setCommune] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const needsCommune = scope === 'commune' && !commune;
  const board = useLeaderboard(period, scope === 'commune' ? commune : null, !needsCommune);
  const selectedCommune = communes.find((item) => item.code === commune);
  const entries = board.data?.entries ?? [];
  return <>
    <AppScreen title="Classement" hideIntro contentContainerStyle={s.content} headerLeft={<View style={s.pageHeading}>
      <AnimatedPressable accessibilityRole="button" accessibilityLabel="Retour au profil" onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/profil'); }} style={s.refresh}>
        <AppIcon icon={ChevronLeft} size={22} color={c('#53634A', 'secondary')} />
      </AnimatedPressable>
      <Text style={s.pageTitle}>Classement</Text>
    </View>}
      headerRight={<AnimatedPressable accessibilityRole="button" accessibilityLabel="Actualiser le classement" disabled={board.loading || needsCommune} onPress={board.refresh} style={s.refresh}><AppIcon icon={RefreshCw} size={19} color={c('#53634A', 'secondary')} /></AnimatedPressable>}>
      <View style={s.hero}>
        <View style={s.heroCopy}><Text style={s.eyebrow}>POINTS DE VIGILANCE</Text><Text style={s.heroTitle}>Chaque geste{ '\n' }compte.</Text></View>
        <TrophyArt />
      </View>
      <View style={s.scopeTabs}>
        {([{ id: 'country', label: 'National', icon: Globe }, { id: 'commune', label: 'Communal', icon: MapPin }] as const).map((option) => <AnimatedPressable key={option.id} accessibilityRole="tab" accessibilityState={{ selected: scope === option.id }} haptic="selection"
          onPress={() => { setScope(option.id); if (option.id === 'commune' && !commune) setPickerOpen(true); }} style={[s.scopeTab, scope === option.id && s.scopeActive]}>
          <AppIcon icon={option.icon} size={17} color={scope === option.id ? '#FFFFFF' : c('#68735F', 'secondary')} />
          <Text style={[s.scopeLabel, scope === option.id && s.lightText]}>{option.label}</Text>
        </AnimatedPressable>)}
      </View>
      <View style={s.periods}>{leaderboardPeriods.map((option) => <AnimatedPressable key={option.id} accessibilityRole="tab" accessibilityState={{ selected: period === option.id }} onPress={() => setPeriod(option.id)} haptic="selection" style={[s.period, period === option.id && s.periodActive]}><Text style={[s.periodLabel, period === option.id && s.periodLabelActive]}>{option.label}</Text></AnimatedPressable>)}</View>
      {scope === 'commune' && <AnimatedPressable accessibilityRole="button" accessibilityLabel="Choisir une commune" onPress={() => setPickerOpen(true)} style={s.communeControl}>
        <AppIcon icon={MapPin} size={18} color={c('#53634A', 'secondary')} />
        <Text translate={!selectedCommune} style={s.communeLabel}>{selectedCommune?.name ?? 'Choisir une commune'}</Text><AppIcon icon={ChevronDown} size={17} />
      </AnimatedPressable>}
      {!needsCommune && <>
        {board.data?.me && <View style={s.personal}>
          <View style={s.personalName}><Text style={s.personalLabel}>Votre position</Text><Text translate={false} style={s.personalAlias}>{board.data.me.alias}</Text></View>
          <Text translate={board.data.me.rank === null} style={board.data.me.rank === null ? s.personalAlias : s.personalRank}>{board.data.me.rank === null ? 'Non classé' : `#${board.data.me.rank}`}</Text>
          <Score points={board.data.me.points} light />
        </View>}
        {board.loading && !board.data ? <View style={s.state} accessibilityLabel="Chargement du classement" accessibilityRole="progressbar"><ActivityIndicator color={c('#63794C', 'success')} /></View>
          : board.error && !board.data ? <View style={s.state}><Text style={s.stateTitle}>Classement indisponible</Text><AnimatedPressable accessibilityRole="button" onPress={board.refresh} style={s.retry}><Text style={s.action}>Réessayer</Text></AnimatedPressable></View>
          : entries.length === 0 ? <View style={s.state}><AppIcon icon={Medal} size={36} color={c('#C29C53', 'warning')} /><Text style={s.stateTitle}>Aucun point pour le moment</Text></View>
          : <>
            <View style={s.sectionHeading}><Text style={s.sectionTitle}>En tête</Text><Text translate={scope !== 'commune'} style={s.territory}>{scope === 'country' ? 'Tout Haïti' : selectedCommune?.name}</Text></View>
            <View style={s.leadersCard}><Podium entries={entries.slice(0, 3)} />
              <View style={s.runners}>{entries.slice(3, 5).map((entry) => <RankRow key={entry.alias} entry={entry} featured />)}</View>
            </View>
            {entries.length > 5 && <View style={s.rest}><View style={s.sectionHeading}><Text style={s.sectionTitle}>Le classement</Text><Text style={s.territory}>{board.data?.total} contributeurs</Text></View>{entries.slice(5).map((entry) => <RankRow key={entry.alias} entry={entry} />)}</View>}
          </>}
      </>}
    </AppScreen>
    {pickerOpen && <CommunePicker selected={commune} onClose={() => setPickerOpen(false)} onSelect={(code) => { setCommune(code); setPickerOpen(false); }} />}
  </>;
}
const useStyles = createThemedStyles((c) => StyleSheet.create({
  content: { width: '100%', maxWidth: 688, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 132 },
  pageHeading: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  pageTitle: { fontSize: 27, letterSpacing: -0.8, fontWeight: '800', color: c('#29392F', 'text') },
  refresh: { ...surfaceDepth(c, 'control'), width: 44, height: 44, borderRadius: 22, backgroundColor: c('#FFFFFF', 'surface'), alignItems: 'center', justifyContent: 'center' },
  hero: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 22, paddingHorizontal: 6, gap: 10 },
  heroCopy: { flex: 1 },
  eyebrow: { fontSize: 9, fontWeight: '800', letterSpacing: 1.5, color: c('#8B977C', 'muted'), marginBottom: 9 },
  heroTitle: { fontSize: 32, lineHeight: 36, fontWeight: '800', letterSpacing: -1.1, color: c('#34432D', 'text') },
  scopeTabs: { ...surfaceDepth(c, 'inset'), flexDirection: 'row', padding: 5, gap: 5, borderRadius: 21, backgroundColor: c('#EBEEE5', 'elevated') },
  scopeTab: { flex: 1, minHeight: 46, borderRadius: 17, flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center' },
  scopeActive: { ...surfaceDepth(c, 'raised'), backgroundColor: c('#546747', 'successSoft') },
  scopeLabel: { fontSize: 14, fontWeight: '700', color: c('#68735F', 'secondary') },
  lightText: { color: '#FFFFFF' },
  periods: { flexDirection: 'row', gap: 4, marginTop: 17, marginBottom: 8 },
  period: { flex: 1, minHeight: 44, paddingHorizontal: 3, paddingVertical: 10, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  periodActive: { ...surfaceDepth(c, 'control'), backgroundColor: c('#FFFFFF', 'surface') },
  periodLabel: { fontSize: 11, fontWeight: '600', color: c('#84897C', 'muted'), textAlign: 'center' },
  periodLabelActive: { color: c('#34432D', 'text'), fontWeight: '800' },
  communeControl: { ...surfaceDepth(c, 'control'), flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, backgroundColor: c('#FFFFFF', 'surface'), borderRadius: 17, marginTop: 10 },
  communeLabel: { flex: 1, color: c('#34432D', 'text'), fontSize: 14, fontWeight: '600' },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, paddingVertical: 20 },
  sectionTitle: { color: c('#34432D', 'text'), fontSize: 17, fontWeight: '700', letterSpacing: -0.4 },
  territory: { flexShrink: 1, color: c('#89927E', 'muted'), fontSize: 11, textAlign: 'right' },
  leadersCard: { ...surfaceDepth(c, 'card'), backgroundColor: c('#F0F2E9', 'surface'), borderRadius: 27, borderWidth: 1, borderColor: c('#E3E8D7', 'border'), paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12 },
  podium: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 7, paddingHorizontal: 1 },
  podiumColumn: { flex: 1, maxWidth: 170, minWidth: 0, alignItems: 'center' },
  crownSlot: { height: 31, justifyContent: 'center' },
  avatar: { ...surfaceDepth(c, 'raised'), width: 58, height: 58, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: c('#FFFFFF', 'border'), marginBottom: 15 },
  goldAvatar: { backgroundColor: c('#F3D38D', 'warningSoft'), transform: [{ rotate: '-5deg' }] },
  silverAvatar: { backgroundColor: c('#DEE5E7', 'infoSoft') },
  bronzeAvatar: { backgroundColor: c('#E8CCB2', 'accentSoft') },
  initial: { fontSize: 27, fontWeight: '800', color: c('#635638', 'text') },
  medal: { position: 'absolute', bottom: -11, alignSelf: 'center', width: 23, height: 23, borderRadius: 9, backgroundColor: c('#FFFFFF', 'elevated'), alignItems: 'center', justifyContent: 'center', ...surfaceDepth(c, 'control') },
  medalText: { fontSize: 11, fontWeight: '800', color: c('#746340', 'text') },
  podiumAlias: { width: '100%', minHeight: 32, textAlign: 'center', fontSize: 11, lineHeight: 15, fontWeight: '700', color: c('#3D4937', 'text') },
  youSlot: { height: 20, justifyContent: 'center' },
  you: { color: c('#6B8053', 'success'), fontSize: 10, fontWeight: '700' },
  plinth: { ...surfaceDepth(c, 'raised'), width: '100%', alignItems: 'center', paddingTop: 18, borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: 'hidden', borderWidth: 1, borderBottomWidth: 0, borderColor: c('#FFFFFF80', 'border') },
  firstPlinth: { height: 130, backgroundColor: c('#EED49A', 'warningSoft') },
  secondPlinth: { height: 102, backgroundColor: c('#DBE2DE', 'elevated') },
  thirdPlinth: { height: 85, backgroundColor: c('#E4CCB6', 'accentSoft') },
  plinthShine: { position: 'absolute', top: 0, left: 0, right: 0, height: 7, backgroundColor: '#FFFFFF35' },
  plinthRank: { color: c('#FFFFFF95', 'border'), fontSize: 46, fontWeight: '900', letterSpacing: -3, marginTop: 2 },
  score: { color: c('#495139', 'text'), fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
  unit: { fontSize: 10, fontWeight: '600' },
  runners: { gap: 8, marginTop: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 72, paddingVertical: 13, borderBottomWidth: 1, borderColor: c('#E9ECE3', 'border') },
  featuredRow: { ...surfaceDepth(c, 'control'), backgroundColor: c('#FFFFFF', 'elevated'), paddingHorizontal: 12, borderRadius: 17, borderBottomWidth: 0 },
  myRow: { backgroundColor: c('#EDF2E4', 'successSoft'), borderRadius: 17, paddingHorizontal: 12 },
  rankBadge: { width: 30, alignItems: 'center', justifyContent: 'center' },
  featuredBadge: { ...surfaceDepth(c, 'raised'), width: 34, height: 38, backgroundColor: c('#EFF2E8', 'successSoft'), borderRadius: 12 },
  rank: { fontSize: 14, fontWeight: '700', color: c('#82916F', 'secondary'), fontVariant: ['tabular-nums'] },
  rowName: { flex: 1, minWidth: 0, gap: 4 },
  alias: { fontSize: 13, fontWeight: '600', color: c('#3D4937', 'text') },
  personal: { ...surfaceDepth(c, 'raised'), flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14, backgroundColor: c('#536747', 'successSoft'), borderRadius: 21, padding: 19, marginTop: 22 },
  personalName: { flex: 1, minWidth: 110, gap: 6 },
  personalLabel: { color: '#E1EACC', fontSize: 10, fontWeight: '600' },
  personalAlias: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  personalRank: { color: '#FFFFFF', fontSize: 25, fontWeight: '800', letterSpacing: -1 },
  rest: { marginTop: 4 },
  state: { paddingVertical: 65, alignItems: 'center', gap: 18 },
  stateTitle: { fontSize: 15, fontWeight: '600', color: c('#69745F', 'secondary'), textAlign: 'center' },
  retry: { padding: 14 },
  action: { color: c('#536747', 'success'), fontSize: 13, fontWeight: '700' },
}));
