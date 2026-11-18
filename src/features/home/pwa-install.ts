import { useSyncExternalStore } from 'react';

interface InstallPromptEvent extends Event {
  prompt(): Promise<unknown>;
}

declare global {
  interface Window {
    stopAccidentsInstallPrompt?: InstallPromptEvent;
  }

  interface Navigator {
    standalone?: boolean;
  }
}

const installPromptChange = 'stopaccidents:install-prompt-change';
const installReminderKey = 'stopaccidents.pwa-install-reminder';
let reminderSeen = false;

// Capture the event before Expo loads so the home menu can use it after navigation or hydration.
export const captureInstallPrompt = `
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    window.stopAccidentsInstallPrompt = event;
    window.dispatchEvent(new Event('${installPromptChange}'));
  });
  window.addEventListener('appinstalled', () => {
    delete window.stopAccidentsInstallPrompt;
    window.dispatchEvent(new Event('${installPromptChange}'));
  });
`;

function subscribe(onChange: () => void) {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return () => {};
  }

  window.addEventListener(installPromptChange, onChange);
  return () => window.removeEventListener(installPromptChange, onChange);
}

function getInstallPrompt() {
  return typeof window !== 'undefined' ? window.stopAccidentsInstallPrompt ?? null : null;
}

function requestInstall() {
  const event = getInstallPrompt();
  if (!event) return;

  delete window.stopAccidentsInstallPrompt;
  window.dispatchEvent(new Event(installPromptChange));
  void event.prompt().catch(error => {
    console.warn('PWA installation prompt failed', error);
  });
}

function getInstallMethod() {
  if (typeof window === 'undefined') return null;

  const browser = window.navigator;
  if (browser?.standalone || window.matchMedia?.('(display-mode: standalone)').matches) return null;

  const isIPhone = browser?.platform === 'iPhone' || /\biPhone\b/.test(browser?.userAgent ?? '');
  if (isIPhone) return 'safari';
  return getInstallPrompt() ? 'prompt' : null;
}

export function usePwaInstall() {
  const method = useSyncExternalStore(subscribe, getInstallMethod, () => null);
  return {
    installPwa: method === 'prompt' ? requestInstall : null,
    canShowSafariGuide: method === 'safari',
  };
}

export function shouldShowInstallReminder() {
  if (reminderSeen || typeof window === 'undefined') return false;

  try {
    return window.localStorage.getItem(installReminderKey) !== '1'
      && window.sessionStorage.getItem(installReminderKey) !== '1';
  } catch {
    return true;
  }
}

export function markInstallReminderSeen() {
  reminderSeen = true;
  try {
    window.sessionStorage.setItem(installReminderKey, '1');
  } catch {
    // Keep the reminder dismissed for this page when storage is unavailable.
  }
}

export function setInstallReminderDisabled(disabled: boolean) {
  try {
    if (disabled) {
      window.localStorage.setItem(installReminderKey, '1');
    } else {
      window.localStorage.removeItem(installReminderKey);
    }
  } catch {
    // The reminder is already dismissed for this page.
  }
}
