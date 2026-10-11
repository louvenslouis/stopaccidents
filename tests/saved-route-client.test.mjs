import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

function load(source, modules, globals = {}) {
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('exports', 'require', ...Object.keys(globals), compiled)(exports, (name) => {
    assert.ok(name in modules, `Unexpected dependency: ${name}`);
    return modules[name];
  }, ...Object.values(globals));
  return exports;
}
const model = load(await readFile('src/features/saved-routes/model.ts', 'utf8'), {});
const apiSource = await readFile('src/features/saved-routes/api.ts', 'utf8');
const hookSource = await readFile('src/features/saved-routes/use-saved-routes.ts', 'utf8');
const shape = {
  waypoints: [{ label: 'Maison', latitude: 18.54, longitude: -72.34 }, { label: 'Travail', latitude: 18.55, longitude: -72.35 }],
  coordinates: [[-72.34, 18.54], [-72.35, 18.55]], distanceMeters: 1500, durationSeconds: 630, steps: [],
};
const schedule = { ...model.defaultSchedule(shape), name: 'Maison → Travail' };
const row = {
  id: 'route', name: schedule.name, waypoints: shape.waypoints, coordinates: shape.coordinates,
  distance_meters: shape.distanceMeters, duration_seconds: shape.durationSeconds,
  departure_time: '07:00:00', weekdays: [1, 2, 3, 4, 5], timezone: schedule.timezone,
  duration_minutes: schedule.durationMinutes, lead_minutes: 30, alerts_enabled: true,
};

function client(initialResponse = { data: row, error: null }) {
  const calls = [];
  let user = { id: 'owner', is_anonymous: false };
  let response = initialResponse;
  function query(operation) {
    const call = { ...operation, operations: [] };
    calls.push(call);
    const builder = { then: (...args) => Promise.resolve(typeof response === 'function' ? response() : response).then(...args) };
    for (const name of ['select', 'eq', 'order', 'insert', 'update', 'delete', 'single', 'abortSignal'])
      builder[name] = (...args) => { call.operations.push([name, ...args]); return builder; };
    return builder;
  }
  const api = load(apiSource, {
    './model': model,
    '@/lib/supabase': { supabase: {
      auth: { getSession: async () => ({ data: { session: user ? { user } : null }, error: null }) },
      from: (table) => query({ table }), rpc: (name, args) => query({ name, args }),
    } },
  });
  return { ...api, calls, setUser(next) { user = next; }, setResponse(next) { response = next; } };
}

test('schedule validation handles exact times, weekdays, bounds and explicit timezones', () => {
  assert.equal(schedule.durationMinutes, 15);
  assert.equal(schedule.timezone, 'America/Port-au-Prince');
  assert.equal(model.validateSchedule(schedule), null);
  for (const changes of [
    { name: ' ' }, { name: 'x'.repeat(81) }, { departureTime: '7:00' }, { departureTime: '24:00' }, { departureTime: '23:60' },
    { weekdays: [] }, { weekdays: [1, 1] }, { weekdays: [0] }, { weekdays: [8] }, { weekdays: [1.5] },
    { durationMinutes: 4 }, { durationMinutes: 241 }, { durationMinutes: NaN }, { durationMinutes: 5.5 },
    { leadMinutes: 1 }, { timezone: '' }, { timezone: undefined }, { timezone: 'Unknown/Zone' },
  ]) assert.equal(typeof model.validateSchedule({ ...schedule, ...changes }), 'string', JSON.stringify(changes));
  for (const changes of [{ departureTime: '00:00' }, { departureTime: '23:59' }, { weekdays: [7] }, { durationMinutes: 240 }, { leadMinutes: 0 }])
    assert.equal(model.validateSchedule({ ...schedule, ...changes }), null);
  assert.equal(model.scheduleDays([1, 2, 3, 4, 5]), 'Lun – Ven');
  assert.equal(model.scheduleDays([7, 6]), 'Sam · Dim');
});

test('saving preserves the chosen geometry and uses explicit ownership for creation and edits', async () => {
  const api = client();
  const value = { ...schedule, name: ` ${schedule.name} `, weekdays: [5, 1, 3] };
  const saved = await api.saveRoute('owner', shape, value);
  assert.equal(saved.departureTime, '07:00');
  assert.equal(api.calls[0].name, 'save_saved_route');
  assert.equal(api.calls[0].args.p_id, null);
  const insert = api.calls[0].args.p_route;
  assert.equal('user_id' in insert, false);
  assert.equal(insert.name, schedule.name);
  assert.deepEqual(insert.coordinates, shape.coordinates);
  assert.deepEqual(insert.weekdays, [1, 3, 5]);
  assert.deepEqual(value.weekdays, [5, 1, 3]);
  await api.saveRoute('owner', shape, schedule, 'route');
  assert.equal(api.calls[1].args.p_id, 'route');
  assert.equal('user_id' in api.calls[1].args.p_route, false);
});

test('anonymous, signed-out and switched accounts cannot read or mutate routes', async () => {
  for (const user of [null, { id: 'owner', is_anonymous: true }, { id: 'other', is_anonymous: false }]) {
    const api = client(); api.setUser(user);
    for (const operation of [
      () => api.readSavedRoutes('owner'), () => api.readRouteAlerts('owner'),
      () => api.saveRoute('owner', shape, schedule), () => api.setRouteAlerts('owner', 'route', false),
      () => api.deleteRoute('owner', 'route'), () => api.markRouteAlertRead('owner', 'alert'),
    ]) await assert.rejects(operation, /Connectez-vous/);
    assert.equal(api.calls.length, 0);
  }
  const invalid = client();
  await assert.rejects(invalid.saveRoute('owner', shape, { ...schedule, weekdays: [] }), /Choisissez les jours/);
  assert.equal(invalid.calls.length, 0);
});

