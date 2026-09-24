import { Pressable, ScrollView, Text, TextInput, View } from '@/features/language/native';
import { useAppTheme, createThemedStyles, useThemeColor } from '@/features/appearance/theme-provider';
import { useReportDraft } from '@/features/report-events/use-report-draft';
import { useEventChoice } from '@/features/report-events/use-event-choice';
import { ReportDraftLoading } from '@/components/report-draft-loading';
import { ReportReward } from "@/components/report-reward";
import { randomUUID } from "expo-crypto";
import ArrowLeft from "lucide-react-native/icons/arrow-left";
import ArrowRight from "lucide-react-native/icons/arrow-right";
import AudioLines from "lucide-react-native/icons/audio-lines";
import CheckCheck from "lucide-react-native/icons/check-check";
import LocateFixed from "lucide-react-native/icons/locate-fixed";
import MapPin from "lucide-react-native/icons/map-pin";
import ShieldAlert from "lucide-react-native/icons/shield-alert";
import ShieldCheck from "lucide-react-native/icons/shield-check";
import Info from "lucide-react-native/icons/info";
import X from "lucide-react-native/icons/x";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GeocodingCredit } from "@/components/geocoding-credit";
import { AppIcon, type AppIconComponent } from "@/components/ui/app-icon";
import {
  PROXIMITY_OPTIONS,
  SHOT_COUNT_OPTIONS,
  CADENCE_OPTIONS,
  gunfireOptionLabel,
  MAX_DETAILS_LENGTH,
  gunfireLocationDescription,
  validateGunfireStep,
  type GunfireReportDraft,
} from "@/features/gunfire-report/model";
import { acquirePreciseLocation } from "@/features/accident-report/precise-location";
import { reverseGeocodeZone } from "@/features/accident-report/reverse-geocode";
import { isPreciseLocation } from "@/features/accident-report/model";
import { saveGunfireReportStep } from "@/features/gunfire-report/submit";
import { useAppLocation } from "@/features/location/app-location";
import { reusableAppLocation } from "@/features/location/app-location-model";

