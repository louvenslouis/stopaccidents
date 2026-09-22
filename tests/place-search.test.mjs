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
