import Constants from "expo-constants";
import { randomUUID } from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";
import { safetyRpc } from "./api";

const installationKey = "stopaccidents.safety-push-installation";
export type PushFeature = "safety" | "route";
export type DevicePushStatus =
  | "enabled"
  | "disabled"
  | "denied"
  | "unavailable"
  | "unconfigured";
const enabledKey = (feature: PushFeature) =>
  `stopaccidents.${feature}-push-enabled`;
function projectId() {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID
  );
}
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
  return enableDevicePush(userId, "safety", requestPermission);
}
export function enableDevicePush(
  userId: string,
  feature: PushFeature,
  requestPermission = true,
): Promise<boolean> {
  return serialize(() => registerPush(userId, feature, requestPermission));
}
async function registerPush(
  userId: string,
  feature: PushFeature,
  requestPermission: boolean,
): Promise<boolean> {
  if (
    !requestPermission &&
    (await SecureStore.getItemAsync(enabledKey(feature))) !== userId
  )
    return false;
  const { data: account, error: accountError } = await supabase.auth.getSession();
  if (accountError || account.session?.user.id !== userId || account.session.user.is_anonymous)
    return false;
  const api = await notifications();
  const project = projectId();
  if (!project) {
    if (!requestPermission) return false;
    throw new Error(
      "Les notifications push ne sont pas encore configurées pour cette version.",
    );
  }
  if (Platform.OS === "android")
    await api.setNotificationChannelAsync(`${feature}-alerts`, {
      name: feature === "route" ? "Alertes sur mes trajets" : "Alertes des proches",
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
  if (Platform.OS === "android") {
    const channel = await api.getNotificationChannelAsync(`${feature}-alerts`);
    if (channel?.importance === api.AndroidImportance.NONE) {
      if (!requestPermission) return false;
      throw new Error("Autorisez les notifications dans les réglages du téléphone.");
    }
  }
  const token = (await api.getExpoPushTokenAsync({ projectId: project })).data;
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
  await safetyRpc(`register_${feature}_push_device`, { p_id: id, p_token: token });
  await SecureStore.setItemAsync(enabledKey(feature), userId);
  return true;
}
export function disableSafetyPush() {
  return disableDevicePush("safety");
}
export function disableDevicePush(feature: PushFeature) {
  return serialize(async () => {
    const id = await SecureStore.getItemAsync(installationKey);
    // Keep consent locally until the server confirms revocation, so a failed
    // request can be retried instead of falsely claiming notifications stopped.
    if (id) await safetyRpc(`unregister_${feature}_push_device`, { p_id: id });
    await SecureStore.deleteItemAsync(enabledKey(feature));
  });
}
export async function getDevicePushStatus(
  userId: string,
  feature: PushFeature,
): Promise<DevicePushStatus> {
  if (Constants.executionEnvironment === "storeClient") return "unavailable";
  if (!projectId()) return "unconfigured";
  const api = await notifications();
  const permission = await api.getPermissionsAsync();
  if (
    !permission.granted &&
    permission.ios?.status !== api.IosAuthorizationStatus.PROVISIONAL
  )
    return permission.canAskAgain ? "disabled" : "denied";
  if (Platform.OS === "android") {
    const channel = await api.getNotificationChannelAsync(`${feature}-alerts`);
    if (channel?.importance === api.AndroidImportance.NONE) return "denied";
  }
  return (await SecureStore.getItemAsync(enabledKey(feature))) === userId
    ? "enabled"
    : "disabled";
}
export async function listenForSafetyPush(
  open: () => void,
  refresh: () => void,
  route?: { open: () => void; refresh: () => void },
) {
  const api = await notifications();
  let active = true;
  const handled = new Set<string>();
  const handle = (event: import("expo-notifications").NotificationResponse) => {
    if (!active) return false;
    const data = event.notification.request.content.data;
    const action =
      data?.type === "safety_alert"
        ? open
        : data?.type === "route_alert"
          ? route?.open
          : undefined;
    if (!action) return false;
    // Both APIs can report the same tap during a cold start.
    const key = `${event.notification.request.identifier}:${event.actionIdentifier}`;
    if (!handled.has(key)) {
      handled.add(key);
      action();
    }
    return true;
  };
  const response = api.addNotificationResponseReceivedListener((event) => {
    if (handle(event))
      void api.clearLastNotificationResponseAsync().catch(() => {});
  });
  const incoming = api.addNotificationReceivedListener((event) => {
    if (!active) return;
    if (event.request.content.data?.type === "safety_alert") refresh();
    if (event.request.content.data?.type === "route_alert") route?.refresh();
  });
  const token = api.addPushTokenListener(() => {
    if (active) refresh();
  });
  const dispose = () => {
    active = false;
    response.remove();
    incoming.remove();
    token.remove();
  };
  try {
    const last = await api.getLastNotificationResponseAsync();
    if (last && handle(last)) await api.clearLastNotificationResponseAsync();
    return dispose;
  } catch (error) {
    dispose();
    throw error;
  }
}
