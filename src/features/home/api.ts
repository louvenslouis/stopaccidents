import { supabase } from "@/lib/supabase";
import {
  readSavedPlaces,
  type SavedPlaces,
} from "@/features/profile/saved-places";

export async function readHomePlaces(): Promise<SavedPlaces> {
  const { data, error } = await supabase.auth.getSession();
  if (error)
    throw new Error("Impossible de vérifier vos adresses enregistrées.");
  // The profile offers saved places to accounts with an email address.
  // Visitors should see the setup action, not a failed private-table request.
  if (!data.session?.user.email) return { home: null, work: null };
  return readSavedPlaces();
}
