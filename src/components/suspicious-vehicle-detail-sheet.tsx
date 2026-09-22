import { Image } from 'expo-image';
import ArrowUpRight from 'lucide-react-native/icons/arrow-up-right';
import MapPin from 'lucide-react-native/icons/map-pin';
import ShieldAlert from 'lucide-react-native/icons/shield-alert';
import X from 'lucide-react-native/icons/x';
import { useCallback, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from '@/components/ui/app-icon';
import { GeocodingCredit } from '@/components/geocoding-credit';
import { formatAccidentDate } from '@/features/accident-report/presentation';
import { useAccident } from '@/features/accident-report/use-accident';
import { readSuspiciousVehicleReport } from '@/features/safety-report/read';
import { useReportLocation } from '@/features/safety-report/use-report-location';

const statusLabels = {
  received: 'Signalement reçu',
  reviewing: 'En cours d’examen',
  closed: 'Dossier clôturé',
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {title}
      </Text>
      {children}
    </View>
  );
}

export function SuspiciousVehicleDetailSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const loader = useCallback((signal: AbortSignal) => readSuspiciousVehicleReport(id, signal), [id]);
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
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={[styles.overlay, width >= 700 && styles.wideOverlay]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fermer la fiche de la voiture suspecte"
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
          ]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.heading}>
              <Text style={styles.eyebrow}>SIGNALEMENT</Text>
              <Text accessibilityRole="header" style={styles.title}>
                Voiture suspecte
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fermer les détails"
              onPress={onClose}
              style={styles.close}>
              <AppIcon icon={X} size={22} color="#667185" />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {!report ? (
              <View style={styles.state}>
                {loading && <ActivityIndicator color="#95621C" />}
                <Text style={styles.body}>
                  {loading
                    ? 'Chargement du signalement…'
                    : (error ?? 'Ce signalement n’est plus disponible.')}
                </Text>
                {!loading && (
                  <Pressable accessibilityRole="button" onPress={refresh} style={styles.linkButton}>
                    <Text style={styles.linkText}>Réessayer</Text>
                  </Pressable>
                )}
              </View>
            ) : (
              <>
                <View style={styles.summary}>
                  <View style={styles.iconBox}>
                    <AppIcon icon={ShieldAlert} size={27} color="#95621C" />
                  </View>
                  <View style={styles.heading}>
                    <Text style={styles.label}>Type de signalement</Text>
                    <Text style={styles.reportTitle}>Voiture suspecte</Text>
                  </View>
                </View>
                {report.completed_step < 3 && (
                  <Text style={styles.notice}>
                    Signalement en cours de complément. Certaines informations ne sont pas encore
                    renseignées.
                  </Text>
                )}
                <Section title="Lieu de la voiture suspecte">
                  <View style={styles.locationRow}>
                    <AppIcon icon={MapPin} size={19} color="#737D8D" />
                    <Text selectable style={[styles.body, styles.heading]}>
                      {location.estimated ? `Zone estimée : ${location.label}` : location.label}
                    </Text>
                  </View>
                  {location.estimated && <GeocodingCredit />}
                  {report.latitude !== null && report.longitude !== null && (
                    <Text selectable style={styles.muted}>
                      GPS : {report.latitude.toFixed(5)}, {report.longitude.toFixed(5)}
                      {report.location_accuracy_m !== null
                        ? ` · Précision ± ${Math.round(report.location_accuracy_m)} m`
                        : ''}
                    </Text>
                  )}
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel="Voir le lieu dans Google Maps"
                    onPress={() => void openMap()}
                    style={styles.linkButton}>
                    <Text style={styles.linkText}>Voir sur la carte</Text>
                    <AppIcon icon={ArrowUpRight} size={17} color="#95621C" />
                  </Pressable>
                  {mapError && (
                    <Text accessibilityRole="alert" style={styles.error}>
                      {mapError}
                    </Text>
                  )}
                </Section>
                <Section title="Informations du signalement">
                  <Text style={styles.status}>{statusLabels[report.status]}</Text>
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
                  <Section title="Situation observée">
                    <Text style={styles.muted}>
                      Informations déclarées par un usager, non vérifiées.
                    </Text>
                    <Text style={styles.label}>Description de la voiture</Text>
                    <Text selectable style={styles.body}>
                      {report.vehicle_description || 'Non renseigné'}
                    </Text>
                    <Text style={styles.label}>Faits observés</Text>
                    <Text selectable style={styles.body}>
                      {report.observed_behavior || 'Non renseignée'}
                    </Text>
                    <Text style={styles.label}>Précisions</Text>
                    <Text selectable style={styles.body}>
                      {report.details || 'Non renseigné'}
                    </Text>
                  </Section>
                {Boolean(report.photos?.length) && (
                  <Section title="Photo du véhicule">
                    {report.photos?.map((photo) => photo.url ? (
                      <Image key={photo.storage_path} source={{ uri: photo.url }} style={{ width: '100%', height: 240, borderRadius: 16 }} contentFit="contain" accessibilityLabel="Photo du véhicule signalé" />
                    ) : <Text key={photo.storage_path} style={styles.muted}>Photo indisponible. Actualisez les informations pour réessayer.</Text>)}
                  </Section>
                )}
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
                  style={styles.refresh}>
                  {loading ? (
                    <ActivityIndicator color="#667185" />
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

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: 'rgba(19, 28, 44, 0.42)',
  },
  wideOverlay: { justifyContent: 'center', padding: 24 },
  sheet: {
    width: '100%',
    maxWidth: 640,
    flexShrink: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: 'hidden',
  },
  wideSheet: { borderRadius: 30 },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#DDE0E5',
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
    borderBottomColor: '#F0F1F3',
  },
  heading: { flex: 1, minWidth: 0 },
  eyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: '#95621C',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.6,
    color: '#202A3A',
    marginTop: 5,
  },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F3F5F7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: { padding: 24, paddingBottom: 12, gap: 22 },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFF3F4',
    borderRadius: 20,
    padding: 18,
  },
  iconBox: {
    width: 50,
    height: 50,
    borderRadius: 17,
    backgroundColor: '#FBE6E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: { fontSize: 12, color: '#778293', fontWeight: '500' },
  reportTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#283448',
    marginTop: 4,
  },
  notice: {
    color: '#8B662B',
    backgroundColor: '#FFF8EA',
    padding: 14,
    borderRadius: 14,
    fontSize: 13,
    lineHeight: 20,
  },
  section: { gap: 10 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#29364A',
    marginBottom: 2,
  },
  body: { fontSize: 14, lineHeight: 22, color: '#455168' },
  muted: { fontSize: 13, lineHeight: 20, color: '#808999' },
  locationRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    alignSelf: 'flex-start',
  },
  linkText: { color: '#95621C', fontSize: 13, fontWeight: '600' },
  status: {
    color: '#41605C',
    backgroundColor: '#EFF5F3',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignSelf: 'flex-start',
    fontSize: 12,
    fontWeight: '600',
  },
  privacyNotice: {
    color: '#66516F',
    backgroundColor: '#FFF3F4',
    padding: 14,
    borderRadius: 14,
    fontSize: 13,
    lineHeight: 20,
  },
  reference: { color: '#939BA7', fontSize: 10, lineHeight: 16 },
  state: { alignItems: 'center', paddingVertical: 40, gap: 16 },
  error: { color: '#B14832', fontSize: 13, lineHeight: 20 },
  refresh: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#F3F5F7',
  },
  refreshText: { fontSize: 13, fontWeight: '600', color: '#667185' },
});
