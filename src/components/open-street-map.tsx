import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { MapFrame } from './map-frame';
import { MAP_PAGE_URL, type AccidentMarker } from './map-frame-props';
import { useMapLocation } from '@/features/map/use-map-location';
import { LocateFixed, Navigation, Square } from 'lucide-react-native';

export function OpenStreetMap({
  markers,
  onSelect,
}: {
  markers: AccidentMarker[];
  onSelect: (id: string) => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [linkError, setLinkError] = useState(false);
  const gps = useMapLocation();
  const stopLocation = gps.stop;
  const onLoad = useCallback(
    () => setStatus((current) => (current === 'error' ? current : 'ready')),
    [],
  );
  const onError = useCallback(() => setStatus('error'), []);

  useEffect(() => {
    if (status !== 'loading') return;
    const timeout = setTimeout(() => setStatus('error'), 20000);
    return () => clearTimeout(timeout);
  }, [status, attempt]);

  useEffect(() => {
    if (status === 'error') stopLocation();
  }, [status, stopLocation]);

  return (
    <View style={styles.section}>
      <View style={styles.locationControls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            gps.tracking ? 'Recentrer sur ma position' : 'Me localiser'
          }
          disabled={status !== 'ready' || gps.locating}
          onPress={gps.locate}
          style={[
            styles.locationButton,
            (status !== 'ready' || gps.locating) && styles.disabled,
          ]}
        >
          {gps.locating ? (
            <ActivityIndicator size="small" color="#1767A6" />
          ) : (
            <LocateFixed size={18} color="#1767A6" />
          )}
          <Text style={styles.linkLabel}>
            {gps.locating
              ? 'Localisation…'
              : gps.tracking
                ? 'Recentrer'
                : 'Me localiser'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: gps.tracking }}
          disabled={status !== 'ready'}
          onPress={() =>
            gps.tracking || gps.locating ? gps.stop() : gps.start(true)
          }
          style={[
            styles.locationButton,
            styles.followButton,
            status !== 'ready' && styles.disabled,
          ]}
        >
          {gps.tracking || gps.locating ? (
            <Square size={16} color="#FFFFFF" />
          ) : (
            <Navigation size={18} color="#FFFFFF" />
          )}
          <Text style={styles.retryLabel}>
            {gps.tracking
              ? 'Arrêter le suivi'
              : gps.locating
                ? 'Annuler'
                : 'Suivre mon déplacement'}
          </Text>
        </Pressable>
      </View>
      <Text style={styles.hint} accessibilityLiveRegion="polite">
        {gps.locating
          ? 'Recherche de votre position…'
          : gps.tracking
            ? gps.location.following
              ? 'Suivi en temps réel actif.'
              : 'Suivi actif · Touchez Recentrer pour suivre votre position à l’écran.'
            : gps.location.position
              ? 'Position relevée · Activez le suivi pour la mettre à jour en continu.'
              : 'Activez le suivi pour garder la carte centrée sur vous.'}
        {gps.location.position?.accuracy != null
          ? ` Précision : ± ${Math.round(gps.location.position.accuracy)} m.`
          : ''}
      </Text>
      {gps.error && (
        <Text accessibilityRole="alert" style={styles.locationError}>
          {gps.error.message}
        </Text>
      )}
      {gps.error?.settingsNeeded && Platform.OS !== 'web' && (
        <Pressable
          accessibilityRole="button"
          style={styles.link}
          onPress={() => {
            void Linking.openSettings().catch(() => setLinkError(true));
          }}
        >
          <Text style={styles.linkLabel}>Ouvrir les réglages</Text>
        </Pressable>
      )}
      <View style={styles.map}>
        {status !== 'error' && (
          <MapFrame
            key={attempt}
            onLoad={onLoad}
            onError={onError}
            markers={markers}
            onSelect={onSelect}
            location={gps.location}
            onPan={gps.pauseFollowing}
          />
        )}
        {status !== 'ready' && (
          <View style={styles.overlay} accessibilityLiveRegion="polite">
            {status === 'loading' ? (
              <>
                <ActivityIndicator size="large" color="#FF5A45" />
                <Text style={styles.message}>Chargement de la carte…</Text>
              </>
            ) : (
              <>
                <Text style={styles.errorTitle}>Carte indisponible</Text>
                <Text style={styles.message}>
                  Vérifiez votre connexion puis réessayez.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setStatus('loading');
                    setAttempt((value) => value + 1);
                  }}
                  style={styles.retry}
                >
                  <Text style={styles.retryLabel}>Réessayer</Text>
                </Pressable>
              </>
            )}
          </View>
        )}
      </View>
      <Text style={styles.hint}>
        Navigation limitée à la zone d’Haïti. Utilisez + ou − pour zoomer. Le
        point bleu indique votre position et le cercle sa précision. Le suivi
        s’arrête lorsque vous quittez la carte ou mettez l’application en
        arrière-plan.
      </Text>
      <Pressable
        accessibilityRole="link"
        onPress={() => {
          setLinkError(false);
          void Linking.openURL(MAP_PAGE_URL).catch(() => setLinkError(true));
        }}
        style={styles.link}
      >
        <Text style={styles.linkLabel}>Ouvrir dans OpenStreetMap ↗</Text>
      </Pressable>
      {linkError && (
        <Text accessibilityRole="alert" style={styles.message}>
          Impossible d’ouvrir le lien ou les réglages.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 24, gap: 10 },
  locationControls: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  locationButton: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: '#E7F1FA',
  },
  followButton: { backgroundColor: '#1767A6' },
  disabled: { opacity: 0.5 },
  locationError: { color: '#B94025', fontSize: 14, lineHeight: 21 },
  map: {
    height: 440,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#DFE5E7',
    overflow: 'hidden',
    backgroundColor: '#E8EEF0',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 14,
    backgroundColor: '#F0F3F4',
  },
  message: {
    color: '#626269',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  errorTitle: { color: '#171719', fontSize: 18, fontWeight: '600' },
  retry: {
    backgroundColor: '#FF5A45',
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  retryLabel: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  hint: { color: '#77777C', fontSize: 13, lineHeight: 20 },
  link: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  linkLabel: { color: '#1767A6', fontSize: 14, fontWeight: '600' },
});
