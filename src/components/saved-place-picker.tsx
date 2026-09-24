import { Pressable, ScrollView, Text, TextInput, View } from '@/features/language/native';
import { useAppTheme, createThemedStyles, useThemeColor } from '@/features/appearance/theme-provider';
import { GeocodingCredit } from '@/components/geocoding-credit';
import { PlacePickerMap } from '@/components/place-picker-map';
import type { PlacePickerSelection } from '@/components/place-picker-map-props';
import { AppIcon } from '@/components/ui/app-icon';
import type { SavedPlace } from '@/features/profile/saved-places';
import {
  reverseGeocodeSavedPlace,
  searchSavedPlaces,
  type PlaceSearchResult,
} from '@/features/profile/saved-place-geocoding';
import Check from 'lucide-react-native/icons/check';
import MapPin from 'lucide-react-native/icons/map-pin';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import Search from 'lucide-react-native/icons/search';
import X from 'lucide-react-native/icons/x';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function coordinates(place: SavedPlace | null): PlacePickerSelection | null {
  return typeof place?.latitude === 'number' && typeof place.longitude === 'number'
    ? { latitude: place.latitude, longitude: place.longitude }
    : null;
}

export function SavedPlacePicker({
  visible,
  title,
  value,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  value: SavedPlace | null;
  onClose: () => void;
  onConfirm: (place: SavedPlace) => void;
}) {
  const { scheme } = useAppTheme();
  const styles = useStyles();
  const themeColor = useThemeColor();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selection, setSelection] = useState<SavedPlace | null>(value);
  const [resolving, setResolving] = useState(false);
  const [mapAttempt, setMapAttempt] = useState(0);
  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const reverseRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!visible || query.trim().length < 2) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      setSearching(true);
      setSearchError(null);
      void searchSavedPlaces(query, controller.signal)
        .then((places) => {
          setResults(places);
          if (!places.length) setSearchError('Aucun lieu trouvé dans la zone affichée.');
        })
        .catch((error) => {
          if (error instanceof Error && error.name === 'AbortError') return;
          setResults([]);
          setSearchError('Recherche indisponible. Touchez directement la carte.');
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 450);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [query, visible]);

  useEffect(() => {
    if (!visible || mapStatus !== 'loading') return;
    const timeout = setTimeout(() => setMapStatus('error'), 20000);
    return () => clearTimeout(timeout);
  }, [visible, mapStatus, mapAttempt]);

  useEffect(
    () => () => {
      reverseRequest.current?.abort();
    },
    [],
  );

  const pickPoint = useCallback((point: PlacePickerSelection) => {
    reverseRequest.current?.abort();
    const controller = new AbortController();
    reverseRequest.current = controller;
    setQuery('');
    setResults([]);
    setSearchError(null);
    setResolving(true);
    setSelection({
      address: `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`,
      ...point,
    });
    void reverseGeocodeSavedPlace(point.latitude, point.longitude, controller.signal)
      .then((address) => setSelection({ address, ...point }))
      .catch((error) => {
        if (!(error instanceof Error) || error.name !== 'AbortError')
          setSearchError('Impossible de nommer ce point. Choisissez-en un autre.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setResolving(false);
      });
  }, []);

  const mapSelection = coordinates(selection);
  const canConfirm = Boolean(mapSelection && selection?.address.trim()) && !resolving;

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
      visible={visible}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <SafeAreaView style={styles.screen}>
          <View style={styles.header}>
            <View style={styles.heading}>
              <Text style={styles.eyebrow}>CHOISIR SUR LA CARTE</Text>
              <Text accessibilityRole="header" style={styles.title}>
                {title}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Fermer la carte"
              accessibilityRole="button"
              hitSlop={8}
              onPress={onClose}
              style={styles.closeButton}>
              <AppIcon icon={X} color={themeColor("#536071", 'secondary')} size={22} />
            </Pressable>
          </View>

          <View style={styles.searchArea}>
            <View style={styles.searchBox}>
              <AppIcon icon={Search} color={themeColor("#6E7887", 'muted')} size={20} />
              <TextInput keyboardAppearance={scheme}
                accessibilityLabel="Rechercher un lieu"
                autoCapitalize="words"
                autoCorrect={false}
                onChangeText={(nextQuery) => {
                  setQuery(nextQuery);
                  if (nextQuery.trim().length < 2) {
                    setSearching(false);
                    setResults([]);
                    setSearchError(null);
                  }
                }}
                placeholder="Rechercher une adresse ou un lieu"
                placeholderTextColor={themeColor("#9199A5", 'muted')}
                returnKeyType="search"
                selectionColor="#1767A6"
                style={styles.searchInput}
                value={query}
              />
              {searching ? (
                <ActivityIndicator color={themeColor("#1767A6", 'info')} size="small" />
              ) : query ? (
                <Pressable
                  accessibilityLabel="Effacer la recherche"
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => {
                    setQuery('');
                    setResults([]);
                    setSearchError(null);
                  }}>
                  <AppIcon icon={X} color={themeColor("#6E7887", 'muted')} size={19} />
                </Pressable>
              ) : null}
            </View>
            {(results.length > 0 || searchError) && (
              <View style={styles.resultsPanel}>
                {results.length > 0 && (
                  <ScrollView keyboardShouldPersistTaps="handled" style={styles.resultsList}>
                    {results.map((result) => (
                      <Pressable
                        key={result.id}
                        accessibilityLabel={`Choisir ${result.address}`}
                        accessibilityRole="button"
                        onPress={() => {
                          reverseRequest.current?.abort();
                          setSelection(result);
                          setResolving(false);
                          setQuery('');
                          setResults([]);
                          setSearchError(null);
                        }}
                        style={({ pressed }) => [styles.result, pressed && styles.pressed]}>
                        <AppIcon icon={MapPin} color={themeColor("#1767A6", 'info')} size={18} />
                        <Text numberOfLines={2} style={styles.resultText}>
                          {result.address}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
                {searchError && (
                  <Text accessibilityLiveRegion="polite" style={styles.searchError}>
                    {searchError}
                  </Text>
                )}
              </View>
            )}
          </View>

          <View style={styles.mapArea}>
            {mapStatus !== 'error' && (
              <PlacePickerMap
                key={mapAttempt}
                selection={mapSelection}
                onLoad={() => setMapStatus('ready')}
                onError={() => setMapStatus('error')}
                onPick={pickPoint}
              />
            )}
            {mapStatus !== 'ready' && (
              <View accessibilityLiveRegion="polite" style={styles.mapOverlay}>
                {mapStatus === 'loading' ? (
                  <>
                    <ActivityIndicator color={themeColor("#1767A6", 'info')} size="large" />
                    <Text style={styles.mapStatusText}>Chargement de la carte…</Text>
                  </>
                ) : (
                  <Pressable
                    accessibilityLabel="Réessayer de charger la carte"
                    accessibilityRole="button"
                    onPress={() => {
                      setMapStatus('loading');
                      setMapAttempt((attempt) => attempt + 1);
                    }}
                    style={styles.retryButton}>
                    <AppIcon icon={RefreshCw} color="#FFFFFF" size={20} />
                    <Text style={styles.retryText}>Réessayer</Text>
                  </Pressable>
                )}
              </View>
            )}
            <View pointerEvents="none" style={styles.mapHint}>
              <Text style={styles.mapHintText}>Touchez la carte pour placer le repère</Text>
            </View>
          </View>

          <View style={styles.footer}>
            <View style={styles.selectedPlace}>
              <AppIcon icon={MapPin} color={selection ? themeColor('#1767A6', 'info') : themeColor('#9199A5', 'muted')} size={21} />
              <View style={styles.heading}>
                <Text style={styles.selectedLabel}>REPÈRE SÉLECTIONNÉ</Text>
                {resolving ? (
                  <Text style={styles.selectedAddress}>Recherche de l’adresse…</Text>
                ) : (
                  <Text numberOfLines={2} style={styles.selectedAddress}>
                    {selection?.address || 'Aucun point choisi'}
                  </Text>
                )}
                {mapSelection && (
                  <Text style={styles.coordinates}>
                    {mapSelection.latitude.toFixed(5)}, {mapSelection.longitude.toFixed(5)}
                  </Text>
                )}
                <GeocodingCredit />
              </View>
            </View>
            <Pressable
              accessibilityLabel="Utiliser ce lieu"
              accessibilityRole="button"
              accessibilityState={{ disabled: !canConfirm }}
              disabled={!canConfirm}
              onPress={() => selection && onConfirm(selection)}
              style={({ pressed }) => [
                styles.confirmButton,
                !canConfirm && styles.disabled,
                pressed && styles.pressed,
              ]}>
              <AppIcon icon={Check} color="#FFFFFF" size={20} />
              <Text style={styles.confirmText}>Utiliser ce lieu</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = createThemedStyles((themeColor) => StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: themeColor('#F7F8FA', 'background') },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: themeColor('#FFFFFF', 'surface'),
  },
  heading: { flex: 1 },
  eyebrow: {
    color: themeColor('#1767A6', 'info'),
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  title: {
    marginTop: 4,
    color: themeColor('#243147', 'text'),
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
  },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: themeColor('#F0F2F5', 'elevated'),
  },
  searchArea: {
    zIndex: 5,
    padding: 14,
    paddingBottom: 12,
    backgroundColor: themeColor('#FFFFFF', 'surface'),
  },
  searchBox: {
    minHeight: 52,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: themeColor('#D9DFE7', 'border'),
    borderRadius: 15,
    backgroundColor: themeColor('#F8F9FB', 'surface'),
  },
  searchInput: { flex: 1, minHeight: 50, color: themeColor('#243147', 'text'), fontSize: 15 },
  resultsPanel: {
    position: 'absolute',
    top: 72,
    left: 14,
    right: 14,
    maxHeight: 242,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: themeColor('#DDE2E9', 'border'),
    borderRadius: 15,
    backgroundColor: themeColor('#FFFFFF', 'surface'),
    shadowColor: '#172033',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 10,
  },
  resultsList: { maxHeight: 240 },
  result: {
    minHeight: 58,
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: themeColor('#E3E6EB', 'border'),
  },
  resultText: { flex: 1, color: themeColor('#344054', 'secondary'), fontSize: 14, lineHeight: 20 },
  searchError: { padding: 14, color: themeColor('#A43D36', 'accent'), fontSize: 13, lineHeight: 19 },
  mapArea: {
    flex: 1,
    minHeight: 230,
    overflow: 'hidden',
    backgroundColor: themeColor('#E8EEF0', 'elevated'),
  },
  mapOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: themeColor('#EEF2F3', 'elevated'),
  },
  mapStatusText: { color: themeColor('#667185', 'muted'), fontSize: 13 },
  retryButton: {
    minHeight: 48,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    backgroundColor: '#1767A6',
  },
  retryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  mapHint: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(36,49,71,0.88)',
  },
  mapHintText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  footer: { padding: 16, gap: 14, backgroundColor: themeColor('#FFFFFF', 'surface') },
  selectedPlace: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  selectedLabel: {
    color: themeColor('#7C8797', 'muted'),
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  selectedAddress: {
    marginTop: 4,
    color: themeColor('#243147', 'text'),
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
  },
  coordinates: { marginTop: 3, color: themeColor('#758094', 'muted'), fontSize: 11, lineHeight: 15 },
  confirmButton: {
    minHeight: 52,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 15,
    backgroundColor: '#1767A6',
  },
  confirmText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
}));
