import { useAccident } from "@/features/accident-report/use-accident";
import { readStationRoutes } from "@/features/transport/api";
import {
  filterStations,
  routeFare,
  type TransportRoute,
  type TransportStation,
} from "@/features/transport/model";
import ArrowLeft from "lucide-react-native/icons/arrow-left";
import ArrowDown from "lucide-react-native/icons/arrow-down";
import BusFront from "lucide-react-native/icons/bus-front";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import MapPin from "lucide-react-native/icons/map-pin";
import Search from "lucide-react-native/icons/search";
import X from "lucide-react-native/icons/x";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type TransportStationsState = {
  data: TransportStation[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

function Refresh({
  loading,
  onPress,
}: {
  loading: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={loading}
      onPress={onPress}
      style={styles.refresh}
    >
      {loading ? (
        <ActivityIndicator color="#087F75" />
      ) : (
        <Text style={styles.link}>Actualiser</Text>
      )}
    </Pressable>
  );
}

function RouteCard({
  route,
  onShowStation,
}: {
  route: TransportRoute;
  onShowStation: (station: TransportStation) => void;
}) {
  const fare = routeFare(route);
  return (
    <View style={styles.routeCard}>
      <View style={styles.row}>
        <View style={styles.vehicleBadge}>
          <BusFront size={16} color="#087F75" />
          <Text style={styles.vehicleText}>{route.vehicle.label}</Text>
        </View>
        <View style={styles.fare}>
          <Text style={styles.caption}>{fare.label}</Text>
          <Text style={styles.amount}>{fare.amount}</Text>
        </View>
      </View>
      <View style={styles.routeStops}>
        <View style={styles.stopRow}>
          <View style={styles.departureDot} />
          <View style={styles.grow}>
            <Text style={styles.caption}>Départ</Text>
            <Text style={styles.stopName}>{route.departure.name}</Text>
          </View>
        </View>
        <ArrowDown size={14} color="#8FACA7" style={styles.routeArrow} />
        <View style={styles.stopRow}>
          <MapPin size={18} color="#087F75" />
          <View style={styles.grow}>
            <Text style={styles.caption}>Arrivée</Text>
            <Text style={styles.stopName}>{route.arrival.name}</Text>
            <Text style={styles.caption}>{route.arrival.commune}</Text>
          </View>
        </View>
      </View>
      {fare.detail && <Text style={styles.fareDetail}>{fare.detail}</Text>}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Voir l’arrivée : ${route.arrival.name}`}
        onPress={() => onShowStation(route.arrival)}
        style={styles.arrivalButton}
      >
        <Text style={styles.link}>Voir l’arrivée sur la carte</Text>
        <ChevronRight size={16} color="#087F75" />
      </Pressable>
    </View>
  );
}

function StationDetails({
  station,
  onShowStation,
}: {
  station: TransportStation;
  onShowStation: (station: TransportStation) => void;
}) {
  const loader = useCallback(
    (signal: AbortSignal) => readStationRoutes(station.id, signal),
    [station.id],
  );
  const routes = useAccident(loader);
  const [vehicle, setVehicle] = useState("all");
  const vehicles = useMemo(
    () => [
      ...new Map(
        (routes.data ?? []).map((route) => [
          route.vehicle_type,
          route.vehicle.label,
        ]),
      ).entries(),
    ],
    [routes.data],
  );
  const filtered =
    routes.data?.filter(
      (route) => vehicle === "all" || route.vehicle_type === vehicle,
    ) ?? [];
  return (
    <>
      <View style={styles.stationIntro}>
        <Text style={styles.commune}>{station.commune}</Text>
        {station.address.length > 0 && (
          <Text style={styles.body}>{station.is_demo ? station.address.replace(/^Exemple /, "") : station.address}</Text>
        )}
        <Pressable
          accessibilityRole="button"
          onPress={() => onShowStation(station)}
          style={styles.mapButton}
        >
          <MapPin size={18} color="#FFFFFF" />
          <Text style={styles.mapButtonText}>
            Voir cette station sur la carte
          </Text>
        </Pressable>
      </View>
      <View style={styles.sectionHeading}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          Trajets au départ
        </Text>
        {routes.data && (
          <Text style={styles.caption}>
            {routes.data.length} trajet{routes.data.length > 1 ? "s" : ""}
          </Text>
        )}
      </View>
      {vehicles.length > 1 && (
        <View style={styles.filters}>
          {[["all", "Tous"], ...vehicles].map(([code, label]) => (
            <Pressable
              key={code}
              accessibilityRole="button"
              accessibilityState={{ selected: code === vehicle }}
              onPress={() => setVehicle(code)}
              style={[styles.filter, code === vehicle && styles.activeFilter]}
            >
              <Text
                style={[
                  styles.filterText,
                  code === vehicle && styles.activeFilterText,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      {routes.error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {routes.error}
        </Text>
      )}
      {routes.loading && !routes.data && (
        <ActivityIndicator color="#087F75" style={styles.loader} />
      )}
      {!routes.loading && !routes.error && filtered.length === 0 && (
        <Text style={styles.empty}>
          Aucun trajet {vehicle === "all" ? "" : "pour ce véhicule "}n’est
          encore renseigné au départ de cette station.
        </Text>
      )}
      {filtered.map((route) => (
        <RouteCard key={route.id} route={route} onShowStation={onShowStation} />
      ))}
      <Refresh loading={routes.loading} onPress={routes.refresh} />
    </>
  );
}

export function TransportStationsSheet({
  stations,
  initialStation,
  onClose,
  onShowStation,
}: {
  stations: TransportStationsState;
  initialStation: TransportStation | null;
  onClose: () => void;
  onShowStation: (station: TransportStation) => void;
}) {
  const [selected, setSelected] = useState(initialStation);
  const [query, setQuery] = useState("");
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const filtered = useMemo(
    () => filterStations(stations.data ?? [], query),
    [stations.data, query],
  );
  return (
    <Modal
      visible
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, width >= 700 && styles.wideOverlay]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fermer les stations"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            width >= 700 && styles.wideSheet,
            {
              maxHeight: height - insets.top - 20,
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            {selected ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Retour à la liste des stations"
                onPress={() => setSelected(null)}
                style={styles.close}
              >
                <ArrowLeft size={21} color="#087F75" />
              </Pressable>
            ) : (
              <View style={styles.icon}>
                <BusFront size={25} color="#087F75" />
              </View>
            )}
            <View style={styles.grow}>
              <Text style={styles.eyebrow}>TRANSPORT EN COMMUN</Text>
              <Text accessibilityRole="header" style={styles.title}>
                {selected?.name ?? "Stations"}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fermer les stations"
              onPress={onClose}
              style={styles.close}
            >
              <X size={21} color="#667185" />
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            {selected ? (
              <StationDetails
                key={selected.id}
                station={selected}
                onShowStation={onShowStation}
              />
            ) : (
              <>
                <Text style={styles.body}>
                  Trouvez votre station, les trajets disponibles et leurs
                  tarifs.
                </Text>
                <View style={styles.search}>
                  <Search size={19} color="#71827F" />
                  <TextInput
                    accessibilityLabel="Rechercher une station"
                    placeholder="Station ou commune"
                    value={query}
                    onChangeText={setQuery}
                    autoCorrect={false}
                    style={styles.searchInput}
                  />
                </View>
                <View style={styles.sectionHeading}>
                  <Text style={styles.sectionTitle}>Stations disponibles</Text>
                  {stations.data && (
                    <Text style={styles.caption}>{filtered.length}</Text>
                  )}
                </View>
                {stations.error && (
                  <Text accessibilityRole="alert" style={styles.error}>
                    {stations.error}
                  </Text>
                )}
                {stations.loading && !stations.data && (
                  <ActivityIndicator color="#087F75" style={styles.loader} />
                )}
                {!stations.loading &&
                  !stations.error &&
                  filtered.length === 0 && (
                    <Text style={styles.empty}>
                      {query.trim()
                        ? "Aucune station ne correspond à votre recherche."
                        : "Aucune station disponible pour le moment."}
                    </Text>
                  )}
                {filtered.map((station) => (
                  <Pressable
                    key={station.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${station.name}, ${station.commune}`}
                    onPress={() => setSelected(station)}
                    style={styles.stationRow}
                  >
                    <View style={styles.smallIcon}>
                      <BusFront size={21} color="#087F75" />
                    </View>
                    <View style={styles.grow}>
                      <Text style={styles.stationName}>{station.name}</Text>
                      <Text style={styles.caption}>{station.commune}</Text>
                    </View>
                    <ChevronRight size={19} color="#8B9B98" />
                  </Pressable>
                ))}
                <Refresh
                  loading={stations.loading}
                  onPress={stations.refresh}
                />
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    backgroundColor: "rgba(19, 28, 44, 0.42)",
  },
  wideOverlay: { justifyContent: "center", padding: 24 },
  sheet: {
    width: "100%",
    maxWidth: 580,
    flexShrink: 1,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
  },
  wideSheet: { borderRadius: 28 },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#DDE6E3",
    alignSelf: "center",
    marginTop: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#EDF2F0",
  },
  grow: { flex: 1, minWidth: 0 },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#E6F5EF",
    justifyContent: "center",
    alignItems: "center",
  },
  smallIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#EAF6F1",
    justifyContent: "center",
    alignItems: "center",
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.1,
    color: "#087F75",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#203A35",
    marginTop: 5,
    letterSpacing: -0.5,
  },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F3F6F5",
    alignItems: "center",
    justifyContent: "center",
  },
  content: { padding: 20, gap: 14 },
  body: { fontSize: 14, lineHeight: 21, color: "#667A75" },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F3F6F5",
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    fontSize: 15,
    color: "#203A35",
  },
  sectionHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#243D37" },
  caption: { fontSize: 12, lineHeight: 18, color: "#6C807A" },
  stationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E7EFEB",
  },
  stationName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#233B35",
    marginBottom: 3,
  },
  stationIntro: { gap: 8 },
  commune: { fontSize: 16, fontWeight: "600", color: "#314E45" },
  mapButton: {
    minHeight: 46,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#087F75",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginTop: 4,
  },
  mapButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
    flexShrink: 1,
  },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  filter: {
    minHeight: 44,
    paddingHorizontal: 17,
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: "#F0F5F3",
  },
  activeFilter: { backgroundColor: "#087F75" },
  filterText: { color: "#5C756C", fontSize: 13, fontWeight: "600" },
  activeFilterText: { color: "#FFFFFF" },
  routeCard: {
    borderWidth: 1,
    borderColor: "#E1ECE7",
    borderRadius: 20,
    padding: 16,
    gap: 14,
    backgroundColor: "#FCFEFD",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    flexWrap: "wrap",
  },
  vehicleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#EAF6F1",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
  },
  vehicleText: { color: "#087F75", fontWeight: "700", fontSize: 12 },
  fare: { alignItems: "flex-end" },
  amount: { fontSize: 21, fontWeight: "700", color: "#163D32", marginTop: 2 },
  routeStops: { gap: 4 },
  stopRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  departureDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 3,
    borderColor: "#9DB9AD",
    marginHorizontal: 3,
  },
  routeArrow: { marginLeft: 2 },
  stopName: {
    color: "#233D34",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 21,
  },
  fareDetail: { fontSize: 11, lineHeight: 17, color: "#7A7460" },
  arrivalButton: {
    minHeight: 44,
    borderTopWidth: 1,
    borderTopColor: "#EAF0ED",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    paddingTop: 10,
  },
  link: { color: "#087F75", fontSize: 13, fontWeight: "600" },
  refresh: {
    minHeight: 46,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F0F6F3",
    borderRadius: 14,
  },
  empty: {
    paddingVertical: 24,
    fontSize: 14,
    color: "#76897F",
    lineHeight: 22,
    textAlign: "center",
  },
  error: { color: "#AD4230", fontSize: 13, lineHeight: 20 },
  loader: { padding: 26 },
});
