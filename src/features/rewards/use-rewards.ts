import { supabase } from '@/lib/supabase';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

export type RewardSummary = { total: number; count: number; earned: number };

export function useRewards(reportId?: string, reportKind?: string) {
  const [summary, setSummary] = useState<RewardSummary | null>(null);
  const [error, setError] = useState(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    await Promise.resolve();
    setError(false);
    try {
      const { data: auth, error: authError } = await supabase.auth.getSession();
      if (authError) throw authError;
      if (!auth.session) {
        if (request === generation.current)
          setSummary({ total: 0, count: 0, earned: 0 });
        return;
      }
      const { data, error: readError } = await supabase.rpc('read_my_rewards', {
        p_report_id: reportId ?? null,
        p_report_kind: reportKind ?? null,
      });
      if (readError || !data) throw readError ?? new Error('Missing rewards');
      if (request === generation.current) setSummary(data as RewardSummary);
    } catch {
      if (request === generation.current) setError(true);
    }
  }, [reportId, reportKind]);
  useEffect(() => {
    const requests = generation;
    void Promise.resolve().then(refresh);
    const { data } = supabase.auth.onAuthStateChange(() => {
      generation.current++;
      setSummary(null);
      // Defer Supabase calls outside its auth event callback.
      void Promise.resolve().then(refresh);
    });
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => {
      requests.current++;
      data.subscription.unsubscribe();
      listener.remove();
    };
  }, [refresh]);
  return { summary, error, refresh };
}
