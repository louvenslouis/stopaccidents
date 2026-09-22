import { ReportReward } from '@/components/report-reward';
import { randomUUID } from 'expo-crypto';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import ArrowRight from 'lucide-react-native/icons/arrow-right';
import UsersRound from 'lucide-react-native/icons/users-round';
import CheckCheck from 'lucide-react-native/icons/check-check';
import LocateFixed from 'lucide-react-native/icons/locate-fixed';
import MapPin from 'lucide-react-native/icons/map-pin';
import Route from 'lucide-react-native/icons/route';
import ShieldAlert from 'lucide-react-native/icons/shield-alert';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import Info from 'lucide-react-native/icons/info';
import X from 'lucide-react-native/icons/x';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GeocodingCredit } from '@/components/geocoding-credit';
import { AppIcon, type AppIconComponent } from '@/components/ui/app-icon';
import {
  MAX_ACTIVITY_LENGTH,
  MAX_DETAILS_LENGTH,
  MAX_PRESENCE_LENGTH,
  armedPresenceLocationDescription,
  validateArmedPresenceStep,
  type ArmedPresenceReportDraft,
} from '@/features/armed-presence-report/model';
import {
  acquirePreciseLocation,
  PreciseLocationError,
} from '@/features/accident-report/precise-location';
import { reverseGeocodeZone } from '@/features/accident-report/reverse-geocode';
import { isPreciseLocation } from '@/features/accident-report/model';
import { saveArmedPresenceReportStep } from '@/features/armed-presence-report/submit';
import { useAppLocation } from '@/features/location/app-location';
import { reusableAppLocation } from '@/features/location/app-location-model';

const stepLabels = ['Présence', 'Précisions'];
const makeDraft = (): ArmedPresenceReportDraft => ({
  id: randomUUID(),
  location: '',
  locationHint: '',
  coordinates: null,
  presence: '',
  activity: '',
  details: '',
});

