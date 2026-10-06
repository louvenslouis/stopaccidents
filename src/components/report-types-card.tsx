import { StyleSheet, Switch } from 'react-native';
import { Text, View } from '@/features/language/native';
import { useLanguage } from '@/features/language/language-provider';
import { createThemedStyles, useThemeColor } from '@/features/appearance/theme-provider';
import { reportTypes } from '@/features/report-preferences/model';
import { useReportPreferences } from '@/features/report-preferences/provider';
import { surfaceDepth } from './ui/surface-depth';
import { ReportIllustration } from './report-illustration';

export function ReportTypesCard() {
  const styles = useStyles();
  const color = useThemeColor();
  const { t } = useLanguage();
  const { visibility, ready, storageError, setVisible } = useReportPreferences();
  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>Types de signalement</Text>
      {reportTypes.map(({ id, title }) => (
        <View key={id} style={styles.row}>
          <ReportIllustration kind={id} size={36} />
          <Text style={styles.label}>{title}</Text>
          <Switch accessibilityLabel={t(title)} disabled={!ready} value={visibility[id]}
            onValueChange={(enabled) => setVisible(id, enabled)}
            trackColor={{ false: color('#D5D9DF', 'border'), true: color('#D94235', 'accent') }} />
        </View>
      ))}
      {storageError && <Text accessibilityRole="alert" style={styles.error}>Préférence non enregistrée.</Text>}
    </View>
  );
}

const useStyles = createThemedStyles((color) => StyleSheet.create({
  card: { ...surfaceDepth(color, 'card'), backgroundColor: color('#FFFFFF', 'surface'), borderColor: color('#E7E8EB', 'border'), borderWidth: 1, borderRadius: 22, padding: 22, gap: 16 },
  title: { color: color('#243147', 'text'), fontSize: 19, fontWeight: '700', lineHeight: 25 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  label: { flex: 1, color: color('#485469', 'secondary'), fontSize: 14, fontWeight: '600' },
  error: { color: color('#768091', 'muted'), fontSize: 12 },
}));
