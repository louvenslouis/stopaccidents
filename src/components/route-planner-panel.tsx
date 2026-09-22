import { useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import X from "lucide-react-native/icons/x";
import ArrowDownUp from "lucide-react-native/icons/arrow-down-up";
import type { RoutePlanner } from "@/features/map/use-route-planner";
import {
  formatRouteDistance,
  formatRouteDuration,
  REPORT_CORRIDOR_METERS,
} from "@/features/map/route-geometry";
import { AnimatedPressable } from "./ui/animated-pressable";

export type MapReportsState = {
  loading: boolean;
  error: string | null;
  truncated: boolean;
  available: boolean;
  refresh: () => void;
};

function Action({
  label,
  onPress,
  disabled = false,
  primary = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.action,
        primary && styles.primary,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.actionText, primary && styles.white]}>{label}</Text>
    </AnimatedPressable>
  );
}

export function RoutePlannerPanel({
  planner: p,
  top,
  reportsState,
  onSelect,
}: {
  planner: RoutePlanner;
  top: number;
  reportsState: MapReportsState;
  onSelect: (id: string) => void;
}) {
  const [details, setDetails] = useState(true);
  const [editing, setEditing] = useState(false);
  const [directions, setDirections] = useState(false);
  const [allReports, setAllReports] = useState(false);
  const { height } = useWindowDimensions();
  const busy = p.status === "loading" || p.status === "locating";
  const navigating = p.mode === "active" || p.mode === "starting";
  const progress = p.progress;
  const active = p.active;
  const along = progress?.along ?? 0;
  const routeDistance = active
    ? (along / active.index.length) * active.route.distance
    : 0;
  const remaining = active
    ? Math.max(0, active.route.distance - routeDistance)
    : 0;
  const nextStep =
    active?.route.steps.find(
      (step, index) => index > 0 && step.at > routeDistance - 10,
    ) ?? active?.route.steps.at(-1);
  const reports =
    active?.reports.filter((item) => item.along >= along - 25) ?? [];
  const reportsKnown = reportsState.available && !reportsState.error;

  return (
    <View style={[styles.position, { top }]} pointerEvents="box-none">
      <View style={[styles.panel, { maxHeight: Math.max(220, height * 0.57) }]}>
        <View style={styles.header}>
          <Text style={styles.title}>
            {p.mode === "arrived"
              ? "Vous êtes arrivé"
              : navigating
                ? "Trajet en cours"
                : "Votre itinéraire"}
          </Text>
          {active && (
            <Action
              label={details ? "Réduire" : "Détails"}
              onPress={() => setDetails(!details)}
            />
          )}
          <AnimatedPressable
            accessibilityLabel="Fermer l’itinéraire"
            accessibilityRole="button"
            onPress={p.close}
            style={styles.close}
          >
            <X size={21} color="#465267" />
          </AnimatedPressable>
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          {(!active || editing) && !navigating && (
            <>
              <View style={styles.fieldRow}>
                <Text style={[styles.point, styles.startPoint]}>A</Text>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>DÉPART</Text>
                  <TextInput
                    accessibilityLabel="Point de départ"
                    placeholder="Adresse ou ville de départ"
                    placeholderTextColor="#7C8697"
                    value={p.origin.query}
                    onChangeText={(text) => p.edit("origin", text)}
                    maxLength={120}
                    style={styles.input}
                    returnKeyType="next"
                  />
                </View>
                <AnimatedPressable
                  accessibilityLabel="Inverser le départ et l’arrivée"
                  accessibilityRole="button"
                  onPress={p.swap}
                  style={styles.close}
                >
                  <ArrowDownUp size={20} color="#1767A6" />
                </AnimatedPressable>
              </View>
              <View style={styles.fieldRow}>
                <Text style={[styles.point, styles.endPoint]}>B</Text>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>ARRIVÉE</Text>
                  <TextInput
                    accessibilityLabel="Point d’arrivée"
                    placeholder="Adresse ou ville d’arrivée"
                    placeholderTextColor="#7C8697"
                    value={p.destination.query}
                    onChangeText={(text) => p.edit("destination", text)}
                    maxLength={120}
                    style={styles.input}
                    returnKeyType="go"
                    onSubmitEditing={() => {
                      setEditing(false);
                      Keyboard.dismiss();
                      p.calculate();
                    }}
                  />
                </View>
              </View>
              <View style={styles.row}>
                <Action
                  label="Partir de ma position"
                  onPress={p.useCurrentPosition}
                />
                <Action
                  label={active ? "Recalculer" : "Calculer"}
                  primary
                  disabled={
                    busy ||
                    p.origin.query.trim().length < 2 ||
                    p.destination.query.trim().length < 2
                  }
                  onPress={() => {
                    setEditing(false);
                    Keyboard.dismiss();
                    p.calculate();
                  }}
                />
              </View>
            </>
          )}
          {busy && (
            <View style={styles.row} accessibilityLiveRegion="polite">
              <ActivityIndicator color="#1767A6" />
              <Text style={styles.body}>
                {p.status === "locating"
                  ? "Recherche de votre position…"
                  : "Calcul du trajet…"}
              </Text>
            </View>
          )}
          {p.error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {p.error}
            </Text>
          )}
          {active && (
            <>
              <View style={styles.summary}>
                <Text style={styles.duration}>
                  {p.mode === "arrived"
                    ? "Arrivé"
                    : formatRouteDuration(
                        active.route.duration *
                          (remaining / active.route.distance),
                      )}
                </Text>
                <Text style={styles.body}>
                  {formatRouteDistance(remaining)}
                  {navigating ? " restants" : " · en voiture"}
                </Text>
                <Action label="Voir le tracé" onPress={p.fit} />
              </View>
              <Text numberOfLines={2} style={styles.body}>
                Vers {p.destination.query}
              </Text>
              {details && !navigating && !editing && (
                <Action
                  label="Modifier le départ ou l’arrivée"
                  onPress={() => setEditing(true)}
                />
              )}
              {p.mode === "arrived" && (
                <Text style={styles.success}>
                  Point d’arrivée routier atteint. La destination peut être
                  légèrement en retrait de la route.
                </Text>
              )}
              {navigating && progress?.uncertain && (
                <Text style={styles.error}>
                  Précision GPS insuffisante. Le guidage reprendra avec une
                  position plus précise.
                </Text>
              )}
              {navigating && progress?.offRoute && (
                <Text style={styles.error}>
                  Vous avez quitté le tracé. Recalcul automatique en cours…
                </Text>
              )}
              {p.mode === "active" &&
                progress &&
                !progress.uncertain &&
                !progress.offRoute &&
                nextStep && (
                  <View
                    style={styles.guidance}
                    accessibilityLiveRegion="polite"
                  >
                    <Text style={styles.guidanceDistance}>
                      Dans{" "}
                      {formatRouteDistance(
                        Math.max(0, nextStep.at - routeDistance),
                      )}
                    </Text>
                    <Text style={styles.guidanceText}>
                      {nextStep.instruction}
                    </Text>
                  </View>
                )}
              {navigating ? (
                <Action label="Arrêter le guidage" onPress={p.stopNavigation} />
              ) : (
                <Action
                  label="Démarrer depuis ma position"
                  primary
                  disabled={busy}
                  onPress={() => {
                    setDetails(false);
                    Keyboard.dismiss();
                    p.begin();
                  }}
                />
              )}
              {details && (
                <>
                  {p.choices.length > 1 && !navigating && (
                    <View style={styles.options}>
                      {p.choices.map((choice, index) => (
                        <AnimatedPressable
                          key={choice.route.id}
                          accessibilityRole="button"
                          accessibilityState={{
                            selected: index === p.selected,
                          }}
                          onPress={() => p.choose(index)}
                          style={[
                            styles.option,
                            index === p.selected && styles.optionSelected,
                          ]}
                        >
                          <Text style={styles.optionTitle}>
                            {index === 0
                              ? "Le plus rapide"
                              : `Alternative ${index}`}
                          </Text>
                          <Text style={styles.body}>
                            {formatRouteDuration(choice.route.duration)} ·{" "}
                            {formatRouteDistance(choice.route.distance)}
                          </Text>
                          <Text style={styles.caption}>
                            {reportsKnown
                              ? `${choice.reports.length} signalement(s) proche(s)`
                              : "Signalements indisponibles"}
                          </Text>
                        </AnimatedPressable>
                      ))}
                    </View>
                  )}
                  <Text style={styles.sectionTitle}>
                    Signalements {navigating ? "à venir" : "sur le trajet"}
                    {reportsState.available ? ` (${reports.length})` : ""}
                  </Text>
                  <Text style={styles.caption}>
                    À moins de {REPORT_CORRIDOR_METERS} m du tracé ; une rue
                    voisine peut être incluse.
                  </Text>
                  {reportsState.loading && (
                    <Text style={styles.caption}>
                      Actualisation des signalements…
                    </Text>
                  )}
                  {reportsState.error && (
                    <>
                      <Text style={styles.error}>
                        Signalements indisponibles ou non actualisés.{" "}
                        {reportsState.error}
                      </Text>
                      <Action
                        label="Actualiser les signalements"
                        onPress={reportsState.refresh}
                      />
                    </>
                  )}
                  {reportsState.truncated && (
                    <Text style={styles.error}>
                      La liste chargée est limitée aux signalements récents.
                      D’autres signalements peuvent manquer sur ce trajet.
                    </Text>
                  )}
                  {!reports.length && reportsKnown && (
                    <Text style={styles.body}>
                      Aucun signalement chargé à proximité du tracé.
                    </Text>
                  )}
                  {!reportsState.available && !reportsState.error && (
                    <Text style={styles.caption}>
                      Chargement des signalements…
                    </Text>
                  )}
                  {(allReports ? reports : reports.slice(0, 20)).map((item) => (
                    <AnimatedPressable
                      key={item.marker.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Ouvrir ${item.marker.title}`}
                      onPress={() => onSelect(item.marker.id)}
                      style={styles.report}
                    >
                      <View
                        style={[
                          styles.reportDot,
                          { backgroundColor: item.marker.color },
                        ]}
                      />
                      <View style={styles.flex}>
                        <Text style={styles.body}>{item.marker.title}</Text>
                        <Text style={styles.caption}>
                          {navigating ? "Dans" : "À"}{" "}
                          {formatRouteDistance(Math.max(0, item.along - along))}
                          {navigating ? "" : " du départ"}
                        </Text>
                      </View>
                    </AnimatedPressable>
                  ))}
                  {!allReports && reports.length > 20 && (
                    <Action
                      label={`Voir les ${reports.length} signalements`}
                      onPress={() => setAllReports(true)}
                    />
                  )}
                  <Action
                    label={
                      directions
                        ? "Masquer les directions"
                        : "Voir les directions"
                    }
                    onPress={() => setDirections(!directions)}
                  />
                  {directions &&
                    active.route.steps.map((step, index) => (
                      <View key={index} style={styles.step}>
                        <Text style={styles.body}>
                          {index + 1}. {step.instruction}
                        </Text>
                        <Text style={styles.caption}>
                          {formatRouteDistance(step.distance)}
                        </Text>
                      </View>
                    ))}
                  <Text style={styles.caption}>
                    Durée estimée hors trafic en temps réel. Routes ©
                    OpenStreetMap, calcul OSRM. Les signalements ne déterminent
                    pas la praticabilité des routes.
                  </Text>
                </>
              )}
              {!details && reports[0] && (
                <AnimatedPressable
                  accessibilityRole="button"
                  onPress={() => onSelect(reports[0].marker.id)}
                  style={styles.report}
                >
                  <View
                    style={[
                      styles.reportDot,
                      { backgroundColor: reports[0].marker.color },
                    ]}
                  />
                  <Text style={[styles.body, styles.flex]} numberOfLines={2}>
                    Dans{" "}
                    {formatRouteDistance(Math.max(0, reports[0].along - along))}{" "}
                    · {reports[0].marker.title}
                  </Text>
                </AnimatedPressable>
              )}
              {!details &&
                (reportsState.error ||
                  reportsState.truncated ||
                  !reportsState.available) && (
                  <Text style={styles.error}>
                    Signalements{" "}
                    {reportsState.error || !reportsState.available
                      ? "indisponibles ou non actualisés"
                      : "partiels"}{" "}
                    · consultez les détails.
                  </Text>
                )}
            </>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  position: {
    position: "absolute",
    left: 12,
    right: 12,
    alignItems: "center",
    zIndex: 15,
  },
  panel: {
    width: "100%",
    maxWidth: 460,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    shadowColor: "#182B49",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#EDF0F4",
  },
  title: { flex: 1, fontWeight: "800", fontSize: 18, color: "#162C46" },
  close: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  content: { padding: 16, gap: 12 },
  fieldRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  point: {
    width: 25,
    height: 25,
    borderRadius: 13,
    textAlign: "center",
    lineHeight: 25,
    color: "#FFFFFF",
    fontWeight: "800",
    overflow: "hidden",
  },
  startPoint: { backgroundColor: "#1767A6" },
  endPoint: { backgroundColor: "#E75840" },
  field: { flex: 1, borderBottomWidth: 1, borderBottomColor: "#DBE2EB" },
  fieldLabel: {
    color: "#748092",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  input: { minHeight: 42, color: "#162C46", fontSize: 15, paddingVertical: 6 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    flexWrap: "wrap",
  },
  action: {
    minHeight: 42,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF5FB",
  },
  primary: { backgroundColor: "#1767A6" },
  actionText: { color: "#1767A6", fontSize: 13, fontWeight: "700" },
  white: { color: "#FFFFFF" },
  disabled: { opacity: 0.45 },
  summary: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
  },
  duration: { fontSize: 25, fontWeight: "800", color: "#1767A6" },
  body: { fontSize: 14, color: "#34445A", lineHeight: 20 },
  caption: { color: "#697589", fontSize: 12, lineHeight: 18 },
  error: { color: "#A5402E", fontSize: 13, lineHeight: 19 },
  success: { color: "#217345", lineHeight: 20 },
  guidance: {
    padding: 14,
    backgroundColor: "#1767A6",
    borderRadius: 14,
    gap: 6,
  },
  guidanceDistance: { color: "#DBECFF", fontSize: 13 },
  guidanceText: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: "#162C46" },
  options: { gap: 8 },
  option: {
    padding: 12,
    gap: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#DEE5EE",
  },
  optionSelected: { borderColor: "#1767A6", backgroundColor: "#EEF6FE" },
  optionTitle: { color: "#1767A6", fontWeight: "700" },
  report: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 48,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#EEF1F5",
  },
  reportDot: { width: 10, height: 10, borderRadius: 5 },
  flex: { flex: 1 },
  step: {
    gap: 2,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF1F5",
  },
});
