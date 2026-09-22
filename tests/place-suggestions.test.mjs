import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = ts.transpileModule(
  await readFile('src/features/map/use-place-suggestions.ts', 'utf8'),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;

function fixture() {
  const hooks = [],
    timers = new Map(),
    requests = [];
  let cursor = 0,
    effects = [],
    timerId = 0;
  const exports = {};
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = initial;
      return [
        hooks[index],
        (next) => {
          hooks[index] = typeof next === 'function' ? next(hooks[index]) : next;
        },
      ];
    },
    useRef(initial) {
      const index = cursor++;
      return (hooks[index] ??= { current: initial });
    },
    useCallback: (fn) => fn,
    useEffect(fn, deps) {
      const index = cursor++;
      const previous = hooks[index];
      if (!previous || deps.some((dep, i) => dep !== previous.deps[i])) {
        hooks[index] = { deps };
        effects.push(() => {
          previous?.cleanup?.();
          hooks[index].cleanup = fn();
        });
      }
    },
  };
  new Function('exports', 'require', 'setTimeout', 'clearTimeout', source)(
    exports,
    (name) =>
      ({
        react,
        './place-search': {
          searchMapPlaces: (query, signal) =>
            new Promise((resolve, reject) =>
              requests.push({ query, signal, resolve, reject }),
            ),
        },
      })[name],
    (fn, delay) => {
      const id = ++timerId;
      timers.set(id, { fn, delay });
      return id;
    },
    (id) => timers.delete(id),
  );
  return {
    requests,
    timers,
    render(query, enabled = true) {
      cursor = 0;
      const result = exports.usePlaceSuggestions(query, enabled);
      const pending = effects;
      effects = [];
      pending.forEach((run) => run());
      return result;
    },
    tick() {
      const pending = [...timers.values()];
      timers.clear();
      pending.forEach(({ fn, delay }) => {
        assert.equal(delay, 300);
        fn();
      });
    },
    unmount() {
      hooks.forEach((hook) => hook?.cleanup?.());
    },
  };
}
const place = (label) => ({ label, latitude: 18.5, longitude: -72.3 });

test('rapid typing makes only the latest request and late responses cannot replace current suggestions', async () => {
  const f = fixture();
  f.render('P');
  assert.equal(f.timers.size, 0);
  f.render('Pe');
  f.render('Pet');
  f.render('Peti');
  assert.equal(f.timers.size, 1);
  f.tick();
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].query, 'Peti');
  f.render('Jac');
  assert.equal(f.requests[0].signal.aborted, true);
  f.tick();
  f.requests[1].resolve([place('Jacmel')]);
  await Promise.resolve();
  f.requests[0].resolve([place('Pétion-Ville')]);
  await Promise.resolve();
  assert.deepEqual(f.render('Jac').places, [place('Jacmel')]);
  assert.deepEqual(
    f.render('Cap').places,
    [],
    'Old choices disappear as soon as the query changes',
  );
  f.unmount();
});

test('clearing, selecting a place, leaving the screen and unmounting cancel pending searches', async () => {
  for (const next of [
    { query: '', enabled: true },
    { query: 'Jacmel', enabled: false },
  ]) {
    const f = fixture();
    f.render('Jac');
    f.tick();
    assert.equal(f.render(next.query, next.enabled).status, 'idle');
    assert.equal(f.requests[0].signal.aborted, true);
    f.requests[0].resolve([place('Jacmel')]);
    await Promise.resolve();
    assert.deepEqual(f.render(next.query, next.enabled).places, []);
    f.unmount();
  }
  const f = fixture();
  f.render('Cap');
  f.unmount();
  f.tick();
  assert.equal(f.requests.length, 0);
});

test('network failures can be retried and repeated queries reuse successful suggestions', async () => {
  const f = fixture();
  f.render('Jac');
  f.tick();
  f.requests[0].reject(new TypeError('offline'));
  await Promise.resolve();
  const error = f.render('Jac');
  assert.equal(error.status, 'error');
  error.retry();
  f.render('Jac');
  f.tick();
  f.requests[1].resolve([place('Jacmel')]);
  await Promise.resolve();
  assert.equal(f.render('Jac').status, 'ready');
  f.render('');
  f.render('Jac');
  assert.deepEqual(f.render('Jac').places, [place('Jacmel')]);
  f.tick();
  assert.equal(f.requests.length, 2);
  f.unmount();
});
