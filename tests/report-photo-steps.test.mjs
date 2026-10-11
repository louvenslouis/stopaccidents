import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

function compile(source, dependencies) {
  const exports = {};
  new Function('require', 'exports', ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText)(name => dependencies[name] ?? {}, exports);
  return exports;
}
const context = compile(await readFile('src/features/report-events/context.ts', 'utf8'), {});
const accidentModel = compile(await readFile('src/features/accident-report/model.ts', 'utf8'), {
  '@/features/report-events/context': context,
});
const modelDependencies = {
  '@/features/report-events/context': context,
  '@/features/accident-report/model': accidentModel,
  '@/features/safety-profile/model': { normalizeIdentifier: value => value },
};
const photoModel = compile(await readFile('src/features/report-events/photos.ts', 'utf8'), modelDependencies);
const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const result = find(child, predicate);
    if (result) return result;
  }
  return null;
}
const flows = [
  ['accident', 'ReportSheet', 'report-sheet', 3, 'saveAccidentReportStep'],
  ['suspicious_vehicle', 'SuspiciousVehicleReportSheet', 'suspicious-vehicle-report-sheet', 2, 'saveSuspiciousVehicleReportStep'],
  ['fire', 'FireReportSheet', 'fire-report-sheet', 3, 'saveFireReportStep'],
  ['gathering', 'GatheringReportSheet', 'gathering-report-sheet', 3, 'saveGatheringReportStep'],
  ['breakdown', 'BreakdownReportSheet', 'breakdown-report-sheet', 3, 'saveBreakdownReportStep'],
  ['armed_presence', 'ArmedPresenceReportSheet', 'armed-presence-report-sheet', 2, 'saveArmedPresenceReportStep'],
  ['kidnapping', 'KidnappingReportSheet', 'kidnapping-report-sheet', 2, 'saveKidnappingReportStep'],
  ['barricade', 'BarricadeReportSheet', 'barricade-report-sheet', 2, 'saveBarricadeReportStep'],
  ['gunfire', 'GunfireReportSheet', 'gunfire-report-sheet', 2, 'saveGunfireReportStep'],
];
async function fixture([kind, component, file, last, saveName], source = 'device', testimony = false) {
  let cursor = 0, tree, fail = false;
  const hooks = [], calls = [];
  const state = initial => {
    const i = cursor++;
    if (!(i in hooks)) hooks[i] = typeof initial === 'function' ? initial() : initial;
    return [hooks[i], next => { hooks[i] = typeof next === 'function' ? next(hooks[i]) : next; }];
  };
  const feature = kind.replaceAll('_', '-') + '-report';
  const model = kind === 'accident' ? accidentModel : compile(await readFile(`src/features/${feature}/model.ts`, 'utf8'), modelDependencies);
  const save = async (draft, step) => { calls.push({ draft, step }); return draft.id; };
  const deps = {
    react: { useState: state, useRef: initial => { const i = cursor++; return hooks[i] ??= { current: initial }; }, useEffect: () => {} },
    'react/jsx-runtime': jsx,
    'react-native': { StyleSheet: { create: styles => styles }, ActivityIndicator: 'Loading' },
    'expo-crypto': { randomUUID: () => 'report-id' },
    '@/features/language/native': { View: 'View', Text: 'Text', Pressable: 'Button', ScrollView: 'ScrollView', TextInput: 'Input' },
    '@/features/appearance/theme-provider': {
      useAppTheme: () => ({ scheme: 'light' }), useThemeColor: () => light => light,
      createThemedStyles: fn => () => fn(light => light),
    },
    '@/features/report-events/use-report-draft': { useReportDraft: (_kind, factory) => {
      const [draft, setDraft] = state(() => ({ ...factory(), location: 'Delmas', locationSource: source,
        coordinates: { latitude: 18.55, longitude: -72.3, accuracy: source === 'manual' ? null : 9 },
        ...(testimony ? { sourceReportId: 'original-id' } : {}),
      }));
      const [step, setStep] = state(1), [savedSteps, setSavedSteps] = state(testimony ? 0 : 1), [receipt, setReceipt] = state(null);
      return { draft, setDraft, step, setStep, savedSteps, setSavedSteps, receipt, setReceipt, ready: true, checkpoint: async () => {} };
    } },
    '@/features/report-events/use-event-choice': { useEventChoice: () => ({ panel: null }) },
    '@/features/report-events/photos': { ...photoModel, saveReportPhotos: async (_kind, draft) => {
      assert.equal(_kind, kind);
      calls.push({ draft, step: 'photos' });
      if (fail) throw new Error('Envoi échoué');
      return draft.id;
    } },
    '@/components/report-photo-step': { ReportPhotoStep: 'PhotoStep' },
    '@/components/report-reward': { ReportReward: 'Reward' },
    '@/features/location/app-location': { useAppLocation: () => ({ location: null }) },
    '@/components/ui/surface-depth': { surfaceDepth: () => ({}) },
    '@/features/accident-report/model': accidentModel,
    [`@/features/${feature}/model`]: model,
    [`@/features/${feature}/submit`]: { [saveName]: save },
  };
  const Component = compile(await readFile(`src/components/${file}.tsx`, 'utf8'), deps)[component];
  const render = () => { cursor = 0; return tree = Component({ visible: true, reportType: kind, onClose() {}, onBackToTypes() {} }); };
  const button = label => find(tree, node => node.props?.label === label || node.props?.accessibilityLabel === label);
  const photos = () => find(tree, node => node.type === 'PhotoStep');
  const reward = () => find(tree, node => node.type === 'Reward');
  render();
  return { render, button, photos, reward, calls, setFail: value => { fail = value; }, last };
}
const photo = { id: 'photo-id', uri: 'photo.jpg', base64: 'aGVsbG8=', capturedAt: new Date().toISOString() };
for (const flow of flows) {
  for (const source of ['device', 'manual']) {
    test(`${flow[0]} has a separate final photo stage retaining ${source} origin and pictures through Back`, async () => {
      const f = await fixture(flow, source);
      for (let i = 1; i <= f.last; i++) {
        assert.equal(f.photos(), null);
        await f.button('Suivant').props.onPress();
        f.render();
      }
      assert.ok(f.photos());
      assert.equal(f.reward(), null);
      assert.equal(f.photos().props.context.locationSource, source);
      const added = { ...photo, source: source === 'manual' ? 'library' : 'camera' };
      f.photos().props.onChange([added]);
      f.render();
      await f.button('Retour').props.onPress();
      f.render();
      assert.equal(f.photos(), null);
      f.button(`Étape ${f.last + 1} : Photos`).props.onPress();
      f.render();
      assert.deepEqual(f.photos().props.photos, [added]);
      f.photos().props.onBusyChange(true);
      f.render();
      assert.equal(f.button('Passer').props.disabled, true);
      assert.equal(f.button('Retour').props.disabled, true);
      f.photos().props.onBusyChange(false);
      f.render();
      const submit = find(f.render(), node => node.props?.label && node.props?.busy === false && node.props?.secondary !== true);
      await submit.props.onPress();
      f.render();
      assert.ok(f.reward());
      assert.deepEqual(f.calls.at(-1).draft.photos, [added]);
      assert.ok(f.calls.every(call => call.step === 'photos' || call.step <= f.last), 'the visual stage is never sent as an unknown database step');
    });
  }
  test(`${flow[0]} reaches Photos even after skipping every detail in a testimony`, async () => {
    const f = await fixture(flow, 'manual', true);
    for (let i = 1; i <= f.last; i++) {
      await f.button('Passer').props.onPress();
      f.render();
    }
    assert.ok(f.photos());
    assert.deepEqual(f.calls.map(call => call.step), [0], 'the testimony location exists before any image attachment');
    await f.button('Passer').props.onPress();
    f.render();
    assert.ok(f.reward());
  });
}
test('failed photo submission retains pictures and permits a retry before confirmation', async () => {
  const f = await fixture(flows[2]);
  for (let i = 1; i <= f.last; i++) { await f.button('Passer').props.onPress(); f.render(); }
  f.photos().props.onChange([{ ...photo, source: 'camera' }]);
  f.render();
  f.setFail(true);
  await f.button('Envoyer le signalement').props.onPress();
  f.render();
  assert.equal(f.reward(), null);
  assert.equal(f.photos().props.photos.length, 1);
  f.setFail(false);
  await f.button('Envoyer le signalement').props.onPress();
  f.render();
  assert.ok(f.reward());
});

test('the Photos controls offer only camera on site and only folder for manual context', async () => {
  const { ReportPhotos } = compile(await readFile('src/components/report-photos.tsx', 'utf8'), {
    react: { useState: value => [value, () => {}], useRef: value => ({ current: value }), useEffect() {} },
    'react/jsx-runtime': jsx, 'react-native': { StyleSheet: { create: styles => styles } },
    '@/features/language/native': { View: 'View', Text: 'Text', Pressable: 'Button' },
    '@/features/appearance/theme-provider': { useThemeColor: () => light => light },
    '@/features/accident-report/model': accidentModel,
    '@/features/report-events/photo-library': { canImportReportPhotos: context => context.locationSource === 'manual' },
  });
  for (const source of ['device', 'manual']) {
    const tree = ReportPhotos({ photos: [], context: { locationSource: source }, disabled: false, onBusyChange() {} });
    assert.equal(Boolean(find(tree, node => node.props?.children === 'Prendre une photo')), source === 'device');
    assert.equal(Boolean(find(tree, node => node.props?.children === 'Choisir des images')), source === 'manual');
  }
});
