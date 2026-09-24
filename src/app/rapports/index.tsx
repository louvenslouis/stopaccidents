import { Pressable, ScrollView, Text, TextInput, View } from '@/features/language/native';
import { useAppTheme, useThemeColor } from '@/features/appearance/theme-provider';
import { useState } from "react";
import { useRouter } from "expo-router";
import { Modal, KeyboardAvoidingView, Platform, useWindowDimensions } from 'react-native';
import CalendarDays from "lucide-react-native/icons/calendar-days";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import X from "lucide-react-native/icons/x";
import { AppScreen } from "@/components/app-screen";
import { AnimatedPressable } from "@/components/ui/animated-pressable";
import { AppIcon } from "@/components/ui/app-icon";
import {
  ReportDashboard,
  IconButton,
  categoryIcons,
} from "@/components/reports/dashboard";
import { useStyles } from "@/components/reports/styles";
import { TerritoryFilters } from "@/components/reports/territory-filters";
import {
  allTerritories,
  type TerritoryFilter,
} from "@/features/reports/territories";
import {
  categories,
  categoryForKind,
  haitiToday,
  periodRange,
  rangeLabel,
  subcategories,
  validateRange,
  type Category,
  type DateRange,
  type Period,
} from "@/features/reports/model";
import type { SafetyReportSummary } from "@/features/safety-report/read";

const periods = [
  { id: "week", label: "7 jours" },
  { id: "month", label: "30 jours" },
  { id: "year", label: "1 an" },
  { id: "all", label: "Tout" },
] as const;

