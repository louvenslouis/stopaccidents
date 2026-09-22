import { AppScreen } from '@/components/app-screen';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AppIcon } from '@/components/ui/app-icon';
import {
  readSavedPlaces,
  saveSavedPlaces,
  validateSavedPlaces,
} from '@/features/profile/saved-places';
import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';
import BriefcaseBusiness from 'lucide-react-native/icons/briefcase-business';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import Eye from 'lucide-react-native/icons/eye';
import EyeOff from 'lucide-react-native/icons/eye-off';
import LockKeyhole from 'lucide-react-native/icons/lock-keyhole';
import LogIn from 'lucide-react-native/icons/log-in';
import LogOut from 'lucide-react-native/icons/log-out';
import Mail from 'lucide-react-native/icons/mail';
import MapPinHouse from 'lucide-react-native/icons/map-pin-house';
import Save from 'lucide-react-native/icons/save';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import UserRound from 'lucide-react-native/icons/user-round';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Feedback = {
  message: string;
  tone: 'error' | 'success';
};

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function ProfileScreen() {
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [homeAddress, setHomeAddress] = useState('');
  const [workAddress, setWorkAddress] = useState('');
  const [placesLoading, setPlacesLoading] = useState(false);
  const [placesSaving, setPlacesSaving] = useState(false);
  const [placesFeedback, setPlacesFeedback] = useState<Feedback | null>(null);

  useEffect(() => {
    let active = true;

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;

      setSession(data.session);
      setCheckingSession(false);
      if (error) {
        setFeedback({
          message: 'Impossible de vérifier votre session. Réessayez dans un instant.',
          tone: 'error',
        });
      }
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;

      setSession(nextSession);
      setCheckingSession(false);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const accountEmail = session?.user.email;

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
        setHomeAddress(places.homeAddress);
        setWorkAddress(places.workAddress);
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
    const places = { homeAddress, workAddress };
    const validation = validateSavedPlaces(places);
    if (validation) {
      setPlacesFeedback({ message: validation, tone: 'error' });
      return;
    }

    setPlacesFeedback(null);
    setPlacesSaving(true);
    try {
      const saved = await saveSavedPlaces(session.user.id, places);
      setHomeAddress(saved.homeAddress);
      setWorkAddress(saved.workAddress);
      setPlacesFeedback({
        message: 'Vos adresses ont été enregistrées.',
        tone: 'success',
      });
    } catch (error) {
      setPlacesFeedback({
        message: error instanceof Error ? error.message : 'Impossible d’enregistrer vos adresses.',
        tone: 'error',
      });
    } finally {
      setPlacesSaving(false);
    }
  }

  async function signIn() {
    const normalizedEmail = email.trim().toLowerCase();

    if (!isValidEmail(normalizedEmail)) {
      setFeedback({
        message: 'Saisissez une adresse e-mail valide.',
        tone: 'error',
      });
      return;
    }

    if (!password) {
      setFeedback({ message: 'Saisissez votre mot de passe.', tone: 'error' });
      return;
    }

    setFeedback(null);
    setSubmitting(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    setSubmitting(false);

    if (error) {
      setFeedback({
        message: 'E-mail ou mot de passe incorrect. Vérifiez vos informations et réessayez.',
        tone: 'error',
      });
      return;
    }

    setPassword('');
    setFeedback({ message: 'Connexion réussie.', tone: 'success' });
  }

  async function signOut() {
    setFeedback(null);
    setSubmitting(true);

    const { error } = await supabase.auth.signOut();

    setSubmitting(false);

    if (error) {
      setFeedback({
        message: 'La déconnexion a échoué. Réessayez dans un instant.',
        tone: 'error',
      });
      return;
    }

    setEmail('');
    setPassword('');
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}>
      <AppScreen
        eyebrow="VOTRE ESPACE"
        title="Profil"
        description="Connectez-vous pour retrouver vos informations sur tous vos appareils."
        contentContainerStyle={styles.screenContent}>
        <View style={styles.content}>
          {checkingSession ? (
            <View accessibilityLiveRegion="polite" style={styles.loadingCard}>
              <ActivityIndicator color="#E14D3E" />
              <Text style={styles.supportingText}>Vérification de votre session…</Text>
            </View>
          ) : accountEmail ? (
            <>
              <View style={styles.card}>
                <View style={styles.accountIcon}>
                  <AppIcon icon={UserRound} color="#267E70" size={29} strokeWidth={2.1} />
                </View>
                <View style={styles.accountHeading}>
                  <View style={styles.connectedRow}>
                    <AppIcon icon={CircleCheck} color="#267E70" size={17} />
                    <Text style={styles.connectedLabel}>CONNECTÉ</Text>
                  </View>
                  <Text style={styles.cardTitle}>Votre compte</Text>
                  <Text selectable style={styles.accountEmail}>
                    {accountEmail}
                  </Text>
                </View>

                {feedback && (
                  <Text
                    accessibilityLiveRegion="polite"
                    accessibilityRole={feedback.tone === 'error' ? 'alert' : undefined}
                    style={feedback.tone === 'error' ? styles.errorText : styles.successText}>
                    {feedback.message}
                  </Text>
                )}

                <AnimatedPressable
                  accessibilityLabel="Se déconnecter"
                  accessibilityRole="button"
                  disabled={submitting}
                  haptic="light"
                  onPress={() => void signOut()}
                  style={[styles.secondaryButton, submitting && styles.disabled]}>
                  {submitting ? (
                    <ActivityIndicator color="#485469" />
                  ) : (
                    <>
                      <AppIcon icon={LogOut} color="#485469" size={19} />
                      <Text style={styles.secondaryButtonText}>Se déconnecter</Text>
                    </>
                  )}
                </AnimatedPressable>
              </View>

              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.placeIcon}>
                    <AppIcon icon={MapPinHouse} color="#1767A6" size={24} strokeWidth={2.1} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.cardTitle}>Vos lieux enregistrés</Text>
                    <Text style={styles.supportingText}>
                      Enregistrez votre domicile et votre lieu de travail sur votre compte.
                    </Text>
                  </View>
                </View>

                {placesLoading ? (
                  <View accessibilityLiveRegion="polite" style={styles.placesLoading}>
                    <ActivityIndicator color="#1767A6" />
                    <Text style={styles.supportingText}>Chargement de vos adresses…</Text>
                  </View>
                ) : (
                  <>
                    <View style={styles.field}>
                      <Text style={styles.label}>Adresse du domicile</Text>
                      <View style={styles.inputShell}>
                        <AppIcon icon={MapPinHouse} color="#89919E" size={19} />
                        <TextInput
                          accessibilityLabel="Adresse du domicile"
                          autoCapitalize="words"
                          autoComplete="street-address"
                          editable={!placesSaving}
                          enterKeyHint="next"
                          maxLength={500}
                          onChangeText={setHomeAddress}
                          placeholder="Ex. 12, rue Capois, Port-au-Prince"
                          placeholderTextColor="#9AA1AC"
                          returnKeyType="next"
                          style={styles.input}
                          textContentType="fullStreetAddress"
                          value={homeAddress}
                        />
                      </View>
                    </View>

                    <View style={styles.field}>
                      <Text style={styles.label}>Lieu de travail</Text>
                      <View style={styles.inputShell}>
                        <AppIcon icon={BriefcaseBusiness} color="#89919E" size={19} />
                        <TextInput
                          accessibilityLabel="Lieu de travail"
                          autoCapitalize="words"
                          editable={!placesSaving}
                          maxLength={500}
                          onChangeText={setWorkAddress}
                          onSubmitEditing={() => void savePlaces()}
                          placeholder="Ex. Delmas 33, Port-au-Prince"
                          placeholderTextColor="#9AA1AC"
                          returnKeyType="done"
                          style={styles.input}
                          value={workAddress}
                        />
                      </View>
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
                      accessibilityLabel="Enregistrer mes adresses"
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
                          <Text style={styles.primaryButtonText}>Enregistrer mes adresses</Text>
                        </>
                      )}
                    </AnimatedPressable>
                  </>
                )}
              </View>
            </>
          ) : (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.mailIcon}>
                  <AppIcon icon={Mail} color="#D94235" size={24} strokeWidth={2.1} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.cardTitle}>Connexion par e-mail</Text>
                  <Text style={styles.supportingText}>
                    Utilisez l’adresse et le mot de passe associés à votre compte.
                  </Text>
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Adresse e-mail</Text>
                <View style={styles.inputShell}>
                  <AppIcon icon={Mail} color="#89919E" size={19} />
                  <TextInput
                    accessibilityLabel="Adresse e-mail"
                    autoCapitalize="none"
                    autoComplete="email"
                    autoCorrect={false}
                    editable={!submitting}
                    enterKeyHint="next"
                    inputMode="email"
                    keyboardType="email-address"
                    onChangeText={setEmail}
                    placeholder="vous@exemple.com"
                    placeholderTextColor="#9AA1AC"
                    returnKeyType="next"
                    style={styles.input}
                    textContentType="emailAddress"
                    value={email}
                  />
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Mot de passe</Text>
                <View style={styles.inputShell}>
                  <AppIcon icon={LockKeyhole} color="#89919E" size={19} />
                  <TextInput
                    accessibilityLabel="Mot de passe"
                    autoCapitalize="none"
                    autoComplete="current-password"
                    autoCorrect={false}
                    editable={!submitting}
                    onChangeText={setPassword}
                    onSubmitEditing={() => void signIn()}
                    placeholder="Votre mot de passe"
                    placeholderTextColor="#9AA1AC"
                    returnKeyType="go"
                    secureTextEntry={!passwordVisible}
                    style={styles.input}
                    textContentType="password"
                    value={password}
                  />
                  <Pressable
                    accessibilityLabel={
                      passwordVisible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'
                    }
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => setPasswordVisible((visible) => !visible)}
                    style={styles.visibilityButton}>
                    <AppIcon icon={passwordVisible ? EyeOff : Eye} color="#6F7887" size={20} />
                  </Pressable>
                </View>
              </View>

              {session?.user.is_anonymous && (
                <Text style={styles.guestText}>
                  Vous utilisez actuellement l’app en mode invité.
                </Text>
              )}

              {feedback && (
                <Text
                  accessibilityLiveRegion="polite"
                  accessibilityRole={feedback.tone === 'error' ? 'alert' : undefined}
                  style={feedback.tone === 'error' ? styles.errorText : styles.successText}>
                  {feedback.message}
                </Text>
              )}

              <AnimatedPressable
                accessibilityLabel="Se connecter par e-mail"
                accessibilityRole="button"
                disabled={submitting}
                haptic="light"
                onPress={() => void signIn()}
                style={[styles.primaryButton, submitting && styles.disabled]}>
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.primaryButtonText}>Se connecter</Text>
                    <AppIcon icon={LogIn} color="#FFFFFF" size={19} strokeWidth={2.3} />
                  </>
                )}
              </AnimatedPressable>

              <View style={styles.securityNote}>
                <AppIcon icon={ShieldCheck} color="#6C7789" size={18} />
                <Text style={[styles.securityText, styles.flex]}>
                  Votre mot de passe est transmis de manière sécurisée et n’est jamais stocké dans
                  l’application.
                </Text>
              </View>
            </View>
          )}
        </View>
      </AppScreen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screenContent: { paddingBottom: 132 },
  content: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    marginTop: 30,
    gap: 18,
  },
  loadingCard: {
    minHeight: 128,
    padding: 24,
    gap: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E7E8EB',
    backgroundColor: '#FFFFFF',
  },
  card: {
    padding: 22,
    gap: 20,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E7E8EB',
    backgroundColor: '#FFFFFF',
    shadowColor: '#172033',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  mailIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF0EB',
  },
  placeIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E7F1FA',
  },
  placesLoading: {
    minHeight: 100,
    gap: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    color: '#243147',
    fontSize: 19,
    lineHeight: 25,
    fontWeight: '700',
    letterSpacing: -0.35,
  },
  supportingText: {
    marginTop: 3,
    color: '#768091',
    fontSize: 13,
    lineHeight: 19,
  },
  field: { gap: 8 },
  label: {
    color: '#485469',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  inputShell: {
    minHeight: 54,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#DFE3EA',
    borderRadius: 15,
    backgroundColor: '#FAFBFC',
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 52,
    paddingVertical: 12,
    color: '#243147',
    fontSize: 15,
    lineHeight: 21,
  },
  visibilityButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestText: {
    marginTop: -6,
    color: '#7B674B',
    fontSize: 12,
    lineHeight: 18,
  },
  errorText: {
    marginTop: -5,
    color: '#BA3540',
    fontSize: 12,
    lineHeight: 18,
  },
  successText: {
    marginTop: -5,
    color: '#267E70',
    fontSize: 12,
    lineHeight: 18,
  },
  primaryButton: {
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
    minHeight: 54,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 16,
    backgroundColor: '#1767A6',
  },
  securityNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },
  securityText: {
    color: '#7B8492',
    fontSize: 11,
    lineHeight: 17,
  },
  accountIcon: {
    width: 68,
    height: 68,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    backgroundColor: '#EAF6F2',
  },
  accountHeading: { alignItems: 'center' },
  connectedRow: {
    marginBottom: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  connectedLabel: {
    color: '#267E70',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    letterSpacing: 1,
  },
  accountEmail: {
    marginTop: 5,
    color: '#697487',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  secondaryButton: {
    minHeight: 52,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 15,
    backgroundColor: '#F1F3F6',
  },
  secondaryButtonText: {
    color: '#485469',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  disabled: { opacity: 0.62 },
});
