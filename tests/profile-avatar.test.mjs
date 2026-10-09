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
    'react-native': { Modal: 'Modal', StyleSheet: { create: (styles) => styles }, useWindowDimensions: () => ({ width: 390, height: 844 }) },
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

test('legacy avatars keep every existing choice and new layers survive a serialization round trip', () => {
  const legacy = { version: 1, skin: 'fair', hair: 'bob', hairColor: 'silver', expression: 'wink', beard: 'none', glasses: 'square', background: 'rose' };
  const restored = model.parseAvatar(legacy);
  for (const [key, value] of Object.entries(legacy)) assert.equal(restored[key], value);
  assert.equal(restored.clothing, 'tee');
  assert.equal(restored.face, 'oval');
  for (const { avatar } of model.avatarPresets) {
    assert.deepEqual(model.parseAvatar(JSON.parse(JSON.stringify(avatar))), avatar);
  }
  for (const [key, options] of Object.entries(model.avatarOptions)) {
    for (const { id } of options) assert.equal(model.parseAvatar({ ...restored, [key]: id })[key], id);
    assert.equal(model.parseAvatar({ ...restored, [key]: { injected: true } })[key], model.defaultAvatar[key]);
  }
});

test('combining presets, accessories, outfits and backgrounds can be undone and saved together', async () => {
  const screen = await editor(async (_user, avatar) => avatar);
  screen.button('Styles').props.onPress();
  screen.button('Brise').props.onPress();
  assert.equal(screen.preview().hair, 'braids');
  screen.button('Accessoires').props.onPress();
  screen.button('Perles').props.onPress();
  screen.button('Monture').props.onPress();
  screen.button('Or').props.onPress();
  assert.equal(screen.preview().glasses, 'round');
  assert.equal(screen.preview().glassesColor, 'gold');
  screen.button('Annuler la dernière modification').props.onPress();
  assert.equal(screen.preview().glasses, 'none');
  screen.button('Tenue').props.onPress();
  screen.button('Sweat à capuche').props.onPress();
  screen.button('Fond').props.onPress();
  screen.button('Lavande').props.onPress();
  screen.button('Motif').props.onPress();
  screen.button('Confettis').props.onPress();
  screen.button('Enregistrer mon avatar').props.onPress();
  await flush();
  assert.equal(screen.saved.hair, 'braids');
  assert.equal(screen.saved.earrings, 'pearl');
  assert.equal(screen.saved.clothing, 'hoodie');
  assert.equal(screen.saved.background, 'lavender');
  assert.equal(screen.saved.backgroundPattern, 'dots');
});

test('random suggestions are reversible without writing the profile', async () => {
  let writes = 0;
  const screen = await editor(async () => { writes++; });
  screen.button('Avatar aléatoire').props.onPress();
  const draft = screen.preview();
  assert.deepEqual(model.parseAvatar(draft), draft);
  screen.button('Annuler la dernière modification').props.onPress();
  assert.deepEqual(screen.preview(), model.defaultAvatar);
  assert.equal(writes, 0);
});

test('each appearance option renders a distinct vector portrait, including every background', async () => {
  const React = await import('react');
  const runtime = await import('react/jsx-runtime');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const svg = { default: 'svg', __esModule: true };
  for (const name of ['Circle', 'ClipPath', 'Defs', 'Ellipse', 'G', 'LinearGradient', 'Path', 'RadialGradient', 'Rect', 'Stop']) {
    svg[name] = name[0].toLowerCase() + name.slice(1);
  }
  const { UserAvatar } = await load('src/components/user-avatar.tsx', {
    react: React, 'react/jsx-runtime': runtime, 'react-native-svg': svg, 'react-native': { Platform: { OS: 'web' } },
    '@/features/profile/avatar': model,
  });
  for (const [key, options] of Object.entries(model.avatarOptions)) {
    const variants = options.map(({ id }) => renderToStaticMarkup(React.createElement(UserAvatar, {
      avatar: { ...model.defaultAvatar, glasses: key === 'glassesColor' ? 'round' : 'none', headwear: key === 'headwearColor' ? 'straw' : 'none', [key]: id },
    })));
    assert.equal(new Set(variants).size, options.length, `Each ${key} option must be visible`);
    for (const result of variants) {
      assert.ok(!result.includes('NaN'));
      assert.ok(!result.includes('undefined'));
    }
  }
});

test('rural styles keep hair choices when headwear is changed, removed, undone and saved', async () => {
  const screen = await editor(async (_user, avatar) => avatar);
  screen.button('Styles').props.onPress();
  screen.button('Récolte').props.onPress();
  assert.equal(screen.preview().headwear, 'headscarf');
  assert.equal(screen.preview().hair, 'braids');
  assert.equal(screen.preview().clothing, 'blouse');
  screen.button('Accessoires').props.onPress();
  screen.button('Coiffe').props.onPress();
  screen.button('Sans coiffe').props.onPress();
  assert.equal(screen.preview().headwear, 'none');
  assert.equal(screen.preview().hair, 'braids');
  screen.button('Couleur coiffe').props.onPress();
  screen.button('Indigo').props.onPress();
  assert.equal(screen.preview().headwear, 'straw');
  assert.equal(screen.preview().headwearColor, 'indigo');
  screen.button('Annuler la dernière modification').props.onPress();
  assert.equal(screen.preview().headwear, 'none');
  screen.button('Coiffe').props.onPress();
  screen.button('Grand chapeau').props.onPress();
  screen.button('Enregistrer mon avatar').props.onPress();
  await flush();
  assert.equal(screen.saved.headwear, 'wideStraw');
  assert.equal(screen.saved.hair, 'braids');
  assert.equal(screen.saved.clothing, 'blouse');
});
