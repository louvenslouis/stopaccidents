import { supabase } from "@/lib/supabase";

let pendingSession: Promise<string> | null = null;

/** Reading the feed and saving a report must share the same anonymous identity. */
export function ensureReportSession(): Promise<string> {
  if (!pendingSession) {
    pendingSession = getOrCreateSession().finally(() => {
      pendingSession = null;
    });
  }
  return pendingSession;
}

async function getOrCreateSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error)
    throw new Error("La connexion a expiré. Réessayez dans un instant.");
  if (data.session) return data.session.user.id;
  const result = await supabase.auth.signInAnonymously();
  if (result.error?.code === "anonymous_provider_disabled") {
    throw new Error(
      "L’accès sans compte n’est pas encore activé. Réessayez après son activation.",
    );
  }
  if (result.error || !result.data.user) {
    throw new Error(
      "Connexion impossible. Vérifiez votre connexion Internet et réessayez.",
    );
  }
  return result.data.user.id;
}
