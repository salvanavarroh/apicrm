// ============================================================================
// Matriz de permisos declarativa.
//
// POR QUÉ EXISTE. Hasta ahora los permisos vivían repartidos: `requireRole([…])`
// en cada página, las policies en las migraciones, `can_export_leads` como flag
// suelto, y `hasRole()` con el caso especial del admin de grupo. Funciona para
// la app, pero no sirve para responder "¿por qué no veo esto?" ni para armarle
// al asistente una cápsula de contexto honesta.
//
// QUÉ ES Y QUÉ NO ES. Esto **describe** la RLS, no la reemplaza. La base sigue
// siendo la que manda: si la matriz dice que sí y la policy dice que no, gana la
// policy y la matriz está mal. El seguro es `pnpm test:permissions`, que verifica
// contra `rls_audit()` que las tablas que la matriz nombra tengan RLS y policies
// para ese rol.
//
// Fuentes: PRD §4, `docs/sistema-y-reglas.md` §§1, 9, 10, 11, 19, y las policies
// de `supabase/migrations/`. Cada regla cita de dónde sale.
// ============================================================================

import type { Profile, UserRole } from "@/lib/auth";

export type Capability =
  // Leads
  | "leads:view"
  | "leads:create"
  | "leads:edit"
  | "leads:delete"
  | "leads:assign"
  | "leads:export"
  | "leads:import"
  | "leads:classify_pool"
  | "leads:merge"
  // Comercial
  | "quotes:create"
  | "sales:start"
  | "sales:approve"
  | "sales:view"
  | "prices:view"
  | "prices:manage"
  | "valuations:use"
  | "valuations:configure"
  // Inbox y automatización
  | "inbox:use"
  | "bot:configure"
  | "templates:own"
  | "templates:global"
  // Equipo
  | "users:manage_admins"
  | "users:manage_managers"
  | "users:manage_providers"
  | "users:manage_sellers"
  | "managements:manage"
  // Configuración de la empresa
  | "company:view_legal"
  | "company:edit_legal"
  | "company:edit_operational"
  | "branches:manage"
  | "product_types:manage"
  | "campaigns:manage"
  | "forms:manage"
  | "integrations:manage"
  // Análisis
  | "reports:view"
  | "ads:view"
  // Plataforma
  | "platform:companies"
  | "platform:billing"
  | "platform:impersonate";

export type CapabilityRule = {
  /** Nombre humano. Es lo que se le dice al usuario. */
  label: string;
  /** Roles que la tienen. `group_admin` se resuelve como `admin` (ver hasRole). */
  roles: UserRole[];
  /** Alcance por rol. Sin esto la respuesta es "sí/no" y no sirve para nada. */
  scope?: Partial<Record<UserRole, string>>;
  /** Flag del profile que además tiene que estar en true. */
  requiresFlag?: { key: "can_export_leads"; label: string };
  /** A quién pedirle cuando no la tenés. */
  askInstead?: string;
  /** Dónde se ejerce, por rol. Alimenta los links profundos del asistente. */
  where?: Partial<Record<UserRole, string>>;
  /** Tablas de Postgres que la respaldan. Lo verifica `pnpm test:permissions`. */
  tables?: string[];
};

const ALL_COMPANY_ROLES: UserRole[] = [
  "admin",
  "manager",
  "supervisor",
  "sales",
  "data_provider",
];

