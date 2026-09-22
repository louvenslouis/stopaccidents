import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile('src/features/profile/saved-place-geocoding.ts', 'utf8');

function fixture(fetchImpl = async () => ({ ok: true, json: async () => ({ features: [] }) })) {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const exports = {};
  new Function('exports', 'require', 'fetch', 'process', outputText)(
    exports,
    (name) => {
      if (name === '@/components/map-document')
        return {
          HAITI_BOUNDS: [
            [18, -74.55],
            [20.1, -71.6],
          ],
        };
      return {};
    },
    fetchImpl,
    { env: {} },
  );
  return exports;
}

test('Photon results become precise, readable places and exclude points outside the map', () => {
  const { parsePhotonPlaces } = fixture();
  assert.deepEqual(
    parsePhotonPlaces({
      features: [
        {
          geometry: { coordinates: [-72.2853, 18.5125] },
          properties: {
            osm_id: '123',
            name: 'Place Saint-Pierre',
            street: 'Rue Grégoire',
            city: 'Pétion-Ville',
            state: 'Ouest',
          },
        },
        {
          geometry: { coordinates: [-70, 18.5] },
          properties: { name: 'Hors zone' },
        },
      ],
    }),
    [
      {
        id: '123-0',
        address: 'Place Saint-Pierre, Rue Grégoire, Pétion-Ville, Ouest',
        latitude: 18.5125,
        longitude: -72.2853,
      },
    ],
  );
});

test('search is limited to the Haiti map bounds', async () => {
  let requested;
  const { searchSavedPlaces } = fixture(async (url) => {
    requested = new URL(url);
    return { ok: true, json: async () => ({ features: [] }) };
  });
  await searchSavedPlaces('Delmas');
  assert.equal(requested.searchParams.get('q'), 'Delmas');
  assert.equal(requested.searchParams.get('bbox'), '-74.55,18,-71.6,20.1');
  assert.equal(requested.searchParams.get('limit'), '6');
});

test('reverse geocoding keeps exact coordinates as a reliable fallback', async () => {
  const { reverseGeocodeSavedPlace } = fixture(async () => {
    throw new Error('offline');
  });
  assert.equal(await reverseGeocodeSavedPlace(18.54321, -72.33498), '18.54321, -72.33498');
  await assert.rejects(reverseGeocodeSavedPlace(21, -72), /Haïti/);
});
