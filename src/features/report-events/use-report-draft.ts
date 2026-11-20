import { TestimonyContext } from './testimony-context';
import { useContext, useEffect, useRef, useState } from "react";
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

function hasProgress<D extends EventDraft>(saved: Snapshot<D>) {
  return saved.step > 0 || saved.savedSteps > 0 || Object.entries(saved.draft).some(
    ([field, value]) => field !== 'id' && (Array.isArray(value) ? value.length > 0 : Boolean(value)),
  );
}

function restorePhotos<D extends EventDraft>(draft: D) {
  // A camera or blob URL can expire while the encrypted photo bytes remain valid.
  const restored = { ...draft } as D & { photo?: { base64: string; uri: string } | null };
  if (restored.photos) restored.photos = restored.photos.map(photo => ({
    ...photo, uri: `data:image/jpeg;base64,${photo.base64}`,
  }));
  if (restored.photo) restored.photo = {
    ...restored.photo, uri: `data:image/jpeg;base64,${restored.photo.base64}`,
  };
  return restored;
}

function write(key: string, value: string | null) {
  const next = (writes.get(key) ?? Promise.resolve())
    .catch(() => {})
    .then(() => value === null ? draftStorage.removeItem(key) : draftStorage.setItem(key, value));
  writes.set(key, next);
  return next;
}
export function useReportDraft<D extends EventDraft>(
  kind: ReportKind,
  makeDraft: () => D,
  active: boolean,
) {
  const testimony = useContext(TestimonyContext);
  const source = testimony?.report_kind === kind ? testimony : null;
  const [draft, setDraft] = useState<D>(makeDraft);
  const [step, setStep] = useState(0);
  const [savedSteps, setSavedSteps] = useState(0);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [previousDraft, setPreviousDraft] = useState<Snapshot<D> | null>(null);
  const [ready, setReady] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const key = useRef<string | null>(null);
  const owner = useRef<string | null>(null);
  const hasStoredDraft = useRef(false);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (owner.current && owner.current !== session?.user.id) {
        key.current = null;
        owner.current = null;
        setReady(false);
        setDiscarding(false);
        setDraft(makeDraft());
        setStep(0);
        setSavedSteps(0);
        setReceipt(null);
        setPreviousDraft(null);
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
        const storageKey = `stopaccidents.draft.${userId}.${kind}${source ? `.testimony.${source.id}` : ''}`;
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
        if (!source) {
          setPreviousDraft(saved && !saved.receipt && hasProgress(saved) ? saved : null);
        } else if (saved && !saved.receipt && saved.draft.sourceReportId === source.id) {
          setDraft(restorePhotos(saved.draft));
          setStep(saved.step);
          setSavedSteps(saved.savedSteps);
        } else {
          if (source.latitude === null || source.longitude === null) throw new Error('Missing location');
          setDraft({ ...makeDraft(), sourceReportId: source.id,
            eventId: source.event_id, eventChoiceMade: true,
            location: source.location_description, locationHint: '',
            locationSource: 'manual', occurredAt: new Date().toISOString(), minutesAgo: 0,
            coordinates: { latitude: source.latitude, longitude: source.longitude, accuracy: null },
          });
          setStep(1);
          setSavedSteps(0);
          setReceipt(null);
        }
        key.current = storageKey;
        owner.current = userId;
        hasStoredDraft.current = saved !== null;
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
  }, [active, ready, kind, retry, source, makeDraft]);
  useEffect(() => {
    // Opening a new report leaves an existing draft available until the user chooses.
    if (!ready || !key.current || previousDraft) return;
    const snapshot: Snapshot<D> = {
      version: 1,
      draft,
      step,
      savedSteps,
      receipt,
    };
    const value = receipt || hasProgress(snapshot) ? JSON.stringify(snapshot) : null;
    if (value === null && !hasStoredDraft.current) return;
    hasStoredDraft.current = value !== null;
    void write(key.current, value)
      .then(() => setStorageError(null))
      .catch(() =>
        setStorageError(
          "Le brouillon n’a pas pu être sauvegardé sur cet appareil. Réessayez.",
        ),
      );
  }, [draft, step, savedSteps, receipt, ready, previousDraft]);
  const storageKey = key.current;
  async function discardDraft(onDiscarded: () => void) {
    if (!ready || !storageKey || key.current !== storageKey) return;
    const userId = owner.current;
    // Invalidate pending checkpoints and prevent autosaves from following this deletion.
    key.current = null;
    setDiscarding(true);
    try {
      await write(storageKey, null);
    } catch (error) {
      if (owner.current !== userId) return;
      key.current = storageKey;
      throw error;
    } finally {
      if (owner.current === userId) setDiscarding(false);
    }
    if (owner.current !== userId) return;
    hasStoredDraft.current = false;
    setPreviousDraft(null);
    setReady(false);
    onDiscarded();
  }
  function resumeDraft() {
    if (!previousDraft || !storageKey || key.current !== storageKey) return;
    setDraft(restorePhotos(previousDraft.draft));
    setStep(previousDraft.step);
    setSavedSteps(previousDraft.savedSteps);
    setPreviousDraft(null);
  }
  async function checkpoint(nextDraft: D = draft) {
    if (!ready || !storageKey || key.current !== storageKey)
      throw new Error("Patientez pendant la restauration du brouillon.");
    const { data } = await supabase.auth.getSession();
    if (key.current !== storageKey || data.session?.user.id !== owner.current)
      throw new Error("La session a changé. Rouvrez le formulaire.");
    await write(
      storageKey,
      JSON.stringify({
        version: 1,
        draft: nextDraft,
        step,
        savedSteps,
        receipt,
      }),
    );
    if (key.current !== storageKey)
      throw new Error("La session a changé. Rouvrez le formulaire.");
    hasStoredDraft.current = true;
    setPreviousDraft(null);
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
    discardDraft,
    discarding,
    resumeDraft: previousDraft ? resumeDraft : undefined,
    retryStorage: () => setRetry((value) => value + 1),
  };
}
