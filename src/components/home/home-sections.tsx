import { useThemeColor } from '@/features/appearance/theme-provider';
import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ArrowUpRight from "lucide-react-native/icons/arrow-up-right";
import ArrowRight from "lucide-react-native/icons/arrow-right";
import Bell from "lucide-react-native/icons/bell";
import BookOpen from "lucide-react-native/icons/book-open";
import BriefcaseBusiness from "lucide-react-native/icons/briefcase-business";
import CarFront from "lucide-react-native/icons/car-front";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import Clock3 from "lucide-react-native/icons/clock-3";
import Construction from "lucide-react-native/icons/construction";
import House from "lucide-react-native/icons/house";
import LocateFixed from "lucide-react-native/icons/locate-fixed";
import MapPin from "lucide-react-native/icons/map-pin";
import Navigation from "lucide-react-native/icons/navigation";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import ShieldAlert from "lucide-react-native/icons/shield-alert";
import UserRoundSearch from "lucide-react-native/icons/user-round-search";
import Wrench from "lucide-react-native/icons/wrench";
import X from "lucide-react-native/icons/x";
import { AnimatedPressable } from "@/components/ui/animated-pressable";
import { useAccident } from "@/features/accident-report/use-accident";
import { useAppLocation } from "@/features/location/app-location";
import { reusableAppLocation } from "@/features/location/app-location-model";
import { readMapReports, reportSelection } from "@/features/safety-report/read";
import { useReportLocation } from "@/features/safety-report/use-report-location";
import { readHomePlaces } from "@/features/home/api";
import { nearbyReports, reportAge, savedPoint } from "@/features/home/model";
import { formatRouteDistance } from "@/features/map/route-geometry";
import { JourneyArt, RadarArt } from "./home-art";
import { useStyles } from "./styles";

const reportAppearance = {
  accident: {
    label: "Accident",
    icon: CarFront,
    color: "#B44D3D",
    background: "#FCEEE9",
  },
  barricade: {
    label: "Route barricadée",
    icon: Construction,
    color: "#9B681D",
    background: "#F8F0DB",
  },
  breakdown: {
    label: "Véhicule en panne",
    icon: Wrench,
    color: "#98601D",
    background: "#FBF0DF",
  },
  gunfire: {
    label: "Tirs entendus",
    icon: ShieldAlert,
    color: "#B34251",
    background: "#FBECEF",
  },
  armed_presence: {
    label: "Présence d’hommes armés",
    icon: ShieldAlert,
    color: "#B34251",
    background: "#FBECEF",
  },
  kidnapping: {
    label: "Enlèvement",
    icon: UserRoundSearch,
    color: "#7D4A90",
    background: "#F4EBF7",
  },
  suspicious_vehicle: {
    label: "Voiture suspecte",
    icon: CarFront,
    color: "#98601D",
    background: "#FBF0DF",
  },
};
const tips = [
  {
    title: "Regardez l’heure, puis le lieu.",
    body: "Un signalement décrit une observation à un instant précis. Consultez l’heure du dernier témoignage et les détails avant de préparer votre déplacement.",
    icon: Clock3,
  },
  {
    title: "Préparez votre trajet à l’arrêt.",
    body: "Choisissez votre destination et consultez les événements proches du parcours avant de partir. Le trajet calculé ne garantit pas l’absence de danger.",
    icon: Navigation,
  },
  {
    title: "Des faits utiles à tous.",
    body: "Pour signaler, décrivez seulement ce que vous avez observé, avec un lieu et une heure aussi précis que possible. Faites-le depuis un endroit où vous êtes en sécurité.",
    icon: MapPin,
  },
];

