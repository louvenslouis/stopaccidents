import { Pressable, Text, View } from '@/features/language/native';
import { createThemedStyles, useThemeColor } from '@/features/appearance/theme-provider';
import { StyleSheet } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";
import {
  dateLabel,
  numberLabel,
  type Analytics,
  type ChartBucket,
} from "@/features/reports/model";

export function TimelineChart({
  buckets,
  selected,
  onSelect,
  color,
}: {
  buckets: ChartBucket[];
  selected: string | null;
  onSelect: (key: string | null) => void;
  color: string;
}) {
  const styles = useStyles();
  const themeColor = useThemeColor();

  const max = Math.max(1, ...buckets.map((b) => b.count));
  const ceiling = max <= 4 ? 4 : Math.ceil(max / 4) * 4;
  return (
    <View>
      <View style={styles.plot}>
        <View pointerEvents="none" style={styles.grid}>
          {[ceiling, ceiling / 2, 0].map((value) => (
            <View key={value} style={styles.gridRow}>
              <View style={styles.gridLine} />
              <Text style={styles.axis}>{numberLabel(value)}</Text>
            </View>
          ))}
        </View>
        <View style={styles.bars}>
          {buckets.map((bucket) => (
            <Pressable
              key={bucket.key}
              accessibilityRole="button"
              accessibilityLabel={`${bucket.label} : ${numberLabel(bucket.count)} événements`}
              accessibilityState={{ selected: selected === bucket.key }}
              onPress={() =>
                onSelect(selected === bucket.key ? null : bucket.key)
              }
              style={[
                styles.barHit,
                selected === bucket.key && styles.selectedColumn,
              ]}
            >
              <View
                style={[
                  styles.bar,
                  {
                    height: bucket.count
                      ? Math.max(4, (bucket.count / ceiling) * 156)
                      : 2,
                    backgroundColor: bucket.count ? color : themeColor("#E5E5EB", 'elevated'),
                    opacity: selected && selected !== bucket.key ? 0.28 : 1,
                  },
                ]}
              />
            </Pressable>
          ))}
        </View>
      </View>
      <View style={styles.xAxis}>
        {[
          buckets[0],
          buckets[Math.floor((buckets.length - 1) / 2)],
          buckets[buckets.length - 1],
        ].map((bucket, index) => (
          <Text key={index} style={styles.axis}>
            {bucket ? dateLabel(bucket.start) : ""}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function HourChart({
  hours,
  selected,
  onSelect,
}: {
  hours: Analytics["hours"];
  selected: number | null;
  onSelect: (hour: number) => void;
}) {
  const styles = useStyles();
  const themeColor = useThemeColor();

  const max = Math.max(1, ...hours.map((item) => item.count));
  return (
    <View>
      <View style={styles.hours}>
        {Array.from({ length: 24 }, (_, hour) => {
          const count = hours.find((item) => item.hour === hour)?.count ?? 0;
          return (
            <Pressable
              key={hour}
              onPress={() => onSelect(hour)}
              accessibilityRole="button"
              accessibilityState={{ selected: hour === selected }}
              accessibilityLabel={`${hour} heures : ${count} événements`}
              style={[styles.hourHit, selected === hour && styles.hourSelected]}
            >
              <View
                style={[
                  styles.hourCell,
                  {
                    backgroundColor: count ? themeColor("#7874E8", 'infoSoft') : themeColor("#EFEEF8", 'infoSoft'),
                    opacity: count ? 0.25 + (0.75 * count) / max : 1,
                  },
                ]}
              />
            </Pressable>
          );
        })}
      </View>
      <View style={styles.xAxis}>
        {["00 h", "06 h", "12 h", "18 h", "23 h"].map((label) => (
          <Text key={label} style={styles.axis}>
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** Small code-native illustration: a road, a location pin and a protective halo. */
export function CommunityIllustration() {
  return (
    <Svg width={104} height={100} viewBox="0 0 104 100" aria-hidden>
      <Defs>
        <LinearGradient id="report-pin" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FF897B" />
          <Stop offset="1" stopColor="#F04F66" />
        </LinearGradient>
      </Defs>
      <Circle cx={56} cy={46} r={39} fill="#FDE7E1" />
      <Path
        d="M4 88C17 49 43 91 56 63S80 52 100 21"
        fill="none"
        stroke="#E4CABF"
        strokeWidth={18}
        strokeLinecap="round"
      />
      <Path
        d="M4 88C17 49 43 91 56 63S80 52 100 21"
        fill="none"
        stroke="#FFFAF7"
        strokeWidth={2}
        strokeDasharray="4 6"
      />
      <G transform="translate(29 9)">
        <Path
          d="M25 1C11 1 2 11 2 24C2 40 25 58 25 58S48 40 48 24C48 11 39 1 25 1Z"
          fill="url(#report-pin)"
        />
        <Circle cx={25} cy={24} r={12} fill="white" />
        <Path
          d="M19 24L23 28L31 20"
          fill="none"
          stroke="#F15E6B"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </G>
      <Circle cx={15} cy={31} r={4} fill="#F7B854" />
      <Circle cx={84} cy={79} r={5} fill="#B5AFEB" />
      <Rect
        x={88}
        y={8}
        width={7}
        height={7}
        rx={2}
        fill="#E6A493"
        transform="rotate(20 91 11)"
      />
    </Svg>
  );
}

const useStyles = createThemedStyles((themeColor) => StyleSheet.create({
  plot: { height: 176, marginTop: 26 },
  grid: { ...StyleSheet.absoluteFill, justifyContent: "space-between" },
  gridRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  gridLine: { height: 1, backgroundColor: themeColor("#EEEFF3", 'elevated'), flex: 1 },
  axis: { color: themeColor("#92929D", 'muted'), fontSize: 10, fontWeight: "500", minWidth: 12 },
  bars: {
    position: "absolute",
    top: 5,
    bottom: 5,
    left: 0,
    right: 28,
    flexDirection: "row",
    gap: 3,
    alignItems: "flex-end",
  },
  barHit: {
    flex: 1,
    height: "100%",
    justifyContent: "flex-end",
    paddingHorizontal: 1,
    borderRadius: 5,
  },
  bar: { width: "100%", maxWidth: 32, borderRadius: 5, alignSelf: "center" },
  selectedColumn: { backgroundColor: themeColor("#F3F3F7", 'elevated') },
  xAxis: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 9,
    paddingRight: 24,
  },
  hours: { flexDirection: "row", gap: 2, marginTop: 20 },
  hourHit: {
    flex: 1,
    height: 48,
    paddingVertical: 4,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "transparent",
  },
  hourCell: { flex: 1, borderRadius: 4 },
  hourSelected: { borderColor: themeColor("#7772E8", 'border') },
}));
