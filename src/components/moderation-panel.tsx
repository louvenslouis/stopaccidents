import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from '@/features/language/native';
import { useThemeColor } from '@/features/appearance/theme-provider';
import { roleLabels, useRole, type AppRole } from '@/features/moderation/use-role';
import type { SafetyReportSummary } from '@/features/safety-report/read';
import { supabase } from '@/lib/supabase';
import { PublicationModeration } from './publication-moderation';

export function ModerationPanel() {
  const { role, canModerate, isAdmin } = useRole();
  const color = useThemeColor();
  const [userId, setUserId] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [reports, setReports] = useState<(SafetyReportSummary & { reason: string })[]>([]);
  const [loadError, setLoadError] = useState('');
  const reload = useCallback(async () => {
    setLoadError('');
    try {
      const { data, error } = await supabase.rpc('read_suspended_publications');
      if (error) throw error;
      setReports(data ?? []);
    } catch { setLoadError('Chargement impossible. Réessayez.'); }
  }, []);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active && canModerate) void reload(); });
    return () => { active = false; };
  }, [canModerate, reload]);
  async function changeRole(nextRole: AppRole) {
    if (busy) return;
    setBusy(true); setFeedback('');
    try {
      const { error } = await supabase.rpc('set_user_role', { p_user_id: userId.trim(), p_role: nextRole });
      if (error) throw error;
      setFeedback('Rôle enregistré.'); setUserId('');
    } catch { setFeedback('Modification impossible. Vérifiez le compte et vos droits.'); }
    finally { setBusy(false); }
  }
  const text = { color: color('#243147', 'text') };
  const button = { paddingVertical: 12 };
  return <View style={{ padding: 20, gap: 12, borderRadius: 20, backgroundColor: color('#FFFFFF', 'surface') }}>
    <Text style={{ ...text, fontWeight: '700' }}>{roleLabels[role]}</Text>
    {isAdmin && <>
      <TextInput accessibilityLabel="Identifiant du compte" placeholder="Identifiant du compte" autoCapitalize="none" value={userId} onChangeText={setUserId} editable={!busy}
        style={{ ...text, borderWidth: 1, borderColor: color('#DFE3EA', 'border'), borderRadius: 12, padding: 12 }} />
      {(['user', 'moderator', 'admin'] as const).map(value => <Pressable key={value} accessibilityRole="button" style={button} disabled={busy || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId.trim())} onPress={() => void changeRole(value)}><Text style={text}>{roleLabels[value]}</Text></Pressable>)}
      {!!feedback && <Text accessibilityLiveRegion="polite" style={text}>{feedback}</Text>}
    </>}
    {canModerate && <>
      <Text style={{ ...text, fontWeight: '700' }}>Publications suspendues</Text>
      <Pressable accessibilityRole="button" style={button} onPress={() => void reload()}><Text style={text}>Actualiser</Text></Pressable>
      {!!loadError && <Text accessibilityRole="alert" style={text}>{loadError}</Text>}
      {reports.map(report => <View key={`${report.report_kind}:${report.id}`}>
        <Text style={text} translate={false}>{report.location_description || report.id}</Text>
        <Text style={text} translate={false}>{report.reason}</Text>
        <PublicationModeration kind={report.report_kind} reportId={report.id} suspended onDone={() => void reload()} />
      </View>)}
    </>}
  </View>;
}
