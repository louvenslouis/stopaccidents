import * as SecureStore from 'expo-secure-store';
import { LANGUAGE_STORAGE_KEY, type Language } from './translate';
export const languageStorage = {
  read: () => SecureStore.getItemAsync(LANGUAGE_STORAGE_KEY),
  write: (value: Language) => SecureStore.setItemAsync(LANGUAGE_STORAGE_KEY, value),
};
