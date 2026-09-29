import { useState } from 'react';
import type { User } from '@supabase/supabase-js';
import Pencil from 'lucide-react-native/icons/pencil';
import { StyleSheet } from 'react-native';
import { View } from '@/features/language/native';
import { parseAvatar, type AvatarConfig } from '@/features/profile/avatar';
import { AnimatedPressable } from './ui/animated-pressable';
import { AppIcon } from './ui/app-icon';
import { UserAvatar } from './user-avatar';
import { AvatarEditor } from './avatar-editor';

// The parent keys this component by user ID so a new account cannot inherit a draft.
export function ProfileAvatar({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<AvatarConfig | null>(null);
  if (user.is_anonymous) return null;
  const avatar = saved ?? parseAvatar(user.user_metadata?.avatar);
  return (
    <>
      <AnimatedPressable accessibilityRole="button" accessibilityLabel="Personnaliser mon avatar"
        haptic="light" onPress={() => setOpen(true)} style={styles.avatar}>
        <UserAvatar avatar={avatar} size={108} />
        <View style={styles.edit}><AppIcon icon={Pencil} size={14} color="#FFFFFF" /></View>
      </AnimatedPressable>
      {open && <AvatarEditor userId={user.id} initial={avatar} onSaved={setSaved} onClose={() => setOpen(false)} />}
    </>
  );
}

const styles = StyleSheet.create({
  avatar: { alignSelf: 'center', borderRadius: 54 },
  edit: { position: 'absolute', right: 0, bottom: 1, width: 30, height: 30, borderRadius: 15, backgroundColor: '#267E70', borderWidth: 3, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
});
