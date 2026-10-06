import { SafetyAlertsCard } from '@/features/safety-profile/alerts-card';
import { AppScreen } from '@/components/app-screen';
import { surfaceDepth } from '@/components/ui/surface-depth';
import { createThemedStyles, useThemeColor } from '@/features/appearance/theme-provider';
import { inviteConnection, respondConnection, type Connection } from '@/features/connections/api';
import { SharingCard } from '@/features/live-location/sharing-card';
import { useConnections } from '@/features/connections/use-connections';
import { useLanguage } from '@/features/language/language-provider';
import { Pressable, Text, TextInput, View } from '@/features/language/native';
import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import Copy from 'lucide-react-native/icons/copy';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import Share2 from 'lucide-react-native/icons/share-2';
import UserRound from 'lucide-react-native/icons/user-round';
import UsersRound from 'lucide-react-native/icons/users-round';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Share, StyleSheet } from 'react-native';

export default function RelativesScreen() {
  const styles = useStyles();
  const color = useThemeColor();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let authChanged = false;
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      authChanged = true;
      setSession(next);
      setChecking(false);
      setFailed(false);
    });
    void supabase.auth.getSession().then(({ data: current, error }) => {
      if (!active || authChanged) return;
      setSession(current.session);
      setFailed(!!error);
      setChecking(false);
    }).catch(() => {
      if (active && !authChanged) { setFailed(true); setChecking(false); }
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [attempt]);

  return (
    <AppScreen title="Mes proches">
      {checking ? <ActivityIndicator style={styles.loading} color={color('#267E70', 'success')} />
        : failed ? <Pressable accessibilityRole="button" onPress={() => setAttempt(value => value + 1)} style={[styles.card, styles.content]}>
          <Text style={styles.error}>Impossible de vérifier votre session. Réessayer.</Text>
        </Pressable>
        : !session || session.user.is_anonymous ? <View style={[styles.card, styles.empty, styles.content]}>
          <UsersRound size={32} color={color('#77777C', 'muted')} />
          <Text style={styles.emptyText}>Connectez-vous pour ajouter vos proches.</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/profil', params: { auth: 'signIn' } })} style={styles.primary}>
            <Text style={styles.primaryText}>Se connecter</Text>
          </Pressable>
        </View>
        : <ConnectionsContent key={session.user.id} />}
    </AppScreen>
  );
}