export default function ReportsScreen() {
  const styles = useStyles();
  const themeColor = useThemeColor();

  const router = useRouter();
  const [period, setPeriod] = useState<Period>("month");
  const [offset, setOffset] = useState(0);
  const [category, setCategory] = useState<Category>("all");
  const [subcategory, setSubcategory] = useState("all");
  const [territory, setTerritory] = useState<TerritoryFilter>(allTerritories);
  const [custom, setCustom] = useState<DateRange>(periodRange("month"));
  const [dateOpen, setDateOpen] = useState(false);
  const [reload, setReload] = useState(0);
  const range = period === "custom" ? custom : periodRange(period, offset);
  const { width } = useWindowDimensions();
  const wide = width >= 850;
  function chooseCategory(value: Category) {
    setCategory(value);
    setSubcategory("all");
  }
  function openEvents(kind?: SafetyReportSummary["report_kind"]) {
    router.push({
      pathname: "/rapports/evenements",
      params: {
        start: range.start ?? "",
        end: range.end,
        category: kind ? categoryForKind(kind) : category,
        subcategory: kind ? (kind === "accident" ? "all" : kind) : subcategory,
        department: territory.department ?? "",
        commune: territory.commune ?? "",
      },
    });
  }
  return (
    <>
      <AppScreen
        title="Rapports"
        hideIntro
        contentContainerStyle={[styles.page, width < 440 && styles.pageSmall]}
      >
        <View style={styles.header}>
          <View style={styles.heading}>
            <View style={styles.inline}>
              <View style={styles.coralDot} />
              <Text style={styles.eyebrow}>L’OBSERVATOIRE</Text>
            </View>
            <Text style={styles.title}>Rapports</Text>
            <Text style={styles.subtitle}>
              Mieux comprendre. Mieux prévenir.
            </Text>
          </View>
          <IconButton
            icon={RefreshCw}
            label="Actualiser les rapports"
            onPress={() => setReload((value) => value + 1)}
          />
        </View>
        <View style={[styles.filterPanel, wide && styles.filterPanelWide]}>
          <View style={styles.periods}>
            {periods.map((item) => (
              <AnimatedPressable
                key={item.id}
                accessibilityRole="button"
                accessibilityState={{ selected: period === item.id }}
                haptic="selection"
                onPress={() => {
                  setPeriod(item.id);
                  setOffset(0);
                }}
                style={[
                  styles.period,
                  period === item.id && styles.periodActive,
                ]}
              >
                <Text
                  style={[
                    styles.periodText,
                    period === item.id && styles.periodTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </AnimatedPressable>
            ))}
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityLabel="Choisir des dates personnalisées"
              accessibilityState={{ selected: period === "custom" }}
              onPress={() => setDateOpen(true)}
              style={[
                styles.customPeriod,
                period === "custom" && styles.periodActive,
              ]}
            >
              <AppIcon
                icon={CalendarDays}
                size={17}
                color={period === "custom" ? themeColor("#25252D", 'text') : themeColor("#8A8A96", 'muted')}
              />
            </AnimatedPressable>
          </View>
          <View style={styles.dateNav}>
            {period !== "all" && period !== "custom" && (
              <IconButton
                icon={ChevronLeft}
                label="Période précédente"
                onPress={() => setOffset((value) => value - 1)}
              />
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Période : ${rangeLabel(range)}. Modifier les dates`}
              onPress={() => setDateOpen(true)}
              style={styles.dateLabelButton}
            >
              <Text style={styles.dateLabel}>{rangeLabel(range)}</Text>
            </Pressable>
            {period !== "all" && period !== "custom" && (
              <IconButton
                icon={ChevronRight}
                label="Période suivante"
                disabled={offset >= 0}
                onPress={() => setOffset((value) => Math.min(0, value + 1))}
              />
            )}
          </View>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryFilters}
        >
          {categories.map((item) => (
            <AnimatedPressable
              key={item.id}
              accessibilityRole="button"
              accessibilityState={{ selected: category === item.id }}
              haptic="selection"
              onPress={() => chooseCategory(item.id)}
              style={[
                styles.categoryPill,
                category === item.id && {
                  backgroundColor: item.id === "all" ? "#28282F" : item.tint,
                  borderColor:
                    item.id === "all" ? "#28282F" : item.color + "45",
                },
              ]}
            >
              <AppIcon
                icon={categoryIcons[item.id]}
                size={17}
                color={
                  category === item.id
                    ? item.id === "all"
                      ? "#FFFFFF"
                      : item.color
                    : themeColor("#858590", 'muted')
                }
              />
              <Text
                style={[
                  styles.categoryPillText,
                  category === item.id && {
                    color: item.id === "all" ? "#FFFFFF" : item.color,
                  },
                ]}
              >
                {item.label}
              </Text>
            </AnimatedPressable>
          ))}
        </ScrollView>
        {category !== "all" && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.subcategoryFilters}
          >
            {[
              { id: "all", label: "Toutes les sous-catégories" },
              ...subcategories(category),
            ].map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityState={{ selected: subcategory === item.id }}
                onPress={() => setSubcategory(item.id)}
                style={[
                  styles.subcategory,
                  subcategory === item.id && styles.subcategoryActive,
                ]}
              >
                <Text
                  style={[
                    styles.subcategoryText,
                    subcategory === item.id && styles.subcategoryTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
        <TerritoryFilters value={territory} onChange={setTerritory} />
        <ReportDashboard
          key={`${range.start}:${range.end}:${category}:${subcategory}:${territory.department}:${territory.commune}:${reload}`}
          range={range}
          category={category}
          subcategory={subcategory}
          territory={territory}
          onTerritory={setTerritory}
          wide={wide}
          onKind={openEvents}
          onViewEvents={() => openEvents()}
          onReset={() => {
            chooseCategory("all");
            setPeriod("all");
            setOffset(0);
            setTerritory(allTerritories);
          }}
        />
      </AppScreen>
      {dateOpen && (
        <DateSheet
          range={range}
          onClose={() => setDateOpen(false)}
          onApply={(value) => {
            setCustom(value);
            setPeriod("custom");
            setDateOpen(false);
          }}
        />
      )}
    </>
  );
}

function DateSheet({
  range,
  onClose,
  onApply,
}: {
  range: DateRange;
  onClose: () => void;
  onApply: (range: DateRange) => void;
}) {
  const { scheme } = useAppTheme();
  const styles = useStyles();

  const [start, setStart] = useState(
    range.start ?? periodRange("month").start!,
  );
  const [end, setEnd] = useState(range.end);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalBackdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fermer le choix des dates"
          onPress={onClose}
          style={styles.backdropDismiss}
        />
        <View accessibilityViewIsModal style={styles.dateSheet}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.sheetTitle}>Votre période</Text>
            <IconButton icon={X} label="Fermer" onPress={onClose} />
          </View>
          <Text style={styles.cardDescription}>
            Explorez les données entre deux dates.
          </Text>
          <Text style={styles.inputLabel}>Du</Text>
          <TextInput keyboardAppearance={scheme}
            autoFocus
            accessibilityLabel="Date de début, format AAAA-MM-JJ"
            placeholder="AAAA-MM-JJ"
            value={start}
            onChangeText={setStart}
            autoCorrect={false}
            maxLength={10}
            style={styles.input}
          />
          <Text style={styles.inputLabel}>Au</Text>
          <TextInput keyboardAppearance={scheme}
            accessibilityLabel="Date de fin, format AAAA-MM-JJ"
            placeholder="AAAA-MM-JJ"
            value={end}
            onChangeText={setEnd}
            autoCorrect={false}
            maxLength={10}
            style={styles.input}
          />
          <Text style={styles.smallMuted}>
            Format : année-mois-jour · Aujourd’hui : {haitiToday()}
          </Text>
          {error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          )}
          <AnimatedPressable
            accessibilityRole="button"
            onPress={() => {
              const validation = validateRange(start, end);
              setError(validation);
              if (!validation) onApply({ start, end });
            }}
            style={styles.applyButton}
          >
            <Text style={styles.applyText}>Afficher les rapports</Text>
          </AnimatedPressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
