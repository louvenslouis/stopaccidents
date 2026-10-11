import { createContext, useContext } from 'react';
import { StyleSheet } from 'react-native';
import { createThemedStyles } from '@/features/appearance/theme-provider';

/** The same detail content can live in its sheet or inside the expanded photo card. */
export const ReportDetailAppearanceContext = createContext(false);

export function useReportDetailStyles<T extends object>(base: T): T {
  const embedded = useContext(ReportDetailAppearanceContext);
  const cardStyles = useCardStyles();
  return embedded ? { ...base, ...cardStyles } as T : base;
}

const useCardStyles = createThemedStyles(color => StyleSheet.create({
  content: { padding: 0, paddingBottom: 12, gap: 14 },
  section: { padding: 18, gap: 10, borderRadius: 24, backgroundColor: color('#F2F4F6', 'elevated') },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: color('#19222D', 'text'), marginBottom: 4 },
  summary: { padding: 18, gap: 14, borderRadius: 24, backgroundColor: color('#F2F4F6', 'elevated') },
  card: { padding: 18, gap: 10, borderRadius: 24, backgroundColor: color('#F2F4F6', 'elevated') },
  body: { fontSize: 14, lineHeight: 22, color: color('#455168', 'secondary') },
  label: { fontSize: 12, fontWeight: '600', color: color('#737D8B', 'muted') },
  linkButton: { alignSelf: 'stretch', backgroundColor: '#141C24', minHeight: 50, borderRadius: 25, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  refresh: { alignSelf: 'stretch', backgroundColor: '#141C24', minHeight: 50, borderRadius: 25, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  button: { alignSelf: 'stretch', backgroundColor: '#141C24', minHeight: 50, borderRadius: 25, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  link: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  linkText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  refreshText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  photoBlock: { gap: 8, marginBottom: 12 },
  photo: { width: '100%', height: 240, borderRadius: 20, backgroundColor: color('#E8ECEF', 'background') },
}));
