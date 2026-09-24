import { Text, View } from '@/features/language/native';
import Monitor from 'lucide-react-native/icons/monitor';
import Moon from 'lucide-react-native/icons/moon';
import Sun from 'lucide-react-native/icons/sun';
import Check from 'lucide-react-native/icons/check';
import { StyleSheet } from 'react-native';
import { AnimatedPressable } from './ui/animated-pressable';
import { AppIcon } from './ui/app-icon';
import { createThemedStyles, useAppTheme } from '@/features/appearance/theme-provider';

const options = [
  { id: 'system', label: 'Système', icon: Monitor },
  { id: 'light', label: 'Clair', icon: Sun },
  { id: 'dark', label: 'Sombre', icon: Moon },
] as const;

export function AppearanceCard() {
  const styles = useStyles();
  const { preference, setPreference, ready, storageError, color } = useAppTheme();
  return (
    <View style={styles.card}>
      <View style={styles.heading}>
        <View style={styles.icon}><AppIcon icon={Moon} color={color('#785898', 'violet')} size={22} /></View>
        <View style={styles.grow}>
          <Text accessibilityRole="header" style={styles.title}>Apparence</Text>
        </View>
      </View>
      <View accessibilityRole="radiogroup" accessibilityLabel="Thème de l’application" style={styles.options}>
        {options.map(({ id, label, icon }) => {
          const selected = id === preference;
          return (
            <AnimatedPressable key={id} accessibilityRole="radio" accessibilityLabel={label}
              aria-checked={selected} accessibilityState={{ checked: selected, disabled: !ready }} disabled={!ready}
              onPress={() => setPreference(id)} haptic="selection" pressedScale={0.97}
              style={[styles.option, selected && styles.selected]}>
              <View style={styles.optionTop}>
                <AppIcon icon={icon} size={23} color={selected ? color('#C43F32', 'accent') : color('#768091', 'muted')} />
                <View style={[styles.check, selected && styles.checkSelected]}>
                  {selected && <AppIcon icon={Check} size={11} color="#FFFFFF" strokeWidth={3} />}
                </View>
              </View>
              <Text style={[styles.label, selected && styles.selectedLabel]}>{label}</Text>
            </AnimatedPressable>
          );
        })}
      </View>
      {storageError && <Text accessibilityRole="alert" style={styles.note}>Préférence non enregistrée.</Text>}
    </View>
  );
}

const useStyles = createThemedStyles((color) => StyleSheet.create({
  card: { backgroundColor: color('#FFFFFF', 'surface'), borderColor: color('#E7E8EB', 'border'), borderWidth: 1, borderRadius: 22, padding: 22, gap: 18 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  icon: { width: 46, height: 46, borderRadius: 16, backgroundColor: color('#F2ECF8', 'violetSoft'), alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1 },
  title: { color: color('#243147', 'text'), fontSize: 19, fontWeight: '700', lineHeight: 25 },
  options: { flexDirection: 'row', gap: 9 },
  option: { flex: 1, minHeight: 92, borderRadius: 16, padding: 12, justifyContent: 'space-between', gap: 16, borderWidth: 1, borderColor: color('#E7E8EB', 'border'), backgroundColor: color('#FAFBFC', 'input') },
  selected: { borderColor: color('#E14D3E', 'accent'), backgroundColor: color('#FFF0EC', 'accentSoft') },
  optionTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  check: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  checkSelected: { backgroundColor: '#D94235' },
  label: { color: color('#485469', 'secondary'), fontSize: 13, fontWeight: '600' },
  selectedLabel: { color: color('#C43F32', 'accent') },
  note: { color: color('#768091', 'muted'), fontSize: 11, lineHeight: 17 },
}));