function ReportRow({
  item,
  onOpen,
}: {
  item: ReturnType<typeof nearbyReports>[number];
  onOpen: (id: string) => void;
}) {
  const styles = useStyles();
  const themeColor = useThemeColor();

  const { report, distance, observedAt } = item;
  const appearance = reportAppearance[report.report_kind];
  const Icon = appearance.icon;
  const location = useReportLocation(report);
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={`${appearance.label}, ${location.label}, ${reportAge(observedAt)}. Voir le signalement`}
      onPress={() => onOpen(reportSelection(report))}
      hoverScale={1.005}
      pressedScale={0.985}
      style={styles.reportRow}
    >
      <View
        style={[styles.reportIcon, { backgroundColor: appearance.background }]}
      >
        <Icon size={21} color={appearance.color} strokeWidth={1.7} />
      </View>
      <View style={styles.grow}>
        <Text style={styles.reportTitle}>{appearance.label}</Text>
        <Text numberOfLines={1} style={styles.reportLocation}>
          {location.label}
        </Text>
        <View style={styles.reportMeta}>
          <Text style={styles.metaText}>{reportAge(observedAt)}</Text>
          {distance !== null && (
            <>
              <View style={styles.metaDot} />
              <Text style={styles.metaText}>
                À {formatRouteDistance(distance)}
              </Text>
            </>
          )}
        </View>
      </View>
      <ChevronRight size={17} color={themeColor("#8F9991", 'muted')} />
    </AnimatedPressable>
  );
}

function SectionHeading({
  number,
  title,
  action,
  onPress,
}: {
  number: string;
  title: string;
  action?: string;
  onPress?: () => void;
}) {
  const styles = useStyles();
  const themeColor = useThemeColor();

  return (
    <View style={styles.sectionHeading}>
      <View style={styles.headingLabel}>
        <Text style={styles.sectionNumber}>{number}</Text>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          {title}
        </Text>
      </View>
      {action && (
        <AnimatedPressable
          accessibilityRole="button"
          onPress={onPress}
          style={styles.textAction}
        >
          <Text style={styles.textActionLabel}>{action}</Text>
          <ArrowUpRight size={17} color={themeColor("#3D574C", 'secondary')} />
        </AnimatedPressable>
      )}
    </View>
  );
}

type ReportListProps = {
  items: ReturnType<typeof nearbyReports>;
  limit?: number;
  reports: ReturnType<
    typeof useAccident<Awaited<ReturnType<typeof readMapReports>>>
  >;
  onOpen: (id: string) => void;
};
function ReportList({ items, limit, reports, onOpen }: ReportListProps) {
  const styles = useStyles();
  const themeColor = useThemeColor();

  if (reports.loading && !reports.data)
    return (
      <View style={styles.empty}>
        <ActivityIndicator color={themeColor("#365D4D", 'secondary')} />
        <Text style={styles.body}>Les dernières informations arrivent…</Text>
      </View>
    );
  if (reports.error && !reports.data)
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Un instant, la connexion manque.</Text>
        <Text style={styles.body}>Impossible de charger les signalements.</Text>
        <AnimatedPressable
          accessibilityRole="button"
          onPress={reports.refresh}
          style={styles.inlineButton}
        >
          <RefreshCw size={16} color={themeColor("#355447", 'secondary')} />
          <Text style={styles.linkLabel}>Réessayer</Text>
        </AnimatedPressable>
      </View>
    );
  return (
    <>
      {items.length ? (
        items
          .slice(0, limit)
          .map((item) => (
            <ReportRow
              key={reportSelection(item.report)}
              item={item}
              onOpen={onOpen}
            />
          ))
      ) : (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <LocateFixed size={24} color={themeColor("#66806A", 'muted')} />
          </View>
          <Text style={styles.emptyTitle}>Aucun signalement récent ici.</Text>
          <Text style={styles.emptyBody}>
            Aucun événement chargé dans cette zone sur les dernières 24 heures.
          </Text>
        </View>
      )}
      {reports.error && (
        <Text accessibilityRole="alert" style={styles.dataNote}>
          Actualisation impossible. Les dernières données chargées sont
          affichées.
        </Text>
      )}
      {reports.data?.truncated && (
        <Text style={styles.dataNote}>
          La liste disponible est partielle : certains événements peuvent
          manquer.
        </Text>
      )}
    </>
  );
}

