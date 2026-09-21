import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

async function compile(file, globals = {}) {
  const source = await readFile(
    new URL(`../src/features/accident-report/${file}.ts`, import.meta.url),
    'utf8',
  );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  new Function('exports', ...Object.keys(globals), outputText)(exports, ...Object.values(globals));
  return exports;
}

const response = (properties) => ({ features: [{ properties }] });
const address = {
  name: 'Université Épiscopale', type: 'house', locality: 'Bois Verna',
  district: '6e Turgeau', city: 'Port-au-Prince', state: 'Ouest',
};

test('zone uses the neighbourhood and city, never a nearby business name', async () => {
  const { photonZone } = await compile('reverse-geocode');
  assert.equal(photonZone(response(address)), 'Bois Verna, Port-au-Prince');
  assert.equal(photonZone(response({ district: 'Delmas', city: 'delmas' })), 'Delmas');
  assert.equal(photonZone(response({ name: 'Jacmel', type: 'city', state: 'Sud-Est' })), 'Jacmel, Sud-Est');
  assert.equal(photonZone(response({ city: 'Les Cayes' })), 'Les Cayes');
  assert.equal(photonZone(response({ name: 'Station', type: 'house' })), null);
  for (const payload of [null, {}, { features: [] }, response({ city: 12 })]) {
    assert.equal(photonZone(payload), null);
  }
});

test('invalid or missing coordinates are skipped; latitude/longitude zero are valid', async () => {
  let calls = 0;
  const { coordinatesKey, reverseGeocodeZone } = await compile('reverse-geocode', {
    fetch: async () => { calls++; throw new Error('Unexpected network'); },
  });
  for (const pair of [[null, 1], [1, undefined], [NaN, 1], [1, Infinity], [91, 1], [1, -181]]) {
    assert.equal(await reverseGeocodeZone(...pair), null);
  }
  assert.equal(coordinatesKey(0, 0), '0.00000,0.00000');
  assert.equal(calls, 0);
});

test('concurrent card/detail reads and later refreshes share one cached request', async () => {
  let calls = 0;
  let resolveFetch;
  const { reverseGeocodeZone } = await compile('reverse-geocode', {
    fetch: (url, options) => {
      calls++;
      const params = new URL(url).searchParams;
      assert.equal(params.get('lat'), '18.53920');
      assert.equal(params.get('lon'), '-72.33640');
      assert.equal(params.get('lang'), 'fr');
      assert.equal(params.get('radius'), '1');
      assert.equal(options.credentials, 'omit');
      return new Promise((resolve) => { resolveFetch = resolve; });
    },
  });
  const first = reverseGeocodeZone(18.5392, -72.3364);
  const second = reverseGeocodeZone(18.5392, -72.3364);
  assert.equal(first, second);
  await Promise.resolve();
  resolveFetch({ ok: true, json: async () => response(address) });
  assert.equal(await first, 'Bois Verna, Port-au-Prince');
  assert.equal(await reverseGeocodeZone(18.5392, -72.3364), 'Bois Verna, Port-au-Prince');
  assert.equal(calls, 1);
});

test('offline, HTTP errors, invalid JSON and absent results preserve the GPS fallback', async () => {
  for (const fetchResult of [
    () => { throw new Error('Offline'); },
    () => ({ ok: false }),
    () => ({ ok: true, json: async () => { throw new Error('Invalid JSON'); } }),
    () => ({ ok: true, json: async () => ({ features: [] }) }),
  ]) {
    let calls = 0;
    const { reverseGeocodeZone } = await compile('reverse-geocode', {
      fetch: async () => { calls++; return fetchResult(); },
    });
    assert.equal(await reverseGeocodeZone(18.5, -72.3), null);
    assert.equal(await reverseGeocodeZone(18.5, -72.3), null);
    assert.equal(calls, 1, 'Failures must not cause a request on every refresh');
  }
});

test('a timed out request releases the lookup and permits a retry after the failure cache expires', async () => {
  let now = 10000;
  let timeout;
  let calls = 0;
  const { reverseGeocodeZone } = await compile('reverse-geocode', {
    Date: { now: () => now },
    setTimeout: (callback) => { timeout = callback; return 1; },
    clearTimeout: () => {},
    fetch: async (_, { signal }) => {
      calls++;
      if (calls > 1) return { ok: true, json: async () => response(address) };
      return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('Timeout'))));
    },
  });
  const request = reverseGeocodeZone(18.5, -72.3);
  await Promise.resolve();
  timeout();
  assert.equal(await request, null);
  now += 61000;
  assert.equal(await reverseGeocodeZone(18.5, -72.3), 'Bois Verna, Port-au-Prince');
  assert.equal(calls, 2);
});

test('changing accidents ignores stale lookups and a manual location stays authoritative', async () => {
  let state = null;
  let effect;
  const resolutions = [];
  const { useAccidentLocation } = await compile('use-accident-location', {
    require: (name) => ({
      react: {
        useState: () => [state, (value) => { state = value; }],
        useEffect: (callback) => { effect = callback; },
      },
      './presentation': { accidentLocation: (report) => report.location_description || 'GPS' },
      './reverse-geocode': {
        coordinatesKey: (lat, lon) => `${lat},${lon}`,
        cachedZone: () => null,
        reverseGeocodeZone: () => new Promise((resolve) => { resolutions.push(resolve); }),
      },
    })[name],
  });
  const first = { latitude: 18.5, longitude: -72.3, location_description: '' };
  const second = { ...first, latitude: 19 };
  useAccidentLocation(first);
  const cleanup = effect();
  cleanup();
  assert.equal(useAccidentLocation(second).label, 'GPS');
  effect();
  resolutions[0]('Old zone');
  await Promise.resolve();
  assert.equal(state, null);
  resolutions[1]('New zone');
  await Promise.resolve();
  assert.deepEqual(useAccidentLocation(second), { label: 'New zone', estimated: true });
  assert.deepEqual(useAccidentLocation({ ...second, location_description: 'Lieu saisi' }), {
    label: 'Lieu saisi', estimated: false,
  });
  assert.equal(effect(), undefined);
  assert.equal(resolutions.length, 2);
});
