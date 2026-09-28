import { supabase } from '@/lib/supabase';

export async function readUserAlias(userId: string, signal?: AbortSignal): Promise<string> {
  const query = supabase
    .from('user_aliases')
    .select('alias')
    .eq('user_id', userId);
  const { data, error } = await (signal ? query.abortSignal(signal) : query).single();

  if (error || typeof data?.alias !== 'string' || !/^[A-Za-z][A-Za-z0-9]{3,39}$/.test(data.alias)) {
    throw new Error('Alias indisponible.');
  }

  return data.alias;
}