export const CAPABILITIES: Record<Capability, CapabilityRule> = {
  // ---------------------------------------------------------------- Leads --
  "leads:view": {
    label: "Ver leads",
    roles: ["super_admin", ...ALL_COMPANY_ROLES],
    scope: {
      super_admin: "todos los de la plataforma, sólo lectura",
      admin: "todos los de la concesionaria",
      manager: "los de sus gerencias (sucursal + tipo de producto)",
      supervisor: "los de las gerencias de su gerente",
      sales: "los que tiene asignados",
      data_provider: "los que cargó él",
    },
    where: {
      admin: "/admin/leads",
      manager: "/manager/leads",
      supervisor: "/manager/leads",
      sales: "/sales/leads",
      data_provider: "/data-provider/leads",
    },
    tables: ["leads"],
  },
  "leads:create": {
    label: "Cargar leads",
    roles: ALL_COMPANY_ROLES,
    scope: {
      sales: "quedan autoasignados a él, no entran al round-robin",
      data_provider: "quedan a su nombre",
    },
    where: {
      admin: "/admin/leads/new",
      manager: "/manager/leads/new",
      sales: "/sales/leads/new",
      data_provider: "/data-provider/leads/new",
    },
    tables: ["leads"],
  },
  "leads:edit": {
    label: "Editar un lead",
    roles: ALL_COMPANY_ROLES,
    scope: {
      admin: "cualquiera de la concesionaria",
      manager: "los de sus gerencias",
      supervisor: "los de las gerencias de su gerente",
      sales: "sólo los suyos",
      data_provider: "sólo los que cargó, y únicamente mientras estén en Nuevo",
    },
    askInstead: "el vendedor asignado o tu gerente",
    tables: ["leads"],
  },
  "leads:delete": {
    label: "Eliminar un lead",
    roles: ["admin"],
    askInstead: "el admin de la concesionaria",
    tables: ["leads"],
  },
  "leads:assign": {
    label: "Asignar o reasignar leads",
    roles: ["admin", "manager", "supervisor"],
    scope: {
      admin: "a cualquier vendedor activo de la concesionaria",
      manager: "sólo a los vendedores de su equipo",
      supervisor: "sólo a los vendedores del equipo de su gerente",
    },
    askInstead: "tu gerente",
    tables: ["leads"],
  },
  "leads:export": {
    label: "Descargar la base de leads",
    roles: ["super_admin", "admin", "manager"],
    requiresFlag: {
      key: "can_export_leads",
      label: "el permiso de descarga que habilita el admin",
    },
    scope: {
      manager: "sólo si el admin le habilitó el permiso de descarga",
    },
    askInstead: "el admin de la concesionaria",
    tables: ["leads"],
  },
  "leads:import": {
    label: "Importar leads desde un archivo",
    roles: ["admin", "manager", "data_provider"],
    scope: { manager: "scopeado a sus gerencias" },
    where: {
      admin: "/admin/leads/import",
      manager: "/manager/leads/import",
      data_provider: "/data-provider/leads/import",
    },
    tables: ["leads", "lead_import_jobs"],
  },
  "leads:classify_pool": {
    label: "Clasificar leads sin sucursal o sin tipo de producto",
    roles: ["admin", "data_provider"],
    scope: {
      admin: "todo el pool de la concesionaria",
      data_provider: "los que cargó él",
    },
    where: { admin: "/admin/leads/pool", data_provider: "/data-provider/pool" },
    askInstead: "el admin de la concesionaria",
    tables: ["leads"],
  },
  "leads:merge": {
    label: "Unificar leads duplicados",
    roles: ["admin"],
    where: { admin: "/admin/leads/duplicates" },
    askInstead: "el admin de la concesionaria",
    tables: ["lead_merges"],
  },

  // ------------------------------------------------------------ Comercial --
  "quotes:create": {
    label: "Generar un presupuesto",
    roles: ["sales"],
    scope: { sales: "sobre sus leads. Al generarlo el lead pasa a Presupuestado" },
    askInstead: "el vendedor asignado al lead",
    tables: ["quotes"],
  },
  "sales:start": {
    label: "Iniciar una venta",
    roles: ["sales"],
    scope: { sales: "requiere que el lead esté Presupuestado" },
    askInstead: "el vendedor asignado al lead",
    tables: ["sales"],
  },
  "sales:approve": {
    label: "Aprobar o rechazar una venta",
    roles: ["admin", "manager", "supervisor"],
    scope: {
      admin: "cualquier venta de la concesionaria",
      manager: "las de los vendedores que le reportan",
      supervisor: "las de los vendedores del equipo de su gerente",
    },
    askInstead: "tu gerente o el admin",
    where: { admin: "/admin/sales", manager: "/manager/sales" },
    tables: ["sales", "sale_reviews"],
  },
  "sales:view": {
    label: "Ver ventas",
    roles: ["super_admin", "admin", "manager", "supervisor", "sales"],
    scope: {
      super_admin: "todas, sólo lectura",
      admin: "todas las de la concesionaria",
      manager: "las de los vendedores que le reportan",
      supervisor: "las del equipo de su gerente",
      sales: "las suyas",
    },
    where: {
      admin: "/admin/sales",
      manager: "/manager/sales",
      supervisor: "/manager/sales",
      sales: "/sales/sales",
    },
    tables: ["sales"],
  },
  "prices:view": {
    label: "Ver la lista de precios",
    roles: ["admin", "manager", "supervisor", "sales"],
    where: { admin: "/admin/prices" },
    tables: ["prices"],
  },
  "prices:manage": {
    label: "Editar la lista de precios",
    roles: ["admin"],
    where: { admin: "/admin/prices" },
    askInstead: "el admin de la concesionaria",
    tables: ["prices"],
  },
  "valuations:use": {
    label: "Cotizar un usado",
    roles: ["admin", "manager", "supervisor", "sales"],
    scope: {
      sales: "desde la ficha del lead, el inbox o la venta",
    },
    tables: ["used_valuations"],
  },
  "valuations:configure": {
    label: "Configurar los parámetros del cotizador de usados",
    roles: ["admin"],
    where: { admin: "/admin/valuations" },
    askInstead: "el admin de la concesionaria",
    tables: ["valuation_settings"],
  },

  // ---------------------------------------------------------------- Inbox --
  "inbox:use": {
    label: "Usar el inbox de WhatsApp e Instagram",
    roles: ["admin", "manager", "supervisor", "sales"],
    scope: {
      sales: "las conversaciones que toma y las del pool de su sucursal",
    },
    where: {
      admin: "/admin/inbox",
      manager: "/admin/inbox",
      supervisor: "/admin/inbox",
      sales: "/admin/inbox",
    },
    tables: ["conversations", "messages"],
  },
  "bot:configure": {
    label: "Configurar la respuesta automática",
    roles: ["admin"],
    where: { admin: "/admin/bot" },
    askInstead: "el admin de la concesionaria",
    tables: ["bot_configs", "bot_intents"],
  },
  "templates:own": {
    label: "Crear plantillas de mensaje propias",
    roles: ["admin", "manager", "supervisor", "sales"],
    tables: ["message_templates"],
  },
  "templates:global": {
    label: "Editar las plantillas globales de la plataforma",
    roles: ["super_admin"],
    where: { super_admin: "/super-admin/templates" },
    askInstead: "soporte de la plataforma",
    tables: ["message_templates"],
  },

  // --------------------------------------------------------------- Equipo --
  "users:manage_admins": {
    label: "Crear y editar administradores",
    roles: ["super_admin", "admin"],
    scope: { admin: "dentro de su concesionaria" },
    where: { admin: "/admin/users" },
    askInstead: "el admin de la concesionaria",
    tables: ["profiles"],
  },
  "users:manage_managers": {
    label: "Crear y editar gerentes",
    roles: ["admin"],
    where: { admin: "/admin/users" },
    askInstead: "el admin de la concesionaria",
    tables: ["profiles", "managements"],
  },
  "users:manage_providers": {
    label: "Crear y editar proveedores de datos",
    roles: ["admin"],
    where: { admin: "/admin/users" },
    askInstead: "el admin de la concesionaria",
    tables: ["profiles"],
  },
  "users:manage_sellers": {
    label: "Crear y editar vendedores",
    roles: ["admin", "manager"],
    scope: {
      admin: "cualquiera de la concesionaria",
      manager: "los de su equipo. También puede invitar supervisores",
    },
    where: { admin: "/admin/users", manager: "/manager/team" },
    askInstead: "tu gerente o el admin",
    tables: ["profiles", "user_product_types"],
  },
  "managements:manage": {
    label: "Administrar gerencias y la asignación automática",
    roles: ["admin", "manager"],
    scope: { manager: "las suyas. El supervisor no administra gerencias" },
    where: { admin: "/admin/branches", manager: "/manager/managements" },
    askInstead: "tu gerente o el admin",
    tables: ["managements"],
  },

  // -------------------------------------------------------- Configuración --
  "company:view_legal": {
    label: "Ver los datos legales de la empresa",
    roles: ["super_admin", "admin"],
    scope: { admin: "sólo lectura" },
    where: { admin: "/admin/company" },
    tables: ["companies"],
  },
  "company:edit_legal": {
    label: "Editar los datos legales de la empresa (CUIT, razón social)",
    roles: ["super_admin"],
    askInstead:
      "soporte de la plataforma — desde Mi empresa se manda la solicitud de cambio",
    tables: ["companies"],
  },
  "company:edit_operational": {
    label: "Editar los datos operativos de la empresa (logo, contacto, horarios)",
    roles: ["super_admin", "admin"],
    where: { admin: "/admin/company" },
    askInstead: "el admin de la concesionaria",
    tables: ["companies"],
  },
  "branches:manage": {
    label: "Administrar sucursales",
    roles: ["admin"],
    scope: { admin: "el alta de una sucursal nueva se pide y la aprueba soporte" },
    where: { admin: "/admin/branches" },
    askInstead: "el admin de la concesionaria",
    tables: ["branches", "branch_requests"],
  },
  "product_types:manage": {
    label: "Administrar tipos de producto",
    roles: ["admin"],
    where: { admin: "/admin/product-types" },
    askInstead: "el admin de la concesionaria",
    tables: ["product_types", "branch_product_types"],
  },
  "campaigns:manage": {
    label: "Administrar campañas",
    roles: ["admin"],
    where: { admin: "/admin/campaigns" },
    askInstead: "el admin de la concesionaria",
    tables: ["campaigns", "campaign_branches"],
  },
  "forms:manage": {
    label: "Crear formularios de captación",
    roles: ["admin", "manager", "supervisor"],
    scope: { manager: "los de sus gerencias" },
    where: { admin: "/admin/forms", manager: "/manager/forms" },
    tables: ["lead_capture_forms"],
  },
  "integrations:manage": {
    label: "Conectar integraciones (WhatsApp, Meta, Google, Sheets)",
    roles: ["admin"],
    where: { admin: "/admin/integraciones" },
    askInstead: "el admin de la concesionaria",
    tables: ["messaging_channels", "sheet_sources"],
  },

  // -------------------------------------------------------------- Análisis --
  "reports:view": {
    label: "Ver reportes",
    roles: ["super_admin", "admin", "manager", "supervisor", "sales"],
    scope: {
      super_admin: "totales de la plataforma",
      admin: "toda la concesionaria",
      manager: "su gerencia",
      supervisor: "el equipo de su gerente",
      sales: "sus propios números, en el inicio",
    },
    where: {
      super_admin: "/super-admin/reports",
      admin: "/admin/reportes",
      manager: "/manager/reportes",
      supervisor: "/manager/reportes",
      sales: "/sales",
    },
  },
  "ads:view": {
    label: "Ver el rendimiento de los anuncios",
    roles: ["admin", "manager"],
    scope: {
      manager:
        "los números son de toda la concesionaria: la inversión de una cuenta de ads no se puede repartir por gerencia",
    },
    where: { admin: "/admin/ads", manager: "/admin/ads" },
    askInstead: "el admin de la concesionaria",
  },

  // ----------------------------------------------------------- Plataforma --
  "platform:companies": {
    label: "Administrar concesionarias y grupos",
    roles: ["super_admin"],
    where: { super_admin: "/super-admin/companies" },
    askInstead: "soporte de la plataforma",
    tables: ["companies", "groups"],
  },
  "platform:billing": {
    label: "Ver y gestionar la facturación de la plataforma",
    roles: ["super_admin"],
    where: { super_admin: "/super-admin/billing" },
    askInstead: "soporte de la plataforma",
    tables: ["subscription_payments"],
  },
  "platform:impersonate": {
    label: 'Acceder como otro usuario ("acceder como")',
    roles: ["super_admin"],
    askInstead: "soporte de la plataforma",
    tables: ["impersonation_log"],
  },
};

