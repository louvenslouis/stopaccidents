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
    .report-pin { position: relative; isolation: isolate; width: 64px; height: 76px; }
    .report-pin .report-pin-shape { position: absolute; inset: 0; z-index: 0;
      width: 64px; height: 76px; overflow: visible;
      filter: drop-shadow(0 4px 6px #17203355); }
    .report-pin-image { position: absolute; top: 12px; left: 13px; width: 38px; height: 38px;
      z-index: 1; display: block; object-fit: contain; }
    .report-pin-count { position: absolute; top: -3px; right: -3px; z-index: 2;
      min-width: 24px; height: 24px;
      padding: 0 5px; box-sizing: border-box; border: 2px solid white; border-radius: 12px;
      color: white; text-align: center; font: 800 12px/20px system-ui;
      box-shadow: 0 2px 5px #17203344; }
    .accident-choices { max-height: 220px; overflow-y: auto; display: grid; gap: 8px; }
    .accident-choice { min-height: 44px; padding: 10px; border: 1px solid #ddd;
      border-radius: 8px; background: white; text-align: left; cursor: pointer; }
    .station-pin { width: 40px; height: 40px; box-sizing: border-box; display: grid;
      place-items: center; border: 3px solid white; border-radius: 14px; background: #087F75;
      box-shadow: 0 3px 8px #123C3B55; color: white; position: relative; }
    .station-count { position: absolute; right: -7px; top: -9px; min-width: 19px;
      padding: 2px; border: 2px solid white; border-radius: 12px; background: #075E58;
      font: 700 11px/16px system-ui; text-align: center; }

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
  <div id="map" aria-label="Carte interactive d’Haïti"></div>
  <script>
    window.stopAccidentsTheme = function (scheme) {
      document.documentElement.dataset.theme = scheme === 'dark' ? 'dark' : 'light';
      document.documentElement.style.colorScheme = scheme === 'dark' ? 'dark' : 'light';
    };
    function notify(status, id, center) {
      var message = JSON.stringify({ source: 'stopaccidents-map', status: status, id: id,
        latitude: center && center.lat, longitude: center && center.lng });
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
      function notifyCenter() { notify('center', undefined, map.getCenter()); }
      map.on('moveend', notifyCenter);
      var markers = L.layerGroup().addTo(map);
      var hasFocused = false;
      var currentReports = [];
      var stationsLayer = L.layerGroup().addTo(map);
      var currentStations = [];
      var userDot = null;
      var accuracyCircle = null;
      var placeMarker = null;
      var lastFocusRequest = -1;
      var lastPlaceRequest = -1;
      var autoFollow = false;
      var routeLayer = null;
      var lastRouteFit = -1;
      window.stopAccidentsRoute = function (route) {
        if (routeLayer) { routeLayer.clearLayers(); map.removeLayer(routeLayer); }
        routeLayer = null;
        if (!route) { lastRouteFit = -1; return; }
        if (!Array.isArray(route.coordinates) || route.coordinates.length < 2 ||
            !route.coordinates.every(function (point) {
              return Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]) && bounds.contains([point[1], point[0]]);
            })) return;
        var points = route.coordinates.map(function (point) { return [point[1], point[0]]; });
        routeLayer = L.layerGroup().addTo(map);
        L.polyline(points, { color: '#FFFFFF', weight: 10, opacity: 0.95, interactive: false }).addTo(routeLayer);
        L.polyline(points, { color: '#1767A6', weight: 6, opacity: 0.95, interactive: false }).addTo(routeLayer);
        [points[0], points[points.length - 1]].forEach(function (point, index) {
          var marker = L.circleMarker(point, { radius: 12, color: '#FFFFFF', weight: 3,
            fillColor: index === 0 ? '#1767A6' : '#E75840', fillOpacity: 1 }).addTo(routeLayer);
          marker.bindTooltip(index === 0 ? 'A · Départ' : 'B · Arrivée', { permanent: true, direction: 'top' });
        });
        hasFocused = true;
        if (route.fitRequest !== lastRouteFit) {
          lastRouteFit = route.fitRequest;
          autoFollow = false;
          var size = map.getSize();
          map.fitBounds(L.latLngBounds(points), {
            paddingTopLeft: [24, Math.max(24, Math.min(size.y * 0.60, size.y - 220))],
            paddingBottomRight: [70, 130], maxZoom: 16, animate: false
          });
        }
      };
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
          lastPlaceRequest = -1;
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
          var report = group.reduce(function (highest, item) {
            return item.priority > highest.priority ? item : highest;
          }, group[0]);
          var pin = document.createElement('div');
          pin.className = 'report-pin';
          var shape = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          shape.setAttribute('class', 'report-pin-shape');
          shape.setAttribute('viewBox', '0 0 64 76');
          shape.setAttribute('aria-hidden', 'true');
          var outline = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          outline.setAttribute('d', 'M32 3C16.8 3 4.5 15.3 4.5 30.5c0 17.3 20.3 36.1 27.5 43.5 7.2-7.4 27.5-26.2 27.5-43.5C59.5 15.3 47.2 3 32 3Z');
          outline.setAttribute('fill', '#FFFFFF');
          outline.setAttribute('stroke', '#D5E0E7');
          outline.setAttribute('stroke-width', '1.5');
          shape.appendChild(outline);
          var halo = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          halo.setAttribute('cx', '32');
          halo.setAttribute('cy', '30');
          halo.setAttribute('r', '22');
          halo.setAttribute('fill', report.color);
          halo.setAttribute('fill-opacity', '0.10');
          shape.appendChild(halo);
          pin.appendChild(shape);
          var pinImage = document.createElement('img');
          pinImage.className = 'report-pin-image';
          pinImage.src = report.illustrationUri;
          pinImage.alt = '';
          pin.appendChild(pinImage);
          if (group.length > 1) {
            var count = document.createElement('span');
            count.className = 'report-pin-count';
            count.style.backgroundColor = report.color;
            count.textContent = String(group.length);
            pin.appendChild(count);
          }
          var label = group.length > 1 ? group.length + ' signalements dans cette zone' : report.title;
          var marker = L.marker([report.latitude, report.longitude], {
            icon: L.divIcon({ html: pin, className: '', iconSize: [64, 76], iconAnchor: [32, 74] }),
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
      function renderStations() {
        stationsLayer.clearLayers();
        var groups = [];
        currentStations.forEach(function (station) {
          var point = map.latLngToLayerPoint([station.latitude, station.longitude]);
          var group = groups.find(function (items) {
            return point.distanceTo(map.latLngToLayerPoint([items[0].latitude, items[0].longitude])) < 44;
          });
          if (group) group.push(station);
          else groups.push([station]);
        });
        groups.forEach(function (group) {
          var station = group[0];
          var pin = document.createElement('div');
          pin.className = 'station-pin';
          var icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          icon.setAttribute('width', '24');
          icon.setAttribute('height', '24');
          icon.setAttribute('viewBox', '0 0 24 24');
          icon.setAttribute('aria-hidden', 'true');
          var drawing = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          drawing.setAttribute('d', 'M5 17V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Zm0-6h14M8 6h8M8 15h.01M16 15h.01M7 19v2M17 19v2');
          drawing.setAttribute('fill', 'none');
          drawing.setAttribute('stroke', 'currentColor');
          drawing.setAttribute('stroke-width', '2');
          drawing.setAttribute('stroke-linecap', 'round');
          icon.appendChild(drawing);
          pin.appendChild(icon);
          if (group.length > 1) {
            var badge = document.createElement('span');
            badge.className = 'station-count';
            badge.textContent = String(group.length);
            pin.appendChild(badge);
          }
          var label = group.length > 1 ? group.length + ' stations dans cette zone' : station.title;
          var marker = L.marker([station.latitude, station.longitude], {
            icon: L.divIcon({ html: pin, className: '', iconSize: [44, 44], iconAnchor: [22, 22] }),
            title: label, alt: label, keyboard: true,
            // Keep report pins legible where an incident and a station coincide.
            zIndexOffset: -100
          }).addTo(stationsLayer);
          marker.getElement().setAttribute('aria-label', label);
          if (group.length === 1) {
            marker.on('click', function () { notify('station-select', station.id); });
          } else {
            var choices = document.createElement('div');
            choices.className = 'accident-choices';
            group.forEach(function (item) {
              var button = document.createElement('button');
              button.className = 'accident-choice';
              button.textContent = item.title;
              button.onclick = function () { notify('station-select', item.id); };
              choices.appendChild(button);
            });
            marker.bindPopup(choices);
          }
        });
      }
      window.stopAccidentsStations = function (stations) {
        currentStations = stations.filter(function (station) {
          return typeof station.id === 'string' && Number.isFinite(station.latitude) &&
            Number.isFinite(station.longitude) && bounds.contains([station.latitude, station.longitude]);
        });
        renderStations();
      };
      map.on('zoomend', renderStations);
      window.addEventListener('message', function (event) {
        // about:srcdoc reports a null location.origin despite inheriting the parent origin.
        // Accept updates only from the embedding application window.
        if (event.source !== window.parent) return;
        if (event.data && event.data.source === 'stopaccidents-app') {
          if ('theme' in event.data) window.stopAccidentsTheme(event.data.theme);
          if (event.data.location) window.stopAccidentsLocate(event.data.location);
          if ('placeFocus' in event.data) window.stopAccidentsFocus(event.data.placeFocus);
          if ('route' in event.data) window.stopAccidentsRoute(event.data.route);
          if (Array.isArray(event.data.markers)) window.stopAccidentsUpdate(event.data.markers);
          if (Array.isArray(event.data.stations)) window.stopAccidentsStations(event.data.stations);
        }
      });
      var tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        bounds: bounds,
        noWrap: true,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">contributeurs OpenStreetMap</a>'
      });
      tiles.once('tileload', function () { notify('ready'); notifyCenter(); });
      tiles.on('tileerror', function () { notify('error'); });
      tiles.addTo(map);
    } catch (error) { notify('error'); }
  </script>
</body>
</html>`;

export type MapMessage =
  | { status: 'center'; latitude: number; longitude: number }
  | { status: 'ready' | 'error' | 'pan' }
  | { status: 'select' | 'station-select'; id: string };

export function readMapMessage(message: unknown): MapMessage | null {
  if (typeof message !== 'string') return null;
  try {
    const value = JSON.parse(message);
    if (value?.source !== 'stopaccidents-map') return null;
    if (value.status === 'center' &&
        Number.isFinite(value.latitude) && Number.isFinite(value.longitude) &&
        value.latitude >= HAITI_BOUNDS[0][0] && value.latitude <= HAITI_BOUNDS[1][0] &&
        value.longitude >= HAITI_BOUNDS[0][1] && value.longitude <= HAITI_BOUNDS[1][1]) {
      return { status: 'center', latitude: value.latitude, longitude: value.longitude };
    }
    if (
      value.status === 'ready' ||
      value.status === 'error' ||
      value.status === 'pan'
    )
      return { status: value.status };
    if ((value.status === 'select' || value.status === 'station-select') && typeof value.id === 'string') {
      return { status: value.status, id: value.id };
    }
    return null;
  } catch {
    return null;
  }
}
