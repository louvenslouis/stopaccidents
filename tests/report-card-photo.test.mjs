import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';
const source = await readFile('src/features/home/report-photo.ts', 'utf8');
function fixture(details = {}, contributions = []) {
  const calls = [];
  const read = async (id) => { calls.push(id); return details[id] ?? { photos: [] }; };
  const deps = {
    '@/features/accident-report/read': { readAccident: read },
    '@/features/safety-report/read': { readSuspiciousVehicleReport: read },
    '@/features/report-events/api': { readReportEvent: async () => ({ event_id: 'event', contributions }) },
    '@/features/report-events/photos': { readReportPhotos: async (_kind, id) => (await read(id)).photos },
  };
  const exports = {};
  new Function('require', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(name => deps[name], exports);
  return { ...exports, calls };
}
const report = { id: 'current', report_kind: 'accident', event_id: 'event', testimony_count: 3 };
const photo = (url, day) => ({ url, storage_path: url ?? 'missing', captured_at: `2026-10-0${day}T10:00:00Z` });
test('photo state prefers usable photos of the displayed report, newest first', async () => {
  const f = fixture({ current: { photos: [photo('old.jpg', 1), photo(null, 3), photo('new.jpg', 2)] } });
  assert.deepEqual(await f.readReportCardPhotos(report, new AbortController().signal), ['new.jpg', 'old.jpg']);
  assert.deepEqual(f.calls, ['current']);
});
test('photo fallback uses only the most recent matching testimony in the same event', async () => {
  const contributions = [
    { id: 'old', report_kind: 'accident', created_at: '2026-10-01' },
    { id: 'unrelated-kind', report_kind: 'suspicious_vehicle', created_at: '2026-10-04' },
    { id: 'new', report_kind: 'accident', created_at: '2026-10-03' },
  ];
  const f = fixture({ new: { photos: [photo('testimony.jpg', 3)] } }, contributions);
  assert.deepEqual(await f.readReportCardPhotos(report, new AbortController().signal), ['testimony.jpg']);
  assert.deepEqual(f.calls, ['current', 'new']);
});
test('all report types can display images while canceled reads never borrow another image', async () => {
  const f = fixture();
  assert.deepEqual(await f.readReportCardPhotos({ ...report, report_kind: 'fire', testimony_count: 1 }, new AbortController().signal), []);
  const controller = new AbortController(); controller.abort();
  assert.deepEqual(await f.readReportCardPhotos(report, controller.signal), []);
  assert.deepEqual(f.calls, ['current']);
  assert.deepEqual(await f.readReportCardPhotos({ ...report, testimony_count: 1 }, new AbortController().signal), []);
});

test('new photo collections supply cards and matching testimonies for all seven kinds', async () => {
  for (const kind of ['fire', 'gathering', 'breakdown', 'gunfire', 'kidnapping', 'armed_presence', 'barricade']) {
    const f = fixture({ witness: { photos: [photo(`${kind}.jpg`, 3)] } }, [
      { id: 'witness', report_kind: kind, created_at: '2026-10-03' },
    ]);
    assert.deepEqual(await f.readReportCardPhotos({ ...report, report_kind: kind }, new AbortController().signal), [`${kind}.jpg`]);
  }
});

const heroSource = await readFile('src/components/report-ticket-design.tsx', 'utf8');
function heroFixture() {
  const hooks = []; let cursor = 0;
  const exports = {};
  const deps = {
    react: { useState: value => { const index = cursor++; if (!(index in hooks)) hooks[index] = value; return [hooks[index], next => { hooks[index] = typeof next === 'function' ? next(hooks[index]) : next; }]; } },
    'react-native': { StyleSheet: { create: styles => styles, absoluteFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } } },
    'expo-image': { Image: 'Image' },
    '@/features/language/native': { Text: 'Text', View: 'View' },
    '@/features/appearance/theme-provider': { createThemedStyles: fn => () => fn(value => value) },
    './ui/app-icon': { AppIcon: 'Icon' }, './ui/animated-pressable': { AnimatedPressable: 'Button' },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
  };
  new Function('require', 'exports', ts.transpileModule(heroSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText)(name => deps[name] ?? {}, exports);
  return photos => { cursor = 0; return exports.ReportTicketHero({ kind: 'accident', title: 'Deux voitures', photos, actions: 'actions', children: 'chevron', onPress: () => {} }); };
}
function find(node, type) {
  if (node?.type === type) return node;
  for (const child of [node?.props?.children].flat(Infinity)) { const result = child && typeof child === 'object' && find(child, type); if (result) return result; }
  return null;
}
test('photo-ready and failed states keep the hero dimensions, title, actions and expansion control', () => {
  const render = heroFixture();
  const base = render([]);
  const loading = render(['first.jpg', 'second.jpg']);
  find(loading, 'Image').props.onLoad();
  const ready = render(['first.jpg', 'second.jpg']);
  assert.deepEqual(ready.props.style, base.props.style);
  assert.deepEqual(find(ready, 'Button').props.children.props.children.slice(1).map(child => typeof child === 'string' ? child : child.props.children), ['Deux voitures', 'chevron']);
  assert.equal(ready.props.children[3].props.children[1], 'actions');
  find(ready, 'Image').props.onError();
  const fallback = render(['first.jpg', 'second.jpg']);
  assert.equal(find(fallback, 'Image').props.source.uri, 'second.jpg');
  find(fallback, 'Image').props.onError();
  const failed = render(['first.jpg', 'second.jpg']);
  assert.equal(find(failed, 'Image'), null);
  assert.deepEqual(failed.props.style, base.props.style);
});
