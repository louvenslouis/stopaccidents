import { Pressable, ScrollView, Text, View } from '@/features/language/native';
import { createThemedStyles, useThemeColor } from '@/features/appearance/theme-provider';
import { EventContributions } from '@/components/event-contributions';
import { GeocodingCredit } from '@/components/geocoding-credit';
import { AppIcon } from '@/components/ui/app-icon';
import { formatAccidentDate } from '@/features/accident-report/presentation';
import { useAccident } from '@/features/accident-report/use-accident';
import {
  breakdownOptionLabel,
  breakdownPositions,
  breakdownVehicleTypes,
  trafficImpacts,
} from '@/features/breakdown-report/model';
import { readBreakdownReport } from '@/features/safety-report/read';
import { useReportLocation } from '@/features/safety-report/use-report-location';
import { Image } from 'expo-image';
import ArrowUpRight from 'lucide-react-native/icons/arrow-up-right';
import MapPin from 'lucide-react-native/icons/map-pin';
import Wrench from 'lucide-react-native/icons/wrench';
import X from 'lucide-react-native/icons/x';
import { useCallback, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Modal, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const statusLabels = {
  received: 'Signalement reçu',
  reviewing: 'En cours d’examen',
  closed: 'Dossier clôturé',
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  const styles = useStyles();

  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  const styles = useStyles();

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Text selectable style={styles.body}>{value}</Text>
    </View>
  );
}

