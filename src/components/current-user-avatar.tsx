import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { parseAvatar } from '@/features/profile/avatar';
import { UserAvatar } from './user-avatar';
import UserRound from 'lucide-react-native/icons/user-round';
import { AppIcon } from './ui/app-icon';
import { useThemeColor } from '@/features/appearance/theme-provider';

export function CurrentUserAvatar({ size = 38 }: { size?: number }) {
  const [user, setUser] = useState<User | null>(null);
  const color = useThemeColor();
  useEffect(() => {
    let active = true;
    let receivedEvent = false;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      receivedEvent = true;
      if (active) setUser(session?.user ?? null);
    });
    void supabase.auth.getSession().then(({ data: current }) => {
      if (active && !receivedEvent) setUser(current.session?.user ?? null);
    }).catch(() => { /* Keep the profile icon when a session cannot be read. */ });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  if (!user || user.is_anonymous) {
    return <AppIcon icon={UserRound} size={21} color={color('#49614D', 'secondary')} />;
  }
  return <UserAvatar avatar={parseAvatar(user.user_metadata?.avatar)} size={size} />;
}
