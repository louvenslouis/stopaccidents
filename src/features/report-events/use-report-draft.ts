import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ensureReporter, type EventDraft, type ReportKind } from "./api";
import { draftStorage } from "./draft-storage";

type Snapshot<D> = {
  version: 1;
  draft: D;
  step: number;
  savedSteps: number;
  receipt: string | null;
};
const writes = new Map<string, Promise<void>>();
function write(key: string, value: string) {
  const next = (writes.get(key) ?? Promise.resolve())
    .catch(() => {})
    .then(() => draftStorage.setItem(key, value));
  writes.set(key, next);
  return next;
}
export function useReportDraft<D extends EventDraft>(
  kind: ReportKind,
  makeDraft: () => D,
  active: boolean,
) {
  const [draft, setDraft] = useState<D>(makeDraft);
  const [step, setStep] = useState(0);
  const [savedSteps, setSavedSteps] = useState(0);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const key = useRef<string | null>(null);
  const owner = useRef<string | null>(null);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (owner.current && owner.current !== session?.user.id) {
        key.current = null;
        owner.current = null;
        setReady(false);
        setDraft(makeDraft());
        setStep(0);
        setSavedSteps(0);
        setReceipt(null);
      }
    });
    return () => data.subscription.unsubscribe();
  }, [makeDraft]);
  useEffect(() => {
    if (!active || ready) return;
    let cancelled = false;
    void (async () => {
      let userId: string;
      try {
        userId = await ensureReporter();
      } catch (error) {
        if (!cancelled)
          setStorageError(
            error instanceof Error
              ? error.message
              : "Connexion impossible. Réessayez pour reprendre votre signalement.",
          );
        return;
      }
      try {
        const storageKey = `stopaccidents.draft.${userId}.${kind}`;
        await writes.get(storageKey)?.catch(() => {});
        const value = await draftStorage.getItem(storageKey);
        const saved: Snapshot<D> | null = value ? JSON.parse(value) : null;
        if (
          saved &&
          (saved.version !== 1 ||
            !saved.draft?.id ||
            !Number.isInteger(saved.step) ||
            !Number.isInteger(saved.savedSteps))
        )
          throw new Error("Invalid draft");
        const { data: currentSession } = await supabase.auth.getSession();
        if (currentSession.session?.user.id !== userId)
          throw new Error("Session changed during restoration");
        if (cancelled) return;
        if (saved) {
          // Base64 survives temporary camera/blob URLs and can be previewed after restart.
          const restored = saved.draft as D & {
            photos?: { base64: string; uri: string }[];
            photo?: { base64: string; uri: string } | null;
          };
          for (const photo of [
            ...(restored.photos ?? []),
            ...(restored.photo ? [restored.photo] : []),
          ])
            photo.uri = `data:image/jpeg;base64,${photo.base64}`;
          setDraft(restored);
          setStep(saved.step);
          setSavedSteps(saved.savedSteps);
          setReceipt(saved.receipt);
        }
        key.current = storageKey;
        owner.current = userId;
        setStorageError(null);
        setReady(true);
      } catch {
        if (!cancelled)
          setStorageError(
            "Impossible de restaurer le brouillon. Réessayez avant de continuer.",
          );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, ready, kind, retry]);
  useEffect(() => {
    if (!ready || !key.current) return;
    const value = JSON.stringify({
      version: 1,
      draft,
      step,
      savedSteps,
      receipt,
    });
    void write(key.current, value)
      .then(() => setStorageError(null))
      .catch(() =>
        setStorageError(
          "Le brouillon n’a pas pu être sauvegardé sur cet appareil. Réessayez.",
        ),
      );
  }, [draft, step, savedSteps, receipt, ready]);
  async function checkpoint(nextDraft: D = draft) {
    if (!ready || !key.current)
      throw new Error("Patientez pendant la restauration du brouillon.");
    const { data } = await supabase.auth.getSession();
    if (data.session?.user.id !== owner.current)
      throw new Error("La session a changé. Rouvrez le formulaire.");
    await write(
      key.current,
      JSON.stringify({
        version: 1,
        draft: nextDraft,
        step,
        savedSteps,
        receipt,
      }),
    );
  }
  return {
    draft,
    setDraft,
    step,
    setStep,
    savedSteps,
    setSavedSteps,
    receipt,
    setReceipt,
    ready,
    storageError,
    checkpoint,
    retryStorage: () => setRetry((value) => value + 1),
  };
}
