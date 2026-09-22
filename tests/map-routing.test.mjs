import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const exports = {};
new Function(
  "exports",
  ts.transpileModule(await readFile("src/components/map-document.ts", "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
)(exports);

test("map route bridge draws GeoJSON in latitude order, fits once, preserves GPS follow and clears layers", () => {
  const lines = [],
    circles = [],
    fits = [],
    messages = [],
    removed = [],
    views = [],
    pans = [];
  const listeners = {};
  const parent = {
    postMessage: (message) => messages.push(JSON.parse(message)),
  };
  const layer = () => ({
    addTo() {
      return this;
    },
    clearLayers() {
      this.cleared = true;
    },
  });
  const map = {
    setMinZoom() {},
    panInsideBounds() {},
    getBoundsZoom: () => 8,
    getMinZoom: () => 8,
    setView: (...args) => views.push(args),
    on() {},
    getCenter: () => ({ lat: 19, lng: -73 }),
    getSize: () => ({ x: 390, y: 844 }),
    fitBounds: (...args) => fits.push(args),
    removeLayer: (layer) => removed.push(layer),
    panTo: (point) => pans.push(point),
  };
  const circle = (point, options) => {
    const value = {
      point,
      options,
      addTo() {
        circles.push(this);
        return this;
      },
      bindTooltip() {},
      setLatLng() {
        return this;
      },
      setRadius() {
        return this;
      },
    };
    return value;
  };
  const context = vm.createContext({
    window: {
      parent,
      addEventListener: (event, fn) => {
        listeners[event] = fn;
      },
    },
    L: {
      latLngBounds: (points) => ({
        points,
        getCenter: () => [19, -73],
        contains: ([lat, lon]) =>
          lat >= 18 && lat <= 20.1 && lon >= -74.55 && lon <= -71.6,
      }),
      map: () => map,
      control: { zoom: () => ({ addTo() {} }) },
      layerGroup: layer,
      tileLayer: () => ({ once() {}, on() {}, addTo() {} }),
      polyline: (points, options) => ({
        addTo(target) {
          lines.push({ points, options, target });
        },
      }),
      circle,
      circleMarker: circle,
    },
  });
  for (const [, script] of exports.MAP_DOCUMENT.matchAll(
    /<script>([\s\S]*?)<\/script>/g,
  ))
    vm.runInContext(script, context);
  const send = (data, source = parent) =>
    listeners.message({
      source,
      data: { source: "stopaccidents-app", ...data },
    });
  const route = {
    coordinates: [
      [-72.3, 18.5],
      [-72.29, 18.51],
    ],
    fitRequest: 1,
  };
  send({ route }, {});
  assert.equal(lines.length, 0, "Only the embedding app can set a route");
  send({ route });
  assert.deepEqual(JSON.parse(JSON.stringify(lines[0].points)), [
    [18.5, -72.3],
    [18.51, -72.29],
  ]);
  assert.equal(lines.length, 2, "White outline and colored route");
  assert.equal(circles.length, 2, "Departure and arrival markers");
  assert.equal(fits.length, 1);
  assert.ok(
    fits[0][1].paddingTopLeft[1] > 400,
    "Fit leaves room for the planner panel",
  );
  const position = { latitude: 18.5, longitude: -72.3, accuracy: 10 };
  send({ location: { position, following: true, focusRequest: 1 } });
  send({ route });
  assert.equal(fits.length, 1, "A reports refresh must not steal GPS focus");
  send({ location: { position, following: true, focusRequest: 1 } });
  assert.equal(pans.length, 1);
  send({ route: { ...route, fitRequest: 2 } });
  assert.equal(fits.length, 2, "Explicit fit centers the full route again");
  const lastLayer = lines.at(-1).target;
  send({ route: null });
  assert.equal(lastLayer.cleared, true);
  assert.ok(removed.includes(lastLayer));
  const count = lines.length;
  send({
    route: {
      coordinates: [
        [NaN, 0],
        [-72, 19],
      ],
      fitRequest: 3,
    },
  });
  assert.equal(lines.length, count);
  send({ placeFocus: { latitude: 18.5, longitude: -72.3, request: 7 } });
  const viewCount = views.length;
  send({ placeFocus: null });
  send({ placeFocus: { latitude: 18.5, longitude: -72.3, request: 7 } });
  assert.equal(
    views.length,
    viewCount + 1,
    "Closing the planner restores the searched place",
  );
  assert.equal(
    messages.some((message) => message.status === "error"),
    false,
  );
});
