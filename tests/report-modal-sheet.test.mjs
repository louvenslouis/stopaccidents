import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile('src/components/ui/report-modal-sheet.tsx', 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
});
function fixture(dismissDisabled = false) {
  let handlers;
  const calls = { closed: 0, translations: [], springs: 0 };
  const exports = {};
  class Value {
    stopAnimation() {}
    setValue(value) { calls.translations.push(value); }
    interpolate() { return 1; }
  }
  const dependencies = {
    react: { useEffect: (fn) => fn(), useMemo: (fn) => fn(), useState: (fn) => [fn()] },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'react-native': {
      Animated: { Value, View: 'AnimatedView', spring: () => ({ start: () => calls.springs++ }) },
      PanResponder: { create: (config) => { handlers = config; return { panHandlers: {} }; } },
      Modal: 'Modal', KeyboardAvoidingView: 'KeyboardAvoidingView',
      Platform: { OS: 'ios' }, StyleSheet: { create: (value) => value },
      useWindowDimensions: () => ({ width: 390, height: 844 }),
    },
    'react-native-reanimated': { useReducedMotion: () => false },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 34 }) },
    '@/features/appearance/theme-provider': { useThemeColor: () => (value) => value },
    '@/features/language/native': { Pressable: 'Pressable', View: 'View' },
  };
  new Function('exports', 'require', outputText)(exports, name => dependencies[name]);
  const tree = exports.ReportModalSheet({ visible: true, dismissDisabled, onRequestClose: () => calls.closed++, children: null });
  return { calls, handlers, tree };
}

test('a short drag springs back, while distance or downward velocity dismisses', () => {
  const { calls, handlers } = fixture();
  assert.equal(handlers.onMoveShouldSetPanResponder(null, { dx: 30, dy: 10 }), false);
  assert.equal(handlers.onMoveShouldSetPanResponder(null, { dx: 0, dy: 10 }), true);
  handlers.onPanResponderMove(null, { dy: -20 });
  assert.equal(calls.translations.at(-1), 0);
  handlers.onPanResponderRelease(null, { dy: 40, vy: 0.1 });
  assert.equal(calls.closed, 0);
  assert.equal(calls.springs, 1);
  handlers.onPanResponderRelease(null, { dy: 180, vy: 0.1 });
  handlers.onPanResponderRelease(null, { dy: 30, vy: 1 });
  assert.equal(calls.closed, 2);
});

test('submission blocks both drag dismissal and the platform back action', () => {
  const { calls, handlers, tree } = fixture(true);
  assert.equal(handlers.onMoveShouldSetPanResponder(null, { dx: 0, dy: 50 }), false);
  handlers.onPanResponderRelease(null, { dy: 400, vy: 2 });
  tree.props.onRequestClose();
  assert.equal(calls.closed, 0);
});

test('an interrupted gesture restores the sheet without closing the draft', () => {
  const { calls, handlers } = fixture();
  handlers.onPanResponderMove(null, { dy: 60 });
  handlers.onPanResponderTerminate();
  assert.equal(calls.closed, 0);
  assert.equal(calls.springs, 1);
});
