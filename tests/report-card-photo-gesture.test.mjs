import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile('src/components/report-card-photo.tsx', 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
});
function fixture(platform = 'ios', target = 'card') {
  const hooks = [];
  const effects = [];
  const timers = new Map();
  const listeners = new Map();
  const activity = [];
  const selected = [];
  let cursor = 0;
  let now = 0;
  let timerId = 0;
  let tree;
  let allowed = true;
  const jsx = (type, props) => ({ type, props });
  const gesture = kind => {
    const result = { kind, handlers: {}, config: {} };
    for (const name of ['enabled', 'runOnJS', 'maxPointers', 'activeOffsetX', 'failOffsetY', 'simultaneousWithExternalGesture']) result[name] = value => { result.config[name] = value; return result; };
    for (const name of ['onStart', 'onUpdate', 'onEnd']) result[name] = callback => { result.handlers[name] = callback; return result; };
    return result;
  };
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
    'react-native': { Platform: { OS: platform }, Modal: 'modal', StyleSheet: { create: value => value, absoluteFill: {} }, useWindowDimensions: () => ({ width: 400, height: 800 }) },
    'react-native-gesture-handler': {
      GestureDetector: 'detector', GestureHandlerRootView: 'root',
      Gesture: { Pinch: () => gesture('pinch'), Pan: () => gesture('pan'), Simultaneous: (...gestures) => ({ gestures }) },
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
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) },
    'react-native-worklets': { scheduleOnRN: (fn, ...args) => fn(...args) },
    '@/features/language/native': { Pressable: 'pressable', View: 'view' },
    './ui/animated-pressable': { AnimatedPressable: 'action' }, './report-card-actions': {},
    './report-photo-carousel-controls': { ReportPhotoCarouselControls: 'carousel' },
  };
  const exports = {};
  new Function('exports', 'require', 'setTimeout', 'clearTimeout', 'Date', outputText + '\nexports.PhotoViewer = PhotoViewer; exports.ZoomablePhoto = ZoomablePhoto;')(exports, name => deps[name],
    (callback, delay) => { const id = ++timerId; timers.set(id, { callback, at: now + delay }); return id; },
    id => timers.delete(id), { now: () => now });
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
    tree = target === 'card' ? exports.ReportCardPhoto({ photo: 'https://example.test/photo.jpg', photos: ['https://example.test/photo.jpg'], identity: 'event', fallback: null, enabled: true,
      canInteract: () => allowed, onPhotoChange: uri => selected.push(uri), onError: () => {}, children: controls => controls('buttons'), ...props })
      : target === 'viewer' ? exports.PhotoViewer({ photos: ['first', 'second', 'third'], initialIndex: 1, initialZoom: 2.5, onPhotoChange: uri => selected.push(uri), onError: () => {}, onClose: () => {}, ...props })
      : exports.ZoomablePhoto({ uri: 'first', initialZoom: 2.5, onSwipe: direction => selected.push(direction), onError: () => {}, ...props });
    while (effects.length) effects.shift()();
    return tree;
  };
  render();
  return {
    render, activity, listeners, timers, selected,
    allow: value => { allowed = value; },
    tap: (detail = 1, x = 0, y = 0) => find(node => node.type === 'pressable').props.onPress({ nativeEvent: { detail, pageX: x, pageY: y } }),
    pressIn: (x, y) => find(node => node.type === 'pressable').props.onPressIn({ nativeEvent: { pageX: x, pageY: y } }),
    get hidden() { return find(node => node.type === 'animated').props['aria-hidden']; },
    get pinch() { const gesture = find(node => node.type === 'detector').props.gesture; return gesture.gestures?.find(item => item.kind === 'pinch') ?? gesture; },
    get pan() { return find(node => node.type === 'detector').props.gesture.gestures?.find(item => item.kind === 'pan') ?? null; },
    get viewer() { return find(node => node.type?.name === 'PhotoViewer'); },
    get carousel() { return find(node => node.type === 'carousel'); },
    get zoomable() { return find(node => node.type?.name === 'ZoomablePhoto'); },
    get zoom() { return find(node => node.type === 'animated').props.style.at(-1).transform.at(-1).scale; },
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
  f.advance(500);
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
  f.pinch.handlers.onEnd({ scale: 1.04 }); f.render();
  assert.equal(f.viewer, null);
  f.pinch.handlers.onEnd({ scale: 1.2 }); f.render();
  assert.deepEqual(f.viewer.props.photos, ['https://example.test/photo.jpg']);
  assert.equal(f.viewer.props.initialZoom, 1.2);
  assert.equal(f.activity.at(-1), true);
  f.viewer.props.onClose(); f.render();
  assert.equal(f.viewer, null);
  assert.equal(f.activity.at(-1), false);
});
test('illustrations and inactive cards never open a photo viewer', () => {
  for (const props of [{ photo: undefined }, { enabled: false }]) {
    const f = fixture(); f.render(props);
    assert.equal(f.pinch.config.enabled, false);
    f.pinch.handlers.onEnd({ scale: 1.2 }); f.render(props);
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
test('two nearby taps on mobile open the selected photo without needing mouse click details', () => {
  const f = fixture();
  f.tap(1, 80, 100); f.render();
  f.advance(150);
  f.tap(1, 85, 103); f.render();
  assert.ok(f.viewer);
  assert.equal(f.viewer.props.initialZoom, 1);
  const distant = fixture();
  distant.tap(1, 10, 10); distant.render(); distant.advance(150);
  distant.tap(1, 100, 100); distant.render();
  assert.equal(distant.viewer, null);
  assert.equal(distant.hidden, false);
});
test('pinching passes the final scale and selected photo to the complete scene gallery', () => {
  const f = fixture();
  const props = { photos: ['first', 'second', 'third'], photo: 'second' };
  f.render(props);
  f.pinch.handlers.onEnd({ scale: 2.75 }); f.render(props);
  assert.deepEqual(f.viewer.props.photos, props.photos);
  assert.equal(f.viewer.props.initialIndex, 1);
  assert.equal(f.viewer.props.initialZoom, 2.75);
});
test('expanded photo swipes select neighbours and stop at gallery boundaries', () => {
  const f = fixture();
  const props = { photos: ['first', 'second', 'third'], photo: 'second', carousel: true };
  f.render(props);
  assert.equal(f.pan.config.enabled, true);
  f.pan.handlers.onEnd({ translationX: -90, velocityX: -100 });
  assert.deepEqual(f.selected, ['third']);
  f.render({ ...props, photo: 'third' });
  f.pan.handlers.onEnd({ translationX: -90, velocityX: -100 });
  assert.deepEqual(f.selected, ['third']);
  f.render({ ...props, carousel: false });
  assert.equal(f.pan, null);
});
test('releasing a carousel swipe never toggles the photo controls or opens the viewer', () => {
  const f = fixture();
  f.pressIn(200, 100);
  f.tap(1, 80, 100); f.render();
  assert.equal(f.hidden, false);
  assert.equal(f.viewer, null);
});
test('compact photo pinch coexists with the stack swipe without registering a competing carousel pan', () => {
  const f = fixture();
  const stackGesture = {};
  f.render({ stackGesture });
  assert.equal(f.pinch.config.simultaneousWithExternalGesture, stackGesture);
  assert.equal(f.pan, null);
});
test('fullscreen gallery starts at the selected image, resets zoom on page changes and remembers selection', () => {
  const f = fixture('ios', 'viewer');
  assert.equal(f.zoomable.props.uri, 'second');
  assert.equal(f.zoomable.props.initialZoom, 2.5);
  f.carousel.props.onSelect(2); f.render();
  assert.equal(f.zoomable.props.uri, 'third');
  assert.equal(f.zoomable.props.initialZoom, 1);
  assert.deepEqual(f.selected, ['third']);
  f.zoomable.props.onSwipe(1); f.render();
  assert.equal(f.zoomable.props.uri, 'third');
  f.zoomable.props.onSwipe(-1); f.render();
  assert.equal(f.zoomable.props.uri, 'second');
  assert.equal(f.zoomable.props.initialZoom, 1);
});
test('fullscreen uses the requested zoom; dragging a zoomed image does not switch photographs', () => {
  const f = fixture('ios', 'zoom');
  assert.equal(f.zoom, 2.5);
  f.pan.handlers.onStart();
  f.pan.handlers.onUpdate({ translationX: -80, translationY: 0 });
  f.pan.handlers.onEnd({ translationX: -80, translationY: 0, velocityX: -100 });
  assert.deepEqual(f.selected, []);
  f.pinch.handlers.onStart();
  f.pinch.handlers.onUpdate({ scale: 0.4 }); f.render();
  assert.equal(f.zoom, 1);
  f.pan.handlers.onEnd({ translationX: -80, translationY: 0, velocityX: -100 });
  assert.deepEqual(f.selected, [1]);
});