export const ALL_CAPABILITIES = Object.keys(CAPABILITIES) as Capability[];

/**
 * Rol efectivo a los fines de permisos.
 *
 * Un `group_admin` ES un admin dentro de la marca activa: mismo criterio que
 * `hasRole()` y que `current_role()` en las policies. Tenerlo en una sola
 * función evita que la app y la base opinen distinto.
 */
export function effectiveRole(profile: Pick<Profile, "role">): UserRole {
  return profile.role === "group_admin" ? "admin" : profile.role;
}

type PermissionProfile = Pick<Profile, "role" | "can_export_leads">;

/** ¿Este usuario tiene esta capacidad? */
export function can(profile: PermissionProfile, cap: Capability): boolean {
  const rule = CAPABILITIES[cap];
  if (!rule) return false;
  const role = effectiveRole(profile);
  if (!rule.roles.includes(role)) return false;
  // El flag sólo condiciona a los roles que no la tienen por default. El admin
  // exporta siempre; el gerente, sólo si se lo habilitaron.
  if (rule.requiresFlag && role === "manager") {
    return profile[rule.requiresFlag.key] === true;
  }
  return true;
}

/** El alcance de la capacidad para este rol, si tiene uno declarado. */
export function scopeOf(
  profile: PermissionProfile,
  cap: Capability,
): string | null {
  return CAPABILITIES[cap]?.scope?.[effectiveRole(profile)] ?? null;
}

