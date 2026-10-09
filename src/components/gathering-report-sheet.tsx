import { OptionalReportDetails } from '@/components/optional-report-details';
import { ReportScene } from '@/components/report-scene';
import { ReportModalSheet } from '@/components/ui/report-modal-sheet';
import { ReportContextStep } from '@/components/report-context-step';
import type { ManualReportContext } from '@/features/report-events/context';
import { surfaceDepth } from '@/components/ui/surface-depth';
import { Pressable, ScrollView, Text, TextInput, View } from '@/features/language/native';
import { useAppTheme, createThemedStyles, useThemeColor } from '@/features/appearance/theme-provider';
import { ReportDraftLoading } from '@/components/report-draft-loading';
import { ReportReward } from '@/components/report-reward';
import { GeocodingCredit } from '@/components/geocoding-credit';
import { AppIcon, type AppIconComponent } from '@/components/ui/app-icon';
import { acquirePreciseLocation } from '@/features/accident-report/precise-location';
import { reverseGeocodeZone } from '@/features/accident-report/reverse-geocode';
import { isPreciseLocation } from '@/features/accident-report/model';
import {
  gatheringLocationDescription,
  gatheringTypes,
  gatheringStates,
  trafficImpactOptions,
  validateGatheringStep,
  type GatheringReportDraft,
} from '@/features/gathering-report/model';
import { saveGatheringReportStep } from '@/features/gathering-report/submit';
import { useAppLocation } from '@/features/location/app-location';
import { reusableAppLocation } from '@/features/location/app-location-model';
import { useEventChoice } from '@/features/report-events/use-event-choice';
import { useReportDraft } from '@/features/report-events/use-report-draft';
import { randomUUID } from 'expo-crypto';

import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import ArrowRight from 'lucide-react-native/icons/arrow-right';
import Check from 'lucide-react-native/icons/check';
import CheckCheck from 'lucide-react-native/icons/check-check';
import UsersRound from 'lucide-react-native/icons/users-round';
import X from 'lucide-react-native/icons/x';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

const stepLabels = ['Type', 'Situation', 'Circulation'];


