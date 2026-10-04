import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { supabase } from '@/lib/supabase';
import { ensureReporter } from './api';
import type { SafetyReportSummary } from '@/features/safety-report/read';

type Confirmation = { event_id: string; count: number; confirmed: boolean; can_confirm: boolean };
const listeners = new Set<(eventId: string) => void>();

export function useReportConfirmation(report: SafetyReportSummary) {
  const [value, setValue] = useState<Confirmation | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const generation = useRef(0);
  const kind = report.report_kind;
  const id = report.id;
  const eventId = report.event_id;

  useEffect(() => {
    let disposed = false;
    async function refresh() {
      if (busy.current) return;
      const request = ++generation.current;
      const { data, error: failure } = await supabase.rpc('read_report_confirmation', { p_kind: kind, p_report_id: id });
      if (!disposed && request === generation.current) setValue(failure ? null : data as Confirmation);
    }
    void refresh();
    const changed = (changedEvent: string) => { if (!eventId || eventId === changedEvent) void refresh(); };
    listeners.add(changed);
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      // Defer RPCs until the auth client's session lock is released.
      setTimeout(() => { if (!disposed) void refresh(); }, 0);
    });
    const foreground = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => { disposed = true; listeners.delete(changed); subscription.unsubscribe(); foreground.remove(); };
  }, [kind, id, eventId, report]);

  async function toggle() {
    if (busy.current) return;
    busy.current = true;
    const request = ++generation.current;
    setPending(true); setError(null);
    try {
      await ensureReporter();
      // Read after authentication: an existing confirmation may belong to this session.
      const current = await supabase.rpc('read_report_confirmation', { p_kind: kind, p_report_id: id });
      if (current.error || !current.data) throw current.error ?? new Error('Unavailable');
      const previous = current.data as Confirmation;
      const desired = value ? !value.confirmed : !previous.confirmed;
      if (!previous.confirmed && !previous.can_confirm) { setValue(previous); return; }
      const result = await supabase.rpc('set_report_confirmation', {
        p_kind: kind, p_report_id: id, p_confirmed: desired,
      });
      if (result.error || !result.data) throw result.error ?? new Error('Unavailable');
      if (request === generation.current) setValue(result.data as Confirmation);
      listeners.forEach(listener => listener((result.data as Confirmation).event_id));
    } catch {
      if (request === generation.current) setError('Confirmation impossible. Réessayez.');
    } finally {
      busy.current = false;
      if (request === generation.current) setPending(false);
    }
  }
  return { value, pending, error, toggle };
}
