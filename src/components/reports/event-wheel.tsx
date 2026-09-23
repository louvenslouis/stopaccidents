import { useEffect, useId, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  Stop,
} from "react-native-svg";
import Animated, {
  ReduceMotion,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Car from "lucide-react-native/icons/car";
import Construction from "lucide-react-native/icons/construction";
import Wrench from "lucide-react-native/icons/wrench";
import LockKeyhole from "lucide-react-native/icons/lock-keyhole";
import ShieldAlert from "lucide-react-native/icons/shield-alert";
import CarFront from "lucide-react-native/icons/car-front";
import AudioLines from "lucide-react-native/icons/audio-lines";
import ArrowUpRight from "lucide-react-native/icons/arrow-up-right";
import MousePointer2 from "lucide-react-native/icons/mouse-pointer-2";
import { AppIcon, type AppIconComponent } from "@/components/ui/app-icon";
import { AnimatedPressable } from "@/components/ui/animated-pressable";
import { numberLabel, type Analytics } from "@/features/reports/model";
import type { SafetyReportSummary } from "@/features/safety-report/read";

type Kind = SafetyReportSummary["report_kind"];
const sectorPresentation: Record<
  Kind,
  { label: string; icon: AppIconComponent; color: string; light: string }
> = {
  accident: {
    label: "Accidents",
    icon: Car,
    color: "#EF586B",
    light: "#FF8C86",
  },
  kidnapping: {
    label: "Enlèvements",
    icon: LockKeyhole,
    color: "#D92F6A",
    light: "#F35E91",
  },
  armed_presence: {
    label: "Présence armée",
    icon: ShieldAlert,
    color: "#944CE0",
    light: "#BB78F1",
  },
  gunfire: {
    label: "Tirs entendus",
    icon: AudioLines,
    color: "#ED712C",
    light: "#FFA553",
  },
  suspicious_vehicle: {
    label: "Véhicules suspects",
    icon: CarFront,
    color: "#4365D9",
    light: "#7694EE",
  },
  breakdown: {
    label: "Véhicules en panne",
    icon: Wrench,
    color: "#209FA9",
    light: "#60C8C9",
  },
  barricade: {
    label: "Routes barricadées",
    icon: Construction,
    color: "#C39021",
    light: "#F5CC66",
  },
};
const sectors = (Object.keys(sectorPresentation) as Kind[]).map((kind) => ({
  kind,
  ...sectorPresentation[kind],
}));
const SIZE = 360;
const CENTER = SIZE / 2;
const STEP = 360 / sectors.length;
const AnimatedPath = Animated.createAnimatedComponent(Path);

function polar(radius: number, angle: number, x = CENTER, y = CENTER) {
  "worklet";
  const radians = (angle * Math.PI) / 180;
  return `${x + Math.cos(radians) * radius},${y + Math.sin(radians) * radius}`;
}

// Equal, rounded petals make a selector, not a proportional pie chart.
// The actual share is explicitly displayed when a type is selected.
function petalPath(index: number, lift = 0) {
  "worklet";
  const angle = -90 + index * STEP;
  const radians = (angle * Math.PI) / 180;
  const x = CENTER + Math.cos(radians) * lift;
  const y = CENTER + Math.sin(radians) * lift;
  const a = angle - STEP / 2 + 2;
  const b = angle + STEP / 2 - 2;
  const outer = 153;
  const inner = 51;
  const corner = 15;
  const outerCurve = 6;
  const innerCurve = 13;
  return `M ${polar(inner + corner, a, x, y)}
    L ${polar(outer - corner, a, x, y)}
    Q ${polar(outer, a, x, y)} ${polar(outer, a + outerCurve, x, y)}
    A ${outer} ${outer} 0 0 1 ${polar(outer, b - outerCurve, x, y)}
    Q ${polar(outer, b, x, y)} ${polar(outer - corner, b, x, y)}
    L ${polar(inner + corner, b, x, y)}
    Q ${polar(inner, b, x, y)} ${polar(inner, b - innerCurve, x, y)}
    A ${inner} ${inner} 0 0 0 ${polar(inner, a + innerCurve, x, y)}
    Q ${polar(inner, a, x, y)} ${polar(inner + corner, a, x, y)} Z`;
}

function Petal({
  index,
  selected,
  hovered,
  count,
  gradientId,
  onSelect,
}: {
  index: number;
  selected: boolean;
  hovered: boolean;
  count: number;
  gradientId: string;
  onSelect: () => void;
}) {
  const lift = useSharedValue(0);
  useEffect(() => {
    lift.value = withTiming(selected ? 9 : hovered ? 4 : 0, {
      duration: 220,
      reduceMotion: ReduceMotion.System,
    });
  }, [selected, hovered, lift]);
  const faceProps = useAnimatedProps(() => ({
    d: petalPath(index, lift.value),
  }));
  const sector = sectors[index];
  // SVG 15.15 needs explicit null on web to preserve onClick without adding
  // native responder handlers to the DOM; its typings omit this supported value.
  const pressEvents: Record<string, unknown> =
    Platform.OS === "web"
      ? { onPress: null, onClick: onSelect }
      : { onPress: onSelect };
  return (
    <>
      <AnimatedPath
        animatedProps={faceProps}
        fill={sector.color}
        opacity={count ? (selected ? 0.19 : 0.09) : 0.03}
        transform="translate(0 7)"
        pointerEvents="none"
      />
      <AnimatedPath
        animatedProps={faceProps}
        {...pressEvents}
        fill={count ? `url(#${gradientId})` : "#FCFDFE"}
        stroke={count ? "#FFFFFF" : sector.color}
        strokeOpacity={count ? 0.55 : 0.35}
        strokeWidth={selected ? 2.5 : 1.5}
      />
    </>
  );
}

function SectorButton({
  index,
  selected,
  hovered,
  count,
  size,
  onSelect,
  onHover,
}: {
  index: number;
  selected: boolean;
  hovered: boolean;
  count: number;
  size: number;
  onSelect: () => void;
  onHover: (hovering: boolean) => void;
}) {
  const sector = sectors[index];
  const angle = ((-90 + index * STEP) * Math.PI) / 180;
  const lift = useSharedValue(0);
  useEffect(() => {
    lift.value = withTiming(selected ? 9 : hovered ? 4 : 0, {
      duration: 220,
      reduceMotion: ReduceMotion.System,
    });
  }, [selected, hovered, lift]);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: (Math.cos(angle) * lift.value * size) / SIZE },
      { translateY: (Math.sin(angle) * lift.value * size) / SIZE },
    ],
  }));
  const x = ((CENTER + Math.cos(angle) * 111) / SIZE) * size;
  const y = ((CENTER + Math.sin(angle) * 111) / SIZE) * size;
  return (
    <Animated.View
      style={[
        styles.sectorButtonPosition,
        { left: x - 26, top: y - 26 },
        animatedStyle,
      ]}
    >
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={`${sector.label} : ${numberLabel(count)} événement${count !== 1 ? "s" : ""}. Explorer ce secteur`}
        accessibilityState={{ selected }}
        haptic="selection"
        onPress={onSelect}
        onHoverIn={() => onHover(true)}
        onHoverOut={() => onHover(false)}
        style={styles.sectorButton}
      >
        <AppIcon
          icon={sector.icon}
          size={size < 270 ? 20 : 25}
          color={count ? "#FFFFFF" : sector.color}
          strokeWidth={2.2}
        />
      </AnimatedPressable>
    </Animated.View>
  );
}

