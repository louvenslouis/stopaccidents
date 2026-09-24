import { Text } from '@/features/language/native';
import { createThemedStyles } from '@/features/appearance/theme-provider';
import { Linking, StyleSheet } from 'react-native';

export function GeocodingCredit() {
  const styles = useStyles();

  return (
    <Text
      accessibilityRole="link"
      accessibilityLabel="Données géographiques © OpenStreetMap, voir la licence"
      onPress={(event) => {
        event.stopPropagation();
        void Linking.openURL('https://www.openstreetmap.org/copyright').catch(() => {});
      }}
      style={styles.credit}
    >
      © OpenStreetMap
    </Text>
  );
}

const useStyles = createThemedStyles((themeColor) => StyleSheet.create({
  credit: { color: themeColor('#777E89', 'muted'), fontSize: 11, marginTop: 6, textDecorationLine: 'underline' },
}));
