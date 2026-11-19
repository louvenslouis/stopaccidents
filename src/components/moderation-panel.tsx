import { useState } from 'react';
import { Pressable, Text, TextInput, View } from '@/features/language/native';
import { useThemeColor } from '@/features/appearance/theme-provider';
import { roleLabels, useRole, type AppRole } from '@/features/moderation/use-role';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import { AppIcon } from './ui/app-icon';

export function ModerationPanel() {
  const { role, canModerate, isAdmin } = useRole();
  const router = useRouter();
  const color = useThemeColor();
  const [userId, setUserId] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
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
    {canModerate && (
      <Pressable accessibilityRole="button" accessibilityLabel="Voir les événements retirés" style={{ ...button, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }} onPress={() => router.push('/profil/evenements-retires')}>
        <Text style={{ ...text, fontWeight: '700' }}>Événements retirés</Text>
        <AppIcon icon={ChevronRight} color={color('#89919E', 'muted')} size={20} />
      </Pressable>
    )}
  </View>;
}
