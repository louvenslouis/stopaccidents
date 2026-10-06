import { SafetyAlertsProvider } from '@/features/safety-profile/provider';
import { LanguageProvider } from '@/features/language/language-provider';
import { LiveLocationProvider } from '@/features/live-location/provider';
import { AppLocationProvider } from '@/features/location/app-location';
import { startSupabaseAuthLifecycle } from '@/lib/supabase';
import { useEffect } from 'react';
import { ThemeProvider, useThemeColor } from '@/features/appearance/theme-provider';
import { Stack } from 'expo-router';
import { ReportPreferencesProvider } from '@/features/report-preferences/provider';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

function RootNavigator() {
  const color = useThemeColor();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color('#F7F7F7', 'background') } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="profil" />
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => startSupabaseAuthLifecycle(), []);

  return (
    <LanguageProvider>
      <ThemeProvider>
        <AppLocationProvider>
          <LiveLocationProvider>
            <SafetyAlertsProvider>
              <ReportPreferencesProvider>
                <RootNavigator />
              </ReportPreferencesProvider>
            </SafetyAlertsProvider>
          </LiveLocationProvider>
        </AppLocationProvider>
      </ThemeProvider>
    </LanguageProvider>
  );
}
