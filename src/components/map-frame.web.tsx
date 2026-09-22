import { useEffect, useRef } from 'react';

import type { MapFrameProps } from './map-frame-props';
import { MAP_DOCUMENT, readMapMessage } from './map-document';

export function MapFrame({
  onLoad,
  onError,
  markers,
  onSelect,
  location,
  onPan,
}: MapFrameProps) {
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const message = readMapMessage(event.data);
      if (message?.status === 'ready') {
        frame.current?.contentWindow?.postMessage(
          { source: 'stopaccidents-app', markers, location },
          window.location.origin,
        );
        onLoad();
      }
      if (message?.status === 'error') onError();
      if (message?.status === 'pan') onPan();
      if (
        message?.status === 'select' &&
        markers.some((marker) => marker.id === message.id)
      )
        onSelect(message.id);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [onLoad, onError, markers, onSelect, location, onPan]);

  useEffect(() => {
    frame.current?.contentWindow?.postMessage(
      { source: 'stopaccidents-app', markers },
      window.location.origin,
    );
  }, [markers]);

  useEffect(() => {
    frame.current?.contentWindow?.postMessage(
      { source: 'stopaccidents-app', location },
      window.location.origin,
    );
  }, [location]);

  return (
    <iframe
      ref={frame}
      title="Carte interactive OpenStreetMap d’Haïti"
      srcDoc={MAP_DOCUMENT}
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      onError={onError}
      referrerPolicy="strict-origin-when-cross-origin"
      style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
    />
  );
}
