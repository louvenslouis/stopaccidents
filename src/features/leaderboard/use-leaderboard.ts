import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState } from 'react-native';
import { supabase } from '@/lib/supabase';
import type { LeaderboardPage, LeaderboardPeriod } from './model';

export function useLeaderboard(period: LeaderboardPeriod, commune: string | null, enabled: boolean) {
  const key = `${period}:${commune ?? 'country'}`;
  const [state, setState] = useState<{ key: string; data: LeaderboardPage | null; loading: boolean; error: boolean }>({
    key, data: null, loading: true, error: false,
  });
  const generation = useRef(0);
  const load = useCallback(async () => {
    if (!enabled) return;
    const request = ++generation.current;
    setState({ key, data: null, loading: true, error: false });
    try {
      const { data, error } = await supabase.rpc('read_leaderboard', {
        p_period: period, p_commune: commune, p_offset: 0,
      });
      if (error || !data) throw error ?? new Error('Missing leaderboard');
      if (request !== generation.current) return;
      const page = data as LeaderboardPage;
      setState({ key, loading: false, error: false, data: page });
    } catch {
      if (request === generation.current) setState((previous) => ({ ...previous, loading: false, error: true }));
    }
  }, [commune, enabled, key, period]);
  useFocusEffect(useCallback(() => {
    let active = true;
    void load();
    const listener = AppState.addEventListener('change', (next) => { if (next === 'active') void load(); });
    const { data } = supabase.auth.onAuthStateChange(() => {
      void Promise.resolve().then(() => { if (active) void load(); });
    });
    return () => { active = false; generation.current++; listener.remove(); data.subscription.unsubscribe(); };
  }, [load]));
  const current = state.key === key ? state : { data: null, loading: enabled, error: false };
  return {
    ...current,
    refresh: () => void load(),
  };
}
