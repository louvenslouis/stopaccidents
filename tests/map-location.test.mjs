import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile('src/features/map/location-session.ts', 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
});
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
const fix = (latitude = 18.5, timestamp = Date.now()) => ({
  timestamp,
  coords: { latitude, longitude: -72.3, accuracy: 12 },
});
function fixture({
  web = false,
  permission = { granted: true },
  services = true,
  pending = false,
  continuous = true,
} = {}) {
  let receive, fail, resolveSubscription, timer;
  const calls = {
    removed: 0,
    watched: 0,
    requested: 0,
    positions: [],
    errors: [],
  };
  const subscription = { remove: () => calls.removed++ };
  const location = {
    Accuracy: { High: 4 },
    getForegroundPermissionsAsync: async () => permission,
    requestForegroundPermissionsAsync: async () => {
      calls.requested++;
      return { granted: true };
    },
    hasServicesEnabledAsync: async () => services,
    watchPositionAsync: async (options, callback, error) => {
      calls.watched++;
      receive = callback;
      fail = error;
      calls.options = options;
      return pending
        ? new Promise((resolve) => {
            resolveSubscription = resolve;
          })
        : subscription;
    },
  };
  const navigator = {
    geolocation: {
      watchPosition(callback, error, options) {
        calls.watched++;
        receive = callback;
        fail = error;
        calls.options = options;
        return 7;
      },
      clearWatch: (id) => {
        assert.equal(id, 7);
        calls.removed++;
      },
    },
  };
  const exports = {};
  new Function(
    'exports',
    'require',
    'navigator',
    'globalThis',
    'setTimeout',
    'clearTimeout',
    outputText,
  )(
    exports,
    (name) =>
      name === 'expo-location'
        ? location
        : { Platform: { OS: web ? 'web' : 'ios' } },
    navigator,
    { isSecureContext: true },
    (callback) => {
      timer = callback;
      return 1;
    },
    () => {
      timer = undefined;
    },
  );
  const controller = new AbortController();
  exports.startLocationSession(
    controller.signal,
    continuous,
    (position) => calls.positions.push(position),
    (error) => calls.errors.push(error),
  );
  return {
    calls,
    controller,
    emit: (value) => receive(value),
    error: (value) => fail(value),
    expire: () => timer(),
    resolve: () => resolveSubscription(subscription),
    hasTimer: () => !!timer,
  };
}

test('continuous tracking streams fresh positions and abort removes its subscription', async () => {
  const f = fixture({ permission: { granted: false, canAskAgain: true } });
  await flush();
  assert.equal(f.calls.requested, 1);
  f.emit(fix(NaN));
  f.emit(fix(18.5, Date.now() - 60000));
  f.emit(fix(91));
  assert.equal(f.calls.positions.length, 0);
  f.emit(fix());
  f.emit(fix(18.6));
  assert.equal(f.calls.positions.length, 2);
  assert.equal(f.calls.removed, 0);
  f.controller.abort();
  f.emit(fix(18.7));
  assert.equal(f.calls.positions.length, 2);
  assert.equal(f.calls.removed, 1);
  assert.equal(f.hasTimer(), false);
});

test('one-shot positioning stops at first fix, including late native startup', async () => {
  const f = fixture({ continuous: false, pending: true });
  await flush();
  f.emit(fix());
  f.emit(fix(18.6));
  f.resolve();
  await flush();
  assert.equal(f.calls.positions.length, 1);
  assert.equal(f.calls.removed, 1);
  assert.equal(f.hasTimer(), false);
});

test('cancellation during startup removes late watcher and suppresses late callbacks', async () => {
  const f = fixture({ pending: true });
  await flush();
  f.controller.abort();
  f.emit(fix());
  f.resolve();
  await flush();
  assert.equal(f.calls.positions.length, 0);
  assert.equal(f.calls.removed, 1);
});

test('denied permissions and disabled GPS expose actionable errors without watching', async () => {
  for (const options of [
    { permission: { granted: false, canAskAgain: false } },
    { services: false },
  ]) {
    const f = fixture(options);
    await flush();
    assert.equal(f.calls.watched, 0);
    assert.equal(f.calls.errors.length, 1);
    assert.equal(f.calls.errors[0].settingsNeeded, true);
  }
});

