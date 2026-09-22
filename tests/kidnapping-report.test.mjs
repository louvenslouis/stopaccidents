import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(
  new URL('../src/features/kidnapping-report/model.ts', import.meta.url),
  'utf8',
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022 },
});
const { kidnappingLocationDescription, validateKidnappingStep } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);

const draft = {
  id: 'test',
  location: '',
  locationHint: '',
  coordinates: null,
  vehicleClues: '',
  directionTaken: '',
  abductedPersonClues: '',
};

test('kidnapping report starts with a precise GPS location', () => {
  assert.ok(validateKidnappingStep(draft, 0));
  assert.equal(
    validateKidnappingStep(
      {
        ...draft,
        coordinates: { latitude: 18.54, longitude: -72.34, accuracy: 12 },
      },
      0,
    ),
    null,
  );
  assert.equal(
    kidnappingLocationDescription({
      ...draft,
      location: 'Delmas',
      locationHint: 'Devant la pharmacie',
    }),
    'Delmas — Devant la pharmacie',
  );
});

test('vehicle clues and direction are both required before person clues', () => {
  assert.ok(validateKidnappingStep({ ...draft, vehicleClues: 'SUV noir' }, 1));
  assert.equal(
    validateKidnappingStep(
      {
        ...draft,
        vehicleClues: 'SUV noir, vitre arrière cassée',
        directionTaken: 'Vers le nord par la route de Delmas',
      },
      1,
    ),
    null,
  );
  assert.ok(validateKidnappingStep(draft, 2));
  assert.equal(
    validateKidnappingStep(
      { ...draft, abductedPersonClues: 'Chemise bleue, sac rouge' },
      2,
    ),
    null,
  );
});

test('kidnapping clue fields enforce their storage limits', () => {
  assert.ok(
    validateKidnappingStep(
      {
        ...draft,
        vehicleClues: 'x'.repeat(1501),
        directionTaken: 'Vers le nord',
      },
      1,
    ),
  );
  assert.ok(
    validateKidnappingStep(
      { ...draft, abductedPersonClues: 'x'.repeat(2001) },
      2,
    ),
  );
});
