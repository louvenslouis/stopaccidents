import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

function compile(source, dependencies) {
  const exports = {};
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  new Function('exports', 'require', outputText)(
    exports,
    (name) => dependencies[name] || {},
  );
  return exports;
}
const model = compile(
  await readFile('src/features/accident-report/model.ts', 'utf8'),
  {},
);
const source = await readFile('src/components/report-sheet.tsx', 'utf8');
const flush = async () => {
  for (let i = 0; i < 15; i++) await Promise.resolve();
};
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const result = find(child, predicate);
    if (result) return result;
  }
  return null;
}
function fixture(appLocation = null) {
  let cursor = 0,
    category = null,
    tree;
  const hooks = [];
  const gps = deferred(),
    firstSave = deferred();
  const calls = { locate: 0, reverseGeocode: 0, save: [], closed: 0 };
  const { ReportSheet } = compile(source, {
    react: {
      useState: (initial) => {
        const index = cursor++;
        if (!(index in hooks))
          hooks[index] = typeof initial === 'function' ? initial() : initial;
        return [
          hooks[index],
          (value) => {
            hooks[index] =
              typeof value === 'function' ? value(hooks[index]) : value;
          },
        ];
      },
      useRef: (initial) => {
        const index = cursor++;
        return (hooks[index] ||= { current: initial });
      },
      useEffect: () => {},
    },
    'react/jsx-runtime': {
      jsx: (type, props) => ({ type, props }),
      jsxs: (type, props) => ({ type, props }),
    },
    'react-native': {
      StyleSheet: { create: (styles) => styles },
      Platform: { OS: 'web' },
      useWindowDimensions: () => ({ width: 390, height: 844 }),
      TextInput: 'TextInput',
      Text: 'Text',
      View: 'View',
      Pressable: 'Pressable',
    },
    'react-native-safe-area-context': {
      useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
    },
    'expo-crypto': { randomUUID: () => 'stable-report-id' },
    '@/components/report-type-picker': { ReportTypePicker: 'TypePicker' },
    '@/features/accident-report/model': model,
    '@/features/accident-report/precise-location': {
      PreciseLocationError: Error,
      acquirePreciseLocation: async () => {
        calls.locate++;
        return gps.promise;
      },
    },
    '@/features/accident-report/reverse-geocode': {
      reverseGeocodeZone: async () => {
        calls.reverseGeocode++;
        return 'Bois Verna, Port-au-Prince';
      },
    },
    '@/features/accident-report/submit': {
      saveAccidentReportStep: async (draft, step) => {
        calls.save.push({ draft, step });
        if (calls.save.length === 1) return firstSave.promise;
        return draft.id;
      },
    },
    '@/features/location/app-location': {
      useAppLocation: () => ({ location: appLocation }),
    },
    '@/features/location/app-location-model': {
      reusableAppLocation: (location) => location,
    },
  });
  function render() {
    cursor = 0;
    tree = ReportSheet({
      visible: true,
      reportType: category,
      onSelectType: (type) => {
        category = type;
      },
      onBackToTypes: () => {
        category = null;
      },
      onClose: () => {
        calls.closed++;
      },
    });
    return tree;
  }
  const pick = () => {
    render();
    find(tree, (node) => node.type === 'TypePicker').props.onSelect('accident');
    render();
  };
  const button = (label) =>
    find(
      tree,
      (node) =>
        node.props?.label === label || node.props?.accessibilityLabel === label,
    );
  const text = (value) => find(tree, (node) => node.props?.children === value);
  return {
    calls,
    gps,
    firstSave,
    render,
    pick,
    button,
    text,
    input: () =>
      find(
        tree,
        (node) =>
          node.type === 'TextInput' &&
          node.props?.accessibilityLabel?.startsWith('Repère'),
      ),
  };
}

test('a fresh app location skips the GPS screen and opens the first report question', async () => {
  const f = fixture({
    coordinates: { latitude: 18.54, longitude: -72.31, accuracy: 9 },
    location: 'Pétion-Ville, Ouest',
    capturedAt: Date.now(),
  });
  f.pick();
  f.render();
  assert.equal(f.calls.locate, 0);
  assert.equal(f.calls.reverseGeocode, 0);
  assert.equal(f.calls.save.length, 1);
  assert.equal(f.calls.save[0].step, 0);
  assert.deepEqual(f.calls.save[0].draft.coordinates, {
    latitude: 18.54,
    longitude: -72.31,
    accuracy: 9,
  });
  assert.ok(f.text('Quel type d’accident ?'));
  assert.ok(f.text('Pétion-Ville, Ouest'));
  f.firstSave.resolve('stable-report-id');
  await flush();
});

test('Accident automatically locates and saves before showing the subtype and optional landmark', async () => {
  const f = fixture();
  f.pick();
  assert.equal(f.calls.locate, 1);
  assert.equal(
    f.button('Suivant'),
    null,
    'There is no manual location confirmation',
  );
  f.gps.resolve({ latitude: 18.5, longitude: -72.3, accuracy: 8 });
  await flush();
  f.render();
  assert.equal(f.calls.save[0].step, 0);
  assert.equal(f.calls.save[0].draft.location, 'Bois Verna, Port-au-Prince');
  assert.equal(
    f.text('Quel type d’accident ?'),
    null,
    'Wait for database confirmation',
  );
  f.firstSave.resolve('stable-report-id');
  await flush();
  f.render();
  assert.ok(f.text('Quel type d’accident ?'));
  assert.ok(f.text('Bois Verna, Port-au-Prince'));
  assert.ok(f.input());
  assert.equal(f.button('Utiliser ma position GPS'), null);
  f.input().props.onChangeText('Devant la station');
  f.button('Deux voitures').props.onPress();
  f.render();
  await f.button('Suivant').props.onPress();
  assert.deepEqual(
    f.calls.save.map((call) => call.step),
    [0, 0, 1],
  );
  assert.equal(f.calls.save[1].draft.locationHint, 'Devant la station');
  assert.ok(f.calls.save.every((call) => call.draft.id === 'stable-report-id'));
});
test('an unconfirmed save stays on recovery; retry saves the same position without asking for GPS again', async () => {
  const f = fixture();
  f.pick();
  f.gps.resolve({ latitude: 18.5, longitude: -72.3, accuracy: 8 });
  await flush();
  f.firstSave.reject(new Error('Envoi non confirmé'));
  await flush();
  f.render();
  assert.equal(f.text('Quel type d’accident ?'), null);
  assert.ok(f.text('Envoi non confirmé'));
  await f.button('Réessayer l’enregistrement').props.onPress();
  f.render();
  assert.ok(f.text('Quel type d’accident ?'));
  assert.equal(f.calls.locate, 1);
  assert.equal(f.calls.save.length, 2);
});
test('closing during acquisition prevents a late position from creating a report', async () => {
  const f = fixture();
  f.pick();
  f.button('Fermer le formulaire').props.onPress();
  f.gps.resolve({ latitude: 18.5, longitude: -72.3, accuracy: 8 });
  await flush();
  assert.equal(f.calls.closed, 1);
  assert.equal(f.calls.save.length, 0);
});
