import { ActivityIndicator, Pressable, Text, View } from "react-native";
export function ReportDraftLoading({
  error,
  onRetry,
  onClose,
}: {
  error: string | null;
  onRetry: () => void;
  onClose: () => void;
}) {
  return (
    <View style={{ padding: 28, gap: 20 }}>
      {!error && <ActivityIndicator />}
      <Text>{error ?? "Restauration de votre brouillon…"}</Text>
      {error && (
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          style={{ padding: 14 }}
        >
          <Text>Réessayer</Text>
        </Pressable>
      )}
      <Pressable
        accessibilityRole="button"
        onPress={onClose}
        style={{ padding: 14 }}
      >
        <Text>Fermer</Text>
      </Pressable>
    </View>
  );
}
