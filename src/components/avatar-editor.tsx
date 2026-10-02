import { AvatarPortraitStage, ProfileJourneyProgress } from './profile-journey-art';
import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import Check from 'lucide-react-native/icons/check';
import Shuffle from 'lucide-react-native/icons/shuffle';
import X from 'lucide-react-native/icons/x';
import { ScrollView, Text, View } from '@/features/language/native';
import { createThemedStyles, useThemeColor } from '@/features/appearance/theme-provider';
import { avatarOptions, randomAvatar, type AvatarConfig, type AvatarFeature } from '@/features/profile/avatar';
import { saveAvatar } from '@/features/profile/avatar-api';
import { AnimatedPressable } from './ui/animated-pressable';
import { AppIcon } from './ui/app-icon';
import { UserAvatar } from './user-avatar';

const categories: { id: AvatarFeature; label: string }[] = [
  { id: 'skin', label: 'Teint' }, { id: 'hair', label: 'Coiffure' },
  { id: 'hairColor', label: 'Couleur' }, { id: 'expression', label: 'Expression' },
  { id: 'beard', label: 'Barbe' }, { id: 'glasses', label: 'Lunettes' },
  { id: 'background', label: 'Fond' },
];

export function AvatarEditor({ userId, initial, onClose, onSaved, onboarding = false, embedded = false, onSave }: {
  userId: string; initial: AvatarConfig; onClose: () => void; onSaved: (avatar: AvatarConfig) => void;
  onboarding?: boolean; embedded?: boolean; onSave?: (avatar: AvatarConfig) => Promise<AvatarConfig>;
}) {
  const styles = useStyles();
  const color = useThemeColor();
  const [draft, setDraft] = useState(initial);
  const [category, setCategory] = useState<AvatarFeature>('skin');
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      onSaved(await (onSave ? onSave(draft) : saveAvatar(userId, draft)));
      if (!onboarding) onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossible d’enregistrer votre avatar. Réessayez.');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  const content = (
      <SafeAreaView style={styles.screen}>
        <View style={styles.container}>
          <View style={styles.header}>
            <AnimatedPressable accessibilityRole="button" accessibilityLabel={onboarding ? 'Revenir à mon alias' : 'Annuler'} disabled={saving}
              onPress={onClose} style={styles.iconButton}>
              <AppIcon icon={onboarding ? ChevronLeft : X} size={22} color={color('#243147', 'text')} />
            </AnimatedPressable>
            <Text accessibilityRole="header" style={styles.title}>{onboarding ? 'Créer mon avatar' : 'Mon avatar'}</Text>
            <AnimatedPressable accessibilityRole="button" accessibilityLabel="Avatar aléatoire" disabled={saving}
              onPress={() => { setDraft(randomAvatar()); setError(null); }} haptic="selection" style={styles.iconButton}>
              <AppIcon icon={Shuffle} size={21} color={color('#243147', 'text')} />
            </AnimatedPressable>
          </View>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {onboarding && <ProfileJourneyProgress step={2} />}
            {onboarding && <Text style={styles.privacy}>Choisissez un avatar qui ne permet pas de vous reconnaître. Il n’a pas besoin de vous ressembler.</Text>}
            {onboarding ? (
              <AvatarPortraitStage>
                <View accessibilityLabel="Aperçu de mon avatar" accessibilityRole="image">
                  <UserAvatar avatar={draft} size={208} />
                </View>
              </AvatarPortraitStage>
            ) : (
              <View style={styles.preview} accessibilityLabel="Aperçu de mon avatar" accessibilityRole="image">
                <UserAvatar avatar={draft} size={208} />
              </View>
            )}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
              {categories.map(({ id, label }) => (
                <AnimatedPressable key={id} accessibilityRole="tab" accessibilityLabel={label}
                  aria-selected={category === id} accessibilityState={{ selected: category === id }} onPress={() => setCategory(id)}
                  haptic="selection" style={[styles.tab, category === id && styles.activeTab]}>
                  <Text style={[styles.tabText, category === id && styles.activeText]}>{label}</Text>
                </AnimatedPressable>
              ))}
            </ScrollView>
            <View accessibilityRole="radiogroup" accessibilityLabel={categories.find(({ id }) => id === category)!.label} style={styles.options}>
              {avatarOptions[category].map((option) => {
                const selected = draft[category] === option.id;
                return (
                  <AnimatedPressable key={`${category}-${option.id}`} accessibilityRole="radio"
                    accessibilityLabel={option.label} aria-checked={selected} accessibilityState={{ checked: selected, disabled: saving }}
                    disabled={saving} haptic="selection" onPress={() => {
                      setDraft((current) => ({ ...current, [category]: option.id }));
                      setError(null);
                    }} style={[styles.option, selected && styles.selected]}>
                    {'color' in option ? <View style={[styles.swatch, { backgroundColor: option.color }]} /> :
                      <UserAvatar avatar={{ ...draft, [category]: option.id }} size={72} />}
                    <Text style={styles.optionLabel}>{option.label}</Text>
                    {selected && <View style={styles.check}><AppIcon icon={Check} size={12} color="#FFFFFF" strokeWidth={3} /></View>}
                  </AnimatedPressable>
                );
              })}
            </View>
          </ScrollView>
          <View style={styles.footer}>
            {error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
            <AnimatedPressable accessibilityRole="button" accessibilityLabel={onboarding ? 'Terminer mon profil' : 'Enregistrer mon avatar'}
              accessibilityState={{ disabled: saving, busy: saving }} disabled={saving} haptic="light"
              onPress={() => void save()} style={[styles.save, saving && styles.disabled]}>
              {saving ? <ActivityIndicator color="#FFFFFF" /> : <><AppIcon icon={Check} size={20} color="#FFFFFF" /><Text style={styles.saveText}>{onboarding ? 'Terminer' : 'Enregistrer'}</Text></>}
            </AnimatedPressable>
          </View>
        </View>
      </SafeAreaView>
  );
  return embedded ? content : (
    <Modal visible animationType="slide" onRequestClose={() => { if (!busy.current) onClose(); }}>
      {content}
    </Modal>
  );
}

