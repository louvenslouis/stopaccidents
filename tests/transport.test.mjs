import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

async function compile(path, dependencies = {}) {
  const source = await readFile(
    new URL(`../src/${path}.ts`, import.meta.url),
    "utf8",
  );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const exports = {};
  new Function("require", "exports", outputText)(
    (name) => dependencies[name],
    exports,
  );
  return exports;
}
const documentModule = await compile("components/map-document");
const model = await compile("features/transport/model", {
  "@/components/map-document": documentModule,
});
const station = {
  id: "station-1",
  name: "Station Pétion-Ville",
  commune: "Pétion-Ville",
  address: "Place Saint-Pierre",
  latitude: 18.51,
  longitude: -72.28,
  is_demo: true,
};

test("Station search accepts accents and filters invalid map coordinates", () => {
  assert.deepEqual(model.filterStations([station], "petion saint"), [station]);
  assert.deepEqual(model.filterStations([station], "carrefour"), []);
  const markers = model.stationMarkers([
    station,
    ...[null, NaN, 40].map((latitude) => ({ ...station, latitude })),
  ]);
  assert.equal(markers.length, 1);
  assert.equal(markers[0].title, station.name);
  assert.deepEqual(
    documentModule.readMapMessage(
      JSON.stringify({
        source: "stopaccidents-map",
        status: "station-select",
        id: station.id,
      }),
    ),
    { status: "station-select", id: station.id },
  );
  assert.equal(
    documentModule.readMapMessage(
      JSON.stringify({
        source: "stopaccidents-map",
        status: "station-select",
        id: 123,
      }),
    ),
    null,
  );
});

test("Sample and missing fares never claim to be official; zero fares remain valid", () => {
  const route = {
    departure: station,
    arrival: station,
    is_demo: true,
    official_fare_htg: 75,
    fare_reference: null,
    fare_effective_from: null,
  };
  assert.equal(model.routeFare(route).label, "Tarif");
  assert.equal(model.routeFare(route).detail, null);
  assert.equal(
    model.routeFare({ ...route, is_demo: false }).label,
    "Tarif",
    "Demo endpoint also labels the fare",
  );
  const real = {
    ...route,
    departure: { ...station, is_demo: false },
    arrival: { ...station, is_demo: false },
    is_demo: false,
  };
  assert.equal(model.routeFare(real).amount, "À confirmer");
  assert.equal(
    model.routeFare({ ...real, official_fare_htg: null }).amount,
    "Non renseigné",
  );
  assert.equal(
    model.routeFare({ ...real, official_fare_htg: NaN }).amount,
    "Non renseigné",
  );
  const valid = model.routeFare({
    ...real,
    official_fare_htg: 0,
    fare_reference: "Décision test",
    fare_effective_from: "2026-09-01",
  });
  assert.equal(valid.amount, "0 HTG");
  assert.equal(valid.label, "Tarif de l’État");
  assert.match(valid.detail, /Décision test/);
});

test("Station API paginates, cancels, and surfaces failures without fake fallback", async () => {
  const ranges = [];
  const signal = new AbortController().signal;
  let fail = false;
  let calls = 0;
  const builder = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    order() {
      return this;
    },
    range(...range) {
      ranges.push(range);
      return this;
    },
    abortSignal(received) {
      assert.equal(received, signal);
      return Promise.resolve(
        fail
          ? { data: null, error: new Error("network") }
          : {
              data:
                calls++ === 0
                  ? Array.from({ length: 500 }, (_, i) => ({
                      ...station,
                      id: String(i),
                    }))
                  : [station],
              error: null,
            },
      );
    },
  };
  const api = await compile("features/transport/api", {
    "@/lib/supabase": { supabase: { from: () => builder } },
  });
  assert.equal((await api.readTransportStations(signal)).length, 501);
  assert.deepEqual(ranges, [
    [0, 499],
    [500, 999],
  ]);
  fail = true;
  await assert.rejects(
    api.readTransportStations(signal),
    /Impossible de charger les stations/,
  );
  await assert.rejects(
    api.readStationRoutes(station.id, signal),
    /Impossible de charger les trajets/,
  );
});
