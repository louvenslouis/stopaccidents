import { Linking } from 'react-native';
import { useCallback, useEffect, useRef } from 'react';
import { WebView } from 'react-native-webview';

import type { MapFrameProps } from './map-frame-props';
import { MAP_DOCUMENT, readMapMessage } from './map-document';

const source = { html: MAP_DOCUMENT };

export function MapFrame({
  onLoad,
  onError,
  markers,
  onSelect,
}: MapFrameProps) {
  const frame = useRef<WebView>(null);
  const updateMarkers = useCallback(() => {
    const json = JSON.stringify(markers)
      .replace(/</g, '\\u003c')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
    frame.current?.injectJavaScript(
      `window.stopAccidentsUpdate && window.stopAccidentsUpdate(${json}); true;`,
    );
  }, [markers]);
  useEffect(updateMarkers, [updateMarkers]);
  const openLink = (url: string) => {
    if (url.startsWith('https://')) {
      void Linking.openURL(url).catch(onError);
    }
  };

  return (
    <WebView
      ref={frame}
      source={source}
      originWhitelist={['*']}
      style={{ flex: 1, backgroundColor: '#E8EEF0' }}
      applicationNameForUserAgent="StopAccidents/1.0"
      cacheEnabled
      javaScriptEnabled
      domStorageEnabled
      scrollEnabled={false}
      nestedScrollEnabled
      geolocationEnabled={false}
      onMessage={({ nativeEvent }) => {
        const message = readMapMessage(nativeEvent.data);
        if (message?.status === 'ready') {
          updateMarkers();
          onLoad();
        }
        if (message?.status === 'error') onError();
        if (
          message?.status === 'select' &&
          markers.some((marker) => marker.id === message.id)
        )
          onSelect(message.id);
      }}
      onError={onError}
      onHttpError={onError}
      onContentProcessDidTerminate={onError}
      onRenderProcessGone={onError}
      onShouldStartLoadWithRequest={(request) => {
        if (request.url === 'about:blank' || request.isTopFrame === false)
          return true;
        openLink(request.url);
        return false;
      }}
      onOpenWindow={({ nativeEvent }) => openLink(nativeEvent.targetUrl)}
    />
  );
}
