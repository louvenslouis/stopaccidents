import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import MapPin from 'lucide-react-native/icons/map-pin';
import Check from 'lucide-react-native/icons/check';
import { Pressable, Text, View } from '@/features/language/native';
import { createThemedStyles, useThemeColor } from '@/features/appearance/theme-provider';
import { surfaceDepth } from '@/components/ui/surface-depth';
import type { Connection } from '@/features/connections/api';
import { useLiveLocation } from './provider';
import { LiveMap } from './map';

export function SharingCard({ connections }: { connections: Connection[] }) {
  const styles = useStyles(), color = useThemeColor();
  const { snapshot, busy, error, foregroundOnly, start, stop } = useLiveLocation();
  const [selected, setSelected] = useState<string[]>([]);
  const [minutes, setMinutes] = useState(60);
  const [focus, setFocus] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const [mapState, setMapState] = useState('loading');
  const [attempt, setAttempt] = useState(0);
  const onLoad = useCallback(() => setMapState('ready'), []);
  const onError = useCallback(() => setMapState('error'), []);
  const ids = connections.map(item => item.id);
  const recipients = selected.filter(id => ids.includes(id));
  const all = ids.length > 0 && recipients.length === ids.length;
  const incoming = snapshot.incoming.filter(item => Date.parse(item.expires_at) > now && now - Date.parse(item.captured_at) < 90000);
  const incomingCount = incoming.length;
  useEffect(() => {
    if (!incomingCount || mapState !== 'loading') return;
    const timer = setTimeout(onError, 20000);
    return () => clearTimeout(timer);
  }, [incomingCount, mapState, attempt, onError]);

  return <>
    <View style={styles.card}>
      <View style={styles.row}><MapPin size={22} color={color('#267E70', 'success')} /><Text style={styles.title}>Partager ma position</Text></View>
      {snapshot.outgoing ? <>
        <Text style={styles.status}>Partage de localisation actif</Text>
        {connections.filter(person => snapshot.outgoing?.connections.includes(person.id)).map(person => <Text key={person.id} translate={false} style={styles.name}>{person.alias}</Text>)}
        <Text style={styles.muted}>Fin à {new Date(snapshot.outgoing.expires_at).toLocaleTimeString('fr-HT', { hour: '2-digit', minute: '2-digit' })}</Text>
        {foregroundOnly && <Text style={styles.muted}>Application ouverte uniquement</Text>}
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void stop()} style={[styles.stop, busy && styles.disabled]}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Arrêter le partage</Text>}
        </Pressable>
      </> : <>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: all, disabled: busy || !ids.length }} disabled={busy || !ids.length}
          onPress={() => setSelected(all ? [] : ids)} style={styles.choice}>
          <View style={[styles.checkbox, all && styles.checked]}>{all && <Check size={16} color="#fff" />}</View><Text style={styles.name}>Tous mes proches</Text>
        </Pressable>
        {connections.map(person => <Pressable key={person.id} accessibilityRole="checkbox" accessibilityState={{ checked: recipients.includes(person.id), disabled: busy }} disabled={busy}
          onPress={() => setSelected(current => current.includes(person.id) ? current.filter(id => id !== person.id) : [...current, person.id])} style={styles.choice}>
          <View style={[styles.checkbox, recipients.includes(person.id) && styles.checked]}>{recipients.includes(person.id) && <Check size={16} color="#fff" />}</View>
          <Text translate={false} style={styles.name}>{person.alias}</Text>
        </Pressable>)}
        <View style={styles.row}>{([{ value: 15, label: '15 min' }, { value: 60, label: '1 h' }, { value: 480, label: '8 h' }]).map(option =>
          <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: minutes === option.value, disabled: busy }} disabled={busy}
            onPress={() => setMinutes(option.value)} style={[styles.duration, minutes === option.value && styles.durationSelected]}>
            <Text style={styles.name}>{option.label}</Text>
          </Pressable>)}</View>
        <Pressable accessibilityRole="button" disabled={busy || !recipients.length} accessibilityState={{ disabled: busy || !recipients.length }}
          onPress={() => void start(recipients, minutes)} style={[styles.start, (busy || !recipients.length) && styles.disabled]}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Partager en temps réel</Text>}
        </Pressable>
      </>}
      {error && <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
    </View>
    {incoming.length > 0 && <View style={styles.card}>
      <Text style={styles.title}>Positions de mes proches</Text>
      <View style={styles.map}>
        <LiveMap key={attempt} locations={incoming} selected={focus} onError={onError} onLoad={onLoad} />
        {mapState !== 'ready' && <View style={styles.overlay}>
          {mapState === 'loading' ? <ActivityIndicator color={color('#267E70', 'success')} /> :
            <Pressable accessibilityRole="button" onPress={() => { setMapState('loading'); setAttempt(value => value + 1); }} style={styles.duration}>
              <Text style={styles.name}>Réessayer</Text>
            </Pressable>}
        </View>}
      </View>
      {incoming.map(person => <Pressable key={person.connection_id} accessibilityRole="button" onPress={() => setFocus(person.connection_id)} style={styles.choice}>
        <MapPin size={18} color={color('#267E70', 'success')} /><Text translate={false} style={styles.name}>{person.alias}</Text>
        <Text translate={false} style={styles.muted}>{new Date(person.captured_at).toLocaleTimeString('fr-HT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</Text>
      </Pressable>)}
    </View>}
  </>;
}
const useStyles = createThemedStyles(color => StyleSheet.create({
  card: { backgroundColor: color('#FFFFFF', 'surface'), borderRadius: 24, padding: 20, gap: 14, ...surfaceDepth(color, 'card') },
  title: { fontSize: 18, fontWeight: '700', color: color('#171719', 'text'), flexShrink: 1 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  name: { color: color('#171719', 'text'), fontSize: 15, flexShrink: 1 },
  checkbox: { height: 24, width: 24, borderRadius: 8, borderWidth: 1, borderColor: color('#77777C', 'muted'), alignItems: 'center', justifyContent: 'center' },
  checked: { backgroundColor: color('#267E70', 'success'), borderColor: color('#267E70', 'success') },
  duration: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, backgroundColor: color('#F7F7F7', 'background'), borderWidth: 1, borderColor: 'transparent' },
  durationSelected: { borderColor: color('#267E70', 'success'), backgroundColor: color('#E8F3F0', 'successSoft') },
  start: { minHeight: 48, borderRadius: 14, backgroundColor: color('#267E70', 'success'), padding: 14, alignItems: 'center' },
  stop: { minHeight: 48, borderRadius: 14, backgroundColor: color('#BA3D31', 'accent'), padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  status: { color: color('#267E70', 'success'), fontWeight: '600' },
  muted: { color: color('#77777C', 'muted'), fontSize: 13 },
  error: { color: color('#BA3D31', 'accent'), fontSize: 14 },
  disabled: { opacity: .45 },
  map: { height: 300, borderRadius: 18, overflow: 'hidden' },
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: color('#FFFFFF', 'surface') },
}));
