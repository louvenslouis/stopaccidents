import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

async function compile(path, dependencies = {}) {
  const source = await readFile(new URL(`../src/${path}.ts`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const exports = {};
  new Function('require', 'exports', outputText)((name) => dependencies[name], exports);
  return exports;
}
const geometry = await compile('features/map/route-geometry');
const { nearbyReports, savedPoint, reportAge } = await compile('features/home/model', { '@/features/map/route-geometry': geometry });
const now = Date.parse('2026-09-23T03:00:00Z');
const center = { latitude: 18.54, longitude: -72.33 };
const report = (id, changes = {}) => ({ id, report_kind: 'accident', ...center, created_at: new Date(now - 3600_000).toISOString(), ...changes });

test('home feed filters a real radius and last observation, excludes invalid and future reports', () => {
  const reports = [
    report('near'), report('far', { latitude: 19 }),
    report('stale', { created_at: new Date(now - 25 * 3600_000).toISOString() }),
    report('renewed', { created_at: new Date(now - 25 * 3600_000).toISOString(), last_observed_at: new Date(now - 600_000).toISOString() }),
    report('missing', { latitude: null }), report('invalid', { latitude: NaN }),
    report('future', { created_at: new Date(now + 3600_000).toISOString() }),
  ];
  assert.deepEqual(nearbyReports(reports, center, 10, now).map((item) => item.report.id), ['renewed', 'near']);
  assert.equal(nearbyReports(reports, center, 10, now)[0].distance, 0);
  const national = nearbyReports(reports, null, 10, now);
  assert.ok(national.some((item) => item.report.id === 'far'));
  assert.ok(national.every((item) => item.distance === null));
});

test('home feed preserves the newest testimony per event and supports wider radii', () => {
  const reports = [report('old', { event_id: 'event' }), report('new', { event_id: 'event', created_at: new Date(now - 120_000).toISOString() }), report('outer', { latitude: 18.64 })];
  assert.deepEqual(nearbyReports(reports, center, 5, now).map((item) => item.report.id), ['new']);
  assert.deepEqual(nearbyReports(reports, center, 25, now).map((item) => item.report.id), ['new', 'outer']);
});

test('saved places require finite coordinates and relative ages stay readable', () => {
  assert.equal(savedPoint(null), null);
  assert.equal(savedPoint({ address: 'Home', latitude: null, longitude: -72 }), null);
  assert.equal(savedPoint({ address: 'Home', latitude: NaN, longitude: -72 }), null);
  assert.deepEqual(savedPoint({ address: 'Home', ...center }), center);
  assert.equal(reportAge(now - 30_000, now), 'À l’instant');
  assert.equal(reportAge(now - 10 * 60_000, now), 'Il y a 10 min');
  assert.equal(reportAge(now - 3 * 3600_000, now), 'Il y a 3 h');
});

test('visitors never query private saved places; signed-in users get their actual places', async () => {
  let session = null;
  let reads = 0;
  const expected = { home: { address: 'Domicile', ...center }, work: null };
  const { readHomePlaces } = await compile('features/home/api', {
    '@/lib/supabase': { supabase: { auth: { getSession: async () => ({ data: { session }, error: null }) } } },
    '@/features/profile/saved-places': { readSavedPlaces: async () => { reads++; return expected; } },
  });
  assert.deepEqual(await readHomePlaces(), { home: null, work: null });
  session = { user: { is_anonymous: true } };
  await readHomePlaces();
  assert.equal(reads, 0);
  session = { user: { email: 'test@example.com' } };
  assert.deepEqual(await readHomePlaces(), expected);
  assert.equal(reads, 1);
});