const useStyles = createThemedStyles((color) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: color('#FAFBF8', 'background') },
  container: { flex: 1, width: '100%', maxWidth: 540, alignSelf: 'center' },
  header: { padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  iconButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: color('#FFFFFF', 'surface'), alignItems: 'center', justifyContent: 'center' },
  title: { flexShrink: 1, fontSize: 21, fontWeight: '700', color: color('#243147', 'text') },
  privacy: { paddingHorizontal: 24, fontSize: 15, lineHeight: 23, color: color('#69756C', 'secondary') },
  content: { paddingBottom: 24, gap: 24 },
  preview: { alignSelf: 'center', marginTop: 12, borderRadius: 112, padding: 7, backgroundColor: color('#FFFFFF', 'surface'), borderWidth: 1, borderColor: color('#E5E9E1', 'border') },
  tabs: { gap: 8, paddingHorizontal: 20 },
  tab: { minHeight: 44, paddingHorizontal: 16, justifyContent: 'center', borderRadius: 22, backgroundColor: color('#FFFFFF', 'surface') },
  activeTab: { backgroundColor: color('#243F34', 'success') },
  tabText: { fontSize: 14, fontWeight: '600', color: color('#69756C', 'secondary') },
  activeText: { color: color('#FFFFFF', 'background') },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 20 },
  option: { width: '30%', flexGrow: 1, maxWidth: '32%', minHeight: 112, borderWidth: 2, borderColor: color('#E9EDE5', 'border'), borderRadius: 22, backgroundColor: color('#FFFFFF', 'surface'), alignItems: 'center', justifyContent: 'center', gap: 9, paddingVertical: 12 },
  selected: { borderColor: color('#267E70', 'success'), backgroundColor: color('#EDF7F1', 'successSoft') },
  swatch: { width: 50, height: 50, borderRadius: 25, borderWidth: 1, borderColor: '#00000012' },
  optionLabel: { fontSize: 12, fontWeight: '600', textAlign: 'center', color: color('#485469', 'secondary'), paddingHorizontal: 4 },
  check: { position: 'absolute', right: 5, top: 5, width: 20, height: 20, borderRadius: 10, backgroundColor: '#267E70', alignItems: 'center', justifyContent: 'center' },
  footer: { padding: 20, gap: 12, borderTopWidth: 1, borderColor: color('#E9EDE5', 'border') },
  save: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 27, backgroundColor: '#267E70' },
  saveText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  error: { color: color('#BA3540', 'accent'), fontSize: 13, textAlign: 'center' },
  disabled: { opacity: 0.6 },
}));
