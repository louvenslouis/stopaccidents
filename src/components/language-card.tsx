import { StyleSheet } from 'react-native';
import Languages from 'lucide-react-native/icons/languages';
import Check from 'lucide-react-native/icons/check';
import { Text, View } from '@/features/language/native';
import { useLanguage } from '@/features/language/language-provider';
import { languages } from '@/features/language/translate';
import { createThemedStyles } from '@/features/appearance/theme-provider';
import { AppIcon } from './ui/app-icon';
import { AnimatedPressable } from './ui/animated-pressable';

export function LanguageCard() {
  const { language, setLanguage, ready, storageError } = useLanguage();
  const styles = useStyles();
  return <View style={styles.card}>
    <View style={styles.heading}><AppIcon icon={Languages} size={23} /><Text accessibilityRole="header" style={styles.title}>Langue</Text></View>
    <View accessibilityRole="radiogroup" accessibilityLabel="Langue de l’application" style={styles.options}>
      {languages.map(({ id, label }) => <AnimatedPressable key={id} accessibilityRole="radio"
        accessibilityLabel={label} accessibilityState={{ checked: language === id, disabled: !ready }}
        aria-checked={language === id} disabled={!ready} onPress={() => setLanguage(id)} haptic="selection"
        style={[styles.option, language === id && styles.selected]}>
        <Text translate={false} style={styles.label}>{label}</Text>
        {language === id && <AppIcon icon={Check} size={18} />}
      </AnimatedPressable>)}
    </View>
    {storageError && <Text accessibilityRole="alert" style={styles.error}>Préférence non enregistrée.</Text>}
  </View>;
}
const useStyles = createThemedStyles((color) => StyleSheet.create({
  card: { padding: 22, gap: 18, borderRadius: 22, borderWidth: 1, borderColor: color('#E7E8EB', 'border'), backgroundColor: color('#FFFFFF', 'surface') },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  title: { fontSize: 19, fontWeight: '700', color: color('#243147', 'text') },
  options: { gap: 9 },
  option: { minHeight: 52, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderRadius: 14, borderWidth: 1, borderColor: color('#E7E8EB', 'border'), backgroundColor: color('#FAFBFC', 'input') },
  selected: { borderColor: color('#E14D3E', 'accent'), backgroundColor: color('#FFF0EC', 'accentSoft') },
  label: { fontSize: 15, fontWeight: '600', color: color('#243147', 'text') },
  error: { fontSize: 12, color: color('#BA3540', 'accent') },
}));
