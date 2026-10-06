import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import BriefcaseBusiness from 'lucide-react-native/icons/briefcase-business';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import MapPinHouse from 'lucide-react-native/icons/map-pin-house';
import Save from 'lucide-react-native/icons/save';
import { SavedPlacePicker } from '@/components/saved-place-picker';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AppIcon } from '@/components/ui/app-icon';
import { surfaceDepth } from '@/components/ui/surface-depth';
import { Text, View } from '@/features/language/native';
import { createThemedStyles, useThemeColor } from '@/features/appearance/theme-provider';
import { readSavedPlaces, saveSavedPlaces, validateSavedPlaces, type SavedPlace } from '@/features/profile/saved-places';
import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';

type Feedback = { message: string; tone: 'error' | 'success' };

export default function SavedPlacesCard() {
  const styles = useStyles();
  const themeColor = useThemeColor();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [homePlace, setHomePlace] = useState<SavedPlace | null>(null);
  const [workPlace, setWorkPlace] = useState<SavedPlace | null>(null);
  const [placeTarget, setPlaceTarget] = useState<'home' | 'work' | null>(null);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [placesSaving, setPlacesSaving] = useState(false);
  const [placesFeedback, setPlacesFeedback] = useState<Feedback | null>(null);
  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) { setSession(data.session); setCheckingSession(false); }
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) { setSession(nextSession); setCheckingSession(false); }
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  const accountEmail = session?.user.is_anonymous ? undefined : session?.user.email;
  useEffect(() => {
    if (!accountEmail) return;

    let active = true;
    void (async () => {
      await Promise.resolve();
      if (!active) return;
      setPlacesLoading(true);
      setPlacesFeedback(null);
      try {
        const places = await readSavedPlaces();
        if (!active) return;
        setHomePlace(places.home);
        setWorkPlace(places.work);
      } catch (error) {
        if (!active) return;
        setPlacesFeedback({
          message: error instanceof Error ? error.message : 'Impossible de charger vos adresses.',
          tone: 'error',
        });
      } finally {
        if (active) setPlacesLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [accountEmail, session?.user.id]);

  async function savePlaces() {
    if (!session?.user.id) return;
    const places = { home: homePlace, work: workPlace };
    const validation = validateSavedPlaces(places);
    if (validation) {
      setPlacesFeedback({ message: validation, tone: 'error' });
      return;
    }

    setPlacesFeedback(null);
    setPlacesSaving(true);
    try {
      const saved = await saveSavedPlaces(session.user.id, places);
      setHomePlace(saved.home);
      setWorkPlace(saved.work);
      setPlacesFeedback({
        message: 'Vos lieux et leurs coordonnées ont été enregistrés.',
        tone: 'success',
      });
    } catch (error) {
      setPlacesFeedback({
        message: error instanceof Error ? error.message : 'Impossible d’enregistrer vos lieux.',
        tone: 'error',
      });
    } finally {
      setPlacesSaving(false);
    }
  }


  if (checkingSession) return <ActivityIndicator />;
  if (!accountEmail) return <AnimatedPressable accessibilityRole="button"
    onPress={() => router.push('/profil?auth=signIn')} style={styles.primaryButton}>
    <Text style={styles.primaryButtonText}>Se connecter</Text>
  </AnimatedPressable>;
  return <>
      {placeTarget && (
        <SavedPlacePicker
          visible
          title={placeTarget === 'work' ? 'Lieu de travail' : 'Domicile'}
          value={placeTarget === 'work' ? workPlace : homePlace}
          onClose={() => setPlaceTarget(null)}
          onConfirm={(place) => {
            if (placeTarget === 'work') setWorkPlace(place);
            else setHomePlace(place);
            setPlaceTarget(null);
            setPlacesFeedback(null);
          }}
        />
      )}
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={styles.placeIcon}>
                      <AppIcon icon={MapPinHouse} color={themeColor("#1767A6", 'info')} size={24} strokeWidth={2.1} />
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.cardTitle}>Vos lieux enregistrés</Text>
                    </View>
                  </View>

                  {placesLoading ? (
                    <View accessibilityLiveRegion="polite" style={styles.placesLoading}>
                      <ActivityIndicator color={themeColor("#1767A6", 'info')} />
                      <Text style={styles.supportingText}>Chargement de vos lieux…</Text>
                    </View>
                  ) : (
                    <>
                      <View style={styles.field}>
                        <Text style={styles.label}>Adresse du domicile</Text>
                        <AnimatedPressable
                          accessibilityLabel="Choisir l’adresse du domicile sur la carte"
                          accessibilityRole="button"
                          disabled={placesSaving}
                          haptic="light"
                          onPress={() => setPlaceTarget('home')}
                          style={styles.placeField}>
                          <AppIcon icon={MapPinHouse} color={themeColor("#1767A6", 'info')} size={20} />
                          <View style={styles.flex}>
                            <Text
                              numberOfLines={2}
                              style={homePlace ? styles.placeValue : styles.placePlaceholder}>
                              {homePlace?.address ? <Text translate={false}>{homePlace?.address}</Text> : 'Choisir un point sur la carte'}
                            </Text>
                            {homePlace && (
                              <Text style={styles.placeCoordinates}>
                                {homePlace.latitude === null || homePlace.longitude === null
                                  ? 'Ancienne adresse — position à préciser'
                                  : `${homePlace.latitude.toFixed(5)}, ${homePlace.longitude.toFixed(5)}`}
                              </Text>
                            )}
                          </View>
                          <AppIcon icon={ChevronRight} color={themeColor("#89919E", 'muted')} size={20} />
                        </AnimatedPressable>
                      </View>

                      <View style={styles.field}>
                        <Text style={styles.label}>Lieu de travail</Text>
                        <AnimatedPressable
                          accessibilityLabel="Choisir le lieu de travail sur la carte"
                          accessibilityRole="button"
                          disabled={placesSaving}
                          haptic="light"
                          onPress={() => setPlaceTarget('work')}
                          style={styles.placeField}>
                          <AppIcon icon={BriefcaseBusiness} color={themeColor("#1767A6", 'info')} size={20} />
                          <View style={styles.flex}>
                            <Text
                              numberOfLines={2}
                              style={workPlace ? styles.placeValue : styles.placePlaceholder}>
                              {workPlace?.address ? <Text translate={false}>{workPlace?.address}</Text> : 'Choisir un point sur la carte'}
                            </Text>
                            {workPlace && (
                              <Text style={styles.placeCoordinates}>
                                {workPlace.latitude === null || workPlace.longitude === null
                                  ? 'Ancienne adresse — position à préciser'
                                  : `${workPlace.latitude.toFixed(5)}, ${workPlace.longitude.toFixed(5)}`}
                              </Text>
                            )}
                          </View>
                          <AppIcon icon={ChevronRight} color={themeColor("#89919E", 'muted')} size={20} />
                        </AnimatedPressable>
                      </View>

                      {placesFeedback && (
                        <Text
                          accessibilityLiveRegion="polite"
                          accessibilityRole={placesFeedback.tone === 'error' ? 'alert' : undefined}
                          style={
                            placesFeedback.tone === 'error' ? styles.errorText : styles.successText
                          }>
                          {placesFeedback.message}
                        </Text>
                      )}

                      <AnimatedPressable
                        accessibilityLabel="Enregistrer mes lieux"
                        accessibilityRole="button"
                        disabled={placesSaving}
                        haptic="light"
                        onPress={() => void savePlaces()}
                        style={[styles.placesButton, placesSaving && styles.disabled]}>
                        {placesSaving ? (
                          <ActivityIndicator color="#FFFFFF" />
                        ) : (
                          <>
                            <AppIcon icon={Save} color="#FFFFFF" size={19} />
                            <Text style={styles.primaryButtonText}>Enregistrer mes lieux</Text>
                          </>
                        )}
                      </AnimatedPressable>
                    </>
                  )}
                </View>
  </>;
}

const useStyles = createThemedStyles((themeColor) => StyleSheet.create({
  flex: { flex: 1 },
  card: {
    ...surfaceDepth(themeColor, 'card'),
    padding: 22,
    gap: 20,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: themeColor('#E7E8EB', 'border'),
    backgroundColor: themeColor('#FFFFFF', 'surface'),
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  placeIcon: {
    ...surfaceDepth(themeColor, 'control'),
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: themeColor('#E7F1FA', 'infoSoft'),
  },
  placesLoading: {
    minHeight: 100,
    gap: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    color: themeColor('#243147', 'text'),
    fontSize: 19,
    lineHeight: 25,
    fontWeight: '700',
    letterSpacing: -0.35,
  },
  supportingText: {
    marginTop: 3,
    color: themeColor('#768091', 'muted'),
    fontSize: 13,
    lineHeight: 19,
  },
  field: { gap: 8 },
  label: {
    color: themeColor('#485469', 'secondary'),
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  placeField: {
    ...surfaceDepth(themeColor, 'control'),
    minHeight: 66,
    paddingHorizontal: 15,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderWidth: 1,
    borderColor: themeColor('#D7E0E8', 'border'),
    borderRadius: 15,
    backgroundColor: themeColor('#F8FBFD', 'surface'),
  },
  placeValue: {
    color: themeColor('#243147', 'text'),
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  placePlaceholder: { color: themeColor('#7D8795', 'muted'), fontSize: 14, lineHeight: 20 },
  placeCoordinates: {
    marginTop: 3,
    color: themeColor('#748094', 'muted'),
    fontSize: 11,
    lineHeight: 15,
  },
  errorText: {
    marginTop: -5,
    color: themeColor('#BA3540', 'accent'),
    fontSize: 12,
    lineHeight: 18,
  },
  successText: {
    marginTop: -5,
    color: themeColor('#267E70', 'success'),
    fontSize: 12,
    lineHeight: 18,
  },
  primaryButton: {
    ...surfaceDepth(themeColor, 'raised'),
    minHeight: 54,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 16,
    backgroundColor: '#E14D3E',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  placesButton: {
    ...surfaceDepth(themeColor, 'raised'),
    minHeight: 54,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 16,
    backgroundColor: '#1767A6',
  },
  disabled: { opacity: 0.62 },
}));
