import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

async function compile(path, dependencies = {}, globals = {}) {
  const source = await readFile(path, 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } });
  const exports = {};
  new Function('exports', 'require', ...Object.keys(globals), outputText)(exports, (name) => {
    assert.ok(name in dependencies, `Missing dependency ${name}`);
    return dependencies[name];
  }, ...Object.values(globals));
  return exports;
}
const bounds = await compile('src/components/map-document.ts');
const geometry = await compile('src/features/map/route-geometry.ts');
const existing = await compile('src/features/map/routing.ts', { '@/components/map-document': bounds, './route-geometry': geometry });
const dependencies = { '@/components/map-document': bounds, '@/features/map/route-geometry': geometry, '@/features/map/routing': existing };
const routing = await compile('src/features/saved-routes/routing.ts', dependencies);
const coordinates = [[-72.3, 18.5], [-72.295, 18.5], [-72.29, 18.5]];
const points = coordinates.map(([longitude, latitude], index) => ({ longitude, latitude, label: ['Maison', 'Rue choisie', 'Travail'][index] }));
function payload() {
  return { code: 'Ok', waypoints: coordinates.map((location) => ({ location, distance: 0 })), routes: [{
    distance: 1054, duration: 120, geometry: { type: 'LineString', coordinates: structuredClone(coordinates) },
    legs: [0, 1].map((i) => ({ summary: `Rue ${i + 1}`, steps: [
      { distance: 527, duration: 60, name: `Rue ${i + 1}`, maneuver: { type: 'depart' } },
      { distance: 0, duration: 0, maneuver: { type: 'arrive' } },
    ] })),
  }] };
}

test('exact route retains every chosen point and full road geometry', () => {
  const route = routing.parseExactRoute(payload(), points);
  assert.deepEqual(route.waypoints, points);
  assert.deepEqual(route.coordinates, coordinates);
  assert.equal(route.distanceMeters, 1054);
  assert.equal(route.durationSeconds, 120);
  assert.match(route.steps[0].instruction, /Rue 1/);
  assert.equal(route.steps.filter((step) => step.instruction === 'Rejoignez le point d’arrivée').length, 1);
  assert.notEqual(route.waypoints[0], points[0]);
});

test('exact route rejects omitted, reordered or excessively snapped points', () => {
  for (const mutate of [
    (p) => p.waypoints.splice(1, 1),
    (p) => p.routes[0].legs.pop(),
    (p) => p.routes[0].geometry.coordinates.splice(1, 1),
    (p) => p.routes[0].geometry.coordinates.reverse(),
    (p) => { p.waypoints[1].location = [-72.295, 18.501]; },
    (p) => { p.waypoints[1].location = [NaN, 18.5]; },
  ]) {
    const data = payload(); mutate(data);
    assert.throws(() => routing.parseExactRoute(data, points));
  }
});

test('editor limits match persisted shape limits and allow round trips', () => {
  assert.match(routing.validateRouteWaypoints([points[0]]), /départ/);
  assert.match(routing.validateRouteWaypoints(Array(26).fill(points[0])), /25/);
  assert.match(routing.validateRouteWaypoints([points[0], points[0]]), /trop proches/);
  assert.match(routing.validateRouteWaypoints([{ ...points[0], label: 'x'.repeat(201) }, points[2]]), /200/);
  assert.equal(routing.validateRouteWaypoints([...points, points[0]]), null);
  for (const mutate of [
    (p) => { p.routes[0].duration = 0; },
    (p) => { p.routes[0].duration = 86401; },
    (p) => { p.routes[0].distance = 1000001; },
    (p) => { p.routes[0].geometry.coordinates = Array(10001).fill(coordinates[0]); },
  ]) {
    const data = payload(); mutate(data);
    assert.throws(() => routing.parseExactRoute(data, points), /plusieurs trajets/);
  }
});

