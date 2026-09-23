import { HAITI_BOUNDS } from "@/components/map-document";
import type { StationMarker } from "@/components/map-frame-props";

export type TransportStation = {
  id: string;
  name: string;
  commune: string;
  address: string;
  latitude: number;
  longitude: number;
  is_demo: boolean;
};

export type TransportRoute = {
  id: string;
  vehicle_type: string;
  vehicle: { label: string };
  departure: TransportStation;
  arrival: TransportStation;
  official_fare_htg: number | null;
  fare_reference: string | null;
  fare_effective_from: string | null;
  is_demo: boolean;
};

export function stationMarkers(stations: TransportStation[]): StationMarker[] {
  return stations
    .filter(
      (station) =>
        Number.isFinite(station.latitude) &&
        Number.isFinite(station.longitude) &&
        station.latitude >= HAITI_BOUNDS[0][0] &&
        station.latitude <= HAITI_BOUNDS[1][0] &&
        station.longitude >= HAITI_BOUNDS[0][1] &&
        station.longitude <= HAITI_BOUNDS[1][1],
    )
    .map((station) => ({
      id: station.id,
      latitude: station.latitude,
      longitude: station.longitude,
      title: station.name,
    }));
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .trim();
}

export function filterStations(stations: TransportStation[], query: string) {
  const terms = normalize(query).split(/\s+/);
  return stations.filter((station) => {
    const text = normalize(
      `${station.name} ${station.commune} ${station.address}`,
    );
    return terms.every((term) => text.includes(term));
  });
}

export function routeFare(route: TransportRoute) {
  const demo =
    route.is_demo || route.departure.is_demo || route.arrival.is_demo;
  const amount = route.official_fare_htg;
  if (amount === null || !Number.isFinite(amount) || amount < 0) {
    return {
      amount: "Non renseigné",
      label: demo ? "Tarif" : "Tarif de l’État",
      detail: null,
    };
  }
  const formatted = `${amount.toLocaleString("fr-HT", { maximumFractionDigits: 2 })} HTG`;
  if (demo)
    return {
      amount: formatted,
      label: "Tarif",
      detail: null,
    };
  // Do not turn an amount without an official reference into a claimed state fare.
  if (!route.fare_reference?.trim() || !route.fare_effective_from) {
    return {
      amount: "À confirmer",
      label: "Tarif de l’État",
      detail: "Référence officielle non renseignée",
    };
  }
  const date = new Date(
    `${route.fare_effective_from}T12:00:00Z`,
  ).toLocaleDateString("fr-HT", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Port-au-Prince",
  });
  return {
    amount: formatted,
    label: "Tarif de l’État",
    detail: `Applicable à partir du ${date} · ${route.fare_reference}`,
  };
}
