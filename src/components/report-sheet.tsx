import { useReportDraft } from '@/features/report-events/use-report-draft';
import { useEventChoice } from '@/features/report-events/use-event-choice';
import { ReportDraftLoading } from '@/components/report-draft-loading';
import { AccidentTypePicker, accidentTypes as types } from '@/components/accident-type-picker';
import { ReportReward } from '@/components/report-reward';
import { randomUUID } from 'expo-crypto';
import { Image } from 'expo-image';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import ArrowRight from 'lucide-react-native/icons/arrow-right';
import Camera from 'lucide-react-native/icons/camera';
import Car from 'lucide-react-native/icons/car';
import Check from 'lucide-react-native/icons/check';
import CheckCheck from 'lucide-react-native/icons/check-check';
import CircleHelp from 'lucide-react-native/icons/circle-question-mark';
import HeartPulse from 'lucide-react-native/icons/heart-pulse';
import LocateFixed from 'lucide-react-native/icons/locate-fixed';
import MapPin from 'lucide-react-native/icons/map-pin';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import Siren from 'lucide-react-native/icons/siren';
import TriangleAlert from 'lucide-react-native/icons/triangle-alert';
import X from 'lucide-react-native/icons/x';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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
import { AppIcon, type AppIconComponent } from '@/components/ui/app-icon';
import { ReportCamera } from '@/components/report-camera';
import { SuspiciousVehicleReportSheet } from '@/components/suspicious-vehicle-report-sheet';
import { GunfireReportSheet } from '@/components/gunfire-report-sheet';
import { ArmedPresenceReportSheet } from '@/components/armed-presence-report-sheet';
import { BarricadeReportSheet } from '@/components/barricade-report-sheet';
import { KidnappingReportSheet } from '@/components/kidnapping-report-sheet';
import {
  ReportTypePicker,
  type ReportType,
} from '@/components/report-type-picker';
import {
  MAX_PHOTOS,
  isPreciseLocation,
  locationDescription,
  validateStep,
  type ReportDraft,
  type Severity,
} from '@/features/accident-report/model';
import { GeocodingCredit } from '@/components/geocoding-credit';
import { acquirePreciseLocation } from '@/features/accident-report/precise-location';
import { reverseGeocodeZone } from '@/features/accident-report/reverse-geocode';
import { saveAccidentReportStep } from '@/features/accident-report/submit';
import { useAppLocation } from '@/features/location/app-location';
import { reusableAppLocation } from '@/features/location/app-location-model';

