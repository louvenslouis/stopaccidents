import { HAITI_BOUNDS } from "@/components/map-document";
import type { MapPlace } from "./place-search";
import { distanceBetween, type Coordinate } from "./route-geometry";

const endpoint =
  process.env.EXPO_PUBLIC_ROUTING_URL ||
  "https://router.project-osrm.org/route/v1/driving";
export type RouteStep = {
  instruction: string;
  distance: number;
  duration: number;
  at: number;
};
export type RoadRoute = {
  id: string;
  coordinates: Coordinate[];
  distance: number;
  duration: number;
  steps: RouteStep[];
  summary: string;
};
const invalid = () =>
  new Error("Le service a renvoyé un itinéraire invalide. Réessayez.");
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const positive = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const text = (value: unknown) =>
  typeof value === "string" ? value.trim().slice(0, 160) : "";
const validCoordinate = (value: unknown): value is Coordinate =>
  Array.isArray(value) &&
  value.length >= 2 &&
  typeof value[0] === "number" &&
  typeof value[1] === "number" &&
  Number.isFinite(value[0]) &&
  Number.isFinite(value[1]) &&
  value[1] >= HAITI_BOUNDS[0][0] &&
  value[1] <= HAITI_BOUNDS[1][0] &&
  value[0] >= HAITI_BOUNDS[0][1] &&
  value[0] <= HAITI_BOUNDS[1][1];

export function maneuverInstruction(value: unknown, roadName: unknown) {
  const maneuver = record(value);
  const name = text(roadName);
  const road = name ? ` sur ${name}` : "";
  const modifier = text(maneuver.modifier);
  const direction = modifier.includes("left")
    ? "à gauche"
    : modifier.includes("right")
      ? "à droite"
      : "tout droit";
  switch (maneuver.type) {
    case "depart":
      return `Prenez la route${road}`;
    case "arrive":
      return "Rejoignez le point d’arrivée";
    case "roundabout":
    case "rotary":
    case "roundabout turn":
      return positive(maneuver.exit) && maneuver.exit > 0
        ? `Au rond-point, prenez la sortie ${maneuver.exit}${road}`
        : `Entrez dans le rond-point${road}`;
    case "exit roundabout":
    case "exit rotary":
      return `Sortez du rond-point${road}`;
    case "on ramp":
      return `Prenez la bretelle ${direction}${road}`;
    case "off ramp":
      return `Prenez la sortie ${direction}${road}`;
    case "merge":
      return `Rejoignez la voie ${direction}${road}`;
    case "fork":
      return `Restez ${direction}${road}`;
    default:
      if (modifier === "uturn") return `Faites demi-tour${road}`;
      if (modifier.includes("left") || modifier.includes("right"))
        return `Tournez ${direction}${road}`;
      return `Continuez tout droit${road}`;
  }
}

export function parseRoutes(payload: unknown): RoadRoute[] {
  const data = record(payload);
  if (data.code === "NoRoute" || data.code === "NoSegment")
    throw new Error(
      "Aucun trajet routier trouvé entre ces lieux. Choisissez des points plus proches d’une route.",
    );
  if (data.code !== "Ok" || !Array.isArray(data.routes) || !data.routes.length)
    throw invalid();
  return data.routes.slice(0, 3).map((value, i) => {
    const route = record(value);
    const geometry = record(route.geometry);
    if (
      geometry.type !== "LineString" ||
      !Array.isArray(geometry.coordinates) ||
      geometry.coordinates.length < 2 ||
      geometry.coordinates.length > 100000 ||
      !geometry.coordinates.every(validCoordinate) ||
      !positive(route.distance) ||
      route.distance < 10 ||
      !positive(route.duration) ||
      !Array.isArray(route.legs)
    )
      throw invalid();
    let at = 0;
    const steps: RouteStep[] = [];
    const summaries: string[] = [];
    for (const item of route.legs) {
      const leg = record(item);
      if (!Array.isArray(leg.steps) || !leg.steps.length) throw invalid();
      if (text(leg.summary)) summaries.push(text(leg.summary));
      for (const raw of leg.steps) {
        const step = record(raw);
        if (
          !positive(step.distance) ||
          !positive(step.duration) ||
          typeof record(step.maneuver).type !== "string"
        )
          throw invalid();
        steps.push({
          instruction: maneuverInstruction(step.maneuver, step.name),
          distance: step.distance,
          duration: step.duration,
          at,
        });
        at += step.distance;
      }
    }
    if (!steps.length) throw invalid();
    return {
      id: `route-${i}`,
      coordinates: geometry.coordinates.map((p) => [p[0], p[1]]),
      distance: route.distance,
      duration: route.duration,
      steps,
      summary: summaries.join(" · ") || `Trajet ${i + 1}`,
    };
  });
}

export async function fetchRoadRoutes(
  origin: MapPlace,
  destination: MapPlace,
  signal: AbortSignal,
): Promise<RoadRoute[]> {
  const a: Coordinate = [origin.longitude, origin.latitude],
    b: Coordinate = [destination.longitude, destination.latitude];
  if (!validCoordinate(a) || !validCoordinate(b))
    throw new Error(
      "Choisissez un départ et une arrivée dans la zone d’Haïti couverte.",
    );
  if (distanceBetween(a, b) < 25)
    throw new Error(
      "Le départ et l’arrivée sont trop proches. Choisissez un autre lieu.",
    );
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  const timeout = setTimeout(abort, 15000);
  try {
    const url = new URL(
      `${endpoint.replace(/\/$/, "")}/${a.join(",")};${b.join(",")}`,
    );
    url.searchParams.set("geometries", "geojson");
    url.searchParams.set("overview", "full");
    url.searchParams.set("steps", "true");
    url.searchParams.set("alternatives", "true");
    url.searchParams.set("radiuses", "100;100");
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      credentials: "omit",
    });
    if (!response.ok)
      throw new Error(
        "Le calcul d’itinéraire est indisponible. Vérifiez votre connexion puis réessayez.",
      );
    const routes = parseRoutes(await response.json());
    if (
      routes.some(
        (route) =>
          distanceBetween(a, route.coordinates[0]) > 150 ||
          distanceBetween(b, route.coordinates.at(-1)!) > 150,
      )
    )
      throw invalid();
    return routes;
  } catch (error) {
    if (controller.signal.aborted && !signal.aborted)
      throw new Error("Le calcul prend trop de temps. Réessayez.");
    if (error instanceof TypeError)
      throw new Error(
        "Connexion au service d’itinéraire impossible. Réessayez.",
      );
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}
