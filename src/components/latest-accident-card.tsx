import ArrowUpRight from 'lucide-react-native/icons/arrow-up-right';
import CalendarDays from 'lucide-react-native/icons/calendar-days';
import Clock3 from 'lucide-react-native/icons/clock-3';
import Hash from 'lucide-react-native/icons/hash';
import CarFront from 'lucide-react-native/icons/car-front';
import MapPin from 'lucide-react-native/icons/map-pin';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import TriangleAlert from 'lucide-react-native/icons/triangle-alert';
import UserRoundSearch from 'lucide-react-native/icons/user-round-search';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AppIcon } from '@/components/ui/app-icon';
import { GeocodingCredit } from '@/components/geocoding-credit';
import {
  accidentSeverity,
  accidentTypeLabel,
} from '@/features/accident-report/presentation';
import {
  reportSelection,
  type SafetyReportSummary,
} from '@/features/safety-report/read';
import { useReportLocation } from '@/features/safety-report/use-report-location';

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
  const isKidnapping = report?.report_kind === 'kidnapping';
  const severity = report?.report_kind === 'accident' ? accidentSeverity(report) : null;
  const location = useReportLocation(report);
  const reportLabel = isKidnapping
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
            <ActivityIndicator size="small" color="#787E89" />
          ) : (
            <AppIcon icon={RefreshCw} size={18} color="#787E89" />
          )}
        </Pressable>
      </View>
      {report ? (
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel={`Dernier signalement : ${reportLabel}. ${location.estimated ? 'Zone estimée' : 'Lieu'} : ${location.label}.${severity ? ` Gravité : ${severity.label}.` : ''}`}
          accessibilityHint="Ouvre la fiche complète de ce signalement"
          onPress={() => onOpen(reportSelection(report))}
          pressedScale={0.985}
          hoverScale={1.005}
          style={styles.card}
        >
          <View style={styles.cardHeader}>
            <View style={[styles.iconBox, isKidnapping && styles.kidnappingIconBox]}>
              <AppIcon
                icon={isKidnapping ? UserRoundSearch : CarFront}
                size={26}
                color={isKidnapping ? '#7C3FA0' : '#D94235'}
              />
            </View>
            <View style={styles.heading}>
              <Text style={styles.eyebrow}>
                {isKidnapping ? 'TYPE DE SIGNALEMENT' : 'TYPE D’ACCIDENT'}
              </Text>
              <Text style={styles.type}>{reportLabel}</Text>
            </View>
          </View>
          <View style={styles.badges}>
            <View style={[styles.badge, { backgroundColor: isKidnapping ? '#F4ECF8' : '#EEF2FF' }]}>
              <AppIcon icon={isKidnapping ? UserRoundSearch : CarFront} size={15} strokeWidth={1.6} color={isKidnapping ? '#7C3FA0' : '#4358C7'} />
              <Text style={[styles.badgeText, { color: isKidnapping ? '#7C3FA0' : '#4358C7' }]}>
                {isKidnapping ? 'Enlèvement' : 'Accident'}
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
                  <AppIcon icon={MapPin} size={17} strokeWidth={1.6} color="#858C98" />
                  <Text style={styles.label}>{location.estimated ? 'Zone estimée' : 'Lieu'}</Text>
                </View>
                <Text style={styles.value}>{location.label}</Text>
                {location.estimated && <GeocodingCredit />}
              </View>
              <View style={styles.metric}>
                <View style={styles.metricLabel}>
                  <AppIcon icon={Hash} size={17} strokeWidth={1.6} color="#858C98" />
                  <Text style={styles.label}>Matricule</Text>
                </View>
                <Text style={styles.value}>Non renseigné</Text>
              </View>
            </View>
            <View style={[styles.gridRow, styles.gridRowLast]}>
              <View style={[styles.metric, styles.metricLeft]}>
                <View style={styles.metricLabel}>
                  <AppIcon icon={Clock3} size={17} strokeWidth={1.6} color="#858C98" />
                  <Text style={styles.label}>Heure</Text>
                </View>
                <Text style={styles.value}>
                  {new Date(report.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
              <View style={styles.metric}>
                <View style={styles.metricLabel}>
                  <AppIcon icon={CalendarDays} size={17} strokeWidth={1.6} color="#858C98" />
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
              <AppIcon icon={ArrowUpRight} size={18} color="#D94235" />
            </View>
          </View>
        </AnimatedPressable>
      ) : (
        <View
          style={[styles.card, styles.empty]}
          accessibilityLiveRegion="polite"
        >
          <View style={styles.emptyIcon}>
            <AppIcon
              icon={error ? TriangleAlert : CarFront}
              size={29}
              color="#8B929D"
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

const styles = StyleSheet.create({
  section: { marginTop: 12, width: '100%', maxWidth: 640, alignSelf: 'center' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#24262C',
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
    padding: 22,
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
    boxShadow: '0 6px 28px rgba(24, 35, 52, 0.055)',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  iconBox: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: '#FFF0EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kidnappingIconBox: { backgroundColor: '#F4ECF8' },
  heading: { flex: 1, minWidth: 0 },
  eyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
    color: '#888D97',
  },
  type: {
    color: '#20242C',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginTop: 5,
  },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  grid: { marginTop: 22, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E9ECF0' },
  gridRow: { flexDirection: 'row' },
  gridRowLast: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E9ECF0' },
  metric: { flex: 1, minWidth: 0, paddingVertical: 18, paddingLeft: 16 },
  metricLeft: { paddingLeft: 0, paddingRight: 16, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: '#E9ECF0' },
  metricLabel: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  label: { color: '#737C89', fontSize: 12, fontWeight: '500', flexShrink: 1 },
  value: { color: '#293241', fontSize: 14, lineHeight: 21, fontWeight: '500', marginTop: 8 },
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
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F0F1F3',
    gap: 12,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ctaText: { color: '#C43F32', fontSize: 14, fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: 32, gap: 12 },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: '#F4F5F7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    color: '#3E4551',
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyText: {
    maxWidth: 300,
    color: '#7C8491',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  retry: { padding: 12, minHeight: 44 },
  error: { marginTop: 12, color: '#9D4C29', fontSize: 12, lineHeight: 18 },
});
