import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { randomUUID } from 'expo-crypto';
import { MAX_PHOTOS, MAX_PHOTO_BYTES, type CapturedPhoto } from '@/features/accident-report/model';
import type { ReportContext } from './context';

export function canImportReportPhotos(context: ReportContext) {
  return context.locationSource === 'manual';
}

export async function pickReportPhotos(context: ReportContext, existingCount: number): Promise<CapturedPhoto[]> {
  if (!canImportReportPhotos(context)) throw new Error('Utilisez la caméra pour un signalement sur place.');
  const remaining = MAX_PHOTOS - existingCount;
  if (remaining <= 0) return [];
  // Launch directly from the press handler, preserving browser user activation.
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'], allowsMultipleSelection: true, allowsEditing: false,
    selectionLimit: remaining, orderedSelection: true, legacy: true,
    quality: 1, exif: false,
  });
  if (result.canceled) return [];
  if (result.assets.length > remaining) throw new Error('Vous pouvez ajouter jusqu’à 4 photos.');
  const photos: CapturedPhoto[] = [];
  for (const asset of result.assets) {
    if (asset.type && asset.type !== 'image') throw new Error('Choisissez uniquement des images.');
    const context = ImageManipulator.manipulate(asset.uri);
    try {
      if (Math.max(asset.width, asset.height) > 2400) {
        context.resize(asset.width >= asset.height ? { width: 2400 } : { height: 2400 });
      }
      const image = await context.renderAsync();
      try {
        const converted = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
        if (!converted.base64 || converted.base64.length * 0.75 > MAX_PHOTO_BYTES) {
          throw new Error('Une image est illisible ou dépasse 6 Mo. Choisissez une autre image.');
        }
        photos.push({ id: randomUUID(), uri: converted.uri, base64: converted.base64,
          capturedAt: new Date().toISOString(), source: 'library' });
      } finally { image.release(); }
    } finally { context.release(); }
  }
  return photos;
}
