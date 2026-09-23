import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const result = find(child, predicate);
    if (result) return result;
  }
  return null;
}

test('a connected profile exposes home and work address fields with a save action', async () => {
  const source = await readFile('src/app/profil.tsx', 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  let stateIndex = 0;
  const session = {
    user: { id: 'user-1', email: 'personne@example.com', is_anonymous: false },
  };
  const stateOverrides = { 0: session, 1: false };
  const exports = {};
  new Function('exports', 'require', outputText)(exports, (name) => {
    if (name === '@/features/appearance/theme-provider') return {
      createThemedStyles: (factory) => () => factory((light) => light),
      useThemeColor: () => (light) => light,
      useAppTheme: () => ({ scheme: 'light' }),
    };
    if (name === 'react')
      return {
        useEffect: () => {},
        useState: (initial) => {
          const index = stateIndex++;
          return [index in stateOverrides ? stateOverrides[index] : initial, () => {}];
        },
      };
    if (name === 'react/jsx-runtime')
      return {
        Fragment: 'Fragment',
        jsx: (type, props) => ({ type, props }),
        jsxs: (type, props) => ({ type, props }),
      };
    if (name === 'react-native')
      return {
        ActivityIndicator: 'ActivityIndicator',
        KeyboardAvoidingView: 'KeyboardAvoidingView',
        Platform: { OS: 'web' },
        Pressable: 'Pressable',
        StyleSheet: { create: (styles) => styles },
        Text: 'Text',
        TextInput: 'TextInput',
        View: 'View',
      };
    if (name === '@/components/app-screen') return { AppScreen: 'AppScreen' };
    if (name === '@/components/saved-place-picker') return { SavedPlacePicker: 'SavedPlacePicker' };
    if (name === '@/components/ui/animated-pressable')
      return { AnimatedPressable: 'AnimatedPressable' };
    if (name === '@/components/ui/app-icon') return { AppIcon: 'AppIcon' };
    if (name === '@/features/profile/saved-places')
      return {
        readSavedPlaces: async () => ({ home: null, work: null }),
        saveSavedPlaces: async (_, places) => places,
        validateSavedPlaces: () => null,
      };
    if (name === '@/lib/supabase')
      return {
        supabase: {
          auth: {
            getSession: async () => ({ data: { session }, error: null }),
            onAuthStateChange: () => ({
              data: { subscription: { unsubscribe() {} } },
            }),
          },
        },
      };
    return {};
  });

  const tree = exports.default();
  assert.ok(
    find(
      tree,
      (node) =>
        node.type === 'AnimatedPressable' &&
        node.props?.accessibilityLabel === 'Choisir l’adresse du domicile sur la carte',
    ),
  );
  assert.ok(
    find(
      tree,
      (node) =>
        node.type === 'AnimatedPressable' &&
        node.props?.accessibilityLabel === 'Choisir le lieu de travail sur la carte',
    ),
  );
  assert.ok(
    find(
      tree,
      (node) =>
        node.type === 'AnimatedPressable' &&
        node.props?.accessibilityLabel === 'Enregistrer mes lieux',
    ),
  );
});
