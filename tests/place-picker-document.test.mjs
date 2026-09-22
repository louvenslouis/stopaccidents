import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile('src/components/place-picker-document.ts', 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
});
const exports = {};
new Function('exports', 'require', outputText)(exports, (name) => {
  if (name === './map-document')
    return {
      HAITI_BOUNDS: [
        [18, -74.55],
        [20.1, -71.6],
      ],
    };
  return {};
});

test('place picker accepts only finite map-pick messages from its own document', () => {
  assert.deepEqual(
    exports.readPlacePickerMessage(
      JSON.stringify({
        source: 'stopaccidents-place-picker',
        status: 'pick',
        latitude: 18.54,
        longitude: -72.33,
      }),
    ),
    { status: 'pick', latitude: 18.54, longitude: -72.33 },
  );
  assert.equal(
    exports.readPlacePickerMessage(
      JSON.stringify({
        source: 'other',
        status: 'pick',
        latitude: 18.54,
        longitude: -72.33,
      }),
    ),
    null,
  );
  assert.equal(
    exports.readPlacePickerMessage(
      JSON.stringify({
        source: 'stopaccidents-place-picker',
        status: 'pick',
        latitude: '18.54',
      }),
    ),
    null,
  );
});

test('place picker document exposes map selection and OpenStreetMap attribution', () => {
  assert.match(exports.PLACE_PICKER_DOCUMENT, /stopAccidentsSetPlace/);
  assert.match(exports.PLACE_PICKER_DOCUMENT, /map\.on\('click'/);
  assert.match(exports.PLACE_PICKER_DOCUMENT, /openstreetmap\.org\/copyright/);
});
