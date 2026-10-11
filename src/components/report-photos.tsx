import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import Camera from 'lucide-react-native/icons/camera';
import Images from 'lucide-react-native/icons/images';
import X from 'lucide-react-native/icons/x';
import { Pressable, Text, View } from '@/features/language/native';
import { useThemeColor } from '@/features/appearance/theme-provider';
import { AppIcon } from '@/components/ui/app-icon';
import { MAX_PHOTOS, type CapturedPhoto } from '@/features/accident-report/model';
import { canImportReportPhotos, pickReportPhotos } from '@/features/report-events/photo-library';
import type { ReportContext } from '@/features/report-events/context';

export function ReportPhotos({ photos, context, disabled, onChange, onCamera, onBusyChange }: {
  photos: CapturedPhoto[]; context: ReportContext; disabled: boolean;
  onChange: (photos: CapturedPhoto[]) => void; onCamera: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const color = useThemeColor();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const importing = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; onBusyChange(false); }; }, [onBusyChange]);
  async function selectImages() {
    if (disabled || importing.current) return;
    importing.current = true;
    setBusy(true); onBusyChange(true); setError(null);
    try {
      const added = await pickReportPhotos(context, photos.length);
      if (mounted.current && added.length) onChange([...photos, ...added]);
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : 'Impossible d’ouvrir les images. Réessayez.');
    } finally {
      importing.current = false;
      if (mounted.current) { setBusy(false); onBusyChange(false); }
    }
  }
  const locked = disabled || busy;
  return <View style={{ gap: 12 }}>
    <View style={styles.heading}>
      <Text style={{ color: color('#243147', 'text'), fontWeight: '700' }}>Photos</Text>
      <Text style={{ color: color('#697687', 'muted') }}>{photos.length}/{MAX_PHOTOS}</Text>
    </View>
    <View style={styles.grid}>
      {photos.map((photo, index) => <View key={photo.id} style={styles.thumbnail}>
        <Image source={{ uri: photo.uri }} style={styles.image} contentFit="cover" accessibilityLabel={`Photo ${index + 1}`} />
        <Pressable accessibilityRole="button" accessibilityLabel={`Retirer la photo ${index + 1}`} disabled={locked}
          onPress={() => onChange(photos.filter(item => item.id !== photo.id))} style={styles.remove}>
          <AppIcon icon={X} size={18} color="#fff" />
        </Pressable>
      </View>)}
    </View>
    {photos.length < MAX_PHOTOS && <View style={styles.actions}>
      {!canImportReportPhotos(context) && <Pressable accessibilityRole="button" disabled={locked} onPress={onCamera}
        style={[styles.action, { backgroundColor: color('#EDF4F1', 'elevated'), opacity: locked ? 0.5 : 1 }]}>
        <AppIcon icon={Camera} color={color('#23766A', 'success')} size={22} />
        <Text style={{ color: color('#243147', 'text') }}>Prendre une photo</Text>
      </Pressable>}
      {canImportReportPhotos(context) && <Pressable accessibilityRole="button" disabled={locked} onPress={selectImages}
        style={[styles.action, { backgroundColor: color('#EDF4F1', 'elevated'), opacity: locked ? 0.5 : 1 }]}>
        {busy ? <ActivityIndicator /> : <AppIcon icon={Images} color={color('#23766A', 'success')} size={22} />}
        <Text style={{ color: color('#243147', 'text') }}>Choisir des images</Text>
      </Pressable>}
    </View>}
    {error && <Text accessibilityRole="alert" style={{ color: color('#BD2E40', 'accent') }}>{error}</Text>}
  </View>;
}
const styles = StyleSheet.create({
  heading: { flexDirection: 'row', justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumbnail: { width: '47%', height: 124, borderRadius: 16, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  remove: { position: 'absolute', right: 0, top: 0, width: 44, height: 44, borderBottomLeftRadius: 16, backgroundColor: '#182331BB', alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  action: { flexGrow: 1, minHeight: 52, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
});