const makeDraft = (): GatheringReportDraft => ({
  id: randomUUID(),
  location: '',
  locationHint: '',
  coordinates: null,
  gatheringType: null,
  gatheringState: null,
  trafficImpact: null,
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
        (disabled || pressed) && styles.dimmed,
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
        style={[
          styles.actionText,
          secondary && styles.secondaryActionText,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function OptionCard({
  label,
  description,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  description?: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={description ? `${label}. ${description}` : label}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.optionCard,
        selected && styles.optionCardSelected,
        (pressed || disabled) && styles.dimmed,
      ]}
    >
      <View style={styles.optionCopy}>
        <Text style={[styles.optionTitle, selected && styles.optionTitleSelected]}>
          {label}
        </Text>
        {description && (
          <Text style={styles.optionDescription}>{description}</Text>
        )}
      </View>
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected && <AppIcon icon={Check} size={13} color="#fff" />}
      </View>
    </Pressable>
  );
}

export function GatheringReportSheet({
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

  const { location: appLocation } = useAppLocation();
  const {
    draft,
    setDraft,
    step,
    setStep,
    savedSteps,
    setSavedSteps,
    receipt,
    setReceipt,
    ready,
    storageError,
    checkpoint,
    retryStorage,
  } = useReportDraft('gathering', makeDraft, visible);
  const eventChoice = useEventChoice('gathering');
  const [locating, setLocating] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState('');
  const [locationProgress, setLocationProgress] = useState('');
  const [locationError, setLocationError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingLocationHint, setEditingLocationHint] = useState(false);
  const locationController = useRef<AbortController | null>(null);
  const locationRequest = useRef(0);
  const savedLocation = useRef<string | null>(null);
  const submitting = useRef(false);
  const scroll = useRef<ScrollView>(null);

  useEffect(() => {
    if (!visible) {
      locationRequest.current++;
      locationController.current?.abort();
      return;
    }

  }, [visible, ready]);

  useEffect(() => {
    const tracker = locationRequest;
    const controller = locationController;
    return () => {
      tracker.current++;
      controller.current?.abort();
    };
  }, []);

  function update<K extends keyof GatheringReportDraft>(
    key: K,
    value: GatheringReportDraft[K],
  ) {
    if (submitting.current) return;
    setDraft((current) => ({ ...current, [key]: value }));
    setError(null);
  }

  function changeStep(next: number) {
    setDraft((current) => ({ ...current, visitedStep: Math.max(current.visitedStep ?? 0, next) }));
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

  async function locate(context?: ManualReportContext) {
    if (!ready || locating || submitting.current) return;
    const sourceDraft = context ? { ...draft, ...context, locationHint: '', eventChoiceMade: false, eventId: null } : draft;
    const manual = sourceDraft.locationSource === 'manual';
    const defaultLocation = manual || isPreciseLocation(sourceDraft.coordinates)
      ? null
      : reusableAppLocation(appLocation);
    const request = ++locationRequest.current;
    locationController.current?.abort();
    const controller = new AbortController();
    locationController.current = controller;
    setLocating(true);
    setError(null);
    setLocationError(null);
    changeStep(0);
    let geocodingTimeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const coordinates = manual || isPreciseLocation(sourceDraft.coordinates)
        ? sourceDraft.coordinates!
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
        sourceDraft.location ||
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
        ...sourceDraft,
        locationSource: manual ? 'manual' as const : 'device' as const,
        occurredAt: sourceDraft.occurredAt ?? new Date().toISOString(),
        coordinates,
        location: location.slice(0, 240),
      };
      setLocationProgress('Recherche des signalements proches…');
      locatedDraft = await eventChoice.choose(locatedDraft, controller.signal);
      if (locationRequest.current !== request) return;
      setDraft(locatedDraft);
      submitting.current = true;
      setSending(true);
      await checkpoint(locatedDraft);
      if (locationRequest.current !== request) return;
      await saveGatheringReportStep(locatedDraft, 0, setProgress);
      savedLocation.current = gatheringLocationDescription(locatedDraft);
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
      if (locationController.current === controller) {
        submitting.current = false;
        setSending(false);
        setLocating(false);
      }
    }
  }

  async function next(skip = false) {
    if (submitting.current) return;
    const validation = skip ? null : validateGatheringStep(draft, step);
    if (validation) {
      setError(validation);
      return;
    }
    submitting.current = true;
    setSending(true);
    setError(null);
    try {
      await checkpoint(draft);
      if (draft.sourceReportId && savedSteps === 0) {
        await saveGatheringReportStep(draft, 0, setProgress);
        setSavedSteps(1);
      }
      if (
        !skip && step === 1 && !draft.sourceReportId &&
        savedLocation.current !== gatheringLocationDescription(draft)
      ) {
        await saveGatheringReportStep(draft, 0, setProgress);
        savedLocation.current = gatheringLocationDescription(draft);
      }
      const id = skip ? draft.id : await saveGatheringReportStep(draft, step, setProgress);
      if (!skip) setSavedSteps((current) => Math.max(current, step + 1));
      if (step === 3) setReceipt(id);
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
    setReceipt(null);
    savedLocation.current = null;
    setLocating(false);
    setSending(false);
    setError(null);
    setLocationError(null);
    onClose();
  }

  if (!draft) return null;
  return (
    <ReportModalSheet
      visible={visible}
      onRequestClose={close}
      dismissDisabled={sending}
    >
          {!ready ? (
            <ReportDraftLoading
              error={storageError}
              onRetry={retryStorage}
              onClose={close}
            />
          ) : eventChoice.panel ? (
            eventChoice.panel
          ) : step === 0 && !receipt ? (
            <ReportContextStep
              key={draft.id}
              initialContext={draft}
              active={visible}
              busy={locating || sending}
              cancelDisabled={sending}
              error={locationError || storageError}
              progressLabel={sending ? progress : locationProgress}
              onPublish={(context) => void locate(context)}
              onCancel={() => {
                locationRequest.current++;
                locationController.current?.abort();
                setLocating(false);
                done();
              }}
            />
          ) : receipt ? (
            <ReportReward
              reportId={receipt}
              reportKind="gathering"
              onDone={done}
              visible={visible}
            />
          ) : (
            <>
              <View style={styles.header}>
                <View style={styles.headerIcon}>
                  <AppIcon icon={UsersRound} size={23} color={themeColor("#287F85", 'info')} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.eyebrow}>RASSEMBLEMENT</Text>
                  <Text accessibilityRole="header" style={styles.title}>
                    {draft.sourceReportId ? 'Ajouter un témoignage' : 'Signaler un rassemblement'}
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
                          disabled: index > Math.max(savedSteps, step, draft.visitedStep ?? 0) || sending,
                        }}
                        disabled={index > Math.max(savedSteps, step, draft.visitedStep ?? 0) || sending}
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
                          numberOfLines={1}
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
                {storageError && (
                  <Text accessibilityRole="alert" style={styles.inlineError}>
                    {storageError}
                  </Text>
                )}
                {step > 0 && (
                  <View style={styles.locationSummary}>
                    <Text numberOfLines={1} style={styles.locationZone}>
                      {draft.location ? <Text translate={false}>{draft.location}</Text> : 'Zone détectée par GPS'}
                    </Text>
                    {!draft.sourceReportId && (editingLocationHint ? (
                      <TextInput keyboardAppearance={scheme}
                        autoFocus
                        editable={!sending}
                        accessibilityLabel="Repère précis près du rassemblement, facultatif"
                        placeholder="Ajoutez un repère sur place"
                        placeholderTextColor={themeColor("#8A93A1", 'muted')}
                        value={draft.locationHint}
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
                    ))}
                    {!draft.location && <GeocodingCredit />}
                  </View>
                )}
                {step === 1 && (
                  <>
                    <ReportScene kind="gathering" step={1} value={draft.gatheringType} />
                    <Text style={styles.sectionTitle}>
                      Quel type de rassemblement ?
                    </Text>
                    <View style={styles.optionList}>
                      {gatheringTypes.map((option) => (
                        <OptionCard
                          key={option.value}
                          label={option.label}
                          selected={draft.gatheringType === option.value}
                          disabled={sending}
                          onPress={() =>
                            update('gatheringType', option.value)
                          }
                        />
                      ))}
                    </View>
                  </>
                )}
                {step === 2 && (
                  <>
                    <ReportScene kind="gathering" step={2} value={draft.gatheringState} />
                    <Text style={styles.sectionTitle}>
                      Quelle est la situation ?
                    </Text>
                    <View style={styles.stateGrid}>
                      {gatheringStates.map((option) => {
                        const selected = draft.gatheringState === option.value;
                        return (
                          <Pressable
                            key={option.value}
                            accessibilityRole="radio"
                            accessibilityLabel={option.label}
                            accessibilityState={{ checked: selected, disabled: sending }}
                            disabled={sending}
                            onPress={() => update('gatheringState', option.value)}
                            style={({ pressed }) => [
                              styles.stateOption,
                              selected && styles.stateOptionSelected,
                              (pressed || sending) && styles.dimmed,
                            ]}
                          >
                            <Text
                              style={[
                                styles.stateOptionText,
                                selected && styles.optionTitleSelected,
                              ]}
                            >
                              {option.label}
                            </Text>
                            {selected && (
                              <View style={[styles.radio, styles.radioSelected]}>
                                <AppIcon icon={Check} size={13} color="#fff" />
                              </View>
                            )}
                          </Pressable>
                        );
                      })}
                    </View>
                  </>
                )}
                {step === 3 && (
                  <>
                    <ReportScene kind="gathering" step={3} value={draft.trafficImpact} />
                    <Text style={styles.sectionTitle}>
                      Quel impact sur la circulation ?
                    </Text>
                    <View style={styles.optionList}>
                      {trafficImpactOptions.map((option) => (
                        <OptionCard
                          key={option.value}
                          label={option.label}
                          selected={draft.trafficImpact === option.value}
                          disabled={sending}
                          onPress={() => update('trafficImpact', option.value)}
                        />
                      ))}
                    </View>
                    <Text style={styles.label}>Précisions utiles</Text>
                    <OptionalReportDetails key="details" hasValue={Boolean(draft.details)}>
                      <TextInput keyboardAppearance={scheme}
                        editable={!sending}
                        accessibilityLabel="Précisions facultatives sur le rassemblement"
                        placeholder="Précisions (facultatif)"
                        placeholderTextColor={themeColor("#89919E", 'muted')}
                        value={draft.details}
                        onChangeText={(value) => update('details', value)}
                        maxLength={2000}
                        multiline
                        style={[styles.input, styles.notes]}
                      />
                    </OptionalReportDetails>

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
                    <Text accessibilityLiveRegion="polite" style={styles.progress}>
                      {progress}
                    </Text>
                  )}
                  <Pressable accessibilityRole="button" accessibilityLabel="Passer" disabled={sending} onPress={() => next(true)}
                    style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={styles.small}>Passer</Text>
                  </Pressable>
                  <View style={styles.footerActions}>
                    <Action
                      label={step === 1 ? (draft.sourceReportId ? 'Fermer' : 'Types') : 'Retour'}
                      secondary
                      icon={ArrowLeft}
                      onPress={() => {
                        if (step === 1) {
                          pause();
                          setError(null);
                          onBackToTypes();
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
                            : step === 3
                              ? 'Envoyer le signalement'
                              : 'Suivant'
                        }
                        icon={step === 3 ? CheckCheck : ArrowRight}
                        onPress={() => next()}
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
                      <Text style={styles.small}>Fermer, étapes enregistrées</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </>
          )}
    </ReportModalSheet>
  );
}

const useStyles = createThemedStyles((themeColor) => StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 22,
    paddingTop: 6,
    paddingBottom: 15,
  },
  headerIcon: {
    ...surfaceDepth(themeColor, 'control'),
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: themeColor('#EAF5F5', 'infoSoft'),
  },
  flex: { flex: 1 },
  eyebrow: {
    color: themeColor('#287F85', 'info'),
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  title: {
    color: themeColor('#1C2637', 'text'),
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '700',
    letterSpacing: -0.45,
  },
  iconButton: {
    ...surfaceDepth(themeColor, 'control'),
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: themeColor('#F5F6F8', 'elevated'),
    alignItems: 'center',
    justifyContent: 'center',
  },
  steps: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 22,
    paddingBottom: 12,
  },
  stepItem: { flex: 1, gap: 6, minWidth: 0 },
  stepBar: { height: 3, borderRadius: 2, backgroundColor: themeColor('#E7E9ED', 'elevated') },
  stepBarActive: { backgroundColor: '#287F85' },
  stepLabel: { color: themeColor('#939BA7', 'muted'), fontSize: 11, fontWeight: '600' },
  stepLabelActive: { color: themeColor('#246F75', 'info') },
  content: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 28, gap: 16 },
  locationSearch: { alignItems: 'center', gap: 22, paddingVertical: 32 },
  locationArt: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: themeColor('#EAF5F5', 'infoSoft'),
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationExplanation: {
    color: themeColor('#667185', 'muted'),
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
  },
  gpsText: { color: themeColor('#287F85', 'info'), fontSize: 13, textAlign: 'center' },
  small: { color: themeColor('#8A94A3', 'muted'), fontSize: 12, lineHeight: 18, textAlign: 'center' },
  locationSummary: {
    ...surfaceDepth(themeColor, 'card'),
    gap: 5,
    padding: 12,
    borderRadius: 14,
    backgroundColor: themeColor('#F7F8FA', 'surface'),
  },
  locationZone: { color: themeColor('#243147', 'text'), fontSize: 14, fontWeight: '600' },
  locationHintPrompt: { color: themeColor('#287F85', 'info'), fontSize: 13, fontWeight: '600' },
  locationHintInput: {
    color: themeColor('#243147', 'text'),
    fontSize: 13,
    borderBottomWidth: 1,
    borderBottomColor: themeColor('#D8DEE6', 'border'),
    paddingVertical: 4,
  },
  questionArt: {
    height: 124,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  questionImage: { width: 156, height: 124 },
  sectionTitle: {
    color: themeColor('#243147', 'text'),
    fontSize: 19,
    lineHeight: 25,
    fontWeight: '700',
    textAlign: 'center',
  },
  optionList: { gap: 10 },
  optionCard: {
    ...surfaceDepth(themeColor, 'control'),
    minHeight: 68,
    borderWidth: 1.5,
    borderColor: themeColor('#E1E5EB', 'border'),
    backgroundColor: themeColor('#FAFBFC', 'surface'),
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  optionCardSelected: { ...surfaceDepth(themeColor, 'raised'), borderColor: '#287F85', backgroundColor: themeColor('#EAF5F5', 'infoSoft') },
  optionCopy: { flex: 1, gap: 3 },
  optionTitle: { color: themeColor('#354456', 'secondary'), fontSize: 14, fontWeight: '700' },
  optionTitleSelected: { color: themeColor('#246F75', 'info') },
  optionDescription: { color: themeColor('#7B8594', 'muted'), fontSize: 12, lineHeight: 18 },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: themeColor('#C8CED7', 'border'),
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { backgroundColor: '#287F85', borderColor: '#287F85' },
  stateGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stateOption: {
    ...surfaceDepth(themeColor, 'control'),
    flexBasis: '46%',
    flexGrow: 1,
    minWidth: 130,
    minHeight: 62,
    borderWidth: 1.5,
    borderColor: themeColor('#E1E5EB', 'border'),
    backgroundColor: themeColor('#FAFBFC', 'surface'),
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  stateOptionSelected: { ...surfaceDepth(themeColor, 'raised'), borderColor: '#287F85', backgroundColor: themeColor('#EAF5F5', 'infoSoft') },
  stateOptionText: { flex: 1, color: themeColor('#354456', 'secondary'), fontSize: 13, fontWeight: '700' },
  label: { color: themeColor('#3D485A', 'secondary'), fontSize: 14, fontWeight: '700', marginTop: 6 },
  input: {
    ...surfaceDepth(themeColor, 'inset'),
    borderWidth: 1,
    borderColor: themeColor('#DCE1E7', 'border'),
    borderRadius: 14,
    padding: 14,
    color: themeColor('#243147', 'text'),
    backgroundColor: themeColor('#FAFBFC', 'surface'),
    fontSize: 14,
  },
  notes: { minHeight: 100, textAlignVertical: 'top' },
  optional: { color: themeColor('#929AA6', 'muted'), fontSize: 11, marginTop: -10 },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: themeColor('#E5E7EB', 'border'),
    paddingHorizontal: 22,
    paddingTop: 13,
    gap: 8,
  },
  footerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  action: {
    ...surfaceDepth(themeColor, 'control'),
    minHeight: 50,
    borderRadius: 15,
    paddingHorizontal: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryAction: { ...surfaceDepth(themeColor, 'raised'), backgroundColor: '#287F85' },
  secondaryAction: { ...surfaceDepth(themeColor, 'control'), backgroundColor: themeColor('#F1F3F6', 'elevated') },
  actionText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  secondaryActionText: { color: themeColor('#243147', 'text') },
  inlineError: { color: themeColor('#BD2E40', 'accent'), fontSize: 13, lineHeight: 19, textAlign: 'center' },
  progress: { color: themeColor('#287F85', 'info'), fontSize: 12, textAlign: 'center' },
  laterButton: { minHeight: 32, justifyContent: 'center', alignItems: 'center' },
  footerHint: { color: themeColor('#A1A7B0', 'muted'), fontSize: 10, lineHeight: 14, textAlign: 'center' },
  dimmed: { opacity: 0.6 },
}));
