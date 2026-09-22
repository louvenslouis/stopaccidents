import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

async function compile(path, dependencies = {}) {
  const source = await readFile(
    new URL(`../src/${path}.ts`, import.meta.url),
    'utf8',
  );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const exports = {};
  new Function('require', 'exports', outputText)(
    (name) => dependencies[name],
    exports,
  );
  return exports;
}
const documentModule = await compile('components/map-document');
const presentation = await compile('features/accident-report/presentation');
const { accidentMarkers } = await compile(
  'features/accident-report/map-markers',
  {
    '@/components/map-document': documentModule,
    './presentation': presentation,
  },
);

test('map markers exclude invalid/outside coordinates and preserve partial reports', () => {
  const report = {
    id: 'partial',
    latitude: 18.5,
    longitude: -72.3,
    completed_step: 1,
    severity: 'fatal',
    accident_type: null,
    created_at: '2026-01-01',
  };
  const markers = accidentMarkers([
    report,
    ...[null, NaN, 0, 40].map((latitude) => ({ ...report, latitude })),
  ]);
  assert.equal(markers.length, 1);
  assert.match(markers[0].title, /Type à préciser · À préciser/);
  assert.equal(markers[0].color, '#657084');
  assert.equal(
    accidentMarkers([{ ...report, completed_step: 3 }])[0].color,
    '#BD2E40',
  );
});

test('map bridge rejects malformed messages and accepts only known event shapes', () => {
  const parse = documentModule.readMapMessage;
  for (const value of [
    null,
    '{',
    'null',
    '{}',
    JSON.stringify({ source: 'other', status: 'ready' }),
    JSON.stringify({ source: 'stopaccidents-map', status: 'select', id: 1 }),
  ]) {
    assert.equal(parse(value), null);
  }
  assert.deepEqual(
    parse(
      JSON.stringify({
        source: 'stopaccidents-map',
        status: 'select',
        id: 'real-id',
      }),
    ),
    { status: 'select', id: 'real-id' },
  );
});

