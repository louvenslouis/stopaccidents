import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile('src/features/profile/saved-places.ts', 'utf8');

function fixture({ row = null, readError = null, writeError = null } = {}) {
  const calls = { reads: [], writes: [] };
  const supabase = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1', is_anonymous: false } } }, error: null }) },
    async rpc(name, args) {
      if (name === 'read_saved_places') { calls.reads.push(name); return { data: row, error: readError }; }
      assert.equal(name, 'save_saved_places');
      calls.writes.push(args.p_places);
      return { error: writeError };
    },
  };
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const exports = {};
  new Function('exports', 'require', outputText)(exports, (name) => {
    if (name === '@/lib/supabase') return { supabase };
    if (name === '@/components/map-document')
      return {
        HAITI_BOUNDS: [
          [18, -74.55],
          [20.1, -71.6],
        ],
      };
    return {};
  });
  return { ...exports, calls };
}

test('saved places normalize labels and require an exact point in the map bounds', () => {
  const f = fixture();
  assert.deepEqual(
    f.normalizeSavedPlaces({
      home: {
        address: '  12,  rue   Capois  ',
        latitude: 18.54,
        longitude: -72.33,
      },
      work: { address: ' Delmas 33 ', latitude: 18.55, longitude: -72.3 },
    }),
    {
      home: { address: '12, rue Capois', latitude: 18.54, longitude: -72.33 },
      work: { address: 'Delmas 33', latitude: 18.55, longitude: -72.3 },
    },
  );
  assert.match(f.validateSavedPlaces({ home: null, work: null }), /au moins un/);
  assert.match(
    f.validateSavedPlaces({
      home: { address: 'ab', latitude: 18.54, longitude: -72.33 },
      work: null,
    }),
    /au moins 3/,
  );
  assert.match(
    f.validateSavedPlaces({
      home: { address: 'x'.repeat(501), latitude: 18.54, longitude: -72.33 },
      work: null,
    }),
    /maximum 500/,
  );
  assert.match(
    f.validateSavedPlaces({
      home: { address: 'Ancienne adresse', latitude: null, longitude: null },
      work: null,
    }),
    /sur la carte/,
  );
  assert.match(
    f.validateSavedPlaces({
      home: { address: 'Hors zone', latitude: 21, longitude: -72.3 },
      work: null,
    }),
    /sur la carte/,
  );
  assert.equal(
    f.validateSavedPlaces({
      home: null,
      work: { address: 'Pétion-Ville', latitude: 18.51, longitude: -72.29 },
    }),
    null,
  );
});

test('reading returns the private row or an empty form when none exists', async () => {
  const populated = fixture({
    row: {
      home_address: 'Maison',
      home_latitude: 18.54,
      home_longitude: -72.33,
      work_address: 'Bureau',
      work_latitude: null,
      work_longitude: null,
    },
  });
  assert.deepEqual(await populated.readSavedPlaces(), {
    home: { address: 'Maison', latitude: 18.54, longitude: -72.33 },
    work: { address: 'Bureau', latitude: null, longitude: null },
  });
  assert.deepEqual(await fixture().readSavedPlaces(), {
    home: null,
    work: null,
  });
  assert.deepEqual(populated.calls.reads, ['read_saved_places']);
  await assert.rejects(fixture({ readError: { message: 'offline' } }).readSavedPlaces(), /charger/);
});

test('saving sends normalized addresses to the owner-checked encryption RPC', async () => {
  const f = fixture();
  const saved = await f.saveSavedPlaces('user-1', {
    home: { address: '  Rue   Capois ', latitude: 18.54, longitude: -72.33 },
    work: null,
  });
  assert.deepEqual(saved, {
    home: { address: 'Rue Capois', latitude: 18.54, longitude: -72.33 },
    work: null,
  });
  assert.deepEqual(f.calls.writes[0], { home_address: 'Rue Capois', home_latitude: 18.54, home_longitude: -72.33, work_address: '', work_latitude: null, work_longitude: null });
  await assert.rejects(f.saveSavedPlaces('other-user', { home: saved.home, work: null }), /session a changé/);
  assert.equal(f.calls.writes.length, 1);

  const failed = fixture({ writeError: { message: 'offline' } });
  await assert.rejects(
    failed.saveSavedPlaces('user-1', {
      home: { address: 'Rue Capois', latitude: 18.54, longitude: -72.33 },
      work: null,
    }),
    /enregistrer/,
  );
});
