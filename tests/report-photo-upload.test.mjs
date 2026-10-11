import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';
import { decode } from 'base64-arraybuffer';
const source = await readFile('src/features/report-events/photos.ts', 'utf8');
const photo = { id: 'image', uri: 'image.jpg', base64: 'aGVsbG8=', capturedAt: new Date().toISOString(), source: 'camera' };
const draft = { id: 'report', locationSource: 'device', photos: [photo] };
function fixture({ existing = [], uploadError = false, rpcError = false, urlsError = false } = {}) {
  const calls = { uploads: [], rpc: [], removed: [], signed: [] };
  const storage = {
    upload: async (path, bytes, options) => { calls.uploads.push({ path, bytes, options }); return { error: uploadError ? {} : null }; },
    remove: async paths => { calls.removed.push(paths); return { error: null }; },
    createSignedUrls: async (paths, expiry) => {
      calls.signed.push({ paths, expiry });
      if (urlsError) throw new Error('Network failure');
      return { data: paths.map(path => ({ path, signedUrl: `signed:${path}` })) };
    },
  };
  const deps = {
    'base64-arraybuffer': { decode },
    '@/features/accident-report/model': { MAX_PHOTOS: 4, MAX_PHOTO_BYTES: 6 * 1024 * 1024 },
    './api': { ensureReporter: async () => 'owner' },
    '@/lib/supabase': { supabase: {
      storage: { from: bucket => { assert.equal(bucket, 'report-photos'); return storage; } },
      rpc: (name, payload) => {
        calls.rpc.push({ name, payload });
        const response = name === 'read_report_photos' ? { data: existing, error: null } : { data: rpcError ? null : payload.p_id, error: rpcError ? {} : null };
        return { then: (resolve, reject) => Promise.resolve(response).then(resolve, reject), abortSignal: () => Promise.resolve(response) };
      },
    } },
  };
  const exports = {};
  new Function('require', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(name => deps[name], exports);
  return { ...exports, calls };
}
test('generic uploads use stable paths, binary JPEGs, origin and bounded cleanup for replacement', async () => {
  const old = { storage_path: 'owner/fire/report/old.jpg' };
  const f = fixture({ existing: [old] });
  assert.equal(await f.saveReportPhotos('fire', draft, () => {}), 'report');
  assert.equal(f.calls.uploads[0].path, 'owner/fire/report/image.jpg');
  assert.equal(f.calls.uploads[0].bytes.byteLength, 5);
  assert.deepEqual(f.calls.uploads[0].options, { contentType: 'image/jpeg', upsert: true });
  assert.deepEqual(f.calls.rpc.at(-1).payload.p_photos, [{ storage_path: 'owner/fire/report/image.jpg', captured_at: photo.capturedAt, source: 'camera' }]);
  assert.deepEqual(f.calls.removed, [[old.storage_path]]);
  const retry = fixture({ existing: [{ storage_path: 'owner/fire/report/image.jpg' }] });
  await retry.saveReportPhotos('fire', draft, () => {});
  assert.equal(retry.calls.uploads.length, 0);
});
test('failed uploads and RPCs preserve the draft and clean only the attempted new paths', async () => {
  for (const options of [{ uploadError: true }, { rpcError: true }]) {
    const f = fixture({ ...options, existing: [{ storage_path: 'owner/fire/report/old.jpg' }] });
    await assert.rejects(f.saveReportPhotos('fire', draft, () => {}));
    assert.deepEqual(f.calls.removed, [['owner/fire/report/image.jpg']]);
    assert.equal(draft.photos.length, 1);
  }
});
test('imported images require manual context and invalid batches do not reach the network', async () => {
  const f = fixture();
  await assert.rejects(f.saveReportPhotos('fire', { ...draft, photos: [{ ...photo, source: 'library' }] }, () => {}), /caméra/);
  await assert.rejects(f.saveReportPhotos('fire', { ...draft, photos: [photo, photo, photo, photo, photo] }, () => {}), /4 photos/);
  assert.equal(f.calls.rpc.length, 0);
  await f.saveReportPhotos('fire', { ...draft, locationSource: 'manual', photos: [{ ...photo, source: 'library' }] }, () => {});
  assert.equal(f.calls.rpc.at(-1).payload.p_photos[0].source, 'library');
});
test('photo reads sign only authorized attachment paths and retain unavailable thumbnails', async () => {
  const existing = [{ storage_path: 'owner/fire/report/image.jpg', captured_at: photo.capturedAt }];
  const f = fixture({ existing });
  assert.equal((await f.readReportPhotos('fire', 'report', new AbortController().signal))[0].url, `signed:${existing[0].storage_path}`);
  assert.equal(f.calls.signed[0].expiry, 900);
  const failure = fixture({ existing, urlsError: true });
  assert.equal((await failure.readReportPhotos('fire', 'report', new AbortController().signal))[0].url, null);
  const abort = new AbortController(); abort.abort();
  assert.deepEqual(await f.readReportPhotos('fire', 'report', abort.signal), []);
});
