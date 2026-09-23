import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { test } from "node:test";

const catalogue = JSON.parse(
  readFileSync(
    new URL("../src/features/reports/territories.json", import.meta.url),
    "utf8",
  ),
);
const source = readFileSync(
  new URL("../src/features/reports/territories.ts", import.meta.url),
  "utf8",
);
const context = { exports: {}, require: () => catalogue };
vm.runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText,
  context,
);
const {
  territoryFilter,
  territoryLabel,
  matchesTerritorySearch,
  departments,
  communes,
} = context.exports;

test("commune selection supplies its department and incompatible parents clear it", () => {
  const selection = territoryFilter(null, "HT0114");
  assert.equal(selection.department, "HT01");
  assert.equal(selection.commune, "HT0114");
  assert.equal(territoryLabel(selection), "Pétion-Ville · Ouest");
  assert.equal(territoryFilter("HT03", "HT0114").commune, null);
  assert.equal(territoryFilter("unknown", "HT0114").commune, null);
  assert.equal(territoryFilter("invalid", "invalid").department, null);
  assert.equal(territoryFilter("HT01", null).commune, null);
  assert.equal(territoryLabel(territoryFilter()), "Tout Haïti");
  assert.equal(
    territoryLabel(territoryFilter("HT01", "unknown")),
    "Commune à préciser · Ouest",
  );
  assert.equal(territoryFilter(null, "unknown").commune, "unknown");
});
test("search handles accents, hyphens and department names; catalogue is complete", () => {
  assert.ok(matchesTerritorySearch("Pétion-Ville Ouest", "petion ville"));
  assert.ok(matchesTerritorySearch("Cap-Haïtien Nord", "cap haitien"));
  assert.ok(matchesTerritorySearch("Port-au-Prince Ouest", "ouest"));
  assert.equal(departments.length, 10);
  assert.equal(communes.length, 140);
  assert.equal(new Set(communes.map((item) => item.code)).size, 140);
  assert.ok(
    communes.every((c) =>
      departments.some((d) => d.code === c.department_code),
    ),
  );
});
