import { supabase } from "@/lib/supabase";
import { decode } from "base64-arraybuffer";
import { randomUUID } from "expo-crypto";
import {
  validateRecord,
  type SafetyAlert,
  type SafetyProfile,
  type SafetyRecord,
} from "./model";

const errors: Record<string, string> = {
  connection_account_required:
    "Connectez-vous pour accéder à vos informations confidentielles.",
  safety_invalid_record: "Vérifiez le numéro, le type et la couleur.",
  safety_record_unavailable: "Cet enregistrement n’est plus disponible.",
  safety_record_limit:
    "Vous pouvez enregistrer dix véhicules et une carte d’identité.",
  safety_duplicate_record: "Ce numéro est déjà enregistré dans votre profil.",
  safety_photo_unavailable:
    "La photo de la carte n’est pas disponible. Réessayez.",
};
export async function safetyRpc<T>(
  name: string,
  args = {},
  signal?: AbortSignal,
): Promise<T> {
  const query = supabase.rpc(name, args);
  const { data, error } = await (signal ? query.abortSignal(signal) : query);
  if (error)
    throw new Error(
      errors[error.message] ??
        "Impossible de terminer cette opération. Réessayez.",
    );
  return data as T;
}
async function requireAccount(userId: string) {
  const { data, error } = await supabase.auth.getSession();
  if (
    error ||
    data.session?.user.id !== userId ||
    data.session.user.is_anonymous
  ) {
    throw new Error("Votre session a changé. Rouvrez votre profil.");
  }
}
export const readSafetyProfile = (signal?: AbortSignal) =>
  safetyRpc<SafetyProfile>("read_safety_profile", {}, signal);
export const readSafetyAlerts = (signal?: AbortSignal) =>
  safetyRpc<SafetyAlert[]>("read_safety_alerts", {}, signal);
export async function setSafetyAlertsEnabled(userId: string, enabled: boolean) {
  await requireAccount(userId);
  await safetyRpc("set_safety_alerts_enabled", { p_enabled: enabled });
}
export async function saveSafetyRecord(
  userId: string,
  record: SafetyRecord,
  photoBase64: string | null,
) {
  const error = validateRecord(record);
  if (error) throw new Error(error);
  await requireAccount(userId);
  let path = record.photo_path;
  let uploaded: string | null = null;
  try {
    if (photoBase64) {
      const bytes = decode(photoBase64);
      const signature = new Uint8Array(bytes, 0, Math.min(3, bytes.byteLength));
      if (
        bytes.byteLength > 6 * 1024 * 1024 ||
        signature[0] !== 255 ||
        signature[1] !== 216 ||
        signature[2] !== 255
      ) {
        throw new Error("Choisissez une photo JPEG de moins de 6 Mo.");
      }
      uploaded = `${userId}/${randomUUID()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("identity-cards")
        .upload(uploaded, bytes, { contentType: "image/jpeg", upsert: false });
      if (uploadError)
        throw new Error("Impossible d’envoyer la photo. Réessayez.");
      path = uploaded;
    }
    await requireAccount(userId);
    await safetyRpc("save_safety_record", {
      p_id: record.id,
      p_kind: record.kind,
      p_value: record.value,
      p_vehicle_type: record.vehicle_type,
      p_color: record.color,
      p_photo_path: path,
    });
    if (uploaded && record.photo_path) await cleanPhoto(record.photo_path);
  } catch (cause) {
    // RLS refuses removal if a lost response hid a successful save.
    if (uploaded) await cleanPhoto(uploaded);
    throw cause;
  }
}
async function cleanPhoto(path: string) {
  await supabase.storage
    .from("identity-cards")
    .remove([path])
    .catch(() => undefined);
}
export async function deleteSafetyRecord(userId: string, record: SafetyRecord) {
  await requireAccount(userId);
  await safetyRpc("delete_safety_record", { p_id: record.id });
  if (record.photo_path) await cleanPhoto(record.photo_path);
}
export async function readIdentityPhoto(path: string) {
  const { data, error } = await supabase.storage
    .from("identity-cards")
    .createSignedUrl(path, 60);
  if (error || !data) throw new Error("Impossible d’ouvrir la photo.");
  return data.signedUrl;
}
