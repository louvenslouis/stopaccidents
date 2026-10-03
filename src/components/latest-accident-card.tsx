import { ReportCardActions } from '@/components/report-card-actions';
import Flame from 'lucide-react-native/icons/flame';
import { surfaceDepth } from '@/components/ui/surface-depth';
import { ContrastSurface } from '@/features/navigation/tab-contrast-provider';
import { Pressable, Text, View } from '@/features/language/native';
import { createThemedStyles, useThemeColor } from '@/features/appearance/theme-provider';
import ShieldAlert from 'lucide-react-native/icons/shield-alert';
import Construction from 'lucide-react-native/icons/construction';
import ArrowUpRight from 'lucide-react-native/icons/arrow-up-right';
import CalendarDays from 'lucide-react-native/icons/calendar-days';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import Clock3 from 'lucide-react-native/icons/clock-3';
import Hash from 'lucide-react-native/icons/hash';
import CarFront from 'lucide-react-native/icons/car-front';
import MapPin from 'lucide-react-native/icons/map-pin';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import TriangleAlert from 'lucide-react-native/icons/triangle-alert';
import UserRoundSearch from 'lucide-react-native/icons/user-round-search';
import Wrench from 'lucide-react-native/icons/wrench';
import { useState, type ReactNode } from 'react';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AppIcon } from '@/components/ui/app-icon';
import { GeocodingCredit } from '@/components/geocoding-credit';
import {
  formatAccidentDate,
  accidentSeverity,
  accidentTypeLabel,
} from '@/features/accident-report/presentation';
import {
  reportSelection,
  type SafetyReportSummary,
} from '@/features/safety-report/read';
import { useReportLocation } from '@/features/safety-report/use-report-location';

const disclosureTiming = { duration: 320, easing: Easing.inOut(Easing.cubic), reduceMotion: ReduceMotion.System };

function CardDisclosure({ expanded, children }: { expanded: boolean; children: ReactNode }) {
  const contentHeight = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({
    height: withTiming(expanded ? contentHeight.value : 0, disclosureTiming),
    opacity: withTiming(expanded ? 1 : 0, disclosureTiming),
  }));
  return (
    <Animated.View style={[{ overflow: 'hidden' }, animatedStyle]} pointerEvents={expanded ? 'auto' : 'none'} aria-hidden={!expanded}>
      <View style={{ position: 'absolute', width: '100%', top: 0 }} onLayout={({ nativeEvent }) => {
        contentHeight.value = nativeEvent.layout.height;
      }}>
        {children}
      </View>
    </Animated.View>
  );
}

