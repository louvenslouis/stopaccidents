import { ProfileJourneyArt, ProfileJourneyProgress } from '@/components/profile-journey-art';
import { AccountSetup } from '@/components/account-setup';
import { SafeAreaView } from 'react-native-safe-area-context';
import X from 'lucide-react-native/icons/x';
import { ModerationPanel } from '@/components/moderation-panel';
import { surfaceDepth } from '@/components/ui/surface-depth';
import { LanguageCard } from '@/components/language-card';
import { Pressable, ScrollView, Text, TextInput, View } from '@/features/language/native';
import { useAppTheme, createThemedStyles, useThemeColor } from '@/features/appearance/theme-provider';
import { RewardsCard } from '@/components/rewards-card';
import { AppearanceCard } from '@/components/appearance-card';
import { AppScreen } from '@/components/app-screen';
import { SavedPlacePicker } from '@/components/saved-place-picker';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AppIcon } from '@/components/ui/app-icon';
import { readUserAlias } from '@/features/profile/alias';
import { completeGoogleSignIn, signInWithGoogle } from '@/features/profile/google-auth';
import {
  readSavedPlaces,
  saveSavedPlaces,
  validateSavedPlaces,
  type SavedPlace,
} from '@/features/profile/saved-places';
import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';
import { useLocalSearchParams, useRouter } from 'expo-router';
import BriefcaseBusiness from 'lucide-react-native/icons/briefcase-business';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import Eye from 'lucide-react-native/icons/eye';
import EyeOff from 'lucide-react-native/icons/eye-off';
import LockKeyhole from 'lucide-react-native/icons/lock-keyhole';
import LogIn from 'lucide-react-native/icons/log-in';
import LogOut from 'lucide-react-native/icons/log-out';
import Mail from 'lucide-react-native/icons/mail';
import MapPinHouse from 'lucide-react-native/icons/map-pin-house';
import Save from 'lucide-react-native/icons/save';
import { ProfileAvatar } from '@/components/profile-avatar';
import UserRoundPlus from 'lucide-react-native/icons/user-round-plus';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, StyleSheet } from 'react-native';

type Feedback = {
  message: string;
  tone: 'error' | 'success';
};

const GOOGLE_AUTH_ENABLED = process.env.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED === 'true';

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function signupErrorMessage(error: { code?: string; status?: number }) {
  switch (error.code) {
    case 'weak_password':
      return 'Choisissez un mot de passe plus long et plus complexe.';
    case 'email_address_not_authorized':
    case 'over_email_send_rate_limit':
      return 'Impossible de créer votre compte. Réessayez.';
    case 'email_address_invalid':
      return 'Cette adresse e-mail ne peut pas être utilisée. Vérifiez-la et réessayez.';
    case 'over_request_rate_limit':
      return 'Trop de tentatives. Attendez quelques minutes avant de réessayer.';
    case 'user_already_exists':
    case 'email_exists':
      return 'Cette adresse possède déjà un compte. Connectez-vous.';
    case 'signup_disabled':
    case 'email_provider_disabled':
      return 'La création de compte par e-mail est désactivée pour le moment.';
    default:
      return error.status === 500
        ? `La création du compte a échoué côté serveur${error.code ? ` (${error.code})` : ''}. Réessayez plus tard.`
        : `Impossible de créer votre compte${error.code ? ` (${error.code})` : ''}. Réessayez.`;
  }
}

