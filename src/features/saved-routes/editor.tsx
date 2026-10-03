import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import ArrowDown from 'lucide-react-native/icons/arrow-down';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import ArrowUp from 'lucide-react-native/icons/arrow-up';
import Check from 'lucide-react-native/icons/check';
import LocateFixed from 'lucide-react-native/icons/locate-fixed';
import Plus from 'lucide-react-native/icons/plus';
import Search from 'lucide-react-native/icons/search';
import Trash2 from 'lucide-react-native/icons/trash';
import Undo2 from 'lucide-react-native/icons/undo-2';
import X from 'lucide-react-native/icons/x';
import type { LucideIcon } from 'lucide-react-native';
import { AppIcon } from '@/components/ui/app-icon';
import { SavedPlacePicker } from '@/components/saved-place-picker';
import { createThemedStyles, useThemeColor } from '@/features/appearance/theme-provider';
import { Pressable, ScrollView, Text, View } from '@/features/language/native';
import type { SavedPlace, SavedPlaces } from '@/features/profile/saved-places';
import { RouteMap } from './route-map';
import type { RouteMapPoint, RouteMapState } from './route-map-props';
import { fetchExactRoute, isRoutePoint, MAX_ROUTE_WAYPOINTS, type RouteShape, type RouteWaypoint } from './routing';

type Draft = { origin: RouteWaypoint | null; destination: RouteWaypoint | null; via: RouteWaypoint[] };
type Target = 'origin' | 'destination' | number;
type Stage = 'places' | 'streets' | 'review';
const initialDraft = (shape?: RouteShape | null): Draft => ({
  origin: shape?.waypoints[0] ?? null,
  destination: shape?.waypoints.at(-1) ?? null,
  via: shape?.waypoints.slice(1, -1) ?? [],
});
const fromPlace = (place: SavedPlace | null): RouteWaypoint | null =>
  place && typeof place.latitude === 'number' && typeof place.longitude === 'number' && isRoutePoint({ latitude: place.latitude, longitude: place.longitude })
    ? { label: place.address.trim().slice(0, 200), latitude: place.latitude, longitude: place.longitude } : null;
const asPlace = (point: RouteWaypoint | null): SavedPlace | null => point ? { address: point.label, latitude: point.latitude, longitude: point.longitude } : null;

function IconButton({ label, icon, onPress, disabled = false }: { label: string; icon: LucideIcon; onPress: () => void; disabled?: boolean }) {
  const styles = useStyles();
  const color = useThemeColor();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={disabled}
    style={({ pressed }) => [styles.iconButton, disabled && styles.disabled, pressed && styles.pressed]}>
    <AppIcon icon={icon} size={19} color={color('#41536C', 'secondary')} />
  </Pressable>;
}

