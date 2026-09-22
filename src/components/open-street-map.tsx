import { useMapLocation } from '@/features/map/use-map-location';
import { searchMapPlace } from '@/features/map/place-search';
import { readSavedPlaces } from '@/features/profile/saved-places';
import { router } from 'expo-router';
import BriefcaseBusiness from 'lucide-react-native/icons/briefcase-business';
import House from 'lucide-react-native/icons/house';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import X from 'lucide-react-native/icons/x';
import LocateFixed from 'lucide-react-native/icons/locate-fixed';
import Navigation from 'lucide-react-native/icons/navigation';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import Search from 'lucide-react-native/icons/search';
import Square from 'lucide-react-native/icons/square';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Linking,
  Platform,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedPressable } from './ui/animated-pressable';
import { MapFrame } from './map-frame';
import type { AccidentMarker, MapPlaceFocus } from './map-frame-props';

const TAB_BAR_CLEARANCE = 88;
const SEARCH_HEIGHT = 58;
const SHORTCUT_SIZE = 48;
const SHORTCUT_STEP = SHORTCUT_SIZE + 10;

function PlaceBubble({ expanded, index, onPress, busy }: {
  expanded: boolean;
  index: number;
  onPress: () => void;
  busy: boolean;
}) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = expanded
      ? withDelay(70 + index * 65, withSpring(1, {
          damping: 11, stiffness: 240, mass: 0.65, reduceMotion: ReduceMotion.System,
        }), ReduceMotion.System)
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
      style={[styles.bubblePosition, { right: index === 0 ? SHORTCUT_STEP : 0 }, animatedStyle]}>
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={index === 0 ? 'Travail' : 'Domicile'}
        disabled={busy || !expanded}
        onPress={onPress}
        pressedScale={0.88}
        style={[styles.placeBubble, index === 0 ? styles.workBubble : styles.homeBubble]}>
        {busy ? <ActivityIndicator size="small" color="#1767A6" /> : <Icon size={21} color={index === 0 ? '#1767A6' : '#C75A3C'} strokeWidth={2.2} />}
      </AnimatedPressable>
    </Animated.View>
  );
}

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
  const [query, setQuery] = useState('');
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [shortcutLoading, setShortcutLoading] = useState<'home' | 'work' | null>(null);
  const inputRef = useRef<TextInput>(null);
  const searchExpansion = useSharedValue(0);
  useEffect(() => {
    searchExpansion.value = withSpring(shortcutsOpen ? 1 : 0, {
      damping: 22, stiffness: 260, mass: 0.8, reduceMotion: ReduceMotion.System,
    });
  }, [shortcutsOpen, searchExpansion]);
  const searchWidthStyle = useAnimatedStyle(() => ({
    marginRight: SHORTCUT_STEP * 2 * Math.min(1, Math.max(0, searchExpansion.value)),
  }));
  const [placeFocus, setPlaceFocus] = useState<MapPlaceFocus>(null);
  const [searchStatus, setSearchStatus] = useState<
    'idle' | 'loading' | 'not-found'
  >('idle');
  const searchRequest = useRef(0);
  const insets = useSafeAreaInsets();
  const gps = useMapLocation();
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

  useEffect(
    () => () => {
      searchRequest.current += 1;
    },
    [],
  );

  const openSavedPlace = async (kind: 'home' | 'work') => {
    const request = ++searchRequest.current;
    setShortcutLoading(kind);
    setSearchStatus('idle');
    Keyboard.dismiss();
    try {
      const place = (await readSavedPlaces())[kind];
      if (request !== searchRequest.current) return;
      if (!place || place.latitude === null || place.longitude === null) {
        router.push('/profil');
        return;
      }
      gps.pauseFollowing();
      setPlaceFocus({ latitude: place.latitude, longitude: place.longitude, label: place.address, request });
      setQuery(place.address);
    } catch {
      if (request === searchRequest.current) Alert.alert('Lieu indisponible', 'Impossible de charger ce lieu. Réessayez dans un instant.');
    } finally {
      setShortcutLoading(null);
    }
  };

  const searchPlace = async () => {
    const value = query.trim();
    if (value.length < 2 || searchStatus === 'loading') return;
    const request = ++searchRequest.current;
    setSearchStatus('loading');
    gps.pauseFollowing();
    try {
      const place = await searchMapPlace(value);
      if (request !== searchRequest.current) return;
      if (!place) {
        setSearchStatus('not-found');
        return;
      }
      setPlaceFocus({ ...place, request });
      setQuery(place.label);
      setSearchStatus('idle');
    } catch {
      if (request === searchRequest.current) setSearchStatus('not-found');
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
            markers={markers}
            onSelect={onSelect}
            location={gps.location}
            placeFocus={placeFocus}
            onPan={() => {
              gps.pauseFollowing();
              setShortcutsOpen(false);
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

      <View
        style={[
          styles.locationControls,
          { bottom: bottomInset + TAB_BAR_CLEARANCE + SEARCH_HEIGHT + 18 },
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
      </View>

      <View
        style={[styles.searchPosition, { bottom: bottomInset + TAB_BAR_CLEARANCE }]}
      >
        <View style={styles.searchRow}>
        <PlaceBubble expanded={shortcutsOpen} index={0} busy={shortcutLoading === 'work'} onPress={() => void openSavedPlace('work')} />
        <PlaceBubble expanded={shortcutsOpen} index={1} busy={shortcutLoading === 'home'} onPress={() => void openSavedPlace('home')} />
        <Animated.View style={[styles.searchPill, searchWidthStyle]} onTouchEnd={() => inputRef.current?.focus()}>
          {searchStatus === 'loading' ? (
            <ActivityIndicator size="small" color="#1767A6" />
          ) : (
            <Search
              color={searchStatus === 'not-found' ? '#C63E31' : '#6F7782'}
              size={21}
              strokeWidth={2.2}
            />
          )}
          <TextInput
            ref={inputRef}
            onFocus={() => setShortcutsOpen(true)}
            accessibilityHint="Validez pour centrer la carte sur ce lieu en Haïti"
            accessibilityLabel="Rechercher un lieu sur la carte"
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="never"
            maxLength={120}
            onChangeText={(value) => {
              setQuery(value);
              setSearchStatus('idle');
            }}
            onSubmitEditing={() => void searchPlace()}
            placeholder={
              searchStatus === 'not-found'
                ? 'Lieu introuvable en Haïti'
                : 'Rechercher un lieu'
            }
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
                setSearchStatus('idle');
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
    </View>
  );
}

const styles = StyleSheet.create({
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
  searchPosition: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 9,
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
  searchRow: {
    width: '100%',
    maxWidth: 430,
    height: SEARCH_HEIGHT,
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
