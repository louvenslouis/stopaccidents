import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { readConnections, type ConnectionsSnapshot } from './api';

export function useConnections() {
  const [snapshot, setSnapshot] = useState<ConnectionsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const lock = useRef(false);
  const mounted = useRef(true);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
    };
  }, []);

  const refresh = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      const next = await readConnections(controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      setSnapshot(next);
      setError(null);
    } catch (cause) {
      if (!mounted.current || controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : 'Impossible de charger vos proches.');
    } finally {
      if (mounted.current && !controller.signal.aborted) setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void refresh();
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !lock.current) void refresh();
    });
    // Refresh invitations while this screen is visible, including on the web.
    const timer = setInterval(() => {
      if (AppState.currentState === 'active' && !lock.current) void refresh();
    }, 15000);
    return () => {
      clearInterval(timer);
      listener.remove();
      request.current?.abort();
    };
  }, [refresh]));

  async function perform(key: string, operation: () => Promise<void>, message: string) {
    if (lock.current || !mounted.current) return false;
    lock.current = true;
    setBusy(key);
    setFeedback(null);
    try {
      await operation();
      if (!mounted.current) return false;
      setFeedback(message);
      await refresh();
      return true;
    } catch (cause) {
      if (mounted.current) {
        setFeedback(cause instanceof Error ? cause.message : 'Impossible de modifier l’invitation.');
        // Reconcile invitations accepted/cancelled on another device.
        await refresh();
      }
      return false;
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(null);
    }
  }

  return { snapshot, loading, error, feedback, busy, refresh, perform };
}
