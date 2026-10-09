import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import MessageCircle from 'lucide-react-native/icons/message-circle';
import Heart from 'lucide-react-native/icons/heart';
import RotateCw from 'lucide-react-native/icons/rotate-cw';
import Send from 'lucide-react-native/icons/send';
import X from 'lucide-react-native/icons/x';
import Ellipsis from 'lucide-react-native/icons/ellipsis';
import CornerDownRight from 'lucide-react-native/icons/corner-down-right';
import { Pressable, Text, TextInput, View } from '@/features/language/native';
import { createThemedStyles, useThemeColor } from '@/features/appearance/theme-provider';
import { useLanguage } from '@/features/language/language-provider';
import { readComments, writeComment, type Comment, type CommentAction, type CommentPage } from '@/features/comments/api';
import type { SafetyReportSummary } from '@/features/safety-report/read';
import { supabase } from '@/lib/supabase';
import { ReportModalSheet } from './ui/report-modal-sheet';

type Mode = { type: 'reply' | 'edit' | 'flag' | 'delete'; comment: Comment };
export function ReportCommentsSheet({ report, onClose }: { report: SafetyReportSummary; onClose: () => void }) {
  const styles = useStyles();
  const color = useThemeColor();
  const { language } = useLanguage();
  const [page, setPage] = useState<CommentPage | null>(null);
  const [threads, setThreads] = useState<Record<string, CommentPage>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [draft, setDraft] = useState('');
  const [mode, setMode] = useState<Mode | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const input = useRef<TextInput>(null);
  const lock = useRef(false);
  const alive = useRef(true);
  const generation = useRef(0);
  const creation = useRef<{ key: string; id: string } | null>(null);
  const list = useRef<FlatList<Comment>>(null);
  const actor = useRef<string | null | undefined>(undefined);
  const signedIn = page?.can_comment ?? false;

  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true); setError(null);
    try {
      const result = await readComments(report, null, null, flaggedOnly);
      if (!alive.current || request !== generation.current) return;
      setPage(result); setThreads({}); setExpanded({});
    } catch { if (alive.current && request === generation.current) setError('Chargement impossible. Réessayez.'); }
    finally { if (alive.current && request === generation.current) setLoading(false); }
  }, [report, flaggedOnly]);
  useEffect(() => {
    alive.current = true;
    const initial = setTimeout(() => { void refresh(); }, 0);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const next = session && !session.user.is_anonymous ? session.user.id : null;
      const changed = actor.current !== undefined && actor.current !== next;
      actor.current = next;
      if (!changed) return;
      setTimeout(() => { if (alive.current) { setPage(null); setMenu(null); setMode(null); setText(''); setDraft(''); creation.current = null; void refresh(); } }, 0);
    });
    const foreground = AppState.addEventListener('change', state => { if (state === 'active' && !lock.current) void refresh(); });
    return () => {
      alive.current = false; clearTimeout(initial);
      // This is a request counter, not a DOM/node ref. Invalidate in-flight reads.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++; subscription.unsubscribe(); foreground.remove();
    };
  }, [refresh]);

  function login() { onClose(); router.push({ pathname: '/profil', params: { auth: 'signIn' } }); }
  function begin(type: Mode['type'], comment: Comment) {
    if (!signedIn) { login(); return; }
    if (!mode) setDraft(text);
    setMenu(null); setNotice(null); setError(null); setMode({ type, comment });
    setText(type === 'edit' ? comment.body ?? '' : '');
    if (type !== 'delete') setTimeout(() => input.current?.focus(), 100);
  }
  function cancel() { setMode(null); setText(draft); setDraft(''); setError(null); }
  async function more(root: string | null = null) {
    if (lock.current || loading) return;
    lock.current = true; setBusy(true); setError(null);
    const previous = root ? threads[root] : page;
    const request = generation.current;
    try {
      const next = await readComments(report, root, previous?.items.at(-1)?.id ?? null, root ? false : flaggedOnly);
      if (!alive.current || request !== generation.current) return;
      const merged = { ...next, items: [...previous?.items ?? [], ...next.items].filter((item, i, all) => all.findIndex(c => c.id === item.id) === i) };
      if (root) { setThreads(old => ({ ...old, [root]: merged })); setExpanded(old => ({ ...old, [root]: true })); }
      else setPage(merged);
    } catch { if (alive.current) setError('Chargement impossible. Réessayez.'); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  async function mutate(action: CommentAction, comment: Comment | null = null) {
    if (!signedIn) { login(); return; }
    if (lock.current || loading) return;
    lock.current = true; setBusy(true); setError(null); setNotice(null);
    const key = JSON.stringify([text.trim(), mode?.type === 'reply' ? mode.comment.id : null]);
    if (action === 'create' && creation.current?.key !== key) creation.current = { key, id: randomUUID() };
    const id = comment?.id ?? creation.current!.id;
    const request = generation.current;
    let saved = false;
    try {
      await writeComment(report, action, id, text.trim(), mode?.type === 'reply' ? mode.comment.id : undefined);
      saved = true;
      if (!alive.current || request !== generation.current) return;
      // Only clear the composer after the server acknowledges the write. Retrying a lost
      // create response reuses its UUID and cannot duplicate a comment.
      if (action === 'create' || action === 'edit' || action === 'flag' || action === 'delete') {
        setText(mode ? draft : ''); setDraft(''); setMode(null);
        if (action === 'create') creation.current = null;
      }
      setMenu(null);
      const updated = await readComments(report, null, null, flaggedOnly);
      const oldRoots = page?.items.length ?? 0;
      // Retain loaded pages and include a newly created root, even in long discussions.
      while (updated.has_more && updated.items.length < oldRoots) {
        const next = await readComments(report, null, updated.items.at(-1)!.id, flaggedOnly);
        updated.items.push(...next.items); updated.has_more = next.has_more;
      }
      if (!alive.current || request !== generation.current) return;
      setPage(updated);
      const roots = Object.keys(expanded).filter(root => expanded[root]);
      const replyRoot = mode?.type === 'reply' ? mode.comment.root_id ?? mode.comment.id : null;
      if (replyRoot && !roots.includes(replyRoot)) roots.push(replyRoot);
      for (const root of roots) {
        const next = await readComments(report, root);
        while (next.has_more && next.items.length < (threads[root]?.items.length ?? 0)) {
          const batch = await readComments(report, root, next.items.at(-1)!.id);
          next.items.push(...batch.items); next.has_more = batch.has_more;
        }
        if (!alive.current || request !== generation.current) return;
        setThreads(old => ({ ...old, [root]: next })); setExpanded(old => ({ ...old, [root]: true }));
      }
      if (action === 'flag') setNotice('Signalement envoyé');
      if (action === 'create' && !mode) setTimeout(() => list.current?.scrollToOffset({ offset: 0, animated: true }), 100);
    } catch (failure) {
      if (alive.current && request === generation.current) setError(saved ? 'Enregistré. Actualisez les commentaires.' : (failure as { message?: string }).message === 'Too many comments'
        ? 'Trop de commentaires. Réessayez dans une minute.' : 'Action impossible. Réessayez.');
    } finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  const formatDate = (value: string) => new Date(value).toLocaleString(language === 'ht' ? 'ht-HT' : 'fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  function renderComment(comment: Comment, reply = false) {
    const unavailable = comment.deleted || comment.hidden;
    return <View key={comment.id} style={[styles.comment, reply && styles.reply]}>
      <View style={[styles.avatar, reply && styles.smallAvatar]}><Text translate={false} style={styles.initial}>{(comment.alias ?? '·').slice(0, 1).toUpperCase()}</Text></View>
      <View style={styles.commentContent}>
        <View style={styles.meta}>
          <Text translate={false} style={styles.alias}>{comment.alias ?? '—'}</Text>
          {comment.mine && <Text style={styles.you}>Vous</Text>}
          {!comment.deleted && <Pressable accessibilityRole="button" accessibilityLabel="Options du commentaire" disabled={busy} onPress={() => setMenu(menu === comment.id ? null : comment.id)} style={styles.icon}><Ellipsis size={19} color={color('#75837C', 'muted')} /></Pressable>}
        </View>
        <View style={styles.bubble}>
          {reply && comment.reply_to && !unavailable && <View style={styles.replyTo}><CornerDownRight size={12} color={color('#296957', 'success')} /><Text translate={false} style={styles.replyName}>@{comment.reply_to}</Text></View>}
          {comment.deleted ? <Text style={styles.unavailable}>Commentaire supprimé</Text>
            : comment.hidden && !page?.is_moderator ? <Text style={styles.unavailable}>Commentaire masqué</Text>
              : <Text translate={false} selectable style={styles.body}>{comment.body}</Text>}
          {comment.hidden && page?.is_moderator && <Text style={styles.unavailable}>Commentaire masqué</Text>}
        </View>
        <View style={styles.tools}>
          <Text translate={false} style={styles.date}>{formatDate(comment.created_at)}</Text>
          {comment.edited_at && !unavailable && <Text style={styles.date}>Modifié</Text>}
          {!unavailable && <>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => begin('reply', comment)} style={styles.tool}><Text style={styles.toolText}>Répondre</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={comment.liked ? 'Retirer mon like' : 'Aimer ce commentaire'} accessibilityState={{ selected: comment.liked, disabled: busy || comment.mine }} disabled={busy || comment.mine} onPress={() => void mutate(comment.liked ? 'unlike' : 'like', comment)} style={styles.tool}>
              <Heart size={15} color={comment.liked ? '#C65358' : color('#75837C', 'muted')} fill={comment.liked ? '#C65358' : 'none'} /><Text translate={false} style={styles.toolText}>{comment.likes || ''}</Text>
            </Pressable>
          </>}
        </View>
        {menu === comment.id && <View style={styles.menu}>
          {comment.mine && !unavailable && <Pressable accessibilityRole="button" onPress={() => begin('edit', comment)} style={styles.menuItem}><Text style={styles.toolText}>Modifier</Text></Pressable>}
          {comment.mine && <Pressable accessibilityRole="button" onPress={() => begin('delete', comment)} style={styles.menuItem}><Text style={styles.danger}>Supprimer</Text></Pressable>}
          {!comment.mine && !unavailable && <Pressable accessibilityRole="button" disabled={comment.flagged} onPress={() => begin('flag', comment)} style={styles.menuItem}><Text style={styles.danger}>{comment.flagged ? 'Déjà signalé' : 'Signaler'}</Text></Pressable>}
          {page?.is_moderator && <Pressable accessibilityRole="button" disabled={busy} onPress={() => void mutate(comment.hidden ? 'restore' : 'hide', comment)} style={styles.menuItem}><Text style={styles.danger}>{comment.hidden ? 'Rétablir' : 'Masquer'}</Text></Pressable>}
          {!!comment.flags.length && <Pressable accessibilityRole="button" disabled={busy} onPress={() => void mutate('dismiss_flags', comment)} style={styles.menuItem}><Text style={styles.toolText}>Classer sans suite</Text></Pressable>}
          <Pressable accessibilityRole="button" onPress={() => setMenu(null)} style={styles.menuItem}><Text style={styles.toolText}>Fermer</Text></Pressable>
        </View>}
        {!!comment.flags.length && <View style={styles.flagBox}>{comment.flags.map((reason, index) => <Text key={index} translate={false} style={styles.danger}>{reason}</Text>)}</View>}
        {!reply && comment.replies > 0 && !flaggedOnly && <Pressable accessibilityRole="button" accessibilityState={{ expanded: !!expanded[comment.id] }} disabled={busy || loading} onPress={() => {
          if (!threads[comment.id]) void more(comment.id); else setExpanded(old => ({ ...old, [comment.id]: !old[comment.id] }));
        }} style={styles.threadButton}><CornerDownRight size={16} color={color('#296957', 'success')} /><Text style={styles.threadText}>{expanded[comment.id] ? 'Masquer les réponses' : 'Voir les réponses'}</Text><Text translate={false} style={styles.threadText}>{comment.replies}</Text></Pressable>}
      </View>
    </View>;
  }
  const minLength = mode?.type === 'flag' ? 3 : 1;
  return <ReportModalSheet visible closeLabel="Fermer les commentaires" onRequestClose={onClose} dismissDisabled={busy}>
    <View style={styles.header}>
      <View style={styles.heading}><Text accessibilityRole="header" style={styles.title}>Commentaires</Text>{page && <View style={styles.badge}><Text translate={false} style={styles.threadText}>{page.total}</Text></View>}</View>
      <Pressable accessibilityRole="button" accessibilityLabel="Actualiser les commentaires" disabled={busy || loading} onPress={() => void refresh()} style={styles.refresh}><RotateCw size={18} color={color('#75837C', 'muted')} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Fermer les commentaires" disabled={busy} onPress={onClose} style={styles.close}><X size={21} color={color('#243B32', 'text')} /></Pressable>
    </View>
    {page?.is_moderator && <View style={styles.tabs}>{[false, true].map(value => <Pressable key={String(value)} accessibilityRole="button" accessibilityState={{ selected: flaggedOnly === value }} disabled={busy} onPress={() => setFlaggedOnly(value)} style={[styles.tab, flaggedOnly === value && styles.selectedTab]}><Text style={styles.toolText}>{value ? 'Signalés' : 'Tous'}</Text></Pressable>)}</View>}
    <FlatList ref={list} data={page?.items ?? []} keyExtractor={item => item.id} style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled"
      refreshing={loading} onRefresh={() => { if (!lock.current) void refresh(); }}
      ListEmptyComponent={<View style={styles.empty}>{loading ? <ActivityIndicator color={color('#296957', 'success')} /> : <><View style={styles.emptyIcon}><MessageCircle size={32} strokeWidth={1.5} color={color('#296957', 'success')} /></View><Text style={styles.emptyTitle}>{error ? 'Commentaires indisponibles' : flaggedOnly ? 'Aucun commentaire signalé' : 'Aucun commentaire'}</Text></>}</View>}
      renderItem={({ item }) => <View>{renderComment(item)}{expanded[item.id] && <View style={styles.thread}>{threads[item.id]?.items.map(comment => renderComment(comment, true))}{threads[item.id]?.has_more && <Pressable accessibilityRole="button" disabled={busy} onPress={() => void more(item.id)} style={styles.more}><Text style={styles.threadText}>Plus de réponses</Text></Pressable>}</View>}</View>}
      ListFooterComponent={page?.has_more ? <Pressable accessibilityRole="button" disabled={busy || loading} onPress={() => void more()} style={styles.more}><Text style={styles.threadText}>Plus de commentaires</Text></Pressable> : null} />
    {error && <View style={styles.feedback}><Text accessibilityRole="alert" style={styles.danger}>{error}</Text>{!page && <Pressable accessibilityRole="button" onPress={() => void refresh()} style={styles.tool}><Text style={styles.threadText}>Réessayer</Text></Pressable>}</View>}
    {notice && <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}
    <View style={styles.composer}>
      {mode && <View style={styles.mode}><View style={styles.flex}><Text style={styles.threadText}>{mode.type === 'reply' ? 'Répondre à' : mode.type === 'edit' ? 'Modifier le commentaire' : mode.type === 'flag' ? 'Signaler le commentaire' : 'Supprimer ce commentaire ?'}</Text>{mode.type === 'reply' && <Text translate={false} numberOfLines={1} style={styles.alias}>@{mode.comment.alias}</Text>}</View><Pressable accessibilityRole="button" accessibilityLabel="Annuler" disabled={busy} onPress={cancel} style={styles.close}><X size={18} color={color('#75837C', 'muted')} /></Pressable></View>}
      {signedIn ? mode?.type === 'delete' ? <View style={styles.deleteRow}><Pressable accessibilityRole="button" disabled={busy} onPress={cancel} style={styles.cancel}><Text style={styles.toolText}>Annuler</Text></Pressable><Pressable accessibilityRole="button" disabled={busy} onPress={() => void mutate('delete', mode.comment)} style={styles.deleteButton}>{busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.white}>Supprimer</Text>}</Pressable></View> : <View style={styles.inputRow}>
        <TextInput ref={input} accessibilityLabel={mode?.type === 'flag' ? 'Motif du signalement' : 'Votre commentaire'} placeholder={mode?.type === 'flag' ? 'Motif du signalement' : 'Votre commentaire…'} placeholderTextColor={color('#75837C', 'muted')} value={text} onChangeText={setText} multiline maxLength={mode?.type === 'flag' ? 500 : 2000} editable={!busy} style={styles.input} />
        <Pressable accessibilityRole="button" accessibilityLabel={mode?.type === 'edit' ? 'Enregistrer' : 'Envoyer'} accessibilityState={{ disabled: busy || loading || text.trim().length < minLength }} disabled={busy || loading || text.trim().length < minLength} onPress={() => void mutate(mode?.type === 'edit' ? 'edit' : mode?.type === 'flag' ? 'flag' : 'create', mode?.type === 'edit' || mode?.type === 'flag' ? mode.comment : null)} style={[styles.send, (busy || loading || text.trim().length < minLength) && styles.disabled]}>{busy ? <ActivityIndicator color="#FFF" /> : <Send size={19} color="#FFF" />}</Pressable>
      </View> : !loading && page && <Pressable accessibilityRole="button" onPress={login} style={styles.login}><Text style={styles.white}>Se connecter pour commenter</Text></Pressable>}
      {signedIn && text.length > (mode?.type === 'flag' ? 400 : 1800) && <Text translate={false} style={styles.counter}>{text.length}/{mode?.type === 'flag' ? 500 : 2000}</Text>}
    </View>
  </ReportModalSheet>;
}
const useStyles = createThemedStyles(color => StyleSheet.create({
  header: { paddingHorizontal: 22, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: color('#ECF0ED', 'border') },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }, title: { fontSize: 23, fontWeight: '800', letterSpacing: -0.6, color: color('#20382D', 'text') },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: color('#E9F3ED', 'successSoft') },
  refresh: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', marginRight: 6 },
  close: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: color('#F0F4F1', 'elevated') },
  list: { flex: 1 }, listContent: { padding: 20, paddingBottom: 30, flexGrow: 1 },
  comment: { flexDirection: 'row', gap: 10, marginBottom: 16 }, commentContent: { flex: 1, minWidth: 0 }, reply: { marginBottom: 10 },
  avatar: { width: 36, height: 36, borderRadius: 13, backgroundColor: color('#E5EEE7', 'successSoft'), alignItems: 'center', justifyContent: 'center', marginTop: 3 },
  smallAvatar: { width: 28, height: 28, borderRadius: 10 }, initial: { color: color('#37654D', 'success'), fontWeight: '800', fontSize: 14 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 32 }, alias: { fontWeight: '700', fontSize: 13, color: color('#243B32', 'text'), flexShrink: 1 },
  you: { fontSize: 10, fontWeight: '700', color: color('#718378', 'muted') }, icon: { marginLeft: 'auto', minWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  bubble: { borderRadius: 17, borderTopLeftRadius: 4, padding: 13, backgroundColor: color('#F2F5F2', 'elevated'), gap: 6 },
  body: { fontSize: 15, lineHeight: 22, color: color('#2B3B33', 'text') }, unavailable: { fontSize: 13, fontStyle: 'italic', color: color('#7A867F', 'muted') },
  tools: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 }, date: { fontSize: 10, color: color('#7A867F', 'muted') },
  tool: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 5 }, toolText: { fontSize: 12, fontWeight: '600', color: color('#65776C', 'secondary') },
  threadButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 7 }, threadText: { fontSize: 12, fontWeight: '700', color: color('#296957', 'success') },
  thread: { marginLeft: 17, paddingLeft: 15, borderLeftWidth: 2, borderColor: color('#DDE9DF', 'border'), marginBottom: 18 },
  replyTo: { flexDirection: 'row', alignItems: 'center', gap: 5 }, replyName: { fontSize: 11, color: color('#296957', 'success') },
  menu: { padding: 5, borderRadius: 15, backgroundColor: color('#FFF', 'surface'), borderWidth: 1, borderColor: color('#DDE9DF', 'border') }, menuItem: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  more: { minHeight: 48, alignItems: 'center', justifyContent: 'center' }, empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingVertical: 65 },
  emptyIcon: { width: 76, height: 76, borderRadius: 28, backgroundColor: color('#EDF5EE', 'successSoft'), alignItems: 'center', justifyContent: 'center' }, emptyTitle: { fontSize: 16, fontWeight: '600', color: color('#617469', 'secondary') },
  composer: { borderTopWidth: 1, borderColor: color('#E8EEE9', 'border'), paddingHorizontal: 18, paddingTop: 14, paddingBottom: 8, gap: 10 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 }, input: { flex: 1, minHeight: 48, maxHeight: 130, paddingHorizontal: 15, paddingTop: 13, paddingBottom: 13, fontSize: 15, borderRadius: 19, backgroundColor: color('#F2F5F2', 'elevated'), color: color('#243B32', 'text') },
  send: { width: 48, height: 48, borderRadius: 17, backgroundColor: '#296957', alignItems: 'center', justifyContent: 'center' }, disabled: { opacity: 0.4 },
  mode: { flexDirection: 'row', gap: 10, alignItems: 'center' }, flex: { flex: 1, gap: 4 }, counter: { fontSize: 11, textAlign: 'right', color: color('#75837C', 'muted') },
  login: { minHeight: 48, borderRadius: 17, backgroundColor: '#296957', justifyContent: 'center', alignItems: 'center' }, white: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  danger: { color: color('#B9443F', 'accent'), fontSize: 12 }, feedback: { paddingHorizontal: 20, paddingVertical: 8 }, notice: { paddingHorizontal: 20, paddingVertical: 8, color: color('#296957', 'success'), fontSize: 13 },
  deleteRow: { flexDirection: 'row', gap: 12 }, cancel: { flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center' }, deleteButton: { flex: 1, minHeight: 48, borderRadius: 16, backgroundColor: '#B9443F', justifyContent: 'center', alignItems: 'center' },
  tabs: { flexDirection: 'row', paddingHorizontal: 20, paddingTop: 12, gap: 8 }, tab: { paddingHorizontal: 15, minHeight: 42, borderRadius: 14, justifyContent: 'center' }, selectedTab: { backgroundColor: color('#E9F3ED', 'successSoft') }, flagBox: { padding: 10, borderRadius: 10, backgroundColor: color('#FFF0ED', 'elevated'), gap: 6 },
}));