export default function ProfileScreen() {
  const { scheme } = useAppTheme();
  const styles = useStyles();
  const themeColor = useThemeColor();
  const { auth, code } = useLocalSearchParams<{ auth?: string; code?: string }>();
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [homePlace, setHomePlace] = useState<SavedPlace | null>(null);
  const [workPlace, setWorkPlace] = useState<SavedPlace | null>(null);
  const [placeTarget, setPlaceTarget] = useState<'home' | 'work' | null>(null);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [placesSaving, setPlacesSaving] = useState(false);
  const [placesFeedback, setPlacesFeedback] = useState<Feedback | null>(null);
  const [authMode, setAuthMode] = useState<'signIn' | 'signUp'>(auth === 'signUp' ? 'signUp' : 'signIn');
  const [aliasState, setAliasState] = useState<{ userId: string; value: string | null; failed: boolean } | null>(null);
  const [aliasAttempt, setAliasAttempt] = useState(0);
  const [authOpen, setAuthOpen] = useState(auth === 'signUp' || auth === 'signIn');
  const [authDismissed, setAuthDismissed] = useState(true);
  const creatingAccount = authMode === 'signUp';

  useEffect(() => {
    if (auth !== 'signUp' && auth !== 'signIn') return;
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      setAuthMode(auth);
      setAuthOpen(true);
      setPassword('');
      setPasswordVisible(false);
      setFeedback(null);
      router.setParams({ auth: undefined });
    });
    return () => { active = false; };
  }, [auth, router]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !code) return;
    let active = true;
    void completeGoogleSignIn(window.location.href).then((nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setFeedback({ message: 'Connexion réussie.', tone: 'success' });
    }).catch(() => {
      if (active) setFeedback({ message: 'Connexion Google impossible. Réessayez.', tone: 'error' });
    }).finally(() => {
      if (active) router.setParams({ code: undefined });
    });
    return () => { active = false; };
  }, [code, router]);

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

  const accountEmail = session?.user.is_anonymous ? undefined : session?.user.email;
  const userId = session?.user.id;
  const currentAlias = aliasState?.userId === userId ? aliasState : null;

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    void (async () => {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setAliasState({ userId, value: null, failed: false });
      try {
        const value = await readUserAlias(userId, controller.signal);
        if (!controller.signal.aborted) setAliasState({ userId, value, failed: false });
      } catch {
        if (!controller.signal.aborted) setAliasState({ userId, value: null, failed: true });
      }
    })();
    return () => controller.abort();
  }, [userId, aliasAttempt]);

  const aliasContent = currentAlias?.failed ? (
    <Pressable
      accessibilityLabel="Réessayer de charger mon alias"
      accessibilityRole="button"
      onPress={() => setAliasAttempt((attempt) => attempt + 1)}>
      <Text style={styles.aliasError}>Alias indisponible. Réessayer.</Text>
    </Pressable>
  ) : currentAlias?.value ? (
    <Text selectable translate={false} style={styles.accountAlias}>{currentAlias.value}</Text>
  ) : (
    <ActivityIndicator color={themeColor('#267E70', 'success')} style={styles.aliasLoading} />
  );

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

  async function submitCredentials() {
    if (submitting || accountEmail) return;

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

    if (creatingAccount && password.length < 6) {
      setFeedback({ message: 'Choisissez un mot de passe d’au moins 6 caractères.', tone: 'error' });
      return;
    }

    setFeedback(null);
    setSubmitting(true);

    try {
      const credentials = { email: normalizedEmail, password };
      const { data, error } = creatingAccount
        ? await supabase.auth.signUp(credentials)
        : await supabase.auth.signInWithPassword(credentials);

      if (error) {
        setFeedback({
          message: creatingAccount
            ? signupErrorMessage(error)
            : 'E-mail ou mot de passe incorrect. Vérifiez vos informations et réessayez.',
          tone: 'error',
        });
        return;
      }

      if (creatingAccount && !data.session) {
        setFeedback({ message: 'Impossible de créer votre compte. Réessayez.', tone: 'error' });
        return;
      }

      setPassword('');
      setPasswordVisible(false);
      if (data.session) setSession(data.session);
      if (creatingAccount) setAuthMode('signIn');
      if (data.session) setAuthOpen(false);
      setFeedback({
        message: creatingAccount ? 'Compte créé.' : 'Connexion réussie.',
        tone: 'success',
      });
    } catch {
      setFeedback({
        message: 'Connexion impossible. Vérifiez votre connexion Internet et réessayez.',
        tone: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function submitGoogle() {
    if (!GOOGLE_AUTH_ENABLED || submitting || accountEmail) return;
    setFeedback(null);
    setSubmitting(true);
    try {
      const result = await signInWithGoogle();
      if (result.status === 'connected') {
        setSession(result.session);
        setAuthOpen(false);
        setFeedback({ message: 'Connexion réussie.', tone: 'success' });
      }
    } catch (error) {
      setFeedback({
        message: error instanceof Error && error.message.startsWith('Connexion Google')
          ? error.message
          : 'Connexion Google impossible. Réessayez.',
        tone: 'error',
      });
    } finally {
      setSubmitting(false);
    }
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
    setAuthMode('signIn');
  }

  return (
    <>
      <Modal visible={authOpen && !accountEmail} animationType="slide" presentationStyle="fullScreen"
          onShow={() => setAuthDismissed(false)} onDismiss={() => setAuthDismissed(true)}
          onRequestClose={() => { if (!submitting) setAuthOpen(false); }}>
        {authOpen && !accountEmail && (
          <SafeAreaView style={styles.authSheet}>
            <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={styles.sheetHeader}>
                <View style={styles.sheetHandle} />
                <AnimatedPressable accessibilityRole="button" accessibilityLabel="Fermer la connexion"
                  disabled={submitting} onPress={() => setAuthOpen(false)} style={styles.backButton}>
                  <AppIcon icon={X} size={22} color={themeColor('#485469', 'secondary')} />
                </AnimatedPressable>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.authContent}>
                {creatingAccount && <ProfileJourneyProgress step={0} />}
                <ProfileJourneyArt kind="connection" />
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.mailIcon}>
                    <AppIcon icon={Mail} color={themeColor("#D94235", 'accent')} size={24} strokeWidth={2.1} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.cardTitle}>
                      {creatingAccount ? 'Création de compte par e-mail' : 'Connexion par e-mail'}
                    </Text>
                    {!creatingAccount && (
                      <Text style={styles.supportingText}>
                        Utilisez l’adresse et le mot de passe associés à votre compte.
                      </Text>
                    )}
                  </View>
                </View>

                <View style={styles.field}>
                  <Text style={styles.label}>Adresse e-mail</Text>
                  <View style={styles.inputShell}>
                    <AppIcon icon={Mail} color={themeColor("#89919E", 'muted')} size={19} />
                    <TextInput keyboardAppearance={scheme}
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
                      placeholderTextColor={themeColor("#9AA1AC", 'muted')}
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
                    <AppIcon icon={LockKeyhole} color={themeColor("#89919E", 'muted')} size={19} />
                    <TextInput keyboardAppearance={scheme}
                      accessibilityLabel="Mot de passe"
                      autoCapitalize="none"
                      autoComplete={creatingAccount ? 'new-password' : 'current-password'}
                      autoCorrect={false}
                      editable={!submitting}
                      onChangeText={setPassword}
                      onSubmitEditing={() => void submitCredentials()}
                      placeholder="Votre mot de passe"
                      placeholderTextColor={themeColor("#9AA1AC", 'muted')}
                      returnKeyType="go"
                      secureTextEntry={!passwordVisible}
                      style={styles.input}
                      textContentType={creatingAccount ? 'newPassword' : 'password'}
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
                      <AppIcon icon={passwordVisible ? EyeOff : Eye} color={themeColor("#6F7887", 'muted')} size={20} />
                    </Pressable>
                  </View>
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
                  accessibilityLabel={creatingAccount ? 'Créer un compte par e-mail' : 'Se connecter par e-mail'}
                  accessibilityRole="button"
                  disabled={submitting}
                  haptic="light"
                  onPress={() => void submitCredentials()}
                  style={[styles.primaryButton, submitting && styles.disabled]}>
                  {submitting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <Text style={styles.primaryButtonText}>
                        {creatingAccount ? 'Créer un compte' : 'Se connecter'}
                      </Text>
                      <AppIcon icon={creatingAccount ? UserRoundPlus : LogIn} color="#FFFFFF" size={19} strokeWidth={2.3} />
                    </>
                  )}
                </AnimatedPressable>

                <AnimatedPressable
                  accessibilityLabel={creatingAccount ? 'Se connecter par e-mail' : 'Créer un compte par e-mail'}
                  accessibilityRole="button"
                  disabled={submitting}
                  haptic="light"
                  onPress={() => {
                    setAuthMode(creatingAccount ? 'signIn' : 'signUp');
                    setPassword('');
                    setPasswordVisible(false);
                    setFeedback(null);
                  }}
                  style={[styles.secondaryButton, submitting && styles.disabled]}>
                  <AppIcon icon={creatingAccount ? LogIn : UserRoundPlus} color={themeColor("#485469", 'secondary')} size={19} />
                  <Text style={styles.secondaryButtonText}>
                    {creatingAccount ? 'Se connecter' : 'Créer un compte par e-mail'}
                  </Text>
                </AnimatedPressable>

                <AnimatedPressable
                  accessibilityLabel="Continuer avec Google"
                  accessibilityRole="button"
                  disabled={submitting || !GOOGLE_AUTH_ENABLED}
                  haptic="light"
                  onPress={() => void submitGoogle()}
                  style={[styles.googleButton, (submitting || !GOOGLE_AUTH_ENABLED) && styles.disabled]}>
                  <Text style={styles.googleMark} translate={false}>G</Text>
                  <Text style={styles.googleButtonText}>Continuer avec Google</Text>
                </AnimatedPressable>

              </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        )}
      </Modal>
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
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <AppScreen
          eyebrow="VOTRE ESPACE"
          title="Profil"
          headerRight={
            <AnimatedPressable
              accessibilityLabel="Retour"
              accessibilityRole="button"
              haptic="light"
              hitSlop={8}
              onPress={() => {
                if (router.canGoBack()) router.back();
                else router.replace('/');
              }}
              style={styles.backButton}>
              <AppIcon icon={ChevronLeft} size={22} color={themeColor('#485469', 'secondary')} />
            </AnimatedPressable>
          }
          contentContainerStyle={styles.screenContent}>
          <View style={styles.content}>
            <ModerationPanel />
            {checkingSession ? (
              <View accessibilityLiveRegion="polite" style={styles.loadingCard}>
                <ActivityIndicator color={themeColor("#E14D3E", 'accent')} />
                <Text style={styles.supportingText}>Vérification de votre session…</Text>
              </View>
            ) : accountEmail ? (
              <View style={styles.personalGroup}>
                {session && <AccountSetup key={session.user.id} user={session.user}
                  presentationReady={Platform.OS !== 'ios' || authDismissed}
                  onUpdated={() => setAliasAttempt((attempt) => attempt + 1)} />}
                <View style={styles.card}>
                  {session && <ProfileAvatar key={session.user.id} user={session.user} />}
                  <View style={styles.accountHeading}>
                    <View style={styles.connectedRow}>
                      <AppIcon icon={CircleCheck} color={themeColor("#267E70", 'success')} size={17} />
                      <Text style={styles.connectedLabel}>CONNECTÉ</Text>
                    </View>
                    <Text style={styles.cardTitle}>Votre compte</Text>
                    {aliasContent}
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
                      <ActivityIndicator color={themeColor("#485469", 'secondary')} />
                    ) : (
                      <>
                        <AppIcon icon={LogOut} color={themeColor("#485469", 'secondary')} size={19} />
                        <Text style={styles.secondaryButtonText}>Se déconnecter</Text>
                      </>
                    )}
                  </AnimatedPressable>
                </View>

                <AnimatedPressable accessibilityRole="button" accessibilityLabel="Véhicules et identité" haptic="light"
                  onPress={() => router.push('/profil/vehicules-identite')} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <AppIcon icon={LockKeyhole} color={themeColor('#267E70', 'success')} size={24} />
                    <Text style={[styles.cardTitle, styles.flex]}>Véhicules et identité</Text>
                    <AppIcon icon={ChevronRight} color={themeColor('#89919E', 'muted')} size={20} />
                  </View>
                </AnimatedPressable>

                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={styles.placeIcon}>
                      <AppIcon icon={MapPinHouse} color={themeColor("#1767A6", 'info')} size={24} strokeWidth={2.1} />
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.cardTitle}>Vos lieux enregistrés</Text>
                      <Text style={styles.supportingText}>
                        Choisissez un point précis ou recherchez un lieu directement sur la carte.
                      </Text>
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
              </View>
            ) : (
              <View style={styles.card}>
                {session?.user.is_anonymous && aliasContent}
                <AnimatedPressable accessibilityLabel="Se connecter" accessibilityRole="button" haptic="light"
                  onPress={() => { setAuthMode('signIn'); setFeedback(null); setAuthOpen(true); }} style={styles.primaryButton}>
                  <AppIcon icon={LogIn} size={20} color="#FFFFFF" />
                  <Text style={styles.primaryButtonText}>Se connecter</Text>
                </AnimatedPressable>
              </View>
            )}
            {accountEmail && <RewardsCard />}
            <LanguageCard />
            <AppearanceCard />
          </View>
        </AppScreen>
      </KeyboardAvoidingView>
    </>
  );
}

