import { supabase } from '@/lib/supabase';

export type Connection = {
  id: string;
  alias: string;
  status: 'pending' | 'accepted';
  direction: 'incoming' | 'outgoing';
  created_at: string;
};
export type ConnectionsSnapshot = { alias: string; connections: Connection[] };
export type ConnectionAction = 'accept' | 'decline' | 'cancel';

const errors: Record<string, string> = {
  connection_account_required: 'Connectez-vous pour ajouter vos proches.',
  connection_invalid_alias: 'Saisissez un alias valide.',
  connection_alias_not_found: 'Aucun compte trouvé avec cet alias.',
  connection_self_invitation: 'Vous ne pouvez pas vous inviter vous-même.',
  connection_already_exists: 'Une invitation ou une connexion existe déjà avec cet alias.',
  connection_invitation_unavailable: 'Cette invitation n’est plus disponible.',
};

function requestError(error: { message: string }, fallback: string) {
  return new Error(errors[error.message] ?? fallback);
}

export async function readConnections(signal?: AbortSignal): Promise<ConnectionsSnapshot> {
  const query = supabase.rpc('read_my_connections');
  const { data, error } = await (signal ? query.abortSignal(signal) : query);
  if (error) throw requestError(error, 'Impossible de charger vos proches.');
  if (!data || typeof data.alias !== 'string' || !Array.isArray(data.connections)) {
    throw new Error('Impossible de charger vos proches.');
  }
  return data as ConnectionsSnapshot;
}

export async function inviteConnection(alias: string): Promise<void> {
  const value = alias.trim().replace(/^@/, '');
  if (!/^[A-Za-z][A-Za-z0-9]{3,39}$/.test(value)) {
    throw new Error(errors.connection_invalid_alias);
  }
  const { error } = await supabase.rpc('invite_connection', { p_alias: value });
  if (error) throw requestError(error, 'Impossible d’envoyer l’invitation.');
}

export async function respondConnection(id: string, action: ConnectionAction): Promise<void> {
  const { error } = await supabase.rpc('respond_connection', { p_id: id, p_action: action });
  if (error) throw requestError(error, 'Impossible de modifier l’invitation.');
}