test('missing first fix and lost signal stop tracking instead of leaving a stale live location', async () => {
  for (const hadFix of [false, true]) {
    const f = fixture();
    await flush();
    if (hadFix) f.emit(fix());
    f.expire();
    f.emit(fix(18.6));
    assert.equal(f.calls.errors.length, 1);
    assert.equal(f.calls.removed, 1);
    assert.equal(f.calls.positions.length, hadFix ? 1 : 0);
  }
});

test('browser watcher handles movement, permission errors, and clearWatch', async () => {
  const f = fixture({ web: true });
  await flush();
  assert.equal(f.calls.options.enableHighAccuracy, true);
  f.emit(fix());
  f.emit(fix(18.6));
  f.error({ code: 1 });
  assert.equal(f.calls.positions.length, 2);
  assert.match(f.calls.errors[0].message, /paramètres de ce site/);
  assert.equal(f.calls.removed, 1);
});

test('native runtime errors clean up the active watcher', async () => {
  const f = fixture();
  await flush();
  f.error('denied');
  f.emit(fix());
  assert.equal(f.calls.positions.length, 0);
  assert.equal(f.calls.errors.length, 1);
  assert.equal(f.calls.removed, 1);
});

const hookSource = ts.transpileModule(
  await readFile('src/features/map/use-map-location.ts', 'utf8'),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
function hookFixture() {
  let cursor = 0,
    focusEffect,
    background;
  const hooks = [],
    sessions = [];
  const exports = {};
  new Function('exports', 'require', hookSource)(
    exports,
    (name) =>
      ({
        react: {
          useRef(initial) {
            const index = cursor++;
            return (hooks[index] ||= { current: initial });
          },
          useState(initial) {
            const index = cursor++;
            if (!(index in hooks)) hooks[index] = initial;
            return [
              hooks[index],
              (next) => {
                hooks[index] =
                  typeof next === 'function' ? next(hooks[index]) : next;
              },
            ];
          },
          useCallback: (fn) => fn,
          useMemo: (fn) => fn(),
        },
        'expo-router': {
          useFocusEffect: (fn) => {
            focusEffect = fn;
          },
        },
        'react-native': {
          Platform: { OS: 'ios' },
          AppState: {
            addEventListener: (_, fn) => {
              background = fn;
              return { remove() {} };
            },
          },
        },
        '@/components/map-document': {
          HAITI_BOUNDS: [
            [18, -74.55],
            [20.1, -71.6],
          ],
        },
        './location-session': {
          MapLocationError: Error,
          startLocationSession: (signal, continuous, receive, error) =>
            sessions.push({ signal, continuous, receive, error }),
        },
      })[name],
  );
  const render = () => {
    cursor = 0;
    return exports.useMapLocation();
  };
  render();
  const blur = focusEffect();
  return { render, sessions, blur, background: (state) => background(state) };
}

test('map hook pauses centering on pan, recenters without another watcher, and cancels on blur', () => {
  const f = hookFixture();
  f.render().start(true);
  f.sessions[0].receive(fix().coords);
  let state = f.render();
  assert.equal(state.tracking, true);
  assert.equal(state.location.following, true);
  state.pauseFollowing();
  state = f.render();
  assert.equal(state.tracking, true);
  assert.equal(state.location.following, false);
  state.locate();
  state = f.render();
  assert.equal(f.sessions.length, 1);
  assert.equal(state.location.following, true);
  assert.equal(state.location.focusRequest, 2);
  f.blur();
  assert.equal(f.sessions[0].signal.aborted, true);
  f.sessions[0].receive(fix(18.8).coords);
  assert.equal(f.render().location.position, null);
  assert.equal(f.render().tracking, false);
});

test('background stops tracking but permission-dialog inactivity does not', () => {
  const f = hookFixture();
  f.render().start(true);
  f.background('inactive');
  assert.equal(f.sessions[0].signal.aborted, false);
  f.background('background');
  assert.equal(f.sessions[0].signal.aborted, true);
  assert.equal(f.render().locating, false);
});

test('a new session ignores old callbacks and outside-Haiti positions explain the coverage limit', () => {
  const f = hookFixture();
  f.render().start(true);
  f.render().start(false);
  assert.equal(f.sessions[0].signal.aborted, true);
  f.sessions[0].receive(fix().coords);
  assert.equal(f.render().location.position, null);
  f.sessions[1].receive(fix(40).coords);
  assert.match(f.render().error.message, /hors de la zone/);
  assert.equal(f.sessions[1].signal.aborted, true);
});
