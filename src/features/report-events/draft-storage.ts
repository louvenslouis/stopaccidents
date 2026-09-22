import { File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { randomUUID } from 'expo-crypto';

// A small atomic pointer is committed only after the full draft (including photos) is on disk.
export const draftStorage = {
  async getItem(key: string): Promise<string | null> {
    const name = await SecureStore.getItemAsync(key);
    if (!name) return null;
    return new File(Paths.document, name).text();
  },
  async setItem(key: string, value: string) {
    const previous = await SecureStore.getItemAsync(key);
    const name = `report-draft-${randomUUID()}.json`;
    const file = new File(Paths.document, name);
    file.write(value);
    await SecureStore.setItemAsync(key, name, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
    if (previous) {
      try { const old = new File(Paths.document, previous); if (old.exists) old.delete(); } catch { /* The committed draft remains valid. */ }
    }
  },
};
