// Southwest and northeast corners of the navigation area around Haiti.
export const HAITI_BOUNDS = [
  [18.0, -74.55],
  [20.1, -71.6],
] as const;

export const MAP_DOCUMENT = `<!doctype html>
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
    .accident-pin { border-radius: 50%; border: 3px solid white; box-sizing: border-box;
      color: white; text-align: center; font: bold 16px/28px system-ui; box-shadow: 0 2px 8px #0006; }
    .accident-choices { max-height: 220px; overflow-y: auto; display: grid; gap: 8px; }
    .accident-choice { min-height: 44px; padding: 10px; border: 1px solid #ddd;
      border-radius: 8px; background: white; text-align: left; cursor: pointer; }
  </style>
</head>
<body>
  <div id="map" aria-label="Carte interactive d’Haïti"></div>
  <script>
    function notify(status, id) {
      var message = JSON.stringify({ source: 'stopaccidents-map', status: status, id: id });
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(message);
      else window.parent.postMessage(message, '*');
    }
  </script>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
    integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin="anonymous"
    onerror="notify('error')"></script>
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
      // Keep the entire viewport inside the area, including on wide screens.
      function constrainView() {
        map.setMinZoom(Math.min(19, map.getBoundsZoom(bounds, true)));
        map.panInsideBounds(bounds, { animate: false });
      }
      map.setView(bounds.getCenter(), Math.min(19, map.getBoundsZoom(bounds, true)));
      constrainView();
      map.on('resize', constrainView);
      var markers = L.layerGroup().addTo(map);
      var hasFocused = false;
      var currentReports = [];
      var userDot = null;
      var accuracyCircle = null;
      var placeMarker = null;
      var lastFocusRequest = -1;
      var lastPlaceRequest = -1;
      var autoFollow = false;
      function clearPosition() {
        if (userDot) map.removeLayer(userDot);
        if (accuracyCircle) map.removeLayer(accuracyCircle);
        userDot = null;
        accuracyCircle = null;
      }
      window.stopAccidentsLocate = function (state) {
        if (!state) return;
        var position = state.position;
        autoFollow = state.following === true;
        if (!position || !Number.isFinite(position.latitude) || !Number.isFinite(position.longitude) ||
            !bounds.contains([position.latitude, position.longitude])) {
          clearPosition();
          return;
        }
        var point = [position.latitude, position.longitude];
        var radius = Number.isFinite(position.accuracy) && position.accuracy >= 0 ? position.accuracy : 0;
        if (!userDot) {
          accuracyCircle = L.circle(point, {
            radius: radius, color: '#208AEF', weight: 1, fillColor: '#208AEF', fillOpacity: 0.12, interactive: false
          }).addTo(map);
          userDot = L.circleMarker(point, {
            radius: 8, color: '#FFFFFF', weight: 3, fillColor: '#208AEF', fillOpacity: 1, interactive: false
          }).addTo(map);
          userDot.bindTooltip('Votre position');
        } else {
          userDot.setLatLng(point);
          accuracyCircle.setLatLng(point).setRadius(radius);
        }
        // Location takes precedence over the initial accident focus and refreshes.
        hasFocused = true;
        if (state.focusRequest !== lastFocusRequest) {
          lastFocusRequest = state.focusRequest;
          map.setView(point, Math.max(map.getMinZoom(), 16), { animate: false });
        } else if (autoFollow) {
          map.panTo(point, { animate: false });
        }
      };
      window.stopAccidentsFocus = function (focus) {
        if (!focus) {
          if (placeMarker) map.removeLayer(placeMarker);
          placeMarker = null;
          return;
        }
        if (!Number.isFinite(focus.latitude) || !Number.isFinite(focus.longitude) ||
            !bounds.contains([focus.latitude, focus.longitude]) || focus.request === lastPlaceRequest) return;
        lastPlaceRequest = focus.request;
        autoFollow = false;
        hasFocused = true;
        var point = [focus.latitude, focus.longitude];
        if (placeMarker) map.removeLayer(placeMarker);
        placeMarker = L.circleMarker(point, {
          radius: 9, color: '#FFFFFF', weight: 4, fillColor: '#1767A6', fillOpacity: 1
        }).addTo(map);
        map.setView(point, Math.max(map.getMinZoom(), 15), { animate: false });
      };
      map.on('dragstart', function () {
        autoFollow = false;
        notify('pan');
      });
      function renderMarkers() {
        markers.clearLayers();
        var groups = [];
        currentReports.forEach(function (report) {
          var point = map.latLngToLayerPoint([report.latitude, report.longitude]);
          var nearby = groups.find(function (group) {
            return point.distanceTo(map.latLngToLayerPoint([group[0].latitude, group[0].longitude])) < 44;
          });
          if (nearby) nearby.push(report);
          else groups.push([report]);
        });
        groups.forEach(function (group) {
          var report = group[0];
          var pin = document.createElement('div');
          pin.className = 'accident-pin';
          pin.style.backgroundColor = group.reduce(function (highest, item) {
            return item.priority > highest.priority ? item : highest;
          }, report).color;
          pin.textContent = group.length > 1 ? String(group.length) : '!';
          var label = group.length > 1 ? group.length + ' accidents dans cette zone' : report.title;
          var marker = L.marker([report.latitude, report.longitude], {
            icon: L.divIcon({ html: pin, className: '', iconSize: [34, 34], iconAnchor: [17, 17] }),
            title: label,
            alt: label,
            keyboard: true
          }).addTo(markers);
          marker.getElement().setAttribute('aria-label', label);
          if (group.length === 1) {
            marker.on('click', function () { notify('select', report.id); });
          } else {
            var choices = document.createElement('div');
            choices.className = 'accident-choices';
            group.forEach(function (item) {
              var button = document.createElement('button');
              button.className = 'accident-choice';
              button.textContent = item.title;
              button.onclick = function () { notify('select', item.id); };
              choices.appendChild(button);
            });
            marker.bindPopup(choices);
          }
        });
      }
      window.stopAccidentsUpdate = function (reports) {
        currentReports = reports.filter(function (report) {
          return Number.isFinite(report.latitude) && Number.isFinite(report.longitude) &&
            bounds.contains([report.latitude, report.longitude]);
        });
        if (!hasFocused && currentReports.length) {
          var first = currentReports[0];
          hasFocused = true;
          map.setView([first.latitude, first.longitude], Math.max(map.getMinZoom(), 12));
        }
        renderMarkers();
      };
      map.on('zoomend', renderMarkers);
      window.addEventListener('message', function (event) {
        // about:srcdoc reports a null location.origin despite inheriting the parent origin.
        // Accept updates only from the embedding application window.
        if (event.source !== window.parent) return;
        if (event.data && event.data.source === 'stopaccidents-app') {
          if (event.data.location) window.stopAccidentsLocate(event.data.location);
          if ('placeFocus' in event.data) window.stopAccidentsFocus(event.data.placeFocus);
          if (Array.isArray(event.data.markers)) window.stopAccidentsUpdate(event.data.markers);
        }
      });
      var tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        bounds: bounds,
        noWrap: true,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">contributeurs OpenStreetMap</a>'
      });
      tiles.once('tileload', function () { notify('ready'); });
      tiles.on('tileerror', function () { notify('error'); });
      tiles.addTo(map);
    } catch (error) { notify('error'); }
  </script>
</body>
</html>`;

export type MapMessage =
  | { status: 'ready' | 'error' | 'pan' }
  | { status: 'select'; id: string };

export function readMapMessage(message: unknown): MapMessage | null {
  if (typeof message !== 'string') return null;
  try {
    const value = JSON.parse(message);
    if (value?.source !== 'stopaccidents-map') return null;
    if (
      value.status === 'ready' ||
      value.status === 'error' ||
      value.status === 'pan'
    )
      return { status: value.status };
    if (value.status === 'select' && typeof value.id === 'string') {
      return { status: 'select', id: value.id };
    }
    return null;
  } catch {
    return null;
  }
}
