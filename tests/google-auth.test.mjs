import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile('src/features/profile/google-auth.ts', 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});

function googleAuth({ platform = 'ios', oauthError = null, browserResult, exchangeError = null } = {}) {
  const calls = [];
  const session = { user: { id: 'account-id', email: 'personne@example.com' } };
  const location = {
    origin: 'https://louvenslouis.github.io',
    pathname: '/stopaccidents/profil',
    assigned: null,
    assign(url) { this.assigned = url; },
  };
  const exports = {};
  new Function('exports', 'require', 'window', outputText)(exports, (name) => {
    if (name === 'react-native') return { Platform: { OS: platform } };
    if (name === 'expo-linking') return { createURL: (path) => `stopaccidents://${path}` };
    if (name === 'expo-web-browser') return {
      openAuthSessionAsync: async (url, redirectTo) => {
        calls.push({ method: 'browser', url, redirectTo });
        return browserResult ?? { type: 'success', url: `${redirectTo}?code=auth-code&sb_flow_id=flow-id` };
      },
    };
    if (name === '@/lib/supabase') return { supabase: { auth: {
      signInWithOAuth: async (credentials) => {
        calls.push({ method: 'oauth', credentials });
        return { data: { url: 'https://example.supabase.co/auth/v1/authorize' }, error: oauthError };
      },
      exchangeCodeForSession: async (code, options) => {
        calls.push({ method: 'exchange', code, options });
        return { data: { session }, error: exchangeError };
      },
    } } };
    return {};
  }, { location });
  return { ...exports, calls, location, session };
}

test('native Google login opens the auth browser and exchanges the PKCE code', async () => {
  const auth = googleAuth();
  assert.deepEqual(await auth.signInWithGoogle(), { status: 'connected', session: auth.session });
  assert.deepEqual(auth.calls, [
    { method: 'oauth', credentials: {
      provider: 'google',
      options: { redirectTo: 'stopaccidents://profil', skipBrowserRedirect: true },
    } },
    { method: 'browser', url: 'https://example.supabase.co/auth/v1/authorize', redirectTo: 'stopaccidents://profil' },
    { method: 'exchange', code: 'auth-code', options: { flowId: 'flow-id' } },
  ]);
});

test('web Google login redirects back to the current profile URL', async () => {
  const auth = googleAuth({ platform: 'web' });
  assert.deepEqual(await auth.signInWithGoogle(), { status: 'redirecting' });
  assert.equal(auth.calls[0].credentials.options.redirectTo, 'https://louvenslouis.github.io/stopaccidents/profil/');
  assert.equal(auth.location.assigned, 'https://example.supabase.co/auth/v1/authorize');
  assert.equal(auth.calls.length, 1);
});

test('cancelled Google login does not exchange or create a session', async () => {
  const auth = googleAuth({ browserResult: { type: 'cancel' } });
  assert.deepEqual(await auth.signInWithGoogle(), { status: 'cancelled' });
  assert.equal(auth.calls.length, 2);
});

test('the same OAuth callback exchanges its code only once', async () => {
  const auth = googleAuth();
  const url = 'stopaccidents://profil?code=same-code';
  const [first, second] = await Promise.all([
    auth.completeGoogleSignIn(url),
    auth.completeGoogleSignIn(url),
  ]);
  assert.equal(first, auth.session);
  assert.equal(second, auth.session);
  assert.equal(auth.calls.filter(({ method }) => method === 'exchange').length, 1);
});

test('Google provider and callback errors do not create a session', async () => {
  const disabled = googleAuth({ oauthError: new Error('provider_disabled') });
  await assert.rejects(disabled.signInWithGoogle(), /provider_disabled/);
  assert.equal(disabled.calls.length, 1);

  const invalid = googleAuth({ browserResult: { type: 'success', url: 'stopaccidents://profil?error=access_denied' } });
  await assert.rejects(invalid.signInWithGoogle(), /Connexion Google refusée/);
  assert.equal(invalid.calls.length, 2);
});
