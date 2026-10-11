import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';
const source = await readFile('src/features/home/report-photo.ts', 'utf8');
function fixture(details = {}, contributions = [], event = { event_id: 'event', contributions }) {
  const calls = [];
  const read = async (id) => {
    calls.push(id);
    const detail = details[id];
    if (detail instanceof Error) throw detail;
    return typeof detail === 'function' ? detail() : detail ?? { photos: [] };
  };
  const deps = {
    '@/features/accident-report/read': { readAccident: read },
    '@/features/safety-report/read': { readSuspiciousVehicleReport: read },
    '@/features/report-events/api': { readReportEvent: async () => {
      if (event instanceof Error) throw event;
      return event;
    } },
    '@/features/report-events/photos': { readReportPhotos: async (_kind, id) => (await read(id)).photos },
  };
  const exports = {};
  new Function('require', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(name => deps[name], exports);
  return { ...exports, calls };
}
const report = { id: 'current', report_kind: 'accident', event_id: 'event', testimony_count: 3 };
const photo = (url, day) => ({ url, storage_path: url ?? 'missing', captured_at: `2026-10-0${day}T10:00:00Z` });
test('a single report keeps its usable photos, newest first', async () => {
  const f = fixture({ current: { photos: [photo('old.jpg', 1), photo(null, 3), photo('new.jpg', 2)] } });
  assert.deepEqual(await f.readReportCardPhotos(report, new AbortController().signal), ['new.jpg', 'old.jpg']);
  assert.deepEqual(f.calls, ['current']);
});
test('card photos include all matching testimonies with the newest image first', async () => {
  const contributions = [
    { ...report, created_at: '2026-10-01' },
    { id: 'old', report_kind: 'accident', created_at: '2026-10-01' },
    { id: 'unrelated-kind', report_kind: 'suspicious_vehicle', created_at: '2026-10-04' },
    { id: 'new', report_kind: 'accident', created_at: '2026-10-03' },
  ];
  const f = fixture({
    current: { photos: [photo('original.jpg', 1)] },
    new: { photos: [photo('testimony.jpg', 3)] },
    old: { photos: [photo('updated-older-testimony.jpg', 4), photo(null, 5)] },
    'unrelated-kind': { photos: [photo('unrelated.jpg', 5)] },
  }, contributions);
  assert.deepEqual(await f.readReportCardPhotos(report, new AbortController().signal), ['updated-older-testimony.jpg', 'testimony.jpg', 'original.jpg']);
  assert.deepEqual(f.calls, ['current', 'new', 'old']);
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
    const f = fixture({ current: { photos: [photo('original.jpg', 1)] }, witness: { photos: [photo(`${kind}.jpg`, 3)] } }, [
      { id: 'witness', report_kind: kind, created_at: '2026-10-03' },
    ]);
    assert.deepEqual(await f.readReportCardPhotos({ ...report, report_kind: kind }, new AbortController().signal), [`${kind}.jpg`, 'original.jpg']);
  }
});

test('photos added by Mise à jour appear even before the testimony count refreshes', async () => {
  for (const kind of ['accident', 'suspicious_vehicle']) {
    const f = fixture({ current: { photos: [photo('original.jpg', 1)] }, witness: { photos: [photo('update.jpg', 3)] } }, [
      { id: 'witness', report_kind: kind, created_at: '2026-10-03' },
    ]);
    assert.deepEqual(await f.readReportCardPhotos({ ...report, report_kind: kind, testimony_count: 1 }, new AbortController().signal), ['update.jpg', 'original.jpg']);
  }
});

test('another event or a missing event ID cannot supply a card image', async () => {
  const details = { current: { photos: [photo('own.jpg', 1)] }, witness: { photos: [photo('other-event.jpg', 3)] } };
  const contributions = [{ id: 'witness', report_kind: 'accident', created_at: '2026-10-03' }];
  for (const changes of [{ event_id: 'another-event' }, { event_id: undefined }]) {
    const f = fixture(details, contributions);
    assert.deepEqual(await f.readReportCardPhotos({ ...report, ...changes }, new AbortController().signal), ['own.jpg']);
    assert.deepEqual(f.calls, ['current']);
  }
});

test('a failed photo read does not hide photos from the other testimonies', async () => {
  const contributions = [
    { id: 'broken', report_kind: 'accident', created_at: '2026-10-04' },
    { id: 'witness', report_kind: 'accident', created_at: '2026-10-03' },
  ];
  const f = fixture({ current: new Error('offline'), broken: new Error('unavailable'), witness: { photos: [photo('update.jpg', 3)] } }, contributions);
  assert.deepEqual(await f.readReportCardPhotos(report, new AbortController().signal), ['update.jpg']);
  const offlineEvent = fixture({ current: { photos: [photo('own.jpg', 1)] } }, contributions, new Error('offline'));
  assert.deepEqual(await offlineEvent.readReportCardPhotos(report, new AbortController().signal), ['own.jpg']);
});

test('canceling while testimony photos load discards the obsolete card images', async () => {
  const controller = new AbortController();
  const f = fixture({
    current: { photos: [photo('original.jpg', 1)] },
    witness: () => { controller.abort(); return { photos: [photo('update.jpg', 3)] }; },
  }, [{ id: 'witness', report_kind: 'accident', created_at: '2026-10-03' }]);
  assert.deepEqual(await f.readReportCardPhotos(report, controller.signal), []);
});

