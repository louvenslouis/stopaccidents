import { useCallback, useEffect, useRef } from 'react';
import { WebView } from 'react-native-webview';
import { useAppTheme } from '@/features/appearance/theme-provider';
import { LIVE_MAP_DOCUMENT } from './map-document';
import type { IncomingLocation } from './api';
export type LiveMapProps = { locations: IncomingLocation[]; selected: string | null; onError: () => void; onLoad: () => void };
export function LiveMap({ locations, selected, onError, onLoad }: LiveMapProps) {
  const ref = useRef<WebView>(null);
  const { scheme } = useAppTheme();
  const update = useCallback(() => {
    const json = JSON.stringify({ locations, selected, theme: scheme }).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    ref.current?.injectJavaScript(`window.updateLiveLocations && window.updateLiveLocations(${json});true;`);
  }, [locations, selected, scheme]);
  useEffect(update, [update]);
  return <WebView ref={ref} source={{ html: LIVE_MAP_DOCUMENT }} style={{ flex: 1 }}
    originWhitelist={['*']} geolocationEnabled={false} scrollEnabled={false}
    onError={onError} onHttpError={onError}
    onShouldStartLoadWithRequest={request => request.url === 'about:blank' || request.isTopFrame === false}
    onMessage={({ nativeEvent }) => {
      try {
        const message = JSON.parse(nativeEvent.data);
        if (message.source !== 'live-location-map') return;
        if (message.status === 'ready') { update(); onLoad(); }
        if (message.status === 'error') onError();
      } catch { /* Ignore unrelated webview messages. */ }
    }} />;
}
