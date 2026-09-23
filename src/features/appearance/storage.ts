import * as SecureStore from 'expo-secure-store';
import { THEME_STORAGE_KEY, type ThemePreference } from './palette';

export const appearanceStorage = {
  read: () => SecureStore.getItemAsync(THEME_STORAGE_KEY),
  write: (value: ThemePreference) => SecureStore.setItemAsync(THEME_STORAGE_KEY, value),
};
