import { useLanguage } from '@/features/language/language-provider';
import { localizeMapDocument } from '@/features/language/documents';
import { useAppTheme } from '@/features/appearance/theme-provider';
import { useMemo, useEffect, useRef } from 'react';

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
  stations,
  onSelectStation,
}: MapFrameProps) {
  const { language, t } = useLanguage();
  const source = useMemo(() => ({ html: localizeMapDocument(MAP_DOCUMENT, language) }), [language]);
  const { scheme, color } = useAppTheme();
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    frame.current?.contentWindow?.postMessage(
      { source: 'stopaccidents-app', theme: scheme }, window.location.origin,
    );
  }, [scheme]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const message = readMapMessage(event.data);
      if (message?.status === 'ready') {
        frame.current?.contentWindow?.postMessage(
          {
            source: 'stopaccidents-app',
            theme: scheme,
            markers: illustratedMapMarkers(markers).map((marker) => ({ ...marker, title: t(marker.title) })),
            stations: stations ?? [],
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
      if (message?.status === 'station-select' && stations?.some((station) => station.id === message.id))
        onSelectStation?.(message.id);
      if (
        message?.status === 'select' &&
        markers.some((marker) => marker.id === message.id)
      )
        onSelect(message.id);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [t, scheme, onLoad, onError, markers, onSelect, location, placeFocus, onPan, onCenterChange, route, stations, onSelectStation]);

  useEffect(() => {
    frame.current?.contentWindow?.postMessage(
      { source: 'stopaccidents-app', stations: stations ?? [] },
      window.location.origin,
    );
  }, [stations]);

  useEffect(() => {
    frame.current?.contentWindow?.postMessage(
      { source: 'stopaccidents-app', markers: illustratedMapMarkers(markers).map((marker) => ({ ...marker, title: t(marker.title) })) },
      window.location.origin,
    );
  }, [markers, t]);

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
      title={t("Carte interactive OpenStreetMap d’Haïti")}
      srcDoc={source.html}
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      onLoad={() => frame.current?.contentWindow?.postMessage({ source: 'stopaccidents-app', theme: scheme }, window.location.origin)}
      onError={onError}
      referrerPolicy="strict-origin-when-cross-origin"
      style={{ width: '100%', height: '100%', border: 0, display: 'block', backgroundColor: color('#E8EEF0', 'background') }}
    />
  );
}
