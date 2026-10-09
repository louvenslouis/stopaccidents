import { ProfileJourneyProgress } from './profile-journey-art';
import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import Check from 'lucide-react-native/icons/check';
import Shuffle from 'lucide-react-native/icons/shuffle';
import Undo2 from 'lucide-react-native/icons/undo-2';
import X from 'lucide-react-native/icons/x';
import { ScrollView, Text, View } from '@/features/language/native';
import { createThemedStyles, useThemeColor } from '@/features/appearance/theme-provider';
import { avatarOptions, avatarPresets, parseAvatar, randomAvatar, type AvatarConfig, type AvatarFeature } from '@/features/profile/avatar';
import { saveAvatar } from '@/features/profile/avatar-api';
import { AnimatedPressable } from './ui/animated-pressable';
import { AppIcon } from './ui/app-icon';
import { UserAvatar } from './user-avatar';

const groups: { id: string; label: string; features: { id: AvatarFeature; label: string }[] }[] = [
  { id: 'presets', label: 'Styles', features: [] },
  { id: 'face', label: 'Visage', features: [
    { id: 'skin', label: 'Teint' }, { id: 'face', label: 'Forme' },
    { id: 'eyeColor', label: 'Yeux' }, { id: 'expression', label: 'Expression' },
  ] },
  { id: 'hair', label: 'Cheveux', features: [
    { id: 'hair', label: 'Coiffure' }, { id: 'hairColor', label: 'Couleur' }, { id: 'beard', label: 'Barbe' },
  ] },
  { id: 'clothing', label: 'Tenue', features: [
    { id: 'clothing', label: 'Vêtement' }, { id: 'clothingColor', label: 'Couleur' },
  ] },
  { id: 'accessories', label: 'Accessoires', features: [
    { id: 'earrings', label: 'Boucles d’oreilles' },
    { id: 'headwear', label: 'Coiffe' }, { id: 'headwearColor', label: 'Couleur coiffe' },
    { id: 'glasses', label: 'Lunettes' }, { id: 'glassesColor', label: 'Monture' },
  ] },
  { id: 'background', label: 'Fond', features: [
    { id: 'background', label: 'Couleur' }, { id: 'backgroundPattern', label: 'Motif' },
  ] },
];

