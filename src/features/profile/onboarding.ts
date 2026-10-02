import { supabase } from '@/lib/supabase';

export type OnboardingStep = 'alias' | 'avatar' | 'complete';

export function validateAlias(value: string): string | null {
  return value.length >= 4 && value.length <= 40 && /^[a-z]/.test(value) && !/[^a-z0-9]/.test(value) ? null
    : 'Utilisez 4 à 40 lettres minuscules (a-z) ou chiffres, sans espaces, en commençant par une lettre.';
}

export async function readOnboarding(userId: string, signal?: AbortSignal): Promise<{ alias: string; step: OnboardingStep }> {
  const query = supabase.from('user_aliases').select('alias,onboarding_step').eq('user_id', userId);
  const { data, error } = await (signal ? query.abortSignal(signal) : query).single();
  if (error || !data || typeof data.alias !== 'string' || validateAlias(data.alias) || !['alias', 'avatar', 'complete'].includes(data.onboarding_step)) {
    throw new Error('Impossible de charger votre profil. Réessayez.');
  }
  return { alias: data.alias, step: data.onboarding_step as OnboardingStep };
}

export async function suggestAlias(): Promise<string> {
  const { data, error } = await supabase.rpc('suggest_user_alias');
  if (error || typeof data !== 'string' || validateAlias(data)) {
    throw new Error('Impossible de générer un alias. Réessayez.');
  }
  return data;
}

export async function isAliasAvailable(alias: string, signal?: AbortSignal): Promise<boolean> {
  if (validateAlias(alias)) return false;
  const query = supabase.rpc('is_user_alias_available', { p_alias: alias });
  const { data, error } = await (signal ? query.abortSignal(signal) : query);
  if (error || typeof data !== 'boolean') throw new Error('Impossible de vérifier cet alias. Réessayez.');
  return data;
}

export async function saveOnboarding(userId: string, step: OnboardingStep, alias?: string): Promise<void> {
  if (alias !== undefined) {
    const error = validateAlias(alias);
    if (error) throw new Error(error);
  }
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || sessionData.session?.user.id !== userId || sessionData.session.user.is_anonymous) {
    throw new Error('Votre session a changé. Rouvrez votre profil.');
  }
  const { data, error } = await supabase.from('user_aliases')
    .update({ onboarding_step: step, ...(alias === undefined ? {} : { alias }) })
    .eq('user_id', userId).select('user_id').single();
  if (error?.code === '23505') throw new Error('Cet alias est déjà utilisé. Choisissez-en un autre ou générez-en un.');
  if (error || data?.user_id !== userId) throw new Error('Impossible d’enregistrer votre profil. Réessayez.');
}
