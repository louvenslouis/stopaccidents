import { StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import { AppScreen } from '@/components/app-screen';
import { AppearanceCard } from '@/components/appearance-card';
import { LanguageCard } from '@/components/language-card';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AppIcon } from '@/components/ui/app-icon';
import { View } from '@/features/language/native';

export default function SettingsScreen() {
  const router = useRouter();
  return (
    <AppScreen
      title="Paramètres"
      headerRight={
        <AnimatedPressable
          accessibilityLabel="Retour"
          accessibilityRole="button"
          onPress={() => router.canGoBack() ? router.back() : router.replace('/')}
          style={styles.backButton}>
          <AppIcon icon={ChevronLeft} size={22} />
        </AnimatedPressable>
      }>
      <View style={styles.content}>
        <LanguageCard />
        <AppearanceCard />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  backButton: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  content: { width: '100%', maxWidth: 520, alignSelf: 'center', marginTop: 30, gap: 26 },
});
