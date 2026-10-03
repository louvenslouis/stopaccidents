import {
  disableDevicePush,
  enableDevicePush,
  getDevicePushStatus,
  type DevicePushStatus,
} from "@/features/safety-profile/push";

export type RoutePushStatus = DevicePushStatus;

export function enableRoutePush(userId: string, requestPermission = true) {
  return enableDevicePush(userId, "route", requestPermission);
}

export function disableRoutePush() {
  return disableDevicePush("route");
}

export function getRoutePushStatus(userId: string): Promise<RoutePushStatus> {
  return getDevicePushStatus(userId, "route");
}

const listeners = new Set<() => void>();

export function subscribeToRoutePush(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyRoutePushReceived() {
  for (const listener of listeners) listener();
}
