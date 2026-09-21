import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';

/** Refresh on focus/foreground; cancel stale reads when the selection changes. */
export function useAccident<T>(
  loader: (signal: AbortSignal) => Promise<T | null>,
  enabled = true,
  refreshInterval = 0,
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useRef<() => void>(() => {});

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      let controller: AbortController | undefined;
      let active = true;
      async function load() {
        controller?.abort();
        const request = new AbortController();
        controller = request;
        const timeout = setTimeout(() => {
          request.abort();
          if (active && controller === request) {
            setError('La connexion prend trop de temps. Réessayez.');
            setLoading(false);
          }
        }, 20000);
        setLoading(true);
        try {
          const result = await loader(request.signal);
          if (active && !request.signal.aborted) {
            setData(result);
            setError(null);
          }
        } catch (cause) {
          if (active && !request.signal.aborted) {
            setError(
              cause instanceof Error
                ? cause.message
                : 'Chargement impossible. Réessayez.',
            );
          }
        } finally {
          clearTimeout(timeout);
          if (active && !request.signal.aborted) setLoading(false);
        }
      }
      reload.current = () => {
        void load();
      };
      void load();
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') void load();
      });
      const interval = refreshInterval
        ? setInterval(() => {
            if (AppState.currentState === 'active') void load();
          }, refreshInterval)
        : undefined;
      return () => {
        active = false;
        controller?.abort();
        subscription.remove();
        clearInterval(interval);
        reload.current = () => {};
      };
    }, [enabled, loader, refreshInterval]),
  );

  return {
    data,
    loading,
    error,
    refresh: useCallback(() => reload.current(), []),
  };
}
