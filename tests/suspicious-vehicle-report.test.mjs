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
const model = await compile('features/suspicious-vehicle-report/model');
const draft = {
  id: 'vehicle-id', location: 'Delmas', locationHint: 'Près du carrefour',
  coordinates: { latitude: 18.55, longitude: -72.3, accuracy: 9 },
  color: 'Bleu', vehicleType: 'sedan', windowTint: 'yes', registration: '', photo: null,
  vehicleDescription: '  Berline bleue  ', observedBehavior: '  Passages répétés  ', details: '',
};

test('suspicious vehicle requires a vehicle description and observed facts, with optional details', () => {
  assert.equal(model.validateSuspiciousVehicleStep(draft, 0), null);
  assert.ok(model.validateSuspiciousVehicleStep({ ...draft, coordinates: null }, 0));
  assert.equal(model.validateSuspiciousVehicleStep(draft, 1), null);
  for (const patch of [{ color: '' }, { vehicleType: null }, { windowTint: null }, { registration: 'x'.repeat(81) }]) assert.ok(model.validateSuspiciousVehicleStep({ ...draft, ...patch }, 1));
  assert.equal(model.validateSuspiciousVehicleStep({ ...draft, vehicleDescription: '', windowTint: 'unknown', registration: '' }, 1), null);
  assert.ok(model.validateSuspiciousVehicleStep({ ...draft, observedBehavior: 'ab' }, 1));
  assert.equal(model.validateSuspiciousVehicleStep(draft, 2), null);
  for (const [field, limit, step] of [['observedBehavior', 1000, 1], ['details', 2000, 2]]) {
    if (field !== 'details') assert.ok(model.validateSuspiciousVehicleStep({ ...draft, [field]: '  ' }, step));
    assert.ok(model.validateSuspiciousVehicleStep({ ...draft, [field]: 'x'.repeat(limit + 1) }, step));
    assert.equal(model.validateSuspiciousVehicleStep({ ...draft, [field]: 'x'.repeat(limit) }, step), null);
  }
});

test('suspicious vehicle saves each stage under the same ID and safely retries failures', async () => {
  const calls = [];
  let fail = false;
  const { saveSuspiciousVehicleReportStep } = await compile('features/suspicious-vehicle-report/submit', {
    './model': model,
    '@/features/report-events/api': { prepareReportEvent: async () => {} },
    './photos': { completeSuspiciousVehicleReport: async (value) => { calls.push({ payload: { p_id: value.id, p_details: value.details, p_photos: [] } }); return value.id; } },
    '@/lib/supabase': { supabase: {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'owner' } } }, error: null }) },
      rpc: async (name, payload) => {
        calls.push({ name, payload });
        return { data: fail ? null : payload.p_id, error: fail ? {} : null };
      },
    } },
  });
  await saveSuspiciousVehicleReportStep(draft, 0, () => {});
  assert.deepEqual(calls[0], { name: 'save_suspicious_vehicle_report_step', payload: {
    p_id: draft.id, p_step: 1, p_location: 'Delmas — Près du carrefour',
    p_latitude: 18.55, p_longitude: -72.3, p_accuracy: 9,
  } });
  fail = true;
  await assert.rejects(saveSuspiciousVehicleReportStep(draft, 1, () => {}), /aucun doublon/);
  fail = false;
  await saveSuspiciousVehicleReportStep(draft, 1, () => {});
  assert.deepEqual(calls[1], calls[2]);
  assert.deepEqual(calls[2].payload, { p_id: draft.id, p_step: 2, p_vehicle_description: 'Couleur : Bleu\nType : Berline\nVitres teintées : Oui\nBerline bleue', p_observed_behavior: 'Passages répétés' });
  await saveSuspiciousVehicleReportStep(draft, 2, () => {});
  assert.deepEqual(calls[3].payload, { p_id: draft.id, p_details: '', p_photos: [] });
});

test('suspicious vehicle markers select the matching detail RPC and respect map bounds', async () => {
  const calls = [];
  const report = { id: draft.id, report_kind: 'suspicious_vehicle', latitude: 18.55, longitude: -72.3, created_at: '2026-09-22T00:00:00Z' };
  const read = await compile('features/safety-report/read', { '@/lib/supabase': { supabase: {
    rpc: (name, params) => { calls.push({ name, params }); return { abortSignal: async () => ({ data: report, error: null }) }; },
  } } });
  const { safetyReportMarkers } = await compile('features/safety-report/map-markers', {
    './read': read,
    '@/components/map-document': { HAITI_BOUNDS: [[18, -74.55], [20.1, -71.6]] },
    '@/features/accident-report/presentation': { formatAccidentDate: () => 'date' },
  });
  const markers = safetyReportMarkers([report, { ...report, latitude: null }, { ...report, latitude: 90 }]);
  assert.equal(markers.length, 1);
  assert.equal(markers[0].illustration, 'suspicious_vehicle');
  assert.match(markers[0].title, /^Voiture suspecte/);
  assert.deepEqual(read.parseReportSelection(markers[0].id), { reportKind: 'suspicious_vehicle', id: draft.id });
  assert.equal(await read.readSuspiciousVehicleReport(draft.id, new AbortController().signal), report);
  assert.deepEqual(calls, [{ name: 'read_suspicious_vehicle_report', params: { p_id: draft.id } }]);
});


