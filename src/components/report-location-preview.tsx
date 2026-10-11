import { useState } from 'react';
import { Image } from 'expo-image';
import { Linking, StyleSheet } from 'react-native';
import MapPin from 'lucide-react-native/icons/map-pin';
import { Pressable, Text, View } from '@/features/language/native';

/** A small, non-interactive map. Only the tiles intersecting the viewport load. */
export function ReportLocationPreview({ latitude, longitude, active = true, showAttribution = true }: {
  latitude: number | null; longitude: number | null; active?: boolean; showAttribution?: boolean;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [failed, setFailed] = useState(false);
  const valid = latitude !== null && longitude !== null && Number.isFinite(latitude) && Number.isFinite(longitude);
  const tiles = [];
  if (valid && active && !failed && size.width) {
    const n = 2 ** 14;
    const lat = Math.max(-85, Math.min(85, latitude)) * Math.PI / 180;
    const x = (longitude + 180) / 360 * n * 256;
    const y = (1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2 * n * 256;
    const left = x - size.width / 2;
    const top = y - size.height / 2;
    for (let col = Math.floor(left / 256); col <= Math.floor((left + size.width) / 256); col++) {
      for (let row = Math.floor(top / 256); row <= Math.floor((top + size.height) / 256); row++) {
        tiles.push(<Image key={`${col}:${row}`} source={{ uri: `https://tile.openstreetmap.org/14/${((col % n) + n) % n}/${row}.png` }} cachePolicy="disk" contentFit="cover" onError={() => setFailed(true)} style={{ position: 'absolute', left: col * 256 - left, top: row * 256 - top, width: 256, height: 256 }} />);
      }
    }
  }
  return <View style={styles.map} onLayout={e => setSize(e.nativeEvent.layout)}>
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>{tiles}</View>
    <MapPin size={28} color="#EA493E" fill="#FFE1DB" />
    {showAttribution && valid && active && !failed && <Pressable accessibilityRole="link" accessibilityLabel="© OpenStreetMap" onPress={() => void Linking.openURL('https://www.openstreetmap.org/copyright')} style={styles.credit}><Text translate={false} style={styles.creditText}>© OpenStreetMap</Text></Pressable>}
  </View>;
}
const styles = StyleSheet.create({
  map: { flex: 1, minHeight: 96, borderRadius: 20, overflow: 'hidden', backgroundColor: '#E8ECEF', alignItems: 'center', justifyContent: 'center' },
  credit: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#FFFFFFDD', paddingHorizontal: 3, paddingVertical: 3 },
  creditText: { color: '#42505C', fontSize: 8 },
});
