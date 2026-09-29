import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/features/language/language-provider';
import { EMPTY_SHARES, publishLocation, readLocationShares, startLocationShare, stopLocationShare, type ShareSession, type ShareSnapshot } from './api';
import { savedShare, saveShare, startBackground, stopBackground } from './background';

type Sharing = {
  snapshot: ShareSnapshot; busy: boolean; error: string | null; foregroundOnly: boolean;
  start: (ids: string[], minutes: number) => Promise<void>; stop: () => Promise<void>;
};
const Context = createContext<Sharing>({ snapshot: EMPTY_SHARES, busy: false, error: null, foregroundOnly: false, start: async () => {}, stop: async () => {} });
export const useLiveLocation = () => useContext(Context);

export function LiveLocationProvider({ children }: PropsWithChildren) {
  const [owner, setOwner] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let active = true, changed = false;
    const subscription = supabase.auth.onAuthStateChange((_event, session) => {
      changed = true;
      if (active) setOwner(session && !session.user.is_anonymous ? session.user.id : null);
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (active && !changed) setOwner(data.session && !data.session.user.is_anonymous ? data.session.user.id : null);
    }).catch(() => {});
    return () => { active = false; subscription.data.subscription.unsubscribe(); };
  }, []);
  if (owner === undefined) return children;
  return <AccountSharing key={owner ?? 'guest'} owner={owner}>{children}</AccountSharing>;
}

function AccountSharing({ owner, children }: PropsWithChildren<{ owner: string | null }>) {
  const { t } = useLanguage();
  const [snapshot, setSnapshot] = useState<ShareSnapshot>(EMPTY_SHARES);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [foregroundOnly, setForegroundOnly] = useState(false);
  const [local, setLocal] = useState<ShareSession | null>(null);
  const session = useRef<ShareSession | null>(null);
  const mounted = useRef(true);
  const lock = useRef(false);
  const readGeneration = useRef(0);
  const reading = useRef(false);

  const clearLocal = useCallback(async () => {
    session.current = null;
    if (mounted.current) setLocal(null);
    await saveShare(null);
    await stopBackground();
  }, []);

  const refresh = useCallback(async () => {
    if (!owner || reading.current) return;
    reading.current = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const generation = ++readGeneration.current;
    try {
      const next = await readLocationShares(controller.signal);
      if (!mounted.current || generation !== readGeneration.current) return;
      setSnapshot(next);
      setError(current => current === 'Impossible de charger les positions.' ? null : current);
      if (!next.outgoing && session.current && !lock.current) await clearLocal();
    } catch {
      // A failed read must not keep a revoked/stale location on the map.
      if (mounted.current && generation === readGeneration.current) {
        setSnapshot(current => ({ ...current, incoming: [] }));
        setError('Impossible de charger les positions.');
      }
    } finally { reading.current = false; clearTimeout(timeout); }
  }, [owner, clearLocal]);

  useEffect(() => {
    mounted.current = true;
    let disposed = false;
    void savedShare().then(async stored => {
      if (disposed || lock.current) return;
      if (stored && owner && stored.owner === owner && Date.parse(stored.expires_at) > Date.now()) {
        session.current = stored;
        setLocal(stored);
        setForegroundOnly(!stored.background);
      } else if (stored) {
        await clearLocal();
      }
    }).catch(() => { if (!disposed) setError('Impossible de reprendre le partage.'); });
    void Promise.resolve().then(refresh);
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void refresh();
      const current = session.current;
      if (current && Date.parse(current.expires_at) <= Date.now()) {
        void clearLocal().catch(() => {});
        setSnapshot(value => ({ ...value, outgoing: null }));
      }
    }, 3000);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => {
      disposed = true;
      mounted.current = false;
      session.current = null;
      clearInterval(timer);
      listener.remove();
    };
  }, [owner, refresh, clearLocal]);

  useEffect(() => {
    if (!local) return;
    let cancelled = false, sending = false, lastSent = 0;
    let subscription: Location.LocationSubscription | undefined;
    void Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 0 }, async fix => {
      if (cancelled || sending || session.current?.token !== local.token || Date.now() - lastSent < 4000) return;
      sending = true;
      lastSent = Date.now();
      try {
        const active = await publishLocation(local, fix);
        if (cancelled || session.current?.token !== local.token) return;
        if (!active) { await clearLocal(); void refresh(); }
        else setError(null);
      } catch { if (!cancelled) setError('Envoi de la position interrompu.'); }
      finally { sending = false; }
    }, () => { if (!cancelled) setError('Localisation indisponible.'); }).then(watch => {
      if (cancelled) watch.remove(); else subscription = watch;
    }).catch(() => { if (!cancelled) setError('Localisation indisponible.'); });
    return () => { cancelled = true; subscription?.remove(); };
  }, [local, clearLocal, refresh]);

  async function start(ids: string[], minutes: number) {
    if (!owner || lock.current) return;
    lock.current = true;
    setBusy(true); setError(null);
    let created: ShareSession | null = null;
    try {
      if (!(await Location.requestForegroundPermissionsAsync()).granted) throw new Error('Autorisez la localisation pour partager votre position.');
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const fix = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Localisation indisponible.')), 20000); }),
      ]).finally(() => clearTimeout(timeout));
      if (!mounted.current) return;
      created = await startLocationShare(ids, minutes, owner);
      if (!mounted.current) { await stopLocationShare(created.token); return; }
      ++readGeneration.current;
      session.current = created;
      await saveShare(created);
      if (!await publishLocation(created, fix)) throw new Error('Impossible de démarrer le partage.');
      const background = await startBackground(t('Partage de localisation actif')).catch(() => false);
      if (!mounted.current) { await stopLocationShare(created.token); await clearLocal(); return; }
      created = { ...created, background };
      session.current = created;
      await saveShare(created);
      setForegroundOnly(!background);
      setLocal(created);
      await refresh();
    } catch (cause) {
      if (created) {
        // Roll back the grant if the initial fix or tracker could not be started.
        await stopLocationShare(created.token).catch(() => {});
        await clearLocal().catch(() => {});
      }
      if (mounted.current) setError(cause instanceof Error ? cause.message : 'Impossible de démarrer le partage.');
    } finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  async function stop() {
    if (!owner || lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      await clearLocal().catch(() => {});
      ++readGeneration.current;
      await stopLocationShare();
      if (mounted.current) setSnapshot(value => ({ ...value, outgoing: null }));
      await refresh();
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : 'Arrêt non confirmé. Réessayez.');
    } finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  return <Context value={{ snapshot, busy, error, foregroundOnly, start, stop }}>{children}</Context>;
}
