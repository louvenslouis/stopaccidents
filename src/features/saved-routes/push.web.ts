export type RoutePushStatus =
  | "enabled"
  | "disabled"
  | "denied"
  | "unavailable"
  | "unconfigured";

export async function enableRoutePush(
  _userId: string,
  _requestPermission = true,
): Promise<boolean> {
  return false;
}

export async function disableRoutePush() {}

export async function getRoutePushStatus(
  _userId: string,
): Promise<RoutePushStatus> {
  return "unavailable";
}

export function subscribeToRoutePush(_listener: () => void) {
  return () => {};
}

export function notifyRoutePushReceived() {}
