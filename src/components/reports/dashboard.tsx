import { Pressable, Text, View } from '@/features/language/native';
import { useThemeColor } from '@/features/appearance/theme-provider';
import { useCallback, useState, type ReactNode } from "react";
import { ActivityIndicator } from 'react-native';
import Animated, { FadeInDown, ReduceMotion } from "react-native-reanimated";
import Activity from "lucide-react-native/icons/activity";
import ArrowDownRight from "lucide-react-native/icons/arrow-down-right";
import ArrowUpRight from "lucide-react-native/icons/arrow-up-right";
import Car from "lucide-react-native/icons/car";
import ChartNoAxesCombined from "lucide-react-native/icons/chart-no-axes-combined";
import CheckCheck from "lucide-react-native/icons/check-check";
import Clock3 from "lucide-react-native/icons/clock-3";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import Info from "lucide-react-native/icons/info";
import Route from "lucide-react-native/icons/route";
import Shield from "lucide-react-native/icons/shield";
import SlidersHorizontal from "lucide-react-native/icons/sliders-horizontal";
import UsersRound from "lucide-react-native/icons/users-round";
import { AnimatedPressable } from "@/components/ui/animated-pressable";
import { AppIcon, type AppIconComponent } from "@/components/ui/app-icon";
import { useAccident } from "@/features/accident-report/use-accident";
import type { SafetyReportSummary } from "@/features/safety-report/read";
import { readAnalytics } from "@/features/reports/api";
import {
  categories,
  categoryForKind,
  chartBuckets,
  kindLabels,
  numberLabel,
  rangeLabel,
  type Category,
  type DateRange,
} from "@/features/reports/model";
import { CommunityIllustration, HourChart, TimelineChart } from "./charts";
import { useStyles } from "./styles";
import { EventWheel } from "./event-wheel";
import { TerritoryCards } from "./territory-cards";
import {
  territoryLabel,
  type TerritoryFilter,
} from "@/features/reports/territories";

export const categoryIcons = {
  all: ChartNoAxesCombined,
  accidents: Car,
  traffic: Route,
  security: Shield,
};

export function IconButton({
  icon,
  label,
  onPress,
  disabled = false,
}: {
  icon: AppIconComponent;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const styles = useStyles();
  const themeColor = useThemeColor();

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.iconButton, disabled && { opacity: 0.25 }]}
    >
      <AppIcon icon={icon} size={19} color={themeColor("#555561", 'secondary')} />
    </AnimatedPressable>
  );
}
function Card({
  children,
  style,
  delay = 0,
}: {
  children: ReactNode;
  style?: object;
  delay?: number;
}) {
  const styles = useStyles();

  return (
    <Animated.View
      entering={FadeInDown.delay(delay)
        .duration(350)
        .reduceMotion(ReduceMotion.System)}
      style={[styles.card, style]}
    >
      {children}
    </Animated.View>
  );
}
function CardTitle({
  icon,
  title,
  color = "#7772E8",
  right,
}: {
  icon: AppIconComponent;
  title: string;
  color?: string;
  right?: ReactNode;
}) {
  const styles = useStyles();

  return (
    <View style={styles.cardTitleRow}>
      <View style={[styles.inline, styles.flex]}>
        <AppIcon
          icon={icon}
          size={18}
          color={color}
          style={{ flexShrink: 0 }}
        />
        <Text style={[styles.cardTitle, { color }]}>{title}</Text>
      </View>
      {right}
    </View>
  );
}

