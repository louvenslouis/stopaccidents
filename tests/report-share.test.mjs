import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

async function compile(path, dependencies = {}) {
  const source = await readFile(new URL(`../src/${path}.ts`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  new Function('require', 'exports', outputText)((name) => dependencies[name], exports);
  return exports;
}

function replaceGlobal(t, name, value) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, value });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, name, original);
    else delete globalThis[name];
  });
}

const presentation = await compile('features/accident-report/presentation');
const read = await compile('features/safety-report/read', { '@/lib/supabase': {} });
const share = await compile('features/safety-report/share', {
  '../accident-report/presentation': presentation,
  './read': read,
});
const report = {
  id: 'abc01234-1234-4123-8123-123456789012',
  report_kind: 'accident', accident_type: 'car_motorcycle', severity: 'injuries',
  created_at: '2026-09-22T16:00:00Z', completed_step: 3,
  location_description: 'Delmas 33', latitude: 18.55, longitude: -72.3,
};

test('all report categories have stable public links that reopen the original report', () => {
  for (const kind of ['accident', 'kidnapping', 'barricade', 'gunfire', 'armed_presence', 'suspicious_vehicle', 'breakdown']) {
    const data = { ...report, report_kind: kind };
    const url = new URL(share.reportShareUrl(data, 'https://example.org/stopaccidents/?old=1#old'));
    assert.equal(url.pathname, '/stopaccidents/');
    assert.equal(url.hash, '');
    assert.deepEqual([...url.searchParams.keys()], ['signalement']);
    assert.equal(share.sharedReportSelection(url.searchParams.get('signalement')), `${kind}:${report.id}`);
    assert.ok(share.createReportShare(data, { label: 'Delmas 33', estimated: false }).title);
  }
  assert.equal(new URL(share.reportShareUrl(report, 'https://example.org')).pathname, '/');
  assert.throws(() => share.reportShareUrl(report, 'javascript:alert(1)'));
});

test('incoming links reject missing, malformed, ambiguous and unknown selections', () => {
  for (const value of [undefined, '', ['accident:' + report.id], 'other:' + report.id, 'accident:no-id', 'accident:' + report.id + ':extra']) {
    assert.equal(share.sharedReportSelection(value), null);
  }
});

test('description contains the public summary, estimated attribution and no private details', () => {
  const data = share.createReportShare({ ...report, private_notes: 'SECRET', identity_number: '123SECRET' }, { label: ' Delmas 33 ', estimated: true });
  assert.match(data.message, /Accident · Voiture et moto/);
  assert.match(data.message, /Zone estimée : Delmas 33/);
  assert.match(data.message, /Signalé le /);
  assert.match(data.message, /Gravité : Des blessés/);
  assert.ok(data.message.endsWith(data.url));
  assert.doesNotMatch(data.message, /SECRET/);
  assert.equal(data.estimated, true);
  const partial = share.createReportShare({ ...report, completed_step: 1 }, { label: '', estimated: false });
  assert.match(partial.message, /Lieu : Lieu à préciser/);
  assert.match(partial.message, /Gravité : À préciser/);
  const gunfire = share.createReportShare({ ...report, report_kind: 'gunfire' }, { label: 'Delmas', estimated: false });
  assert.doesNotMatch(gunfire.message, /Gravité/);
});

test('web prepares a PNG before the tap, shares file + caption synchronously and supports download', async (t) => {
  const calls = [];
  const png = new Blob(['png-content'], { type: 'image/png' });
  const anchor = { click() { calls.push('download'); }, remove() {} };
  t.mock.method(URL, 'createObjectURL', () => 'blob:test-image');
  t.mock.method(URL, 'revokeObjectURL', (uri) => calls.push(['revoke', uri]));
  replaceGlobal(t, 'document', { fonts: { ready: Promise.resolve() }, createElement: () => anchor, body: { appendChild() {} } });
  const navigatorMock = {
    canShare: (payload) => payload.files[0].type === 'image/png',
    share: (payload) => { calls.push(payload); return Promise.resolve(); },
  };
  replaceGlobal(t, 'navigator', navigatorMock);
  const web = await compile('features/safety-report/share-image.web', {
    'html-to-image': { toBlob: async (_view, options) => {
      assert.equal(options.pixelRatio, 3);
      return png;
    } },
  });
  const data = share.createReportShare(report, { label: 'Delmas', estimated: false });
  const image = await web.prepareReportImage({ offsetWidth: 360 }, data);
  assert.equal(image.canShare, true);
  assert.equal(calls.length, 0);
  const completion = image.share();
  assert.equal(calls[0].text, data.message);
  assert.equal(calls[0].files[0].name, data.filename);
  assert.equal(await calls[0].files[0].text(), 'png-content');
  await completion;
  image.download();
  assert.equal(anchor.download, data.filename);
  assert.equal(anchor.href, image.uri);
  image.dispose();
  assert.deepEqual(calls.at(-1), ['revoke', 'blob:test-image']);

  delete navigatorMock.share;
  delete navigatorMock.canShare;
  const fallback = await web.prepareReportImage({ offsetWidth: 360 }, data);
  assert.equal(fallback.canShare, false);
  assert.equal(typeof fallback.download, 'function');
  fallback.dispose();
});

test('native sends a PNG and the caption together and retains a file handed to another app', async () => {
  let options;
  const released = [];
  const native = await compile('features/safety-report/share-image', {
    'react-native': { TurboModuleRegistry: { get: () => ({}) }, PixelRatio: { get: () => 3 } },
    'react-native-view-shot': { captureRef: async () => 'file:///cache/card.png', releaseCapture: (uri) => released.push(uri) },
    'react-native-share': { __esModule: true, default: { open: async (value) => { options = value; } } },
  });
  const data = share.createReportShare(report, { label: 'Delmas', estimated: false });
  const image = await native.prepareReportImage({}, data, { width: 360, height: 400 });
  await image.share();
  assert.equal(options.url, 'file:///cache/card.png');
  assert.equal(options.type, 'image/png');
  assert.equal(options.message, data.message);
  assert.equal(options.failOnCancel, false);
  image.dispose();
  assert.equal(released.length, 0);
  const cancelledPreview = await native.prepareReportImage({}, data, { width: 360, height: 400 });
  cancelledPreview.dispose();
  assert.deepEqual(released, ['file:///cache/card.png']);
});
