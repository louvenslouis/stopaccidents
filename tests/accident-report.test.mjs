import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(
  new URL('../src/features/accident-report/model.ts', import.meta.url),
  'utf8',
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022 },
});
const { splitIdentifiers, validateStep } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);
const draft = {
  id: 'test',
  location: '',
  coordinates: null,
  accidentType: null,
  severity: null,
  registrations: '',
  identities: '',
  notes: '',
  photos: [],
};

test('location alone can be saved before choosing the accident subtype', () => {
  assert.ok(validateStep(draft, 0));
  assert.equal(validateStep({ ...draft, location: 'Un carrefour' }, 0), null);
  assert.ok(validateStep(draft, 1));
  assert.equal(validateStep({ ...draft, accidentType: 'other' }, 1), null);
  assert.equal(
    validateStep(
      {
        ...draft,
        coordinates: { latitude: 18.5, longitude: -72.3, accuracy: 8 },
        accidentType: 'two_cars',
      },
      0,
    ),
    null,
  );
});
test('unknown severity is an explicit valid choice, not an implicit default', () => {
  assert.ok(validateStep(draft, 2));
  assert.equal(validateStep({ ...draft, severity: 'unknown' }, 2), null);
});
test('all supplementary fields and photos are optional', () => {
  assert.equal(validateStep(draft, 3), null);
});
test('identifiers are trimmed, deduplicated and split across pasted lines', () => {
  assert.deepEqual(splitIdentifiers(' AA-1, BB-2;AA-1\n CC-3 , '), [
    'AA-1',
    'BB-2',
    'CC-3',
  ]);
  assert.ok(validateStep({ ...draft, identities: 'x'.repeat(81) }, 3));
  assert.ok(
    validateStep(
      {
        ...draft,
        registrations: Array.from({ length: 11 }, (_, i) => `${i}`).join(','),
      },
      3,
    ),
  );
});
