import { Pressable, Text, View } from '@/features/language/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { randomUUID } from 'expo-crypto';
import Camera from 'lucide-react-native/icons/camera';
import X from 'lucide-react-native/icons/x';
import { useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, StyleSheet } from 'react-native';
import { AppIcon } from '@/components/ui/app-icon';
import {
  MAX_PHOTO_BYTES,
  type CapturedPhoto,
} from '@/features/accident-report/model';

export function ReportCamera({
  onCapture,
  onClose,
  subject = 'l’accident',
}: {
  onCapture: (photo: CapturedPhoto) => void;
  onClose: () => void;
  subject?: string;
}) {
  const camera = useRef<CameraView>(null);
  const taking = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function takePhoto() {
    if (taking.current || !ready) return;
    taking.current = true;
    setBusy(true);
    setError(null);
    try {
      const photo = await camera.current?.takePictureAsync({
        quality: 0.55,
        base64: true,
        exif: false,
      });
      const base64 = photo?.base64?.replace(/^data:image\/\w+;base64,/, '');
      if (!photo || !base64)
        throw new Error('La prise de photo a échoué. Réessayez.');
      if (base64.length * 0.75 > MAX_PHOTO_BYTES)
        throw new Error(
          'Cette photo est trop volumineuse. Reprenez-la avec un cadrage plus simple.',
        );
      onCapture({
        id: randomUUID(),
        uri: photo.uri,
        base64,
        capturedAt: new Date().toISOString(),
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Caméra indisponible. Réessayez.',
      );
    } finally {
      taking.current = false;
      setBusy(false);
    }
  }
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Photographier la scène</Text>
          <Text style={styles.subtitle}>Restez à distance, en sécurité.</Text>
        </View>
        <Pressable
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Fermer la caméra"
          onPress={onClose}
          style={styles.close}
        >
          <AppIcon icon={X} color="#fff" />
        </Pressable>
      </View>
      <View style={styles.preview}>
        {permission?.granted ? (
          <CameraView
            ref={camera}
            style={StyleSheet.absoluteFill}
            facing="back"
            mode="picture"
            onCameraReady={() => setReady(true)}
            onMountError={() => {
              setReady(false);
              setError(
                'Caméra indisponible. Fermez cet écran et réessayez, ou continuez sans photo.',
              );
            }}
          />
        ) : (
          <View style={styles.permission}>
            <AppIcon icon={Camera} size={48} color="#fff" />
            <Text style={styles.title}>Une photo prise sur place</Text>
            <Text style={styles.explanation}>
              Autorisez la caméra pour documenter {subject}. Aucune photo ne
              sera choisie dans votre galerie.
            </Text>
            <Pressable
              accessibilityRole="button"
              style={styles.authorize}
              onPress={async () => {
                try {
                  if (
                    permission &&
                    !permission.canAskAgain &&
                    Platform.OS !== 'web'
                  )
                    await Linking.openSettings();
                  else {
                    const result = await requestPermission();
                    if (!result.granted)
                      setError(
                        'Accès refusé. Autorisez la caméra dans les réglages de l’appareil ou du navigateur, ou continuez sans photo.',
                      );
                  }
                } catch {
                  setError(
                    'La caméra n’est pas accessible. Vérifiez les autorisations de votre appareil.',
                  );
                }
              }}
            >
              <Text style={styles.authorizeText}>
                {permission && !permission.canAskAgain && Platform.OS !== 'web'
                  ? 'Ouvrir les réglages'
                  : 'Autoriser la caméra'}
              </Text>
            </Pressable>
          </View>
        )}
      </View>
      {error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      <View style={styles.footer}>
        <Text style={styles.explanation}>
          Vue d’ensemble ou détails visibles.{'\n'}Évitez les visages et les
          documents personnels.
        </Text>
        {permission?.granted && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Prendre la photo"
            accessibilityState={{ disabled: !ready || busy }}
            disabled={!ready || busy}
            onPress={takePhoto}
            style={[styles.shutter, (!ready || busy) && { opacity: 0.5 }]}
          >
            {busy ? (
              <ActivityIndicator color="#E72D2D" />
            ) : (
              <AppIcon icon={Camera} size={30} color="#E72D2D" />
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#141C2B' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 22,
    gap: 12,
  },
  title: { color: '#fff', fontWeight: '700', fontSize: 19 },
  subtitle: { color: '#BFC8D7', marginTop: 5 },
  close: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 22,
    backgroundColor: '#293345',
  },
  preview: {
    flex: 1,
    overflow: 'hidden',
    minHeight: 180,
    marginHorizontal: 16,
    borderRadius: 24,
    backgroundColor: '#253044',
  },
  permission: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    padding: 24,
  },
  explanation: {
    color: '#D2D8E1',
    textAlign: 'center',
    lineHeight: 21,
    fontSize: 13,
  },
  authorize: { borderRadius: 14, backgroundColor: '#fff', padding: 16 },
  authorizeText: { color: '#172033', fontWeight: '700' },
  footer: { padding: 20, alignItems: 'center', gap: 18 },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#fff',
    borderWidth: 5,
    borderColor: '#95A2B8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { color: '#FFD3CF', padding: 16, textAlign: 'center' },
});
