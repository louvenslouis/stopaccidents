import catalogue from "./territories.json";

export type TerritoryFilter = {
  department: string | null;
  commune: string | null;
};
export const allTerritories: TerritoryFilter = {
  department: null,
  commune: null,
};
export const communes = [...catalogue].sort((a, b) =>
  a.name.localeCompare(b.name, "fr"),
);
export const departments = Array.from(
  new Map(
    communes.map((c) => [
      c.department_code,
      {
        code: c.department_code,
        name: c.department_name,
      },
    ]),
  ).values(),
).sort((a, b) => a.name.localeCompare(b.name, "fr"));

export function territoryFilter(
  department?: string | null,
  commune?: string | null,
): TerritoryFilter {
  const selected = communes.find((item) => item.code === commune);
  if (selected && (!department || department === selected.department_code))
    return { department: selected.department_code, commune: selected.code };
  const validDepartment =
    department === "unknown" ||
    departments.some((item) => item.code === department)
      ? department!
      : null;
  return {
    department: validDepartment,
    commune:
      commune === "unknown" && validDepartment !== "unknown" ? "unknown" : null,
  };
}

export function territoryLabel(value: TerritoryFilter) {
  if (value.department === "unknown") return "Territoire à préciser";
  const commune = communes.find((item) => item.code === value.commune);
  const department = departments.find((item) => item.code === value.department);
  if (value.commune === "unknown")
    return `Commune à préciser${department ? ` · ${department.name}` : ""}`;
  return commune
    ? `${commune.name} · ${commune.department_name}`
    : (department?.name ?? "Tout Haïti");
}

export function matchesTerritorySearch(label: string, query: string) {
  const normalize = (text: string) =>
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  return normalize(label).includes(normalize(query));
}
