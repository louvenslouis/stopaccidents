import { ReportIllustration } from "@/components/report-illustration";
import ShieldCheck from "lucide-react-native/icons/shield-check";
import X from "lucide-react-native/icons/x";
import { useEffect, useRef, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  cancelAnimation,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
} from "react-native-reanimated";
import { AppIcon } from "@/components/ui/app-icon";
import { AnimatedPressable } from "@/components/ui/animated-pressable";

// Add future report categories here; each choice routes to its own form.
const reportTypes = [
  { id: "gunfire", title: "Tirs entendus", tint: "#FFF0EE", border: "#F3D1CB", description: "Proximité perçue, quantité approximative et rythme des tirs." },
  {
    id: "accident",
    title: "Accident",
    tint: "#FFF0E9",
    border: "#F7D9CC",
    description: "Collision, sortie de route ou personne renversée.",
  },
  {
    id: "kidnapping",
    title: "Enlèvement",
    tint: "#F0EDFF",
    border: "#E0D9F8",
    description: "Véhicules, direction prise et indices sur la personne.",
  },
  {
    id: "barricade",
    tint: "#FFF5DF",
    border: "#F2E3BC",
    title: "Route barricadée",
    description: "Route bloquée, obstacles et possibilités de passage.",
  },
  {
    id: "armed_presence",
    tint: "#EDF3F8",
    border: "#D9E4ED",
    title: "Présence d’hommes armés",
    description: "Localisation, nombre approximatif et situation observée.",
  },
  {
    id: "suspicious_vehicle",
    tint: "#EAF6F0",
    border: "#D1E9DC",
    title: "Voiture suspecte",
    description: "Description du véhicule et faits observés.",
  },
] as const;
export type ReportType = (typeof reportTypes)[number]["id"];

function ReportTypeChoice({
  type,
  index,
  width,
  onSelect,
}: {
  type: (typeof reportTypes)[number];
  index: number;
  width: number;
  onSelect: (type: ReportType) => void;
}) {
  const reducedMotion = useReducedMotion();
  const entrance = useSharedValue(reducedMotion ? 1 : 0);

  useEffect(() => {
    entrance.value = withDelay(
      90 + index * 65,
      withSpring(1, {
        damping: 13,
        stiffness: 190,
        mass: 0.65,
        reduceMotion: ReduceMotion.System,
      }),
      ReduceMotion.System,
    );
    return () => cancelAnimation(entrance);
  }, [entrance, index]);

  const entranceStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, entrance.value * 2),
    transform: [
      { translateY: (1 - entrance.value) * 22 },
      { scale: 0.84 + entrance.value * 0.16 },
    ],
  }));

  return (
    <Animated.View style={[{ width }, entranceStyle]}>
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={type.title}
        accessibilityHint={`${type.description} Localise automatiquement et propose les événements proches.`}
        haptic="light"
        pressedScale={0.9}
        pressedOpacity={0.9}
        hoverScale={1.04}
        onPress={() => onSelect(type.id)}
        style={styles.choice}
      >
        <View
          style={[
            styles.circle,
            { backgroundColor: type.tint, borderColor: type.border },
          ]}
        >
          <ReportIllustration kind={type.id} size={76} />
        </View>
        <Text style={styles.choiceTitle}>{type.title}</Text>
      </AnimatedPressable>
    </Animated.View>
  );
}

export function ReportTypePicker({
  onSelect,
  onClose,
}: {
  onSelect: (type: ReportType) => void;
  onClose: () => void;
}) {
  const dragStartY = useRef(0);
  const { width: windowWidth, fontScale } = useWindowDimensions();
  const [gridWidth, setGridWidth] = useState(0);
  const availableWidth = gridWidth || Math.max(0, windowWidth - 48);
  const columns = Math.max(
    1,
    Math.min(
      4,
      Math.floor((availableWidth + 12) / (96 * Math.max(1, fontScale) + 12)),
    ),
  );
  const choiceWidth = Math.max(
    0,
    (availableWidth - (columns - 1) * 12) / columns,
  );
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
        <Text accessibilityRole="header" style={styles.title}>
          Nouveau signalement
        </Text>
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel="Fermer les types de signalement"
          onPress={onClose}
          style={styles.close}
        >
          <AppIcon icon={X} size={21} color="#667185" />
        </AnimatedPressable>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={styles.grid}
          onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}
        >
          {reportTypes.map((type, index) => (
            <ReportTypeChoice
              key={type.id}
              type={type}
              index={index}
              width={choiceWidth}
              onSelect={onSelect}
            />
          ))}
        </View>
        <View style={styles.note}>
          <AppIcon icon={ShieldCheck} size={18} color="#7C8797" />
          <Text style={styles.noteText}>
            Ces signalements resteront anonymes pour le public.
          </Text>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  handleArea: { height: 28, alignItems: "center", justifyContent: "center" },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#D8DDE5" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 7,
    paddingBottom: 8,
  },
  title: {
    flex: 1,
    color: "#1C2637",
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "700",
    letterSpacing: -0.6,
  },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F5F6F8",
    alignItems: "center",
    justifyContent: "center",
  },
  content: { padding: 24, paddingTop: 8, gap: 20 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 12,
    rowGap: 20,
    paddingVertical: 8,
  },
  choice: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  circle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  choiceTitle: {
    color: "#273347",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    textAlign: "center",
    paddingHorizontal: 2,
  },
  note: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#F5F7FA",
  },
  noteText: { flex: 1, color: "#8A94A3", fontSize: 12, lineHeight: 18 },
});
