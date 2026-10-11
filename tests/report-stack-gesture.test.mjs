import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile('src/features/home/use-report-stack-gesture.ts', 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});

function fixture(initialIndex = 0) {
  const hooks = [];
  const animations = new Map();
  const selected = [];
  const scheduled = [];
  let cursor = 0;
  let result;
  const deps = {
    react: {
      useCallback: fn => fn,
      useLayoutEffect: (fn, dependencies) => {
        const slot = cursor++;
        if (!hooks[slot] || dependencies.some((value, i) => value !== hooks[slot][i])) {
          hooks[slot] = dependencies;
          fn();
        }
      },
    },
    'expo-haptics': { selectionAsync: async () => {} },
    'react-native': { Platform: { OS: 'web' } },
    'react-native-gesture-handler': {
      Gesture: { Pan: () => {
        const gesture = { handlers: {}, config: {} };
        for (const name of ['enabled', 'maxPointers', 'activeOffsetX', 'failOffsetY']) {
          gesture[name] = value => { gesture.config[name] = value; return gesture; };
        }
        for (const name of ['onStart', 'onUpdate', 'onEnd', 'onFinalize']) {
          gesture[name] = fn => { gesture.handlers[name] = fn; return gesture; };
        }
        return gesture;
      } },
    },
    'react-native-reanimated': {
      ReduceMotion: { System: 'system' },
      useSharedValue: initial => {
        const slot = cursor++;
        if (!hooks[slot]) {
          let value = initial;
          const shared = {
            get value() { return value; },
            get() { return value; },
            set(next) { shared.value = next; },
            set value(next) {
              if (next?.animation) animations.set(shared, next);
              else value = next;
            },
          };
          hooks[slot] = shared;
        }
        return hooks[slot];
      },
      cancelAnimation: value => {
        animations.get(value)?.callback(false);
        animations.delete(value);
      },
      withSpring: (target, config, callback) => ({ animation: true, target, config, callback }),
    },
    'react-native-worklets': { scheduleOnRN: (fn, ...args) => scheduled.push(() => fn(...args)) },
  };
  const exports = {};
  new Function('exports', 'require', outputText)(exports, name => deps[name]);
  const render = (index = initialIndex, keys = ['new', 'middle', 'old']) => {
    cursor = 0;
    result = exports.useReportStackGesture(keys, index, key => selected.push(key));
    return result;
  };
  render();
  return {
    render, selected, scheduled,
    get result() { return result; },
    get animation() { return animations.get(result.position); },
    drag: (translationX, velocityX = 0) => {
      const handlers = result.gesture.handlers;
      handlers.onStart();
      handlers.onUpdate({ translationX });
      handlers.onEnd({ translationX, velocityX });
      handlers.onFinalize();
    },
    finish: () => {
      const animation = animations.get(result.position);
      assert.ok(animation);
      animations.delete(result.position);
      result.position.value = animation.target;
      animation.callback(true);
    },
    flush: () => { while (scheduled.length) scheduled.shift()(); },
  };
}

test('dragging never schedules React work; the incoming card stays in place across the selection commit', () => {
  const f = fixture();
  f.result.width.value = 400;
  f.drag(-140, -800);
  assert.equal(f.result.position.value, 0.35);
  assert.equal(f.animation.target, 1);
  assert.equal(f.animation.config.velocity, 2);
  assert.equal(f.animation.config.reduceMotion, 'system');
  assert.equal(f.scheduled.length, 0);
  assert.equal(f.result.canInteract(), false);
  f.finish();
  assert.equal(f.result.position.value, 1);
  assert.deepEqual(f.selected, []);
  f.drag(-180); // Ignore a second swipe until the incoming neighbours exist.
  assert.equal(f.result.position.value, 1);
  f.flush();
  assert.deepEqual(f.selected, ['middle']);
  f.render(1);
  assert.equal(f.result.position.value, 1);
  f.drag(140, 800);
  f.finish(); f.flush();
  assert.deepEqual(f.selected, ['middle', 'new']);
});

test('short drags settle, directional flicks advance, and reverse velocity does not turn a short drag into a swipe', () => {
  for (const [distance, velocity, destination] of [[-30, 0, 1], [-30, -700, 2], [30, 700, 0], [-30, 700, 1]]) {
    const f = fixture(1);
    f.drag(distance, velocity);
    assert.equal(f.animation.target, destination);
    f.finish(); f.flush();
    assert.equal(f.selected.length, destination === 1 ? 0 : 1);
  }
});

test('both ends resist overscroll, long drags stay within one mounted page, and cancellation keeps the selection', () => {
  for (const [index, distance] of [[0, 180], [2, -180]]) {
    const f = fixture(index);
    f.drag(distance, distance * 10);
    assert.ok(Math.abs(f.result.position.value - index) < 0.1);
    assert.equal(f.animation.target, index);
    f.finish(); f.flush();
    assert.deepEqual(f.selected, []);
  }
  const f = fixture();
  f.result.gesture.handlers.onStart();
  f.result.gesture.handlers.onUpdate({ translationX: -1000 });
  assert.equal(f.result.position.value, 1);
  f.result.gesture.handlers.onFinalize();
  assert.equal(f.animation.target, 0);
  f.finish(); f.flush();
  assert.deepEqual(f.selected, []);
});

test('vertical gestures and taps remain available, and a single card disables the pan', () => {
  assert.equal(fixture().result.gesture.config.maxPointers, 1);
  const f = fixture();
  assert.deepEqual(f.result.gesture.config.failOffsetY, [-10, 10]);
  f.result.gesture.handlers.onFinalize();
  assert.equal(f.animation, undefined);
  assert.equal(f.result.canInteract(), true);
  f.render(0, ['only']);
  assert.equal(f.result.gesture.config.enabled, false);
});

test('ordinary refreshes preserve a swipe while changed report order cancels an obsolete animation', () => {
  const f = fixture();
  f.drag(-150);
  const animation = f.animation;
  f.render();
  assert.equal(f.animation, animation);
  f.render(1, ['inserted', 'new', 'middle', 'old']);
  assert.equal(f.animation, undefined);
  assert.equal(f.result.position.value, 1);
  f.flush();
  assert.deepEqual(f.selected, []);
});

test('accessible navigation uses the same animation and rejects double navigation and boundaries', () => {
  const f = fixture();
  f.result.selectAdjacent(-1);
  assert.equal(f.animation, undefined);
  f.result.selectAdjacent(1);
  assert.equal(f.animation.target, 1);
  f.result.selectAdjacent(1);
  assert.equal(f.scheduled.length, 0);
  f.finish(); f.flush();
  assert.deepEqual(f.selected, ['middle']);
  f.render(1);
  f.result.selectAdjacent(-1);
  f.finish(); f.flush();
  assert.deepEqual(f.selected, ['middle', 'new']);
});