const severities: {
  value: Severity;
  label: string;
  description: string;
  icon: AppIconComponent;
  color: string;
  tint: string;
}[] = [
  {
    value: 'material',
    label: 'Dégâts matériels',
    description: 'Aucun blessé apparent',
    icon: Car,
    color: '#23766A',
    tint: '#EAF6F1',
  },
  {
    value: 'injuries',
    label: 'Des blessés',
    description: 'Des personnes semblent blessées',
    icon: HeartPulse,
    color: '#A66913',
    tint: '#FFF5E4',
  },
  {
    value: 'serious',
    label: 'Blessures graves',
    description: 'Une personne semble en danger',
    icon: Siren,
    color: '#CD4A29',
    tint: '#FFF0E9',
  },
  {
    value: 'fatal',
    label: 'Décès signalé',
    description: 'Un décès est rapporté sur place',
    icon: TriangleAlert,
    color: '#BD2E40',
    tint: '#FDECEF',
  },
  {
    value: 'unknown',
    label: 'Je ne sais pas',
    description: 'La gravité reste à déterminer',
    icon: CircleHelp,
    color: '#657084',
    tint: '#F0F2F6',
  },
];
const steps = ['Accident', 'Gravité', 'Détails'];
const makeDraft = (): ReportDraft => ({
  id: randomUUID(),
  location: '',
  locationHint: '',
  coordinates: null,
  accidentType: null,
  severity: null,
  registrations: '',
  identities: '',
  notes: '',
  photos: [],
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
      <Text style={[styles.actionText, secondary && { color: '#243147' }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ReportSheet({
  visible,
  reportType,
  onSelectType,
  onBackToTypes,
  onClose,
}: {
  visible: boolean;
  reportType: ReportType | null;
  onSelectType: (type: ReportType) => void;
  onBackToTypes: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { location: appLocation } = useAppLocation();
  const { draft, setDraft, step, setStep, savedSteps, setSavedSteps, receipt, setReceipt, ready, storageError, checkpoint, retryStorage } = useReportDraft('accident', makeDraft, visible && reportType === 'accident');
  const eventChoice = useEventChoice('accident');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState('');
  const [locationProgress, setLocationProgress] = useState('');
  const locationController = useRef<AbortController | null>(null);
  const savedLocation = useRef<string | null>(null);
  const submitting = useRef(false);
  const locationRequest = useRef(0);
  const dragStartY = useRef(0);
  const scroll = useRef<ScrollView>(null);
  useEffect(() => {
    if (visible && reportType === 'accident' && ready && savedSteps === 0) void locate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, reportType, ready]);
  useEffect(() => {
    const tracker = locationRequest;
    const controller = locationController;
    return () => {
      tracker.current++;
      controller.current?.abort();
    };
  }, []);
  function close() {
    if (submitting.current) return;
    if (cameraOpen) {
      setCameraOpen(false);
      return;
    }
    locationRequest.current++;
    locationController.current?.abort();
    setLocating(false);
    if (receipt) {
      done();
      return;
    }
    onClose();
  }
  function update<K extends keyof ReportDraft>(key: K, value: ReportDraft[K]) {
    if (submitting.current) return;
    setDraft((current) => ({ ...current, [key]: value }));
    setError(null);
  }
  function changeStep(next: number) {
    setStep(next);
    setError(null);
    scroll.current?.scrollTo({ y: 0, animated: false });
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
      await saveAccidentReportStep(locatedDraft, 0, setProgress);
      savedLocation.current = locationDescription(locatedDraft);
      setSavedSteps((current) => Math.max(current, 1));
      changeStep(1);
    } catch (e) {
      if (locationRequest.current === request) {
        setDraft((current) => ({ ...current, eventChoiceMade: false }));
        changeStep(0);
        setLocationError(
          e instanceof Error
            ? e.message
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
    if (!draft || submitting.current) return;
    const validation = validateStep(draft, step);
    if (validation) {
      setError(validation);
      return;
    }
    submitting.current = true;
    setSending(true);
    setError(null);
    try {
      await checkpoint(draft);
      // The landmark adjusts the existing location before saving the subtype.
      // A failed retry keeps the same report ID and cannot erase other steps.
      if (step === 1 && savedLocation.current !== locationDescription(draft)) {
        await saveAccidentReportStep(draft, 0, setProgress);
        savedLocation.current = locationDescription(draft);
      }
      const id = await saveAccidentReportStep(draft, step, setProgress);
      setSavedSteps((current) => Math.max(current, step + 1));
      if (step === 3) setReceipt(id);
      else changeStep(step + 1);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Envoi impossible. Réessayez dans un instant.',
      );
    } finally {
      submitting.current = false;
      setSending(false);
    }
  }
  function done() {
    setDraft(makeDraft());
    setReceipt(null);
    setSavedSteps(0);
    savedLocation.current = null;
    setStep(0);
    setError(null);
    setLocationError(null);
    onClose();
  }
  if (!draft) return null;
  // Keep the reporting flow usable while the illustrated picker module is
  // still loading (notably in lightweight/test runtimes).
  const selectedType = types?.find((item) => item.value === draft.accidentType);
  const selectedSeverity = severities.find(
    (item) => item.value === draft.severity,
  );
  return (
    <>
    <Modal
      visible={visible && (reportType === null || reportType === 'accident')}
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
          accessibilityLabel="Fermer le formulaire, les informations sont conservées"
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
                reportType === null ? 560 : step === 0 && !receipt ? 580 : 850,
              ),
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          {reportType === null ? (
            <ReportTypePicker
              onSelect={(type) => {
                onSelectType(type);
                if (type === 'accident') {
                  if (ready && savedSteps === 0) void locate();
                  else changeStep(Math.max(step, 1));
                }
              }}
              onClose={close}
            />
          ) : !ready ? (
            <ReportDraftLoading error={storageError} onRetry={retryStorage} onClose={close} />
          ) : eventChoice.panel ? eventChoice.panel : cameraOpen ? (
            <ReportCamera
              onClose={() => setCameraOpen(false)}
              onCapture={(photo) => {
                update('photos', [...draft.photos, photo].slice(0, MAX_PHOTOS));
                setCameraOpen(false);
              }}
            />
          ) : receipt ? (
            <ReportReward reportId={receipt} reportKind="accident" onDone={done} visible={visible} />
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
                  <AppIcon icon={TriangleAlert} size={23} color="#DA3D32" />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.eyebrow}>CHAQUE SIGNALEMENT COMPTE</Text>
                  <Text accessibilityRole="header" style={styles.title}>
                    Signaler un accident
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
                  {steps.map((label, offset) => {
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
                {storageError && <Text accessibilityRole="alert" style={{ color: "#BD2E40" }}>{storageError}</Text>}
                {savedSteps > 0 && (
                  <View style={styles.savedNotice}>
                    <AppIcon icon={CheckCheck} size={19} color="#267E70" />
                    <View style={styles.flex}>
                      <Text style={styles.gpsText}>
                        {draft.eventId ? 'Témoignage rattaché à l’événement' : 'Signalement déjà enregistré'}
                      </Text>
                      <Text style={styles.small}>
                        Les étapes suivantes complètent ce même signalement.
                      </Text>
                    </View>
                  </View>
                )}
                {step === 0 && (
                  <View style={styles.locationSearch}>
                    {locationError ? (
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
                    ) : (
                      <>
                        <View style={styles.locationArt}>
                          <AppIcon icon={LocateFixed} size={46} color="#267E70" />
                        </View>
                        <Text accessibilityRole="header" style={styles.sectionTitle}>
                          Localisation automatique
                        </Text>
                        <Text style={styles.locationExplanation}>
                          Restez en sécurité sur le lieu de l’accident. Autorisez la
                          position exacte : le signalement sera enregistré dès que
                          le GPS sera suffisamment précis.
                        </Text>
                        {(locating || sending) && (
                          <>
                            <ActivityIndicator color="#267E70" size="large" />
                            <Text accessibilityLiveRegion="polite" style={styles.gpsText}>
                              {sending ? progress : locationProgress}
                            </Text>
                          </>
                        )}
                        <Text style={styles.small}>
                          Précision requise : 30 m ou mieux. Vous passerez ensuite
                          automatiquement au type d’accident.
                        </Text>
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
                        accessibilityLabel="Repère précis sur le lieu de l’accident, facultatif"
                        placeholder="Ex. : devant la station d’essence, rue Jean Pierre"
                        placeholderTextColor="#89919E"
                        value={draft.locationHint || ''}
                        onChangeText={(value) => update('locationHint', value)}
                        maxLength={250}
                        multiline
                        style={[styles.input, styles.landmarkInput]}
                      />
                    </View>
                    <Text style={styles.sectionTitle}>
                      Quel type d’accident ?
                    </Text>
                    <Text style={styles.small}>Choisissez la situation qui correspond à ce que vous voyez.</Text>
                    <AccidentTypePicker value={draft.accidentType} disabled={sending} onChange={(value) => update('accidentType', value)} />
                  </>
                )}
                {step === 2 && (
                  <>
                    <View style={styles.sectionHeading}>
                      <View style={styles.sectionIcon}>
                        <AppIcon icon={HeartPulse} color="#D94235" size={23} />
                      </View>
                      <View style={styles.flex}>
                        <Text style={styles.sectionTitle}>
                          Quelle est la gravité ?
                        </Text>
                        <Text style={styles.small}>
                          Indiquez seulement ce que vous savez.
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.body}>
                      Une estimation suffit. Vous n’avez pas besoin de vous
                      approcher des victimes.
                    </Text>
                    {severities.map((item) => {
                      const selected = item.value === draft.severity;
                      return (
                        <Pressable
                          key={item.value}
                          accessibilityRole="radio"
                          accessibilityLabel={`${item.label}. ${item.description}`}
                          accessibilityState={{ checked: selected }}
                          onPress={() => update('severity', item.value)}
                          style={[
                            styles.severityCard,
                            selected && {
                              borderColor: item.color,
                              backgroundColor: item.tint,
                            },
                          ]}
                        >
                          <View
                            style={[
                              styles.severityIcon,
                              { backgroundColor: item.tint },
                            ]}
                          >
                            <AppIcon
                              icon={item.icon}
                              color={item.color}
                              size={24}
                            />
                          </View>
                          <View style={styles.flex}>
                            <Text style={styles.cardTitle}>{item.label}</Text>
                            <Text style={styles.cardDescription}>
                              {item.description}
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.radio,
                              selected && {
                                backgroundColor: item.color,
                                borderColor: item.color,
                              },
                            ]}
                          >
                            {selected && (
                              <AppIcon icon={Check} size={12} color="#fff" />
                            )}
                          </View>
                        </Pressable>
                      );
                    })}
                    {(draft.severity === 'serious' ||
                      draft.severity === 'fatal') && (
                      <View style={styles.notice}>
                        <AppIcon icon={Siren} size={20} color="#B63838" />
                        <Text style={styles.noticeText}>
                          Contactez les secours en priorité. Ce formulaire ne
                          remplace pas un appel d’urgence.
                        </Text>
                      </View>
                    )}
                  </>
                )}
                {step === 3 && (
                  <>
                    <View style={styles.summary}>
                      <Text style={styles.summaryTitle}>Votre signalement</Text>
                      <View style={styles.inline}>
                        <AppIcon icon={MapPin} size={17} color="#64748B" />
                        <Text style={[styles.small, styles.flex]}>
                          {locationDescription(draft) || 'Position GPS ajoutée'}
                        </Text>
                      </View>
                      <Text style={styles.summaryDetails}>
                        {selectedType?.label} · {selectedSeverity?.label}
                      </Text>
                    </View>
                    <View style={styles.sectionHeading}>
                      <Text style={styles.sectionTitle}>
                        Quelques précisions
                      </Text>
                      <Text style={styles.optional}>FACULTATIF</Text>
                    </View>
                    <Text style={styles.label}>Numéros d’immatriculation</Text>
                    <TextInput
                      editable={!sending}
                      accessibilityLabel="Numéros d’immatriculation"
                      placeholder="Ex. : AA-12345, BB-67890"
                      placeholderTextColor="#89919E"
                      value={draft.registrations}
                      onChangeText={(value) => update('registrations', value)}
                      maxLength={810}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      style={styles.input}
                    />
                    <Text style={styles.label}>
                      Numéros de pièce d’identité
                    </Text>
                    <TextInput
                      editable={!sending}
                      accessibilityLabel="Numéros de pièce d’identité"
                      placeholder="Uniquement s’ils sont disponibles"
                      placeholderTextColor="#89919E"
                      value={draft.identities}
                      onChangeText={(value) => update('identities', value)}
                      maxLength={810}
                      autoCorrect={false}
                      style={styles.input}
                    />
                    <Text style={styles.small}>
                      Séparez les numéros par une virgule. Ne vous mettez pas en
                      danger pour les obtenir.
                    </Text>
                    <View style={styles.sectionHeading}>
                      <View style={styles.inline}>
                        <AppIcon icon={Camera} size={20} color="#D94235" />
                        <Text style={styles.sectionTitle}>
                          Photos sur place
                        </Text>
                      </View>
                      <Text style={styles.optional}>
                        {draft.photos.length}/{MAX_PHOTOS}
                      </Text>
                    </View>
                    <Text style={styles.small}>
                      Caméra uniquement · 4 photos maximum
                    </Text>
                    <View style={styles.photoGrid}>
                      {draft.photos.map((photo, index) => (
                        <View style={styles.photoWrap} key={photo.id}>
                          <Image
                            source={{ uri: photo.uri }}
                            style={styles.photo}
                            contentFit="cover"
                            accessibilityLabel={`Photo de l’accident ${index + 1}`}
                          />
                          <Pressable
                            disabled={sending}
                            accessibilityRole="button"
                            accessibilityLabel={`Retirer la photo ${index + 1}`}
                            onPress={() =>
                              update(
                                'photos',
                                draft.photos.filter(
                                  (item) => item.id !== photo.id,
                                ),
                              )
                            }
                            style={styles.removePhoto}
                          >
                            <AppIcon icon={X} size={16} color="#fff" />
                          </Pressable>
                        </View>
                      ))}
                      {draft.photos.length < MAX_PHOTOS && (
                        <Pressable
                          disabled={sending}
                          accessibilityRole="button"
                          accessibilityLabel="Prendre une photo avec la caméra"
                          onPress={() => setCameraOpen(true)}
                          style={styles.addPhoto}
                        >
                          <AppIcon icon={Camera} size={25} color="#D94235" />
                          <Text style={styles.addPhotoText}>
                            Prendre{'\n'}une photo
                          </Text>
                        </Pressable>
                      )}
                    </View>
                    <Text style={styles.label}>Autres informations</Text>
                    <TextInput
                      editable={!sending}
                      accessibilityLabel="Autres informations sur l’accident"
                      placeholder="Un repère, les véhicules impliqués, ce que vous avez observé…"
                      placeholderTextColor="#89919E"
                      value={draft.notes}
                      onChangeText={(value) => update('notes', value)}
                      maxLength={2000}
                      multiline
                      style={[styles.input, styles.notes]}
                    />
                    <View style={styles.privacy}>
                      <AppIcon icon={ShieldCheck} size={18} color="#6C7789" />
                      <Text style={[styles.small, styles.flex]}>
                        Les précisions et les photos sont visibles par tous dans
                        la fiche de l’accident. Les numéros d’identité et les
                        immatriculations restent visibles uniquement par vous.
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
                          locationRequest.current++;
                          locationController.current?.abort();
                          setLocating(false);
                          setError(null);
                          onBackToTypes();
                        } else changeStep(step - 1);
                      }}
                      disabled={sending}
                    />
                    <View style={styles.flex}>
                      <Action
                        label={
                          sending
                            ? 'Enregistrement…'
                            : step === 3
                              ? 'Enregistrer les compléments'
                              : 'Suivant'
                        }
                        icon={step === 3 ? CheckCheck : ArrowRight}
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
    <SuspiciousVehicleReportSheet visible={visible && reportType === 'suspicious_vehicle'} onBackToTypes={onBackToTypes} onClose={onClose} />
    <GunfireReportSheet visible={visible && reportType === 'gunfire'} onBackToTypes={onBackToTypes} onClose={onClose} />
    <ArmedPresenceReportSheet visible={visible && reportType === 'armed_presence'} onBackToTypes={onBackToTypes} onClose={onClose} />
    <BarricadeReportSheet visible={visible && reportType === 'barricade'} onBackToTypes={onBackToTypes} onClose={onClose} />
    <KidnappingReportSheet
      visible={visible && reportType === 'kidnapping'}
      onBackToTypes={onBackToTypes}
      onClose={onClose}
    />
    </>
  );
}

const styles = StyleSheet.create({
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
    gap: 8,
  },
  landmarkInput: { minHeight: 65, fontSize: 13 },
  savedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#EEF8F5',
  },
  laterButton: {
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
    boxShadow: '0 -8px 50px rgba(17, 24, 39, 0.16)',
  },
  handleArea: { height: 22, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#D8DDE5' },
  header: {
    paddingHorizontal: 22,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: '#FFF0EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  eyebrow: {
    color: '#AD5044',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.3,
    marginBottom: 6,
  },
  title: {
    color: '#1C2637',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  iconButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: '#F5F6F8',
  },
  steps: {
    flexDirection: 'row',
    gap: 9,
    paddingHorizontal: 24,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF0F3',
  },
  stepItem: { flex: 1, minHeight: 40 },
  stepBar: {
    height: 3,
    borderRadius: 3,
    backgroundColor: '#EAEDF1',
    marginBottom: 9,
  },
  stepBarActive: { backgroundColor: '#E14D3E' },
  stepLabel: { color: '#9299A4', fontSize: 12, fontWeight: '600' },
  stepLabelActive: { color: '#B93F35' },
  content: { padding: 24, gap: 14, paddingBottom: 30 },
  notice: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#FFF6E8',
    borderRadius: 14,
    padding: 14,
    alignItems: 'flex-start',
  },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 18, color: '#86602B' },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 7,
  },
  sectionIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: '#FFF0EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    color: '#243147',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.35,
  },
  small: { color: '#768091', fontSize: 12, lineHeight: 18 },
  body: { color: '#768091', fontSize: 14, lineHeight: 21 },
  input: {
    borderColor: '#DFE3EA',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    fontSize: 14,
    lineHeight: 21,
    color: '#243147',
    backgroundColor: '#FAFBFC',
    minHeight: 50,
  },
  locationInput: { minHeight: 74, textAlignVertical: 'top' },
  gpsButton: {
    minHeight: 46,
    flexDirection: 'row',
    gap: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF8F5',
    borderRadius: 13,
  },
  gpsText: {
    color: '#267E70',
    fontWeight: '600',
    fontSize: 13,
    lineHeight: 19,
  },
  gpsResult: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#DCEEE7',
  },
  radio: {
    width: 19,
    height: 19,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#D6DCE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { color: '#273347', fontSize: 14, fontWeight: '700' },
  cardDescription: {
    color: '#86909E',
    fontSize: 11,
    lineHeight: 17,
    marginTop: 3,
  },
  severityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    padding: 14,
    minHeight: 78,
    borderWidth: 1.5,
    borderColor: '#E6E9EE',
    borderRadius: 17,
  },
  severityIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summary: {
    backgroundColor: '#F5F7FA',
    borderRadius: 17,
    padding: 16,
    gap: 9,
  },
  summaryTitle: { color: '#29364C', fontSize: 13, fontWeight: '700' },
  summaryDetails: { color: '#637087', fontSize: 12, fontWeight: '600' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  optional: {
    color: '#9099A7',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  label: {
    color: '#485469',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: -6,
  },
  notes: { minHeight: 92, textAlignVertical: 'top' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  photoWrap: { width: 100, height: 105 },
  photo: { width: '100%', height: '100%', borderRadius: 15 },
  removePhoto: {
    position: 'absolute',
    right: 3,
    top: 3,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#172033CC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhoto: {
    width: 100,
    height: 105,
    borderWidth: 1.5,
    borderColor: '#E9BCB3',
    borderStyle: 'dashed',
    borderRadius: 15,
    backgroundColor: '#FFFAF7',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  addPhotoText: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 15,
    fontWeight: '600',
    color: '#C85443',
  },
  privacy: {
    flexDirection: 'row',
    gap: 9,
    alignItems: 'flex-start',
    marginTop: 4,
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
    gap: 8,
  },
  reference: { color: '#36465D', fontSize: 12, fontWeight: '700' },
});