export function BreakdownDetailSheet({
  id,
  onClose,
  hideContributions = false,
}: {
  id: string;
  onClose: () => void;
  hideContributions?: boolean;
}) {
  const styles = useStyles();
  const themeColor = useThemeColor();

  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const loader = useCallback(
    (signal: AbortSignal) => readBreakdownReport(id, signal),
    [id],
  );
  const { data: report, loading, error, refresh } = useAccident(loader);
  const location = useReportLocation(report);
  const [mapError, setMapError] = useState<string | null>(null);

  async function openMap() {
    if (!report) return;
    const destination =
      report.latitude !== null && report.longitude !== null
        ? `${report.latitude},${report.longitude}`
        : report.location_description;
    try {
      setMapError(null);
      await Linking.openURL(
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`,
      );
    } catch {
      setMapError('Impossible d’ouvrir la carte. Réessayez.');
    }
  }

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, width >= 700 && styles.wideOverlay]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fermer la fiche du véhicule en panne"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            width >= 700 && styles.wideSheet,
            {
              maxHeight: height - insets.top - 20,
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.heading}>
              <Text style={styles.eyebrow}>SIGNALEMENT ROUTIER</Text>
              <Text accessibilityRole="header" style={styles.title}>
                Véhicule en panne
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fermer les détails"
              onPress={onClose}
              style={styles.close}
            >
              <AppIcon icon={X} size={22} color={themeColor("#667185", 'muted')} />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            {!report ? (
              <View style={styles.state}>
                {loading && <ActivityIndicator color={themeColor("#B76518", 'warning')} />}
                <Text style={styles.body}>
                  {loading
                    ? 'Chargement du signalement…'
                    : (error ?? 'Ce signalement n’est plus disponible.')}
                </Text>
                {!loading && (
                  <Pressable
                    accessibilityRole="button"
                    onPress={refresh}
                    style={styles.linkButton}
                  >
                    <Text style={styles.linkText}>Réessayer</Text>
                  </Pressable>
                )}
              </View>
            ) : (
              <>
                {!hideContributions && (
                  <EventContributions kind="breakdown" reportId={id} />
                )}
                <View style={styles.summary}>
                  <View style={styles.artBox}>
                    <Image
                      source={require('../../assets/images/breakdown-report/breakdown.png')}
                      style={styles.art}
                      contentFit="contain"
                      accessible={false}
                      alt=""
                    />
                  </View>
                  <View style={styles.heading}>
                    <Text style={styles.label}>Type de signalement</Text>
                    <Text style={styles.reportTitle}>Véhicule en panne</Text>
                  </View>
                </View>
                {report.completed_step < 4 && (
                  <Text style={styles.notice}>
                    Signalement en cours de complément. Certaines informations
                    ne sont pas encore renseignées.
                  </Text>
                )}
                <Section title="Lieu du véhicule">
                  <View style={styles.locationRow}>
                    <AppIcon icon={MapPin} size={19} color={themeColor("#737D8D", 'muted')} />
                    <Text selectable style={[styles.body, styles.heading]}>
                      {location.estimated ? <>{"Zone estimée : "}<Text translate={false}>{location.label}</Text>{""}</> : <Text translate={false}>{location.label}</Text>}
                    </Text>
                  </View>
                  {location.estimated && <GeocodingCredit />}
                  {report.latitude !== null && report.longitude !== null && (
                    <Text selectable style={styles.muted}>
                      GPS : {report.latitude.toFixed(5)},{' '}
                      {report.longitude.toFixed(5)}
                      {report.location_accuracy_m !== null
                        ? ` · Précision ± ${Math.round(report.location_accuracy_m)} m`
                        : ''}
                    </Text>
                  )}
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel="Voir le véhicule dans Google Maps"
                    onPress={() => void openMap()}
                    style={styles.linkButton}
                  >
                    <Text style={styles.linkText}>Voir sur la carte</Text>
                    <AppIcon icon={ArrowUpRight} size={17} color={themeColor("#B76518", 'warning')} />
                  </Pressable>
                  {mapError && (
                    <Text accessibilityRole="alert" style={styles.error}>
                      {mapError}
                    </Text>
                  )}
                </Section>
                <Section title="Situation observée">
                  <Text style={styles.muted}>
                    Informations déclarées par un usager, non vérifiées.
                  </Text>
                  <Field
                    label="Emplacement du véhicule"
                    value={breakdownOptionLabel(
                      breakdownPositions,
                      report.breakdown_position,
                    )}
                  />
                  <Field
                    label="Type de véhicule"
                    value={breakdownOptionLabel(
                      breakdownVehicleTypes,
                      report.vehicle_type,
                    )}
                  />
                  <Field
                    label="Impact sur la circulation"
                    value={breakdownOptionLabel(
                      trafficImpacts,
                      report.traffic_impact,
                    )}
                  />
                  <Field
                    label="Précisions"
                    value={report.details || 'Aucune précision ajoutée'}
                  />
                </Section>
                <Section title="Informations du signalement">
                  <View style={styles.statusRow}>
                    <AppIcon icon={Wrench} size={18} color={themeColor("#B76518", 'warning')} />
                    <Text style={styles.status}>{statusLabels[report.status]}</Text>
                  </View>
                  <Text style={styles.body}>
                    Signalé le {formatAccidentDate(report.created_at)}
                  </Text>
                  {report.updated_at !== report.created_at && (
                    <Text style={styles.muted}>
                      Mis à jour le {formatAccidentDate(report.updated_at)}
                    </Text>
                  )}
                  <Text selectable style={styles.reference}>
                    Référence : {report.id}
                  </Text>
                </Section>
                {error && (
                  <Text accessibilityRole="alert" style={styles.error}>
                    {error}
                  </Text>
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ busy: loading, disabled: loading }}
                  disabled={loading}
                  onPress={refresh}
                  style={styles.refresh}
                >
                  {loading ? (
                    <ActivityIndicator color={themeColor("#667185", 'muted')} />
                  ) : (
                    <Text style={styles.refreshText}>Actualiser les informations</Text>
                  )}
                </Pressable>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = createThemedStyles((themeColor) => StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: themeColor('rgba(19, 28, 44, 0.42)', 'overlay'),
  },
  wideOverlay: { justifyContent: 'center', padding: 24 },
  sheet: {
    width: '100%',
    maxWidth: 640,
    flexShrink: 1,
    backgroundColor: themeColor('#FFFFFF', 'surface'),
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: 'hidden',
  },
  wideSheet: { borderRadius: 30 },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: themeColor('#DDE0E5', 'elevated'),
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: themeColor('#F0F1F3', 'border'),
  },
  heading: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.1, color: themeColor('#9A6B3E', 'warning') },
  title: { color: themeColor('#1C2637', 'text'), fontSize: 24, fontWeight: '700', letterSpacing: -0.5 },
  close: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: themeColor('#F5F6F8', 'elevated'),
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: 24, gap: 18 },
  state: { minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: 14 },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 20,
    backgroundColor: themeColor('#FFF6EC', 'warningSoft'),
  },
  artBox: {
    width: 68,
    height: 68,
    borderRadius: 18,
    backgroundColor: themeColor('#fff', 'surface'),
    overflow: 'hidden',
  },
  art: { width: 68, height: 68 },
  label: { color: themeColor('#777F8C', 'muted'), fontSize: 12, fontWeight: '600' },
  reportTitle: { color: themeColor('#8D4C13', 'warning'), fontSize: 20, fontWeight: '700', marginTop: 4 },
  notice: {
    color: themeColor('#8D5C2D', 'warning'),
    fontSize: 13,
    lineHeight: 20,
    padding: 13,
    borderRadius: 13,
    backgroundColor: themeColor('#FFF8F0', 'surface'),
  },
  section: { gap: 11, paddingTop: 4 },
  sectionTitle: { color: themeColor('#263348', 'text'), fontSize: 17, fontWeight: '700' },
  field: { gap: 4, paddingVertical: 3 },
  body: { color: themeColor('#4F5A6B', 'secondary'), fontSize: 14, lineHeight: 21 },
  muted: { color: themeColor('#7B8593', 'muted'), fontSize: 12, lineHeight: 18 },
  locationRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  linkButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  linkText: { color: themeColor('#A35716', 'warning'), fontSize: 14, fontWeight: '700' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  status: { color: themeColor('#8D4C13', 'warning'), fontSize: 14, fontWeight: '700' },
  reference: { color: themeColor('#7B8593', 'muted'), fontSize: 11 },
  error: { color: themeColor('#BD2E40', 'accent'), fontSize: 13, lineHeight: 19 },
  refresh: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: themeColor('#F1F3F6', 'elevated'),
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshText: { color: themeColor('#4F5A6B', 'secondary'), fontSize: 14, fontWeight: '700' },
}));
