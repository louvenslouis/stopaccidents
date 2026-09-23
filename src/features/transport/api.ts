import { supabase } from "@/lib/supabase";
import type { TransportRoute, TransportStation } from "./model";

const STATION_COLUMNS =
  "id, name, commune, address, latitude, longitude, is_demo";
const PAGE_SIZE = 500;

export async function readTransportStations(
  signal: AbortSignal,
): Promise<TransportStation[]> {
  const stations: TransportStation[] = [];
  // Explicit pagination avoids silently hiding stations beyond the API row limit.
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("transport_stations")
      .select(STATION_COLUMNS)
      .eq("is_active", true)
      .order("name")
      .order("id")
      .range(offset, offset + PAGE_SIZE - 1)
      .abortSignal(signal);
    if (error)
      throw new Error("Impossible de charger les stations. Réessayez.");
    stations.push(...((data as TransportStation[]) ?? []));
    if (!data || data.length < PAGE_SIZE) return stations;
  }
}

export async function readStationRoutes(
  id: string,
  signal: AbortSignal,
): Promise<TransportRoute[]> {
  const routes: TransportRoute[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("transport_routes")
      .select(
        `
      id, vehicle_type, official_fare_htg, fare_reference, fare_effective_from, is_demo,
      vehicle:transport_vehicle_types!vehicle_type(label),
      departure:transport_stations!departure_station_id!inner(${STATION_COLUMNS}),
      arrival:transport_stations!arrival_station_id!inner(${STATION_COLUMNS})
    `,
      )
      .eq("departure_station_id", id)
      .eq("is_active", true)
      .order("vehicle_type")
      .order("id")
      .range(offset, offset + PAGE_SIZE - 1)
      .abortSignal(signal);
    if (error)
      throw new Error(
        "Impossible de charger les trajets de cette station. Réessayez.",
      );
    routes.push(...((data as unknown as TransportRoute[]) ?? []));
    if (!data || data.length < PAGE_SIZE) return routes;
  }
}