export function RouteEditor({ initialValue, onConfirm, onCancel, savedPlaces }: {
  initialValue?: RouteShape | null;
  onConfirm: (shape: RouteShape) => void;
  onCancel: () => void;
  savedPlaces?: SavedPlaces | null;
}) {
  const styles = useStyles();
  const color = useThemeColor();
  const [draft, setDraft] = useState<Draft>(() => initialDraft(initialValue));
  const [history, setHistory] = useState<Draft[]>([]);
  const [stage, setStage] = useState<Stage>(initialValue ? 'streets' : 'places');
  const [mode, setMode] = useState<'origin' | 'destination' | 'via' | null>(initialValue ? null : 'origin');
  const [insertAt, setInsertAt] = useState(initialValue?.waypoints.length ? initialValue.waypoints.length - 2 : 0);
  const [picker, setPicker] = useState<Target | null>(null);
  const [shape, setShape] = useState<RouteShape | null>(initialValue ?? null);
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(initialValue ? 'ready' : 'idle');
  const [routeError, setRouteError] = useState<string | null>(null);
  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [mapAttempt, setMapAttempt] = useState(0);
  const [fit, setFit] = useState(0);
  const request = useRef<AbortController | null>(null);
  const unchanged = useRef(Boolean(initialValue));
  const complete = Boolean(draft.origin && draft.destination);
  const points = useMemo<RouteMapPoint[]>(() => [
    ...(draft.origin ? [{ ...draft.origin, id: 'origin', badge: 'A' }] : []),
    ...draft.via.map((point, i) => ({ ...point, id: `via-${i}`, badge: String(i + 1) })),
    ...(draft.destination ? [{ ...draft.destination, id: 'destination', badge: 'B' }] : []),
  ], [draft]);
  const mapState = useMemo<RouteMapState>(() => ({ points, coordinates: shape?.coordinates ?? [], editable: stage !== 'review', fit }), [points, shape, stage, fit]);
  const mapLoaded = useCallback(() => setMapStatus('ready'), []);
  const mapFailed = useCallback(() => setMapStatus('error'), []);

  useEffect(() => {
    if (unchanged.current || !draft.origin || !draft.destination) return;
    const controller = new AbortController();
    request.current = controller;
    setStatus('loading');
    const timeout = setTimeout(() => {
      void fetchExactRoute([draft.origin!, ...draft.via, draft.destination!], controller.signal)
        .then((route) => { if (!controller.signal.aborted) { setShape(route); setStatus('ready'); } })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setShape(null); setStatus('error');
          setRouteError(error instanceof Error ? error.message : 'Calcul indisponible. Réessayez.');
        });
    }, 450);
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [draft, revision]);

  useEffect(() => {
    if (mapStatus !== 'loading') return;
    const timeout = setTimeout(mapFailed, 20000);
    return () => clearTimeout(timeout);
  }, [mapStatus, mapAttempt, mapFailed]);

  const update = useCallback((next: Draft) => {
    request.current?.abort();
    unchanged.current = false;
    setHistory((past) => [...past.slice(-39), draft]);
    setDraft(next); setShape(null); setRouteError(null);
    setStatus(next.origin && next.destination ? 'loading' : 'idle');
    setRevision((value) => value + 1);
  }, [draft]);

  const assign = (target: Target, point: RouteWaypoint) => {
    if (typeof target === 'number') update({ ...draft, via: draft.via.map((current, i) => i === target ? point : current) });
    else {
      update({ ...draft, [target]: point });
      if (target === 'origin' && !draft.destination) setMode('destination');
      else setMode(null);
    }
    setFit((value) => value + 1);
  };
  const pick = (point: { latitude: number; longitude: number }) => {
    if (stage === 'review' || !mode || !isRoutePoint(point)) return;
    if (mode === 'origin' || mode === 'destination') {
      const label = mode === 'origin' ? 'Départ' : 'Arrivée';
      update({ ...draft, [mode]: { ...point, label: `${label} · ${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}` } });
      setMode(mode === 'origin' && !draft.destination ? 'destination' : null);
    } else {
      if (!complete || points.length >= MAX_ROUTE_WAYPOINTS) return;
      const index = Math.min(insertAt, draft.via.length);
      const via = [...draft.via];
      via.splice(index, 0, { ...point, label: `Rue · ${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}` });
      update({ ...draft, via }); setInsertAt(index + 1);
    }
  };
  const move = (id: string, point: { latitude: number; longitude: number }) => {
    if (stage === 'review' || !isRoutePoint(point)) return;
    if (id === 'origin' || id === 'destination') {
      const current = draft[id];
      if (current) update({ ...draft, [id]: { ...current, ...point, label: `${id === 'origin' ? 'Départ' : 'Arrivée'} · ${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}` } });
    } else {
      const index = Number(id.replace('via-', ''));
      if (draft.via[index]) update({ ...draft, via: draft.via.map((current, i) => i === index ? { ...current, ...point, label: `Rue · ${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}` } : current) });
    }
  };
  const undo = () => {
    const previous = history.at(-1);
    if (!previous) return;
    request.current?.abort(); unchanged.current = false;
    setHistory((past) => past.slice(0, -1)); setDraft(previous); setShape(null); setRouteError(null);
    setStatus(previous.origin && previous.destination ? 'loading' : 'idle');
    setRevision((value) => value + 1); setInsertAt(previous.via.length);
    if (!previous.origin || !previous.destination) { setStage('places'); setMode(previous.origin ? 'destination' : 'origin'); }
  };
  const reorder = (index: number, direction: -1 | 1) => {
    const via = [...draft.via], other = index + direction;
    if (other < 0 || other >= via.length) return;
    [via[index], via[other]] = [via[other], via[index]];
    update({ ...draft, via });
  };
  const enterStreets = () => { setStage('streets'); setMode('via'); setInsertAt(draft.via.length); setFit((value) => value + 1); };
  const routeReady = Boolean(shape && status === 'ready');
  const selectedPoint = picker === 'origin' || picker === 'destination' ? draft[picker] : typeof picker === 'number' ? draft.via[picker] : null;

  return <View style={styles.screen}>
    <View style={styles.header}>
      <View style={styles.heading}><Text style={styles.eyebrow}>MON TRAJET</Text><Text accessibilityRole="header" style={styles.title}>{stage === 'places' ? 'Départ et arrivée' : stage === 'streets' ? 'Choisir mes rues' : 'Vérifier le tracé'}</Text></View>
      <IconButton icon={X} label="Annuler le tracé" onPress={onCancel} />
    </View>
    <View style={styles.progress}>
      {(['places', 'streets', 'review'] as Stage[]).map((step, i) => <View key={step} style={[styles.progressStep, stage === step && styles.progressActive]}><Text style={[styles.progressText, stage === step && styles.progressTextActive]}>{i + 1}. {['Lieux', 'Rues', 'Vérifier'][i]}</Text></View>)}
    </View>

    {stage === 'places' && <View style={styles.places}>
      {(['origin', 'destination'] as const).map((target) => <View key={target} style={styles.placeRow}>
        <Pressable accessibilityRole="button" accessibilityLabel={target === 'origin' ? 'Placer le départ sur la carte' : 'Placer l’arrivée sur la carte'} onPress={() => setMode(mode === target ? null : target)} style={[styles.badge, target === 'destination' && styles.destinationBadge, mode === target && styles.selectedBadge]}><Text style={styles.badgeText}>{target === 'origin' ? 'A' : 'B'}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={target === 'origin' ? 'Rechercher le départ' : 'Rechercher l’arrivée'} onPress={() => setPicker(target)} style={styles.placeText}>
          <Text style={styles.fieldLabel}>{target === 'origin' ? 'DÉPART' : 'ARRIVÉE'}</Text>
          <Text translate={!draft[target]} numberOfLines={1} style={[styles.placeLabel, !draft[target] && styles.muted]}>{draft[target]?.label ?? 'Choisir un lieu'}</Text>
        </Pressable>
        <IconButton icon={Search} label={target === 'origin' ? 'Rechercher le départ' : 'Rechercher l’arrivée'} onPress={() => setPicker(target)} />
      </View>)}
      {(savedPlaces?.home || savedPlaces?.work) && <View style={styles.shortcuts}>
        {(['home', 'work'] as const).map((key) => {
          const point = fromPlace(savedPlaces?.[key] ?? null);
          return point ? <Pressable key={key} accessibilityRole="button" onPress={() => assign(mode === 'destination' ? 'destination' : 'origin', point)} style={styles.shortcut}><Text style={styles.shortcutText}>{key === 'home' ? 'Maison' : 'Travail'}</Text></Pressable> : null;
        })}
      </View>}
    </View>}

    <View style={styles.map}>
      <RouteMap key={mapAttempt} state={mapState} onLoad={mapLoaded} onError={mapFailed} onPick={pick} onMove={move} />
      <View pointerEvents="box-none" style={styles.mapTop}>
        {mode && stage !== 'review' && <View pointerEvents="none" style={styles.mapHint}><Text style={styles.mapHintText}>{mode === 'origin' ? 'Touchez le départ' : mode === 'destination' ? 'Touchez l’arrivée' : 'Touchez les rues à emprunter'}</Text></View>}
        <View style={styles.mapActions}>
          {stage !== 'review' && <IconButton icon={Undo2} label="Annuler la dernière modification" disabled={!history.length} onPress={undo} />}
          <IconButton icon={LocateFixed} label="Afficher tout le trajet" disabled={!points.length} onPress={() => setFit((value) => value + 1)} />
        </View>
      </View>
      {mapStatus === 'loading' && <View pointerEvents="none" style={styles.mapLoading}><ActivityIndicator color="#1767A6" /><Text style={styles.small}>Chargement de la carte…</Text></View>}
      {mapStatus === 'error' && <View style={styles.mapError}><Text style={styles.errorText}>Carte indisponible.</Text><Pressable accessibilityRole="button" onPress={() => { setMapStatus('loading'); setMapAttempt((value) => value + 1); }} style={styles.retry}><Text style={styles.link}>Réessayer</Text></Pressable></View>}
      {shape && <View pointerEvents="none" style={styles.metrics}><Text style={styles.metric}>{(shape.distanceMeters / 1000).toFixed(1)} km</Text><View style={styles.metricDot} /><Text style={styles.metric}>≈ {Math.max(1, Math.round(shape.durationSeconds / 60))} min</Text></View>}
    </View>

    {stage === 'streets' && <View style={styles.streets}>
      <View style={styles.streetHeader}>
        <Text style={styles.sectionTitle}>{draft.via.length} {draft.via.length === 1 ? 'point de passage' : 'points de passage'}</Text>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: mode === 'via' }} disabled={points.length >= MAX_ROUTE_WAYPOINTS}
          onPress={() => { setMode(mode === 'via' ? null : 'via'); setInsertAt(draft.via.length); }} style={[styles.addButton, mode === 'via' && styles.addActive, points.length >= MAX_ROUTE_WAYPOINTS && styles.disabled]}>
          <AppIcon icon={Plus} color={mode === 'via' ? '#FFFFFF' : color('#1767A6', 'info')} size={17} /><Text style={[styles.addText, mode === 'via' && styles.white]}>{mode === 'via' ? 'Terminer l’ajout' : 'Ajouter une rue'}</Text>
        </Pressable>
      </View>
      <ScrollView style={styles.waypointList} contentContainerStyle={styles.waypoints}>
        {points.map((point) => {
          const viaIndex = point.id.startsWith('via-') ? Number(point.id.slice(4)) : null;
          const after = point.id === 'origin' ? 0 : viaIndex === null ? null : viaIndex + 1;
          return <View key={point.id} style={styles.waypointRow}>
            <View style={[styles.smallBadge, point.id === 'origin' && styles.originBadge, point.id === 'destination' && styles.destinationBadge]}><Text style={styles.smallBadgeText}>{point.badge}</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Modifier ${point.label}`} onPress={() => setPicker(viaIndex ?? point.id as 'origin' | 'destination')} style={styles.waypointLabel}><Text translate={false} numberOfLines={1} style={styles.waypointText}>{point.label}</Text></Pressable>
            {viaIndex !== null && <>
              <IconButton icon={ArrowUp} label={`Remonter le point ${viaIndex + 1}`} disabled={viaIndex === 0} onPress={() => reorder(viaIndex, -1)} />
              <IconButton icon={ArrowDown} label={`Descendre le point ${viaIndex + 1}`} disabled={viaIndex === draft.via.length - 1} onPress={() => reorder(viaIndex, 1)} />
              <IconButton icon={Trash2} label={`Supprimer le point ${viaIndex + 1}`} onPress={() => update({ ...draft, via: draft.via.filter((_, i) => i !== viaIndex) })} />
            </>}
            {after !== null && <IconButton icon={Plus} label={`Insérer une rue après ${point.label}`} disabled={points.length >= MAX_ROUTE_WAYPOINTS} onPress={() => { setInsertAt(after); setMode('via'); }} />}
          </View>;
        })}
      </ScrollView>
    </View>}

    {stage === 'review' && shape && <View style={styles.review}>
      <Text style={styles.sectionTitle}>Rues empruntées</Text>
      <ScrollView style={styles.directions}>
        {(shape.steps.length ? shape.steps : shape.waypoints.map((point) => ({ instruction: point.label, distanceMeters: 0 }))).map((step, i) => <View key={`${i}-${step.instruction}`} style={styles.direction}><Text style={styles.directionNumber}>{i + 1}</Text><Text translate={shape.steps.length > 0} style={styles.directionText}>{step.instruction}</Text>{step.distanceMeters > 0 && <Text style={styles.small}>{step.distanceMeters < 1000 ? `${Math.round(step.distanceMeters)} m` : `${(step.distanceMeters / 1000).toFixed(1)} km`}</Text>}</View>)}
      </ScrollView>
    </View>}

    <View style={styles.footer}>
      {status === 'loading' && <View style={styles.status}><ActivityIndicator size="small" color="#1767A6" /><Text style={styles.small}>Calcul du tracé…</Text></View>}
      {routeError && <View style={styles.errorRow}><Text accessibilityRole="alert" style={styles.errorText}>{routeError}</Text><Pressable accessibilityRole="button" onPress={() => { setRouteError(null); setRevision((value) => value + 1); }} style={styles.retry}><Text style={styles.link}>Réessayer</Text></Pressable></View>}
      <View style={styles.footerActions}>
        {stage !== 'places' && <IconButton icon={ArrowLeft} label={stage === 'review' ? 'Modifier les rues' : 'Modifier les lieux'} onPress={() => { setStage(stage === 'review' ? 'streets' : 'places'); setMode(null); }} />}
        <Pressable accessibilityRole="button" disabled={stage === 'places' ? !complete : !routeReady || mapStatus !== 'ready'}
          onPress={() => {
            if (stage === 'places') enterStreets();
            else if (stage === 'streets' && shape) { setStage('review'); setMode(null); setFit((value) => value + 1); }
            else if (shape) onConfirm(shape);
          }} style={({ pressed }) => [styles.primaryButton, (stage === 'places' ? !complete : !routeReady || mapStatus !== 'ready') && styles.disabled, pressed && styles.pressed]}>
          {stage === 'review' && <AppIcon icon={Check} color="#FFFFFF" size={20} />}
          <Text style={styles.primaryText}>{stage === 'places' ? 'Choisir les rues' : stage === 'streets' ? 'Vérifier ce trajet' : 'Confirmer ce tracé'}</Text>
        </Pressable>
      </View>
    </View>
    {picker !== null && <SavedPlacePicker key={String(picker)} visible title={picker === 'origin' ? 'Point de départ' : picker === 'destination' ? 'Point d’arrivée' : 'Point de passage'} value={asPlace(selectedPoint ?? null)} onClose={() => setPicker(null)} onConfirm={(place) => { const point = fromPlace(place); if (point) assign(picker, point); setPicker(null); }} />}
  </View>;
}

const useStyles = createThemedStyles((c) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: c('#FFFFFF', 'surface') },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingTop: 12, paddingBottom: 12, gap: 12 },
  heading: { flex: 1 }, eyebrow: { color: c('#748198', 'muted'), fontSize: 10, fontWeight: '800', letterSpacing: 1.8 },
  title: { marginTop: 5, color: c('#17283E', 'text'), fontSize: 23, fontWeight: '800' },
  iconButton: { minWidth: 38, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  progress: { flexDirection: 'row', gap: 8, paddingHorizontal: 18, paddingBottom: 13 },
  progressStep: { flex: 1, borderBottomWidth: 3, borderBottomColor: c('#E6EBF1', 'border'), paddingBottom: 8 },
  progressActive: { borderBottomColor: '#1767A6' }, progressText: { color: c('#7A8596', 'muted'), fontSize: 12, fontWeight: '600' }, progressTextActive: { color: c('#1767A6', 'info') },
  places: { paddingHorizontal: 18, paddingBottom: 12, gap: 9 }, placeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: c('#DEE5ED', 'border'), borderRadius: 14, paddingHorizontal: 9, minHeight: 58 },
  badge: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#17825D', alignItems: 'center', justifyContent: 'center' }, badgeText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  selectedBadge: { borderWidth: 3, borderColor: '#93C7F3' }, originBadge: { backgroundColor: '#17825D' }, destinationBadge: { backgroundColor: '#B84638' },
  placeText: { flex: 1, paddingVertical: 7 }, fieldLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 1, color: c('#718095', 'muted') }, placeLabel: { color: c('#27374E', 'text'), fontSize: 14, fontWeight: '600', marginTop: 4 }, muted: { color: c('#8090A2', 'muted') },
  shortcuts: { flexDirection: 'row', gap: 8 }, shortcut: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: c('#EBF3FA', 'elevated') }, shortcutText: { color: c('#1767A6', 'info'), fontSize: 12, fontWeight: '700' },
  map: { flex: 1, minHeight: 190, position: 'relative', overflow: 'hidden', backgroundColor: c('#E8EEF0', 'background') },
  mapTop: { position: 'absolute', top: 10, left: 10, right: 10, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  mapHint: { backgroundColor: 'rgba(23,40,62,.9)', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 18, maxWidth: '75%' }, mapHintText: { fontSize: 12, color: '#FFFFFF', fontWeight: '600' },
  mapActions: { marginLeft: 'auto', borderRadius: 13, backgroundColor: c('#FFFFFF', 'surface'), padding: 2 },
  mapLoading: { position: 'absolute', alignSelf: 'center', top: '45%', borderRadius: 14, padding: 14, backgroundColor: c('#FFFFFF', 'surface'), flexDirection: 'row', alignItems: 'center', gap: 8 },
  mapError: { position: 'absolute', left: 12, right: 12, bottom: 35, borderRadius: 12, padding: 10, backgroundColor: c('#FFFFFF', 'surface'), flexDirection: 'row', alignItems: 'center', gap: 6 },
  metrics: { position: 'absolute', bottom: 24, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 16, borderRadius: 20, backgroundColor: c('#FFFFFF', 'surface') }, metric: { color: c('#27374E', 'text'), fontSize: 13, fontWeight: '800' }, metricDot: { height: 3, width: 3, borderRadius: 2, backgroundColor: c('#8694A5', 'muted') },
  streets: { paddingTop: 10, backgroundColor: c('#FFFFFF', 'surface') }, streetHeader: { flexDirection: 'row', paddingHorizontal: 15, justifyContent: 'space-between', alignItems: 'center', gap: 8 }, sectionTitle: { color: c('#27374E', 'text'), fontSize: 13, fontWeight: '800' },
  addButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 11, paddingHorizontal: 9, backgroundColor: c('#EAF2FA', 'elevated') }, addActive: { backgroundColor: '#1767A6' }, addText: { color: c('#1767A6', 'info'), fontSize: 11, fontWeight: '700' }, white: { color: '#FFFFFF' },
  waypointList: { maxHeight: 154 }, waypoints: { paddingHorizontal: 13, paddingTop: 4 }, waypointRow: { flexDirection: 'row', alignItems: 'center', gap: 5, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c('#E5EAF0', 'border'), minHeight: 44 }, smallBadge: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1767A6' }, smallBadgeText: { fontSize: 11, fontWeight: '800', color: '#FFFFFF' }, waypointLabel: { flex: 1, paddingVertical: 12 }, waypointText: { fontSize: 12, color: c('#46556C', 'secondary') },
  review: { paddingHorizontal: 17, paddingTop: 12, gap: 6 }, directions: { maxHeight: 180 }, direction: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c('#E5EAF0', 'border') }, directionNumber: { color: c('#1767A6', 'info'), fontSize: 11, fontWeight: '700', minWidth: 18 }, directionText: { flex: 1, color: c('#46556C', 'secondary'), fontSize: 12, lineHeight: 17 },
  footer: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, gap: 8 }, footerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 }, primaryButton: { flex: 1, minHeight: 50, borderRadius: 15, backgroundColor: '#1767A6', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, primaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  status: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, small: { fontSize: 11, color: c('#6E7C8F', 'muted') }, errorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, errorText: { flex: 1, fontSize: 12, lineHeight: 17, color: c('#AE4237', 'accent') }, retry: { padding: 8 }, link: { color: c('#1767A6', 'info'), fontSize: 12, fontWeight: '700' }, disabled: { opacity: .4 }, pressed: { opacity: .7 },
}));
