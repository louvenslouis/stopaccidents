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
const model = await compile('features/barricade-report/model');
const draft = {
  id: 'barricade-id', location: 'Delmas', locationHint: 'Près du carrefour',
  coordinates: { latitude: 18.55, longitude: -72.3, accuracy: 9 },
  barricadeTypes: ['stones', 'burning-tires'],
  obstacles: '  Pneus et pierres  ', passage: '  Passage totalement bloqué  ',
  details: '  Blocage observé depuis une heure  ',
};

test('barricade validation enforces precise GPS and field limits', () => {
  assert.equal(model.validateBarricadeStep(draft, 0), null);
  assert.ok(model.validateBarricadeStep({ ...draft, coordinates: null }, 0));
  assert.ok(model.validateBarricadeStep({ ...draft, coordinates: { ...draft.coordinates, accuracy: 31 } }, 0));
  for (const [field, limit, step] of [['passage', 1000, 1], ['details', 2000, 2]]) {
    assert.ok(model.validateBarricadeStep({ ...draft, [field]: '  ' }, step));
    assert.ok(model.validateBarricadeStep({ ...draft, [field]: 'x'.repeat(limit + 1) }, step));
    assert.equal(model.validateBarricadeStep({ ...draft, [field]: 'x'.repeat(limit) }, step), null);
  }
});

test('barricade steps preserve the ID across failed saves and retries', async () => {
  const calls = [];
  let fail = false;
  const { saveBarricadeReportStep } = await compile('features/barricade-report/submit', {
    './model': model,
    '@/features/report-events/api': { prepareReportEvent: async () => {} },
    '@/lib/supabase': { supabase: {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'owner' } } }, error: null }) },
      rpc: async (name, payload) => {
        calls.push({ name, payload });
        return { data: fail ? null : payload.p_id, error: fail ? {} : null };
      },
    } },
  });
  await saveBarricadeReportStep(draft, 0, () => {});
  assert.deepEqual(calls[0], { name: 'save_barricade_report_step', payload: {
    p_id: draft.id, p_step: 1, p_location: 'Delmas — Près du carrefour',
    p_latitude: 18.55, p_longitude: -72.3, p_accuracy: 9,
  } });
  fail = true;
  await assert.rejects(saveBarricadeReportStep(draft, 1, () => {}), /aucun doublon/);
  fail = false;
  await saveBarricadeReportStep(draft, 1, () => {});
  assert.deepEqual(calls[1], calls[2]);
  assert.deepEqual(calls[2].payload, { p_id: draft.id, p_step: 2, p_obstacles: 'Pierres, Pneus enflammés — Pneus et pierres', p_passage: 'Passage totalement bloqué' });
  await saveBarricadeReportStep(draft, 2, () => {});
  assert.deepEqual(calls[3].payload, { p_id: draft.id, p_step: 3, p_details: 'Blocage observé depuis une heure' });
});

test('barricade markers route to their details and reject invalid coordinates', async () => {
  const read = await compile('features/safety-report/read', { '@/lib/supabase': {} });
  const { safetyReportMarkers } = await compile('features/safety-report/map-markers', {
    './read': read,
    '@/components/map-document': { HAITI_BOUNDS: [[18, -74.55], [20.1, -71.6]] },
    '@/features/accident-report/presentation': { formatAccidentDate: () => 'date' },
  });
  const report = { id: draft.id, report_kind: 'barricade', latitude: 18.55, longitude: -72.3, created_at: '2026-09-22T00:00:00Z' };
  const markers = safetyReportMarkers([report, { ...report, latitude: null }, { ...report, latitude: 90 }]);
  assert.equal(markers.length, 1);
  assert.equal(markers[0].illustration, 'barricade');
  assert.match(markers[0].title, /^Route barricadée/);
  assert.deepEqual(read.parseReportSelection(markers[0].id), { reportKind: 'barricade', id: draft.id });
});


test('multiple illustrated types are required and saved in stable catalog order', () => {
  assert.ok(model.validateBarricadeStep({ ...draft, barricadeTypes: [] }, 1));
  assert.ok(model.validateBarricadeStep({ ...draft, barricadeTypes: ['unknown'] }, 1));
  const selected = { ...draft, barricadeTypes: ['tree-trunks', 'stones', 'stones'], obstacles: '' };
  assert.equal(model.validateBarricadeStep(selected, 1), null);
  assert.equal(model.barricadeObstaclesDescription(selected), 'Pierres, Troncs d’arbres');
  assert.ok(model.validateBarricadeStep({ ...draft, barricadeTypes: ['other'], obstacles: ' ' }, 1));
  assert.equal(model.validateBarricadeStep({ ...draft, barricadeTypes: ['other'], obstacles: 'Barrière métallique' }, 1), null);
  const prefixLength = model.barricadeObstaclesDescription({ ...draft, obstacles: '' }).length + 3;
  assert.equal(model.validateBarricadeStep({ ...draft, obstacles: 'x'.repeat(1500 - prefixLength) }, 1), null);
  assert.ok(model.validateBarricadeStep({ ...draft, obstacles: 'x'.repeat(1501 - prefixLength) }, 1));
});
