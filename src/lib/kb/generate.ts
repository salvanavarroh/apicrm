// ============================================================================
// Conocimiento DERIVADO DEL CÓDIGO.
//
// Esta es la parte de la base de conocimiento que nadie mantiene a mano, porque
// nadie la mantiene bien. Todo lo que se pueda leer de la fuente de verdad se
// lee de ahí: el menú, el catálogo de reportes, los enums, la matriz de
// permisos, los planes, las variables de plantillas.
//
// La consecuencia práctica: si mañana alguien agrega una pantalla al menú, el
// artículo "dónde encuentro cada cosa" se regenera solo en el próximo build. Un
// artículo escrito a mano que contradice al código es deuda; uno generado, no
// puede.
//
// Lo corre `scripts/kb-build.ts`. Es pura: no toca la base ni la red.
// ============================================================================

import type { UserRole } from "@/lib/auth";
import { CAMPAIGN_ORIGIN_LABELS } from "@/lib/campaign-origins";
import {
  LEAD_PAYMENT_LABELS,
  LEAD_STATUS_LABELS,
  LEAD_TEMPERATURE_LABELS,
} from "@/lib/leads";
import { COMMON_NAV, flatNav, navForRole, ROLE_LABELS } from "@/lib/nav";
import {
  ALL_CAPABILITIES,
  CAPABILITIES,
  can,
  scopeOf,
  whereFor,
} from "@/lib/permissions";
import { COMPANY_PLANS } from "@/lib/plans";
import { REPORTS } from "@/lib/reports/registry";
import {
  NOTE_ACTIVITY_LABEL,
  TASK_PRIORITY_LABEL,
  TASK_TYPE_LABEL,
  VISIT_STATUS_LABEL,
} from "@/lib/tasks";
import { BOT_VARS } from "@/lib/bot/variables";
import { LEAD_TEMPLATES } from "@/lib/lead-templates";

export type GeneratedArticle = {
  slug: string;
  title: string;
  summary: string;
  bodyMd: string;
  /** null = para todos los roles. */
  audienceRoles: UserRole[] | null;
  feature: string | null;
  routePrefix: string | null;
  keywords: string[];
};

/** Roles reales de usuario. `group_admin` reusa todo lo del admin. */
const ROLES: UserRole[] = [
  "super_admin",
  "admin",
  "manager",
  "supervisor",
  "sales",
  "data_provider",
];

function fakeProfile(role: UserRole, canExport = false) {
  return { role, can_export_leads: canExport };
}

// ---------------------------------------------------------------------------
// 1. Dónde encuentro cada cosa (uno por rol)
// ---------------------------------------------------------------------------

function navArticles(): GeneratedArticle[] {
  return ROLES.map((role) => {
    const sections = navForRole(role);
    const lines: string[] = [
      `Este es el menú que ve un usuario con rol **${ROLE_LABELS[role]}**. ` +
        `Otro rol ve otras opciones: nunca le indiques a alguien una ruta que su menú no tiene.`,
      "",
    ];

    for (const section of sections) {
      lines.push(`## ${section.title ?? "Menú"}`, "");
      for (const item of section.items) {
        lines.push(
          `- **${item.label}** — \`${item.href}\`${item.hint ? `. ${item.hint}` : ""}`,
        );
      }
      lines.push("");
    }

    lines.push("## Siempre disponible", "");
    for (const item of COMMON_NAV) {
      lines.push(`- **${item.label}** — \`${item.href}\`${item.hint ? `. ${item.hint}` : ""}`);
    }

    const labels = flatNav(sections).map((i) => i.label);

    return {
      slug: `nav-${role.replace(/_/g, "-")}`,
      title: `Dónde encuentro cada cosa — ${ROLE_LABELS[role]}`,
      summary: `Las pantallas del menú de un ${ROLE_LABELS[role].toLowerCase()} y qué se hace en cada una.`,
      bodyMd: lines.join("\n"),
      audienceRoles: [role],
      feature: null,
      routePrefix: null,
      keywords: [
        "menú",
        "dónde está",
        "dónde encuentro",
        "cómo llego",
        "navegación",
        ...labels,
      ],
    };
  });
}

// ---------------------------------------------------------------------------
// 2. Qué podés hacer con tu rol (uno por rol)
// ---------------------------------------------------------------------------

