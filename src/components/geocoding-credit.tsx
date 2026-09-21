import { Linking, StyleSheet, Text } from 'react-native';

export function GeocodingCredit() {
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

const styles = StyleSheet.create({
  credit: { color: '#777E89', fontSize: 11, marginTop: 6, textDecorationLine: 'underline' },
});
