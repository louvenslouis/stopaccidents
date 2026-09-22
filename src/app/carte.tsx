import { AppScreen } from '@/components/app-screen';
import { OpenStreetMap } from '@/components/open-street-map';
import { AccidentDetailSheet } from '@/components/accident-detail-sheet';
import { readMapAccidents } from '@/features/accident-report/read';
import { useAccident } from '@/features/accident-report/use-accident';
import { accidentMarkers } from '@/features/accident-report/map-markers';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function MapScreen() {
  const [selectedAccident, setSelectedAccident] = useState<string | null>(null);
  const accidents = useAccident(readMapAccidents, !selectedAccident, 30000);
  const markers = useMemo(
    () => accidentMarkers(accidents.data?.reports ?? []),
    [accidents.data],
  );
  return (
    <>
      <AppScreen
        eyebrow="PRÈS DE VOUS"
        title="Carte"
        description="Consultez les accidents signalés en Haïti. Touchez un marqueur pour voir les détails."
      >
        <View style={styles.toolbar}>
          <Text accessibilityLiveRegion="polite" style={styles.count}>
            {accidents.data
              ? `${markers.length} accident${markers.length > 1 ? 's' : ''} sur la carte`
              : accidents.loading
                ? 'Chargement des accidents…'
                : 'Accidents indisponibles'}
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={accidents.loading}
            onPress={accidents.refresh}
            style={styles.refresh}
          >
            <Text style={styles.refreshLabel}>
              {accidents.loading ? 'Actualisation…' : 'Actualiser'}
            </Text>
          </Pressable>
        </View>
        {accidents.error && (
          <Text accessibilityRole="alert" style={styles.error}>
            {accidents.error}
            {accidents.data ? ' Les derniers résultats restent affichés.' : ''}
          </Text>
        )}
        {accidents.data && !markers.length && !accidents.error && (
          <Text style={styles.note}>
            Aucun accident géolocalisé dans cette zone pour le moment.
          </Text>
        )}
        {accidents.data?.truncated && (
          <Text style={styles.note}>
            Les 500 accidents les plus récents sont affichés.
          </Text>
        )}
        <OpenStreetMap markers={markers} onSelect={setSelectedAccident} />
        <Text style={styles.note}>
          La couleur indique la gravité. Touchez un chiffre pour choisir parmi
          les accidents proches.
        </Text>
      </AppScreen>
      {selectedAccident && (
        <AccidentDetailSheet
          key={selectedAccident}
          id={selectedAccident}
          onClose={() => setSelectedAccident(null)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  count: { flex: 1, color: '#171719', fontSize: 14, fontWeight: '600' },
  refresh: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  refreshLabel: { color: '#1767A6', fontSize: 14, fontWeight: '600' },
  note: { color: '#626269', fontSize: 13, lineHeight: 20, marginTop: 8 },
  error: { color: '#B94025', fontSize: 14, lineHeight: 21 },
});
