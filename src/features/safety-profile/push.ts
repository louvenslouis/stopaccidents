import Constants from "expo-constants";
import { randomUUID } from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";
import { safetyRpc } from "./api";

const installationKey = "stopaccidents.safety-push-installation";
const enabledKey = "stopaccidents.safety-push-enabled";
let initialized = false;
let pending: Promise<unknown> = Promise.resolve();
function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const next = pending.catch(() => undefined).then(operation);
  pending = next;
  return next;
}
async function notifications() {
  if (Constants.executionEnvironment === "storeClient")
    throw new Error(
      "Les notifications push nécessitent une version installée de l’application.",
    );
  const api = await import("expo-notifications");
  if (!initialized) {
    api.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    initialized = true;
  }
  return api;
}
export function enableSafetyPush(
  userId: string,
  requestPermission = true,
): Promise<boolean> {
  return serialize(() => registerPush(userId, requestPermission));
}
async function registerPush(
  userId: string,
  requestPermission: boolean,
): Promise<boolean> {
  if (
    !requestPermission &&
    (await SecureStore.getItemAsync(enabledKey)) !== userId
  )
    return false;
  const api = await notifications();
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  if (!projectId) {
    if (!requestPermission) return false;
    throw new Error(
      "Les notifications push ne sont pas encore configurées pour cette version.",
    );
  }
  if (Platform.OS === "android")
    await api.setNotificationChannelAsync("safety-alerts", {
      name: "Alertes des proches",
      importance: api.AndroidImportance.HIGH,
      lockscreenVisibility: api.AndroidNotificationVisibility.PRIVATE,
    });
  let permission = await api.getPermissionsAsync();
  if (!permission.granted && requestPermission)
    permission = await api.requestPermissionsAsync();
  if (
    !permission.granted &&
    permission.ios?.status !== api.IosAuthorizationStatus.PROVISIONAL
  ) {
    if (requestPermission)
      throw new Error(
        "Autorisez les notifications dans les réglages du téléphone.",
      );
    return false;
  }
  const token = (await api.getExpoPushTokenAsync({ projectId })).data;
  let id = await SecureStore.getItemAsync(installationKey);
  if (!id) {
    id = randomUUID();
    await SecureStore.setItemAsync(installationKey, id);
  }
  const { data, error } = await supabase.auth.getSession();
  if (
    error ||
    data.session?.user.id !== userId ||
    data.session.user.is_anonymous
  )
    return false;
  await safetyRpc("register_safety_push_device", { p_id: id, p_token: token });
  await SecureStore.setItemAsync(enabledKey, userId);
  return true;
}
export function disableSafetyPush() {
  return serialize(async () => {
    await SecureStore.deleteItemAsync(enabledKey);
    const id = await SecureStore.getItemAsync(installationKey);
    if (id) await safetyRpc("unregister_safety_push_device", { p_id: id });
  });
}
export async function listenForSafetyPush(
  open: () => void,
  refresh: () => void,
) {
  const api = await notifications();
  let active = true;
  const handle = (data: Record<string, unknown> | undefined) => {
    if (active && data?.type === "safety_alert") open();
  };
  const response = api.addNotificationResponseReceivedListener((event) =>
    handle(event.notification.request.content.data),
  );
  const incoming = api.addNotificationReceivedListener((event) => {
    if (event.request.content.data?.type === "safety_alert") refresh();
  });
  const token = api.addPushTokenListener(() => refresh());
  const last = await api.getLastNotificationResponseAsync();
  if (last) {
    handle(last.notification.request.content.data);
    await api.clearLastNotificationResponseAsync();
  }
  return () => {
    active = false;
    response.remove();
    incoming.remove();
    token.remove();
  };
}