export function AvatarEditor({ userId, initial, onClose, onSaved, onboarding = false, embedded = false, onSave }: {
  userId: string; initial: AvatarConfig; onClose: () => void; onSaved: (avatar: AvatarConfig) => void;
  onboarding?: boolean; embedded?: boolean; onSave?: (avatar: AvatarConfig) => Promise<AvatarConfig>;
}) {
  const styles = useStyles();
  const color = useThemeColor();
  const { height } = useWindowDimensions();
  const [draft, setDraft] = useState(parseAvatar(initial));
  const [history, setHistory] = useState<AvatarConfig[]>([]);
  const [groupId, setGroupId] = useState('face');
  const [category, setCategory] = useState<AvatarFeature>('skin');
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const optionsScroll = useRef<ScrollView>(null);
  const [error, setError] = useState<string | null>(null);
  const group = groups.find(({ id }) => id === groupId)!;

  function change(next: AvatarConfig) {
    if (busy.current || JSON.stringify(next) === JSON.stringify(draft)) return;
    setHistory((current) => [...current.slice(-29), draft]);
    setDraft(next);
    setError(null);
  }

  function selectOption(id: string) {
    change(parseAvatar({ ...draft, [category]: id,
      // A frame color should be visible immediately, even when starting without glasses.
      ...(category === 'glassesColor' && draft.glasses === 'none' ? { glasses: 'round' } : {}),
      ...(category === 'headwearColor' && draft.headwear === 'none' ? { headwear: 'straw' } : {}),
    }));
  }

  function undo() {
    if (busy.current || !history.length) return;
    setDraft(history[history.length - 1]);
    setHistory((current) => current.slice(0, -1));
    setError(null);
  }

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
          <AnimatedPressable accessibilityRole="button" accessibilityLabel="Annuler la dernière modification"
            accessibilityState={{ disabled: saving || !history.length }} disabled={saving || !history.length}
            onPress={undo} style={[styles.iconButton, !history.length && styles.disabled]}>
            <AppIcon icon={Undo2} size={21} color={color('#243147', 'text')} />
          </AnimatedPressable>
        </View>
        <ScrollView stickyHeaderIndices={[0]} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} ref={optionsScroll}>
          <View style={styles.studio}>
            <View style={styles.preview} accessibilityLabel="Aperçu de mon avatar" accessibilityRole="image">
              <UserAvatar avatar={draft} size={height < 700 ? 132 : 176} />
            </View>
            <AnimatedPressable accessibilityRole="button" accessibilityLabel="Avatar aléatoire" disabled={saving}
              onPress={() => change(randomAvatar())} haptic="selection" style={styles.shuffle}>
              <AppIcon icon={Shuffle} size={18} color={color('#267E70', 'success')} />
              <Text style={styles.shuffleText}>Surprends-moi</Text>
            </AnimatedPressable>
          </View>
          {onboarding && <ProfileJourneyProgress step={2} />}
          {onboarding && <Text style={styles.privacy}>Choisissez un avatar qui ne permet pas de vous reconnaître. Il n’a pas besoin de vous ressembler.</Text>}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
            {groups.map(({ id, label, features }) => (
              <AnimatedPressable key={id} accessibilityRole="tab" accessibilityLabel={label}
                aria-selected={groupId === id} accessibilityState={{ selected: groupId === id, disabled: saving }} disabled={saving}
                onPress={() => { setGroupId(id); if (features.length) setCategory(features[0].id); optionsScroll.current?.scrollTo({ y: 0, animated: false }); }}
                haptic="selection" style={[styles.tab, groupId === id && styles.activeTab]}>
                <Text style={[styles.tabText, groupId === id && styles.activeText]}>{label}</Text>
              </AnimatedPressable>
            ))}
          </ScrollView>
          {!!group.features.length && <View style={styles.features}>
            {group.features.map(({ id, label }) => (
              <AnimatedPressable key={id} accessibilityRole="tab" accessibilityLabel={label}
                aria-selected={category === id} accessibilityState={{ selected: category === id, disabled: saving }} disabled={saving}
                onPress={() => setCategory(id)} haptic="selection" style={[styles.feature, category === id && styles.activeFeature]}>
                <Text style={[styles.featureText, category === id && styles.activeFeatureText]}>{label}</Text>
              </AnimatedPressable>
            ))}
          </View>}
          {groupId === 'presets' ? (
            <View accessibilityRole="radiogroup" accessibilityLabel="Styles" style={styles.options}>
              {avatarPresets.map((preset) => {
                const selected = Object.keys(avatarOptions).every((key) => draft[key as AvatarFeature] === preset.avatar[key as AvatarFeature]);
                return <AnimatedPressable key={preset.id} accessibilityRole="radio" accessibilityLabel={preset.label}
                  aria-checked={selected} accessibilityState={{ checked: selected, disabled: saving }} disabled={saving}
                  onPress={() => change({ ...preset.avatar })} haptic="selection" style={[styles.option, styles.preset, selected && styles.selected]}>
                  <UserAvatar avatar={preset.avatar} size={92} />
                  <Text style={styles.optionLabel}>{preset.label}</Text>
                  {selected && <View style={styles.check}><AppIcon icon={Check} size={12} color="#FFFFFF" strokeWidth={3} /></View>}
                </AnimatedPressable>;
              })}
            </View>
          ) : (
            <View accessibilityRole="radiogroup" accessibilityLabel={group.features.find(({ id }) => id === category)!.label} style={styles.options}>
              {avatarOptions[category].map((option) => {
                const selected = draft[category] === option.id;
                return (
                  <AnimatedPressable key={`${category}-${option.id}`} accessibilityRole="radio"
                    accessibilityLabel={option.label} aria-checked={selected} accessibilityState={{ checked: selected, disabled: saving }}
                    disabled={saving} haptic="selection" onPress={() => selectOption(option.id)}
                    style={[styles.option, selected && styles.selected]}>
                    {'color' in option ? <View style={[styles.swatchRing, selected && styles.selectedSwatch]}>
                      <View style={[styles.swatch, { backgroundColor: option.color }]} />
                    </View> : <UserAvatar avatar={{ ...draft, [category]: option.id }} size={76} />}
                    <Text style={[styles.optionLabel, selected && styles.selectedLabel]}>{option.label}</Text>
                    {selected && <View style={styles.check}><AppIcon icon={Check} size={12} color="#FFFFFF" strokeWidth={3} /></View>}
                  </AnimatedPressable>
                );
              })}
            </View>
          )}
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
  header: { paddingHorizontal: 20, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  iconButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: color('#FFFFFF', 'surface'), borderWidth: 1, borderColor: color('#E9EDE5', 'border'), alignItems: 'center', justifyContent: 'center' },
  title: { flexShrink: 1, fontSize: 21, fontWeight: '700', color: color('#243147', 'text') },
  privacy: { paddingHorizontal: 24, fontSize: 15, lineHeight: 23, color: color('#69756C', 'secondary') },
  content: { paddingBottom: 24, gap: 16 },
  studio: { alignItems: 'center', gap: 10, paddingTop: 6, paddingBottom: 12, backgroundColor: color('#FAFBF8', 'background') },
  preview: { borderRadius: 100, padding: 6, backgroundColor: color('#FFFFFF', 'surface'), borderWidth: 1, borderColor: color('#E1E8DE', 'border'), boxShadow: '0px 6px 20px #243F3410' },
  shuffle: { minHeight: 40, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 20, backgroundColor: color('#EAF2EB', 'successSoft') },
  shuffleText: { fontSize: 13, fontWeight: '600', color: color('#267E70', 'success') },
  tabs: { gap: 6, paddingHorizontal: 20 },
  tab: { minHeight: 44, paddingHorizontal: 16, justifyContent: 'center', borderRadius: 22, backgroundColor: color('#FFFFFF', 'surface'), borderWidth: 1, borderColor: color('#E9EDE5', 'border') },
  activeTab: { backgroundColor: color('#243F34', 'success'), borderColor: color('#243F34', 'success') },
  tabText: { fontSize: 14, fontWeight: '600', color: color('#69756C', 'secondary') },
  activeText: { color: color('#FFFFFF', 'background') },
  features: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingHorizontal: 20 },
  feature: { minHeight: 44, paddingHorizontal: 12, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  activeFeature: { backgroundColor: color('#EAF2EB', 'successSoft') },
  featureText: { fontSize: 13, fontWeight: '500', color: color('#69756C', 'secondary') },
  activeFeatureText: { fontWeight: '700', color: color('#267E70', 'success') },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 20 },
  option: { width: '30%', flexGrow: 1, maxWidth: '32%', minHeight: 114, borderWidth: 2, borderColor: color('#E9EDE5', 'border'), borderRadius: 20, backgroundColor: color('#FFFFFF', 'surface'), alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10 },
  preset: { width: '46%', maxWidth: '49%', minHeight: 142 },
  selected: { borderColor: color('#267E70', 'success'), backgroundColor: color('#EDF7F1', 'successSoft') },
  swatchRing: { padding: 3, borderRadius: 32, borderWidth: 1.5, borderColor: 'transparent' },
  selectedSwatch: { borderColor: color('#267E70', 'success') },
  swatch: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, borderColor: '#00000012' },
  optionLabel: { fontSize: 12, fontWeight: '600', textAlign: 'center', color: color('#485469', 'secondary'), paddingHorizontal: 4 },
  selectedLabel: { color: color('#267E70', 'success') },
  check: { position: 'absolute', right: 5, top: 5, width: 20, height: 20, borderRadius: 10, backgroundColor: '#267E70', alignItems: 'center', justifyContent: 'center' },
  footer: { paddingHorizontal: 20, paddingVertical: 12, gap: 12, borderTopWidth: 1, borderColor: color('#E9EDE5', 'border'), backgroundColor: color('#FAFBF8', 'background') },
  save: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 27, backgroundColor: '#267E70' },
  saveText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  error: { color: color('#BA3540', 'accent'), fontSize: 13, textAlign: 'center' },
  disabled: { opacity: 0.4 },
}));