function ConnectionsContent() {
  const styles = useStyles();
  const color = useThemeColor();
  const { t } = useLanguage();
  const { snapshot, loading, error, feedback, busy, refresh, perform } = useConnections();
  const [alias, setAlias] = useState('');
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const received = snapshot?.connections.filter(item => item.status === 'pending' && item.direction === 'incoming') ?? [];
  const sent = snapshot?.connections.filter(item => item.status === 'pending' && item.direction === 'outgoing') ?? [];
  const connected = snapshot?.connections.filter(item => item.status === 'accepted') ?? [];

  async function invite() {
    if (await perform('invite', () => inviteConnection(alias), 'Invitation envoyée.')) setAlias('');
  }

  async function shareAlias(copy: boolean) {
    if (!snapshot) return;
    setShareFeedback(null);
    try {
      if (copy || Platform.OS === 'web') {
        const copied = await Clipboard.setStringAsync(snapshot.alias);
        setShareFeedback(copied ? 'Alias copié.' : 'Impossible de copier l’alias.');
      } else {
        await Share.share({ message: `${t('Mon alias Stop Accidents :')} ${snapshot.alias}` });
      }
    } catch { setShareFeedback('Impossible de partager l’alias.'); }
  }

  function connectionRow(item: Connection) {
    const pending = item.status === 'pending';
    const incoming = item.direction === 'incoming';
    return <View key={item.id} style={styles.person}>
      <View style={styles.personIdentity}>
        <View style={styles.avatar}><UserRound size={20} color={color('#267E70', 'success')} /></View>
        <Text translate={false} selectable style={styles.personAlias}>{item.status === 'accepted' ? (item.email || item.alias) : item.alias}</Text>
        {busy === item.id && <ActivityIndicator size="small" color={color('#267E70', 'success')} />}
      </View>
      {pending && <View style={styles.actions}>
        {incoming && <Pressable accessibilityRole="button" disabled={!!busy} accessibilityState={{ disabled: !!busy }}
          onPress={() => void perform(item.id, () => respondConnection(item.id, 'accept'), 'Invitation acceptée.')}
          style={[styles.primary, !!busy && styles.disabled]}>
          <Text style={styles.primaryText}>Accepter</Text>
        </Pressable>}
        <Pressable accessibilityRole="button" disabled={!!busy} accessibilityState={{ disabled: !!busy }}
          onPress={() => void perform(item.id, () => respondConnection(item.id, incoming ? 'decline' : 'cancel'), incoming ? 'Invitation refusée.' : 'Invitation annulée.')}
          style={[styles.secondary, !!busy && styles.disabled]}>
          <Text style={styles.secondaryText}>{incoming ? 'Refuser' : 'Annuler'}</Text>
        </Pressable>
      </View>}
    </View>;
  }

  return <View style={styles.content}>
    <View style={styles.card}>
      <Text style={styles.label}>Mon alias</Text>
      <View style={styles.aliasRow}>
        {snapshot ? <Text selectable translate={false} style={styles.alias}>{snapshot.alias}</Text>
          : <ActivityIndicator color={color('#267E70', 'success')} />}
        <Pressable accessibilityRole="button" accessibilityLabel="Copier mon alias" disabled={!snapshot}
          onPress={() => void shareAlias(true)} style={styles.iconButton}>
          <Copy size={20} color={color('#267E70', 'success')} />
        </Pressable>
        {Platform.OS !== 'web' && <Pressable accessibilityRole="button" accessibilityLabel="Partager mon alias" disabled={!snapshot}
          onPress={() => void shareAlias(false)} style={styles.iconButton}>
          <Share2 size={20} color={color('#267E70', 'success')} />
        </Pressable>}
      </View>
      {shareFeedback && <Text accessibilityLiveRegion="polite" style={styles.feedback}>{shareFeedback}</Text>}
    </View>

    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Ajouter un proche</Text>
      <TextInput accessibilityLabel="Alias du proche" placeholder="Alias du proche" value={alias}
        onChangeText={setAlias} autoCapitalize="none" autoCorrect={false} maxLength={41}
        editable={!busy} returnKeyType="send" onSubmitEditing={() => { if (alias.trim() && !busy) void invite(); }}
        placeholderTextColor={color('#77777C', 'muted')} style={styles.input} />
      <Pressable accessibilityRole="button" disabled={!alias.trim() || !!busy}
        accessibilityState={{ disabled: !alias.trim() || !!busy }} onPress={() => void invite()}
        style={[styles.primary, (!alias.trim() || !!busy) && styles.disabled]}>
        {busy === 'invite' ? <ActivityIndicator size="small" color={color('#FFFFFF', 'background')} /> : <Text style={styles.primaryText}>Inviter</Text>}
      </Pressable>
    </View>
    {feedback && <Text accessibilityLiveRegion="polite" style={styles.feedback}>{feedback}</Text>}
    {error && <View style={styles.errorRow}>
      <Text accessibilityLiveRegion="polite" style={[styles.error, styles.grow]}>{error}</Text>
      <Pressable accessibilityRole="button" onPress={() => void refresh()} style={styles.secondary}>
        <Text style={styles.secondaryText}>Réessayer</Text>
      </Pressable>
    </View>}

    <SafetyAlertsCard />
    <SharingCard connections={connected} />
    {received.length > 0 && <View style={styles.card}>
      <Text style={styles.sectionTitle}>Invitations reçues</Text>
      {received.map(connectionRow)}
    </View>}
    {sent.length > 0 && <View style={styles.card}>
      <Text style={styles.sectionTitle}>Invitations envoyées</Text>
      {sent.map(connectionRow)}
    </View>}
    <View style={styles.card}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, styles.grow]}>Mes proches</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Actualiser mes proches" disabled={!!busy}
          onPress={() => void refresh()} style={styles.iconButton}>
          <RefreshCw size={18} color={color('#77777C', 'muted')} />
        </Pressable>
      </View>
      {loading ? <ActivityIndicator style={styles.loading} color={color('#267E70', 'success')} />
        : connected.length ? connected.map(connectionRow)
          : snapshot && <View style={styles.empty}>
            <UsersRound size={32} color={color('#77777C', 'muted')} />
            <Text style={styles.emptyText}>Aucun proche pour le moment</Text>
          </View>}
    </View>
  </View>;
}

const useStyles = createThemedStyles(color => StyleSheet.create({
  content: { gap: 18, marginTop: 24, width: '100%', maxWidth: 640, alignSelf: 'center' },
  card: { backgroundColor: color('#FFFFFF', 'surface'), borderRadius: 24, padding: 20, gap: 14, ...surfaceDepth(color, 'card') },
  label: { color: color('#77777C', 'muted'), fontSize: 13, fontWeight: '600' },
  aliasRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  alias: { flex: 1, color: color('#171719', 'text'), fontSize: 22, fontWeight: '700' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  sectionTitle: { color: color('#171719', 'text'), fontSize: 18, fontWeight: '700' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  input: { minHeight: 52, borderRadius: 16, backgroundColor: color('#F7F7F7', 'background'), color: color('#171719', 'text'), paddingHorizontal: 16, fontSize: 16, ...surfaceDepth(color, 'inset') },
  primary: { minHeight: 44, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: color('#267E70', 'success') },
  primaryText: { color: color('#FFFFFF', 'background'), fontSize: 14, fontWeight: '700' },
  secondary: { minHeight: 44, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: color('#F7F7F7', 'background') },
  secondaryText: { color: color('#77777C', 'muted'), fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.45 },
  feedback: { color: color('#171719', 'text'), fontSize: 14, lineHeight: 20 },
  error: { color: color('#BA3D31', 'accent'), fontSize: 14, lineHeight: 20 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1 },
  person: { gap: 12, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color('#E8E8EA', 'border') },
  personIdentity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: color('#E8F3F0', 'successSoft') },
  personAlias: { flex: 1, fontSize: 16, fontWeight: '600', color: color('#171719', 'text') },
  actions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' },
  empty: { alignItems: 'center', paddingVertical: 28, gap: 14 },
  emptyText: { fontSize: 15, textAlign: 'center', color: color('#77777C', 'muted') },
  loading: { padding: 28 },
}));
