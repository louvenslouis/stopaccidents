import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

async function load(path, imports = {}, globals = {}) {
  const { outputText } = ts.transpileModule(await readFile(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  const exports = {};
  new Function('exports', 'require', ...Object.keys(globals), outputText)(exports, (name) => imports[name] ?? {}, ...Object.values(globals));
  return exports;
}
const model = await load('src/features/profile/onboarding.ts');
const flush = () => new Promise(setImmediate);
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const found = find(child, predicate);
    if (found) return found;
  }
  return null;
}

async function setup(profile = { step: 'alias', alias: 'automaticalias' }, overrides = {}) {
  const states = [], effects = [], refs = [], calls = [];
  const timers = new Map(); let timerId = 0;
  let index = 0, effectIndex = 0, refIndex = 0;
  const native = Object.fromEntries(['Text', 'TextInput', 'View', 'ScrollView'].map((name) => [name, name]));
  const api = {
    validateAlias: model.validateAlias,
    isAliasAvailable: async () => true,
    readOnboarding: async () => profile,
    suggestAlias: async () => 'colibriserein1234',
    saveOnboarding: async (...args) => { calls.push(args); },
    ...overrides,
  };
  const exports = await load('src/components/account-setup.tsx', {
    react: {
      useState(initial) {
        const i = index++;
        if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial;
        return [states[i], (value) => { states[i] = typeof value === 'function' ? value(states[i]) : value; }];
      },
      useRef(initial) { const i = refIndex++; return refs[i] ??= { current: initial }; },
      useEffect(run, deps) {
        const i = effectIndex++;
        if (effects[i] && deps.every((value, j) => Object.is(value, effects[i].deps[j]))) return;
        effects[i]?.cleanup?.();
        effects[i] = { run, deps, pending: true };
      },
    },
    'react/jsx-runtime': { Fragment: 'Fragment', jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'react-native': { Modal: 'Modal', Platform: { OS: 'web' }, StyleSheet: { create: (styles) => styles } },
    '@/features/language/native': native,
    '@/features/appearance/theme-provider': {
      createThemedStyles: (factory) => () => factory((color) => color),
      useThemeColor: () => (color) => color, useAppTheme: () => ({ scheme: 'light' }),
    },
    '@/features/profile/onboarding': api,
    '@/features/profile/avatar': { parseAvatar: () => ({ version: 1 }) },
    '@/features/profile/avatar-api': { saveAvatar: async (...args) => { calls.push(['avatar', ...args]); return args[1]; } },
    './ui/animated-pressable': { AnimatedPressable: 'Button' },
    './avatar-editor': { AvatarEditor: 'AvatarEditor' },
  }, { setTimeout: (callback) => { timers.set(++timerId, callback); return timerId; }, clearTimeout: (id) => timers.delete(id) });
  function render() {
    index = effectIndex = refIndex = 0;
    const tree = exports.AccountSetup({ user: { id: 'user-1' }, onUpdated() {} });
    for (const effect of effects) if (effect.pending) { effect.pending = false; effect.cleanup = effect.run(); }
    return tree;
  }
  render(); await flush();
  return {
    render, calls,
    async check() {
      render();
      for (const [id, callback] of timers) { timers.delete(id); callback(); }
      await flush(); render();
    },
    button: (label) => find(render(), (node) => node.type === 'Button' && node.props.accessibilityLabel === label),
    input: () => find(render(), (node) => node.type === 'TextInput'),
    avatar: () => find(render(), (node) => node.type === 'AvatarEditor'),
    text: (value) => find(render(), (node) => node.type === 'Text' && node.props.children === value),
    modal: () => find(render(), (node) => node.type === 'Modal'),
    unmount() { effects.forEach((effect) => effect.cleanup?.()); },
  };
}

test('new accounts choose an alias explicitly and continue to an embedded private avatar editor', async () => {
  const screen = await setup();
  assert.equal(screen.input().props.value, '');
  assert.equal(screen.button('Continuer vers mon avatar').props.disabled, true);
  screen.input().props.onChangeText('monalias');
  await screen.check();
  screen.button('Continuer vers mon avatar').props.onPress(); await flush();
  assert.deepEqual(screen.calls, [['user-1', 'avatar', 'monalias']]);
  assert.equal(screen.input(), null);
  assert.equal(screen.avatar().props.embedded, true);
  assert.equal(screen.avatar().props.onboarding, true);
  const avatar = { version: 1, hair: 'long' };
  const saved = await screen.avatar().props.onSave(avatar);
  screen.avatar().props.onSaved(saved);
  assert.deepEqual(screen.calls.slice(1), [['avatar', 'user-1', avatar], ['user-1', 'complete']]);
  assert.equal(screen.render(), null);
});

test('generation fills the editable draft without saving and blocks duplicate requests', async () => {
  let resolve, requests = 0;
  const screen = await setup(undefined, { suggestAlias: () => { requests++; return new Promise((done) => { resolve = done; }); } });
  const button = screen.button('Générer un alias');
  button.props.onPress(); button.props.onPress();
  assert.equal(requests, 1);
  assert.equal(screen.input().props.editable, false);
  resolve('zwazolib1234'); await flush();
  assert.equal(screen.input().props.value, 'zwazolib1234');
  assert.deepEqual(screen.calls, []);
  screen.input().props.onChangeText('monchoix');
  assert.equal(screen.input().props.value, 'monchoix');
});

test('alias collisions keep the draft and permit correction before advancing', async () => {
  const screen = await setup(undefined, { saveOnboarding: async () => { throw new Error('Alias déjà pris'); } });
  screen.input().props.onChangeText('monalias');
  await screen.check();
  screen.button('Continuer vers mon avatar').props.onPress(); await flush();
  assert.equal(screen.input().props.value, 'monalias');
  assert.ok(screen.text('Alias déjà pris'));
  assert.equal(screen.avatar(), null);
  await screen.check();
  assert.equal(screen.button('Continuer vers mon avatar').props.disabled, false);
});

test('interrupted accounts resume at avatar; returning to alias preserves their choice', async () => {
  const screen = await setup({ step: 'avatar', alias: 'monalias' });
  assert.ok(screen.avatar());
  screen.avatar().props.onClose();
  assert.equal(screen.input().props.value, 'monalias');
  screen.button('Fermer la configuration du profil').props.onPress();
  assert.equal(screen.modal().props.visible, false);
  screen.button('Terminer mon profil').props.onPress();
  assert.equal(screen.modal().props.visible, true);
});

test('completed accounts skip onboarding and failed completion stays resumable', async () => {
  assert.equal((await setup({ step: 'complete', alias: 'monalias' })).render(), null);
  const screen = await setup({ step: 'avatar', alias: 'monalias' }, { saveOnboarding: async () => { throw new Error('Offline'); } });
  await assert.rejects(screen.avatar().props.onSave({ version: 1 }), /Offline/);
  assert.ok(screen.avatar());
  assert.equal(screen.modal().props.visible, true);
});

test('onboarding API validates aliases, checks the current account and reports collisions', async () => {
  let user = { id: 'user-1', is_anonymous: false }, writes = 0, response = { data: { user_id: 'user-1' } };
  const api = await load('src/features/profile/onboarding.ts', {
    '@/lib/supabase': { supabase: {
      auth: { getSession: async () => ({ data: { session: user ? { user } : null } }) },
      from: () => ({ update: () => { writes++; return { eq: () => ({ select: () => ({ single: async () => response }) }) }; } }),
    } },
  });
  for (const value of ['', 'abc', 'Jean Louis', '1234', 'nom@example.com', ' monalias', 'monalias ', 'Monalias', 'monalias\n', 'mon\u3164alias', 'mon\uffa0alias', 'mon\u200balias', 'mon\u00a0alias', 'mon\talias', 'mon\u115falias', 'mon\u1160alias', 'mon\ufeffalias']) {
    await assert.rejects(api.saveOnboarding('user-1', 'avatar', value), /4 à 40/);
  }
  assert.equal(writes, 0);
  await api.saveOnboarding('user-1', 'avatar', 'monalias');
  assert.equal(writes, 1);
  response = { error: { code: '23505' } };
  await assert.rejects(api.saveOnboarding('user-1', 'avatar', 'monalias'), /déjà utilisé/);
  for (user of [null, { id: 'other' }, { id: 'user-1', is_anonymous: true }]) {
    await assert.rejects(api.saveOnboarding('user-1', 'complete'), /session/);
  }
  assert.equal(writes, 2);
});


test('live availability is debounced, rejects invalid characters, and ignores stale responses', async () => {
  const requests = [];
  const screen = await setup(undefined, { isAliasAvailable: (alias, signal) => new Promise((resolve) => requests.push({ alias, signal, resolve })) });
  screen.input().props.onChangeText('MonAlias');
  assert.equal(screen.input().props.value, 'monalias');
  assert.equal(screen.button('Continuer vers mon avatar').props.disabled, true);
  assert.equal(requests.length, 0);
  await screen.check();
  assert.equal(requests[0].alias, 'monalias');
  screen.input().props.onChangeText('autrealias');
  await screen.check();
  assert.equal(requests[0].signal.aborted, true);
  requests[1].resolve(false); await flush();
  assert.ok(screen.text('Cet alias est déjà utilisé.'));
  requests[0].resolve(true); await flush();
  assert.ok(screen.text('Cet alias est déjà utilisé.'));
  assert.equal(screen.button('Continuer vers mon avatar').props.disabled, true);
  screen.button('Continuer vers mon avatar').props.onPress(); await flush();
  assert.deepEqual(screen.calls, []);
  for (const value of ['mon alias', 'mon\u3164alias', 'mon\uffa0alias', 'mon\u200balias', 'monalias\n']) {
    screen.input().props.onChangeText(value);
    await screen.check();
    assert.equal(screen.button('Continuer vers mon avatar').props.disabled, true);
    assert.ok(screen.text(model.validateAlias(value)));
  }
  assert.equal(requests.length, 2, 'Invalid aliases must never be looked up');
});

test('quick edits cancel pending lookups and network failure requires a successful retry', async () => {
  let count = 0;
  const screen = await setup(undefined, { isAliasAvailable: async (alias) => {
    assert.equal(alias, 'finalalias');
    if (++count === 1) throw new Error('Offline');
    return true;
  } });
  screen.input().props.onChangeText('premier'); screen.render();
  screen.input().props.onChangeText('finalalias');
  await screen.check();
  assert.equal(count, 1);
  assert.equal(screen.button('Continuer vers mon avatar').props.disabled, true);
  screen.button('Réessayer la vérification de l’alias').props.onPress();
  await screen.check();
  assert.ok(screen.text('Alias disponible'));
  assert.equal(screen.button('Continuer vers mon avatar').props.disabled, false);
  screen.input().props.onChangeText('FinalAlias');
  assert.equal(screen.input().props.value, 'finalalias');
  assert.equal(screen.button('Continuer vers mon avatar').props.disabled, false, 'An identical normalized value keeps its availability');
});

test('availability API sends the exact alias, supports cancellation, and never treats errors as available', async () => {
  let response = { data: false }, calls = 0, passedSignal;
  const api = await load('src/features/profile/onboarding.ts', { '@/lib/supabase': { supabase: {
    rpc: (name, args) => {
      calls++; assert.equal(name, 'is_user_alias_available'); assert.deepEqual(args, { p_alias: 'monalias' });
      return { then: (resolve) => Promise.resolve(response).then(resolve), abortSignal: (signal) => { passedSignal = signal; return Promise.resolve(response); } };
    },
  } } });
  assert.equal(await api.isAliasAvailable('monalias'), false);
  response = { data: true };
  const signal = new AbortController().signal;
  assert.equal(await api.isAliasAvailable('monalias', signal), true);
  assert.equal(passedSignal, signal);
  assert.equal(await api.isAliasAvailable('mon alias'), false);
  assert.equal(calls, 2);
  response = { error: new Error('Offline'), data: null };
  await assert.rejects(api.isAliasAvailable('monalias'), /Impossible de vérifier/);
});
