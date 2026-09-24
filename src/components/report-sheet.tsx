import { Pressable, ScrollView, Text, TextInput, View } from '@/features/language/native';
import { useAppTheme, createThemedStyles, useThemeColor } from '@/features/appearance/theme-provider';
import { useReportDraft } from '@/features/report-events/use-report-draft';
import { useEventChoice } from '@/features/report-events/use-event-choice';
import { ReportDraftLoading } from '@/components/report-draft-loading';
import { AccidentTypePicker } from '@/components/accident-type-picker';
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
import Plus from 'lucide-react-native/icons/plus';
import Siren from 'lucide-react-native/icons/siren';
import TriangleAlert from 'lucide-react-native/icons/triangle-alert';
import X from 'lucide-react-native/icons/x';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon, type AppIconComponent } from '@/components/ui/app-icon';
import { ReportCamera } from '@/components/report-camera';
import { SuspiciousVehicleReportSheet } from '@/components/suspicious-vehicle-report-sheet';
import { GunfireReportSheet } from '@/components/gunfire-report-sheet';
import { ArmedPresenceReportSheet } from '@/components/armed-presence-report-sheet';
import { BarricadeReportSheet } from '@/components/barricade-report-sheet';
import { KidnappingReportSheet } from '@/components/kidnapping-report-sheet';
import { BreakdownReportSheet } from '@/components/breakdown-report-sheet';
import {
  ReportTypePicker,
  type ReportType,
} from '@/components/report-type-picker';
import {
  MAX_PHOTOS,
  isPreciseLocation,
  locationDescription,
  splitIdentifiers,
  validateStep,
  type ReportDraft,
  type Severity,
} from '@/features/accident-report/model';
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

function identifierRows(value: string) {
  if (!value.includes('\n') && /[,;]/.test(value)) {
    return splitIdentifiers(value);
  }
  return value.split('\n');
}

