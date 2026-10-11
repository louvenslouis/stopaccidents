import { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { Pressable, Text, View } from '@/features/language/native';
import { useThemeColor } from '@/features/appearance/theme-provider';
import type { ReportKind } from '@/features/report-events/api';
import { readReportPhotos, type ReportPhoto } from '@/features/report-events/photos';

export function ReportPhotoGallery({ kind, id, updatedAt }: { kind: ReportKind; id: string; updatedAt: string }) {
  const color = useThemeColor();
  const [retry, setRetry] = useState(0);
  const key = [kind, id, updatedAt, retry].join(':');
  const [result, setResult] = useState<{ key: string; photos: ReportPhoto[]; error: boolean }>({ key: '', photos: [], error: false });
  const { photos, error } = result.key === key ? result : { photos: [], error: false };
  useEffect(() => {
    const controller = new AbortController();
    void readReportPhotos(kind, id, controller.signal).then(result => {
      if (!controller.signal.aborted) setResult({ key, photos: result, error: false });
    }).catch(() => { if (!controller.signal.aborted) setResult({ key, photos: [], error: true }); });
    return () => controller.abort();
  }, [kind, id, key]);
  if (!photos.length && !error) return null;
  return <View style={{ gap: 12 }}>
    <Text style={{ color: color('#243147', 'text'), fontSize: 18, fontWeight: '700' }}>Photos</Text>
    {photos.map((photo, index) => photo.url ? <Image key={photo.storage_path}
      source={{ uri: photo.url }} contentFit="contain" accessibilityLabel={`Photo ${index + 1}`}
      style={{ width: '100%', height: 240, borderRadius: 16 }} /> :
      <Text key={photo.storage_path} style={{ color: color('#697687', 'muted') }}>Photo indisponible</Text>)}
    {(error || photos.some(photo => !photo.url)) && <Pressable accessibilityRole="button"
      onPress={() => setRetry(value => value + 1)} style={{ minHeight: 44, justifyContent: 'center' }}>
      <Text style={{ color: color('#BD2E40', 'accent') }}>Réessayer les photos</Text>
    </Pressable>}
  </View>;
}
