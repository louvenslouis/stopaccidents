import { THEME_STORAGE_KEY, type ThemePreference } from './palette';

export const appearanceStorage = {
  async read() { return window.localStorage.getItem(THEME_STORAGE_KEY); },
  async write(value: ThemePreference) { window.localStorage.setItem(THEME_STORAGE_KEY, value); },
};
