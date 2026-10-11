import { File, Paths } from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import { AESEncryptionKey, AESKeySize, AESSealedData, aesEncryptAsync, aesDecryptAsync, randomUUID } from "expo-crypto";

const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const encoder = new TextEncoder();
const operations = new Map<string, Promise<unknown>>();

// Serialize migration and writes so a read cannot replace a newer draft.
function serialized<T>(key: string, action: () => Promise<T>): Promise<T> {
  const next = (operations.get(key) ?? Promise.resolve()).catch(() => {}).then(action);
  operations.set(key, next);
  void next.finally(() => {
    if (operations.get(key) === next) operations.delete(key);
  }).catch(() => {});
  return next;
}

function pointer(value: string) {
  if (/^report-draft-[a-f0-9-]+\.json$/i.test(value)) return { name: value, secret: null };
  const parsed = JSON.parse(value);
  if (parsed.version !== 1 || !/^report-draft-[a-f0-9-]+\.aes$/i.test(parsed.name) ||
      typeof parsed.secret !== 'string' || !/^[a-f0-9]{64}$/i.test(parsed.secret)) {
    throw new Error('Invalid encrypted draft metadata');
  }
  return { name: parsed.name as string, secret: parsed.secret as string };
}

async function save(key: string, value: string, previous: string | null) {
  const old = previous ? pointer(previous) : null;
  const secret = await AESEncryptionKey.generate(AESKeySize.AES256);
  const sealed = await aesEncryptAsync(encoder.encode(value), secret, {
    additionalData: encoder.encode(key), nonce: { length: 12 }, tagLength: 16,
  });
  const name = `report-draft-${randomUUID()}.aes`;
  const file = new File(Paths.document, name);
  try {
    file.write(await sealed.combined());
    // The key and pointer commit together, only after ciphertext is on disk.
    await SecureStore.setItemAsync(key, JSON.stringify({ version: 1, name, secret: await secret.encoded('hex') }), options);
  } catch (error) {
    try { if (file.exists) file.delete(); } catch { /* Never masks the original error. */ }
    throw error;
  }
  if (old) {
    const oldFile = new File(Paths.document, old.name);
    if (oldFile.exists) oldFile.delete();
  }
}

export const draftStorage = {
  getItem(key: string): Promise<string | null> {
    return serialized(key, async () => {
      const stored = await SecureStore.getItemAsync(key, options);
      if (!stored) return null;
      const metadata = pointer(stored);
      const file = new File(Paths.document, metadata.name);
      if (!metadata.secret) {
        const plaintext = await file.text();
        await save(key, plaintext, stored);
        return plaintext;
      }
      const secret = await AESEncryptionKey.import(metadata.secret, 'hex');
      const plaintext = await aesDecryptAsync(AESSealedData.fromCombined(await file.bytes()), secret, {
        additionalData: encoder.encode(key),
      });
      return new TextDecoder().decode(plaintext);
    });
  },
  setItem(key: string, value: string): Promise<void> {
    return serialized(key, async () => save(key, value, await SecureStore.getItemAsync(key, options)));
  },
};
