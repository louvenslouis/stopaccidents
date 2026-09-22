import { useMapLocation } from '@/features/map/use-map-location';
import { useRoutePlanner } from '@/features/map/use-route-planner';
import type { MapPlace } from '@/features/map/place-search';
import { usePlaceSuggestions } from '@/features/map/use-place-suggestions';
import { readSavedPlaces } from '@/features/profile/saved-places';
import { router, useFocusEffect } from 'expo-router';
import BriefcaseBusiness from 'lucide-react-native/icons/briefcase-business';
import House from 'lucide-react-native/icons/house';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import X from 'lucide-react-native/icons/x';
import LocateFixed from 'lucide-react-native/icons/locate-fixed';
import Navigation from 'lucide-react-native/icons/navigation';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import Search from 'lucide-react-native/icons/search';
import Square from 'lucide-react-native/icons/square';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedPressable } from './ui/animated-pressable';
import { MapFrame } from './map-frame';
import { MapWeather } from './map-weather';
import { PlaceSuggestions } from './place-suggestions';
import type { WeatherPoint } from '@/features/map/weather';
import type { AccidentMarker, MapPlaceFocus } from './map-frame-props';
import { RoutePlannerPanel, type MapReportsState } from './route-planner-panel';

const TAB_BAR_CLEARANCE = 88;
const SEARCH_HEIGHT = 58;
const SHORTCUT_SIZE = 48;
const SHORTCUT_STEP = SHORTCUT_SIZE + 10;

function PlaceBubble({
  expanded,
  index,
  onPress,
  busy,
}: {
  expanded: boolean;
  index: number;
  onPress: () => void;
  busy: boolean;
}) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = expanded
      ? withDelay(
          70 + index * 65,
          withSpring(1, {
            damping: 11,
            stiffness: 240,
            mass: 0.65,
            reduceMotion: ReduceMotion.System,
          }),
          ReduceMotion.System,
        )
      : withTiming(0, { duration: 170, reduceMotion: ReduceMotion.System });
  }, [expanded, index, progress]);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, progress.value)),
    transform: [
      { translateX: (1 - progress.value) * -(SHORTCUT_STEP * (index + 1)) },
      { scale: 0.35 + progress.value * 0.65 },
    ],
  }));
  const Icon = index === 0 ? BriefcaseBusiness : House;
  return (
    <Animated.View
      pointerEvents={expanded ? 'auto' : 'none'}
      accessibilityElementsHidden={!expanded}
      importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}
      style={[
        styles.bubblePosition,
        { right: index === 0 ? SHORTCUT_STEP : 0 },
        animatedStyle,
      ]}
    >
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={index === 0 ? 'Travail' : 'Domicile'}
        disabled={busy || !expanded}
        onPress={onPress}
        pressedScale={0.88}
        style={[
          styles.placeBubble,
          index === 0 ? styles.workBubble : styles.homeBubble,
        ]}
      >
        {busy ? (
          <ActivityIndicator size="small" color="#1767A6" />
        ) : (
          <Icon
            size={21}
            color={index === 0 ? '#1767A6' : '#C75A3C'}
            strokeWidth={2.2}
          />
        )}
      </AnimatedPressable>
    </Animated.View>
  );
}