/** Dónde se ejerce la capacidad para este rol. */
export function whereFor(
  profile: PermissionProfile,
  cap: Capability,
): string | null {
  return CAPABILITIES[cap]?.where?.[effectiveRole(profile)] ?? null;
}

export type Explanation = {
  allowed: boolean;
  /** Frase lista para mostrar, en castellano rioplatense. */
  text: string;
  /** Ruta donde hacerlo, si corresponde. */
  href: string | null;
};

/**
 * Por qué sí o por qué no, en una frase.
 *
 * Es la función que hace que una negativa sea útil: no alcanza con "no tenés
 * permiso", hay que decir a quién pedírselo.
 */
export function explain(
  profile: PermissionProfile,
  cap: Capability,
): Explanation {
  const rule = CAPABILITIES[cap];
  if (!rule) {
    return { allowed: false, text: "Esa acción no existe en el CRM.", href: null };
  }
  const role = effectiveRole(profile);
  const allowed = can(profile, cap);
  const href = whereFor(profile, cap);

  if (allowed) {
    const scope = rule.scope?.[role];
    const parts = [`${rule.label}: sí, podés.`];
    if (scope) parts.push(`Alcance: ${scope}.`);
    if (href) parts.push(`Se hace desde ${href}.`);
    return { allowed: true, text: parts.join(" "), href };
  }

  // Denegado por el flag y no por el rol: es un caso distinto y se dice distinto,
  // porque tiene solución y la solución es pedirlo.
  if (rule.requiresFlag && rule.roles.includes(role)) {
    return {
      allowed: false,
      text:
        `${rule.label}: te falta ${rule.requiresFlag.label}. ` +
        `Lo habilita ${rule.askInstead ?? "el admin"} desde tu ficha de usuario.`,
      href: null,
    };
  }

  const who = rule.askInstead ?? whoHasIt(rule);
  return {
    allowed: false,
    text: `${rule.label}: no, con tu rol no se puede. Eso lo hace ${who}.`,
    href: null,
  };
}

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "soporte de la plataforma",
  group_admin: "el administrador del grupo",
  admin: "el admin de la concesionaria",
  manager: "el gerente",
  supervisor: "el supervisor",
  sales: "el vendedor asignado",
  data_provider: "el proveedor de datos",
};

