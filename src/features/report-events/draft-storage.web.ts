type EncryptedDraft = { version: 1; secret: CryptoKey; iv: Uint8Array<ArrayBuffer>; ciphertext: ArrayBuffer };
const encoder = new TextEncoder();

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("stopaccidents-drafts", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function encrypt(key: string, value: string): Promise<EncryptedDraft> {
  // No extractable key or plaintext fallback in localStorage.
  const secret = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(key), tagLength: 128 }, secret, encoder.encode(value));
  return { version: 1, secret, iv, ciphertext };
}

async function read(key: string): Promise<string | EncryptedDraft | null> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', 'readonly');
    const request = tx.objectStore('drafts').get(key);
    tx.oncomplete = () => { db.close(); resolve(request.result ?? null); };
    tx.onabort = tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function write(key: string, value: EncryptedDraft, legacy?: string): Promise<boolean> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', 'readwrite');
    const store = tx.objectStore('drafts');
    let committed = false;
    if (legacy === undefined) {
      store.put(value, key);
      committed = true;
    } else {
      const current = store.get(key);
      current.onsuccess = () => {
        // Another tab may have saved a newer draft during encryption.
        if (current.result === legacy) { store.put(value, key); committed = true; }
      };
    }
    tx.oncomplete = () => { db.close(); resolve(committed); };
    tx.onabort = tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export const draftStorage = {
  async getItem(key: string): Promise<string | null> {
    const stored = await read(key);
    if (stored === null) return null;
    if (typeof stored === 'string') {
      if (await write(key, await encrypt(key, stored), stored)) return stored;
      return draftStorage.getItem(key);
    }
    if (stored.version !== 1) throw new Error('Invalid encrypted draft version');
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: stored.iv, additionalData: encoder.encode(key), tagLength: 128 }, stored.secret, stored.ciphertext);
    return new TextDecoder().decode(plaintext);
  },
  async setItem(key: string, value: string): Promise<void> {
    await write(key, await encrypt(key, value));
  },
};
