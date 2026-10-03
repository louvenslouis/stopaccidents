import { useEffect, useMemo, useRef } from 'react';
import { useAppTheme } from '@/features/appearance/theme-provider';
import { useLanguage } from '@/features/language/language-provider';
import { localizeMapDocument } from '@/features/language/documents';
import { readRouteMapMessage, ROUTE_EDITOR_DOCUMENT } from './map-document';
import type { RouteMapProps } from './route-map-props';

export function RouteMap({ state, onLoad, onError, onPick, onMove }: RouteMapProps) {
  const { language, t } = useLanguage();
  const { scheme, color } = useAppTheme();
  const frame = useRef<HTMLIFrameElement>(null);
  const source = useMemo(() => localizeMapDocument(ROUTE_EDITOR_DOCUMENT, language), [language]);
  useEffect(() => {
    frame.current?.contentWindow?.postMessage({ source: 'stopaccidents-app', state, theme: scheme }, window.location.origin);
  }, [state, scheme]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== window.location.origin) return;
      const message = readRouteMapMessage(event.data);
      if (message?.status === 'ready') {
        frame.current?.contentWindow?.postMessage({ source: 'stopaccidents-app', state, theme: scheme }, window.location.origin);
        onLoad();
      }
      if (message?.status === 'error') onError();
      if (message?.status === 'pick') onPick(message);
      if (message?.status === 'move') onMove(message.id, message);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [state, scheme, onLoad, onError, onPick, onMove]);
  return <iframe ref={frame} title={t('Mon trajet exact')} srcDoc={source}
    sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
    onLoad={() => frame.current?.contentWindow?.postMessage({ source: 'stopaccidents-app', state, theme: scheme }, window.location.origin)}
    onError={onError} referrerPolicy="strict-origin-when-cross-origin"
    style={{ width: '100%', height: '100%', border: 0, display: 'block', backgroundColor: color('#E8EEF0', 'background') }} />;
}