function whoHasIt(rule: CapabilityRule): string {
  const names = rule.roles
    .filter((r) => r !== "group_admin")
    .map((r) => ROLE_LABELS[r]);
  if (names.length === 0) return "nadie desde la app";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} o ${names[names.length - 1]}`;
}

/** Todas las capacidades que tiene este usuario. */
export function allowedCapabilities(profile: PermissionProfile): Capability[] {
  return ALL_CAPABILITIES.filter((c) => can(profile, c));
}

/**
 * Resumen corto de qué puede y qué no, para la cápsula de contexto.
 *
 * Se limita a lo más consultado a propósito: la cápsula tiene un presupuesto de
 * ~150 tokens y volcarle 38 capacidades sería volver al prompt gigante que este
 * diseño evita.
 */
const CAPSULE_HIGHLIGHTS: Capability[] = [
  "leads:view",
  "leads:create",
  "leads:assign",
  "leads:export",
  "quotes:create",
  "sales:start",
  "sales:approve",
  "users:manage_sellers",
  "inbox:use",
  "reports:view",
  "company:edit_operational",
];

export function describePermissions(profile: PermissionProfile): {
  can: string[];
  cannot: string[];
} {
  const yes: string[] = [];
  const no: string[] = [];
  for (const cap of CAPSULE_HIGHLIGHTS) {
    const rule = CAPABILITIES[cap];
    if (can(profile, cap)) {
      const scope = scopeOf(profile, cap);
      yes.push(scope ? `${rule.label} (${scope})` : rule.label);
    } else {
      no.push(rule.label.toLowerCase());
    }
  }
  return { can: yes, cannot: no };
}
