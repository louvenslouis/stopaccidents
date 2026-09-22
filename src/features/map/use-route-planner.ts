import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import type {
  AccidentMarker,
  MapRoute,
  UserPosition,
} from "@/components/map-frame-props";
import { searchMapPlace, type MapPlace } from "./place-search";
import { fetchRoadRoutes, type RoadRoute } from "./routing";
import {
  distanceBetween,
  indexRoute,
  reportsOnRoute,
  routeProgress,
  type NavigationProgress,
} from "./route-geometry";
import type { useMapLocation } from "./use-map-location";

type Endpoint = { query: string; place: MapPlace | null; current: boolean };
const currentPosition = (): Endpoint => ({
  query: "Ma position",
  place: null,
  current: true,
});
const emptyEndpoint = (): Endpoint => ({
  query: "",
  place: null,
  current: false,
});
type Mode = "idle" | "starting" | "active" | "arrived";

export function useRoutePlanner(
  gps: ReturnType<typeof useMapLocation>,
  markers: AccidentMarker[],
) {
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState<Endpoint>(currentPosition);
  const [destination, setDestination] = useState<Endpoint>(emptyEndpoint);
  const [routes, setRoutes] = useState<RoadRoute[]>([]);
  const [selected, setSelected] = useState(0);
  const [status, setStatus] = useState<
    "idle" | "locating" | "loading" | "ready" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("idle");
  const [progress, setProgress] = useState<NavigationProgress | null>(null);
  const [fitRequest, setFitRequest] = useState(0);
  const request = useRef<AbortController | null>(null);
  const pending = useRef<"preview" | "navigate" | null>(null);
  const pendingTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const navigation = useRef({
    along: 0,
    lastFix: 0,
    offSince: 0,
    lastReroute: 0,
  });
  const {
    start,
    stop,
    pauseFollowing,
    location,
    tracking,
    locating,
    error: gpsError,
  } = gps;

  const cancel = useCallback(() => {
    request.current?.abort();
    request.current = null;
    pending.current = null;
    clearTimeout(pendingTimeout.current);
  }, []);

  useFocusEffect(
    useCallback(
      () => () => {
        cancel();
        setMode("idle");
        setProgress(null);
        setStatus((value) =>
          value === "loading" || value === "locating" ? "idle" : value,
        );
      },
      [cancel],
    ),
  );

  const reset = useCallback(() => {
    cancel();
    stop();
    setRoutes([]);
    setProgress(null);
    setMode("idle");
    setStatus("idle");
    setError(null);
  }, [cancel, stop]);

  const compute = useCallback(
    async (
      from: Endpoint,
      to: Endpoint,
      position: UserPosition | null,
      navigate: boolean,
      reroute = false,
    ) => {
      cancel();
      const controller = new AbortController();
      request.current = controller;
      setStatus("loading");
      setError(null);
      if (!reroute) setRoutes([]);
      const resolve = async (
        endpoint: Endpoint,
        label: string,
      ): Promise<MapPlace> => {
        if (endpoint.current) {
          if (!position)
            throw new Error(
              "Localisez votre position ou saisissez un lieu de départ.",
            );
          return { ...position, label: "Ma position" };
        }
        if (endpoint.place) return endpoint.place;
        let place: MapPlace | null;
        try {
          place = await searchMapPlace(endpoint.query, controller.signal);
        } catch {
          throw new Error(
            `Impossible de rechercher le lieu de ${label}. Vérifiez votre connexion puis réessayez.`,
          );
        }
        if (!place)
          throw new Error(
            `Lieu de ${label} introuvable en Haïti. Précisez votre recherche.`,
          );
        return place;
      };
      try {
        const a = await resolve(from, "départ");
        if (controller.signal.aborted) return;
        const b = await resolve(to, "destination");
        if (controller.signal.aborted) return;
        const result = await fetchRoadRoutes(a, b, controller.signal);
        if (controller.signal.aborted) return;
        setOrigin({ ...from, query: a.label, place: a });
        setDestination({ ...to, query: b.label, place: b });
        setRoutes(result);
        setSelected(0);
        setProgress(null);
        navigation.current = {
          along: 0,
          lastFix: Date.now(),
          offSince: 0,
          lastReroute: Date.now(),
        };
        setMode(navigate ? "active" : "idle");
        setStatus("ready");
        if (!navigate) {
          pauseFollowing();
          setFitRequest((value) => value + 1);
        }
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Calcul impossible. Réessayez.",
        );
        setStatus("error");
        if (!reroute) {
          setMode("idle");
          if (navigate) stop();
        }
      } finally {
        if (request.current === controller) request.current = null;
      }
    },
    [cancel, pauseFollowing, stop],
  );

  useEffect(() => {
    if (
      gpsError &&
      (pending.current || mode === "active" || mode === "starting")
    ) {
      cancel();
      setError(gpsError.message);
      setStatus("error");
      setMode("idle");
      setProgress(null);
    } else if (!tracking && !locating && (mode === "active" || mode === "starting")) {
      cancel();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Synchronize the planner with the external GPS session stopping in background.
      setMode("idle");
      setProgress(null);
      setStatus(routes.length ? "ready" : "idle");
    } else if (
      !tracking &&
      !locating &&
      !location.position &&
      pending.current
    ) {
      cancel();
      setMode("idle");
      setStatus("idle");
    }
  }, [
    gpsError,
    mode,
    tracking,
    locating,
    location.position,
    cancel,
    routes.length,
  ]);

  const indexed = useMemo(
    () =>
      routes.map((route) => ({ route, index: indexRoute(route.coordinates) })),
    [routes],
  );
  const choices = useMemo(
    () =>
      indexed.map((item) => ({
        ...item,
        reports: reportsOnRoute(item.index, markers),
      })),
    [indexed, markers],
  );
  const active = choices[selected] ?? null;

  useEffect(() => {
    const position = location.position;
    if (!pending.current || !position) return;
    const navigate = pending.current === "navigate";
    if (navigate && (position.accuracy === null || position.accuracy > 50))
      return;
    cancel();
    if (
      navigate &&
      active &&
      !destination.current &&
      distanceBetween(
        [position.longitude, position.latitude],
        active.route.coordinates[0],
      ) <= 75
    ) {
      // Keep the selected alternative when departing near its origin.
      navigation.current = {
        along: 0,
        lastFix: Date.now(),
        offSince: 0,
        lastReroute: Date.now(),
      };
      setProgress(null);
      setMode("active");
      setStatus("ready");
    } else
      void compute(
        navigate ? currentPosition() : origin,
        destination,
        position,
        navigate,
      );
  }, [location.position, origin, destination, compute, cancel, active]);

  useEffect(() => {
    if (mode !== "active" || !location.position || !active || request.current)
      return;
    const now = Date.now();
    const state = navigation.current;
    const next = routeProgress(
      active.index,
      location.position,
      state.along,
      Math.max(150, Math.min(1500, ((now - state.lastFix) / 1000) * 45 + 60)),
    );
    state.lastFix = now;
    state.along = next.along;
    setProgress(next);
    if (next.arrived) {
      setMode("arrived");
      stop();
      return;
    }
    if (next.offRoute) {
      state.offSince ||= now;
      if (now - state.offSince >= 5000 && now - state.lastReroute >= 20000) {
        state.lastReroute = now;
        void compute(
          currentPosition(),
          destination,
          location.position,
          true,
          true,
        );
      }
    } else state.offSince = 0;
  }, [location.position, active, mode, compute, destination, stop]);

  const calculate = () => {
    reset();
    if (origin.current || destination.current) {
      pending.current = "preview";
      setStatus("locating");
      start(false);
    } else void compute(origin, destination, null, false);
  };
  const begin = () => {
    cancel();
    setError(null);
    setMode("starting");
    setStatus("locating");
    pending.current = "navigate";
    // Always obtain a fresh fix; navigation starts where the device is now.
    start(true);
    pendingTimeout.current = setTimeout(() => {
      if (!pending.current) return;
      cancel();
      stop();
      setMode("idle");
      setStatus("error");
      setError(
        "Impossible d’obtenir une position assez précise. Réessayez à l’extérieur ou consultez le trajet sans guidage.",
      );
    }, 25000);
  };

  const mapRoute: MapRoute = useMemo(
    () =>
      active
        ? {
            coordinates: active.route.coordinates,
            origin: active.route.coordinates[0],
            destination: active.route.coordinates.at(-1)!,
            fitRequest,
          }
        : null,
    [active, fitRequest],
  );

  return {
    open,
    origin,
    destination,
    status,
    error,
    mode,
    progress,
    choices,
    active,
    selected,
    mapRoute,
    show(place: MapPlace) {
      reset();
      setOrigin(currentPosition());
      setDestination({ query: place.label, place, current: false });
      setOpen(true);
    },
    close() {
      reset();
      setOpen(false);
    },
    edit(which: "origin" | "destination", query: string) {
      reset();
      (which === "origin" ? setOrigin : setDestination)({
        query,
        place: null,
        current: false,
      });
    },
    useCurrentPosition() {
      reset();
      setOrigin(currentPosition());
    },
    swap() {
      reset();
      setOrigin(destination);
      setDestination(origin);
    },
    choose(index: number) {
      if (!choices[index]) return;
      setSelected(index);
      setProgress(null);
      pauseFollowing();
      setFitRequest((value) => value + 1);
    },
    fit() {
      pauseFollowing();
      setFitRequest((value) => value + 1);
    },
    calculate,
    begin,
    stopNavigation() {
      cancel();
      stop();
      setMode("idle");
      setProgress(null);
      setStatus(routes.length ? "ready" : "idle");
      setError(null);
    },
  };
}

export type RoutePlanner = ReturnType<typeof useRoutePlanner>;
