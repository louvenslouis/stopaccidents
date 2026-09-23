import { createThemedStyles, useThemeColor } from '@/features/appearance/theme-provider';
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import MapPin from "lucide-react-native/icons/map-pin";
import Map from "lucide-react-native/icons/map";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import { AppIcon } from "@/components/ui/app-icon";
import { numberLabel, type Analytics } from "@/features/reports/model";
import { type TerritoryFilter } from "@/features/reports/territories";
import { useStyles } from "./styles";

export function TerritoryCards({
  data,
  wide,
  territory,
  onSelect,
}: {
  data: Analytics;
  wide: boolean;
  territory: TerritoryFilter;
  onSelect: (value: TerritoryFilter) => void;
}) {
  const s = useLocalStyles();
  const styles = useStyles();
  const themeColor = useThemeColor();

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Les territoires en perspective</Text>
        <Text style={styles.sectionSubtitle}>
          Où les événements sont-ils signalés ?
        </Text>
      </View>
      <View style={[styles.gridRow, wide && styles.gridRowWide]}>
        <Distribution
          level="department"
          data={data}
          wide={wide}
          onSelect={onSelect}
        />
        <Distribution
          level="commune"
          data={data}
          wide={wide}
          onSelect={onSelect}
        />
      </View>
      {data.territories.unlocated > 0 && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Voir les ${data.territories.unlocated} événements dont la commune est à préciser`}
          onPress={() =>
            onSelect(
              territory.department === "unknown"
                ? territory
                : { department: territory.department, commune: "unknown" },
            )
          }
          style={s.unlocated}
        >
          <AppIcon icon={MapPin} size={16} color={themeColor("#928698", 'muted')} />
          <View style={styles.flex}>
            <Text style={s.unlocatedTitle}>
              {numberLabel(data.territories.unlocated)} événement
              {data.territories.unlocated > 1 ? "s" : ""} · Commune à préciser
            </Text>
            <Text style={styles.smallMuted}>
              Inclus dans le total, sans commune identifiable.
            </Text>
          </View>
          <AppIcon icon={ChevronRight} size={17} color={themeColor("#ABA1B1", 'muted')} />
        </Pressable>
      )}
      <Text style={s.note}>
        Parts des événements de la sélection, selon les positions signalées.
        Limites communales : CNIGS, référentiel 2018.
      </Text>
    </View>
  );
}

function Distribution({
  level,
  data,
  wide,
  onSelect,
}: {
  level: "department" | "commune";
  data: Analytics;
  wide: boolean;
  onSelect: (value: TerritoryFilter) => void;
}) {
  const s = useLocalStyles();
  const styles = useStyles();
  const themeColor = useThemeColor();

  const [expanded, setExpanded] = useState(false);
  const isCommune = level === "commune";
  const rows = isCommune
    ? data.territories.communes
    : data.territories.departments;
  const color = isCommune ? "#3E94A5" : "#8273C8";
  return (
    <View style={[styles.card, wide && styles.flex]}>
      <View style={styles.cardTitleRow}>
        <View style={styles.inline}>
          <AppIcon icon={isCommune ? MapPin : Map} size={18} color={color} />
          <Text style={[styles.cardTitle, { color }]}>
            {isCommune ? "Par commune" : "Par département"}
          </Text>
        </View>
        <Text style={[s.count, { color }]}>{rows.length}</Text>
      </View>
      <Text style={styles.cardDescription}>
        {isCommune
          ? "La lecture au plus près du terrain."
          : "Une vue d’ensemble du territoire."}
      </Text>
      <View style={s.rows}>
        {(expanded ? rows : rows.slice(0, 5)).map((item, index) => {
          const pct = data.total ? (item.count / data.total) * 100 : 0;
          const percent = pct > 0 && pct < 1 ? "< 1" : String(Math.round(pct));
          const parent =
            "department_name" in item ? String(item.department_name) : null;
          return (
            <Pressable
              key={item.code}
              accessibilityRole="button"
              accessibilityLabel={`${item.name}${parent ? `, ${parent}` : ""} : ${numberLabel(item.count)} événements, ${percent} %. Filtrer les rapports`}
              onPress={() =>
                onSelect({
                  department:
                    "department_code" in item
                      ? String(item.department_code)
                      : item.code,
                  commune: isCommune ? item.code : null,
                })
              }
              style={({ pressed }) => [s.row, pressed && { opacity: 0.65 }]}
            >
              <Text style={s.rank}>{String(index + 1).padStart(2, "0")}</Text>
              <View style={styles.flex}>
                <View style={s.labels}>
                  <Text style={s.name}>{item.name}</Text>
                  <Text style={s.value}>
                    {numberLabel(item.count)}
                    <Text style={s.percent}> · {percent} %</Text>
                  </Text>
                </View>
                {parent && <Text style={s.parent}>{parent}</Text>}
                <View style={s.track}>
                  <View
                    style={[
                      s.fill,
                      { backgroundColor: color, width: `${pct}%` },
                    ]}
                  />
                </View>
              </View>
              <AppIcon icon={ChevronRight} size={14} color={themeColor("#B6AEBD", 'muted')} />
            </Pressable>
          );
        })}
        {!rows.length && (
          <Text style={styles.emptyChartText}>
            Aucun événement rattaché à{" "}
            {isCommune ? "une commune" : "un département"} pour cette sélection.
          </Text>
        )}
      </View>
      {!isCommune && data.territories.unlocated_departments > 0 && (
        <Pressable
          accessibilityRole="button"
          onPress={() => onSelect({ department: "unknown", commune: null })}
          style={s.more}
        >
          <Text style={styles.smallMuted}>
            Département à préciser ·{" "}
            {numberLabel(data.territories.unlocated_departments)} événement
            {data.territories.unlocated_departments > 1 ? "s" : ""}
          </Text>
        </Pressable>
      )}
      {rows.length > 5 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          onPress={() => setExpanded((value) => !value)}
          style={s.more}
        >
          <Text style={[s.moreText, { color }]}>
            {expanded
              ? "Réduire la liste"
              : `Voir les ${rows.length} ${isCommune ? "communes" : "départements"}`}
          </Text>
        </Pressable>
      ) : (
        rows.length > 0 && (
          <Text style={styles.cardFootnote}>
            Touchez un territoire pour affiner les rapports.
          </Text>
        )
      )}
    </View>
  );
}

const useLocalStyles = createThemedStyles((themeColor) => StyleSheet.create({
  count: {
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: themeColor("#F7F6FA", 'surface'),
  },
  rows: { gap: 6, marginTop: 18 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    minHeight: 53,
  },
  rank: {
    color: themeColor("#BBB3C6", 'muted'),
    fontSize: 10,
    fontWeight: "600",
    width: 17,
    fontVariant: ["tabular-nums"],
  },
  labels: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  name: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: themeColor("#51485E", 'secondary'),
    lineHeight: 17,
  },
  value: {
    fontSize: 12,
    fontWeight: "700",
    color: themeColor("#655D72", 'secondary'),
    fontVariant: ["tabular-nums"],
  },
  percent: { fontSize: 10, color: themeColor("#A69CAE", 'muted'), fontWeight: "400" },
  parent: { fontSize: 9, color: themeColor("#A299AE", 'muted'), marginTop: 2 },
  track: {
    height: 5,
    backgroundColor: themeColor("#F2F0F6", 'elevated'),
    borderRadius: 3,
    overflow: "hidden",
    marginTop: 9,
  },
  fill: { height: 5, borderRadius: 3 },
  more: {
    paddingTop: 15,
    paddingBottom: 5,
    borderTopWidth: 1,
    borderColor: themeColor("#F2F0F6", 'border'),
    marginTop: 14,
  },
  moreText: { fontSize: 11, fontWeight: "600" },
  unlocated: {
    backgroundColor: themeColor("#F1EFF5", 'elevated'),
    borderRadius: 13,
    padding: 13,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  unlocatedTitle: {
    fontSize: 11,
    color: themeColor("#7D7287", 'muted'),
    fontWeight: "600",
    lineHeight: 17,
  },
  note: { fontSize: 9, lineHeight: 15, color: themeColor("#A29AA9", 'muted'), paddingHorizontal: 3 },
}));
