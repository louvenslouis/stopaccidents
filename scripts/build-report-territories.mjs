// Usage: node scripts/build-report-territories.mjs source.geojson migration1.sql migration2.sql migration3.sql
// Source and provenance: docs/report-territories.md. Preserve full geometry.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const [sourcePath, ...migrationPaths] = process.argv.slice(2);
if (!sourcePath || migrationPaths.length !== 3)
  throw new Error("Expected GeoJSON and three migration paths");
const source = readFileSync(sourcePath, "utf8");
const { features, exceededTransferLimit } = JSON.parse(source);
if (exceededTransferLimit || features?.length !== 140)
  throw new Error("Expected the complete 140-commune reference");
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const polygon = (ring) => {
  if (
    ring.length < 4 ||
    ring.some((p) => p.length !== 2 || p.some((n) => !Number.isFinite(n)))
  )
    throw new Error("Invalid ring");
  return `${quote(`(${ring.map(([x, y]) => `(${x},${y})`).join(",")})`)}::polygon`;
};
const communes = [];
const boundaries = [];
for (const feature of features) {
  const p = feature.properties;
  const row = {
    code: p.ADM2_PCODE,
    name: p.ADM2_FR,
    department_code: p.ADM1_PCODE,
    department_name: p.ADM1_FR,
  };
  if (
    !/^HT\d{4}$/.test(row.code) ||
    !row.name ||
    !/^HT\d{2}$/.test(row.department_code) ||
    !row.department_name
  )
    throw new Error("Invalid commune");
  communes.push(row);
  const g = feature.geometry;
  if (!["Polygon", "MultiPolygon"].includes(g.type))
    throw new Error("Invalid geometry");
  for (const [exterior, ...holes] of g.type === "Polygon"
    ? [g.coordinates]
    : g.coordinates) {
    boundaries.push(
      `(${quote(row.code)},${polygon(exterior)},ARRAY[${holes.map(polygon).join(",")}]::polygon[])`,
    );
  }
}
communes.sort((a, b) => a.code.localeCompare(b.code));
if (
  new Set(communes.map((c) => c.code)).size !== 140 ||
  new Set(communes.map((c) => c.department_code)).size !== 10
)
  throw new Error("Incomplete or duplicate reference");
// Bound each migration below the Management API request-size limit.
const chunks = [[], [], []];
const target = Math.ceil(boundaries.join(",\n").length / chunks.length);
let part = 0;
let size = 0;
for (const boundary of boundaries) {
  if (size >= target && part < chunks.length - 1) {
    part++;
    size = 0;
  }
  chunks[part].push(boundary);
  size += boundary.length + 2;
}
const generated = migrationPaths.map((path, index) => {
  const migration = readFileSync(path, "utf8");
  if (!migration.includes("-- BEGIN TERRITORY SEED"))
    throw new Error("Missing seed marker");
  const seed =
    `-- GeoJSON SHA-256: ${createHash("sha256").update(source).digest("hex")}\n` +
    (index === 0
      ? `insert into private.report_communes(code,name,department_code,department_name) values\n${communes.map((c) => `(${Object.values(c).map(quote).join(",")})`).join(",\n")};\n`
      : "") +
    `insert into private.report_commune_boundaries(commune_code,exterior,holes) values\n${chunks[index].join(",\n")};`;
  const sql = migration.replace(
    /-- BEGIN TERRITORY SEED[\s\S]*?-- END TERRITORY SEED/,
    `-- BEGIN TERRITORY SEED\n${seed}\n-- END TERRITORY SEED`,
  );
  if (Buffer.byteLength(sql) > 900000)
    throw new Error("Migration exceeds size budget");
  return { path, sql };
});
for (const { path, sql } of generated) writeFileSync(path, sql);
writeFileSync(
  new URL("../src/features/reports/territories.json", import.meta.url),
  JSON.stringify(communes, null, 2) + "\n",
);
console.log(
  `Generated ${communes.length} communes, ${boundaries.length} polygons; no geometry simplification.`,
);
