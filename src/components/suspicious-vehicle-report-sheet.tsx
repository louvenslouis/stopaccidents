import { Pressable, ScrollView, Text, TextInput, View } from '@/features/language/native';
import { useAppTheme, createThemedStyles, useThemeColor } from '@/features/appearance/theme-provider';
import { useReportDraft } from '@/features/report-events/use-report-draft';
import { useEventChoice } from '@/features/report-events/use-event-choice';
import { ReportDraftLoading } from '@/components/report-draft-loading';
import { ReportReward } from '@/components/report-reward';
import { ReportCamera } from '@/components/report-camera';
import Camera from 'lucide-react-native/icons/camera';
import { Image } from 'expo-image';
import { randomUUID } from 'expo-crypto';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import ArrowRight from 'lucide-react-native/icons/arrow-right';
import CarFront from 'lucide-react-native/icons/car-front';
import CheckCheck from 'lucide-react-native/icons/check-check';
import LocateFixed from 'lucide-react-native/icons/locate-fixed';
import MapPin from 'lucide-react-native/icons/map-pin';
import Route from 'lucide-react-native/icons/route';
import ShieldAlert from 'lucide-react-native/icons/shield-alert';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import Info from 'lucide-react-native/icons/info';
import X from 'lucide-react-native/icons/x';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GeocodingCredit } from '@/components/geocoding-credit';
import { AppIcon, type AppIconComponent } from '@/components/ui/app-icon';
import {
  MAX_OBSERVED_BEHAVIOR_LENGTH,
  MAX_DETAILS_LENGTH,
  suspiciousVehicleDescription,
  vehicleTypes,
  windowTintOptions,
  suspiciousVehicleLocationDescription,
  validateSuspiciousVehicleStep,
  type SuspiciousVehicleReportDraft,
} from '@/features/suspicious-vehicle-report/model';
import { acquirePreciseLocation } from '@/features/accident-report/precise-location';
import { reverseGeocodeZone } from '@/features/accident-report/reverse-geocode';
import { isPreciseLocation } from '@/features/accident-report/model';
import { saveSuspiciousVehicleReportStep } from '@/features/suspicious-vehicle-report/submit';
import { useAppLocation } from '@/features/location/app-location';
import { reusableAppLocation } from '@/features/location/app-location-model';

