import { ReportIllustration } from '@/components/report-illustration';
import ArrowRight from 'lucide-react-native/icons/arrow-right';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import X from 'lucide-react-native/icons/x';
import { useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '@/components/ui/app-icon';
import { AnimatedPressable } from '@/components/ui/animated-pressable';

// Add future report categories here; each choice routes to its own form.
const reportTypes = [
  {
    id: 'accident',
    title: 'Accident',
    description: 'Collision, sortie de route ou personne renversée.',
  },
  {
    id: 'kidnapping',
    title: 'Enlèvement',
    description: 'Véhicules, direction prise et indices sur la personne.',
  },
] as const;
export type ReportType = (typeof reportTypes)[number]['id'];

export function ReportTypePicker({
  onSelect,
  onClose,
}: {
  onSelect: (type: ReportType) => void;
  onClose: () => void;
}) {
  const dragStartY = useRef(0);
  return (
    <>
      <View
        style={styles.handleArea}
        onStartShouldSetResponder={() => true}
        onResponderGrant={(event) => {
          dragStartY.current = event.nativeEvent.pageY;
        }}
        onResponderRelease={(event) => {
          if (event.nativeEvent.pageY - dragStartY.current > 60) onClose();
        }}
      >
        <View style={styles.handle} />
      </View>
      <View style={styles.header}>
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>NOUVEAU SIGNALEMENT</Text>
          <Text accessibilityRole="header" style={styles.title}>
            Que souhaitez-vous signaler ?
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fermer les types de signalement"
          onPress={onClose}
          style={styles.close}
        >
          <AppIcon icon={X} size={21} color="#667185" />
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.description}>
          Choisissez le type de situation pour commencer.
        </Text>
        {reportTypes.map((type) => (
          <AnimatedPressable
            key={type.id}
            accessibilityRole="button"
            accessibilityLabel={type.title}
            accessibilityHint="Localise automatiquement et enregistre le signalement avant les compléments"
            haptic="light"
            pressedScale={0.98}
            onPress={() => onSelect(type.id)}
            style={styles.card}
          >
            <ReportIllustration kind={type.id} size={80} />
            <View style={styles.heading}>
              <Text style={styles.cardTitle}>{type.title}</Text>
              <Text style={styles.cardDescription}>{type.description}</Text>
            </View>
            <AppIcon icon={ArrowRight} size={21} color="#D94235" />
          </AnimatedPressable>
        ))}
        <View style={styles.note}>
          <AppIcon icon={ShieldCheck} size={18} color="#7C8797" />
          <Text style={styles.noteText}>
            Chaque parcours commence par une localisation précise et enregistre
            immédiatement le signalement.
          </Text>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  handleArea: { height: 28, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#D8DDE5' },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 7,
    paddingBottom: 8,
  },
  heading: { flex: 1 },
  eyebrow: {
    color: '#AD5044',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.3,
    marginBottom: 9,
  },
  title: {
    color: '#1C2637',
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F6F8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: 24, paddingTop: 8, gap: 20 },
  description: { color: '#768091', fontSize: 14, lineHeight: 21 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#F0D3CB',
    borderRadius: 20,
    backgroundColor: '#FFFAF7',
    minHeight: 112,
  },
  cardTitle: {
    color: '#273347',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  cardDescription: { color: '#7E8998', fontSize: 12, lineHeight: 18 },
  note: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  noteText: { flex: 1, color: '#8A94A3', fontSize: 12, lineHeight: 18 },
});
