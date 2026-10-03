import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { readSavedRoutes, readRouteAlerts } from './api';
import { subscribeToRoutePush } from './push';
import type { SavedRoute, RouteAlert } from './model';

export function useSavedRoutes(userId: string) {
  const [routes, setRoutes] = useState<SavedRoute[]>([]);
  const [alerts, setAlerts] = useState<RouteAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const scope = useRef({ userId, active: false });
  const refresh = useCallback(async () => {
    if (!scope.current.active || scope.current.userId !== userId || AppState.currentState === 'background') return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const [routeResult, alertResult] = await Promise.allSettled([
      readSavedRoutes(userId, controller.signal), readRouteAlerts(userId, controller.signal),
    ]);
    if (controller.signal.aborted || !scope.current.active || scope.current.userId !== userId) return;
    if (routeResult.status === 'fulfilled') {
      setRoutes(routeResult.value); setError(null);
    } else setError('Impossible de charger vos trajets. Réessayez.');
    if (alertResult.status === 'fulfilled') {
      setAlerts(alertResult.value); setAlertsError(null);
    } else setAlertsError('Impossible de charger les alertes des trajets.');
    setLoading(false);
    request.current = null;
  }, [userId]);
  useFocusEffect(useCallback(() => {
    scope.current = { userId, active: true };
    setRoutes([]); setAlerts([]); setError(null); setAlertsError(null); setLoading(true);
    void refresh();
    const { data: auth } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session || session.user.is_anonymous || session.user.id !== userId) {
        scope.current.active = false;
        request.current?.abort();
        setRoutes([]); setAlerts([]); setError(null); setAlertsError(null); setLoading(false);
      }
    });
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
      else request.current?.abort();
    });
    const disposePush = subscribeToRoutePush(() => void refresh());
    const timer = setInterval(() => {
      if (AppState.currentState === 'active' && !request.current) void refresh();
    }, 30000);
    return () => {
      scope.current.active = false;
      request.current?.abort(); request.current = null;
      clearInterval(timer); subscription.remove(); disposePush(); auth.subscription.unsubscribe();
    };
  }, [refresh, userId]));
  return { routes, alerts, loading, error, alertsError, refresh, userId };
}
