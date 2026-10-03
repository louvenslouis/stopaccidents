import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';
const source = await readFile('src/features/home/report-stack.ts', 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const exports = {};
new Function('exports', outputText)(exports);
const { recentReportStack, stackReportKey } = exports;
const report = (id, age, event_id = id) => ({ id, event_id, report_kind: 'accident', created_at: new Date(Date.UTC(2026, 9, 3) - age * 1000).toISOString() });

test('stack orders previous events by newest testimony and removes repeated events', () => {
  const latest = report('latest', 0);
  const renewed = { ...report('renewed', 500), last_observed_at: report('time', 10).created_at };
  assert.deepEqual(recentReportStack(latest, [report('old', 100), renewed, report('duplicate', 20, 'latest')]).map(r => r.id), ['latest', 'renewed', 'old']);
  assert.equal(stackReportKey(report('new-representative', 0, 'latest')), stackReportKey(latest));
});
test('stack handles loading, a single event and a bounded history', () => {
  assert.deepEqual(recentReportStack(null, []), []);
  assert.equal(recentReportStack(report('only', 0), []).length, 1);
  assert.equal(recentReportStack(null, Array.from({ length: 30 }, (_, i) => report(String(i), i))).length, 20);
});