test('embedded map receives srcdoc updates, preserves colocated choices and never interprets titles as HTML', () => {
  const markers = [];
  const messages = [];
  const views = [];
  const pans = [];
  const circles = [];
  const removed = [];
  const mapEvents = {};
  const listeners = {};
  const layer = {
    addTo: () => layer,
    clearLayers: () => {
      markers.length = 0;
    },
  };
  const map = {
    setMinZoom() {},
    panInsideBounds() {},
    getMinZoom: () => 8,
    getBoundsZoom: () => 8,
    setView: (...args) => views.push(args),
    on: (name, callback) => {
      mapEvents[name] = callback;
    },
    panTo: (point) => pans.push(point),
    removeLayer: (layer) => removed.push(layer),
    latLngToLayerPoint: ([lat, lon]) => ({
      lat,
      lon,
      distanceTo: (point) =>
        Math.hypot(lat - point.lat, lon - point.lon) * 1000,
    }),
  };
  const tiles = { once() {}, on() {}, addTo() {} };
  const parent = {
    postMessage: (message) => messages.push(JSON.parse(message)),
  };
  const context = vm.createContext({
    window: {
      parent,
      location: { origin: 'null' },
      addEventListener: (name, fn) => {
        listeners[name] = fn;
      },
    },
    document: {
      createElement: () => ({
        style: {},
        children: [],
        setAttribute() {},
        appendChild(child) {
          this.children.push(child);
        },
      }),
    },
    L: {
      latLngBounds: () => ({
        getCenter: () => [19, -73],
        contains: ([lat, lon]) =>
          lat >= 18 && lat <= 20.1 && lon >= -74.55 && lon <= -71.6,
      }),
      map: () => map,
      control: { zoom: () => ({ addTo() {} }) },
      layerGroup: () => layer,
      tileLayer: () => tiles,
      divIcon: (options) => options,
      circle: (point, options) => makeCircle(point, options),
      circleMarker: (point, options) => makeCircle(point, options),
      marker: (position, options) => {
        const marker = {
          position,
          options,
          getElement: () => options.icon.html,
          addTo() {
            markers.push(this);
            return this;
          },
          on(_, handler) {
            this.click = handler;
          },
          bindPopup(popup) {
            this.popup = popup;
          },
        };
        return marker;
      },
    },
  });
  function makeCircle(point, options) {
    const circle = {
      point,
      options,
      addTo() {
        circles.push(this);
        return this;
      },
      bindTooltip() {},
      setLatLng(point) {
        this.point = point;
        return this;
      },
      setRadius(radius) {
        this.options.radius = radius;
        return this;
      },
    };
    return circle;
  }
  for (const [, script] of documentModule.MAP_DOCUMENT.matchAll(
    /<script>([\s\S]*?)<\/script>/g,
  ))
    vm.runInContext(script, context);
  const report = {
    id: 'first',
    latitude: 18.5,
    longitude: -72.3,
    title: '<img src=x onerror=alert(1)>',
    color: '#657084',
    priority: 0,
    illustrationUri: '/assets/accident.png',
  };
  const send = (source, reports) =>
    listeners.message({
      source,
      origin: 'https://app.example',
      data: { source: 'stopaccidents-app', markers: reports },
    });
  send({}, [report]);
  assert.equal(markers.length, 0, 'Unrelated windows must be ignored');
  send(parent, [
    report,
    {
      ...report,
      id: 'second',
      latitude: 18.50001,
      color: '#BD2E40',
      priority: 4,
    },
    { ...report, id: 'third', latitude: 19 },
  ]);
  assert.equal(markers.length, 2, 'Colocated reports must share one marker');
  assert.equal(markers[0].options.icon.html.children[0].src, '/assets/accident.png');
  assert.equal(markers[0].options.icon.html.children[1].textContent, '2');
  assert.equal(
    markers[0].options.icon.html.children[1].style.backgroundColor,
    '#BD2E40',
    'The group badge shows the highest reported severity',
  );
  assert.equal(markers[0].popup.children[0].textContent, report.title);
  assert.equal(markers[0].popup.children[0].innerHTML, undefined);
  markers[0].popup.children[1].onclick();
  markers[1].click();
  assert.deepEqual(
    messages.map((event) => event.id),
    ['second', 'third'],
  );
  assert.equal(views.length, 2, 'Initial map view plus first accident focus');
  send(parent, [report]);
  assert.equal(markers.length, 1, 'Refresh must remove stale markers');
  assert.equal(views.length, 2, 'Refresh must preserve viewport');

  const locate = (
    position,
    following = true,
    focusRequest = 1,
    source = parent,
  ) =>
    listeners.message({
      source,
      data: {
        source: 'stopaccidents-app',
        location: { position, following, focusRequest },
      },
    });
  const position = { latitude: 18.51, longitude: -72.31, accuracy: 15 };
  locate(position, true, 1, {});
  assert.equal(circles.length, 0, 'Unrelated windows cannot set user location');
  locate(position);
  assert.equal(circles.length, 2, 'Position has a dot and accuracy circle');
  assert.equal(views.length, 3, 'First fix centers the map');
  assert.equal(views.at(-1)[1], 16);
  locate({ ...position, latitude: 18.52, accuracy: 23 });
  assert.equal(pans.length, 1, 'Movement follows the user');
  assert.equal(circles[0].options.radius, 23);
  assert.equal(circles[1].point[0], 18.52);
  send(parent, [report]);
  assert.equal(
    circles.length,
    2,
    'Accident refresh does not recreate GPS marker',
  );
  assert.equal(views.length, 3, 'Accident refresh never steals location focus');
  mapEvents.dragstart();
  assert.equal(messages.at(-1).status, 'pan');
  locate({ ...position, latitude: 18.53 }, false);
  assert.equal(
    pans.length,
    1,
    'Exploring pauses automatic centering, not GPS updates',
  );
  assert.equal(circles[1].point[0], 18.53);
  locate(position, true, 2);
  assert.equal(views.length, 4, 'Recenter applies a new focus request');
  locate(null, false, 2);
  assert.equal(removed.length, 2, 'Stopping clears GPS layers');
  locate({ ...position, latitude: 40 });
  assert.equal(
    circles.length,
    2,
    'Out-of-area positions are not plotted in Haiti',
  );
});
