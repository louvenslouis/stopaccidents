import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { MapFrame } from './map-frame';
import { MAP_PAGE_URL, type AccidentMarker } from './map-frame-props';

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

  return (
    <View style={styles.section}>
      <View style={styles.map}>
        {status !== 'error' && (
          <MapFrame
            key={attempt}
            onLoad={onLoad}
            onError={onError}
            markers={markers}
            onSelect={onSelect}
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
        Navigation limitée à la zone d’Haïti. Utilisez + ou − pour zoomer.
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
          Impossible d’ouvrir OpenStreetMap.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 24, gap: 10 },
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
