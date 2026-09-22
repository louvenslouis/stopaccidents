import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

async function compile(path, dependencies = {}) {
  const source = await readFile(new URL(`../src/${path}.ts`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const exports = {};
  new Function('require', 'exports', outputText)((name) => dependencies[name], exports);
  return exports;
}

test('unified reads use the public safety RPCs and preserve report kinds', async () => {
  const calls = [];
  const responses = {
    read_latest_report: { id: 'kidnap', report_kind: 'kidnapping' },
    read_map_reports: {
      reports: [{ id: 'kidnap', report_kind: 'kidnapping' }],
      truncated: false,
    },
    read_kidnapping_report: {
      id: 'kidnap',
      report_kind: 'kidnapping',
      is_owner: false,
    },
  };
  const read = await compile('features/safety-report/read', {
    '@/lib/supabase': {
      supabase: {
        rpc: (name, params) => {
          calls.push([name, params]);
          return {
            abortSignal: async () => ({ data: responses[name], error: null }),
          };
        },
      },
    },
  });
  const signal = new AbortController().signal;
  assert.equal((await read.readLatestReport(signal)).report_kind, 'kidnapping');
  assert.equal((await read.readMapReports(signal)).reports.length, 1);
  assert.equal((await read.readKidnappingReport('kidnap', signal)).is_owner, false);
  assert.deepEqual(calls, [
    ['read_latest_report', undefined],
    ['read_map_reports', undefined],
    ['read_kidnapping_report', { p_id: 'kidnap' }],
  ]);
  assert.equal(
    read.reportSelection({ id: 'kidnap', report_kind: 'kidnapping' }),
    'kidnapping:kidnap',
  );
  assert.deepEqual(read.parseReportSelection('kidnapping:kidnap'), {
    reportKind: 'kidnapping',
    id: 'kidnap',
  });
  assert.equal(read.parseReportSelection('invalid'), null);
});

test('kidnapping markers are visible, distinct and open the kidnapping detail', async () => {
  const documentModule = await compile('components/map-document');
  const presentation = await compile('features/accident-report/presentation');
  const read = await compile('features/safety-report/read', {
    '@/lib/supabase': {},
  });
  const { safetyReportMarkers } = await compile('features/safety-report/map-markers', {
    '@/components/map-document': documentModule,
    '@/features/accident-report/presentation': presentation,
    './read': read,
  });
  const reports = [
    {
      id: 'kidnap',
      report_kind: 'kidnapping',
      latitude: 18.5,
      longitude: -72.3,
      created_at: '2026-01-02T00:00:00Z',
      completed_step: 3,
      accident_type: null,
      severity: null,
    },
    {
      id: 'accident',
      report_kind: 'accident',
      latitude: 18.6,
      longitude: -72.4,
      created_at: '2026-01-01T00:00:00Z',
      completed_step: 4,
      accident_type: 'two_cars',
      severity: 'serious',
    },
  ];
  const markers = safetyReportMarkers(reports);
  assert.equal(markers.length, 2);
  assert.equal(markers[0].id, 'kidnapping:kidnap');
  assert.equal(markers[0].color, '#7C3FA0');
  assert.equal(markers[0].priority, 5);
  assert.match(markers[0].title, /^Enlèvement/);
  assert.equal(markers[1].id, 'accident:accident');
});
