import AppTabs from '@/components/app-tabs';
import { startSupabaseAuthLifecycle } from '@/lib/supabase';
import { useEffect } from 'react';

export default function RootLayout() {
  useEffect(() => startSupabaseAuthLifecycle(), []);

  return <AppTabs />;
}
