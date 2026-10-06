import * as SecureStore from 'expo-secure-store';
import { REPORT_PREFERENCES_KEY } from './model';

export const reportPreferencesStorage = {
  read: () => SecureStore.getItemAsync(REPORT_PREFERENCES_KEY),
  write: (value: string) => SecureStore.setItemAsync(REPORT_PREFERENCES_KEY, value),
};
