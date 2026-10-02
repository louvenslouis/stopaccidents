import { ProfileJourneyArt, ProfileJourneyProgress } from './profile-journey-art';
import { useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ArrowRight from 'lucide-react-native/icons/arrow-right';
import Shuffle from 'lucide-react-native/icons/shuffle';
import X from 'lucide-react-native/icons/x';
import { ScrollView, Text, TextInput, View } from '@/features/language/native';
import { createThemedStyles, useAppTheme, useThemeColor } from '@/features/appearance/theme-provider';
import { parseAvatar, type AvatarConfig } from '@/features/profile/avatar';
import { saveAvatar } from '@/features/profile/avatar-api';
import { isAliasAvailable, validateAlias, readOnboarding, saveOnboarding, suggestAlias, type OnboardingStep } from '@/features/profile/onboarding';
import { AnimatedPressable } from './ui/animated-pressable';
import { AppIcon } from './ui/app-icon';
import { AvatarEditor } from './avatar-editor';

export function AccountSetup({ user, onUpdated, presentationReady = true }: {
  user: User; onUpdated: () => void; presentationReady?: boolean;
}) {
  const styles = useStyles();
  const color = useThemeColor();
  const { scheme } = useAppTheme();
  const [step, setStep] = useState<OnboardingStep | null>(null);
  const [alias, setAlias] = useState('');
  const [avatar, setAvatar] = useState(() => parseAvatar(user.user_metadata?.avatar));
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState(false);
  const [availability, setAvailability] = useState<{ value: string; status: 'available' | 'taken' | 'error' } | null>(null);
  const [checkAttempt, setCheckAttempt] = useState(0);
  const validation = alias ? validateAlias(alias) : null;
  const aliasStatus = availability?.value === alias ? availability.status : 'checking';
  const canContinue = !!alias && !validation && aliasStatus === 'available';
  const busy = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    void readOnboarding(user.id, controller.signal).then((profile) => {
      if (controller.signal.aborted) return;
      setStep(profile.step);
      // Leave the first alias blank so the user chooses or generates it explicitly.
      setAlias(profile.step === 'alias' ? '' : profile.alias);
      setOpen(profile.step !== 'complete');
      setError(null);
    }).catch((cause) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Impossible de charger votre profil. Réessayez.');
    });
    return () => { alive.current = false; controller.abort(); };
  }, [user.id, attempt]);

  useEffect(() => {
    if (!open || step !== 'alias' || !alias || validation) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      void isAliasAvailable(alias, controller.signal).then((available) => {
        if (!controller.signal.aborted) setAvailability({ value: alias, status: available ? 'available' : 'taken' });
      }).catch(() => {
        if (!controller.signal.aborted) setAvailability({ value: alias, status: 'error' });
      });
    }, 350);
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [alias, user.id, validation, open, step, checkAttempt]);

  async function chooseAlias(generate: boolean) {
    if (busy.current || (!generate && !canContinue)) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      if (generate) {
        const suggestion = await suggestAlias();
        if (alive.current) { setAvailability(null); setAlias(suggestion); setCheckAttempt((value) => value + 1); }
      } else {
        await saveOnboarding(user.id, 'avatar', alias);
        if (alive.current) { setStep('avatar'); onUpdated(); }
      }
    } catch (cause) {
      if (alive.current) {
        setError(cause instanceof Error ? cause.message : 'Impossible d’enregistrer votre profil. Réessayez.');
        if (!generate) { setAvailability(null); setCheckAttempt((value) => value + 1); }
      }
    } finally {
      busy.current = false;
      if (alive.current) setPending(false);
    }
  }

  async function finish(draft: AvatarConfig) {
    busy.current = true;
    try {
      const saved = await saveAvatar(user.id, draft);
      // A failed completion write leaves the avatar step resumable.
      await saveOnboarding(user.id, 'complete');
      return saved;
    } finally { busy.current = false; }
  }

  if (step === 'complete') return null;
  if (!step) return error ? (
    <AnimatedPressable accessibilityRole="button" accessibilityLabel="Réessayer de charger mon profil"
      onPress={() => { setError(null); setAttempt((value) => value + 1); }} style={styles.resume}>
      <Text style={styles.error}>{error}</Text>
    </AnimatedPressable>
  ) : null;

  return (
    <>
      <AnimatedPressable accessibilityRole="button" accessibilityLabel="Terminer mon profil"
        onPress={() => { setAvailability(null); setOpen(true); }} style={styles.resume}>
        <Text style={styles.resumeText}>Terminer mon profil</Text>
      </AnimatedPressable>
      <Modal visible={open && presentationReady} animationType="slide" presentationStyle="fullScreen"
        onRequestClose={() => { if (!busy.current) setOpen(false); }}>
        {step === 'avatar' ? (
          <AvatarEditor embedded onboarding userId={user.id} initial={avatar}
            onClose={() => { setAvailability(null); setStep('alias'); setError(null); }} onSave={finish}
            onSaved={(saved) => {
              if (!alive.current) return;
              setAvatar(saved); setStep('complete'); setOpen(false); onUpdated();
            }} />
        ) : (
          <SafeAreaView style={styles.screen}>
            <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={styles.container}>
                <View style={styles.header}>
                  <View style={styles.handle} />
                  <AnimatedPressable accessibilityRole="button" accessibilityLabel="Fermer la configuration du profil"
                    disabled={pending} onPress={() => setOpen(false)} style={styles.close}>
                    <AppIcon icon={X} size={22} color={color('#243147', 'text')} />
                  </AnimatedPressable>
                </View>
                <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
                  <ProfileJourneyProgress step={1} />
                  <ProfileJourneyArt kind="alias" />
                  <Text accessibilityRole="header" style={styles.title}>Choisir un alias</Text>
                  <Text style={styles.description}>N’utilisez pas votre vrai nom ni une information qui permet de vous identifier. Choisissez un alias pour rester anonyme.</Text>
                  <View style={styles.field}>
                    <Text style={styles.label}>Alias</Text>
                    <TextInput accessibilityLabel="Alias" value={alias} onChangeText={(value) => {
                      const next = value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
                      if (next !== alias) { setAvailability(null); setAlias(next); }
                      setError(null);
                    }}
                      autoCapitalize="none" autoCorrect={false} maxLength={40} editable={!pending}
                      placeholder="Votre alias" placeholderTextColor={color('#89919E', 'muted')}
                      keyboardAppearance={scheme} returnKeyType="next" onSubmitEditing={() => void chooseAlias(false)}
                      style={styles.input} />
                    {!!alias && <Text accessibilityLiveRegion="polite"
                      style={validation || aliasStatus === 'taken' || aliasStatus === 'error' ? styles.error : styles.aliasStatus}>
                      {validation ?? (aliasStatus === 'available' ? 'Alias disponible' : aliasStatus === 'taken'
                        ? 'Cet alias est déjà utilisé.' : aliasStatus === 'error'
                          ? 'Impossible de vérifier cet alias. Réessayez.' : 'Vérification de l’alias…')}
                    </Text>}
                    {!validation && aliasStatus === 'error' && <AnimatedPressable accessibilityRole="button"
                      accessibilityLabel="Réessayer la vérification de l’alias" onPress={() => {
                        setAvailability(null); setCheckAttempt((value) => value + 1);
                      }} style={styles.generate}><Text style={styles.generateText}>Réessayer</Text></AnimatedPressable>}
                  </View>
                  <AnimatedPressable accessibilityRole="button" accessibilityLabel="Générer un alias" disabled={pending}
                    haptic="selection" onPress={() => void chooseAlias(true)} style={[styles.generate, pending && styles.disabled]}>
                    <AppIcon icon={Shuffle} size={20} color={color('#267E70', 'success')} />
                    <Text style={styles.generateText}>Générer un alias</Text>
                  </AnimatedPressable>
                  {error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
                </ScrollView>
                <View style={styles.footer}>
                  <AnimatedPressable accessibilityRole="button" accessibilityLabel="Continuer vers mon avatar"
                    disabled={pending || !canContinue} accessibilityState={{ disabled: pending || !canContinue, busy: pending }}
                    haptic="light" onPress={() => void chooseAlias(false)} style={[styles.next, (pending || !canContinue) && styles.disabled]}>
                    {pending ? <ActivityIndicator color="#FFFFFF" /> : <><Text style={styles.nextText}>Continuer</Text><AppIcon icon={ArrowRight} size={20} color="#FFFFFF" /></>}
                  </AnimatedPressable>
                </View>
              </View>
            </KeyboardAvoidingView>
          </SafeAreaView>
        )}
      </Modal>
    </>
  );
}

