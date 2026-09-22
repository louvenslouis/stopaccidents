import { useEffect, useRef } from 'react';

import type { MapFrameProps } from './map-frame-props';
import { illustratedMapMarkers } from './map-marker-assets';
import { MAP_DOCUMENT, readMapMessage } from './map-document';

export function MapFrame({
  onLoad,
  onError,
  markers,
  onSelect,
  location,
  placeFocus,
  onPan,
  route = null,
  onCenterChange,
}: MapFrameProps) {
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const message = readMapMessage(event.data);
      if (message?.status === 'ready') {
        frame.current?.contentWindow?.postMessage(
          {
            source: 'stopaccidents-app',
            markers: illustratedMapMarkers(markers),
            location,
            placeFocus,
            route,
          },
          window.location.origin,
        );
        onLoad();
      }
      if (message?.status === 'error') onError();
      if (message?.status === 'pan') onPan();
      if (message?.status === 'center') onCenterChange(message);
      if (
        message?.status === 'select' &&
        markers.some((marker) => marker.id === message.id)
      )
        onSelect(message.id);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [onLoad, onError, markers, onSelect, location, placeFocus, onPan, onCenterChange, route]);

  useEffect(() => {
    frame.current?.contentWindow?.postMessage(
      { source: 'stopaccidents-app', markers: illustratedMapMarkers(markers) },
      window.location.origin,
    );
  }, [markers]);

  useEffect(() => {
    frame.current?.contentWindow?.postMessage(
      { source: 'stopaccidents-app', location },
      window.location.origin,
    );
  }, [location]);

  useEffect(() => {
    frame.current?.contentWindow?.postMessage(
      { source: 'stopaccidents-app', placeFocus },
      window.location.origin,
    );
  }, [placeFocus]);

  useEffect(() => {
    frame.current?.contentWindow?.postMessage(
      { source: 'stopaccidents-app', route },
      window.location.origin,
    );
  }, [route]);

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