test('request routes all coordinates in order with tight snapping and no optimization', async () => {
  let requested;
  const api = await compile('src/features/saved-routes/routing.ts', dependencies, { fetch: async (url, options) => {
    requested = { url: new URL(url), options };
    return { ok: true, json: async () => payload() };
  } });
  await api.fetchExactRoute(points, new AbortController().signal);
  assert.match(requested.url.pathname, /-72.3,18.5;-72.295,18.5;-72.29,18.5$/);
  assert.equal(requested.url.searchParams.get('radiuses'), '25;25;25');
  assert.equal(requested.url.searchParams.get('overview'), 'full');
  assert.equal(requested.url.searchParams.get('steps'), 'true');
  assert.equal(requested.url.searchParams.get('alternatives'), 'false');
  assert.equal(requested.url.searchParams.get('continue_straight'), 'true');
  assert.equal(requested.options.credentials, 'omit');
});

test('offline, unrouteable and canceled requests never invent a route', async () => {
  for (const [fetch, expected] of [
    [async () => { throw new TypeError('offline'); }, /Connexion/],
    [async () => ({ ok: false, json: async () => ({ code: 'NoSegment' }) }), /chaussée/],
    [async () => ({ ok: false, json: async () => ({ code: 'NoRoute' }) }), /Aucun trajet/],
  ]) {
    const api = await compile('src/features/saved-routes/routing.ts', dependencies, { fetch });
    await assert.rejects(api.fetchExactRoute(points, new AbortController().signal), expected);
  }
  let calls = 0;
  const api = await compile('src/features/saved-routes/routing.ts', dependencies, { fetch: async () => { calls++; } });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(api.fetchExactRoute(points, controller.signal), { name: 'AbortError' });
  assert.equal(calls, 0);
  const pendingApi = await compile('src/features/saved-routes/routing.ts', dependencies, {
    fetch: (_, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))),
  });
  const active = new AbortController();
  const pending = pendingApi.fetchExactRoute(points, active.signal);
  active.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});

const map = await compile('src/features/saved-routes/map-document.ts', { '@/components/map-document': bounds });
test('map bridge restricts source, coordinates, point identity and message size', () => {
  const message = { source: 'stopaccidents-route-editor', status: 'move', id: 'via-2', latitude: 18.5, longitude: -72.3 };
  assert.deepEqual(map.readRouteMapMessage(JSON.stringify(message)), { status: 'move', id: 'via-2', latitude: 18.5, longitude: -72.3 });
  for (const override of [{ source: 'other' }, { id: 'constructor' }, { latitude: 90 }, { longitude: '-72.3' }, { id: 'via-999' }, { status: 'execute' }])
    assert.equal(map.readRouteMapMessage(JSON.stringify({ ...message, ...override })), null);
  assert.equal(map.readRouteMapMessage('x'.repeat(2001)), null);
  for (const script of map.ROUTE_EDITOR_DOCUMENT.matchAll(/<script>([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => new vm.Script(script[1]));
});

async function editorHarness(initialValue = null) {
  const hooks = [], effects = [], timers = new Map(), requests = [], confirmations = [];
  let cursor = 0, dirty = true, tree, timerId = 0;
  const changed = (a, b) => !a || a.length !== b.length || a.some((value, i) => value !== b[i]);
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in hooks)) hooks[i] = typeof initial === 'function' ? initial() : initial;
      return [hooks[i], (next) => { const value = typeof next === 'function' ? next(hooks[i]) : next; if (!Object.is(value, hooks[i])) { hooks[i] = value; dirty = true; } }];
    },
    useRef(initial) { const i = cursor++; return hooks[i] ??= { current: initial }; },
    useMemo(fn, deps) { const i = cursor++; if (!hooks[i] || changed(hooks[i].deps, deps)) hooks[i] = { deps, value: fn() }; return hooks[i].value; },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) { const i = cursor++; if (!hooks[i] || changed(hooks[i].deps, deps)) { const prior = hooks[i]; hooks[i] = { deps }; effects.push(() => { prior?.cleanup?.(); hooks[i].cleanup = fn(); }); } },
  };
  const jsx = (type, props) => ({ type, props });
  const noIcon = () => null;
  const icons = Object.fromEntries(['arrow-down', 'arrow-left', 'arrow-up', 'check', 'locate-fixed', 'plus', 'search', 'trash', 'undo-2', 'x'].map((name) => [`lucide-react-native/icons/${name}`, { default: noIcon }]));
  const { RouteEditor } = await compile('src/features/saved-routes/editor.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx }, ...icons,
    'react-native': { ActivityIndicator: 'ActivityIndicator', StyleSheet: { create: (styles) => styles, hairlineWidth: 1 } },
    '@/components/ui/app-icon': { AppIcon: 'Icon' },
    '@/components/saved-place-picker': { SavedPlacePicker: 'PlacePicker' },
    '@/features/appearance/theme-provider': { createThemedStyles: (fn) => () => fn((color) => color), useThemeColor: () => (color) => color },
    '@/features/language/native': { Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View' },
    './route-map': { RouteMap: 'RouteMap' },
    './routing': { ...routing, fetchExactRoute: (waypoints, signal) => new Promise((resolve, reject) => requests.push({ waypoints, signal, resolve, reject })) },
  }, { setTimeout: (fn, milliseconds) => { timers.set(++timerId, { fn, milliseconds }); return timerId; }, clearTimeout: (id) => timers.delete(id) });
  function render() {
    let limit = 25;
    while (dirty && limit--) { dirty = false; cursor = 0; tree = RouteEditor({ initialValue, onConfirm: (shape) => confirmations.push(shape), onCancel() {} }); effects.splice(0).forEach((fn) => fn()); }
    assert.ok(limit > 0, 'Render settled');
  }
  function nodes(value) {
    if (!value || typeof value !== 'object') return [];
    if (Array.isArray(value)) return value.flatMap((node) => nodes(node));
    return [value, ...nodes(value.props?.children ?? null)];
  }
  const text = (value) => typeof value === 'string' || typeof value === 'number' ? String(value) : Array.isArray(value) ? value.map(text).join('') : text(value?.props?.children ?? '');
  render();
  return {
    requests, confirmations,
    map: () => nodes(tree).find((node) => node.type === 'RouteMap').props,
    async settle() { await Promise.resolve(); await Promise.resolve(); render(); },
    render,
    press(label) { const button = nodes(tree).find((node) => node.props?.onPress && (node.props.accessibilityLabel === label || node.props.label === label || text(node.props.children) === label)); assert.ok(button, `Button ${label}`); if (!button.props.disabled) { button.props.onPress(); render(); } return button.props.disabled; },
    pick(point) { this.map().onPick(point); render(); },
    runCalculation() { for (const [id, timer] of timers) if (timer.milliseconds === 450) { timers.delete(id); timer.fn(); } },
  };
}

