import { Pressable, Text, View } from '@/features/language/native';
import { ActivityIndicator } from 'react-native';
import { useThemeColor } from '@/features/appearance/theme-provider';
export function ReportDraftLoading({
  error,
  onRetry,
  onClose,
}: {
  error: string | null;
  onRetry: () => void;
  onClose: () => void;
}) {
  const color = useThemeColor();
  return (
    <View style={{ padding: 28, gap: 20 }}>
      {!error && <ActivityIndicator color={color('#667185', 'muted')} />}
      <Text style={{ color: color('#243147', 'text') }}>{error ?? "Restauration de votre brouillon…"}</Text>
      {error && (
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          style={{ padding: 14 }}
        >
          <Text style={{ color: color('#C43F32', 'accent') }}>Réessayer</Text>
        </Pressable>
      )}
      <Pressable
        accessibilityRole="button"
        onPress={onClose}
        style={{ padding: 14 }}
      >
        <Text style={{ color: color('#667185', 'muted') }}>Fermer</Text>
      </Pressable>
    </View>
  );
}
