import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet } from 'react-native';
import { Pressable, ScrollView, Text, View } from '@/features/language/native';
import { createThemedStyles } from '@/features/appearance/theme-provider';
import { SavedPlacePicker } from '@/components/saved-place-picker';
import type { SavedPlace } from '@/features/profile/saved-places';
import { ReportPlaceCard } from '@/components/report-place-card';
import { ReportTimeRuler } from '@/components/report-time-ruler';
import { reportTimeAt, validMinutesAgo, publicationCountdown, type ManualReportContext } from '@/features/report-events/context';

export function ReportContextStep({ active, busy, cancelDisabled, error, progressLabel, initialContext, onPublish, onCancel }: {
  initialContext?: { locationSource?: string; occurredAt?: string; minutesAgo?: number; location: string; coordinates: { latitude: number; longitude: number } | null };
  active: boolean;
  busy: boolean;
  cancelDisabled: boolean;
  error: string | null;
  progressLabel: string;
  onPublish: (context?: ManualReportContext) => void;
  onCancel: () => void;
}) {
  const styles = useStyles();
  const [elsewhere, setElsewhere] = useState(false);
  const [editing, setEditing] = useState(initialContext?.locationSource === 'manual');
  const [progress, setProgress] = useState(0);
  const [picker, setPicker] = useState(false);
  const restored = initialContext?.locationSource === 'manual' && initialContext.occurredAt ? new Date(initialContext.occurredAt) : null;
  const [place, setPlace] = useState<SavedPlace | null>(restored && initialContext?.coordinates ? { address: initialContext.location, ...initialContext.coordinates } : null);
  const [minutesAgo, setMinutesAgo] = useState(() => {
    if (initialContext?.minutesAgo !== undefined && validMinutesAgo(initialContext.minutesAgo)) return initialContext.minutesAgo;
    if (restored) {
      const age = Math.round((Date.now() - restored.getTime()) / 900_000) * 15;
      if (validMinutesAgo(age)) return age;
    }
    return 15;
  });
  const [localError, setLocalError] = useState<string | null>(null);
  const latest = useRef({ elsewhere, onPublish });
  useEffect(() => { latest.current = { elsewhere, onPublish }; }, [elsewhere, onPublish]);
  const countdown = useRef<ReturnType<typeof publicationCountdown> | null>(null);
  const attempted = useRef(false);
  const [foreground, setForeground] = useState(AppState.currentState !== 'background');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!active || !foreground || editing || busy || error || attempted.current) return;
    setProgress(0);
    countdown.current = publicationCountdown(() => {
      attempted.current = true;
      if (latest.current.elsewhere) setEditing(true);
      else latest.current.onPublish();
    }, setProgress);
    return () => countdown.current?.cancel();
  }, [active, foreground, editing, busy, error]);

  function publish() {
    if (busy) return;
    if (!editing) {
      if (!attempted.current && !error) countdown.current?.finish();
      else if (elsewhere) setEditing(true);
      else onPublish();
      return;
    }
    if (typeof place?.latitude !== 'number' || typeof place.longitude !== 'number') {
      setLocalError('Choisissez le lieu de l’événement.');
      return;
    }
    setLocalError(null);
    onPublish({ locationSource: 'manual', occurredAt: reportTimeAt(minutesAgo), minutesAgo,
      location: place.address, coordinates: { latitude: place.latitude, longitude: place.longitude, accuracy: null } });
  }
  const displayedError = localError || ((!editing || initialContext?.locationSource === 'manual') ? error : null);
  const canPublish = !busy && (!editing || (place !== null && validMinutesAgo(minutesAgo)));
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, editing && styles.editingContent]} keyboardShouldPersistTaps="handled">
        <View style={styles.handle} />
        <Text accessibilityRole="header" style={styles.title}>{editing ? 'Où et quand ?' : 'Votre signalement'}</Text>
        {editing ? (
          <>
            <ReportPlaceCard place={place} disabled={busy} onPress={() => setPicker(true)} />
            <ReportTimeRuler minutesAgo={minutesAgo} disabled={busy} active={active && editing}
              onChange={(value) => { setMinutesAgo(value); setLocalError(null); }} />
          </>
        ) : (
          <View accessibilityRole="radiogroup" style={styles.options}>
            {[
              { value: false, label: 'Je suis sur place et cela se passe maintenant.' },
              { value: true, label: 'L’événement se déroule à un autre endroit ou à un autre moment.' },
            ].map((option) => <Pressable key={String(option.value)} accessibilityRole="radio"
              accessibilityState={{ checked: elsewhere === option.value, disabled: busy }} disabled={busy}
              onPress={() => { latest.current.elsewhere = option.value; setElsewhere(option.value); }} style={[styles.option, elsewhere === option.value && styles.selected]}>
              <View style={[styles.radio, elsewhere === option.value && styles.radioSelected]}>
                {elsewhere === option.value && <View style={styles.dot} />}
              </View>
              <Text style={styles.optionText}>{option.label}</Text>
            </Pressable>)}
          </View>
        )}
        {displayedError && <Text accessibilityRole="alert" style={styles.error}>{displayedError}</Text>}
        {busy && <Text accessibilityLiveRegion="polite" style={styles.status}>{progressLabel}</Text>}
      </ScrollView>
      <View style={styles.footer}>
        <Pressable accessibilityRole="button" accessibilityLabel="Publier" disabled={!canPublish}
          accessibilityState={{ disabled: !canPublish, busy }} onPress={publish}
          style={[styles.publish, !canPublish && styles.disabled]}>
          {!editing && <View pointerEvents="none" style={[styles.fill, { width: `${progress * 100}%` }]} />}
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.publishText}>Publier</Text>}
        </Pressable>
        <Pressable accessibilityRole="button" disabled={cancelDisabled} onPress={() => { countdown.current?.cancel(); onCancel(); }} style={styles.cancel}>
          <Text style={styles.cancelText}>Annuler</Text>
        </Pressable>
      </View>
      {picker && <SavedPlacePicker visible title="Lieu de l’événement" value={place}
        onClose={() => setPicker(false)} onConfirm={(value) => { setPlace(value); setPicker(false); }} />}
    </View>
  );
}
const useStyles = createThemedStyles((color) => StyleSheet.create({
  container: { flex: 1 }, content: { padding: 24, gap: 24 },
  handle: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: color('#D6DBE1', 'border') },
  editingContent: { gap: 18, paddingBottom: 12 },
  title: { fontSize: 28, fontWeight: '800', color: color('#243147', 'text') },
  options: { gap: 14 }, option: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 20, minHeight: 100, borderRadius: 22, borderWidth: 1, borderColor: color('#DFE4E9', 'border'), backgroundColor: color('#F8F9FB', 'surface') },
  selected: { borderColor: color('#267E70', 'success'), backgroundColor: color('#ECF6F2', 'elevated') },
  optionText: { flex: 1, fontSize: 17, lineHeight: 25, fontWeight: '600', color: color('#243147', 'text') },
  radio: { width: 25, height: 25, borderRadius: 13, borderWidth: 2, borderColor: color('#A4ADBA', 'muted'), alignItems: 'center', justifyContent: 'center' },
  radioSelected: { borderColor: color('#267E70', 'success') }, dot: { width: 13, height: 13, borderRadius: 7, backgroundColor: color('#267E70', 'success') },
  footer: { paddingHorizontal: 24, paddingTop: 12, gap: 4 }, publish: { height: 58, borderRadius: 18, overflow: 'hidden', backgroundColor: '#235D55', alignItems: 'center', justifyContent: 'center' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#329B85' }, publishText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  cancel: { minHeight: 48, justifyContent: 'center', alignItems: 'center' }, cancelText: { fontSize: 15, color: color('#697687', 'muted') },
  disabled: { opacity: 0.5 }, error: { color: color('#BD2E40', 'accent'), fontSize: 14 }, status: { color: color('#697687', 'muted'), fontSize: 14 },
}));
