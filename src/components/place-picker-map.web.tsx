import { useAppTheme } from '@/features/appearance/theme-provider';
import { useEffect, useRef } from 'react';

import { PLACE_PICKER_DOCUMENT, readPlacePickerMessage } from './place-picker-document';
import type { PlacePickerMapProps } from './place-picker-map-props';

export function PlacePickerMap({ selection, onLoad, onError, onPick }: PlacePickerMapProps) {
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
      const message = readPlacePickerMessage(event.data);
      if (message?.status === 'ready') {
        frame.current?.contentWindow?.postMessage(
          { source: 'stopaccidents-app', selection, theme: scheme },
          window.location.origin,
        );
        onLoad();
      }
      if (message?.status === 'error') onError();
      if (message?.status === 'pick')
        onPick({ latitude: message.latitude, longitude: message.longitude });
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [scheme, selection, onLoad, onError, onPick]);

  useEffect(() => {
    frame.current?.contentWindow?.postMessage(
      { source: 'stopaccidents-app', selection },
      window.location.origin,
    );
  }, [selection]);

  return (
    <iframe
      ref={frame}
      title="Carte pour choisir un lieu en Haïti"
      srcDoc={PLACE_PICKER_DOCUMENT}
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      onLoad={() => frame.current?.contentWindow?.postMessage({ source: 'stopaccidents-app', theme: scheme }, window.location.origin)}
      onError={onError}
      referrerPolicy="strict-origin-when-cross-origin"
      style={{ width: '100%', height: '100%', border: 0, display: 'block', backgroundColor: color('#E8EEF0', 'background') }}
    />
  );
}
