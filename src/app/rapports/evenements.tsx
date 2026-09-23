import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import MapPin from "lucide-react-native/icons/map-pin";
import { AppScreen } from "@/components/app-screen";
import { SafetyReportDetailSheet } from "@/components/safety-report-detail-sheet";
import { AnimatedPressable } from "@/components/ui/animated-pressable";
import { AppIcon } from "@/components/ui/app-icon";
import { categoryIcons } from "@/components/reports/dashboard";
import { styles } from "@/components/reports/styles";
import { useAccident } from "@/features/accident-report/use-accident";
import { readAnalytics } from "@/features/reports/api";
import {
  categories,
  categoryForKind,
  dateLabel,
  haitiToday,
  kindLabels,
  numberLabel,
  rangeLabel,
  subcategories,
  validDate,
  type Category,
  type DateRange,
} from "@/features/reports/model";
import {
  reportSelection,
  type SafetyReportSummary,
} from "@/features/safety-report/read";

function one(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

export default function EventsScreen() {
  const params = useLocalSearchParams<{
    start?: string;
    end?: string;
    category?: string;
    subcategory?: string;
  }>();
  const endParam = one(params.end);
  const startParam = one(params.start);
  const end =
    endParam && validDate(endParam) && endParam <= haitiToday()
      ? endParam
      : haitiToday();
  const start =
    startParam && validDate(startParam) && startParam <= end
      ? startParam
      : null;
  const requestedCategory = one(params.category);
  const category: Category = categories.some(
    (item) => item.id === requestedCategory,
  )
    ? (requestedCategory as Category)
    : "all";
  const requestedSubcategory = one(params.subcategory);
  const subcategory = subcategories(category).some(
    (item) => item.id === requestedSubcategory,
  )
    ? requestedSubcategory!
    : "all";
  return (
    <EventsList
      start={start}
      end={end}
      category={category}
      subcategory={subcategory}
    />
  );
}

function EventsList({
  start,
  end,
  category,
  subcategory,
}: {
  start: string | null;
  end: string;
  category: Category;
  subcategory: string;
}) {
  const router = useRouter();
  const range: DateRange = { start, end };
  const categoryLabel =
    categories.find((item) => item.id === category)?.label ?? "Tout";
  const selectionLabel =
    subcategory === "all"
      ? categoryLabel
      : (subcategories(category).find((item) => item.id === subcategory)
          ?.label ?? categoryLabel);
  const { width } = useWindowDimensions();
  const wide = width >= 650;
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [moreReports, setMoreReports] = useState<SafetyReportSummary[]>([]);
  const [moreLoading, setMoreLoading] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const moreController = useRef<AbortController | null>(null);
  const moreTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const loader = useCallback(
    async (signal: AbortSignal) => {
      const result = await readAnalytics(
        { start, end },
        category,
        subcategory,
        signal,
      );
      if (!signal.aborted) {
        moreController.current?.abort();
        clearTimeout(moreTimeout.current);
        setMoreReports([]);
        setMoreLoading(false);
        setMoreError(null);
      }
      return result;
    },
    [start, end, category, subcategory],
  );
  const { data, loading, error, refresh } = useAccident(loader);
  useEffect(
    () => () => {
      moreController.current?.abort();
      clearTimeout(moreTimeout.current);
    },
    [],
  );

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace("/rapports");
  }

  async function loadMore() {
    if (!data || moreLoading) return;
    const controller = new AbortController();
    moreController.current = controller;
    setMoreLoading(true);
    setMoreError(null);
    moreTimeout.current = setTimeout(() => {
      controller.abort();
      setMoreError("La connexion prend trop de temps. Réessayez.");
      setMoreLoading(false);
    }, 20000);
    try {
      const result = await readAnalytics(
        range,
        category,
        subcategory,
        controller.signal,
        data.reports.length + moreReports.length,
      );
      if (!controller.signal.aborted)
        setMoreReports((previous) => [...previous, ...result.reports]);
    } catch {
      if (!controller.signal.aborted)
        setMoreError("Impossible de charger la suite. Réessayez.");
    } finally {
      clearTimeout(moreTimeout.current);
      if (!controller.signal.aborted) setMoreLoading(false);
    }
  }

  const reports = data ? [...data.reports, ...moreReports] : [];
  return (
    <>
      <AppScreen
        title="Événements"
        hideIntro
        contentContainerStyle={[styles.page, width < 440 && styles.pageSmall]}
      >
        <View style={styles.header}>
          <View style={[styles.inline, styles.flex]}>
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityLabel="Retour aux rapports"
              onPress={goBack}
              haptic="selection"
              style={styles.iconButton}
            >
              <AppIcon icon={ChevronLeft} size={21} color="#555561" />
            </AnimatedPressable>
            <View style={[styles.heading, { marginLeft: 8 }]}>
              <Text style={styles.eyebrow}>L’OBSERVATOIRE</Text>
              <Text
                style={[
                  styles.title,
                  { fontSize: 33, lineHeight: 40, marginTop: 3 },
                ]}
              >
                Événements
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.eventsContext}>
          <View style={styles.eventsContextIcon}>
            <AppIcon icon={categoryIcons[category]} color="#E76171" size={21} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.eventsContextTitle}>{selectionLabel}</Text>
            <Text style={styles.eventsContextPeriod}>{rangeLabel(range)}</Text>
          </View>
          {data && (
            <Text
              accessibilityLiveRegion="polite"
              style={styles.eventsContextCount}
            >
              {numberLabel(data.total)}
            </Text>
          )}
        </View>
        {error && data && (
          <Text accessibilityRole="alert" style={styles.error}>
            {error} Les derniers événements chargés sont affichés.
          </Text>
        )}
        {!data && loading ? (
          <View style={styles.loadingArea} accessibilityRole="progressbar">
            <ActivityIndicator color="#F04F66" />
            <Text style={styles.loadingText}>Chargement des événements…</Text>
          </View>
        ) : !data ? (
          <View style={[styles.card, styles.empty]}>
            <Text style={styles.emptyTitle}>
              Les événements se font attendre
            </Text>
            <Text style={styles.emptyText}>{error}</Text>
            <AnimatedPressable
              accessibilityRole="button"
              onPress={refresh}
              style={styles.retry}
            >
              <Text style={styles.retryText}>Réessayer</Text>
            </AnimatedPressable>
          </View>
        ) : (
          <View style={[styles.card, styles.feedCard]}>
            {reports.length ? (
              reports.map((report, index) => {
                const cat = categories.find(
                  (item) => item.id === categoryForKind(report.report_kind),
                )!;
                return (
                  <Pressable
                    key={report.event_id ?? reportSelection(report)}
                    accessibilityRole="button"
                    accessibilityLabel={`${kindLabels[report.report_kind]}, ${report.location_description || "Lieu à préciser"}, ${dateLabel(report.created_at, true)}. Ouvrir les détails`}
                    onPress={() => setSelectedReport(reportSelection(report))}
                    style={({ pressed }) => [
                      styles.reportRow,
                      index > 0 && styles.reportBorder,
                      pressed && { backgroundColor: "#FAFAFC" },
                    ]}
                  >
                    <View
                      style={[styles.reportIcon, { backgroundColor: cat.tint }]}
                    >
                      <AppIcon
                        icon={categoryIcons[cat.id]}
                        color={cat.color}
                        size={20}
                      />
                    </View>
                    <View style={styles.flex}>
                      <View style={styles.reportTitleRow}>
                        <Text style={styles.reportTitle}>
                          {kindLabels[report.report_kind]}
                        </Text>
                        {wide && (
                          <Text style={styles.smallMuted}>
                            {dateLabel(report.created_at, true)}
                          </Text>
                        )}
                      </View>
                      <View style={styles.reportLocation}>
                        <AppIcon icon={MapPin} size={12} color="#9A9AA3" />
                        <Text numberOfLines={1} style={styles.reportPlace}>
                          {report.location_description || "Lieu à préciser"}
                        </Text>
                      </View>
                      <Text style={styles.reportMeta}>
                        {!wide
                          ? `${dateLabel(report.created_at, true)} · `
                          : ""}
                        {numberLabel(report.testimony_count ?? 1)} témoignage
                        {(report.testimony_count ?? 1) > 1 ? "s" : ""}
                      </Text>
                    </View>
                    <AppIcon icon={ChevronRight} size={17} color="#B5B5BF" />
                  </Pressable>
                );
              })
            ) : (
              <View style={styles.emptyFeed}>
                <AppIcon icon={MapPin} size={28} color="#B5ACCA" />
                <Text style={styles.emptyText}>
                  Aucun événement pour cette sélection. Modifiez les filtres
                  dans les rapports.
                </Text>
              </View>
            )}
            {moreError && (
              <Text accessibilityRole="alert" style={styles.error}>
                {moreError}
              </Text>
            )}
            {reports.length < data.total && (
              <AnimatedPressable
                accessibilityRole="button"
                disabled={moreLoading}
                accessibilityState={{ disabled: moreLoading }}
                onPress={() => void loadMore()}
                style={styles.loadMore}
              >
                {moreLoading ? (
                  <ActivityIndicator size="small" color="#F04F66" />
                ) : (
                  <Text style={styles.link}>
                    Voir plus d’événements · {numberLabel(reports.length)} sur{" "}
                    {numberLabel(data.total)}
                  </Text>
                )}
              </AnimatedPressable>
            )}
          </View>
        )}
      </AppScreen>
      {selectedReport && (
        <SafetyReportDetailSheet
          key={selectedReport}
          selection={selectedReport}
          onClose={() => setSelectedReport(null)}
        />
      )}
    </>
  );
}
