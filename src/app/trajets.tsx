import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, KeyboardAvoidingView, Platform, StyleSheet, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import ArrowRight from 'lucide-react-native/icons/arrow-right';
import Bell from 'lucide-react-native/icons/bell';
import CalendarDays from 'lucide-react-native/icons/calendar-days';
import Check from 'lucide-react-native/icons/check';
import Clock3 from 'lucide-react-native/icons/clock';
import MapPin from 'lucide-react-native/icons/map-pin';
import Plus from 'lucide-react-native/icons/plus';
import Route from 'lucide-react-native/icons/route';
import Trash2 from 'lucide-react-native/icons/trash';
import { AppScreen } from '@/components/app-screen';
import { AppIcon } from '@/components/ui/app-icon';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { surfaceDepth } from '@/components/ui/surface-depth';
import { SafetyReportDetailSheet } from '@/components/safety-report-detail-sheet';
import { createThemedStyles, useThemeColor } from '@/features/appearance/theme-provider';
import { Pressable, Text, TextInput, View } from '@/features/language/native';
import { useLanguage } from '@/features/language/language-provider';
import { useSafetyAlerts } from '@/features/safety-profile/provider';
import { readSavedPlaces, type SavedPlaces } from '@/features/profile/saved-places';
import { formatRouteDistance } from '@/features/map/route-geometry';
import { RouteEditor } from '@/features/saved-routes/editor';
import type { RouteShape } from '@/features/saved-routes/routing';
import { defaultSchedule, scheduleDays, validateSchedule, WEEKDAYS, type RouteSchedule, type SavedRoute } from '@/features/saved-routes/model';
import { deleteRoute, markRouteAlertRead, saveRoute, setRouteAlerts } from '@/features/saved-routes/api';
import { useSavedRoutes } from '@/features/saved-routes/use-saved-routes';
import { enableRoutePush, getRoutePushStatus } from '@/features/saved-routes/push';

type Draft = { id?: string; shape: RouteShape | null; schedule: RouteSchedule | null };

export default function SavedRoutesScreen() {
  const { userId } = useSafetyAlerts();
  const router = useRouter();
  const styles = useStyles();
  const color = useThemeColor();
  if (userId) return <RoutesAccount key={userId} userId={userId} />;
  return <AppScreen title="Mes trajets" headerLeft={<Back onPress={() => router.back()} />}>
    <View style={styles.empty}>
      <AppIcon icon={Route} size={52} color={color('#267E70', 'success')} />
      <Text style={styles.cardTitle}>Vos trajets habituels</Text>
      <Text style={styles.muted}>Connectez-vous pour enregistrer vos trajets.</Text>
      <Action label="Se connecter" onPress={() => router.push('/profil?auth=signIn')} />
    </View>
  </AppScreen>;
}

