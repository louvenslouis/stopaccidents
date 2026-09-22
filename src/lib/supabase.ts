import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';

const EXPECTED_SUPABASE_ORIGIN = 'https://vqzmzblwmbhmfoikpbhy.supabase.co';
const STORAGE_PREFIX = 'stopaccidents.supabase';

// Keeping each value small avoids platform keychain limits while still storing
// the whole session in encrypted native storage.
const SECURE_STORE_CHUNK_LENGTH = 450;
const MAX_SECURE_STORE_CHUNKS = 256;
const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

type StoredValueMetadata = {
  chunkCount: number;
  version: string;
};

function requireClientConfiguration() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      'Configuration Supabase absente. Copiez .env.example vers .env.local et renseignez les variables EXPO_PUBLIC_SUPABASE_*.',
    );
  }

  if (publishableKey.startsWith('sb_secret_')) {
    throw new Error('Une clé Supabase secrète ne doit jamais être utilisée dans une application cliente.');
  }

  if (!publishableKey.startsWith('sb_publishable_')) {
    throw new Error('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY doit contenir une clé Supabase publishable.');
  }

  let origin: string;

  try {
    origin = new URL(url).origin;
  } catch {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL doit être une URL HTTPS valide.');
  }

  if (origin !== EXPECTED_SUPABASE_ORIGIN || url !== origin) {
    throw new Error(`EXPO_PUBLIC_SUPABASE_URL doit être exactement ${EXPECTED_SUPABASE_ORIGIN}.`);
  }

  return { publishableKey, url };
}

function normalizeStorageKey(key: string) {
  return key.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

function metadataKey(key: string) {
  return `${STORAGE_PREFIX}.${normalizeStorageKey(key)}.metadata`;
}

function chunkKey(key: string, version: string, index: number) {
  return `${STORAGE_PREFIX}.${normalizeStorageKey(key)}.${version}.${index}`;
}

function parseMetadata(value: string | null): StoredValueMetadata | null {
  if (!value) return null;

  const [version, count] = value.split(':');
  const chunkCount = Number(count);

  if (
    !version ||
    !/^[a-z0-9-]+$/i.test(version) ||
    !Number.isInteger(chunkCount) ||
    chunkCount < 1 ||
    chunkCount > MAX_SECURE_STORE_CHUNKS
  ) {
    return null;
  }

  return { chunkCount, version };
}

async function removeChunks(key: string, metadata: StoredValueMetadata | null) {
  if (!metadata) return;

  await Promise.all(
    Array.from({ length: metadata.chunkCount }, (_, index) =>
      SecureStore.deleteItemAsync(chunkKey(key, metadata.version, index), secureStoreOptions),
    ),
  );
}

const nativeSecureStorage = {
  async getItem(key: string) {
    const metadata = parseMetadata(
      await SecureStore.getItemAsync(metadataKey(key), secureStoreOptions),
    );

    if (!metadata) return null;

    const chunks = await Promise.all(
      Array.from({ length: metadata.chunkCount }, (_, index) =>
        SecureStore.getItemAsync(chunkKey(key, metadata.version, index), secureStoreOptions),
      ),
    );

    if (chunks.some((chunk) => chunk === null)) return null;

    return chunks.join('');
  },

  async removeItem(key: string) {
    const keyForMetadata = metadataKey(key);
    const metadata = parseMetadata(await SecureStore.getItemAsync(keyForMetadata, secureStoreOptions));

    // Delete the metadata first so a partially interrupted cleanup cannot
    // restore a session that the user explicitly signed out from.
    await SecureStore.deleteItemAsync(keyForMetadata, secureStoreOptions);
    await removeChunks(key, metadata);
  },

  async setItem(key: string, value: string) {
    const keyForMetadata = metadataKey(key);
    const previousMetadata = parseMetadata(
      await SecureStore.getItemAsync(keyForMetadata, secureStoreOptions),
    );
    const chunks = value.match(new RegExp(`.{1,${SECURE_STORE_CHUNK_LENGTH}}`, 'gs')) ?? [''];

    if (chunks.length > MAX_SECURE_STORE_CHUNKS) {
      throw new Error('La session Supabase dépasse la taille maximale de stockage sécurisé.');
    }

    const version = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

    await Promise.all(
      chunks.map((chunk, index) =>
        SecureStore.setItemAsync(chunkKey(key, version, index), chunk, secureStoreOptions),
      ),
    );
    await SecureStore.setItemAsync(
      keyForMetadata,
      `${version}:${chunks.length}`,
      secureStoreOptions,
    );

    await removeChunks(key, previousMetadata);
  },
};

const { publishableKey, url } = requireClientConfiguration();
const isNative = Platform.OS !== 'web';

export const supabase = createClient(url, publishableKey, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
    persistSession: true,
    storage: isNative ? nativeSecureStorage : undefined,
  },
});

/**
 * Keeps token refresh active only while the native app is in the foreground.
 * Call once from the root layout and dispose it when the layout unmounts.
 */
export function startSupabaseAuthLifecycle() {
  if (!isNative) return () => undefined;

  const updateAutoRefresh = (state: string) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  };

  updateAutoRefresh(AppState.currentState);
  const subscription = AppState.addEventListener('change', updateAutoRefresh);

  return () => {
    subscription.remove();
    supabase.auth.stopAutoRefresh();
  };
}
