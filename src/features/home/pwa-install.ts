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
  const isIPhone = browser?.platform === 'iPhone' || /\biPhone\b/.test(browser?.userAgent ?? '');
  if (!isIPhone) return getInstallPrompt() ? 'prompt' : null;

  const isStandalone = browser.standalone || window.matchMedia?.('(display-mode: standalone)').matches;
  return isStandalone ? null : 'safari';
}

export function usePwaInstall() {
  const method = useSyncExternalStore(subscribe, getInstallMethod, () => null);
  return {
    installPwa: method === 'prompt' ? requestInstall : null,
    canShowSafariGuide: method === 'safari',
  };
}
