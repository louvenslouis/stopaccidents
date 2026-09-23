import { useAppTheme, createThemedStyles, useThemeColor } from '@/features/appearance/theme-provider';
import { useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import MapPin from "lucide-react-native/icons/map-pin";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import Check from "lucide-react-native/icons/check";
import X from "lucide-react-native/icons/x";
import Search from "lucide-react-native/icons/search";
import { AppIcon } from "@/components/ui/app-icon";
import { AnimatedPressable } from "@/components/ui/animated-pressable";
import {
  allTerritories,
  communes,
  departments,
  matchesTerritorySearch,
  territoryFilter,
  territoryLabel,
  type TerritoryFilter,
} from "@/features/reports/territories";
import { useStyles } from "./styles";

export function TerritoryFilters({
  value,
  onChange,
}: {
  value: TerritoryFilter;
  onChange: (value: TerritoryFilter) => void;
}) {
  const { scheme } = useAppTheme();
  const s = useLocalStyles();
  const styles = useStyles();
  const themeColor = useThemeColor();

  const [open, setOpen] = useState<"department" | "commune" | null>(null);
  const [query, setQuery] = useState("");
  const department = departments.find((item) => item.code === value.department);
  const commune = communes.find((item) => item.code === value.commune);
  const options =
    open === "department"
      ? [
          { code: "", name: "Tous les départements" },
          ...departments,
          { code: "unknown", name: "Territoire à préciser" },
        ]
      : [
          {
            code: "",
            name: "Toutes les communes",
            department_name: department?.name ?? "Tout Haïti",
          },
          ...communes.filter(
            (item) =>
              !value.department || item.department_code === value.department,
          ),
          {
            code: "unknown",
            name: "Commune à préciser",
            department_name: department?.name ?? "Tout Haïti",
          },
        ];
  const results = options.filter((item) =>
    matchesTerritorySearch(
      `${item.name} ${"department_name" in item ? item.department_name : ""}`,
      query,
    ),
  );
  return (
    <View style={s.container}>
      <View style={s.heading}>
        <View style={styles.inline}>
          <AppIcon icon={MapPin} size={14} color={themeColor("#7772B3", 'info')} />
          <Text style={s.eyebrow}>EXPLORER UN TERRITOIRE</Text>
        </View>
        {(value.department || value.commune) && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Réinitialiser les filtres territoriaux"
            onPress={() => onChange(allTerritories)}
            hitSlop={8}
          >
            <Text style={s.reset}>Tout Haïti</Text>
          </Pressable>
        )}
      </View>
      <View style={s.controls}>
        {(["department", "commune"] as const).map((kind) => {
          const disabled = kind === "commune" && value.department === "unknown";
          const label = kind === "department" ? "Département" : "Commune";
          const selected =
            kind === "department"
              ? (department?.name ??
                (value.department === "unknown"
                  ? "À préciser"
                  : "Tous les départements"))
              : (commune?.name ??
                (value.commune === "unknown"
                  ? "À préciser"
                  : "Toutes les communes"));
          return (
            <AnimatedPressable
              key={kind}
              accessibilityRole="button"
              accessibilityLabel={`${label} : ${selected}. Choisir`}
              accessibilityState={{ disabled, expanded: open === kind }}
              disabled={disabled}
              haptic="selection"
              onPress={() => {
                setQuery("");
                setOpen(kind);
              }}
              style={[s.control, disabled && { opacity: 0.4 }]}
            >
              <View style={styles.flex}>
                <Text style={s.label}>{label}</Text>
                <Text numberOfLines={1} style={s.value}>
                  {selected}
                </Text>
              </View>
              <AppIcon icon={ChevronDown} size={16} color={themeColor("#96909F", 'muted')} />
            </AnimatedPressable>
          );
        })}
      </View>
      <Text accessibilityLiveRegion="polite" style={s.context}>
        {territoryLabel(value)} · Tous les indicateurs suivent cette sélection
      </Text>
      {open && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setOpen(null)}
        >
          <KeyboardAvoidingView
            style={styles.modalBackdrop}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fermer le choix du territoire"
              style={styles.backdropDismiss}
              onPress={() => setOpen(null)}
            />
            <View accessibilityViewIsModal style={[styles.dateSheet, s.sheet]}>
              <View style={styles.cardTitleRow}>
                <Text style={styles.sheetTitle}>
                  {open === "department"
                    ? "Choisir un département"
                    : "Choisir une commune"}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Fermer"
                  onPress={() => setOpen(null)}
                  style={styles.iconButton}
                >
                  <AppIcon icon={X} size={20} color={themeColor("#66606E", 'secondary')} />
                </Pressable>
              </View>
              <Text style={styles.cardDescription}>
                {open === "commune"
                  ? (department?.name ?? "Toutes les communes du référentiel")
                  : "Affinez les rapports à l’échelle locale."}
              </Text>
              <View style={s.search}>
                <AppIcon icon={Search} size={18} color={themeColor("#9A94A2", 'muted')} />
                <TextInput keyboardAppearance={scheme}
                  accessibilityLabel={
                    open === "department"
                      ? "Rechercher un département"
                      : "Rechercher une commune"
                  }
                  placeholder="Rechercher…"
                  placeholderTextColor={themeColor("#9A94A2", 'muted')}
                  value={query}
                  onChangeText={setQuery}
                  autoCorrect={false}
                  style={s.searchInput}
                />
              </View>
              <FlatList
                data={results}
                keyExtractor={(item) => item.code}
                keyboardShouldPersistTaps="handled"
                style={s.list}
                ListEmptyComponent={
                  <Text style={styles.emptyText}>Aucun territoire trouvé.</Text>
                }
                renderItem={({ item }) => {
                  const selected = item.code === (value[open] ?? "");
                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => {
                        onChange(
                          open === "department"
                            ? territoryFilter(item.code || null)
                            : territoryFilter(
                                value.department,
                                item.code || null,
                              ),
                        );
                        setOpen(null);
                      }}
                      style={[s.option, selected && s.selected]}
                    >
                      <View style={styles.flex}>
                        <Text style={s.optionName}>{item.name}</Text>
                        {"department_name" in item && (
                          <Text style={s.optionDetail}>
                            {String(item.department_name)}
                          </Text>
                        )}
                      </View>
                      {selected && (
                        <AppIcon icon={Check} size={19} color={themeColor("#7772C3", 'info')} />
                      )}
                    </Pressable>
                  );
                }}
              />
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}
    </View>
  );
}

