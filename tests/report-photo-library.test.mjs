import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';
const source = await readFile('src/features/report-events/photo-library.ts', 'utf8');
function fixture(result, base64 = 'aGVsbG8=') {
  const calls = { picker: [], resize: [], save: [], release: 0 };
  let id = 0;
  const dependencies = {
    'expo-image-picker': { launchImageLibraryAsync: async options => { calls.picker.push(options); return result; } },
    'expo-crypto': { randomUUID: () => `photo-${++id}` },
    '@/features/accident-report/model': { MAX_PHOTOS: 4, MAX_PHOTO_BYTES: 6 * 1024 * 1024 },
    'expo-image-manipulator': { SaveFormat: { JPEG: 'jpeg' }, ImageManipulator: { manipulate: uri => ({
      resize: size => calls.resize.push(size), release: () => calls.release++,
      renderAsync: async () => ({ release: () => calls.release++, saveAsync: async options => { calls.save.push(options); return { uri: `${uri}.jpg`, base64 }; } }),
    }) } },
  };
  const exports = {};
  new Function('require', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(name => dependencies[name], exports);
  return { ...exports, calls };
}
const asset = { uri: 'file://image.png', type: 'image', width: 3200, height: 2000 };
test('on-site reports cannot open the library even if called directly', async () => {
  const f = fixture({ canceled: false, assets: [asset] });
  await assert.rejects(f.pickReportPhotos({ locationSource: 'device' }, 0), /caméra/);
  assert.equal(f.calls.picker.length, 0);
});
test('manual reports import multiple JPEGs within remaining slots and retain their origin', async () => {
  const f = fixture({ canceled: false, assets: [asset, { ...asset, uri: 'file://second.heic' }] });
  const photos = await f.pickReportPhotos({ locationSource: 'manual' }, 2);
  assert.equal(f.calls.picker[0].selectionLimit, 2);
  assert.equal(f.calls.picker[0].allowsMultipleSelection, true);
  assert.deepEqual(photos.map(photo => photo.source), ['library', 'library']);
  assert.notEqual(photos[0].id, photos[1].id);
  assert.deepEqual(f.calls.save[0], { format: 'jpeg', compress: 0.8, base64: true });
  assert.equal(f.calls.release, 4);
});
test('cancel and full grid leave the current selection unchanged', async () => {
  const f = fixture({ canceled: true });
  assert.deepEqual(await f.pickReportPhotos({ locationSource: 'manual' }, 1), []);
  assert.deepEqual(await f.pickReportPhotos({ locationSource: 'manual' }, 4), []);
  assert.equal(f.calls.picker.length, 1);
});
test('over-selection, videos and unreadable images fail without a partial batch', async () => {
  await assert.rejects(fixture({ canceled: false, assets: [asset, asset] }).pickReportPhotos({ locationSource: 'manual' }, 3), /4 photos/);
  await assert.rejects(fixture({ canceled: false, assets: [{ ...asset, type: 'video' }] }).pickReportPhotos({ locationSource: 'manual' }, 0), /uniquement/);
  const f = fixture({ canceled: false, assets: [asset] }, '');
  await assert.rejects(f.pickReportPhotos({ locationSource: 'manual' }, 0), /illisible/);
  assert.equal(f.calls.release, 2);
});
