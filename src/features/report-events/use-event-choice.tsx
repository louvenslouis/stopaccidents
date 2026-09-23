import { useEffect, useRef, useState } from "react";
import { createThemedStyles } from '@/features/appearance/theme-provider';
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  nearbyEvents,
  type EventDraft,
  type NearbyEvent,
  type ReportKind,
} from "./api";
import {
  accidentTypeLabel,
  formatAccidentDate,
} from "@/features/accident-report/presentation";

type Pending = {
  events: NearbyEvent[];
  resolve: (id: string | null) => void;
  cancel: () => void;
};
export function useEventChoice(kind: ReportKind) {
  const styles = useStyles();
  const [pending, setPending] = useState<Pending | null>(null);
  const current = useRef<Pending | null>(null);
  useEffect(() => () => current.current?.cancel(), []);
  async function choose<D extends EventDraft>(
    draft: D,
    signal: AbortSignal,
  ): Promise<D> {
    if (draft.eventChoiceMade) return draft;
    const events = await nearbyEvents(kind, draft, signal);
    if (signal.aborted) throw new Error("Recherche annulée.");
    if (!events.length)
      return { ...draft, eventId: null, eventChoiceMade: true };
    const eventId = await new Promise<string | null>((resolve, reject) => {
      const finish = (id: string | null) => {
        signal.removeEventListener("abort", cancel);
        current.current = null;
        setPending(null);
        resolve(id);
      };
      const cancel = () => {
        signal.removeEventListener("abort", cancel);
        current.current = null;
        setPending(null);
        reject(new Error("Recherche annulée."));
      };
      const choice = { events, resolve: finish, cancel };
      current.current = choice;
      setPending(choice);
      signal.addEventListener("abort", cancel, { once: true });
    });
    return { ...draft, eventId, eventChoiceMade: true };
  }
  const panel = pending ? (
    <ScrollView contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={styles.title}>
        Est-ce le même événement ?
      </Text>
      <Text style={styles.body}>
        Des témoignages récents existent près d’ici. Choisissez celui que vous
        avez observé pour y ajouter vos informations.
      </Text>
      {kind === "gunfire" && (
        <Text style={styles.body}>
          Les distances correspondent aux lieux d’écoute, pas à l’origine des
          tirs.
        </Text>
      )}
      {pending.events.map((event) => (
        <View key={event.event_id} style={styles.card}>
          {event.report_kind === "accident" && (
            <Text style={styles.name}>{accidentTypeLabel(event)}</Text>
          )}
          <Text style={styles.name}>
            {event.location_description || "Lieu à préciser"} ·{" "}
            {event.distance_m} m
          </Text>
          <Text style={styles.body}>
            {event.witness_count} témoin{event.witness_count > 1 ? "s" : ""} ·
            dernier témoignage {formatAccidentDate(event.last_observed_at)}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => pending.resolve(event.event_id)}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Oui, ajouter mon témoignage</Text>
          </Pressable>
        </View>
      ))}
      <Pressable
        accessibilityRole="button"
        onPress={() => pending.resolve(null)}
        style={styles.secondary}
      >
        <Text style={styles.name}>Non, signaler un autre événement</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={pending.cancel}
        style={styles.secondary}
      >
        <Text style={styles.body}>Revenir au formulaire</Text>
      </Pressable>
    </ScrollView>
  ) : null;
  return { choose, panel };
}
const useStyles = createThemedStyles((color) => StyleSheet.create({
  content: { padding: 24, gap: 16 },
  title: { fontSize: 24, fontWeight: "700", color: color("#1C2637", 'text') },
  body: { fontSize: 14, lineHeight: 21, color: color("#667185", 'muted') },
  name: { fontSize: 15, fontWeight: "600", color: color("#243147", 'text') },
  card: {
    borderWidth: 1,
    borderColor: color("#DCE5EB", 'border'),
    borderRadius: 16,
    padding: 16,
    gap: 12,
    backgroundColor: color("#F7FAFC", 'elevated'),
  },
  button: {
    backgroundColor: "#267E70",
    borderRadius: 12,
    padding: 14,
    minHeight: 48,
  },
  buttonText: { color: "#fff", fontWeight: "700", textAlign: "center" },
  secondary: { padding: 14, minHeight: 48, alignItems: "center" },
}));
