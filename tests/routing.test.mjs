import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

async function compile(path, dependencies = {}, globals = {}) {
  const source = await readFile(`src/${path}.ts`, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const exports = {};
  new Function("exports", "require", ...Object.keys(globals), outputText)(
    exports,
    (name) => {
      assert.ok(name in dependencies, `Missing dependency ${name}`);
      return dependencies[name];
    },
    ...Object.values(globals),
  );
  return exports;
}
const geometry = await compile("features/map/route-geometry");
const document = await compile("components/map-document");
const dependencies = {
  "@/components/map-document": document,
  "./route-geometry": geometry,
};
const routing = await compile("features/map/routing", dependencies);
const start = [-72.3, 18.5],
  end = [-72.29, 18.5];
const place = (coordinate, label = "Lieu") => ({
  longitude: coordinate[0],
  latitude: coordinate[1],
  label,
});
const fix = (coordinate, accuracy = 10) => ({ ...place(coordinate), accuracy });
const marker = (id, coordinate, priority = 1) => ({
  id,
  ...place(coordinate),
  priority,
  title: id,
  illustration: "accident",
  color: "#1767A6",
});
const payload = () => ({
  code: "Ok",
  routes: [
    {
      distance: 1054,
      duration: 120,
      geometry: { type: "LineString", coordinates: [start, end] },
      legs: [
        {
          summary: "Rue A",
          steps: [
            {
              distance: 1054,
              duration: 120,
              name: "Rue A",
              maneuver: { type: "depart" },
            },
            { distance: 0, duration: 0, maneuver: { type: "arrive" } },
          ],
        },
      ],
    },
  ],
});

test("segment matching finds reports between vertices, excludes distant roads, deduplicates and orders travel", () => {
  const index = geometry.indexRoute([start, start, end]);
  const matches = geometry.reportsOnRoute(index, [
    marker("late", [-72.291, 18.5001]),
    marker("early", [-72.299, 18.5001]),
    marker("outside", [-72.295, 18.502]),
    marker("early", [-72.299, 18.5001]),
    marker("before", [-72.301, 18.5]),
    marker("invalid", [NaN, 18.5]),
  ]);
  assert.deepEqual(
    matches.map((item) => item.marker.id),
    ["early", "late"],
  );
  assert.ok(matches[0].offset > 10 && matches[0].offset < 12);
  assert.ok(matches[0].along > 100 && matches[0].along < 110);
  assert.deepEqual(
    geometry
      .reportsOnRoute(
        geometry.indexRoute([end, start]),
        matches.map((m) => m.marker),
      )
      .map((m) => m.marker.id),
    ["late", "early"],
  );
});

test("corridor boundary and indexed matching agree with full projection", () => {
  const index = geometry.indexRoute([
    start,
    [-72.295, 18.5],
    [-72.295, 18.51],
    [-72.28, 18.51],
  ]);
  const points = Array.from({ length: 150 }, (_, i) =>
    marker(String(i), [-72.301 + i / 7500, 18.5 + Math.sin(i) / 1200]),
  );
  const expected = points
    .filter(
      (m) =>
        geometry.projectOnRoute(index, [m.longitude, m.latitude]).offset <=
        geometry.REPORT_CORRIDOR_METERS,
    )
    .map((m) => m.id)
    .sort();
  assert.deepEqual(
    geometry
      .reportsOnRoute(index, points)
      .map((m) => m.marker.id)
      .sort(),
    expected,
  );
});

test("GPS progress is monotonic, rejects poor accuracy, detects off-route and arrival", () => {
  const index = geometry.indexRoute([start, end]);
  const first = geometry.routeProgress(index, fix([-72.299, 18.5]));
  assert.ok(first.along > 100);
  assert.equal(
    geometry.routeProgress(index, fix([-72.2991, 18.5]), first.along).along,
    first.along,
  );
  const uncertain = geometry.routeProgress(index, fix(end, 200), first.along);
  assert.equal(uncertain.uncertain, true);
  assert.equal(uncertain.arrived, false);
  assert.equal(uncertain.along, first.along);
  assert.equal(geometry.routeProgress(index, fix(start, null)).uncertain, true);
  assert.equal(
    geometry.routeProgress(index, fix([-72.299, 18.503]), first.along).offRoute,
    true,
  );
  const arrived = geometry.routeProgress(index, fix(end), index.length - 100);
  assert.equal(arrived.arrived, true);
  assert.equal(arrived.remaining, 0);
});

test("a crossing does not jump to the end of a loop or announce early arrival", () => {
  const index = geometry.indexRoute([
    start,
    end,
    [-72.29, 18.51],
    [-72.3, 18.51],
    start,
  ]);
  const next = geometry.routeProgress(index, fix(start), 0);
  assert.equal(next.along, 0);
  assert.equal(next.arrived, false);
  assert.ok(next.remaining > 4000);
});

test("OSRM parser validates real geometry, metrics, errors and French directions", () => {
  const route = routing.parseRoutes(payload())[0];
  assert.equal(route.steps[1].at, 1054);
  assert.equal(route.steps[0].instruction, "Prenez la route sur Rue A");
  assert.equal(
    routing.maneuverInstruction({ type: "turn", modifier: "left" }, "Rue B"),
    "Tournez à gauche sur Rue B",
  );
  assert.match(
    routing.maneuverInstruction({ type: "roundabout", exit: 2 }, ""),
    /sortie 2/,
  );
  assert.throws(() => routing.parseRoutes({ code: "NoRoute" }), /Aucun trajet/);
  for (const mutate of [
    (r) => {
      r.geometry.coordinates[0] = [200, 80];
    },
    (r) => {
      r.distance = NaN;
    },
    (r) => {
      r.duration = -1;
    },
    (r) => {
      r.geometry.coordinates = [start];
    },
    (r) => {
      r.legs = [];
    },
  ]) {
    const data = structuredClone(payload());
    mutate(data.routes[0]);
    assert.throws(() => routing.parseRoutes(data), /invalide/);
  }
});

test("routing request uses driving roads, full GeoJSON, alternatives, bounded snapping and cancellation", async () => {
  let requested;
  const api = await compile("features/map/routing", dependencies, {
    fetch: async (url, options) => {
      requested = { url: new URL(url), options };
      return { ok: true, json: async () => payload() };
    },
  });
  await api.fetchRoadRoutes(
    place(start),
    place(end),
    new AbortController().signal,
  );
  assert.match(requested.url.pathname, /driving\/-72.3,18.5;-72.29,18.5$/);
  assert.equal(requested.url.searchParams.get("overview"), "full");
  assert.equal(requested.url.searchParams.get("alternatives"), "true");
  assert.equal(requested.url.searchParams.get("radiuses"), "100;100");
  assert.equal(requested.options.credentials, "omit");
  await assert.rejects(
    api.fetchRoadRoutes(
      place(start),
      place(start),
      new AbortController().signal,
    ),
    /trop proches/,
  );
  const slow = await compile("features/map/routing", dependencies, {
    fetch: (_, { signal }) =>
      new Promise((_, reject) =>
        signal.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        ),
      ),
  });
  const controller = new AbortController();
  const pending = slow.fetchRoadRoutes(
    place(start),
    place(end),
    controller.signal,
  );
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
});

