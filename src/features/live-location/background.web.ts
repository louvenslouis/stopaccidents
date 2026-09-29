import type { ShareSession } from './api';
const KEY = 'stopaccidents.live-location';
export async function savedShare(): Promise<ShareSession | null> {
  try { return JSON.parse(sessionStorage.getItem(KEY) ?? 'null'); } catch { return null; }
}
export async function saveShare(session: ShareSession | null) {
  if (session) sessionStorage.setItem(KEY, JSON.stringify(session));
  else sessionStorage.removeItem(KEY);
}
export async function startBackground(_title: string) { return false; }
export async function stopBackground() {}
