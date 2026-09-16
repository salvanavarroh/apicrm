// ============================================================================
// Secciones del CRM para medir "dónde pasa el tiempo" cada vendedor.
//
// El latido manda la sección, no la URL: guardar la ruta cruda daría cientos de
// valores distintos (cada ficha de lead es una ruta) y el informe se volvería
// ilegible. Ocho cajones alcanzan para la pregunta real —¿está en el Inbox
// contestando o dando vueltas por configuración?—.
//
// Este módulo lo importan el tracker (cliente) y el informe (server), así que
// no puede arrastrar React ni el cliente de Supabase.
// ============================================================================

export type ActivitySection =
  | "inbox"
  | "leads"
  | "tasks"
  | "sales"
  | "reports"
  | "catalog"
  | "config"
  | "home"
  | "other";

export const SECTION_LABELS: Record<ActivitySection, string> = {
  inbox: "Inbox",
  leads: "Leads",
  tasks: "Tareas y visitas",
  sales: "Ventas",
  reports: "Reportes",
  catalog: "Catálogo y precios",
  config: "Configuración",
  home: "Inicio",
  other: "Otras pantallas",
};

/** Prefijos de rol en las rutas: se descartan antes de clasificar, así
 *  `/sales/leads` y `/admin/leads` cuentan los dos como "Leads". */
const ROLE_PREFIXES = new Set([
  "admin",
  "manager",
  "sales",
  "data-provider",
  "super-admin",
  "group",
]);

const BY_HEAD: Record<string, ActivitySection> = {
  inbox: "inbox",
  leads: "leads",
  pool: "leads",
  "lead-ads": "leads",
  "tasks-visits": "tasks",
  sales: "sales",
  reports: "reports",
  reportes: "reports",
  ads: "reports",
  prices: "catalog",
  "product-types": "catalog",
  valuations: "catalog",
  campaigns: "config",
  forms: "config",
  sheets: "config",
  channels: "config",
  integraciones: "config",
  bot: "config",
  company: "config",
  users: "config",
  branches: "config",
  managements: "config",
  team: "config",
  "whatsapp-templates": "config",
  dashboard: "home",
  profile: "other",
  ayuda: "other",
};

export function sectionForPath(pathname: string): ActivitySection {
  const parts = pathname.split("/").filter(Boolean);
  const rest = ROLE_PREFIXES.has(parts[0] ?? "") ? parts.slice(1) : parts;
  // `/admin`, `/sales`, `/manager` a secas son el inicio de cada rol.
  if (rest.length === 0) return "home";
  return BY_HEAD[rest[0]] ?? "other";
}

/** "6 h 40 min" — el formato que se lee de un pantallazo. */
export function formatMinutes(total: number): string {
  const m = Math.max(0, Math.round(total));
  if (m === 0) return "0 min";
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest} min`;
  if (rest === 0) return `${h} h`;
  return `${h} h ${rest} min`;
}

/** "09:42" en el timezone de la concesionaria. */
export function formatClock(iso: string | null, tz: string): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  }).format(new Date(iso));
}
