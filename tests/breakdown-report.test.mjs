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

const model = await compile('features/breakdown-report/model');
const draft = {
  id: 'breakdown-id',
  location: 'Delmas',
  locationHint: 'Près du carrefour',
  coordinates: { latitude: 18.55, longitude: -72.3, accuracy: 9 },
  breakdownPosition: 'roadway',
  vehicleType: 'truck',
  trafficImpact: 'major_slowdown',
  details: 'Voie de droite bloquée',
};

test('breakdown validates location, position, vehicle and traffic impact', () => {
  assert.equal(model.validateBreakdownStep(draft, 0), null);
  assert.ok(model.validateBreakdownStep({ ...draft, coordinates: null }, 0));
  assert.ok(model.validateBreakdownStep({ ...draft, coordinates: { ...draft.coordinates, accuracy: 31 } }, 0));
  assert.equal(model.validateBreakdownStep(draft, 1), null);
  assert.ok(model.validateBreakdownStep({ ...draft, breakdownPosition: null }, 1));
  assert.ok(model.validateBreakdownStep({ ...draft, breakdownPosition: 'invalid' }, 1));
  assert.equal(model.validateBreakdownStep(draft, 2), null);
  assert.ok(model.validateBreakdownStep({ ...draft, vehicleType: null }, 2));
  assert.equal(model.validateBreakdownStep(draft, 3), null);
  assert.ok(model.validateBreakdownStep({ ...draft, trafficImpact: null }, 3));
  assert.equal(model.validateBreakdownStep({ ...draft, details: 'x'.repeat(2000) }, 3), null);
  assert.ok(model.validateBreakdownStep({ ...draft, details: 'x'.repeat(2001) }, 3));
  assert.equal(model.breakdownLocationDescription(draft), 'Delmas — Près du carrefour');
});

test('breakdown saves each stage under one stable ID and retries safely', async () => {
  const calls = [];
  let fail = false;
  const { saveBreakdownReportStep } = await compile('features/breakdown-report/submit', {
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

  await saveBreakdownReportStep(draft, 0, () => {});
  assert.deepEqual(calls[0], { name: 'save_breakdown_report_step', payload: {
    p_id: draft.id,
    p_step: 1,
    p_location: 'Delmas — Près du carrefour',
    p_latitude: 18.55,
    p_longitude: -72.3,
    p_accuracy: 9,
  } });
  await saveBreakdownReportStep(draft, 1, () => {});
  assert.deepEqual(calls[1].payload, {
    p_id: draft.id, p_step: 2, p_breakdown_position: 'roadway',
  });
  fail = true;
  await assert.rejects(saveBreakdownReportStep(draft, 2, () => {}), /aucun doublon/);
  fail = false;
  await saveBreakdownReportStep(draft, 2, () => {});
  assert.deepEqual(calls[2], calls[3]);
  assert.deepEqual(calls[3].payload, {
    p_id: draft.id, p_step: 3, p_vehicle_type: 'truck',
  });
  await saveBreakdownReportStep(draft, 3, () => {});
  assert.deepEqual(calls[4].payload, {
    p_id: draft.id,
    p_step: 4,
    p_traffic_impact: 'major_slowdown',
    p_details: 'Voie de droite bloquée',
  });
});

test('breakdown appears on the map and opens its dedicated detail RPC', async () => {
  const calls = [];
  const report = {
    id: draft.id,
    report_kind: 'breakdown',
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
  assert.equal(markers[0].illustration, 'breakdown');
  assert.match(markers[0].title, /^Véhicule en panne/);
  assert.deepEqual(read.parseReportSelection(markers[0].id), {
    reportKind: 'breakdown', id: draft.id,
  });
  assert.equal(await read.readBreakdownReport(draft.id, new AbortController().signal), report);
  assert.deepEqual(calls, [{ name: 'read_breakdown_report', params: { p_id: draft.id } }]);
});
