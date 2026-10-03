import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Linking } from 'react-native';
import { WebView } from 'react-native-webview';
import { useAppTheme } from '@/features/appearance/theme-provider';
import { useLanguage } from '@/features/language/language-provider';
import { localizeMapDocument } from '@/features/language/documents';
import { readRouteMapMessage, ROUTE_EDITOR_DOCUMENT } from './map-document';
import type { RouteMapProps } from './route-map-props';

export function RouteMap({ state, onLoad, onError, onPick, onMove }: RouteMapProps) {
  const { language } = useLanguage();
  const { scheme, color } = useAppTheme();
  const frame = useRef<WebView>(null);
  const source = useMemo(() => ({ html: localizeMapDocument(ROUTE_EDITOR_DOCUMENT, language) }), [language]);
  const update = useCallback(() => {
    frame.current?.injectJavaScript(`window.stopAccidentsTheme&&window.stopAccidentsTheme(${JSON.stringify(scheme)});window.stopAccidentsSetRoute&&window.stopAccidentsSetRoute(${JSON.stringify(state)});true;`);
  }, [scheme, state]);
  useEffect(update, [update]);
  const openLink = (url: string) => { if (url.startsWith('https://')) void Linking.openURL(url).catch(onError); };
  return <WebView ref={frame} source={source} style={{ flex: 1, backgroundColor: color('#E8EEF0', 'background') }}
    originWhitelist={['*']} applicationNameForUserAgent="StopAccidents/1.0" cacheEnabled javaScriptEnabled
    domStorageEnabled scrollEnabled={false} nestedScrollEnabled geolocationEnabled={false}
    onLoadEnd={update} onError={onError} onHttpError={onError} onContentProcessDidTerminate={onError} onRenderProcessGone={onError}
    onMessage={({ nativeEvent }) => {
      const message = readRouteMapMessage(nativeEvent.data);
      if (message?.status === 'ready') { update(); onLoad(); }
      if (message?.status === 'error') onError();
      if (message?.status === 'pick') onPick(message);
      if (message?.status === 'move') onMove(message.id, message);
    }}
    onShouldStartLoadWithRequest={(request) => {
      if (request.url === 'about:blank' || request.isTopFrame === false) return true;
      openLink(request.url); return false;
    }}
    onOpenWindow={({ nativeEvent }) => openLink(nativeEvent.targetUrl)} />;
}
