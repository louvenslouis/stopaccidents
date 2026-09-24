import { Pressable, Text, View } from '@/features/language/native';
import { createThemedStyles } from '@/features/appearance/theme-provider';
import { Image } from 'expo-image';
import Check from 'lucide-react-native/icons/check';
import { StyleSheet } from 'react-native';
import { AppIcon } from '@/components/ui/app-icon';
import { barricadeTypes, type BarricadeType } from '@/features/barricade-report/model';

const illustrations = {
  stones: require('../../assets/images/barricade-types/stones.png'),
  wrecks: require('../../assets/images/barricade-types/wrecks.png'),
  'burning-tires': require('../../assets/images/barricade-types/burning-tires.png'),
  'tree-trunks': require('../../assets/images/barricade-types/tree-trunks.png'),
  other: require('../../assets/images/barricade-types/other.png'),
} as const;

export function BarricadeTypePicker({ selected, disabled = false, onChange }: {
  selected: BarricadeType[];
  disabled?: boolean;
  onChange: (types: BarricadeType[]) => void;
}) {
  const styles = useStyles();

  return (
    <View style={styles.grid}>
      {barricadeTypes.map((type) => {
        const checked = selected.includes(type.id);
        return (
          <Pressable
            key={type.id}
            accessibilityRole="checkbox"
            accessibilityLabel={type.label}
            accessibilityState={{ checked, disabled }}
            disabled={disabled}
            onPress={() => onChange(checked
              ? selected.filter((id) => id !== type.id)
              : [...selected, type.id])}
            style={({ pressed }) => [styles.card, checked && styles.selected, (pressed || disabled) && styles.dimmed]}
          >
            <View style={[styles.checkbox, checked && styles.checkboxSelected]}>
              {checked && <AppIcon icon={Check} size={14} color="#fff" />}
            </View>
            <Image source={illustrations[type.id]} style={styles.image} contentFit="contain" accessible={false} alt="" />
            <Text style={[styles.label, checked && styles.selectedLabel]}>{type.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = createThemedStyles((themeColor) => StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { flexBasis: '46%', flexGrow: 1, minWidth: 120, minHeight: 138, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderWidth: 1.5, borderColor: themeColor('#E4E8EE', 'border'), borderRadius: 18, backgroundColor: themeColor('#FAFBFC', 'surface') },
  selected: { borderColor: '#CF7930', backgroundColor: themeColor('#FFF6EA', 'warningSoft') },
  dimmed: { opacity: 0.6 },
  image: { width: 82, height: 82 },
  label: { color: themeColor('#455168', 'secondary'), fontSize: 13, fontWeight: '600', textAlign: 'center' },
  selectedLabel: { color: themeColor('#93511A', 'warning') },
  checkbox: { position: 'absolute', right: 10, top: 10, width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: themeColor('#CCD2DB', 'border'), alignItems: 'center', justifyContent: 'center' },
  checkboxSelected: { backgroundColor: '#B96B16', borderColor: '#B96B16' },
}));