test('editor invalidates confirmation immediately on edits and ignores stale route replies', async () => {
  const h = await editorHarness();
  h.map().onLoad(); h.render();
  h.pick(points[0]); h.pick(points[2]); h.runCalculation();
  assert.equal(h.requests.length, 1);
  h.press('Choisir les rues');
  h.pick(points[1]); h.runCalculation();
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[0].signal.aborted, true);
  h.requests[0].resolve({ ...routing.parseExactRoute(payload(), points), waypoints: [points[0], points[2]] });
  await h.settle();
  assert.equal(h.map().state.coordinates.length, 0);
  assert.equal(h.press('Vérifier ce trajet'), true);
  const route = routing.parseExactRoute(payload(), points);
  h.requests[1].resolve(route); await h.settle();
  assert.deepEqual(h.map().state.coordinates, coordinates);
  assert.equal(h.confirmations.length, 0);
  h.press('Vérifier ce trajet');
  assert.equal(h.map().state.editable, false);
  h.press('Confirmer ce tracé');
  assert.deepEqual(h.confirmations, [route]);
});

test('opening a saved shape preserves its exact geometry until a user edit; undo restores points', async () => {
  const route = { ...routing.parseExactRoute(payload(), points), steps: [] };
  const h = await editorHarness(route);
  h.map().onLoad(); h.render(); h.runCalculation();
  assert.equal(h.requests.length, 0);
  assert.deepEqual(h.map().state.coordinates, coordinates);
  h.map().onMove('via-0', { latitude: 18.5001, longitude: -72.295 }); h.render(); h.runCalculation();
  assert.equal(h.map().state.coordinates.length, 0);
  assert.equal(h.requests[0].waypoints[1].latitude, 18.5001);
  h.press('Annuler la dernière modification'); h.runCalculation();
  assert.equal(h.requests[0].signal.aborted, true);
  assert.equal(h.requests[1].waypoints[1].latitude, 18.5);
  assert.equal(h.confirmations.length, 0);
});