function RoutesAccount({ userId }: { userId: string }) {
  const styles = useStyles();
  const color = useThemeColor();
  const router = useRouter();
  const { t } = useLanguage();
  const data = useSavedRoutes(userId);
  const alive = useRef(true);
  const locked = useRef(false);
  const [places, setPlaces] = useState<SavedPlaces | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [stage, setStage] = useState<'list' | 'editor' | 'schedule'>('list');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [selection, setSelection] = useState<string | null>(null);
  const [pushStatus, setPushStatus] = useState<string>('disabled');
  const refreshPush = useCallback(() => {
    void getRoutePushStatus(userId).then((status) => {
      if (alive.current) setPushStatus(status);
    }).catch(() => { if (alive.current) setPushStatus('unavailable'); });
  }, [userId]);
  useEffect(() => {
    alive.current = true;
    void readSavedPlaces().then((result) => { if (alive.current) setPlaces(result); }).catch(() => {});
    refreshPush();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') refreshPush(); });
    return () => { alive.current = false; subscription.remove(); };
  }, [refreshPush]);

  async function act(operation: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setFeedback(null);
    try { await operation(); }
    catch (error) {
      if (alive.current) setFeedback(error instanceof Error ? error.message : 'Une erreur est survenue. Réessayez.');
    } finally {
      locked.current = false;
      if (alive.current) setBusy(false);
    }
  }
  function create() {
    setDraft({ shape: null, schedule: null }); setFeedback(null); setStage('editor');
  }
  function edit(route: SavedRoute) {
    setDraft({ id: route.id, shape: route.shape, schedule: route }); setFeedback(null); setStage('schedule');
  }
  async function persist() {
    if (!draft?.shape || !draft.schedule) return;
    const validation = validateSchedule(draft.schedule);
    if (validation) { setFeedback(validation); return; }
    await act(async () => {
      await saveRoute(userId, draft.shape!, draft.schedule!, draft.id);
      if (!alive.current) return;
      setStage('list'); setDraft(null);
      setFeedback('Trajet enregistré.');
      await data.refresh();
      if (!alive.current) return;
      // Registration errors must never discard a successfully saved route.
      if (draft.schedule!.alertsEnabled && Platform.OS !== 'web') {
        try {
          const enabled = await enableRoutePush(userId);
          if (alive.current && !enabled) setFeedback('Trajet enregistré. Les notifications ne sont pas activées sur ce téléphone.');
        } catch (error) {
          if (alive.current) setFeedback(`Trajet enregistré. ${error instanceof Error ? error.message : 'Notifications indisponibles.'}`);
        }
        refreshPush();
      }
    });
  }
  function updateSchedule(next: Partial<RouteSchedule>) {
    setDraft((current) => current?.schedule ? { ...current, schedule: { ...current.schedule, ...next } } : current);
  }

  if (stage === 'editor') return <SafeAreaView edges={['top', 'bottom']} style={styles.editor}>
    <RouteEditor initialValue={draft?.shape} savedPlaces={places}
      onCancel={() => setStage(draft?.shape ? 'schedule' : 'list')}
      onConfirm={(shape) => {
        setDraft((current) => ({ ...current, shape, schedule: current?.schedule ?? defaultSchedule(shape) }));
        setFeedback(null); setStage('schedule');
      }} />
  </SafeAreaView>;

  if (stage === 'schedule' && draft?.shape && draft.schedule) {
    const schedule = draft.schedule;
    return <KeyboardAvoidingView style={styles.editor} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <AppScreen title={draft.id ? 'Modifier le trajet' : 'Votre routine'}
        headerLeft={<Back disabled={busy} onPress={() => { setStage('list'); setDraft(null); setFeedback(null); }} />}>
        <View style={styles.stack}>
          <View style={styles.steps}>
            <Text style={styles.stepDone}>1 · Parcours</Text><ArrowRight size={16} color={color('#8B948F', 'muted')} />
            <Text style={styles.stepActive}>2 · Horaires</Text>
          </View>
          <Pressable accessibilityRole="button" disabled={busy} style={styles.card} onPress={() => setStage('editor')}>
            <View style={styles.row}><AppIcon icon={Route} size={23} color={color('#267E70', 'success')} />
              <Text style={[styles.cardTitle, styles.grow]}>Parcours confirmé</Text><Text style={styles.link}>Modifier</Text></View>
            <Text translate={false} style={styles.routeEndpoints}>{draft.shape.waypoints[0]?.label} → {draft.shape.waypoints.at(-1)?.label}</Text>
            <Text style={styles.muted}>{formatRouteDistance(draft.shape.distanceMeters)} · {draft.shape.waypoints.length} points de passage</Text>
          </Pressable>
          <View style={styles.card}>
            <Text style={styles.fieldLabel}>Nom du trajet</Text>
            <TextInput accessibilityLabel="Nom du trajet" placeholder="Maison → Travail" editable={!busy} maxLength={80}
              value={schedule.name} onChangeText={(name) => updateSchedule({ name })} style={styles.input} />
            <View style={styles.sectionHeading}><AppIcon icon={Clock3} size={19} color={color('#267E70', 'success')} /><Text style={styles.fieldLabel}>Heure de départ</Text></View>
            <View style={styles.row}>
              <TextInput accessibilityLabel="Heure de départ au format HH:MM" value={schedule.departureTime} editable={!busy}
                keyboardType="numbers-and-punctuation" maxLength={5} placeholder="07:00" style={[styles.input, styles.timeInput]}
                onChangeText={(departureTime) => updateSchedule({ departureTime })} />
              <Text style={styles.muted}>Heure d’Haïti</Text>
            </View>
            <View style={styles.sectionHeading}><AppIcon icon={CalendarDays} size={19} color={color('#267E70', 'success')} /><Text style={styles.fieldLabel}>Jours de passage</Text></View>
            <View style={styles.days}>{WEEKDAYS.map((day) => {
              const selected = schedule.weekdays.includes(day.value);
              return <Pressable key={day.value} accessibilityRole="checkbox" accessibilityLabel={day.label}
                accessibilityState={{ checked: selected, disabled: busy }} disabled={busy}
                style={[styles.day, selected && styles.choiceSelected]}
                onPress={() => updateSchedule({ weekdays: selected ? schedule.weekdays.filter((value) => value !== day.value) : [...schedule.weekdays, day.value].sort() })}>
                <Text style={[styles.dayText, selected && styles.selectedText]}>{day.short}</Text>
              </Pressable>;
            })}</View>
            <Text style={styles.fieldLabel}>Durée habituelle</Text>
            <View style={styles.row}>
              <TextInput accessibilityLabel="Durée habituelle en minutes" editable={!busy} keyboardType="number-pad" maxLength={3}
                value={schedule.durationMinutes ? String(schedule.durationMinutes) : ''} style={[styles.input, styles.durationInput]}
                onChangeText={(value) => updateSchedule({ durationMinutes: Number(value.replace(/\D/g, '')) })} />
              <Text style={styles.muted}>minutes</Text>
            </View>
          </View>
          <View style={styles.card}>
            <View style={styles.row}><AppIcon icon={Bell} size={22} color={color('#267E70', 'success')} /><Text style={[styles.cardTitle, styles.grow]}>Surveiller ce trajet</Text>
              <Switch accessibilityLabel="Surveiller ce trajet" disabled={busy} value={schedule.alertsEnabled}
                trackColor={{ true: color('#267E70', 'success') }} onValueChange={(alertsEnabled) => updateSchedule({ alertsEnabled })} />
            </View>
            {schedule.alertsEnabled && <>
              <Text style={styles.fieldLabel}>M’alerter avant le départ</Text>
              <View style={styles.choices}>{[0, 15, 30, 60].map((minutes) => <Pressable key={minutes} disabled={busy}
                accessibilityRole="radio" accessibilityState={{ selected: schedule.leadMinutes === minutes }}
                onPress={() => updateSchedule({ leadMinutes: minutes })}
                style={[styles.choice, schedule.leadMinutes === minutes && styles.choiceSelected]}>
                <Text style={[styles.choiceText, schedule.leadMinutes === minutes && styles.selectedText]}>{minutes === 0 ? 'Au départ' : `${minutes} min`}</Text>
              </Pressable>)}</View>
            </>}
          </View>
          {feedback && <Text accessibilityLiveRegion="polite" style={styles.feedback}>{feedback}</Text>}
          <Action label={busy ? 'Enregistrement…' : 'Enregistrer le trajet'} icon={Check} disabled={busy} onPress={() => void persist()} />
        </View>
      </AppScreen>
    </KeyboardAvoidingView>;
  }

  const pushLabel = pushStatus === 'enabled' ? 'Notifications activées' : pushStatus === 'denied' ? 'Notifications bloquées' :
    pushStatus === 'unconfigured' ? 'Notifications non configurées' : pushStatus === 'unavailable' ? 'Notifications indisponibles' : 'Activer les notifications';
  return <AppScreen title="Mes trajets" headerLeft={<Back onPress={() => router.back()} />}
    headerRight={<Pressable accessibilityLabel="Actualiser mes trajets" disabled={busy || data.loading} onPress={() => void data.refresh()}><Text style={styles.link}>Actualiser</Text></Pressable>}>
    <View style={styles.stack}>
      <Action label="Nouveau trajet" icon={Plus} onPress={create} disabled={busy} />
      {feedback && <Text accessibilityLiveRegion="polite" style={styles.feedback}>{feedback}</Text>}
      {data.loading && <ActivityIndicator color={color('#267E70', 'success')} />}
      {data.error && <Pressable onPress={() => void data.refresh()}><Text style={styles.feedback}>{data.error}</Text></Pressable>}
      {!data.loading && !data.error && !data.routes.length && <View style={styles.empty}>
        <AppIcon icon={Route} size={64} color={color('#267E70', 'success')} />
        <Text style={styles.cardTitle}>Votre premier trajet</Text>
        <View style={styles.emptySteps}><Text style={styles.muted}>Parcours</Text><ArrowRight size={18} color={color('#8B948F', 'muted')} /><Text style={styles.muted}>Horaires</Text><ArrowRight size={18} color={color('#8B948F', 'muted')} /><Text style={styles.muted}>Alertes</Text></View>
      </View>}
      {data.routes.map((route) => <View key={route.id} style={styles.card}>
        <View style={styles.row}>
          <View style={styles.routeIcon}><AppIcon icon={Route} size={24} color={color('#267E70', 'success')} /></View>
          <Pressable style={styles.grow} accessibilityRole="button" onPress={() => edit(route)} disabled={busy}>
            <Text translate={false} style={styles.cardTitle}>{route.name}</Text>
            <Text style={styles.muted}>{formatRouteDistance(route.shape.distanceMeters)} · {route.durationMinutes} min</Text>
          </Pressable>
          <Switch accessibilityLabel={`${t('Surveiller le trajet')} ${route.name}`} value={route.alertsEnabled} disabled={busy}
            trackColor={{ true: color('#267E70', 'success') }} onValueChange={(enabled) => void act(async () => {
              await setRouteAlerts(userId, route.id, enabled); await data.refresh();
              if (alive.current && enabled && Platform.OS !== 'web') { await enableRoutePush(userId); refreshPush(); }
            })} />
        </View>
        <View style={styles.row}><Clock3 size={17} color={color('#667A6D', 'secondary')} /><Text style={styles.scheduleTime}>{route.departureTime}</Text><Text style={styles.muted}>{scheduleDays(route.weekdays)}</Text></View>
        <View style={styles.row}><MapPin size={17} color={color('#667A6D', 'secondary')} /><Text translate={false} numberOfLines={2} style={[styles.endpoints, styles.grow]}>{route.shape.waypoints[0]?.label} → {route.shape.waypoints.at(-1)?.label}</Text></View>
        <View style={styles.divider} />
        <View style={styles.row}>
          <View style={[styles.statusDot, !route.alertsEnabled && styles.pausedDot]} /><Text style={[styles.muted, styles.grow]}>{route.alertsEnabled ? 'Surveillance programmée' : 'En pause'}</Text>
          <Pressable style={styles.smallButton} accessibilityRole="button" disabled={busy} onPress={() => edit(route)}><Text style={styles.link}>Modifier</Text></Pressable>
          <Pressable style={styles.iconButton} accessibilityRole="button" accessibilityLabel={`${t('Supprimer le trajet')} ${route.name}`} disabled={busy} onPress={() => setRemoveId(route.id)}><Trash2 size={19} color={color('#9D5148', 'accent')} /></Pressable>
        </View>
        {removeId === route.id && <View style={styles.deleteConfirm}>
          <Text style={styles.fieldLabel}>Supprimer ce trajet ?</Text>
          <View style={styles.row}><Pressable style={styles.smallButton} disabled={busy} onPress={() => setRemoveId(null)}><Text style={styles.link}>Annuler</Text></Pressable>
            <Pressable style={styles.smallButton} disabled={busy} onPress={() => void act(async () => { await deleteRoute(userId, route.id); if (!alive.current) return; setRemoveId(null); await data.refresh(); })}><Text style={styles.danger}>Supprimer</Text></Pressable></View>
        </View>}
      </View>)}
      {data.routes.length > 0 && <View style={styles.card}>
        <View style={styles.row}><AppIcon icon={Bell} size={22} color={color('#267E70', 'success')} /><Text style={styles.cardTitle}>Notifications</Text></View>
        {Platform.OS === 'web' ? <Text style={styles.muted}>Notifications push disponibles dans l’application mobile.</Text> :
          <Pressable style={styles.smallButton} disabled={busy || pushStatus === 'enabled'} onPress={() => void act(async () => { await enableRoutePush(userId); refreshPush(); })}>
            <Text style={styles.link}>{pushLabel}</Text>
          </Pressable>}
      </View>}
      {(data.routes.length > 0 || data.alerts.length > 0) && <View style={styles.card}>
        <Text style={styles.cardTitle}>Alertes sur mes trajets</Text>
        {data.alertsError ? <Pressable onPress={() => void data.refresh()}><Text style={styles.feedback}>{data.alertsError}</Text></Pressable> :
          !data.alerts.length && <Text style={styles.muted}>Aucune alerte pour le moment</Text>}
        {data.alerts.map((alert) => <Pressable key={alert.id} accessibilityRole="button" style={[styles.alert, !alert.read_at && styles.unread]}
          onPress={() => { setSelection(`${alert.report_kind}:${alert.report_id}`); void markRouteAlertRead(userId, alert.id).then(data.refresh).catch(() => { if (alive.current) setFeedback('Impossible de marquer cette alerte comme lue.'); }); }}>
          <View style={styles.row}><Bell size={17} color={color('#9D5148', 'accent')} /><Text translate={false} style={[styles.fieldLabel, styles.grow]}>{alert.route_name}</Text><ArrowRight size={17} color={color('#667A6D', 'secondary')} /></View>
          <Text translate={false} style={styles.endpoints}>{alert.location}</Text>
          <Text style={styles.muted}>{new Date(alert.occurred_at).toLocaleString('fr-FR', { timeZone: 'America/Port-au-Prince', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
        </Pressable>)}
      </View>}
    </View>
    {selection && <SafetyReportDetailSheet selection={selection} onClose={() => setSelection(null)} />}
  </AppScreen>;
}

function Back({ onPress, disabled = false }: { onPress: () => void; disabled?: boolean }) {
  const styles = useStyles(); const color = useThemeColor();
  return <Pressable accessibilityRole="button" accessibilityLabel="Retour" style={styles.iconButton} disabled={disabled} onPress={onPress}><ArrowLeft size={23} color={color('#243A2C', 'text')} /></Pressable>;
}
function Action({ label, onPress, disabled = false, icon: Icon = ArrowRight }: {
  label: string; onPress: () => void; disabled?: boolean; icon?: typeof ArrowRight;
}) {
  const styles = useStyles();
  return <AnimatedPressable accessibilityRole="button" disabled={disabled} onPress={onPress} haptic="light" style={[styles.primary, disabled && styles.disabled]}>
    <Icon size={21} color="#FFFFFF" /><Text style={styles.primaryText}>{label}</Text>
  </AnimatedPressable>;
}

const useStyles = createThemedStyles((color) => StyleSheet.create({
  editor: { flex: 1, backgroundColor: color('#F7F7F7', 'background') },
  stack: { gap: 18 }, grow: { flex: 1 }, row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  card: { ...surfaceDepth(color, 'card'), backgroundColor: color('#FFFFFF', 'surface'), borderRadius: 24, padding: 20, gap: 16 },
  cardTitle: { fontSize: 19, fontWeight: '700', color: color('#243A2C', 'text') },
  muted: { color: color('#778079', 'muted'), fontSize: 13, lineHeight: 20 },
  link: { color: color('#267E70', 'success'), fontSize: 14, fontWeight: '700' },
  primary: { minHeight: 56, flexDirection: 'row', gap: 10, justifyContent: 'center', alignItems: 'center', padding: 15, borderRadius: 18, backgroundColor: '#267E70' },
  primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' }, disabled: { opacity: 0.5 },
  iconButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  smallButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 22 }, emptySteps: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  routeIcon: { height: 48, width: 48, borderRadius: 16, backgroundColor: color('#EAF3EE', 'successSoft'), justifyContent: 'center', alignItems: 'center' },
  scheduleTime: { fontSize: 20, fontWeight: '800', color: color('#243A2C', 'text'), fontVariant: ['tabular-nums'] },
  endpoints: { fontSize: 14, lineHeight: 21, color: color('#506859', 'secondary') },
  routeEndpoints: { fontSize: 16, lineHeight: 24, color: color('#506859', 'secondary') },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: color('#E3EAE3', 'border') },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: color('#267E70', 'success') }, pausedDot: { backgroundColor: color('#AAAFA9', 'muted') },
  feedback: { color: color('#9D5148', 'accent'), fontSize: 14, lineHeight: 21 },
  steps: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, paddingBottom: 6 },
  stepDone: { fontSize: 13, color: color('#778079', 'muted') }, stepActive: { fontSize: 13, fontWeight: '700', color: color('#267E70', 'success') },
  fieldLabel: { fontSize: 14, fontWeight: '700', color: color('#344A3C', 'text') },
  input: { minHeight: 52, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: color('#DFE7DF', 'border'), backgroundColor: color('#F6F8F5', 'successSoft'), color: color('#243A2C', 'text'), fontSize: 16 },
  timeInput: { fontSize: 32, fontWeight: '700', width: 145, textAlign: 'center', fontVariant: ['tabular-nums'] },
  durationInput: { width: 88, textAlign: 'center' }, sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 8 },
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  day: { flexGrow: 1, flexBasis: 34, minWidth: 34, minHeight: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: color('#F2F5F1', 'successSoft') },
  dayText: { fontSize: 12, fontWeight: '700', color: color('#506859', 'secondary') },
  choices: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  choice: { minHeight: 46, flexGrow: 1, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: color('#F2F5F1', 'successSoft') },
  choiceText: { color: color('#506859', 'secondary'), fontSize: 13, fontWeight: '600' },
  choiceSelected: { backgroundColor: '#267E70' }, selectedText: { color: '#FFFFFF' },
  deleteConfirm: { borderTopWidth: 1, borderTopColor: color('#E8D9D5', 'border'), paddingTop: 16, gap: 10 },
  danger: { color: color('#9D5148', 'accent'), fontWeight: '700' },
  alert: { backgroundColor: color('#F8F4EF', 'successSoft'), borderRadius: 16, padding: 14, gap: 8 },
  unread: { borderLeftWidth: 3, borderLeftColor: color('#BA604D', 'accent') },
}));
