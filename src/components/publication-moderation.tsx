import { useReportDetailStyles } from './report-detail-appearance';
import { useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { Pressable, Text, TextInput, View } from '@/features/language/native';
import { useThemeColor } from '@/features/appearance/theme-provider';
import { useRole } from '@/features/moderation/use-role';
import type { ReportKind } from '@/features/report-events/api';
import { supabase } from '@/lib/supabase';

export function PublicationModeration({ kind, reportId, suspended = false, onDone, onBusyChange }: {
  kind: ReportKind; reportId: string; suspended?: boolean; onDone: () => void; onBusyChange?: (busy: boolean) => void;
}) {
  const { canModerate } = useRole();
  const color = useThemeColor();
  const detailStyles = useReportDetailStyles({ button: { paddingVertical: 12 }, link: { color: color('#BA3540', 'accent'), fontWeight: '700' as const } });
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!canModerate) return null;
  async function submit() {
    if (busy) return;
    setBusy(true); onBusyChange?.(true); setError('');
    try {
      const result = await supabase.rpc('moderate_publication', { p_kind: kind, p_report_id: reportId, p_suspended: !suspended, p_reason: reason.trim() });
      if (result.error) throw result.error;
      onDone();
    } catch { setError('Modification impossible. Vérifiez vos droits et réessayez.'); }
    finally { setBusy(false); onBusyChange?.(false); }
  }
  return <View style={{ gap: 8, paddingVertical: 12 }}>
    <TextInput accessibilityLabel="Motif de modération" placeholder="Motif" value={reason} onChangeText={setReason} maxLength={500} editable={!busy}
      style={{ color: color('#243147', 'text'), borderColor: color('#DFE3EA', 'border'), borderWidth: 1, borderRadius: 12, padding: 12 }} />
    <Pressable accessibilityRole="button" disabled={busy || reason.trim().length < 3} onPress={() => void submit()} style={[detailStyles.button, { opacity: busy || reason.trim().length < 3 ? 0.5 : 1 }]}>
      <Text style={detailStyles.link}>{suspended ? 'Remettre en ligne' : 'Suspendre la publication'}</Text>
    </Pressable>
    {busy && <ActivityIndicator />}
    {!!error && <Text accessibilityRole="alert">{error}</Text>}
  </View>;
}
