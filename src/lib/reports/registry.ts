// ============================================================================
// Catálogo de reportes.
//
// Cada reporte se declara acá como DATO, no como una página hardcodeada: el
// listado, el ruteo y los filtros disponibles salen de esta tabla. Agregar un
// reporte nuevo es sumar una entrada y su loader, sin tocar el resto.
//
// Es deliberadamente un paso previo al "constructor de reportes": cuando haga
// falta, el constructor genera una definición con esta misma forma en lugar de
// leerla de una constante.
// ============================================================================

export type ReportFilterKind =
  | "range" // desde / hasta con atajos
  | "branch" // sucursal
  | "vendor" // vendedor
  | "productType" // tipo de producto
  | "channel"; // origen de campaña

export type ReportDefinition = {
  id: string;
  title: string;
  /** Una línea: qué pregunta responde. */
  description: string;
  /** Nombre del ícono de lucide, resuelto en el cliente. */
  icon: string;
  /** Filtros que este reporte entiende. */
  filters: ReportFilterKind[];
  /** Rango por default en días. `quarter` = trimestre en curso. */
  defaultRange: number | "quarter";
  /** Roles que pueden verlo. */
  roles: ("admin" | "manager" | "supervisor")[];
};

export const REPORTS: ReportDefinition[] = [
  {
    id: "ventas",
    title: "Reporte de ventas",
    description:
      "Cierres, facturación, ticket promedio y quién vende qué, con la evolución del período.",
    icon: "ShoppingBag",
    filters: ["range", "branch", "vendor"],
    defaultRange: 90,
    roles: ["admin", "manager", "supervisor"],
  },
  {
    id: "leads",
    title: "Reporte de leads",
    description:
      "De dónde vienen, cuántos se convierten, cuánto tardamos en contestar y dónde se caen.",
    icon: "Users",
    filters: ["range", "branch", "channel", "productType"],
    defaultRange: 30,
    roles: ["admin", "manager", "supervisor"],
  },
  {
    id: "trimestral",
    title: "Reporte trimestral",
    description:
      "El trimestre en curso contra el anterior: leads, ventas, facturación y conversión.",
    icon: "CalendarRange",
    filters: ["range"],
    defaultRange: "quarter",
    roles: ["admin", "manager"],
  },
  {
    id: "vendedores",
    title: "Productividad por vendedor",
    description:
      "Carga, actividad, tiempo de primera respuesta y conversión de cada uno del equipo.",
    icon: "Trophy",
    filters: ["range", "branch"],
    defaultRange: 30,
    roles: ["admin", "manager", "supervisor"],
  },
];

export function findReport(id: string): ReportDefinition | null {
  return REPORTS.find((r) => r.id === id) ?? null;
}

export function reportsForRole(role: string): ReportDefinition[] {
  return REPORTS.filter((r) =>
    (r.roles as string[]).includes(role === "supervisor" ? "supervisor" : role),
  );
}

/** Primer y último día del trimestre que contiene `d`. */
export function quarterRange(d: Date): { from: string; to: string } {
  const q = Math.floor(d.getMonth() / 3);
  const start = new Date(d.getFullYear(), q * 3, 1);
  const end = new Date(d.getFullYear(), q * 3 + 3, 0);
  const ymd = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(
      x.getDate(),
    ).padStart(2, "0")}`;
  return { from: ymd(start), to: ymd(end) };
}
