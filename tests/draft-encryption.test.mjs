import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { webcrypto, randomUUID } from 'node:crypto';
import ts from 'typescript';

async function load(path, dependencies = {}, globals = {}) {
  const source = await readFile(path, 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const exports = {};
  new Function('exports', 'require', ...Object.keys(globals), outputText)(exports, name => {
    assert.ok(name in dependencies, name); return dependencies[name];
  }, ...Object.values(globals));
  return exports.draftStorage;
}

async function nativeStorage() {
  const pointers = new Map(), files = new Map();
  let fail = false;
  class File {
    constructor(_root, name) { this.name = name; }
    get exists() { return files.has(this.name); }
    write(value) { files.set(this.name, value); }
    async bytes() { assert.ok(this.exists); return files.get(this.name); }
    async text() { assert.ok(this.exists); return files.get(this.name); }
    delete() { files.delete(this.name); }
  }
  const keyWrapper = raw => ({ raw, encoded: async () => Buffer.from(await webcrypto.subtle.exportKey('raw', raw)).toString('hex') });
  const storage = await load('src/features/report-events/draft-storage.ts', {
    'expo-file-system': { File, Paths: { document: 'documents' } },
    'expo-secure-store': {
      WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'unlocked',
      getItemAsync: async key => pointers.get(key) ?? null,
      setItemAsync: async (key, value) => { if (fail) throw Error('disk full'); pointers.set(key, value); },
    },
    'expo-crypto': {
      randomUUID, AESKeySize: { AES256: 256 },
      AESEncryptionKey: {
        generate: async size => keyWrapper(await webcrypto.subtle.generateKey({ name: 'AES-GCM', length: size }, true, ['encrypt', 'decrypt'])),
        import: async hex => keyWrapper(await webcrypto.subtle.importKey('raw', Buffer.from(hex, 'hex'), 'AES-GCM', true, ['encrypt', 'decrypt'])),
      },
      AESSealedData: { fromCombined: bytes => bytes },
      aesEncryptAsync: async (plaintext, key, options) => {
        const iv = webcrypto.getRandomValues(new Uint8Array(12));
        const ciphertext = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: options.additionalData }, key.raw, plaintext);
        return { combined: async () => Buffer.concat([iv, Buffer.from(ciphertext)]) };
      },
      aesDecryptAsync: async (bytes, key, options) => new Uint8Array(await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12), additionalData: options.additionalData }, key.raw, bytes.subarray(12))),
    },
  });
  return { storage, pointers, files, fail: () => { fail = true; } };
}

const value = JSON.stringify({ name: 'Élodie 🔒', location: [18.5, -72.3], photo: 'sensitive-photo'.repeat(10000) });

test('native encrypts large Unicode drafts, varies ciphertext and authenticates owner and bytes', async () => {
  const { storage, pointers, files } = await nativeStorage();
  await storage.setItem('alice', value);
  const first = [...files.values()][0];
  assert.equal(Buffer.from(first).includes(Buffer.from('sensitive-photo')), false);
  assert.equal(await storage.getItem('alice'), value);
  await storage.setItem('alice', value);
  assert.notDeepEqual([...files.values()][0], first);
  assert.equal(files.size, 1);
  pointers.set('bob', pointers.get('alice'));
  await assert.rejects(storage.getItem('bob'));
  [...files.values()][0][20] ^= 1;
  await assert.rejects(storage.getItem('alice'));
});

test('native migrates plaintext and preserves previous draft when committing fails', async () => {
  const { storage, pointers, files, fail } = await nativeStorage();
  const name = `report-draft-${randomUUID()}.json`;
  pointers.set('alice', name); files.set(name, value);
  assert.equal(await storage.getItem('alice'), value);
  assert.equal(files.has(name), false);
  const previous = pointers.get('alice');
  fail();
  await assert.rejects(storage.setItem('alice', 'replacement'), /disk full/);
  assert.equal(pointers.get('alice'), previous);
  assert.equal(files.size, 1);
  assert.equal(await storage.getItem('alice'), value);
});

test('native serializes migration with writes and fails closed on invalid metadata', async () => {
  const { storage, pointers, files } = await nativeStorage();
  const name = `report-draft-${randomUUID()}.json`;
  pointers.set('alice', name); files.set(name, 'old');
  await Promise.all([storage.getItem('alice'), storage.setItem('alice', 'new')]);
  assert.equal(await storage.getItem('alice'), 'new');
  pointers.set('alice', '../private.json');
  await assert.rejects(storage.getItem('alice'));
});

// Minimal asynchronous IDB harness; encryption uses actual Web Crypto.
function indexedDatabase(records) {
  return { open() {
    const request = {};
    queueMicrotask(() => {
      request.result = { close() {}, transaction() {
        const tx = { objectStore: () => ({
          get(key) {
            const result = {};
            queueMicrotask(() => { result.result = records.get(key); result.onsuccess?.(); });
            return result;
          },
          put(value, key) { records.set(key, structuredClone(value)); },
        }) };
        setTimeout(() => tx.oncomplete?.(), 0);
        return tx;
      } };
      request.onsuccess();
    });
    return request;
  } };
}

test('web migrates drafts with nonextractable keys and rejects tampering or another owner', async () => {
  const records = new Map([['alice', value]]);
  const storage = await load('src/features/report-events/draft-storage.web.ts', {}, { indexedDB: indexedDatabase(records), crypto: webcrypto });
  assert.equal(await storage.getItem('alice'), value);
  const first = records.get('alice');
  assert.equal(first.secret.extractable, false);
  assert.equal(first.secret.algorithm.length, 256);
  await assert.rejects(webcrypto.subtle.exportKey('raw', first.secret));
  assert.equal(Buffer.from(first.ciphertext).includes(Buffer.from('sensitive-photo')), false);
  assert.equal(await storage.getItem('alice'), value);
  await storage.setItem('alice', value);
  assert.notDeepEqual(records.get('alice').iv, first.iv);
  records.set('bob', records.get('alice'));
  await assert.rejects(storage.getItem('bob'));
  new Uint8Array(records.get('alice').ciphertext)[10] ^= 1;
  await assert.rejects(storage.getItem('alice'));
  assert.equal(await storage.getItem('missing'), null);
});

test('failed native migration leaves the original draft recoverable', async () => {
  const { storage, pointers, files, fail } = await nativeStorage();
  const name = `report-draft-${randomUUID()}.json`;
  pointers.set('alice', name); files.set(name, value); fail();
  await assert.rejects(storage.getItem('alice'), /disk full/);
  assert.equal(pointers.get('alice'), name);
  assert.equal(files.get(name), value);
  assert.equal(files.size, 1);
});

test('web migration does not overwrite a newer save from another tab', async () => {
  const records = new Map([['alice', 'legacy']]);
  const indexedDB = indexedDatabase(records);
  const writer = await load('src/features/report-events/draft-storage.web.ts', {}, { indexedDB, crypto: webcrypto });
  let changed = false;
  const crypto = {
    getRandomValues: bytes => webcrypto.getRandomValues(bytes),
    subtle: {
      generateKey: (...args) => webcrypto.subtle.generateKey(...args),
      decrypt: (...args) => webcrypto.subtle.decrypt(...args),
      encrypt: async (...args) => {
        if (!changed) { changed = true; await writer.setItem('alice', 'newer'); }
        return webcrypto.subtle.encrypt(...args);
      },
    },
  };
  const reader = await load('src/features/report-events/draft-storage.web.ts', {}, { indexedDB, crypto });
  assert.equal(await reader.getItem('alice'), 'newer');
  assert.equal(await writer.getItem('alice'), 'newer');
});