test("routing handles network failures and timeouts without fabricating a direct line", async () => {
  for (const fetch of [
    async () => {
      throw new TypeError("offline");
    },
    async () => ({ ok: false }),
  ]) {
    const api = await compile("features/map/routing", dependencies, { fetch });
    await assert.rejects(
      api.fetchRoadRoutes(
        place(start),
        place(end),
        new AbortController().signal,
      ),
      /[Cc]onnexion/,
    );
  }
  let timeout;
  const api = await compile("features/map/routing", dependencies, {
    fetch: (_, { signal }) =>
      new Promise((_, reject) =>
        signal.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        ),
      ),
    setTimeout: (fn) => {
      timeout = fn;
      return 1;
    },
    clearTimeout() {},
  });
  const pending = api.fetchRoadRoutes(
    place(start),
    place(end),
    new AbortController().signal,
  );
  timeout();
  await assert.rejects(pending, /trop de temps/);
});

async function plannerFixture({ delayed = false } = {}) {
  const hooks = [];
  let cursor = 0,
    dirty = true,
    effects = [],
    value,
    now = 100000,
    timeout;
  const calls = [];
  const gps = {
    location: { position: null },
    tracking: false,
    locating: false,
    error: null,
    start(continuous) {
      this.stop();
      gps.tracking = continuous;
      gps.locating = true;
      gps.error = null;
      dirty = true;
    },
    stop() {
      gps.tracking = false;
      gps.locating = false;
      gps.location = { position: null };
      dirty = true;
    },
    pauseFollowing() {},
  };
  // Methods are destructured by the hook, as they are in the real GPS hook.
  gps.start = gps.start.bind(gps);
  const changed = (a, b) =>
    !a || a.length !== b.length || a.some((x, i) => x !== b[i]);
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in hooks))
        hooks[i] = typeof initial === "function" ? initial() : initial;
      return [
        hooks[i],
        (next) => {
          const newValue = typeof next === "function" ? next(hooks[i]) : next;
          if (!Object.is(newValue, hooks[i])) {
            hooks[i] = newValue;
            dirty = true;
          }
        },
      ];
    },
    useRef(initial) {
      const i = cursor++;
      return (hooks[i] ??= { current: initial });
    },
    useMemo(fn, deps) {
      const i = cursor++;
      if (!hooks[i] || changed(hooks[i].deps, deps))
        hooks[i] = { deps, value: fn() };
      return hooks[i].value;
    },
    useCallback(fn, deps) {
      return react.useMemo(() => fn, deps);
    },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!hooks[i] || changed(hooks[i].deps, deps)) {
        const previous = hooks[i];
        hooks[i] = { deps };
        effects.push(() => {
          previous?.cleanup?.();
          hooks[i].cleanup = fn();
        });
      }
    },
  };
  const routes = routing.parseRoutes(payload());
  routes.push({ ...routes[0], id: 'alternative', duration: 150 });
  const exports = await compile(
    "features/map/use-route-planner",
    {
      react,
      "expo-router": { useFocusEffect: (fn) => react.useEffect(fn, [fn]) },
      "./route-geometry": geometry,
      "./place-search": {
        searchMapPlace: async (query) =>
          place(query === "Départ" ? start : end, query),
      },
      "./routing": {
        fetchRoadRoutes: (a, b, signal) => {
          const call = { a, b, signal };
          calls.push(call);
          return delayed
            ? new Promise((resolve, reject) => {
                call.resolve = resolve;
                call.reject = reject;
              })
            : Promise.resolve(routes);
        },
      },
    },
    {
      Date: { now: () => now },
      setTimeout: (fn) => {
        timeout = fn;
        return 1;
      },
      clearTimeout: () => {
        timeout = undefined;
      },
    },
  );
  const markers = [];
  const render = () => {
    cursor = 0;
    dirty = false;
    value = exports.useRoutePlanner(gps, markers);
    const queue = effects;
    effects = [];
    queue.forEach((run) => run());
  };
  const flush = async () => {
    for (let i = 0; i < 40; i++) {
      if (dirty) render();
      await Promise.resolve();
    }
    assert.equal(dirty, false, "Hook must settle");
    return value;
  };
  await flush();
  return {
    calls,
    gps,
    routes,
    flush,
    get value() {
      return value;
    },
    emit(point, elapsed = 1000) {
      now += elapsed;
      gps.location = { position: fix(point) };
      gps.locating = false;
      dirty = true;
    },
    expire() {
      timeout?.();
    },
    blur() {
      hooks.forEach((entry) => entry?.cleanup?.());
    },
  };
}

