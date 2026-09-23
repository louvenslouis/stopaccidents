import AppTabs from '@/components/app-tabs';
import { AppLocationProvider } from '@/features/location/app-location';
import { startSupabaseAuthLifecycle } from '@/lib/supabase';
import { useEffect } from 'react';
import { ThemeProvider } from '@/features/appearance/theme-provider';

export default function RootLayout() {
  useEffect(() => startSupabaseAuthLifecycle(), []);

  return (
    <ThemeProvider>
      <AppLocationProvider>
        <AppTabs />
      </AppLocationProvider>
    </ThemeProvider>
  );
}
