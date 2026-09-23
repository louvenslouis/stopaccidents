import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import Copy from 'lucide-react-native/icons/copy';
import Download from 'lucide-react-native/icons/download';
import Share2 from 'lucide-react-native/icons/share-2';
import MapPin from 'lucide-react-native/icons/map-pin';
import Clock3 from 'lucide-react-native/icons/clock-3';
import TriangleAlert from 'lucide-react-native/icons/triangle-alert';
import X from 'lucide-react-native/icons/x';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from './ui/app-icon';
import type { ReportShare } from '@/features/safety-report/share';
import { prepareReportImage } from '@/features/safety-report/share-image';
import type { PreparedReportImage } from '@/features/safety-report/share-image.types';

export function ReportShareSheet({ report, onClose }: { report: ReportShare; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const card = useRef<View>(null);
  const busy = useRef(false);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [image, setImage] = useState<PreparedReportImage | null>(null);
  const [preparing, setPreparing] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!size) return;
    let active = true;
    let prepared: PreparedReportImage | null = null;
    // Wait for layout and SVG icons to paint before taking the snapshot.
    const frame = requestAnimationFrame(() => {
      setImage(null);
      setPreparing(true);
      setError(null);
      void (async () => {
        try {
          if (!card.current) throw new Error('Carte indisponible');
          prepared = await prepareReportImage(card.current, report, size);
          if (active) setImage(prepared);
          else prepared.dispose();
        } catch {
          if (active) setError('Impossible de générer l’image. Réessayez.');
        } finally {
          if (active) setPreparing(false);
        }
      })();
    });
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      prepared?.dispose();
    };
  }, [size, attempt, report]);

  async function share() {
    if (!image || busy.current) return;
    busy.current = true;
    setSharing(true);
    setError(null);
    setNotice(null);
    try {
      await image.share();
    } catch (cause) {
      if (!(cause instanceof Error && cause.name === 'AbortError')) {
        setError('Le partage n’a pas pu démarrer. Réessayez ou copiez le texte et le lien.');
      }
    } finally {
      busy.current = false;
      setSharing(false);
    }
  }

  async function copy() {
    try {
      const copied = await Clipboard.setStringAsync(report.message);
      if (!copied) throw new Error('Copie indisponible');
      setNotice('Description et lien copiés.');
    } catch {
      setNotice('Sélectionnez le texte ci-dessous pour le copier.');
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => !busy.current && onClose()}>
      <View style={[styles.overlay, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
        <View accessibilityViewIsModal style={styles.sheet}>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>Partager l’événement</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Fermer le partage" disabled={sharing} onPress={onClose} style={styles.close}>
              <AppIcon icon={X} size={21} color="#667080" />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.preview}>
              <View ref={card} collapsable={false} style={styles.imageCard} onLayout={({ nativeEvent: { layout } }) => {
                if (layout.width > 0 && layout.height > 0) {
                  setSize((previous) => previous?.width === layout.width && previous.height === layout.height ? previous : { width: layout.width, height: layout.height });
                }
              }}>
                <View style={styles.brandRow}>
                  <Text style={styles.brand}>STOP ACCIDENTS</Text>
                  <Text style={styles.brandCaption}>SIGNALEMENT</Text>
                </View>
                <View style={styles.eventHeading}>
                  <View style={styles.iconBox}><AppIcon icon={TriangleAlert} size={24} color="#D94235" /></View>
                  <Text style={styles.eventTitle}>{report.title}</Text>
                </View>
                <View style={styles.details}>
                  <View style={styles.line}>
                    <AppIcon icon={MapPin} size={17} color="#858C98" />
                    <Text style={styles.location}>{report.estimated ? 'Zone estimée · ' : ''}{report.location}</Text>
                  </View>
                  <View style={styles.line}>
                    <AppIcon icon={Clock3} size={16} color="#858C98" />
                    <Text style={styles.date}>Signalé le {report.date}</Text>
                  </View>
                  {report.severity && (
                    <View style={[styles.badge, { backgroundColor: report.severity.tint }]}>
                      <Text style={[styles.badgeText, { color: report.severity.color }]}>{report.severity.label}</Text>
                    </View>
                  )}
                  {report.estimated && <Text style={styles.credit}>Données géographiques © OpenStreetMap</Text>}
                </View>
                <View style={styles.imageFooter}>
                  <Text style={styles.linkLabel}>Voir l’événement et ses mises à jour</Text>
                  <Text style={styles.imageLink}>{report.url}</Text>
                </View>
              </View>
              {image && <Image source={{ uri: image.uri }} accessible={false} contentFit="fill" style={styles.generatedImage} />}
            </View>
            {preparing ? (
              <View accessibilityLiveRegion="polite" style={styles.loading}>
                <ActivityIndicator size="small" color="#C43F32" />
                <Text style={styles.help}>Préparation de l’image…</Text>
              </View>
            ) : image ? (
              <>
                {image.canShare ? (
                  <Pressable accessibilityRole="button" accessibilityState={{ busy: sharing, disabled: sharing }} disabled={sharing} onPress={() => void share()} style={[styles.primary, sharing && styles.disabled]}>
                    {sharing ? <ActivityIndicator size="small" color="#FFFFFF" /> : <AppIcon icon={Share2} size={19} color="#FFFFFF" />}
                    <Text style={styles.primaryText}>Partager l’image et le lien</Text>
                  </Pressable>
                ) : (
                  <Text style={styles.help}>{Platform.OS === 'web' ? 'Téléchargez l’image, puis copiez la description et le lien pour les joindre à votre message.' : 'Le partage d’images n’est pas disponible dans cette version de l’application. Vous pouvez copier la description et le lien.'}</Text>
                )}
                {image.download && (
                  <Pressable accessibilityRole="button" onPress={() => {
                    image.download?.();
                    setNotice('Téléchargement lancé. Copiez aussi la description et le lien.');
                  }} style={styles.secondary}>
                    <AppIcon icon={Download} size={18} color="#3E4551" />
                    <Text style={styles.secondaryText}>Télécharger l’image</Text>
                  </Pressable>
                )}
              </>
            ) : (
              <Pressable accessibilityRole="button" onPress={() => setAttempt((value) => value + 1)} style={styles.secondary}><Text style={styles.secondaryText}>Réessayer la génération</Text></Pressable>
            )}
            <Pressable accessibilityRole="button" onPress={() => void copy()} style={styles.secondary}>
              <AppIcon icon={Copy} size={17} color="#3E4551" />
              <Text style={styles.secondaryText}>Copier le texte et le lien</Text>
            </Pressable>
            {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
            {notice && <Text accessibilityLiveRegion="polite" style={styles.help}>{notice}</Text>}
            <Text selectable style={styles.message}>{report.message}</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(17,24,39,0.42)', paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  sheet: { width: '100%', maxWidth: 480, maxHeight: '100%', backgroundColor: '#FFFFFF', borderRadius: 26, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 20, paddingRight: 10, paddingVertical: 10 },
  title: { fontSize: 18, fontWeight: '700', color: '#24262C', flexShrink: 1 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingTop: 0, gap: 12 },
  preview: { borderWidth: 1, borderColor: '#E9ECF0', borderRadius: 20, overflow: 'hidden' },
  generatedImage: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#FFFFFF' },
  imageCard: { padding: 20, backgroundColor: '#FFFFFF' },
  brandRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 22 },
  brand: { color: '#C43F32', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  brandCaption: { color: '#888D97', fontSize: 9, fontWeight: '600', letterSpacing: 1 },
  eventHeading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox: { width: 46, height: 46, borderRadius: 14, backgroundColor: '#FFF0EC', alignItems: 'center', justifyContent: 'center' },
  eventTitle: { flex: 1, color: '#20242C', fontSize: 20, lineHeight: 26, fontWeight: '700' },
  details: { borderTopWidth: 1, borderTopColor: '#E9ECF0', marginTop: 18, paddingTop: 16, gap: 12 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  location: { flex: 1, fontSize: 14, lineHeight: 21, color: '#3E4551', fontWeight: '500' },
  date: { flex: 1, fontSize: 12, lineHeight: 18, color: '#737C89' },
  badge: { alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  credit: { color: '#777E89', fontSize: 10 },
  imageFooter: { marginTop: 20, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#E9ECF0', gap: 6 },
  linkLabel: { fontSize: 11, color: '#C43F32', fontWeight: '600' },
  imageLink: { fontSize: 10, lineHeight: 15, color: '#737C89' },
  loading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 12 },
  help: { fontSize: 12, lineHeight: 18, color: '#667080' },
  primary: { minHeight: 48, borderRadius: 14, backgroundColor: '#C43F32', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, gap: 9 },
  primaryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14, flexShrink: 1 },
  secondary: { minHeight: 44, borderRadius: 12, backgroundColor: '#F4F5F7', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12 },
  secondaryText: { color: '#3E4551', fontSize: 13, fontWeight: '600', flexShrink: 1 },
  message: { fontSize: 12, lineHeight: 19, color: '#737C89', paddingTop: 4 },
  error: { color: '#B94025', fontSize: 12, lineHeight: 18 },
  disabled: { opacity: 0.6 },
});
