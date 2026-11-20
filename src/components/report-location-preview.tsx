import { useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { Linking, Platform, StyleSheet } from 'react-native';
import MapPin from 'lucide-react-native/icons/map-pin';
import { Pressable, Text, View } from '@/features/language/native';
import { reverseGeocodeStreet } from '@/features/accident-report/reverse-geocode';

const tileHeaders = Platform.OS === 'web' ? undefined : { 'User-Agent': 'StopAccidents/1.0 (com.stopaccidents.app)' };
const tileSize = 256;

function MapTile({ uri, left, top }: { uri: string; left: number; top: number }) {
  const [attempt, setAttempt] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  function retry() {
    if (attempt === 0 && timer.current === undefined) {
      timer.current = setTimeout(() => setAttempt(1), 1500);
    }
  }

  // OSM can return its blocked-request notice as a cacheable image at the tile URL.
  const cacheKey = tileHeaders && `${tileHeaders['User-Agent']}:${uri}`;
  return <Image key={attempt} source={{ uri, headers: tileHeaders, cacheKey }} cachePolicy="disk" contentFit="cover"
    onError={retry} style={{ position: 'absolute', left, top, width: tileSize, height: tileSize }} />;
}

function StreetName({ latitude, longitude }: { latitude: number; longitude: number }) {
  const [street, setStreet] = useState<string | null>(null);
  useEffect(() => {
    let visible = true;
    void reverseGeocodeStreet(latitude, longitude).then(name => {
      if (visible) setStreet(name);
    });
    return () => { visible = false; };
  }, [latitude, longitude]);

  return street && <View pointerEvents="none" style={styles.street}>
    <Text translate={false} numberOfLines={2} style={styles.streetText}>{street}</Text>
  </View>;
}

/** A small, non-interactive map. Only the tiles intersecting the viewport load. */
export function ReportLocationPreview({ latitude, longitude, active = true, compact = false }: {
  latitude: number | null; longitude: number | null; active?: boolean; compact?: boolean;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const valid = latitude !== null && longitude !== null && Number.isFinite(latitude) && Number.isFinite(longitude);
  const tiles = [];
  if (valid && active && size.width > 0 && size.height > 0) {
    const zoom = compact ? 13 : 14;
    const n = 2 ** zoom;
    const lat = Math.max(-85, Math.min(85, latitude)) * Math.PI / 180;
    const x = (longitude + 180) / 360 * n * tileSize;
    const y = (1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2 * n * tileSize;
    const left = x - size.width / 2;
    const top = y - size.height / 2;
    for (let col = Math.floor(left / tileSize); col < Math.ceil((left + size.width) / tileSize); col++) {
      for (let row = Math.max(0, Math.floor(top / tileSize)); row < Math.min(n, Math.ceil((top + size.height) / tileSize)); row++) {
        tiles.push(<MapTile key={`${zoom}:${col}:${row}`} uri={`https://tile.openstreetmap.org/${zoom}/${((col % n) + n) % n}/${row}.png`}
          left={col * tileSize - left} top={row * tileSize - top} />);
      }
    }
  }
  return <View style={styles.map} onLayout={e => setSize(e.nativeEvent.layout)}>
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>{tiles}</View>
    <MapPin size={28} color="#EA493E" fill="#FFE1DB" />
    {valid && tiles.length > 0 && <StreetName key={`${latitude},${longitude}`} latitude={latitude} longitude={longitude} />}
    {tiles.length > 0 && <Pressable accessibilityRole="link" accessibilityLabel="© OpenStreetMap" onPress={() => void Linking.openURL('https://www.openstreetmap.org/copyright')} style={styles.credit}><Text translate={false} style={styles.creditText}>© OpenStreetMap</Text></Pressable>}
  </View>;
}
const styles = StyleSheet.create({
  map: { flex: 1, minHeight: 96, borderRadius: 20, overflow: 'hidden', backgroundColor: '#E8ECEF', alignItems: 'center', justifyContent: 'center' },
  street: { position: 'absolute', top: 4, maxWidth: '92%', borderRadius: 8, backgroundColor: '#FFFFFFEE', paddingHorizontal: 5, paddingVertical: 2 },
  streetText: { color: '#253649', fontSize: 11, lineHeight: 13, fontWeight: '600', textAlign: 'center' },
  credit: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#FFFFFFDD', paddingHorizontal: 3, paddingVertical: 3 },
  creditText: { color: '#42505C', fontSize: 8 },
});
