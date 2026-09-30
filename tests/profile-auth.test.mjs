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

function profile(session = null, response = { data: { session: null }, error: null }, params = {}) {
  const states = [session, false];
  let stateIndex = 0;
  const requests = [];
  const exports = {};
  const native = Object.fromEntries([
    'ActivityIndicator', 'KeyboardAvoidingView', 'Pressable', 'Text', 'TextInput', 'View',
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

test('only registered accounts see the rewards balance in the profile', () => {
  for (const session of [null, { user: { is_anonymous: true } }]) {
    assert.equal(find(profile(session).render(), (node) => node.type === 'RewardsCard'), null);
  }
  assert.ok(find(profile({ user: { email: 'personne@example.com', is_anonymous: false } }).render(),
    (node) => node.type === 'RewardsCard'));
});

test('switching to signup uses new-password autofill and submits normalized email to signup', async () => {
  const screen = profile();
  screen.button(createLabel).props.onPress();
  assert.equal(screen.input('Mot de passe').props.autoComplete, 'new-password');
  screen.fill();
  await screen.submit(createLabel);
  assert.deepEqual(screen.requests, [{
    method: 'signUp', credentials: { email: 'personne@example.com', password: 'password123' },
  }]);
  assert.ok(screen.hasText('Vérifiez vos e-mails pour confirmer votre compte, puis connectez-vous.'));
  assert.equal(screen.input('Mot de passe').props.value, '');
  assert.equal(screen.input('Mot de passe').props.autoComplete, 'current-password');
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

test('a signup response with a session opens the connected profile', async () => {
  const session = { user: { email: 'personne@example.com', is_anonymous: false } };
  const screen = profile(null, { data: { session }, error: null });
  screen.button(createLabel).props.onPress();
  screen.fill();
  await screen.submit(createLabel);
  assert.ok(screen.hasText('Votre compte'));
  assert.equal(screen.button(createLabel), null);
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

test('signup explains when confirmation email delivery blocks account creation', async () => {
  const screen = profile(null, {
    data: { session: null },
    error: { code: 'email_address_not_authorized', status: 422 },
  });
  screen.button(createLabel).props.onPress();
  screen.fill();
  await screen.submit(createLabel);
  assert.ok(screen.hasText('L’envoi des e-mails de confirmation n’est pas configuré pour cette adresse.'));
  assert.equal(screen.button(createLabel).props.disabled, false);
  assert.equal(screen.input('Mot de passe').props.value, 'password123');
});

test('signup explains when confirmation emails are rate limited', async () => {
  const screen = profile(null, {
    data: { session: null },
    error: { code: 'over_email_send_rate_limit', status: 429 },
  });
  screen.button(createLabel).props.onPress();
  screen.fill();
  await screen.submit(createLabel);
  assert.ok(screen.hasText('Limite d’envoi des e-mails de confirmation atteinte. Réessayez plus tard.'));
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
