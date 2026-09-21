import { AppScreen } from '@/components/app-screen';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet } from 'react-native';

export default function HomeScreen() {
  return (
    <AppScreen
      eyebrow="STOP ACCIDENTS"
      title="Accueil"
      description="Votre espace de prévention et de sécurité routière."
      headerRight={
        <Pressable
          accessibilityLabel="Notifications"
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => [styles.notificationButton, pressed && styles.buttonPressed]}>
          <SymbolView
            name={{ ios: 'bell', android: 'notifications', web: 'notifications' }}
            size={23}
            tintColor="#9F9F9F"
          />
        </Pressable>
      }
    />
  );
}

const styles = StyleSheet.create({
  notificationButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: '#9F9F9F',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    opacity: 0.65,
  },
});
