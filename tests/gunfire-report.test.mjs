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
const model = await compile("features/gunfire-report/model");
const draft = {
  id: "armed-id",
  location: "Delmas",
  locationHint: "Près du carrefour",
  coordinates: { latitude: 18.55, longitude: -72.3, accuracy: 9 },
  shotCount: "two_to_five",
  proximity: "near",
  cadence: "bursts",
  details: "",
};

test("gunfire accepts estimates and unknowns, rejects missing or invalid observations", () => {
  assert.equal(model.validateGunfireStep(draft, 0), null);
  assert.ok(model.validateGunfireStep({ ...draft, coordinates: null }, 0));
  assert.ok(
    model.validateGunfireStep(
      { ...draft, coordinates: { ...draft.coordinates, accuracy: 31 } },
      0,
    ),
  );
  assert.equal(model.validateGunfireStep(draft, 1), null);
  assert.equal(
    model.validateGunfireStep(
      {
        ...draft,
        shotCount: "unknown",
        proximity: "unknown",
        cadence: "unknown",
      },
      1,
    ),
    null,
  );
  for (const field of ["shotCount", "proximity", "cadence"]) {
    for (const value of ["", "invalid"])
      assert.ok(model.validateGunfireStep({ ...draft, [field]: value }, 1));
  }
  assert.equal(model.validateGunfireStep(draft, 2), null);
  assert.equal(
    model.validateGunfireStep({ ...draft, details: "x".repeat(2000) }, 2),
    null,
  );
  assert.ok(
    model.validateGunfireStep({ ...draft, details: "x".repeat(2001) }, 2),
  );
  assert.ok(model.validateGunfireStep(draft, -1));
});

test("gunfire saves each stage under the same ID and safely retries failures", async () => {
  const calls = [];
  let fail = false;
  const { saveGunfireReportStep } = await compile(
    "features/gunfire-report/submit",
    {
      "./model": model,
      "@/lib/supabase": {
        supabase: {
          auth: {
            getSession: async () => ({
              data: { session: { user: { id: "owner" } } },
              error: null,
            }),
          },
          rpc: async (name, payload) => {
            calls.push({ name, payload });
            return {
              data: fail ? null : payload.p_id,
              error: fail ? {} : null,
            };
          },
        },
      },
    },
  );
  await saveGunfireReportStep(draft, 0, () => {});
  assert.deepEqual(calls[0], {
    name: "save_gunfire_report_step",
    payload: {
      p_id: draft.id,
      p_step: 1,
      p_location: "Delmas — Près du carrefour",
      p_latitude: 18.55,
      p_longitude: -72.3,
      p_accuracy: 9,
    },
  });
  fail = true;
  await assert.rejects(
    saveGunfireReportStep(draft, 1, () => {}),
    /aucun doublon/,
  );
  fail = false;
  await saveGunfireReportStep(draft, 1, () => {});
  assert.deepEqual(calls[1], calls[2]);
  assert.deepEqual(calls[2].payload, {
    p_id: draft.id,
    p_step: 2,
    p_shot_count: "two_to_five",
    p_proximity: "near",
    p_cadence: "bursts",
  });
  await saveGunfireReportStep(draft, 2, () => {});
  assert.deepEqual(calls[3].payload, {
    p_id: draft.id,
    p_step: 3,
    p_details: "",
  });
});

test("gunfire markers select the matching detail RPC and respect map bounds", async () => {
  const calls = [];
  const report = {
    id: draft.id,
    report_kind: "gunfire",
    latitude: 18.55,
    longitude: -72.3,
    created_at: "2026-09-22T00:00:00Z",
  };
  const read = await compile("features/safety-report/read", {
    "@/lib/supabase": {
      supabase: {
        rpc: (name, params) => {
          calls.push({ name, params });
          return { abortSignal: async () => ({ data: report, error: null }) };
        },
      },
    },
  });
  const { safetyReportMarkers } = await compile(
    "features/safety-report/map-markers",
    {
      "./read": read,
      "@/components/map-document": {
        HAITI_BOUNDS: [
          [18, -74.55],
          [20.1, -71.6],
        ],
      },
      "@/features/accident-report/presentation": {
        formatAccidentDate: () => "date",
      },
    },
  );
  const markers = safetyReportMarkers([
    report,
    { ...report, latitude: null },
    { ...report, latitude: 90 },
  ]);
  assert.equal(markers.length, 1);
  assert.equal(markers[0].illustration, "gunfire");
  assert.match(markers[0].title, /^Tirs entendus · lieu d’écoute/);
  assert.deepEqual(read.parseReportSelection(markers[0].id), {
    reportKind: "gunfire",
    id: draft.id,
  });
  assert.equal(
    await read.readGunfireReport(draft.id, new AbortController().signal),
    report,
  );
  assert.deepEqual(calls, [
    { name: "read_gunfire_report", params: { p_id: draft.id } },
  ]);
});