const useLocalStyles = createThemedStyles((themeColor) => StyleSheet.create({
  container: { marginBottom: 23, gap: 10 },
  heading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 28,
  },
  eyebrow: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.1,
    color: themeColor("#827C91", 'muted'),
  },
  reset: {
    fontSize: 11,
    color: themeColor("#7772B3", 'info'),
    fontWeight: "600",
    paddingVertical: 6,
  },
  controls: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  control: {
    flex: 1,
    minWidth: 140,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: themeColor("#FFFFFF", 'surface'),
    borderColor: themeColor("#E8E6EE", 'border'),
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  label: { fontSize: 10, color: themeColor("#96909F", 'muted'), marginBottom: 5 },
  value: { fontSize: 12, color: themeColor("#484251", 'secondary'), fontWeight: "600" },
  context: { fontSize: 10, lineHeight: 16, color: themeColor("#8D8797", 'muted') },
  sheet: { maxHeight: "85%", paddingBottom: 16 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: themeColor("#F6F5F9", 'elevated'),
    borderRadius: 12,
    paddingHorizontal: 12,
    marginVertical: 16,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 14,
    fontSize: 14,
    color: themeColor("#484251", 'secondary'),
  },
  list: { flexGrow: 0 },
  option: {
    minHeight: 50,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    marginBottom: 3,
  },
  selected: { backgroundColor: themeColor("#F0EFFA", 'infoSoft') },
  optionName: { fontSize: 13, color: themeColor("#494352", 'secondary'), fontWeight: "500" },
  optionDetail: { fontSize: 11, color: themeColor("#958D9E", 'muted'), marginTop: 4 },
}));
