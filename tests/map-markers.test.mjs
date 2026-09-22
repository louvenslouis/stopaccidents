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
    on() {},
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
    { ...report, id: 'second', latitude: 18.50001, color: '#BD2E40', priority: 4 },
    { ...report, id: 'third', latitude: 19 },
  ]);
  assert.equal(markers.length, 2, 'Colocated reports must share one marker');
  assert.equal(markers[0].options.icon.html.textContent, '2');
  assert.equal(markers[0].options.icon.html.style.backgroundColor, '#BD2E40', 'Groups show the highest reported severity');
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
});
