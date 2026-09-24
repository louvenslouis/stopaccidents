import { useLanguage } from '@/features/language/language-provider';
import { localizeMapDocument } from '@/features/language/documents';
import { useAppTheme } from '@/features/appearance/theme-provider';
import { Linking } from 'react-native';
import { useMemo, useCallback, useEffect, useRef } from 'react';
import { WebView } from 'react-native-webview';

import { PLACE_PICKER_DOCUMENT, readPlacePickerMessage } from './place-picker-document';
import type { PlacePickerMapProps } from './place-picker-map-props';


export function PlacePickerMap({ selection, onLoad, onError, onPick }: PlacePickerMapProps) {
  const { language } = useLanguage();
  const source = useMemo(() => ({ html: localizeMapDocument(PLACE_PICKER_DOCUMENT, language) }), [language]);
  const { scheme, color } = useAppTheme();
  const frame = useRef<WebView>(null);
  const updateTheme = useCallback(() => {
    frame.current?.injectJavaScript(
      `window.stopAccidentsTheme && window.stopAccidentsTheme(${JSON.stringify(scheme)}); true;`,
    );
  }, [scheme]);
  useEffect(updateTheme, [updateTheme]);

  const updateSelection = useCallback(() => {
    frame.current?.injectJavaScript(
      `window.stopAccidentsSetPlace && window.stopAccidentsSetPlace(${JSON.stringify(selection)}); true;`,
    );
  }, [selection]);
  useEffect(updateSelection, [updateSelection]);

  const openLink = (url: string) => {
    if (url.startsWith('https://')) void Linking.openURL(url).catch(onError);
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
        const message = readPlacePickerMessage(nativeEvent.data);
        if (message?.status === 'ready') {
          updateTheme();
          updateSelection();
          onLoad();
        }
        if (message?.status === 'error') onError();
        if (message?.status === 'pick')
          onPick({ latitude: message.latitude, longitude: message.longitude });
      }}
      onError={onError}
      onHttpError={onError}
      onContentProcessDidTerminate={onError}
      onRenderProcessGone={onError}
      onShouldStartLoadWithRequest={(request) => {
        if (request.url === 'about:blank' || request.isTopFrame === false) return true;
        openLink(request.url);
        return false;
      }}
      onOpenWindow={({ nativeEvent }) => openLink(nativeEvent.targetUrl)}
    />
  );
}
