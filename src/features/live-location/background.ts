import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '@/lib/supabase';
import { publishLocation, type ShareSession } from './api';

const TASK = 'stopaccidents-live-location';
const KEY = 'stopaccidents.live-location';
const OPTIONS = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

export async function savedShare(): Promise<ShareSession | null> {
  const raw = await SecureStore.getItemAsync(KEY, OPTIONS);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
export async function saveShare(session: ShareSession | null) {
  if (session) await SecureStore.setItemAsync(KEY, JSON.stringify(session), OPTIONS);
  else await SecureStore.deleteItemAsync(KEY, OPTIONS);
}
export async function stopBackground() {
  if (await Location.hasStartedLocationUpdatesAsync(TASK)) await Location.stopLocationUpdatesAsync(TASK);
}
export async function startBackground(title: string): Promise<boolean> {
  if (!await TaskManager.isAvailableAsync()) return false;
  if (!(await Location.requestBackgroundPermissionsAsync()).granted) return false;
  await Location.startLocationUpdatesAsync(TASK, {
    accuracy: Location.Accuracy.High, distanceInterval: 0, timeInterval: 5000,
    deferredUpdatesInterval: 5000, pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: { notificationTitle: 'Stop Accidents', notificationBody: title, killServiceOnDestroy: true },
  });
  return true;
}

async function clearFinishedShare(session: ShareSession | null) {
  // A callback from the replaced session must not stop its successor.
  const current = await savedShare();
  if (current?.token !== session?.token) return;
  await saveShare(null);
  await stopBackground();
}

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TASK, async ({ data, error }) => {
  const session = await savedShare();
  if (!session || Date.parse(session.expires_at) <= Date.now()) {
    await clearFinishedShare(session);
    return;
  }
  if (error || !data?.locations?.length) return;
  try {
    const { data: auth } = await supabase.auth.getSession();
    if (auth.session?.user.id !== session.owner) {
      await clearFinishedShare(session);
      return;
    }
    const latest = data.locations.reduce((a, b) => a.timestamp > b.timestamp ? a : b);
    if (!await publishLocation(session, latest)) {
      await clearFinishedShare(session);
    }
  } catch {
    // Transient connectivity failures retry on the next fresh GPS sample.
  }
});
