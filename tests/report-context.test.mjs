import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';
function compile(source, dependencies = {}) {
  const exports = {};
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
  new Function('exports', 'require', outputText)(exports, name => dependencies[name] ?? {});
  return exports;
}
const context = compile(await readFile('src/features/report-events/context.ts', 'utf8'));
test('six-second deadline uses latest choice, survives toggles and runs only once', () => {
  let now = 0, tick, selection = false, result, completions = 0, progress;
  const clock = context.publicationCountdown(() => { result = selection; completions++; }, value => { progress = value; }, () => now, fn => { tick = fn; return 1; }, () => {});
  now = 3000; tick(); assert.equal(progress, 0.5);
  selection = true; now = 5999; tick(); assert.equal(completions, 0);
  now = 6000; tick(); assert.equal(result, true); assert.equal(completions, 1);
  clock.finish(); tick(); assert.equal(completions, 1);
});
test('manual publication and cancellation prevent subsequent timer publication', () => {
  for (const action of ['finish', 'cancel']) {
    let tick, calls = 0;
    const clock = context.publicationCountdown(() => calls++, () => {}, () => 0, fn => { tick = fn; return 1; }, () => {});
    clock[action](); clock.finish(); tick();
    assert.equal(calls, action === 'finish' ? 1 : 0);
  }
});
test('all seven report models accept an explicit historical map location and reject missing/future time', async () => {
  for (const kind of ['accident', 'armed-presence', 'barricade', 'breakdown', 'gunfire', 'kidnapping', 'suspicious-vehicle']) {
    const model = compile(await readFile(`src/features/${kind}-report/model.ts`, 'utf8'), { '@/features/report-events/context': context });
    const validate = Object.entries(model).find(([key]) => key.startsWith('validate'))[1];
    const draft = { location: 'Delmas', locationHint: '', locationSource: 'manual', occurredAt: new Date(Date.now() - 30 * 60_000).toISOString(), coordinates: { latitude: 18.55, longitude: -72.3, accuracy: null }, details: '', notes: '' };
    assert.equal(validate(draft, 0), null, kind);
    assert.ok(validate({ ...draft, occurredAt: undefined }, 0), kind);
    assert.ok(validate({ ...draft, occurredAt: '2999-01-01T12:00:00Z' }, 0), kind);
    assert.ok(validate({ ...draft, occurredAt: new Date(Date.now() - 181 * 60_000).toISOString() }, 0), kind);
    assert.ok(validate({ ...draft, coordinates: null }, 0), kind);
    assert.ok(validate({ ...draft, locationSource: 'device' }, 0), kind);
  }
});
test('manual reports prepare the selected time and coordinates without a nearby-GPS lookup', async () => {
  const calls = [];
  const api = compile(await readFile('src/features/report-events/api.ts', 'utf8'), {
    './context': context,
    '@/lib/supabase': { supabase: { rpc: async (name, args) => { calls.push({ name, args }); return {}; } } },
  });
  const draft = { id: 'id', locationSource: 'manual', occurredAt: new Date(Date.now() - 30 * 60_000).toISOString(), coordinates: { latitude: 18.55, longitude: -72.3, accuracy: null } };
  assert.deepEqual(await api.nearbyEvents('gunfire', draft), []);
  assert.equal(calls.length, 0);
  await api.prepareReportEvent('gunfire', draft);
  assert.equal(calls[0].name, 'prepare_manual_report_event');
  assert.equal(calls[0].args.p_occurred_at, draft.occurredAt);
  assert.equal(calls[0].args.p_accuracy, null);
  assert.equal(calls[0].args.p_latitude, 18.55);
});

 test('ruler has thirteen quarter-hour positions and never goes beyond three hours', () => {
   const now = Date.parse('2026-09-27T00:10:00Z');
   assert.equal(context.REPORT_TIME_STEPS, 12);
   assert.equal(context.reportTimeAt(15, now), '2026-09-26T23:55:00.000Z');
   assert.equal(context.reportTimeAt(180, now), '2026-09-26T21:10:00.000Z');
   assert.equal(context.reportTimeIndex(-100, 64), 0);
   assert.equal(context.reportTimeIndex(8000, 64), 12);
   assert.equal(context.reportTimeIndex(96, 64), 2);
   for (const age of [0, 15, 165, 180]) assert.equal(context.validMinutesAgo(age), true);
   for (const age of [-15, 5, 181, 195, NaN]) assert.equal(context.validMinutesAgo(age), false);
   const draft = {locationSource:'manual', coordinates:{latitude:18.55,longitude:-72.3,accuracy:null}};
   assert.equal(context.validManualContext({...draft, occurredAt:context.reportTimeAt(180,now)},now), true);
   assert.equal(context.validManualContext({...draft, occurredAt:context.reportTimeAt(180,now)},now+1), false);
 });
 test('relative selection is sent to the server so network latency cannot invalidate the 3 h endpoint', async () => {
   let payload;
   const api = compile(await readFile('src/features/report-events/api.ts', 'utf8'), {
     './context':context, '@/lib/supabase':{supabase:{rpc:async (_name,args)=>{payload=args;return {};}}},
   });
   await api.prepareReportEvent('accident',{id:'test', locationSource:'manual', coordinates:{latitude:18.55,longitude:-72.3,accuracy:null},
     occurredAt:context.reportTimeAt(180), minutesAgo:180});
   assert.equal(payload.p_minutes_ago,180);
 });