const stepLabels = ["Tirs entendus", "Précisions"];
const makeDraft = (): GunfireReportDraft => ({
  id: randomUUID(),
  location: "",
  locationHint: "",
  coordinates: null,
  shotCount: "",
  proximity: "",
  cadence: "",
  details: "",
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
        <ActivityIndicator color={secondary ? themeColor("#243147", 'text') : "#fff"} />
      ) : (
        icon && (
          <AppIcon
            icon={icon}
            size={19}
            color={secondary ? themeColor("#243147", 'text') : "#fff"}
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

function Choices<T extends string>({
  title,
  options,
  value,
  disabled,
  onChange,
}: {
  title: string;
  options: readonly { value: T; label: string }[];
  value: string;
  disabled: boolean;
  onChange: (value: T) => void;
}) {
  const styles = useStyles();

  return (
    <View style={{ gap: 10 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {options.map((option) => (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={`${title} ${option.label}`}
            accessibilityState={{ checked: value === option.value, disabled }}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={[
              styles.choice,
              value === option.value && styles.choiceSelected,
              disabled && { opacity: 0.6 },
            ]}
          >
            <Text
              style={[
                styles.choiceText,
                value === option.value && styles.choiceTextSelected,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function GunfireReportSheet({
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
  const { draft, setDraft, step, setStep, savedSteps, setSavedSteps, receipt, setReceipt, ready, storageError, checkpoint, retryStorage } = useReportDraft('gunfire', makeDraft, visible);
  const eventChoice = useEventChoice('gunfire');
  const [locating, setLocating] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState("");
  const [locationProgress, setLocationProgress] = useState("");
  const [locationError, setLocationError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  function update<K extends keyof GunfireReportDraft>(
    key: K,
    value: GunfireReportDraft[K],
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
        : (defaultLocation?.coordinates ??
          (await acquirePreciseLocation(
            controller.signal,
            setLocationProgress,
          )));
      if (locationRequest.current !== request) return;
      setLocationProgress(
        defaultLocation
          ? "Position de l’application utilisée…"
          : "Recherche du nom du lieu…",
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
          : "") ||
        "";
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
      await saveGunfireReportStep(locatedDraft, 0, setProgress);
      savedLocation.current = gunfireLocationDescription(locatedDraft);
      setSavedSteps((current) => Math.max(current, 1));
      changeStep(1);
    } catch (cause) {
      if (locationRequest.current === request) {
        setDraft((current) => ({ ...current, eventChoiceMade: false }));
        changeStep(0);
        setLocationError(
          cause instanceof Error
            ? cause.message
            : "Localisation indisponible. Réessayez.",
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
    const validation = validateGunfireStep(draft, step);
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
        savedLocation.current !== gunfireLocationDescription(draft)
      ) {
        await saveGunfireReportStep(draft, 0, setProgress);
        savedLocation.current = gunfireLocationDescription(draft);
      }
      const id = await saveGunfireReportStep(draft, step, setProgress);
      setSavedSteps((current) => Math.max(current, step + 1));
      if (step === 2) setReceipt(id);
      else changeStep(step + 1);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Envoi impossible. Réessayez dans un instant.",
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
        behavior={Platform.OS === "ios" ? "padding" : "height"}
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
          ) : eventChoice.panel ? eventChoice.panel : receipt ? (
            <ReportReward
              reportId={receipt}
              reportKind="gunfire"
              onDone={done}
              visible={visible}
            />
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
                    Signaler des tirs
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
                        Chaque étape ajoute ses observations à la même
                        référence.
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
                      Votre position indique le lieu où vous entendez les tirs,
                      pas leur origine. Restez à l’abri : le signalement sera
                      enregistré dès que le GPS sera suffisamment précis.
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
                      automatiquement aux questions sur les tirs entendus.
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
                            {draft.location ? <Text translate={false}>{draft.location}</Text> : "Position GPS enregistrée"}
                          </Text>
                          <Text style={styles.small}>
                            Précision GPS : ±{" "}
                            {Math.ceil(draft.coordinates?.accuracy ?? 0)} m
                          </Text>
                          {!draft.location && (
                            <Text style={styles.small}>
                              Nom du lieu indisponible ·{" "}
                              {draft.coordinates?.latitude.toFixed(5)},{" "}
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
                        accessibilityLabel="Repère du lieu où vous entendez les tirs, facultatif"
                        placeholder="Ex. : devant la pharmacie, près du carrefour"
                        placeholderTextColor={themeColor("#89919E", 'muted')}
                        value={draft.locationHint}
                        onChangeText={(value) => update("locationHint", value)}
                        maxLength={250}
                        multiline
                        style={[styles.input, styles.landmarkInput]}
                      />
                    </View>
                    <View style={styles.sectionHeading}>
                      <AppIcon icon={AudioLines} color={themeColor("#D94235", 'accent')} size={25} />
                      <View style={styles.flex}>
                        <Text style={styles.sectionTitle}>
                          Que percevez-vous ?
                        </Text>
                        <Text style={styles.small}>
                          Une estimation suffit. Vous pouvez indiquer que vous
                          ne savez pas.
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.small}>
                      La position enregistrée correspond au lieu d’écoute ; elle
                      ne localise pas l’origine des tirs.
                    </Text>
                    <Choices
                      title="Les tirs semblent…"
                      options={PROXIMITY_OPTIONS}
                      value={draft.proximity}
                      disabled={sending}
                      onChange={(value) => update("proximity", value)}
                    />
                    <Choices
                      title="Quantité approximative de tirs"
                      options={SHOT_COUNT_OPTIONS}
                      value={draft.shotCount}
                      disabled={sending}
                      onChange={(value) => update("shotCount", value)}
                    />
                    <Choices
                      title="Rythme des tirs"
                      options={CADENCE_OPTIONS}
                      value={draft.cadence}
                      disabled={sending}
                      onChange={(value) => update("cadence", value)}
                    />
                    <View style={styles.warning}>
                      <AppIcon icon={ShieldAlert} size={20} color={themeColor("#B63838", 'accent')} />
                      <Text style={styles.warningText}>
                        Restez à distance et ne vous approchez pas pour
                        recueillir des informations. Signalez depuis un endroit
                        sûr.
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
                          {gunfireLocationDescription(draft) ? <Text translate={false}>{gunfireLocationDescription(draft)}</Text> : "Position GPS ajoutée"}
                        </Text>
                      </View>
                      <Text numberOfLines={3} style={styles.summaryDetails}>
                        Quantité :{" "}
                        {gunfireOptionLabel(
                          SHOT_COUNT_OPTIONS,
                          draft.shotCount,
                        )}
                      </Text>
                      <Text numberOfLines={2} style={styles.summaryDetails}>
                        Proximité :{" "}
                        {gunfireOptionLabel(PROXIMITY_OPTIONS, draft.proximity)}
                      </Text>
                      <Text style={styles.summaryDetails}>
                        Rythme :{" "}
                        {gunfireOptionLabel(CADENCE_OPTIONS, draft.cadence)}
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
                      placeholder="Ex. : entendus vers 14 h, depuis environ 2 minutes, tirs encore en cours ou arrêtés…"
                      placeholderTextColor={themeColor("#89919E", 'muted')}
                      value={draft.details}
                      onChangeText={(value) => update("details", value)}
                      maxLength={MAX_DETAILS_LENGTH}
                      multiline
                      style={[styles.input, styles.personNotes]}
                    />
                    <View style={styles.privacy}>
                      <AppIcon icon={ShieldCheck} size={18} color={themeColor("#6C7789", 'muted')} />
                      <Text style={[styles.small, styles.flex]}>
                        Ces observations seront visibles avec le signalement. Ne
                        renseignez pas de noms ni de coordonnées personnelles.
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
                      label={step === 1 ? "Types" : "Retour"}
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
                            ? "Enregistrement…"
                            : step === 2
                              ? "Terminer le signalement"
                              : "Suivant"
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
  choice: {
    minHeight: 46,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: themeColor("#E1E5EB", 'border'),
    borderRadius: 14,
    justifyContent: "center",
  },
  choiceSelected: { borderColor: "#DF493B", backgroundColor: themeColor("#FFF0EE", 'accentSoft') },
  choiceText: { color: themeColor("#637087", 'muted'), fontSize: 14, fontWeight: "600" },
  choiceTextSelected: { color: themeColor("#B63838", 'accent') },
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    backgroundColor: themeColor("#11182780", 'overlay'),
  },
  sheet: {
    width: "100%",
    maxWidth: 620,
    backgroundColor: themeColor("#fff", 'surface'),
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: "hidden",
  },
  handleArea: { height: 28, alignItems: "center", justifyContent: "center" },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: themeColor("#D8DDE5", 'elevated') },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 22,
    paddingTop: 6,
    paddingBottom: 15,
  },
  headerIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: themeColor("#FCE9E2", 'accentSoft'),
    alignItems: "center",
    justifyContent: "center",
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: themeColor("#F5F6F8", 'elevated'),
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    color: themeColor("#AD5044", 'accent'),
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginBottom: 5,
  },
  title: {
    color: themeColor("#1C2637", 'text'),
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  steps: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 22,
    paddingBottom: 13,
  },
  stepItem: { flex: 1, gap: 7 },
  stepBar: { height: 3, borderRadius: 3, backgroundColor: themeColor("#E4E7EC", 'elevated') },
  stepBarActive: { backgroundColor: "#DF493B" },
  stepLabel: { color: themeColor("#98A0AC", 'muted'), fontSize: 10, fontWeight: "600" },
  stepLabelActive: { color: themeColor("#BA3E34", 'accent') },
  content: { paddingHorizontal: 22, paddingVertical: 16, gap: 18 },
  flex: { flex: 1 },
  locationSearch: { alignItems: "center", gap: 22, paddingVertical: 32 },
  locationArt: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: themeColor("#EAF6F1", 'successSoft'),
    alignItems: "center",
    justifyContent: "center",
  },
  locationExplanation: {
    color: themeColor("#667185", 'muted'),
    fontSize: 15,
    lineHeight: 23,
    textAlign: "center",
  },
  locationCard: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: themeColor("#F0F8F5", 'elevated'),
    gap: 10,
  },
  savedNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: themeColor("#EEF8F5", 'successSoft'),
  },
  gpsText: { color: themeColor("#345B55", 'text'), fontSize: 13, fontWeight: "700" },
  small: { color: themeColor("#7A8493", 'muted'), fontSize: 11, lineHeight: 17 },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  sectionIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: themeColor("#FCE9E2", 'accentSoft'),
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    color: themeColor("#29364C", 'text'),
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "700",
  },
  inline: { flexDirection: "row", alignItems: "center", gap: 8 },
  label: { color: themeColor("#485469", 'secondary'), fontSize: 13, fontWeight: "600" },
  optional: {
    color: themeColor("#9099A7", 'muted'),
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  input: {
    borderWidth: 1.5,
    borderColor: themeColor("#E1E5EB", 'border'),
    borderRadius: 15,
    backgroundColor: themeColor("#fff", 'surface'),
    color: themeColor("#273347", 'text'),
    fontSize: 14,
    lineHeight: 21,
    paddingHorizontal: 15,
    paddingVertical: 13,
  },
  landmarkInput: { minHeight: 65, fontSize: 13 },
  notes: { minHeight: 105, textAlignVertical: "top" },
  personNotes: { minHeight: 180, textAlignVertical: "top" },
  warning: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    padding: 14,
    borderRadius: 14,
    backgroundColor: themeColor("#FFF0EE", 'accentSoft'),
  },
  warningText: { flex: 1, color: themeColor("#884039", 'accent'), fontSize: 12, lineHeight: 18 },
  privacy: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  summary: {
    backgroundColor: themeColor("#F5F7FA", 'surface'),
    borderRadius: 17,
    padding: 16,
    gap: 9,
  },
  summaryTitle: { color: themeColor("#29364C", 'text'), fontSize: 13, fontWeight: "700" },
  summaryDetails: {
    color: themeColor("#637087", 'muted'),
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
  footer: {
    paddingHorizontal: 22,
    paddingTop: 16,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: themeColor("#EEF0F3", 'border'),
    backgroundColor: themeColor("#fff", 'surface'),
  },
  footerActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  action: {
    borderRadius: 15,
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 8,
  },
  primaryAction: { backgroundColor: "#DF493B" },
  secondaryAction: { backgroundColor: themeColor("#F1F3F6", 'elevated') },
  actionText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
    flexShrink: 1,
    textAlign: "center",
  },
  secondaryActionText: { color: themeColor("#243147", 'text') },
  laterButton: {
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  footerHint: {
    color: themeColor("#929BA8", 'muted'),
    fontSize: 10,
    lineHeight: 15,
    textAlign: "center",
  },
  inlineError: { color: themeColor("#BA3540", 'accent'), fontSize: 12, lineHeight: 18 },
  progress: { color: themeColor("#637087", 'muted'), fontSize: 12, textAlign: "center" },
  success: { flex: 1, justifyContent: "center", padding: 30, gap: 22 },
  successTitle: {
    color: themeColor("#243147", 'text'),
    fontSize: 29,
    fontWeight: "700",
    letterSpacing: -0.7,
  },
  successBody: { color: themeColor("#768091", 'muted'), fontSize: 16, lineHeight: 25 },
  receipt: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: themeColor("#F5F7FA", 'surface'),
    gap: 7,
  },
  reference: { color: themeColor("#29364C", 'text'), fontSize: 12, fontWeight: "700" },
}));