function permissionArticles(): GeneratedArticle[] {
  return ROLES.map((role) => {
    const profile = fakeProfile(role);
    const yes: string[] = [];
    const no: string[] = [];

    for (const cap of ALL_CAPABILITIES) {
      const rule = CAPABILITIES[cap];
      if (can(profile, cap)) {
        const scope = scopeOf(profile, cap);
        const href = whereFor(profile, cap);
        yes.push(
          `- **${rule.label}**${scope ? ` — ${scope}` : ""}${href ? ` (\`${href}\`)` : ""}`,
        );
      } else {
        const who = rule.askInstead ?? quienLoHace(rule.roles);
        no.push(`- **${rule.label}** — lo hace ${who}`);
      }
    }

    const body = [
      `Permisos de un usuario con rol **${ROLE_LABELS[role]}**.`,
      "",
      "Cuando alguien no puede hacer algo, la respuesta útil no es «no tenés permiso»:",
      "es decirle **quién sí puede** y **dónde se pide**.",
      "",
      "## Puede",
      "",
      yes.join("\n") || "_(nada)_",
      "",
      "## No puede",
      "",
      no.join("\n") || "_(nada: puede todo)_",
    ].join("\n");

    return {
      slug: `permisos-${role.replace(/_/g, "-")}`,
      title: `Qué podés hacer como ${ROLE_LABELS[role]}`,
      summary: `Permisos, alcance y a quién pedirle lo que no podés hacer siendo ${ROLE_LABELS[role].toLowerCase()}.`,
      bodyMd: body,
      audienceRoles: [role],
      feature: null,
      routePrefix: null,
      keywords: [
        "permiso",
        "permisos",
        "no puedo",
        "no me deja",
        "no veo",
        "acceso",
        "rol",
      ],
    };
  });
}

function quienLoHace(roles: UserRole[]): string {
  const names = roles
    .filter((r) => r !== "group_admin")
    .map((r) => ROLE_LABELS[r].toLowerCase());
  if (names.length === 0) return "nadie desde la app";
  if (names.length === 1) return `el ${names[0]}`;
  return `el ${names.slice(0, -1).join(", el ")} o el ${names[names.length - 1]}`;
}

// ---------------------------------------------------------------------------
// 3. Reportes disponibles
// ---------------------------------------------------------------------------

const FILTER_LABELS: Record<string, string> = {
  range: "rango de fechas",
  branch: "sucursal",
  vendor: "vendedor",
  productType: "tipo de producto",
  channel: "canal de origen",
};

function reportsArticle(): GeneratedArticle {
  const rows = REPORTS.map((r) => {
    const filtros = r.filters.map((f) => FILTER_LABELS[f] ?? f).join(", ") || "sin filtros";
    const roles = r.roles.map((x) => ROLE_LABELS[x as UserRole] ?? x).join(", ");
    return `| ${r.title} | ${r.description} | ${filtros} | ${roles} |`;
  });

  const body = [
    "El catálogo de reportes. Cada uno se abre desde **Reportes** en el menú",
    "(`/admin/reportes` para el admin, `/manager/reportes` para el gerente y el supervisor).",
    "",
    "| Reporte | Qué responde | Filtros | Quién lo ve |",
    "|---|---|---|---|",
    ...rows,
    "",
    "El alcance lo pone la base: un gerente ve su gerencia y un admin toda la",
    "concesionaria sin que el reporte tenga que saberlo.",
    "",
    "Además de estos hay un **Informe ejecutivo** (`/admin/reports`,",
    "`/manager/reports`): un resumen narrado del período en vez de una tabla.",
  ].join("\n");

  return {
    slug: "reportes-disponibles",
    title: "Qué reportes hay y qué contesta cada uno",
    summary: "Catálogo de reportes del CRM, sus filtros y quién puede verlos.",
    bodyMd: body,
    audienceRoles: ["admin", "manager", "supervisor", "super_admin"],
    feature: null,
    routePrefix: "/admin/reportes",
    keywords: ["reporte", "reportes", "informe", "métricas", "estadísticas", "dashboard"],
  };
}

// ---------------------------------------------------------------------------
// 4. Estados, temperatura y demás enums
// ---------------------------------------------------------------------------

function statesArticle(): GeneratedArticle {
  const pipeline = ["new", "contacted", "interested", "quoted"] as const;
  const venta = ["evaluating", "accepted", "rejected", "closed"] as const;

  const body = [
    "## Estados del lead",
    "",
    "El pipeline previo a la venta, en orden:",
    "",
    pipeline.map((s) => `**${LEAD_STATUS_LABELS[s]}**`).join(" → "),
    "",
    "Y dos estados que no son parte de esa progresión:",
    "",
    `- **${LEAD_STATUS_LABELS.not_interested}** — aplicable desde cualquier estado. Es terminal pero recuperable.`,
    "",
    "## Estados de la venta",
    "",
    venta.map((s) => `- **${LEAD_STATUS_LABELS[s]}**`).join("\n"),
    "",
    "## El estado avanza solo",
    "",
    "No hay que moverlo a mano: la acción que hacés sobre el lead lo empuja.",
    "",
    "| Acción | Estado al que pasa |",
    "|---|---|",
    "| Registrar una llamada, WhatsApp, email o reunión | Contactado |",
    "| Enviar una plantilla por WhatsApp | Contactado |",
    "| Agendar una visita o test drive | Interesado |",
    "| Crear o enviar un presupuesto | Presupuestado |",
    "",
    "Sólo avanza: nunca retrocede ni pisa un estado de venta ni «No interesado».",
    "El cambio manual desde el kanban o el desplegable sigue disponible.",
    "",
    "## Temperatura",
    "",
    "Es un scoring **manual** que pone el vendedor, independiente del estado:",
    "",
    (Object.keys(LEAD_TEMPERATURE_LABELS) as (keyof typeof LEAD_TEMPERATURE_LABELS)[])
      .map((t) => `- **${LEAD_TEMPERATURE_LABELS[t]}**`)
      .join("\n"),
    "",
    "Sin clasificar es un valor válido.",
    "",
    "## Forma de pago declarada",
    "",
    (Object.keys(LEAD_PAYMENT_LABELS) as (keyof typeof LEAD_PAYMENT_LABELS)[])
      .map((p) => `- ${LEAD_PAYMENT_LABELS[p]}`)
      .join("\n"),
  ].join("\n");

  return {
    slug: "estados-lead-venta",
    title: "Estados del lead y de la venta",
    summary:
      "El pipeline, qué acción hace avanzar cada estado, la temperatura y las formas de pago.",
    bodyMd: body,
    audienceRoles: null,
    feature: null,
    routePrefix: null,
    keywords: [
      "estado",
      "estados",
      "pipeline",
      "kanban",
      "nuevo",
      "contactado",
      "interesado",
      "presupuestado",
      "temperatura",
      "caliente",
      "frío",
    ],
  };
}

// ---------------------------------------------------------------------------
// 5. Tareas, visitas y actividades
// ---------------------------------------------------------------------------

function tasksArticle(): GeneratedArticle {
  const body = [
    "## Tipos de tarea",
    "",
    Object.entries(TASK_TYPE_LABEL).map(([, v]) => `- ${v}`).join("\n"),
    "",
    "## Prioridades",
    "",
    Object.entries(TASK_PRIORITY_LABEL).map(([, v]) => `- ${v}`).join("\n"),
    "",
    "## Estados de una visita",
    "",
    Object.entries(VISIT_STATUS_LABEL).map(([, v]) => `- ${v}`).join("\n"),
    "",
    "## Tipos de actividad en una nota",
    "",
    "Registrar una actividad hace dos cosas además de dejar la nota: actualiza",
    "la fecha de último contacto del lead y, si corresponde, hace avanzar el estado.",
    "",
    Object.entries(NOTE_ACTIVITY_LABEL).map(([, v]) => `- ${v}`).join("\n"),
  ].join("\n");

  return {
    slug: "tareas-visitas-actividades",
    title: "Tareas, visitas y actividades",
    summary:
      "Tipos y prioridades de tarea, estados de visita y qué pasa al registrar una actividad.",
    bodyMd: body,
    audienceRoles: null,
    feature: null,
    routePrefix: null,
    keywords: ["tarea", "tareas", "visita", "visitas", "agenda", "actividad", "nota", "recordatorio"],
  };
}

// ---------------------------------------------------------------------------
// 6. Orígenes de campaña
// ---------------------------------------------------------------------------

function campaignsArticle(): GeneratedArticle {
  const body = [
    "Una **campaña** es el origen concreto de un lead (por ejemplo «Meta Ads Marzo»).",
    "Cada campaña se asocia a un **canal de origen**, que es de esta lista cerrada:",
    "",
    Object.values(CAMPAIGN_ORIGIN_LABELS).map((v) => `- ${v}`).join("\n"),
    "",
    "«Otros» admite un texto libre que después se puede reusar y filtrar.",
    "",
    "Las campañas las administra el admin desde `/admin/campaigns` y se eligen al",
    "cargar un lead. Un lead sin campaña se agrupa como «Sin campaña / Directo» en",
    "los reportes.",
  ].join("\n");

  return {
    slug: "campanas-origenes",
    title: "Campañas y canales de origen",
    summary: "Qué es una campaña, qué canales hay y quién las administra.",
    bodyMd: body,
    audienceRoles: null,
    feature: null,
    routePrefix: "/admin/campaigns",
    keywords: ["campaña", "campañas", "origen", "canal", "utm", "meta ads", "google ads"],
  };
}

// ---------------------------------------------------------------------------
// 7. Variables de plantillas y del bot
// ---------------------------------------------------------------------------

function variablesArticle(): GeneratedArticle {
  const body = [
    "## Plantillas de mensaje del lead",
    "",
    "Se usan desde el botón **Enviar mensaje** en la ficha del lead. Las variables",
    "se reemplazan solas al enviar; no hay que completarlas a mano.",
    "",
    "| Variable | De dónde sale |",
    "|---|---|",
    "| `{nombre}` | Nombre de pila del lead |",
    "| `{nombre_completo}` | Nombre y apellido del lead |",
    "| `{vendedor}` | El vendedor asignado |",
    "| `{vehiculo}` | El auto consultado |",
    "| `{concesionaria}` | Nombre de la concesionaria |",
    "| `{telefono_concesionaria}` | Teléfono de contacto |",
    "",
    `Hay ${LEAD_TEMPLATES.length} plantillas base de la plataforma, y cada vendedor o`,
    "gerente puede crear las suyas. Las globales sólo las edita soporte.",
    "",
    "## Variables de la respuesta automática",
    "",
    "| Variable | Qué es | De dónde sale |",
    "|---|---|---|",
    ...BOT_VARS.map((v) => `| \`{${v.key}}\` | ${v.label} | ${v.source} |`),
    "",
    "Si una variable no tiene dato cargado se reemplaza por vacío: el cliente",
    "nunca ve una llave sin resolver.",
  ].join("\n");

  return {
    slug: "variables-plantillas",
    title: "Variables de las plantillas y del bot",
    summary:
      "Qué variables se pueden usar en un mensaje y de dónde sale el dato de cada una.",
    bodyMd: body,
    audienceRoles: ["admin", "manager", "supervisor", "sales", "super_admin"],
    feature: null,
    routePrefix: null,
    keywords: ["plantilla", "plantillas", "variable", "variables", "mensaje", "whatsapp"],
  };
}

// ---------------------------------------------------------------------------
// 8. Planes de la plataforma (sólo soporte)
// ---------------------------------------------------------------------------

function plansArticle(): GeneratedArticle {
  const body = [
    "Planes de suscripción de la plataforma. El **precio de lista** vive en",
    "`src/lib/plans.ts`; lo que se le factura a cada concesionaria es",
    "`companies.monthly_price`, que puede diferir (descuentos, cuentas legacy,",
    "acuerdos particulares).",
    "",
    "| Plan | Precio de lista | Qué incluye | Se ofrece en altas nuevas |",
    "|---|---|---|---|",
    ...COMPANY_PLANS.map(
      (p) =>
        `| ${p.label} | ${p.priceUsd === null ? "A definir" : `USD ${p.priceUsd}/mes`} | ${p.description} | ${p.available ? "Sí" : "No"} |`,
    ),
    "",
    "El precio de lista está en dólares y `monthly_price` se carga en pesos: son",
    "dos números distintos a propósito, y por eso el selector de plan no completa",
    "el importe a facturar.",
  ].join("\n");

  return {
    slug: "planes-plataforma",
    title: "Planes de la plataforma",
    summary: "Los planes de suscripción, sus precios de lista y qué incluyen.",
    bodyMd: body,
    // A propósito sólo para soporte: el asistente no habla de plata de la
    // plataforma con los usuarios de una concesionaria — deriva.
    audienceRoles: ["super_admin"],
    feature: null,
    routePrefix: "/super-admin/billing",
    keywords: ["plan", "planes", "precio", "suscripción", "facturación"],
  };
}

/** Todos los artículos derivados del código. */
export function generateArticles(): GeneratedArticle[] {
  return [
    ...navArticles(),
    ...permissionArticles(),
    reportsArticle(),
    statesArticle(),
    tasksArticle(),
    campaignsArticle(),
    variablesArticle(),
    plansArticle(),
  ];
}
