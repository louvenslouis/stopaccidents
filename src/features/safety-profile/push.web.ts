export async function enableSafetyPush(
  _userId: string,
  _requestPermission = true,
): Promise<boolean> {
  return false;
}
export async function disableSafetyPush() {}
export async function listenForSafetyPush(
  _open: () => void,
  _refresh: () => void,
) {
  return () => {};
}
