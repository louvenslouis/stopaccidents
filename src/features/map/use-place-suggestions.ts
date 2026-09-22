import { useCallback, useEffect, useRef, useState } from 'react';

import { searchMapPlaces, type MapPlace } from './place-search';

type SearchResult = {
  query: string;
  status: 'loading' | 'ready' | 'error';
  places: MapPlace[];
};

export function usePlaceSuggestions(query: string, enabled: boolean) {
  const value = query.trim().slice(0, 120);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  const cache = useRef(new Map<string, MapPlace[]>());
  const canSearch = enabled && value.length >= 2;

  useEffect(() => {
    if (!canSearch) return;
    let active = true;
    const controller = new AbortController();
    const cached = cache.current.get(value);
    if (cached) {
      setResult({ query: value, status: 'ready', places: cached });
      return;
    }
    setResult({ query: value, status: 'loading', places: [] });
    const timer = setTimeout(() => {
      void searchMapPlaces(value, controller.signal).then(
        (places) => {
          if (!active) return;
          if (cache.current.size >= 30)
            cache.current.delete(cache.current.keys().next().value!);
          cache.current.set(value, places);
          setResult({ query: value, status: 'ready', places });
        },
        () => {
          if (active) setResult({ query: value, status: 'error', places: [] });
        },
      );
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [canSearch, value, attempt]);

  const current = canSearch && result?.query === value ? result : null;
  const status: SearchResult['status'] | 'idle' = canSearch
    ? (current?.status ?? 'loading')
    : 'idle';
  const retry = useCallback(() => setAttempt((previous) => previous + 1), []);
  return {
    places: current?.places ?? [],
    status,
    retry,
  };
}
