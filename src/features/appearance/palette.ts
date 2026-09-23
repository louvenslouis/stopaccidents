export type ThemePreference = 'system' | 'light' | 'dark';
export type ColorScheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'stopaccidents.appearance';
export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'light';

export function parseThemePreference(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system' ? value : DEFAULT_THEME_PREFERENCE;
}

export function resolveColorScheme(preference: ThemePreference, system: string | null | undefined): ColorScheme {
  return preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;
}

// Semantic roles keep alerts distinct and text readable on every dark surface.
export const darkPalette = {
  background: '#10151D',
  surface: '#1A222D',
  elevated: '#242F3D',
  input: '#141C26',
  border: '#344152',
  text: '#F1F5F9',
  secondary: '#CBD5E1',
  muted: '#A3AFC2',
  accent: '#FF9585',
  accentSoft: '#3D292C',
  success: '#83D9B5',
  successSoft: '#20392F',
  info: '#8DC8FF',
  infoSoft: '#213449',
  warning: '#F0C17D',
  warningSoft: '#3A3024',
  violet: '#C7ABF2',
  violetSoft: '#332B45',
  overlay: 'rgba(3, 7, 13, 0.76)',
} as const;

export type DarkColorRole = keyof typeof darkPalette;
export type ThemeColorResolver = (light: string, dark: DarkColorRole) => string;
export const lightColor: ThemeColorResolver = (light) => light;
export const darkColor: ThemeColorResolver = (_light, role) => darkPalette[role];
