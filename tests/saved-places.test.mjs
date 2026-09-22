import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile('src/features/profile/saved-places.ts', 'utf8');

function fixture({ row = null, readError = null, writeError = null } = {}) {
  const calls = { tables: [], selects: [], upserts: [] };
  const supabase = {
    from(table) {
      calls.tables.push(table);
      return {
        select(columns) {
          calls.selects.push(columns);
          return {
            maybeSingle: async () => ({ data: row, error: readError }),
          };
        },
        async upsert(value, options) {
          calls.upserts.push({ value, options });
          return { error: writeError };
        },
      };
    },
  };
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const exports = {};
  new Function('exports', 'require', outputText)(exports, (name) =>
    name === '@/lib/supabase' ? { supabase } : {},
  );
  return { ...exports, calls };
}

test('saved places normalize whitespace and reject empty, short or oversized addresses', () => {
  const f = fixture();
  assert.deepEqual(
    f.normalizeSavedPlaces({
      homeAddress: '  12,  rue   Capois  ',
      workAddress: ' Delmas 33 ',
    }),
    { homeAddress: '12, rue Capois', workAddress: 'Delmas 33' },
  );
  assert.match(f.validateSavedPlaces({ homeAddress: ' ', workAddress: '' }), /au moins une/);
  assert.match(f.validateSavedPlaces({ homeAddress: 'ab', workAddress: '' }), /au moins 3/);
  assert.match(
    f.validateSavedPlaces({ homeAddress: 'x'.repeat(501), workAddress: '' }),
    /maximum 500/,
  );
  assert.equal(f.validateSavedPlaces({ homeAddress: '', workAddress: 'Pétion-Ville' }), null);
});

test('reading returns the private row or an empty form when none exists', async () => {
  const populated = fixture({
    row: { home_address: 'Maison', work_address: 'Bureau' },
  });
  assert.deepEqual(await populated.readSavedPlaces(), {
    homeAddress: 'Maison',
    workAddress: 'Bureau',
  });
  assert.deepEqual(await fixture().readSavedPlaces(), {
    homeAddress: '',
    workAddress: '',
  });
  assert.deepEqual(populated.calls.selects, ['home_address,work_address']);
  await assert.rejects(fixture({ readError: { message: 'offline' } }).readSavedPlaces(), /charger/);
});

test('saving upserts normalized addresses against the signed-in user id', async () => {
  const f = fixture();
  const saved = await f.saveSavedPlaces('user-1', {
    homeAddress: '  Rue   Capois ',
    workAddress: '',
  });
  assert.deepEqual(saved, { homeAddress: 'Rue Capois', workAddress: '' });
  assert.equal(f.calls.tables[0], 'user_saved_places');
  assert.equal(f.calls.upserts[0].value.user_id, 'user-1');
  assert.equal(f.calls.upserts[0].value.home_address, 'Rue Capois');
  assert.deepEqual(f.calls.upserts[0].options, { onConflict: 'user_id' });
  assert.ok(!Number.isNaN(Date.parse(f.calls.upserts[0].value.updated_at)));

  const failed = fixture({ writeError: { message: 'offline' } });
  await assert.rejects(
    failed.saveSavedPlaces('user-1', {
      homeAddress: 'Rue Capois',
      workAddress: '',
    }),
    /enregistrer/,
  );
});
