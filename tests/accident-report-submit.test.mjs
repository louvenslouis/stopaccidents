import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';
import { decode } from 'base64-arraybuffer';

const modelSource = await readFile(
  new URL('../src/features/accident-report/model.ts', import.meta.url),
  'utf8',
);
const submitSource = await readFile(
  new URL('../src/features/accident-report/submit.ts', import.meta.url),
  'utf8',
);
function compile(source, dependencies = {}) {
  const exports = {};
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  new Function('require', 'exports', 'setTimeout', 'clearTimeout', outputText)(
    (name) => dependencies[name],
    exports,
    setTimeout,
    clearTimeout,
  );
  return exports;
}
const model = compile(modelSource);
const draft = {
  id: 'report-id',
  location: 'Test',
  accidentType: 'other',
  severity: 'unknown',
  coordinates: null,
  notes: '',
  registrations: '',
  identities: '',
  photos: [
    {
      id: 'photo-id',
      base64: 'aGVsbG8=',
      uri: 'data:image/jpeg;base64,aGVsbG8=',
      capturedAt: '2026-09-21T00:00:00Z',
    },
  ],
};
function fixture({
  existing = null,
  uploadError = null,
  rpcError = null,
} = {}) {
  const calls = { uploads: [], removals: [], rpc: [] };
  const storage = {
    upload: async (path) => {
      calls.uploads.push(path);
      return { error: uploadError };
    },
    remove: async (paths) => {
      calls.removals.push(paths);
      return { error: null };
    },
  };
  const client = {
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: 'user-id' } } },
        error: null,
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: existing, error: null }),
        }),
      }),
    }),
    storage: { from: () => storage },
    rpc: async (name, payload) => {
      calls.rpc.push({ name, payload });
      return { data: rpcError ? null : 'report-id', error: rpcError };
    },
  };
  const { submitAccidentReport } = compile(submitSource, {
    '@/lib/supabase': { supabase: client },
    './model': model,
    'base64-arraybuffer': { decode },
  });
  return { calls, submit: () => submitAccidentReport(draft, () => {}) };
}

test('a confirmed retry returns its receipt without re-uploading evidence', async () => {
  const { calls, submit } = fixture({ existing: { id: 'report-id' } });
  assert.equal(await submit(), 'report-id');
  assert.equal(calls.uploads.length, 0);
  assert.equal(calls.rpc.length, 0);
});
test('an upload failure prevents submission and cleans up attempted uploads', async () => {
  const { calls, submit } = fixture({ uploadError: { message: 'Offline' } });
  await assert.rejects(submit, /photo n’a pas pu être envoyée/);
  assert.equal(calls.rpc.length, 0);
  assert.deepEqual(calls.removals, [['user-id/report-id/photo-id.jpg']]);
});
test('an uncertain commit is reported as unconfirmed and is safe to retry', async () => {
  const { calls, submit } = fixture({
    rpcError: { message: 'Connection lost' },
  });
  await assert.rejects(submit, /n’a pas pu être confirmé/);
  assert.equal(calls.rpc[0].payload.p_id, draft.id);
  assert.equal(calls.removals.length, 1);
});
test('a successful report includes camera metadata and does not delete its evidence', async () => {
  const { calls, submit } = fixture();
  assert.equal(await submit(), 'report-id');
  assert.deepEqual(calls.rpc[0].payload.p_photos, [
    {
      storage_path: 'user-id/report-id/photo-id.jpg',
      captured_at: draft.photos[0].capturedAt,
    },
  ]);
  assert.equal(calls.removals.length, 0);
});
