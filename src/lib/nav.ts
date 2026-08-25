// ============================================================================
// La navegación, como DATO.
//
// Estaba embebida en `app-sidebar.tsx` (un componente cliente con imports de
// lucide y de React), y por eso nadie más la podía leer. Ahora es una tabla,
// igual que `src/lib/reports/registry.ts`, y la consumen tres cosas:
//
//   1. El sidebar, que la pinta.
//   2. `src/lib/kb/generate.ts`, que genera el artículo "dónde encuentro cada
//      cosa, según tu rol" — así el asistente nunca manda a un vendedor a una
//      ruta de admin, y si mañana se agrega una pantalla al menú el artículo se
//      regenera solo en el próximo build.
//   3. La herramienta `dondeEsta` del asistente.
//
// El ícono es el NOMBRE del ícono de lucide, no el componente: este módulo tiene
// que poder importarse desde un script de Node sin arrastrar React.
// ============================================================================

import type { UserRole } from "@/lib/auth";

export type NavItem = {
  href: string;
  label: string;
  /** Nombre del ícono de lucide, resuelto en el cliente. */
  icon: string;
  /** "exact" = sólo marca activo si la URL es idéntica. */
  match?: "exact";
  /** Una línea sobre qué se hace en esa pantalla. La usa el asistente. */
  hint?: string;
};

export type NavSection = { title?: string; items: NavItem[] };

// Inbox vive bajo /admin/inbox e Integraciones bajo /admin/integraciones.
// Reordenar el menú no mueve rutas.
const INBOX_ITEM: NavItem = {
  href: "/admin/inbox",
  label: "Inbox",
  icon: "MessageSquare",
  hint: "Conversaciones de WhatsApp, Instagram y Facebook en un solo lugar",
};

export const SUPER_ADMIN_NAV: NavSection[] = [
  {
    title: "Plataforma",
    items: [
      { href: "/super-admin", label: "Inicio", icon: "Home", match: "exact" },
      { href: "/super-admin/reports", label: "Reportes", icon: "BarChart3", hint: "Totales de toda la plataforma" },
    ],
  },
  {
    title: "Concesionarias",
    items: [
      { href: "/super-admin/companies", label: "Concesionarias", icon: "Building2", hint: "Alta, suspensión y detalle de cada cuenta" },
      { href: "/super-admin/groups", label: "Grupos", icon: "LayoutGrid", hint: "Clientes multimarca" },
      { href: "/super-admin/branch-requests", label: "Solicitudes", icon: "Layers", hint: "Pedidos de sucursal nueva" },
    ],
  },
  {
    title: "Comercial",
    items: [
      { href: "/super-admin/leads", label: "Leads", icon: "Inbox", hint: "Solicitudes de demo desde la landing" },
      { href: "/super-admin/templates", label: "Plantillas", icon: "MessageCircle", hint: "Plantillas globales de mensaje" },
      { href: "/super-admin/kb", label: "Base de conocimiento", icon: "BookOpen", hint: "Lo que sabe el asistente y las preguntas que no supo contestar" },
      { href: "/super-admin/billing", label: "Facturación", icon: "Receipt", hint: "Pagos de suscripción de las cuentas" },
    ],
  },
];

export const ADMIN_NAV: NavSection[] = [
  {
    title: "Operación",
    items: [
      { href: "/admin", label: "Inicio", icon: "Home", match: "exact" },
      { href: "/admin/reports", label: "Informe ejecutivo", icon: "TrendingUp", hint: "Resumen narrado del período" },
      { href: "/admin/reportes", label: "Reportes", icon: "FileBarChart", hint: "Catálogo de reportes con filtros" },
      INBOX_ITEM,
      { href: "/admin/leads", label: "Leads", icon: "Inbox", hint: "Todos los leads de la concesionaria" },
      { href: "/admin/tasks-visits", label: "Tareas y Visitas", icon: "CalendarCheck", hint: "Agenda del equipo" },
      { href: "/admin/sales", label: "Ventas", icon: "ShoppingBag", hint: "Cola de validación y historial" },
    ],
  },
  {
    title: "Marketing",
    items: [
      { href: "/admin/campaigns", label: "Campañas", icon: "Megaphone", hint: "Orígenes de leads" },
      { href: "/admin/ads", label: "Rendimiento Ads", icon: "BarChart3", hint: "Inversión de Meta, Google y TikTok cruzada con el embudo" },
      { href: "/admin/forms", label: "Formularios", icon: "FileInput", hint: "Formularios públicos de captación" },
      { href: "/admin/sheets", label: "Google Sheets", icon: "Sheet", hint: "Entrada de leads desde planillas" },
    ],
  },
  {
    title: "Catálogo",
    items: [
      { href: "/admin/product-types", label: "Tipos de producto", icon: "Briefcase", hint: "0km, usados, planes" },
      { href: "/admin/prices", label: "Precios", icon: "Receipt", hint: "Lista de precios de referencia" },
      { href: "/admin/valuations", label: "Cotizador usados", icon: "Calculator", hint: "Parámetros de la toma de usados" },
    ],
  },
  {
    title: "Configuración",
    items: [
      { href: "/admin/company", label: "Mi empresa", icon: "Building2", hint: "Datos de la concesionaria y horarios" },
      { href: "/admin/users", label: "Usuarios", icon: "UsersRound", hint: "Alta de admins, gerentes, vendedores y proveedores" },
      { href: "/admin/integraciones", label: "Integraciones", icon: "Blocks", hint: "WhatsApp, Meta, Google, TikTok, Sheets" },
      { href: "/admin/bot", label: "Respuesta automática", icon: "Bot", hint: "Configuración del bot del inbox" },
    ],
  },
];

