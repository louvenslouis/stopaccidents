import { Pressable, Text, TextInput, View } from '@/features/language/native';
import { useAppTheme, createThemedStyles } from '@/features/appearance/theme-provider';
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet } from 'react-native';
import { supabase } from "@/lib/supabase";
import { readReportEvent, type ReportKind } from "@/features/report-events/api";
import { useAccident } from "@/features/accident-report/use-accident";
import { formatAccidentDate } from "@/features/accident-report/presentation";
import { reportSelection } from "@/features/safety-report/read";
import { SafetyReportDetailSheet } from "./safety-report-detail-sheet";

export function EventContributions({
  kind,
  reportId,
}: {
  kind: ReportKind;
  reportId: string;
}) {
  const { scheme } = useAppTheme();
  const styles = useStyles();

  const loader = useCallback(
    (signal: AbortSignal) => readReportEvent(kind, reportId, signal),
    [kind, reportId],
  );
  const { data: event, loading, error, refresh } = useAccident(loader);
  const [selection, setSelection] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(() => {
      void Promise.resolve().then(refresh);
    });
    return () => data.subscription.unsubscribe();
  }, [refresh]);
  async function moderate(mergeId?: string) {
    if (!event || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const result = mergeId
        ? await supabase.rpc("undo_report_event_merge", { p_merge_id: mergeId })
        : await supabase.rpc("merge_report_events", {
            p_source: event.event_id,
            p_target: target.trim(),
            p_reason: reason.trim(),
          });
      if (result.error)
        throw new Error(
          "La modification n’a pas pu être confirmée. Vérifiez l’événement et réessayez.",
        );
      setTarget("");
      setReason("");
      refresh();
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Modification impossible.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!event)
    return (
      <View style={styles.card}>
        {loading ? (
          <ActivityIndicator />
        ) : error ? (
          <Pressable accessibilityRole="button" onPress={refresh}>
            <Text style={styles.body}>
              Témoignages indisponibles. Réessayer.
            </Text>
          </Pressable>
        ) : null}
      </View>
    );
  return (
    <View style={styles.card}>
      <Text style={styles.title}>
        {event.summary.testimony_count} témoignage
        {event.summary.testimony_count > 1 ? "s" : ""} ·{" "}
        {event.summary.witness_count} témoin
        {event.summary.witness_count > 1 ? "s" : ""}
      </Text>
      <Text style={styles.body}>
        Dernier témoignage :{" "}
        {formatAccidentDate(event.summary.last_observed_at)}
      </Text>
      <Text style={styles.body}>
        Les témoignages décrivent des observations qui restent à vérifier.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded(!expanded)}
        style={styles.button}
      >
        <Text style={styles.link}>
          {expanded ? "Masquer les témoignages" : "Consulter les témoignages"}
        </Text>
      </Pressable>
      {expanded &&
        event.contributions.map((report, index) => (
          <View key={reportSelection(report)} style={styles.row}>
            <Text style={styles.body}>
              Témoignage {index + 1} · {formatAccidentDate(report.created_at)}
            </Text>
            <Text style={styles.body}>
              {report.location_description ? <Text translate={false}>{report.location_description}</Text> : "Lieu à préciser"}
            </Text>
            {report.id === reportId ? (
              <Text style={styles.body}>Témoignage affiché</Text>
            ) : (
              <Pressable
                accessibilityRole="button"
                style={styles.button}
                onPress={() => setSelection(reportSelection(report))}
              >
                <Text style={styles.link}>
                  Lire les détails et les photos disponibles
                </Text>
              </Pressable>
            )}
          </View>
        ))}
      {event.is_moderator && (
        <View style={styles.row}>
          <Text style={styles.title}>Modération · fusion réversible</Text>
          <Text selectable style={styles.body}>
            Événement : {event.event_id}
          </Text>
          <Text style={styles.body}>
            Regroupez uniquement les fiches décrivant le même événement. Les
            témoignages et leurs photos sont conservés.
          </Text>
          <TextInput keyboardAppearance={scheme}
            accessibilityLabel="Identifiant de l’événement de destination"
            placeholder="Identifiant de l’événement de destination"
            value={target}
            onChangeText={setTarget}
            autoCapitalize="none"
            style={styles.input}
            editable={!busy}
          />
          <TextInput keyboardAppearance={scheme}
            accessibilityLabel="Motif de la fusion"
            placeholder="Motif de la fusion"
            value={reason}
            onChangeText={setReason}
            maxLength={500}
            multiline
            style={styles.input}
            editable={!busy}
          />
          <Pressable
            accessibilityRole="button"
            disabled={
              busy ||
              reason.trim().length < 3 ||
              !/^[0-9a-f-]{36}$/i.test(target.trim())
            }
            style={styles.button}
            onPress={() => void moderate()}
          >
            <Text style={styles.link}>Fusionner les événements</Text>
          </Pressable>
          {event.merges.map((merge) => (
            <View key={merge.id} style={styles.row}>
              <Text style={styles.body}>
                {merge.reason} · {formatAccidentDate(merge.created_at)}
              </Text>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                style={styles.button}
                onPress={() => void moderate(merge.id)}
              >
                <Text style={styles.link}>Annuler cette fusion</Text>
              </Pressable>
            </View>
          ))}
          {busy && <ActivityIndicator />}
          {actionError && (
            <Text accessibilityRole="alert" style={styles.body}>
              {actionError}
            </Text>
          )}
        </View>
      )}
      {selection && (
        <SafetyReportDetailSheet
          selection={selection}
          onClose={() => setSelection(null)}
          hideContributions
        />
      )}
    </View>
  );
}
const useStyles = createThemedStyles((themeColor) => StyleSheet.create({
  card: { backgroundColor: themeColor("#F0F7F5", 'elevated'), padding: 16, borderRadius: 16, gap: 8 },
  title: { fontSize: 15, fontWeight: "700", color: themeColor("#245F54", 'text') },
  body: { color: themeColor("#63766F", 'secondary'), fontSize: 13, lineHeight: 20 },
  link: { fontWeight: "600", color: themeColor("#267E70", 'success'), fontSize: 14 },
  button: { minHeight: 44, paddingVertical: 12 },
  row: { borderTopWidth: 1, borderColor: themeColor("#D3E4DD", 'border'), paddingTop: 12, gap: 8 },
  input: {
    backgroundColor: themeColor("#fff", 'surface'),
    borderWidth: 1,
    borderColor: themeColor("#CEDDD6", 'border'),
    borderRadius: 10,
    padding: 12,
    minHeight: 46,
  },
}));
