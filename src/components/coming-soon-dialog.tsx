import { Modal, StyleSheet } from 'react-native';
import { comingSoonMessage } from '@/constants/feature-availability';
import { createThemedStyles } from '@/features/appearance/theme-provider';
import { Pressable, Text, View } from '@/features/language/native';

export function ComingSoonDialog({ onClose }: { onClose: () => void }) {
  const styles = useStyles();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable accessible={false} onPress={onClose} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal onAccessibilityEscape={onClose} style={styles.dialog}>
          <Text accessibilityRole="header" style={styles.message}>{comingSoonMessage}</Text>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.button}>
            <Text style={styles.buttonText}>Fermer</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = createThemedStyles(color => StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: color('#11182780', 'overlay') },
  dialog: { width: '100%', maxWidth: 360, gap: 20, padding: 24, borderRadius: 24, backgroundColor: color('#FFFFFF', 'surface') },
  message: { fontSize: 20, fontWeight: '700', color: color('#171719', 'text') },
  button: { alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
  buttonText: { fontSize: 16, fontWeight: '600', color: color('#267E70', 'success') },
}));