export function EventWheel({
  data,
  onExplore,
}: {
  data: Analytics;
  onExplore: (kind: Kind) => void;
}) {
  const [selectedKind, setSelectedKind] = useState<Kind | null>(null);
  const [hoveredKind, setHoveredKind] = useState<Kind | null>(null);
  const [size, setSize] = useState(SIZE);
  const gradientPrefix = useId().replace(/[^a-zA-Z0-9]/g, "");
  const selected = sectors.find((item) => item.kind === selectedKind);
  const count = selected
    ? (data.kinds.find((item) => item.kind === selected.kind)?.count ?? 0)
    : data.total;
  const percentage = data.total ? Math.round((count / data.total) * 100) : 0;
  const select = (kind: Kind) =>
    setSelectedKind((previous) => (previous === kind ? null : kind));
  return (
    <View style={styles.container}>
      <View
        style={styles.wheel}
        onLayout={(event) => setSize(event.nativeEvent.layout.width)}
      >
        <Svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          aria-hidden
        >
          <Defs>
            {sectors.map((sector) => (
              <LinearGradient
                key={sector.kind}
                id={`${gradientPrefix}-${sector.kind}`}
                x1="0"
                y1="0"
                x2="0.8"
                y2="1"
              >
                <Stop offset="0" stopColor={sector.light} />
                <Stop offset="1" stopColor={sector.color} />
              </LinearGradient>
            ))}
          </Defs>
          <Circle cx={CENTER} cy={CENTER + 3} r={43} fill="#F7F7FA" />
          {sectors.map((sector, index) => (
            <Petal
              key={sector.kind}
              index={index}
              selected={selectedKind === sector.kind}
              hovered={hoveredKind === sector.kind}
              count={
                data.kinds.find((item) => item.kind === sector.kind)?.count ?? 0
              }
              gradientId={`${gradientPrefix}-${sector.kind}`}
              onSelect={() => select(sector.kind)}
            />
          ))}
        </Svg>
        {sectors.map((sector, index) => (
          <SectorButton
            key={sector.kind}
            index={index}
            size={size}
            selected={selectedKind === sector.kind}
            hovered={hoveredKind === sector.kind}
            count={
              data.kinds.find((item) => item.kind === sector.kind)?.count ?? 0
            }
            onSelect={() => select(sector.kind)}
            onHover={(hovering) =>
              setHoveredKind(hovering ? sector.kind : null)
            }
          />
        ))}
        <View pointerEvents="box-none" style={styles.centerPosition}>
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel={
              selected
                ? "Effacer la sélection du cercle"
                : `${data.total} événements au total`
            }
            disabled={!selected}
            onPress={() => setSelectedKind(null)}
            haptic="selection"
            style={[styles.center, { width: size * 0.25, height: size * 0.25 }]}
          >
            <Text
              style={[
                styles.centerNumber,
                {
                  color: selected?.color ?? "#35323E",
                  fontSize: size < 270 ? 22 : 28,
                },
              ]}
            >
              {numberLabel(count)}
            </Text>
            <Text style={styles.centerLabel}>
              {selected ? `${percentage} %` : "au total"}
            </Text>
          </AnimatedPressable>
        </View>
      </View>
      <View
        style={[
          styles.selection,
          selected && {
            backgroundColor: `${selected.color}0C`,
            borderColor: `${selected.color}20`,
          },
        ]}
        accessibilityLiveRegion="polite"
      >
        <View style={styles.selectionCopy}>
          <View style={styles.selectionTitleRow}>
            <AppIcon
              icon={selected?.icon ?? MousePointer2}
              size={16}
              color={selected?.color ?? "#91899E"}
            />
            <Text
              style={[
                styles.selectionTitle,
                selected && { color: selected.color },
              ]}
            >
              {selected?.label ?? `${sectors.length} types d’alerte`}
            </Text>
          </View>
          <Text style={styles.selectionDescription}>
            {selected
              ? `${numberLabel(count)} événement${count !== 1 ? "s" : ""} · ${percentage} % de la sélection`
              : "Touchez un secteur pour découvrir ses données."}
          </Text>
        </View>
        {selected && count > 0 && (
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel={`Voir les événements : ${selected.label}`}
            onPress={() => onExplore(selected.kind)}
            haptic="selection"
            style={[styles.explore, { backgroundColor: `${selected.color}16` }]}
          >
            <AppIcon icon={ArrowUpRight} color={selected.color} size={20} />
          </AnimatedPressable>
        )}
      </View>
      <Text style={styles.note}>
        Un secteur par type · Les secteurs vides restent en contour.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 5 },
  wheel: {
    width: "100%",
    maxWidth: SIZE,
    aspectRatio: 1,
    alignSelf: "center",
    marginVertical: 4,
  },
  sectorButtonPosition: { position: "absolute", width: 52, height: 52 },
  sectorButton: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 26,
  },
  centerPosition: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  center: { alignItems: "center", justifyContent: "center", borderRadius: 45 },
  centerNumber: {
    fontWeight: "700",
    letterSpacing: -0.9,
    fontVariant: ["tabular-nums"],
  },
  centerLabel: { fontSize: 9, color: "#958C9E", marginTop: 1 },
  selection: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 13,
    borderRadius: 16,
    backgroundColor: "#F8F7FA",
    borderWidth: 1,
    borderColor: "#F2EFF5",
  },
  selectionCopy: { flex: 1, gap: 6 },
  selectionTitleRow: { flexDirection: "row", gap: 7, alignItems: "center" },
  selectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#7E748C",
    flexShrink: 1,
  },
  selectionDescription: { fontSize: 10, lineHeight: 16, color: "#93899F" },
  explore: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  note: {
    fontSize: 9,
    lineHeight: 15,
    color: "#A49AAC",
    textAlign: "center",
    marginTop: 11,
  },
});