function IdentifierInputs({
  label,
  value,
  placeholder,
  disabled,
  capitalize = false,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  disabled: boolean;
  capitalize?: boolean;
  onChange: (value: string) => void;
}) {
  const { scheme } = useAppTheme();
  const styles = useStyles();
  const themeColor = useThemeColor();

  const rows = identifierRows(value);
  const updateRow = (index: number, next: string) => {
    const updated = [...rows];
    updated[index] = next;
    onChange(updated.join('\n'));
  };
  const removeRow = (index: number) => {
    onChange(rows.filter((_, rowIndex) => rowIndex !== index).join('\n'));
  };

  return (
    <View style={styles.identifierGroup}>
      <View style={styles.compactFieldHeader}>
        <Text style={styles.label}>{label}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Ajouter un ${label.toLocaleLowerCase()}`}
          disabled={disabled || rows.length >= 10}
          onPress={() => onChange([...rows, ''].join('\n'))}
          style={({ pressed }) => [
            styles.addIdentifier,
            (pressed || disabled || rows.length >= 10) && styles.dimmed,
          ]}
        >
          <AppIcon icon={Plus} size={19} color={themeColor("#267E70", 'success')} />
        </Pressable>
      </View>
      {rows.map((row, index) => (
        <View key={`${label}-${index}`} style={styles.identifierRow}>
          <TextInput keyboardAppearance={scheme}
            editable={!disabled}
            accessibilityLabel={`${label} ${index + 1}`}
            placeholder={placeholder}
            placeholderTextColor={themeColor("#89919E", 'muted')}
            value={row}
            onChangeText={(next) => updateRow(index, next)}
            maxLength={80}
            autoCapitalize={capitalize ? 'characters' : 'none'}
            autoCorrect={false}
            style={[styles.input, styles.identifierInput]}
          />
          {rows.length > 1 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Retirer ${label.toLocaleLowerCase()} ${index + 1}`}
              disabled={disabled}
              onPress={() => removeRow(index)}
              style={styles.removeIdentifier}
            >
              <AppIcon icon={X} size={18} color={themeColor("#7A8493", 'muted')} />
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );
}

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
      <Text style={[styles.actionText, secondary && { color: themeColor('#243147', 'text') }]}>
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
  const { scheme } = useAppTheme();
  const styles = useStyles();
  const themeColor = useThemeColor();

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
  const [editingLocationHint, setEditingLocationHint] = useState(false);
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
                  <AppIcon icon={TriangleAlert} size={23} color={themeColor("#DA3D32", 'accent')} />
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
                  <AppIcon icon={X} size={21} color={themeColor("#667185", 'muted')} />
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
                {storageError && <Text accessibilityRole="alert" style={{ color: themeColor("#BD2E40", 'accent') }}>{storageError}</Text>}
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
                          <AppIcon icon={LocateFixed} size={46} color={themeColor("#267E70", 'success')} />
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
                            <ActivityIndicator color={themeColor("#267E70", 'success')} size="large" />
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
                    <View style={styles.locationSummary}>
                      <Text numberOfLines={1} style={styles.locationZone}>
                        {draft.location ? <Text translate={false}>{draft.location}</Text> : 'Zone détectée par GPS'}
                      </Text>
                      {editingLocationHint ? (
                        <TextInput keyboardAppearance={scheme}
                          autoFocus
                          editable={!sending}
                          accessibilityLabel="Repère précis sur le lieu de l’accident, facultatif"
                          placeholder="Ajoutez un repère sur place"
                          placeholderTextColor={themeColor("#8A93A1", 'muted')}
                          value={draft.locationHint || ''}
                          onChangeText={(value) => update('locationHint', value)}
                          onBlur={() => setEditingLocationHint(false)}
                          onSubmitEditing={() => setEditingLocationHint(false)}
                          returnKeyType="done"
                          maxLength={250}
                          style={styles.locationHintInput}
                        />
                      ) : (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={
                            draft.locationHint
                              ? `Modifier le repère : ${draft.locationHint}`
                              : 'Ajouter un repère sur place'
                          }
                          disabled={sending}
                          onPress={() => setEditingLocationHint(true)}
                        >
                          <Text numberOfLines={1} style={styles.locationHintPrompt}>
                            {draft.locationHint ? <Text translate={false}>{draft.locationHint}</Text> : 'Ajouter un repère sur place'}
                          </Text>
                        </Pressable>
                      )}
                    </View>
                    <Text style={styles.sectionTitle}>
                      Quel type d’accident ?
                    </Text>
                    <AccidentTypePicker value={draft.accidentType} disabled={sending} onChange={(value) => update('accidentType', value)} />
                  </>
                )}
                {step === 2 && (
                  <>
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
                  </>
                )}
                {step === 3 && (
                  <>
                    <IdentifierInputs
                      label="Numéro d’immatriculation"
                      placeholder="Ex. : AA-12345"
                      value={draft.registrations}
                      disabled={sending}
                      capitalize
                      onChange={(value) => update('registrations', value)}
                    />
                    <IdentifierInputs
                      label="Numéro de pièce d’identité"
                      placeholder="Ex. : numéro disponible"
                      value={draft.identities}
                      disabled={sending}
                      onChange={(value) => update('identities', value)}
                    />
                    <View style={styles.compactFieldHeader}>
                      <Text style={styles.label}>Photos</Text>
                      <Text style={styles.optional}>
                        {draft.photos.length}/{MAX_PHOTOS}
                      </Text>
                    </View>
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
                          <AppIcon icon={Camera} size={25} color={themeColor("#D94235", 'accent')} />
                          <Text style={styles.addPhotoText}>Ajouter</Text>
                        </Pressable>
                      )}
                    </View>
                    <Text style={styles.label}>Autres informations</Text>
                    <TextInput keyboardAppearance={scheme}
                      editable={!sending}
                      accessibilityLabel="Autres informations sur l’accident"
                      placeholder="Ajouter une information"
                      placeholderTextColor={themeColor("#89919E", 'muted')}
                      value={draft.notes}
                      onChangeText={(value) => update('notes', value)}
                      maxLength={2000}
                      multiline
                      style={[styles.input, styles.notes]}
                    />
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
    <BreakdownReportSheet visible={visible && reportType === 'breakdown'} onBackToTypes={onBackToTypes} onClose={onClose} />
    <KidnappingReportSheet
      visible={visible && reportType === 'kidnapping'}
      onBackToTypes={onBackToTypes}
      onClose={onClose}
    />
    </>
  );
}

