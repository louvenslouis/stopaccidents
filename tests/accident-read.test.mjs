import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

async function compile(file, dependencies = {}) {
  const source = await readFile(
    new URL(`../src/features/accident-report/${file}.ts`, import.meta.url),
    'utf8',
  );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const exports = {};
  new Function('require', 'exports', outputText)(
    (name) => dependencies[name],
    exports,
  );
  return exports;
}

test('GPS-only and unfinished reports never invent a place, type or severity', async () => {
  const presentation = await compile('presentation');
  const partial = {
    location_description: '',
    latitude: 0,
    longitude: -72.3,
    accident_type: null,
    completed_step: 1,
    severity: 'unknown',
  };
  assert.equal(presentation.accidentLocation(partial), '0.00000, -72.30000');
  assert.equal(presentation.accidentTypeLabel(partial), 'Type à préciser');
  assert.equal(presentation.accidentSeverity(partial).label, 'À préciser');
  assert.equal(
    presentation.accidentSeverity({ ...partial, completed_step: 3 }).label,
    'À déterminer',
  );
});

test('details keep the selected ID even when a newer accident exists; signing failures preserve details', async () => {
  let params;
  const { readAccident, readLatestAccident } = await compile('read', {
    '@/lib/supabase': {
      supabase: {
        rpc: (_, payload) => {
          params = payload;
          return {
            abortSignal: async () => ({
              data: payload
                ? {
                    id: payload.p_id,
                    notes: 'Saved details',
                    photos: [{ id: 'photo', storage_path: 'private/path' }],
                  }
                : { id: 'newest' },
              error: null,
            }),
          };
        },
        storage: {
          from: () => ({
            createSignedUrls: async () => {
              throw new Error('Offline');
            },
          }),
        },
      },
    },
  });
  const signal = new AbortController().signal;
  assert.equal((await readLatestAccident(signal)).id, 'newest');
  const result = await readAccident('selected', signal);
  assert.equal(params.p_id, 'selected');
  assert.equal(result.id, 'selected');
  assert.equal(result.notes, 'Saved details');
  assert.equal(result.photos[0].url, null);
});

test('an absent report is distinct from a network error', async () => {
  let fail = false;
  const { readLatestAccident, readAccident } = await compile('read', {
    '@/lib/supabase': {
      supabase: {
        rpc: () => ({
          abortSignal: async () => ({
            data: null,
            error: fail ? { message: 'Offline' } : null,
          }),
        }),
      },
    },
  });
  const signal = new AbortController().signal;
  assert.equal(await readLatestAccident(signal), null);
  assert.equal(await readAccident('deleted', signal), null);
  fail = true;
  await assert.rejects(
    () => readLatestAccident(signal),
    /Impossible de charger/,
  );
});