export function LatestAccidentCard({
  report,
  loading,
  error,
  onRefresh,
  onOpen,
}: {
  report: SafetyReportSummary | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpen: (id: string) => void;
}) {
  const styles = useStyles();
  const themeColor = useThemeColor();

  const [expanded, setExpanded] = useState(false);
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: withTiming(expanded ? '180deg' : '0deg', disclosureTiming) }],
  }));
  const isSuspiciousVehicle = report?.report_kind === 'suspicious_vehicle';
  const isGunfire = report?.report_kind === 'gunfire';
  const isArmedPresence = report?.report_kind === 'armed_presence';
  const isBarricade = report?.report_kind === 'barricade';
  const isKidnapping = report?.report_kind === 'kidnapping';
  const isBreakdown = report?.report_kind === 'breakdown';
  const severity = report?.report_kind === 'accident' ? accidentSeverity(report) : null;
  const location = useReportLocation(report);
  const reportLabel = report?.report_kind === 'fire' ? 'Incendie' : isGunfire ? 'Tirs entendus' : isSuspiciousVehicle ? 'Vehicule Suspect' : isArmedPresence ? 'Présence d’hommes armés' : isBarricade ? 'Route barricadée' : isBreakdown ? 'Véhicule en panne' : isKidnapping
    ? 'Enlèvement'
    : report?.report_kind === 'accident'
      ? accidentTypeLabel(report)
      : '';
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          Dernier signalement
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Actualiser le dernier signalement"
          accessibilityState={{ busy: loading, disabled: loading }}
          disabled={loading}
          onPress={onRefresh}
          style={styles.refresh}
        >
          {loading ? (
            <ActivityIndicator size="small" color={themeColor("#787E89", 'muted')} />
          ) : (
            <AppIcon icon={RefreshCw} size={18} color={themeColor("#787E89", 'muted')} />
          )}
        </Pressable>
      </View>
      {report ? (
        <ContrastSurface style={[styles.card, styles.compactCard]}>
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel={`${expanded ? 'Réduire' : 'Déployer'} le dernier signalement : ${reportLabel}. ${location.estimated ? 'Zone estimée' : 'Lieu'} : ${location.label}.${severity ? ` Gravité : ${severity.label}.` : ''}`}
            accessibilityState={{ expanded }}
            onPress={() => setExpanded((value) => !value)}
            pressedScale={0.985}
            hoverScale={1.005}
            style={styles.cardToggle}
          >
            <View style={styles.cardHeader}>
              <View style={[styles.iconBox, styles.compactIconBox, isKidnapping && styles.kidnappingIconBox]}>
                <AppIcon
                  icon={report.report_kind === 'fire' ? Flame : isGunfire || isArmedPresence ? ShieldAlert : isBarricade ? Construction : isBreakdown ? Wrench : isKidnapping ? UserRoundSearch : CarFront}
                  size={26}
                  color={isKidnapping ? themeColor('#7C3FA0', 'violet') : themeColor('#D94235', 'accent')}
                />
              </View>
              <View style={[styles.heading, styles.compactHeading]}>
                <Text style={styles.eyebrow}>
                  {report.report_kind !== 'accident' ? 'TYPE DE SIGNALEMENT' : 'TYPE D’ACCIDENT'}
                </Text>
                <Text
                  style={[styles.type, styles.compactType]}
                  numberOfLines={2}
                >
                  {reportLabel}
                </Text>
              </View>
              <Animated.View style={[styles.chevronBox, chevronStyle]}>
                <AppIcon icon={ChevronDown} size={19} color={themeColor("#737C89", 'muted')} />
              </Animated.View>
            </View>
            <CardDisclosure expanded={!expanded}>
              <View style={styles.compactSummary}>
                <View style={styles.compactLine}>
                  <AppIcon icon={MapPin} size={15} strokeWidth={1.7} color={themeColor("#858C98", 'muted')} />
                  <Text style={styles.compactLocation} numberOfLines={1}>
                    {<Text translate={false}>{location.label}</Text>}
                  </Text>
                </View>
                <View style={styles.compactBottom}>
                  <View style={styles.compactLine}>
                    <AppIcon icon={Clock3} size={15} strokeWidth={1.7} color={themeColor("#858C98", 'muted')} />
                    <Text style={styles.compactDate}>{formatAccidentDate(report.created_at)}</Text>
                  </View>
                  {severity && (
                    <View style={[styles.compactSeverity, { backgroundColor: severity.tint }]}>
                      <Text style={[styles.compactSeverityText, { color: severity.color }]}>
                        {severity.label}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
              {location.estimated && <GeocodingCredit />}
            </CardDisclosure>
          </AnimatedPressable>
          <CardDisclosure expanded={expanded}>
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityLabel={`Voir les détails du signalement : ${reportLabel}`}
              accessibilityHint="Ouvre la fiche complète de ce signalement"
              onPress={() => onOpen(reportSelection(report))}
              pressedScale={0.985}
              hoverScale={1.005}
            >
              {report.testimony_count && <Text style={{ color: themeColor('#267E70', 'success'), fontSize: 13, paddingHorizontal: 18, paddingBottom: 12 }}>{report.testimony_count} témoignage{report.testimony_count > 1 ? 's' : ''} · dernier témoignage {formatAccidentDate(report.last_observed_at ?? report.created_at)}</Text>}
              <View style={styles.badges}>
                <View style={[styles.badge, { backgroundColor: isKidnapping ? themeColor('#F4ECF8', 'violetSoft') : themeColor('#EEF2FF', 'infoSoft') }]}>
                  <AppIcon icon={report.report_kind === 'fire' ? Flame : isGunfire || isArmedPresence ? ShieldAlert : isBarricade ? Construction : isBreakdown ? Wrench : isKidnapping ? UserRoundSearch : CarFront} size={15} strokeWidth={1.6} color={isKidnapping ? themeColor('#7C3FA0', 'violet') : themeColor('#4358C7', 'info')} />
                  <Text style={[styles.badgeText, { color: isKidnapping ? themeColor('#7C3FA0', 'violet') : themeColor('#4358C7', 'info') }]}>
                    {isGunfire ? 'Tirs entendus' : isSuspiciousVehicle ? 'Vehicule Suspect' : isArmedPresence ? 'Hommes armés' : isBarricade ? 'Route barricadée' : isBreakdown ? 'Véhicule en panne' : isKidnapping ? 'Enlèvement' : report.report_kind === 'fire' ? 'Incendie' : 'Accident'}
                  </Text>
                </View>
                {severity && (
                  <View style={[styles.badge, { backgroundColor: severity.tint }]}>
                    <AppIcon icon={TriangleAlert} size={15} strokeWidth={1.6} color={severity.color} />
                    <Text style={[styles.badgeText, { color: severity.color }]}>
                      Gravité · {severity.label}
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.grid}>
                <View style={styles.gridRow}>
                  <View style={[styles.metric, styles.metricLeft]}>
                    <View style={styles.metricLabel}>
                      <AppIcon icon={MapPin} size={17} strokeWidth={1.6} color={themeColor("#858C98", 'muted')} />
                      <Text style={styles.label}>{location.estimated ? 'Zone estimée' : 'Lieu'}</Text>
                    </View>
                    <Text style={styles.value}>{<Text translate={false}>{location.label}</Text>}</Text>
                    {location.estimated && <GeocodingCredit />}
                  </View>
                  <View style={styles.metric}>
                    <View style={styles.metricLabel}>
                      <AppIcon icon={Hash} size={17} strokeWidth={1.6} color={themeColor("#858C98", 'muted')} />
                      <Text style={styles.label}>Matricule</Text>
                    </View>
                    <Text style={styles.value}>Non renseigné</Text>
                  </View>
                </View>
                <View style={[styles.gridRow, styles.gridRowLast]}>
                  <View style={[styles.metric, styles.metricLeft]}>
                    <View style={styles.metricLabel}>
                      <AppIcon icon={Clock3} size={17} strokeWidth={1.6} color={themeColor("#858C98", 'muted')} />
                      <Text style={styles.label}>Heure</Text>
                    </View>
                    <Text style={styles.value}>
                      {new Date(report.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <View style={styles.metric}>
                    <View style={styles.metricLabel}>
                      <AppIcon icon={CalendarDays} size={17} strokeWidth={1.6} color={themeColor("#858C98", 'muted')} />
                      <Text style={styles.label}>Date</Text>
                    </View>
                    <Text style={styles.value}>
                      {new Date(report.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={styles.footer}>
                <View style={styles.cta}>
                  <Text style={styles.ctaText}>Voir les détails</Text>
                  <AppIcon icon={ArrowUpRight} size={18} color={themeColor("#D94235", 'accent')} />
                </View>
              </View>
            </AnimatedPressable>
          </CardDisclosure>
          <ReportCardActions key={reportSelection(report)} report={report} onUpdated={onRefresh} />
        </ContrastSurface>
      ) : (
        <View
          style={[styles.card, styles.empty]}
          accessibilityLiveRegion="polite"
        >
          <View style={styles.emptyIcon}>
            <AppIcon
              icon={error ? TriangleAlert : CarFront}
              size={29}
              color={themeColor("#8B929D", 'muted')}
            />
          </View>
          <Text style={styles.emptyTitle}>
            {loading
              ? 'Chargement des signalements…'
              : error
                ? 'Chargement indisponible'
                : 'Aucun signalement'}
          </Text>
          <Text style={styles.emptyText}>
            {loading
              ? 'Les dernières informations arrivent ici.'
              : (error ??
                'Le dernier accident ou enlèvement apparaîtra ici dès qu’un signalement sera enregistré.')}
          </Text>
          {error && !loading && (
            <Pressable
              accessibilityRole="button"
              onPress={onRefresh}
              style={styles.retry}
            >
              <Text style={styles.ctaText}>Réessayer</Text>
            </Pressable>
          )}
        </View>
      )}
      {report && error && (
        <Text accessibilityRole="alert" style={styles.error}>
          Actualisation impossible. Les dernières informations chargées restent
          affichées.
        </Text>
      )}
    </View>
  );
}

const useStyles = createThemedStyles((themeColor) => StyleSheet.create({
  section: { marginTop: 12, width: '100%', maxWidth: 640, alignSelf: 'center' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    color: themeColor('#24262C', 'text'),
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  refresh: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  card: {
    ...surfaceDepth(themeColor, 'card'),
    padding: 22,
    borderRadius: 30,
    backgroundColor: themeColor('#FFFFFF', 'surface'),
  },
  compactCard: { padding: 20, borderRadius: 28, borderTopWidth: 4, borderTopColor: themeColor('#E66E4F', 'accent'), backgroundColor: themeColor('#FFFAF5', 'surface') },
  cardToggle: { width: '100%' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  iconBox: {
    ...surfaceDepth(themeColor, 'control'),
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: themeColor('#FFF0EC', 'accentSoft'),
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactIconBox: { width: 54, height: 54, borderRadius: 18 },
  kidnappingIconBox: { backgroundColor: themeColor('#F4ECF8', 'violetSoft') },
  heading: { flex: 1, minWidth: 0 },
  compactHeading: { paddingRight: 0 },
  eyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
    color: themeColor('#888D97', 'muted'),
  },
  type: {
    color: themeColor('#20242C', 'text'),
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginTop: 5,
  },
  compactType: { fontSize: 18, lineHeight: 22, marginTop: 3 },
  chevronBox: {
    ...surfaceDepth(themeColor, 'control'),
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: themeColor('#F4F5F7', 'elevated'),
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactSummary: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: themeColor('#E9ECF0', 'border'),
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
  },
  compactLine: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1, minWidth: 0 },
  compactLocation: { color: themeColor('#3E4551', 'secondary'), fontSize: 13, fontWeight: '500', flexShrink: 1 },
  compactBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  compactDate: { color: themeColor('#737C89', 'muted'), fontSize: 12, flexShrink: 1 },
  compactSeverity: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  compactSeverityText: { fontSize: 11, fontWeight: '600' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  grid: { marginTop: 22, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: themeColor('#E9ECF0', 'border') },
  gridRow: { flexDirection: 'row' },
  gridRowLast: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: themeColor('#E9ECF0', 'border') },
  metric: { flex: 1, minWidth: 0, paddingVertical: 18, paddingLeft: 16 },
  metricLeft: { paddingLeft: 0, paddingRight: 16, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: themeColor('#E9ECF0', 'border') },
  metricLabel: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  label: { color: themeColor('#737C89', 'muted'), fontSize: 12, fontWeight: '500', flexShrink: 1 },
  value: { color: themeColor('#293241', 'text'), fontSize: 14, lineHeight: 21, fontWeight: '500', marginTop: 8 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexShrink: 1,
  },
  badgeText: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  footer: {
    marginTop: 0,
    paddingTop: 17,
    minHeight: 48,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: themeColor('#F0F1F3', 'border'),
    gap: 12,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ctaText: { color: themeColor('#C43F32', 'accent'), fontSize: 14, fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: 32, gap: 12 },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: themeColor('#F4F5F7', 'elevated'),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    color: themeColor('#3E4551', 'secondary'),
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyText: {
    maxWidth: 300,
    color: themeColor('#7C8491', 'muted'),
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  retry: { padding: 12, minHeight: 44 },
  error: { marginTop: 12, color: themeColor('#9D4C29', 'accent'), fontSize: 12, lineHeight: 18 },
}));