const stepLabels = ['Voiture', 'Précisions'];
const makeDraft = (): SuspiciousVehicleReportDraft => ({
  id: randomUUID(),
  location: '',
  locationHint: '',
  coordinates: null,
  color: '',
  vehicleType: null,
  windowTint: null,
  registration: '',
  photo: null,
  vehicleDescription: '',
  observedBehavior: '',
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
  const styles = useStyles();
  const themeColor = useThemeColor();

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
        <ActivityIndicator color={secondary ? themeColor('#243147', 'text') : '#fff'} />
      ) : (
        icon && (
          <AppIcon
            icon={icon}
            size={19}
            color={secondary ? themeColor('#243147', 'text') : '#fff'}
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

export function SuspiciousVehicleReportSheet({
  visible,
  onBackToTypes,
  onClose,
}: {
  visible: boolean;
  onBackToTypes: () => void;
  onClose: () => void;
}) {
  const { scheme } = useAppTheme();
  const styles = useStyles();
  const themeColor = useThemeColor();

  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { location: appLocation } = useAppLocation();
  const { draft, setDraft, step, setStep, savedSteps, setSavedSteps, receipt, setReceipt, ready, storageError, checkpoint, retryStorage } = useReportDraft('suspicious_vehicle', makeDraft, visible);
  const eventChoice = useEventChoice('suspicious_vehicle');
  const [locating, setLocating] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState('');
  const [locationProgress, setLocationProgress] = useState('');
  const [locationError, setLocationError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
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
    if (ready && savedSteps === 0) {
      void locate();
    }
    // The report is intentionally resumed, rather than restarted, when reopened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, ready]);

  useEffect(() => {
    const tracker = locationRequest;
    const controller = locationController;
    return () => {
      tracker.current++;
      controller.current?.abort();
    };
  }, []);

  function update<K extends keyof SuspiciousVehicleReportDraft>(
    key: K,
    value: SuspiciousVehicleReportDraft[K],
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
    if (cameraOpen) { setCameraOpen(false); return; }
    if (!pause()) return;
    if (receipt) {
      done();
      return;
    }
    onClose();
  }

  async function locate() {
    if (!ready || locating || submitting.current) return;
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
      let locatedDraft = {
        ...draft,
        coordinates,
        location: location.slice(0, 240),
      };
      setLocationProgress('Recherche des événements proches…');
      locatedDraft = await eventChoice.choose(locatedDraft, controller.signal);
      if (locationRequest.current !== request) return;
      setDraft(locatedDraft);
      submitting.current = true;
      setSending(true);
      await checkpoint(locatedDraft);
      if (locationRequest.current !== request) return;
      await saveSuspiciousVehicleReportStep(locatedDraft, 0, setProgress);
      savedLocation.current = suspiciousVehicleLocationDescription(locatedDraft);
      setSavedSteps((current) => Math.max(current, 1));
      changeStep(1);
    } catch (cause) {
      if (locationRequest.current === request) {
        setDraft((current) => ({ ...current, eventChoiceMade: false }));
        changeStep(0);
        setLocationError(
          cause instanceof Error
            ? cause.message
            : 'Localisation indisponible. Réessayez.',
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
    const validation = validateSuspiciousVehicleStep(draft, step);
    if (validation) {
      setError(validation);
      return;
    }
    submitting.current = true;
    setSending(true);
    setError(null);
    try {
      await checkpoint(draft);
      if (
        step === 1 &&
        savedLocation.current !== suspiciousVehicleLocationDescription(draft)
      ) {
        await saveSuspiciousVehicleReportStep(draft, 0, setProgress);
        savedLocation.current = suspiciousVehicleLocationDescription(draft);
      }
      const id = await saveSuspiciousVehicleReportStep(draft, step, setProgress);
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
    setCameraOpen(false);
    setDraft(makeDraft());
    setStep(0);
    setSavedSteps(0);
    setLocating(false);
    setSending(false);
    setError(null);
    setLocationError(null);
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
          {!ready ? (
            <ReportDraftLoading error={storageError} onRetry={retryStorage} onClose={close} />
          ) : eventChoice.panel ? eventChoice.panel : cameraOpen && visible ? (
            <ReportCamera subject="la voiture" onClose={() => setCameraOpen(false)} onCapture={(photo) => { update('photo', photo); setCameraOpen(false); }} />
          ) : receipt ? (
            <ReportReward reportId={receipt} reportKind="suspicious_vehicle" onDone={done} visible={visible} />
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
                  <AppIcon icon={ShieldAlert} size={23} color={themeColor("#DA3D32", 'accent')} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.eyebrow}>SITUATION OBSERVÉE</Text>
                  <Text accessibilityRole="header" style={styles.title}>
                    Signaler une voiture suspecte
                  </Text>
                </View>
                <Pressable
                  disabled={sending}
                  accessibilityRole="button"
                  accessibilityLabel="Fermer le formulaire"
                  onPress={close}
                  style={styles.iconButton}
                >
                  <AppIcon icon={X} size={21} color={themeColor("#667185", 'muted')} />
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
                {storageError && <Text accessibilityRole="alert" style={{ color: themeColor("#BD2E40", 'accent') }}>{storageError}</Text>}
                {savedSteps > 0 && (
                  <View style={styles.savedNotice}>
                    <AppIcon icon={CheckCheck} size={19} color={themeColor("#267E70", 'success')} />
                    <View style={styles.flex}>
                      <Text style={styles.gpsText}>
                        {draft.eventId ? 'Témoignage rattaché à l’événement' : 'Signalement déjà enregistré'}
                      </Text>
                      <Text style={styles.small}>
                        Chaque étape ajoute ses observations à la même référence.
                      </Text>
                    </View>
                  </View>
                )}
                {step === 0 && (
                  <View style={styles.locationSearch}>
                    {!locationError && (
                      <>
                    <View style={styles.locationArt}>
                      <AppIcon icon={LocateFixed} size={46} color={themeColor("#267E70", 'success')} />
                    </View>
                    <Text
                      accessibilityRole="header"
                      style={styles.sectionTitle}
                    >
                      Localisation automatique
                    </Text>
                    <Text style={styles.locationExplanation}>
                      Restez à distance et en sécurité. Autorisez la position
                      exacte : le signalement sera enregistré dès que le GPS
                      sera suffisamment précis.
                    </Text>
                    {(locating || sending) && (
                      <>
                        <ActivityIndicator color={themeColor("#267E70", 'success')} size="large" />
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
                      automatiquement aux questions sur la voiture observée.
                    </Text>
                      </>
                    )}
                    {locationError && (
                      <>
                        <Text
                          accessibilityRole="alert"
                          style={styles.inlineError}
                        >
                          {locationError}
                        </Text>
                        <Action
                          label="Réessayer"
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
                        <AppIcon icon={MapPin} size={22} color={themeColor("#267E70", 'success')} />
                        <View style={styles.flex}>
                          <Text style={styles.gpsText}>
                            {draft.location ? <Text translate={false}>{draft.location}</Text> : 'Position GPS enregistrée'}
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
                        <AppIcon icon={CheckCheck} size={20} color={themeColor("#267E70", 'success')} />
                      </View>
                      {Boolean(draft.location) && <GeocodingCredit />}
                      <View style={styles.sectionHeading}>
                        <Text style={styles.label}>Un repère sur place</Text>
                        <Text style={styles.optional}>FACULTATIF</Text>
                      </View>
                      <TextInput keyboardAppearance={scheme}
                        editable={!sending}
                        accessibilityLabel="Repère précis du lieu de la voiture suspecte, facultatif"
                        placeholder="Ex. : devant la pharmacie, près du carrefour"
                        placeholderTextColor={themeColor("#89919E", 'muted')}
                        value={draft.locationHint}
                        onChangeText={(value) => update('locationHint', value)}
                        maxLength={250}
                        multiline
                        style={[styles.input, styles.landmarkInput]}
                      />
                    </View>
                    <View style={styles.sectionHeading}>
                      <View style={styles.sectionIcon}>
                        <AppIcon icon={CarFront} color={themeColor("#D94235", 'accent')} size={23} />
                      </View>
                      <View style={styles.flex}>
                        <Text style={styles.sectionTitle}>
                          Description de la voiture
                        </Text>
                        <Text style={styles.small}>
                          Décrivez uniquement ce que vous avez observé.
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.label}>Couleur du véhicule</Text>
                    <TextInput keyboardAppearance={scheme} editable={!sending} accessibilityLabel="Couleur du véhicule" placeholder="Ex. : blanc, noir, bleu… ou inconnue" placeholderTextColor={themeColor("#89919E", 'muted')} value={draft.color} onChangeText={(value) => update('color', value)} maxLength={80} style={styles.input} />
                    <Text style={styles.label}>Type de véhicule</Text>
                    <View style={styles.choices}>
                      {vehicleTypes.map((type) => (
                        <Pressable key={type.id} accessibilityRole="radio" accessibilityLabel={type.label} accessibilityState={{ checked: draft.vehicleType === type.id, disabled: sending }} disabled={sending} onPress={() => update('vehicleType', type.id)} style={[styles.choice, draft.vehicleType === type.id && styles.choiceSelected]}>
                          <Text style={styles.choiceText}>{type.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <Text style={styles.label}>Vitres teintées ?</Text>
                    <View style={styles.choices}>
                      {windowTintOptions.map((option) => (
                        <Pressable key={option.id} accessibilityRole="radio" accessibilityLabel={`Vitres teintées : ${option.label}`} accessibilityState={{ checked: draft.windowTint === option.id, disabled: sending }} disabled={sending} onPress={() => update('windowTint', option.id)} style={[styles.choice, draft.windowTint === option.id && styles.choiceSelected]}>
                          <Text style={styles.choiceText}>{option.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <Text style={styles.label}>Numéro d’immatriculation · facultatif</Text>
                    <TextInput keyboardAppearance={scheme} editable={!sending} accessibilityLabel="Numéro d’immatriculation, facultatif" placeholder="Si vous avez pu le relever" placeholderTextColor={themeColor("#89919E", 'muted')} autoCapitalize="characters" value={draft.registration} onChangeText={(value) => update('registration', value)} maxLength={80} style={styles.input} />
                    <Text style={styles.label}>Marque, modèle ou signes distinctifs · facultatif</Text>
                    <TextInput keyboardAppearance={scheme}
                      editable={!sending}
                      accessibilityLabel="Description de la voiture"
                      placeholder="Ex. : Toyota, rétroviseur cassé, autocollant…"
                      placeholderTextColor={themeColor("#89919E", 'muted')}
                      value={draft.vehicleDescription}
                      onChangeText={(value) => update('vehicleDescription', value)}
                      maxLength={1000}
                      multiline
                      style={[styles.input, styles.notes]}
                    />
                    <View style={styles.sectionHeading}>
                      <View style={styles.sectionIcon}>
                        <AppIcon icon={Route} color={themeColor("#D94235", 'accent')} size={23} />
                      </View>
                      <View style={styles.flex}>
                        <Text style={styles.sectionTitle}>Faits observés</Text>
                        <Text style={styles.small}>
                          Décrivez seulement ce que vous avez déjà observé.
                        </Text>
                      </View>
                    </View>
                    <TextInput keyboardAppearance={scheme}
                      editable={!sending}
                      accessibilityLabel="Faits observés"
                      placeholder="Ex. : passages répétés, véhicule suivant des personnes… Décrivez les faits."
                      placeholderTextColor={themeColor("#89919E", 'muted')}
                      value={draft.observedBehavior}
                      onChangeText={(value) => update('observedBehavior', value)}
                      maxLength={MAX_OBSERVED_BEHAVIOR_LENGTH}
                      multiline
                      style={[styles.input, styles.notes]}
                    />
                    <View style={styles.warning}>
                      <AppIcon icon={ShieldAlert} size={20} color={themeColor("#B63838", 'accent')} />
                      <Text style={styles.warningText}>
                        Ne suivez pas le véhicule et ne vous approchez pas pour
                        recueillir des informations. Signalez depuis un endroit sûr.
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
                        <AppIcon icon={MapPin} size={17} color={themeColor("#64748B", 'muted')} />
                        <Text style={[styles.small, styles.flex]}>
                          {suspiciousVehicleLocationDescription(draft) ? <Text translate={false}>{suspiciousVehicleLocationDescription(draft)}</Text> : 'Position GPS ajoutée'}
                        </Text>
                      </View>
                      <Text style={styles.summaryDetails}>
                        {suspiciousVehicleDescription(draft)}
                      </Text>
                      <Text numberOfLines={2} style={styles.summaryDetails}>
                        Faits observés : {<Text translate={false}>{draft.observedBehavior.trim()}</Text>}
                      </Text>
                    </View>
                    <View style={styles.sectionHeading}>
                      <View style={styles.sectionIcon}>
                        <AppIcon icon={Info} color={themeColor("#D94235", 'accent')} size={23} />
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
                    <TextInput keyboardAppearance={scheme}
                      editable={!sending}
                      accessibilityLabel="Précisions facultatives"
                      placeholder="Ex. : heure de l’observation, durée, direction déjà observée…"
                      placeholderTextColor={themeColor("#89919E", 'muted')}
                      value={draft.details}
                      onChangeText={(value) =>
                        update('details', value)
                      }
                      maxLength={MAX_DETAILS_LENGTH}
                      multiline
                      style={[styles.input, styles.personNotes]}
                    />
                    <Text style={styles.label}>Photo du véhicule · facultative</Text>
                    <Text style={styles.small}>Vous pouvez terminer sans photo. Ne vous approchez pas pour la prendre.</Text>
                    {draft.photo ? (
                      <View style={{ gap: 12 }}>
                        <Image source={{ uri: draft.photo.uri }} style={{ width: '100%', height: 200, borderRadius: 16 }} contentFit="contain" accessibilityLabel="Photo du véhicule" />
                        <Action secondary label="Retirer la photo" disabled={sending} onPress={() => update('photo', null)} />
                      </View>
                    ) : (
                      <Action secondary label="Prendre une photo" icon={Camera} disabled={sending} onPress={() => setCameraOpen(true)} />
                    )}
                    <View style={styles.privacy}>
                      <AppIcon icon={ShieldCheck} size={18} color={themeColor("#6C7789", 'muted')} />
                      <Text style={[styles.small, styles.flex]}>
                        Ces observations et la photo seront visibles avec le signalement.
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

const useStyles = createThemedStyles((themeColor) => StyleSheet.create({
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { minHeight: 44, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: themeColor('#DFE4EB', 'border'), backgroundColor: themeColor('#F8F9FB', 'surface') },
  choiceSelected: { borderColor: '#B96B16', backgroundColor: themeColor('#FFF1DD', 'warningSoft') },
  choiceText: { color: themeColor('#39465A', 'secondary'), fontSize: 13, fontWeight: '600' },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: themeColor('#11182780', 'overlay'),
  },
  sheet: {
    width: '100%',
    maxWidth: 620,
    backgroundColor: themeColor('#fff', 'surface'),
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: 'hidden',
  },
  handleArea: { height: 28, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: themeColor('#D8DDE5', 'elevated') },
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
    backgroundColor: themeColor('#FCE9E2', 'accentSoft'),
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: themeColor('#F5F6F8', 'elevated'),
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    color: themeColor('#AD5044', 'accent'),
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 5,
  },
  title: {
    color: themeColor('#1C2637', 'text'),
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
  stepBar: { height: 3, borderRadius: 3, backgroundColor: themeColor('#E4E7EC', 'elevated') },
  stepBarActive: { backgroundColor: '#DF493B' },
  stepLabel: { color: themeColor('#98A0AC', 'muted'), fontSize: 10, fontWeight: '600' },
  stepLabelActive: { color: themeColor('#BA3E34', 'accent') },
  content: { paddingHorizontal: 22, paddingVertical: 16, gap: 18 },
  flex: { flex: 1 },
  locationSearch: { alignItems: 'center', gap: 22, paddingVertical: 32 },
  locationArt: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: themeColor('#EAF6F1', 'successSoft'),
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationExplanation: {
    color: themeColor('#667185', 'muted'),
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
  },
  locationCard: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: themeColor('#F0F8F5', 'elevated'),
    gap: 10,
  },
  savedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: themeColor('#EEF8F5', 'successSoft'),
  },
  gpsText: { color: themeColor('#345B55', 'text'), fontSize: 13, fontWeight: '700' },
  small: { color: themeColor('#7A8493', 'muted'), fontSize: 11, lineHeight: 17 },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  sectionIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: themeColor('#FCE9E2', 'accentSoft'),
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    color: themeColor('#29364C', 'text'),
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '700',
  },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { color: themeColor('#485469', 'secondary'), fontSize: 13, fontWeight: '600' },
  optional: {
    color: themeColor('#9099A7', 'muted'),
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  input: {
    borderWidth: 1.5,
    borderColor: themeColor('#E1E5EB', 'border'),
    borderRadius: 15,
    backgroundColor: themeColor('#fff', 'surface'),
    color: themeColor('#273347', 'text'),
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
    backgroundColor: themeColor('#FFF0EE', 'accentSoft'),
  },
  warningText: { flex: 1, color: themeColor('#884039', 'accent'), fontSize: 12, lineHeight: 18 },
  privacy: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  summary: {
    backgroundColor: themeColor('#F5F7FA', 'surface'),
    borderRadius: 17,
    padding: 16,
    gap: 9,
  },
  summaryTitle: { color: themeColor('#29364C', 'text'), fontSize: 13, fontWeight: '700' },
  summaryDetails: {
    color: themeColor('#637087', 'muted'),
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: 22,
    paddingTop: 16,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: themeColor('#EEF0F3', 'border'),
    backgroundColor: themeColor('#fff', 'surface'),
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
  secondaryAction: { backgroundColor: themeColor('#F1F3F6', 'elevated') },
  actionText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
    flexShrink: 1,
    textAlign: 'center',
  },
  secondaryActionText: { color: themeColor('#243147', 'text') },
  laterButton: {
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerHint: {
    color: themeColor('#929BA8', 'muted'),
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
  },
  inlineError: { color: themeColor('#BA3540', 'accent'), fontSize: 12, lineHeight: 18 },
  progress: { color: themeColor('#637087', 'muted'), fontSize: 12, textAlign: 'center' },
  success: { flex: 1, justifyContent: 'center', padding: 30, gap: 22 },
  successTitle: {
    color: themeColor('#243147', 'text'),
    fontSize: 29,
    fontWeight: '700',
    letterSpacing: -0.7,
  },
  successBody: { color: themeColor('#768091', 'muted'), fontSize: 16, lineHeight: 25 },
  receipt: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: themeColor('#F5F7FA', 'surface'),
    gap: 7,
  },
  reference: { color: themeColor('#29364C', 'text'), fontSize: 12, fontWeight: '700' },
}));
