import AppTabs from '@/components/app-tabs';
import { AppLocationProvider } from '@/features/location/app-location';
import { startSupabaseAuthLifecycle } from '@/lib/supabase';
import { useEffect } from 'react';

export default function RootLayout() {
  useEffect(() => startSupabaseAuthLifecycle(), []);

  return (
    <AppLocationProvider>
      <AppTabs />
    </AppLocationProvider>
  );
}