const useStyles = createThemedStyles((themeColor) => StyleSheet.create({
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
  locationSummary: { gap: 6, paddingVertical: 2 },
  locationZone: {
    color: themeColor('#243147', 'text'),
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
  },
  locationHintPrompt: {
    color: themeColor('#267E70', 'success'),
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
  },
  locationHintInput: {
    color: themeColor('#243147', 'text'),
    fontSize: 13,
    lineHeight: 20,
    padding: 0,
    borderBottomWidth: 1,
    borderBottomColor: themeColor('#A8D1C8', 'border'),
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
    backgroundColor: themeColor('#11182780', 'overlay'),
  },
  sheet: {
    width: '100%',
    maxWidth: 620,
    backgroundColor: themeColor('#fff', 'surface'),
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: 'hidden',
    boxShadow: '0 -8px 50px rgba(17, 24, 39, 0.16)',
  },
  handleArea: { height: 22, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: themeColor('#D8DDE5', 'elevated') },
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
    backgroundColor: themeColor('#FFF0EB', 'accentSoft'),
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  eyebrow: {
    color: themeColor('#AD5044', 'accent'),
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.3,
    marginBottom: 6,
  },
  title: {
    color: themeColor('#1C2637', 'text'),
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
    backgroundColor: themeColor('#F5F6F8', 'elevated'),
  },
  steps: {
    flexDirection: 'row',
    gap: 9,
    paddingHorizontal: 24,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: themeColor('#EEF0F3', 'border'),
  },
  stepItem: { flex: 1, minHeight: 40 },
  stepBar: {
    height: 3,
    borderRadius: 3,
    backgroundColor: themeColor('#EAEDF1', 'elevated'),
    marginBottom: 9,
  },
  stepBarActive: { backgroundColor: '#E14D3E' },
  stepLabel: { color: themeColor('#9299A4', 'muted'), fontSize: 12, fontWeight: '600' },
  stepLabelActive: { color: themeColor('#B93F35', 'accent') },
  content: { padding: 24, gap: 14, paddingBottom: 30 },
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
    backgroundColor: themeColor('#FFF0EB', 'accentSoft'),
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    color: themeColor('#243147', 'text'),
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.35,
  },
  small: { color: themeColor('#768091', 'muted'), fontSize: 12, lineHeight: 18 },
  body: { color: themeColor('#768091', 'muted'), fontSize: 14, lineHeight: 21 },
  input: {
    borderColor: themeColor('#DFE3EA', 'border'),
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    fontSize: 14,
    lineHeight: 21,
    color: themeColor('#243147', 'text'),
    backgroundColor: themeColor('#FAFBFC', 'surface'),
    minHeight: 50,
  },
  locationInput: { minHeight: 74, textAlignVertical: 'top' },
  gpsButton: {
    minHeight: 46,
    flexDirection: 'row',
    gap: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: themeColor('#EEF8F5', 'successSoft'),
    borderRadius: 13,
  },
  gpsText: {
    color: themeColor('#267E70', 'success'),
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
    borderColor: themeColor('#DCEEE7', 'border'),
  },
  radio: {
    width: 19,
    height: 19,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: themeColor('#D6DCE5', 'border'),
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { color: themeColor('#273347', 'text'), fontSize: 14, fontWeight: '700' },
  cardDescription: {
    color: themeColor('#86909E', 'muted'),
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
    borderColor: themeColor('#E6E9EE', 'border'),
    borderRadius: 17,
  },
  severityIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  optional: {
    color: themeColor('#9099A7', 'muted'),
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  label: {
    color: themeColor('#485469', 'secondary'),
    fontSize: 13,
    fontWeight: '600',
  },
  identifierGroup: { gap: 8 },
  compactFieldHeader: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  addIdentifier: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: themeColor('#EAF6F1', 'successSoft'),
    alignItems: 'center',
    justifyContent: 'center',
  },
  identifierRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  identifierInput: { flex: 1 },
  removeIdentifier: {
    width: 42,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dimmed: { opacity: 0.5 },
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
    borderColor: themeColor('#E9BCB3', 'border'),
    borderStyle: 'dashed',
    borderRadius: 15,
    backgroundColor: themeColor('#FFFAF7', 'surface'),
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  addPhotoText: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 15,
    fontWeight: '600',
    color: themeColor('#C85443', 'accent'),
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
    gap: 8,
  },
  reference: { color: themeColor('#36465D', 'secondary'), fontSize: 12, fontWeight: '700' },
}));
