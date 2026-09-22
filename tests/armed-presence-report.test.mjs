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
const model = await compile('features/armed-presence-report/model');
const draft = {
  id: 'armed-id', location: 'Delmas', locationHint: 'Près du carrefour',
  coordinates: { latitude: 18.55, longitude: -72.3, accuracy: 9 },
  presence: '  3  ', activity: '  Présence au carrefour  ', details: '',
};

test('armed presence accepts an approximate count, unknown activity and optional details', () => {
  assert.equal(model.validateArmedPresenceStep(draft, 0), null);
  assert.ok(model.validateArmedPresenceStep({ ...draft, coordinates: null }, 0));
  assert.equal(model.validateArmedPresenceStep(draft, 1), null);
  assert.equal(model.validateArmedPresenceStep({ ...draft, presence: 'inconnu', activity: 'inconnue' }, 1), null);
  assert.equal(model.validateArmedPresenceStep(draft, 2), null);
  for (const [field, limit, step] of [['presence', 1500, 1], ['activity', 1000, 1], ['details', 2000, 2]]) {
    if (field !== 'details') assert.ok(model.validateArmedPresenceStep({ ...draft, [field]: '  ' }, step));
    assert.ok(model.validateArmedPresenceStep({ ...draft, [field]: 'x'.repeat(limit + 1) }, step));
    assert.equal(model.validateArmedPresenceStep({ ...draft, [field]: 'x'.repeat(limit) }, step), null);
  }
});

test('armed presence saves each stage under the same ID and safely retries failures', async () => {
  const calls = [];
  let fail = false;
  const { saveArmedPresenceReportStep } = await compile('features/armed-presence-report/submit', {
    './model': model,
    '@/lib/supabase': { supabase: {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'owner' } } }, error: null }) },
      rpc: async (name, payload) => {
        calls.push({ name, payload });
        return { data: fail ? null : payload.p_id, error: fail ? {} : null };
      },
    } },
  });
  await saveArmedPresenceReportStep(draft, 0, () => {});
  assert.deepEqual(calls[0], { name: 'save_armed_presence_report_step', payload: {
    p_id: draft.id, p_step: 1, p_location: 'Delmas — Près du carrefour',
    p_latitude: 18.55, p_longitude: -72.3, p_accuracy: 9,
  } });
  fail = true;
  await assert.rejects(saveArmedPresenceReportStep(draft, 1, () => {}), /aucun doublon/);
  fail = false;
  await saveArmedPresenceReportStep(draft, 1, () => {});
  assert.deepEqual(calls[1], calls[2]);
  assert.deepEqual(calls[2].payload, { p_id: draft.id, p_step: 2, p_presence: '3', p_activity: 'Présence au carrefour' });
  await saveArmedPresenceReportStep(draft, 2, () => {});
  assert.deepEqual(calls[3].payload, { p_id: draft.id, p_step: 3, p_details: '' });
});

test('armed presence markers select the matching detail RPC and respect map bounds', async () => {
  const calls = [];
  const report = { id: draft.id, report_kind: 'armed_presence', latitude: 18.55, longitude: -72.3, created_at: '2026-09-22T00:00:00Z' };
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
  assert.equal(markers[0].illustration, 'armed_presence');
  assert.match(markers[0].title, /^Présence d’hommes armés/);
  assert.deepEqual(read.parseReportSelection(markers[0].id), { reportKind: 'armed_presence', id: draft.id });
  assert.equal(await read.readArmedPresenceReport(draft.id, new AbortController().signal), report);
  assert.deepEqual(calls, [{ name: 'read_armed_presence_report', params: { p_id: draft.id } }]);
});