test('vehicle description retains every answer including optional registration', () => {
  assert.equal(model.suspiciousVehicleDescription({ ...draft, registration: ' AA-123 ', vehicleDescription: '' }), 'Couleur : Bleu\nType : Berline\nVitres teintées : Oui\nImmatriculation : AA-123');
  assert.ok(model.validateSuspiciousVehicleStep({ ...draft, vehicleDescription: 'x'.repeat(1500) }, 1));
  assert.ok(model.validateSuspiciousVehicleStep({ ...draft, photo: { base64: '' } }, 2));
  assert.ok(model.validateSuspiciousVehicleStep({ ...draft, photo: { base64: 'a'.repeat(8388609) } }, 2));
});

async function photoFixture({ saved = [], uploadError = false, rpcError = false } = {}) {
  const calls = { uploads: [], removals: [], rpc: [] };
  const supabase = {
    from: () => ({ select: () => ({ eq: async () => ({ data: saved.map((storage_path) => ({ storage_path })), error: null }) }) }),
    storage: { from: () => ({ upload: async (path) => { calls.uploads.push(path); return { error: uploadError }; }, remove: async (paths) => { calls.removals.push(paths); return {}; } }) },
    rpc: async (name, payload) => { calls.rpc.push({ name, payload }); return { data: rpcError ? null : payload.p_id, error: rpcError }; },
  };
  const photos = await compile('features/suspicious-vehicle-report/photos', { './model': model,
    '@/features/report-events/api': { prepareReportEvent: async () => {} }, '@/lib/supabase': { supabase }, 'base64-arraybuffer': { decode: () => new ArrayBuffer(5) } });
  return { calls, complete: (value) => photos.completeSuspiciousVehicleReport(value, 'owner', () => {}) };
}
const photoDraft = { ...draft, photo: { id: 'photo', base64: 'aGVsbG8=', capturedAt: '2026-09-22T00:00:00Z' } };
const photoPath = 'owner/vehicle-id/photo.jpg';
test('optional photo uploads once and retries reuse attached bytes', async () => {
  let f = await photoFixture();
  await f.complete(photoDraft);
  assert.deepEqual(f.calls.uploads, [photoPath]);
  assert.deepEqual(f.calls.rpc[0], { name: 'complete_suspicious_vehicle_report', payload: { p_id: draft.id, p_details: '', p_photos: [{ storage_path: photoPath, captured_at: photoDraft.photo.capturedAt }] } });
  f = await photoFixture({ saved: [photoPath] });
  await f.complete(photoDraft);
  assert.deepEqual(f.calls.uploads, []);
  assert.deepEqual(f.calls.removals, []);
});
test('photo upload failures allow retry; removal and no-photo completion work', async () => {
  let f = await photoFixture({ uploadError: true });
  await assert.rejects(f.complete(photoDraft), /sans photo/);
  assert.equal(f.calls.rpc.length, 0);
  assert.deepEqual(f.calls.removals, [[photoPath]]);
  f = await photoFixture({ rpcError: true });
  await assert.rejects(f.complete(photoDraft), /aucun doublon/);
  assert.deepEqual(f.calls.removals, [[photoPath]]);
  f = await photoFixture({ saved: [photoPath] });
  await f.complete(draft);
  assert.deepEqual(f.calls.rpc[0].payload.p_photos, []);
  assert.deepEqual(f.calls.removals, [[photoPath]]);
});
test('photo signing errors preserve readable vehicle details', async () => {
  const report = { id: 'vehicle-id', vehicle_description: 'Bleu', photos: [{ storage_path: photoPath }] };
  const read = await compile('features/safety-report/read', { '@/lib/supabase': { supabase: {
    rpc: () => ({ abortSignal: async () => ({ data: report, error: null }) }),
    storage: { from: () => ({ createSignedUrls: async () => { throw new Error('offline'); } }) },
  } } });
  const result = await read.readSuspiciousVehicleReport('vehicle-id', new AbortController().signal);
  assert.equal(result.vehicle_description, 'Bleu');
  assert.equal(result.photos[0].url, null);
});
