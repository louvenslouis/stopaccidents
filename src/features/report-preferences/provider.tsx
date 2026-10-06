import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { defaultVisibility, parseVisibility, type ReportType, type ReportVisibility } from './model';
import { reportPreferencesStorage } from './storage';

type Preferences = {
  visibility: ReportVisibility;
  ready: boolean;
  storageError: boolean;
  setVisible: (kind: ReportType, enabled: boolean) => void;
};
const Context = createContext<Preferences | null>(null);

export function ReportPreferencesProvider({ children }: { children: ReactNode }) {
  const [visibility, setVisibility] = useState(defaultVisibility);
  const current = useRef(defaultVisibility);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const writes = useRef(Promise.resolve());

  useEffect(() => {
    let active = true;
    void reportPreferencesStorage.read().then((value) => {
      if (!active) return;
      current.current = parseVisibility(value);
      setVisibility(current.current);
    }).catch(() => { if (active) setStorageError(true); })
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  function setVisible(kind: ReportType, enabled: boolean) {
    if (!ready) return;
    const next = { ...current.current, [kind]: enabled };
    current.current = next;
    setVisibility(next);
    writes.current = writes.current.then(() => reportPreferencesStorage.write(JSON.stringify(next)))
      .then(() => setStorageError(false)).catch(() => setStorageError(true));
  }

  return <Context value={{ visibility, ready, storageError, setVisible }}>{children}</Context>;
}

export function useReportPreferences() {
  const context = useContext(Context);
  if (!context) throw new Error('ReportPreferencesProvider is required');
  return context;
}
