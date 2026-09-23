import '@/global.css';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import * as SystemUI from 'expo-system-ui';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { appearanceStorage } from './storage';
import {
  DEFAULT_THEME_PREFERENCE, darkColor, lightColor, parseThemePreference, resolveColorScheme,
  type ColorScheme, type ThemeColorResolver, type ThemePreference,
} from './palette';

type Appearance = {
  preference: ThemePreference;
  scheme: ColorScheme;
  ready: boolean;
  storageError: boolean;
  setPreference: (preference: ThemePreference) => void;
  color: ThemeColorResolver;
};

const ThemeContext = createContext<Appearance | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setStoredPreference] = useState<ThemePreference>(DEFAULT_THEME_PREFERENCE);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const writes = useRef(Promise.resolve());
  const scheme = resolveColorScheme(preference, systemScheme);
  const color = scheme === 'dark' ? darkColor : lightColor;

  useEffect(() => {
    let active = true;
    void appearanceStorage.read().then((value) => {
      if (active) setStoredPreference(parseThemePreference(value));
    }).catch(() => {
      // A blocked storage must never prevent the application from opening.
      if (active) setStorageError(true);
    }).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  const background = color('#F7F7F7', 'background');
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(background).catch(() => {});
    if (Platform.OS === 'web') {
      document.documentElement.style.colorScheme = scheme;
      document.documentElement.dataset.theme = scheme;
    }
  }, [background, scheme]);

  function setPreference(next: ThemePreference) {
    if (!ready) return;
    setStoredPreference(next);
    // Serialize rapid selections so the last choice is also the one restored.
    writes.current = writes.current.then(() => appearanceStorage.write(next))
      .then(() => setStorageError(false)).catch(() => setStorageError(true));
  }

  return (
    <ThemeContext value={{ preference, scheme, ready, storageError, setPreference, color }}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {children}
    </ThemeContext>
  );
}

export function useAppTheme() {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useAppTheme must be used within ThemeProvider');
  return theme;
}

export function useThemeColor() { return useAppTheme().color; }

/** Build both style sheets once; all consumers subscribe to the same preference. */
export function createThemedStyles<T>(factory: (color: ThemeColorResolver) => T) {
  const light = factory(lightColor);
  const dark = factory(darkColor);
  return function useStyles(): T {
    return useAppTheme().scheme === 'dark' ? dark : light;
  };
}