test('route reads bind the requested account, pass cancellation and discard responses after an account switch', async () => {
  const api = client({ data: [row], error: null });
  const controller = new AbortController();
  assert.equal((await api.readSavedRoutes('owner', controller.signal))[0].id, 'route');
  assert.equal(api.calls[0].name, 'read_saved_routes');
  assert.ok(api.calls[0].operations.some(([name, signal]) => name === 'abortSignal' && signal === controller.signal));
  await api.readRouteAlerts('owner', controller.signal);
  assert.equal(api.calls[1].name, 'read_route_alerts');
  assert.ok(api.calls[1].operations.some(([name, signal]) => name === 'abortSignal' && signal === controller.signal));
  api.setResponse(() => { api.setUser({ id: 'other' }); return { data: [row], error: null }; });
  await assert.rejects(api.readSavedRoutes('owner'), /Connectez-vous/);
});

test('failed or zero-row changes cannot report success and keep owner filters', async () => {
  for (const response of [{ data: null, error: null }, { data: null, error: { message: 'network' } }]) {
    const api = client(response);
    await assert.rejects(api.saveRoute('owner', shape, schedule), /enregistrer/);
    await assert.rejects(api.setRouteAlerts('owner', 'route', false), /modifier/);
    await assert.rejects(api.deleteRoute('owner', 'route'), /supprimer/);
    await assert.rejects(api.readSavedRoutes('owner'), /charger/);
    for (const call of api.calls.slice(1, 3)) {
      assert.ok(call.operations.some(([name, field, value]) => name === 'eq' && field === 'id' && value === 'route'));
      assert.ok(call.operations.some(([name, field, value]) => name === 'eq' && field === 'user_id' && value === 'owner'));
    }
  }
  const api = client({ data: null, error: { message: 'network' } });
  await assert.rejects(api.markRouteAlertRead('owner', 'alert'), /marquer/);
});

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
const flush = () => new Promise(setImmediate);
function hook() {
  const state = [], requests = [];
  let stateIndex = 0, focus, appChange, authChange, timer, push, removed = 0;
  const AppState = { currentState: 'active', addEventListener: (_event, listener) => { appChange = listener; return { remove() { removed += 1; } }; } };
  const read = (kind) => (userId, signal) => {
    const pending = deferred(); requests.push({ kind, userId, signal, ...pending }); return pending.promise;
  };
  const exported = load(hookSource, {
    react: { useState: (value) => { const i = stateIndex++; state[i] = value; return [value, (next) => { state[i] = next; }]; }, useRef: (current) => ({ current }), useCallback: (callback) => callback },
    'react-native': { AppState }, 'expo-router': { useFocusEffect: (callback) => { focus = callback; } },
    '@/lib/supabase': { supabase: { auth: { onAuthStateChange: (callback) => { authChange = callback; return { data: { subscription: { unsubscribe() { removed += 1; } } } }; } } } },
    './api': { readSavedRoutes: read('routes'), readRouteAlerts: read('alerts') },
    './push': { subscribeToRoutePush: (callback) => { push = callback; return () => { removed += 1; }; } },
  }, { setInterval: (callback) => { timer = callback; return 1; }, clearInterval: () => { removed += 1; } });
  const api = exported.useSavedRoutes('owner');
  return { ...api, state, requests, focus: () => focus(), tick: () => timer(), push: () => push(),
    auth: (user) => authChange('SIGNED_IN', user ? { user } : null),
    app: (next) => { AppState.currentState = next; appChange(next); },
    get removed() { return removed; } };
}

test('polling preserves slow requests and signing out cancels and clears route data', async () => {
  const api = hook(); const dispose = api.focus();
  api.tick(); assert.equal(api.requests.length, 2);
  api.requests[0].resolve([row]); api.requests[1].resolve([{ id: 'alert' }]); await flush();
  assert.equal(api.state[0][0].id, 'route');
  api.tick(); assert.equal(api.requests.length, 4);
  api.auth({ id: 'other', is_anonymous: false });
  assert.ok(api.requests[2].signal.aborted);
  api.requests[2].resolve([row]); api.requests[3].resolve([{ id: 'alert' }]); await flush();
  assert.deepEqual(api.state.slice(0, 2), [[], []]);
  await api.refresh(); api.push(); api.tick(); assert.equal(api.requests.length, 4);
  dispose(); assert.equal(api.removed, 4);
});

test('new refreshes supersede old responses; background and unmount prevent late updates', async () => {
  const api = hook(); const dispose = api.focus();
  const refresh = api.refresh(); assert.ok(api.requests[0].signal.aborted);
  api.requests[2].resolve([{ id: 'new-route' }]); api.requests[3].resolve([]); await refresh;
  api.requests[0].resolve([row]); api.requests[1].resolve([]); await flush();
  assert.equal(api.state[0][0].id, 'new-route');
  api.push(); api.app('background'); assert.ok(api.requests[4].signal.aborted);
  await api.refresh(); assert.equal(api.requests.length, 6);
  api.requests[4].resolve([row]); api.requests[5].resolve([]); await flush();
  assert.equal(api.state[0][0].id, 'new-route');
  api.app('active'); assert.equal(api.requests.length, 8);
  dispose(); api.requests[6].resolve([row]); api.requests[7].resolve([]); await flush();
  await api.refresh(); assert.equal(api.requests.length, 8);
  assert.equal(api.state[0][0].id, 'new-route');
});
