import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile('src/components/report-card-photo.tsx', 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
});
function fixture(platform = 'ios') {
  const hooks = [];
  const effects = [];
  const timers = new Map();
  const listeners = new Map();
  const activity = [];
  let cursor = 0;
  let now = 0;
  let timerId = 0;
  let tree;
  let allowed = true;
  const jsx = (type, props) => ({ type, props });
  const refElement = {
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: name => listeners.delete(name),
  };
  const deps = {
    react: {
      useCallback: fn => fn,
      useContext: () => value => activity.push(value),
      useRef: initial => { const slot = cursor++; return hooks[slot] ??= { current: initial ?? refElement }; },
      useState: initial => {
        const slot = cursor++;
        hooks[slot] ??= { value: initial };
        return [hooks[slot].value, next => { hooks[slot].value = typeof next === 'function' ? next(hooks[slot].value) : next; }];
      },
      useEffect: (fn, dependencies) => {
        const slot = cursor++;
        if (!hooks[slot] || dependencies.some((value, i) => value !== hooks[slot].dependencies[i])) {
          hooks[slot]?.cleanup?.();
          hooks[slot] = { dependencies };
          effects.push(() => { hooks[slot].cleanup = fn(); });
        }
      },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'react-native': { Platform: { OS: platform }, Modal: 'modal', StyleSheet: { create: value => value, absoluteFill: {} } },
    'react-native-gesture-handler': {
      GestureDetector: 'detector', GestureHandlerRootView: 'root',
      Gesture: { Pinch: () => {
        const gesture = { handlers: {}, config: {} };
        for (const name of ['enabled', 'runOnJS']) gesture[name] = value => { gesture.config[name] = value; return gesture; };
        gesture.onUpdate = callback => { gesture.handlers.update = callback; return gesture; };
        return gesture;
      } },
    },
    'react-native-reanimated': {
      __esModule: true, default: { View: 'animated' }, ReduceMotion: { System: 'system' },
      useSharedValue: initial => {
        const slot = cursor++;
        return hooks[slot] ??= { value: initial, set(value) { this.value = value; }, get() { return this.value; } };
      },
      withTiming: value => value, useAnimatedStyle: fn => fn(),
    },
    'expo-image': { Image: 'image' },
    'lucide-react-native/icons/x': { default: 'close-icon' },
    'react-native-safe-area-context': {},
    '@/features/language/native': { Pressable: 'pressable', View: 'view' },
    './ui/animated-pressable': {}, './report-card-actions': {},
  };
  const exports = {};
  new Function('exports', 'require', 'setTimeout', 'clearTimeout', outputText)(exports, name => deps[name],
    (callback, delay) => { const id = ++timerId; timers.set(id, { callback, at: now + delay }); return id; },
    id => timers.delete(id));
  const find = predicate => {
    function search(node) {
      if (!node || typeof node !== 'object') return null;
      if (predicate(node)) return node;
      for (const child of [node.props?.children].flat(Infinity)) { const result = search(child); if (result) return result; }
      return null;
    }
    return search(tree);
  };
  const render = (props = {}) => {
    cursor = 0;
    tree = exports.ReportCardPhoto({ photo: 'https://example.test/photo.jpg', identity: 'event', fallback: null, enabled: true,
      canInteract: () => allowed, onError: () => {}, children: controls => controls('buttons'), ...props });
    while (effects.length) effects.shift()();
    return tree;
  };
  render();
  return {
    render, activity, listeners, timers,
    allow: value => { allowed = value; },
    tap: (detail = 1) => find(node => node.type === 'pressable').props.onPress({ nativeEvent: { detail } }),
    get hidden() { return find(node => node.type === 'animated').props['aria-hidden']; },
    get pinch() { return find(node => node.type === 'detector').props.gesture; },
    get viewer() { return find(node => node.type?.name === 'PhotoViewer'); },
    advance: elapsed => { now += elapsed; for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.callback(); } },
    unmount: () => { for (const hook of hooks) hook?.cleanup?.(); },
  };
}

test('a photo tap hides controls for ten seconds before they return automatically', () => {
  const f = fixture();
  f.tap(); f.render();
  assert.equal(f.hidden, true);
  f.advance(9_999); f.render();
  assert.equal(f.hidden, true);
  f.advance(1); f.render();
  assert.equal(f.hidden, false);
  assert.equal(f.viewer, null);
});
test('another tap restores controls immediately and cancels the old timer', () => {
  const f = fixture();
  f.tap(); f.render();
  f.advance(3_000); f.render();
  f.tap(); f.render();
  assert.equal(f.hidden, false);
  assert.equal(f.timers.size, 0);
  assert.equal(f.viewer, null);
  f.tap(); f.render();
  f.advance(7_000); f.render();
  assert.equal(f.hidden, true);
  f.advance(3_000); f.render();
  assert.equal(f.hidden, false);
});
test('swiping and inactive cards do not hide their controls; unmount clears a pending timer', () => {
  const f = fixture();
  f.allow(false); f.tap(); f.render();
  assert.equal(f.hidden, false);
  f.allow(true); f.render({ enabled: false }); f.tap(); f.render({ enabled: false });
  assert.equal(f.hidden, false);
  f.render(); f.tap();
  assert.equal(f.timers.size, 1);
  f.unmount();
  assert.equal(f.timers.size, 0);
});
test('an outward pinch opens the photo and closing returns activity to the stack', () => {
  const f = fixture();
  f.pinch.handlers.update({ scale: 1.04 }); f.render();
  assert.equal(f.viewer, null);
  f.pinch.handlers.update({ scale: 1.2 }); f.render();
  assert.equal(f.viewer.props.uri, 'https://example.test/photo.jpg');
  assert.equal(f.activity.at(-1), true);
  f.viewer.props.onClose(); f.render();
  assert.equal(f.viewer, null);
  assert.equal(f.activity.at(-1), false);
});
test('illustrations and inactive cards never open a photo viewer', () => {
  for (const props of [{ photo: undefined }, { enabled: false }]) {
    const f = fixture(); f.render(props);
    assert.equal(f.pinch.config.enabled, false);
    f.pinch.handlers.update({ scale: 1.2 }); f.render(props);
    assert.equal(f.viewer, null);
  }
});
test('a browser trackpad pinch opens the viewer without zooming the entire page', () => {
  const f = fixture('web');
  const prevented = [];
  const wheel = f.listeners.get('wheel');
  wheel({ ctrlKey: false, deltaY: -10 }); f.render();
  assert.equal(f.viewer, null);
  wheel({ ctrlKey: true, deltaY: -10, preventDefault: () => prevented.push('default'), stopPropagation: () => prevented.push('propagation') });
  f.render();
  assert.ok(f.viewer);
  assert.deepEqual(prevented, ['default', 'propagation']);
  f.unmount();
  assert.equal(f.listeners.size, 0);
});
test('desktop double click provides the same photo viewer while a single click only hides controls', () => {
  const f = fixture('web');
  f.tap(); f.render();
  assert.equal(f.viewer, null);
  f.tap(2); f.render();
  assert.ok(f.viewer);
});
