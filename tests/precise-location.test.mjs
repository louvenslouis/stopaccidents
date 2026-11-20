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
  { require: () => ({}) },
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
  requestedPermission = { granted: true },
  platform = 'android',
  access,
  servicesEnabled = true,
  acceptActivation = true,
  pendingSubscription = false,
} = {}) {
  let callback, timeout, resolveSubscription;
  const calls = { removed: 0, requested: 0, activated: 0, settings: 0, watched: 0, options: null };
  const subscription = { remove: () => calls.removed++ };
  const location = {
    Accuracy: { Highest: 6 },
    getForegroundPermissionsAsync: async () => permission,
    requestForegroundPermissionsAsync: async () => {
      calls.requested++;
      return requestedPermission;
    },
    hasServicesEnabledAsync: async () => servicesEnabled,
    enableNetworkProviderAsync: async () => {
      calls.activated++;
      if (!acceptActivation) throw new Error('Cancelled');
      servicesEnabled = true;
    },
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
    require: (name) => ({
      'expo-location': location,
      'react-native': {
        Platform: { OS: platform },
        Linking: { openSettings: async () => { calls.settings++; } },
      },
      './model': model,
    })[name],
    setTimeout: (fn) => {
      timeout = fn;
      return 1;
    },
    clearTimeout: () => {},
  });
  const controller = new AbortController();
  const request = acquirePreciseLocation(controller.signal, () => {}, access);
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

test('a tap can request permission again and enable Android location before starting GPS', async () => {
  const permission = { granted: false, canAskAgain: true, status: 'denied' };
  const automatic = fixture({ access: 'automatic', permission });
  await assert.rejects(automatic.request, /pas autorisé/);
  assert.equal(automatic.calls.requested, 0);

  const retry = fixture({ access: 'retry', permission, servicesEnabled: false });
  await flush();
  assert.equal(retry.calls.requested, 1);
  assert.equal(retry.calls.activated, 1);
  assert.equal(retry.calls.settings, 0);
  retry.emit(fix());
  await retry.request;
});

test('declining either retry dialog stops acquisition without sending the user to settings', async () => {
  const denied = { granted: false, canAskAgain: false };
  const permission = fixture({
    access: 'retry', permission: { ...denied, canAskAgain: true }, requestedPermission: denied,
  });
  await assert.rejects(permission.request, /pas autorisé/);
  assert.equal(permission.calls.settings, 0);
  assert.equal(permission.calls.watched, 0);

  const gps = fixture({ access: 'retry', servicesEnabled: false, acceptActivation: false });
  await assert.rejects(gps.request, /désactivée/);
  assert.equal(gps.calls.activated, 1);
  assert.equal(gps.calls.settings, 0);
  assert.equal(gps.calls.watched, 0);
});

test('only a native user retry opens settings for a blocked permission', async () => {
  const permission = { granted: false, canAskAgain: false };
  for (const [access, platform, settings] of [
    ['retry', 'android', 1], ['retry', 'ios', 1], ['retry', 'web', 0], ['automatic', 'ios', 0],
  ]) {
    const f = fixture({ access, platform, permission });
    await assert.rejects(f.request);
    assert.equal(f.calls.requested, 0);
    assert.equal(f.calls.settings, settings);
    assert.equal(f.calls.watched, 0);
  }
});

test('a browser that keeps denying location points to the site settings', async () => {
  const denied = { granted: false, canAskAgain: true, status: 'denied' };
  const f = fixture({ access: 'retry', platform: 'web', permission: denied, requestedPermission: denied });
  await assert.rejects(f.request, /paramètres de ce site/);
  assert.equal(f.calls.requested, 1);
  assert.equal(f.calls.settings, 0);
  assert.equal(f.calls.watched, 0);
});

test('disabled services open iOS settings on tap and stay passive during automatic refresh', async () => {
  for (const [access, platform, settings] of [
    ['retry', 'ios', 1], ['automatic', 'ios', 0], ['automatic', 'android', 0],
  ]) {
    const f = fixture({ access, platform, servicesEnabled: false });
    await assert.rejects(f.request, /désactivée/);
    assert.equal(f.calls.settings, settings);
    assert.equal(f.calls.activated, 0);
    assert.equal(f.calls.watched, 0);
  }
});
