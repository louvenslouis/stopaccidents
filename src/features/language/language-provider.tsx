import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { languageStorage } from './storage';
import { parseLanguage, translateText, type Language } from './translate';

const LanguageContext = createContext({
  language: 'fr' as Language, ready: false, storageError: false,
  setLanguage: (_language: Language) => {},
  t: (value: string) => value,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, updateLanguage] = useState<Language>('fr');
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const writes = useRef(Promise.resolve());
  useEffect(() => {
    let active = true;
    void languageStorage.read().then((stored) => {
      if (active) updateLanguage(parseLanguage(stored));
    }).catch(() => { if (active) setStorageError(true); })
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (Platform.OS === 'web') document.documentElement.lang = language;
  }, [language]);
  const setLanguage = useCallback((next: Language) => {
    if (!ready) return;
    updateLanguage(next);
    writes.current = writes.current.then(() => languageStorage.write(next))
      .then(() => setStorageError(false)).catch(() => setStorageError(true));
  }, [ready]);
  const t = useCallback((value: string) => translateText(value, language), [language]);
  const context = useMemo(() => ({ language, ready, storageError, setLanguage, t }), [language, ready, storageError, setLanguage, t]);
  return <LanguageContext value={context}>{children}</LanguageContext>;
}
export function useLanguage() { return useContext(LanguageContext); }