export function HomeSections({
  enabled,
  onOpen,
  zonesOpen,
  onZonesOpen,
  onZonesClose,
}: {
  enabled: boolean;
  onOpen: (id: string) => void;
  zonesOpen: boolean;
  onZonesOpen: () => void;
  onZonesClose: () => void;
}) {
  const styles = useStyles();
  const themeColor = useThemeColor();

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const gps = useAppLocation();
  const reports = useAccident(readMapReports, enabled, 30_000);
  const places = useAccident(readHomePlaces, enabled);
  const [radius, setRadius] = useState(10);
  const [zone, setZone] = useState<"position" | "home" | "work">("position");
  const [tipsOpen, setTipsOpen] = useState(false);
  const current = reusableAppLocation(gps.location);
  const center = current?.coordinates ?? null;
  const home = savedPoint(places.data?.home);
  const work = savedPoint(places.data?.work);
  const nearby = nearbyReports(reports.data?.reports ?? [], center, radius);
  const zoneCenter =
    zone === "position" ? center : zone === "home" ? home : work;
  const zoneReports = zoneCenter
    ? nearbyReports(reports.data?.reports ?? [], zoneCenter, radius)
    : [];
  const locationLabel = current?.location.split(",")[0]?.trim();
  const openReport = (id: string) => {
    onZonesClose();
    onOpen(id);
  };
  const openRoute = (target: "custom" | "commute" | "home" | "work") =>
    router.push({
      pathname: "/carte",
      params: { trajet: target, demande: String(Date.now()) },
    });
  const openProfile = () => {
    onZonesClose();
    router.push("/profil");
  };
  const closeSheet = () => {
    onZonesClose();
    setTipsOpen(false);
  };

  return (
    <View style={styles.sections}>
      <View style={styles.section}>
        <SectionHeading
          number="01"
          title="Près de moi"
          action="La carte"
          onPress={() => router.push("/carte")}
        />
        <View style={styles.nearbyCard}>
          <View style={styles.nearbyTop}>
            <View style={styles.nearbyCaption}>
              <View style={styles.smallDot} />
              <Text numberOfLines={1} style={styles.areaLabel}>
                {center
                  ? locationLabel || "Autour de votre position"
                  : "À travers Haïti"}
              </Text>
            </View>
            <Text style={styles.periodLabel}>24 DERNIÈRES HEURES</Text>
          </View>
          {center ? (
            <View style={styles.radiusRow}>
              <Text style={styles.radiusLabel}>Dans un rayon de</Text>
              <View style={styles.radiusOptions}>
                {[5, 10, 25].map((value) => (
                  <AnimatedPressable
                    key={value}
                    accessibilityRole="button"
                    accessibilityLabel={`Rayon de ${value} kilomètres`}
                    accessibilityState={{ selected: radius === value }}
                    onPress={() => setRadius(value)}
                    haptic="selection"
                    style={[
                      styles.radiusOption,
                      radius === value && styles.radiusSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.radiusText,
                        radius === value && styles.radiusTextSelected,
                      ]}
                    >
                      {value} km
                    </Text>
                  </AnimatedPressable>
                ))}
              </View>
            </View>
          ) : (
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityLabel="Activer ma localisation"
              disabled={gps.locating}
              onPress={gps.refresh}
              style={styles.locationPrompt}
            >
              {gps.locating ? (
                <ActivityIndicator size="small" color={themeColor("#536B58", 'secondary')} />
              ) : (
                <LocateFixed size={19} color={themeColor("#536B58", 'secondary')} />
              )}
              <Text style={styles.locationPromptText}>
                {gps.locating
                  ? "Recherche de votre position…"
                  : "Activez la localisation pour voir autour de vous"}
              </Text>
              {!gps.locating && <ArrowRight size={17} color={themeColor("#536B58", 'secondary')} />}
            </AnimatedPressable>
          )}
          {!center && gps.error && (
            <Text style={styles.locationError}>{gps.error.message}</Text>
          )}
          <ReportList
            items={nearby}
            limit={3}
            reports={reports}
            onOpen={openReport}
          />
          <View style={styles.feedFooter}>
            <Text style={styles.feedFooterText}>
              Observations de la communauté
            </Text>
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityLabel="Actualiser les signalements proches"
              disabled={reports.loading}
              onPress={reports.refresh}
              style={styles.refresh}
            >
              {reports.loading ? (
                <ActivityIndicator size="small" color={themeColor("#6B776E", 'muted')} />
              ) : (
                <RefreshCw size={15} color={themeColor("#6B776E", 'muted')} />
              )}
            </AnimatedPressable>
          </View>
        </View>
      </View>
      <View style={styles.section}>
        <SectionHeading number="02" title="Mon trajet" />
        <View style={styles.journeyCard}>
          <View style={styles.journeyTop}>
            <View style={styles.journeyTag}>
              <Navigation size={13} color="#D2EAC8" />
              <Text style={styles.journeyEyebrow}>UN DÉPART BIEN PRÉPARÉ</Text>
            </View>
            <View style={styles.journeyCompass}>
              <ArrowUpRight size={20} color={themeColor("#A9C2AD", 'muted')} />
            </View>
          </View>
          <Text style={styles.journeyTitle}>
            Avant de partir,{"\n"}jetez un œil au trajet.
          </Text>
          <Text style={styles.journeyDescription}>
            Retrouvez les signalements à proximité de votre parcours.
          </Text>
          <View pointerEvents="none" style={styles.journeyArt}>
            <JourneyArt />
          </View>
          <View style={styles.savedRoutes}>
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityLabel={
                home
                  ? "Préparer un trajet vers mon domicile"
                  : "Enregistrer mon domicile"
              }
              onPress={() => (home ? openRoute("home") : openProfile())}
              style={styles.savedRoute}
            >
              <House size={18} color="#D3E7CB" />
              <View style={styles.grow}>
                <Text style={styles.savedRouteTitle}>Domicile</Text>
                <Text numberOfLines={1} style={styles.savedRouteAddress}>
                  {places.loading
                    ? "Chargement…"
                    : home
                      ? places.data?.home?.address
                      : "Ajouter"}
                </Text>
              </View>
            </AnimatedPressable>
            <View style={styles.routeDivider} />
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityLabel={
                work
                  ? "Préparer un trajet vers mon travail"
                  : "Enregistrer mon lieu de travail"
              }
              onPress={() => (work ? openRoute("work") : openProfile())}
              style={styles.savedRoute}
            >
              <BriefcaseBusiness size={18} color="#D3E7CB" />
              <View style={styles.grow}>
                <Text style={styles.savedRouteTitle}>Travail</Text>
                <Text numberOfLines={1} style={styles.savedRouteAddress}>
                  {places.loading
                    ? "Chargement…"
                    : work
                      ? places.data?.work?.address
                      : "Ajouter"}
                </Text>
              </View>
            </AnimatedPressable>
          </View>
          {places.error && (
            <Text style={styles.journeyError}>
              Vos adresses sont indisponibles. Réessayez depuis votre profil.
            </Text>
          )}
          <AnimatedPressable
            accessibilityRole="button"
            onPress={() => openRoute(home && work ? "commute" : "custom")}
            style={styles.journeyCta}
            pressedScale={0.98}
          >
            <Text style={styles.journeyCtaText}>
              {home && work ? "Domicile → Travail" : "Choisir ma destination"}
            </Text>
            <View style={styles.ctaArrow}>
              <ArrowRight size={20} color="#24483C" />
            </View>
          </AnimatedPressable>
          {home && work && (
            <AnimatedPressable
              accessibilityRole="button"
              onPress={() => openRoute("custom")}
              style={styles.otherRoute}
            >
              <Text style={styles.otherRouteText}>Une autre destination</Text>
              <ArrowUpRight size={14} color="#D3E0D3" />
            </AnimatedPressable>
          )}
        </View>
      </View>
      <View style={styles.section}>
        <SectionHeading number="03" title="Rester informé" />
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel="Consulter les alertes de mes zones"
          onPress={onZonesOpen}
          style={styles.zonesCard}
          pressedScale={0.985}
        >
          <View style={styles.grow}>
            <View style={styles.eyebrowLine}>
              <Bell size={13} color={themeColor("#5C715C", 'secondary')} />
              <Text style={styles.softEyebrow}>VOS REPÈRES</Text>
            </View>
            <Text style={styles.zonesTitle}>
              Les lieux qui{"\n"}comptent.
            </Text>
            <Text style={styles.zonesBody}>Position, domicile, travail.</Text>
            <View style={styles.zonesLink}>
              <Text style={styles.linkLabel}>Voir les alertes</Text>
              <ArrowUpRight size={17} color={themeColor("#355447", 'secondary')} />
            </View>
          </View>
          <View pointerEvents="none" style={styles.radar}>
            <RadarArt />
          </View>
        </AnimatedPressable>
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel="Lire les trois bons réflexes"
          onPress={() => setTipsOpen(true)}
          style={styles.tipCard}
          pressedScale={0.985}
        >
          <View style={styles.bookIcon}>
            <BookOpen size={22} color={themeColor("#A3563C", 'accent')} strokeWidth={1.7} />
          </View>
          <View style={styles.grow}>
            <Text style={styles.tipEyebrow}>LE PETIT GUIDE</Text>
            <Text style={styles.tipTitle}>Trois réflexes qui comptent.</Text>
            <Text style={styles.tipDescription}>
              S’informer. Préparer. Contribuer.
            </Text>
          </View>
          <ArrowUpRight size={20} color={themeColor("#98654F", 'accent')} />
        </AnimatedPressable>
      </View>
      <View style={styles.signature}>
        <View style={styles.signatureLine} />
        <Text style={styles.signatureText}>MIEUX INFORMÉS, ENSEMBLE.</Text>
        <View style={styles.signatureLine} />
      </View>
      <Modal
        visible={zonesOpen || tipsOpen}
        transparent
        animationType="slide"
        onRequestClose={closeSheet}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fermer le panneau"
            style={StyleSheet.absoluteFill}
            onPress={closeSheet}
          />
          <View
            accessibilityViewIsModal
            style={[
              styles.sheet,
              {
                paddingBottom: Math.max(insets.bottom, 20),
                marginTop: Math.max(insets.top, 20),
              },
            ]}
          >
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View style={styles.grow}>
                <Text style={styles.softEyebrow}>
                  {tipsOpen ? "LE PETIT GUIDE" : "VOS REPÈRES"}
                </Text>
                <Text accessibilityRole="header" style={styles.sheetTitle}>
                  {tipsOpen ? "Les bons réflexes." : "Mes alertes locales"}
                </Text>
              </View>
              <AnimatedPressable
                accessibilityRole="button"
                accessibilityLabel="Fermer"
                onPress={closeSheet}
                style={styles.closeButton}
              >
                <X size={21} color={themeColor("#445348", 'secondary')} />
              </AnimatedPressable>
            </View>
            <ScrollView
              key={tipsOpen ? "tips" : "zones"}
              contentContainerStyle={styles.sheetContent}
              showsVerticalScrollIndicator={false}
            >
              {tipsOpen ? (
                tips.map((tip, index) => (
                  <View key={tip.title} style={styles.guideItem}>
                    <View style={styles.guideTop}>
                      <Text style={styles.guideNumber}>0{index + 1}</Text>
                      <tip.icon size={23} color={themeColor("#A66045", 'accent')} />
                    </View>
                    <Text style={styles.guideTitle}>{tip.title}</Text>
                    <Text style={styles.guideBody}>{tip.body}</Text>
                  </View>
                ))
              ) : (
                <>
                  <Text style={styles.sheetDescription}>
                    Les observations des dernières 24 heures autour de vos lieux
                    habituels.
                  </Text>
                  <View style={styles.zoneTabs}>
                    {(
                      [
                        {
                          key: "position",
                          label: "Ma position",
                          icon: LocateFixed,
                        },
                        { key: "home", label: "Domicile", icon: House },
                        {
                          key: "work",
                          label: "Travail",
                          icon: BriefcaseBusiness,
                        },
                      ] as const
                    ).map((item) => (
                      <AnimatedPressable
                        key={item.key}
                        accessibilityRole="button"
                        accessibilityState={{ selected: zone === item.key }}
                        onPress={() => setZone(item.key)}
                        style={[
                          styles.zoneTab,
                          zone === item.key && styles.zoneTabSelected,
                        ]}
                      >
                        <item.icon
                          size={17}
                          color={zone === item.key ? "#FFFFFF" : themeColor("#637466", 'secondary')}
                        />
                        <Text
                          style={[
                            styles.zoneTabText,
                            zone === item.key && styles.zoneTabTextSelected,
                          ]}
                        >
                          {item.label}
                        </Text>
                      </AnimatedPressable>
                    ))}
                  </View>
                  {zoneCenter ? (
                    <>
                      <View style={styles.zoneContext}>
                        <MapPin size={15} color={themeColor("#697B6A", 'muted')} />
                        <Text style={styles.zoneContextText}>
                          {zone === "position"
                            ? locationLabel || "Votre position"
                            : places.data?.[zone]?.address}{" "}
                          · {radius} km
                        </Text>
                      </View>
                      <View style={styles.sheetReports}>
                        <ReportList
                          items={zoneReports}
                          reports={reports}
                          onOpen={openReport}
                        />
                      </View>
                      <Text style={styles.dataNote}>
                        Les signalements sont consultables ici à l’ouverture de
                        l’app. L’absence de signalement ne garantit pas
                        l’absence de danger.
                      </Text>
                      <AnimatedPressable
                        accessibilityRole="button"
                        onPress={reports.refresh}
                        disabled={reports.loading}
                        style={styles.inlineButton}
                      >
                        <RefreshCw size={17} color={themeColor("#355447", 'secondary')} />
                        <Text style={styles.linkLabel}>
                          {reports.loading
                            ? "Actualisation…"
                            : "Actualiser les alertes"}
                        </Text>
                      </AnimatedPressable>
                    </>
                  ) : (
                    <View style={styles.zoneEmpty}>
                      <RadarArt />
                      <Text style={styles.emptyTitle}>
                        {zone === "position"
                          ? "Rapprochons les informations."
                          : places.loading
                            ? "Chargement de votre adresse…"
                            : places.error
                              ? "Adresse indisponible"
                              : "Ajoutez ce lieu à vos repères."}
                      </Text>
                      <Text style={styles.emptyBody}>
                        {zone === "position"
                          ? gps.error?.message ||
                            "Activez votre position pour consulter les signalements autour de vous."
                          : places.error ||
                            "Enregistrez cette adresse dans votre profil pour retrouver les signalements à proximité."}
                      </Text>
                      <AnimatedPressable
                        accessibilityRole="button"
                        disabled={zone === "position" && gps.locating}
                        onPress={
                          zone === "position" ? gps.refresh : openProfile
                        }
                        style={styles.solidButton}
                      >
                        <Text style={styles.solidButtonText}>
                          {zone === "position"
                            ? gps.locating
                              ? "Localisation…"
                              : "Me localiser"
                            : "Ouvrir mon profil"}
                        </Text>
                        <ArrowRight size={18} color="#FFFFFF" />
                      </AnimatedPressable>
                    </View>
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
