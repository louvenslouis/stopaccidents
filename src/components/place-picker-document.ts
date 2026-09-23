import { HAITI_BOUNDS } from './map-document';

export const PLACE_PICKER_DOCUMENT = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
    integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="anonymous">
  <style>
    html, body, #map { height: 100%; width: 100%; margin: 0; background: #E8EEF0; }
    .leaflet-control-attribution { font: 11px/1.5 system-ui, sans-serif; }

    /* Only tiles are filtered: alert pins, route colors and controls keep their meaning. */
    html[data-theme="dark"], html[data-theme="dark"] body,
    html[data-theme="dark"] #map { background: #10151D; color: #F1F5F9; }
    html[data-theme="dark"] .leaflet-tile-pane {
      filter: invert(1) hue-rotate(180deg) brightness(.78) saturate(.65);
    }
    html[data-theme="dark"] .leaflet-control-zoom a,
    html[data-theme="dark"] .leaflet-control-attribution,
    html[data-theme="dark"] .leaflet-popup-content-wrapper,
    html[data-theme="dark"] .leaflet-popup-tip,
    html[data-theme="dark"] .accident-choice {
      background: #1A222D; color: #F1F5F9; border-color: #344152;
    }
    html[data-theme="dark"] .leaflet-control-attribution a,
    html[data-theme="dark"] .leaflet-popup-close-button { color: #8DC8FF; }
  </style>
</head>
<body>
  <div id="map" aria-label="Carte pour choisir un lieu en Haïti"></div>
  <script>
    window.stopAccidentsTheme = function (scheme) {
      document.documentElement.dataset.theme = scheme === 'dark' ? 'dark' : 'light';
      document.documentElement.style.colorScheme = scheme === 'dark' ? 'dark' : 'light';
    };
    function notify(payload) {
      var message = JSON.stringify(Object.assign({ source: 'stopaccidents-place-picker' }, payload));
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(message);
      else window.parent.postMessage(message, '*');
    }
  </script>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
    integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin="anonymous"
    onerror="notify({ status: 'error' })"></script>
  <script>
    try {
      var bounds = L.latLngBounds(${JSON.stringify(HAITI_BOUNDS)});
      var map = L.map('map', {
        maxBounds: bounds,
        maxBoundsViscosity: 1,
        maxZoom: 19,
        inertia: false,
        bounceAtZoomLimits: false,
        zoomControl: false
      });
      L.control.zoom({ zoomInTitle: 'Zoomer', zoomOutTitle: 'Dézoomer' }).addTo(map);
      function constrainView() {
        map.setMinZoom(Math.min(19, map.getBoundsZoom(bounds, true)));
        map.panInsideBounds(bounds, { animate: false });
      }
      map.setView(bounds.getCenter(), Math.min(19, map.getBoundsZoom(bounds, true)));
      constrainView();
      map.on('resize', constrainView);
      var pin = null;
      window.stopAccidentsSetPlace = function (selection) {
        if (!selection || !Number.isFinite(selection.latitude) ||
            !Number.isFinite(selection.longitude) ||
            !bounds.contains([selection.latitude, selection.longitude])) return;
        var point = [selection.latitude, selection.longitude];
        if (!pin) {
          pin = L.marker(point, { keyboard: false, interactive: false }).addTo(map);
        } else pin.setLatLng(point);
        map.setView(point, Math.max(map.getMinZoom(), 16), { animate: false });
      };
      map.on('click', function (event) {
        var point = event.latlng;
        if (!bounds.contains(point)) return;
        if (!pin) pin = L.marker(point, { keyboard: false, interactive: false }).addTo(map);
        else pin.setLatLng(point);
        notify({ status: 'pick', latitude: point.lat, longitude: point.lng });
      });
      window.addEventListener('message', function (event) {
        if (event.source !== window.parent) return;
        if (event.data && event.data.source === 'stopaccidents-app') {
          if ('theme' in event.data) window.stopAccidentsTheme(event.data.theme);
          if ('selection' in event.data) window.stopAccidentsSetPlace(event.data.selection);
        }
      });
      var tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        bounds: bounds,
        noWrap: true,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">contributeurs OpenStreetMap</a>'
      });
      tiles.once('tileload', function () { notify({ status: 'ready' }); });
      tiles.on('tileerror', function () { notify({ status: 'error' }); });
      tiles.addTo(map);
    } catch (error) { notify({ status: 'error' }); }
  </script>
</body>
</html>`;

export type PlacePickerMessage =
  | { status: 'ready' | 'error' }
  | { status: 'pick'; latitude: number; longitude: number };

export function readPlacePickerMessage(message: unknown): PlacePickerMessage | null {
  if (typeof message !== 'string') return null;
  try {
    const value = JSON.parse(message);
    if (value?.source !== 'stopaccidents-place-picker') return null;
    if (value.status === 'ready' || value.status === 'error') return { status: value.status };
    if (
      value.status === 'pick' &&
      typeof value.latitude === 'number' &&
      typeof value.longitude === 'number' &&
      Number.isFinite(value.latitude) &&
      Number.isFinite(value.longitude)
    )
      return {
        status: 'pick',
        latitude: value.latitude,
        longitude: value.longitude,
      };
    return null;
  } catch {
    return null;
  }
}
