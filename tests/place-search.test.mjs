import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const bounds = [
  [18, -74.55],
  [20.1, -71.6],
];

async function moduleWith(fetch) {
  const source = await readFile('src/features/map/place-search.ts', 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const exports = {};
  new Function('exports', 'require', 'fetch', outputText)(
    exports,
    (name) => {
      if (name === '@/components/map-document') return { HAITI_BOUNDS: bounds };
      throw new Error(`Unexpected import: ${name}`);
    },
    fetch,
  );
  return exports;
}

const payload = (coordinates, properties = {}) => ({
  features: [
    {
      geometry: { coordinates },
      properties,
    },
  ],
});

test('Photon place results use coordinates in Haiti and build a concise label', async () => {
  const { photonPlace } = await moduleWith(() => undefined);
  assert.deepEqual(
    photonPlace(
      payload([-72.3074, 18.5944], {
        name: 'Champ de Mars',
        city: 'Port-au-Prince',
        state: 'Ouest',
      }),
    ),
    {
      latitude: 18.5944,
      longitude: -72.3074,
      label: 'Champ de Mars, Port-au-Prince, Ouest',
    },
  );
  assert.equal(photonPlace(payload([-70, 18.5], { name: 'Ailleurs' })), null);
  assert.equal(photonPlace({ features: [] }), null);
});

test('place search asks Photon for one French result restricted to Haiti', async () => {
  let requested;
  const { searchMapPlace } = await moduleWith(async (url, options) => {
    requested = { url: new URL(url), options };
    return {
      ok: true,
      json: async () => payload([-72.3074, 18.5944], { name: 'Pétion-Ville' }),
    };
  });
  assert.deepEqual(await searchMapPlace('  Pétion-Ville  '), {
    latitude: 18.5944,
    longitude: -72.3074,
    label: 'Pétion-Ville',
  });
  assert.equal(requested.url.searchParams.get('q'), 'Pétion-Ville');
  assert.equal(requested.url.searchParams.get('lang'), 'fr');
  assert.equal(requested.url.searchParams.get('limit'), '1');
  assert.equal(requested.url.searchParams.get('countrycode'), 'HT');
  assert.equal(requested.url.searchParams.get('bbox'), '-74.55,18,-71.6,20.1');
  assert.equal(requested.options.credentials, 'omit');
});

test('suggestions preserve relevance order, remove duplicates and reject invalid or foreign coordinates', async () => {
  const { photonPlaces } = await moduleWith(() => undefined);
  const first = payload([-72.285, 18.51], {
    name: 'Pétion-Ville',
    city: 'Pétion-Ville',
    state: 'Ouest',
    countrycode: 'HT',
  }).features[0];
  const street = payload([-72.29, 18.52], {
    street: 'Rue Lamarre',
    housenumber: '12',
    city: 'Pétion-Ville',
  }).features[0];
  const results = photonPlaces({
    features: [
      null,
      payload([NaN, 18.5]).features[0],
      payload([-72, 19], { countrycode: 'DO' }).features[0],
      first,
      { ...first },
      payload([-70, 18.5]).features[0],
      street,
    ],
  });
  assert.deepEqual(
    results.map((place) => place.label),
    ['Pétion-Ville, Ouest', '12 Rue Lamarre, Pétion-Ville'],
  );
  assert.deepEqual(photonPlaces(null), []);
});

test('autocomplete requests five suggestions and skips empty or one-character queries', async () => {
  const calls = [];
  const { searchMapPlaces } = await moduleWith(async (url) => {
    calls.push(new URL(url));
    return {
      ok: true,
      json: async () => ({
        features: Array.from(
          { length: 7 },
          (_, i) =>
            payload([-72.3 + i / 100, 18.5], { name: `Lieu ${i}` }).features[0],
        ),
      }),
    };
  });
  assert.deepEqual(await searchMapPlaces('  '), []);
  assert.deepEqual(await searchMapPlaces(' P '), []);
  assert.equal(calls.length, 0);
  assert.equal((await searchMapPlaces('  Petion  ')).length, 5);
  assert.equal(calls[0].searchParams.get('q'), 'Petion');
  assert.equal(calls[0].searchParams.get('limit'), '5');
  assert.equal(calls[0].searchParams.get('countrycode'), 'HT');
});

test('city points and administrative boundaries collapse into one suggestion while street addresses stay distinct', async () => {
  const { photonPlaces } = await moduleWith(() => undefined);
  const city = { name: 'Pétionville', city: 'Port-au-Prince', state: 'Ouest', type: 'district' };
  const features = [
    payload([-72.286, 18.513], city),
    payload([-72.239, 18.483], city),
    payload([-72.28, 18.51], { name: 'Marché', street: 'Rue A', city: 'Port-au-Prince' }),
    payload([-72.29, 18.52], { name: 'Marché', street: 'Rue B', city: 'Port-au-Prince' }),
  ].flatMap((item) => item.features);
  assert.deepEqual(photonPlaces({ features }).map((item) => item.label), [
    'Pétionville, Port-au-Prince, Ouest',
    'Marché, Rue A, Port-au-Prince',
    'Marché, Rue B, Port-au-Prince',
  ]);
});

test('autocomplete propagates cancellation and reports network errors instead of empty results', async () => {
  const { searchMapPlaces } = await moduleWith(
    (_, { signal }) =>
      new Promise((_, reject) => {
        const abort = () => reject(new DOMException('Aborted', 'AbortError'));
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
      }),
  );
  const controller = new AbortController();
  const pending = searchMapPlaces('Petion', controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  await assert.rejects(searchMapPlaces('Petion', controller.signal), {
    name: 'AbortError',
  });
  const unavailable = await moduleWith(async () => ({ ok: false }));
  await assert.rejects(unavailable.searchMapPlaces('Petion'));
});