function Action({
  label,
  onPress,
  icon,
  secondary = false,
  disabled = false,
  busy = false,
}: {
  label: string;
  onPress: () => void;
  icon?: AppIconComponent;
  secondary?: boolean;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        secondary ? styles.secondaryAction : styles.primaryAction,
        (disabled || pressed) && { opacity: 0.6 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={secondary ? '#243147' : '#fff'} />
      ) : (
        icon && (
          <AppIcon
            icon={icon}
            size={19}
            color={secondary ? '#243147' : '#fff'}
          />
        )
      )}
      <Text
        style={[styles.actionText, secondary && styles.secondaryActionText]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function ArmedPresenceReportSheet({
  visible,
  onBackToTypes,
  onClose,
}: {
  visible: boolean;
  onBackToTypes: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { location: appLocation } = useAppLocation();
  const [draft, setDraft] = useState<ArmedPresenceReportDraft>(makeDraft);
  const [step, setStep] = useState(0);
  const [savedSteps, setSavedSteps] = useState(0);
  const [locating, setLocating] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState('');
  const [locationProgress, setLocationProgress] = useState('');
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationSettingsNeeded, setLocationSettingsNeeded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const locationController = useRef<AbortController | null>(null);
  const locationRequest = useRef(0);
  const savedLocation = useRef<string | null>(null);
  const submitting = useRef(false);
  const dragStartY = useRef(0);
  const scroll = useRef<ScrollView>(null);

  useEffect(() => {
    if (!visible) {
      locationRequest.current++;
      locationController.current?.abort();
      return;
    }
    if (savedSteps === 0) {
      void locate();
    }
    // The report is intentionally resumed, rather than restarted, when reopened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    const tracker = locationRequest;
    const controller = locationController;
    return () => {
      tracker.current++;
      controller.current?.abort();
    };
  }, []);

  function update<K extends keyof ArmedPresenceReportDraft>(
    key: K,
    value: ArmedPresenceReportDraft[K],
  ) {
    if (submitting.current) return;
    setDraft((current) => ({ ...current, [key]: value }));
    setError(null);
  }

  function changeStep(next: number) {
    setStep(next);
    setError(null);
    scroll.current?.scrollTo({ y: 0, animated: false });
  }

  function pause() {
    if (submitting.current) return false;
    locationRequest.current++;
    locationController.current?.abort();
    setLocating(false);
    return true;
  }

  function close() {
    if (!pause()) return;
    if (receipt) {
      done();
      return;
    }
    onClose();
  }

  async function locate() {
    if (locating || submitting.current) return;
    const defaultLocation = isPreciseLocation(draft.coordinates)
      ? null
      : reusableAppLocation(appLocation);
    const request = ++locationRequest.current;
    locationController.current?.abort();
    const controller = new AbortController();
    locationController.current = controller;
    setLocating(true);
    setError(null);
    setLocationError(null);
    setLocationSettingsNeeded(false);
    changeStep(defaultLocation ? 1 : 0);
    let geocodingTimeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const coordinates = isPreciseLocation(draft.coordinates)
        ? draft.coordinates!
        : defaultLocation?.coordinates ??
          (await acquirePreciseLocation(
            controller.signal,
            setLocationProgress,
          ));
      if (locationRequest.current !== request) return;
      setLocationProgress(
        defaultLocation
          ? 'Position de l’application utilisée…'
          : 'Recherche du nom du lieu…',
      );
      const location =
        draft.location ||
        defaultLocation?.location ||
        (!defaultLocation
          ? await Promise.race([
              reverseGeocodeZone(coordinates.latitude, coordinates.longitude),
              new Promise<null>((resolve) => {
                geocodingTimeout = setTimeout(() => resolve(null), 8000);
              }),
            ])
          : '') ||
        '';
      if (locationRequest.current !== request) return;
      const locatedDraft = {
        ...draft,
        coordinates,
        location: location.slice(0, 240),
      };
      setDraft(locatedDraft);
      submitting.current = true;
      setSending(true);
      await saveArmedPresenceReportStep(locatedDraft, 0, setProgress);
      savedLocation.current = armedPresenceLocationDescription(locatedDraft);
      setSavedSteps((current) => Math.max(current, 1));
      changeStep(1);
    } catch (cause) {
      if (locationRequest.current === request) {
        changeStep(0);
        setLocationError(
          cause instanceof Error
            ? cause.message
            : 'Localisation indisponible. Réessayez.',
        );
        setLocationSettingsNeeded(
          cause instanceof PreciseLocationError && cause.settingsNeeded,
        );
      }
    } finally {
      clearTimeout(geocodingTimeout);
      if (locationRequest.current === request) {
        submitting.current = false;
        setSending(false);
        setLocating(false);
      }
    }
  }

  async function next() {
    if (submitting.current) return;
    const validation = validateArmedPresenceStep(draft, step);
    if (validation) {
      setError(validation);
      return;
    }
    submitting.current = true;
    setSending(true);
    setError(null);
    try {
      if (
        step === 1 &&
        savedLocation.current !== armedPresenceLocationDescription(draft)
      ) {
        await saveArmedPresenceReportStep(draft, 0, setProgress);
        savedLocation.current = armedPresenceLocationDescription(draft);
      }
      const id = await saveArmedPresenceReportStep(draft, step, setProgress);
      setSavedSteps((current) => Math.max(current, step + 1));
      if (step === 2) setReceipt(id);
      else changeStep(step + 1);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Envoi impossible. Réessayez dans un instant.',
      );
    } finally {
      submitting.current = false;
      setSending(false);
    }
  }

  function done() {
    if (submitting.current) return;
    locationRequest.current++;
    locationController.current?.abort();
    setDraft(makeDraft());
    setStep(0);
    setSavedSteps(0);
    setLocating(false);
    setSending(false);
    setError(null);
    setLocationError(null);
    setLocationSettingsNeeded(false);
    setReceipt(null);
    savedLocation.current = null;
    onClose();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={close}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fermer le formulaire, les étapes enregistrées sont conservées"
          disabled={sending}
          onPress={close}
          style={StyleSheet.absoluteFill}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              height: Math.min(
                height - insets.top - 18,
                step === 0 && !receipt ? 580 : 850,
              ),
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          {receipt ? (
            <ReportReward reportId={receipt} reportKind="armed_presence" onDone={done} visible={visible} />
          ) : (
            <>
              <View
                style={styles.handleArea}
                onStartShouldSetResponder={() => true}
                onResponderGrant={(event) => {
                  dragStartY.current = event.nativeEvent.pageY;
                }}
                onResponderRelease={(event) => {
                  if (event.nativeEvent.pageY - dragStartY.current > 60)
                    close();
                }}
              >
                <View style={styles.handle} />
              </View>
              <View style={styles.header}>
                <View style={styles.headerIcon}>
                  <AppIcon icon={ShieldAlert} size={23} color="#DA3D32" />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.eyebrow}>SITUATION OBSERVÉE</Text>
                  <Text accessibilityRole="header" style={styles.title}>
                    Signaler des hommes armés
                  </Text>
                </View>
                <Pressable
                  disabled={sending}
                  accessibilityRole="button"
                  accessibilityLabel="Fermer le formulaire"
                  onPress={close}
                  style={styles.iconButton}
                >
                  <AppIcon icon={X} size={21} color="#667185" />
                </Pressable>
              </View>
              {step > 0 && (
                <View style={styles.steps}>
                  {stepLabels.map((label, offset) => {
                    const index = offset + 1;
                    return (
                      <Pressable
                        key={label}
                        accessibilityRole="button"
                        accessibilityLabel={`Étape ${index} : ${label}`}
                        accessibilityState={{
                          selected: step === index,
                          disabled: index > savedSteps || sending,
                        }}
                        disabled={index > savedSteps || sending}
                        onPress={() => changeStep(index)}
                        style={styles.stepItem}
                      >
                        <View
                          style={[
                            styles.stepBar,
                            index <= step && styles.stepBarActive,
                          ]}
                        />
                        <Text
                          style={[
                            styles.stepLabel,
                            index === step && styles.stepLabelActive,
                          ]}
                        >
                          {index}. {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
              <ScrollView
                ref={scroll}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
              >
                {savedSteps > 0 && (
                  <View style={styles.savedNotice}>
                    <AppIcon icon={CheckCheck} size={19} color="#267E70" />
                    <View style={styles.flex}>
                      <Text style={styles.gpsText}>
                        Signalement déjà enregistré
                      </Text>
                      <Text style={styles.small}>
                        Chaque étape ajoute ses observations à la même référence.
                      </Text>
                    </View>
                  </View>
                )}
                {step === 0 && (
                  <View style={styles.locationSearch}>
                    <View style={styles.locationArt}>
                      <AppIcon icon={LocateFixed} size={46} color="#267E70" />
                    </View>
                    <Text
                      accessibilityRole="header"
                      style={styles.sectionTitle}
                    >
                      {locationError
                        ? 'Position à vérifier'
                        : 'Localisation automatique'}
                    </Text>
                    <Text style={styles.locationExplanation}>
                      Restez à distance et en sécurité. Autorisez la position
                      exacte : le signalement sera enregistré dès que le GPS
                      sera suffisamment précis.
                    </Text>
                    {(locating || sending) && (
                      <>
                        <ActivityIndicator color="#267E70" size="large" />
                        <Text
                          accessibilityLiveRegion="polite"
                          style={styles.gpsText}
                        >
                          {sending ? progress : locationProgress}
                        </Text>
                      </>
                    )}
                    <Text style={styles.small}>
                      Précision requise : 30 m ou mieux. Vous passerez ensuite
                      automatiquement aux questions sur la présence observée.
                    </Text>
                    {locationError && (
                      <>
                        <Text
                          accessibilityRole="alert"
                          style={styles.inlineError}
                        >
                          {locationError}
                        </Text>
                        {locationSettingsNeeded && Platform.OS !== 'web' && (
                          <Action
                            label="Autoriser la position exacte"
                            secondary
                            icon={LocateFixed}
                            onPress={() => {
                              void Linking.openSettings().catch(() =>
                                setLocationError(
                                  'Ouvrez les réglages de votre appareil pour autoriser la position exacte.',
                                ),
                              );
                            }}
                          />
                        )}
                        <Action
                          label={
                            draft.coordinates
                              ? 'Réessayer l’enregistrement'
                              : 'Réessayer la localisation'
                          }
                          icon={LocateFixed}
                          onPress={locate}
                        />
                      </>
                    )}
                  </View>
                )}
                {step === 1 && (
                  <>
                    <View style={styles.locationCard}>
                      <View style={styles.inline}>
                        <AppIcon icon={MapPin} size={22} color="#267E70" />
                        <View style={styles.flex}>
                          <Text style={styles.gpsText}>
                            {draft.location || 'Position GPS enregistrée'}
                          </Text>
                          <Text style={styles.small}>
                            Précision GPS : ±{' '}
                            {Math.ceil(draft.coordinates?.accuracy ?? 0)} m
                          </Text>
                          {!draft.location && (
                            <Text style={styles.small}>
                              Nom du lieu indisponible ·{' '}
                              {draft.coordinates?.latitude.toFixed(5)},{' '}
                              {draft.coordinates?.longitude.toFixed(5)}
                            </Text>
                          )}
                        </View>
                        <AppIcon icon={CheckCheck} size={20} color="#267E70" />
                      </View>
                      {Boolean(draft.location) && <GeocodingCredit />}
                      <View style={styles.sectionHeading}>
                        <Text style={styles.label}>Un repère sur place</Text>
                        <Text style={styles.optional}>FACULTATIF</Text>
                      </View>
                      <TextInput
                        editable={!sending}
                        accessibilityLabel="Repère précis du lieu de présence des hommes armés, facultatif"
                        placeholder="Ex. : devant la pharmacie, près du carrefour"
                        placeholderTextColor="#89919E"
                        value={draft.locationHint}
                        onChangeText={(value) => update('locationHint', value)}
                        maxLength={250}
                        multiline
                        style={[styles.input, styles.landmarkInput]}
                      />
                    </View>
                    <View style={styles.sectionHeading}>
                      <View style={styles.sectionIcon}>
                        <AppIcon icon={UsersRound} color="#D94235" size={23} />
                      </View>
                      <View style={styles.flex}>
                        <Text style={styles.sectionTitle}>
                          Nombre approximatif de personnes
                        </Text>
                        <Text style={styles.small}>
                          Décrivez uniquement ce que vous avez observé.
                        </Text>
                      </View>
                    </View>
                    <TextInput
                      editable={!sending}
                      accessibilityLabel="Nombre approximatif de personnes armées"
                      placeholder="Ex. : environ 3 personnes, un groupe, nombre inconnu…"
                      placeholderTextColor="#89919E"
                      value={draft.presence}
                      onChangeText={(value) => update('presence', value)}
                      maxLength={MAX_PRESENCE_LENGTH}
                      multiline
                      style={[styles.input, styles.notes]}
                    />
                    <View style={styles.sectionHeading}>
                      <View style={styles.sectionIcon}>
                        <AppIcon icon={Route} color="#D94235" size={23} />
                      </View>
                      <View style={styles.flex}>
                        <Text style={styles.sectionTitle}>Activité observée</Text>
                        <Text style={styles.small}>
                          Décrivez seulement ce que vous avez déjà observé.
                        </Text>
                      </View>
                    </View>
                    <TextInput
                      editable={!sending}
                      accessibilityLabel="Activité observée"
                      placeholder="Ex. : présence à un carrefour, déplacement à pied, activité inconnue…"
                      placeholderTextColor="#89919E"
                      value={draft.activity}
                      onChangeText={(value) => update('activity', value)}
                      maxLength={MAX_ACTIVITY_LENGTH}
                      multiline
                      style={[styles.input, styles.notes]}
                    />
                    <View style={styles.warning}>
                      <AppIcon icon={ShieldAlert} size={20} color="#B63838" />
                      <Text style={styles.warningText}>
                        Restez à distance et ne vous approchez pas pour recueillir
                        des informations. Signalez depuis un endroit sûr.
                      </Text>
                    </View>
                  </>
                )}
                {step === 2 && (
                  <>
                    <View style={styles.summary}>
                      <Text style={styles.summaryTitle}>
                        Observations enregistrées
                      </Text>
                      <View style={styles.inline}>
                        <AppIcon icon={MapPin} size={17} color="#64748B" />
                        <Text style={[styles.small, styles.flex]}>
                          {armedPresenceLocationDescription(draft) ||
                            'Position GPS ajoutée'}
                        </Text>
                      </View>
                      <Text numberOfLines={3} style={styles.summaryDetails}>
                        {draft.presence.trim()}
                      </Text>
                      <Text numberOfLines={2} style={styles.summaryDetails}>
                        Activité : {draft.activity.trim()}
                      </Text>
                    </View>
                    <View style={styles.sectionHeading}>
                      <View style={styles.sectionIcon}>
                        <AppIcon icon={Info} color="#D94235" size={23} />
                      </View>
                      <View style={styles.flex}>
                        <Text style={styles.sectionTitle}>
                          Précisions facultatives
                        </Text>
                        <Text style={styles.small}>
                          Ajoutez tout détail utile dont vous êtes certain.
                        </Text>
                      </View>
                    </View>
                    <TextInput
                      editable={!sending}
                      accessibilityLabel="Précisions facultatives"
                      placeholder="Ex. : heure de l’observation, véhicules présents, direction déjà observée…"
                      placeholderTextColor="#89919E"
                      value={draft.details}
                      onChangeText={(value) =>
                        update('details', value)
                      }
                      maxLength={MAX_DETAILS_LENGTH}
                      multiline
                      style={[styles.input, styles.personNotes]}
                    />
                    <View style={styles.privacy}>
                      <AppIcon icon={ShieldCheck} size={18} color="#6C7789" />
                      <Text style={[styles.small, styles.flex]}>
                        Ces observations seront visibles avec le signalement.
                        Ne renseignez pas de noms ni de coordonnées personnelles.
                      </Text>
                    </View>
                  </>
                )}
              </ScrollView>
              {step > 0 && (
                <View style={styles.footer}>
                  {error && (
                    <Text accessibilityRole="alert" style={styles.inlineError}>
                      {error}
                    </Text>
                  )}
                  {sending && (
                    <Text
                      accessibilityLiveRegion="polite"
                      style={styles.progress}
                    >
                      {progress}
                    </Text>
                  )}
                  <View style={styles.footerActions}>
                    <Action
                      label={step === 1 ? 'Types' : 'Retour'}
                      secondary
                      icon={ArrowLeft}
                      onPress={() => {
                        if (step === 1) {
                          if (pause()) {
                            setError(null);
                            onBackToTypes();
                          }
                        } else {
                          changeStep(step - 1);
                        }
                      }}
                      disabled={sending}
                    />
                    <View style={styles.flex}>
                      <Action
                        label={
                          sending
                            ? 'Enregistrement…'
                            : step === 2
                              ? 'Terminer le signalement'
                              : 'Suivant'
                        }
                        icon={step === 2 ? CheckCheck : ArrowRight}
                        onPress={next}
                        disabled={sending || locating}
                        busy={sending}
                      />
                    </View>
                  </View>
                  {savedSteps > 0 && !sending && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Fermer, étapes enregistrées"
                      onPress={close}
                      style={styles.laterButton}
                    >
                      <Text style={styles.small}>
                        Fermer, étapes enregistrées
                      </Text>
                    </Pressable>
                  )}
                  <Text style={styles.footerHint}>
                    Chaque étape validée est enregistrée. Les modifications en
                    cours attendent Suivant.
                  </Text>
                </View>
              )}
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: '#11182780',
  },
  sheet: {
    width: '100%',
    maxWidth: 620,
    backgroundColor: '#fff',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: 'hidden',
  },
  handleArea: { height: 28, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#D8DDE5' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 22,
    paddingTop: 6,
    paddingBottom: 15,
  },
  headerIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: '#FCE9E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F6F8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    color: '#AD5044',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 5,
  },
  title: {
    color: '#1C2637',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  steps: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 22,
    paddingBottom: 13,
  },
  stepItem: { flex: 1, gap: 7 },
  stepBar: { height: 3, borderRadius: 3, backgroundColor: '#E4E7EC' },
  stepBarActive: { backgroundColor: '#DF493B' },
  stepLabel: { color: '#98A0AC', fontSize: 10, fontWeight: '600' },
  stepLabelActive: { color: '#BA3E34' },
  content: { paddingHorizontal: 22, paddingVertical: 16, gap: 18 },
  flex: { flex: 1 },
  locationSearch: { alignItems: 'center', gap: 22, paddingVertical: 32 },
  locationArt: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#EAF6F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationExplanation: {
    color: '#667185',
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
  },
  locationCard: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#F0F8F5',
    gap: 10,
  },
  savedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#EEF8F5',
  },
  gpsText: { color: '#345B55', fontSize: 13, fontWeight: '700' },
  small: { color: '#7A8493', fontSize: 11, lineHeight: 17 },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  sectionIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#FCE9E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    color: '#29364C',
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '700',
  },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { color: '#485469', fontSize: 13, fontWeight: '600' },
  optional: {
    color: '#9099A7',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#E1E5EB',
    borderRadius: 15,
    backgroundColor: '#fff',
    color: '#273347',
    fontSize: 14,
    lineHeight: 21,
    paddingHorizontal: 15,
    paddingVertical: 13,
  },
  landmarkInput: { minHeight: 65, fontSize: 13 },
  notes: { minHeight: 105, textAlignVertical: 'top' },
  personNotes: { minHeight: 180, textAlignVertical: 'top' },
  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#FFF0EE',
  },
  warningText: { flex: 1, color: '#884039', fontSize: 12, lineHeight: 18 },
  privacy: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  summary: {
    backgroundColor: '#F5F7FA',
    borderRadius: 17,
    padding: 16,
    gap: 9,
  },
  summaryTitle: { color: '#29364C', fontSize: 13, fontWeight: '700' },
  summaryDetails: {
    color: '#637087',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: 22,
    paddingTop: 16,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#EEF0F3',
    backgroundColor: '#fff',
  },
  footerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  action: {
    borderRadius: 15,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 8,
  },
  primaryAction: { backgroundColor: '#DF493B' },
  secondaryAction: { backgroundColor: '#F1F3F6' },
  actionText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
    flexShrink: 1,
    textAlign: 'center',
  },
  secondaryActionText: { color: '#243147' },
  laterButton: {
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerHint: {
    color: '#929BA8',
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
  },
  inlineError: { color: '#BA3540', fontSize: 12, lineHeight: 18 },
  progress: { color: '#637087', fontSize: 12, textAlign: 'center' },
  success: { flex: 1, justifyContent: 'center', padding: 30, gap: 22 },
  successTitle: {
    color: '#243147',
    fontSize: 29,
    fontWeight: '700',
    letterSpacing: -0.7,
  },
  successBody: { color: '#768091', fontSize: 16, lineHeight: 25 },
  receipt: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#F5F7FA',
    gap: 7,
  },
  reference: { color: '#29364C', fontSize: 12, fontWeight: '700' },
});
