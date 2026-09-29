import { supabase } from '@/lib/supabase';
import { parseAvatar, type AvatarConfig } from './avatar';

export async function saveAvatar(userId: string, avatar: AvatarConfig): Promise<AvatarConfig> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || sessionData.session?.user.id !== userId) {
    throw new Error('Votre session a changé. Rouvrez votre profil.');
  }
  if (sessionData.session.user.is_anonymous) {
    throw new Error('Créez un compte pour personnaliser votre avatar.');
  }
  const { data, error } = await supabase.auth.updateUser({
    data: { avatar: parseAvatar(avatar) },
  });
  if (error || !data.user || data.user.id !== userId) {
    throw new Error('Impossible d’enregistrer votre avatar. Réessayez.');
  }
  return parseAvatar(data.user.user_metadata.avatar);
}
