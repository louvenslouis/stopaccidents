import { createThemedStyles, useThemeColor } from '@/features/appearance/theme-provider';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import MapPin from 'lucide-react-native/icons/map-pin';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { MapPlace } from '@/features/map/place-search';
import { AnimatedPressable } from './ui/animated-pressable';

export function PlaceSuggestions({
  places,
  status,
  onSelect,
  onRetry,
}: {
  places: MapPlace[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  onSelect: (place: MapPlace) => void;
  onRetry: () => void;
}) {
  const styles = useStyles();
  const themeColor = useThemeColor();

  return (
    <View style={styles.panel}>
      <View style={styles.heading}>
        <Text style={styles.title}>Lieux suggérés</Text>
        <Text style={styles.country}>Haïti</Text>
      </View>
      <ScrollView
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="none"
        style={styles.list}
      >
        {status === 'ready' &&
          places.map((place, index) => {
            const [name, ...address] = place.label.split(', ');
            return (
              <AnimatedPressable
                key={`${place.latitude}:${place.longitude}:${place.label}`}
                accessibilityRole="button"
                accessibilityLabel={`Afficher ${place.label} sur la carte`}
                onPress={() => onSelect(place)}
                pressedScale={0.99}
                hoverScale={1}
                style={[styles.row, index > 0 && styles.separator]}
              >
                <View style={styles.pin}>
                  <MapPin size={19} color={themeColor("#1767A6", 'info')} />
                </View>
                <View style={styles.label}>
                  <Text numberOfLines={1} style={styles.name}>
                    {name}
                  </Text>
                  <Text numberOfLines={1} style={styles.address}>
                    {address.join(', ') || 'Haïti'}
                  </Text>
                </View>
                <ChevronRight size={17} color={themeColor("#8995A4", 'muted')} />
              </AnimatedPressable>
            );
          })}
        {status === 'loading' && (
          <View style={styles.message} accessibilityLiveRegion="polite">
            <ActivityIndicator size="small" color={themeColor("#1767A6", 'info')} />
            <Text style={styles.messageText}>Recherche de lieux…</Text>
          </View>
        )}
        {status === 'ready' && places.length === 0 && (
          <View style={styles.message} accessibilityLiveRegion="polite">
            <Text style={styles.messageText}>
              Aucun lieu trouvé en Haïti. Essayez un autre nom ou précisez la
              commune.
            </Text>
          </View>
        )}
        {status === 'error' && (
          <View style={styles.error} accessibilityLiveRegion="polite">
            <Text style={styles.messageText}>
              La recherche est indisponible. Vérifiez votre connexion.
            </Text>
            <AnimatedPressable
              accessibilityRole="button"
              onPress={onRetry}
              style={styles.retry}
            >
              <Text style={styles.retryText}>Réessayer</Text>
            </AnimatedPressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = createThemedStyles((themeColor) => StyleSheet.create({
  panel: {
    flexShrink: 1,
    width: '100%',
    maxHeight: 354,
    marginBottom: 10,
    borderRadius: 22,
    backgroundColor: themeColor('#FFFFFF', 'surface'),
    shadowColor: '#101828',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
    overflow: 'hidden',
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 17,
    paddingTop: 15,
    paddingBottom: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: themeColor('#E8EDF2', 'border'),
  },
  title: { fontSize: 13, fontWeight: '700', color: themeColor('#233750', 'text') },
  country: { fontSize: 12, color: themeColor('#758396', 'muted') },
  list: { flexShrink: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 12,
    minHeight: 61,
    gap: 12,
  },
  separator: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: themeColor('#EEF1F5', 'border'),
  },
  pin: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: themeColor('#EEF6FD', 'infoSoft'),
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { flex: 1, minWidth: 0, gap: 3 },
  name: { fontSize: 15, fontWeight: '600', color: themeColor('#233750', 'text') },
  address: { fontSize: 12, color: themeColor('#738195', 'muted') },
  message: { padding: 20, gap: 12, flexDirection: 'row', alignItems: 'center' },
  messageText: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 20,
    color: themeColor('#738195', 'muted'),
  },
  error: { padding: 18, alignItems: 'flex-start', gap: 10 },
  retry: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: themeColor('#EEF6FD', 'infoSoft'),
  },
  retryText: { fontSize: 14, fontWeight: '600', color: themeColor('#1767A6', 'info') },
}));
