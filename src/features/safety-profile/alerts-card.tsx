import { useState } from "react";
import { Platform, StyleSheet } from "react-native";
import { SafetyReportDetailSheet } from "@/components/safety-report-detail-sheet";
import { surfaceDepth } from "@/components/ui/surface-depth";
import { createThemedStyles } from "@/features/appearance/theme-provider";
import { Pressable, Text, View } from "@/features/language/native";
import { safetyRpc } from "./api";
import { useSafetyAlerts } from "./provider";
import { disableSafetyPush, enableSafetyPush } from "./push";

export function SafetyAlertsCard() {
  const styles = useStyles();
  const { alerts, refresh, error, userId } = useSafetyAlerts();
  const [selection, setSelection] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function push(enabled: boolean) {
    if (!userId || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      if (enabled) {
        if (await enableSafetyPush(userId))
          setFeedback("Notifications activées.");
      } else {
        await disableSafetyPush();
        setFeedback("Notifications désactivées sur ce téléphone.");
      }
    } catch (e) {
      setFeedback(
        e instanceof Error ? e.message : "Notifications indisponibles.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Alertes des proches</Text>
      {Platform.OS !== "web" && (
        <View style={styles.row}>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            style={styles.button}
            onPress={() => void push(true)}
          >
            <Text style={styles.buttonText}>Activer les notifications</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            style={styles.button}
            onPress={() => void push(false)}
          >
            <Text style={styles.buttonText}>Désactiver</Text>
          </Pressable>
        </View>
      )}
      {(feedback || error) && (
        <Text accessibilityLiveRegion="polite" style={styles.muted}>
          {feedback ?? error}
        </Text>
      )}
      {error && (
        <Pressable style={styles.button} onPress={() => void refresh()}>
          <Text style={styles.buttonText}>Réessayer</Text>
        </Pressable>
      )}
      {!alerts.length && !error && (
        <Text style={styles.muted}>Aucune alerte</Text>
      )}
      {alerts.map((alert) => (
        <Pressable
          key={alert.id}
          accessibilityRole="button"
          style={[styles.alert, !alert.read_at && styles.unread]}
          onPress={() => {
            setSelection(`${alert.report_kind}:${alert.report_id}`);
            void safetyRpc("mark_safety_alert_read", { p_id: alert.id })
              .then(refresh)
              .catch(() =>
                setFeedback("Impossible de marquer cette alerte comme lue."),
              );
          }}
        >
          <Text translate={false} style={styles.alias}>
            {alert.alias}
          </Text>
          <Text style={styles.text}>Correspondance à vérifier</Text>
          <Text style={styles.muted}>
            {alert.match_kind === "identity"
              ? "Numéro d’identité signalé dans un accident"
              : alert.report_kind === "accident"
                ? "Véhicule signalé dans un accident"
                : "Véhicule signalé comme suspect"}
          </Text>
          <Text translate={false} style={styles.text}>
            {alert.location}
          </Text>
          <Text style={styles.muted}>
            {new Date(alert.occurred_at).toLocaleString("fr-FR", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </Pressable>
      ))}
      {selection && (
        <SafetyReportDetailSheet
          selection={selection}
          onClose={() => setSelection(null)}
        />
      )}
    </View>
  );
}
const useStyles = createThemedStyles((color) =>
  StyleSheet.create({
    card: {
      backgroundColor: color("#FFFFFF", "surface"),
      borderRadius: 24,
      padding: 20,
      gap: 14,
      ...surfaceDepth(color, "card"),
    },
    row: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
    buttonText: {
      color: color("#171719", "text"),
      fontSize: 14,
      fontWeight: "600",
    },
    title: { color: color("#171719", "text"), fontSize: 18, fontWeight: "700" },
    button: {
      minHeight: 44,
      padding: 12,
      backgroundColor: color("#F7F7F7", "background"),
      borderRadius: 14,
    },
    alert: {
      gap: 8,
      padding: 16,
      borderRadius: 16,
      backgroundColor: color("#F7F7F7", "background"),
    },
    unread: { borderLeftWidth: 3, borderLeftColor: color("#BA3D31", "accent") },
    alias: { fontSize: 17, fontWeight: "700", color: color("#171719", "text") },
    text: { fontSize: 14, color: color("#171719", "text") },
    muted: { fontSize: 13, color: color("#77777C", "muted") },
  }),
);
