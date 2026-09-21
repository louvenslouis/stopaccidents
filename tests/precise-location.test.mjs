import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

function compile(source, globals = {}) {
  const exports = {};
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  new Function('exports', ...Object.keys(globals), outputText)(
    exports,
    ...Object.values(globals),
  );
  return exports;
}
const model = compile(
  await readFile('src/features/accident-report/model.ts', 'utf8'),
);
const source = await readFile(
  'src/features/accident-report/precise-location.ts',
  'utf8',
);
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
const fix = (accuracy = 8, timestamp = Date.now()) => ({
  timestamp,
  coords: { latitude: 18.5, longitude: -72.3, accuracy },
});
function fixture({
  permission = { granted: true },
  pendingSubscription = false,
} = {}) {
  let callback, timeout, resolveSubscription;
  const calls = { removed: 0, requested: 0, watched: 0, options: null };
  const subscription = { remove: () => calls.removed++ };
  const location = {
    Accuracy: { Highest: 6 },
    getForegroundPermissionsAsync: async () => permission,
    requestForegroundPermissionsAsync: async () => {
      calls.requested++;
      return { granted: true };
    },
    hasServicesEnabledAsync: async () => true,
    watchPositionAsync: async (options, onPosition) => {
      calls.watched++;
      calls.options = options;
      callback = onPosition;
      if (pendingSubscription)
        return new Promise((resolve) => {
          resolveSubscription = resolve;
        });
      return subscription;
    },
  };
  const { acquirePreciseLocation } = compile(source, {
    require: (name) => (name === 'expo-location' ? location : model),
    setTimeout: (fn) => {
      timeout = fn;
      return 1;
    },
    clearTimeout: () => {},
  });
  const controller = new AbortController();
  const request = acquirePreciseLocation(controller.signal, () => {});
  return {
    calls,
    request,
    controller,
    emit: (value) => callback(value),
    expire: () => timeout(),
    resolveSubscription: () => resolveSubscription(subscription),
  };
}

test('requests permission when needed, waits for a fresh precise fix and stops GPS tracking', async () => {
  const f = fixture({ permission: { granted: false, canAskAgain: true } });
  let resolved = false;
  f.request.then(() => {
    resolved = true;
  });
  await flush();
  assert.equal(f.calls.requested, 1);
  assert.equal(f.calls.options.enableHighAccuracy, true);
  assert.equal(f.calls.options.maximumAge, 0);
  f.emit(fix(400));
  f.emit(fix(null));
  f.emit(fix(8, Date.now() - 60000));
  f.emit(fix(8, Date.now() + 60000));
  await flush();
  assert.equal(resolved, false);
  f.emit(fix(12));
  assert.deepEqual(await f.request, {
    latitude: 18.5,
    longitude: -72.3,
    accuracy: 12,
  });
  assert.equal(f.calls.removed, 1);
});
test('approximate and denied permissions cannot enter the reporting flow', async () => {
  for (const permission of [
    { granted: false, canAskAgain: false },
    { granted: true, ios: { accuracy: 'reduced' } },
    { granted: true, android: { accuracy: 'coarse' } },
  ]) {
    const f = fixture({ permission });
    await assert.rejects(f.request, (error) => error.settingsNeeded === true);
    assert.equal(f.calls.watched, 0);
  }
});
test('timeout rejects low accuracy and removes the subscription', async () => {
  const f = fixture();
  await flush();
  f.emit(fix(90));
  f.expire();
  await assert.rejects(f.request, /assez précise/);
  assert.equal(f.calls.removed, 1);
});
test('closing during GPS startup cleans up even a late subscription', async () => {
  const f = fixture({ pendingSubscription: true });
  await flush();
  f.controller.abort();
  await assert.rejects(f.request, /annulée/);
  f.emit(fix());
  f.resolveSubscription();
  await flush();
  assert.equal(f.calls.removed, 1);
});
test('already granted permission is reused without asking again', async () => {
  const f = fixture();
  await flush();
  f.emit(fix());
  await f.request;
  assert.equal(f.calls.requested, 0);
});
