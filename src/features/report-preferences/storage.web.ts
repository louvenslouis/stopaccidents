import { REPORT_PREFERENCES_KEY } from './model';

export const reportPreferencesStorage = {
  async read() { return window.localStorage.getItem(REPORT_PREFERENCES_KEY); },
  async write(value: string) { window.localStorage.setItem(REPORT_PREFERENCES_KEY, value); },
};