async function preview(f) {
  f.value.show(place(end, "Arrivée"));
  await f.flush();
  f.value.edit("origin", "Départ");
  await f.flush();
  f.value.calculate();
  await f.flush();
}

test("home journey shortcuts prefill saved endpoints and custom journeys reset them", async () => {
  const f = await plannerFixture();
  f.value.show(place(end, "Travail"), place(start, "Domicile"));
  await f.flush();
  assert.equal(f.value.open, true);
  assert.equal(f.value.origin.query, "Domicile");
  assert.equal(f.value.origin.current, false);
  assert.equal(f.value.destination.query, "Travail");
  f.value.calculate();
  await f.flush();
  assert.equal(f.value.status, "ready");
  assert.equal(f.gps.tracking, false);
  f.value.show();
  await f.flush();
  assert.equal(f.value.origin.current, true);
  assert.equal(f.value.destination.query, "");
  assert.equal(f.value.destination.place, null);
  assert.equal(f.value.choices.length, 0);
});

test("editing or closing a planner aborts pending results and prevents stale routes from reappearing", async () => {
  const f = await plannerFixture({ delayed: true });
  await preview(f);
  assert.equal(f.value.status, "loading");
  f.value.edit("destination", "Autre lieu");
  await f.flush();
  assert.equal(f.calls[0].signal.aborted, true);
  f.calls[0].resolve(f.routes);
  await f.flush();
  assert.equal(f.value.choices.length, 0);
  assert.equal(f.value.destination.query, "Autre lieu");
  f.value.calculate();
  await f.flush();
  f.value.close();
  await f.flush();
  f.calls[1].resolve(f.routes);
  await f.flush();
  assert.equal(f.value.open, false);
  assert.equal(f.value.choices.length, 0);
});