const useStyles = createThemedStyles((color) => StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: color('#FAFBF8', 'background') },
  container: { flex: 1, width: '100%', maxWidth: 540, alignSelf: 'center' },
  header: { padding: 16, alignItems: 'flex-end' },
  handle: { position: 'absolute', top: 12, alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: color('#D8DDD7', 'border') },
  close: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: color('#FFFFFF', 'surface') },
  content: { padding: 24, paddingTop: 0, gap: 18 },
  title: { fontSize: 30, fontWeight: '700', color: color('#243147', 'text') },
  description: { fontSize: 16, lineHeight: 25, color: color('#69756C', 'secondary') },
  field: { gap: 10, marginTop: 12 },
  label: { fontSize: 14, fontWeight: '600', color: color('#243147', 'text') },
  input: { minHeight: 58, paddingHorizontal: 18, borderRadius: 18, borderWidth: 1, borderColor: color('#D8DDD7', 'border'), backgroundColor: color('#FFFFFF', 'surface'), fontSize: 18, color: color('#243147', 'text') },
  generate: { minHeight: 52, flexDirection: 'row', gap: 10, justifyContent: 'center', alignItems: 'center', borderRadius: 26, backgroundColor: color('#EDF7F1', 'successSoft') },
  generateText: { color: color('#267E70', 'success'), fontSize: 15, fontWeight: '600' },
  footer: { padding: 24 },
  next: { minHeight: 56, borderRadius: 28, backgroundColor: '#267E70', flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center' },
  nextText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  error: { color: color('#BA3540', 'accent'), fontSize: 14, lineHeight: 21 },
  aliasStatus: { color: color('#267E70', 'success'), fontSize: 14, lineHeight: 21 },
  disabled: { opacity: 0.5 },
  resume: { padding: 16, alignItems: 'center', backgroundColor: color('#EDF7F1', 'successSoft') },
  resumeText: { color: color('#267E70', 'success'), fontWeight: '600', fontSize: 15 },
}));
