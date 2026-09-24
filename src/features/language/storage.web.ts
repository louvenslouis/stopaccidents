import { LANGUAGE_STORAGE_KEY, type Language } from './translate';
export const languageStorage = {
  async read() { return window.localStorage.getItem(LANGUAGE_STORAGE_KEY); },
  async write(value: Language) { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, value); },
};
