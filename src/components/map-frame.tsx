import { useLanguage } from '@/features/language/language-provider';
import { localizeMapDocument } from '@/features/language/documents';
import { useAppTheme } from '@/features/appearance/theme-provider';
import { Linking } from 'react-native';
import { useMemo, useCallback, useEffect, useRef } from 'react';
import { WebView } from 'react-native-webview';

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
  const frame = useRef<WebView>(null);
  const updateTheme = useCallback(() => {
    frame.current?.injectJavaScript(
      `window.stopAccidentsTheme && window.stopAccidentsTheme(${JSON.stringify(scheme)}); true;`,
    );
  }, [scheme]);
  useEffect(updateTheme, [updateTheme]);

  const updateMarkers = useCallback(() => {
    const json = JSON.stringify(illustratedMapMarkers(markers).map((marker) => ({ ...marker, title: t(marker.title) })))
      .replace(/</g, '\\u003c')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
    frame.current?.injectJavaScript(
      `window.stopAccidentsUpdate && window.stopAccidentsUpdate(${json}); true;`,
    );
  }, [markers, t]);
  useEffect(updateMarkers, [updateMarkers]);
  const updateStations = useCallback(() => {
    const json = JSON.stringify(stations ?? [])
      .replace(/</g, '\\u003c')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
    frame.current?.injectJavaScript(
      `window.stopAccidentsStations && window.stopAccidentsStations(${json}); true;`,
    );
  }, [stations]);
  useEffect(updateStations, [updateStations]);
  const updateLocation = useCallback(() => {
    frame.current?.injectJavaScript(
      `window.stopAccidentsLocate && window.stopAccidentsLocate(${JSON.stringify(location)}); true;`,
    );
  }, [location]);
  useEffect(updateLocation, [updateLocation]);
  const updatePlaceFocus = useCallback(() => {
    frame.current?.injectJavaScript(
      `window.stopAccidentsFocus && window.stopAccidentsFocus(${JSON.stringify(placeFocus)}); true;`,
    );
  }, [placeFocus]);
  useEffect(updatePlaceFocus, [updatePlaceFocus]);
  const updateRoute = useCallback(() => {
    frame.current?.injectJavaScript(
      `window.stopAccidentsRoute && window.stopAccidentsRoute(${JSON.stringify(route)}); true;`,
    );
  }, [route]);
  useEffect(updateRoute, [updateRoute]);
  const openLink = (url: string) => {
    if (url.startsWith('https://')) {
      void Linking.openURL(url).catch(onError);
    }
  };

  return (
    <WebView
      ref={frame}
      source={source}
      onLoadEnd={updateTheme}
      originWhitelist={['*']}
      style={{ flex: 1, backgroundColor: color('#E8EEF0', 'background') }}
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
          updateTheme();
          updateLocation();
          updatePlaceFocus();
          updateMarkers();
          updateStations();
          updateRoute();
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