export const MANAGER_NAV: NavSection[] = [
  {
    title: "Operación",
    items: [
      { href: "/manager", label: "Inicio", icon: "Home", match: "exact" },
      { href: "/manager/reports", label: "Informe ejecutivo", icon: "TrendingUp" },
      { href: "/manager/reportes", label: "Reportes", icon: "FileBarChart" },
      INBOX_ITEM,
      { href: "/manager/leads", label: "Leads", icon: "Inbox", hint: "Los leads de sus gerencias" },
      { href: "/manager/tasks-visits", label: "Tareas y Visitas", icon: "CalendarCheck" },
      { href: "/manager/sales", label: "Ventas", icon: "ShoppingBag", hint: "Ventas de su equipo, para aprobar o rechazar" },
    ],
  },
  {
    title: "Marketing",
    items: [
      { href: "/manager/forms", label: "Formularios", icon: "FileInput" },
      { href: "/admin/ads", label: "Rendimiento Ads", icon: "BarChart3" },
    ],
  },
  {
    title: "Equipo",
    items: [
      { href: "/manager/team", label: "Equipo", icon: "Users", hint: "Sus vendedores y supervisores" },
      { href: "/manager/managements", label: "Gerencias", icon: "Settings2", hint: "Sucursal + tipo de producto, y el toggle de asignación automática" },
    ],
  },
];

// El supervisor reutiliza las pantallas del gerente, pero no administra
// Gerencias ni ve Rendimiento Ads.
export const SUPERVISOR_NAV: NavSection[] = [
  {
    title: "Operación",
    items: [
      { href: "/manager", label: "Inicio", icon: "Home", match: "exact" },
      { href: "/manager/reports", label: "Informe ejecutivo", icon: "TrendingUp" },
      { href: "/manager/reportes", label: "Reportes", icon: "FileBarChart" },
      INBOX_ITEM,
      { href: "/manager/leads", label: "Leads", icon: "Inbox" },
      { href: "/manager/tasks-visits", label: "Tareas y Visitas", icon: "CalendarCheck" },
      { href: "/manager/sales", label: "Ventas", icon: "ShoppingBag" },
    ],
  },
  {
    title: "Equipo",
    items: [
      { href: "/manager/team", label: "Equipo", icon: "Users" },
      { href: "/manager/forms", label: "Formularios", icon: "FileInput" },
    ],
  },
];

export const SALES_NAV: NavSection[] = [
  {
    items: [
      { href: "/sales", label: "Inicio", icon: "Home", match: "exact", hint: "Sus números, tareas del día y próximas acciones" },
      INBOX_ITEM,
      { href: "/sales/leads", label: "Mis leads", icon: "Inbox", hint: "Kanban y tabla de los leads asignados" },
      { href: "/sales/leads/new", label: "Nuevo lead", icon: "UserPlus", hint: "Alta manual: queda autoasignado" },
      { href: "/sales/tasks-visits", label: "Tareas y Visitas", icon: "CalendarCheck" },
      { href: "/sales/sales", label: "Mis ventas", icon: "ShoppingBag" },
    ],
  },
];

export const PROVIDER_NAV: NavSection[] = [
  {
    items: [
      { href: "/data-provider", label: "Inicio", icon: "Home", match: "exact" },
      { href: "/data-provider/leads", label: "Mis cargas", icon: "Inbox", hint: "Los leads que cargó él" },
      { href: "/data-provider/pool", label: "Sin clasificar", icon: "Layers", hint: "Leads sin sucursal o sin tipo de producto" },
      { href: "/data-provider/leads/new", label: "Nuevo lead", icon: "UserPlus" },
    ],
  },
];

export const APP_NAV: NavSection[] = [
  { items: [{ href: "/dashboard", label: "Inicio", icon: "Home", match: "exact" }] },
];

/** Pantallas que ve un rol, en el orden del menú. */
export function navForRole(role: UserRole): NavSection[] {
  if (role === "super_admin") return SUPER_ADMIN_NAV;
  // El admin de grupo ES un admin dentro de la marca activa: mismas pantallas.
  if (role === "admin" || role === "group_admin") return ADMIN_NAV;
  if (role === "manager") return MANAGER_NAV;
  if (role === "supervisor") return SUPERVISOR_NAV;
  if (role === "sales") return SALES_NAV;
  if (role === "data_provider") return PROVIDER_NAV;
  return APP_NAV;
}

/** Todos los ítems de un rol, aplanados. */
export function flatNav(sections: NavSection[]): NavItem[] {
  return sections.flatMap((s) => s.items);
}

/** Ítems comunes a todos los roles, que no están en las secciones. */
export const COMMON_NAV: NavItem[] = [
  { href: "/profile", label: "Mi perfil", icon: "User", hint: "Datos personales, foto y contraseña" },
  { href: "/ayuda", label: "Ayuda", icon: "HelpCircle", hint: "El asistente del CRM" },
];

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "SuperAdmin",
  admin: "Admin",
  group_admin: "Admin del grupo",
  manager: "Gerente de ventas",
  supervisor: "Supervisor",
  sales: "Vendedor",
  data_provider: "Proveedor de datos",
};
