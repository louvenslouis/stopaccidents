import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile('src/app/profil/index.tsx', 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
  },
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

function profile(session = null, response = {
  data: { session: { user: { email: 'personne@example.com', is_anonymous: false } } },
  error: null,
}, params = { auth: 'signIn' }) {
  const states = [session, false];
  let stateIndex = 0;
  const requests = [];
  const exports = {};
  const native = Object.fromEntries([
    'Modal', 'ActivityIndicator', 'KeyboardAvoidingView', 'Pressable', 'Text', 'TextInput', 'View',
  ].map((name) => [name, name]));
  new Function('exports', 'require', outputText)(exports, (name) => {
    if (name === 'react') return {
      useEffect: () => {},
      useState(initial) {
        const index = stateIndex++;
        if (!(index in states)) states[index] = initial;
        return [states[index], (value) => {
          states[index] = typeof value === 'function' ? value(states[index]) : value;
        }];
      },
    };
    if (name === 'react/jsx-runtime') return {
      Fragment: 'Fragment',
      jsx: (type, props) => ({ type, props }),
      jsxs: (type, props) => ({ type, props }),
    };
    if (name === 'react-native') return {
      ...native, Platform: { OS: 'web' }, StyleSheet: { create: (styles) => styles },
    };
    if (name === 'expo-router') return { useLocalSearchParams: () => params, useRouter: () => ({ setParams() {} }) };
    if (name === '@/components/account-setup') return { AccountSetup: 'AccountSetup' };
    if (name === '@/components/rewards-card') return { RewardsCard: 'RewardsCard' };
    if (name === '@/features/profile/google-auth') return {
      signInWithGoogle: async () => {
        requests.push({ method: 'google' });
        return { status: 'connected', session: { user: { email: 'personne@example.com', is_anonymous: false } } };
      },
    };
    if (name === '@/features/language/native') return native;
    if (name === '@/features/appearance/theme-provider') return {
      createThemedStyles: (factory) => () => factory((light) => light),
      useThemeColor: () => (light) => light,
      useAppTheme: () => ({ scheme: 'light' }),
    };
    if (name === '@/components/ui/surface-depth') return { surfaceDepth: () => ({}) };
    if (name === '@/components/ui/animated-pressable') return { AnimatedPressable: 'Button' };
    if (name === '@/lib/supabase') return {
      supabase: { auth: Object.fromEntries(['signUp', 'signInWithPassword'].map((method) => [
        method, async (credentials) => {
          requests.push({ method, credentials });
          if (response instanceof Error) throw response;
          return response;
        },
      ])) },
    };
    return {};
  });
  const render = () => {
    stateIndex = 0;
    return exports.default();
  };
  const button = (label) => find(render(), (node) =>
    node.type === 'Button' && node.props.accessibilityLabel === label);
  const input = (label) => find(render(), (node) =>
    node.type === 'TextInput' && node.props.accessibilityLabel === label);
  const fill = (email = ' Personne@Example.com ', password = 'password123') => {
    input('Adresse e-mail').props.onChangeText(email);
    input('Mot de passe').props.onChangeText(password);
  };
  const submit = async (label) => {
    button(label).props.onPress();
    await new Promise(setImmediate);
  };
  const hasText = (text) => Boolean(find(render(), (node) =>
    node.type === 'Text' && node.props.children === text));
  return { render, button, input, fill, submit, hasText, requests };
}

const createLabel = 'Créer un compte par e-mail';

test('email account creation is offered to visitors and guests, and hidden for connected accounts', () => {
  for (const session of [null, { user: { is_anonymous: true } }]) {
    assert.ok(profile(session).button(createLabel));
  }
  assert.equal(profile({ user: { email: 'personne@example.com', is_anonymous: false } }).button(createLabel), null);
});

test('Google login stays disabled until the provider is configured', async () => {
  for (const session of [null, { user: { is_anonymous: true } }]) {
    const screen = profile(session);
    const google = screen.button('Continuer avec Google');
    assert.equal(google.props.disabled, true);
    google.props.onPress();
    await new Promise(setImmediate);
    assert.deepEqual(screen.requests, []);
  }
  assert.equal(profile({ user: { email: 'personne@example.com', is_anonymous: false } })
    .button('Continuer avec Google'), null);
});

test('completion signup link opens the account creation form directly', () => {
  const screen = profile({ user: { is_anonymous: true } }, undefined, { auth: 'signUp' });
  assert.equal(screen.input('Mot de passe').props.autoComplete, 'new-password');
  assert.ok(screen.hasText('Création de compte par e-mail'));
  assert.ok(screen.hasText('Créer un compte'));
});

test('profile exposes rewards through its dedicated entry', () => {
  for (const session of [null, { user: { is_anonymous: true } },
    { user: { email: 'personne@example.com', is_anonymous: false } }]) {
    const tree = profile(session).render();
    assert.equal(find(tree, (node) => node.type === 'RewardsCard'), null);
    assert.ok(find(tree, (node) => node.props?.accessibilityLabel === 'Récompenses'));
  }
});

