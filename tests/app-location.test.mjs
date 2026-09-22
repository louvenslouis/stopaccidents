import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

function compile(source, dependencies = {}) {
  const exports = {};
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  new Function('exports', 'require', outputText)(
    exports,
    (name) => dependencies[name] || {},
  );
  return exports;
}

const reportModel = compile(
  await readFile('src/features/accident-report/model.ts', 'utf8'),
);
const locationModel = compile(
  await readFile('src/features/location/app-location-model.ts', 'utf8'),
  { '@/features/accident-report/model': reportModel },
);

test('only a recent, precise app position can bypass report localization', () => {
  const now = 1_000_000;
  const snapshot = {
    coordinates: { latitude: 18.54, longitude: -72.31, accuracy: 12 },
    location: 'Pétion-Ville',
    capturedAt: now - 30_000,
  };
  assert.equal(locationModel.reusableAppLocation(snapshot, now), snapshot);
  assert.equal(
    locationModel.reusableAppLocation(
      { ...snapshot, capturedAt: now - 90_001 },
      now,
    ),
    null,
  );
  assert.equal(
    locationModel.reusableAppLocation(
      { ...snapshot, coordinates: { ...snapshot.coordinates, accuracy: 31 } },
      now,
    ),
    null,
  );
});

test('distance detects nearby fixes and meaningful movement', () => {
  const origin = { latitude: 18.54, longitude: -72.31, accuracy: 10 };
  assert.equal(locationModel.locationDistanceMeters(origin, origin), 0);
  assert.ok(
    locationModel.locationDistanceMeters(origin, {
      ...origin,
      latitude: 18.5401,
    }) < 20,
  );
  assert.ok(
    locationModel.locationDistanceMeters(origin, {
      ...origin,
      latitude: 18.55,
    }) > 1_000,
  );
});
