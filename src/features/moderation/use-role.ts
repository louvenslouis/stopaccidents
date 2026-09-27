import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { supabase } from '@/lib/supabase';

export type AppRole = 'user' | 'moderator' | 'admin';
export const roleLabels: Record<AppRole, string> = { user: 'Utilisateur', moderator: 'Modérateur', admin: 'Administrateur' };
export function useRole() {
  const [role, setRole] = useState<AppRole>('user');
  useEffect(() => {
    let active = true;
    let generation = 0;
    async function refresh() {
      const version = ++generation;
      const { data, error } = await supabase.rpc('read_my_role');
      if (active && version === generation) setRole(!error && (data === 'admin' || data === 'moderator') ? data : 'user');
    }
    void refresh();
    const { data } = supabase.auth.onAuthStateChange(() => {
      generation++;
      setRole('user');
      void Promise.resolve().then(refresh);
    });
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => { active = false; data.subscription.unsubscribe(); subscription.remove(); };
  }, []);
  return { role, canModerate: role === 'moderator' || role === 'admin', isAdmin: role === 'admin' };
}