export function ReportDashboard({
  range,
  category,
  subcategory,
  territory,
  onTerritory,
  wide,
  onKind,
  onViewEvents,
  onReset,
}: {
  range: DateRange;
  category: Category;
  subcategory: string;
  territory: TerritoryFilter;
  onTerritory: (value: TerritoryFilter) => void;
  wide: boolean;
  onKind: (kind: SafetyReportSummary["report_kind"]) => void;
  onViewEvents: () => void;
  onReset: () => void;
}) {
  const styles = useStyles();
  const themeColor = useThemeColor();

  const { start, end } = range;
  const { department, commune } = territory;
  const [selectedBar, setSelectedBar] = useState<string | null>(null);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const loader = useCallback(
    (signal: AbortSignal) =>
      readAnalytics({ start, end }, category, subcategory, signal, 0, {
        department,
        commune,
      }),
    [start, end, category, subcategory, department, commune],
  );
  const { data, loading, error, refresh } = useAccident(loader);
  if (!data && loading)
    return (
      <View
        style={styles.loadingArea}
        accessibilityLabel="Chargement des statistiques"
        accessibilityRole="progressbar"
      >
        <ActivityIndicator color={themeColor("#F04F66", 'accent')} />
        <Text style={styles.loadingText}>Vos données prennent forme…</Text>
        <View style={styles.skeletonRow}>
          <View style={styles.skeleton} />
          <View style={styles.skeleton} />
        </View>
      </View>
    );
  if (!data)
    return (
      <Card style={styles.empty}>
        <AppIcon icon={ChartNoAxesCombined} size={38} color={themeColor("#B1A8D9", 'info')} />
        <Text style={styles.emptyTitle}>Les données se font attendre</Text>
        <Text style={styles.emptyText}>{error}</Text>
        <AnimatedPressable
          accessibilityRole="button"
          onPress={refresh}
          style={styles.retry}
        >
          <Text style={styles.retryText}>Réessayer</Text>
        </AnimatedPressable>
      </Card>
    );
  const color =
    category === "all"
      ? "#F04F66"
      : categories.find((item) => item.id === category)!.color;
  const buckets = chartBuckets(data.daily, range, data.first_date);
  const selected = buckets.find((item) => item.key === selectedBar);
  const difference = data.previous_total
    ? Math.round(
        ((data.total - data.previous_total) / data.previous_total) * 100,
      )
    : null;
  const mainHour = [...data.hours].sort(
    (a, b) => b.count - a.count || a.hour - b.hour,
  )[0];
  const displayedHour = selectedHour ?? mainHour?.hour;
  const hourCount =
    data.hours.find((item) => item.hour === displayedHour)?.count ?? 0;
  const detailPercent = data.total
    ? Math.round((data.detailed / data.total) * 100)
    : 0;
  const peak = [...buckets].sort((a, b) => b.count - a.count)[0];
  const accidentTotal =
    data.kinds.find((item) => item.kind === "accident")?.count ?? 0;
  return (
    <View style={styles.dashboard}>
      {error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error} Les derniers chiffres chargés sont affichés.
        </Text>
      )}
      {!data.total && (
        <View style={styles.noResults}>
          <AppIcon icon={SlidersHorizontal} size={20} color={themeColor("#868091", 'muted')} />
          <View style={styles.flex}>
            <Text style={styles.noResultsTitle}>
              Aucun événement sur cette sélection
            </Text>
            <Text style={styles.muted}>
              Essayez une autre période ou élargissez les filtres.
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onReset}
            style={styles.resetButton}
          >
            <Text style={styles.link}>Tout voir</Text>
          </Pressable>
        </View>
      )}
      <View style={[styles.gridRow, wide && styles.gridRowWide]}>
        <Card style={wide ? styles.overviewWide : undefined}>
          <CardTitle
            icon={Activity}
            title="Vue d’ensemble"
            color={themeColor("#F04F66", 'accent')}
            right={
              <View style={styles.scopeBadge}>
                <Text numberOfLines={2} style={styles.scopeText}>
                  {territoryLabel(territory)}
                </Text>
              </View>
            }
          />
          <View style={styles.overviewBody}>
            <View>
              <Text style={styles.heroNumber}>{numberLabel(data.total)}</Text>
              <Text style={styles.heroUnit}>
                événement{data.total !== 1 ? "s" : ""} recensé
                {data.total !== 1 ? "s" : ""}
              </Text>
            </View>
            <EventWheel data={data} onExplore={onKind} />
          </View>
        </Card>
        <Card delay={70} style={wide ? styles.timelineWide : undefined}>
          <CardTitle
            icon={ChartNoAxesCombined}
            title="Au fil du temps"
            color={color}
            right={
              <Text style={styles.smallTag}>
                {range.start ? "ÉVOLUTION" : "HISTORIQUE"}
              </Text>
            }
          />
          <View accessibilityLiveRegion="polite" style={styles.chartSummary}>
            <Text style={styles.chartNumber}>
              {numberLabel(selected?.count ?? data.total)}
              <Text style={styles.chartUnit}> événements</Text>
            </Text>
            <Text style={styles.muted}>
              {selected?.label ?? rangeLabel(range)}
            </Text>
          </View>
          <TimelineChart
            buckets={buckets}
            color={color}
            selected={selectedBar}
            onSelect={setSelectedBar}
          />
          <Text style={styles.chartHint}>
            Touchez une barre pour explorer les données
          </Text>
          <View style={styles.trendRow}>
            <View style={styles.trendIcon}>
              <AppIcon
                icon={
                  difference !== null && difference < 0
                    ? ArrowDownRight
                    : ArrowUpRight
                }
                size={20}
                color={themeColor("#74707F", 'muted')}
              />
            </View>
            <View style={styles.flex}>
              <Text style={styles.trendTitle}>
                {difference !== null
                  ? `${difference > 0 ? "+" : ""}${difference} % d’événements recensés`
                  : data.previous_total === null
                    ? "L’historique, en un regard"
                    : "Pas d’événement sur la période précédente"}
              </Text>
              <Text style={styles.smallMuted}>
                {difference !== null
                  ? "par rapport à la période précédente de même durée"
                  : "Les chiffres reflètent les signalements de la communauté."}
              </Text>
            </View>
          </View>
        </Card>
      </View>
      <View style={[styles.metricsRow, wide && styles.metricsWide]}>
        <Card delay={100} style={styles.metricCard}>
          <CardTitle icon={UsersRound} title="Témoignages" color={themeColor("#3E94B8", 'info')} />
          <Text style={[styles.metricNumber, { color: themeColor("#3186AB", 'info') }]}>
            {numberLabel(data.testimonies)}
          </Text>
          <Text style={styles.metricDescription}>
            contributions associées aux événements
          </Text>
          <View style={styles.peopleDots}>
            {Array.from({ length: 8 }, (_, index) => (
              <View
                key={index}
                style={[
                  styles.peopleDot,
                  {
                    backgroundColor:
                      index < Math.min(data.testimonies, 8)
                        ? "#76BDD4"
                        : themeColor("#EAF4F7", 'infoSoft'),
                  },
                ]}
              />
            ))}
          </View>
        </Card>
        <Card delay={130} style={styles.metricCard}>
          <CardTitle
            icon={CheckCheck}
            title="Détails recueillis"
            color={themeColor("#3B9473", 'success')}
          />
          <Text style={[styles.metricNumber, { color: themeColor("#398B6C", 'success') }]}>
            {detailPercent}
            <Text style={styles.percentUnit}> %</Text>
          </Text>
          <Text style={styles.metricDescription}>
            {numberLabel(data.detailed)} événement
            {data.detailed !== 1 ? "s" : ""} avec des détails complémentaires
          </Text>
          <View style={styles.progressTrack}>
            <View
              style={[styles.progressFill, { width: `${detailPercent}%` }]}
            />
          </View>
        </Card>
        {wide && <CommunityCard wide />}
      </View>
      <TerritoryCards
        data={data}
        wide={wide}
        territory={territory}
        onSelect={onTerritory}
      />
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Un peu plus loin</Text>
        <Text style={styles.sectionSubtitle}>Les détails qui éclairent</Text>
      </View>
      <View style={[styles.gridRow, wide && styles.gridRowWide]}>
        <Card style={wide ? styles.flex : undefined} delay={160}>
          <CardTitle
            icon={SlidersHorizontal}
            title="Par type d’événement"
            color={themeColor("#D17E17", 'warning')}
          />
          <Text style={styles.cardDescription}>
            Ce que la communauté a observé.
          </Text>
          <View style={styles.kindList}>
            {data.kinds.length ? (
              data.kinds.map((item) => {
                const cat = categories.find(
                  (c) => c.id === categoryForKind(item.kind),
                )!;
                const pct = data.total
                  ? Math.round((item.count / data.total) * 100)
                  : 0;
                return (
                  <View key={item.kind} style={styles.kindRow}>
                    <View style={styles.kindLabels}>
                      <Text style={styles.kindLabel}>
                        {kindLabels[item.kind] ?? item.kind}
                      </Text>
                      <Text style={styles.kindValue}>
                        {numberLabel(item.count)}
                        <Text style={styles.kindPercent}> · {pct} %</Text>
                      </Text>
                    </View>
                    <View style={styles.kindTrack}>
                      <View
                        style={[
                          styles.kindFill,
                          {
                            width: `${pct}%`,
                            backgroundColor:
                              cat.id === "traffic" ? "#F7AD32" : cat.color,
                          },
                        ]}
                      />
                    </View>
                  </View>
                );
              })
            ) : (
              <Text style={styles.emptyChartText}>
                La répartition apparaîtra dès qu’un événement sera recensé.
              </Text>
            )}
          </View>
          {accidentTotal > 0 && (
            <View style={styles.severitySection}>
              <Text style={styles.severityTitle}>Gravité des accidents</Text>
              <View style={styles.severityItems}>
                {[
                  { id: "material", label: "Matériel", color: themeColor("#419675", 'success') },
                  { id: "injuries", label: "Blessés", color: themeColor("#CE871C", 'warning') },
                  { id: "serious", label: "Graves", color: themeColor("#DF7253", 'accent') },
                  { id: "fatal", label: "Décès", color: themeColor("#C34F69", 'accent') },
                  { id: "unknown", label: "À préciser", color: themeColor("#888592", 'muted') },
                ].map((item) => (
                  <View key={item.id} style={styles.severityItem}>
                    <View
                      style={[
                        styles.legendDot,
                        { backgroundColor: item.color },
                      ]}
                    />
                    <Text style={styles.severityLabel}>{item.label}</Text>
                    <Text style={styles.severityCount}>
                      {numberLabel(
                        data.severity.find((row) => row.severity === item.id)
                          ?.count ?? 0,
                      )}
                    </Text>
                  </View>
                ))}
              </View>
              <Text style={styles.cardFootnote}>
                Nombre d’événements par gravité déclarée, pas de victimes.
              </Text>
            </View>
          )}
        </Card>
        <View style={[wide && styles.flex, styles.sideColumn]}>
          <Card delay={190}>
            <CardTitle icon={Clock3} title="Les heures de signalement" />
            <Text style={styles.cardDescription}>
              À quel moment les événements sont-ils signalés ?
            </Text>
            <View style={styles.hourSummary} accessibilityLiveRegion="polite">
              <Text style={styles.hourNumber}>
                {displayedHour === undefined
                  ? "—"
                  : `${String(displayedHour).padStart(2, "0")} h`}
              </Text>
              <Text style={styles.hourCaption}>
                {selectedHour !== null
                  ? `${hourCount} événement${hourCount !== 1 ? "s" : ""} signalé${hourCount !== 1 ? "s" : ""}`
                  : mainHour
                    ? "heure la plus représentée"
                    : "Aucune donnée horaire"}
              </Text>
            </View>
            <HourChart
              hours={data.hours}
              selected={selectedHour}
              onSelect={setSelectedHour}
            />
            <View style={styles.heatLegend}>
              <Text style={styles.smallMuted}>Moins</Text>
              {["#EFEEF8", "#CDCAF3", "#A39DEE", "#7874E8"].map((c) => (
                <View
                  key={c}
                  style={[styles.heatSwatch, { backgroundColor: c }]}
                />
              ))}
              <Text style={styles.smallMuted}>Plus</Text>
            </View>
            <Text style={styles.cardFootnote}>
              Heure locale d’Haïti · premier signalement de chaque événement.
            </Text>
          </Card>
          <Card style={styles.insightCard} delay={220}>
            <View style={styles.inline}>
              <View style={styles.insightIcon}>
                <AppIcon icon={Activity} size={20} color={themeColor("#9A7B42", 'warning')} />
              </View>
              <Text style={styles.insightTitle}>À retenir</Text>
            </View>
            <Text style={styles.insightText}>
              {data.total && peak ? (
                <>
                  <Text style={styles.insightBold}>{peak.label}</Text> :{" "}
                  {numberLabel(peak.count)} événement
                  {peak.count !== 1 ? "s" : ""}, le niveau le plus élevé de la
                  sélection.
                </>
              ) : (
                "Les tendances se dessineront au fil des contributions."
              )}
            </Text>
            <Text style={styles.insightNote}>
              Plus de signalements peut aussi refléter une communauté plus
              active.
            </Text>
          </Card>
        </View>
      </View>
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel="Voir tous les événements de cette sélection"
        onPress={onViewEvents}
        haptic="selection"
        style={styles.eventsLink}
      >
        <View style={styles.flex}>
          <Text style={styles.eventsLinkEyebrow}>ALLER PLUS LOIN</Text>
          <Text style={styles.eventsLinkTitle}>Explorer les événements</Text>
          <Text style={styles.eventsLinkSubtitle}>
            {numberLabel(data.total)} dans cette sélection · Voir la liste
            complète
          </Text>
        </View>
        <View style={styles.eventsLinkArrow}>
          <AppIcon icon={ChevronRight} size={22} color={themeColor("#F04F66", 'accent')} />
        </View>
      </AnimatedPressable>
      {!wide && <CommunityCard />}
      <View style={styles.method}>
        <AppIcon icon={Info} size={15} color={themeColor("#9898A2", 'muted')} />
        <View style={styles.flex}>
          <Text style={styles.methodText}>
            Des données pour mieux comprendre, ensemble.
          </Text>
          <Text style={styles.methodDetail}>
            Événements regroupés à partir des signalements de la communauté. Les
            chiffres sont déclaratifs et ne constituent pas des statistiques
            officielles. Mise à jour à{" "}
            {new Date(data.updated_at).toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "America/Port-au-Prince",
            })}
            , heure d’Haïti.
          </Text>
        </View>
      </View>
    </View>
  );
}

function CommunityCard({ wide = false }: { wide?: boolean }) {
  const styles = useStyles();

  return (
    <View style={[styles.community, wide && { flex: 1.1 }]}>
      <View style={styles.flex}>
        <Text style={styles.communityTitle}>
          Chaque signalement{"\n"}compte.
        </Text>
        <Text style={styles.communityText}>
          Ensemble, rendons les routes plus sûres et les trajets plus sereins.
        </Text>
      </View>
      <CommunityIllustration />
    </View>
  );
}
