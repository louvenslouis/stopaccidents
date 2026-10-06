import { StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import { AppScreen } from '@/components/app-screen';
import SavedPlacesCard from '@/components/saved-places-card';
import Route from 'lucide-react-native/icons/route';
import { createThemedStyles, useThemeColor } from '@/features/appearance/theme-provider';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AppIcon } from '@/components/ui/app-icon';
import { Text, View } from '@/features/language/native';

export default function PlacesAndRoutesScreen() {
  const router = useRouter();
  const styles = useStyles();
  const color = useThemeColor();
  return (
    <AppScreen
      title="Lieux et trajets"
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
        <AnimatedPressable accessibilityRole="button" accessibilityLabel="Mes trajets"
          onPress={() => router.push('/trajets')} style={styles.routeButton}>
          <AppIcon icon={Route} size={24} color={color('#267E70', 'success')} />
          <Text style={styles.routeLabel}>Mes trajets</Text>
        </AnimatedPressable>
        <SavedPlacesCard />
      </View>
    </AppScreen>
  );
}

const useStyles = createThemedStyles((color) => StyleSheet.create({
  routeButton: { padding: 22, borderRadius: 22, backgroundColor: color('#FFFFFF', 'surface'), borderWidth: 1, borderColor: color('#E7E8EB', 'border'), flexDirection: 'row', alignItems: 'center', gap: 13 },
  routeLabel: { fontSize: 19, fontWeight: '700', color: color('#243147', 'text') },
  backButton: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  content: { width: '100%', maxWidth: 520, alignSelf: 'center', marginTop: 30, gap: 26 },
}));