const hookSource = await readFile('src/features/home/use-report-card-photos.ts', 'utf8');
function photoHookFixture() {
  let cursor = 0;
  const values = [], effects = [], pending = [], requests = [];
  const deps = {
    react: {
      useState(initial) {
        const index = cursor++;
        if (!(index in values)) values[index] = typeof initial === 'function' ? initial() : initial;
        return [values[index], value => { values[index] = value; }];
      },
      useEffect(fn, dependencies) {
        const index = cursor++;
        if (!effects[index] || dependencies.some((value, i) => value !== effects[index].dependencies[i])) {
          pending.push(() => {
            effects[index]?.cleanup?.();
            effects[index] = { dependencies, cleanup: fn() };
          });
        }
      },
    },
    './report-photo': { readReportCardPhotos: (report, signal) => new Promise((resolve, reject) => { requests.push({ report, signal, resolve, reject }); }) },
  };
  const exports = {};
  new Function('require', 'exports', ts.transpileModule(hookSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(name => deps[name], exports);
  return {
    requests,
    render(selected = report, refreshing = false, revision = 0) {
      cursor = 0;
      const urls = exports.useReportCardPhotos(selected, refreshing, revision);
      for (const effect of pending.splice(0)) effect();
      return urls;
    },
    dispose() { for (const effect of effects) effect?.cleanup?.(); },
    remount() {
      for (const effect of effects) effect?.cleanup?.();
      values.length = 0;
      effects.length = 0;
    },
  };
}
const flushPhotos = () => new Promise(resolve => setImmediate(resolve));
test('closing Mise à jour reloads photos when the event summary is unchanged', async () => {
  const f = photoHookFixture();
  try {
    assert.deepEqual(f.render(), []);
    f.requests[0].resolve(['original.jpg']);
    await flushPhotos();
    assert.deepEqual(f.render(), ['original.jpg']);
    f.render(report, false, 1);
    assert.equal(f.requests.length, 2);
    f.requests[1].resolve(['update.jpg', 'original.jpg']);
    await flushPhotos();
    assert.deepEqual(f.render(report, false, 1), ['update.jpg', 'original.jpg']);
  } finally { f.dispose(); }
});
test('refreshing and switching cards cannot restore images from an obsolete request', async () => {
  const f = photoHookFixture();
  try {
    f.render();
    f.render(report, true);
    assert.equal(f.requests[0].signal.aborted, true);
    f.render(report, false);
    assert.equal(f.requests.length, 2);
    const other = { ...report, id: 'other', event_id: 'other-event' };
    assert.deepEqual(f.render(other), []);
    assert.equal(f.requests[1].signal.aborted, true);
    f.requests[2].resolve(['other.jpg']);
    await flushPhotos();
    f.requests[0].resolve(['stale-first.jpg']);
    f.requests[1].resolve(['stale-refresh.jpg']);
    await flushPhotos();
    assert.deepEqual(f.render(other), ['other.jpg']);
  } finally { f.dispose(); }
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

test('summary updates and transient refresh failures keep the current event photo visible', async () => {
  const f = photoHookFixture();
  try {
    f.render();
    f.requests[0].resolve(['original.jpg']);
    await flushPhotos();
    const updated = { ...report, last_observed_at: '2026-10-10', testimony_count: 4 };
    assert.deepEqual(f.render(updated), ['original.jpg']);
    assert.deepEqual(f.render(updated, true), ['original.jpg']);
    assert.deepEqual(f.render(updated, false), ['original.jpg']);
    f.requests.at(-1).reject(new Error('offline'));
    await flushPhotos();
    assert.deepEqual(f.render(updated), ['original.jpg']);
    f.render(updated, false, 1);
    f.requests.at(-1).resolve(['new.jpg', 'original.jpg']);
    await flushPhotos();
    assert.deepEqual(f.render(updated, false, 1), ['new.jpg', 'original.jpg']);
  } finally { f.dispose(); }
});

test('returning to a card restores its cached photo while unrelated events stay empty', async () => {
  const f = photoHookFixture();
  try {
    f.render();
    f.requests[0].resolve(['original.jpg']);
    await flushPhotos();
    f.remount();
    assert.deepEqual(f.render(), ['original.jpg']);
    assert.deepEqual(f.render({ ...report, id: 'other', event_id: 'other' }), []);
    assert.deepEqual(f.render({ ...report, id: 'latest-testimony' }), ['original.jpg']);
  } finally { f.dispose(); }
});

test('failed reads stay distinguishable from a report that genuinely has no photos', async () => {
  const offline = fixture({ current: new Error('offline') }, [], new Error('offline'));
  await assert.rejects(offline.readReportCardPhotos(report, new AbortController().signal));
  const withoutEvent = fixture({ current: new Error('offline') }, [], null);
  await assert.rejects(withoutEvent.readReportCardPhotos({ ...report, event_id: undefined }, new AbortController().signal));
  const empty = fixture();
  assert.deepEqual(await empty.readReportCardPhotos(report, new AbortController().signal), []);
});
