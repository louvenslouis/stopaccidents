import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { test } from "node:test";
const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../src/features/reports/model.ts", import.meta.url),
  "utf8",
);
const code = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const context = {
  exports: {},
  require: (name) =>
    name.includes("presentation")
      ? { accidentTypeLabels: { two_cars: "Deux voitures" } }
      : require(name),
  Intl,
  Date,
  Map,
  Math,
};
vm.runInNewContext(code, context);
const { periodRange, validateRange, chartBuckets, haitiToday, subcategories, dateLabel } =
  context.exports;

test("rolling periods cross years and leap days; dates follow Haiti", () => {
  assert.equal(periodRange("week", 0, "2026-01-03").start, "2025-12-28");
  assert.equal(periodRange("week", -1, "2026-01-03").end, "2025-12-27");
  assert.equal(periodRange("month", 0, "2024-03-01").start, "2024-02-01");
  assert.equal(periodRange("all", 0, "2026-09-22").start, null);
  assert.equal(haitiToday(new Date("2026-09-22T02:00:00Z")), "2026-09-21");
});
test("custom ranges reject impossible, inverted and future dates", () => {
  assert.equal(validateRange("2024-02-29", "2024-03-01", "2026-09-22"), null);
  for (const pair of [
    ["2026-02-29", "2026-03-01"],
    ["2026-09-23", "2026-09-22"],
    ["2026-09-20", "2026-09-23"],
    ["invalid", "2026-09-22"],
  ])
    assert.ok(validateRange(...pair, "2026-09-22"));
});
test("charts fill gaps, include both boundaries, and retain every count in long periods", () => {
  const daily = [
    { date: "2026-09-01", count: 3 },
    { date: "2026-09-07", count: 5 },
  ];
  const week = chartBuckets(
    daily,
    { start: "2026-09-01", end: "2026-09-07" },
    null,
  );
  assert.equal(week.length, 7);
  assert.equal(week[1].count, 0);
  assert.equal(week[6].count, 5);
  const year = chartBuckets(
    daily,
    { start: "2026-01-01", end: "2026-12-31" },
    null,
  );
  assert.ok(year.length <= 31);
  assert.equal(
    year.reduce((sum, b) => sum + b.count, 0),
    8,
  );
  assert.equal(year.at(-1).end, "2026-12-31");
  assert.equal(subcategories("traffic").length, 2);
  assert.equal(subcategories("security").length, 4);
});

test('event dates match the chart calendar day in Haiti', () => {
 assert.equal(context.exports.dateLabel('2026-09-21T03:30:00+00:00'), context.exports.dateLabel('2026-09-20'));
});
