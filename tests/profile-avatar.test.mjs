import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

async function load(path, imports = {}) {
  const { outputText } = ts.transpileModule(await readFile(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  const exports = {};
  new Function('exports', 'require', outputText)(exports, (name) => imports[name] ?? {});
  return exports;
}
const model = await load('src/features/profile/avatar.ts');

test('stored appearance is bounded, versioned and resilient to malformed metadata', () => {
  for (const input of [null, [], 'avatar', { version: 2, skin: 'fair' }]) {
    assert.deepEqual(model.parseAvatar(input), model.defaultAvatar);
  }
  const result = model.parseAvatar({ version: 1, skin: 'fair', hair: '<script>', background: 'https://example.com', admin: true });
  assert.equal(result.skin, 'fair');
  assert.equal(result.hair, model.defaultAvatar.hair);
  assert.equal(result.background, model.defaultAvatar.background);
  assert.equal('admin' in result, false);
  for (let i = 0; i < 100; i++) {
    const avatar = model.randomAvatar();
    assert.deepEqual(model.parseAvatar(avatar), avatar);
  }
});

test('saving only updates avatar metadata and rejects missing or changed sessions', async () => {
  let userId = 'first';
  let anonymous = false;
  let payload;
  const api = await load('src/features/profile/avatar-api.ts', {
    './avatar': model,
    '@/lib/supabase': { supabase: { auth: {
      getSession: async () => ({ data: { session: userId ? { user: { id: userId, is_anonymous: anonymous } } : null } }),
      updateUser: async (value) => {
        payload = value;
        return { data: { user: { id: userId, user_metadata: value.data } } };
      },
    } } },
  });
  const chosen = { ...model.defaultAvatar, hair: 'long', glasses: 'round' };
  assert.deepEqual(await api.saveAvatar('first', chosen), chosen);
  assert.deepEqual(payload, { data: { avatar: chosen } });
  anonymous = true;
  payload = null;
  await assert.rejects(api.saveAvatar('first', chosen), /Créez un compte/);
  assert.equal(payload, null);
  for (userId of ['second', null]) {
    payload = null;
    await assert.rejects(api.saveAvatar('first', chosen), /session/);
    assert.equal(payload, null);
  }
});

test('anonymous users and visitors keep a generic profile icon, even with old avatar metadata', async () => {
  let user = null;
  const component = await load('src/components/current-user-avatar.tsx', {
    react: { useState: () => [user, () => {}], useEffect() {} },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
    '@/features/appearance/theme-provider': { useThemeColor: () => (color) => color },
    '@/features/profile/avatar': model,
    './user-avatar': { UserAvatar: 'UserAvatar' },
    './ui/app-icon': { AppIcon: 'AppIcon' },
  });
  assert.equal(component.CurrentUserAvatar({}).type, 'AppIcon');
  user = { is_anonymous: true, user_metadata: { avatar: model.defaultAvatar } };
  assert.equal(component.CurrentUserAvatar({}).type, 'AppIcon');
  user = { ...user, is_anonymous: false };
  assert.equal(component.CurrentUserAvatar({}).type, 'UserAvatar');
});

function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const result = find(child, predicate);
    if (result) return result;
  }
  return null;
}
async function editor(saveAvatar) {
  const values = [];
  let index = 0, closed = false, saved = null;
  const exports = await load('src/components/avatar-editor.tsx', {
    react: {
      useState(initial) { const i = index++; if (!(i in values)) values[i] = initial; return [values[i], (next) => { values[i] = typeof next === 'function' ? next(values[i]) : next; }]; },
      useRef(initial) { const i = index++; return values[i] ??= { current: initial }; },
    },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'react-native': { Modal: 'Modal', StyleSheet: { create: (styles) => styles } },
    '@/features/language/native': { Text: 'Text', View: 'View', ScrollView: 'ScrollView' },
    '@/features/appearance/theme-provider': { createThemedStyles: (factory) => () => factory((c) => c), useThemeColor: () => (c) => c },
    '@/features/profile/avatar': model,
    '@/features/profile/avatar-api': { saveAvatar },
    './user-avatar': { UserAvatar: 'UserAvatar' },
  });
  function render() { index = 0; return exports.AvatarEditor({ userId: 'first', initial: model.defaultAvatar, onClose() { closed = true; }, onSaved(value) { saved = value; } }); }
  return {
    render, get closed() { return closed; }, get saved() { return saved; },
    button(label) { return find(render(), (node) => node.props?.accessibilityLabel === label); },
    preview() { return find(render(), (node) => node.type === 'UserAvatar').props.avatar; },
  };
}
const flush = () => new Promise(setImmediate);

test('preview changes stay in the draft and cancel never writes to the account', async () => {
  let writes = 0;
  const screen = await editor(async () => { writes++; });
  screen.button('Porcelaine').props.onPress();
  assert.equal(screen.preview().skin, 'fair');
  screen.button('Annuler').props.onPress();
  assert.ok(screen.closed);
  assert.equal(writes, 0);
  assert.equal(screen.saved, null);
});

test('failed saves preserve the draft, allow retry, and block duplicate requests', async () => {
  let writes = 0, resolve;
  const screen = await editor(async (_user, avatar) => {
    writes++;
    if (writes === 1) throw new Error('Impossible d’enregistrer votre avatar. Réessayez.');
    await new Promise((done) => { resolve = done; });
    return avatar;
  });
  screen.button('Porcelaine').props.onPress();
  screen.button('Enregistrer mon avatar').props.onPress();
  await flush();
  assert.equal(screen.closed, false);
  assert.equal(screen.preview().skin, 'fair');
  assert.ok(find(screen.render(), (node) => node.props?.accessibilityRole === 'alert'));
  screen.button('Enregistrer mon avatar').props.onPress();
  screen.button('Enregistrer mon avatar').props.onPress();
  assert.equal(writes, 2);
  assert.equal(screen.button('Annuler').props.disabled, true);
  resolve();
  await flush();
  assert.ok(screen.closed);
  assert.equal(screen.saved.skin, 'fair');
});
