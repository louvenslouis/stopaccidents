import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';

type GoogleSignInResult =
  | { status: 'connected'; session: Session }
  | { status: 'cancelled' | 'redirecting' };

let lastExchange: { code: string; promise: Promise<Session> } | null = null;

export function googleRedirectUrl() {
  if (Platform.OS === 'web') {
    const path = window.location.pathname.replace(/\/profil\/?$/, '/profil/');
    return `${window.location.origin}${path}`;
  }
  return Linking.createURL('profil');
}

export function completeGoogleSignIn(url: string): Promise<Session> {
  const callback = new URL(url);
  if (callback.searchParams.has('error') || callback.searchParams.has('error_code')) {
    return Promise.reject(new Error('Connexion Google refusée. Réessayez.'));
  }

  const code = callback.searchParams.get('code');
  if (!code) return Promise.reject(new Error('Retour de connexion Google invalide. Réessayez.'));
  if (lastExchange?.code === code) return lastExchange.promise;

  const flowId = callback.searchParams.get('sb_flow_id');
  const promise = (async () => {
    const { data, error } = await supabase.auth.exchangeCodeForSession(
      code,
      flowId ? { flowId } : undefined,
    );
    if (error) throw error;
    if (!data.session) throw new Error('Session Google introuvable. Réessayez.');
    return data.session;
  })();
  lastExchange = { code, promise };
  return promise;
}

export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  const redirectTo = googleRedirectUrl();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data.url) throw new Error('Connexion Google indisponible. Réessayez.');

  if (Platform.OS === 'web') {
    window.location.assign(data.url);
    return { status: 'redirecting' };
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return { status: 'cancelled' };
  return { status: 'connected', session: await completeGoogleSignIn(result.url) };
}