export function OpenStreetMap({
  markers,
  onSelect,
  reportsState,
}: {
  markers: AccidentMarker[];
  onSelect: (id: string) => void;
  reportsState: MapReportsState;
}) {
  const [attempt, setAttempt] = useState(0);
  const [weatherCenter, setWeatherCenter] = useState<WeatherPoint | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const shortcutsOpen = searchOpen && query.trim().length === 0;
  const [shortcutLoading, setShortcutLoading] = useState<
    'home' | 'work' | null
  >(null);
  const inputRef = useRef<TextInput>(null);
  const searchExpansion = useSharedValue(0);
  useEffect(() => {
    searchExpansion.value = withSpring(shortcutsOpen ? 1 : 0, {
      damping: 22,
      stiffness: 260,
      mass: 0.8,
      reduceMotion: ReduceMotion.System,
    });
  }, [shortcutsOpen, searchExpansion]);
  const searchWidthStyle = useAnimatedStyle(() => ({
    marginRight:
      SHORTCUT_STEP * 2 * Math.min(1, Math.max(0, searchExpansion.value)),
  }));
  const [placeFocus, setPlaceFocus] = useState<MapPlaceFocus>(null);
  const searchRequest = useRef(0);
  const insets = useSafeAreaInsets();
  const gps = useMapLocation();
  const planner = useRoutePlanner(gps, markers);
  const suggestions = usePlaceSuggestions(query, searchOpen && !planner.open);
  const suggestionsVisible = searchOpen && query.trim().length >= 2;
  const routeMarkers = useMemo(
    () =>
      planner.active
        ? planner.active.reports.map((item) => item.marker)
        : markers,
    [planner.active, markers],
  );
  const stopLocation = gps.stop;
  const bottomInset = Math.max(insets.bottom, 12);
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

  useFocusEffect(
    useCallback(
      () => () => {
        searchRequest.current += 1;
        setSearchOpen(false);
        inputRef.current?.blur();
      },
      [],
    ),
  );

  const selectPlace = (place: MapPlace) => {
    gps.pauseFollowing();
    setPlaceFocus({ ...place, request: ++searchRequest.current });
    setQuery(place.label);
    setSearchOpen(false);
    inputRef.current?.blur();
    Keyboard.dismiss();
  };

  const openSavedPlace = async (kind: 'home' | 'work') => {
    const request = ++searchRequest.current;
    setShortcutLoading(kind);
    setSearchOpen(false);
    Keyboard.dismiss();
    try {
      const place = (await readSavedPlaces())[kind];
      if (request !== searchRequest.current) return;
      if (!place || place.latitude === null || place.longitude === null) {
        router.push('/profil');
        return;
      }
      selectPlace({
        latitude: place.latitude,
        longitude: place.longitude,
        label: place.address,
      });
    } catch {
      if (request === searchRequest.current)
        Alert.alert(
          'Lieu indisponible',
          'Impossible de charger ce lieu. Réessayez dans un instant.',
        );
    } finally {
      setShortcutLoading(null);
    }
  };

  const searchPlace = () => {
    if (suggestions.places[0]) selectPlace(suggestions.places[0]);
    else {
      setSearchOpen(true);
      if (suggestions.status === 'error') suggestions.retry();
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.map}>
        {status !== 'error' && (
          <MapFrame
            key={attempt}
            onLoad={onLoad}
            onError={onError}
            onCenterChange={setWeatherCenter}
            markers={routeMarkers}
            onSelect={onSelect}
            location={gps.location}
            placeFocus={planner.open ? null : placeFocus}
            route={planner.mapRoute}
            onPan={() => {
              gps.pauseFollowing();
              setSearchOpen(false);
              inputRef.current?.blur();
            }}
          />
        )}
        {status !== 'ready' && (
          <View style={styles.loadingOverlay} accessibilityLiveRegion="polite">
            {status === 'loading' ? (
              <ActivityIndicator size="large" color="#FF5A45" />
            ) : (
              <AnimatedPressable
                accessibilityHint="Recharge la carte"
                accessibilityLabel="Réessayer de charger la carte"
                accessibilityRole="button"
                haptic="light"
                onPress={() => {
                  setStatus('loading');
                  setAttempt((value) => value + 1);
                }}
                pressedScale={0.9}
                style={styles.retryButton}
              >
                <RefreshCw color="#FFFFFF" size={23} strokeWidth={2.4} />
              </AnimatedPressable>
            )}
          </View>
        )}
      </View>

      {!planner.open && status === 'ready' && weatherCenter && (
        <View
          style={[
            styles.weatherPosition,
            { top: Math.max(insets.top, 12) + 8 },
          ]}
          pointerEvents="box-none"
        >
          <MapWeather center={weatherCenter} />
        </View>
      )}

      <View
        style={[
          styles.locationControls,
          {
            bottom:
              bottomInset +
              TAB_BAR_CLEARANCE +
              (planner.open ? 8 : SEARCH_HEIGHT + (placeFocus ? 122 : 18)),
          },
        ]}
      >
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel={
            gps.tracking ? 'Recentrer sur ma position' : 'Me localiser'
          }
          disabled={status !== 'ready' || gps.locating}
          haptic="light"
          onPress={() => {
            if (gps.error?.settingsNeeded && Platform.OS !== 'web') {
              void Linking.openSettings().catch(() => undefined);
              return;
            }
            gps.locate();
          }}
          pressedScale={0.9}
          style={[
            styles.iconButton,
            styles.locateButton,
            (status !== 'ready' || gps.locating) && styles.disabled,
            gps.error && styles.errorButton,
          ]}
        >
          {gps.locating ? (
            <ActivityIndicator size="small" color="#1767A6" />
          ) : (
            <LocateFixed size={23} color={gps.error ? '#C63E31' : '#1767A6'} />
          )}
        </AnimatedPressable>
        {!planner.open && (
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityState={{ selected: gps.tracking }}
            accessibilityLabel={
              gps.tracking || gps.locating
                ? 'Arrêter le suivi de position'
                : 'Suivre mon déplacement'
            }
            disabled={status !== 'ready'}
            haptic="selection"
            onPress={() =>
              gps.tracking || gps.locating ? gps.stop() : gps.start(true)
            }
            pressedScale={0.9}
            style={[
              styles.iconButton,
              gps.tracking || gps.locating
                ? styles.followButtonActive
                : styles.followButton,
              status !== 'ready' && styles.disabled,
            ]}
          >
            {gps.tracking || gps.locating ? (
              <Square size={18} color="#FFFFFF" fill="#FFFFFF" />
            ) : (
              <Navigation size={22} color="#FFFFFF" fill="#FFFFFF" />
            )}
          </AnimatedPressable>
        )}
      </View>

      {planner.open && (
        <RoutePlannerPanel
          planner={planner}
          top={insets.top + 12}
          reportsState={reportsState}
          onSelect={onSelect}
        />
      )}

      {!planner.open && !suggestionsVisible && placeFocus && (
        <View
          style={[
            styles.destinationPosition,
            { bottom: bottomInset + TAB_BAR_CLEARANCE + SEARCH_HEIGHT + 12 },
          ]}
          pointerEvents="box-none"
        >
          <View style={styles.destinationCard}>
            <Text numberOfLines={2} style={styles.destinationLabel}>
              {placeFocus.label}
            </Text>
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityLabel="Itinéraire vers ce lieu"
              onPress={() => {
                Keyboard.dismiss();
                setSearchOpen(false);
                planner.show(placeFocus);
              }}
              style={styles.routeButton}
            >
              <Navigation size={18} color="#FFFFFF" />
              <Text style={styles.routeButtonText}>Itinéraire</Text>
            </AnimatedPressable>
          </View>
        </View>
      )}

      {!planner.open && (
        <KeyboardAvoidingView
          behavior={
            Platform.OS === 'ios'
              ? 'padding'
              : Platform.OS === 'android'
                ? 'height'
                : undefined
          }
          pointerEvents="box-none"
          style={[
            styles.searchOverlay,
            {
              top: Math.max(insets.top, 12),
              bottom: bottomInset + TAB_BAR_CLEARANCE - 8,
            },
          ]}
        >
          <View style={styles.searchPosition} pointerEvents="box-none">
            {suggestionsVisible && (
              <PlaceSuggestions
                places={suggestions.places}
                status={suggestions.status}
                onSelect={selectPlace}
                onRetry={suggestions.retry}
              />
            )}
            <View style={styles.searchRow}>
              <PlaceBubble
                expanded={shortcutsOpen}
                index={0}
                busy={shortcutLoading === 'work'}
                onPress={() => void openSavedPlace('work')}
              />
              <PlaceBubble
                expanded={shortcutsOpen}
                index={1}
                busy={shortcutLoading === 'home'}
                onPress={() => void openSavedPlace('home')}
              />
              <Animated.View style={[styles.searchPill, searchWidthStyle]}>
                {suggestions.status === 'loading' ? (
                  <ActivityIndicator size="small" color="#1767A6" />
                ) : (
                  <Search color="#6F7782" size={21} strokeWidth={2.2} />
                )}
                <TextInput
                  ref={inputRef}
                  onFocus={() => setSearchOpen(true)}
                  accessibilityHint="Saisissez au moins deux caractères puis choisissez un lieu suggéré en Haïti"
                  accessibilityLabel="Rechercher un lieu sur la carte"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  clearButtonMode="never"
                  maxLength={120}
                  onChangeText={(value) => {
                    searchRequest.current += 1;
                    setQuery(value);
                    setPlaceFocus(null);
                    setSearchOpen(true);
                  }}
                  onSubmitEditing={searchPlace}
                  submitBehavior="submit"
                  onKeyPress={(event) => {
                    if (event.nativeEvent.key === 'Escape') {
                      setSearchOpen(false);
                      inputRef.current?.blur();
                    }
                  }}
                  placeholder="Rechercher un lieu"
                  placeholderTextColor="#8B929B"
                  returnKeyType="search"
                  selectionColor="#1767A6"
                  style={styles.searchInput}
                  value={query}
                />
                {query.length > 0 && (
                  <AnimatedPressable
                    accessibilityLabel="Effacer la recherche"
                    accessibilityRole="button"
                    haptic="none"
                    hitSlop={10}
                    onPress={() => {
                      searchRequest.current += 1;
                      setQuery('');
                      setPlaceFocus(null);
                      setSearchOpen(true);
                      inputRef.current?.focus();
                    }}
                    pressedScale={0.88}
                    style={styles.clearButton}
                  >
                    <X color="#FFFFFF" size={15} strokeWidth={2.8} />
                  </AnimatedPressable>
                )}
              </Animated.View>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  destinationPosition: {
    position: 'absolute',
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 9,
  },
  destinationCard: {
    width: '100%',
    maxWidth: 430,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#101828',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  destinationLabel: {
    flex: 1,
    color: '#233750',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  routeButton: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: '#1767A6',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  routeButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  weatherPosition: {
    position: 'absolute',
    right: 16,
    left: 64,
    alignItems: 'flex-end',
    zIndex: 8,
  },
  screen: {
    flex: 1,
    backgroundColor: '#E8EEF0',
  },
  map: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#E8EEF0',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2F3',
  },
  retryButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF5A45',
    shadowColor: '#A32618',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  locationControls: {
    position: 'absolute',
    right: 20,
    zIndex: 10,
    gap: 12,
    pointerEvents: 'box-none',
  },
  iconButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  locateButton: {
    borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: 'rgba(255,255,255,0.96)',
  },
  errorButton: {
    borderColor: '#F3B1A9',
    backgroundColor: '#FFF5F3',
  },
  followButton: {
    borderColor: '#155E95',
    backgroundColor: '#1767A6',
  },
  followButtonActive: {
    borderColor: '#D93C29',
    backgroundColor: '#FF5A45',
  },
  disabled: { opacity: 0.5 },
  searchOverlay: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 12,
    justifyContent: 'flex-end',
  },
  searchPosition: {
    width: '100%',
    maxWidth: 430,
    alignSelf: 'center',
    flexShrink: 1,
    paddingBottom: 8,
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
  searchRow: {
    width: '100%',
    maxWidth: 430,
    height: SEARCH_HEIGHT,
    flexShrink: 0,
    justifyContent: 'center',
  },
  bubblePosition: {
    position: 'absolute',
    top: (SEARCH_HEIGHT - SHORTCUT_SIZE) / 2,
  },
  placeBubble: {
    width: SHORTCUT_SIZE,
    height: SHORTCUT_SIZE,
    borderRadius: SHORTCUT_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.94)',
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 8,
  },
  workBubble: { backgroundColor: '#EFF7FF' },
  homeBubble: { backgroundColor: '#FFF3ED' },
  searchPill: {
    height: SEARCH_HEIGHT,
    borderRadius: SEARCH_HEIGHT / 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.94)',
    paddingLeft: 20,
    paddingRight: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.96)',
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 10,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    height: '100%',
    paddingVertical: 0,
    color: '#171719',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '500',
  },
  clearButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#9AA1AA',
  },
});
