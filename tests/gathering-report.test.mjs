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

const model = await compile('features/gathering-report/model');
const draft = {
  id: 'gathering-id',
  location: 'Delmas',
  locationHint: 'Près du carrefour',
  coordinates: { latitude: 18.55, longitude: -72.3, accuracy: 9 },
  gatheringType: 'demonstration',
  gatheringState: 'stationary',
  trafficImpact: 'blocked',
  details: 'Marche près du carrefour',
};

test('gathering validates location, type, situation and traffic impact', () => {
  assert.equal(model.validateGatheringStep(draft, 0), null);
  assert.ok(model.validateGatheringStep({ ...draft, coordinates: null }, 0));
  assert.ok(model.validateGatheringStep({ ...draft, coordinates: { ...draft.coordinates, accuracy: 31 } }, 0));
  assert.equal(model.validateGatheringStep(draft, 1), null);
  assert.ok(model.validateGatheringStep({ ...draft, gatheringType: null }, 1));
  assert.ok(model.validateGatheringStep({ ...draft, gatheringType: 'invalid' }, 1));
  assert.equal(model.validateGatheringStep(draft, 2), null);
  assert.ok(model.validateGatheringStep({ ...draft, gatheringState: null }, 2));
  assert.equal(model.validateGatheringStep(draft, 3), null);
  assert.ok(model.validateGatheringStep({ ...draft, trafficImpact: null }, 3));
  assert.equal(model.validateGatheringStep({ ...draft, details: 'x'.repeat(2000) }, 3), null);
  assert.ok(model.validateGatheringStep({ ...draft, details: 'x'.repeat(2001) }, 3));
  assert.equal(model.gatheringLocationDescription(draft), 'Delmas — Près du carrefour');
});

test('gathering saves each stage under one stable ID and retries safely', async () => {
  const calls = [];
  let fail = false;
  const { saveGatheringReportStep } = await compile('features/gathering-report/submit', {
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

  await saveGatheringReportStep(draft, 0, () => {});
  assert.deepEqual(calls[0], { name: 'save_gathering_report_step', payload: {
    p_id: draft.id,
    p_step: 1,
    p_location: 'Delmas — Près du carrefour',
    p_latitude: 18.55,
    p_longitude: -72.3,
    p_accuracy: 9,
  } });
  await saveGatheringReportStep(draft, 1, () => {});
  assert.deepEqual(calls[1].payload, {
    p_id: draft.id, p_step: 2, p_gathering_type: 'demonstration',
  });
  fail = true;
  await assert.rejects(saveGatheringReportStep(draft, 2, () => {}), /aucun doublon/);
  fail = false;
  await saveGatheringReportStep(draft, 2, () => {});
  assert.deepEqual(calls[2], calls[3]);
  assert.deepEqual(calls[3].payload, {
    p_id: draft.id, p_step: 3, p_gathering_state: 'stationary',
  });
  await saveGatheringReportStep(draft, 3, () => {});
  assert.deepEqual(calls[4].payload, {
    p_id: draft.id,
    p_step: 4,
    p_traffic_impact: 'blocked',
    p_details: 'Marche près du carrefour',
  });
});

test('gathering appears on the map and opens its dedicated detail RPC', async () => {
  const calls = [];
  const report = {
    id: draft.id,
    report_kind: 'gathering',
    latitude: 18.55,
    longitude: -72.3,
    created_at: '2026-09-22T00:00:00Z',
  };
  const read = await compile('features/safety-report/read', {
    '@/lib/supabase': { supabase: { rpc: (name, params) => {
      calls.push({ name, params });
      return { abortSignal: async () => ({ data: report, error: null }) };
    } } },
  });
  const { safetyReportMarkers } = await compile('features/safety-report/map-markers', {
    './read': read,
    '@/components/map-document': { HAITI_BOUNDS: [[18, -74.55], [20.1, -71.6]] },
    '@/features/accident-report/presentation': { formatAccidentDate: () => 'date' },
  });
  const markers = safetyReportMarkers([report, { ...report, latitude: null }]);
  assert.equal(markers.length, 1);
  assert.equal(markers[0].illustration, 'gathering');
  assert.match(markers[0].title, /^Rassemblement/);
  assert.deepEqual(read.parseReportSelection(markers[0].id), {
    reportKind: 'gathering', id: draft.id,
  });
  assert.equal(await read.readGatheringReport(draft.id, new AbortController().signal), report);
  assert.deepEqual(calls, [{ name: 'read_gathering_report', params: { p_id: draft.id } }]);
});
