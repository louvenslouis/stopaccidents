import { useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Platform, StyleSheet } from 'react-native';
import Check from 'lucide-react-native/icons/check';
import X from 'lucide-react-native/icons/x';
import Search from 'lucide-react-native/icons/search';
import { Text, TextInput, View, Pressable } from '@/features/language/native';
import { communes, matchesTerritorySearch } from '@/features/reports/territories';
import { createThemedStyles, useAppTheme } from '@/features/appearance/theme-provider';
import { AppIcon } from '@/components/ui/app-icon';
import { surfaceDepth } from '@/components/ui/surface-depth';

export function CommunePicker({ selected, onSelect, onClose }: {
  selected: string | null; onSelect: (code: string) => void; onClose: () => void;
}) {
  const styles = useStyles();
  const { scheme } = useAppTheme();
  const [query, setQuery] = useState('');
  const results = communes.filter((commune) => matchesTerritorySearch(`${commune.name} ${commune.department_name}`, query));
  return <Modal transparent visible animationType="fade" onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
      <Pressable accessibilityLabel="Fermer" accessibilityRole="button" onPress={onClose} style={StyleSheet.absoluteFill} />
      <View accessibilityViewIsModal style={styles.sheet}>
        <View style={styles.heading}>
          <Text style={styles.title}>Choisir une commune</Text>
          <Pressable accessibilityLabel="Fermer" accessibilityRole="button" onPress={onClose} style={styles.close}><AppIcon icon={X} size={22} /></Pressable>
        </View>
        <View style={styles.search}>
          <AppIcon icon={Search} size={18} />
          <TextInput autoCorrect={false} keyboardAppearance={scheme} accessibilityLabel="Rechercher une commune" placeholder="Rechercher une commune" value={query} onChangeText={setQuery} style={styles.input} />
        </View>
        <FlatList data={results} keyExtractor={(item) => item.code} keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text style={styles.empty}>Aucune commune trouvée.</Text>}
          renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityState={{ selected: selected === item.code }}
            onPress={() => onSelect(item.code)} style={[styles.option, selected === item.code && styles.selected]}>
            <View style={styles.name}><Text translate={false} style={styles.optionTitle}>{item.name}</Text><Text translate={false} style={styles.department}>{item.department_name}</Text></View>
            {selected === item.code && <AppIcon icon={Check} size={20} />}
          </Pressable>} />
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}
const useStyles = createThemedStyles((c) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#10182066', justifyContent: 'center', alignItems: 'center', padding: 20 },
  sheet: { ...surfaceDepth(c, 'card'), backgroundColor: c('#FFFFFF', 'surface'), borderRadius: 28, width: '100%', maxWidth: 480, height: '75%', padding: 20 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { flex: 1, color: c('#29392F', 'text'), fontSize: 21, fontWeight: '700' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  search: { ...surfaceDepth(c, 'inset'), backgroundColor: c('#F4F5F0', 'elevated'), flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, paddingHorizontal: 14, marginVertical: 16 },
  input: { flex: 1, minWidth: 0, paddingVertical: 15, color: c('#29392F', 'text'), fontSize: 14 },
  option: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, minHeight: 64 },
  selected: { backgroundColor: c('#EDF1E5', 'successSoft') },
  name: { flex: 1 },
  optionTitle: { color: c('#29392F', 'text'), fontSize: 15, fontWeight: '600' },
  department: { color: c('#76816D', 'muted'), fontSize: 12, marginTop: 4 },
  empty: { color: c('#76816D', 'muted'), padding: 20, textAlign: 'center' },
}));