const useStyles = createThemedStyles((themeColor) => StyleSheet.create({
  authSheet: { flex: 1, backgroundColor: themeColor('#FAFBF8', 'background') },
  sheetHeader: { padding: 16, alignItems: 'flex-end' },
  sheetHandle: { position: 'absolute', top: 12, alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: themeColor('#D8DDD7', 'border') },
  authContent: { width: '100%', maxWidth: 540, alignSelf: 'center', padding: 20, paddingTop: 0, paddingBottom: 36, gap: 14 },
  backButton: {
    ...surfaceDepth(themeColor, 'control'),
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: themeColor('#FFFFFF', 'surface'),
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  screenContent: { paddingBottom: 132 },
  content: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    marginTop: 30,
    gap: 26,
  },
  personalGroup: { gap: 14 },
  loadingCard: {
    minHeight: 128,
    padding: 24,
    gap: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: themeColor('#E7E8EB', 'border'),
    backgroundColor: themeColor('#FFFFFF', 'surface'),
  },
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
  mailIcon: {
    ...surfaceDepth(themeColor, 'control'),
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: themeColor('#FFF0EB', 'accentSoft'),
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
  inputShell: {
    ...surfaceDepth(themeColor, 'inset'),
    minHeight: 54,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: themeColor('#DFE3EA', 'border'),
    borderRadius: 15,
    backgroundColor: themeColor('#FAFBFC', 'surface'),
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 52,
    paddingVertical: 12,
    color: themeColor('#243147', 'text'),
    fontSize: 15,
    lineHeight: 21,
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
  visibilityButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
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
  accountHeading: { alignItems: 'center' },
  connectedRow: {
    marginBottom: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  connectedLabel: {
    color: themeColor('#267E70', 'success'),
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    letterSpacing: 1,
  },
  accountAlias: {
    marginTop: 5,
    color: themeColor('#267E70', 'success'),
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 25,
    textAlign: 'center',
  },
  aliasLoading: { marginTop: 8 },
  aliasError: {
    marginTop: 5,
    color: themeColor('#BA3540', 'accent'),
    fontSize: 12,
    lineHeight: 18,
  },
  secondaryButton: {
    ...surfaceDepth(themeColor, 'control'),
    minHeight: 52,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 15,
    backgroundColor: themeColor('#F1F3F6', 'elevated'),
  },
  secondaryButtonText: {
    color: themeColor('#485469', 'secondary'),
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  googleButton: {
    ...surfaceDepth(themeColor, 'control'),
    minHeight: 52,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: themeColor('#DFE3EA', 'border'),
    backgroundColor: themeColor('#FFFFFF', 'surface'),
  },
  googleMark: { color: '#4285F4', fontSize: 20, lineHeight: 24, fontWeight: '800' },
  googleButtonText: {
    color: themeColor('#243147', 'text'),
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  disabled: { opacity: 0.62 },
}));
