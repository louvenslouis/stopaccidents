import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const { outputText } = ts.transpileModule(await readFile('src/app/profil/index.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
});
const flush = () => new Promise(setImmediate);
const account = (id, is_anonymous = false) => ({ user: { id, is_anonymous, email: is_anonymous ? undefined : 'prive@example.com' } });
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const result = find(child, predicate);
    if (result) return result;
  }
  return null;
}
function profile(initialSession, readAlias) {
  const values = [initialSession, false];
  const effects = [];
  let stateIndex = 0, effectIndex = 0, listener;
  let session = initialSession;
  const exports = {};
  const native = Object.fromEntries(['Text', 'TextInput', 'View', 'Pressable', 'ActivityIndicator', 'KeyboardAvoidingView'].map((name) => [name, name]));
  new Function('exports', 'require', outputText)(exports, (name) => {
    if (name === 'react') return {
      useState(initial) {
        const i = stateIndex++;
        if (!(i in values)) values[i] = initial;
        return [values[i], (next) => { values[i] = typeof next === 'function' ? next(values[i]) : next; }];
      },
      useEffect(run, deps) {
        const i = effectIndex++;
        const previous = effects[i];
        if (previous && deps.every((value, j) => Object.is(value, previous.deps[j]))) return;
        previous?.cleanup?.();
        effects[i] = { deps, run, pending: true };
      },
    };
    if (name === 'react/jsx-runtime') return {
      Fragment: 'Fragment', jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }),
    };
    if (name === 'react-native') return { ...native, Platform: { OS: 'web' }, StyleSheet: { create: (styles) => styles } };
    if (name === 'expo-router') return { useLocalSearchParams: () => ({}), useRouter: () => ({ setParams() {} }) };
    if (name === '@/features/language/native') return native;
    if (name === '@/features/appearance/theme-provider') return {
      createThemedStyles: (factory) => () => factory((color) => color),
      useThemeColor: () => (color) => color, useAppTheme: () => ({ scheme: 'light' }),
    };
    if (name === '@/components/ui/surface-depth') return { surfaceDepth: () => ({}) };
    if (name === '@/features/profile/alias') return { readUserAlias: readAlias };
    if (name === '@/features/profile/saved-places') return { readSavedPlaces: async () => ({ home: null, work: null }) };
    if (name === '@/lib/supabase') return { supabase: { auth: {
      getSession: async () => ({ data: { session }, error: null }),
      onAuthStateChange(callback) { listener = callback; return { data: { subscription: { unsubscribe() {} } } }; },
    } } };
    return {};
  });
  function render() {
    stateIndex = 0;
    effectIndex = 0;
    const tree = exports.default();
    for (const effect of effects) {
      if (!effect.pending) continue;
      effect.pending = false;
      effect.cleanup = effect.run();
    }
    return tree;
  }
  return {
    render,
    switchUser(next) { session = next; listener('SIGNED_IN', next); render(); },
    text(value) { return find(render(), (node) => node.type === 'Text' && node.props.children === value); },
  };
}

test('profiles show the exact stored alias for accounts and guests without displaying the email', async () => {
  for (const anonymous of [false, true]) {
    const screen = profile(account('user-1', anonymous), async () => 'ZwazoLib27');
    screen.render();
    await flush();
    assert.equal(screen.text('ZwazoLib27').props.translate, false, 'An alias must not change with UI language');
    assert.equal(screen.text('prive@example.com'), null);
  }
});

test('a late alias response from a previous account cannot appear on the new account', async () => {
  let resolveFirst;
  let firstSignal;
  const first = new Promise((resolve) => { resolveFirst = resolve; });
  const screen = profile(account('first'), async (id, signal) => {
    if (id === 'first') { firstSignal = signal; return first; }
    return 'ColibriSerein84';
  });
  screen.render();
  await flush();
  screen.switchUser(account('second'));
  await flush();
  assert.ok(firstSignal.aborted);
  assert.ok(screen.text('ColibriSerein84'));
  resolveFirst('ZwazoLib27');
  await flush();
  assert.equal(screen.text('ZwazoLib27'), null);
  screen.switchUser(null);
  assert.equal(screen.text('ColibriSerein84'), null);
});

test('alias loading failures can be retried without changing the assigned identity', async () => {
  let requests = 0;
  const screen = profile(account('user-1'), async () => {
    if (++requests === 1) throw new Error('Offline');
    return 'FlanboKle27';
  });
  screen.render();
  await flush();
  assert.ok(screen.text('Alias indisponible. Réessayer.'));
  find(screen.render(), (node) => node.props?.accessibilityLabel === 'Réessayer de charger mon alias').props.onPress();
  screen.render();
  await flush();
  assert.ok(screen.text('FlanboKle27'));
  assert.equal(requests, 2);
});