test("manual preview needs no GPS; navigation keeps its route, confirms deviations and throttles reroutes", async () => {
  const f = await plannerFixture();
  await preview(f);
  assert.equal(f.value.status, "ready");
  assert.equal(f.gps.tracking, false);
  assert.equal(f.calls.length, 1);
  f.value.choose(1);
  await f.flush();
  f.value.begin();
  await f.flush();
  assert.equal(f.value.mode, "starting");
  f.emit(start);
  await f.flush();
  assert.equal(f.value.mode, "active");
  assert.equal(f.value.selected, 1, 'The selected alternative survives GPS startup');
  assert.equal(
    f.calls.length,
    1,
    "Starting at the selected route preserves it",
  );
  f.emit([-72.299, 18.5]);
  await f.flush();
  assert.ok(f.value.progress.along > 100);
  f.emit([-72.298, 18.503], 22000);
  await f.flush();
  assert.equal(f.value.progress.offRoute, true);
  assert.equal(f.calls.length, 1);
  f.emit([-72.298, 18.503], 6000);
  await f.flush();
  assert.equal(f.calls.length, 2);
  f.emit([-72.298, 18.503], 6000);
  await f.flush();
  assert.equal(f.calls.length, 2, "Avoid repeatedly calling the router");
  f.value.stopNavigation();
  await f.flush();
  assert.equal(f.gps.tracking, false);
  assert.equal(f.value.mode, "idle");
});

test("GPS refusal, imprecise fixes, timeout and background cancel pending navigation", async () => {
  for (const failure of ["denied", "timeout", "background"]) {
    const f = await plannerFixture();
    await preview(f);
    f.value.begin();
    await f.flush();
    if (failure === "denied") {
      f.gps.error = new Error("Autorisez la localisation");
      f.gps.stop();
    } else if (failure === "background") f.gps.stop();
    else {
      f.emit(start);
      f.gps.location.position.accuracy = 300;
      await f.flush();
      assert.equal(f.value.mode, "starting");
      f.expire();
    }
    await f.flush();
    assert.equal(f.value.mode, "idle");
    assert.equal(f.gps.tracking, false);
    assert.equal(f.calls.length, 1);
  }
});