test('signup submits normalized email and opens the account without email verification', async () => {
  const screen = profile();
  screen.button(createLabel).props.onPress();
  assert.equal(screen.input('Mot de passe').props.autoComplete, 'new-password');
  screen.fill();
  await screen.submit(createLabel);
  assert.deepEqual(screen.requests, [{
    method: 'signUp', credentials: { email: 'personne@example.com', password: 'password123' },
  }]);
  assert.ok(find(screen.render(), (node) => node.type === 'AccountSetup'));
  assert.ok(screen.hasText('Votre compte'));
  assert.equal(screen.button(createLabel), null);
  assert.equal(screen.input('Mot de passe'), null);
});

test('signup rejects malformed email and short passwords before making a request', async () => {
  const screen = profile();
  screen.button(createLabel).props.onPress();
  screen.fill('incorrect');
  await screen.submit(createLabel);
  assert.ok(screen.hasText('Saisissez une adresse e-mail valide.'));
  screen.fill('personne@example.com', '12345');
  await screen.submit(createLabel);
  assert.ok(screen.hasText('Choisissez un mot de passe d’au moins 6 caractères.'));
  assert.equal(screen.requests.length, 0);
});

test('signup signs in guests directly as registered accounts', async () => {
  const session = { user: { email: 'personne@example.com', is_anonymous: false } };
  const screen = profile({ user: { is_anonymous: true } }, { data: { session }, error: null });
  screen.button(createLabel).props.onPress();
  screen.fill();
  await screen.submit(createLabel);
  assert.ok(find(screen.render(), (node) => node.type === 'AccountSetup'));
  assert.ok(screen.hasText('Votre compte'));
  assert.equal(screen.button(createLabel), null);
});

test('signup without a session stays on the form without reporting success or requesting verification', async () => {
  for (const session of [null, { user: { is_anonymous: true } }]) {
    const screen = profile(session, { data: { session: null }, error: null });
    screen.button(createLabel).props.onPress();
    screen.fill();
    await screen.submit(createLabel);
    assert.ok(screen.hasText('Impossible de créer votre compte. Réessayez.'));
    assert.equal(screen.hasText('Compte créé.'), false);
    assert.equal(screen.hasText('Votre compte'), false);
    assert.equal(screen.input('Mot de passe').props.value, 'password123');
    assert.equal(screen.input('Mot de passe').props.autoComplete, 'new-password');
    assert.equal(screen.button(createLabel).props.disabled, false);
    assert.deepEqual(screen.requests.map((request) => request.method), ['signUp']);
  }
});

test('signup errors restore the form so the user can retry', async () => {
  for (const response of [
    { data: { session: null }, error: { code: 'weak_password' } },
    new Error('Network unavailable'),
  ]) {
    const screen = profile(null, response);
    screen.button(createLabel).props.onPress();
    screen.fill();
    await screen.submit(createLabel);
    assert.equal(screen.button(createLabel).props.disabled, false);
    assert.equal(screen.input('Mot de passe').props.value, 'password123');
    assert.ok(screen.hasText(response instanceof Error
      ? 'Connexion impossible. Vérifiez votre connexion Internet et réessayez.'
      : 'Choisissez un mot de passe plus long et plus complexe.'));
  }
});

test('signup email delivery errors keep the form available without asking for verification', async () => {
  for (const code of ['email_address_not_authorized', 'over_email_send_rate_limit']) {
    const screen = profile(null, { data: { session: null }, error: { code } });
    screen.button(createLabel).props.onPress();
    screen.fill();
    await screen.submit(createLabel);
    assert.ok(screen.hasText('Impossible de créer votre compte. Réessayez.'));
    assert.equal(screen.button(createLabel).props.disabled, false);
    assert.equal(screen.input('Mot de passe').props.value, 'password123');
  }
});

test('signup surfaces an unknown Auth error code for diagnosis', async () => {
  const screen = profile(null, {
    data: { session: null },
    error: { code: 'unexpected_failure', status: 422 },
  });
  screen.button(createLabel).props.onPress();
  screen.fill();
  await screen.submit(createLabel);
  assert.ok(screen.hasText('Impossible de créer votre compte (unexpected_failure). Réessayez.'));
});

test('the existing login form still uses password sign-in', async () => {
  const screen = profile();
  screen.fill('personne@example.com', 'old');
  await screen.submit('Se connecter par e-mail');
  assert.equal(screen.requests[0].method, 'signInWithPassword');
  assert.ok(screen.hasText('Connexion réussie.'));
});


test('Se connecter opens a dismissible full-screen sheet from the profile', () => {
  const screen = profile(null, undefined, {});
  assert.equal(screen.input('Adresse e-mail'), null);
  screen.button('Se connecter').props.onPress();
  assert.ok(screen.input('Adresse e-mail'));
  const modal = find(screen.render(), (node) => node.type === 'Modal');
  assert.equal(modal.props.presentationStyle, 'fullScreen');
  assert.equal(modal.props.animationType, 'slide');
  screen.button('Fermer la connexion').props.onPress();
  assert.equal(screen.input('Adresse e-mail'), null);
});
