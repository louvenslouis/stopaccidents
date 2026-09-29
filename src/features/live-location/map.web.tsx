import { useCallback, useEffect, useRef } from 'react';
import { useAppTheme } from '@/features/appearance/theme-provider';
import { useLanguage } from '@/features/language/language-provider';
import type { LiveMapProps } from './map';
import { LIVE_MAP_DOCUMENT } from './map-document';
export function LiveMap({ locations, selected, onError, onLoad }: LiveMapProps) {
  const ref = useRef<HTMLIFrameElement>(null);
  const { scheme } = useAppTheme();
  const { t } = useLanguage();
  const update = useCallback(() => ref.current?.contentWindow?.postMessage({ source: 'live-location-app', locations, selected, theme: scheme }, window.location.origin), [locations, selected, scheme]);
  useEffect(update, [update]);
  useEffect(() => {
    function receive(event: MessageEvent) {
      if (event.source !== ref.current?.contentWindow) return;
      try {
        const message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (message?.source !== 'live-location-map') return;
        if (message.status === 'ready') { update(); onLoad(); }
        if (message.status === 'error') onError();
      } catch { /* Ignore unrelated iframe messages. */ }
    }
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [update, onLoad, onError]);
  return <iframe ref={ref} srcDoc={LIVE_MAP_DOCUMENT} title={t('Positions de mes proches')}
    sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
    onError={onError} onLoad={update} referrerPolicy="strict-origin-when-cross-origin"
    style={{ height: '100%', width: '100%', border: 0 }} />;
}
